import type { RuntimeStatus, RuntimeStatusPort } from './desktop-host-contract'
import { desktopHost } from './desktop-host-client'

const disconnectedStatus: RuntimeStatus = {
  state: 'offline',
  message: '尚未连接 Harness',
}

let status: RuntimeStatus = disconnectedStatus
let isBootstrapped = false
const listeners = new Set<() => void>()

function publish(next: RuntimeStatus) {
  status = next
  for (const listener of listeners) listener()
}

async function bootstrap() {
  if (isBootstrapped) return
  isBootstrapped = true

  try {
    await desktopHost.onRuntimeStatus(publish)
    const current = await desktopHost.getStatus()
    publish(current)
    if (current.state === 'ready') await desktopHost.handshake()
  } catch {
    // Browser previews and an unconnected runtime stay in the explicit offline state.
  }
}

export const desktopHostStatus: RuntimeStatusPort = {
  getSnapshot: () => status,
  subscribe(listener) {
    listeners.add(listener)
    void bootstrap()
    return () => listeners.delete(listener)
  },
}
