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
  if (requestedAccount !== undefined) {
    if (typeof requestedAccount !== 'string' || !requestedAccount.trim()) throw new Error('invalid GitHub account selector')
    const selected = requestedAccount.trim().toLowerCase()
    if (!accounts.length && selected === NATIVE_GITHUB_ACCOUNT) return { owner: NATIVE_GITHUB_ACCOUNT }
    const matches = accounts.filter(account => account.owner.toLowerCase() === selected)
    if (matches.length !== 1) throw new Error('unknown or ambiguous GitHub account: ' + selected)
    return matches[0]!
  }
  if (!accounts.length) return { owner: NATIVE_GITHUB_ACCOUNT }

  const key = repository.toLowerCase()
  const scoped = accounts.filter(account =>
    account.repositories?.some(entry => entry.toLowerCase() === key))
  if (scoped.length > 1) throw new Error('ambiguous GitHub repository binding: ' + key)
  if (scoped.length === 1) return scoped[0]!

  const owner = repository.split('/')[0]!.toLowerCase()
  const matches = accounts.filter(account => account.owner.toLowerCase() === owner)
  if (matches.length > 1) throw new Error('ambiguous GitHub owner mapping')
  if (matches.length === 1) return matches[0]!
  if (accounts.length === 1) return accounts[0]!
  throw new Error('multiple GitHub accounts configured; specify account to select a token for ' + key)
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
