export interface HostWorkspaceEntityLike {
  id?: string
  path?: string
  sessionIds?: readonly string[]
  record?: { sessionIds?: readonly string[]; path?: string }
  detachSession?(sessionId: string): Promise<void> | void
}

export interface HostWorkspaceRegistryLike {
  archivedSessionIds?: readonly string[]
  pinnedSessionIds?: readonly string[]
  archiveSession?: (sessionId: string, options?: { stopActivity?: boolean }) => Promise<void> | void
  unarchiveSession?: (sessionId: string) => Promise<void> | void
  unpinSession?: (sessionId: string) => Promise<void> | void
  list?(): Iterable<HostWorkspaceEntityLike> | HostWorkspaceEntityLike[]
  get?(id: string): HostWorkspaceEntityLike | undefined
}
