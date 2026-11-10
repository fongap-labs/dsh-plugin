import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, runCommand, isSubprocessMounted } from '@fongap-labs/shared'
import type { GitHubAccountConfig, Settings } from '../types.js'
import { resolveRoot } from '../runtime.js'
import { resolveAuthorizedGitCwd } from './host-git-cwd.js'

const API = 'https://api.github.com'
const COMMIT_SHA = /^[a-f0-9]{40}$/

class GitHubApiFailure extends Error {
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

class GitHubWriteUncertain extends Error {
  constructor(method: string, repository: string) {
    super('GitHub ' + method + ' outcome unconfirmed for ' + repository +
      '; inspect remote state before retrying a write')
    this.name = 'GitHubWriteUncertain'
  }
}

function validatedCommitSha(value: unknown, subject: string): string {
  if (typeof value !== 'string' || !COMMIT_SHA.test(value)) {
    throw new Error('invalid ' + subject + ' commit SHA')
  }
  return value
}
const REPOSITORY = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?\/(?!\.{1,2}$)[a-zA-Z0-9_.-]{1,100}$/
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\\\x00-\x1f]+$/
const SAFE_BRANCH = /^(?!\/)(?!.*\.\.)(?!.*(?:^|\/)\.)(?!.*[~^:?*[\\\x00-\x20])[^/]+(?:\/[^/]+)*$/

export function selectGitHubAccount(accounts: GitHubAccountConfig[], repository: string): GitHubAccountConfig {
  if (!REPOSITORY.test(repository)) throw new Error('invalid owner/repository')
  const owner = repository.split('/')[0]!.toLowerCase()
  const matches = accounts.filter((account) => account.owner.toLowerCase() === owner)
  if (matches.length !== 1) {
    throw new Error(matches.length ? 'ambiguous GitHub owner mapping' : 'no GitHub account configured for repository owner ' + owner)
  }
  return matches[0]!
}

export function repositoryFromRemote(remote: string): string | undefined {
  const value = remote.trim()
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/.exec(value)
  return match?.[1] && REPOSITORY.test(match[1]) ? match[1] : undefined
}

async function resolveRepository(ctx: Context, exec: Parameters<ToolDefinition['execute']>[1], settings: Settings, supplied?: string): Promise<string> {
  if (supplied) {
    if (!REPOSITORY.test(supplied)) throw new Error('repository must be owner/name')
    return supplied
  }
  const root = await resolveRoot(ctx, exec, settings)
  const cwd = await resolveAuthorizedGitCwd(ctx, root, undefined, exec)
  const result = await runCommand(ctx, {
    command: settings.gitCommand,
    args: ['remote', 'get-url', 'origin'],
    cwd, signal: exec.signal, timeoutMs: 10_000, maxOutputBytes: 8 * 1024,
    // If the workspace belongs to a mounted Host FS, never call local Git
    // after the Host subprocess rejects or is unavailable.
    hostOnly: Boolean(ctx.get('fs')) || isSubprocessMounted(ctx),
  })
  if (result.exitCode !== 0 || result.timedOut || result.signal || result.lossy ||
      exec.signal.aborted) {
    throw new Error('GitHub origin inspection failed or returned incomplete Host evidence')
  }
  const repo = repositoryFromRemote(result.stdout)
  if (!repo) throw new Error('cannot detect a GitHub origin; supply repository=owner/name')
  return repo
}

async function githubRequest(
  ctx: Context,
  exec: Parameters<ToolDefinition['execute']>[1],
  settings: Settings,
  repository: string | undefined,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  path: (repo: string) => string,
  data?: unknown,
): Promise<{ repository: string; account: string; data: any }> {
  const repo = await resolveRepository(ctx, exec, settings, repository)
  const account = selectGitHubAccount(settings.githubAccounts, repo)
  const token = account.tokenEnv ? process.env[account.tokenEnv] : undefined
  if (!token?.trim()) throw new Error('GitHub credential unavailable for repository owner ' + account.owner + ' (set env ' + account.tokenEnv + ')')
  const url = API + path(repo)
  if (!url.startsWith(API + '/') || !new URL(url).hostname.endsWith('github.com')) throw new Error('invalid GitHub API URL')
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
      signal: exec.signal,
      redirect: 'error',
    })
  } catch (error) {
    if (method !== 'GET') throw new GitHubWriteUncertain(method, repo)
    throw error
  }
  if (!response.ok) throw new GitHubApiFailure(response.status, repo, method)
  return { repository: repo, account: account.owner, data: response.status === 204 ? null : await response.json() }
}

function requireWrites(settings: Settings): void {
  if (!settings.githubAllowWrites) throw new Error('GitHub writes are disabled; set github.allowWrites=true to enable')
}

function validPath(value: string): string {
  if (!value || !SAFE_PATH.test(value) || value.split('/').includes('.')) throw new Error('unsafe repository file path')
  return value.split('/').map(encodeURIComponent).join('/')
}
function validBranch(value: string): string {
  if (!value || !SAFE_BRANCH.test(value) || value.endsWith('.lock') || value.endsWith('/') || value.endsWith('.')) throw new Error('invalid branch')
  return value
}
const string = { type: 'string', required: true } as const
const optional = { type: 'string' } as const
const responseSchema = {
  type: 'object', additionalProperties: false, properties: {
    repository: { type: 'string', required: true },
    account: { type: 'string', required: true },
    result: { type: 'string', required: true },
  },
} as const

function tool(
  name: string,
  description: string,
  parameters: Record<string, any>,
  action: (args: any, exec: Parameters<ToolDefinition['execute']>[1]) => Promise<{ repository: string; account: string; result: string }>,
): ToolDefinition {
  return defineTool({
    name: 'code_github_' + name,
    description,
    parameters,
    output: {
      schema: responseSchema,
      render(_args, value) { return [{ type: 'text', text: value.result }] },
    },
    async execute(args, exec) {
      const result = await action(args, exec)
      return result
    },
  })
}

export function createGitHubTools(ctx: Context, settings: Settings): ToolDefinition[] {
  const encodeRepo = (repo: string) => '/repos/' + repo.split('/').map(encodeURIComponent).join('/')
  const envelope = (response: {repository: string; account: string; data: any}, result: unknown) => ({
    repository: response.repository,
    account: response.account,
    result: JSON.stringify(result),
  })
  const repositoryDefault = async (exec: Parameters<ToolDefinition['execute']>[1], supplied?: string) => {
    const info = await githubRequest(ctx, exec, settings, supplied, 'GET', encodeRepo)
    const name = info.data?.default_branch
    if (typeof name !== 'string' || !name.trim()) throw new Error('GitHub default branch unavailable')
    return { repository: info.repository, defaultBranch: validBranch(name) }
  }
  return [
    tool('connection', 'Verify the selected GitHub account for a repository. Automatically use the local origin when omitted.', { repository: optional }, async (args, exec) => {
      const response = await githubRequest(ctx, exec, settings, args.repository, 'GET', encodeRepo)
      return envelope(response, { repository: response.repository, account: response.account, private: response.data.private, permissions: response.data.permissions ?? {} })
    }),
    tool('file', 'Read one remote GitHub repository file or directory listing.', { repository: optional, path: string, ref: optional }, async (args, exec) => {
      const response = await githubRequest(ctx, exec, settings, args.repository, 'GET', (repo) =>
        encodeRepo(repo) + '/contents/' + validPath(args.path) + (args.ref ? '?ref=' + encodeURIComponent(args.ref) : ''))
      const item = response.data
      if (Array.isArray(item)) return envelope(response, item.map((entry) => ({ name: entry.name, path: entry.path, type: entry.type })))
      if (item.size > 262144) throw new Error('GitHub file exceeds the 256 KiB response limit')
      const content = item.encoding === 'base64' ? Buffer.from(item.content.replace(/\s/g, ''), 'base64').toString('utf8') : undefined
      return envelope(response, { path: item.path, sha: item.sha, type: item.type, content })
    }),
    tool('pulls', 'List remote GitHub pull requests. Does not modify the repository.', { repository: optional, state: optional }, async (args, exec) => {
      const state = args.state ?? 'open'
      if (!['open', 'closed', 'all'].includes(state)) throw new Error('invalid PR state')
      const response = await githubRequest(ctx, exec, settings, args.repository, 'GET', (repo) => encodeRepo(repo) + '/pulls?per_page=30&state=' + state)
      return envelope(response, response.data.map((pr: any) => ({ number: pr.number, title: pr.title, state: pr.state, draft: pr.draft, html_url: pr.html_url })))
    }),
    tool('checks', 'Inspect all check runs and commit statuses for a GitHub pull request, including central Action Worker check links.', {
      repository: optional, prNumber: { type: 'integer', required: true },
    }, async (args, exec) => {
      if (!Number.isSafeInteger(args.prNumber) || args.prNumber <= 0) throw new Error('invalid pull request number')
      const pr = await githubRequest(ctx, exec, settings, args.repository, 'GET', (repo) => encodeRepo(repo) + '/pulls/' + args.prNumber)
      const sha = pr.data.head?.sha
      if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('pull request head SHA unavailable')
      const checks = await githubRequest(ctx, exec, settings, pr.repository, 'GET', (repo) => encodeRepo(repo) + '/commits/' + sha + '/check-runs?per_page=100')
      const statuses = await githubRequest(ctx, exec, settings, pr.repository, 'GET', (repo) => encodeRepo(repo) + '/commits/' + sha + '/status?per_page=100')
      return envelope(pr, {
        number: args.prNumber, head: sha,
        checks: (checks.data.check_runs ?? []).slice(0, 100).map((check: any) => ({
          name: check.name, status: check.status, conclusion: check.conclusion,
          url: check.html_url, summary: typeof check.output?.summary === 'string' ? check.output.summary.slice(0, 800) : '',
        })),
        statuses: (statuses.data.statuses ?? []).slice(0, 100).map((status: any) => ({
          context: status.context, state: status.state, description: status.description, url: status.target_url,
        })),
      })
    }),
    tool('jobs', 'Inspect failed GitHub Actions jobs and steps by workflow run ID; for central CI use repository=fongap-labs/action-worker.', {
      repository: optional, runId: { type: 'integer', required: true },
    }, async (args, exec) => {
      if (!Number.isSafeInteger(args.runId) || args.runId <= 0) throw new Error('invalid workflow run ID')
      const response = await githubRequest(ctx, exec, settings, args.repository, 'GET', (repo) => encodeRepo(repo) + '/actions/runs/' + args.runId + '/jobs?per_page=100')
      return envelope(response, {
        runId: args.runId,
        total: response.data.total_count,
        jobs: (response.data.jobs ?? []).slice(0, 100).map((job: any) => ({
          id: job.id, name: job.name, conclusion: job.conclusion, url: job.html_url,
          failedSteps: (job.steps ?? []).filter((step: any) => step.conclusion === 'failure')
            .map((step: any) => ({ name: step.name, number: step.number })),
        })),
      })
    }),
    tool('branch', 'Create a feature branch from the repository default (or a supplied base) without modifying protected branches.', { repository: optional, branch: string, base: optional }, async (args, exec) => {
      requireWrites(settings)
      const branch = validBranch(args.branch)
      if (branch === 'main' || branch === 'master') throw new Error('refusing to write to the default branch')
      const info = await repositoryDefault(exec, args.repository)
      const base = validBranch(args.base ?? info.defaultBranch)
      if (branch === base || branch === info.defaultBranch) throw new Error('refusing to write to the default branch')
      const source = await githubRequest(ctx, exec, settings, info.repository, 'GET', (repo) => encodeRepo(repo) + '/git/ref/heads/' + base.split('/').map(encodeURIComponent).join('/'))
      const result = await githubRequest(ctx, exec, settings, source.repository, 'POST', (repo) => encodeRepo(repo) + '/git/refs', { ref: 'refs/heads/' + branch, sha: source.data.object.sha })
      return envelope(result, { branch, sha: result.data.object.sha })
    }),
    tool('commit_file',
      'Commit one UTF-8 file to a feature branch with a non-force fast-forward ref update; stale branch heads and concurrent commits fail closed.',
      { repository: optional, branch: string, path: string, content: string, message: string, expectedHead: optional },
      async (args, exec) => {
        requireWrites(settings)
        const branch = validBranch(args.branch)
        if (branch === 'main' || branch === 'master') throw new Error('refusing to write to the default branch')
        const path = validPath(args.path)
        if (typeof args.content !== 'string' || Buffer.byteLength(args.content, 'utf8') > 262144) {
          throw new Error('GitHub file content must be UTF-8 text no larger than 256 KiB')
        }
        if (typeof args.message !== 'string' || !args.message.trim()) throw new Error('commit message required')
        if (args.expectedHead !== undefined) validatedCommitSha(args.expectedHead, 'expectedHead')
        const info = await repositoryDefault(exec, args.repository)
        if (branch === info.defaultBranch) throw new Error('refusing to write to the default branch')
        const endpoint = (repo: string) => encodeRepo(repo) + '/git/ref/heads/' + branch.split('/').map(encodeURIComponent).join('/')
        const branchRef = await githubRequest(ctx, exec, settings, info.repository, 'GET', endpoint)
        const previousHead = validatedCommitSha(branchRef.data?.object?.sha, 'branch HEAD')
        if (args.expectedHead && previousHead !== args.expectedHead) {
          throw new Error('GitHub branch HEAD differs from expectedHead; fetch latest state before editing')
        }
        // Pin all observations to the same snapshot. A changing branch must
        // not silently select a new base after the user reviewed the file.
        const fileEndpoint = (repo: string) => encodeRepo(repo) + '/contents/' + path
        const existing = await githubRequest(ctx, exec, settings, info.repository, 'GET',
          (repo) => fileEndpoint(repo) + '?ref=' + previousHead)
          .catch((error: unknown) => {
            if (error instanceof GitHubApiFailure && error.status === 404) return null
            throw error
          })
        if (existing && (Array.isArray(existing.data) || existing.data?.type !== 'file')) {
          throw new Error('target is not a regular GitHub file')
        }
        const parent = await githubRequest(ctx, exec, settings, info.repository, 'GET',
          (repo) => encodeRepo(repo) + '/git/commits/' + previousHead)
        const treeSha = validatedCommitSha(parent.data?.tree?.sha, 'parent tree')
        // Preserve executable bits when replacing an existing regular file.
        // Git Contents API does not expose the Git tree mode, so walk only
        // this path's ancestor trees rather than enumerating the repository.
        let fileMode = '100644'
        if (existing) {
          let currentTree = treeSha
          const segments = args.path.split('/')
          for (const [index, segment] of segments.entries()) {
            const listing = await githubRequest(ctx, exec, settings, info.repository, 'GET',
              (repo) => encodeRepo(repo) + '/git/trees/' + currentTree)
            if (!Array.isArray(listing.data?.tree) || listing.data.truncated === true) {
              throw new Error('GitHub tree evidence is incomplete')
            }
            const entry = listing.data.tree.find((item: any) => item.path === segment)
            if (!entry) throw new Error('file missing from pinned Git tree; inspect repository state')
            if (index === segments.length - 1) {
              if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
                throw new Error('GitHub file is not a regular blob; refusing write')
              }
              fileMode = entry.mode
            } else {
              if (entry.type !== 'tree') throw new Error('GitHub file ancestor is not a directory')
              currentTree = validatedCommitSha(entry.sha, 'nested tree')
            }
          }
        }
        // Git Trees API can create the text blob while preserving the full
        // base tree. Unlike Contents PUT, the ref update below is a separate
        // non-force fast-forward operation, so racing branches cannot overwrite.
        const tree = await githubRequest(ctx, exec, settings, info.repository, 'POST',
          (repo) => encodeRepo(repo) + '/git/trees', {
            base_tree: treeSha,
            tree: [{ path: args.path, mode: fileMode, type: 'blob', content: args.content }],
          })
        const nextTree = validatedCommitSha(tree.data?.sha, 'new tree')
        const commit = await githubRequest(ctx, exec, settings, info.repository, 'POST',
          (repo) => encodeRepo(repo) + '/git/commits', {
            message: args.message, tree: nextTree, parents: [previousHead],
          })
        const commitSha = validatedCommitSha(commit.data?.sha, 'new')
        try {
          await githubRequest(ctx, exec, settings, info.repository, 'PATCH', endpoint, {
            sha: commitSha, force: false,
          })
        } catch (error) {
          if (error instanceof GitHubApiFailure &&
              (error.status === 409 || error.status === 422)) {
            throw new Error('GitHub non-fast-forward branch conflict; nothing was force-pushed; inspect HEAD and rebase before retry')
          }
          if (error instanceof GitHubWriteUncertain) {
            // Only a GET is allowed after an ambiguous PATCH outcome.
            const current = await githubRequest(ctx, exec, settings, info.repository, 'GET', endpoint)
              .catch(() => null)
            if (current?.data?.object?.sha === commitSha) {
              return envelope(current, { path: args.path, branch, commit: commitSha, previousHead, confirmedAfterRead: true })
            }
          }
          throw error
        }
        return envelope(commit, { path: args.path, branch, commit: commitSha, previousHead })
      }),
    tool('create_pr',
      'Create or reuse one open pull request for a feature head and base. Never duplicate an existing PR or retry a write blindly.',
      { repository: optional, head: string, base: optional, title: string, body: optional },
      async (args, exec) => {
        requireWrites(settings)
        const head = validBranch(args.head)
        const info = await repositoryDefault(exec, args.repository)
        const base = validBranch(args.base ?? info.defaultBranch)
        if (head === base) throw new Error('head must differ from base')
        if (typeof args.title !== 'string' || !args.title.trim()) throw new Error('PR title required')
        const owner = info.repository.split('/')[0]!
        const findExisting = async () => {
          const response = await githubRequest(ctx, exec, settings, info.repository, 'GET', (repo) =>
            encodeRepo(repo) + '/pulls?state=open&per_page=100&head=' +
              encodeURIComponent(owner + ':' + head) + '&base=' + encodeURIComponent(base))
          if (!Array.isArray(response.data)) throw new Error('GitHub PR listing is incomplete')
          const matching = response.data.find((pr: any) =>
            pr.head?.ref === head && pr.base?.ref === base &&
            pr.head?.repo?.full_name?.toLowerCase() === info.repository.toLowerCase())
          if (!matching) return null
          if (!Number.isSafeInteger(matching.number) || matching.number <= 0 ||
              typeof matching.html_url !== 'string') throw new Error('invalid existing GitHub PR response')
          return envelope(response, { number: matching.number, url: matching.html_url, reused: true })
        }
        const existing = await findExisting()
        if (existing) return existing
        try {
          const result = await githubRequest(ctx, exec, settings, info.repository, 'POST', (repo) =>
            encodeRepo(repo) + '/pulls', {
              head, base, title: args.title, body: args.body ?? '',
            })
          return envelope(result, { number: result.data.number, url: result.data.html_url, reused: false })
        } catch (error) {
          // Concurrent callers can both observe no PR. GitHub rejects the
          // second with 422; an ambiguous POST might already have created it.
          // Re-read once but NEVER retry POST, and never turn a 401/403 into
          // an apparently successful operation.
          const isRecoverable = error instanceof GitHubWriteUncertain ||
            (error instanceof GitHubApiFailure &&
              (error.status === 409 || error.status === 422))
          if (isRecoverable) {
            const recovered = await findExisting().catch(() => null)
            if (recovered) return recovered
          }
          throw error
        }
      }),

  ]
}
