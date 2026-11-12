/**
 * Host endpoints for Session PIN Lock, Move Session across workspaces, and Delete Session.
 *
 * Respects plugin boundaries strictly:
 * - Zero monkey-patching of internal workspaces / session registries.
 * - Uses public `ctx.get('sessionPersistence')` and `ctx.get('sessions')` safely when present,
 *   plus profile-scoped `.delta-desktop-state.json` durability across restarts.
 */
import {
  buildOtpAuthUri,
  generateTotpSecret,
  isSixDigitCode,
  loadNodeModule,
  makeJsonResponse,
  readRequestJson,
  resolveDshHome,
  toPublicHostState,
  verifyPinSecret,
  verifyTotpCode,
} from './host-state.js'
import type { HostStateStore } from './host-state.js'

export const DELTA_STATE_PATH = '/api/delta-desktop/state'
export const DELTA_SESSION_LOCK_PATH = '/api/delta-desktop/session-lock'
export const DELTA_SESSION_MOVE_PATH = '/api/delta-desktop/session-move'
export const DELTA_SESSION_DELETE_PATH = '/api/delta-desktop/session-delete'
export const DELTA_SESSION_DELETE_UNGROUPED_PATH = '/api/delta-desktop/session-delete-ungrouped'

interface SessionOpsHostContext {
  get?(name: string): unknown
  inject?(deps: string[], cb: (scope: any) => void | (() => void)): unknown
}

function isInsideRoot(pathMod: any, rootDir: string, candidatePath: string): boolean {
  const rel = pathMod.relative(pathMod.resolve(rootDir), pathMod.resolve(candidatePath))
  return rel !== '' && !rel.startsWith('..') && !pathMod.isAbsolute(rel)
}

function isSafeSegment(id: string): boolean {
  return Boolean(id) && id !== '.' && id !== '..' && !id.includes('/') && !id.includes('\\')
}

function isZstdPathOrBuffer(filePath: string, buf?: Uint8Array): boolean {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.zstd') || lower.endsWith('.zst')) return true
  return Boolean(buf && buf.length >= 4 && buf[0] === 0x28 && buf[1] === 0xb5 && buf[2] === 0x2f && buf[3] === 0xfd)
}

async function decodeSessionLogText(filePath: string, rawBuf: Uint8Array): Promise<string> {
  if (!isZstdPathOrBuffer(filePath, rawBuf)) {
    const bufMod = await loadNodeModule<any>('node:buffer')
    return bufMod.Buffer.from(rawBuf).toString('utf8')
  }
  const zlib = await loadNodeModule<any>('node:zlib')
  if (typeof zlib?.zstdDecompressSync !== 'function') {
    throw new Error('Zstd decompression unavailable in runtime')
  }
  const out = zlib.zstdDecompressSync(rawBuf)
  return out.toString('utf8')
}

async function encodeSessionLogBuffer(filePath: string, text: string): Promise<unknown> {
  const bufMod = await loadNodeModule<any>('node:buffer')
  const utf8 = bufMod.Buffer.from(text, 'utf8')
  if (!filePath.toLowerCase().endsWith('.zstd') && !filePath.toLowerCase().endsWith('.zst')) {
    return utf8
  }
  const zlib = await loadNodeModule<any>('node:zlib')
  if (typeof zlib?.zstdCompressSync !== 'function') {
    throw new Error('Zstd compression unavailable in runtime')
  }
  return zlib.zstdCompressSync(utf8)
}

async function copyDirExtras(
  fs: any,
  pathMod: any,
  srcDir: string,
  destDir: string,
  skipBasename?: string,
): Promise<void> {
  const entries = await fs.readdir(srcDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (skipBasename && entry.name === skipBasename) continue
    const from = pathMod.join(srcDir, entry.name)
    const to = pathMod.join(destDir, entry.name)
    if (entry.isDirectory()) {
      await fs.cp(from, to, { recursive: true, force: true }).catch(() => {})
    } else if (entry.isFile()) {
      await fs.copyFile(from, to).catch(() => {})
    }
  }
}

async function removeSessionProjCache(ctx: SessionOpsHostContext, sessionId: string): Promise<void> {
  if (!isSafeSegment(sessionId)) return
  try {
    const fs = await loadNodeModule<any>('node:fs/promises')
    const pathMod = await loadNodeModule<any>('node:path')
    const dshHome = await resolveDshHome(ctx)
    const cacheFile = pathMod.join(dshHome, 'storages', 'session_projcache', 'sessions', `${sessionId}.json`)
    await fs.rm(cacheFile, { force: true }).catch(() => {})
  } catch {}
}

async function resolveSessionFiles(
  ctx: SessionOpsHostContext,
  sessionId: string,
  hintedCwd?: string,
): Promise<{ root?: string; dirs: string[]; files: string[]; header?: Record<string, unknown> }> {
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

  if (sp && typeof sp.locate === 'function' && hintedCwd) {
    try {
      const located = sp.locate({ id: sessionId, cwd: hintedCwd })?.path
      if (located) {
        await fs.access(located).then(() => {
          files.add(pathMod.resolve(located))
          dirs.add(pathMod.dirname(pathMod.resolve(located)))
        }).catch(() => {})
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
        if (g.sessionId === sessionId || baseDirName === sessionId) {
          files.add(resolved)
          dirs.add(spDir)
        }
      }
    } catch {}
  }

  // Fallback filesystem scan inside sessions root to catch ungrouped/zstd artifacts reliably
  if (root) {
    try {
      const projectEntries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
      for (const proj of projectEntries) {
        if (!proj.isDirectory()) continue
        const candidateDir = pathMod.join(root, proj.name, sessionId)
        if (!isInsideRoot(pathMod, root, candidateDir)) continue
        const subEntries = await fs.readdir(candidateDir, { withFileTypes: true }).catch(() => null)
        if (!subEntries) continue
        dirs.add(candidateDir)
        for (const sub of subEntries) {
          if (sub.isFile() && /^session.*\.jsonl(\.zstd|\.zst)?$/i.test(sub.name)) {
            files.add(pathMod.join(candidateDir, sub.name))
          }
        }
      }
    } catch {}
  }

  let header: Record<string, unknown> | undefined
  for (const file of files) {
    try {
      const rawBuf = await fs.readFile(file)
      const text = await decodeSessionLogText(file, rawBuf)
      const firstLine = text.split(/\r?\n/, 1)[0]
      if (firstLine) {
        const parsed = JSON.parse(firstLine)
        if (parsed && typeof parsed === 'object') {
          header = parsed as Record<string, unknown>
          break
        }
      }
    } catch {}
  }

  return { root, dirs: [...dirs], files: [...files], ...(header ? { header } : {}) }
}

async function purgeSessionArtifacts(
  ctx: SessionOpsHostContext,
  sid: string,
  hintedCwd?: string,
): Promise<void> {
  try {
    const fs = await loadNodeModule<any>('node:fs/promises')
    const pathMod = await loadNodeModule<any>('node:path')
    const info = await resolveSessionFiles(ctx, sid, hintedCwd)
    if (info.root) {
      for (const dir of info.dirs) {
        if (isInsideRoot(pathMod, info.root, dir) && pathMod.basename(dir) === sid) {
          await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
        }
      }
      for (const file of info.files) {
        if (isInsideRoot(pathMod, info.root, file)) {
          await fs.rm(file, { force: true }).catch(() => {})
        }
      }
    }
  } catch {}
  await removeSessionProjCache(ctx, sid)
}

interface HostWorkspaceRegistryLike {
  archivedSessionIds?: readonly string[]
  archiveSession?: (sessionId: string, options?: { stopActivity?: boolean }) => Promise<void> | void
  unarchiveSession?: (sessionId: string) => Promise<void> | void
}

export function installHostSessionOps(
  ctx: SessionOpsHostContext,
  store: HostStateStore,
  hooks?: { onSessionChanged?: (sessionId: string) => void },
): () => void {
  const unregisterCallbacks: Array<() => void> = []
  let workspaceRegistryRef = ctx.get?.('workspaceRegistry') as HostWorkspaceRegistryLike | undefined
  const pendingSetups = new Map<string, { secret: string; uri: string; expiresAt: number }>()

  const getRegistry = (): HostWorkspaceRegistryLike | undefined => {
    const live = ctx.get?.('workspaceRegistry') as HostWorkspaceRegistryLike | undefined
    return live ?? workspaceRegistryRef
  }

  const archiveSessionOnHost = async (sessionId: string): Promise<boolean> => {
    const reg = getRegistry()
    if (!reg || typeof reg.archiveSession !== 'function') return false
    if (Array.isArray(reg.archivedSessionIds) && reg.archivedSessionIds.includes(sessionId)) return true
    try {
      await Promise.resolve(reg.archiveSession(sessionId, {}))
      return true
    } catch {
      try {
        await Promise.resolve(reg.archiveSession(sessionId, { stopActivity: true }))
        return true
      } catch {
        return false
      }
    }
  }

  const unarchiveSessionOnHost = async (sessionId: string): Promise<boolean> => {
    const reg = getRegistry()
    if (!reg || typeof reg.unarchiveSession !== 'function') return false
    if (Array.isArray(reg.archivedSessionIds) && !reg.archivedSessionIds.includes(sessionId)) return true
    try {
      await Promise.resolve(reg.unarchiveSession(sessionId))
      return true
    } catch {
      return false
    }
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
    const codeRaw = typeof body.code === 'string' ? body.code : typeof body.pin === 'string' ? body.pin : ''
    const code = codeRaw.trim()
    const setupToken = typeof body.setupToken === 'string' ? body.setupToken.trim() : ''

    const current = await store.read()

    if (action === 'setup-begin') {
      if (current.totpSecret) {
        return makeJsonResponse(409, { ok: false, error: 'TOTP_ALREADY_CONFIGURED' })
      }
      pruneExpiredSetups()
      const cryptoMod = await loadNodeModule<any>('node:crypto')
      const token = cryptoMod.randomBytes(16).toString('hex')
      const secret = await generateTotpSecret()
      const otpauthUri = buildOtpAuthUri(secret)
      pendingSetups.set(token, { secret, uri: otpauthUri, expiresAt: Date.now() + 15 * 60 * 1000 })
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
      if (sessionId && current.deletedSessionIds.includes(sessionId)) {
        return makeJsonResponse(404, { ok: false, error: 'SESSION_DELETED' })
      }
      pendingSetups.delete(setupToken)
      const next = await store.update(cur => ({
        ...cur,
        totpSecret: pending.secret,
        pinHash: undefined,
        lockedSessionIds: sessionId && !cur.lockedSessionIds.includes(sessionId)
          ? [...cur.lockedSessionIds, sessionId]
          : cur.lockedSessionIds,
      }))
      if (sessionId) {
        await archiveSessionOnHost(sessionId)
        hooks?.onSessionChanged?.(sessionId)
      }
      return makeJsonResponse(200, { ok: true, state: toPublicHostState(next), archived: Boolean(sessionId) })
    }

    if (action === 'lock') {
      if (!sessionId) return makeJsonResponse(400, { ok: false, error: 'MISSING_SESSION_ID' })
      if (current.deletedSessionIds.includes(sessionId)) {
        return makeJsonResponse(404, { ok: false, error: 'SESSION_DELETED' })
      }
      if (!current.totpSecret && !current.pinHash) {
        return makeJsonResponse(400, { ok: false, error: 'TOTP_NOT_CONFIGURED' })
      }
      const next = await store.update(cur => ({
        ...cur,
        lockedSessionIds: cur.lockedSessionIds.includes(sessionId)
          ? cur.lockedSessionIds
          : [...cur.lockedSessionIds, sessionId],
      }))
      await archiveSessionOnHost(sessionId)
      hooks?.onSessionChanged?.(sessionId)
      return makeJsonResponse(200, { ok: true, state: toPublicHostState(next), archived: true })
    }

    if (action === 'verify' || action === 'unlock') {
      if (!sessionId) return makeJsonResponse(400, { ok: false, error: 'MISSING_SESSION_ID' })
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
          lockedSessionIds: cur.lockedSessionIds.filter(id => id !== sessionId),
        }))
        await unarchiveSessionOnHost(sessionId)
        hooks?.onSessionChanged?.(sessionId)
        return makeJsonResponse(200, { ok: true, verified: true, state: toPublicHostState(next), unarchived: true })
      }
      return makeJsonResponse(200, { ok: true, verified: true, state: toPublicHostState(current) })
    }

    if (action === 'clear-pin' || action === 'unbind-2fa') {
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
      }))
      for (const sid of previouslyLocked) {
        await unarchiveSessionOnHost(sid)
        hooks?.onSessionChanged?.(sid)
      }
      return makeJsonResponse(200, { ok: true, unarchivedIds: previouslyLocked, state: toPublicHostState(next) })
    }

    return makeJsonResponse(400, { ok: false, error: 'UNKNOWN_LOCK_ACTION' })
  }

  const handleMove = async (request: unknown): Promise<unknown> => {
    const body = await readRequestJson(request)
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const targetWorkspaceId = typeof body.targetWorkspaceId === 'string' ? body.targetWorkspaceId.trim() : ''
    const targetPath = typeof body.targetPath === 'string' ? body.targetPath.trim() : ''
    const sourceCwd = typeof body.sourceCwd === 'string' ? body.sourceCwd.trim() : undefined

    if (!sessionId || !targetWorkspaceId) {
      return makeJsonResponse(400, { ok: false, error: 'MISSING_MOVE_PARAMS' })
    }

    const current = await store.read()
    if (current.lockedSessionIds.includes(sessionId)) {
      return makeJsonResponse(403, { ok: false, error: 'SESSION_LOCKED' })
    }
    if (current.deletedSessionIds.includes(sessionId)) {
      return makeJsonResponse(404, { ok: false, error: 'SESSION_DELETED' })
    }

    // Attempt physical session log header cwd update + Zstd/JSONL relocation inside persistence root
    if (targetPath) {
      try {
        const fs = await loadNodeModule<any>('node:fs/promises')
        const pathMod = await loadNodeModule<any>('node:path')
        const sp = ctx.get?.('sessionPersistence') as {
          locate?: (meta: { id: string; cwd?: string }) => { path?: string }
        } | undefined
        const info = await resolveSessionFiles(ctx, sessionId, sourceCwd)
        if (info.root && info.files.length > 0 && typeof sp?.locate === 'function') {
          const destFileRaw = sp.locate({ id: sessionId, cwd: targetPath })?.path
          const destFile = destFileRaw ? pathMod.resolve(destFileRaw) : undefined
          if (destFile && isInsideRoot(pathMod, info.root, destFile)) {
            const srcFile = pathMod.resolve(info.files[0])
            if (isInsideRoot(pathMod, info.root, srcFile) && srcFile !== destFile) {
              const rawBuf = await fs.readFile(srcFile)
              const decoded = await decodeSessionLogText(srcFile, rawBuf)
              const hasTrailingNewline = decoded.endsWith('\n')
              const lines = decoded.split(/\r?\n/)
              if (lines[0]) {
                const hdr = JSON.parse(lines[0]) as Record<string, unknown>
                if (hdr && typeof hdr === 'object') {
                  hdr.cwd = targetPath
                  lines[0] = JSON.stringify(hdr)
                }
              }
              let updatedText = lines.join('\n')
              if (hasTrailingNewline && !updatedText.endsWith('\n')) updatedText += '\n'
              const encodedDest = await encodeSessionLogBuffer(destFile, updatedText)
              const destDir = pathMod.dirname(destFile)
              const srcDir = pathMod.dirname(srcFile)
              await fs.mkdir(destDir, { recursive: true })
              await fs.writeFile(destFile, encodedDest)
              if (srcDir !== destDir && isInsideRoot(pathMod, info.root, srcDir) && pathMod.basename(srcDir) === sessionId) {
                await copyDirExtras(fs, pathMod, srcDir, destDir, pathMod.basename(srcFile))
                await fs.rm(srcDir, { recursive: true, force: true }).catch(() => {})
              } else {
                await fs.rm(srcFile, { force: true }).catch(() => {})
              }
              await removeSessionProjCache(ctx, sessionId)
            }
          }
        }
      } catch {
        // Non-fatal: movedSessions mapping guarantees consistent UI state even if live session isn't flushed yet
      }
    }

    const next = await store.update(cur => ({
      ...cur,
      movedSessions: { ...cur.movedSessions, [sessionId]: targetWorkspaceId },
    }))
    hooks?.onSessionChanged?.(sessionId)
    return makeJsonResponse(200, { ok: true, state: toPublicHostState(next) })
  }

  const cancelLiveSession = async (sid: string): Promise<void> => {
    try {
      const sessions = ctx.get?.('sessions') as {
        get?: (id: string) => { cancel?: () => Promise<void> | void } | undefined
        cancel?: (id: string) => Promise<void> | void
      } | undefined
      await Promise.resolve(sessions?.cancel?.(sid))
      await Promise.resolve(sessions?.get?.(sid)?.cancel?.())
    } catch {}
  }

  const handleDelete = async (request: unknown): Promise<unknown> => {
    const body = await readRequestJson(request)
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const sourceCwd = typeof body.sourceCwd === 'string' ? body.sourceCwd.trim() : undefined

    if (!sessionId) {
      return makeJsonResponse(400, { ok: false, error: 'MISSING_SESSION_ID' })
    }

    const current = await store.read()
    if (current.lockedSessionIds.includes(sessionId)) {
      return makeJsonResponse(403, { ok: false, error: 'SESSION_LOCKED' })
    }

    await cancelLiveSession(sessionId)
    await purgeSessionArtifacts(ctx, sessionId, sourceCwd)

    const next = await store.update(cur => {
      const restMoved = { ...cur.movedSessions }
      delete restMoved[sessionId]
      return {
        ...cur,
        movedSessions: restMoved,
        lockedSessionIds: cur.lockedSessionIds.filter(id => id !== sessionId),
        deletedSessionIds: cur.deletedSessionIds.includes(sessionId)
          ? cur.deletedSessionIds
          : [...cur.deletedSessionIds, sessionId],
      }
    })
    hooks?.onSessionChanged?.(sessionId)
    return makeJsonResponse(200, { ok: true, state: toPublicHostState(next) })
  }

  const handleDeleteUngrouped = async (request: unknown): Promise<unknown> => {
    const body = await readRequestJson(request)
    const rawIds = Array.isArray(body.sessionIds) ? body.sessionIds : []
    const cwds = body.cwds && typeof body.cwds === 'object' ? (body.cwds as Record<string, string>) : {}
    const sessionIds = [...new Set(rawIds.filter((id): id is string => typeof id === 'string' && isSafeSegment(id.trim())).map(id => id.trim()))]

    const current = await store.read()
    const lockedSet = new Set(current.lockedSessionIds)
    const skippedLockedIds: string[] = []
    const toDeleteIds: string[] = []
    for (const sid of sessionIds) {
      if (lockedSet.has(sid)) {
        skippedLockedIds.push(sid)
      } else {
        toDeleteIds.push(sid)
      }
    }

    if (sessionIds.length > 0 && toDeleteIds.length === 0) {
      return makeJsonResponse(403, { ok: false, error: 'SESSION_LOCKED', skippedLockedIds })
    }

    for (const sid of toDeleteIds) {
      await cancelLiveSession(sid)
      const hintedCwd = typeof cwds[sid] === 'string' && cwds[sid].trim() ? cwds[sid].trim() : undefined
      await purgeSessionArtifacts(ctx, sid, hintedCwd)
    }

    const next = await store.update(cur => {
      const restMoved = { ...cur.movedSessions }
      const delSet = new Set(cur.deletedSessionIds)
      for (const sid of toDeleteIds) {
        delete restMoved[sid]
        delSet.add(sid)
      }
      return {
        ...cur,
        movedSessions: restMoved,
        deletedSessionIds: [...delSet],
      }
    })
    for (const sid of toDeleteIds) {
      hooks?.onSessionChanged?.(sid)
    }
    return makeJsonResponse(200, {
      ok: true,
      deletedIds: toDeleteIds,
      skippedLockedIds,
      state: toPublicHostState(next),
    })
  }

  // Prime state cache once at startup, sweep deleted session artifacts, and sync locked -> archived
  void store.read().then(async (initial) => {
    for (const delId of initial.deletedSessionIds) {
      await purgeSessionArtifacts(ctx, delId)
    }
    for (const lockedId of initial.lockedSessionIds) {
      await archiveSessionOnHost(lockedId)
    }
  }).catch(() => {})

  if (typeof ctx.inject === 'function') {
    try {
      const unsubWs = ctx.inject(['workspaceRegistry'], (scope: { workspaceRegistry?: HostWorkspaceRegistryLike }) => {
        workspaceRegistryRef = scope?.workspaceRegistry
        void store.read().then(async (initial) => {
          for (const lockedId of initial.lockedSessionIds) {
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
        if (typeof scope?.connection?.fetch?.register !== 'function') return () => {}
        const stops = [
          scope.connection.fetch.register({
            path: DELTA_STATE_PATH,
            methods: ['GET'],
            requestBody: 'buffered',
            fetch: () => handleState(),
          }),
          scope.connection.fetch.register({
            path: DELTA_SESSION_LOCK_PATH,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: req => handleLock(req),
          }),
          scope.connection.fetch.register({
            path: DELTA_SESSION_MOVE_PATH,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: req => handleMove(req),
          }),
          scope.connection.fetch.register({
            path: DELTA_SESSION_DELETE_PATH,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: req => handleDelete(req),
          }),
          scope.connection.fetch.register({
            path: DELTA_SESSION_DELETE_UNGROUPED_PATH,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: req => handleDeleteUngrouped(req),
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
            'delta-desktop: host session ops routes',
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
  }

  return () => {
    for (let i = unregisterCallbacks.length - 1; i >= 0; i--) {
      try { unregisterCallbacks[i]() } catch {}
    }
    unregisterCallbacks.length = 0
  }
}
