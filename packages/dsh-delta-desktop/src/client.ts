/**
 * Delta Desktop B2 foundation: public Root Slot + public Client Session Controller.
 * No Electron process, second Host, DOM takeover or direct private Host store.
 *
 * The initial plugin shadows AppFrame. The optional delta-only profile overlay
 * is intentionally NOT activated until API/approval/settings parity is proven.
 */
;(() => {
  interface ReactApi {
    createElement(type: string | ((props: any) => unknown), props: Record<string, unknown> | null, ...children: unknown[]): unknown
    useState<T>(initial: T): [T, (value: T | ((previous: T) => T)) => void]
    useEffect(callback: () => void | (() => void), dependencies?: readonly unknown[]): void
    useSyncExternalStore<T>(subscribe: (listener: () => void) => () => void, snapshot: () => T): T
  }
  interface Observable<T> {
    getSnapshot(): T
    subscribe(listener: () => void): () => void
  }
  interface CatalogRow {
    readonly displayTitle?: string
    readonly running?: boolean
  }
  interface Catalog {
    readonly ids: readonly string[]
    readonly byId: Readonly<Record<string, CatalogRow>>
    readonly phase: 'pending' | 'ready'
  }
  interface SessionEvent {
    readonly type: string
    readonly data?: unknown
    readonly seq?: number
  }
  interface EventEntry {
    readonly type: 'event' | 'transient'
    readonly event: SessionEvent
  }
  interface EventWindow { readonly entries: readonly EventEntry[]; readonly hasMore: boolean }
  interface SessionFace extends Observable<{ readonly running?: boolean; readonly lastAgentError?: string | null }> {
    prompt(parts: readonly { type: 'text'; text: string }[], mode: 'queue' | 'steer'): Promise<{
      ok: boolean; error?: { message?: string }
    }>
  }
  interface Binding {
    readonly sessionId: string
    readonly session: SessionFace
    readonly eventSource: Observable<EventWindow>
  }
  interface SessionReference {
    readonly ready: Promise<Binding>
    readonly binding: Binding
    release(): void
  }
  interface SessionService {
    readonly list: Observable<Catalog>
    refresh(): Promise<void>
    create(): Promise<string>
    retain(id: string, options: { source: string }): SessionReference
  }
  interface ClientContext {
    readonly sessions: SessionService
    readonly slots: {
      register(options: { name: 'root'; priority: number }, component: () => unknown): () => void
    }
    effect(install: () => () => void, label: string): void
  }
  const NAME = '@fongap-labs/dsh-delta-desktop'
  const emptyEvents: EventWindow = Object.freeze({ entries: Object.freeze([]), hasMore: false })
  const noopSource: Observable<EventWindow> = {
    getSnapshot: () => emptyEvents,
    subscribe: () => () => {},
  }
  const palette = {
    frame: { display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: 'var(--dsw-alias-label-primary, #222)', background: 'var(--dsw-alias-bg-layer-1, #fff)' },
    sidebar: { width: 250, flexShrink: 0, borderRight: '1px solid var(--dsw-alias-border-l3, #ddd)', background: 'var(--dsw-alias-bg-layer-2, #f6f7f8)', display: 'flex', flexDirection: 'column' },
    button: { cursor: 'pointer', padding: '9px 12px', border: '1px solid var(--dsw-alias-border-l3, #ccc)', borderRadius: 8, color: 'inherit', background: 'transparent', textAlign: 'left' },
    primary: { cursor: 'pointer', padding: '9px 15px', border: 'none', borderRadius: 8, background: 'var(--dsw-alias-brand-primary, #286f78)', color: '#fff' },
    muted: { color: 'var(--dsw-alias-label-secondary, #777)', fontSize: 13 },
  } as const
  function textOf(value: unknown, depth = 0): string {
    if (typeof value === 'string') return value
    if (depth > 3 || value == null) return ''
    if (Array.isArray(value)) return value.slice(0, 40).map(part => textOf(part, depth + 1)).filter(Boolean).join('\n')
    if (typeof value !== 'object') return ''
    const o = value as Record<string, unknown>
    // Deliberately never stringify tool arguments, metadata, secrets or objects.
    if (typeof o.text === 'string') return o.text
    if (typeof o.content === 'string' || Array.isArray(o.content)) return textOf(o.content, depth + 1)
    if (o.message !== undefined) return textOf(o.message, depth + 1)
    if (o.output !== undefined) return textOf(o.output, depth + 1)
    return ''
  }
  function visibleEvents(window: EventWindow): Array<{ key: string; role: string; text: string }> {
    const result: Array<{ key: string; role: string; text: string }> = []
    // Bound render work even when a Session has thousands of durable events.
    for (let i = window.entries.length - 1; i >= 0 && result.length < 120; i--) {
      const item = window.entries[i]
      const event = item.event
      if (event.type !== 'user/message' && event.type !== 'assistant/message') continue
      const value = event.data && typeof event.data === 'object'
        ? event.data as Record<string, unknown> : {}
      const text = textOf(event.type === 'assistant/message' ? (value.stream ?? value.content) : value.content)
      if (!text.trim()) continue
      result.push({
        key: String(event.seq ?? i) + ':' + event.type,
        role: event.type === 'user/message' ? 'You' : 'Assistant',
        text: text.slice(0, 25000),
      })
    }
    return result.reverse()
  }
  function installClient(require: (name: string) => unknown): {
    inject: string[]; apply(ctx: ClientContext): void
  } {
    const React = require('react') as ReactApi
    const h = React.createElement.bind(React)
    function Shell(ctx: ClientContext): unknown {
      const catalog = React.useSyncExternalStore(
        listener => ctx.sessions.list.subscribe(listener),
        () => ctx.sessions.list.getSnapshot(),
      )
      const [selectedId, setSelectedId] = React.useState('')
      const [binding, setBinding] = React.useState<Binding | null>(null)
      const [draft, setDraft] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const activeId = selectedId && catalog.byId[selectedId] ? selectedId : (catalog.ids[0] ?? '')
      React.useEffect(() => {
        setBinding(null)
        if (!activeId) return
        let isActive = true
        let reference: SessionReference
        try { reference = ctx.sessions.retain(activeId, { source: NAME }) }
        catch (reason) { setError(String(reason)); return }
        void reference.ready.then(() => {
          if (isActive) { setBinding(reference.binding); setError('') }
        }).catch(reason => { if (isActive) setError(String(reason)) })
        return () => { isActive = false; reference.release() }
      }, [activeId])
      const current = binding?.sessionId === activeId ? binding : null
      const window = React.useSyncExternalStore(
        listener => (current?.eventSource ?? noopSource).subscribe(listener),
        () => (current?.eventSource ?? noopSource).getSnapshot(),
      )
      const stateSource = current?.session
      const fallbackState = React.useSyncExternalStore(
        listener => stateSource?.subscribe(listener) ?? (() => {}),
        () => stateSource?.getSnapshot()?.running ?? false,
      )
      const messages = visibleEvents(window)
      async function createSession(): Promise<void> {
        if (busy) return
        setBusy(true); setError('')
        try { const id = await ctx.sessions.create(); setSelectedId(id) }
        catch (reason) { setError(String(reason)) }
        finally { setBusy(false) }
      }
      async function send(): Promise<void> {
        const text = draft.trim()
        if (!text || busy || !current) return
        setBusy(true); setError('')
        try {
          const result = await current.session.prompt([{ type: 'text', text }], 'queue')
          if (!result.ok) { setError(result.error?.message ?? 'Prompt was rejected'); return }
          setDraft('')
        } catch (reason) { setError(String(reason)) }
        finally { setBusy(false) }
      }
      return h('main', { style: palette.frame, 'data-delta-desktop-root': '1' },
        h('aside', { style: palette.sidebar },
          h('header', { style: { padding: 16, display: 'grid', gap: 12 } },
            h('strong', null, 'Delta Desktop'),
            h('span', { style: palette.muted }, 'Harness plugin · B2 preview'),
            h('button', { type: 'button', style: palette.primary, disabled: busy,
              onClick: () => { void createSession() } }, '+ New session')),
          h('nav', { 'aria-label': 'Sessions', style: { flex: 1, overflowY: 'auto', padding: '0 8px 12px' } },
            ...catalog.ids.map(id => h('button', {
              key: id, type: 'button',
              style: { ...palette.button, width: '100%', marginBottom: 5,
                borderColor: id === activeId ? 'var(--dsw-alias-brand-primary, #286f78)' : 'transparent',
                background: id === activeId ? 'var(--dsw-alias-bg-layer-1, #fff)' : 'transparent' },
              onClick: () => setSelectedId(id),
            }, (catalog.byId[id]?.running ? '● ' : '') + (catalog.byId[id]?.displayTitle ?? id)))),
          h('footer', { style: { padding: 12, borderTop: '1px solid var(--dsw-alias-border-l3, #ddd)' } },
            h('span', { style: palette.muted }, catalog.phase === 'pending' ? 'Loading sessions…' : String(catalog.ids.length) + ' sessions'))),
        h('section', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh' } },
          h('header', { style: { padding: '18px 22px', borderBottom: '1px solid var(--dsw-alias-border-l3, #ddd)' } },
            h('strong', null, activeId ? (catalog.byId[activeId]?.displayTitle ?? activeId) : 'Select or create a session'),
            fallbackState ? h('span', { style: { ...palette.muted, marginLeft: 12 } }, 'Running') : null),
          h('div', { role: 'log', 'aria-label': 'Session messages', style: { flex: 1, overflowY: 'auto', padding: '20px', display: 'grid', alignContent: 'start', gap: 16 } },
            ...messages.map(row => h('article', { key: row.key,
              style: { border: '1px solid var(--dsw-alias-border-l3, #ddd)', borderRadius: 10, padding: '12px 16px', maxWidth: 820 } },
              h('strong', null, row.role),
              h('div', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 8 } }, row.text))),
            messages.length === 0 ? h('p', { style: palette.muted },
              activeId ? 'No supported text events in the current window.' : 'Create a session to start.') : null),
          error ? h('p', { role: 'alert', style: { color: '#b91c1c', padding: '0 20px', whiteSpace: 'pre-wrap' } }, error) : null,
          h('div', { style: { borderTop: '1px solid var(--dsw-alias-border-l3, #ddd)', padding: 16, display: 'flex', gap: 10 } },
            h('textarea', { 'aria-label': 'Prompt', value: draft,
              disabled: !current || busy,
              onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
              onKeyDown: (event: { key: string; shiftKey: boolean; preventDefault(): void }) => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() }
              },
              placeholder: current ? 'Message Harness Agent…' : 'Select a session…',
              style: { flex: 1, minWidth: 0, minHeight: 60, padding: 12, resize: 'vertical', borderRadius: 8,
                color: 'inherit', background: 'transparent', border: '1px solid var(--dsw-alias-border-l3, #ccc)', font: 'inherit' } }),
            h('button', { type: 'button', style: palette.primary,
              disabled: !current || busy || !draft.trim(), onClick: () => { void send() } }, busy ? 'Sending…' : 'Send'))))
    }
    return {
      inject: ['slots', 'sessions'],
      apply(ctx) {
        // Root is a builtin single Slot. Lower priority shadows AppFrame without
        // stealing its child-slot declarations; both disposers remain reversible.
        ctx.effect(() => ctx.slots.register({ name: 'root', priority: -100 }, () => Shell(ctx)),
          'dsh-delta-desktop: experimental root shell')
        void ctx.sessions.refresh().catch(error => { console.error('[dsh-delta-desktop] Session refresh failed:', error) })
      },
    }
  }
  const loader = (globalThis as { __ModuleLoader__?: {
    load(entry: { id: string; factory: (require: (name: string) => unknown) => unknown }): void
  } }).__ModuleLoader__
  if (!loader) throw new Error('Delta Desktop requires the Harness Client Module Loader')
  loader.load({ id: NAME, factory: installClient })
})()
