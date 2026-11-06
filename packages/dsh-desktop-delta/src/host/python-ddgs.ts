/**
 * Run the PyPI `ddgs` package in a local Python subprocess.
 * No MCP server, browser HTML parsing, API key, shell or background daemon.
 * Both native Harness web_search and Delta /search reach this adapter.
 */
import { spawn } from 'node:child_process'

export interface PythonSearchRow {
  title: string
  url: string
  content: string
}

const PYTHON_DDGS_PROGRAM = `
import json
import sys

try:
    from ddgs import DDGS
except ModuleNotFoundError:
    print("DDGS_NOT_INSTALLED", file=sys.stderr)
    sys.exit(3)

try:
    request = json.loads(sys.stdin.read())
    query = request["query"]
    limit = min(20, max(1, int(request.get("max_results", 5))))
    # Prefer DuckDuckGo, but keep ddgs' other free engines as a fallback.
    try:
        rows = DDGS(timeout=10).text(query, max_results=limit, backend="duckduckgo")
    except Exception:
        rows = DDGS(timeout=10).text(query, max_results=limit, backend="auto")
    if not rows:
        rows = DDGS(timeout=10).text(query, max_results=limit, backend="auto")
    print(json.dumps([
        {"title": str(row.get("title") or ""),
         "url": str(row.get("href") or row.get("url") or ""),
         "content": str(row.get("body") or row.get("description") or "")}
        for row in rows[:limit] if isinstance(row, dict)
    ], ensure_ascii=False))
except Exception as error:
    print("DDGS_SEARCH_FAILED: " + str(error)[:240], file=sys.stderr)
    sys.exit(2)
`

class PythonUnavailable extends Error {}

export type PythonExecutor = (
  command: string, args: string[], payload: string, signal?: AbortSignal
) => Promise<unknown>

const MAX_OUTPUT_BYTES = 256 * 1024
const MAX_ERROR_BYTES = 4096
const HARD_TIMEOUT_MS = 30_000

/** Execute fixed Python code. The untrusted query enters via stdin, never a shell. */
const launchPython: PythonExecutor = (command, args, payload, signal) => new Promise((resolve, reject) => {
  signal?.throwIfAborted()
  const child = spawn(command, args, {
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let isFinished = false
  const finish = (error?: Error, data?: unknown) => {
    if (isFinished) return
    isFinished = true
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
    if (error) reject(error)
    else resolve(data)
  }
  const onAbort = () => {
    child.kill()
    finish(new DOMException('Search aborted', 'AbortError'))
  }
  const timeout = setTimeout(() => {
    child.kill()
    finish(new Error('Python ddgs search timed out (30s)'))
  }, HARD_TIMEOUT_MS)
  timeout.unref()
  signal?.addEventListener('abort', onAbort, { once: true })
  child.on('error', (error: NodeJS.ErrnoException) => {
    finish(error.code === 'ENOENT'
      ? new PythonUnavailable(`Python executable not found: ${command}`)
      : error)
  })
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf8')
    if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
      child.kill()
      finish(new Error('Python ddgs result exceeded the output limit'))
    }
  })
  child.stderr.on('data', (chunk: Buffer) => {
    if (Buffer.byteLength(stderr) < MAX_ERROR_BYTES) stderr += chunk.toString('utf8')
  })
  child.on('close', (code) => {
    if (isFinished) return
    if (code === 3 || stderr.includes('DDGS_NOT_INSTALLED')) {
      return finish(new PythonUnavailable('The Python ddgs package is not installed'))
    }
    if (code !== 0) return finish(new Error(`Python ddgs search failed: ${stderr.trim().slice(0, 300) || 'exit ' + code}`))
    try { finish(undefined, JSON.parse(stdout)) }
    catch { finish(new Error('Python ddgs returned invalid JSON')) }
  })
  child.stdin.on('error', () => { /* Process errors are handled by close/error. */ })
  child.stdin.end(payload)
})

const pythonCandidates = (): Array<{ command: string; args: string[] }> => {
  const configured = process.env.DSH_DDGS_PYTHON?.trim()
  // Override accepts one executable path/name, not arbitrary shell arguments.
  if (configured) return [{ command: configured, args: ['-c', PYTHON_DDGS_PROGRAM] }]
  const names = process.platform === 'win32'
    ? [{ command: 'py', args: ['-3', '-c', PYTHON_DDGS_PROGRAM] }, { command: 'python', args: ['-c', PYTHON_DDGS_PROGRAM] }]
    : [{ command: 'python3', args: ['-c', PYTHON_DDGS_PROGRAM] }, { command: 'python', args: ['-c', PYTHON_DDGS_PROGRAM] }]
  return names
}

/** Prefer Python ddgs; fail visibly if the runtime/package is unavailable. */
export async function searchPythonDdgs(
  query: string, signal?: AbortSignal, execute: PythonExecutor = launchPython, maxResults = 5
): Promise<PythonSearchRow[]> {
  signal?.throwIfAborted()
  const cleanQuery = query.trim().slice(0, 500)
  if (!cleanQuery) throw new Error('search query required')
  const limit = Math.max(1, Math.min(20, Math.trunc(maxResults) || 5))
  const payload = JSON.stringify({ query: cleanQuery, max_results: limit })
  const failures: string[] = []
  for (const { command, args } of pythonCandidates()) {
    try {
      const output: unknown = await execute(command, args, payload, signal)
      if (!Array.isArray(output)) throw new Error('Python ddgs returned a non-array response')
      return output.slice(0, limit).filter((row): row is Record<string, unknown> =>
        !!row && typeof row === 'object' && !Array.isArray(row)
      ).map(row => ({
        title: String(row.title || ''),
        url: String(row.url || ''),
        content: String(row.content || ''),
      }))
    } catch (error) {
      signal?.throwIfAborted()
      if (!(error instanceof PythonUnavailable)) throw error
      failures.push(error.message)
    }
  }
  throw new Error(
    `Python ddgs is unavailable (${failures.join('; ')}). Install Python 3.10+ and run "python -m pip install ddgs==9.16.1"; on Windows, use "py -3 -m pip install ddgs==9.16.1". Set DSH_DDGS_PYTHON if Harness uses another Python environment.`
  )
}


/** Health probe never submits a user query; the result is cached briefly. */
const PROBE_PROGRAM = 'import json\nfrom ddgs import DDGS\nprint(json.dumps({"ok": true}))'.replace('true', 'True')
let cachedProbe: { until: number; ok: boolean } | undefined

export async function checkPythonDdgs(
  signal?: AbortSignal, execute: PythonExecutor = launchPython
): Promise<boolean> {
  signal?.throwIfAborted()
  if (execute === launchPython && cachedProbe && cachedProbe.until > Date.now()) return cachedProbe.ok
  let isReady = false
  for (const { command, args } of pythonCandidates()) {
    const probeArgs = [...args]
    probeArgs[probeArgs.length - 1] = PROBE_PROGRAM
    try {
      const result = await execute(command, probeArgs, '', signal)
      isReady = !!result && typeof result === 'object' && (result as { ok?: unknown }).ok === true
      if (isReady) break
    } catch (error) {
      signal?.throwIfAborted()
      if (!(error instanceof PythonUnavailable)) break
    }
  }
  if (execute === launchPython) cachedProbe = { until: Date.now() + 60_000, ok: isReady }
  return isReady
}

/**
 * Passive dependency check used only for guidance in Delta settings.
 * Never downloads, installs, or changes a Python environment.
 */
export interface DdgsDependencyStatus {
  state: 'ready' | 'missing-python' | 'missing-ddgs'
  installCommand?: string
}

const DEPENDENCY_PROBE = 'import json,sys,importlib.util; print(json.dumps({"supported": sys.version_info >= (3,10), "installed": importlib.util.find_spec("ddgs") is not None}))'

export async function detectDdgsDependencies(): Promise<DdgsDependencyStatus> {
  let installCommand: string | undefined
  for (const { command, args } of pythonCandidates()) {
    try {
      const probeArgs = [...args]
      probeArgs[probeArgs.length - 1] = DEPENDENCY_PROBE
      const result = await launchPython(command, probeArgs, '', AbortSignal.timeout(5_000))
      if (!result || typeof result !== 'object') continue
      const { supported, installed } = result as { supported?: boolean; installed?: boolean }
      if (!supported) continue
      if (installed) return { state: 'ready' }
      const quotedCommand = /\s/.test(command) ? JSON.stringify(command) : command
      installCommand ||= [quotedCommand, ...args.slice(0, -2), '-m', 'pip', 'install', 'ddgs==9.16.1'].join(' ')
    } catch {
      // Missing, unsupported, or non-responsive interpreter: try next candidate.
    }
  }
  return installCommand
    ? { state: 'missing-ddgs', installCommand }
    : { state: 'missing-python' }
}
