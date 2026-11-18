/** Pure GitHub repository routing and validation; independent of DSH, HTTP and credentials. */
export interface GitHubAccountBinding {
  readonly owner: string
  readonly repositories?: readonly string[]
}

const COMMIT_SHA = /^[a-f0-9]{40}$/

export function validatedCommitSha(value: unknown, subject: string): string {
  if (typeof value !== 'string' || !COMMIT_SHA.test(value)) {
    throw new Error('invalid ' + subject + ' commit SHA')
  }
  return value
}
const REPOSITORY = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?\/(?!\.{1,2}$)[a-zA-Z0-9_.-]{1,100}$/
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\\\x00-\x1f]+$/
const SAFE_BRANCH = /^(?!\/)(?!.*\.\.)(?!.*(?:^|\/)\.)(?!.*[~^:?*[\\\x00-\x20])[^/]+(?:\/[^/]+)*$/

export const NATIVE_GITHUB_ACCOUNT = 'native'

/** Repository names identify targets, never an allowlist. GitHub authorizes each request.
 * Explicit credential selection avoids guessing between multiple identities. */
export function selectGitHubAccount<T extends GitHubAccountBinding>(
  accounts: readonly T[], repository: string, requestedAccount?: string,
): T | GitHubAccountBinding {
  if (!REPOSITORY.test(repository)) throw new Error('invalid owner/repository')
  const owner = repository.split('/')[0]!.toLowerCase()
  if (!accounts.length) {
    if (requestedAccount !== undefined &&
        (typeof requestedAccount !== 'string' || requestedAccount.toLowerCase() !== NATIVE_GITHUB_ACCOUNT)) {
      throw new Error('unknown GitHub account: ' + requestedAccount)
    }
    // The native token's user identity is verified by the transport.
    return { owner: NATIVE_GITHUB_ACCOUNT }
  }
  if (requestedAccount !== undefined) {
    if (typeof requestedAccount !== 'string' || !requestedAccount.trim()) {
      throw new Error('invalid GitHub account selector')
    }
    const selected = accounts.filter(account => account.owner.toLowerCase() === requestedAccount.trim().toLowerCase())
    if (selected.length !== 1) throw new Error('unknown or ambiguous GitHub account: ' + requestedAccount)
    if (selected[0]!.owner.toLowerCase() !== owner) {
      throw new Error('GitHub account ' + selected[0]!.owner + ' cannot access repositories owned by ' + owner)
    }
    return selected[0]!
  }
  const matches = accounts.filter(account => account.owner.toLowerCase() === owner)
  if (matches.length !== 1) {
    throw new Error(matches.length
      ? 'ambiguous GitHub owner mapping: ' + owner
      : 'no GitHub account configured for repository owner ' + owner)
  }
  return matches[0]!
}

export function isValidGitHubRepository(value: string): boolean {
  return REPOSITORY.test(value)
}

export function repositoryFromRemote(remote: string): string | undefined {
  const value = remote.trim()
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/.exec(value)
  return match?.[1] && REPOSITORY.test(match[1]) ? match[1] : undefined
}

export function validPath(value: string): string {
  if (!value || !SAFE_PATH.test(value) || value.split('/').includes('.')) throw new Error('unsafe repository file path')
  return value.split('/').map(encodeURIComponent).join('/')
}
export function validBranch(value: string): string {
  if (!value || !SAFE_BRANCH.test(value) || value.endsWith('.lock') || value.endsWith('/') || value.endsWith('.')) throw new Error('invalid branch')
  return value
}
