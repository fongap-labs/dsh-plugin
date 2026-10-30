/**
 * ctx.subprocess 安全调用与降级。
 *
 * DSH 宿主的 ctx.subprocess.spawn 返回带 bounded 输出、spill 文件与作业对象托管的
 * 句柄；插件在缺少该服务的 profile 中运行时，本模块退回到 node:child_process 的
 * 等价实现，两者统一返回 stdout / stderr / exitCode / signal / timedOut。
 */

import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;

export class SubprocessError extends Error {
  constructor(message, { exitCode, signal, timedOut } = {}) {
    super(message);
    this.name = "SubprocessError";
    this.exitCode = exitCode;
    this.signal = signal;
    this.timedOut = Boolean(timedOut);
  }
}

/**
 * 当前 ctx 是否提供 DSH subprocess 服务。
 */
export function isSubprocessAvailable(ctx) {
  return Boolean(ctx?.subprocess) && typeof ctx.subprocess.spawn === "function";
}

function readCollected(reader) {
  if (!reader || typeof reader.readFrom !== "function") return { text: "", lossy: false };
  const out = reader.readFrom(0);
  return { text: out?.text ?? "", lossy: Boolean(out?.lossy) };
}

/**
 * 通过 ctx.subprocess.spawn 执行命令。spec 形状与 DSH bash executor 一致。
 */
async function runWithHost(ctx, options) {
  const spec = {
    argv: [options.command, ...(options.args ?? [])],
    cwd: options.cwd,
    stdio: {
      stdin: "ignore",
      stdout: { maxBytes: options.maxOutputBytes, spill: { maxBytes: options.maxOutputBytes } },
      stderr: { maxBytes: options.maxOutputBytes, spill: { maxBytes: options.maxOutputBytes } },
    },
    graceMs: options.graceMs,
    signal: options.signal,
    env: options.env,
  };
  const handle = ctx.subprocess.spawn(spec);
  const [outcome] = await Promise.all([
    handle.done,
    Promise.resolve().then(async () => {
      const stdout = readCollected(handle.collected?.stdout);
      const stderr = readCollected(handle.collected?.stderr);
      return { stdout, stderr };
    }),
  ]);
  const collected = {
    stdout: readCollected(handle.collected?.stdout),
    stderr: readCollected(handle.collected?.stderr),
  };
  return {
    stdout: collected.stdout.text,
    stderr: collected.stderr.text,
    exitCode: outcome?.exitCode ?? null,
    signal: outcome?.signal ?? null,
    timedOut: false,
    lossy: collected.stdout.lossy || collected.stderr.lossy,
    source: "host",
  };
}

/**
 * 通过 node:child_process 执行命令，作为缺少 DSH 服务时的降级路径。
 */
function runWithNode(options) {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args ?? [], {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);
    timer.unref?.();

    child.stdout?.on("data", (chunk) => {
      if (stdoutBytes >= options.maxOutputBytes) return;
      stdoutBytes += chunk.length;
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      if (stderrBytes >= options.maxOutputBytes) return;
      stderrBytes += chunk.length;
      stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new SubprocessError(`failed to spawn ${options.command}: ${error.message}`));
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal: signal ?? null,
        timedOut,
        lossy: stdoutBytes >= options.maxOutputBytes || stderrBytes >= options.maxOutputBytes,
        source: "node",
      });
    });
  });
}

/**
 * 执行一条命令。优先走 DSH subprocess 服务，缺失时降级到 node:child_process。
 *
 * @param {object} ctx DSH 上下文，可为 undefined。
 * @param {object} options
 * @param {string} options.command 可执行文件名或绝对路径。
 * @param {string[]} [options.args] 参数数组。
 * @param {string} [options.cwd] 工作目录。
 * @param {number} [options.timeoutMs] 超时时间，默认 120000。
 * @param {number} [options.maxOutputBytes] 单流最大字节数，默认 65536。
 * @param {Record<string,string>} [options.env] 追加的环境变量。
 * @param {AbortSignal} [options.signal] 取消信号。
 * @returns {Promise<{stdout:string, stderr:string, exitCode:number|null, signal:string|null, timedOut:boolean, lossy:boolean, source:"host"|"node"}>}
 */
export async function runCommand(ctx, options) {
  if (!options || typeof options.command !== "string" || options.command.trim() === "") {
    throw new SubprocessError("runCommand: command is required");
  }
  const normalized = {
    command: options.command,
    args: Array.isArray(options.args) ? options.args : [],
    cwd: options.cwd,
    timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS,
    maxOutputBytes: Number.isFinite(options.maxOutputBytes) ? options.maxOutputBytes : DEFAULT_MAX_OUTPUT_BYTES,
    graceMs: Number.isFinite(options.graceMs) ? options.graceMs : 5_000,
    env: options.env,
    signal: options.signal,
  };
  if (isSubprocessAvailable(ctx)) {
    try {
      return await runWithHost(ctx, normalized);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      ctx?.logger?.warn?.(`runCommand: host subprocess failed, falling back to node:child_process (${error?.message ?? error})`);
    }
  }
  return runWithNode(normalized);
}

/**
 * 执行一条命令并要求退出码为 0，否则抛出 SubprocessError。
 */
export async function runCommandOrThrow(ctx, options) {
  const result = await runCommand(ctx, options);
  if (result.timedOut) {
    throw new SubprocessError(`command timed out: ${options.command}`, {
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: true,
    });
  }
  if (result.exitCode !== 0) {
    throw new SubprocessError(`command failed with exit code ${result.exitCode}: ${options.command}`, {
      exitCode: result.exitCode,
      signal: result.signal,
    });
  }
  return result;
}
