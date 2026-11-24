function createWorkspaceCompatibilityProjection(): (base: WorkspaceSnapshot, f: Pick<ClientFeatureSnapshot, 'deletedSessionIds' | 'lockedSessionIds' | 'movedSessions'>) => WorkspaceSnapshot {
  let previousBase: WorkspaceSnapshot | undefined
  let previousDeleted: readonly string[] | undefined
  let previousLocked: readonly string[] | undefined
  let previousMoved: ClientFeatureSnapshot['movedSessions'] | undefined
  let previousResult: WorkspaceSnapshot | undefined
  const sameIds = (a: readonly string[] | undefined, b: readonly string[]): boolean =>
    !!a && a.length === b.length && a.every((id, index) => id === b[index])
  return (base, f) => {
    if (base === previousBase && f.deletedSessionIds === previousDeleted &&
        f.lockedSessionIds === previousLocked && f.movedSessions === previousMoved && previousResult) return previousResult
    const moves = Object.entries(f.movedSessions)
    if (f.deletedSessionIds.length === 0 && f.lockedSessionIds.length === 0 && moves.length === 0) return base
    const deleted = new Set(f.deletedSessionIds)
    const locked = new Set(f.lockedSessionIds.filter(id => !deleted.has(id)))
    const workspaceIds = new Set(base.items.map(ws => ws.workspaceId))
    const targets = new Map<string, string>()
    const incomingByWorkspace = new Map<string, string[]>()
    for (const [sid, target] of moves) {
      if (deleted.has(sid) || !workspaceIds.has(target)) continue
      targets.set(sid, target)
      const incoming = incomingByWorkspace.get(target) ?? []
      incoming.push(sid)
      incomingByWorkspace.set(target, incoming)
    }
    let hasItemsChanged = false
    const items = base.items.map(ws => {
      const original = ws.sessionIds
      let next = (original ?? []).filter(sid => !deleted.has(sid) &&
        (!targets.has(sid) || targets.get(sid) === ws.workspaceId))
      const incoming = incomingByWorkspace.get(ws.workspaceId)
      if (incoming?.length) {
        const existing = new Set(next)
        next = [...incoming.filter(sid => !existing.has(sid)).reverse(), ...next]
      }
      if ((!original && next.length === 0) || sameIds(original, next)) return ws
      hasItemsChanged = true
      return { ...ws, sessionIds: next }
    })
    const archived = [...new Set([...(base.archivedSessionIds ?? []).filter(id => !deleted.has(id)), ...locked])]
    const pinned = base.pinnedSessionIds?.filter(id => !deleted.has(id) && !locked.has(id))
    const hasArchiveChanged = (base.archivedSessionIds !== undefined || archived.length > 0) && !sameIds(base.archivedSessionIds, archived)
    const hasPinChanged = pinned !== undefined && !sameIds(base.pinnedSessionIds, pinned)
    const result = !hasItemsChanged && !hasArchiveChanged && !hasPinChanged ? base : {
      ...base,
      ...(hasItemsChanged ? { items } : {}),
      ...(hasArchiveChanged ? { archivedSessionIds: archived } : {}),
      ...(hasPinChanged ? { pinnedSessionIds: pinned } : {}),
    }
    previousBase = base
    previousDeleted = f.deletedSessionIds
    previousLocked = f.lockedSessionIds
    previousMoved = f.movedSessions
    previousResult = result
    return result
  }
}

