import { access, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { defineTool, isSubprocessAvailable, runCommand, resolveInside, isPathInside } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import { readTextSafe, resolveRoot } from '../runtime.js'
import { chooseVerificationCommand, type VerificationProject, type VerificationCommand, type VerificationScript } from './verify-presets.js'

const SCRIPTS = new Set(['test', 'typecheck', 'build', 'lint', 'check'])
const PROJECTS = new Set(['auto', 'node', 'rust', 'python', 'go'])
const MAX_OUTPUT = 32 * 1024

export function redactKnownTokens(text: string, settings: Settings): string {
  let value = text
  for (const account of settings.githubAccounts) {
    const token = account.tokenEnv ? process.env[account.tokenEnv] : undefined
    if (token && token.length >= 8) value = value.split(token).join('[REDACTED]')
  }
  return value.replace(/\b(?:github_pat_[a-zA-Z0-9_]{12,}|gh[pousr]_[a-zA-Z0-9]{20,})\b/g, '[REDACTED]')
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

export function createVerifyTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: 'code_verify',
    description: 'Run an allowlisted test/typecheck/build/lint/check for Node, Rust, Python or Go in the Host subprocess. Disabled unless execution.allowCommands=true; returns bounded evidence.',
    parameters: {
      script: { type: 'string', required: true, enum: ['test', 'typecheck', 'build', 'lint', 'check'] },
      cwd: { type: 'string', description: 'Optional relative workspace subdirectory.' },
      project: { type: 'string', enum: ['auto', 'node', 'rust', 'python', 'go'], description: 'Project type; auto requires exactly one manifest type.' },
      timeoutMs: { type: 'integer', description: 'Host subprocess timeout in ms, 10000..600000; default 120000.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      script: { type: 'string', required: true },
      project: { type: 'string', required: true },
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
      const prepared = await prepareVerify(ctx, settings, exec, args)
      return runPreparedVerify(ctx, settings, exec, prepared)
    },
  })
}

export interface PreparedVerification {
  script: VerificationScript
  plan: VerificationCommand
  cwd: string
  timeoutMs: number
}

/** Prepare and validate a check without executing a command. */
export async function prepareVerify(
  ctx: Context, settings: Settings, exec: ToolRunContext,
  args: { script: VerificationScript; cwd?: string; project?: VerificationProject; timeoutMs?: number },
): Promise<PreparedVerification> {
      if (!settings.allowCommands) throw new Error('script execution disabled; set execution.allowCommands=true')
      if (!isSubprocessAvailable(ctx)) throw new Error('host subprocess service is required for script execution')
      if (!SCRIPTS.has(args.script)) throw new Error('script is not allowlisted')
      const timeoutMs = args.timeoutMs ?? 120_000
      if (!Number.isInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 600_000) {
        throw new Error('timeoutMs must be between 10000 and 600000')
      }
      const root = await resolveRoot(ctx, exec, settings)
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root
      const canonicalRoot = await realpath(root)
      const canonicalCwd = await realpath(cwd)
      if (!isPathInside(canonicalRoot, canonicalCwd)) throw new Error('script directory escapes the workspace')
      const project = args.project ?? 'auto'
      if (typeof project !== 'string' || !PROJECTS.has(project)) throw new Error('project type is not allowlisted')
      const manifests = [
        ['node', 'package.json'], ['rust', 'Cargo.toml'],
        ['python', 'pyproject.toml'], ['python', 'requirements.txt'],
        ['go', 'go.mod'],
      ] as const
      const found = new Set<'node' | 'rust' | 'python' | 'go'>()
      for (const [language, name] of manifests) {
        try {
          const manifest = await realpath(join(canonicalCwd, name))
          if (!isPathInside(canonicalRoot, manifest)) throw new Error(name + ' escapes the workspace')
          await access(manifest)
          found.add(language)
        } catch (error) {
          if (error instanceof Error && error.message.includes('escapes the workspace')) throw error
        }
      }
      const nodeScripts: string[] = []
      if (found.has('node')) {
        const raw = await readTextSafe(ctx, exec, canonicalCwd, 'package.json')
        if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error('package.json is too large')
        const pkg: unknown = JSON.parse(raw)
        if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('invalid package.json')
        const scripts = (pkg as { scripts?: Record<string, unknown> }).scripts
        for (const script of SCRIPTS) {
          if (typeof scripts?.[script] === 'string') nodeScripts.push(script)
        }
      }
      const manager = found.has('node') ? await choosePackageManager(canonicalCwd) : 'npm'
      const hasRustLock = found.has('rust') && await realpath(join(canonicalCwd, 'Cargo.lock'))
        .then(path => isPathInside(canonicalRoot, path), () => false)
      const plan = chooseVerificationCommand(
        args.script, project as VerificationProject, [...found], manager, nodeScripts, hasRustLock,
      )
      return { script: args.script, plan, cwd: canonicalCwd, timeoutMs }
}

export async function runPreparedVerify(
  ctx: Context, settings: Settings, exec: ToolRunContext, prepared: PreparedVerification,
) {
  const { plan, cwd: canonicalCwd, timeoutMs } = prepared
      const result = await runCommand(ctx, {
        command: plan.command, args: plan.args, cwd: canonicalCwd, signal: exec.signal,
        timeoutMs, maxOutputBytes: MAX_OUTPUT, hostOnly: true,
      })
      const exitCode = result.exitCode ?? -1
      const combined = result.stdout + '\n' + result.stderr
      return {
        script: prepared.script,
        project: plan.project,
        command: [plan.command, ...plan.args].join(' '),
        exitCode,
        passed: exitCode === 0 && !result.timedOut && !result.lossy,
        timedOut: result.timedOut,
        output: redactKnownTokens(combined.slice(0, MAX_OUTPUT), settings),
        truncated: result.lossy || combined.length > MAX_OUTPUT,
      }
 }
