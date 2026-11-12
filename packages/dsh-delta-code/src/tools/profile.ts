import { access, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, isPathInside, resolveInside } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import { resolveRoot } from '../runtime.js'
import { requireHostFs } from '../host-fs.js'

const PROJECT_FILES = [
  'AGENTS.md', 'CLAUDE.md', 'README.md', 'package.json', 'pnpm-lock.yaml',
  'yarn.lock', 'bun.lock', 'bun.lockb', 'package-lock.json',
  'Cargo.toml', 'Cargo.lock', 'pyproject.toml', 'uv.lock', 'requirements.txt',
  'go.mod', 'go.sum', 'Makefile', 'justfile', 'tsconfig.json',
  'pytest.ini', 'vitest.config.ts', 'vitest.config.mts',
  'jest.config.js', 'eslint.config.js', '.github/workflows/ci.yml',
] as const
const SCRIPT_NAMES = ['test', 'typecheck', 'lint', 'check', 'build'] as const
const MAX_DESCRIPTION = 240

export interface ProjectProfile {
  cwd: string
  files: string[]
  technologies: string[]
  scripts: string[]
  guidance: string[]
  suggestedChecks: string[]
}

function technologies(files: Set<string>): string[] {
  const found: string[] = []
  if (files.has('package.json')) found.push('node')
  if (files.has('tsconfig.json')) found.push('typescript')
  if (files.has('Cargo.toml')) found.push('rust')
  if (files.has('pyproject.toml') || files.has('requirements.txt')) found.push('python')
  if (files.has('go.mod')) found.push('go')
  return found
}

/** Pure metadata extraction shared by local and Host-authoritative readers. */
function declaredScripts(raw: string): string[] {
  if (Buffer.byteLength(raw, 'utf8') > 1024 * 1024) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    const defined = (parsed as { scripts?: unknown } | null)?.scripts
    if (!defined || typeof defined !== 'object' || Array.isArray(defined)) return []
    return SCRIPT_NAMES.filter(name =>
      typeof (defined as Record<string, unknown>)[name] === 'string')
  } catch {
    return []
  }
}

function profileSummary(cwd: string, files: string[], scripts: string[]): ProjectProfile {
  const suggestedChecks = scripts.filter(name =>
    name === 'typecheck' || name === 'lint' || name === 'check' || name === 'test')
  if (suggestedChecks.length === 0 && scripts.includes('build')) suggestedChecks.push('build')
  return {
    cwd: cwd.slice(0, MAX_DESCRIPTION),
    files, technologies: technologies(new Set(files)), scripts,
    guidance: files.filter(name => name === 'AGENTS.md' || name === 'CLAUDE.md'),
    suggestedChecks,
  }
}

export async function inspectProject(cwd: string, root: string): Promise<ProjectProfile> {
  const canonicalRoot = await realpath(root)
  const canonicalCwd = await realpath(cwd)
  if (!isPathInside(canonicalRoot, canonicalCwd)) throw new Error('project directory escapes workspace')

  const files: string[] = []
  for (const name of PROJECT_FILES) {
    try {
      const file = await realpath(join(canonicalCwd, name))
      if (!isPathInside(canonicalRoot, file)) continue
      await access(file)
      files.push(name)
    } catch { /* file absent or unsafe */ }
  }
  let scripts: string[] = []
  if (files.includes('package.json')) {
    try {
      const raw = await readFile(join(canonicalCwd, 'package.json'), 'utf8')
      scripts = declaredScripts(raw)
    } catch { /* profile remains useful without package.json */ }
  }
  return profileSummary(canonicalCwd, files, scripts)
}


/** DSH FS is authoritative when mounted; do not switch to local Node reads on refusal. */
export async function inspectProjectWithHost(
  ctx: Context, exec: { signal: AbortSignal }, cwd: string, root: string,
): Promise<ProjectProfile> {
  const fs = requireHostFs(ctx, ['resolve', 'contains', 'stat', 'readText'], 'refusing local profile fallback')
  if (!fs) return inspectProject(cwd, root)
  if (exec.signal.aborted) throw new Error('project profile cancelled')
  const rootTarget = await fs.resolve(root, { cwd: root, signal: exec.signal })
  if (exec.signal.aborted) throw new Error('project profile cancelled')
  const cwdTarget = await fs.resolve(cwd, { cwd: root, signal: exec.signal })
  if (!fs.contains(rootTarget, cwdTarget)) throw new Error('project directory escapes workspace')
  if (exec.signal.aborted) throw new Error('project profile cancelled')
  const directoryInfo = await fs.stat(cwdTarget, exec.signal)
  if (!directoryInfo || directoryInfo.type !== 'directory') {
    throw new Error('project cwd is not a Host-authorized directory')
  }
  if (exec.signal.aborted) throw new Error('project profile cancelled')
  const files: string[] = []
  let packageTarget: unknown
  for (const name of PROJECT_FILES) {
    if (exec.signal.aborted) throw new Error('project profile cancelled')
    const target = await fs.resolve(join(cwd, name), { cwd, signal: exec.signal })
    if (!fs.contains(rootTarget, target)) continue
    const info = await fs.stat(target, exec.signal)
    if (exec.signal.aborted) throw new Error('project profile cancelled')
    if (info?.type !== 'file') continue
    files.push(name)
    if (name === 'package.json') packageTarget = target
  }
  let scripts: string[] = []
  if (packageTarget !== undefined) {
    // Host read failures remain fatal: never silently use local Node data.
    const raw = await fs.readText(packageTarget, exec.signal)
    if (exec.signal.aborted) throw new Error('project profile cancelled')
    scripts = declaredScripts(raw)
  }
  if (exec.signal.aborted) throw new Error('project profile cancelled')
  return profileSummary(cwd, files, scripts)
}

export function createProjectProfileTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: 'code_project_profile',
    description: 'Quick read-only project preflight: detect tech stack, project rule files and existing verification scripts without reading source bodies. Use before planning or choosing tests.',
    parameters: {
      cwd: { type: 'string', description: 'Optional workspace-relative project directory.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        cwd: { type: 'string', required: true },
        files: { type: 'array', required: true, items: { type: 'string' } },
        technologies: { type: 'array', required: true, items: { type: 'string' } },
        scripts: { type: 'array', required: true, items: { type: 'string' } },
        guidance: { type: 'array', required: true, items: { type: 'string' } },
        suggestedChecks: { type: 'array', required: true, items: { type: 'string' } },
      } },
      render(_args, result) {
        return [{ type: 'text', text: [
          'Project: ' + result.cwd,
          'Stack: ' + (result.technologies.join(', ') || '(unknown)'),
          'Rules: ' + (result.guidance.join(', ') || '(none at cwd; inspect parent directories)'),
          'Scripts: ' + (result.scripts.join(', ') || '(none)'),
          'Suggested checks: ' + (result.suggestedChecks.join(', ') || '(none)'),
          'Detected files: ' + result.files.join(', '),
        ].join('\n') }]
      },
    },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, exec, settings)
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root
      return inspectProjectWithHost(ctx, exec, cwd, root)
    },
  })
}
