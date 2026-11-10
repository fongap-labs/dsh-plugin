import { lstat, readdir, realpath } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, runCommand, isSubprocessMounted, resolveInside, isPathInside } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import { resolveRoot } from '../runtime.js'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 250
// Discover direct child checkouts only. Never recurse through the full workspace.
const MAX_DISCOVERY_DIRECTORIES = 96
const MAX_DISCOVERY_REPOSITORIES = 12
const SOURCE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'java', 'kt', 'cs', 'c', 'cc', 'cpp', 'h', 'hpp', 'vue', 'svelte', 'swift'])

export function rankTrackedFiles(paths: string[], query: string, limit: number): string[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const ranked = paths.map((path) => {
    const lower = path.toLowerCase()
    const file = lower.split('/').at(-1) ?? lower
    const extension = file.split('.').at(-1) ?? ''
    let score = SOURCE_EXTENSIONS.has(extension) ? 1 : 0
    let matches = 0
    for (const term of terms) {
      let weight = 0
      if (file === term) weight = 12
      else if (file.includes(term)) weight = 8
      else if (lower.includes(term)) weight = 4
      // One unmatched language/alias must not cancel a genuine match.
      score += weight
      if (weight > 0) matches += 1
    }
    if (file === 'package.json' || file === 'cargo.toml' || file === 'pyproject.toml' ||
        file === 'go.mod' || file === 'readme.md' || file === 'agents.md') score += 2
    return { path, score, matches }
  }).filter((entry) => terms.length === 0 || entry.matches > 0)
    .sort((a, b) => b.score - a.score || b.matches - a.matches || a.path.localeCompare(b.path))
  return ranked.slice(0, limit).map((entry) => entry.path)
}

/** Refuse a symbolic-link .git marker; accept both directory repos and linked worktree files. */
async function hasGitMarker(directory: string): Promise<boolean> {
  try {
    const marker = await lstat(join(directory, '.git'))
    return marker.isFile() || marker.isDirectory()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function discoverDirectRepositories(root: string, signal: AbortSignal): Promise<string[]> {
  signal.throwIfAborted()
  const children = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .sort((a, b) => a.name.localeCompare(b.name))
  if (children.length > MAX_DISCOVERY_DIRECTORIES) {
    throw new Error('workspace has too many subdirectories to scan safely; specify cwd')
  }
  const repositories: string[] = []
  for (const entry of children) {
    signal.throwIfAborted()
    const child = join(root, entry.name)
    const canonicalChild = await realpath(child)
    if (!isPathInside(root, canonicalChild) || canonicalChild === root) continue
    if (!(await hasGitMarker(child))) continue
    repositories.push(child)
    if (repositories.length > MAX_DISCOVERY_REPOSITORIES) {
      throw new Error('workspace has too many Git repositories; specify cwd')
    }
  }
  return repositories
}

function rootRelativePath(root: string, directory: string, path: string): string {
  const prefix = relative(root, directory).split(sep).join('/')
  return prefix ? prefix + '/' + path : path
}

interface TrackedFiles {
  isGitRepository: boolean
  paths: string[]
}

/**
 * Only the DSH-controlled subprocess may enumerate tracked files when mounted.
 * Non-Git exit codes are distinguished from provider denial (which throws).
 */
async function listTrackedFiles(
  ctx: Context, settings: Settings, directory: string, signal: AbortSignal,
): Promise<TrackedFiles> {
  const command = await runCommand(ctx, {
    command: settings.gitCommand, args: ['ls-files', '-z', '--cached'],
    cwd: directory, signal, timeoutMs: 15_000, maxOutputBytes: 1024 * 1024,
    hostOnly: isSubprocessMounted(ctx),
  })
  if (command.timedOut || command.signal || command.lossy) {
    throw new Error('unable to enumerate tracked files without timeout or truncation')
  }
  if (command.exitCode !== 0) return { isGitRepository: false, paths: [] }
  return { isGitRepository: true, paths: command.stdout.split('\0').filter(Boolean)
    .filter((path) => !path.startsWith('.dsh-delta-code/')) }
}

/** Read only tracked paths; scan at most one level when the workspace is a multi-repo parent. */
export function createWorkspaceMapTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: 'code_workspace_map',
    description: 'Return a compact query-ranked map of tracked Git files. If the workspace is not a repository, discover its immediate child repositories (bounded, no full tree dump). Returned paths are workspace-relative.',
    parameters: {
      query: { type: 'string', description: 'Optional keywords, symbols or filename fragments.' },
      cwd: { type: 'string', description: 'Optional relative subdirectory or task worktree. When provided, only this directory is indexed.' },
      limit: { type: 'integer', description: 'Maximum paths, 1..250; defaults to 100.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        total: { type: 'integer', required: true },
        selected: { type: 'array', required: true, items: { type: 'string' } },
        truncated: { type: 'boolean', required: true },
        repositories: { type: 'array', required: true, items: { type: 'string' } },
      } },
      render(_args, result) {
        return [{ type: 'text', text: 'Repositories: ' + result.repositories.join(', ') +
          '\nTracked files: ' + result.total + '\n' + result.selected.join('\n') +
          (result.truncated ? '\n(more files omitted or did not match query)' : '') }]
      },
    },
    async execute(args, exec) {
      const limit = args.limit ?? DEFAULT_LIMIT
      if (limit < 1 || limit > MAX_LIMIT) throw new Error('limit must be between 1 and 250')
      const root = await resolveRoot(ctx, exec, settings)
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root
      const canonicalRoot = await realpath(root)
      const canonicalCwd = await realpath(cwd)
      if (!isPathInside(canonicalRoot, canonicalCwd)) {
        throw new Error('workspace directory escapes the repository')
      }
      const base = await listTrackedFiles(ctx, settings, canonicalCwd, exec.signal)
      let repositories = [canonicalCwd]
      let paths: string[] = []
      if (base.isGitRepository) {
        paths = base.paths.map((path) => rootRelativePath(canonicalRoot, canonicalCwd, path))
      } else {
        // Do not turn a damaged/denied explicit repository into an unrequested search.
        if (args.cwd || await hasGitMarker(canonicalCwd)) {
          throw new Error('specified Git repository could not be indexed; check cwd and Host permission')
        }
        repositories = await discoverDirectRepositories(canonicalRoot, exec.signal)
        if (!repositories.length) {
          throw new Error('no Git repository at workspace root or in immediate subdirectories; specify cwd')
        }
        for (const directory of repositories) {
          exec.signal.throwIfAborted()
          const result = await listTrackedFiles(ctx, settings, directory, exec.signal)
          if (!result.isGitRepository) {
            throw new Error('discovered Git repository could not be indexed; check Host permission')
          }
          paths.push(...result.paths.map((path) => rootRelativePath(canonicalRoot, directory, path)))
        }
      }
      const selected = rankTrackedFiles(paths, args.query ?? '', limit)
      return {
        total: paths.length, selected, truncated: paths.length > selected.length,
        repositories: repositories.map((directory) => relative(canonicalRoot, directory).split(sep).join('/') || '.'),
      }
    },
  })
}
