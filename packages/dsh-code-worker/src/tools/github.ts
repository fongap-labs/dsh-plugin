import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, runCommand } from '@fongap-labs/shared'
import type { GitHubAccountConfig, Settings } from '../types.js'
import { resolveRoot } from '../runtime.js'

const API = 'https://api.github.com'
const REPOSITORY = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\\\x00-\x1f]+$/
const SAFE_BRANCH = /^(?!\/)(?!.*\.\.)(?!.*(?:^|\/)\.)(?!.*[~^:?*\\\[\x00-\x20])[^/]+(?:\/[^/]+)*$/

export function selectGitHubAccount(accounts: GitHubAccountConfig[], repository: string): GitHubAccountConfig {
  if (!REPOSITORY.test(repository)) throw new Error('invalid owner/repository')
  const repo = repository.toLowerCase()
  const exact = accounts.filter((account) => account.repositories.includes(repo))
  const owner = repo.split('/')[0]!
  const wildcard = accounts.filter((account) => account.repositories.includes(owner + '/*'))
  const matches = exact.length ? exact : wildcard
  if (matches.length !== 1) throw new Error(matches.length ? 'ambiguous GitHub account mapping' : 'no GitHub account configured for repository')
  return matches[0]!
}

export function repositoryFromRemote(remote: string): string | undefined {
  const value = remote.trim()
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/.exec(value)
  return match?.[1]
}

async function resolveRepository(ctx: Context, exec: Parameters<ToolDefinition['execute']>[1], settings: Settings, supplied?: string): Promise<string> {
  if (supplied) {
    if (!REPOSITORY.test(supplied)) throw new Error('repository must be owner/name')
    return supplied
  }
  const cwd = await resolveRoot(ctx, exec, settings)
  const result = await runCommand(ctx, {
    command: settings.gitCommand,
    args: ['remote', 'get-url', 'origin'],
    cwd, signal: exec.signal, timeoutMs: 10_000,
  })
  const repo = result.exitCode === 0 ? repositoryFromRemote(result.stdout) : undefined
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
  const token = process.env[account.tokenEnv]
  if (!token?.trim()) throw new Error('GitHub credential unavailable for account ' + account.id + ' (environment variable ' + account.tokenEnv + ')')
  const url = API + path(repo)
  if (!url.startsWith(API + '/') || !new URL(url).hostname.endsWith('github.com')) throw new Error('invalid GitHub API URL')
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: 'Bearer ' + token.trim(),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dsh-code-worker',
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: exec.signal,
    redirect: 'error',
  })
  if (!response.ok) {
    throw new Error('GitHub API ' + response.status + ' for ' + repo + ' (' + account.id + ')')
  }
  return { repository: repo, account: account.id, data: response.status === 204 ? null : await response.json() }
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
    tool('branch', 'Create a feature branch from a known base branch without changing main.', { repository: optional, branch: string, base: optional }, async (args, exec) => {
      requireWrites(settings)
      const branch = validBranch(args.branch)
      const base = validBranch(args.base ?? 'main')
      if (branch === base || branch === 'main' || branch === 'master') throw new Error('refusing to write to the default branch')
      const source = await githubRequest(ctx, exec, settings, args.repository, 'GET', (repo) => encodeRepo(repo) + '/git/ref/heads/' + base.split('/').map(encodeURIComponent).join('/'))
      const result = await githubRequest(ctx, exec, settings, source.repository, 'POST', (repo) => encodeRepo(repo) + '/git/refs', { ref: 'refs/heads/' + branch, sha: source.data.object.sha })
      return envelope(result, { branch, sha: result.data.object.sha })
    }),
    tool('commit_file', 'Commit one UTF-8 file to an existing feature branch, never directly to main.', {
      repository: optional, branch: string, path: string, content: string, message: string,
    }, async (args, exec) => {
      requireWrites(settings)
      const branch = validBranch(args.branch)
      if (branch === 'main' || branch === 'master') throw new Error('refusing to write to the default branch')
      const path = validPath(args.path)
      const ref = await githubRequest(ctx, exec, settings, args.repository, 'GET', (repo) => encodeRepo(repo) + '/git/ref/heads/' + branch.split('/').map(encodeURIComponent).join('/'))
      const endpoint = (repo: string) => encodeRepo(repo) + '/contents/' + path
      const existing = await githubRequest(ctx, exec, settings, ref.repository, 'GET', (repo) => endpoint(repo) + '?ref=' + encodeURIComponent(branch))
        .catch((error: Error) => { if (error.message.startsWith('GitHub API 404 ')) return null; throw error })
      if (existing?.data?.type && existing.data.type !== 'file') throw new Error('target is not a file')
      const result = await githubRequest(ctx, exec, settings, ref.repository, 'PUT', endpoint, {
        message: args.message,
        content: Buffer.from(args.content, 'utf8').toString('base64'),
        branch,
        ...(existing?.data?.sha ? { sha: existing.data.sha } : {}),
      })
      return envelope(result, { path: args.path, branch, commit: result.data.commit.sha })
    }),
    tool('create_pr', 'Open a pull request from a feature branch; merging remains governed by GitHub and Action Worker.', {
      repository: optional, head: string, base: optional, title: string, body: optional,
    }, async (args, exec) => {
      requireWrites(settings)
      const head = validBranch(args.head)
      const base = validBranch(args.base ?? 'main')
      if (head === base) throw new Error('head must differ from base')
      const result = await githubRequest(ctx, exec, settings, args.repository, 'POST', (repo) => encodeRepo(repo) + '/pulls', {
        head, base, title: args.title, body: args.body ?? '',
      })
      return envelope(result, { number: result.data.number, url: result.data.html_url })
    }),
  ]
}
