import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  DesktopHostRequest,
  DesktopSessionEvent,
  DesktopSessionStatus,
  PromptContentBlock,
  RuntimeStatus,
} from './desktop-host-contract'

export interface RuntimeConnectInput {
  nodePath: string
  dshPath: string
  dshHome: string
  harnessPatchPath: string
  workspace: string
  provider: string
  model: string
}

export const desktopHost = {
  getStatus: () => invoke<RuntimeStatus>('runtime_status'),
  connect: (input: RuntimeConnectInput) => invoke<RuntimeStatus>('connect_runtime', {
    nodePath: input.nodePath,
    dshPath: input.dshPath,
    dshHome: input.dshHome || null,
    patchPath: input.harnessPatchPath.trim() || null,
    workspace: input.workspace || null,
    provider: input.provider,
    model: input.model,
  }),
  disconnect: () => invoke<void>('disconnect_runtime'),
  query: (sessionId: string, contentBlocks: readonly PromptContentBlock[]) =>
    invoke<void>('session_query', { sessionId, contentBlocks }),
  resume: (sessionId: string) => invoke<void>('resume_session', { sessionId }),
  setWorkingDirectory: (sessionId: string, path: string) =>
    invoke<string>('set_working_directory', { sessionId, path }),
  respondRequest: (id: DesktopHostRequest['id'], result: Record<string, unknown>) =>
    invoke<void>('respond_host_request', { id, result }),
  onRuntimeStatus: (listener: (status: RuntimeStatus) => void) =>
    listen<RuntimeStatus>('desktop:runtime-status', event => listener(event.payload)),
  onSessionEvent: (listener: (event: DesktopSessionEvent) => void) =>
    listen<DesktopSessionEvent>('desktop:session-event', event => listener(event.payload)),
  onSessionStatus: (listener: (status: DesktopSessionStatus) => void) =>
    listen<DesktopSessionStatus>('desktop:session-status', event => listener(event.payload)),
  onHostRequest: (listener: (request: DesktopHostRequest) => void) =>
    listen<DesktopHostRequest>('desktop:host-request', event => listener(event.payload)),
  onHostRequestCancelled: (listener: (requestId: string) => void) =>
    listen<{ requestId: string }>('desktop:host-request-cancelled', event => listener(event.payload.requestId)),
}
