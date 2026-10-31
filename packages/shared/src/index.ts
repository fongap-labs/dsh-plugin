/**
 * Shared aggregate export: path resolution and sandbox validation, plus the
 * re-exported tool and subprocess modules.
 */

import { isAbsolute, relative, resolve, sep } from 'node:path'

export * from './tool.js'
export * from './subprocess.js'

/** Thrown when a candidate path resolves outside its sandbox root. */
export class SandboxViolationError extends Error {
  /** Absolute sandbox root the candidate was resolved against. */
  readonly root: string | undefined
  /** Absolute path the candidate resolved to. */
  readonly target: string | undefined

  constructor(message: string, options: { root?: string; target?: string } = {}) {
    super(message)
    this.name = 'SandboxViolationError'
    this.root = options.root
    this.target = options.target
  }
}

/**
 * Normalize a path by trimming trailing separators, so paths compare across
 * platforms.
 */
export function normalizePath(input: string): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new TypeError('normalizePath: path must be a non-empty string')
  }
  const trimmed = input.replace(/[\\/]+$/, '')
  return trimmed === '' ? input : trimmed
}

/**
 * Report whether `target` lies inside `root` (including `root` itself).
 * Symbolic links are not resolved.
 */
export function isPathInside(root: string, target: string): boolean {
  if (typeof root !== 'string' || typeof target !== 'string') return false
  const absoluteRoot = resolve(root)
  const absoluteTarget = resolve(absoluteRoot, target)
  const rel = relative(absoluteRoot, absoluteTarget)
  if (rel === '') return true
  if (isAbsolute(rel)) return false
  return !rel.startsWith(`..${sep}`) && rel !== '..'
}

/**
 * Resolve a candidate path to an absolute path inside `root`.
 * @throws {SandboxViolationError} when the candidate escapes the root.
 */
export function resolveInside(root: string, candidate: string): string {
  if (typeof root !== 'string' || root.trim() === '') {
    throw new TypeError('resolveInside: root must be a non-empty string')
  }
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    throw new TypeError('resolveInside: candidate must be a non-empty string')
  }
  const absoluteRoot = resolve(root)
  const absoluteTarget = resolve(absoluteRoot, candidate)
  if (!isPathInside(absoluteRoot, absoluteTarget)) {
    throw new SandboxViolationError(
      `path escapes the sandbox root: ${JSON.stringify(candidate)} is outside ${JSON.stringify(absoluteRoot)}`,
      { root: absoluteRoot, target: absoluteTarget },
    )
  }
  return absoluteTarget
}

/**
 * Assert that a candidate path lies inside `root`.
 * @throws {SandboxViolationError} when the candidate escapes the root.
 */
export function assertInsideSandbox(root: string, candidate: string): string {
  const resolved = resolveInside(root, candidate)
  return resolved
}

/**
 * Resolve a directory path inside `root`, returning `undefined` instead of
 * throwing when the candidate escapes the sandbox.
 */
export function tryResolveInside(root: string, candidate: string): string | undefined {
  try {
    return resolveInside(root, candidate)
  } catch {
    return undefined
  }
}
