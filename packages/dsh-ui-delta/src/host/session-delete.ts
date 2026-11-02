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
  if (!validId(id)) throw new Error('无效的会话标识')
  const service = (name: string): unknown => host.get?.(name)
  const agents = service('agents') as Agents | undefined
  const sessions = service('sessions') as SessionStore | undefined
  if (agents?.get(id)?.status === 'running') throw new Error('会话正在运行，请先停止')
  if (sessions?.get(id) !== undefined) throw new Error('会话仍在宿主内存中，请关闭此会话并重启 Harness 后删除')
  const persistence = service('sessionPersistence') as SessionPersistence | undefined
  if (!persistence?.list || !persistence.locate) throw new Error('宿主未提供安全的会话持久化定位接口')
  const entries = await persistence.list()
  const header = entries.map(row => row.header || row).find(row => row?.id === id) as SessionHeader | undefined
  if (!header) throw new Error('会话文件已不存在')
  const located = persistence.locate(header)
  if (!located?.path) throw new Error('宿主无法定位会话文件')
  const artifact = resolve(located.path)
  const directory = dirname(artifact)
  // Only a dedicated directory literally named after this session is deletable.
  if (basename(directory) !== id || directory === dirname(directory)) {
    throw new Error('会话路径不满足独立目录约束，拒绝删除')
  }
  const parent = await realpath(dirname(directory))
  const actual = await realpath(directory)
  if (actual !== resolve(parent, id) || !actual.startsWith(parent + sep)) {
    throw new Error('会话目录包含符号链接，拒绝删除')
  }
  const stat = await lstat(actual)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('会话目录类型无效')
  // Verify that this session is still cold immediately before filesystem mutation.
  if (agents?.get(id)?.status === 'running' || sessions?.get(id) !== undefined) {
    throw new Error('会话已重新激活，删除已取消')
  }
  await rm(actual, { recursive: true, force: false })
  const registry = service('workspaceRegistry') as WorkspaceRegistry | undefined
  for (const workspace of registry?.list?.() || []) {
    if (workspace.sessionIds?.includes(id)) await workspace.detachSession?.(id)
  }
  await registry?.unpinSession?.(id)
  await registry?.unarchiveSession?.(id)
  host.emit?.('api-session/removed', id)
}
