import type { Context } from '@deepseek-ai/cordis'
import {
  SESSION_REPOSITORY_EMPTY, foldSessionRepositoryEvent, parseSessionRepositoryState,
  type SessionRepositoryState,
} from '../../../delta-code-repository/session-repository-policy.js'

type ProjectionHandle = { stateOf(session: unknown): SessionRepositoryState; dispose(): Promise<void> }
type ProjectionRegistry = { register(definition: unknown): Promise<ProjectionHandle> }
export interface NativeSessionRepositoryReader {
  read(agent: unknown): SessionRepositoryState | undefined
  dispose(): void
}

/** Replay validated attach/detach tool results through DSH's native session projection.
 * No on-disk database, global repository map, or session ID taken from model input.
 */
export function registerNativeSessionRepositories(ctx: Context): NativeSessionRepositoryReader {
  let active = true
  let epoch = 0
  let handle: ProjectionHandle | undefined
  const release = (old?: ProjectionHandle) => {
    if (!old) return
    void Promise.resolve().then(() => old.dispose()).catch(() => {
      ctx.logger?.warn?.('delta-code: session repository projection disposal failed')
    })
  }
  const clear = () => {
    const old = handle
    handle = undefined
    release(old)
  }
  const definition = {
    key: 'deltaCodeSessionRepositories',
    stateVersion: 1,
    stateSchema: { parse: parseSessionRepositoryState },
    init: () => ({ ...SESSION_REPOSITORY_EMPTY, bindings: [], pending: [] }),
    apply: foldSessionRepositoryEvent,
  }
  const injection = ctx.inject(['sessionProjections'], child => {
    if (!active) return
    const service = (child as unknown as { sessionProjections?: ProjectionRegistry }).sessionProjections
    if (typeof service?.register !== 'function') return
    const current = ++epoch
    clear()
    let scopeActive = true
    try {
      void Promise.resolve(service.register(definition)).then(value => {
        if (!active || !scopeActive || current !== epoch) { release(value); return }
        handle = value
      }).catch(() => {
        ctx.logger?.warn?.('delta-code: session repository projection registration failed')
      })
    } catch {
      ctx.logger?.warn?.('delta-code: session repository projection registration failed')
    }
    return () => {
      scopeActive = false
      if (current !== epoch) return
      epoch++
      clear()
    }
  })
  return {
    read(agent) {
      if (!active || !handle || !agent || typeof agent !== 'object') return undefined
      const session = (agent as { session?: unknown }).session
      if (!session) return undefined
      return parseSessionRepositoryState(handle.stateOf(session))
    },
    dispose() {
      if (!active) return
      active = false
      epoch++
      clear()
      const dispose = (injection as { dispose?: () => Promise<void> } | null)?.dispose
      if (typeof dispose === 'function') {
        void Promise.resolve().then(() => dispose.call(injection)).catch(() => {
          ctx.logger?.warn?.('delta-code: session repository projection injection disposal failed')
        })
      }
    },
  }
}
