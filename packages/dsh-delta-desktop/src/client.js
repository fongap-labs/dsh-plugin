/* Delta Desktop: minimal self-contained Harness Client Root smoke build.
 * Source JS is the shipped runtime entry. No private Host, DOM patching or
 * second Electron process. Native UI remains installed for rollback.
 */
;(() => {
  const PLUGIN_ID = '@fongap-labs/dsh-delta-desktop'
  const EMPTY_EVENTS = Object.freeze({ entries: Object.freeze([]), hasMore: false })
  const EMPTY_SOURCE = {
    getSnapshot() { return EMPTY_EVENTS },
    subscribe() { return () => {} },
  }
  const EMPTY_SESSION_STATE = Object.freeze({ running: false, openState: 'cold', loadingOlder: false })
  const style = {
    frame: { display: 'flex', height: '100vh', minHeight: 0, boxSizing: 'border-box', overflow: 'hidden', color: 'var(--dsw-alias-label-primary, #222)', background: 'var(--dsw-alias-bg-layer-1, #fff)', fontFamily: 'system-ui, sans-serif' },
    sidebar: { display: 'flex', flexDirection: 'column', flexShrink: 0, width: 260, minWidth: 0, borderRight: '1px solid #ddd', background: 'var(--dsw-alias-bg-layer-2, #f6f7f8)' },
    button: { padding: 10, border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', color: 'inherit', background: 'transparent', textAlign: 'left' },
    primary: { padding: 10, border: 'none', borderRadius: 8, background: '#286f78', color: 'white', cursor: 'pointer' },
    muted: { color: 'var(--dsw-alias-label-secondary, #777)', fontSize: 12 },
  }

  function textOf(value, depth = 0) {
    if (typeof value === 'string') return value
    if (value === null || value === undefined || depth >= 4) return ''
    if (Array.isArray(value)) {
      return value.slice(0, 40).map(item => textOf(item, depth + 1)).filter(Boolean).join('\n')
    }
    if (typeof value !== 'object') return ''
    if (typeof value.text === 'string') return value.text
    if (value.content !== undefined) return textOf(value.content, depth + 1)
    return ''
  }

  function readableEvents(snapshot) {
    const entries = Array.isArray(snapshot?.entries) ? snapshot.entries : []
    const rows = []
    for (let index = entries.length - 1; index >= 0 && rows.length < 120; index--) {
      const entry = entries[index]
      if (entry?.type !== 'event') continue
      const event = entry.event
      if (event?.type !== 'user/message' && event?.type !== 'assistant/message') continue
      const data = event.data ?? {}
      // Durable Assistant output lives in data.message.content, not data.stream.
      // Never print tool arguments, metadata or raw stream chunks.
      const content = event.type === 'assistant/message' ? data.message : data.content
      const body = textOf(content).slice(0, 25000)
      if (!body.trim()) continue
      rows.push({ key: String(event.seq ?? index) + ':' + event.type,
        who: event.type === 'user/message' ? 'You' : 'Assistant', body })
    }
    return rows.reverse()
  }

  function makePlugin(require) {
    const React = require('react')
    const h = React.createElement

    function Shell({ ctx }) {
      const catalog = React.useSyncExternalStore(
        listener => ctx.sessions.list.subscribe(listener),
        () => ctx.sessions.list.getSnapshot(),
      )
      const [sessionId, setSessionId] = React.useState('')
      const [binding, setBinding] = React.useState(null)
      const [draft, setDraft] = React.useState('')
      const [pending, setPending] = React.useState(false)
      const [error, setError] = React.useState('')
      const [search, setSearch] = React.useState('')
      const ids = catalog?.ids ?? []
      const selectedId = sessionId && catalog.byId[sessionId] ? sessionId : ids[0] ?? ''
      const needle = search.trim().toLocaleLowerCase()
      const shownIds = needle ? ids.filter(id => (catalog.byId[id]?.displayTitle ?? id).toLocaleLowerCase().includes(needle)) : ids
      // Harness's native AppFrame reserves the non-client caption row. Delta's
      // replacement root must respect the SAME platform-owned CSS variables.
      const html = typeof document === 'undefined' ? null : document.documentElement
      const hasWindowsCaption = html?.hasAttribute('data-windows-titlebar') ?? false
      const isFullscreen = html?.hasAttribute('data-fullscreen') ?? false
      const isMac = html?.dataset?.platform === 'darwin'
      const chromeInset = isFullscreen ? 0 : hasWindowsCaption
        ? 'var(--dsh-windows-titlebar-height, 48px)'
        : isMac ? 'var(--dsh-frame-top-clearance, 48px)' : 0

      React.useEffect(() => {
        setBinding(null)
        if (!selectedId) return
        let isActive = true
        let reference
        try { reference = ctx.sessions.retain(selectedId, { source: PLUGIN_ID }) }
        catch (reason) { setError(String(reason)); return }
        void reference.ready.then(() => {
          if (isActive) { setBinding(reference.binding); setError('') }
        }).catch(reason => { if (isActive) setError(String(reason)) })
        return () => { isActive = false; reference.release() }
      }, [selectedId])

      const active = binding?.sessionId === selectedId ? binding : null
      const events = React.useSyncExternalStore(
        listener => (active?.eventSource ?? EMPTY_SOURCE).subscribe(listener),
        () => (active?.eventSource ?? EMPTY_SOURCE).getSnapshot(),
      )
      const sessionState = React.useSyncExternalStore(
        listener => active?.session.subscribe(listener) ?? (() => {}),
        () => active?.session.getSnapshot() ?? EMPTY_SESSION_STATE,
      )
      const running = sessionState.running === true
      const messages = readableEvents(events)
      const isHistoryLoading = sessionState.openState === 'cold' || sessionState.openState === 'loading'
      const emptyMessage = isHistoryLoading
        ? 'Loading session history…'
        : sessionState.openState === 'error'
          ? 'Session history failed to load. Check Harness logs.'
          : events.hasMore
            ? 'No supported text in this loaded page. Older history is available.'
            : events.entries.length > 0
              ? 'Loaded events contain no supported text messages.'
              : 'No messages in loaded history.'

      async function createSession() {
        if (pending) return
        setPending(true); setError('')
        try { setSessionId(await ctx.sessions.create()) }
        catch (reason) { setError(String(reason)) }
        finally { setPending(false) }
      }
      async function send() {
        const text = draft.trim()
        if (!text || pending || !active) return
        setPending(true); setError('')
        try {
          const result = await active.session.prompt([{ type: 'text', text }], 'queue')
          if (result.ok) setDraft('')
          else setError(result.error?.message ?? 'The Host rejected the prompt.')
        } catch (reason) { setError(String(reason)) }
        finally { setPending(false) }
      }

      return h('main', { 'data-delta-desktop-root': '1', style: { ...style.frame, paddingTop: chromeInset } },
        h('aside', { style: style.sidebar },
          h('header', { style: { padding: 16, display: 'grid', gap: 12 } },
            h('strong', null, 'Delta Desktop'),
            h('span', { style: style.muted }, 'Harness plugin · rapid validation'),
            h('button', { type: 'button', style: style.primary, disabled: pending, onClick: () => { void createSession() } }, '+ New session')),
          h('div', { style: { padding: '0 10px 6px' } },
            h('input', { type: 'search', 'aria-label': 'Search sessions', value: search,
              onChange: event => setSearch(event.target.value), placeholder: 'Search sessions',
              style: { ...style.button, width: '100%', boxSizing: 'border-box', minWidth: 0, padding: 9,
                background: 'var(--dsw-alias-bg-layer-1, #fff)' } })),
          h('nav', { 'aria-label': 'Sessions', style: { flex: 1, minHeight: 0, padding: 10, overflowY: 'auto' } },
            ...shownIds.map(id => h('button', {
              key: id, type: 'button', onClick: () => setSessionId(id),
              title: catalog.byId[id]?.displayTitle ?? id,
              'aria-current': id === selectedId ? 'page' : undefined,
              style: { ...style.button, display: 'block', width: '100%', boxSizing: 'border-box',
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginBottom: 4, borderColor: id === selectedId ? '#286f78' : 'transparent' },
            }, (catalog.byId[id]?.running ? '● ' : '') + (catalog.byId[id]?.displayTitle ?? id)))),
          h('footer', { style: { ...style.muted, padding: 12 } }, String(shownIds.length) + ' / ' + String(ids.length) + ' sessions')),
        h('section', { style: { display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column' } },
          h('header', { style: { borderBottom: '1px solid #ddd', padding: 18 } },
            h('strong', null, selectedId ? (catalog.byId[selectedId]?.displayTitle ?? selectedId) : 'Select or create a session'),
            running ? h('span', { style: { ...style.muted, marginLeft: 12 } }, 'Running') : null),
          h('div', { role: 'log', 'aria-label': 'Session messages',
            style: { flex: 1, padding: 20, overflowY: 'auto', display: 'grid', alignContent: 'start', gap: 12 } },
            ...messages.map(row => h('article', { key: row.key,
              style: { border: '1px solid #ddd', borderRadius: 8, padding: 12, maxWidth: 850 } },
              h('strong', null, row.who),
              h('div', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 6 } }, row.body))),
            messages.length === 0 ? h('p', { style: style.muted },
              selectedId ? emptyMessage : 'Create a Session to start.') : null,
            active && events.hasMore ? h('button', {
              type: 'button', disabled: !!sessionState.loadingOlder,
              onClick: () => { void active.session.loadOlder().catch(reason => setError(String(reason))) },
              style: { ...style.button, maxWidth: 190 },
            }, sessionState.loadingOlder ? 'Loading older history…' : 'Load older history') : null),
          error ? h('p', { role: 'alert', style: { padding: '0 16px', color: '#b91c1c' } }, error) : null,
          h('div', { style: { padding: 14, borderTop: '1px solid #ddd', display: 'flex', alignItems: 'flex-end', gap: 10 } },
            h('textarea', { 'aria-label': 'Prompt', value: draft, rows: 2, disabled: !active || pending,
              onChange: event => setDraft(event.target.value),
              onKeyDown: event => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() }
              },
              style: { flex: 1, minWidth: 0, minHeight: 48, maxHeight: 168, boxSizing: 'border-box',
                resize: 'vertical', border: '1px solid #ddd', borderRadius: 8, padding: 10,
                color: 'inherit', background: 'transparent', font: 'inherit' },
              placeholder: active ? 'Message Harness Agent…' : 'Select a Session…' }),
            h('button', { type: 'button', style: { ...style.primary, minWidth: 72, height: 42,
              flexShrink: 0, alignSelf: 'flex-end' },
              disabled: !active || pending || !draft.trim(), onClick: () => { void send() } }, pending ? 'Sending…' : 'Send'))))
    }

    return {
      inject: ['slots', 'sessions'],
      apply(ctx) {
        ctx.effect(
          () => ctx.slots.register({ name: 'root', priority: -100 }, () => h(Shell, { ctx })),
          'delta-desktop:root-shell',
        )
        void ctx.sessions.refresh().catch(reason => {
          console.error('[dsh-delta-desktop] Session refresh failed', reason)
        })
      },
    }
  }

  if (!globalThis.__ModuleLoader__) {
    throw new Error('Delta Desktop requires the Harness browser Client Module Loader')
  }
  globalThis.__ModuleLoader__.load({ id: PLUGIN_ID, factory: makePlugin })
})()
