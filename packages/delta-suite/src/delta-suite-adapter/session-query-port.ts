/** Read-only Host session query adapter. No search policy, cache or mutation authority. */
import type { SessionSummary, SessionEventLike } from '../delta-suite-discovery/session-search-projection.js'

interface ObservationLeaseLike {
  events?: SessionEventLike[]
  header?: { title?: string; updatedAt?: number; workspaceId?: string }
  dispose?(): void
  [key: symbol]: (() => void) | undefined
}

const SYMBOL_DISPOSE = (Symbol as unknown as { dispose?: symbol }).dispose

function toTimestampMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) return parsed
    const num = Number(raw)
    if (Number.isFinite(num)) return num
  }
  return 0
}

export interface HostSessionQueryPort {
  listSummaries(workspaceFilter: string | undefined, maxSessions: number): Promise<SessionSummary[]>
  withObservation<T>(sessionId: string, project: (readEvents: () => readonly SessionEventLike[] | undefined) => T): Promise<T | undefined>
}

export function createHostSessionQueryPort(ctx: { get?(serviceName: string): unknown }): HostSessionQueryPort {
  const withObservation = async <T>(sessionId: string, project: (readEvents: () => readonly SessionEventLike[] | undefined) => T): Promise<T | undefined> => {
    const sessionQuery = ctx.get?.('sessionQuery') as {
      observeSession?: (id: string, opts?: { projectionMode?: string }) => Promise<ObservationLeaseLike>
    } | undefined
    if (!sessionQuery || typeof sessionQuery.observeSession !== 'function') {
      return undefined
    }

    let lease: ObservationLeaseLike | undefined
    try {
      lease = await sessionQuery.observeSession(sessionId, { projectionMode: 'none' })
      return project(() => lease?.events)
    } catch {
      return undefined
    } finally {
      // SessionQuery's observation lease uses Symbol.dispose; call one disposer only.
      try {
        const release = SYMBOL_DISPOSE && lease ? lease[SYMBOL_DISPOSE] : undefined
        if (typeof release === 'function') release.call(lease)
        else lease?.dispose?.()
      } catch {}
    }
  }

  const listSummaries = async (workspaceFilter: string | undefined, maxSessions: number): Promise<SessionSummary[]> => {
    const byId = new Map<string, SessionSummary>()
    const sessionQuery = ctx.get?.('sessionQuery') as {
      listSessions?: () => Promise<Array<{ header?: { id?: string; title?: string; workspaceId?: string; updatedAt?: number; createdAt?: number } }>>
    } | undefined
    if (sessionQuery && typeof sessionQuery.listSessions === 'function') {
      try {
        const records = await sessionQuery.listSessions()
        for (const rec of records ?? []) {
          const h = rec?.header
          if (!h?.id) continue
          if (workspaceFilter && h.workspaceId !== workspaceFilter) continue
          byId.set(h.id, {
            sessionId: h.id,
            title: typeof h.title === 'string' && h.title.trim() ? h.title.trim() : h.id,
            workspaceId: h.workspaceId,
            updatedAt: toTimestampMs(h.updatedAt ?? h.createdAt),
          })
        }
      } catch {
        // Fallback below
      }
    }

    const sessions = ctx.get?.('sessions') as {
      list?: () => Array<{
        id?: string
        sessionId?: string
        title?: string
        workspaceId?: string
        updatedAt?: number | string
        header?: { id?: string; title?: string; workspaceId?: string; updatedAt?: number | string }
      }>
    } | undefined
    if (sessions && typeof sessions.list === 'function') {
      try {
        for (const s of sessions.list() ?? []) {
          const id = s.id ?? s.sessionId ?? s.header?.id
          if (!id) continue
          const ws = s.workspaceId ?? s.header?.workspaceId
          if (workspaceFilter && ws !== workspaceFilter) continue
          if (!byId.has(id)) {
            const title = s.title ?? s.header?.title ?? id
            byId.set(id, {
              sessionId: id,
              title: typeof title === 'string' && title.trim() ? title.trim() : id,
              workspaceId: ws,
              updatedAt: toTimestampMs(s.updatedAt ?? s.header?.updatedAt),
            })
          }
        }
      } catch {
        // Ignore unavailable live sessions
      }
    }

    const sessionPersistence = ctx.get?.('sessionPersistence') as {
      list?: () => Promise<Array<{ id?: string; title?: string; workspaceId?: string; updatedAt?: number | string }>>
    } | undefined
    if (byId.size === 0 && sessionPersistence && typeof sessionPersistence.list === 'function') {
      try {
        for (const item of await sessionPersistence.list()) {
          if (!item?.id) continue
          if (workspaceFilter && item.workspaceId !== workspaceFilter) continue
          byId.set(item.id, {
            sessionId: item.id,
            title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : item.id,
            workspaceId: item.workspaceId,
            updatedAt: toTimestampMs(item.updatedAt),
          })
        }
      } catch {
        // Ignore unavailable persistence list
      }
    }

    return [...byId.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, maxSessions)
  }

  return { listSummaries, withObservation }
}
