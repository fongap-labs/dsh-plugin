/** External GitHub HTTP and credential boundary. Repository rules belong to the feature. */
import { GitHubApiFailure, GitHubWriteUncertain } from '../../contracts/github.js'
import type { DeltaGitHubRequest, DeltaGitHubResponse, DeltaGitHubTransport, DeltaGitHubJobLogsRequest, DeltaGitHubJobLogsResponse } from '../../contracts/github.js'
import type { GitHubAccountConfig } from '../../../types.js'

const API = 'https://api.github.com'

/** The Host credentials service is authoritative whenever it is available.
 * No credential is cached or copied into Delta settings or model-visible state. */
interface GitHubCredentialHost {
  get(name: 'credentials'): unknown
}

async function credentialForRequest(host: GitHubCredentialHost | undefined, ref: string, account: string): Promise<string> {
  const provider = host?.get('credentials') as { resolve?: (key: string) => Promise<{ value?: string } | undefined> } | undefined
  if (provider !== undefined) {
    if (typeof provider.resolve !== 'function') throw new Error('GitHub Host credential service is incomplete')
    const resolved = await provider.resolve(ref)
    if (typeof resolved?.value !== 'string' || !resolved.value.trim()) {
      throw new Error('GitHub credential not configured for account ' + account)
    }
    return resolved.value.trim()
  }
  // Compatibility with older Hosts lacking the credentials service.
  // This branch cannot override a mounted-but-empty authoritative provider.
  const ambient = process.env[ref]
  if (!ambient?.trim()) throw new Error('GitHub credential not configured for account ' + account)
  return ambient.trim()
}

/** Native credentials are account-scoped; organizations use explicit owner bindings. */
async function assertNativeGitHubOwner(
  account: string, repository: string, token: string, signal: AbortSignal,
): Promise<void> {
  if (account !== 'native') return
  let identity: Response
  try {
    identity = await fetch(API + '/user', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'dsh-delta-code',
      },
      signal,
      redirect: 'error',
    })
  } catch (error) {
    throw new Error('native GitHub credential identity could not be verified', { cause: error })
  }
  if (!identity.ok) throw new GitHubApiFailure(identity.status, repository, 'GET')
  const login = (await identity.json())?.login
  if (typeof login !== 'string' || login.toLowerCase() !== repository.split('/')[0]!.toLowerCase()) {
    throw new Error('native GITHUB_TOKEN owner does not match repository owner; configure a dedicated account or organization credential')
  }
}

async function requestGitHubApi(input: DeltaGitHubRequest, tokenEnv: string, host?: GitHubCredentialHost): Promise<DeltaGitHubResponse> {
  const { repository, account, method, path, data, signal } = input
  const token = await credentialForRequest(host, tokenEnv, account)
  await assertNativeGitHubOwner(account, repository, token, signal)
  const url = API + path
  if (!url.startsWith(API + '/') || !new URL(url).hostname.endsWith('github.com')) {
    throw new Error('invalid GitHub API URL')
  }
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'dsh-delta-code',
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      signal,
      redirect: 'error',
    })
  } catch (error) {
    if (method !== 'GET') throw new GitHubWriteUncertain(method, repository)
    throw error
  }
  if (!response.ok) throw new GitHubApiFailure(response.status, repository, method)
  return { repository, account, data: response.status === 204 ? null : await response.json() }
}

/** GitHub Actions job logs are a signed, redirected text download, never JSON.
 * GitHub's credential is sent only to api.github.com, never to the signed URL. */
const MAX_JOB_LOG_BYTES = 1024 * 1024
const LOG_EXCERPT_CHARS = 12_000
const LOG_CONTEXT_CHARS = 7_000

function allowedLogRedirect(location: string): URL {
  const url = new URL(location)
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password ||
      !(host === 'githubusercontent.com' || host.endsWith('.githubusercontent.com') ||
        host.endsWith('.blob.core.windows.net'))) {
    throw new Error('GitHub Actions log redirect destination is not an approved HTTPS storage host')
  }
  return url
}

function redactGitHubLog(text: string): string {
  return text
    .replace(/github_pat_[A-Za-z0-9_]+/g, '[REDACTED]')
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, '[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, '$1[REDACTED]')
    .replace(/((?:GITHUB_TOKEN|GH_TOKEN|PASSWORD|SECRET|API_KEY)\s*[=:]\s*)[^\s]+/gi, '$1[REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
}

async function boundedLogExcerpt(response: Response, signal: AbortSignal): Promise<{
  excerpt: string; truncated: boolean; bytesRead: number
}> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('GitHub job log has no readable body')
  const bytes: Uint8Array[] = []
  let total = 0
  let truncated = false
  try {
    while (true) {
      signal.throwIfAborted()
      const next = await reader.read()
      if (next.done) break
      const available = MAX_JOB_LOG_BYTES - total
      if (next.value.byteLength > available) {
        if (available > 0) bytes.push(next.value.subarray(0, available))
        total += Math.max(0, available)
        truncated = true
        await reader.cancel()
        break
      }
      bytes.push(next.value)
      total += next.value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  const buffer = new Uint8Array(total)
  let offset = 0
  for (const item of bytes) { buffer.set(item, offset); offset += item.byteLength }
  const log = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  const lines = log.split('\n')
  const failure = /##\[error\]|(?:^|\s)(?:error:|fatal:|failed|failure|exception|traceback|assertionerror)|process completed with exit code [1-9]/i
  const hits: number[] = []
  for (let i = 0; i < lines.length; i++) if (failure.test(lines[i]!)) hits.push(i)
  const last = hits.at(-1)
  const selection = last === undefined
    ? log.slice(-LOG_EXCERPT_CHARS)
    : lines.slice(Math.max(0, last - 35), Math.min(lines.length, last + 12)).join('\n').slice(-LOG_CONTEXT_CHARS)
  return { excerpt: redactGitHubLog(selection), truncated: truncated || selection.length < log.length, bytesRead: total }
}

async function requestGitHubJobLogs(
  input: DeltaGitHubJobLogsRequest, tokenEnv: string, host?: GitHubCredentialHost,
): Promise<DeltaGitHubJobLogsResponse> {
  const { repository, account, jobId, signal } = input
  if (!Number.isSafeInteger(jobId) || jobId <= 0) throw new Error('invalid GitHub job ID')
  const token = await credentialForRequest(host, tokenEnv, account)
  await assertNativeGitHubOwner(account, repository, token, signal)
  const path = repository.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(API + '/repos/' + path + '/actions/jobs/' + jobId + '/logs', {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dsh-delta-code',
    },
    signal,
    redirect: 'manual',
  })
  if (response.status !== 302 && !response.ok) throw new GitHubApiFailure(response.status, repository, 'GET')
  let logResponse = response
  if (response.status === 302) {
    const location = response.headers.get('location')
    if (!location) throw new Error('GitHub Actions log redirect is missing')
    const signedUrl = allowedLogRedirect(location)
    // Never forward GitHub credentials or cookies to the storage endpoint.
    logResponse = await fetch(signedUrl, { method: 'GET', signal, redirect: 'error' })
    if (!logResponse.ok) throw new Error('GitHub Actions log download failed with HTTP ' + logResponse.status)
  }
  const bounded = await boundedLogExcerpt(logResponse, signal)
  return { repository, account, ...bounded }
}

/** Provider implementation supplied only by the composition root. */
export function createGitHubTransport(accounts: readonly GitHubAccountConfig[], host?: GitHubCredentialHost): DeltaGitHubTransport {
  // Snapshot approved bindings: feature modules only use an opaque account key.
  const bindings = new Map<string, string>(accounts.map(entry => [entry.owner.toLowerCase(), entry.tokenEnv] as const))
  // The native Host credential is the default when no plugin identities are configured.
  // This does not import the separate gh CLI login store.
  if (!accounts.length) bindings.set('native', 'GITHUB_TOKEN')
  return {
    request(input) {
      const credentialEnv = bindings.get(input.account.toLowerCase())
      if (!credentialEnv) throw new Error('GitHub account binding unavailable for ' + input.account)
      return requestGitHubApi(input, credentialEnv, host)
    },
    jobLogs(input) {
      const credentialEnv = bindings.get(input.account.toLowerCase())
      if (!credentialEnv) throw new Error('GitHub account binding unavailable for ' + input.account)
      return requestGitHubJobLogs(input, credentialEnv, host)
    },
  }
}
