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
      const data = event?.data ?? {}
      if (event?.type === 'tool/call' || event?.type === 'tool/result') {
        // A tool event can be shown without exposing raw arguments/results,
        // attachment payloads, private metadata or approval assumptions.
        const name = event.type === 'tool/call' && typeof data.name === 'string'
          ? data.name.slice(0, 100) : 'Tool'
        const isError = event.type === 'tool/result' && data.message?.isError === true
        rows.push({ key: String(event.seq ?? index) + ':' + event.type,
          who: 'Tool', body: event.type === 'tool/call'
            ? 'Requested: ' + name : (isError ? 'Execution failed' : 'Result recorded') })
        continue
      }
      if (event?.type !== 'user/message' && event?.type !== 'assistant/message') continue
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
      const [workspace, setWorkspace] = React.useState('__all__')
      const [inspector, setInspector] = React.useState(true)
      const ids = catalog?.ids ?? []
      const rowOf = id => catalog?.byId?.[id] ?? {}
      const cwdOf = id => rowOf(id).cwd || '__unassigned__'
      const workspaceNames = [...new Set(ids.map(cwdOf))]
      const workspaceLabels = value => {
        if (value === '__unassigned__') return 'No workspace'
        return String(value).replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop() || String(value)
      }
      const scopedIds = workspace === '__all__' ? ids : ids.filter(id => cwdOf(id) === workspace)
      const selectedId = sessionId && scopedIds.includes(sessionId) ? sessionId : scopedIds[0] ?? ''
      const needle = search.trim().toLocaleLowerCase()
      const shownIds = needle ? scopedIds.filter(id => (rowOf(id).displayTitle ?? id).toLocaleLowerCase().includes(needle)) : scopedIds
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
      const eventCounters = { all: 0, user: 0, assistant: 0, tool: 0, other: 0 }
      for (const entry of events.entries ?? []) {
        if (entry.type !== 'event') continue
        eventCounters.all++
        const kind = entry.event?.type
        if (kind === 'user/message') eventCounters.user++
        else if (kind === 'assistant/message') eventCounters.assistant++
        else if (kind === 'tool/call' || kind === 'tool/result') eventCounters.tool++
        else eventCounters.other++
      }
      const selectedRow = rowOf(selectedId)
      const currentWorkspace = selectedRow.cwd || ''
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
        try {
          const options = workspace === '__all__' || workspace === '__unassigned__'
            ? undefined : { cwd: workspace }
          setSessionId(await ctx.sessions.create(options))
        }
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

      // A Delta-owned visual hierarchy: workspace rail -> session browser ->
      // conversation timeline -> read-only diagnostics. All data comes from the
      // injected public Harness Session service; there is no second Host/UI.
      const border = 'var(--dsw-alias-border-l3, #e2e5e9)'
      const secondary = 'var(--dsw-alias-label-secondary, #6d7784)'
      const soft = 'var(--dsw-alias-bg-layer-2, #f5f7fa)'
      const activeButton = { background: '#e5f1f2', color: '#125563' }
      const railButton = { display: 'block', cursor: 'pointer', border: 0,
        borderRadius: 12, width: 42, height: 42, fontSize: 17,
        background: 'transparent', color: '#a9c1c9' }
      const smallLabel = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: 1.2, color: secondary }
      const labelAndValue = (label, value) => h('div', { style: { display: 'grid', gap: 5,
        padding: '10px 0', borderBottom: '1px solid ' + border } },
        h('span', { style: smallLabel }, label),
        h('span', { style: { color: '#24323a', fontSize: 13, wordBreak: 'break-word' } }, value))
      const readable = String(selectedRow.displayTitle ?? selectedId ?? 'New conversation')
      const toolOnly = eventCounters.tool > 0 && eventCounters.user + eventCounters.assistant === 0
      const summary = selectedId ? (
        isHistoryLoading ? 'Opening session history…'
          : sessionState.openState === 'error' ? 'History could not be opened.'
            : events.entries.length > 0
              ? toolOnly ? 'This window contains tool activity but no visible text messages.'
                : 'The loaded event window contains no readable text. Its event summary is shown at right.'
              : 'No history is currently loaded for this session.'
      ) : 'Choose a session or create a new one.'
      return h('main', { 'data-delta-desktop-root': '1',
          style: { ...style.frame, paddingTop: chromeInset, background: '#fff' } },
        h('aside', { 'aria-label': 'Delta navigation',
          style: { width: 60, flexShrink: 0, background: '#162e3b',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 16, padding: '20px 8px', boxSizing: 'border-box' } },
          h('div', { title: 'Delta Desktop',
            style: { width: 38, height: 38, display: 'grid', placeItems: 'center',
              color: 'white', fontSize: 22, fontWeight: 750, borderRadius: 12,
              background: '#277a88' } }, 'Δ'),
          h('button', { type: 'button', title: 'All workspaces',
            'aria-label': 'All workspaces', onClick: () => setWorkspace('__all__'),
            style: { ...railButton, ...(workspace === '__all__'
              ? { background: '#2b5360', color: 'white' } : {}) } }, '▦'),
          h('button', { type: 'button', title: 'Session details',
            'aria-label': 'Toggle session details', onClick: () => setInspector(v => !v),
            style: { ...railButton, ...(inspector ? { color: 'white' } : {}) } }, 'ⓘ'),
          h('div', { style: { marginTop: 'auto', fontSize: 10, color: '#a9c1c9',
            writingMode: 'vertical-rl', transform: 'rotate(180deg)',
            letterSpacing: 1.2 } }, 'HARNESS PLUGIN')),
        h('aside', { 'aria-label': 'Session browser',
          style: { display: 'flex', flexDirection: 'column', flexShrink: 0,
            width: 274, minWidth: 0, minHeight: 0, background: soft,
            borderRight: '1px solid ' + border } },
          h('header', { style: { padding: '21px 16px 13px', display: 'grid', gap: 12 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between',
              alignItems: 'center' } },
              h('strong', { style: { fontSize: 18, color: '#172c37' } }, 'Workspaces'),
              h('span', { style: { fontSize: 12, color: secondary } }, String(workspaceNames.length))),
            h('button', { type: 'button', style: { ...style.primary, minHeight: 39,
              fontWeight: 650 }, disabled: pending,
              onClick: () => { void createSession() } }, '+ New session')),
          h('div', { 'aria-label': 'Workspace filters',
            style: { maxHeight: 177, overflowY: 'auto', padding: '2px 10px 8px',
              borderBottom: '1px solid ' + border } },
            h('button', { type: 'button', 'aria-current': workspace === '__all__' ? 'page' : undefined,
              onClick: () => setWorkspace('__all__'),
              style: { ...style.button, border: 0, width: '100%', minHeight: 33,
                background: workspace === '__all__' ? '#dfecf0' : 'transparent',
                fontWeight: 650, display: 'flex', justifyContent: 'space-between' } },
                h('span', null, 'All sessions'),
                h('span', { style: { color: secondary } }, String(ids.length))),
            ...workspaceNames.map(key => h('button', { key,
              type: 'button', title: key === '__unassigned__' ? 'No linked workspace' : key,
              'aria-current': workspace === key ? 'page' : undefined,
              onClick: () => setWorkspace(key),
              style: { ...style.button, width: '100%', border: 0, minHeight: 34,
                background: workspace === key ? '#dfecf0' : 'transparent',
                display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { style: { color: '#277a88' } }, '▣'),
              h('span', { style: { minWidth: 0, flex: 1, overflow: 'hidden',
                whiteSpace: 'nowrap', textOverflow: 'ellipsis' } }, workspaceLabels(key)),
              h('span', { style: { fontSize: 11, color: secondary } },
                String(ids.filter(id => cwdOf(id) === key).length))))),
          h('div', { style: { padding: '13px 14px 9px', display: 'grid', gap: 9 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
              h('strong', { style: { fontSize: 13 } }, 'Conversations'),
              h('span', { style: { fontSize: 12, color: secondary } }, String(scopedIds.length))),
            h('input', { type: 'search', 'aria-label': 'Search sessions', value: search,
              onChange: event => setSearch(event.target.value),
              placeholder: 'Find a conversation…',
              style: { border: '1px solid ' + border, borderRadius: 9,
                padding: '10px 11px', background: '#fff', color: '#263742',
                font: 'inherit', boxSizing: 'border-box', width: '100%' } })),
          h('nav', { 'aria-label': 'Sessions',
            style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 8px 10px' } },
            ...shownIds.map(id => h('button', { key: id, type: 'button',
              title: rowOf(id).displayTitle ?? id,
              'aria-current': id === selectedId ? 'page' : undefined,
              onClick: () => setSessionId(id),
              style: { ...style.button, border: 0, width: '100%',
                boxSizing: 'border-box', textAlign: 'left', minWidth: 0,
                background: id === selectedId ? '#e3eef1' : 'transparent',
                borderLeft: id === selectedId ? '3px solid #277a88' : '3px solid transparent',
                borderRadius: 7, padding: '11px 10px', marginBottom: 2,
                display: 'flex', gap: 8, alignItems: 'center' } },
              h('span', { style: { width: 7, height: 7, borderRadius: '50%',
                background: rowOf(id).running ? '#249d71' : '#b5c3c8', flexShrink: 0 } }),
              h('span', { style: { display: 'block', whiteSpace: 'nowrap',
                textOverflow: 'ellipsis', overflow: 'hidden', flex: 1 } },
                rowOf(id).displayTitle ?? id))),
            shownIds.length === 0 ? h('div', { style: { padding: 14, fontSize: 12, color: secondary } },
              search ? 'No matching conversations.' : 'No sessions in this workspace.') : null),
          h('footer', { style: { padding: '10px 16px', fontSize: 11, color: secondary,
            borderTop: '1px solid ' + border } },
            String(shownIds.length) + ' shown · ' + String(ids.length) + ' total')),
        h('section', { style: { display: 'flex', flex: 1, minWidth: 0, minHeight: 0,
            flexDirection: 'column', background: '#fff' } },
          h('header', { style: { padding: '15px 24px', minHeight: 72,
            boxSizing: 'border-box', borderBottom: '1px solid ' + border,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 16 } },
            h('div', { style: { minWidth: 0, display: 'grid', gap: 4 } },
              h('div', { style: { fontSize: 11, color: secondary } },
                currentWorkspace ? workspaceLabels(currentWorkspace) + ' / Conversation' : 'Delta Desktop / Conversation'),
              h('strong', { title: readable,
                style: { fontSize: 17, color: '#1f3039', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, readable)),
            h('div', { style: { display: 'flex', flexShrink: 0, gap: 10, alignItems: 'center' } },
              h('span', { style: { padding: '6px 9px', borderRadius: 50,
                background: running ? '#dff7eb' : '#f0f2f4',
                color: running ? '#12754b' : '#687984', fontSize: 12 } },
                running ? '● Running' : 'Idle'),
              running && active && typeof active.session.cancel === 'function'
                ? h('button', { type: 'button', style: { ...style.button, padding: '8px 12px' },
                  onClick: () => { void active.session.cancel().catch(reason => setError(String(reason))) } }, 'Stop')
                : null,
              h('button', { type: 'button', style: { ...style.button, padding: '8px 12px' },
                onClick: () => setInspector(v => !v) }, inspector ? 'Hide details' : 'Show details'))),
          h('div', { role: 'log', 'aria-label': 'Session messages',
            style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '26px 30px 36px',
              display: 'flex', flexDirection: 'column', gap: 16, background: '#fff' } },
            ...messages.map(row => h('article', { key: row.key,
              style: { boxSizing: 'border-box', maxWidth: row.who === 'You' ? '84%' : '92%',
                alignSelf: row.who === 'You' ? 'flex-end' : 'flex-start',
                background: row.who === 'You' ? '#e7f2f4' : '#f7f8fa',
                border: '1px solid ' + (row.who === 'You' ? '#d0e6ea' : border),
                padding: '14px 17px', borderRadius: 14 } },
              h('div', { style: { fontSize: 11, letterSpacing: .4,
                fontWeight: 750, color: row.who === 'You' ? '#1d6977' : '#536978',
                marginBottom: 8 } }, row.who === 'You' ? 'YOU' : 'ASSISTANT'),
              h('div', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                lineHeight: 1.65, color: '#24323c', fontSize: 14 } }, row.body))),
            messages.length === 0 ? h('div', { style: { padding: '12vh 16px 20px',
                margin: 'auto', maxWidth: 430, textAlign: 'center' } },
              h('div', { style: { fontSize: 35, color: '#488f9b', marginBottom: 14 } }, '◈'),
              h('strong', { style: { fontSize: 18, color: '#263b46' } },
                selectedId ? 'No conversation text in this window' : 'Your workspace is ready'),
              h('p', { style: { color: secondary, lineHeight: 1.6, fontSize: 13 } }, summary),
              selectedId ? h('p', { style: { color: secondary, fontSize: 12 } },
                String(eventCounters.all) + ' durable events · ' +
                String(eventCounters.user) + ' user · ' +
                String(eventCounters.assistant) + ' assistant · ' +
                String(eventCounters.tool) + ' tool') : null)
              : null,
            active && events.hasMore && typeof active.session.loadOlder === 'function'
              ? h('button', { type: 'button', disabled: !!sessionState.loadingOlder,
                onClick: () => { void active.session.loadOlder().catch(reason => setError(String(reason))) },
                style: { ...style.button, alignSelf: 'center', padding: '10px 20px' } },
                sessionState.loadingOlder ? 'Loading older history…' : 'Load older history')
              : null),
          error ? h('p', { role: 'alert', style: { margin: 0, padding: '9px 22px',
              background: '#fff1f2', color: '#a32232', fontSize: 12 } }, error) : null,
          h('footer', { style: { padding: '14px 22px 17px', borderTop: '1px solid ' + border,
              boxShadow: '0 -5px 22px rgba(20,50,60,.035)' } },
            h('div', { style: { display: 'flex', gap: 10,
              border: '1px solid ' + border, borderRadius: 12,
              padding: 9, background: '#fff' } },
              h('textarea', { 'aria-label': 'Prompt', value: draft, rows: 2,
                disabled: !active || pending,
                onChange: event => setDraft(event.target.value),
                onKeyDown: event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void send()
                  }
                },
                placeholder: active ? 'Message Harness Agent…' : 'Select a conversation…',
                style: { border: 0, outline: 'none', flex: 1, minWidth: 0,
                  color: '#1f3039', minHeight: 46, maxHeight: 170,
                  boxSizing: 'border-box', resize: 'vertical', padding: '10px 12px',
                  font: 'inherit', background: 'transparent' } }),
              h('button', { type: 'button', disabled: !active || pending || !draft.trim(),
                onClick: () => { void send() }, style: { ...style.primary,
                  minWidth: 73, alignSelf: 'flex-end', height: 42,
                  flexShrink: 0, borderRadius: 8 } }, pending ? 'Sending…' : 'Send')),
            h('div', { style: { textAlign: 'center', fontSize: 11,
              color: secondary, paddingTop: 8 } },
              'Enter to send · Shift+Enter for a line break · Harness remains the runtime'))),
        inspector ? h('aside', { 'aria-label': 'Session details',
          style: { display: 'flex', flexDirection: 'column', width: 248, flexShrink: 0,
            borderLeft: '1px solid ' + border, background: '#fafbfc',
            boxSizing: 'border-box', overflowY: 'auto', padding: '22px 17px' } },
          h('div', { style: { display: 'grid', gap: 4, marginBottom: 20 } },
            h('strong', { style: { color: '#243744', fontSize: 16 } }, 'Session details'),
            h('span', { style: { fontSize: 12, color: secondary } },
              'Harness Session Controller')),
          labelAndValue('Workspace', currentWorkspace
            ? workspaceLabels(currentWorkspace) : 'Not assigned'),
          labelAndValue('Session status',
            isHistoryLoading ? 'Opening…'
              : sessionState.openState === 'error' ? 'Open failed'
                : running ? 'Running' : 'Idle'),
          labelAndValue('Loaded history', String(eventCounters.all) + ' durable events'),
          labelAndValue('User / Assistant', String(eventCounters.user) +
            ' / ' + String(eventCounters.assistant)),
          labelAndValue('Tool activity', String(eventCounters.tool) + ' events'),
          labelAndValue('Other events', String(eventCounters.other)),
          labelAndValue('Older history', events.hasMore ? 'Available' : 'Not indicated'),
          h('div', { style: { paddingTop: 20, fontSize: 12, lineHeight: 1.65,
            color: secondary } },
            'Preview scope: text messages and session metadata only. Full tool approvals, rich attachments and stream rendering require further implementation.')) : null)

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
