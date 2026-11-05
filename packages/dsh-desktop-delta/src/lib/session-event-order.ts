import type { DesktopSessionEvent } from './desktop-host-contract'

export type EventOrder = 'accept' | 'duplicate' | 'gap' | 'invalid'

/**
 * The Rust adapter forwards cursor markers for unmapped SDK events.
 * The public SDK cannot replay missing events; gaps must remain visible.
 */
export class DesktopSessionEventOrder {
  private last = new Map<string, number>()

  observe(event: DesktopSessionEvent): EventOrder {
    if (!event.sessionId || !Number.isSafeInteger(event.sequence) || event.sequence < 0) return 'invalid'
    const previous = this.last.get(event.sessionId)
    if (previous !== undefined && event.sequence <= previous) return 'duplicate'
    this.last.set(event.sessionId, event.sequence)
    if (previous !== undefined && event.sequence > previous + 1) return 'gap'
    return 'accept'
  }

  clear(sessionId: string) {
    this.last.delete(sessionId)
  }
}
