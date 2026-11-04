import { access, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, isPathInside, resolveInside } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import { resolveRoot } from '../runtime.js'

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
  const present = new Set(files)
  const scripts: string[] = []
  if (present.has('package.json')) {
    try {
      const raw = await readFile(join(canonicalCwd, 'package.json'), 'utf8')
      if (Buffer.byteLength(raw) <= 1024 * 1024) {
        const parsed: unknown = JSON.parse(raw)
        const defined = (parsed as { scripts?: unknown })?.scripts
        if (defined && typeof defined === 'object' && !Array.isArray(defined)) {
          for (const name of SCRIPT_NAMES) {
            if (typeof (defined as Record<string, unknown>)[name] === 'string') scripts.push(name)
          }
        }
      }
    } catch { /* profile remains useful without package.json */ }
  }

  const guidance = files.filter(name => name === 'AGENTS.md' || name === 'CLAUDE.md')
  const suggestedChecks: string[] = scripts.filter(name => name === 'typecheck' || name === 'lint' || name === 'check' || name === 'test')
  if (suggestedChecks.length === 0 && scripts.includes('build')) suggestedChecks.push('build')
  return {
    cwd: canonicalCwd.slice(0, MAX_DESCRIPTION),
    files, technologies: technologies(present), scripts, guidance, suggestedChecks,
  }
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
      return inspectProject(cwd, root)
    },
  })
}
