/** Read-only verification before any manual folder-assignment reconciliation. */
export interface PersistedSessionReader {
  list(): Promise<ReadonlyArray<{ id?: string; header?: { id?: string } }>>
  open(id: string, access: 'read'): Promise<{ close: () => Promise<void> | void }>
}

export interface LiveSessionReader {
  get(id: string): unknown
}

/** Never equate absence from a Host list with durable deletion. */
export async function verifiedKnownSessionIds(
  persistence: PersistedSessionReader,
  sessions: LiveSessionReader,
  assignments: Readonly<Record<string, string>>,
): Promise<Set<string>> {
  const rows = await persistence.list()
  if (!Array.isArray(rows)) throw new Error('Host session persistence listing unavailable')
  const ids = new Set<string>()
  for (const row of rows) {
    const id = row?.header?.id || row?.id
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Host session persistence listing incomplete')
    }
    ids.add(id)
  }
  // Snapshot active IDs before any potentially lengthy disk validation. A
  // session disposed mid-check must not lose its folder assignment.
  for (const id of Object.keys(assignments)) {
    if (sessions.get(id) !== undefined) ids.add(id)
  }
  const missing = Object.keys(assignments).filter(id => !ids.has(id))
  if (missing.length > 100) {
    throw new Error('Too many unverified sessions; cleanup refused')
  }
  // Host list() can skip malformed or unsupported headers. open(read) must
  // distinguish a truly missing log from corruption, permission or I/O errors.
  for (const id of missing) {
    let handle: { close: () => Promise<void> | void } | undefined
    try {
      handle = await persistence.open(id, 'read')
      ids.add(id)
    } catch (error) {
      if (!(error instanceof Error && error.name === 'SessionPersistenceNotFoundError')) {
        throw new Error('Host could not verify an absent session; cleanup refused')
      }
    } finally {
      if (handle) await handle.close()
    }
  }
  // Account for sessions becoming active while read-only probing ran.
  for (const id of Object.keys(assignments)) {
    if (sessions.get(id) !== undefined) ids.add(id)
  }
  return ids
}
