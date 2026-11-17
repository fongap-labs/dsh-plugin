/** External GitHub HTTP and credential boundary. Repository rules belong to the feature. */
const API = 'https://api.github.com'

export class GitHubApiFailure extends Error {
  constructor(readonly status: number, repository: string, method: string) {
    const reason = status === 401 || status === 403
      ? 'authentication or repository permission denied; inspect token access'
      : status === 409 || status === 422
        ? 'conflict or rejected GitHub validation; inspect remote state'
        : status === 429
          ? 'rate limit exceeded; do not blindly retry writes'
          : 'request rejected'
    super('GitHub API ' + status + ' for ' + repository + ' (' + method + '): ' + reason)
    this.name = 'GitHubApiFailure'
  }
}

export class GitHubWriteUncertain extends Error {
  constructor(method: string, repository: string) {
    super('GitHub ' + method + ' outcome unconfirmed for ' + repository +
      '; inspect remote state before retrying a write')
    this.name = 'GitHubWriteUncertain'
  }
}

export interface DeltaGitHubRequest {
  readonly repository: string
  readonly account: string
  readonly tokenEnv: string
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH'
  readonly path: string
  readonly data?: unknown
  readonly signal: AbortSignal
}

export async function requestGitHubApi(input: DeltaGitHubRequest): Promise<{
  repository: string
  account: string
  data: any
}> {
  const { repository, account, tokenEnv, method, path, data, signal } = input
  const token = tokenEnv ? process.env[tokenEnv] : undefined
  if (!token?.trim()) throw new Error('GitHub credential unavailable for repository owner ' + account + ' (set env ' + tokenEnv + ')')
  const url = API + path
  if (!url.startsWith(API + '/') || !new URL(url).hostname.endsWith('github.com')) {
    throw new Error('invalid GitHub API URL')
  }
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + token.trim(),
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
