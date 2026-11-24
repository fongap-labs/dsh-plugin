// Search protection uses a read-only Host workspace membership snapshot.
// Native Workspace commands and authorization stay entirely Host-owned.
type WorkspaceProtectionState = Pick<ClientFeatureSnapshot,
  'lockedSessionIds' | 'lockedWorkspaceIds' | 'deletedSessionIds' | 'movedSessions'>

function workspaceSessionAliases(id: string): string[] {
  const raw = id.replace(/^session-/, '')
  return [id, raw, 'session-' + raw]
}

// Scope this policy to Delta's search UI, not native owner content ACLs.
interface SearchContentProtection {
  canQuery: boolean
  canUseNativeFallback: boolean
  allowsSession(id: string, workspaceId?: string): boolean
  allowsWorkspace(id: string, path?: string): boolean
}
function createSearchContentProtection(
  state: WorkspaceProtectionState & { isSearchProtectionReady: boolean },
  readNative: () => WorkspaceSnapshot,
): SearchContentProtection {
  const excluded = new Set([...state.lockedSessionIds, ...state.deletedSessionIds].flatMap(workspaceSessionAliases))
  if (!state.isSearchProtectionReady) return {
    canQuery: false, canUseNativeFallback: false,
    allowsSession: () => false, allowsWorkspace: () => false,
  }
  const lockedKeys = new Set(state.lockedWorkspaceIds)
  let isComplete = true
  if (lockedKeys.size > 0) {
    try {
      const snapshot = readNative()
      if (!Array.isArray(snapshot.items)) throw new Error('invalid workspace membership')
      const known = new Set<string>()
      const rows = new Set<string>()
      for (const row of snapshot.items) {
        const { workspaceId, path, sessionIds } = row
        if (typeof workspaceId !== 'string' || !workspaceId || typeof path !== 'string' || !path ||
            rows.has(workspaceId) || !Array.isArray(sessionIds) ||
            sessionIds.some(id => typeof id !== 'string' || !id)) throw new Error('invalid workspace membership')
        rows.add(workspaceId)
        if (lockedKeys.has(workspaceId) || lockedKeys.has(path)) {
          if (state.lockedWorkspaceIds.includes(workspaceId)) known.add(workspaceId)
          if (state.lockedWorkspaceIds.includes(path)) known.add(path)
          lockedKeys.add(workspaceId)
          lockedKeys.add(path)
          for (const id of sessionIds) for (const alias of workspaceSessionAliases(id)) excluded.add(alias)
        }
      }
      if (state.lockedWorkspaceIds.some(key => !known.has(key))) isComplete = false
    } catch { isComplete = false }
    for (const [id, target] of Object.entries(state.movedSessions)) {
      if (lockedKeys.has(target)) for (const alias of workspaceSessionAliases(id)) excluded.add(alias)
    }
  }
  const allowsWorkspace = (id: string, path?: string): boolean =>
    isComplete && !lockedKeys.has(id) && !(path && lockedKeys.has(path))
  return {
    canQuery: isComplete,
    canUseNativeFallback: isComplete && lockedKeys.size === 0 && excluded.size === 0,
    allowsWorkspace,
    allowsSession: (id, workspaceId) => isComplete &&
      !workspaceSessionAliases(id).some(alias => excluded.has(alias)) &&
      (!workspaceId || allowsWorkspace(workspaceId)),
  }
}

