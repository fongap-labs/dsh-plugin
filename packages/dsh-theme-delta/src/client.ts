/**
 * Delta Theme browser module. It only registers its lazy factory while loading.
 * Layout/session ownership always remains with the official UI plugins.
 */
interface DeltaCopy {
  meta: { title: string; description: string }
  ui: {
    preference: string; theme: string; official: string; delta: string;
    open: string; close: string; conversation: string; sidebar: string;
    status: string; unavailable: string; recovery: string; shortcut: string;
  }
}
type Language = 'zh' | 'en'
type Mode = 'delta' | 'official'
type DeltaState = Readonly<{ mode: Mode; language: Language; error: boolean; revision: number }>
interface DeltaController {
  getSnapshot(): DeltaState
  subscribe(listener: () => void): () => void
  setMode(mode: Mode): void
  toggleSidebar(): void
  openConversation(): void
  dispose(): void
}
interface DeltaProps { controller: DeltaController }
interface ReactApi {
  createElement(type: string | ((props: DeltaProps) => unknown), props: Record<string, unknown> | null, ...children: unknown[]): unknown
  useState<T>(initial: T): [T, (value: T | ((state: T) => T)) => void]
  useSyncExternalStore(subscribe: (listener: () => void) => () => void, getSnapshot: () => DeltaState): DeltaState
}
interface ThemeApi {
  overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void
}
interface LayoutApi { toggleSidebar(): void; selectPanel(id: string | null): void }
interface SlotsApi {
  inject(name: string, register: () => unknown): void
  register(options: { name: string; id: string; order?: number; inject: () => DeltaProps }, component: (props: DeltaProps) => unknown): unknown
}
interface ClientContext {
  theme: ThemeApi
  layout: LayoutApi
  slots: SlotsApi
  effect(callback: () => void | (() => void), label?: string): void
  locale?: { subscribe?: (listener: () => void) => (() => void) }
}
interface Loader {
  load(entry: { id: string; factory(require: (id: string) => unknown): { inject: string[]; apply(ctx: ClientContext): void } }): void
}
interface Window { __ModuleLoader__: Loader }

// The release builder replaces both markers with data from locale/*.json and src/theme.css.
const DICTIONARIES = '__DELTA_THEME_LOCALES__' as unknown as Record<Language, DeltaCopy>
const OWNED_CSS = '__DELTA_THEME_STYLE__'
const OWNER = '@fongap-labs/dsh-theme-delta'
const STORAGE_KEY = 'fongap.dsh-theme-delta.v1'
const TOKENS: Record<string, { light: string; dark: string }> = {
  '--dsw-alias-brand-primary': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-button-primary-fill': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-button-primary-hover': { light: '#1D5E66', dark: '#75CBD5' },
  '--dsw-alias-label-primary-inverted': { light: '#FFFFFF', dark: '#0E1A1C' },
  '--dsw-alias-label-primary-foreground': { light: '#FFFFFF', dark: '#0E1A1C' },
  '--dsw-alias-link': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-bg-base': { light: '#F5F6F7', dark: '#131417' },
  '--dsw-alias-bg-layer-1': { light: '#FFFFFF', dark: '#1C1E22' },
  '--dsw-alias-border-l1': { light: '#E5E9EB', dark: '#31363B' },
  '--dsw-specific-sidebar-fill': { light: '#F5F6F7', dark: '#171A1D' },
}

function language(): Language {
  const value = typeof document !== 'undefined'
    ? (document.documentElement.lang || navigator.language || 'en') : 'en'
  return /^zh(?:-|$)/i.test(value) ? 'zh' : 'en'
}
function readMode(): Mode {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown
    if (value !== null && typeof value === 'object' && 'schema' in value &&
        'mode' in value && value.schema === 1 &&
        (value.mode === 'delta' || value.mode === 'official')) return value.mode
  } catch { /* storage is optional */ }
  return 'delta'
}
function writeMode(mode: Mode): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 1, mode })) }
  catch { /* session-only preference when storage is blocked */ }
}

function createController(ctx: ClientContext): DeltaController {
  let snapshot: DeltaState = Object.freeze({ mode: readMode(), language: language(), error: false, revision: 0 })
  let ownedLayer: (() => void) | undefined
  let isDisposed = false
  const listeners = new Set<() => void>()
  const publish = (change: Partial<Omit<DeltaState, 'revision'>>): void => {
    if (isDisposed) return
    snapshot = Object.freeze({ ...snapshot, ...change, revision: snapshot.revision + 1 })
    listeners.forEach(listener => listener())
  }
  const applyPalette = (mode: Mode): boolean => {
    ownedLayer?.()
    ownedLayer = undefined
    if (mode === 'official') return true
    try {
      ownedLayer = ctx.theme.overrideTokens(OWNER, TOKENS)
      return typeof ownedLayer === 'function'
    } catch { return false }
  }
  const safeLayout = (command: () => void): void => {
    if (isDisposed) return
    try { command(); publish({ error: false }) }
    catch { publish({ error: true }) }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      if (isDisposed) return () => {}
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setMode: (mode) => {
      if (isDisposed || (mode !== 'delta' && mode !== 'official')) return
      const success = applyPalette(mode)
      if (!success) { publish({ error: true }); return }
      writeMode(mode)
      publish({ mode, error: false })
    },
    toggleSidebar: () => { safeLayout(() => ctx.layout.toggleSidebar()) },
    openConversation: () => { safeLayout(() => ctx.layout.selectPanel(null)) },
    dispose: () => {
      if (isDisposed) return
      isDisposed = true
      ownedLayer?.()
      ownedLayer = undefined
      listeners.clear()
    },
    // Used by the owning activation to sync a host language switch.
    syncLanguage: () => { publish({ language: language() }) },
    activate: () => { if (!applyPalette(snapshot.mode)) publish({ error: true }) },
  } as DeltaController & { syncLanguage(): void; activate(): void }
}

window.__ModuleLoader__.load({
  id: OWNER,
  factory(require) {
    // Shared React instance supplied by the host module table, never bundled.
    const React = require('react') as ReactApi
    const el = React.createElement
    function useCopy(controller: DeltaController): { state: DeltaState; copy: DeltaCopy } {
      const state = React.useSyncExternalStore(
        callback => controller.subscribe(callback), () => controller.getSnapshot())
      return { state, copy: DICTIONARIES[state.language] ?? DICTIONARIES.en }
    }
    function SettingsRow({ controller }: DeltaProps): unknown {
      const { state, copy } = useCopy(controller)
      return el('section', { className: 'dtd-settings', 'data-dtd-settings': '', 'aria-label': copy.meta.title },
        el('div', { className: 'dtd-setting-copy' },
          el('strong', null, copy.meta.title),
          el('p', null, copy.ui.preference)),
        el('div', { className: 'dtd-segment', role: 'group', 'aria-label': copy.ui.theme },
          (['delta', 'official'] as const).map(mode =>
            el('button', { key: mode, type: 'button', 'aria-pressed': state.mode === mode,
              className: state.mode === mode ? 'dtd-active' : '',
              onClick: () => controller.setMode(mode) },
              mode === 'delta' ? copy.ui.delta : copy.ui.official))),
        state.error ? el('p', { role: 'status', className: 'dtd-error' }, copy.ui.unavailable) : null,
        el('p', { className: 'dtd-hint' }, copy.ui.recovery))
    }
    function QuickActions({ controller }: DeltaProps): unknown {
      const { state, copy } = useCopy(controller)
      const [open, setOpen] = React.useState(false)
      return el('div', { className: 'dtd-overlay', 'data-dtd-overlay': '' },
        open ? el('section', { className: 'dtd-popover', 'aria-label': copy.meta.title },
          el('strong', { className: 'dtd-heading' }, copy.meta.title),
          el('p', { className: 'dtd-status' }, copy.ui.status + ': ' + (state.mode === 'delta' ? copy.ui.delta : copy.ui.official)),
          el('button', { type: 'button', onClick: () => { controller.openConversation(); setOpen(false) } }, copy.ui.conversation),
          el('button', { type: 'button', onClick: () => { controller.toggleSidebar(); setOpen(false) } }, copy.ui.sidebar),
          el('button', { type: 'button', onClick: () => controller.setMode(state.mode === 'delta' ? 'official' : 'delta') }, copy.ui.theme),
          el('small', null, copy.ui.shortcut),
          state.error ? el('p', { role: 'status', className: 'dtd-error' }, copy.ui.unavailable) : null) : null,
        el('button', { type: 'button', className: 'dtd-fab',
          'aria-expanded': open, 'aria-label': copy.meta.title + ' — ' + (open ? copy.ui.close : copy.ui.open),
          onClick: () => setOpen(!open) }, 'Δ'))
    }
    return {
      inject: ['slots', 'theme', 'layout'],
      apply(ctx) {
        const controller = createController(ctx) as DeltaController & { activate(): void; syncLanguage(): void }
        ctx.effect(() => {
          controller.activate()
          const tag = document.createElement('style')
          tag.dataset.plugin = OWNER
          tag.textContent = OWNED_CSS
          document.head.appendChild(tag)
          const observer = typeof MutationObserver !== 'undefined'
            ? new MutationObserver(() => controller.syncLanguage()) : undefined
          observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
          const offLocale = ctx.locale?.subscribe?.(() => controller.syncLanguage())
          return () => {
            offLocale?.()
            observer?.disconnect()
            if (tag.parentNode) tag.parentNode.removeChild(tag)
            controller.dispose()
          }
        }, 'dsh-theme-delta: palette and owned resources')
        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item', id: 'fongap.delta.theme', order: 60,
          inject: () => ({ controller }),
        }, SettingsRow))
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'fongap.delta.quick-actions', order: 100,
          inject: () => ({ controller }),
        }, QuickActions))
      },
    }
  },
})
