import { access } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, isSubprocessAvailable, runCommand, resolveInside } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import { readTextSafe, resolveRoot } from '../runtime.js'

const SCRIPTS = new Set(['test', 'typecheck', 'build', 'lint', 'check'])
const MAX_OUTPUT = 32 * 1024

export function redactKnownTokens(text: string, settings: Settings): string {
  let value = text
  for (const account of settings.githubAccounts) {
    const token = process.env[account.tokenEnv]
    if (token && token.length >= 8) value = value.split(token).join('[REDACTED]')
  }
  return value
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
    description: 'Run an existing package.json test, typecheck, build, lint, or check script through the host subprocess. Disabled unless execution.allowCommands=true. Returns bounded evidence without claiming success on failure.',
    parameters: {
      script: { type: 'string', required: true, enum: ['test', 'typecheck', 'build', 'lint', 'check'] },
      cwd: { type: 'string', description: 'Optional relative workspace subdirectory.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      script: { type: 'string', required: true },
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
      if (!SCRIPTS.has(args.script)) throw new Error('script is not allowlisted')
      const root = await resolveRoot(ctx, exec, settings)
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root
      const raw = await readTextSafe(ctx, exec, cwd, 'package.json')
      const pkg: unknown = JSON.parse(raw)
      if (!pkg || typeof pkg !== 'object') throw new Error('invalid package.json')
      const scripts = (pkg as { scripts?: Record<string, unknown> }).scripts
      if (typeof scripts?.[args.script] !== 'string') throw new Error('package.json does not declare script ' + args.script)
      const manager = await choosePackageManager(cwd)
      const argv = manager === 'npm' ? ['run', args.script] : ['run', args.script]
      const result = await runCommand(ctx, {
        command: manager, args: argv, cwd, signal: exec.signal,
        timeoutMs: 120_000, maxOutputBytes: MAX_OUTPUT,
      })
      const exitCode = result.exitCode ?? -1
      return {
        script: args.script,
        command: manager + ' run ' + args.script,
        exitCode,
        passed: exitCode === 0 && !result.timedOut && !result.lossy,
        timedOut: result.timedOut,
        output: redactKnownTokens((result.stdout + '\n' + result.stderr).slice(0, MAX_OUTPUT), settings),
        truncated: result.lossy,
      }
    },
  })
}
