/**
 * Local, opt-in durable memory for Delta UI. DSH session history and compaction
 * remain owned by the Host. Never store raw conversation logs or credentials.
 *
 * The built-in SQLite engine keeps the bundle dependency-free on Node >= 22.13.
 * Older Node runtimes retain the rest of Delta UI and get a precise error.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, chmod } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

export type MemoryScope = 'global' | 'project' | 'session'
export type MemoryCategory = 'preference' | 'fact' | 'decision' | 'task' | 'other'
export interface MemoryRecord {
  id: string
  scope: MemoryScope
  scopeId: string
  key: string
  category: MemoryCategory
  content: string
  sourceSession: string
  source: string
  createdAt: number
  updatedAt: number
  expiresAt: number | null
  pinned: boolean
  status: 'active' | 'superseded'
}
export interface MemoryInput {
  id?: string
  scope?: string
  scopeId?: string
  key?: string
  category?: string
  content?: string
  sourceSession?: string
  source?: string
  expiresAt?: number | null
  pinned?: boolean
}
export interface MemoryQuery {
  query?: string
  projectId?: string
  sessionId?: string
  scope?: string
  scopeId?: string
  limit?: number
}
export interface MemorySettings {
  /** Model may proactively save only explicit durable statements. Default off. */
  autoCapture: boolean
  /** Model may use a search tool when historic facts are relevant. Default on. */
  recall: boolean
}
interface SqlStatement {
  run(...params: unknown[]): unknown
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
}
type SqliteDatabase = Pick<DatabaseSync, 'exec' | 'prepare' | 'close'>

const ALLOWED_SCOPE = new Set(['global', 'project', 'session'])
const ALLOWED_CATEGORY = new Set(['preference', 'fact', 'decision', 'task', 'other'])
const SECRET = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|passwd|api[_ -]?key|access[_ -]?token|secret|密码|口令|密钥)\s*[:=：]\s*\S+|(?:sk-|ghp_|github_pat_)[a-zA-Z0-9_-]{16,})/i
const MAX_CONTENT = 4000
const MAX_IMPORT = 500
const MAX_RESULTS = 50
const DEFAULT_SETTINGS: MemorySettings = { autoCapture: false, recall: true }

const localPath = (): string => join(
  process.env.DSH_HOME || join(homedir(), '.dsh'), 'delta-memory', 'memory.sqlite',
)
const clampLimit = (value: unknown): number => Number.isSafeInteger(value)
  ? Math.max(1, Math.min(MAX_RESULTS, Number(value))) : 20
const bound = (value: unknown, max: number, label: string): string => {
  if (typeof value !== 'string' || value.length > max) throw new Error('invalid ' + label)
  return value.trim()
}
const required = (value: unknown, max: number, label: string): string => {
  const result = bound(value, max, label)
  if (!result) throw new Error(label + ' required')
  return result
}
const safeId = (value: unknown, label: string): string => {
  const str = bound(value, 160, label)
  if (str && !/^[\p{L}\p{N}_.:/@ -]+$/u.test(str)) throw new Error('invalid ' + label)
  return str
}
const scopeOf = (value: unknown): MemoryScope => {
  const scope = value === undefined ? 'global' : value
  if (!ALLOWED_SCOPE.has(String(scope))) throw new Error('invalid memory scope')
  return scope as MemoryScope
}
const categoryOf = (value: unknown): MemoryCategory => {
  const category = value === undefined ? 'other' : value
  if (!ALLOWED_CATEGORY.has(String(category))) throw new Error('invalid memory category')
  return category as MemoryCategory
}
const expiryOf = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null
  if (!Number.isSafeInteger(value) || Number(value) <= Date.now()) {
    throw new Error('expiresAt must be a future Unix timestamp in milliseconds')
  }
  return Number(value)
}
const validateContent = (value: unknown): string => {
  const content = required(value, MAX_CONTENT, 'content')
  if (SECRET.test(content)) throw new Error('Potential credential detected; sensitive values cannot be stored')
  return content
}
const normalize = (row: Record<string, unknown>): MemoryRecord => ({
  id: String(row.id), scope: String(row.scope) as MemoryScope,
  scopeId: String(row.scope_id), key: String(row.memory_key),
  category: String(row.category) as MemoryCategory, content: String(row.content),
  sourceSession: String(row.source_session), source: String(row.source),
  createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
  expiresAt: row.expires_at === null ? null : Number(row.expires_at),
  pinned: row.pinned === 1, status: String(row.status) as MemoryRecord['status'],
})
const FIELDS = 'id, scope, scope_id, memory_key, category, content, source_session, source, created_at, updated_at, expires_at, pinned, status'

export class DeltaMemory {
  private db: SqliteDatabase | null = null
  private opening: Promise<SqliteDatabase> | null = null
  private fts = false

  private async open(): Promise<SqliteDatabase> {
    if (this.db) return this.db
    if (this.opening) return this.opening
    this.opening = this.initialize().catch(error => {
      this.opening = null
      throw error
    })
    return this.opening
  }

  private async initialize(): Promise<SqliteDatabase> {
    let ctor: typeof import('node:sqlite').DatabaseSync
    try { ({ DatabaseSync: ctor } = await import('node:sqlite')) }
    catch { throw new Error('Delta memory requires Node.js with built-in node:sqlite (Node 22.13+ recommended)') }
    const path = localPath()
    await mkdir(join(path, '..'), { recursive: true, mode: 0o700 })
    const db = new ctor(path)
    try {
      db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;')
      db.exec(
        'CREATE TABLE IF NOT EXISTS memories (' +
        'id TEXT PRIMARY KEY, scope TEXT NOT NULL, scope_id TEXT NOT NULL,' +
        'memory_key TEXT NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL,' +
        'source_session TEXT NOT NULL, source TEXT NOT NULL,' +
        'created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,' +
        'expires_at INTEGER, pinned INTEGER NOT NULL DEFAULT 0,' +
        "status TEXT NOT NULL DEFAULT 'active');" +
        'CREATE INDEX IF NOT EXISTS idx_delta_memory_scope ON memories(scope, scope_id, status);' +
        'CREATE INDEX IF NOT EXISTS idx_delta_memory_expiry ON memories(expires_at);' +
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_delta_memory_key ON memories(scope, scope_id, memory_key) WHERE memory_key <> '' AND status='active';" +
        'CREATE TABLE IF NOT EXISTS memory_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
      )
      try {
        db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id UNINDEXED, content, tokenize='unicode61')")
        // Idempotently repair an FTS table after an interrupted earlier write.
        db.exec('DELETE FROM memory_fts; INSERT INTO memory_fts(id, content) SELECT id, content FROM memories WHERE status=\'active\';')
        this.fts = true
      } catch {
        this.fts = false // Older SQLite builds: bounded substring search still works.
      }
      try { await chmod(path, 0o600) } catch { /* Windows uses ACLs */ }
      this.db = db
      return db
    } catch (error) {
      db.close()
      throw error
    }
  }

  private transaction<T>(db: SqliteDatabase, work: () => T): T {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      db.exec('COMMIT')
      return result
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  private syncFts(db: SqliteDatabase, id: string, content?: string): void {
    if (!this.fts) return
    db.prepare('DELETE FROM memory_fts WHERE id=?').run(id)
    if (content !== undefined) db.prepare('INSERT INTO memory_fts(id, content) VALUES(?,?)').run(id, content)
  }
  async settings(): Promise<MemorySettings> {
    const db = await this.open()
    const row = db.prepare("SELECT value FROM memory_config WHERE key='settings'").get() as { value?: string } | undefined
    try {
      const value = JSON.parse(row?.value || '{}') as Partial<MemorySettings>
      return {
        autoCapture: value.autoCapture === true,
        recall: value.recall !== false,
      }
    } catch { return { ...DEFAULT_SETTINGS } }
  }
  async setSettings(value: Partial<MemorySettings>): Promise<MemorySettings> {
    if (value.autoCapture !== undefined && typeof value.autoCapture !== 'boolean') throw new Error('invalid autoCapture')
    if (value.recall !== undefined && typeof value.recall !== 'boolean') throw new Error('invalid recall')
    const db = await this.open()
    const next = { ...await this.settings(), ...value }
    db.prepare("INSERT INTO memory_config(key, value) VALUES('settings', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(JSON.stringify(next))
    return next
  }

  async list(query: MemoryQuery = {}): Promise<MemoryRecord[]> {
    const db = await this.open()
    const scope = query.scope === undefined ? undefined : scopeOf(query.scope)
    const scopeId = query.scopeId === undefined ? undefined : safeId(query.scopeId, 'scopeId')
    const conditions = ['status=\'active\'', '(expires_at IS NULL OR expires_at>?)']
    const params: unknown[] = [Date.now()]
    if (scope !== undefined) { conditions.push('scope=?'); params.push(scope) }
    if (scopeId !== undefined) { conditions.push('scope_id=?'); params.push(scopeId) }
    const rows = db.prepare('SELECT ' + FIELDS + ' FROM memories WHERE ' + conditions.join(' AND ') +
      ' ORDER BY pinned DESC, updated_at DESC LIMIT ?').all(...params, clampLimit(query.limit))
    return (rows as Record<string, unknown>[]).map(normalize)
  }
  async get(id: string): Promise<MemoryRecord | null> {
    const db = await this.open()
    const row = db.prepare('SELECT ' + FIELDS + ' FROM memories WHERE id=?').get(required(id, 100, 'id'))
    return row ? normalize(row as Record<string, unknown>) : null
  }
  async save(input: MemoryInput): Promise<MemoryRecord> {
    const db = await this.open()
    const scope = scopeOf(input.scope)
    const scopeId = scope === 'global' ? '' : safeId(input.scopeId, 'scopeId')
    if (scope !== 'global' && !scopeId) throw new Error('scopeId required for project/session memory')
    const category = categoryOf(input.category)
    const content = validateContent(input.content)
    const key = input.key === undefined ? '' : safeId(input.key, 'memory key').toLocaleLowerCase()
    const sourceSession = input.sourceSession === undefined ? '' : safeId(input.sourceSession, 'sourceSession')
    const source = input.source === undefined ? 'manual' : bound(input.source, 160, 'source')
    const expiresAt = expiryOf(input.expiresAt)
    if (input.pinned !== undefined && typeof input.pinned !== 'boolean') throw new Error('invalid pinned')
    const now = Date.now()
    const id = input.id === undefined ? randomUUID() : required(input.id, 100, 'id')
    this.transaction(db, () => {
      const existing = db.prepare('SELECT id FROM memories WHERE id=?').get(id)
      if (input.id !== undefined && !existing) throw new Error('memory does not exist')
      // Stable keys reconcile conflicting decisions, without leaking discarded content
      // into another system or an immutable event log.
      if (key) {
        const previous = db.prepare("SELECT id FROM memories WHERE scope=? AND scope_id=? AND memory_key=? AND status='active' AND id<>?")
          .all(scope, scopeId, key, id) as Array<{ id: string }>
        for (const row of previous) {
          db.prepare("UPDATE memories SET status='superseded', updated_at=? WHERE id=?").run(now, row.id)
          this.syncFts(db, row.id)
        }
      }
      if (existing) {
        db.prepare('UPDATE memories SET scope=?,scope_id=?,memory_key=?,category=?,content=?,source_session=?,source=?,updated_at=?,expires_at=?,pinned=?,status=\'active\' WHERE id=?')
          .run(scope, scopeId, key, category, content, sourceSession, source, now, expiresAt, input.pinned ? 1 : 0, id)
      } else {
        const same = db.prepare("SELECT id FROM memories WHERE scope=? AND scope_id=? AND content=? AND status='active'")
          .get(scope, scopeId, content)
        if (same) throw new Error('duplicate memory')
        db.prepare('INSERT INTO memories(id,scope,scope_id,memory_key,category,content,source_session,source,created_at,updated_at,expires_at,pinned,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, scope, scopeId, key, category, content, sourceSession, source, now, now, expiresAt, input.pinned ? 1 : 0, 'active')
      }
      this.syncFts(db, id, content)
    })
    return (await this.get(id))!
  }

  async remove(id: string): Promise<boolean> {
    const db = await this.open()
    return this.transaction(db, () => {
      const result = db.prepare('DELETE FROM memories WHERE id=?').run(required(id, 100, 'id')) as { changes: number }
      this.syncFts(db, id)
      return result.changes > 0
    })
  }
  /** Scope isolation is enforced in SQL. Session scope cannot bleed into other sessions. */
  async search(query: MemoryQuery): Promise<MemoryRecord[]> {
    const db = await this.open()
    const text = required(query.query, 300, 'query')
    const projectId = query.projectId === undefined ? '' : safeId(query.projectId, 'projectId')
    const sessionId = query.sessionId === undefined ? '' : safeId(query.sessionId, 'sessionId')
    const limit = clampLimit(query.limit)
    const visibility = "(m.scope='global' OR (m.scope='project' AND m.scope_id=?) OR (m.scope='session' AND m.scope_id=?))"
    const params: unknown[] = [projectId, sessionId, Date.now()]
    const where = visibility + " AND m.status='active' AND (m.expires_at IS NULL OR m.expires_at>?)"
    const found = new Map<string, MemoryRecord>()
    if (this.fts) {
      // Quoted terms, not raw MATCH syntax: user input never becomes FTS operators.
      const terms = text.match(/[\p{L}\p{N}]{1,50}/gu)?.slice(0, 12) || []
      if (terms.length) {
        const match = terms.map(term => '"' + term.replace(/"/g, '""') + '"').join(' OR ')
        try {
          const sql = 'SELECT ' + FIELDS.split(', ').map(field => 'm.' + field).join(', ') +
            ' FROM memory_fts f JOIN memories m ON m.id=f.id WHERE f.content MATCH ? AND ' +
            where + ' ORDER BY m.pinned DESC, bm25(f) ASC, m.updated_at DESC LIMIT ?'
          const rows = db.prepare(sql).all(match, ...params, limit)
          for (const row of rows) {
            const memory = normalize(row as Record<string, unknown>)
            found.set(memory.id, memory)
          }
        } catch { /* Gracefully use LIKE for unsupported tokenizer/FTS builds. */ }
      }
    }
    // Always supplement exact substrings: SQLite unicode61 does not split all
    // Chinese compounds, and search must also work without FTS5.
    const rows = db.prepare('SELECT ' + FIELDS.split(', ').map(field => 'm.' + field).join(', ') +
      ' FROM memories m WHERE ' + where + ' AND instr(lower(m.content), lower(?))>0' +
      ' ORDER BY m.pinned DESC, m.updated_at DESC LIMIT ?').all(...params, text, limit)
    for (const row of rows) {
      const memory = normalize(row as Record<string, unknown>)
      if (!found.has(memory.id)) found.set(memory.id, memory)
    }
    return [...found.values()].slice(0, limit)
  }
  async export(): Promise<{ version: 1; memories: MemoryRecord[] }> {
    const db = await this.open()
    const rows = db.prepare('SELECT ' + FIELDS + ' FROM memories WHERE status=\'active\' ORDER BY updated_at DESC LIMIT 10000').all()
    return { version: 1, memories: (rows as Record<string, unknown>[]).map(normalize) }
  }
  async import(input: unknown): Promise<{ imported: number; skipped: number }> {
    if (!input || typeof input !== 'object') throw new Error('invalid import data')
    const data = input as { version?: unknown; memories?: unknown }
    if (data.version !== 1 || !Array.isArray(data.memories) || data.memories.length > MAX_IMPORT) {
      throw new Error('import requires version 1 and at most 500 memories per request')
    }
    let imported = 0
    let skipped = 0
    for (const entry of data.memories) {
      if (!entry || typeof entry !== 'object') { skipped++; continue }
      const row = entry as MemoryRecord
      try {
        await this.save({ scope: row.scope, scopeId: row.scopeId, key: row.key,
          category: row.category, content: row.content, sourceSession: row.sourceSession,
          source: 'import', pinned: row.pinned, expiresAt: row.expiresAt })
        imported++
      } catch { skipped++ }
    }
    return { imported, skipped }
  }
  close(): void {
    this.db?.close()
    this.db = null
    this.opening = null
  }
}

/** Singleton storage is shared by the browser API and model tools. */
export const deltaMemory = new DeltaMemory()
