export type VerificationBaseScript = 'test' | 'typecheck' | 'build' | 'lint' | 'check'
export type VerificationScript = VerificationBaseScript | `${VerificationBaseScript}:${string}`
const BASE_SCRIPTS = new Set<string>(['test', 'typecheck', 'build', 'lint', 'check'])
const SAFE_SCRIPT = /^(?:test|typecheck|build|lint|check)(?::[a-z0-9][a-z0-9_-]{0,63})?$/
/** Named variants run only if declared in the selected Node project's package.json. */
export function isAllowedVerificationScript(script: unknown): script is VerificationScript {
  return typeof script === 'string' && SAFE_SCRIPT.test(script)
}
function isBaseVerificationScript(script: string): script is VerificationBaseScript {
  return BASE_SCRIPTS.has(script)
}
export type VerificationProject = 'auto' | 'node' | 'rust' | 'python' | 'go'

export interface VerificationCommand {
  project: Exclude<VerificationProject, 'auto'>
  command: string
  args: string[]
}

const PRESETS: Record<Exclude<VerificationProject, 'auto' | 'node'>, Partial<Record<VerificationBaseScript, [string, ...string[]]>>> = {
  rust: {
    test: ['cargo', 'test'],
    typecheck: ['cargo', 'check'],
    check: ['cargo', 'check'],
    lint: ['cargo', 'clippy', '--all-targets', '--', '-D', 'warnings'],
    build: ['cargo', 'build'],
  },
  python: {
    test: ['python', '-m', 'pytest'],
    check: ['python', '-m', 'compileall', '-q', '.'],
    lint: ['python', '-m', 'ruff', 'check', '.'],
    typecheck: ['python', '-m', 'mypy', '.'],
    build: ['python', '-m', 'build'],
  },
  go: {
    test: ['go', 'test', './...'],
    check: ['go', 'vet', './...'],
    lint: ['go', 'vet', './...'],
    build: ['go', 'build', './...'],
    typecheck: ['go', 'test', '-run', '^$', './...'],
  },
}

/** Select only a known command: never execute raw model-supplied shell strings. */
export function chooseVerificationCommand(
  script: VerificationScript,
  project: VerificationProject,
  present: readonly Exclude<VerificationProject, 'auto'>[],
  manager: 'npm' | 'pnpm' | 'bun' | 'yarn' = 'npm',
  nodeScripts: readonly string[] = [],
  isRustLocked = false,
): VerificationCommand {
  if (!isAllowedVerificationScript(script)) throw new Error('script is not allowlisted')
  const discovered = [...new Set(present)]
  if (project !== 'auto' && !discovered.includes(project)) {
    throw new Error(project + ' project manifest not found in the selected directory')
  }
  if (project === 'auto' && discovered.length !== 1) {
    throw new Error(discovered.length === 0
      ? 'no supported project manifest in the selected directory'
      : 'multiple project types detected; select project=node, rust, python or go explicitly')
  }
  const selected = project === 'auto' ? discovered[0]! : project
  if (selected === 'node') {
    if (!nodeScripts.includes(script)) throw new Error('package.json does not declare script ' + script)
    return { project: 'node', command: manager, args: ['run', script] }
  }
  if (!isBaseVerificationScript(script)) throw new Error('named verification scripts require a Node package.json declaration')
  const preset = PRESETS[selected]?.[script]
  if (!preset) throw new Error(selected + ' does not provide a safe preset for ' + script)
  const args = preset.slice(1)
  if (selected === 'rust' && isRustLocked && script !== 'lint') args.push('--locked')
  return { project: selected, command: preset[0], args }
}
