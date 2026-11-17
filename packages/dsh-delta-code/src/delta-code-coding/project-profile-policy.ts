/** Host-independent project metadata classification; performs no filesystem access. */
export const PROJECT_FILES = [
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
export function declaredScripts(raw: string): string[] {
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

export function profileSummary(cwd: string, files: string[], scripts: string[]): ProjectProfile {
  const suggestedChecks: string[] = scripts.filter(name =>
    name === 'typecheck' || name === 'lint' || name === 'check' || name === 'test')
  if (suggestedChecks.length === 0 && scripts.includes('build')) suggestedChecks.push('build')
  return {
    cwd: cwd.slice(0, MAX_DESCRIPTION),
    files, technologies: technologies(new Set(files)), scripts,
    guidance: files.filter(name => name === 'AGENTS.md' || name === 'CLAUDE.md'),
    suggestedChecks,
  }
}
