import { isSafeSessionMapKey } from '../host-state.js'
import type { DeltaHostState } from '../host-state.js'
import type { HostWorkspaceRegistryLike } from '../delta-ui-adapter/workspace-contract.js'

// Deletion and relocation already address both raw and session-prefixed IDs.
// Protection must cover exactly that same alias set. No private registry
// maps or caller-provided cwd hints are used to establish membership.
export const sessionAliases = (id: string): string[] => {
  const raw = id.replace(/^session-/, '')
  return [id, raw, 'session-' + raw]
}

// Direct session lock decisions must use the same alias equivalence as
// native unarchive, content search and durable deletion tombstones.
export const sameSessionId = (left: string, right: string): boolean => {
  const aliases = new Set(sessionAliases(left))
  return sessionAliases(right).some(id => aliases.has(id))
}

// Historical Delta overlays can store both raw and session-prefixed IDs.
// Replace the entire equivalent alias set; do not change native membership.
export const withoutMoveAliases = (
  moved: Record<string, string>, sessionIds: readonly string[],
): Record<string, string> => {
  const removedAliases = new Set(sessionIds.flatMap(sessionAliases))
  const next = { ...moved }
  for (const key of Object.keys(next)) {
    if (sessionAliases(key).some(alias => removedAliases.has(alias))) delete next[key]
  }
  return next
}

export const nativeArchivedAliases = (reg: HostWorkspaceRegistryLike, sessionId: string): string[] | undefined =>
  Array.isArray(reg.archivedSessionIds)
    ? [...new Set(reg.archivedSessionIds.filter(id => typeof id === 'string' && sameSessionId(id, sessionId)))]
    : undefined

// Host mutations must honor the same tombstone aliases as native unarchive
// and content search. Exact string checks can otherwise revive stale records.
export const isSessionDeleted = (state: DeltaHostState, sessionId: string): boolean => {
  const deletedAliases = new Set(state.deletedSessionIds.flatMap(sessionAliases))
  return sessionAliases(sessionId).some(alias => deletedAliases.has(alias))
}

export function readHostSessionProtection(state: DeltaHostState, getRegistry: () => unknown) {
  const protectedIds = new Set(state.lockedSessionIds.flatMap(sessionAliases))
  const lockedKeys = new Set(state.lockedWorkspaceIds)
  const nativeTargets = new Map<string, string>()
  const nativePaths = new Set<string>()
  let isComplete = true
  if (lockedKeys.size > 0) {
    try {
      const reg = getRegistry() as HostWorkspaceRegistryLike | undefined
      if (typeof reg?.list !== 'function') throw new Error('WORKSPACE_MEMBERSHIP_UNAVAILABLE')
      const rows = Array.from(reg.list())
      const matchedKeys = new Set<string>()
      // Validate the complete public snapshot, not private record.sessionIds.
      for (const row of rows) {
        const { id, path, sessionIds } = row
        if (typeof id !== 'string' || !id.trim() ||
            typeof path !== 'string' || !path.trim() ||
            !Array.isArray(sessionIds) ||
            sessionIds.some(sid => typeof sid !== 'string' || !sid.trim()) ||
            nativeTargets.has(id) || nativePaths.has(path)) {
          throw new Error('WORKSPACE_MEMBERSHIP_INVALID')
        }
        nativeTargets.set(id, path)
        nativePaths.add(path)
        if (lockedKeys.has(id) || lockedKeys.has(path)) {
          if (lockedKeys.has(id)) matchedKeys.add(id)
          if (lockedKeys.has(path)) matchedKeys.add(path)
          for (const key of [id, path]) lockedKeys.add(key)
          for (const sid of sessionIds) for (const alias of sessionAliases(sid)) protectedIds.add(alias)
        }
      }
      // A persisted lock with no matching public entity is uncertain, not
      // proof of absence. Refuse destructive operations until reconciled.
      if (state.lockedWorkspaceIds.some(key => !matchedKeys.has(key))) isComplete = false
      if (getRegistry() !== reg) isComplete = false
    } catch { isComplete = false }
    // Protect the union of durable native membership and confirmed Delta
    // relocation mappings, including a session moved away from a locked
    // native workspace. Neither source can weaken the other.
    for (const [sid, target] of Object.entries(state.movedSessions)) {
      // A stale or malformed relocation cannot establish that this session
      // is absent from any locked native workspace. Refuse an uncertain
      // unarchive, search, delete or move instead of treating it as clear.
      if (!sid.trim() || typeof target !== 'string' || !target.trim() ||
          (!nativeTargets.has(target) && !nativePaths.has(target))) {
        isComplete = false
      }
      if (lockedKeys.has(target)) for (const alias of sessionAliases(sid)) protectedIds.add(alias)
    }
  }
  return {
    session(sessionId: string): 'locked' | 'clear' | 'unknown' {
      if (sessionAliases(sessionId).some(id => protectedIds.has(id))) return 'locked'
      return isComplete ? 'clear' : 'unknown'
    },
    destination(id: string, path: string): 'locked' | 'clear' | 'unknown' {
      if (lockedKeys.has(id) || (path && lockedKeys.has(path))) return 'locked'
      if (lockedKeys.size === 0) return 'clear'
      if (!isComplete || !nativeTargets.has(id)) return 'unknown'
      const nativePath = nativeTargets.get(id)
      if (nativePath && lockedKeys.has(nativePath)) return 'locked'
      // When workspace protection exists, do not let an arbitrary path
      // turn an unlocked destination ID into a physical move elsewhere.
      if (path && path !== nativePath) return 'unknown'
      return 'clear'
    },
  }
}

// A Delta-only relocation still needs an existing native destination. Lock
// checks do not establish that a workspace exists when no workspace is locked.
// Use the public registry list, never private maps or a caller-supplied path
// as authority. Incomplete/unstable Host catalogs cannot authorize a mapping.
export const hasNativeMoveDestination = (
  getRegistry: () => unknown,
  workspaceId: string,
  hintedPath: string,
): boolean => {
  try {
    const reg = getRegistry() as HostWorkspaceRegistryLike | undefined
    if (typeof reg?.list !== 'function') return false
    const seen = new Set<string>()
    const seenPaths = new Set<string>()
    let nativePath: string | undefined
    for (const row of reg.list()) {
      if (!row || typeof row.id !== 'string' || !row.id.trim() ||
          typeof row.path !== 'string' || !row.path.trim() ||
          !Array.isArray(row.sessionIds) ||
          row.sessionIds.some(sid => typeof sid !== 'string' || !sid.trim()) ||
          seen.has(row.id) || seenPaths.has(row.path)) return false
      seen.add(row.id)
      seenPaths.add(row.path)
      if (row.id === workspaceId) nativePath = row.path
    }
    return getRegistry() === reg &&
      nativePath !== undefined &&
      (!hintedPath || hintedPath === nativePath)
  } catch { return false }
}

// An HTTP folder-open request is not a filesystem capability. Admit only
// the exact path of one unique workspace in a complete, stable public Host
// workspace snapshot; never use the request body as path authority.
export function isConfirmedHostWorkspaceFolder(
  getRegistry: () => unknown,
  requestedPath: string,
): boolean {
  if (!requestedPath || requestedPath.includes('\0')) return false
  try {
    const reg = getRegistry() as HostWorkspaceRegistryLike | undefined
    if (typeof reg?.list !== 'function') return false
    const seenIds = new Set<string>()
    const seenPaths = new Set<string>()
    let isMatched = false
    for (const row of reg.list()) {
      if (!row || typeof row.id !== 'string' || !row.id.trim() ||
          typeof row.path !== 'string' || !row.path.trim() ||
          !Array.isArray(row.sessionIds) ||
          row.sessionIds.some(sid => typeof sid !== 'string' || !sid.trim()) ||
          seenIds.has(row.id) || seenPaths.has(row.path)) return false
      seenIds.add(row.id)
      seenPaths.add(row.path)
      if (row.path === requestedPath) isMatched = true
    }
    return getRegistry() === reg && isMatched
  } catch { return false }
}

// Both the native unarchive veto and Delta's content search consume the same
// authoritative protection decision. Tombstones must never be resurrected by
// a Host-native unarchive, including a raw/session-prefixed ID alias.
export function readHostUnarchiveProtection(
  state: DeltaHostState, getRegistry: () => unknown,
): (sessionId: string) => 'deleted' | 'locked' | 'unknown' | 'clear' {
  const protection = readHostSessionProtection(state, getRegistry)
  const deleted = new Set(state.deletedSessionIds.flatMap(sessionAliases))
  return sessionId => sessionAliases(sessionId).some(id => deleted.has(id))
    ? 'deleted' : protection.session(sessionId)
}

/**
 * Reuse the durable Session/Workspace lock and tombstone verdict at the
 * official Host agent/pre-step admission seam. The Host can reject a model
 * step even if a running Session could not be archived at lock time.
 *
 * A subagent inherits its parent's protection. Missing ancestry or a cycle
 * is uncertain and may not authorize a new model request.
 */
export function readHostAgentStepProtection(
  state: DeltaHostState,
  getRegistry: () => unknown,
  header: unknown,
  getParentHeader: (sessionId: string) => unknown,
): 'deleted' | 'locked' | 'unknown' | 'clear' {
  const decide = readHostUnarchiveProtection(state, getRegistry)
  const visited = new Set<string>()
  let current = header
  for (let depth = 0; depth < 64; depth++) {
    if (!current || typeof current !== 'object') return 'unknown'
    const h = current as { id?: unknown; origin?: unknown; parentSession?: unknown }
    const currentId = h.id
    if (typeof currentId !== 'string' || !currentId.trim() || !isSafeSessionMapKey(currentId) ||
        [...visited].some(ancestorId => sameSessionId(ancestorId, currentId))) return 'unknown'
    visited.add(currentId)
    const verdict = decide(currentId)
    if (verdict !== 'clear') return verdict
    if (h.origin !== 'subagent') return 'clear'
    const parentId = h.parentSession
    if (typeof parentId !== 'string' || !parentId.trim() || !isSafeSessionMapKey(parentId)) return 'unknown'
    // A missing parent handle must not conceal its durable lock/tombstone.
    const parentVerdict = decide(parentId)
    if (parentVerdict !== 'clear') return parentVerdict
    let parent: unknown
    try { parent = getParentHeader(parentId) }
    catch { return 'unknown' }
    // The public Sessions registry can be replaced or return stale records.
    // A looked-up header is proof of ancestry only when it belongs to the
    // requested parent (including the Host's raw/session-prefixed aliases).
    // Never follow a different Session's unlocked header to bypass a lock.
    if (!parent || typeof parent !== 'object' ||
        typeof (parent as { id?: unknown }).id !== 'string' ||
        !sameSessionId((parent as { id: string }).id, parentId)) return 'unknown'
    current = parent
  }
  return 'unknown'
}

export function readHostSearchExclusion(state: DeltaHostState, getRegistry: () => unknown): (sessionId: string) => boolean {
  const verdict = readHostUnarchiveProtection(state, getRegistry)
  return sessionId => verdict(sessionId) !== 'clear'
}
