import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface SessionFolder {
  id: string
  name: string
  order: number
}

export interface FolderState {
  folders: SessionFolder[]
  assignments: Record<string, string>
}

export type FolderAction =
  | { action: 'create'; name: string }
  | { action: 'rename'; id: string; name: string }
  | { action: 'delete'; id: string }
  | { action: 'move'; id: string; direction: 'up' | 'down' }
  | { action: 'assign'; sessionId: string; folderId: string }
  | { action: 'unassign'; sessionId: string }

const FOLDER_FILE = join(homedir(), '.dsh-ui-delta', 'folders.json')
const FOLDER_LOCK = `${FOLDER_FILE}.lock`
const MAX_FOLDERS = 100
const MAX_ASSIGNMENTS = 10000
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

export interface FolderView extends FolderState { revision: string }
export class FolderConflictError extends Error {}

type Mutation = FolderAction & { expectedRevision?: string }
const emptyState = (): FolderState => ({ folders: [], assignments: {} })
const revisionOf = (content: string): string =>
  createHash('sha256').update(content).digest('hex')

const safeId = (value: unknown): value is string =>
  typeof value === 'string' && ID_PATTERN.test(value) && value !== '__proto__'
  && value !== 'constructor' && value !== 'prototype'

const folderName = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Folder name required')
  const name = value.trim()
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('Folder name must contain 1–80 printable characters')
  }
  return name
}

const validateState = (input: unknown): FolderState => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid folder state')
  const state = input as Partial<FolderState>
  if (!Array.isArray(state.folders) || state.folders.length > MAX_FOLDERS
    || !state.assignments || typeof state.assignments !== 'object'
    || Array.isArray(state.assignments)) throw new Error('Invalid folder state')
  const folders: SessionFolder[] = []
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const row of state.folders) {
    if (!row || typeof row !== 'object' || !safeId(row.id)
      || typeof row.order !== 'number' || !Number.isSafeInteger(row.order) || row.order < 0) {
      throw new Error('Invalid folder record')
    }
    const name = folderName(row.name)
    if (ids.has(row.id) || names.has(name.toLocaleLowerCase())) throw new Error('Duplicate folder')
    ids.add(row.id)
    names.add(name.toLocaleLowerCase())
    folders.push({ id: row.id, name, order: row.order })
  }
  folders.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  const assignments: Record<string, string> = Object.create(null)
  const entries = Object.entries(state.assignments)
  if (entries.length > MAX_ASSIGNMENTS) throw new Error('Too many folder assignments')
  for (const [sessionId, folderId] of entries) {
    if (!safeId(sessionId) || !safeId(folderId) || !ids.has(folderId)) {
      throw new Error('Invalid folder assignment')
    }
    assignments[sessionId] = folderId
  }
  return { folders, assignments }
}

export const readFolderView = (): FolderView => {
  let content: string
  try {
    content = readFileSync(FOLDER_FILE, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...emptyState(), revision: revisionOf('') }
    }
    throw error
  }
  // Read the content and revision from one snapshot; a concurrent atomic
  // rename cannot pair an old revision with the new folders.
  try {
    return { ...validateState(JSON.parse(content)), revision: revisionOf(content) }
  } catch {
    throw new Error('Folder state is unreadable; the original file was preserved')
  }
}

export const readFolders = (): FolderState => {
  const { folders, assignments } = readFolderView()
  return { folders, assignments }
}

const withFolderLock = <T>(operation: () => T): T => {
  mkdirSync(join(homedir(), '.dsh-ui-delta'), { recursive: true, mode: 0o700 })
  try {
    mkdirSync(FOLDER_LOCK, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      // Never steal a potentially active cross-process lock: callers retry.
      throw new FolderConflictError('Folder store busy; refresh and retry')
    }
    throw error
  }
  try {
    return operation()
  } finally {
    rmdirSync(FOLDER_LOCK)
  }
}

const writeFolders = (state: FolderState): void => {
  const validated = validateState(state)
  mkdirSync(join(homedir(), '.dsh-ui-delta'), { recursive: true, mode: 0o700 })
  const temp = `${FOLDER_FILE}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(temp, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 })
    try { chmodSync(temp, 0o600) } catch { /* best effort on Windows */ }
    renameSync(temp, FOLDER_FILE)
  } catch (error) {
    try { if (existsSync(temp)) unlinkSync(temp) } catch { /* best effort */ }
    throw error
  }
}

const ordered = (folders: SessionFolder[]): SessionFolder[] =>
  folders.map((item, index) => ({ ...item, order: index }))

export const mutateFolderView = (request: Mutation): FolderView => withFolderLock(() => {
  if (!request || typeof request !== 'object') throw new Error('Folder action required')
  const state = readFolderView()
  if (request.expectedRevision !== undefined && request.expectedRevision !== state.revision) {
    throw new FolderConflictError('Folder state changed; refresh and retry')
  }
  const folders = [...state.folders]
  const assignments = { ...state.assignments }
  switch (request.action) {
    case 'create': {
      const name = folderName(request.name)
      if (folders.length >= MAX_FOLDERS) throw new Error('Folder limit reached')
      if (folders.some(folder => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new Error('Folder name already exists')
      }
      folders.push({ id: randomUUID(), name, order: folders.length })
      break
    }
    case 'rename': {
      const folder = folders.find(item => item.id === request.id)
      if (!folder) throw new Error('Folder not found')
      const name = folderName(request.name)
      if (folders.some(item => item.id !== folder.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new Error('Folder name already exists')
      }
      folder.name = name
      break
    }
    case 'delete': {
      const index = folders.findIndex(item => item.id === request.id)
      if (index < 0) throw new Error('Folder not found')
      folders.splice(index, 1)
      for (const [sessionId, folderId] of Object.entries(assignments)) {
        if (folderId === request.id) delete assignments[sessionId]
      }
      break
    }
    case 'move': {
      const index = folders.findIndex(item => item.id === request.id)
      if (index < 0) throw new Error('Folder not found')
      if (request.direction !== 'up' && request.direction !== 'down') throw new Error('Invalid folder direction')
      const target = index + (request.direction === 'up' ? -1 : 1)
      if (target >= 0 && target < folders.length) {
        const swapped = folders[target]!
        folders[target] = folders[index]!
        folders[index] = swapped
      }
      break
    }
    case 'assign': {
      if (!safeId(request.sessionId)) throw new Error('Invalid session ID')
      if (!folders.some(item => item.id === request.folderId)) throw new Error('Folder not found')
      if (!Object.hasOwn(assignments, request.sessionId)
        && Object.keys(assignments).length >= MAX_ASSIGNMENTS) throw new Error('Assignment limit reached')
      assignments[request.sessionId] = request.folderId
      break
    }
    case 'unassign': {
      if (!safeId(request.sessionId)) throw new Error('Invalid session ID')
      delete assignments[request.sessionId]
      break
    }
    default:
      throw new Error('Unknown folder action')
  }
  const next = { folders: ordered(folders), assignments }
  writeFolders(next)
  return readFolderView()
})

export const mutateFolders = (request: FolderAction): FolderState => {
  const { folders, assignments } = mutateFolderView(request)
  return { folders, assignments }
}

export const forgetDeletedSession = (sessionId: string): boolean => {
  if (!safeId(sessionId)) throw new Error('Invalid session ID')
  return withFolderLock(() => {
    const state = readFolders()
    if (!Object.hasOwn(state.assignments, sessionId)) return false
    delete state.assignments[sessionId]
    writeFolders(state)
    return true
  })
}

export const countMissingAssignments = (
  knownSessionIds: ReadonlySet<string>, state: FolderState = readFolders(),
): number => Object.keys(state.assignments).filter(id => !knownSessionIds.has(id)).length

export const pruneMissingAssignments = (
  knownSessionIds: ReadonlySet<string>, expectedRevision: string,
): { view: FolderView; removedCount: number } => withFolderLock(() => {
  const view = readFolderView()
  if (view.revision !== expectedRevision) {
    throw new FolderConflictError('Folder state changed; refresh and retry')
  }
  const assignments = { ...view.assignments }
  let removedCount = 0
  for (const sessionId of Object.keys(assignments)) {
    if (knownSessionIds.has(sessionId)) continue
    delete assignments[sessionId]
    removedCount += 1
  }
  if (removedCount === 0) return { view, removedCount }
  writeFolders({ folders: view.folders, assignments })
  return { view: readFolderView(), removedCount }
})
