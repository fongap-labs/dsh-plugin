/**
 * Offline compatibility checks for pre-release DSH tool peers.
 *
 * A published plugin advertises a bounded npm range; the build toolchain
 * remains pinned separately for reproducible CI. This helper deliberately
 * accepts only the narrow comparator form used by DSH plugins.
 */
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

export function parseVersion(value) {
  const match = VERSION.exec(value)
  if (!match) throw new Error('Invalid semantic version: ' + value)
  return { numeric: match.slice(1, 4).map(Number), prerelease: match[4]?.split('.') ?? [] }
}

function comparePrerelease(a, b) {
  if (!a.length || !b.length) return a.length === b.length ? 0 : a.length ? -1 : 1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return -1
    if (i >= b.length) return 1
    const left = a[i], right = b[i]
    if (left === right) continue
    const ln = /^(0|[1-9]\d*)$/.test(left)
    const rn = /^(0|[1-9]\d*)$/.test(right)
    if (ln && rn) return Number(left) < Number(right) ? -1 : 1
    if (ln !== rn) return ln ? -1 : 1
    return left < right ? -1 : 1
  }
  return 0
}

export function compareVersions(a, b) {
  const left = parseVersion(a), right = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (left.numeric[i] !== right.numeric[i]) return left.numeric[i] < right.numeric[i] ? -1 : 1
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}

export function parseBoundedPeerRange(range) {
  if (typeof range !== 'string') throw new Error('DSH tools peer range is required')
  const match = /^>=([^\s]+) <([^\s]+)$/.exec(range.trim())
  if (!match) throw new Error('DSH tools peer must declare an explicit lower and upper bound')
  const min = parseVersion(match[1]), max = parseVersion(match[2])
  if (min.numeric[0] !== max.numeric[0] ||
      min.numeric[1] !== max.numeric[1] ||
      max.numeric[2] !== min.numeric[2] + 1 ||
      max.prerelease.join('.') !== '0' ||
      compareVersions(match[1], match[2]) >= 0) {
    throw new Error('DSH tools peer range must be limited to one patch-release line')
  }
  return { lower: match[1], upper: match[2] }
}

export function isVersionCompatible(range, hostVersion) {
  const { lower, upper } = parseBoundedPeerRange(range)
  return compareVersions(hostVersion, lower) >= 0 && compareVersions(hostVersion, upper) < 0
}
