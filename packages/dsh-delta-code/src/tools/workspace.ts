
import { realpath } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, runCommand, resolveInside, isPathInside } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import { resolveRoot } from '../runtime.js'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 250
const SOURCE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'java', 'kt', 'cs', 'c', 'cc', 'cpp', 'h', 'hpp', 'vue', 'svelte', 'swift'])

export function rankTrackedFiles(paths: string[], query: string, limit: number): string[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const ranked = paths.map((path) => {
    const lower = path.toLowerCase()
    const file = lower.split('/').at(-1) ?? lower
    const extension = file.split('.').at(-1) ?? ''
    let score = SOURCE_EXTENSIONS.has(extension) ? 1 : 0
    for (const term of terms) {
      if (file === term) score += 12
      else if (file.includes(term)) score += 8
      else if (lower.includes(term)) score += 4
      else score -= 10
    }
    if (file === 'package.json' || file === 'cargo.toml' || file === 'pyproject.toml' ||
        file === 'go.mod' || file === 'readme.md' || file === 'agents.md') score += 2
    return { path, score }
  }).filter((entry) => terms.length === 0 || entry.score > -5)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
  return ranked.slice(0, limit).map((entry) => entry.path)
}

/** Read only tracked repository paths; avoid token-heavy full-tree dumps. */
export function createWorkspaceMapTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: 'code_workspace_map',
    description: 'Return a compact, query-ranked map of tracked repository files (no file content). Use before reading source or planning a refactor.',
    parameters: {
      query: { type: 'string', description: 'Optional keywords, symbols or filename fragments.' },
      cwd: { type: 'string', description: 'Optional relative workspace subdirectory, including a task worktree.' },
      limit: { type: 'integer', description: 'Maximum paths, 1..250; defaults to 100.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        total: { type: 'integer', required: true },
        selected: { type: 'array', required: true, items: { type: 'string' } },
        truncated: { type: 'boolean', required: true },
      } },
      render(_args, result) {
        return [{ type: 'text', text: 'Tracked files: ' + result.total + '\n' + result.selected.join('\n') + (result.truncated ? '\n(more files omitted)' : '') }]
      },
    },
    async execute(args, exec) {
      const limit = args.limit ?? DEFAULT_LIMIT
      if (limit < 1 || limit > MAX_LIMIT) throw new Error('limit must be between 1 and 250')
      const root = await resolveRoot(ctx, exec, settings)
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root
      const canonicalRoot = await realpath(root)
      const canonicalCwd = await realpath(cwd)
      if (!isPathInside(canonicalRoot, canonicalCwd)) throw new Error('workspace directory escapes the repository')
      const command = await runCommand(ctx, {
        command: settings.gitCommand, args: ['ls-files', '-z', '--cached'],
        cwd: canonicalCwd, signal: exec.signal, timeoutMs: 15_000, maxOutputBytes: 1024 * 1024,
        hostOnly: ctx.subprocess != null,
      })
      if (command.exitCode !== 0 || command.timedOut || command.lossy) {
        throw new Error('unable to enumerate tracked files without truncation')
      }
      const paths = command.stdout.split('\0').filter(Boolean).filter((p) => !p.startsWith('.dsh-delta-code/'))
      const selected = rankTrackedFiles(paths, args.query ?? '', limit)
      return { total: paths.length, selected, truncated: paths.length > selected.length }
    },
  })
}
