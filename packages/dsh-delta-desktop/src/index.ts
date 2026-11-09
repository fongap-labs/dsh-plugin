/**
 * Host-side Delta Desktop compatibility. Harness owns workspace persistence;
 * this plugin only guards the generated first-use workspace against deletion.
 */
export const name = '@fongap-labs/dsh-delta-desktop'
export const inject = ['workspaceRegistry']

interface Workspace {
  readonly id: string
  readonly path: string
  readonly sessionIds: readonly string[]
}
interface WorkspaceRegistry {
  get(id: string): Workspace | undefined
  list(): Workspace[]
  delete(id: string): Promise<boolean>
}
interface HostContext {
  workspaceRegistry: WorkspaceRegistry
  effect(factory: () => () => void, label?: string): void
}
export function isAutomaticDefaultWorkspace(path: string): boolean {
  return path.replace(/\\/g, '/').toLowerCase().endsWith('/deepseek-harness/default-workspace')
}
export function apply(ctx: HostContext): () => void {
  const registry = ctx.workspaceRegistry
  const originalDelete = registry.delete
  if (typeof originalDelete !== 'function') return () => {}
  let isActive = true
  const guardedDelete = function (id: string): Promise<boolean> {
    const target = registry.get(id)
    if (isActive && target && isAutomaticDefaultWorkspace(target.path)) {
      const hasOtherWorkspace = registry.list().some(row => row.id !== id)
      const hasSessions = target.sessionIds.length > 0
      if (!hasOtherWorkspace || hasSessions) {
        return Promise.reject(new Error('delta/protected-default-workspace'))
      }
    }
    return originalDelete.call(registry, id)
  }
  registry.delete = guardedDelete
  const restore = (): void => {
    if (!isActive) return
    isActive = false
    if (registry.delete === guardedDelete) registry.delete = originalDelete
  }
  ctx.effect(() => restore, 'dsh-delta-desktop: guard default workspace registry deletion')
  return restore
}
