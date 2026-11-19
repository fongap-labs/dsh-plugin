/**
 * Host endpoints for Session PIN Lock, Move Session across workspaces, and Delete Session.
 *
 * Respects plugin boundaries strictly:
 * - Zero monkey-patching of internal workspaces / session registries.
 * - Uses public `ctx.get('sessionPersistence')` and `ctx.get('sessions')` safely when present,
 *   plus profile-scoped `.delta-suite-state.json` durability across restarts.
 */
import {
  buildOtpAuthUri,
  generateTotpSecret,
  isSixDigitCode,
  isSafeSessionMapKey,
  loadNodeModule,
  makeJsonResponse,
  readRequestJson,
  resolveDshHome,
  toPublicHostState,
  verifyPinSecret,
  verifyTotpCode,
} from './host-state.js'
import type { DeltaHostState, HostStateStore } from './host-state.js'

export const DELTA_STATE_PATH = '/api/delta-suite/state'
export const DELTA_SESSION_LOCK_PATH = '/api/delta-suite/session-lock'
export const DELTA_SESSION_MOVE_PATH = '/api/delta-suite/session-move'
export const DELTA_SESSION_DELETE_PATH = '/api/delta-suite/session-delete'
export const DELTA_SESSION_DELETE_UNGROUPED_PATH = '/api/delta-suite/session-delete-ungrouped'
export const DELTA_OPEN_FOLDER_PATH = '/api/delta-suite/open-folder'

interface SessionOpsHostContext {
  get?(name: string): unknown
  on?(event: string, listener: (...args: any[]) => unknown): () => void
  inject?(deps: string[], cb: (scope: any) => void | (() => void)): unknown
}

function isInsideRoot(pathMod: any, rootDir: string, candidatePath: string): boolean {
  const rel = pathMod.relative(pathMod.resolve(rootDir), pathMod.resolve(candidatePath))
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + pathMod.sep) && !pathMod.isAbsolute(rel)
}

// A lexical path may still escape through a symlinked parent. Resolve both
// the trusted root and the existing candidate before recursive removal.
async function isInsideRealRoot(
  fs: any, pathMod: any, rootDir: string, candidatePath: string,
): Promise<boolean> {
  if (!isInsideRoot(pathMod, rootDir, candidatePath)) return false
  try {
    const [realRoot, realCandidate] = await Promise.all([
      fs.realpath(rootDir),
      fs.realpath(candidatePath),
    ])
    return isInsideRoot(pathMod, realRoot, realCandidate)
  } catch {
    // Unresolvable paths cannot authorize destructive cleanup.
    return false
  }
}

function isSafeSegment(id: string): boolean {
  return Boolean(id) && id !== '.' && id !== '..' &&
    !id.includes('/') && !id.includes('\\') && !id.includes('\0')
}

async function removeSessionProjCache(ctx: SessionOpsHostContext, sessionId: string): Promise<void> {
  if (!isSafeSegment(sessionId)) return
  try {
    const fs = await loadNodeModule<any>('node:fs/promises')
    const pathMod = await loadNodeModule<any>('node:path')
    const dshHome = await resolveDshHome(ctx)
    const baseDir = pathMod.join(dshHome, 'storages', 'session_projcache', 'sessions')
    const rawId = sessionId.replace(/^session-/, '')
    const targets = new Set([
      pathMod.join(baseDir, `${sessionId}.json`),
      pathMod.join(baseDir, `${rawId}.json`),
      pathMod.join(baseDir, `session-${rawId}.json`),
    ])
    for (const t of targets) {
      // The cache directory itself may be a junction or symlink outside
      // DSH_HOME. A safe filename is not proof that the target stays inside
      // the profile once parent links are resolved.
      if (!await isInsideRealRoot(fs, pathMod, dshHome, t)) continue
      await fs.rm(t, { force: true }).catch(() => {})
    }
  } catch {}
}

// A Session directory is not owned wholesale by the native log. Sidecars,
// attachments and future Host records may share it, so only known native log
 // basenames are eligible for physical deletion.
function isNativeSessionLogName(name: string): boolean {
  return /^session.*\.jsonl(\.zstd|\.zst)?$/i.test(name)
}

async function resolveSessionFiles(
  ctx: SessionOpsHostContext,
  sessionId: string,
  hintedCwd?: string,
): Promise<{ root?: string; dirs: string[]; files: string[] }> {
  if (!isSafeSegment(sessionId)) return { dirs: [], files: [] }
  const sp = ctx.get?.('sessionPersistence') as {
    root?: string
    locate?: (meta: { id: string; cwd?: string }) => { path?: string }
    listGenerations?: () => Promise<Array<{ sessionId?: string; sourcePath?: string }>>
  } | undefined

  const fs = await loadNodeModule<any>('node:fs/promises')
  const pathMod = await loadNodeModule<any>('node:path')
  let root = typeof sp?.root === 'string' && sp.root ? pathMod.resolve(sp.root) : undefined
  if (!root) {
    try {
      const dshHome = await resolveDshHome(ctx)
      root = pathMod.resolve(pathMod.join(dshHome, 'sessions'))
    } catch {}
  }

  const files = new Set<string>()
  const dirs = new Set<string>()
  // Client-supplied cwd and even Host persistence generations are location
  // hints, not authorization to erase an arbitrary file below sessions/.
  // Only native session logs directly inside this session's alias directory
  // may enter the physical deletion candidates.
  const rawId = sessionId.replace(/^session-/, '')
  const ownedDirs = new Set([sessionId, rawId, `session-${rawId}`])
  const isOwnedLog = (file: string): boolean =>
    ownedDirs.has(pathMod.basename(pathMod.dirname(file))) &&
    isNativeSessionLogName(pathMod.basename(file))

  if (sp && typeof sp.locate === 'function' && hintedCwd) {
    try {
      const located = sp.locate({ id: sessionId, cwd: hintedCwd })?.path
      if (typeof located === 'string') {
        const resolved = pathMod.resolve(located)
        if (isOwnedLog(resolved)) {
          await fs.access(resolved).then(() => {
            files.add(resolved)
            dirs.add(pathMod.dirname(resolved))
          }).catch(() => {})
        }
      }
    } catch {}
  }

  if (sp && typeof sp.listGenerations === 'function') {
    try {
      const gens = await sp.listGenerations()
      for (const g of gens ?? []) {
        if (!g?.sourcePath) continue
        const resolved = pathMod.resolve(g.sourcePath)
        const spDir = pathMod.dirname(resolved)
        const baseDirName = pathMod.basename(spDir)
        if (isOwnedLog(resolved) && (g.sessionId === sessionId || ownedDirs.has(baseDirName))) {
          files.add(resolved)
          dirs.add(spDir)
        }
      }
    } catch {}
  }

  // Fallback filesystem scan inside sessions root to catch ungrouped/zstd artifacts reliably
  if (root) {
    try {
      const rawId = sessionId.replace(/^session-/, '')
      const idVariants = [sessionId, rawId, `session-${rawId}`]
      const projectEntries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
      for (const proj of projectEntries) {
        if (!proj.isDirectory()) continue
        for (const variant of idVariants) {
          const candidateDir = pathMod.join(root, proj.name, variant)
          if (!isInsideRoot(pathMod, root, candidateDir)) continue
          const subEntries = await fs.readdir(candidateDir, { withFileTypes: true }).catch(() => null)
          if (!subEntries) continue
          dirs.add(candidateDir)
          for (const sub of subEntries) {
            if (sub.isFile() && isNativeSessionLogName(sub.name)) {
              files.add(pathMod.join(candidateDir, sub.name))
            }
          }
        }
      }
    } catch {}
  }

  return { root, dirs: [...dirs], files: [...files] }
}

async function purgeSessionsFromWorkspaceJson(
  ctx: SessionOpsHostContext,
  sessionIds: string[],
): Promise<void> {
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) return
  try {
    const fs = await loadNodeModule<any>('node:fs/promises')
    const pathMod = await loadNodeModule<any>('node:path')
    const dshHome = await resolveDshHome(ctx)
    const wsPath = pathMod.join(dshHome, 'storages', 'workspace.json')

    const raw = await fs.readFile(wsPath, 'utf8').catch(() => null)
    if (!raw) return
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return

    const idSet = new Set<string>()
    for (const sid of sessionIds) {
      if (!sid || typeof sid !== 'string') continue
      const trimmed = sid.trim()
      const rawId = trimmed.replace(/^session-/, '')
      idSet.add(trimmed)
      idSet.add(rawId)
      idSet.add(`session-${rawId}`)
    }

    let isModified = false

    if (data.tables && typeof data.tables.workspaces === 'object') {
      for (const [, ws] of Object.entries(data.tables.workspaces as Record<string, any>)) {
        if (ws && Array.isArray(ws.sessionIds)) {
          const originalLen = ws.sessionIds.length
          ws.sessionIds = ws.sessionIds.filter((id: any) => typeof id === 'string' && !idSet.has(id.trim()))
          if (ws.sessionIds.length !== originalLen) {
            isModified = true
            ws.updatedAt = new Date().toISOString()
          }
        }
      }
    }

    if (data.global && typeof data.global === 'object') {
      if (Array.isArray(data.global.archivedSessionIds)) {
        const orig = data.global.archivedSessionIds.length
        data.global.archivedSessionIds = data.global.archivedSessionIds.filter((id: any) => typeof id === 'string' && !idSet.has(id.trim()))
        if (data.global.archivedSessionIds.length !== orig) isModified = true
      }
      if (Array.isArray(data.global.pinnedSessionIds)) {
        const orig = data.global.pinnedSessionIds.length
        data.global.pinnedSessionIds = data.global.pinnedSessionIds.filter((id: any) => typeof id === 'string' && !idSet.has(id.trim()))
        if (data.global.pinnedSessionIds.length !== orig) isModified = true
      }
    }

    if (isModified) {
      const serialized = JSON.stringify(data, null, 2)
      const tmpPath = `${wsPath}.tmp.${Date.now()}`
      await fs.writeFile(tmpPath, serialized, 'utf8')
      try {
        await fs.rename(tmpPath, wsPath)
      } catch {
        await fs.copyFile(tmpPath, wsPath)
        await fs.rm(tmpPath, { force: true }).catch(() => {})
      }
    }
  } catch {}
}

async function purgeSessionArtifacts(
  ctx: SessionOpsHostContext,
  sid: string,
  hintedCwd?: string,
): Promise<void> {
  const rawId = sid.replace(/^session-/, '')
  const idVariants = new Set([sid, rawId, `session-${rawId}`])

  try {
    const fs = await loadNodeModule<any>('node:fs/promises')
    const pathMod = await loadNodeModule<any>('node:path')
    const info = await resolveSessionFiles(ctx, sid, hintedCwd)

    if (info.root) {
      // Never recursively remove the entire session directory: an extension,
      // attachment or future Host version can store unrelated files inside it.
      // Physical cleanup is limited to regular native log files with an
      // authenticated alias parent, real-path containment and no symlinks.
      for (const file of info.files) {
        if (!idVariants.has(pathMod.basename(pathMod.dirname(file))) ||
            !isNativeSessionLogName(pathMod.basename(file)) ||
            !await isInsideRealRoot(fs, pathMod, info.root, file)) continue
        const entry = await fs.lstat(file).catch(() => null)
        if (!entry?.isFile()) continue
        await fs.rm(file, { force: true }).catch(() => {})
      }
      // Remove only an empty native alias directory. Unknown sidecars or
      // nested folders must remain intact, even after the tombstone commits.
      for (const dir of info.dirs) {
        if (!idVariants.has(pathMod.basename(dir)) ||
            !await isInsideRealRoot(fs, pathMod, info.root, dir)) continue
        const entry = await fs.lstat(dir).catch(() => null)
        if (!entry?.isDirectory()) continue
        await fs.rmdir(dir).catch(() => {})
      }
    }
  } catch {}
  await removeSessionProjCache(ctx, sid)
}

interface HostWorkspaceEntityLike {
  id?: string
  path?: string
  sessionIds?: readonly string[]
  record?: { sessionIds?: readonly string[]; path?: string }
  detachSession?(sessionId: string): Promise<void> | void
}

interface HostWorkspaceRegistryLike {
  archivedSessionIds?: readonly string[]
  pinnedSessionIds?: readonly string[]
  archiveSession?: (sessionId: string, options?: { stopActivity?: boolean }) => Promise<void> | void
  unarchiveSession?: (sessionId: string) => Promise<void> | void
  unpinSession?: (sessionId: string) => Promise<void> | void
  list?(): Iterable<HostWorkspaceEntityLike> | HostWorkspaceEntityLike[]
  entities?: Map<string, HostWorkspaceEntityLike>
  get?(id: string): HostWorkspaceEntityLike | undefined
  headers?: Map<string, unknown>
  sessionPaths?: Map<string, string>
  missingSessionPaths?: Set<string>
  invalidSessionPaths?: Map<string, string>
}

// Deletion and relocation already address both raw and session-prefixed IDs.
// Protection must cover exactly that same alias set. No private registry
// maps or caller-provided cwd hints are used to establish membership.
const sessionAliases = (id: string): string[] => {
  const raw = id.replace(/^session-/, '')
  return [id, raw, 'session-' + raw]
}

// Direct session lock decisions must use the same alias equivalence as
// native unarchive, content search and durable deletion tombstones.
const sameSessionId = (left: string, right: string): boolean => {
  const aliases = new Set(sessionAliases(left))
  return sessionAliases(right).some(id => aliases.has(id))
}

// Historical Delta overlays can store both raw and session-prefixed IDs.
// Replace the entire equivalent alias set; do not change native membership.
const withoutMoveAliases = (
  moved: Record<string, string>, sessionIds: readonly string[],
): Record<string, string> => {
  const removedAliases = new Set(sessionIds.flatMap(sessionAliases))
  const next = { ...moved }
  for (const key of Object.keys(next)) {
    if (sessionAliases(key).some(alias => removedAliases.has(alias))) delete next[key]
  }
  return next
}

const nativeArchivedAliases = (reg: HostWorkspaceRegistryLike, sessionId: string): string[] | undefined =>
  Array.isArray(reg.archivedSessionIds)
    ? [...new Set(reg.archivedSessionIds.filter(id => typeof id === 'string' && sameSessionId(id, sessionId)))]
    : undefined

// Host mutations must honor the same tombstone aliases as native unarchive
// and content search. Exact string checks can otherwise revive stale records.
const isSessionDeleted = (state: DeltaHostState, sessionId: string): boolean => {
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
const hasNativeMoveDestination = (
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
    if (typeof h.id !== 'string' || !isSafeSessionMapKey(h.id) ||
        [...visited].some(ancestorId => sameSessionId(ancestorId, h.id as string))) return 'unknown'
    visited.add(h.id)
    const verdict = decide(h.id)
    if (verdict !== 'clear') return verdict
    if (h.origin !== 'subagent') return 'clear'
    if (typeof h.parentSession !== 'string' || !isSafeSessionMapKey(h.parentSession)) return 'unknown'
    // A missing parent handle must not conceal its durable lock/tombstone.
    const parentVerdict = decide(h.parentSession)
    if (parentVerdict !== 'clear') return parentVerdict
    let parent: unknown
    try { parent = getParentHeader(h.parentSession) }
    catch { return 'unknown' }
    // The public Sessions registry can be replaced or return stale records.
    // A looked-up header is proof of ancestry only when it belongs to the
    // requested parent (including the Host's raw/session-prefixed aliases).
    // Never follow a different Session's unlocked header to bypass a lock.
    if (!parent || typeof parent !== 'object' ||
        typeof (parent as { id?: unknown }).id !== 'string' ||
        !sameSessionId((parent as { id: string }).id, h.parentSession)) return 'unknown'
    current = parent
  }
  return 'unknown'
}

export function readHostSearchExclusion(state: DeltaHostState, getRegistry: () => unknown): (sessionId: string) => boolean {
  const verdict = readHostUnarchiveProtection(state, getRegistry)
  return sessionId => verdict(sessionId) !== 'clear'
}

export function installHostSessionOps(
  ctx: SessionOpsHostContext,
  store: HostStateStore,
  hooks?: { onSessionChanged?: (sessionId: string) => void },
): () => void {
  const unregisterCallbacks: Array<() => void> = []
  let isDisposed = false
  let operationChain: Promise<unknown> = Promise.resolve()
  // Serialize protection checks with the side effects they authorize across both transports.
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operationChain.then(operation)
    operationChain = result.catch(() => {})
    return result
  }
  const serializeRequest = (operation: () => Promise<unknown>): Promise<unknown> => serialize(async () => {
    if (isDisposed) return makeJsonResponse(503, { ok: false, error: 'SESSION_OPS_UNAVAILABLE' })
    try { return await operation() }
    catch { return makeJsonResponse(500, { ok: false, error: 'SESSION_OPS_FAILED' }) }
  })
  let workspaceRegistryRef = ctx.get?.('workspaceRegistry') as HostWorkspaceRegistryLike | undefined
  const pendingSetups = new Map<string, { secret: string; uri: string; expiresAt: number }>()

  const getRegistry = (): HostWorkspaceRegistryLike | undefined => {
    const live = ctx.get?.('workspaceRegistry') as HostWorkspaceRegistryLike | undefined
    return live ?? workspaceRegistryRef
  }

  const readProtection = (state: DeltaHostState) => readHostSessionProtection(state, getRegistry)
  const readUnarchiveProtection = (state: DeltaHostState) => readHostUnarchiveProtection(state, getRegistry)

  const protectionFailure = (verdict: 'locked' | 'unknown'): unknown =>
    verdict === 'locked'
      ? makeJsonResponse(403, { ok: false, error: 'SESSION_LOCKED' })
      : makeJsonResponse(503, { ok: false, error: 'WORKSPACE_PROTECTION_UNAVAILABLE' })

  const archiveSessionOnHost = async (sessionId: string): Promise<boolean> => {
    try {
      const reg = getRegistry()
      if (isDisposed || !reg || typeof reg.archiveSession !== 'function') return false
      const existing = nativeArchivedAliases(reg, sessionId)
      // A pre-existing Host archive is not Delta-owned, even if the user
      // later applies a Delta lock. Do not record ownership for this path.
      if (existing?.length) return true
      // The public WorkspaceRegistry archive contract supports stopActivity:
      // it persists the native archive before asking providers to stop an
      // already-running turn, subagents, schedules and jobs. A plain archive
      // can refuse a busy Session and leave its current request alive even
      // though the Delta lock was durably committed. The official pre-step
      // gate remains a fallback if native archival is unavailable or fails.
      await Promise.resolve(reg.archiveSession(sessionId, { stopActivity: true }))
      const confirmed = !isDisposed && getRegistry() === reg &&
        Boolean(nativeArchivedAliases(reg, sessionId)?.length)
      if (!confirmed) return false
      // Commit ownership only after a newly-created Host archive is confirmed.
      // Crash/write failure conservatively leaves the Host archive intact; it
      // never grants Delta permission to unarchive a pre-existing record.
      if (existing?.length === 0) {
        await store.update(cur => ({
          ...cur,
          nativeArchiveOwnedSessionIds: cur.nativeArchiveOwnedSessionIds?.some(id => sameSessionId(id, sessionId))
            ? cur.nativeArchiveOwnedSessionIds
            : [...(cur.nativeArchiveOwnedSessionIds ?? []), sessionId],
        }))
      }
      return true
    } catch {
      // Missing/old Host or a persistence failure: do not report archival as
      // successful. Durable Delta lock + Host pre-step veto still apply.
      return false
    }
  }

  const unarchiveSessionOnHost = async (sessionId: string): Promise<boolean> => {
    try {
      const confirmed = await store.read()
      if (readUnarchiveProtection(confirmed)(sessionId) !== 'clear') return false
      const reg = getRegistry()
      if (isDisposed || !reg || typeof reg.unarchiveSession !== 'function') return false
      const archived = nativeArchivedAliases(reg, sessionId)
      // Do not "restore" a native archive created by the user, another
      // extension, or a legacy Delta version without durable attribution.
      // An absent/unknown archive catalog cannot establish safe ownership.
      const ownsArchive = confirmed.nativeArchiveOwnedSessionIds?.some(id => sameSessionId(id, sessionId))
      if (!ownsArchive) return archived?.length === 0
      if (!archived) return false
      // One native Session can appear under raw/session-prefixed aliases.
      for (const alias of archived) {
        await Promise.resolve(reg.unarchiveSession(alias))
        if (isDisposed || getRegistry() !== reg) return false
      }
      if (nativeArchivedAliases(reg, sessionId)?.length !== 0) return false
      await store.update(cur => ({
        ...cur,
        nativeArchiveOwnedSessionIds: (cur.nativeArchiveOwnedSessionIds ?? [])
          .filter(id => !sameSessionId(id, sessionId)),
      }))
      return true
    } catch { return false }
  }

  const notifySessionChanged = (sessionId: string): void => {
    try { hooks?.onSessionChanged?.(sessionId) } catch {}
  }

  const pruneExpiredSetups = (): void => {
    const now = Date.now()
    for (const [k, v] of pendingSetups) {
      if (v.expiresAt <= now) pendingSetups.delete(k)
    }
    while (pendingSetups.size > 8) {
      const oldest = pendingSetups.keys().next().value
      if (!oldest) break
      pendingSetups.delete(oldest)
    }
  }

  const handleState = async (): Promise<unknown> => {
    const state = await store.read()
    return makeJsonResponse(200, { ok: true, state: toPublicHostState(state) })
  }

  const handleLock = async (request: unknown): Promise<unknown> => {
    const body = await readRequestJson(request)
    const action = typeof body.action === 'string' ? body.action.trim() : ''
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''
    const codeRaw = typeof body.code === 'string' ? body.code : typeof body.pin === 'string' ? body.pin : ''
    const code = codeRaw.trim()
    const setupToken = typeof body.setupToken === 'string' ? body.setupToken.trim() : ''

    const current = await store.read()

    if (action === 'setup-begin') {
      if (current.totpSecret || current.pinHash) {
        return makeJsonResponse(409, { ok: false, error: 'TOTP_ALREADY_CONFIGURED' })
      }
      pruneExpiredSetups()
      const cryptoMod = await loadNodeModule<any>('node:crypto')
      const token = cryptoMod.randomBytes(16).toString('hex')
      const secret = await generateTotpSecret()
      const otpauthUri = buildOtpAuthUri(secret)
      pendingSetups.set(token, { secret, uri: otpauthUri, expiresAt: Date.now() + 15 * 60 * 1000 })
      pruneExpiredSetups()
      return makeJsonResponse(200, {
        ok: true,
        setupToken: token,
        secret,
        otpauthUri,
        digits: 6,
        period: 30,
      })
    }

    if (action === 'setup-confirm') {
      if (current.totpSecret || current.pinHash) {
        return makeJsonResponse(409, { ok: false, error: 'TOTP_ALREADY_CONFIGURED' })
      }
      pruneExpiredSetups()
      const pending = setupToken ? pendingSetups.get(setupToken) : undefined
      if (!pending) {
        return makeJsonResponse(400, { ok: false, error: 'SETUP_EXPIRED' })
      }
      if (!isSixDigitCode(code)) {
        return makeJsonResponse(400, { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' })
      }
      const valid = await verifyTotpCode(pending.secret, code)
      if (!valid) {
        return makeJsonResponse(403, { ok: false, error: 'INVALID_TOTP_CODE' })
      }
      if (sessionId && isSessionDeleted(current, sessionId)) {
        return makeJsonResponse(404, { ok: false, error: 'SESSION_DELETED' })
      }
      const next = await store.update(cur => ({
        ...cur,
        totpSecret: pending.secret,
        pinHash: undefined,
        lockedSessionIds: sessionId && !cur.lockedSessionIds.some(id => sameSessionId(id, sessionId))
          ? [...cur.lockedSessionIds, sessionId]
          : cur.lockedSessionIds,
        lockedWorkspaceIds: workspaceId && !cur.lockedWorkspaceIds.includes(workspaceId)
          ? [...cur.lockedWorkspaceIds, workspaceId]
          : cur.lockedWorkspaceIds,
      }))
      pendingSetups.clear()
      const isArchived = sessionId ? await archiveSessionOnHost(sessionId) : false
      if (sessionId) notifySessionChanged(sessionId)
      return makeJsonResponse(200, { ok: true, state: toPublicHostState(next), archived: isArchived })
    }

    if (action === 'lock') {
      if (!sessionId && !workspaceId) return makeJsonResponse(400, { ok: false, error: 'MISSING_TARGET_ID' })
      if (sessionId && isSessionDeleted(current, sessionId)) {
        return makeJsonResponse(404, { ok: false, error: 'SESSION_DELETED' })
      }
      if (!current.totpSecret && !current.pinHash) {
        return makeJsonResponse(400, { ok: false, error: 'TOTP_NOT_CONFIGURED' })
      }
      const next = await store.update(cur => ({
        ...cur,
        lockedSessionIds: sessionId && !cur.lockedSessionIds.some(id => sameSessionId(id, sessionId))
          ? [...cur.lockedSessionIds, sessionId]
          : cur.lockedSessionIds,
        lockedWorkspaceIds: workspaceId && !cur.lockedWorkspaceIds.includes(workspaceId)
          ? [...cur.lockedWorkspaceIds, workspaceId]
          : cur.lockedWorkspaceIds,
      }))
      const isArchived = sessionId ? await archiveSessionOnHost(sessionId) : false
      if (sessionId) notifySessionChanged(sessionId)
      return makeJsonResponse(200, { ok: true, state: toPublicHostState(next), archived: isArchived })
    }

    if (action === 'verify' || action === 'unlock') {
      if (!sessionId && !workspaceId) return makeJsonResponse(400, { ok: false, error: 'MISSING_TARGET_ID' })
      if (!current.totpSecret && !current.pinHash) return makeJsonResponse(403, { ok: false, error: 'TOTP_NOT_CONFIGURED' })
      if ((sessionId && !current.lockedSessionIds.some(id => sameSessionId(id, sessionId))) ||
          (workspaceId && !current.lockedWorkspaceIds.includes(workspaceId))) {
        return makeJsonResponse(409, { ok: false, error: 'TARGET_NOT_LOCKED' })
      }
      if (current.totpSecret) {
        if (!isSixDigitCode(code)) {
          return makeJsonResponse(403, { ok: false, error: 'INVALID_TOTP_CODE' })
        }
        const valid = await verifyTotpCode(current.totpSecret, code)
        if (!valid) {
          return makeJsonResponse(403, { ok: false, error: 'INVALID_TOTP_CODE' })
        }
      } else if (current.pinHash) {
        const valid = await verifyPinSecret(code, current.pinHash)
        if (!valid) {
          return makeJsonResponse(403, { ok: false, error: 'INVALID_PIN' })
        }
      }
      if (action === 'unlock') {
        const next = await store.update(cur => ({
          ...cur,
          lockedSessionIds: sessionId ? cur.lockedSessionIds.filter(id => !sameSessionId(id, sessionId)) : cur.lockedSessionIds,
          lockedWorkspaceIds: workspaceId ? cur.lockedWorkspaceIds.filter(id => id !== workspaceId) : cur.lockedWorkspaceIds,
        }))
        const isUnarchived = sessionId ? await unarchiveSessionOnHost(sessionId) : false
        if (sessionId) notifySessionChanged(sessionId)
        return makeJsonResponse(200, { ok: true, verified: true, state: toPublicHostState(next), unarchived: isUnarchived })
      }
      return makeJsonResponse(200, { ok: true, verified: true, state: toPublicHostState(current) })
    }

    if (action === 'clear-pin' || action === 'unbind-2fa') {
      if (!current.totpSecret && !current.pinHash) return makeJsonResponse(403, { ok: false, error: 'TOTP_NOT_CONFIGURED' })
      if (current.totpSecret) {
        if (!isSixDigitCode(code)) {
          return makeJsonResponse(403, { ok: false, error: 'INVALID_TOTP_CODE' })
        }
        const valid = await verifyTotpCode(current.totpSecret, code)
        if (!valid) return makeJsonResponse(403, { ok: false, error: 'INVALID_TOTP_CODE' })
      } else if (current.pinHash) {
        const valid = await verifyPinSecret(code, current.pinHash)
        if (!valid) return makeJsonResponse(403, { ok: false, error: 'INVALID_PIN' })
      }
      const previouslyLocked = [...current.lockedSessionIds]
      const next = await store.update(cur => ({
        ...cur,
        totpSecret: undefined,
        pinHash: undefined,
        lockedSessionIds: [],
        lockedWorkspaceIds: [],
      }))
      pendingSetups.clear()
      const unarchivedIds: string[] = []
      const pendingUnarchiveIds: string[] = []
      for (const sid of previouslyLocked) {
        if (await unarchiveSessionOnHost(sid)) unarchivedIds.push(sid)
        else pendingUnarchiveIds.push(sid)
        notifySessionChanged(sid)
      }
      return makeJsonResponse(200, { ok: true, unarchivedIds, pendingUnarchiveIds, state: toPublicHostState(next) })
    }

    return makeJsonResponse(400, { ok: false, error: 'UNKNOWN_LOCK_ACTION' })
  }

  const handleMove = async (request: unknown): Promise<unknown> => {
    const body = await readRequestJson(request)
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const targetWorkspaceId = typeof body.targetWorkspaceId === 'string' ? body.targetWorkspaceId.trim() : ''
    const targetPath = typeof body.targetPath === 'string' ? body.targetPath.trim() : ''

    if (!sessionId || !targetWorkspaceId) {
      return makeJsonResponse(400, { ok: false, error: 'MISSING_MOVE_PARAMS' })
    }
    // A session ID becomes an own key in movedSessions, which is a JSON
    // object. Never admit magic Object.prototype keys or path components.
    if (!isSafeSessionMapKey(sessionId)) {
      return makeJsonResponse(400, { ok: false, error: 'INVALID_SESSION_ID' })
    }

    const current = await store.read()
    if (isSessionDeleted(current, sessionId)) {
      return makeJsonResponse(404, { ok: false, error: 'SESSION_DELETED' })
    }
    const protection = readProtection(current)
    const sourceVerdict = protection.session(sessionId)
    if (sourceVerdict !== 'clear') return protectionFailure(sourceVerdict)
    const targetVerdict = protection.destination(targetWorkspaceId, targetPath)
    if (targetVerdict !== 'clear') return protectionFailure(targetVerdict)
    if (!hasNativeMoveDestination(getRegistry, targetWorkspaceId, targetPath)) {
      return makeJsonResponse(503, { ok: false, error: 'WORKSPACE_DESTINATION_UNAVAILABLE' })
    }
    // The public Harness workspace API cannot atomically relocate an existing
    // session. Only update Delta's own mapping; native logs, cwd and workspace
    // membership remain Host-owned until an explicit relocation API exists.
    const next = await store.update(cur => ({
      ...cur,
      movedSessions: {
        ...withoutMoveAliases(cur.movedSessions, [sessionId]),
        [sessionId]: targetWorkspaceId,
      },
    }))
    notifySessionChanged(sessionId)
    return makeJsonResponse(200, { ok: true, state: toPublicHostState(next) })
  }

  const detachFromRegistry = async (sessionIds: string[], shouldSkipUnarchive = false): Promise<void> => {
    const reg: any = getRegistry()
    if (!reg) return
    for (const sid of sessionIds) {
      if (!sid) continue
      const idVariants = [...new Set(sessionAliases(sid))]
      for (const v of idVariants) {
        // Startup tombstone replay must never trigger native unarchive: older
        // Hosts may lack the public pre-unarchive veto entirely.
        if (!shouldSkipUnarchive) {
          try { await Promise.resolve(reg.unarchiveSession?.(v)).catch(() => {}) } catch {}
        }
        try { await Promise.resolve(reg.unpinSession?.(v)).catch(() => {}) } catch {}
      }
      try {
        let entities: any[] = []
        if (typeof reg.list === 'function') {
          entities = Array.from(reg.list())
        } else if (reg.entities && typeof reg.entities.values === 'function') {
          entities = Array.from(reg.entities.values())
        }
        for (const ent of entities) {
          if (typeof ent?.detachSession === 'function') {
            for (const v of idVariants) {
              await Promise.resolve(ent.detachSession(v)).catch(() => {})
            }
          }
        }
      } catch {}
      for (const v of idVariants) {
        try { reg.headers?.delete?.(v) } catch {}
        try { reg.sessionPaths?.delete?.(v) } catch {}
        try { reg.missingSessionPaths?.delete?.(v) } catch {}
        try { reg.invalidSessionPaths?.delete?.(v) } catch {}
      }
    }
  }

  const cancelLiveSession = async (sid: string, shouldInspectAliases = false): Promise<void> => {
    let sessions: {
      get?: (id: string) => { cancel?: () => Promise<void> | void } | undefined
      cancel?: (id: string) => Promise<void> | void
    } | undefined
    try { sessions = ctx.get?.('sessions') as typeof sessions } catch { return }

    // A Host-level cancellation failure must not prevent a session-handle
    // cancellation attempt. Both APIs are optional and may throw separately.
    try { await Promise.resolve(sessions?.cancel?.(sid)) } catch {}
    const ids = shouldInspectAliases ? [...new Set(sessionAliases(sid))] : [sid]
    for (const id of ids) {
      try { await Promise.resolve(sessions?.get?.(id)?.cancel?.()) } catch {}
    }
  }

  const handleDelete = async (request: unknown): Promise<unknown> => {
    const body = await readRequestJson(request)
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const sourceCwd = typeof body.sourceCwd === 'string' ? body.sourceCwd.trim() : undefined

    if (!sessionId) {
      return makeJsonResponse(400, { ok: false, error: 'MISSING_SESSION_ID' })
    }
    // Never persist a tombstone or detach a native ID that cannot be a
    // literal, single-segment Host session identifier.
    if (!isSafeSegment(sessionId)) {
      return makeJsonResponse(400, { ok: false, error: 'INVALID_SESSION_ID' })
    }

    const current = await store.read()
    if (isSessionDeleted(current, sessionId)) {
      return makeJsonResponse(404, { ok: false, error: 'SESSION_DELETED' })
    }
    const verdict = readProtection(current).session(sessionId)
    if (verdict !== 'clear') return protectionFailure(verdict)

    // Commit the deletion tombstone before touching native files or registry.
    // A failed state write must leave the session intact; interrupted cleanup
    // remains safely replayable from the durable tombstone at next startup.
    const next = await store.update(cur => {
      return {
        ...cur,
        movedSessions: withoutMoveAliases(cur.movedSessions, [sessionId]),
        lockedSessionIds: cur.lockedSessionIds.filter(id => !sameSessionId(id, sessionId)),
        deletedSessionIds: cur.deletedSessionIds.includes(sessionId)
          ? cur.deletedSessionIds
          : [...cur.deletedSessionIds, sessionId],
        nativeArchiveOwnedSessionIds: (cur.nativeArchiveOwnedSessionIds ?? [])
          .filter(id => !sameSessionId(id, sessionId)),
      }
    })

    // A single-delete caller may supply only one spelling while the active
    // native Sessions handle is registered under its alternate spelling.
    await cancelLiveSession(sessionId, true)
    await purgeSessionArtifacts(ctx, sessionId, sourceCwd)
    // Never unarchive a tombstoned session, including on older native Hosts
    // that do not provide a public pre-unarchive veto.
    await detachFromRegistry([sessionId], true)
    await purgeSessionsFromWorkspaceJson(ctx, [sessionId])
    notifySessionChanged(sessionId)
    return makeJsonResponse(200, { ok: true, state: toPublicHostState(next) })
  }

  const handleDeleteUngrouped = async (request: unknown): Promise<unknown> => {
    const body = await readRequestJson(request)
    const rawIds = body.sessionIds
    if (!Array.isArray(rawIds) ||
        rawIds.some(id => typeof id !== 'string' || !isSafeSegment(id.trim()))) {
      // Filtering malformed rows would silently execute only the valid
      // subset of a destructive batch. Reject the entire request instead.
      return makeJsonResponse(400, { ok: false, error: 'INVALID_SESSION_ID' })
    }
    const cwds = body.cwds && typeof body.cwds === 'object' ? (body.cwds as Record<string, string>) : {}
    // Retain each explicitly requested spelling for live-session cancellation,
    // but operate on each logical Host session only once. Raw and session-
    // prefixed IDs may be listed together in legacy ungrouped catalogs.
    const requestedIds = [...new Set((rawIds as string[]).map(id => id.trim()))]
    const sessionIds: string[] = []
    const seenAliases = new Set<string>()
    for (const id of requestedIds) {
      const aliases = sessionAliases(id)
      // Preserve first-spelling-wins semantics, including repeated "session-" prefixes.
      if (aliases.some(alias => seenAliases.has(alias))) continue
      sessionIds.push(id)
      for (const alias of aliases) seenAliases.add(alias)
    }

    const current = await store.read()
    if (sessionIds.length === 0) {
      // A valid empty batch is a no-op, not a state-file rewrite or a native
      // cleanup request. Preserve the existing successful response contract.
      return makeJsonResponse(200, {
        ok: true, deletedIds: [], skippedLockedIds: [],
        state: toPublicHostState(current),
      })
    }
    // Reject the entire bulk request before any native side effect if one
    // alias already has a durable deletion tombstone.
    const tombstoneAliases = new Set(current.deletedSessionIds.flatMap(sessionAliases))
    if (sessionIds.some(sid => sessionAliases(sid).some(alias => tombstoneAliases.has(alias)))) {
      return makeJsonResponse(404, { ok: false, error: 'SESSION_DELETED' })
    }
    const protection = readProtection(current)
    const skippedLockedIds: string[] = []
    const toDeleteIds: string[] = []
    for (const sid of sessionIds) {
      const verdict = protection.session(sid)
      // Classify every row before any cancel/purge. An uncertain member
      // must not result in a partially executed destructive request.
      if (verdict === 'unknown') return protectionFailure(verdict)
      if (verdict === 'locked') skippedLockedIds.push(sid)
      else toDeleteIds.push(sid)
    }

    if (sessionIds.length > 0 && toDeleteIds.length === 0) {
      return makeJsonResponse(403, { ok: false, error: 'SESSION_LOCKED', skippedLockedIds })
    }

    // Persist the entire eligible batch before its first destructive side
    // effect. If cleanup fails midway, every eligible ID remains tombstoned
    // for startup reconciliation; locked entries are never added.
    const next = await store.update(cur => {
      const delSet = new Set(cur.deletedSessionIds)
      for (const sid of toDeleteIds) delSet.add(sid)
      return {
        ...cur,
        movedSessions: withoutMoveAliases(cur.movedSessions, toDeleteIds),
        deletedSessionIds: [...delSet],
        nativeArchiveOwnedSessionIds: (cur.nativeArchiveOwnedSessionIds ?? [])
          .filter(id => !toDeleteIds.some(sid => sameSessionId(id, sid))),
      }
    })

    // Build the reverse index once: deletion candidates can have several
    // overlapping raw/session-prefixed spellings, but cancellations must keep
    // the exact order in which the caller supplied each spelling.
    const requestedOrder = new Map<string, number>()
    const requestedByAlias = new Map<string, string[]>()
    for (const [index, id] of requestedIds.entries()) {
      requestedOrder.set(id, index)
      for (const alias of new Set(sessionAliases(id))) {
        const aliases = requestedByAlias.get(alias) ?? []
        aliases.push(id)
        requestedByAlias.set(alias, aliases)
      }
    }
    for (const sid of toDeleteIds) {
      const aliases = [...new Set(sessionAliases(sid).flatMap(alias => requestedByAlias.get(alias) ?? []))]
        .sort((left, right) => requestedOrder.get(left)! - requestedOrder.get(right)!)
      // Cancellation uses the actual requested spellings. The public Sessions
      // service may register an active run under either alias; physical purge
      // and native workspace detachment still execute once per logical ID.
      for (const alias of aliases) await cancelLiveSession(alias)
      const hintedCwd = aliases
        .map(id => typeof cwds[id] === 'string' && cwds[id].trim() ? cwds[id].trim() : undefined)
        .find((cwd): cwd is string => Boolean(cwd))
      await purgeSessionArtifacts(ctx, sid, hintedCwd)
    }
    await detachFromRegistry(toDeleteIds, true)
    await purgeSessionsFromWorkspaceJson(ctx, toDeleteIds)

    const deletedAliases = new Set(toDeleteIds.flatMap(sessionAliases))
    for (const sid of requestedIds) {
      if (sessionAliases(sid).some(alias => deletedAliases.has(alias))) notifySessionChanged(sid)
    }
    return makeJsonResponse(200, {
      ok: true,
      deletedIds: toDeleteIds,
      skippedLockedIds,
      state: toPublicHostState(next),
    })
  }

  const handleOpenFolder = async (request: unknown): Promise<unknown> => {
    const body = (await readRequestJson(request)) as { path?: string }
    const targetPath = typeof body?.path === 'string' ? body.path.trim() : ''
    if (!targetPath) return makeJsonResponse(400, { ok: false, error: 'path is required' })
    // This route must never function as a generic shell/UNC-path opener.
    if (!isConfirmedHostWorkspaceFolder(getRegistry, targetPath)) {
      return makeJsonResponse(403, { ok: false, error: 'WORKSPACE_PATH_UNAUTHORIZED' })
    }
    try {
      const pathMod = await loadNodeModule<any>('node:path')
      if (!pathMod.isAbsolute(targetPath) || pathMod.normalize(targetPath) !== targetPath) {
        return makeJsonResponse(400, { ok: false, error: 'INVALID_WORKSPACE_PATH' })
      }
      const fs = await loadNodeModule<any>('node:fs/promises')
      const stat = await fs.stat(targetPath).catch(() => null)
      if (!stat?.isDirectory?.() || !isConfirmedHostWorkspaceFolder(getRegistry, targetPath)) {
        return makeJsonResponse(403, { ok: false, error: 'WORKSPACE_PATH_UNAUTHORIZED' })
      }
      const cp = await loadNodeModule<any>('node:child_process')
      const osMod = await loadNodeModule<any>('node:os')
      const plat = typeof osMod?.platform === 'function' ? osMod.platform() : ((globalThis as any).process?.platform ?? 'win32')
      const isWin = plat === 'win32'
      const isMac = plat === 'darwin'
      const cmd = isWin ? 'explorer.exe' : isMac ? 'open' : 'xdg-open'
      const child = cp.spawn(cmd, [targetPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
      child.unref?.()
      return makeJsonResponse(200, { ok: true })
    } catch (err) {
      return makeJsonResponse(500, { ok: false, error: String(err) })
    }
  }

  // Public WorkspaceRegistry pre-unarchive event: rejection retains archival.
  // Do not enter the Delta mutation queue here. The registry awaits this event
  // while a verified Delta unlock may itself be awaiting the registry.
  if (typeof ctx.on === 'function') {
    try {
      const off = ctx.on('workspace/session-unarchiving', async (request: { sessionId?: unknown }) => {
        if (isDisposed) return
        const sessionId = request?.sessionId
        if (typeof sessionId !== 'string' || !sessionId) throw new Error('DELTA_SESSION_TARGET_INVALID')
        const confirmed = await store.read()
        if (isDisposed) return
        const verdict = readUnarchiveProtection(confirmed)(sessionId)
        if (verdict === 'deleted') throw new Error('DELTA_SESSION_DELETED')
        if (verdict === 'locked') throw new Error('DELTA_SESSION_LOCKED')
        if (verdict === 'unknown') throw new Error('DELTA_WORKSPACE_PROTECTION_UNAVAILABLE')
      })
      if (typeof off === 'function') unregisterCallbacks.push(off)
    } catch { /* Older Host: retain the existing client compatibility guard. */ }
  }

  // This is a published Host waterfall seam (see the native
  // ArchivedSessionGate). It blocks new model steps for protected Sessions,
  // including those whose archive was refused because work was already
  // active. Never acquire the Delta mutation queue here: an archive request
  // may be waiting on Host Agent activity providers.
  if (typeof ctx.on === 'function') {
    try {
      const off = ctx.on('agent/pre-step', async (
        payload: { agent?: { session?: { header?: unknown } } },
        next: () => unknown,
      ) => {
        if (isDisposed) return next()
        let verdict: ReturnType<typeof readHostAgentStepProtection>
        try {
          const confirmed = await store.read()
          if (isDisposed) return next()
          verdict = readHostAgentStepProtection(
            confirmed, getRegistry, payload?.agent?.session?.header,
            parentId => {
              const sessions = ctx.get?.('sessions') as {
                get?: (sessionId: string) => { header?: unknown } | undefined
              } | undefined
              return sessions?.get?.(parentId)?.header
            },
          )
        } catch {
          // Unreadable durable locks, missing public ancestry or Registry
          // failure cannot authorize a model request.
          return { kind: 'reject' as const }
        }
        if (isDisposed) return next()
        return verdict === 'clear' ? next() : { kind: 'reject' as const }
      })
      if (typeof off === 'function') unregisterCallbacks.push(off)
    } catch { /* Older Host: retain existing archive and native UI guards. */ }
  }

  // Prime state cache once at startup, sweep deleted session artifacts, and sync locked -> archived
  void serialize(async () => {
    if (isDisposed) return
    const initial = await store.read()
    // Unmount can happen while durable state is being read or while cleanup
    // is awaiting I/O; never initiate another native side effect afterwards.
    if (isDisposed) return
    for (const delId of initial.deletedSessionIds) {
      if (isDisposed) return
      await purgeSessionArtifacts(ctx, delId)
    }
    if (initial.deletedSessionIds.length > 0) {
      if (isDisposed) return
      await purgeSessionsFromWorkspaceJson(ctx, initial.deletedSessionIds)
      if (isDisposed) return
      await detachFromRegistry(initial.deletedSessionIds, true)
    }
    for (const lockedId of initial.lockedSessionIds) {
      if (isDisposed) return
      await archiveSessionOnHost(lockedId)
    }
  }).catch(() => {})

  if (typeof ctx.inject === 'function') {
    try {
      const unsubWs = ctx.inject(['workspaceRegistry'], (scope: { workspaceRegistry?: HostWorkspaceRegistryLike }) => {
        if (isDisposed) return () => {}
        workspaceRegistryRef = scope?.workspaceRegistry
        const registry = workspaceRegistryRef
        void serialize(async () => {
          if (isDisposed || !registry || getRegistry() !== registry) return
          const initial = await store.read()
          // Startup cleanup may have run before the public Registry existed.
          // Re-apply durable deletion tombstones when it becomes available or
          // is remounted, without ever unarchiving a deleted native session.
          if (isDisposed || getRegistry() !== registry) return
          for (const deletedId of initial.deletedSessionIds) {
            if (isDisposed || getRegistry() !== registry) return
            await detachFromRegistry([deletedId], true)
          }
          for (const lockedId of initial.lockedSessionIds) {
            if (isDisposed || getRegistry() !== registry) return
            await archiveSessionOnHost(lockedId)
          }
        }).catch(() => {})
        return () => {
          if (workspaceRegistryRef === scope?.workspaceRegistry) workspaceRegistryRef = undefined
        }
      })
      if (typeof unsubWs === 'function') {
        unregisterCallbacks.push(unsubWs as () => void)
      } else if (unsubWs && typeof (unsubWs as { dispose?: () => void }).dispose === 'function') {
        unregisterCallbacks.push(() => { (unsubWs as { dispose: () => void }).dispose() })
      }
    } catch {}
    try {
      const unsub = ctx.inject(['connection'], (scope: {
        connection?: {
          fetch?: {
            register?: (spec: {
              path: string
              methods?: string[]
              requestBody?: string
              fetch: (req: unknown) => Promise<unknown>
            }) => () => void
          }
        }
      }) => {
        if (isDisposed) return () => {}
        if (typeof scope?.connection?.fetch?.register !== 'function') return () => {}
        const stops = [
          scope.connection.fetch.register({
            path: DELTA_STATE_PATH,
            methods: ['GET'],
            requestBody: 'buffered',
            fetch: () => serializeRequest(() => handleState()),
          }),
          scope.connection.fetch.register({
            path: DELTA_SESSION_LOCK_PATH,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: req => serializeRequest(() => handleLock(req)),
          }),
          scope.connection.fetch.register({
            path: DELTA_SESSION_MOVE_PATH,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: req => serializeRequest(() => handleMove(req)),
          }),
          scope.connection.fetch.register({
            path: DELTA_SESSION_DELETE_PATH,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: req => serializeRequest(() => handleDelete(req)),
          }),
          scope.connection.fetch.register({
            path: DELTA_SESSION_DELETE_UNGROUPED_PATH,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: req => serializeRequest(() => handleDeleteUngrouped(req)),
          }),
          scope.connection.fetch.register({
            path: DELTA_OPEN_FOLDER_PATH,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: req => serializeRequest(() => handleOpenFolder(req)),
          }),
        ]
        const cleanup = () => {
          for (const stop of stops) {
            try { stop?.() } catch {}
          }
        }
        if (typeof (scope as { effect?: (fn: () => () => void, label?: string) => void }).effect === 'function') {
          (scope as { effect: (fn: () => () => void, label?: string) => void }).effect(
            () => cleanup,
            'delta-suite: host session ops routes',
          )
        }
        return cleanup
      })
      if (typeof unsub === 'function') {
        unregisterCallbacks.push(unsub as () => void)
      } else if (unsub && typeof (unsub as { dispose?: () => void }).dispose === 'function') {
        unregisterCallbacks.push(() => { (unsub as { dispose: () => void }).dispose() })
      }
    } catch {}

    // Fallback register on webServer
    try {
      const unsubWebServer = ctx.inject(['webServer'], (scope: {
        webServer?: {
          register?: (route: {
            path: string
            handler: (req: unknown, res: any) => Promise<void> | void
          }) => () => void
        }
      }) => {
        if (isDisposed) return () => {}
        const ws = scope?.webServer
        if (!ws || typeof ws.register !== 'function') return () => {}
        const makeRoute = (path: string, handler: (req: unknown) => Promise<unknown>) => ({
          path,
          async handler(req: any, res: any) {
            try {
              const result: any = await handler(req)
              const status = result?.status || 200
              const json = typeof result?.json === 'function' ? await result.json() : result
              res.writeHead(status, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(json))
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: String(err) }))
            }
          },
        })
        const stops = [
          ws.register(makeRoute(DELTA_STATE_PATH, () => serializeRequest(() => handleState()))),
          ws.register(makeRoute(DELTA_SESSION_LOCK_PATH, req => serializeRequest(() => handleLock(req)))),
          ws.register(makeRoute(DELTA_SESSION_MOVE_PATH, req => serializeRequest(() => handleMove(req)))),
          ws.register(makeRoute(DELTA_SESSION_DELETE_PATH, req => serializeRequest(() => handleDelete(req)))),
          ws.register(makeRoute(DELTA_SESSION_DELETE_UNGROUPED_PATH, req => serializeRequest(() => handleDeleteUngrouped(req)))),
          ws.register(makeRoute(DELTA_OPEN_FOLDER_PATH, req => serializeRequest(() => handleOpenFolder(req)))),
        ]
        return () => {
          for (const s of stops) {
            try { s?.() } catch {}
          }
        }
      })
      if (typeof unsubWebServer === 'function') {
        unregisterCallbacks.push(unsubWebServer as () => void)
      } else if (unsubWebServer && typeof (unsubWebServer as { dispose?: () => void }).dispose === 'function') {
        unregisterCallbacks.push(() => { (unsubWebServer as { dispose: () => void }).dispose() })
      }
    } catch {}
  }

  return () => {
    isDisposed = true
    pendingSetups.clear()
    for (let i = unregisterCallbacks.length - 1; i >= 0; i--) {
      try { unregisterCallbacks[i]() } catch {}
    }
    unregisterCallbacks.length = 0
  }
}
