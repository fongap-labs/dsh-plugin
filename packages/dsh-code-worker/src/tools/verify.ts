import { access, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, isSubprocessAvailable, runCommand, resolveInside, isPathInside } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import { readTextSafe, resolveRoot } from '../runtime.js'

export type VerificationEcosystem = 'node' | 'rust' | 'python' | 'go'
export type VerificationScript = 'test' | 'typecheck' | 'build' | 'lint' | 'check'
export interface VerificationCommand {
  command: string
  args: string[]
}
const SCRIPTS: readonly VerificationScript[] = ['test', 'typecheck', 'build', 'lint', 'check']
const MAX_OUTPUT = 32 * 1024

export function redactKnownTokens(text: string, settings: Settings): string {
  let value = text
  for (const account of settings.githubAccounts) {
    const token = account.token || (account.tokenEnv ? process.env[account.tokenEnv] : undefined)
    if (token && token.length >= 8) value = value.split(token).join('[REDACTED]')
  }
  return value.replace(/\b(?:github_pat_[a-zA-Z0-9_]{12,}|gh[pousr]_[a-zA-Z0-9]{20,})\b/g, '[REDACTED]')
}

async function containsSafeFile(cwd: string, root: string, name: string): Promise<boolean> {
  try {
    const file = await realpath(join(cwd, name))
    return isPathInside(root, file)
  } catch { return false }
}

/** Auto selection fails closed for polyglot roots; callers choose a subdirectory or ecosystem. */
export async function detectVerificationEcosystem(
  cwd: string,
  root: string,
  requested: VerificationEcosystem | 'auto' = 'auto',
): Promise<VerificationEcosystem> {
  const markers: Array<[VerificationEcosystem, string[]]> = [
    ['node', ['package.json']],
    ['rust', ['Cargo.toml']],
    ['python', ['pyproject.toml', 'requirements.txt']],
    ['go', ['go.mod']],
  ]
  const found: VerificationEcosystem[] = []
  for (const [ecosystem, files] of markers) {
    for (const file of files) {
      if (await containsSafeFile(cwd, root, file)) {
        found.push(ecosystem)
        break
      }
    }
  }
  if (requested !== 'auto') {
    if (!found.includes(requested)) throw new Error('no ' + requested + ' project manifest in selected directory')
    return requested
  }
  if (found.length === 0) throw new Error('no supported project manifest; select a project subdirectory')
  if (found.length > 1) {
    throw new Error('ambiguous polyglot project (' + found.join(', ') + '); specify ecosystem explicitly or choose a subdirectory')
  }
  return found[0]!
}

async function choosePackageManager(cwd: string): Promise<'pnpm' | 'yarn' | 'bun' | 'npm'> {
  for (const [file, manager] of [
    ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'], ['bun.lock', 'bun'],
  ] as const) {
    try { await access(join(cwd, file)); return manager } catch { /* next */ }
  }
  return 'npm'
}

export function verificationCommandFor(
  ecosystem: VerificationEcosystem,
  script: VerificationScript,
  manager: 'pnpm' | 'yarn' | 'bun' | 'npm' = 'npm',
  isRustLocked = false,
): VerificationCommand {
  if (!SCRIPTS.includes(script)) throw new Error('script is not allowlisted')
  if (ecosystem === 'node') return { command: manager, args: ['run', script] }
  if (ecosystem === 'rust') {
    const action: Record<VerificationScript, string[]> = {
      test: ['test'], typecheck: ['check'], build: ['build'],
      lint: ['clippy', '--all-targets', '--', '-D', 'warnings'], check: ['check'],
    }
    const args = [...action[script]]
    if (isRustLocked && !args.includes('clippy')) args.push('--locked')
    return { command: 'cargo', args }
  }
  if (ecosystem === 'go') {
    const action: Record<VerificationScript, string[]> = {
      test: ['test', './...'], typecheck: ['test', '-run', '^$', './...'],
      build: ['build', './...'], lint: ['vet', './...'], check: ['vet', './...'],
    }
    return { command: 'go', args: action[script] }
  }
  const action: Record<VerificationScript, string[]> = {
    test: ['-m', 'pytest'], typecheck: ['-m', 'mypy', '.'],
    build: ['-m', 'build'], lint: ['-m', 'ruff', 'check', '.'],
    check: ['-m', 'compileall', '-q', '.'],
  }
  return { command: 'python', args: action[script] }
}

export function createVerifyTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: 'code_verify',
    description: 'Run a bounded project verification command through DSH host subprocess. Node: declared package.json scripts; Rust: cargo; Python: installed pytest/mypy/ruff/build or compileall; Go: go test/vet/build. Requires execution.allowCommands=true. Never installs dependencies or claims success on failure.',
    parameters: {
      script: { type: 'string', required: true, enum: ['test', 'typecheck', 'build', 'lint', 'check'] },
      cwd: { type: 'string', description: 'Optional relative workspace project subdirectory.' },
      ecosystem: { type: 'string', enum: ['auto', 'node', 'rust', 'python', 'go'], description: 'Auto detects exactly one project manifest; choose explicitly in polyglot workspaces.' },
      timeoutMs: { type: 'integer', description: 'Execution timeout, 10000..600000 ms; default 120000.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      script: { type: 'string', required: true },
      ecosystem: { type: 'string', required: true },
      command: { type: 'string', required: true },
      exitCode: { type: 'integer', required: true },
      passed: { type: 'boolean', required: true },
      timedOut: { type: 'boolean', required: true },
      output: { type: 'string', required: true },
      truncated: { type: 'boolean', required: true },
    } }, render(_args, value) {
      return [{ type: 'text', text: value.command + ': ' + (value.passed ? 'PASS' : 'FAIL') + ' (exit ' + value.exitCode + ')\n' + value.output }]
    } },
    async execute(args, exec) {
      if (!settings.allowCommands) throw new Error('script execution disabled; set execution.allowCommands=true')
      if (!isSubprocessAvailable(ctx)) throw new Error('host subprocess service is required for script execution')
      if (!SCRIPTS.includes(args.script as VerificationScript)) throw new Error('script is not allowlisted')
      const script = args.script as VerificationScript
      const timeoutMs = args.timeoutMs ?? 120_000
      if (!Number.isInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 600_000) {
        throw new Error('timeoutMs must be between 10000 and 600000')
      }
      const root = await resolveRoot(ctx, exec, settings)
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root
      const canonicalRoot = await realpath(root)
      const canonicalCwd = await realpath(cwd)
      if (!isPathInside(canonicalRoot, canonicalCwd)) throw new Error('script directory escapes the workspace')

      const ecosystem = await detectVerificationEcosystem(canonicalCwd, canonicalRoot, (args.ecosystem ?? 'auto') as VerificationEcosystem | 'auto')
      let selected: VerificationCommand
      if (ecosystem === 'node') {
        const raw = await readTextSafe(ctx, exec, canonicalCwd, 'package.json')
        if (Buffer.byteLength(raw, 'utf8') > 1024 * 1024) throw new Error('package.json exceeds 1 MiB')
        const pkg: unknown = JSON.parse(raw)
        if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('invalid package.json')
        const scripts = (pkg as { scripts?: Record<string, unknown> }).scripts
        if (typeof scripts?.[script] !== 'string') {
          throw new Error('package.json does not declare script ' + script)
        }
        selected = verificationCommandFor('node', script, await choosePackageManager(canonicalCwd))
      } else {
        const isRustLocked = ecosystem === 'rust' && await containsSafeFile(canonicalCwd, canonicalRoot, 'Cargo.lock')
        selected = verificationCommandFor(ecosystem, script, 'npm', isRustLocked)
      }
      const result = await runCommand(ctx, {
        command: selected.command, args: selected.args, cwd: canonicalCwd,
        signal: exec.signal, timeoutMs, maxOutputBytes: MAX_OUTPUT, hostOnly: true,
      })
      const exitCode = result.exitCode ?? -1
      const combined = result.stdout + '\n' + result.stderr
      return {
        script: args.script, ecosystem,
        command: [selected.command, ...selected.args].join(' '),
        exitCode,
        passed: exitCode === 0 && !result.timedOut && !result.lossy,
        timedOut: result.timedOut,
        output: redactKnownTokens(combined.slice(0, MAX_OUTPUT), settings),
        truncated: result.lossy || combined.length > MAX_OUTPUT,
      }
    },
  })
}
