/**
 * The sole Harness-specific HTTP admission seam used by Delta Desktop.
 * Future Desktop core capabilities depend on this bridge rather than on
 * Harness's view tree, Electron internals, or private session persistence.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

export interface DesktopRouteHost {
  register(route: {
    name: string
    kind: 'exact'
    path: string
    handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>
  }): () => void
}
export interface DesktopAdmission {
  admit(request: IncomingMessage): { peer: unknown } | { rejection: 401 | 403 }
}
export interface DesktopGatewayAdapter {
  web: DesktopRouteHost
  connection: DesktopAdmission
  effect(register: () => () => void, label?: string): unknown
}
interface HostServices {
  webServer?: DesktopRouteHost
  connection?: DesktopAdmission
  effect?(register: () => () => void, label?: string): unknown
  get?(name: string): unknown
}
export function withDesktopGateway(
  ctx: Context,
  configure: (gateway: DesktopGatewayAdapter) => void,
): void {
  const host = ctx as unknown as HostServices & {
    inject?: (deps: string[], callback: (services: unknown) => void) => unknown
  }
  host?.inject?.(['connection', 'webServer'], (services: unknown) => {
    const scope = services as HostServices
    const web = scope.webServer ?? scope.get?.('webServer') as DesktopRouteHost | undefined
    const connection = scope.connection ?? scope.get?.('connection') as DesktopAdmission | undefined
    if (!web || !connection || !scope.effect) return
    configure({ web, connection, effect: scope.effect.bind(scope) })
  })
}
