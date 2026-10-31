/**
 * Safe `ctx.subprocess` invocation with a local fallback.
 *
 * The DSH host's `ctx.subprocess.spawn` returns a handle with bounded output,
 * spill files and job ownership. Where that service is absent, this module
 * falls back to an equivalent `node:child_process` implementation; both paths
 * return the same `stdout` / `stderr` / `exitCode` / `signal` / `timedOut`
 * shape.
 */

import { spawn } from 'node:child_process'

import type { LoggerLike } from './tool.js'

const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024
const DEFAULT_GRACE_MS = 5_000

/** Raised when a command cannot be spawned, fails, or times out. */
export class SubprocessError extends Error {
  /** Exit code reported by the failure, when one exists. */
  readonly exitCode: number | null | undefined
  /** Termination signal reported by the failure, when one exists. */
  readonly signal: string | null | undefined
  /** Whether the failure was caused by the timeout budget. */
  readonly timedOut: boolean

  constructor(
    message: string,
    options: { exitCode?: number | null; signal?: string | null; timedOut?: boolean } = {},
  ) {
    super(message)
    this.name = 'SubprocessError'
    this.exitCode = options.exitCode
    this.signal = options.signal
    this.timedOut = Boolean(options.timedOut)
  }
}

/** Options accepted by {@link runCommand}. */
export interface RunCommandOptions {
  /** Executable name or absolute path. */
  command: string
  /** Argument vector. */
  args?: string[] | undefined
  /** Working directory. */
  cwd?: string | undefined
  /** Timeout budget in milliseconds; defaults to 120000. */
  timeoutMs?: number | undefined
  /** Per-stream byte cap; defaults to 65536. */
  maxOutputBytes?: number | undefined
  /** Host-side grace period before a forced kill. */
  graceMs?: number | undefined
  /** Extra environment variables layered over the parent environment. */
  env?: Record<string, string> | undefined
  /** Cancellation signal. */
  signal?: AbortSignal | undefined
}

/** Normalized options with every default resolved. */
interface NormalizedOptions {
  command: string
  args: string[]
  cwd: string | undefined
  timeoutMs: number
  maxOutputBytes: number
  graceMs: number
  env: Record<string, string> | undefined
  signal: AbortSignal | undefined
}

/** Unified result of a completed command. */
export interface RunCommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: string | null
  timedOut: boolean
  lossy: boolean
  source: 'host' | 'node'
}

/** Reader over one collected stream of a host subprocess handle. */
interface HostCollectedReader {
  readFrom(offset: number): { text?: string | undefined; lossy?: boolean | undefined } | undefined
}

/** Handle returned by the host subprocess service. */
interface HostSpawnHandle {
  done: Promise<{ exitCode?: number | null | undefined; signal?: string | null | undefined } | undefined>
  collected?: { stdout?: HostCollectedReader | undefined; stderr?: HostCollectedReader | undefined } | undefined
}

/** Spawn spec consumed by the host subprocess service. */
interface HostSpawnSpec {
  argv: string[]
  cwd: string | undefined
  stdio: {
    stdin: 'ignore'
    stdout: { maxBytes: number; spill: { maxBytes: number } }
    stderr: { maxBytes: number; spill: { maxBytes: number } }
  }
  graceMs: number
  signal: AbortSignal | undefined
  env: Record<string, string> | undefined
}

/** The host subprocess service, as far as this module relies on it. */
export interface HostSubprocessService {
  spawn(spec: HostSpawnSpec): HostSpawnHandle
}

/** Context surface {@link runCommand} consumes. */
export interface SubprocessContext {
  subprocess?: HostSubprocessService | null
  logger?: LoggerLike | null
}

/**
 * Report whether the given context provides the DSH subprocess service.
 */
export function isSubprocessAvailable(ctx: SubprocessContext | null | undefined): boolean {
  return Boolean(ctx?.subprocess) && typeof ctx?.subprocess?.spawn === 'function'
}

function readCollected(reader: HostCollectedReader | undefined): { text: string; lossy: boolean } {
  if (!reader || typeof reader.readFrom !== 'function') return { text: '', lossy: false }
  const out = reader.readFrom(0)
  return { text: out?.text ?? '', lossy: Boolean(out?.lossy) }
}

/**
 * Execute a command through `ctx.subprocess.spawn`. The spec shape matches the
 * DSH bash executor.
 */
async function runWithHost(ctx: SubprocessContext, options: NormalizedOptions): Promise<RunCommandResult> {
  const spec: HostSpawnSpec = {
    argv: [options.command, ...(options.args ?? [])],
    cwd: options.cwd,
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: options.maxOutputBytes, spill: { maxBytes: options.maxOutputBytes } },
      stderr: { maxBytes: options.maxOutputBytes, spill: { maxBytes: options.maxOutputBytes } },
    },
    graceMs: options.graceMs,
    signal: options.signal,
    env: options.env,
  }
  const handle = ctx.subprocess!.spawn(spec)
  const [outcome] = await Promise.all([
    handle.done,
    Promise.resolve().then(() => ({
      stdout: readCollected(handle.collected?.stdout),
      stderr: readCollected(handle.collected?.stderr),
    })),
  ])
  const collected = {
    stdout: readCollected(handle.collected?.stdout),
    stderr: readCollected(handle.collected?.stderr),
  }
  return {
    stdout: collected.stdout.text,
    stderr: collected.stderr.text,
    exitCode: outcome?.exitCode ?? null,
    signal: outcome?.signal ?? null,
    timedOut: false,
    lossy: collected.stdout.lossy || collected.stderr.lossy,
    source: 'host',
  }
}

/**
 * Execute a command through `node:child_process`, used when the DSH service is
 * unavailable.
 */
function runWithNode(options: NormalizedOptions): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args ?? [], {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let isTimedOut = false
    let isSettled = false

    const timer = setTimeout(() => {
      isTimedOut = true
      child.kill()
    }, options.timeoutMs)
    timer.unref()

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdoutBytes >= options.maxOutputBytes) return
      stdoutBytes += chunk.length
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderrBytes >= options.maxOutputBytes) return
      stderrBytes += chunk.length
      stderr += chunk.toString('utf8')
    })
    child.once('error', (error: Error) => {
      if (isSettled) return
      isSettled = true
      clearTimeout(timer)
      reject(new SubprocessError(`failed to spawn ${options.command}: ${error.message}`))
    })
    child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (isSettled) return
      isSettled = true
      clearTimeout(timer)
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal: signal ?? null,
        timedOut: isTimedOut,
        lossy: stdoutBytes >= options.maxOutputBytes || stderrBytes >= options.maxOutputBytes,
        source: 'node',
      })
    })
  })
}

/**
 * Execute one command. The DSH subprocess service is preferred; a missing or
 * failing service degrades to `node:child_process`.
 */
export async function runCommand(
  ctx: SubprocessContext | null | undefined,
  options: RunCommandOptions,
): Promise<RunCommandResult> {
  if (!options || typeof options.command !== 'string' || options.command.trim() === '') {
    throw new SubprocessError('runCommand: command is required')
  }
  const normalized: NormalizedOptions = {
    command: options.command,
    args: Array.isArray(options.args) ? options.args : [],
    cwd: options.cwd,
    timeoutMs: Number.isFinite(options.timeoutMs) ? (options.timeoutMs as number) : DEFAULT_TIMEOUT_MS,
    maxOutputBytes: Number.isFinite(options.maxOutputBytes)
      ? (options.maxOutputBytes as number)
      : DEFAULT_MAX_OUTPUT_BYTES,
    graceMs: Number.isFinite(options.graceMs) ? (options.graceMs as number) : DEFAULT_GRACE_MS,
    env: options.env,
    signal: options.signal,
  }
  if (isSubprocessAvailable(ctx)) {
    try {
      return await runWithHost(ctx as SubprocessContext, normalized)
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') throw error
      const message = (error as { message?: string } | null)?.message ?? String(error)
      ctx?.logger?.warn?.(`runCommand: host subprocess failed, falling back to node:child_process (${message})`)
    }
  }
  return runWithNode(normalized)
}

/**
 * Execute one command and require exit code 0.
 * @throws {SubprocessError} when the command times out or exits non-zero.
 */
export async function runCommandOrThrow(
  ctx: SubprocessContext | null | undefined,
  options: RunCommandOptions,
): Promise<RunCommandResult> {
  const result = await runCommand(ctx, options)
  if (result.timedOut) {
    throw new SubprocessError(`command timed out: ${options.command}`, {
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: true,
    })
  }
  if (result.exitCode !== 0) {
    throw new SubprocessError(`command failed with exit code ${result.exitCode}: ${options.command}`, {
      exitCode: result.exitCode,
      signal: result.signal,
    })
  }
  return result
}
