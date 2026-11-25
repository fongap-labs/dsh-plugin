/** Pure projection of confirmed Host state for Suite-owned views.
 * No transport, native store writes, authorization grants or UI effects.
 * The Host remains authoritative for durable mutations and permissions.
 */
interface ClientFeatureSnapshot {
  isSearchProtectionReady: boolean
  hasPin: boolean
  lockMode?: 'totp' | 'pin' | 'none'
  lockedSessionIds: readonly string[]
  lockedWorkspaceIds: readonly string[]
  movedSessions: Readonly<Record<string, string>>
  deletedSessionIds: readonly string[]
  tempUnlockedIds: readonly string[]
  tempUnlockedWorkspaceIds: readonly string[]
  activeSessionId?: string
  revision: number
}

type ConfirmedClientSessionState = Required<Pick<ClientFeatureSnapshot,
  'hasPin' | 'lockMode' | 'lockedSessionIds' | 'lockedWorkspaceIds' | 'deletedSessionIds' | 'movedSessions'>>

function isConfirmedLockState(payload: unknown): payload is ConfirmedClientSessionState {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const value = payload as Partial<ClientFeatureSnapshot>
  const isIdList = (items: unknown): boolean =>
    Array.isArray(items) && items.every(id => typeof id === 'string' && id.length > 0)
  return typeof value.hasPin === 'boolean' &&
    (value.lockMode === 'none' || value.lockMode === 'pin' || value.lockMode === 'totp') &&
    value.hasPin === (value.lockMode !== 'none') &&
    isIdList(value.lockedSessionIds) && isIdList(value.lockedWorkspaceIds) &&
    isIdList(value.deletedSessionIds) &&
    !!value.movedSessions && typeof value.movedSessions === 'object' && !Array.isArray(value.movedSessions) &&
    Object.values(value.movedSessions).every(id => typeof id === 'string' && id.length > 0) &&
    (value.hasPin || (value.lockedSessionIds?.length === 0 && value.lockedWorkspaceIds?.length === 0))
}

type ConfirmedClientSessionPatch = ConfirmedClientSessionState & Pick<ClientFeatureSnapshot,
  'isSearchProtectionReady' | 'tempUnlockedIds' | 'tempUnlockedWorkspaceIds'>

function projectConfirmedClientSessionState(previous: ClientFeatureSnapshot, payload: unknown): ConfirmedClientSessionPatch | undefined {
  if (!isConfirmedLockState(payload)) return
  const stableIds = (before: readonly string[], after: readonly string[]): readonly string[] =>
    before.length === after.length && before.every((id, index) => id === after[index])
      ? before : Object.freeze([...after])
  const moved = payload.movedSessions
  const hasSameMoves = Object.keys(previous.movedSessions).length === Object.keys(moved).length &&
    Object.entries(previous.movedSessions).every(([id, target]) =>
      Object.prototype.hasOwnProperty.call(moved, id) && moved[id] === target)
  const locked = new Set(payload.lockedSessionIds)
  const lockedWorkspaces = new Set(payload.lockedWorkspaceIds)
  const mayRetainGrants = previous.isSearchProtectionReady &&
    previous.hasPin === payload.hasPin && previous.lockMode === payload.lockMode
  return {
    isSearchProtectionReady: true,
    hasPin: payload.hasPin,
    lockMode: payload.lockMode,
    lockedSessionIds: stableIds(previous.lockedSessionIds, payload.lockedSessionIds),
    lockedWorkspaceIds: stableIds(previous.lockedWorkspaceIds, payload.lockedWorkspaceIds),
    movedSessions: hasSameMoves ? previous.movedSessions : Object.freeze({ ...moved }),
    deletedSessionIds: stableIds(previous.deletedSessionIds, payload.deletedSessionIds),
    tempUnlockedIds: stableIds(previous.tempUnlockedIds,
      mayRetainGrants ? previous.tempUnlockedIds.filter(id => locked.has(id)) : []),
    tempUnlockedWorkspaceIds: stableIds(previous.tempUnlockedWorkspaceIds,
      mayRetainGrants ? previous.tempUnlockedWorkspaceIds.filter(id => lockedWorkspaces.has(id)) : []),
  }
}

/** Revoke only transient viewing grants, never the last confirmed durable locks. */
function revokeClientSessionViewGrants(previous: ClientFeatureSnapshot): Pick<ClientFeatureSnapshot,
  'isSearchProtectionReady' | 'tempUnlockedIds' | 'tempUnlockedWorkspaceIds'> | undefined {
  if (!previous.isSearchProtectionReady && !previous.tempUnlockedIds.length && !previous.tempUnlockedWorkspaceIds.length) return
  return {
    isSearchProtectionReady: false,
    tempUnlockedIds: previous.tempUnlockedIds.length ? Object.freeze([]) : previous.tempUnlockedIds,
    tempUnlockedWorkspaceIds: previous.tempUnlockedWorkspaceIds.length ? Object.freeze([]) : previous.tempUnlockedWorkspaceIds,
  }
}
