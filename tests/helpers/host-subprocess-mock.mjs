/**
 * Contract-level DSH Host subprocess fixture, independent of local Node IO.
 * Tests may replace the Host FS or customize spawn, but the completion and
 * collected-output structure is shared and never silently falls back.
 *
 * @typedef {object} HostCommandResultOptions
 * @property {number | null} [exitCode]
 * @property {string | null} [signal]
 * @property {string} [stdout]
 * @property {string} [stderr]
 * @property {boolean} [stdoutLossy]
 * @property {boolean} [stderrLossy]
 */

/** @param {HostCommandResultOptions} [options] */
export function mockHostCommandResult({
  exitCode = 0,
  signal = null,
  stdout = '',
  stderr = '',
  stdoutLossy = false,
  stderrLossy = false,
} = {}) {
  return {
    done: Promise.resolve({ exitCode, signal }),
    collected: {
      stdout: { readFrom: () => ({ text: stdout, lossy: stdoutLossy }) },
      stderr: { readFrom: () => ({ text: stderr, lossy: stderrLossy }) },
    },
  }
}

/**
 * Minimal subprocess-only Host fixture. Records attempted spawns even when
 * the Host denies an operation; no Node fallback is ever provided.
 *
 * @param {HostCommandResultOptions & { denial?: string }} [options]
 */
export function mockHostSubprocess({ denial, ...result } = {}) {
  const calls = []
  const ctx = {
    get: () => undefined,
    subprocess: {
      spawn(spec) {
        calls.push(spec)
        if (denial) throw new Error(denial)
        return mockHostCommandResult(result)
      },
    },
  }
  return { ctx, calls }
}
