import { sep } from 'node:path'

/**
 * Containment predicate for test-only Host FS objects. It models the
 * segment-boundary decision without resolving real local filesystem paths.
 *
 * @typedef {'key' | 'path' | 'targetKey' | 'p'} HostTargetField
 *
 * @param {Record<string, unknown>} parent
 * @param {Record<string, unknown>} target
 * @param {HostTargetField} field
 * @param {string} [separator] Explicit '/' for POSIX-only remote Host mocks.
 * @returns {boolean}
 */
export function mockHostPathContains(parent, target, field, separator = sep) {
  const root = parent?.[field]
  const child = target?.[field]
  if (typeof root !== 'string' || typeof child !== 'string' || !root || !separator) {
    throw new TypeError('Host FS mock requires typed, non-empty target paths and separator')
  }
  return child === root || child.startsWith(root + separator)
}

/**
 * Creates a minimal Host FS context, preserving the passed object's identity.
 * Other Host capabilities must be explicitly supplied by individual tests.
 *
 * @template T
 * @param {T} fs
 * @param {Record<string, unknown>} [additional]
 * @returns {{ get(name: string): T | undefined } & Record<string, unknown>}
 */
export function mockHostFsContext(fs, additional = {}) {
  return {
    ...additional,
    get(name) { return name === 'fs' ? fs : undefined },
  }
}
