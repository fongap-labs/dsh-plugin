/** Delta-owned stable GitHub transport contract, independent of GitHub API details. */
export type DeltaGitHubMethod = 'GET' | 'POST' | 'PUT' | 'PATCH'

export interface DeltaGitHubRequest {
  readonly repository: string
  readonly account: string
  readonly tokenEnv: string
  readonly method: DeltaGitHubMethod
  readonly path: string
  readonly data?: unknown
  readonly signal: AbortSignal
}

export interface DeltaGitHubResponse {
  readonly repository: string
  readonly account: string
  readonly data: any
}

export interface DeltaGitHubTransport {
  request(input: DeltaGitHubRequest): Promise<DeltaGitHubResponse>
}

/** Error semantics are owned by Delta; transport providers only translate failures. */
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
