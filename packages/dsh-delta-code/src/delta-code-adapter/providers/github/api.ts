/** External GitHub HTTP and credential boundary. Repository rules belong to the feature. */
import { GitHubApiFailure, GitHubWriteUncertain } from '../../contracts/github.js'
import type { DeltaGitHubRequest, DeltaGitHubResponse, DeltaGitHubTransport } from '../../contracts/github.js'
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

async function requestGitHubApi(input: DeltaGitHubRequest, tokenEnv: string, host?: GitHubCredentialHost): Promise<DeltaGitHubResponse> {
  const { repository, account, method, path, data, signal } = input
  const token = await credentialForRequest(host, tokenEnv, account)
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

/** Provider implementation supplied only by the composition root. */
export function createGitHubTransport(accounts: readonly GitHubAccountConfig[], host?: GitHubCredentialHost): DeltaGitHubTransport {
  // Snapshot approved bindings: feature modules only use an opaque account key.
  const bindings = new Map<string, string>(accounts.map(entry => [entry.owner.toLowerCase(), entry.tokenEnv] as const))
  return {
    request(input) {
      const credentialEnv = bindings.get(input.account.toLowerCase())
      if (!credentialEnv) throw new Error('GitHub account binding unavailable for ' + input.account)
      return requestGitHubApi(input, credentialEnv, host)
    },
  }
}
