import { TaskIntentTracker } from './task-intent-policy.js'

interface ClaimedMessage {
  agent?: object
  turn?: number
  message?: {
    source?: { kind?: string }
    content?: Array<{ type?: string; text?: string }>
  }
}

interface AgentState {
  agent?: object
  status?: string
}

interface PromptHost {
  systemPrompt?: {
    context?(entry: {
      name: string
      order: number
      interpolate: boolean
      text(context: { agent?: object }): string
    }): (() => void) | void
  }
}

export interface TaskIntentHostContext {
  on?(event: string, listener: (...args: any[]) => void): (() => void) | void
  inject?(services: string[], listener: (child: any) => void | (() => void)): unknown
}

function release(handle: unknown): void {
  if (typeof handle === 'function') {
    try { handle() } catch { /* Host owns scope teardown. */ }
    return
  }
  const dispose = (handle as { dispose?: () => unknown } | null)?.dispose
  if (typeof dispose === 'function') {
    try {
      const result = dispose.call(handle)
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        void (result as Promise<unknown>).catch(() => {})
      }
    } catch { /* Optional extension teardown never blocks Host. */ }
  }
}

/**
 * Native per-Agent user claims and dynamic system-prompt context only.
 * No conversation DOM, privileged tool interception, extra model, or task database.
 */
export function installHostTaskIntent(ctx: TaskIntentHostContext): () => void {
  if (typeof ctx.on !== 'function' || typeof ctx.inject !== 'function') return () => {}
  const tracker = new TaskIntentTracker()
  const disposers: Array<() => void> = []
  let isActive = true

  const claim = ctx.on('agent/inbox/claimed', (payload: ClaimedMessage) => {
    if (!isActive || !payload?.agent || typeof payload.agent !== 'object' ||
      payload.message?.source?.kind !== 'user') return
    const text = Array.isArray(payload.message.content)
      ? payload.message.content
        .filter(part => part?.type === 'text' && typeof part.text === 'string')
        .map(part => part.text).join('\n')
      : ''
    if (text.trim()) tracker.capture(payload.agent, text, payload.turn)
  })
  if (typeof claim === 'function') disposers.push(claim)

  const idle = ctx.on('agent/status', (payload: AgentState) => {
    if (isActive && payload?.agent && payload.status === 'idle') {
      tracker.finishTurn(payload.agent)
    }
  })
  if (typeof idle === 'function') disposers.push(idle)

  const disposed = ctx.on('agent/disposed', (payload: AgentState) => {
    if (payload?.agent) tracker.release(payload.agent)
  })
  if (typeof disposed === 'function') disposers.push(disposed)

  const injection = ctx.inject(['systemPrompt'], (child: PromptHost) => {
    if (!isActive || typeof child?.systemPrompt?.context !== 'function') return
    return child.systemPrompt.context({
      name: 'delta-suite:task-intent',
      order: 1250,
      interpolate: false,
      text: context => isActive ? tracker.guidance(context.agent) : '',
    })
  })

  return () => {
    if (!isActive) return
    isActive = false
    release(injection)
    for (const dispose of disposers.reverse()) release(dispose)
    tracker.dispose()
  }
}
