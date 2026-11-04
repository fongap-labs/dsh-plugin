import { lstat, realpath, rm } from 'node:fs/promises'
import { basename, dirname, resolve, sep } from 'node:path'

interface SessionHeader { id: string }
interface SessionPersistence {
  list(): Promise<Array<{ header?: SessionHeader } & Partial<SessionHeader>>>
  locate(header: SessionHeader): { path?: string } | null
}
interface SessionStore { get(id: string): unknown }
interface Agents { get(id: string): { status?: string } | undefined }
interface WorkspaceRegistry {
  list(): Array<{ sessionIds?: string[]; detachSession?(id: string): Promise<void> }>
  unpinSession?(id: string): Promise<void>
  unarchiveSession?(id: string): Promise<void>
}
interface SessionHost {
  get?(name: string): unknown
  emit?(name: string, id: string): void
}

const validId = (id: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)

/**
 * Delete cold sessions only. A live or running session is never removed while a
 * writer may recreate its files. Disk paths come exclusively from persistence.
 */
export async function deleteColdSession(host: SessionHost, id: string): Promise<void> {
  if (!validId(id)) throw new Error('Invalid session identifier')
  const agents = host.get?.('agents') as Agents | undefined
  const sessions = host.get?.('sessions') as SessionStore | undefined
  if (agents?.get(id)?.status === 'running') throw new Error('Session is running. Stop it first.')
  if (sessions?.get(id) !== undefined) throw new Error('Session remains active in Host memory. Restart Harness before deleting.')
  const persistence = host.get?.('sessionPersistence') as SessionPersistence | undefined
  if (!persistence?.list || !persistence.locate) throw new Error('Host session persistence locator is unavailable.')
  const entries = await persistence.list()
  const header = entries.map(row => row.header || row).find(row => row?.id === id) as SessionHeader | undefined
  if (!header) throw new Error('Session record does not exist.')
  const located = persistence.locate(header)
  if (!located?.path) throw new Error('Host cannot locate session storage.')
  const artifact = resolve(located.path)
  const directory = dirname(artifact)
  // Only a dedicated directory literally named after this session is deletable.
  if (basename(directory) !== id || directory === dirname(directory)) {
    throw new Error('Session storage is not an isolated directory. Delete refused.')
  }
  const parent = await realpath(dirname(directory))
  const actual = await realpath(directory)
  if (actual !== resolve(parent, id) || !actual.startsWith(parent + sep)) {
    throw new Error('Session path crosses a symbolic link. Delete refused.')
  }
  const stat = await lstat(actual)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid session directory type.')
  // Verify that this session is still cold immediately before filesystem mutation.
  if (agents?.get(id)?.status === 'running' || sessions?.get(id) !== undefined) {
    throw new Error('Session became active again. Delete cancelled.')
  }
  await rm(actual, { recursive: true, force: false })
  const registry = host.get?.('workspaceRegistry') as WorkspaceRegistry | undefined
  for (const workspace of registry?.list?.() || []) {
    if (workspace.sessionIds?.includes(id)) await workspace.detachSession?.(id)
  }
  await registry?.unpinSession?.(id)
  await registry?.unarchiveSession?.(id)
  host.emit?.('api-session/removed', id)
}
