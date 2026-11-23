/**
 * Delta Suite browser module. It only registers its lazy factory while loading.
 * Layout/session ownership always remains with the official UI plugins.
 */
interface McpDraft {
  name: string
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string
  env: string
  cwd: string
  url: string
  headers: string
  enabled: boolean
}

interface PublicSessionFace {
  readonly sessionId: string
  prompt(content: { type: 'text'; text: string }[], mode: 'queue' | 'steer', signal?: AbortSignal): Promise<{ ok: boolean; error?: { message?: string } }>
  command?(line: string): Promise<{ matched: boolean }>
  getSnapshot?(): { running?: boolean; awaitingFirstTurn?: boolean; lastAgentError?: string | null }
}
interface SessionReference {
  readonly sessionId: string
  readonly binding: { readonly session: PublicSessionFace }
  readonly ready: Promise<unknown>
  release(): void
}
interface AssistantSessionsApi {
  create(options?: { agentPreset?: string; workspaceId?: string }): Promise<string>
  retain(id: string, options: { source: string; signal?: AbortSignal }): SessionReference
  list: { getSnapshot(): { byId?: Record<string, { title?: string; workspaceId?: string; running?: boolean }> } }
}
interface ResourceProviderApi {
  register(provider: {
    protocol: string
    open(address: string, options: { signal: AbortSignal }): AsyncIterable<{ ok: true; value: AssistantResource }>
  }): () => void
}
interface SidebarRightTabsApi {
  register(definition: {
    id: string; kind: string; patterns: readonly string[]; priority?: 'extension' | 'builtin' | 'fallback'
    canOpen?(address: string): boolean; title(address: string): string
  }): () => void
}
interface AssistantResource {
  readonly parentSessionId: string
  readonly assistantSessionId: string
  readonly purpose: 'discussion' | 'optimization'
  readonly reference: SessionReference
  readonly protectionRevision: number
}
interface AssistantWorkflow {
  readonly purpose: 'discussion' | 'optimization'
  readonly parentSessionId: string
  readonly originalDraft?: string
  appliedDraft?: string
  readonly getCurrentDraft?: () => string
  readonly inputActions?: { setDraft(text: string): void; persistDraft(): void }
}
interface AssistantServices {
  sessions: AssistantSessionsApi
  resources: ResourceProviderApi
  sidebarRightTabs: SidebarRightTabsApi
  sidebarRight: SidebarRightApi
  slots: SlotsApi
  effect(callback: () => void | (() => void), label?: string): void
}
interface AssistantChatSnapshot {
  legacy?: { nodes?: readonly Record<string, any>[] }
  nodes?: { values(): readonly Record<string, any>[] }
  timeline?: { turnOrder?: readonly number[] }
}
interface AssistantSlotProps {
  sessionId: string
  useSession<T>(selector: (state: any) => T): T
  useInput<T>(selector: (state: any) => T): T
  useChat<T>(selector: (state: AssistantChatSnapshot) => T): T
  useConversation?<T>(selector: (state: any) => T): T
  useProjection<T = any>(key: string): T | undefined
  inputActions: {
    setDraft(text: string): void
    persistDraft(): void
  }
  useTabInfo?(): { tab: { contentId: string } }
  useResource?<T>(address: string): { value?: T }
  SessionProvider?(props: { session: SessionReference; children?: unknown }): unknown
  renderSlot?(name: string, props: Record<string, unknown>): unknown
  renderFactorySlot?(name: string, props: Record<string, unknown>, options?: Record<string, unknown>): unknown
  messageId?: string
}


type FeaturePreferences = Readonly<{
  showDeepSeekAccountInfo: boolean
  showModelInfo: boolean
  inputOptimization: boolean
}>
type FeaturePreferenceKey = keyof FeaturePreferences
const FEATURE_STORAGE_KEY = 'fongap.delta-suite.features.v1'
const DEFAULT_FEATURE_PREFERENCES: FeaturePreferences = Object.freeze({
  showDeepSeekAccountInfo: true, showModelInfo: true, inputOptimization: true,
})
function readFeaturePreferences(): FeaturePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(FEATURE_STORAGE_KEY) ?? 'null') as unknown
    if (value && typeof value === 'object') {
      const saved = value as Record<string, unknown>
      const preferences = {
        showDeepSeekAccountInfo: typeof saved.showDeepSeekAccountInfo === 'boolean' ? saved.showDeepSeekAccountInfo : true,
        showModelInfo: typeof saved.showModelInfo === 'boolean' ? saved.showModelInfo : true,
        inputOptimization: typeof saved.inputOptimization === 'boolean' ? saved.inputOptimization : true,
      }
      const isFeaturePreferences = 'showDeepSeekAccountInfo' in saved || 'showModelInfo' in saved || 'inputOptimization' in saved
      if (isFeaturePreferences && Object.keys(saved).some(key => !['showDeepSeekAccountInfo', 'showModelInfo', 'inputOptimization'].includes(key))) {
        try { localStorage.setItem(FEATURE_STORAGE_KEY, JSON.stringify(preferences)) }
        catch { /* remove retired preference keys when storage permits */ }
      }
      return Object.freeze(preferences)
    }
  } catch { /* blocked or malformed preference storage falls back to defaults */ }
  return DEFAULT_FEATURE_PREFERENCES
}
let featurePreferences = readFeaturePreferences()
const featurePreferenceListeners = new Set<() => void>()
function updateFeaturePreference(key: FeaturePreferenceKey, isEnabled: boolean): void {
  featurePreferences = Object.freeze({ ...featurePreferences, [key]: isEnabled })
  try { localStorage.setItem(FEATURE_STORAGE_KEY, JSON.stringify(featurePreferences)) }
  catch { /* preference remains available for this runtime */ }
  featurePreferenceListeners.forEach(listener => listener())
}
function subscribeFeaturePreferences(listener: () => void): () => void {
  featurePreferenceListeners.add(listener)
  return () => { featurePreferenceListeners.delete(listener) }
}
function useFeaturePreferences(React: ReactApi): FeaturePreferences {
  return React.useSyncExternalStore(subscribeFeaturePreferences, () => featurePreferences)
}

function readContextUsage(value: unknown): { percent: number; used: number; capacity: number } | undefined {
  if (!value || typeof value !== 'object') return undefined
  const pressure = value as Record<string, unknown>
  const used = typeof pressure.projectedTokens === 'number' ? pressure.projectedTokens
    : typeof pressure.pressureTokens === 'number' ? pressure.pressureTokens : undefined
  const capacity = typeof pressure.contextWindow === 'number' ? pressure.contextWindow : undefined
  if (used === undefined || capacity === undefined || capacity <= 0) return undefined
  return { percent: Math.min(100, Math.round(used / capacity * 100)), used, capacity }
}
function messageText(node: Record<string, any>): string {
  const data = (node.data && typeof node.data === 'object' ? node.data : node) as Record<string, any>
  if (Array.isArray(data.blocks)) return data.blocks.flatMap((block: any) =>
    block?.kind === 'text' && typeof block.text === 'string' ? [block.text] : []).join('')
  if (Array.isArray(data.content)) return data.content.flatMap((part: any) =>
    part?.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join('')
  if (typeof data.summary === 'string') return data.summary
  return ''
}
function compactionCheckpointSource(node: Record<string, any>): boolean {
  const data = (node.data && typeof node.data === 'object' ? node.data : node) as Record<string, any>
  const sources = [node.source, data.source, data.message?.source, data.finalNode?.source,
    data.finalNode?.data?.source, data.node?.source]
  return sources.some(source => source?.kind === 'compact-checkpoint')
}
function isCompactionCheckpoint(node: Record<string, any>): boolean {
  return node.kind === 'compaction' || compactionCheckpointSource(node)
}
function conversationContext(chat: AssistantChatSnapshot | undefined, maxChars = 6000): string {
  const nodes = chat?.legacy?.nodes
  if (!Array.isArray(nodes)) return ''
  const excerpts = nodes.flatMap((node) => {
    if (!node || typeof node !== 'object') return []
    const text = messageText(node).trim()
    if (!text) return []
    const kind = isCompactionCheckpoint(node) ? 'Checkpoint'
      : node.kind === 'user' || node.kind === 'steering' ? 'User'
      : node.kind === 'assistant' ? 'Assistant'
        : undefined
    return kind ? [`${kind}: ${text.slice(0, 1600)}`] : []
  })
  let result = ''
  for (const item of excerpts.slice(-8)) {
    const next = result ? `${result}\n\n${item}` : item
    if (next.length > maxChars) {
      const remaining = maxChars - result.length - (result ? 2 : 0)
      if (remaining > 120) result = `${result}${result ? '\n\n' : ''}${item.slice(-remaining)}`
      break
    }
    result = next
  }
  return result
}
function latestCheckpoint(chat: AssistantChatSnapshot | undefined): { summary: string; count?: number; tokens?: number } | undefined {
  const nodes = chat?.legacy?.nodes ?? []
  const node = nodes.filter(value => value && typeof value === 'object' && isCompactionCheckpoint(value)).at(-1)
  const summary = node ? messageText(node) || (typeof node.summary === 'string' ? node.summary
    : typeof node.data?.summary === 'string' ? node.data.summary : undefined) : undefined
  if (!summary) return undefined
  const shadowedItemCount = node?.shadowedItemCount ?? node?.data?.shadowedItemCount
  const shadowedTokenCount = node?.shadowedTokenCount ?? node?.data?.shadowedTokenCount
  return { summary,
    ...(typeof shadowedItemCount === 'number' ? { count: shadowedItemCount } : {}),
    ...(typeof shadowedTokenCount === 'number' ? { tokens: shadowedTokenCount } : {}) }
}
function latestAssistantMessageId(chat: AssistantChatSnapshot | undefined): string | undefined {
  const nodes = chat?.nodes?.values?.() ?? []
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index]
    const data = node?.data as Record<string, any> | undefined
    const id = data?.finalNode?.messageId ?? data?.messageId
    if (node?.kind === 'assistant-step' && typeof id === 'string') return id
  }
  return undefined
}

interface Loader {
  load(entry: { id: string; factory(require: (id: string) => unknown): { inject: string[]; apply(ctx: ClientContext): void } }): void
}
interface Window { __ModuleLoader__: Loader }

const CLIENT_HOME_WIN_RE = /\b([A-Za-z]):[\\/]+Users[\\/]+([^\\/\s"'`]+)(?=[\\/\s"'`,;:]|$)/gi
const CLIENT_HOME_POSIX_RE = /(?<![A-Za-z0-9._-])\/(?:Users|home)\/([^/\s"'`,;:]+)(?=[/\s"'`,;:]|$)/g
const CLIENT_PRIVATE_BLOCK_RE = /<private>[\s\S]*?<\/private>/gi
const CLIENT_AUTH_HEADER_RE = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi
const CLIENT_KNOWN_TOKEN_RE = /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g
const CLIENT_SECRET_ASSIGN_RE = /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|session[_-]?token|authorization|cookie)\b(\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;`"']+)/gi
const CLIENT_EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const CLIENT_MOBILE_RE = /(?<![A-Za-z0-9_-])1[3-9]\d{9}(?![A-Za-z0-9_-])/g

function redactPathForUi(input: string): string {
  if (!input) return ''
  return input
    .replace(CLIENT_HOME_WIN_RE, '~')
    .replace(CLIENT_HOME_POSIX_RE, '~')
}

function redactSensitiveText(input: string): string {
  if (!input) return ''
  return redactPathForUi(input)
    .replace(CLIENT_PRIVATE_BLOCK_RE, '[redacted]')
    .replace(CLIENT_AUTH_HEADER_RE, '$1 [redacted]')
    .replace(CLIENT_KNOWN_TOKEN_RE, '[redacted-token]')
    .replace(CLIENT_SECRET_ASSIGN_RE, '$1$2[redacted]')
    .replace(CLIENT_EMAIL_RE, '[email]')
    .replace(CLIENT_MOBILE_RE, '[phone]')
}

/**
 * Installed-client presentation adapter.
 * Unlike the optional source-checkout patch, this runs in the loaded plugin.
 * It confines DOM interaction to recognized native controls and restores every
 * owned label/marker when Delta mode is disabled or the plugin unmounts.
 */
// Only the Host's sanitized account UI projection is read; no token is exposed.
let readLiveAccountState: (() => {
  view?: { status?: string }
  details?: { balance?: { status: string; value?: readonly { currency: string; balance: string }[] } }
}) | undefined
const liveSessionTargetListeners = new Set<() => void>()
let liveSessionTarget: HTMLElement | null = null
function publishLiveSessionTarget(next: HTMLElement | null): void {
  if (liveSessionTarget === next) return
  liveSessionTarget = next
  for (const listener of liveSessionTargetListeners) listener()
}
function subscribeLiveSessionTarget(listener: () => void): () => void {
  liveSessionTargetListeners.add(listener)
  return () => { liveSessionTargetListeners.delete(listener) }
}
function getLiveSessionTarget(): HTMLElement | null { return liveSessionTarget }

const LIVE_PRESENTATION_CSS = String.raw`
:root[data-delta-ui="delta"] [data-dtd-live-brand="1"] { display: none !important; }
:root[data-delta-ui="delta"][data-windows-titlebar] [data-dtd-live-logo-row="1"] {
  height: 0 !important; min-height: 0 !important; margin: 0 !important;
  padding: 0 !important; overflow: visible !important;
}
:root[data-delta-ui="delta"]:not([data-windows-titlebar]) [data-dtd-live-logo-row="1"] {
  height: 28px !important; min-height: 28px !important; padding: 0 !important;
  overflow: visible !important;
}
:root[data-delta-ui="delta"] [data-dtd-live-preview="1"] { display: none !important; }
/* Keep primary navigation above the workspace/session scroller. */
:root[data-delta-ui="delta"] [data-dtd-live-pinned-nav="1"] {
  position: sticky; top: 0; z-index: 8;
  background: var(--dtd-bg-sidebar); isolation: isolate;
}
/* The host upload guard must be active; do not expose a misleading on/off toggle. */
:root[data-delta-ui="delta"] [data-dtd-live-sessionlog-row="1"] { display: none !important; }
:root[data-delta-ui="delta"] [data-dtd-live-hero-title="1"] { order: 0; }
:root[data-delta-ui="delta"] [data-dtd-live-hero-fish="1"] {
  order: 1; align-self: center; width: 16px !important; height: 12px !important;
  flex: 0 0 16px !important; transform: translateY(-2px);
}
:root[data-delta-ui="delta"] [data-dtd-live-hero-fish="1"] svg {
  width: 16px !important; height: auto !important; max-width: 16px !important;
}
/* Delta pins are presentation-fixed. Hiding the Host unpin control avoids
 * silently removing a required navigation entry and reverting its layout. */
:root[data-delta-ui="delta"] [data-dtd-live-primary-unpin="1"],
:root[data-delta-ui="delta"] [data-dtd-live-more="1"] {
  display: none !important; height: 0 !important; min-height: 0 !important;
  margin: 0 !important; padding: 0 !important;
}

/* One-row native account footer: no account operations or credentials copied. */
:root[data-delta-ui="delta"] [data-dtd-live-footer-row="1"] {
  display: flex !important; position: relative; align-items: center;
  gap: 4px; min-height: 44px; padding: 0 6px;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-avatar="1"] {
  display: flex; flex: 1 1 auto; min-width: 0; order: 0;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-trigger="1"] {
  box-sizing: border-box; color: var(--dtd-fg-primary); display: flex; width: 36px !important;
  height: 36px !important; min-height: 36px !important;
  align-items: center; justify-content: center; padding: 6px !important;
  border: 0 !important; gap: 0 !important; background: transparent !important;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-trigger="1"] > span:not([data-avatar-status]) {
  display: none !important;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-trigger="1"] [data-avatar-status],
:root[data-delta-ui="delta"] [data-dtd-live-footer-trigger="1"] [data-avatar-status] img {
  box-sizing: border-box; width: 24px !important; height: 24px !important;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-trigger="1"][data-signed-out="true"] > svg {
  display: none !important;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-trigger="1"][data-signed-out="true"]::before {
  content: ""; display: block; width: 24px; height: 24px; flex: none;
  background: currentColor; -webkit-mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2023.16%2017.04%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M22.9168%201.43018C22.6713%201.31018%2022.5658%201.53918%2022.4223%201.65519C22.3733%201.69269%2022.3318%201.74169%2022.2903%201.78669C21.9317%202.1697%2021.5127%202.42121%2020.9657%202.39121C20.1657%202.34621%2019.4827%202.59771%2018.8787%203.20973C18.7502%202.45521%2018.3236%202.0047%2017.6746%201.71569C17.3351%201.56568%2016.9916%201.41518%2016.7536%201.08867C16.5876%200.856163%2016.5421%200.597155%2016.4591%200.341647C16.4061%200.187643%2016.3536%200.0301382%2016.1761%200.00363739C15.9836%20-0.0263635%2015.9081%200.135141%2015.8326%200.270145C15.5306%200.822162%2015.4136%201.43018%2015.4251%202.0462C15.4516%203.43174%2016.0366%204.53527%2017.1991%205.3203C17.3311%205.4103%2017.3651%205.5003%2017.3236%205.63181C17.2441%205.90231%2017.1501%206.16482%2017.0671%206.43533C17.0141%206.60784%2016.9351%206.64584%2016.7501%206.57033C16.1121%206.30383%2015.5611%205.90931%2015.074%205.4328C14.2475%204.63328%2013.5%203.75075%2012.568%203.05973C12.349%202.89822%2012.13%202.74822%2011.9034%202.60522C10.9524%201.68169%2012.028%200.923165%2012.277%200.833162C12.5375%200.739159%2012.3675%200.41615%2011.5259%200.42015C10.6844%200.42365%209.91439%200.705658%208.93286%201.08117C8.78935%201.13767%208.63835%201.17867%208.48384%201.21267C7.59332%201.04367%206.66829%201.00617%205.70226%201.11517C3.88321%201.31768%202.43016%202.1777%201.36213%203.64575C0.0790928%205.4103%20-0.222916%207.41536%200.146595%209.50642C0.535106%2011.7105%201.66014%2013.535%203.38869%2014.9616C5.18125%2016.4406%207.24581%2017.1657%209.60138%2017.0266C11.0319%2016.9441%2012.6245%2016.7526%2014.421%2015.2321C14.874%2015.4576%2015.3496%2015.5476%2016.1381%2015.6151C16.7456%2015.6716%2017.3306%2015.5851%2017.7836%2015.4911C18.4931%2015.3411%2018.4441%2014.6841%2018.1876%2014.5636C16.1081%2013.595%2016.5646%2013.9891%2016.1496%2013.67C17.2061%2012.42%2018.8202%2010.1979%2019.3182%207.17235C19.3672%206.83834%2019.4297%206.36783%2019.4222%206.09732C19.4182%205.93231%2019.4562%205.86831%2019.6447%205.84931C20.1657%205.78931%2020.6712%205.64681%2021.1357%205.3913C22.4833%204.65528%2023.0268%203.44624%2023.1548%201.9972C23.1738%201.77569%2023.1508%201.54668%2022.9168%201.43018ZM11.1749%2014.4736C9.15936%2012.889%208.18184%2012.3675%207.77832%2012.39C7.40081%2012.4125%207.46881%2012.8445%207.55182%2013.126C7.63882%2013.404%207.75182%2013.5955%207.91033%2013.8396C8.01983%2014.0011%208.09533%2014.2411%207.80083%2014.4216C7.15181%2014.8231%206.02327%2014.2866%205.97027%2014.2601C4.65673%2013.4865%203.5587%2012.4655%202.78467%2011.069C2.03715%209.72493%201.60314%208.28289%201.53164%206.74384C1.51264%206.37233%201.62214%206.24082%201.99215%206.17332C2.47916%206.08332%202.98118%206.06432%203.46769%206.13582C5.52476%206.43633%207.27581%207.35586%208.74385%208.8129C9.58188%209.64243%2010.2159%2010.634%2010.8689%2011.6025C11.5634%2012.631%2012.3105%2013.611%2013.262%2014.4146C13.598%2014.6961%2013.866%2014.9101%2014.1225%2015.0681C13.349%2015.1546%2012.058%2015.1731%2011.1749%2014.4746L11.1749%2014.4736ZM12.141%208.25988C12.141%208.09488%2012.273%207.96338%2012.439%207.96338C12.4765%207.96338%2012.5105%207.97088%2012.541%207.98188C12.5825%207.99688%2012.6205%208.01938%2012.6505%208.05338C12.7035%208.10588%2012.7335%208.18088%2012.7335%208.25988C12.7335%208.42489%2012.6015%208.55639%2012.4355%208.55639C12.2695%208.55639%2012.141%208.42489%2012.141%208.25988ZM15.1415%209.79893C14.949%209.87793%2014.7565%209.94544%2014.5715%209.95294C14.2845%209.96794%2013.9715%209.85143%2013.8015%209.70893C13.5375%209.48742%2013.3485%209.36342%2013.2695%208.97691C13.2355%208.8119%2013.2545%208.55639%2013.2845%208.40989C13.3525%208.09438%2013.277%207.89187%2013.0545%207.70787C12.8735%207.55786%2012.643%207.51636%2012.39%207.51636C12.2955%207.51636%2012.209%207.47486%2012.1445%207.44136C12.039%207.38886%2011.9519%207.25735%2012.035%207.09585C12.0615%207.04335%2012.19%206.91584%2012.22%206.89334C12.5635%206.69784%2012.9595%206.76184%2013.326%206.90834C13.6655%207.04735%2013.9225%207.30236%2014.292%207.66287C14.6695%208.09838%2014.7375%208.21838%2014.9525%208.54539C15.1225%208.8009%2015.277%209.06341%2015.3831%209.36392C15.4471%209.55142%2015.3641%209.70493%2015.1415%209.79893Z%22%2F%3E%3C%2Fsvg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2023.16%2017.04%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M22.9168%201.43018C22.6713%201.31018%2022.5658%201.53918%2022.4223%201.65519C22.3733%201.69269%2022.3318%201.74169%2022.2903%201.78669C21.9317%202.1697%2021.5127%202.42121%2020.9657%202.39121C20.1657%202.34621%2019.4827%202.59771%2018.8787%203.20973C18.7502%202.45521%2018.3236%202.0047%2017.6746%201.71569C17.3351%201.56568%2016.9916%201.41518%2016.7536%201.08867C16.5876%200.856163%2016.5421%200.597155%2016.4591%200.341647C16.4061%200.187643%2016.3536%200.0301382%2016.1761%200.00363739C15.9836%20-0.0263635%2015.9081%200.135141%2015.8326%200.270145C15.5306%200.822162%2015.4136%201.43018%2015.4251%202.0462C15.4516%203.43174%2016.0366%204.53527%2017.1991%205.3203C17.3311%205.4103%2017.3651%205.5003%2017.3236%205.63181C17.2441%205.90231%2017.1501%206.16482%2017.0671%206.43533C17.0141%206.60784%2016.9351%206.64584%2016.7501%206.57033C16.1121%206.30383%2015.5611%205.90931%2015.074%205.4328C14.2475%204.63328%2013.5%203.75075%2012.568%203.05973C12.349%202.89822%2012.13%202.74822%2011.9034%202.60522C10.9524%201.68169%2012.028%200.923165%2012.277%200.833162C12.5375%200.739159%2012.3675%200.41615%2011.5259%200.42015C10.6844%200.42365%209.91439%200.705658%208.93286%201.08117C8.78935%201.13767%208.63835%201.17867%208.48384%201.21267C7.59332%201.04367%206.66829%201.00617%205.70226%201.11517C3.88321%201.31768%202.43016%202.1777%201.36213%203.64575C0.0790928%205.4103%20-0.222916%207.41536%200.146595%209.50642C0.535106%2011.7105%201.66014%2013.535%203.38869%2014.9616C5.18125%2016.4406%207.24581%2017.1657%209.60138%2017.0266C11.0319%2016.9441%2012.6245%2016.7526%2014.421%2015.2321C14.874%2015.4576%2015.3496%2015.5476%2016.1381%2015.6151C16.7456%2015.6716%2017.3306%2015.5851%2017.7836%2015.4911C18.4931%2015.3411%2018.4441%2014.6841%2018.1876%2014.5636C16.1081%2013.595%2016.5646%2013.9891%2016.1496%2013.67C17.2061%2012.42%2018.8202%2010.1979%2019.3182%207.17235C19.3672%206.83834%2019.4297%206.36783%2019.4222%206.09732C19.4182%205.93231%2019.4562%205.86831%2019.6447%205.84931C20.1657%205.78931%2020.6712%205.64681%2021.1357%205.3913C22.4833%204.65528%2023.0268%203.44624%2023.1548%201.9972C23.1738%201.77569%2023.1508%201.54668%2022.9168%201.43018ZM11.1749%2014.4736C9.15936%2012.889%208.18184%2012.3675%207.77832%2012.39C7.40081%2012.4125%207.46881%2012.8445%207.55182%2013.126C7.63882%2013.404%207.75182%2013.5955%207.91033%2013.8396C8.01983%2014.0011%208.09533%2014.2411%207.80083%2014.4216C7.15181%2014.8231%206.02327%2014.2866%205.97027%2014.2601C4.65673%2013.4865%203.5587%2012.4655%202.78467%2011.069C2.03715%209.72493%201.60314%208.28289%201.53164%206.74384C1.51264%206.37233%201.62214%206.24082%201.99215%206.17332C2.47916%206.08332%202.98118%206.06432%203.46769%206.13582C5.52476%206.43633%207.27581%207.35586%208.74385%208.8129C9.58188%209.64243%2010.2159%2010.634%2010.8689%2011.6025C11.5634%2012.631%2012.3105%2013.611%2013.262%2014.4146C13.598%2014.6961%2013.866%2014.9101%2014.1225%2015.0681C13.349%2015.1546%2012.058%2015.1731%2011.1749%2014.4746L11.1749%2014.4736ZM12.141%208.25988C12.141%208.09488%2012.273%207.96338%2012.439%207.96338C12.4765%207.96338%2012.5105%207.97088%2012.541%207.98188C12.5825%207.99688%2012.6205%208.01938%2012.6505%208.05338C12.7035%208.10588%2012.7335%208.18088%2012.7335%208.25988C12.7335%208.42489%2012.6015%208.55639%2012.4355%208.55639C12.2695%208.55639%2012.141%208.42489%2012.141%208.25988ZM15.1415%209.79893C14.949%209.87793%2014.7565%209.94544%2014.5715%209.95294C14.2845%209.96794%2013.9715%209.85143%2013.8015%209.70893C13.5375%209.48742%2013.3485%209.36342%2013.2695%208.97691C13.2355%208.8119%2013.2545%208.55639%2013.2845%208.40989C13.3525%208.09438%2013.277%207.89187%2013.0545%207.70787C12.8735%207.55786%2012.643%207.51636%2012.39%207.51636C12.2955%207.51636%2012.209%207.47486%2012.1445%207.44136C12.039%207.38886%2011.9519%207.25735%2012.035%207.09585C12.0615%207.04335%2012.19%206.91584%2012.22%206.89334C12.5635%206.69784%2012.9595%206.76184%2013.326%206.90834C13.6655%207.04735%2013.9225%207.30236%2014.292%207.66287C14.6695%208.09838%2014.7375%208.21838%2014.9525%208.54539C15.1225%208.8009%2015.277%209.06341%2015.3831%209.36392C15.4471%209.55142%2015.3641%209.70493%2015.1415%209.79893Z%22%2F%3E%3C%2Fsvg%3E") center / contain no-repeat;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-update-slot="1"] {
  order: 1; flex: none; display: flex; justify-content: center; align-items: center;
  min-width: 36px !important; min-height: 36px !important;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-update="1"] {
  box-sizing: border-box; flex: none; width: 36px !important; min-width: 36px !important;
  height: 36px !important; min-height: 36px !important; padding: 6px !important;
  color: var(--dtd-brand); background: transparent !important; border: 0 !important;
  border-radius: var(--dtd-radius-md) !important;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-update="1"] svg {
  width: 24px !important; height: 24px !important;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-update="1"] > span:not(:first-child) {
  display: none !important;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-update="1"]:hover {
  background: var(--dtd-bg-hover) !important;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-update="1"]:focus-visible {
  outline: 2px solid var(--dtd-border-focus); outline-offset: 2px;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-action] {
  order: 2; flex: none; width: 36px; height: 36px;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 6px; color: var(--dtd-fg-primary); background: transparent; cursor: pointer;
  border: 0; border-radius: var(--dtd-radius-md);
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-action="auth"] { order: 3; }
:root[data-delta-ui="delta"] [data-dtd-live-footer-action] svg { width: 24px; height: 24px; display: block; }
:root[data-delta-ui="delta"] [data-dtd-live-footer-action]:hover {
  background: var(--dtd-bg-hover);
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-action]:focus-visible {
  outline: 2px solid var(--dtd-border-focus); outline-offset: 2px;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-card="1"] {
  display: none; position: absolute; z-index: 60; bottom: calc(100% + 6px);
  left: 4px; width: min(250px, calc(100vw - 32px)); box-sizing: border-box;
  flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: 12px;
  box-shadow: var(--dtd-popup-shadow); border: 1px solid var(--dtd-popup-border);
  background: var(--dtd-popup-bg); color: var(--dtd-popup-fg); pointer-events: none;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-card="1"][data-open="1"] { display: flex; }
:root[data-delta-ui="delta"] [data-dtd-live-footer-card="1"] > div {
  display: flex; justify-content: space-between; gap: 8px; align-items: center;
  font-size: 12px;
}
:root[data-delta-ui="delta"] [data-dtd-live-footer-card="1"] [data-dtd-live-footer-value] {
  font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums;
  text-align: right; overflow-wrap: anywhere; min-width: 0; max-width: 70%;
}

:root[data-delta-ui="delta"] [data-dtd-live-session-target="1"] {
  display: flex; align-items: center; width: auto; margin: 0 4px;
  min-width: 0; min-height: 36px;
}
:root[data-delta-ui="delta"] [data-dtd-live-session-target="1"] [data-slot="sidebar.session.action"] { display: contents; }
:root[data-delta-ui="delta"] [data-dtd-live-session-target="1"] button {
  width: 100%; height: 36px; min-height: 36px;
  display: flex; justify-content: flex-start; align-items: center; padding: 8px 12px;
  background: transparent; border: 0; border-radius: 12px; text-align: left;
  font: inherit; color: inherit; cursor: pointer;
}
:root[data-delta-ui="delta"] [data-dtd-live-session-target="1"] button > span:first-child,
:root[data-delta-ui="delta"] [data-dtd-live-session-target="1"] button > span:first-child > span {
  justify-content: flex-start; text-align: left;
}
:root[data-delta-ui="delta"] [data-dtd-live-session-target="1"] button > span[aria-hidden="true"] { display: none; }
:root[data-delta-ui="delta"] [data-dtd-live-session-target="1"] button:hover {
  background: var(--dtd-bg-hover);
}
:root[data-delta-ui="delta"] [data-dtd-live-session-source="1"] { display: none !important; margin: 0 !important; }
`

function installLiveNativePresentation(controller: DeltaController, canUsePortal: boolean): () => void {
  if (typeof document === 'undefined' || !document.body ||
      typeof document.querySelector !== 'function' ||
      typeof document.querySelectorAll !== 'function') return () => {}
  const labelChanges = new Map<HTMLElement, { original: string; current: string }>()
  const ariaChanges = new Map<HTMLElement, { original: string | null; current: string }>()
  const marks = new Set<HTMLElement>()
  let target: HTMLElement | null = null
  let observer: MutationObserver | undefined
  let isDisposed = false
  let isSyncing = false
  const tag = document.createElement('style')
  tag.dataset.deltaLivePresentation = ''
  tag.textContent = LIVE_PRESENTATION_CSS
  document.head.appendChild(tag)

  const mark = (node: HTMLElement, key: string): void => {
    const name = 'data-dtd-live-' + key
    if (node.getAttribute(name) !== '1') node.setAttribute(name, '1')
    marks.add(node)
  }
  const unmark = (node: HTMLElement, key: string): void => {
    node.removeAttribute('data-dtd-live-' + key)
  }
  const wording = (lang: Language) => {
    const copy = DICTIONARIES[lang] ?? DICTIONARIES.en
    return { plugins: copy.ui.navigationPlugins, schedules: copy.ui.navigationSchedules,
      session: copy.ui.navigationSession }
  }
  const kind = (value: string): 'plugins' | 'schedules' | 'session' | undefined => {
    if (['插件', '插件管理', 'Plugins', 'Plugin Manager'].includes(value)) return 'plugins'
    if (['自动化任务', '定时任务', 'Automation tasks', 'Automation Tasks', 'Scheduled Tasks'].includes(value)) return 'schedules'
    if (['新会话', '新建会话', '开始对话', 'New session', 'New Session', 'Start Conversation'].includes(value)) return 'session'
    return undefined
  }
  const updateCopy = (node: HTMLElement, text: string): void => {
    if (node.children.length !== 0 || node.textContent?.trim() === text) return
    const previous = labelChanges.get(node)
    if (!previous) labelChanges.set(node, { original: node.textContent ?? '', current: text })
    else previous.current = text
    node.textContent = text
  }
  const updateAria = (node: HTMLElement, text: string): void => {
    if (node.getAttribute('aria-label') === text) return
    const previous = ariaChanges.get(node)
    if (!previous) ariaChanges.set(node, { original: node.getAttribute('aria-label'), current: text })
    else previous.current = text
    node.setAttribute('aria-label', text)
  }
  const rollback = (): void => {
    // Full cleanup includes detached native footer controls.
    clearFooter()
    publishLiveSessionTarget(null)
    target?.remove()
    target = null
    for (const node of marks) for (const attribute of Array.from(node.attributes)) {
      if (attribute.name.startsWith('data-dtd-live-')) node.removeAttribute(attribute.name)
    }
    marks.clear()
    for (const [node, entry] of labelChanges) {
      if (node.textContent === entry.current) node.textContent = entry.original
    }
    for (const [node, entry] of ariaChanges) {
      if (node.getAttribute('aria-label') !== entry.current) continue
      if (entry.original === null) node.removeAttribute('aria-label')
      else node.setAttribute('aria-label', entry.original)
    }
    labelChanges.clear()
    ariaChanges.clear()
  }

  let footerTrigger: HTMLButtonElement | null = null
  let footerCard: HTMLElement | null = null
  const footerActions = new Map<'settings' | 'auth', HTMLButtonElement>()
  const actionIcon = (id: 'settings' | 'auth', isSignedIn: boolean): string => {
    const path = id === 'settings'
      ? '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/><path d="M19.4 15.5a8.5 8.5 0 0 0 .1-7l1.8-1.4-2-3.4-2.2.9A8.6 8.6 0 0 0 14 3L13.6 1h-4L9 3a8.6 8.6 0 0 0-3.1 1.6l-2.2-.9-2 3.4L3.5 8.5a8.5 8.5 0 0 0-.1 7l-1.8 1.4 2 3.4 2.2-.9A8.6 8.6 0 0 0 9 21l.6 2h4l.4-2a8.6 8.6 0 0 0 3.1-1.6l2.2.9 2-3.4z" transform="translate(2 2) scale(.83)"/>'
      : isSignedIn
        ? '<path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/><path d="m16 17 5-5-5-5M21 12H9"/>'
        : '<circle cx="12" cy="8" r="4"/><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2"/>'
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>'
  }
  const dismissHover = (): void => { footerCard?.removeAttribute('data-open') }
  const showHover = (): void => {
    if (controller.getSnapshot().mode !== 'delta' || footerTrigger?.getAttribute('data-signed-out') !== 'false' ||
        !footerCard?.isConnected || footerTrigger?.getAttribute('aria-expanded') === 'true') return
    const snapshot = (() => { try { return readLiveAccountState?.() } catch { return undefined } })()
    const wallets = snapshot?.details?.balance
    const uiCopy = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
    const balance = wallets?.status === 'ready' && Array.isArray(wallets.value) && wallets.value.length > 0
      ? wallets.value.map(item => (item.currency === 'CNY' ? '¥' : item.currency === 'USD' ? '$' : item.currency + ' ') +
        item.balance).join(' + ')
      : uiCopy.dataUnavailable
    const keys = footerCard.querySelectorAll<HTMLElement>('[data-dtd-live-footer-label]')
    const values = footerCard.querySelectorAll<HTMLElement>('[data-dtd-live-footer-value]')
    if (keys.length !== 2 || values.length !== 2) return
    keys[0]!.textContent = uiCopy.accountBalance
    keys[1]!.textContent = uiCopy.todaySpending
    values[0]!.textContent = balance
    // The Host has no verified account-wide daily cost capability.
    values[1]!.textContent = uiCopy.dataUnavailable
    footerCard.setAttribute('data-open', '1')
  }
  const onAccountOver = (event: Event): void => {
    if (footerTrigger?.contains(event.target as Node)) showHover()
  }
  const onAccountOut = (event: Event): void => {
    if (footerTrigger?.contains(event.target as Node) &&
        !footerTrigger.contains((event as MouseEvent).relatedTarget as Node | null)) dismissHover()
  }
  document.addEventListener('pointerover', onAccountOver)
  document.addEventListener('pointerout', onAccountOut)
  document.addEventListener('focusin', onAccountOver)
  document.addEventListener('focusout', onAccountOut)

  const activateNativeAccount = (action: 'settings' | 'auth'): void => {
    const trigger = footerTrigger
    if (!trigger?.isConnected || controller.getSnapshot().mode !== 'delta') return
    const isSignedIn = trigger.getAttribute('data-signed-out') === 'false'
    const labels = action === 'settings' ? ['设置', 'Settings'] :
      isSignedIn ? ['退出登录', 'Sign out', 'Sign Out'] : ['登录', 'Sign in', 'Sign In']
    dismissHover()
    if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click()
    // Keep all authentication, running-task checks and confirmation dialogs
    // in Harness' native menu. If it changes shape, leave that menu open.
    requestAnimationFrame(() => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]'))
      const target = candidates.find(item => labels.some(label => (item.textContent?.trim() ?? '').startsWith(label)))
      target?.click()
    })
  }
  const clearFooter = (): void => {
    footerTrigger = null
    dismissHover()
    for (const button of footerActions.values()) button.remove()
    footerCard?.remove()
  }
  const syncFooter = (sidebar: HTMLElement): void => {
    const trigger = sidebar.querySelector<HTMLButtonElement>('button[data-signed-out][aria-haspopup="menu"]')
    const account = trigger?.closest<HTMLElement>('[data-inset]')
    const row = account?.parentElement
    if (!trigger || !account || !row || !sidebar.contains(row)) { clearFooter(); return }
    const isSignedIn = trigger.getAttribute('data-signed-out') === 'false'
    if (!isSignedIn) dismissHover()
    footerTrigger = trigger
    mark(row, 'footer-row')
    mark(account, 'footer-avatar')
    mark(trigger, 'footer-trigger')
    for (const child of Array.from(row.children)) {
      if (child === account) continue
      const button = child instanceof HTMLButtonElement ? child : child.querySelector<HTMLButtonElement>('button')
      if (!button || button.hasAttribute('data-dtd-live-footer-action')) continue
      const label = ((button.getAttribute('aria-label') ?? '') + ' ' + (button.textContent ?? '')).trim()
      const updateTerms = ['新版本', '版本更新', '下载更新', 'New version', 'Update available', 'download', 'checking', 'retry']
      if (updateTerms.some(term => label.toLowerCase().includes(term.toLowerCase()))) {
        mark(button, 'footer-update')
        // Flex order must be applied to the native direct child, not just its nested button.
        if (child instanceof HTMLElement) mark(child, 'footer-update-slot')
      } else if (child instanceof HTMLElement) {
        unmark(child, 'footer-update-slot')
      }
    }
    for (const id of ['settings', 'auth'] as const) {
      let button = footerActions.get(id)
      if (!button) {
        button = document.createElement('button')
        button.type = 'button'
        button.setAttribute('data-dtd-live-footer-action', id)
        button.addEventListener('click', () => activateNativeAccount(id))
        footerActions.set(id, button)
      }
      const uiCopy = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
      const label = id === 'settings' ? uiCopy.settings : isSignedIn ? uiCopy.signOut : uiCopy.signIn
      button.title = label
      button.setAttribute('aria-label', label)
      const state = id + ':' + String(isSignedIn)
      if (button.dataset.iconState !== state) {
        button.innerHTML = actionIcon(id, isSignedIn)
        button.dataset.iconState = state
      }
      if (button.parentElement !== row) row.appendChild(button)
    }
    if (!footerCard) {
      footerCard = document.createElement('div')
      footerCard.setAttribute('data-dtd-live-footer-card', '1')
      footerCard.setAttribute('role', 'tooltip')
      footerCard.innerHTML = '<div><span data-dtd-live-footer-label></span><span data-dtd-live-footer-value></span></div>' +
        '<div><span data-dtd-live-footer-label></span><span data-dtd-live-footer-value></span></div>'
    }
    if (footerCard.parentElement !== row) row.appendChild(footerCard)
  }

  const sync = (): void => {
    if (isDisposed || isSyncing) return
    isSyncing = true
    try {
      if (controller.getSnapshot().mode !== 'delta') { rollback(); return }
      const lang = language()
      const scroll = document.querySelector<HTMLElement>('[data-sidebar-scrollport]')
      const nav = scroll?.querySelector<HTMLElement>('nav')
      if (nav) mark(nav, 'pinned-nav')
      const sidebar = scroll?.parentElement?.parentElement
      if (sidebar) {
        const row = Array.from(sidebar.children).find(node =>
          node.hasAttribute('data-window-drag') && node.querySelector('[data-sidebar-toggle]'))
        if (row instanceof HTMLElement) {
          mark(row, 'logo-row')
          for (const child of Array.from(row.children)) {
            if (child instanceof HTMLElement && !child.hasAttribute('data-sidebar-toggle') &&
                !child.querySelector('[data-sidebar-toggle]')) mark(child, 'brand')
          }
        }
      }
      if (sidebar) syncFooter(sidebar)
      // Exact native preference ownership check: hide only the ineffective Session Log
      // toggle, never unrelated security settings or all general-setting switches.
      const logTitles = ['在使用官方模型 API 时上传 Session Log',
        'Upload Session Log when using the official model API']
      for (const control of document.querySelectorAll<HTMLElement>('[role="switch"]')) {
        let row = control.parentElement
        for (let level = 0; level < 3 && row instanceof HTMLElement; level++, row = row.parentElement) {
          const title = Array.from(row.children).some(child => child instanceof HTMLElement &&
            (logTitles.includes(child.textContent?.trim() ?? '') ||
             Array.from(child.children).some(inner => logTitles.includes(inner.textContent?.trim() ?? ''))))
          if (title) { mark(row, 'sessionlog-row'); break }
        }
      }
      let scheduleRow: HTMLElement | undefined
      let pluginRow: HTMLElement | undefined
      if (nav) for (const button of nav.querySelectorAll<HTMLButtonElement>('button[aria-label]')) {
        const category = kind(button.getAttribute('aria-label')?.trim() ?? '')
        if (category !== 'plugins' && category !== 'schedules') continue
        updateAria(button, wording(lang)[category])
        for (const span of button.querySelectorAll<HTMLElement>('span')) {
          const found = kind(span.textContent?.trim() ?? '')
          if (found === category) updateCopy(span, wording(lang)[category])
        }
        let row: HTMLElement = button
        while (row.parentElement && row.parentElement !== nav) row = row.parentElement
        if (row.parentElement === nav) {
          if (category === 'schedules') scheduleRow = row
          else if (category === 'plugins') pluginRow = row
        }
      }
      if (nav) {
        // Host unpin moves its row into More and invalidates the Delta navigation
        // geometry. Keep first-party unpin out of Delta mode while preserving
        // the underlying Host state and official theme. If an entry was already
        // unpinned, leave More visible so it can be recovered there.
        const unpinTerms = ['取消固定', '取消置顶', 'unpin']
        for (const row of [pluginRow, scheduleRow]) {
          if (!row) continue
          for (const button of row.querySelectorAll<HTMLButtonElement>('button')) {
            if (button === row.querySelector('button[aria-current], button[aria-describedby]')) continue
            const ariaLabel = button.getAttribute('aria-label') ?? ''
            if (unpinTerms.some(term => ariaLabel.toLowerCase().includes(term.toLowerCase()))) mark(button, 'primary-unpin')
          }
        }
        const more = nav.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
        if (more) {
          let moreRow: HTMLElement = more
          while (moreRow.parentElement && moreRow.parentElement !== nav) moreRow = moreRow.parentElement
          if (moreRow.parentElement === nav) {
            if (scheduleRow && pluginRow) mark(moreRow, 'more')
            else unmark(moreRow, 'more')
          }
        }
      }
      if (canUsePortal && scheduleRow && nav) {
        if (!target || target.parentElement !== nav) {
          target?.remove()
          target = document.createElement('div')
          mark(target, 'session-target')
        }
        if (target.previousElementSibling !== scheduleRow) scheduleRow.after(target)
        publishLiveSessionTarget(target)
        if (sidebar) {
          const source = Array.from(sidebar.children).find(node =>
            node instanceof HTMLElement &&
            node !== scroll?.parentElement &&
            !node.hasAttribute('data-window-drag') &&
            (node.querySelector('button[aria-label="新建会话"], button[aria-label="New session"], button[aria-label="New Session"], button[aria-label="开始对话"], button[aria-label="Start Conversation"]') ||
             node.hasAttribute('data-dtd-live-session-source')))
          if (source instanceof HTMLElement) mark(source, 'session-source')
        }
      } else if (target) {
        publishLiveSessionTarget(null)
        target.remove()
        target = null
        for (const node of marks) node.removeAttribute('data-dtd-live-session-source')
      }
      if (target) for (const button of target.querySelectorAll<HTMLButtonElement>('button[aria-label]')) {
        if (kind(button.getAttribute('aria-label')?.trim() ?? '') !== 'session') continue
        updateAria(button, wording(lang).session)
        for (const span of button.querySelectorAll<HTMLElement>('span')) {
          if (kind(span.textContent?.trim() ?? '') === 'session') updateCopy(span, wording(lang).session)
        }
      }
      // Only default blank-session hero; never rewrite custom session headings.
      for (const title of document.querySelectorAll<HTMLElement>('[data-conversation-scroll] span')) {
        if (title.children.length || !['探索未至之境', 'Into the Unknown'].includes(title.textContent?.trim() ?? '')) continue
        const group = title.parentElement
        const fish = group?.previousElementSibling
        if (!(group instanceof HTMLElement) || !(fish instanceof HTMLElement) || !fish.querySelector('svg')) continue
        mark(group, 'hero-title')
        mark(fish, 'hero-fish')
        const preview = title.nextElementSibling
        if (preview instanceof HTMLElement && ['预览版', 'Preview'].includes(preview.textContent?.trim() ?? ''))
          mark(preview, 'preview')
      }
      // Page headings are changed only on a direct, exact match.
      for (const heading of document.querySelectorAll<HTMLElement>('h1, h2, [role="heading"]')) {
        if (heading.closest('nav, [role="dialog"]') || heading.children.length) continue
        const category = kind(heading.textContent?.trim() ?? '')
        if (category === 'plugins' || category === 'schedules') updateCopy(heading, wording(lang)[category])
      }
    } finally {
      isSyncing = false
      if (typeof observer?.takeRecords === 'function') observer.takeRecords()
    }
  }
  const scheduler = createFrameScheduler(sync)
  const refresh = (): void => scheduler.schedule()
  const unsubscribe = controller.subscribe(refresh)
  observer = typeof MutationObserver === 'function' ? new MutationObserver(records => {
    if (records.some(record => {
      const el = record.target.nodeType === 3 ? record.target.parentElement : record.target
      return !(el instanceof Element) || !el.closest('[data-chat-flow], [data-chat-turn]')
    })) scheduler.schedule()
  }) : undefined
  observer?.observe(document.body, { childList: true, characterData: true, attributes: true, subtree: true,
    attributeFilter: ['aria-label', 'data-sidebar-scrollport', 'data-signed-out'] })
  sync()
  return () => {
    isDisposed = true
    scheduler.cancel()
    observer?.disconnect()
    unsubscribe()
    document.removeEventListener('pointerover', onAccountOver)
    document.removeEventListener('pointerout', onAccountOut)
    document.removeEventListener('focusin', onAccountOver)
    document.removeEventListener('focusout', onAccountOut)
    rollback()
    tag.remove()
  }
}

// The release builder replaces both markers with data from locale/*.json and src/theme.css.
const DICTIONARIES = '__DELTA_SUITE_LOCALES__' as unknown as Record<Language, DeltaCopy>
const OWNED_CSS = '__DELTA_SUITE_STYLE__'
const FEATURE_ONLY_CSS = '__DELTA_SUITE_FEATURE_STYLE__'
const DELTA_SUITE_OWNER = '@fongap-labs/delta-suite'
const STORAGE_KEY = 'fongap.delta-suite.v1'
const DELTA_PALETTE = {
  brand: { light: '#286F78', dark: '#60B4BF' },
  brandHover: { light: '#1D5E66', dark: '#75CBD5' },
  brandSoft: { light: '#EAF3F4', dark: '#1C3B40' },
  brandSoftStrong: { light: '#DCEBEC', dark: '#1C3B40' },
  brandBorder: { light: '#9AC9CE', dark: '#357079' },
  labelPrimary: { light: '#18181B', dark: '#FAFAFA' },
  labelSecondary: { light: '#52525B', dark: '#D4D4D8' },
  labelMuted: { light: '#71717A', dark: '#A1A1AA' },
  hoverSurface: { light: '#EEF0F2', dark: 'rgba(255, 255, 255, 0.08)' },
  surfaceBorder: { light: '#E5E9EB', dark: 'rgba(255, 255, 255, 0.12)' },
  invertedInk: { light: '#FFFFFF', dark: '#0E1A1C' },
  canvas: { light: '#FFFFFF', dark: '#121316' },
  surface: { light: '#FFFFFF', dark: '#1C1E22' },
  popupBg: { light: '#FFFFFF', dark: '#1E1E20' },
  sidebarBg: { light: '#F2F4F6', dark: '#181A1E' },
  bubbleBg: { light: '#F4F8F8', dark: '#132225' },
  bubbleBorder: { light: '#C2DFE2', dark: '#244E55' },
} as const

const TOKENS: Record<string, { light: string; dark: string }> = {
  '--dsw-alias-brand-primary': DELTA_PALETTE.brand,
  '--dsw-alias-brand-primary-invert': { light: '#70B1BA', dark: '#286F78' },
  '--dsw-alias-brand-primary-new-colorprimary-new-color': DELTA_PALETTE.brand,
  '--dsw-alias-brand-text': DELTA_PALETTE.brand,
  '--dsw-alias-button-primary-fill': DELTA_PALETTE.brand,
  '--dsw-alias-button-primary-hover': DELTA_PALETTE.brandHover,
  '--dsw-alias-button-info-fill': DELTA_PALETTE.brand,
  '--dsw-alias-button-info-hover': DELTA_PALETTE.brandHover,
  '--dsw-alias-button-ghost-active-fill': DELTA_PALETTE.brandSoft,
  '--dsw-alias-button-ghost-active-border': DELTA_PALETTE.brandBorder,
  '--dsw-alias-label-primary': DELTA_PALETTE.labelPrimary,
  '--dsw-alias-label-secondary': DELTA_PALETTE.labelSecondary,
  '--dsw-alias-label-tertiary': DELTA_PALETTE.labelMuted,
  '--dsw-alias-label-caption': DELTA_PALETTE.labelMuted,
  '--dsw-alias-interactive-bg-hover': DELTA_PALETTE.hoverSurface,
  '--dsw-alias-label-primary-inverted': DELTA_PALETTE.invertedInk,
  '--dsw-alias-label-primary-foreground': DELTA_PALETTE.invertedInk,
  '--dsw-alias-label-primary-bluish': { light: '#10373C', dark: '#E4F4F6' },
  '--dsw-alias-label-deep-diving': DELTA_PALETTE.brand,
  '--dsw-alias-label-deep-diving-shimmer': { light: '#5CA1AA', dark: '#8EE0EA' },
  '--dsw-alias-state-business-primary': DELTA_PALETTE.brand,
  '--dsw-alias-state-business-tertiary': DELTA_PALETTE.brandSoft,
  '--dsw-alias-link': DELTA_PALETTE.brand,
  '--dsw-alias-bg-base': DELTA_PALETTE.canvas,
  '--dsw-alias-bg-layer-1': DELTA_PALETTE.surface,
  '--dsw-alias-bg-layer-2': DELTA_PALETTE.surface,
  '--dsw-alias-bg-overlay': DELTA_PALETTE.popupBg,
  '--dsw-alias-state-error-primary': { light: '#B91C1C', dark: '#F87171' },
  '--dsw-alias-state-idle-primary': DELTA_PALETTE.labelMuted,
  '--dsw-alias-state-success-primary': { light: '#167D56', dark: '#4FD1A0' },
  '--dsw-alias-state-warn-primary': { light: '#B7791F', dark: '#F0BC60' },
  '--dsw-alias-scrollbar-bg-l2': { light: '#C4CDD1', dark: '#465156' },
  '--dsw-alias-scrollbar-hover-l2': { light: '#9AAAB1', dark: '#5F7077' },
  // Shared native chrome: settings, cards, inputs, panels, hover surfaces and markdown.
  // Semantic diagnostics (syntax highlighting, diffs, success/warning colors) remain distinct.
  '--dsw-alias-bg-document-preview': { light: '#F6F8F9', dark: '#24272B' },
  '--dsw-alias-bg-layer-3': DELTA_PALETTE.surface,
  '--dsw-alias-bg-mask-1': { light: 'rgba(0, 0, 0, 0.24)', dark: 'rgba(0, 0, 0, 0.48)' },
  '--dsw-alias-bg-mask-2': { light: 'rgba(0, 0, 0, 0.12)', dark: 'rgba(0, 0, 0, 0.28)' },
  '--dsw-alias-bg-mask-3': { light: 'rgba(0, 0, 0, 0.48)', dark: 'rgba(0, 0, 0, 0.64)' },
  '--dsw-alias-bg-multi-select': DELTA_PALETTE.brandSoft,
  '--dsw-alias-bg-skeleton': { light: '#EEF0F2', dark: '#292D30' },
  '--dsw-alias-border-inverted': { light: 'rgba(255, 255, 255, 0.5)', dark: 'rgba(0, 0, 0, 0.5)' },
  '--dsw-alias-border-inverted2': { light: 'rgba(255, 255, 255, 0.25)', dark: 'rgba(0, 0, 0, 0.25)' },
  '--dsw-alias-border-l2-darkmode-thin': DELTA_PALETTE.surfaceBorder,
  '--dsw-alias-border-l3': DELTA_PALETTE.surfaceBorder,
  '--dsw-alias-border-l4': { light: '#CCD6DA', dark: '#566168' },
  '--dsw-alias-border-selected': DELTA_PALETTE.brandBorder,
  '--dsw-alias-button-contrast-fill': DELTA_PALETTE.labelPrimary,
  '--dsw-alias-button-elevated-fill': DELTA_PALETTE.surface,
  '--dsw-alias-button-floating-fill': DELTA_PALETTE.surface,
  '--dsw-alias-button-floating-hover': DELTA_PALETTE.hoverSurface,
  '--dsw-alias-button-ghost-active-hover': DELTA_PALETTE.brandSoftStrong,
  '--dsw-alias-button-primary-dimmed': DELTA_PALETTE.brandSoft,
  '--dsw-alias-button-tool-bar-fill': { light: 'rgba(40, 111, 120, 0.18)', dark: 'rgba(96, 180, 191, 0.18)' },
  '--dsw-alias-button-tool-bar-hover': { light: 'rgba(40, 111, 120, 0.26)', dark: 'rgba(96, 180, 191, 0.26)' },
  '--dsw-alias-card-fill': DELTA_PALETTE.surface,
  '--dsw-alias-card-fill-hover': DELTA_PALETTE.hoverSurface,
  '--dsw-alias-card-tile-fill': DELTA_PALETTE.brandSoft,
  '--dsw-alias-hovercard-bg': DELTA_PALETTE.popupBg,
  '--dsw-alias-hovercard-label-primary': DELTA_PALETTE.labelPrimary,
  '--dsw-alias-hovercard-label-secondary': DELTA_PALETTE.labelSecondary,
  '--dsw-alias-hovercard-label-tertiary': DELTA_PALETTE.labelMuted,
  '--dsw-alias-hovercard-state-done': DELTA_PALETTE.brand,
  '--dsw-alias-hovercard-state-error': { light: '#B91C1C', dark: '#F87171' },
  '--dsw-alias-interactive-bg-active': DELTA_PALETTE.brandSoftStrong,
  '--dsw-alias-interactive-bg-hover-accent': DELTA_PALETTE.brandSoft,
  '--dsw-alias-interactive-bg-hover-solid': DELTA_PALETTE.hoverSurface,
  '--dsw-alias-label-dimmed': DELTA_PALETTE.labelMuted,
  '--dsw-alias-label-document-preview': DELTA_PALETTE.labelSecondary,
  '--dsw-alias-label-on-color': DELTA_PALETTE.invertedInk,
  '--dsw-alias-label-primary-dimmed': DELTA_PALETTE.labelSecondary,
  '--dsw-alias-label-shimmer': DELTA_PALETTE.labelMuted,
  '--dsw-alias-markdown-citation': DELTA_PALETTE.brandSoft,
  '--dsw-alias-markdown-code-block-banner': DELTA_PALETTE.hoverSurface,
  '--dsw-alias-markdown-code-block': { light: '#F5F7F8', dark: '#20282B' },
  '--dsw-alias-markdown-code-segment-selected': DELTA_PALETTE.surface,
  '--dsw-alias-markdown-code-segment-unselected': DELTA_PALETTE.hoverSurface,
  '--dsw-alias-markdown-inline-code': DELTA_PALETTE.hoverSurface,
  '--dsw-alias-markdown-placeholder': DELTA_PALETTE.hoverSurface,
  '--dsw-alias-markdown-tag': DELTA_PALETTE.brandSoft,
  '--dsw-alias-scrollbar-bg-l1': { light: '#CED7DC', dark: '#465156' },
  '--dsw-alias-scrollbar-hover-l1': { light: '#9AAAB1', dark: '#5F7077' },
  '--dsw-alias-switch-thumb': DELTA_PALETTE.surface,
  '--dsw-alias-toast-action': DELTA_PALETTE.brand,
  '--dsw-alias-tooltip-label': DELTA_PALETTE.labelPrimary,
  '--dsw-alias-trajectory-accent': DELTA_PALETTE.brand,
  '--dsw-alias-turn-trigger-bg': DELTA_PALETTE.hoverSurface,
  '--dsw-alias-turn-trigger-bg-hover': DELTA_PALETTE.brandSoft,
  '--dsw-specific-file-upload-track': DELTA_PALETTE.brandSoft,
  '--dsw-specific-guide-hero': DELTA_PALETTE.hoverSurface,
  '--dsw-specific-input-major': DELTA_PALETTE.surface,
  '--dsw-specific-login-input': DELTA_PALETTE.surface,
  '--dsw-specific-selector': DELTA_PALETTE.hoverSurface,
  '--dsw-specific-sidebar-nav-item-active': DELTA_PALETTE.brandSoftStrong,
  '--dsw-specific-sidebar-right-flash': DELTA_PALETTE.brand,
  '--dsw-specific-tip': DELTA_PALETTE.brandSoft,
  // Content and platform-specific palette retain their categorical meaning.
  '--dsw-alias-bg-mask-photo': { light: 'rgba(0, 0, 0, 0.88)', dark: 'rgba(0, 0, 0, 0.88)' },
  '--dsw-alias-bg-mask-drop': { light: 'rgba(255, 255, 255, 0.7)', dark: 'rgba(255, 255, 255, 0.22)' },
  '--dsw-alias-button-tool-bar-fill-invisible': { light: 'rgba(40, 111, 120, 0.10)', dark: 'rgba(96, 180, 191, 0.10)' },
  '--dsw-alias-chart-messages': DELTA_PALETTE.brand,
  '--dsw-alias-chart-system': DELTA_PALETTE.labelMuted,
  '--dsw-alias-chart-tools': { light: '#7952A3', dark: '#C2A4E8' },
  '--dsw-alias-code-diff-added': { light: 'rgba(24, 128, 75, 0.10)', dark: 'rgba(74, 193, 120, 0.16)' },
  '--dsw-alias-code-diff-deleted': { light: 'rgba(185, 28, 28, 0.10)', dark: 'rgba(248, 113, 113, 0.16)' },
  '--dsw-alias-file-diff-added-bg': { light: '#E6F4E7', dark: '#1B392B' },
  '--dsw-alias-file-diff-added-gutter': { light: '#EDF7ED', dark: '#234532' },
  '--dsw-alias-file-diff-added-marker': { light: '#18804B', dark: '#4AC178' },
  '--dsw-alias-file-diff-deleted-bg': { light: '#FCE6E2', dark: '#46282A' },
  '--dsw-alias-file-diff-deleted-gutter': { light: '#FDECE9', dark: '#553135' },
  '--dsw-alias-file-diff-deleted-marker': { light: '#BA2723', dark: '#F87171' },
  '--dsw-alias-illustration-background': DELTA_PALETTE.brandSoft,
  '--dsw-alias-illustration-backing': DELTA_PALETTE.brandBorder,
  '--dsw-alias-illustration-detail': DELTA_PALETTE.brandBorder,
  '--dsw-alias-illustration-inset': DELTA_PALETTE.surface,
  '--dsw-alias-illustration-shadow': DELTA_PALETTE.surface,
  '--dsw-alias-illustration-surface': DELTA_PALETTE.hoverSurface,
  '--dsw-alias-json-tree-hover': DELTA_PALETTE.hoverSurface,
  '--dsw-alias-json-tree-icon': DELTA_PALETTE.labelSecondary,
  '--dsw-alias-json-tree-keyword': { light: '#5641A4', dark: '#C4B0FF' },
  '--dsw-alias-json-tree-number': { light: '#5641A4', dark: '#C4B0FF' },
  '--dsw-alias-json-tree-property': { light: '#7952A3', dark: '#D2A5F0' },
  '--dsw-alias-json-tree-punctuation': DELTA_PALETTE.labelPrimary,
  '--dsw-alias-json-tree-string': { light: '#A3312E', dark: '#F0A0A0' },
  '--dsw-alias-state-done-primary': DELTA_PALETTE.brand,
  '--dsw-alias-state-error-secondary': { light: '#DC5656', dark: '#F89A9A' },
  '--dsw-alias-state-success-secondary': { light: '#299467', dark: '#7AE0B5' },
  '--dsw-alias-state-success-tertiary': { light: '#E4F4EC', dark: '#204233' },
  '--dsw-alias-state-warn-label': { light: '#8A5E15', dark: '#F0BC60' },
  '--dsw-alias-state-warn-secondary': { light: '#D39B38', dark: '#F3CF86' },
  '--dsw-alias-state-warn-tertiary': { light: '#FFF4D9', dark: '#443822' },
  '--dsw-specific-sidebar-glass-collapsed-fill': { light: 'transparent', dark: 'rgba(24, 26, 30, 0.22)' },
  '--dsw-specific-sidebar-glass-collapsed-hover': DELTA_PALETTE.hoverSurface,
  '--dsw-specific-sidebar-glass-fill': { light: 'rgba(242, 244, 246, 0.72)', dark: 'rgba(24, 26, 30, 0.55)' },
  '--dsw-specific-sidebar-glass-hover': { light: 'rgba(238, 240, 242, 0.85)', dark: 'rgba(96, 180, 191, 0.10)' },
  '--dsw-specific-sidebar-tint': { light: 'rgba(40, 111, 120, 0.06)', dark: 'rgba(96, 180, 191, 0.06)' },
  '--dsw-specific-sidebar-wash-bottom': { light: 'rgba(40, 111, 120, 0.05)', dark: 'rgba(96, 180, 191, 0.06)' },
  '--dsw-specific-sidebar-wash-bottom-clear': { light: 'rgba(40, 111, 120, 0)', dark: 'rgba(96, 180, 191, 0)' },
  '--dsw-specific-sidebar-wash-top': { light: 'rgba(40, 111, 120, 0.08)', dark: 'rgba(96, 180, 191, 0.08)' },
  '--dsw-specific-sidebar-wash-top-clear': { light: 'rgba(40, 111, 120, 0)', dark: 'rgba(96, 180, 191, 0)' },
  '--dsw-alias-bg-document-selection': { light: 'rgba(40, 111, 120, 0.22)', dark: 'rgba(96, 180, 191, 0.28)' },
  '--dsw-alias-border-l1': DELTA_PALETTE.surfaceBorder,
  '--dsw-alias-border-l2': DELTA_PALETTE.surfaceBorder,
  '--dsw-specific-sidebar-fill': DELTA_PALETTE.sidebarBg,
  '--dsw-specific-sidebar-nav-item-active-accent': DELTA_PALETTE.brandSoftStrong,
  '--dsw-specific-bubble': DELTA_PALETTE.bubbleBg,
  '--dsw-specific-bubble-highlight': DELTA_PALETTE.bubbleBorder,
  '--dsw-focus-ring-width': { light: '1px', dark: '1px' },
  '--dsw-focus-ring-color': DELTA_PALETTE.brand,
  '--dsw-alias-focus-stroke': DELTA_PALETTE.brand,
  '--dsw-alias-border-focus': DELTA_PALETTE.brand,
  '--dsw-menu-surface-fill': DELTA_PALETTE.popupBg,
  '--dsw-menu-backdrop-filter': { light: 'none', dark: 'none' },
  '--dsw-alias-menu-icon': DELTA_PALETTE.labelSecondary,
  '--dsw-alias-interactive-bg-hover-danger': { light: '#FDECEC', dark: '#482729' },
  '--dsw-specific-menu': DELTA_PALETTE.popupBg,
  '--dsw-hovercard-bg': DELTA_PALETTE.popupBg,
  '--dsw-alias-tooltip-bg': DELTA_PALETTE.popupBg,
  '--dsw-alias-tooltip-key-bg': { light: '#EEF0F2', dark: 'rgba(255, 255, 255, 0.12)' },
  '--dsw-alias-toast-bg': DELTA_PALETTE.popupBg,
  '--dsw-alias-toast-label': { light: '#18181B', dark: '#FAFAFA' },
  '--dsw-alias-menu-group-header-fill': { light: '#F8F9FA', dark: '#242427' },
  '--dsw-alias-bg-module-platform': { light: '#EAF3F4', dark: '#1C2A2D' },
  '--dsw-static-deepseek-50': DELTA_PALETTE.bubbleBg,
  '--dsw-static-deepseek-100': DELTA_PALETTE.brandSoft,
  '--dsw-static-deepseek-200': DELTA_PALETTE.bubbleBorder,
  '--dsw-static-deepseek-300': DELTA_PALETTE.brandBorder,
  '--dsw-static-deepseek-400': { light: '#45939D', dark: '#60B4BF' },
  '--dsw-static-deepseek-450': { light: '#337F89', dark: '#75CBD5' },
  '--dsw-static-deepseek-500': DELTA_PALETTE.brand,
  '--dsw-static-deepseek-600': { light: '#1D5E66', dark: '#4A98A3' },
  '--dsw-static-deepseek-800': { light: '#16484E', dark: '#8EE0EA' },
  '--dsw-static-deepseek-900': { light: '#10373C', dark: '#B2ECF3' },
  '--dsw-static-blue-50': DELTA_PALETTE.bubbleBg,
  '--dsw-static-blue-50p': DELTA_PALETTE.bubbleBg,
  '--dsw-static-blue-75': { light: '#EAF3F4', dark: '#172B2E' },
  '--dsw-static-blue-100': { light: '#DCEBEC', dark: '#1C3B40' },
  '--dsw-static-blue-300': DELTA_PALETTE.brandBorder,
  '--dsw-static-blue-400': { light: '#5CA1AA', dark: '#60B4BF' },
  '--dsw-static-blue-450': { light: '#337F89', dark: '#75CBD5' },
  '--dsw-static-blue-500': DELTA_PALETTE.brand,
  '--dsw-static-blue-600': DELTA_PALETTE.brandHover,
  '--dsw-static-blue-800': { light: '#16484E', dark: '#8EE0EA' },
  '--dsw-static-blue-900': { light: '#10373C', dark: '#B2ECF3' },
  '--dsw-static-blue-950': { light: '#0A2528', dark: '#D8F6F9' },
  '--ens-color-primary': DELTA_PALETTE.brand,
  '--ens-color-primary-foreground': DELTA_PALETTE.invertedInk,
  '--ens-color-accent': DELTA_PALETTE.brandSoft,
  '--ens-color-accent-foreground': DELTA_PALETTE.brand,
  '--ens-color-ring': DELTA_PALETTE.brand,
}

// Public Host locale wins; other locales fall back to Suite English.
let currentHostLocale: string | undefined
function language(): Language {
  const navLang = typeof navigator !== 'undefined' ? navigator.language : ''
  const docLang = typeof document !== 'undefined' ? document.documentElement?.lang : ''
  const value = currentHostLocale || docLang || navLang || 'en'
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

function createController(): DeltaController {
  let snapshot: DeltaState = Object.freeze({ mode: readMode(), language: language(), error: false, revision: 0 })
  let ownedLayer: (() => void) | undefined
  let activeTheme: ThemeApi | undefined
  let activeLayout: LayoutApi | undefined
  let activeSidebarRight: SidebarRightApi | undefined
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
      if (!activeTheme || typeof activeTheme.overrideTokens !== 'function') return false
      ownedLayer = activeTheme.overrideTokens(DELTA_SUITE_OWNER, TOKENS)
      return typeof ownedLayer === 'function'
    } catch { return false }
  }
  const safeLayout = (command: (layout: LayoutApi) => void): void => {
    if (isDisposed) return
    try {
      if (!activeLayout) throw new Error('Host layout capability is unavailable')
      command(activeLayout)
      publish({ error: false })
    } catch { publish({ error: true }) }
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
    toggleSidebar: () => { safeLayout(layout => layout.toggleSidebar()) },
    toggleSidebarSafe: () => {
      if (isDisposed || !activeLayout || typeof activeLayout.toggleSidebar !== 'function') return false
      try { activeLayout.toggleSidebar(); return true } catch { return false }
    },
    toggleRightbarSafe: () => {
      if (isDisposed || !activeSidebarRight || typeof activeSidebarRight.toggleExpanded !== 'function') return false
      try { activeSidebarRight.toggleExpanded(); return true } catch { return false }
    },
    openConversation: () => { safeLayout(layout => layout.selectPanel(null)) },
    dispose: () => {
      if (isDisposed) return
      isDisposed = true
      ownedLayer?.()
      ownedLayer = undefined
      activeLayout = undefined
      activeSidebarRight = undefined
      listeners.clear()
    },
    // Used by the owning activation to sync a host language switch.
    syncLanguage: () => { publish({ language: language() }) },
    activate: () => { if (!applyPalette(snapshot.mode)) publish({ error: true }) },
    bindTheme: (theme: ThemeApi | undefined) => {
      if (isDisposed) return
      activeTheme = theme
      publish({ error: !applyPalette(snapshot.mode) })
    },
    bindLayout: (layout: LayoutApi | undefined) => {
      if (isDisposed) return
      activeLayout = layout
    },
    bindSidebarRight: (sidebarRight: SidebarRightApi | undefined) => {
      if (!isDisposed) activeSidebarRight = sidebarRight
    },
  } as DeltaController & {
    syncLanguage(): void
    activate(): void
    toggleSidebarSafe(): boolean
    toggleRightbarSafe(): boolean
    bindSidebarRight(sidebarRight: SidebarRightApi | undefined): void
  }
}

const toastEntries = new Set<{ node: HTMLElement; timer: number }>()
const scheduleTimer = (fn: () => void, ms: number): number => {
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') return window.setTimeout(fn, ms)
  if (typeof setTimeout === 'function') return setTimeout(fn, ms) as unknown as number
  return 0
}
const cancelTimer = (id: number): void => {
  if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
    window.clearTimeout(id)
    return
  }
  if (typeof clearTimeout === 'function') clearTimeout(id)
}
/** Schedules one DOM sync per animation frame while staying safe under synchronous rAF stubs. */
const createFrameScheduler = (run: () => void): { schedule: () => void; cancel: () => void } => {
  let rafId: number | undefined
  let timerId: number | undefined
  let cancelled = false
  return {
    schedule: () => {
      if (cancelled) return
      if (typeof requestAnimationFrame === 'function') {
        if (rafId !== undefined) return
        let hasFired = false
        const nextId = requestAnimationFrame(() => {
          hasFired = true
          rafId = undefined
          if (!cancelled) run()
        })
        if (!hasFired) rafId = nextId
      } else if (typeof setTimeout === 'function') {
        if (timerId !== undefined) return
        timerId = scheduleTimer(() => {
          timerId = undefined
          if (!cancelled) run()
        }, 16)
      } else {
        run()
      }
    },
    cancel: () => {
      cancelled = true
      if (rafId !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId)
      if (timerId !== undefined) cancelTimer(timerId)
      rafId = undefined
      timerId = undefined
    },
  }
}
const createSvgEl = (tag: string, attrs: Record<string, string | number>): Element => {
  const node = typeof document.createElementNS === 'function'
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v))
  }
  return node
}
const clearNodeChildren = (node: HTMLElement): void => {
  if (typeof node.replaceChildren === 'function') {
    node.replaceChildren()
    return
  }
  if (Array.isArray((node as unknown as { children?: unknown[] }).children)) {
    const list = (node as unknown as { children: Array<{ remove?: () => void }> }).children
    while (list.length > 0) {
      const child = list[list.length - 1]
      if (typeof child?.remove === 'function') child.remove()
      else list.pop()
    }
    return
  }
  while (node.firstChild && typeof node.removeChild === 'function') {
    node.removeChild(node.firstChild)
  }
}
const showDeltaToast = (message: string): void => {
  try {
    if (!document.body) return
    const node = document.createElement('div')
    node.className = 'dtd-toast'
    node.setAttribute('role', 'status')
    node.textContent = message
    document.body.appendChild(node)
    const entry = { node, timer: 0 }
    entry.timer = scheduleTimer(() => {
      node.remove()
      toastEntries.delete(entry)
    }, 3000)
    toastEntries.add(entry)
  } catch { /* Toasts must never prevent native interaction. */ }
}
const clearDeltaToasts = (): void => {
  for (const entry of toastEntries) {
    cancelTimer(entry.timer)
    entry.node.remove()
  }
  toastEntries.clear()
}

function createSearchIconSvg(): SVGElement {
  const createNode = (tag: string): Element =>
    typeof document.createElementNS === 'function'
      ? document.createElementNS('http://www.w3.org/2000/svg', tag)
      : document.createElement(tag)
  const svg = createNode('svg') as SVGElement
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '15')
  svg.setAttribute('height', '15')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('class', 'dtd-search-icon')
  const circle = createNode('circle')
  circle.setAttribute('cx', '11')
  circle.setAttribute('cy', '11')
  circle.setAttribute('r', '8')
  const line = createNode('line')
  line.setAttribute('x1', '21')
  line.setAttribute('y1', '21')
  line.setAttribute('x2', '16.65')
  line.setAttribute('y2', '16.65')
  svg.appendChild(circle)
  svg.appendChild(line)
  return svg
}

interface ClientFeatureSnapshot {
  isSearchProtectionReady: boolean
  hasPin: boolean
  lockMode?: 'totp' | 'pin' | 'none'
  lockedSessionIds: readonly string[]
  lockedWorkspaceIds: readonly string[]
  movedSessions: Readonly<Record<string, string>>
  deletedSessionIds: readonly string[]
  tempUnlockedIds: readonly string[]
  tempUnlockedWorkspaceIds: readonly string[]
  activeSessionId?: string
  revision: number
}

// Self-contained ISO/IEC 18004 QR Code encoder (ECC Level M, Byte mode, Versions 1..10) + SVG builder.
// Zero external dependencies and zero network calls for full privacy compliance.
interface QrVersionSpec {
  size: number
  align: readonly number[]
  ecPerBlock: number
  groups: readonly (readonly [number, number])[]
}

const QR_LEVEL_M_VERSIONS: readonly QrVersionSpec[] = [
  { size: 21, align: [], ecPerBlock: 10, groups: [[1, 16]] },
  { size: 25, align: [6, 18], ecPerBlock: 16, groups: [[1, 28]] },
  { size: 29, align: [6, 22], ecPerBlock: 26, groups: [[1, 44]] },
  { size: 33, align: [6, 26], ecPerBlock: 18, groups: [[2, 32]] },
  { size: 37, align: [6, 30], ecPerBlock: 24, groups: [[2, 43]] },
  { size: 41, align: [6, 34], ecPerBlock: 16, groups: [[4, 27]] },
  { size: 45, align: [6, 22, 38], ecPerBlock: 18, groups: [[4, 31]] },
  { size: 49, align: [6, 24, 42], ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
  { size: 53, align: [6, 26, 46], ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
  { size: 57, align: [6, 28, 50], ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
]

const QR_GF_EXP = new Uint8Array(512)
const QR_GF_LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    QR_GF_EXP[i] = x
    QR_GF_EXP[i + 255] = x
    QR_GF_LOG[x] = i
    x = x & 0x80 ? (x << 1) ^ 0x11d : x << 1
  }
}

function qrGfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return QR_GF_EXP[QR_GF_LOG[a] + QR_GF_LOG[b]]
}

function qrRsComputeRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  let gen: number[] = [1]
  for (let i = 0; i < ecCount; i++) {
    const next = new Array<number>(gen.length + 1).fill(0)
    const root = QR_GF_EXP[i]
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j]
      next[j + 1] ^= qrGfMul(gen[j], root)
    }
    gen = next
  }
  const work = new Uint8Array(data.length + ecCount)
  work.set(data, 0)
  for (let i = 0; i < data.length; i++) {
    const coef = work[i]
    if (coef === 0) continue
    for (let j = 0; j < gen.length; j++) {
      work[i + j] ^= qrGfMul(gen[j], coef)
    }
  }
  return work.slice(data.length)
}

function encodeQrBytes(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text)
  const utf8 = unescape(encodeURIComponent(text))
  const out = new Uint8Array(utf8.length)
  for (let i = 0; i < utf8.length; i++) out[i] = utf8.charCodeAt(i)
  return out
}

function encodeQrMatrix(text: string): boolean[][] {
  const bytes = encodeQrBytes(text)
  let version = -1
  let totalDataCap = 0
  for (let v = 1; v <= QR_LEVEL_M_VERSIONS.length; v++) {
    const spec = QR_LEVEL_M_VERSIONS[v - 1]
    const cap = spec.groups.reduce((acc, [cnt, len]) => acc + cnt * len, 0)
    const headerBytes = v >= 10 ? 3 : 2
    if (bytes.length + headerBytes <= cap) {
      version = v
      totalDataCap = cap
      break
    }
  }
  if (version < 1) throw new Error('QR payload exceeds supported Version 10-M capacity')

  const spec = QR_LEVEL_M_VERSIONS[version - 1]
  const n = spec.size

  // Build Byte-mode bit stream
  const bits: number[] = []
  const pushBits = (val: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  pushBits(0b0100, 4)
  pushBits(bytes.length, version >= 10 ? 16 : 8)
  for (let i = 0; i < bytes.length; i++) pushBits(bytes[i], 8)
  const capBits = totalDataCap * 8
  pushBits(0, Math.min(4, capBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)
  let padIdx = 0
  while (bits.length < capBits) {
    pushBits(padIdx % 2 === 0 ? 0xec : 0x11, 8)
    padIdx++
  }

  const dataCw = new Uint8Array(totalDataCap)
  for (let i = 0; i < totalDataCap; i++) {
    let cw = 0
    for (let b = 0; b < 8; b++) cw = (cw << 1) | bits[i * 8 + b]
    dataCw[i] = cw
  }

  // Split blocks, compute RS ECC, and interleave
  const dataBlocks: Uint8Array[] = []
  const eccBlocks: Uint8Array[] = []
  let offset = 0
  for (const [cnt, len] of spec.groups) {
    for (let i = 0; i < cnt; i++) {
      const blk = dataCw.slice(offset, offset + len)
      offset += len
      dataBlocks.push(blk)
      eccBlocks.push(qrRsComputeRemainder(blk, spec.ecPerBlock))
    }
  }
  const codewords: number[] = []
  const maxDataLen = dataBlocks.reduce((m, b) => Math.max(m, b.length), 0)
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) if (i < blk.length) codewords.push(blk[i])
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const ecc of eccBlocks) codewords.push(ecc[i])
  }
  const cwBits: number[] = []
  for (const cw of codewords) {
    for (let b = 7; b >= 0; b--) cwBits.push((cw >>> b) & 1)
  }

  // Setup function patterns
  const modules: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const isFunc: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const setFunc = (r: number, c: number, isDarkCell: boolean) => {
    modules[r][c] = isDarkCell
    isFunc[r][c] = true
  }

  const drawFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr
        const c = c0 + dc
        if (r < 0 || r >= n || c < 0 || c >= n) continue
        const inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
        const border = inBox && (dr === 0 || dr === 6 || dc === 0 || dc === 6)
        const center = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
        setFunc(r, c, border || center)
      }
    }
  }
  drawFinder(0, 0)
  drawFinder(0, n - 7)
  drawFinder(n - 7, 0)

  for (let i = 8; i < n - 8; i++) {
    setFunc(6, i, i % 2 === 0)
    setFunc(i, 6, i % 2 === 0)
  }

  // Reserve format info strips & set fixed dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunc[8][i] = true
      isFunc[i][8] = true
    }
  }
  for (let i = 0; i < 8; i++) isFunc[8][n - 8 + i] = true
  for (let i = 0; i < 7; i++) isFunc[n - 7 + i][8] = true
  setFunc(n - 8, 8, true)

  // Alignment patterns
  for (const cy of spec.align) {
    for (const cx of spec.align) {
      if ((cy <= 8 && cx <= 8) || (cy <= 8 && cx >= n - 8) || (cy >= n - 8 && cx <= 8)) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const dist = Math.max(Math.abs(dy), Math.abs(dx))
          setFunc(cy + dy, cx + dx, dist === 2 || dist === 0)
        }
      }
    }
  }

  // Version info for Version >= 7
  if (version >= 7) {
    let rem = version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const vBits = (version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >>> i) & 1) === 1
      const r = Math.floor(i / 3)
      const c = n - 11 + (i % 3)
      setFunc(r, c, bit)
      setFunc(c, r, bit)
    }
  }

  // Zigzag placement
  let bitIdx = 0
  let isUpward = true
  for (let col = n - 1; col >= 1; col -= 2) {
    if (col === 6) col--
    for (let step = 0; step < n; step++) {
      const r = isUpward ? n - 1 - step : step
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc
        if (isFunc[r][c]) continue
        modules[r][c] = bitIdx < cwBits.length ? cwBits[bitIdx] === 1 : false
        bitIdx++
      }
    }
    isUpward = !isUpward
  }

  const writeFormatBits = (isDarkMatrix: boolean[][], mask: number) => {
    const data = (0b00 << 3) | mask // ECC Level M = 00
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const fBits = ((data << 10) | rem) ^ 0x5412
    for (let i = 0; i <= 5; i++) isDarkMatrix[8][i] = ((fBits >>> (14 - i)) & 1) === 1
    isDarkMatrix[8][7] = ((fBits >>> 8) & 1) === 1
    isDarkMatrix[8][8] = ((fBits >>> 7) & 1) === 1
    isDarkMatrix[7][8] = ((fBits >>> 6) & 1) === 1
    for (let i = 0; i <= 5; i++) isDarkMatrix[i][8] = ((fBits >>> i) & 1) === 1
    for (let i = 0; i < 7; i++) isDarkMatrix[n - 1 - i][8] = ((fBits >>> (14 - i)) & 1) === 1
    for (let i = 0; i < 8; i++) isDarkMatrix[8][n - 8 + i] = ((fBits >>> (7 - i)) & 1) === 1
  }

  const maskBit = (mask: number, r: number, c: number): boolean => {
    switch (mask) {
      case 0: return (r + c) % 2 === 0
      case 1: return r % 2 === 0
      case 2: return c % 3 === 0
      case 3: return (r + c) % 3 === 0
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
      default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
    }
  }

  const penaltyScore = (isDarkMatrix: boolean[][]): number => {
    let score = 0
    for (let r = 0; r < n; r++) {
      let runLen = 1
      for (let c = 1; c < n; c++) {
        if (isDarkMatrix[r][c] === isDarkMatrix[r][c - 1]) runLen++
        else { if (runLen >= 5) score += 3 + (runLen - 5); runLen = 1 }
      }
      if (runLen >= 5) score += 3 + (runLen - 5)
    }
    for (let c = 0; c < n; c++) {
      let runLen = 1
      for (let r = 1; r < n; r++) {
        if (isDarkMatrix[r][c] === isDarkMatrix[r - 1][c]) runLen++
        else { if (runLen >= 5) score += 3 + (runLen - 5); runLen = 1 }
      }
      if (runLen >= 5) score += 3 + (runLen - 5)
    }
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const v = isDarkMatrix[r][c]
        if (isDarkMatrix[r][c + 1] === v && isDarkMatrix[r + 1][c] === v && isDarkMatrix[r + 1][c + 1] === v) score += 3
      }
    }
    let darkCount = 0
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (isDarkMatrix[r][c]) darkCount++
      }
    }
    score += Math.floor(Math.abs(darkCount * 100 / (n * n) - 50) / 5) * 10
    return score
  }

  let bestGrid = modules
  let bestScore = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 8; mask++) {
    const cand = modules.map((row, r) => row.map((v, c) => (isFunc[r][c] ? v : v !== maskBit(mask, r, c))))
    writeFormatBits(cand, mask)
    const sc = penaltyScore(cand)
    if (sc < bestScore) {
      bestScore = sc
      bestGrid = cand
    }
  }
  return bestGrid
}

function createQrSvgElement(uri: string): Element {
  const grid = encodeQrMatrix(uri)
  const quiet = 4
  const total = grid.length + quiet * 2
  const svg = createSvgEl('svg', {
    class: 'dtd-totp-qr-svg',
    viewBox: `0 0 ${total} ${total}`,
    width: 176,
    height: 176,
    role: 'img',
    'aria-label': '2FA QR Code',
  })
  svg.appendChild(createSvgEl('rect', { x: 0, y: 0, width: total, height: total, fill: '#ffffff' }))
  const parts: string[] = []
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]) parts.push(`M${c + quiet},${r + quiet}h1v1h-1z`)
    }
  }
  svg.appendChild(createSvgEl('path', { d: parts.join(''), fill: '#000000' }))
  return svg
}

function createLockSvg(size = 13, isUnlocked = false): Element {
  const svg = createSvgEl('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  })
  svg.appendChild(createSvgEl('rect', { x: 4, y: 11, width: 16, height: 10, rx: 2, ry: 2 }))
  svg.appendChild(createSvgEl('path', {
    d: isUnlocked ? 'M7 11V7a5 5 0 0 1 9.9-1' : 'M7 11V7a5 5 0 0 1 10 0v4',
  }))
  return svg
}

function canCallHostHttp(): boolean {
  try {
    return typeof fetch === 'function' &&
      typeof window !== 'undefined' &&
      typeof window.location?.href === 'string' &&
      /^(?:https?|dsh-app):/i.test(window.location.href)
  } catch {
    return false
  }
}

interface ClientFeatureManager {
  getSnapshot(): ClientFeatureSnapshot
  readSearchProtection(): SearchContentProtection
  getContentProtectionRevision(): number
  subscribeContentProtection(listener: () => void): () => void
  /** Public Session catalog change notifications for selected hover metadata. */
  subscribeSessionCatalog(listener: () => void): () => void
  subscribe(listener: () => void): () => void
  ensureLoaded(): void
  getWorkspaces(): readonly { workspaceId: string; path: string; title: string; sessionIds?: readonly string[] }[]
  setWorkspacesApi(api: WorkspacesApi | undefined, readNative?: () => WorkspaceSnapshot): void
  setSessionsApi(api: SearchSessionsApi | undefined): void
  setNavigationApi(api: SearchNavigationApi | undefined): void
  setActiveSessionId(id: string | undefined): void
  getActiveSessionId(): string | undefined
  /** Selected public hover visibility and UTC time: null denies identity, 0 omits time. */
  readSessionHoverSelection(sessionId: string): number | null
  /** Sanitized public Host catalog timestamp; never returns paths or private records. */
  readSessionUpdateTime(sessionId: string): number | undefined
  isLocked(sessionId: string | undefined): boolean
  isProtectedView(sessionId: string | undefined): boolean
  isDeleted(sessionId: string | undefined): boolean
  isWorkspaceLocked(wsIdOrPath: string | undefined): boolean
  isWorkspaceProtected(wsIdOrPath: string | undefined): boolean
  isSessionInLockedWorkspace(sessionId: string | undefined): boolean
  getWorkspaceCount(): number
  hasSessionsApi(): boolean
  getUngroupedSessionIds(isIncludingArchived?: boolean): string[]
  refreshState(): Promise<void>
  beginTotpSetup(): Promise<{ ok: boolean; setupToken?: string; secret?: string; otpauthUri?: string; error?: string }>
  confirmTotpSetup(sessionId: string, setupToken: string, code: string): Promise<{ ok: boolean; error?: string }>
  confirmTotpSetupWorkspace(workspaceId: string, setupToken: string, code: string): Promise<{ ok: boolean; error?: string }>
  lockSession(sessionId: string, newPin?: string): Promise<{ ok: boolean; error?: string }>
  lockWorkspace(workspaceId: string): Promise<{ ok: boolean; error?: string }>
  verifyOrUnlockSession(sessionId: string, pin: string, isPermanent: boolean): Promise<{ ok: boolean; error?: string }>
  verifyOrUnlockWorkspace(workspaceId: string, pin: string, isPermanent: boolean): Promise<{ ok: boolean; error?: string }>
  clearPin(pin: string): Promise<{ ok: boolean; error?: string }>
  moveSession(sessionId: string, targetWorkspaceId: string): Promise<{ ok: boolean; error?: string }>
  deleteSession(sessionId: string): Promise<{ ok: boolean; error?: string }>
  deleteUngroupedSessions(sessionIds: string[]): Promise<{ ok: boolean; error?: string; deletedIds?: string[] }>
  closeDialog(): void
  openSetPinDialog(sessionId: string, title?: string): void
  openSetPinWorkspaceDialog(workspaceId: string, title?: string): void
  openUnlockPinDialog(sessionId: string): void
  openUnlockWorkspaceDialog(workspaceId: string): void
  openClearPinDialog(): void
  openMoveDialog(sessionId: string, title?: string): void
  openDeleteDialog(sessionId: string, title?: string): void
  openDeleteUngroupedDialog(): void
  syncLockShieldOverlay(container: HTMLElement | null): void
  onDataMutate(listener: () => void): () => void
  triggerDataRefresh(): void
  resetSessionOverlays(): void
}

// Observe the Host's confirmed mainView ownership; a navigation request is not
// evidence that its target became the active Session. Ambiguous or unavailable
// snapshots must not replace the last known selection used by privacy guards.
function readConfirmedMainSessionId(list: SearchSessionsApi['list']): string | undefined {
  try {
    const rows = Object.values(list.getSnapshot().byId)
    const mainRows = rows.filter(row =>
      ((row as { retainedBy?: { mainView?: number } }).retainedBy?.mainView ?? 0) > 0)
    return mainRows.length === 1 && typeof mainRows[0].id === 'string' && mainRows[0].id
      ? mainRows[0].id : undefined
  } catch { return undefined }
}

function observeConfirmedMainSession(list: SearchSessionsApi['list'], onConfirmed: (id: string) => void): () => void {
  let isDisposed = false
  const sync = (): void => {
    if (isDisposed) return
    const id = readConfirmedMainSessionId(list)
    if (id !== undefined) onConfirmed(id)
  }
  let unsubscribe: (() => void) | undefined
  try { unsubscribe = list.subscribe?.(sync) } catch { /* Older Host: keep the existing UI compatibility path. */ }
  sync()
  return () => {
    if (isDisposed) return
    isDisposed = true
    unsubscribe?.()
  }
}

// Scoped projection for Delta-owned views; never replace Host list methods.
function createWorkspaceCompatibilityProjection(): (base: WorkspaceSnapshot, f: Pick<ClientFeatureSnapshot, 'deletedSessionIds' | 'lockedSessionIds' | 'movedSessions'>) => WorkspaceSnapshot {
  let previousBase: WorkspaceSnapshot | undefined
  let previousDeleted: readonly string[] | undefined
  let previousLocked: readonly string[] | undefined
  let previousMoved: ClientFeatureSnapshot['movedSessions'] | undefined
  let previousResult: WorkspaceSnapshot | undefined
  const sameIds = (a: readonly string[] | undefined, b: readonly string[]): boolean =>
    !!a && a.length === b.length && a.every((id, index) => id === b[index])
  return (base, f) => {
    if (base === previousBase && f.deletedSessionIds === previousDeleted &&
        f.lockedSessionIds === previousLocked && f.movedSessions === previousMoved && previousResult) return previousResult
    const moves = Object.entries(f.movedSessions)
    if (f.deletedSessionIds.length === 0 && f.lockedSessionIds.length === 0 && moves.length === 0) return base
    const deleted = new Set(f.deletedSessionIds)
    const locked = new Set(f.lockedSessionIds.filter(id => !deleted.has(id)))
    const workspaceIds = new Set(base.items.map(ws => ws.workspaceId))
    const targets = new Map<string, string>()
    const incomingByWorkspace = new Map<string, string[]>()
    for (const [sid, target] of moves) {
      if (deleted.has(sid) || !workspaceIds.has(target)) continue
      targets.set(sid, target)
      const incoming = incomingByWorkspace.get(target) ?? []
      incoming.push(sid)
      incomingByWorkspace.set(target, incoming)
    }
    let hasItemsChanged = false
    const items = base.items.map(ws => {
      const original = ws.sessionIds
      let next = (original ?? []).filter(sid => !deleted.has(sid) &&
        (!targets.has(sid) || targets.get(sid) === ws.workspaceId))
      const incoming = incomingByWorkspace.get(ws.workspaceId)
      if (incoming?.length) {
        const existing = new Set(next)
        next = [...incoming.filter(sid => !existing.has(sid)).reverse(), ...next]
      }
      if ((!original && next.length === 0) || sameIds(original, next)) return ws
      hasItemsChanged = true
      return { ...ws, sessionIds: next }
    })
    const archived = [...new Set([...(base.archivedSessionIds ?? []).filter(id => !deleted.has(id)), ...locked])]
    const pinned = base.pinnedSessionIds?.filter(id => !deleted.has(id) && !locked.has(id))
    const hasArchiveChanged = (base.archivedSessionIds !== undefined || archived.length > 0) && !sameIds(base.archivedSessionIds, archived)
    const hasPinChanged = pinned !== undefined && !sameIds(base.pinnedSessionIds, pinned)
    const result = !hasItemsChanged && !hasArchiveChanged && !hasPinChanged ? base : {
      ...base,
      ...(hasItemsChanged ? { items } : {}),
      ...(hasArchiveChanged ? { archivedSessionIds: archived } : {}),
      ...(hasPinChanged ? { pinnedSessionIds: pinned } : {}),
    }
    previousBase = base
    previousDeleted = f.deletedSessionIds
    previousLocked = f.lockedSessionIds
    previousMoved = f.movedSessions
    previousResult = result
    return result
  }
}

// Transitional client guard, not a Host authorization boundary. Use durable
// lock membership, never temporary view grants or the synthetic list wrapper.
type WorkspaceMutationBlock = 'workspace-locked' | 'session-locked' |
  'session-deleted' | 'workspace-state-unavailable' | 'sole-workspace-protected' |
  'protected-default-workspace' | 'workspace-guard-disposed'
type WorkspaceProtectionState = Pick<ClientFeatureSnapshot,
  'lockedSessionIds' | 'lockedWorkspaceIds' | 'deletedSessionIds' | 'movedSessions'>

function workspaceSessionAliases(id: string): string[] {
  const raw = id.replace(/^session-/, '')
  return [id, raw, 'session-' + raw]
}

function readWorkspaceMutationPolicy(
  state: WorkspaceProtectionState,
  readNative: () => WorkspaceSnapshot,
) {
  const lockedSessions = new Set(state.lockedSessionIds.flatMap(workspaceSessionAliases))
  const deletedSessions = new Set(state.deletedSessionIds.flatMap(workspaceSessionAliases))
  const lockedKeys = new Set(state.lockedWorkspaceIds)
  const rowsById = new Map<string, WorkspaceSnapshot['items'][number]>()
  const rowsByPath = new Map<string, WorkspaceSnapshot['items'][number]>()
  let isComplete = true
  try {
    const snapshot = readNative()
    if (!Array.isArray(snapshot.items)) throw new Error('invalid workspace snapshot')
    const matchedKeys = new Set<string>()
    for (const row of snapshot.items) {
      const { workspaceId, path, sessionIds } = row
      if (typeof workspaceId !== 'string' || !workspaceId.trim() ||
          typeof path !== 'string' || !path.trim() ||
          rowsById.has(workspaceId) || rowsByPath.has(path) ||
          !Array.isArray(sessionIds) ||
          sessionIds.some(id => typeof id !== 'string' || !id.trim())) {
        throw new Error('invalid workspace row')
      }
      rowsById.set(workspaceId, row)
      rowsByPath.set(path, row)
      if (lockedKeys.has(workspaceId) || lockedKeys.has(path)) {
        if (lockedKeys.has(workspaceId)) matchedKeys.add(workspaceId)
        if (lockedKeys.has(path)) matchedKeys.add(path)
        lockedKeys.add(workspaceId)
        lockedKeys.add(path)
      }
    }
    if (state.lockedWorkspaceIds.some(id => !matchedKeys.has(id))) isComplete = false
    // A stale relocation cannot prove that a protected session is absent
    // from a workspace being deleted. Never infer membership from a ghost target.
    if (lockedSessions.size > 0 || lockedKeys.size > 0) {
      for (const [sessionId, target] of Object.entries(state.movedSessions)) {
        if (!sessionId.trim() || typeof target !== 'string' || !target.trim() ||
            (!rowsById.has(target) && !rowsByPath.has(target))) isComplete = false
      }
    }
  } catch { isComplete = false }

  const isLockedRow = (row: WorkspaceSnapshot['items'][number]): boolean =>
    lockedKeys.has(row.workspaceId) || lockedKeys.has(row.path)
  const workspaceMembers = (row: WorkspaceSnapshot['items'][number]): readonly string[] | undefined => {
    const native = row.sessionIds
    if (!Array.isArray(native) || native.some(id => typeof id !== 'string' || !id)) return undefined
    const moved = Object.entries(state.movedSessions)
      .filter(([, target]) => target === row.workspaceId || target === row.path)
      .map(([id]) => id)
    // A relocation overlay cannot remove protection from native members.
    return [...native, ...moved]
  }
  return {
    unarchive(id: string): { reason: WorkspaceMutationBlock; lockId?: string } | undefined {
      const aliases = workspaceSessionAliases(id)
      if (aliases.some(alias => deletedSessions.has(alias))) return { reason: 'session-deleted' }
      const lockId = state.lockedSessionIds.find(key => workspaceSessionAliases(key).some(alias => aliases.includes(alias)))
      if (lockId !== undefined) return { reason: 'session-locked', lockId }
      if (!isComplete) return { reason: 'workspace-state-unavailable' }
      if (lockedKeys.size === 0) return undefined
      for (const row of rowsById.values()) {
        if (!isLockedRow(row)) continue
        const members = workspaceMembers(row)
        if (members?.some(member => workspaceSessionAliases(member).some(alias => aliases.includes(alias)))) {
          return { reason: 'workspace-locked' }
        }
      }
      if (Object.entries(state.movedSessions).some(([member, target]) =>
        lockedKeys.has(target) && workspaceSessionAliases(member).some(alias => aliases.includes(alias)))) {
        return { reason: 'workspace-locked' }
      }
      return isComplete ? undefined : { reason: 'workspace-state-unavailable' }
    },
    deleteWorkspace(id: string, isDeltaMode: boolean): WorkspaceMutationBlock | undefined {
      if (lockedKeys.has(id)) return 'workspace-locked'
      const row = rowsById.get(id)
      if (!isComplete || !row) return 'workspace-state-unavailable'
      if (isLockedRow(row)) return 'workspace-locked'
      if (rowsById.size <= 1) return 'sole-workspace-protected'
      const members = workspaceMembers(row)
      if (lockedSessions.size > 0 &&
          (!members || members.some(member => workspaceSessionAliases(member).some(alias => lockedSessions.has(alias))))) {
        return members ? 'session-locked' : 'workspace-state-unavailable'
      }
      const path = row.path.replace(/\\/g, '/').toLowerCase()
      const isDefault = path.endsWith('/deepseek-harness/default-workspace') || path.endsWith('/default-workspace')
      if (isDeltaMode && isDefault && (!members || members.length > 0)) return 'protected-default-workspace'
      return undefined
    },
  }
}

// Keep this one compatibility adapter lifecycle-owned until the installed Host
// event is validated. Do not restore over a later Host or plugin method.
function installWorkspaceMutationGuards(
  workspaces: WorkspacesApi,
  readNative: () => WorkspaceSnapshot,
  readState: () => WorkspaceProtectionState & Pick<ClientFeatureSnapshot, 'isSearchProtectionReady'>,
  isDeltaMode: () => boolean,
  onBlocked: (reason: WorkspaceMutationBlock, lockId?: string) => void,
): () => void {
  let isDisposed = false
  const originalDelete = workspaces.delete
  const originalUnarchive = workspaces.unarchiveSession
  const reject = (reason: WorkspaceMutationBlock, lockId?: string): Promise<never> => {
    try { onBlocked(reason, lockId) } catch {}
    return Promise.reject(new Error('delta/' + reason))
  }
  const guardedDelete = (id: string): Promise<unknown> => {
    if (isDisposed) return reject('workspace-guard-disposed')
    let reason: WorkspaceMutationBlock | undefined
    try {
      const confirmed = readState()
      if (!confirmed.isSearchProtectionReady) return reject('workspace-state-unavailable')
      reason = readWorkspaceMutationPolicy(confirmed, readNative).deleteWorkspace(id, isDeltaMode())
    }
    catch { return reject('workspace-state-unavailable') }
    if (reason) return reject(reason)
    return originalDelete.call(workspaces, id)
  }
  const guardedUnarchive = (id: string): Promise<unknown> => {
    if (isDisposed) return reject('workspace-guard-disposed')
    let blocked: ReturnType<ReturnType<typeof readWorkspaceMutationPolicy>['unarchive']>
    try {
      const confirmed = readState()
      if (!confirmed.isSearchProtectionReady) return reject('workspace-state-unavailable')
      blocked = readWorkspaceMutationPolicy(confirmed, readNative).unarchive(id)
    }
    catch { return reject('workspace-state-unavailable') }
    if (blocked) return reject(blocked.reason, blocked.lockId)
    return originalUnarchive!.call(workspaces, id)
  }
  try { if (typeof originalDelete === 'function') workspaces.delete = guardedDelete } catch {}
  try { if (typeof originalUnarchive === 'function') workspaces.unarchiveSession = guardedUnarchive } catch {}
  return () => {
    if (isDisposed) return
    isDisposed = true
    try { if (workspaces.delete === guardedDelete) workspaces.delete = originalDelete } catch {}
    try { if (workspaces.unarchiveSession === guardedUnarchive) workspaces.unarchiveSession = originalUnarchive } catch {}
  }
}

// Scope this policy to Delta's search UI, not native owner content ACLs.
interface SearchContentProtection {
  canQuery: boolean
  canUseNativeFallback: boolean
  allowsSession(id: string, workspaceId?: string): boolean
  allowsWorkspace(id: string, path?: string): boolean
}
function createSearchContentProtection(
  state: WorkspaceProtectionState & { isSearchProtectionReady: boolean },
  readNative: () => WorkspaceSnapshot,
): SearchContentProtection {
  const excluded = new Set([...state.lockedSessionIds, ...state.deletedSessionIds].flatMap(workspaceSessionAliases))
  if (!state.isSearchProtectionReady) return {
    canQuery: false, canUseNativeFallback: false,
    allowsSession: () => false, allowsWorkspace: () => false,
  }
  const lockedKeys = new Set(state.lockedWorkspaceIds)
  let isComplete = true
  if (lockedKeys.size > 0) {
    try {
      const snapshot = readNative()
      if (!Array.isArray(snapshot.items)) throw new Error('invalid workspace membership')
      const known = new Set<string>()
      const rows = new Set<string>()
      for (const row of snapshot.items) {
        const { workspaceId, path, sessionIds } = row
        if (typeof workspaceId !== 'string' || !workspaceId || typeof path !== 'string' || !path ||
            rows.has(workspaceId) || !Array.isArray(sessionIds) ||
            sessionIds.some(id => typeof id !== 'string' || !id)) throw new Error('invalid workspace membership')
        rows.add(workspaceId)
        if (lockedKeys.has(workspaceId) || lockedKeys.has(path)) {
          if (state.lockedWorkspaceIds.includes(workspaceId)) known.add(workspaceId)
          if (state.lockedWorkspaceIds.includes(path)) known.add(path)
          lockedKeys.add(workspaceId)
          lockedKeys.add(path)
          for (const id of sessionIds) for (const alias of workspaceSessionAliases(id)) excluded.add(alias)
        }
      }
      if (state.lockedWorkspaceIds.some(key => !known.has(key))) isComplete = false
    } catch { isComplete = false }
    for (const [id, target] of Object.entries(state.movedSessions)) {
      if (lockedKeys.has(target)) for (const alias of workspaceSessionAliases(id)) excluded.add(alias)
    }
  }
  const allowsWorkspace = (id: string, path?: string): boolean =>
    isComplete && !lockedKeys.has(id) && !(path && lockedKeys.has(path))
  return {
    canQuery: isComplete,
    canUseNativeFallback: isComplete && lockedKeys.size === 0 && excluded.size === 0,
    allowsWorkspace,
    allowsSession: (id, workspaceId) => isComplete &&
      !workspaceSessionAliases(id).some(alias => excluded.has(alias)) &&
      (!workspaceId || allowsWorkspace(workspaceId)),
  }
}

function createClientFeatureManager(): ClientFeatureManager {
  let state: ClientFeatureSnapshot = Object.freeze({
    isSearchProtectionReady: false,
    hasPin: false,
    lockMode: 'none',
    lockedSessionIds: Object.freeze([]),
    lockedWorkspaceIds: Object.freeze([]),
    movedSessions: Object.freeze({}),
    deletedSessionIds: Object.freeze([]),
    tempUnlockedIds: Object.freeze([]),
    tempUnlockedWorkspaceIds: Object.freeze([]),
    revision: 0,
  })
  const listeners = new Set<() => void>()
  let workspacesApi: WorkspacesApi | undefined
  let readNativeWorkspaceSnapshot: (() => WorkspaceSnapshot) | undefined
  const projectDeltaWorkspace = createWorkspaceCompatibilityProjection()
  const readDeltaWorkspaceSnapshot = (): WorkspaceSnapshot | undefined => {
    try {
      const base = readNativeWorkspaceSnapshot?.()
      return base ? projectDeltaWorkspace(base, state) : undefined
    } catch { return undefined }
  }
  let sessionsApi: SearchSessionsApi | undefined
  let navigationApi: SearchNavigationApi | undefined
  let hasSyncedStateFromHost = false
  let refreshInFlight: Promise<void> | undefined
  let lastRefreshAttemptAt = 0
  let dialogBackdrop: HTMLElement | undefined
  let shieldEl: HTMLElement | undefined
  let shieldSessionId: string | undefined
  const workspaceNotifyListeners = new Set<() => void>()
  const contentProtectionListeners = new Set<() => void>()
  const sessionCatalogListeners = new Set<() => void>()
  let stopNativeSessionCatalog: (() => void) | undefined
  let sessionCatalogBinding = 0
  const publishSessionCatalog = (): void => {
    for (const listener of [...sessionCatalogListeners]) {
      try { listener() } catch { /* another consumer must not block catalog updates */ }
    }
  }
  let contentProtectionRevision = 0
  let stopNativeContentMembership: (() => void) | undefined
  const invalidateContentProtection = (): void => {
    contentProtectionRevision += 1
    for (const listener of [...contentProtectionListeners]) {
      try { listener() } catch {}
    }
  }

  const publish = (patch: Partial<Omit<ClientFeatureSnapshot, 'revision'>>): void => {
    const previous = state
    state = Object.freeze({ ...state, ...patch, revision: state.revision + 1 })
    if (previous.isSearchProtectionReady !== state.isSearchProtectionReady ||
        previous.lockedSessionIds !== state.lockedSessionIds ||
        previous.lockedWorkspaceIds !== state.lockedWorkspaceIds ||
        previous.deletedSessionIds !== state.deletedSessionIds ||
        previous.movedSessions !== state.movedSessions) invalidateContentProtection()
    listeners.forEach(fn => {
      try { fn() } catch {}
    })
  }

  const notifyDataApis = (): void => {
    for (const fn of workspaceNotifyListeners) {
      try { fn() } catch {}
    }
  }

  // Native archive ownership is exclusively enforced by Host Session Ops.
  // The Client must not retry archive/unarchive via Workspace services: it
  // lacks durable attribution and could undo a user's independent archive.

  const applyHostStatePayload = (payload: {
    hasPin?: boolean
    lockMode?: 'totp' | 'pin' | 'none'
    lockedSessionIds?: string[]
    lockedWorkspaceIds?: string[]
    movedSessions?: Record<string, string>
    deletedSessionIds?: string[]
  }): void => {
    // A partial response is not evidence that previously durable locks vanished.
    // Preserve the prior membership, but revoke mutation/search readiness.
    if (!isConfirmedLockState(payload)) {
      if (state.isSearchProtectionReady) publish({ isSearchProtectionReady: false })
      return
    }
    const locked = payload.lockedSessionIds!
    const lockedWorkspaces = Array.isArray(payload.lockedWorkspaceIds) ? payload.lockedWorkspaceIds : []
    const deleted = Array.isArray(payload.deletedSessionIds) ? payload.deletedSessionIds : []
    const moved = payload.movedSessions && typeof payload.movedSessions === 'object' ? payload.movedSessions : {}
    const stableIds = (previous: readonly string[], next: readonly string[]): readonly string[] =>
      previous.length === next.length && previous.every((id, index) => id === next[index])
        ? previous : Object.freeze([...next])
    const previousMoves = Object.entries(state.movedSessions)
    const nextMoves = Object.entries(moved)
    const hasSameMoves = previousMoves.length === nextMoves.length &&
      previousMoves.every(([id, target], index) => id === nextMoves[index][0] && target === nextMoves[index][1])
    publish({
      isSearchProtectionReady: isConfirmedLockState(payload),
      hasPin: Boolean(payload.hasPin),
      lockMode: payload.lockMode ?? (payload.hasPin ? 'totp' : 'none'),
      lockedSessionIds: stableIds(state.lockedSessionIds, locked),
      lockedWorkspaceIds: stableIds(state.lockedWorkspaceIds, lockedWorkspaces),
      movedSessions: hasSameMoves ? state.movedSessions : Object.freeze({ ...moved }),
      deletedSessionIds: stableIds(state.deletedSessionIds, deleted),
      tempUnlockedIds: Object.freeze(state.tempUnlockedIds.filter(id => locked.includes(id))),
      tempUnlockedWorkspaceIds: Object.freeze((state.tempUnlockedWorkspaceIds ?? []).filter(id => lockedWorkspaces.includes(id))),
    })
    notifyDataApis()
  }

  const postHostJson = async (path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: any }> => {
    if (!canCallHostHttp()) return { ok: false, status: 0, data: null }
    try {
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      return { ok: res.ok, status: res.status, data }
    } catch {
      return { ok: false, status: 0, data: null }
    }
  }

  // Preserve the last confirmed lock membership while revoking authorization.
  // Reset the sync flag so ensureLoaded may retry after transient Host failures.
  const revokeHostConfirmation = (): void => {
    hasSyncedStateFromHost = false
    if (state.isSearchProtectionReady) publish({ isSearchProtectionReady: false })
  }

  const refreshState = async (): Promise<void> => {
    if (!canCallHostHttp()) { revokeHostConfirmation(); return }
    if (refreshInFlight) return refreshInFlight
    lastRefreshAttemptAt = Date.now()
    refreshInFlight = (async () => {
      try {
        const response = await fetch('/api/delta-suite/state', { credentials: 'same-origin' })
        if (!response.ok) { revokeHostConfirmation(); return }
        const body = await response.json().catch(() => null) as { state?: unknown } | null
        if (isConfirmedLockState(body?.state)) {
          hasSyncedStateFromHost = true
          applyHostStatePayload(body!.state as Parameters<typeof applyHostStatePayload>[0])
        } else revokeHostConfirmation()
      } catch { revokeHostConfirmation() }
      finally { refreshInFlight = undefined }
    })()
    return refreshInFlight
  }

  const ensureLoaded = (): void => {
    if (hasSyncedStateFromHost || refreshInFlight) return
    if (Date.now() - lastRefreshAttemptAt < 1200) return
    void refreshState()
  }

  // Lock operations require the complete public Host state, never a locally
  // fabricated success. Reject partial acknowledgements before applying them.
  const isConfirmedLockState = (payload: unknown): boolean => {
    if (!payload || typeof payload !== 'object') return false
    const value = payload as Partial<ClientFeatureSnapshot>
    const isIdList = (items: unknown): boolean =>
      Array.isArray(items) && items.every(id => typeof id === 'string' && id.length > 0)
    return typeof value.hasPin === 'boolean' &&
      (value.lockMode === 'none' || value.lockMode === 'pin' || value.lockMode === 'totp') &&
      value.hasPin === (value.lockMode !== 'none') &&
      isIdList(value.lockedSessionIds) && isIdList(value.lockedWorkspaceIds) &&
      isIdList(value.deletedSessionIds) &&
      !!value.movedSessions && typeof value.movedSessions === 'object' && !Array.isArray(value.movedSessions) &&
      Object.values(value.movedSessions).every(id => typeof id === 'string' && id.length > 0) &&
      (value.hasPin || (value.lockedSessionIds?.length === 0 && value.lockedWorkspaceIds?.length === 0))
  }

  const beginTotpSetup = async (): Promise<{
    ok: boolean
    setupToken?: string
    secret?: string
    otpauthUri?: string
    error?: string
  }> => {
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', { action: 'setup-begin' })
    if (!res.ok || res.data?.ok !== true || typeof res.data.setupToken !== 'string' || !res.data.setupToken ||
        typeof res.data.secret !== 'string' || !res.data.secret ||
        typeof res.data.otpauthUri !== 'string' || !res.data.otpauthUri) {
      return { ok: false, error: res.data?.error ?? 'TOTP_INIT_FAILED' }
    }
    return {
      ok: true,
      setupToken: String(res.data.setupToken ?? ''),
      secret: String(res.data.secret),
      otpauthUri: String(res.data.otpauthUri),
    }
  }

  const confirmTotpSetup = async (
    sessionId: string,
    setupToken: string,
    code: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim()
    if (!/^\d{6}$/.test(trimmed)) return { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' }
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: 'setup-confirm',
      sessionId,
      setupToken,
      code: trimmed,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'INVALID_TOTP_CODE' }
    const confirmedState = res.data?.state
    if (res.data?.ok !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== true || !confirmedState.lockedSessionIds.includes(sessionId)) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    publish({
      tempUnlockedIds: Object.freeze(state.tempUnlockedIds.filter(id => id !== sessionId)),
    })
    notifyDataApis()
    return { ok: true }
  }

  const confirmTotpSetupWorkspace = async (
    workspaceId: string,
    setupToken: string,
    code: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim()
    if (!/^\d{6}$/.test(trimmed)) return { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' }
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: 'setup-confirm',
      workspaceId,
      setupToken,
      code: trimmed,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'INVALID_TOTP_CODE' }
    const confirmedState = res.data?.state
    if (res.data?.ok !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== true || !confirmedState.lockedWorkspaceIds.includes(workspaceId)) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    publish({
      tempUnlockedWorkspaceIds: Object.freeze((state.tempUnlockedWorkspaceIds ?? []).filter(id => id !== workspaceId)),
    })
    notifyDataApis()
    return { ok: true }
  }

  const lockSession = async (sessionId: string, _newPin?: string): Promise<{ ok: boolean; error?: string }> => {
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: 'lock',
      sessionId,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'LOCK_FAILED' }
    const confirmedState = res.data?.state
    if (res.data?.ok !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== true || !confirmedState.lockedSessionIds.includes(sessionId)) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    publish({
      tempUnlockedIds: Object.freeze(state.tempUnlockedIds.filter(id => id !== sessionId)),
    })
    notifyDataApis()
    return { ok: true }
  }

  const lockWorkspace = async (workspaceId: string): Promise<{ ok: boolean; error?: string }> => {
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: 'lock',
      workspaceId,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'LOCK_FAILED' }
    const confirmedState = res.data?.state
    if (res.data?.ok !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== true || !confirmedState.lockedWorkspaceIds.includes(workspaceId)) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    publish({
      tempUnlockedWorkspaceIds: Object.freeze((state.tempUnlockedWorkspaceIds ?? []).filter(id => id !== workspaceId)),
    })
    notifyDataApis()
    return { ok: true }
  }


  const verifyOrUnlockSession = async (sessionId: string, code: string, isPermanent: boolean): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim()
    if (state.lockMode !== 'pin' && !/^\d{6}$/.test(trimmed)) {
      return { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' }
    }
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: isPermanent ? 'unlock' : 'verify',
      sessionId,
      code: trimmed,
      pin: trimmed,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'INVALID_TOTP_CODE' }
    const confirmedState = res.data?.state
    if (res.data?.ok !== true || res.data.verified !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== true || confirmedState.lockedSessionIds.includes(sessionId) === isPermanent) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    if (isPermanent) {
      notifyDataApis()
    } else if (!state.tempUnlockedIds.includes(sessionId)) {
      publish({ tempUnlockedIds: Object.freeze([...state.tempUnlockedIds, sessionId]) })
    }
    return { ok: true }
  }

  const verifyOrUnlockWorkspace = async (workspaceId: string, code: string, isPermanent: boolean): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim()
    if (state.lockMode !== 'pin' && !/^\d{6}$/.test(trimmed)) {
      return { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' }
    }
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: isPermanent ? 'unlock' : 'verify',
      workspaceId,
      code: trimmed,
      pin: trimmed,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'INVALID_TOTP_CODE' }
    const confirmedState = res.data?.state
    if (res.data?.ok !== true || res.data.verified !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== true || confirmedState.lockedWorkspaceIds.includes(workspaceId) === isPermanent) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    if (isPermanent) {
      notifyDataApis()
    } else if (!(state.tempUnlockedWorkspaceIds ?? []).includes(workspaceId)) {
      publish({ tempUnlockedWorkspaceIds: Object.freeze([...(state.tempUnlockedWorkspaceIds ?? []), workspaceId]) })
    }
    return { ok: true }
  }

  const clearPin = async (code: string): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim()
    if (state.lockMode !== 'pin' && !/^\d{6}$/.test(trimmed)) {
      return { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' }
    }
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: 'unbind-2fa',
      code: trimmed,
      pin: trimmed,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'INVALID_TOTP_CODE' }
    const confirmedState = res.data?.state
    const reported = res.data?.unarchivedIds
    const pending = res.data?.pendingUnarchiveIds ?? []
    if (res.data?.ok !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== false || confirmedState.lockMode !== 'none' ||
        confirmedState.lockedSessionIds.length !== 0 || confirmedState.lockedWorkspaceIds.length !== 0 ||
        !Array.isArray(reported) || reported.some(id => typeof id !== 'string') ||
        !Array.isArray(pending) || pending.some(id => typeof id !== 'string')) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    // Host has already handled each owned native archive and reports the
    // restored/pending outcome. Never retry it through Client Workspace APIs.
    notifyDataApis()
    return { ok: true }
  }

  const findWorkspaceCwdForSession = (sessionId: string): string | undefined => {
    const wsItems = readNativeWorkspaceSnapshot?.().items ?? []
    const ws = wsItems.find(item => item.sessionIds?.includes(sessionId))
    if (ws?.path) return ws.path
    const sess = sessionsApi?.list?.getSnapshot?.()?.byId?.[sessionId] as { cwd?: string } | undefined
    return typeof sess?.cwd === 'string' && sess.cwd.trim() ? sess.cwd : undefined
  }

  const moveSession = async (sessionId: string, targetWorkspaceId: string): Promise<{ ok: boolean; error?: string }> => {
    if (state.deletedSessionIds.includes(sessionId)) return { ok: false, error: 'SESSION_DELETED' }
    if (!canCallHostHttp()) return { ok: false, error: 'MOVE_UNAVAILABLE' }
    let targetWs: WorkspaceSnapshot['items'][number] | undefined
    let sourceCwd: string | undefined
    try {
      if (state.lockedSessionIds.includes(sessionId) || isSessionInLockedWorkspace(sessionId) ||
          isWorkspaceLocked(targetWorkspaceId)) return { ok: false, error: 'SESSION_LOCKED' }
      targetWs = readNativeWorkspaceSnapshot?.().items.find(item => item.workspaceId === targetWorkspaceId)
      sourceCwd = findWorkspaceCwdForSession(sessionId)
    } catch { return { ok: false, error: 'MOVE_UNAVAILABLE' } }
    if (!targetWs?.path) return { ok: false, error: 'MOVE_UNAVAILABLE' }
    const res = await postHostJson('/api/delta-suite/session-move', {
      sessionId,
      targetWorkspaceId,
      targetPath: targetWs.path,
      ...(sourceCwd ? { sourceCwd } : {}),
    })
    if (!res.ok || res.data?.ok !== true) return { ok: false, error: res.data?.error ?? 'MOVE_FAILED' }
    const confirmedState = res.data?.state
    if (!isConfirmedLockState(confirmedState) || confirmedState.movedSessions[sessionId] !== targetWorkspaceId) {
      return { ok: false, error: 'MOVE_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    return { ok: true }
  }

  const refreshSessionsAfterDelete = async (): Promise<void> => {
    // The public refresh operation publishes a Host-owned catalog. Never patch its store.
    try { await sessionsApi?.refresh?.() } catch {
      // A confirmed tombstone remains effective inside Delta if the catalog is stale.
    }
  }

  const deleteSession = async (sessionId: string): Promise<{ ok: boolean; error?: string }> => {
    if (state.lockedSessionIds.includes(sessionId) || isSessionInLockedWorkspace(sessionId)) {
      return { ok: false, error: 'SESSION_LOCKED' }
    }
    if (!canCallHostHttp()) return { ok: false, error: 'DELETE_UNAVAILABLE' }
    const sourceCwd = findWorkspaceCwdForSession(sessionId)
    const res = await postHostJson('/api/delta-suite/session-delete', {
      sessionId,
      ...(sourceCwd ? { sourceCwd } : {}),
    })
    if (!res.ok || res.data?.ok !== true) return { ok: false, error: res.data?.error ?? 'DELETE_FAILED' }
    const confirmedState = res.data?.state
    if (!isConfirmedLockState(confirmedState) || !confirmedState.deletedSessionIds.includes(sessionId)) {
      return { ok: false, error: 'DELETE_UNCONFIRMED' }
    }
    // Apply only a Host-confirmed durable deletion, never a speculative local tombstone.
    applyHostStatePayload(confirmedState)
    if (state.activeSessionId === sessionId) {
      publish({ activeSessionId: undefined })
      try { navigationApi?.startSession() } catch {}
    }
    await refreshSessionsAfterDelete()
    return { ok: true }
  }

  const getUngroupedSessionIds = (isIncludingArchived = false): string[] => {
    const wsSnap = readNativeWorkspaceSnapshot?.()
    const sessSnap = sessionsApi?.list?.getSnapshot?.()
    if (!sessSnap?.byId) return []
    const accounted = new Set<string>()
    for (const ws of wsSnap?.items ?? []) {
      for (const sid of ws.sessionIds ?? []) accounted.add(sid)
    }
    for (const sid of Object.keys(state.movedSessions)) accounted.add(sid)
    const archived = new Set(wsSnap?.archivedSessionIds ?? [])
    const deleted = new Set(state.deletedSessionIds)
    const orderIds = Array.isArray(sessSnap.ids) && sessSnap.ids.length > 0 ? sessSnap.ids : Object.keys(sessSnap.byId)
    const out: string[] = []
    for (const sid of orderIds) {
      const rec = sessSnap.byId[sid] as { blank?: boolean } | undefined
      if (!rec || rec.blank || deleted.has(sid) || accounted.has(sid)) continue
      if (!isIncludingArchived && archived.has(sid)) continue
      out.push(sid)
    }
    return out
  }

  const deleteUngroupedSessions = async (sessionIds: string[]): Promise<{ ok: boolean; error?: string; deletedIds?: string[] }> => {
    const targets = [...new Set(sessionIds.filter(Boolean))]
    if (targets.length === 0) return { ok: true, deletedIds: [] }
    const eligible = targets.filter(id => !state.lockedSessionIds.includes(id) && !isSessionInLockedWorkspace(id))
    if (eligible.length === 0) return { ok: false, error: 'SESSION_LOCKED' }
    if (!canCallHostHttp()) return { ok: false, error: 'DELETE_UNAVAILABLE' }
    const cwds: Record<string, string> = {}
    for (const sid of eligible) {
      const cwd = findWorkspaceCwdForSession(sid)
      if (cwd) cwds[sid] = cwd
    }
    // Only eligible IDs may reach the existing Host deletion endpoint.
    const res = await postHostJson('/api/delta-suite/session-delete-ungrouped', { sessionIds: eligible, cwds })
    if (!res.ok || res.data?.ok !== true) return { ok: false, error: res.data?.error ?? 'DELETE_FAILED' }
    const confirmedState = res.data?.state
    const reported = res.data?.deletedIds
    if (!Array.isArray(reported) || !isConfirmedLockState(confirmedState) ||
        reported.some(id => typeof id !== 'string' || !eligible.includes(id) || !confirmedState.deletedSessionIds.includes(id))) {
      return { ok: false, error: 'DELETE_UNCONFIRMED' }
    }
    const deletedIds = [...new Set<string>(reported)]
    if (deletedIds.length === 0) return { ok: false, error: 'DELETE_UNCONFIRMED' }
    applyHostStatePayload(confirmedState)
    if (state.activeSessionId && deletedIds.includes(state.activeSessionId)) {
      publish({ activeSessionId: undefined })
      try { navigationApi?.startSession() } catch {}
    }
    await refreshSessionsAfterDelete()
    return deletedIds.length === targets.length
      ? { ok: true, deletedIds }
      : { ok: false, error: 'PARTIAL_DELETE', deletedIds }
  }

  const closeDialog = (): void => {
    dialogBackdrop?.remove()
    dialogBackdrop = undefined
  }

  const mountModal = (buildCard: (card: HTMLElement) => void): void => {
    closeDialog()
    if (typeof document?.body?.appendChild !== 'function') return
    const backdrop = document.createElement('div')
    backdrop.className = 'dtd-dialog-backdrop'
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) closeDialog()
    })
    backdrop.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault?.(); closeDialog() }
    })
    const card = document.createElement('div')
    card.className = 'dtd-dialog-card'
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-modal', 'true')
    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'dtd-dialog-close-btn'
    closeBtn.setAttribute('aria-label', (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.close ?? 'Close')
    closeBtn.textContent = '✕'
    closeBtn.addEventListener('click', closeDialog)
    card.appendChild(closeBtn)
    buildCard(card)
    backdrop.appendChild(card)
    document.body.appendChild(backdrop)
    dialogBackdrop = backdrop
  }

  const createCodeInputElement = (placeholder: string, isLegacyPin = false): HTMLInputElement => {
    const inp = document.createElement('input')
    if (isLegacyPin) {
      inp.type = 'password'
      inp.className = 'dtd-dialog-input'
      inp.autocomplete = 'current-password'
    } else {
      inp.type = 'text'
      inp.className = 'dtd-dialog-input dtd-totp-code-input'
      inp.inputMode = 'numeric'
      inp.pattern = '[0-9]*'
      inp.maxLength = 6
      inp.autocomplete = 'one-time-code'
      inp.addEventListener('input', () => {
        const cleaned = inp.value.replace(/\D+/g, '').slice(0, 6)
        if (inp.value !== cleaned) inp.value = cleaned
      })
    }
    inp.placeholder = placeholder
    return inp
  }

  const copySecretText = async (text: string): Promise<boolean> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch {}
    try {
      if (typeof document !== 'undefined' && document.body && typeof document.execCommand === 'function') {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.setProperty('position', 'fixed')
        ta.style.setProperty('opacity', '0')
        document.body.appendChild(ta)
        ta.select?.()
        const ok = document.execCommand('copy')
        ta.remove()
        return Boolean(ok)
      }
    } catch {}
    return false
  }

  const openSetPinGenericDialog = (targetType: 'session' | 'workspace', targetId: string, titleText?: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    mountModal(card => {
      const isWs = targetType === 'workspace'
      const h = document.createElement('h3')
      h.textContent = titleText || ((isWs && copy.workspaceMenu?.setPinTitle) ? copy.workspaceMenu.setPinTitle : copy.sessionMenu.setPinTitle)
      const desc = document.createElement('p')
      desc.textContent = (isWs && copy.workspaceMenu?.setPinDescription) ? copy.workspaceMenu.setPinDescription : copy.sessionMenu.setPinDescription
      const setupBox = document.createElement('div'); setupBox.className = 'dtd-totp-setup-box'
      const loadingMsg = document.createElement('p'); loadingMsg.textContent = copy.sessionMenu.totpLoading
      setupBox.appendChild(loadingMsg)
      const codeInput = createCodeInputElement(copy.sessionMenu.pinPlaceholder, false)
      codeInput.disabled = true
      const err = document.createElement('p'); err.className = 'dtd-dialog-error'; err.hidden = true
      const actions = document.createElement('div'); actions.className = 'dtd-dialog-actions'
      const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'dtd-btn-secondary'
      cancelBtn.textContent = copy.ui.cancel; cancelBtn.addEventListener('click', closeDialog)
      const okBtn = document.createElement('button'); okBtn.type = 'button'; okBtn.className = 'dtd-btn-primary'
      okBtn.textContent = copy.ui.confirm
      okBtn.disabled = true

      let activeSetupToken = ''
      const submit = () => {
        if (!activeSetupToken) { err.textContent = copy.sessionMenu.pinMismatch; err.hidden = false; return }
        const code = codeInput.value.trim()
        if (!/^\d{6}$/.test(code)) { err.textContent = copy.sessionMenu.pinTooShort; err.hidden = false; return }
        okBtn.disabled = true
        const confirmPromise = isWs
          ? confirmTotpSetupWorkspace(targetId, activeSetupToken, code)
          : confirmTotpSetup(targetId, activeSetupToken, code)
        void confirmPromise.then(res => {
          okBtn.disabled = false
          if (!res.ok) {
            err.textContent = res.error === 'SETUP_EXPIRED' ? copy.sessionMenu.pinMismatch : copy.sessionMenu.wrongPin
            err.hidden = false
            return
          }
          closeDialog()
          showDeltaToast(isWs ? (copy.workspaceMenu?.lockedToast ?? copy.sessionMenu.lockedToast) : copy.sessionMenu.lockedToast)
        })
      }
      okBtn.addEventListener('click', submit)
      codeInput.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') submit() })
      actions.append(cancelBtn, okBtn)
      card.append(h, desc, setupBox, codeInput, err, actions)

      void beginTotpSetup().then(initRes => {
        setupBox.replaceChildren()
        if (!initRes.ok || !initRes.secret || !initRes.otpauthUri) {
          err.textContent = copy.sessionMenu.totpInitFailed
          err.hidden = false
          return
        }
        activeSetupToken = initRes.setupToken ?? ''
        const qrWrap = document.createElement('div'); qrWrap.className = 'dtd-totp-qr-wrap'
        try {
          qrWrap.appendChild(createQrSvgElement(initRes.otpauthUri))
          setupBox.appendChild(qrWrap)
        } catch {}

        const secretRow = document.createElement('div'); secretRow.className = 'dtd-totp-secret-row'
        const secretLbl = document.createElement('span'); secretLbl.className = 'dtd-totp-secret-label'
        secretLbl.textContent = copy.sessionMenu.pinConfirmLabel
        const secretCode = document.createElement('code'); secretCode.className = 'dtd-totp-secret-code'
        secretCode.textContent = initRes.secret
        const copyBtn = document.createElement('button'); copyBtn.type = 'button'; copyBtn.className = 'dtd-totp-copy-btn'
        copyBtn.textContent = copy.sessionMenu.copySecret
        copyBtn.addEventListener('click', () => {
          void copySecretText(initRes.secret!).then(ok => {
            showDeltaToast(ok ? copy.ui.copied : copy.ui.copyFailed)
          })
        })
        secretRow.append(secretLbl, secretCode, copyBtn)
        setupBox.appendChild(secretRow)
        codeInput.disabled = false
        okBtn.disabled = false
        codeInput.focus?.()
      })
    })
  }

  const openSetPinDialog = (sessionId: string, title?: string): void => {
    openSetPinGenericDialog('session', sessionId, title)
  }

  const openSetPinWorkspaceDialog = (workspaceId: string, title?: string): void => {
    openSetPinGenericDialog('workspace', workspaceId, title)
  }

  const openSinglePinDialog = (
    titleText: string,
    descText: string,
    confirmText: string,
    isDangerButton: boolean,
    onVerify: (pin: string) => Promise<{ ok: boolean; error?: string }>,
    successToast: string,
  ): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const isLegacyPin = state.lockMode === 'pin'
    mountModal(card => {
      const h = document.createElement('h3'); h.textContent = titleText
      const desc = document.createElement('p'); desc.textContent = descText
      const p1 = createCodeInputElement(copy.sessionMenu.pinPlaceholder, isLegacyPin)
      const err = document.createElement('p'); err.className = 'dtd-dialog-error'; err.hidden = true
      const actions = document.createElement('div'); actions.className = 'dtd-dialog-actions'
      const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'dtd-btn-secondary'
      cancelBtn.textContent = copy.ui.cancel; cancelBtn.addEventListener('click', closeDialog)
      const okBtn = document.createElement('button'); okBtn.type = 'button'
      okBtn.className = isDangerButton ? 'dtd-btn-danger' : 'dtd-btn-primary'
      okBtn.textContent = confirmText
      const submit = () => {
        const code = p1.value.trim()
        if (!isLegacyPin && !/^\d{6}$/.test(code)) {
          err.textContent = copy.sessionMenu.pinTooShort
          err.hidden = false
          return
        }
        okBtn.disabled = true
        void onVerify(code).then(res => {
          okBtn.disabled = false
          if (!res.ok) { err.textContent = copy.sessionMenu.wrongPin; err.hidden = false; return }
          closeDialog()
          showDeltaToast(successToast)
        })
      }
      okBtn.addEventListener('click', submit)
      p1.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') submit() })
      actions.append(cancelBtn, okBtn)
      card.append(h, desc, p1, err, actions)
      p1.focus?.()
    })
  }

  const openClearPinDialog = (): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    openSinglePinDialog(
      copy.sessionMenu.clearPinTitle,
      copy.sessionMenu.clearPinDesc,
      copy.ui.confirm,
      true,
      pin => clearPin(pin),
      copy.sessionMenu.pinClearedToast,
    )
  }

  const openUnlockPinDialog = (sessionId: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    openSinglePinDialog(
      copy.sessionMenu.unlockSession,
      copy.sessionMenu.lockedShieldDesc,
      copy.sessionMenu.unlockPermanent,
      false,
      pin => verifyOrUnlockSession(sessionId, pin, true),
      copy.sessionMenu.unlockedToast,
    )
  }

  const openUnlockWorkspaceDialog = (workspaceId: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    openSinglePinDialog(
      copy.workspaceMenu?.unlockWorkspace ?? copy.sessionMenu.unlockSession,
      copy.workspaceMenu?.lockedShieldDesc ?? copy.sessionMenu.lockedShieldDesc,
      copy.workspaceMenu?.unlockPermanent ?? copy.sessionMenu.unlockPermanent,
      false,
      pin => verifyOrUnlockWorkspace(workspaceId, pin, true),
      copy.workspaceMenu?.unlockedToast ?? copy.sessionMenu.unlockedToast,
    )
  }

  const openMoveDialog = (sessionId: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    if (state.lockedSessionIds.includes(sessionId)) {
      showDeltaToast(copy.sessionMenu.unlockFirst)
      return
    }
    const items = readDeltaWorkspaceSnapshot()?.items ?? []
    const currentWsId = state.movedSessions[sessionId] ?? items.find(w => w.sessionIds?.includes(sessionId))?.workspaceId
    const candidates = items.filter(w => w.workspaceId !== currentWsId)
    mountModal(card => {
      const h = document.createElement('h3'); h.textContent = copy.sessionMenu.moveTitle
      const desc = document.createElement('p'); desc.textContent = copy.sessionMenu.moveDescription
      const list = document.createElement('div'); list.className = 'dtd-dialog-list'
      if (candidates.length === 0) {
        const empty = document.createElement('p'); empty.textContent = copy.sessionMenu.moveEmpty
        list.appendChild(empty)
      } else {
        for (const ws of candidates) {
          const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dtd-dialog-ws-btn'
          const strong = document.createElement('strong'); strong.textContent = ws.title || redactPathForUi(ws.path)
          const sub = document.createElement('span'); sub.textContent = redactPathForUi(ws.path)
          btn.append(strong, sub)
          btn.addEventListener('click', () => {
            btn.disabled = true
            void moveSession(sessionId, ws.workspaceId).then(res => {
              btn.disabled = false
              if (!res.ok) {
                showDeltaToast(res.error === 'SESSION_LOCKED' ? copy.sessionMenu.unlockFirst : copy.ui.unavailable)
                return
              }
              closeDialog()
              showDeltaToast(copy.sessionMenu.movedToast.replace('{workspace}', ws.title || ws.workspaceId))
            })
          })
          list.appendChild(btn)
        }
      }
      const actions = document.createElement('div'); actions.className = 'dtd-dialog-actions'
      const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'dtd-btn-secondary'
      cancelBtn.textContent = copy.ui.cancel; cancelBtn.addEventListener('click', closeDialog)
      actions.appendChild(cancelBtn)
      card.append(h, desc, list, actions)
    })
  }

  const openDeleteDialog = (sessionId: string, title?: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    if (state.lockedSessionIds.includes(sessionId) || isSessionInLockedWorkspace(sessionId)) {
      showDeltaToast(copy.sessionMenu.unlockFirst)
      return
    }
    const label = title?.trim() || sessionsApi?.list?.getSnapshot?.()?.byId?.[sessionId]?.title?.trim() || sessionId
    mountModal(card => {
      const h = document.createElement('h3'); h.textContent = copy.sessionMenu.deleteTitle
      const desc = document.createElement('p')
      desc.textContent = copy.sessionMenu.deleteDescription.replace('{title}', redactSensitiveText(label))
      const actions = document.createElement('div'); actions.className = 'dtd-dialog-actions'
      const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'dtd-btn-secondary'
      cancelBtn.textContent = copy.ui.cancel; cancelBtn.addEventListener('click', closeDialog)
      const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.className = 'dtd-btn-danger'
      delBtn.textContent = copy.ui.delete
      delBtn.addEventListener('click', () => {
        delBtn.disabled = true
        void deleteSession(sessionId).then(res => {
          delBtn.disabled = false
          if (!res.ok) {
            showDeltaToast(res.error === 'SESSION_LOCKED' ? copy.sessionMenu.unlockFirst : (res.error ? `\u5220\u9664\u5931\u8d25: ${res.error}` : copy.ui.unavailable))
            return
          }
          closeDialog()
          showDeltaToast(copy.sessionMenu.deletedToast)
        })
      })
      actions.append(cancelBtn, delBtn)
      card.append(h, desc, actions)
    })
  }

  const openDeleteUngroupedDialog = (): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const allIds = getUngroupedSessionIds(true)
    const lockedCount = allIds.filter(id => state.lockedSessionIds.includes(id) || isSessionInLockedWorkspace(id)).length
    const unlockedIds = allIds.filter(id => !state.lockedSessionIds.includes(id) && !isSessionInLockedWorkspace(id))
    if (allIds.length > 0 && unlockedIds.length === 0) {
      showDeltaToast(copy.sessionMenu.unlockFirst)
      return
    }
    mountModal(card => {
      const h = document.createElement('h3'); h.textContent = copy.sessionMenu.deleteUngroupedTitle
      const desc = document.createElement('p')
      desc.textContent = copy.sessionMenu.deleteUngroupedDescription.replace('{count}', String(unlockedIds.length))
      card.append(h, desc)
      if (lockedCount > 0) {
        const warn = document.createElement('p')
        warn.className = 'dtd-dialog-error'
        warn.textContent = copy.sessionMenu.deleteUngroupedLockedWarning.replace('{locked}', String(lockedCount))
        card.appendChild(warn)
      }
      const actions = document.createElement('div'); actions.className = 'dtd-dialog-actions'
      const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'dtd-btn-secondary'
      cancelBtn.textContent = copy.ui.cancel; cancelBtn.addEventListener('click', closeDialog)
      const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.className = 'dtd-btn-danger'
      delBtn.textContent = copy.ui.delete
      delBtn.addEventListener('click', () => {
        delBtn.disabled = true
        void deleteUngroupedSessions(unlockedIds).then(res => {
          delBtn.disabled = false
          if (!res.ok) {
            showDeltaToast(res.error === 'SESSION_LOCKED' ? copy.sessionMenu.unlockFirst : (res.error ? `\u5220\u9664\u5931\u8d25: ${res.error}` : copy.ui.unavailable))
            return
          }
          closeDialog()
          showDeltaToast(copy.sessionMenu.deletedUngroupedToast)
        })
      })
      actions.append(cancelBtn, delBtn)
      card.appendChild(actions)
    })
  }

  const isWorkspaceLocked = (wsIdOrPath: string | undefined): boolean => {
    if (!wsIdOrPath) return false
    const list = state.lockedWorkspaceIds ?? []
    if (list.includes(wsIdOrPath)) return true
    const wsList = readNativeWorkspaceSnapshot?.().items ?? []
    for (const ws of wsList) {
      if (ws.workspaceId === wsIdOrPath || ws.path === wsIdOrPath) {
        if (list.includes(ws.workspaceId) || list.includes(ws.path)) return true
      }
    }
    return false
  }

  const isWorkspaceProtected = (wsIdOrPath: string | undefined): boolean => {
    if (!wsIdOrPath || !isWorkspaceLocked(wsIdOrPath)) return false
    const tempUnlocked = state.tempUnlockedWorkspaceIds ?? []
    if (tempUnlocked.includes(wsIdOrPath)) return false
    const wsList = readNativeWorkspaceSnapshot?.().items ?? []
    for (const ws of wsList) {
      if (ws.workspaceId === wsIdOrPath || ws.path === wsIdOrPath) {
        if (tempUnlocked.includes(ws.workspaceId) || tempUnlocked.includes(ws.path)) return false
      }
    }
    return true
  }

  const isSessionInLockedWorkspace = (sessionId: string | undefined): boolean => {
    if (!sessionId) return false
    const wsList = readNativeWorkspaceSnapshot?.().items ?? []
    const mappedWorkspace = state.movedSessions[sessionId]
    if (mappedWorkspace && isWorkspaceProtected(mappedWorkspace)) return true
    for (const ws of wsList) {
      if (ws.sessionIds?.includes(sessionId)) {
        if (isWorkspaceProtected(ws.workspaceId) || isWorkspaceProtected(ws.path)) {
          return true
        }
      }
    }
    try {
      const sSnap = sessionsApi?.list?.getSnapshot?.()
      const wsId = sSnap?.byId?.[sessionId]?.workspaceId
      if (wsId && isWorkspaceProtected(wsId)) return true
    } catch {}
    return false
  }

  const syncLockShieldOverlay = (centerCol: HTMLElement | null): void => {
    const activeId = state.activeSessionId
    const isDirectLocked = Boolean(
      activeId &&
      state.lockedSessionIds.includes(activeId) &&
      !state.tempUnlockedIds.includes(activeId)
    )
    const isWsLocked = Boolean(activeId && isSessionInLockedWorkspace(activeId))
    const needShield = Boolean(
      activeId &&
      (isDirectLocked || isWsLocked) &&
      centerCol,
    )
    if (!needShield || !centerCol) {
      if (shieldEl) {
        shieldEl.remove()
        shieldEl = undefined
        shieldSessionId = undefined
      }
      return
    }
    if (shieldEl && shieldEl.parentElement === centerCol && shieldSessionId === activeId) {
      return
    }
    shieldEl?.remove()
    shieldSessionId = activeId
    const resolvedDict = typeof DICTIONARIES !== 'undefined' ? (DICTIONARIES[language()] ?? DICTIONARIES.en) : undefined
    const copy = resolvedDict ?? {
      ui: { close: 'Close', cancel: 'Cancel', unavailable: 'Unavailable' } as any,
      sessionMenu: { lockedShieldTitle: 'Locked', lockedShieldDesc: 'Enter PIN to unlock', pinPlaceholder: 'PIN', unlockViewOnce: 'Unlock', unlockPermanent: 'Permanent' } as any,
      workspaceMenu: { lockedShieldTitle: 'Locked Workspace', lockedShieldDesc: 'Enter PIN to unlock workspace' } as any,
    }
    const isLegacyPin = state.lockMode === 'pin'
    const overlay = document.createElement('div')
    overlay.className = 'dtd-lock-shield'
    overlay.setAttribute('data-delta-lock-shield', activeId!)
    const card = document.createElement('div')
    card.className = 'dtd-lock-card'

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'dtd-dialog-close-btn'
    closeBtn.setAttribute('aria-label', copy.ui.close ?? 'Close')
    closeBtn.textContent = '✕'
    closeBtn.addEventListener('click', () => {
      overlay.remove()
      if (shieldEl === overlay) { shieldEl = undefined; shieldSessionId = undefined }
      deltaFeatures.setActiveSessionId(undefined)
    })
    card.appendChild(closeBtn)

    const iconWrap = document.createElement('div')
    iconWrap.className = 'dtd-lock-icon-wrap'
    iconWrap.appendChild(createLockSvg(22, false))

    const isWsOnly = isWsLocked && !isDirectLocked
    const title = document.createElement('h3')
    title.textContent = (isWsOnly && copy.workspaceMenu?.lockedShieldTitle)
      ? copy.workspaceMenu.lockedShieldTitle
      : copy.sessionMenu.lockedShieldTitle
    const desc = document.createElement('p')
    desc.textContent = (isWsOnly && copy.workspaceMenu?.lockedShieldDesc)
      ? copy.workspaceMenu.lockedShieldDesc
      : copy.sessionMenu.lockedShieldDesc

    const form = document.createElement('div'); form.className = 'dtd-lock-form'
    const pinInput = createCodeInputElement(copy.sessionMenu.pinPlaceholder, isLegacyPin)
    const err = document.createElement('p'); err.className = 'dtd-dialog-error'; err.hidden = true
    const rowBtns = document.createElement('div'); rowBtns.className = 'dtd-dialog-actions'
    const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'dtd-btn-secondary dtd-shield-cancel-btn'
    cancelBtn.textContent = copy.ui.cancel
    cancelBtn.addEventListener('click', () => {
      overlay.remove()
      if (shieldEl === overlay) { shieldEl = undefined; shieldSessionId = undefined }
      deltaFeatures.setActiveSessionId(undefined)
    })
    const viewBtn = document.createElement('button'); viewBtn.type = 'button'; viewBtn.className = 'dtd-btn-primary'
    viewBtn.textContent = copy.sessionMenu.unlockViewOnce
    const permBtn = document.createElement('button'); permBtn.type = 'button'; permBtn.className = 'dtd-btn-secondary'
    permBtn.textContent = copy.sessionMenu.unlockPermanent

    const runUnlock = (isPermanent: boolean) => {
      if (!activeId) return
      const code = pinInput.value.trim()
      if (!isLegacyPin && !/^\d{6}$/.test(code)) {
        err.textContent = copy.sessionMenu.pinTooShort
        err.hidden = false
        return
      }
      viewBtn.disabled = true; permBtn.disabled = true
      let parentWsId: string | undefined
      if (isWsOnly) {
        for (const ws of readNativeWorkspaceSnapshot?.().items ?? []) {
          if (ws.sessionIds?.includes(activeId)) {
            if (isWorkspaceProtected(ws.workspaceId) || isWorkspaceProtected(ws.path)) {
              parentWsId = ws.workspaceId
              break
            }
          }
        }
        if (!parentWsId) {
          try {
            const wsId = sessionsApi?.list?.getSnapshot?.()?.byId?.[activeId]?.workspaceId
            if (wsId && isWorkspaceProtected(wsId)) parentWsId = wsId
          } catch {}
        }
      }

      const unlockPromise = (isWsOnly && parentWsId)
        ? verifyOrUnlockWorkspace(parentWsId, code, isPermanent)
        : verifyOrUnlockSession(activeId, code, isPermanent)

      void unlockPromise.then(res => {
        viewBtn.disabled = false; permBtn.disabled = false
        if (!res.ok) {
          err.textContent = copy.sessionMenu.wrongPin
          err.hidden = false
          return
        }
        overlay.remove()
        if (shieldEl === overlay) { shieldEl = undefined; shieldSessionId = undefined }
        if (isPermanent) showDeltaToast((isWsOnly && copy.workspaceMenu?.unlockedToast) ? copy.workspaceMenu.unlockedToast : copy.sessionMenu.unlockedToast)
      })
    }
    viewBtn.addEventListener('click', () => runUnlock(false))
    permBtn.addEventListener('click', () => runUnlock(true))
    pinInput.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') runUnlock(false) })
    rowBtns.append(cancelBtn, permBtn, viewBtn)
    form.append(pinInput, err, rowBtns)
    card.append(iconWrap, title, desc, form)
    overlay.appendChild(card)
    centerCol.appendChild(overlay)
    shieldEl = overlay
  }

  // Use one primitive snapshot for both hover visibility and its optional
  // timestamp: null = denied, 0 = visible with no valid time, >0 = UTC ms.
  // The public catalog may update a Session's Workspace without changing its
  // timestamp; React must still revoke the exposed identity and copy action.
  const readSessionHoverSelection = (id: string): number | null => {
    if (!id) return null
    try {
      const policy = createSearchContentProtection(state, () => {
        if (!readNativeWorkspaceSnapshot) throw new Error('workspace membership unavailable')
        return readNativeWorkspaceSnapshot()
      })
      if (!policy.allowsSession(id)) return null
      if (!sessionsApi) return 0 // Published row remains usable on older Hosts.
      const byId = sessionsApi.list.getSnapshot()?.byId
      if (!byId || typeof byId !== 'object') return null
      if (!Object.prototype.hasOwnProperty.call(byId, id)) return 0
      const record = byId[id]
      if (!record || record.id !== id || record.blank ||
          !policy.allowsSession(id, record.workspaceId)) return null
      // Numeric Host timestamps are milliseconds. Unknown or seconds-sized
      // values omit the time without inventing a date in 1970.
      const value = normalizeSearchTime(record.updatedAt)
      return value >= Date.UTC(2000, 0, 1) && value <= Date.UTC(2100, 0, 1) ? value : 0
    } catch { return null }
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    ensureLoaded,
    getContentProtectionRevision: () => contentProtectionRevision,
    subscribeContentProtection: listener => {
      contentProtectionListeners.add(listener)
      return () => { contentProtectionListeners.delete(listener) }
    },
    subscribeSessionCatalog: listener => {
      sessionCatalogListeners.add(listener)
      return () => { sessionCatalogListeners.delete(listener) }
    },
    readSearchProtection: () => createSearchContentProtection(state, () => {
      if (!readNativeWorkspaceSnapshot) throw new Error('workspace membership unavailable')
      return readNativeWorkspaceSnapshot()
    }),
    getWorkspaces: () => readDeltaWorkspaceSnapshot()?.items ?? [],
    setWorkspacesApi: (api, readNative) => {
      try { stopNativeContentMembership?.() } catch {}
      stopNativeContentMembership = undefined
      workspacesApi = api
      readNativeWorkspaceSnapshot = api ? (readNative ?? (() => api.list.getSnapshot())) : undefined
      if (api) {
        try {
          stopNativeContentMembership = api.list.subscribe?.(() => {
            if (workspacesApi === api && state.lockedWorkspaceIds.length > 0) invalidateContentProtection()
          })
        } catch {}
      }
      if (state.lockedWorkspaceIds.length > 0) invalidateContentProtection()
      if (api) {
        if (hasSyncedStateFromHost) {
          notifyDataApis()
        } else {
          ensureLoaded()
        }
      }
    },
    setSessionsApi: (api) => {
      const binding = ++sessionCatalogBinding
      try { stopNativeSessionCatalog?.() } catch {}
      stopNativeSessionCatalog = undefined
      sessionsApi = api
      if (api) {
        try {
          // Only the published Host catalog subscribe contract is observed.
          // React's useSyncExternalStore compares each hovered Session's
          // primitive timestamp, so unrelated catalog updates don't rerender it.
          const stop = api.list.subscribe?.(() => {
            if (sessionsApi === api && binding === sessionCatalogBinding) publishSessionCatalog()
          })
          if (typeof stop === 'function') stopNativeSessionCatalog = stop
        } catch { /* older Host without a working subscribe keeps static fallback */ }
      }
      // A replaced or removed Host service invalidates the selected snapshot.
      publishSessionCatalog()
      if (api) {
        const mainSessionId = readConfirmedMainSessionId(api.list)
        if (mainSessionId !== undefined && state.activeSessionId !== mainSessionId) {
          publish({ activeSessionId: mainSessionId })
        }
        if (hasSyncedStateFromHost) notifyDataApis()
        else ensureLoaded()
      }
    },
    setNavigationApi: (api) => { navigationApi = api },
    setActiveSessionId: (id) => {
      if (state.activeSessionId === id) return
      publish({ activeSessionId: id })
    },
    getActiveSessionId: () => state.activeSessionId,
    readSessionHoverSelection,
    readSessionUpdateTime: id => {
      const selected = readSessionHoverSelection(id)
      return selected !== null && selected > 0 ? selected : undefined
    },
    isLocked: (id) => Boolean(id && state.lockedSessionIds.includes(id)),
    isProtectedView: (id) => Boolean(id && state.lockedSessionIds.includes(id) && !state.tempUnlockedIds.includes(id)),
    isDeleted: (id) => Boolean(id && state.deletedSessionIds.includes(id)),
    isWorkspaceLocked,
    isWorkspaceProtected,
    isSessionInLockedWorkspace,
    getWorkspaceCount: () => readNativeWorkspaceSnapshot?.()?.items.length ?? 0,
    hasSessionsApi: () => Boolean(sessionsApi),
    getUngroupedSessionIds,
    refreshState,
    beginTotpSetup,
    confirmTotpSetup,
    confirmTotpSetupWorkspace,
    lockSession,
    lockWorkspace,
    verifyOrUnlockSession,
    verifyOrUnlockWorkspace,
    clearPin,
    moveSession,
    deleteSession,
    deleteUngroupedSessions,
    closeDialog,
    openSetPinDialog,
    openSetPinWorkspaceDialog,
    openUnlockPinDialog,
    openUnlockWorkspaceDialog,
    openClearPinDialog,
    openMoveDialog,
    openDeleteDialog,
    openDeleteUngroupedDialog,
    syncLockShieldOverlay,
    onDataMutate: (listener) => {
      workspaceNotifyListeners.add(listener)
      return () => { workspaceNotifyListeners.delete(listener) }
    },
    triggerDataRefresh: notifyDataApis,
    resetSessionOverlays: () => {
      closeDialog()
      shieldEl?.remove()
      shieldEl = undefined
      shieldSessionId = undefined
      workspaceNotifyListeners.clear()
    },
  }
}

const deltaFeatures = createClientFeatureManager()


/**
 * Transitional presentation safeguards for Delta lock and privacy state.
 * Harness retains native layout, navigation order, and menu ownership; these
 * client guards do not replace Host-side authorization.
 */
function installSidebarCompatibility(controller: DeltaController): () => void {
  const root = document.documentElement
  let isDisposed = false
  let isSyncing = false
  let observer: MutationObserver | undefined
  const frameScheduler = createFrameScheduler(() => sync())
  const scheduleSync = (): void => {
    if (!isDisposed) frameScheduler.schedule()
  }
  const hiddenSessionLogNodes = new Set<HTMLElement>()
  const hiddenPrivacyCmdNodes = new Set<HTMLElement>()
  const hiddenSoleWorkspaceNodes = new Set<HTMLElement>()
  const hiddenDeletedRows = new Set<HTMLElement>()
  let lastMenuSessionId: string | undefined
  let lastMenuWorkspaceId: string | undefined
  const LOCKED_WORKSPACE_MUTATION_LABELS = new Set(['\u91cd\u547d\u540d', 'Rename', '\u5220\u9664\u5de5\u4f5c\u533a', 'Delete workspace'])
  // Capture the state before Delta first touches a Host node. Host/third-party
  // visibility is not ours to reset when a workspace count or session changes.
  const previousVisibility = new WeakMap<HTMLElement, { hidden: boolean; ariaHidden: string | null }>()
  const restoreHiddenNode = (node: HTMLElement, attrName: string, store: Set<HTMLElement>): void => {
    const previous = previousVisibility.get(node)
    if (!store.has(node) || !previous) return
    store.delete(node)
    previousVisibility.delete(node)
    // If another owner replaced our marker, it now owns visibility.
    if (node.getAttribute?.(attrName) !== '1') return
    node.removeAttribute?.(attrName)
    // Do not overwrite changes another plugin made after our original write.
    if (node.getAttribute?.('aria-hidden') === 'true') {
      if (previous.ariaHidden === null) node.removeAttribute?.('aria-hidden')
      else if (previous.ariaHidden !== 'true') node.setAttribute?.('aria-hidden', previous.ariaHidden)
    }
    if (!previous.hidden && node.hidden) node.hidden = false
  }
  const restoreHiddenNodes = (attrName: string, store: Set<HTMLElement>): void => {
    for (const node of [...store]) {
      try { restoreHiddenNode(node, attrName, store) } catch {}
    }
    store.clear()
  }

  const hidePrivacyNode = (node: HTMLElement, attrName: string, store: Set<HTMLElement>): void => {
    if (!store.has(node)) {
      // A pre-existing marker is not proof that this activation owns the node.
      // Leave its visibility unchanged rather than removing another owner's guard.
      if (node.getAttribute?.(attrName) === '1') return
      previousVisibility.set(node, {
        hidden: Boolean(node.hidden),
        ariaHidden: node.getAttribute?.('aria-hidden') ?? null,
      })
      store.add(node)
    }
    // A full safety pass may revisit the same hidden row. Avoid redundant
    // property writes that would trigger new DOM mutation records.
    if (node.getAttribute?.(attrName) !== '1') node.setAttribute?.(attrName, '1')
    if (node.getAttribute?.('aria-hidden') !== 'true') node.setAttribute?.('aria-hidden', 'true')
    if (!node.hidden) node.hidden = true
  }

  const BLOCKED_COMMAND_RE = /^\/(?:export|feedback)(?:\s|$)/i
  const LOCKED_UNARCHIVE_LABELS = new Set(['\u53D6\u6D88\u5F52\u6863', 'Unarchive', 'Unarchive session'])
  const LOCKED_MUTATION_LABELS = new Set([
    '\u91CD\u547D\u540D', 'Rename', '\u5206\u53C9\u4F1A\u8BDD', 'Fork', 'Fork session',
    '\u79FB\u52A8\u4F1A\u8BDD', 'Move session', 'Move conversation',
    '\u5F52\u6863\u4F1A\u8BDD', 'Archive', 'Archive session',
    '\u5220\u9664\u4F1A\u8BDD', 'Delete session', 'Delete conversation',
  ])
  const WORKSPACE_DELETE_LABELS = new Set(['\u5220\u9664\u5DE5\u4F5C\u533A', 'Delete workspace'])
  const WORKSPACE_RENAME_LABELS = new Set(['\u91CD\u547D\u540D', '\u91CD\u547D\u540D\u5DE5\u4F5C\u533A', 'Rename', 'Rename workspace'])

  const getMenuLabel = (el: HTMLElement): string => {
    const labelEl = el.querySelector?.<HTMLElement>('[class*="_itemLabel_"]')
    if (labelEl?.textContent) return labelEl.textContent.trim()
    if (el.getAttribute?.('role') === 'menuitem') return (el.textContent ?? '').trim()
    const itemEl = el.querySelector?.<HTMLElement>('[role="menuitem"]')
    return (itemEl?.textContent ?? el.textContent ?? '').trim()
  }

  const syncPrivacyDom = (): void => {
    deltaFeatures.ensureLoaded()
    for (const stale of hiddenSessionLogNodes) {
      if (!stale.isConnected) hiddenSessionLogNodes.delete(stale)
    }
    for (const stale of hiddenPrivacyCmdNodes) {
      if (!stale.isConnected) hiddenPrivacyCmdNodes.delete(stale)
    }
    for (const stale of hiddenSoleWorkspaceNodes) {
      if (!stale.isConnected) hiddenSoleWorkspaceNodes.delete(stale)
    }
    for (const stale of hiddenDeletedRows) {
      if (!stale.isConnected) hiddenDeletedRows.delete(stale)
    }
    if (typeof document?.querySelectorAll !== 'function') return

    // 2. Preserve deleted-session filtering and selected-session lock shield; Host owns native row decorations
    const sessionRows = document.querySelectorAll<HTMLElement>('[data-row-key^="session:"]')
    let selectedSid: string | undefined
    for (const row of sessionRows) {
      const key = row.getAttribute?.('data-row-key') ?? ''
      const sid = key.startsWith('session:') ? key.slice(8) : ''
      if (!sid) continue
      if (deltaFeatures.isDeleted(sid)) {
        hidePrivacyNode(row, 'data-dtd-hidden-deleted', hiddenDeletedRows)
        continue
      } else if (hiddenDeletedRows.has(row)) {
        restoreHiddenNode(row, 'data-dtd-hidden-deleted', hiddenDeletedRows)
      }

      const rowCls = typeof row.className === 'string' ? row.className : ''
      if (
        row.getAttribute?.('aria-current') === 'page' ||
        row.getAttribute?.('aria-selected') === 'true' ||
        row.getAttribute?.('data-selected') === 'true' ||
        row.getAttribute?.('data-active') === 'true' ||
        rowCls.includes('selected') ||
        /\bactive\b|_active_/.test(rowCls)
      ) {
        selectedSid = sid
      }

    }
    if (selectedSid) deltaFeatures.setActiveSessionId(selectedSid)
    if (typeof document.querySelector === 'function') {
      const centerCol = document.querySelector<HTMLElement>('[class*="mP3x-q_centerCol"], [class*="an3WzG_body"], main, [data-chat-scrollport]')
      deltaFeatures.syncLockShieldOverlay(centerCol)
    }

    // 3. Hide blocked commands (/export, /feedback) and session-log download menu + sole-workspace delete menu
    const cmdContainers = document.querySelectorAll<HTMLElement>('[role="listbox"], [class*="command"]')
    for (const box of cmdContainers) {
      const cmdItems = typeof box.querySelectorAll === 'function'
        ? box.querySelectorAll<HTMLElement>('[role="option"], [role="menuitem"]')
        : Array.from(box.children ?? []) as HTMLElement[]
      for (const cmd of cmdItems) {
        const text = (cmd.textContent ?? '').trim()
        if (BLOCKED_COMMAND_RE.test(text)) {
          hidePrivacyNode(cmd, 'data-dtd-hidden-privacy-cmd', hiddenPrivacyCmdNodes)
        }
      }
    }
    // Only a confirmed single-workspace state requires native menu inspection.
    // When the count is unknown, keep existing protection hidden (fail closed).
    const workspaceCount = deltaFeatures.getWorkspaceCount()
    if (workspaceCount > 1) {
      // A second workspace makes the sole-workspace guard obsolete; release
      // only our own previously hidden menu items, not native Host state.
      restoreHiddenNodes('data-dtd-hidden-sole-workspace', hiddenSoleWorkspaceNodes)
    } else if (workspaceCount === 1) {
      const containers = document.querySelectorAll<HTMLElement>('[class*="_viewport_"], [class*="_footer_"], [role="menu"]')
      for (const container of containers) {
        if (container.getAttribute?.('role') === 'menu' && container.querySelector?.('[class*="_viewport_"], [class*="_footer_"]')) {
          continue
        }
        const items = Array.from(container.children ?? []) as HTMLElement[]
        const labels = items.map(getMenuLabel)
        const isWorkspaceMenu = labels.some(l => WORKSPACE_RENAME_LABELS.has(l))
          && labels.some(l => WORKSPACE_DELETE_LABELS.has(l))
        if (!isWorkspaceMenu) continue
        for (let i = 0; i < items.length; i++) {
          const el = items[i]
          const isMenuItemRow = el.getAttribute?.('role') === 'menuitem' || Boolean(el.querySelector?.('[role="menuitem"]'))
          if (isMenuItemRow && WORKSPACE_DELETE_LABELS.has(labels[i])) {
            hidePrivacyNode(el, 'data-dtd-hidden-sole-workspace', hiddenSoleWorkspaceNodes)
          }
        }
      }
    }

  }

  const sync = (): void => {
    if (isDisposed || isSyncing) return
    isSyncing = true
    try {
      syncPrivacyDom()
    } catch (error) {
      console.error('[delta-suite] Native privacy safeguards disabled:', error)
    } finally {
      observer?.takeRecords?.()
      isSyncing = false
    }
  }

  // Streaming chat content is not a native session row, command menu, or
  // workspace menu. Avoid rescanning the entire Host DOM for each token and
  // React text-node replacement. Keep all mutations outside chat content,
  // and preserve any security-relevant controls rendered inside the chat.
  const CHAT_CONTENT_SELECTOR = '[data-chat-flow], [data-chat-turn]'
  const GUARDED_CONTROL_SELECTOR = '[data-row-key], [role="menu"], [role="menuitem"], [role="listbox"], [role="option"], [class*="command"], [class*="_viewport_"], [class*="_footer_"], [data-dtd-hidden-deleted], [data-dtd-hidden-session-log], [data-dtd-hidden-sole-workspace], [data-dtd-hidden-privacy-cmd]'
  const isIrrelevantChatMutation = (mutation: MutationRecord): boolean => {
    const target = mutation.target
    const context = (target.nodeType === 3 ? target.parentElement : target) as Element | null
    if (!context?.closest?.(CHAT_CONTENT_SELECTOR) || context.closest(GUARDED_CONTROL_SELECTOR)) return false
    if (mutation.type === 'childList') {
      for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
        if (node.nodeType !== 1) continue
        const child = node as Element
        if (child.matches?.(GUARDED_CONTROL_SELECTOR) || child.querySelector?.(GUARDED_CONTROL_SELECTOR)) {
          return false
        }
      }
    }
    return true
  }
  const shouldSyncPrivacyMutations = (mutations: readonly MutationRecord[]): boolean =>
    mutations.some(mutation => !isIrrelevantChatMutation(mutation))

  observer = typeof MutationObserver !== 'undefined'
    ? new MutationObserver(mutations => {
        if (shouldSyncPrivacyMutations(mutations)) scheduleSync()
      })
    : undefined
  observer?.observe(document.body ?? root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    // Selected-session changes also arrive as class/aria changes without
    // any child insertion. Never skip those lock-shield updates.
    attributeFilter: ['style', 'class', 'aria-current', 'aria-selected', 'data-selected', 'data-active'],
  })

  const onPointerDownCapture = (e: Event): void => {
    const rawTarget = e.target as HTMLElement | null
    const rowEl = rawTarget?.closest?.<HTMLElement>('[data-row-key^="session:"]')
    if (rowEl) {
      const k = rowEl.getAttribute('data-row-key') ?? ''
      if (k.startsWith('session:')) lastMenuSessionId = k.slice(8)
    }
    const wsEl = rawTarget?.closest?.<HTMLElement>('[data-row-key^="workspace:"]')
    if (wsEl) {
      const k = wsEl.getAttribute('data-row-key') ?? ''
      if (k.startsWith('workspace:')) lastMenuWorkspaceId = k.slice(10)
    }
  }
  const onMenuClickCapture = (e: Event): void => {
    const target = e.target as HTMLElement | null
    if (!target) return
    const menuItem = target.closest?.<HTMLElement>('[role="menuitem"]')
    if (!menuItem) return
    if (lastMenuWorkspaceId && deltaFeatures.isWorkspaceLocked(lastMenuWorkspaceId)) {
      const label = getMenuLabel(menuItem)
      if (LOCKED_WORKSPACE_MUTATION_LABELS.has(label)) {
        e.preventDefault?.()
        ;(e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
        e.stopPropagation?.()
        const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
        showDeltaToast(copy.workspaceMenu?.unlockFirst ?? copy.sessionMenu.unlockFirst)
        return
      }
    }
    if (!lastMenuSessionId || !deltaFeatures.isLocked(lastMenuSessionId)) return
    const label = getMenuLabel(menuItem)
    if (LOCKED_UNARCHIVE_LABELS.has(label)) {
      e.preventDefault?.()
      ;(e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      e.stopPropagation?.()
      deltaFeatures.openUnlockPinDialog(lastMenuSessionId)
      return
    }
    if (LOCKED_MUTATION_LABELS.has(label)) {
      e.preventDefault?.()
      ;(e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      e.stopPropagation?.()
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      showDeltaToast(copy.sessionMenu.unlockFirst)
    }
  }
  const onComposerGuardKeyDown = (e: Event): void => {
    const ke = e as KeyboardEvent
    const activeSid = deltaFeatures.getActiveSessionId()
    if (!activeSid || !deltaFeatures.isProtectedView(activeSid)) return
    const t = e.target as HTMLElement | null
    if (!t?.closest?.('[class*="mP3x-q_centerCol"]')) return
    if (ke.key === 'Enter' && !ke.shiftKey) {
      e.preventDefault?.()
      ;(e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
    }
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('pointerdown', onPointerDownCapture, { capture: true })
    document.addEventListener('click', onMenuClickCapture, { capture: true })
    document.addEventListener('keydown', onComposerGuardKeyDown, { capture: true })
  }

  const stopFeaturesSync = deltaFeatures.subscribe(() => scheduleSync())
  const unsubscribe = controller.subscribe(sync)
  sync()
  return () => {
    isDisposed = true
    frameScheduler.cancel()
    stopFeaturesSync()
    unsubscribe()
    observer?.disconnect()
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('pointerdown', onPointerDownCapture, { capture: true })
      document.removeEventListener('click', onMenuClickCapture, { capture: true })
      document.removeEventListener('keydown', onComposerGuardKeyDown, { capture: true })
    }
    restoreHiddenNodes('data-dtd-hidden-session-log', hiddenSessionLogNodes)
    restoreHiddenNodes('data-dtd-hidden-privacy-cmd', hiddenPrivacyCmdNodes)
    restoreHiddenNodes('data-dtd-hidden-sole-workspace', hiddenSoleWorkspaceNodes)
    restoreHiddenNodes('data-dtd-hidden-deleted', hiddenDeletedRows)
    deltaFeatures.resetSessionOverlays()
  }
}

/**
 * A plugin-owned search control inside the published sidebar scrollport.
 * It calls Harness Session Controller and UiWorkspace services directly if present.
 */
type SearchTabId = 'all' | 'session' | 'workspace' | 'plugin' | 'skill' | 'shortcut' | 'action'
type SearchItemKind = 'session' | 'content' | 'workspace' | 'plugin' | 'skill' | 'command' | 'shortcut' | 'action'

interface HostContentHit {
  sessionId: string
  title?: string
  snippet: string
  matchStart?: number
  matchEnd?: number
  seq?: number
  turn?: number
  role?: 'user' | 'assistant'
  updatedAt?: number
  workspaceId?: string
  score?: number
}

interface PaletteItem {
  id: string
  tab: Exclude<SearchTabId, 'all'>
  kind: SearchItemKind
  title: string
  subtitle?: string
  snippet?: string
  badge: string
  meta?: string
  score: number
  keywords?: string
  run: () => void
}

function appendHighlightedText(target: HTMLElement, text: string, query: string): void {
  const safe = redactSensitiveText(text)
  const q = query.trim()
  if (!q) {
    target.textContent = safe
    return
  }
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 6)
  if (terms.length === 0) {
    target.textContent = safe
    return
  }
  const lower = safe.toLowerCase()
  const ranges: Array<[number, number]> = []
  for (const rawTerm of terms) {
    const term = rawTerm.toLowerCase()
    if (!term) continue
    let from = 0
    while (from < lower.length) {
      const idx = lower.indexOf(term, from)
      if (idx < 0) break
      ranges.push([idx, idx + term.length])
      from = idx + term.length
    }
  }
  if (ranges.length === 0) {
    target.textContent = safe
    return
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged: Array<[number, number]> = []
  for (const [s, e] of ranges) {
    const prev = merged[merged.length - 1]
    if (prev && s <= prev[1]) {
      prev[1] = Math.max(prev[1], e)
    } else {
      merged.push([s, e])
    }
  }
  let cursor = 0
  for (const [s, e] of merged) {
    if (s > cursor) target.appendChild(document.createTextNode(safe.slice(cursor, s)))
    const mark = document.createElement('mark')
    mark.textContent = safe.slice(s, e)
    target.appendChild(mark)
    cursor = e
  }
  if (cursor < safe.length) target.appendChild(document.createTextNode(safe.slice(cursor)))
}

function canQueryHostSearchHttp(): boolean {
  return canCallHostHttp()
}

function normalizeSearchTime(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function revealSessionTurnInChat(turn: number | undefined, snippet: string | undefined): () => void {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return () => {}
  if (turn === undefined && !snippet) return () => {}
  let attempts = 0
  let cancelled = false
  let activeTimer: number | undefined
  let clearFlashTimer: number | undefined

  const flashTarget = (el: HTMLElement): void => {
    try { el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) } catch {}
    try { el.classList?.add?.('dtd-search-hit-flash') } catch {}
    clearFlashTimer = scheduleTimer(() => {
      try { el.classList?.remove?.('dtd-search-hit-flash') } catch {}
    }, 1900)
  }

  const probe = (): void => {
    if (cancelled) return
    attempts += 1
    let hitEl: HTMLElement | null = null
    const needle = snippet ? snippet.replace(/^…|…$/g, '').trim().slice(0, 24) : ''
    if (turn !== undefined) {
      const candidate = document.querySelector<HTMLElement>(`[data-chat-flow] [data-chat-turn="${turn}"], [data-chat-turn="${turn}"]`)
      if (candidate && (needle.length < 4 || (candidate.textContent ?? '').includes(needle))) {
        hitEl = candidate
      }
    }
    if (!hitEl && needle.length >= 4) {
      const nodes = document.querySelectorAll<HTMLElement>('[data-chat-flow] [data-chat-turn], [data-chat-turn]')
      for (const node of nodes) {
        if ((node.textContent ?? '').includes(needle)) {
          hitEl = node
          break
        }
      }
    }
    if (!hitEl && turn !== undefined) {
      hitEl = document.querySelector<HTMLElement>(`[data-chat-flow] [data-chat-turn="${turn}"], [data-chat-turn="${turn}"]`)
    }
    if (hitEl) {
      flashTarget(hitEl)
      return
    }
    if (attempts < 16) {
      activeTimer = scheduleTimer(probe, 100)
    }
  }

  activeTimer = scheduleTimer(probe, 80)
  return () => {
    cancelled = true
    if (activeTimer !== undefined) cancelTimer(activeTimer)
    if (clearFlashTimer !== undefined) cancelTimer(clearFlashTimer)
  }
}

/**
 * Plugin-owned Search Palette opened through a verified public composer Slot.
 * Searches sessions, workspaces, plugins, skills/commands, shortcuts, and quick actions without taking over the Host sidebar.
 */
function installHostSearch(
  controller: DeltaController & { toggleSidebarSafe?(): boolean; toggleRightbarSafe?(): boolean },
  sessions: SearchSessionsApi,
  navigation: SearchNavigationApi,
  searchScope?: ClientContext,
  React?: ReactApi,
): () => void {
  // InputActions is a Host-provided session-scope Slot prop, not a global service.
  type ScopedCommandTarget = { sessionId: string; insert(command: string): boolean }
  type CommandInputState = { draft: string; draftRev: number; phase: string; attachmentIds: readonly unknown[]; occurrences: readonly unknown[] }
  type CommandInputSpan = { start: number; end: number; draftRev: number }
  type CommandInputActions = {
    captureInsertion(): CommandInputSpan
    insertText(text: string, span: CommandInputSpan): boolean
  }
  type CommandSlotProps = {
    sessionId: string
    inputActions: CommandInputActions
    useInput<T>(selector: (state: CommandInputState) => T): T
    useAccess(action: 'session/prompt'): boolean | undefined
  }
  type CommandHost = {
    blocks?: { storeFor(id: string): { getSnapshot(): unknown } }
    input?: { for(scope: unknown): { state: { getSnapshot(): CommandInputState } } }
  }
  type CommandAccessHost = {
    whenAccess(sessionId: string, action: 'session/prompt', install: () => () => void): () => void
  }
  type CommandAccessLease = { sessionId: string; allowed: boolean; revision: number }
  const isDarwin = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform ?? navigator.userAgent ?? '')
  const initialCopy = DICTIONARIES[language()] ?? DICTIONARIES.en

  const shell = document.createElement('section')
  shell.className = 'dtd-host-search'
  shell.setAttribute('data-delta-search', 'sessions')
  const searchField = document.createElement('div')
  searchField.className = 'dtd-host-search-field'
  const searchIcon = createSearchIconSvg()

  const input = document.createElement('input')
  input.type = 'search'
  input.maxLength = 500
  input.className = 'dtd-host-search-input'
  input.autocomplete = 'off'
  input.setAttribute('aria-label', initialCopy.ui.searchSessions)
  input.placeholder = initialCopy.searchPalette.sidebarPlaceholder

  const clearBtn = document.createElement('button')
  clearBtn.type = 'button'
  clearBtn.className = 'dtd-search-clear'
  clearBtn.setAttribute('aria-label', initialCopy.searchPalette.clear)
  clearBtn.textContent = '×'
  clearBtn.hidden = true

  const kbdHint = document.createElement('kbd')
  kbdHint.className = 'dtd-search-kbd'
  kbdHint.textContent = 'Enter'

  searchField.append(searchIcon, input, clearBtn, kbdHint)

  const results = document.createElement('div')
  results.className = 'dtd-host-search-results'
  results.setAttribute('role', 'region')
  results.setAttribute('aria-label', initialCopy.ui.searchSessions)
  results.hidden = true
  shell.append(searchField, results)

  let isDisposed = false
  let inlineTimer: number | undefined
  let inlinePending: AbortController | undefined
  let inlineSerial = 0
  let inlineRenderSerial = 0
  let inlineRemoteItems: HostContentHit[] = []
  let isInlineSearching = false
  let hasInlineError = false

  let stopRevealTimer: (() => void) | undefined
  let modalTimer: number | undefined
  let modalPending: AbortController | undefined
  let modalSerial = 0
  let isModalOpen = false
  let modalRemoteHits: HostContentHit[] = []
  let isModalSearching = false
  let activeTab: SearchTabId = 'all'
  let activeIndex = 0
  let cachedCatalog: { plugins: PaletteItem[]; skills: PaletteItem[]; shortcuts: PaletteItem[] } | undefined
  let catalogSerial = 0

  let backdropEl: HTMLElement | undefined
  let modalEl: HTMLElement | undefined
  let modalInputEl: HTMLInputElement | undefined
  let modalClearBtn: HTMLButtonElement | undefined
  let modalTabsEl: HTMLElement | undefined
  let modalListEl: HTMLElement | undefined

  const isActive = (): boolean => !isDisposed && controller.getSnapshot().mode === 'delta' && shell.isConnected
  const clearInlineRequest = (): void => {
    if (inlineTimer !== undefined) cancelTimer(inlineTimer)
    inlineTimer = undefined
    inlinePending?.abort()
    inlinePending = undefined
    inlineSerial += 1
  }
  const clearModalRequest = (): void => {
    if (modalTimer !== undefined) cancelTimer(modalTimer)
    modalTimer = undefined
    modalPending?.abort()
    modalPending = undefined
    modalSerial += 1
  }

  const getWorkspaces = (): readonly { workspaceId: string; path: string; title: string; sessionIds?: readonly string[] }[] => {
    try {
      const ws = searchScope?.get?.('workspaces') as WorkspacesApi | undefined
      return ws?.list?.getSnapshot?.()?.items ?? []
    } catch {
      return []
    }
  }

  const readSearchProtection = () => deltaFeatures.readSearchProtection()
  const filterSearchHits = (hits: HostContentHit[]): HostContentHit[] => {
    const policy = readSearchProtection()
    try {
      const rows = sessions.list.getSnapshot().byId
      return hits.filter(hit => typeof hit?.sessionId === 'string' && !!hit.sessionId &&
        policy.allowsSession(hit.sessionId, hit.workspaceId) &&
        policy.allowsSession(hit.sessionId, rows[hit.sessionId]?.workspaceId))
    } catch { return [] }
  }

  const dispatchContentSearch = (
    query: string,
    signal: AbortSignal,
    onDone: (res: { items: HostContentHit[]; ok: boolean; fromDisabledOnly?: boolean }) => void,
  ): void => {
    const finish = (res: { items: HostContentHit[]; ok: boolean; fromDisabledOnly?: boolean }): void => {
      if (signal.aborted || isDisposed) return
      onDone({ ...res, items: filterSearchHits(res.items) })
    }
    const queryLegacy = (): void => {
      if (signal.aborted || isDisposed) return
      if (!readSearchProtection().canUseNativeFallback) {
        finish({ items: [], ok: false })
        return
      }
      void sessions.search(query, signal).then(
        fallback => {
          if (fallback.ok) {
            finish({
              items: (fallback.value?.items ?? []).map(item => ({
                sessionId: item.sessionId,
                snippet: item.snippet,
              })),
              ok: true,
            })
            return
          }
          const errMsg = fallback.error?.message ?? ''
          finish(/DISABLED|UNAVAILABLE/i.test(errMsg) ? { items: [], ok: true, fromDisabledOnly: true } : { items: [], ok: false })
        },
        reason => {
          if (signal.aborted) return
          console.warn('[delta-suite] native Session search failed', reason)
          finish({ items: [], ok: false })
        },
      )
    }

    if (!readSearchProtection().canQuery) {
      finish({ items: [], ok: false })
      return
    }
    if (!canQueryHostSearchHttp()) {
      queryLegacy()
      return
    }
    void fetch('/api/delta-suite/session-search?q=' + encodeURIComponent(query) + '&limit=30', {
      method: 'GET',
      credentials: 'same-origin',
      signal,
    }).then(
      async res => {
        if (signal.aborted || isDisposed) return
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as { items?: HostContentHit[] } | null
          if (Array.isArray(data?.items)) {
            finish({ items: data.items, ok: true })
            return
          }
        }
        queryLegacy()
      },
      () => {
        if (!signal.aborted) queryLegacy()
      },
    )
  }

  const openSessionHit = (sessionId: string, workspaceId?: string, turn?: number, snippet?: string): void => {
    if (isDisposed || !readSearchProtection().allowsSession(sessionId, workspaceId)) return
    try {
      if (!readSearchProtection().allowsSession(sessionId, sessions.list.getSnapshot().byId[sessionId]?.workspaceId)) return
    } catch { return }
    stopRevealTimer?.()
    stopRevealTimer = undefined
    try {
      if (workspaceId) navigation.openSession(sessionId, { workspaceId })
      else navigation.openSession(sessionId)
      stopRevealTimer = revealSessionTurnInChat(turn, snippet)
    } catch (reason) {
      console.warn('[delta-suite] native Session navigation failed', reason)
    }
  }

  const openWorkspaceHit = (workspaceId: string): void => {
    if (isDisposed) return
    const policy = readSearchProtection()
    const ws = getWorkspaces().find(w => w.workspaceId === workspaceId)
    if (!ws || !policy.allowsWorkspace(ws.workspaceId, ws.path)) return
    const sid = ws.sessionIds?.find(id => policy.allowsSession(id, workspaceId))
    if (sid) openSessionHit(sid, workspaceId)
    else if (Array.isArray(ws.sessionIds) && ws.sessionIds.length === 0) navigation.startSession(workspaceId)
  }

  const syncSidebarLabels = (): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    input.setAttribute('aria-label', copy.ui.searchSessions)
    input.placeholder = copy.searchPalette.sidebarPlaceholder
    results.setAttribute('aria-label', copy.ui.searchSessions)
    clearBtn.setAttribute('aria-label', copy.searchPalette.clear)
    const hasVal = input.value.length > 0
    clearBtn.hidden = !hasVal
    kbdHint.hidden = hasVal
  }

  const renderInline = (): void => {
    syncSidebarLabels()
    results.replaceChildren()
    const renderSerial = ++inlineRenderSerial
    const policy = readSearchProtection()
    const query = input.value.trim().toLocaleLowerCase()
    if (!query || !isActive()) { results.hidden = true; return }
    // One consistent Host list snapshot per render, including remote hit
    // title fallback; avoid repeated service reads while typing.
    const sessionById = sessions.list.getSnapshot().byId
    results.hidden = false
    const copy = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
    const pal = (DICTIONARIES[language()] ?? DICTIONARIES.en).searchPalette
    const seen = new Set<string>()
    const matches: { id: string; title: string; snippet?: string; turn?: number; workspaceId?: string; isWorkspace?: boolean }[] = []

    for (const item of Object.values(sessionById)) {
      if (!policy.allowsSession(item.id, item.workspaceId)) continue
      const title = item.title?.trim() ?? ''
      if (!item.blank && title.toLocaleLowerCase().includes(query)) {
        matches.push({ id: item.id, title: redactSensitiveText(title), workspaceId: item.workspaceId })
        seen.add(item.id)
      }
      if (matches.length >= 20) break
    }
    for (const item of inlineRemoteItems) {
      if (!policy.allowsSession(item.sessionId, item.workspaceId) || seen.has(item.sessionId) || matches.length >= 20) continue
      const title = item.title?.trim() || sessionById[item.sessionId]?.title?.trim() || item.sessionId
      matches.push({
        id: item.sessionId,
        title: redactSensitiveText(title),
        snippet: redactSensitiveText(item.snippet),
        turn: item.turn,
        workspaceId: item.workspaceId,
      })
      seen.add(item.sessionId)
    }
    for (const ws of getWorkspaces()) {
      if (matches.length >= 20) break
      if (!policy.allowsWorkspace(ws.workspaceId, ws.path)) continue
      const wsTitle = ws.title?.trim() || redactPathForUi(ws.path)
      const wsPath = redactPathForUi(ws.path)
      if (wsTitle.toLocaleLowerCase().includes(query) || wsPath.toLocaleLowerCase().includes(query)) {
        matches.push({
          id: 'ws:' + ws.workspaceId,
          title: `${pal.kindWorkspace}: ${wsTitle}`,
          snippet: wsPath,
          workspaceId: ws.workspaceId,
          isWorkspace: true,
        })
      }
    }

    for (const match of matches) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'dtd-host-search-result'
      const heading = document.createElement('span')
      heading.className = 'dtd-host-search-result-title'
      heading.textContent = match.title
      button.appendChild(heading)
      if (match.snippet) {
        const detail = document.createElement('span')
        detail.className = 'dtd-host-search-result-snippet'
        detail.textContent = match.snippet
        button.appendChild(detail)
      }
      button.addEventListener('click', () => {
        if (!isActive() || renderSerial !== inlineRenderSerial) return
        try {
          if (match.isWorkspace && match.workspaceId) {
            openWorkspaceHit(match.workspaceId)
          } else {
            openSessionHit(match.id, match.workspaceId, match.turn, match.snippet)
          }
          input.value = ''
          clearInlineRequest()
          inlineRemoteItems = []
          renderInline()
        } catch (reason) {
          console.warn('[delta-suite] native Session navigation failed', reason)
          hasInlineError = true
          renderInline()
        }
      })
      results.appendChild(button)
    }
    if (isInlineSearching || hasInlineError || matches.length === 0) {
      const message = document.createElement('p')
      message.className = 'dtd-host-search-hint'
      message.setAttribute('role', 'status')
      message.textContent = hasInlineError ? copy.unavailable : isInlineSearching ? copy.searching : copy.noResults
      results.appendChild(message)
    }
  }

  const onInlineInput = (): void => {
    clearInlineRequest()
    inlineRemoteItems = []
    isInlineSearching = false
    hasInlineError = false
    const query = input.value.replaceAll('\0', '').trim().slice(0, 500)
    if (query) {
      isInlineSearching = true
      const requestId = inlineSerial
      const aborter = new AbortController()
      inlinePending = aborter
      inlineTimer = scheduleTimer(() => {
        inlineTimer = undefined
        dispatchContentSearch(query, aborter.signal, res => {
          if (!isActive() || inlineSerial !== requestId || aborter.signal.aborted) return
          isInlineSearching = false
          hasInlineError = !res.ok
          inlineRemoteItems = res.ok ? res.items : []
          renderInline()
        })
      }, 220)
    }
    renderInline()
  }

  input.addEventListener('input', onInlineInput)
  input.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    input.value = ''
    onInlineInput()
    input.blur()
  })
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation?.()
    input.value = ''
    onInlineInput()
  })

  // ---------------- Centered Command Search Palette ----------------
  // Unscoped sidebar search has no authorized composer target. Copy only.
  // Scoped composer insertion uses Host-provided InputActions, never editor DOM.
  const copySlashCommand = (commandName: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (typeof clipboard?.writeText !== 'function') {
      showDeltaToast(copy.searchPalette.commandCopyFailed)
      return
    }
    try {
      void clipboard.writeText(commandName).then(() => {
        try { controller.openConversation() } catch {}
        showDeltaToast(copy.searchPalette.commandCopied)
      }, () => showDeltaToast(copy.searchPalette.commandCopyFailed))
    } catch {
      showDeltaToast(copy.searchPalette.commandCopyFailed)
    }
  }

  const isSafeCommand = (name: string): boolean =>
    /^\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(name) && !/^\/(?:export|feedback)$/i.test(name)

  const getUniqueMainSessionId = (): string | undefined => {
    try {
      const rows = Object.values(sessions.list.getSnapshot().byId)
        .filter(row => (row.retainedBy?.mainView ?? 0) > 0)
      return rows.length === 1 ? rows[0].id : undefined
    } catch { return undefined }
  }

  const isEmptyCommandDraft = (input: CommandInputState | undefined): input is CommandInputState =>
    input?.phase === 'plain' && input.draft === '' && Number.isSafeInteger(input.draftRev) &&
    Array.isArray(input.attachmentIds) && input.attachmentIds.length === 0 &&
    Array.isArray(input.occurrences) && input.occurrences.length === 0

  // This read resolves an already-retained main Session generation. No new Session
  // is opened, no draft is initialized, and no shared Host service is replaced.
  const readCommandTarget = (scope: ClientContext, sessionId: string) => {
    try {
      if (isDisposed || controller.getSnapshot().mode !== 'delta' ||
          getUniqueMainSessionId() !== sessionId || !readSearchProtection().allowsSession(sessionId) || deltaFeatures.isLocked(sessionId) ||
          deltaFeatures.isSessionInLockedWorkspace(sessionId) || deltaFeatures.isDeleted(sessionId)) return undefined
      const binding = sessions.binding?.(sessionId)
      const session = binding?.session.getSnapshot()
      const host = scope.get?.('conversation') as CommandHost | undefined
      if (!binding || session?.sessionId !== sessionId || session.removed !== false ||
          session.subagent !== null || session.openState !== 'open' ||
          typeof host?.blocks?.storeFor !== 'function' || typeof host.input?.for !== 'function') return undefined
      if (host.blocks.storeFor(sessionId).getSnapshot() !== undefined) return undefined
      const input = host.input.for(binding.ctx).state.getSnapshot()
      if (!isEmptyCommandDraft(input)) return undefined
      return { binding, input, host }
    } catch { return undefined }
  }

  const dispatchSlashCommand = (name: string, target: ScopedCommandTarget | undefined): void => {
    if (!target) { copySlashCommand(name); return }
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    let isAccepted = false
    try { isAccepted = isSafeCommand(name) && target.insert(name + ' ') === true } catch {}
    showDeltaToast(isAccepted ? copy.searchPalette.commandInserted : copy.searchPalette.commandInsertFailed)
  }

  const getShortcutsService = (): {
    catalog?: { getSnapshot?: () => ReadonlyArray<{ id?: string; label?: string; keys?: readonly string[]; aliases?: readonly string[] }> }
  } | undefined => {
    try {
      return (searchScope?.get?.('shortcuts') ?? (searchScope as unknown as { shortcuts?: unknown })?.shortcuts) as any
    } catch {
      return undefined
    }
  }

  const buildDynamicCatalog = async (target?: ScopedCommandTarget): Promise<{ plugins: PaletteItem[]; skills: PaletteItem[]; shortcuts: PaletteItem[] }> => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const pCopy = copy.searchPalette
    const commandHint = target ? pCopy.commandInsertHint : pCopy.commandCopyHint
    const commandLabel = target ? pCopy.commandInsertLabel : pCopy.commandCopyLabel
    const plugins: PaletteItem[] = []
    const skills: PaletteItem[] = []
    const shortcuts: PaletteItem[] = []

    const remote = (searchScope?.get?.('remote') ?? (searchScope as unknown as { remote?: unknown })?.remote) as {
      skills?: { list?: () => Promise<unknown> }
      commands?: { list?: (sessionId: string) => Promise<{ ok?: boolean; value?: Array<{ name?: string; description?: string }> }> }
    } | undefined

    // Plugin and schedule navigation remain native-owned: without a public
    // navigation contract no Search Palette entry may impersonate a runnable action.

    // Safe built-in & live slash commands (strictly exclude /export & /feedback per privacy rules)
    const safeBuiltins: Array<{ cmd: string; descZh: string; descEn: string }> = [
      { cmd: '/plan', descZh: DICTIONARIES.zh.searchPalette.builtinPlan, descEn: DICTIONARIES.en.searchPalette.builtinPlan },
      { cmd: '/goal', descZh: DICTIONARIES.zh.searchPalette.builtinGoal, descEn: DICTIONARIES.en.searchPalette.builtinGoal },
      { cmd: '/compact', descZh: DICTIONARIES.zh.searchPalette.builtinCompact, descEn: DICTIONARIES.en.searchPalette.builtinCompact },
      { cmd: '/schedule', descZh: DICTIONARIES.zh.searchPalette.builtinSchedule, descEn: DICTIONARIES.en.searchPalette.builtinSchedule },
      { cmd: '/browser', descZh: DICTIONARIES.zh.searchPalette.builtinBrowser, descEn: DICTIONARIES.en.searchPalette.builtinBrowser },
      { cmd: '/boost', descZh: DICTIONARIES.zh.searchPalette.builtinBoost, descEn: DICTIONARIES.en.searchPalette.builtinBoost },
    ]
    const seenCmds = new Set<string>()
    for (const c of safeBuiltins) {
      seenCmds.add(c.cmd.toLowerCase())
      skills.push({
        id: 'cmd:' + c.cmd,
        tab: 'skill',
        kind: 'command',
        title: c.cmd,
        snippet: (language() === 'zh' ? c.descZh : c.descEn) + ' · ' + commandHint,
        badge: pCopy.kindCommand,
        meta: commandLabel,
        score: 52,
        keywords: `${c.cmd} ${c.descZh} ${c.descEn}`,
        run: () => dispatchSlashCommand(c.cmd, target),
      })
    }

    try {
      const targetSid = target?.sessionId ?? getUniqueMainSessionId()
      if (targetSid && readSearchProtection().allowsSession(targetSid) && !deltaFeatures.isLocked(targetSid) && !deltaFeatures.isSessionInLockedWorkspace(targetSid) &&
          !deltaFeatures.isDeleted(targetSid) && remote?.commands?.list) {
        const res = await remote.commands.list(targetSid)
        if (res?.ok && Array.isArray(res.value)) {
          for (const item of res.value) {
            const rawName = item?.name?.trim() ?? ''
            if (!rawName) continue
            const cmdName = rawName.startsWith('/') ? rawName : '/' + rawName
            if (!isSafeCommand(cmdName) || seenCmds.has(cmdName.toLowerCase())) continue
            seenCmds.add(cmdName.toLowerCase())
            skills.push({
              id: 'skill:' + cmdName,
              tab: 'skill',
              kind: 'skill',
              title: cmdName,
              snippet: (item.description ? redactSensitiveText(item.description) + ' · ' : '') + commandHint,
              badge: pCopy.kindSkill,
              meta: commandLabel,
              score: 58,
              keywords: `${cmdName} ${item.description ?? ''}`,
              run: () => dispatchSlashCommand(cmdName, target),
            })
          }
        }
      }
      const rawSkills = await remote?.skills?.list?.()
      const skillList = Array.isArray(rawSkills) ? rawSkills : ((rawSkills as { items?: unknown[]; skills?: unknown[] })?.items ?? (rawSkills as { skills?: unknown[] })?.skills ?? [])
      for (const s of skillList as Array<{ name?: string; title?: string; description?: string }>) {
        const raw = (s?.name ?? s?.title ?? '').trim()
        if (!raw) continue
        const cmdName = raw.startsWith('/') ? raw : '/' + raw
        if (!isSafeCommand(cmdName) || seenCmds.has(cmdName.toLowerCase())) continue
        seenCmds.add(cmdName.toLowerCase())
        skills.push({
          id: 'skill:' + cmdName,
          tab: 'skill',
          kind: 'skill',
          title: cmdName,
          snippet: (s.description ? redactSensitiveText(s.description) + ' · ' : '') + commandHint,
          badge: pCopy.kindSkill,
          meta: commandLabel,
          score: 57,
          keywords: `${cmdName} ${s.description ?? ''}`,
          run: () => dispatchSlashCommand(cmdName, target),
        })
      }
    } catch {}

    // Existing Host shortcut catalog and Delta-owned shortcuts; never mirror native guide DOM.
    const seenShortcuts = new Set<string>()
    const pushShortcut = (id: string, title: string, keyLabel: string, runner: () => void): void => {
      if (seenShortcuts.has(id)) return
      seenShortcuts.add(id)
      shortcuts.push({
        id: 'sc:' + id,
        tab: 'shortcut',
        kind: 'shortcut',
        title,
        badge: pCopy.kindShortcut,
        meta: keyLabel,
        score: 48,
        keywords: `${title} ${keyLabel}`,
        run: runner,
      })
    }
    try {
      const liveRows = getShortcutsService()?.catalog?.getSnapshot?.() ?? []
      for (const row of liveRows) {
        const id = row?.id?.trim()
        const label = row?.label?.trim()
        // Host Settings is native-owned; this adapter has no public open-settings route.
        if (!id || !label || id === 'settings.open') continue
        // The Host catalog provides labels, not permission to invoke arbitrary commands.
        // Advertise only actions with an explicit Delta-owned execution route.
        let run: (() => void) | undefined
        switch (id) {
          case 'session.search':
            run = () => openPalette('')
            break
          case 'session.new':
            run = () => navigation.startSession()
            break
          case 'sidebar.left.toggle':
            run = () => {
              if (typeof controller.toggleSidebarSafe === 'function') controller.toggleSidebarSafe()
              else controller.toggleSidebar()
            }
            break
          case 'sidebar.right.toggle':
            if (typeof controller.toggleRightbarSafe !== 'function') continue
            run = () => controller.toggleRightbarSafe?.()
            break
          default:
            // Unknown Host commands stay in Harness native shortcut handling.
            continue
        }
        if (!run) continue
        const keysStr = Array.isArray(row.keys) ? row.keys.join(' + ') : ''
        pushShortcut(id, redactSensitiveText(label), keysStr, run)
      }
    } catch {}
    // Native right-sidebar guide entries are Host-owned and not command targets.
    pushShortcut('search', (DICTIONARIES[language()] ?? DICTIONARIES.en).searchPalette.globalCommandSearch, '', () => openPalette(''))
    pushShortcut('files', (DICTIONARIES[language()] ?? DICTIONARIES.en).searchPalette.workspaceFiles, isDarwin ? '⌘ + P' : 'Ctrl + P', () => controller.toggleRightbarSafe?.())
    pushShortcut('browser', (DICTIONARIES[language()] ?? DICTIONARIES.en).searchPalette.builtInBrowser, isDarwin ? '⌘ + T' : 'Ctrl + T', () => controller.toggleRightbarSafe?.())

    return { plugins, skills, shortcuts }
  }

  const collectPaletteItems = (query: string, hostHits: HostContentHit[]): PaletteItem[] => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const pCopy = copy.searchPalette
    const q = query.trim().toLowerCase()
    const terms = q ? q.split(/\s+/).filter(Boolean).slice(0, 6) : []
    const items: PaletteItem[] = []
    const policy = readSearchProtection()
    const wsList = getWorkspaces().filter(ws => policy.allowsWorkspace(ws.workspaceId, ws.path))
    const wsById = new Map(wsList.map(w => [w.workspaceId, w]))

    const matchText = (text: string): boolean => {
      if (terms.length === 0) return true
      const lower = text.toLowerCase()
      return terms.every(t => lower.includes(t))
    }

    // 1. Sessions (titles + host in-memory message content hits)
    // Reuse one snapshot across title scoring and matching content hits.
    const sessionById = sessions.list.getSnapshot().byId
    const allSessions = Object.values(sessionById)
      .filter(s => !s.blank && policy.allowsSession(s.id, s.workspaceId))
      .sort((a, b) => normalizeSearchTime(b.updatedAt) - normalizeSearchTime(a.updatedAt))

    const contentHitsBySession = new Map<string, HostContentHit>()
    for (const hit of hostHits) {
      const sess = sessionById[hit.sessionId]
      if (!policy.allowsSession(hit.sessionId, hit.workspaceId) ||
          !policy.allowsSession(hit.sessionId, sess?.workspaceId)) continue
      if (!contentHitsBySession.has(hit.sessionId)) {
        contentHitsBySession.set(hit.sessionId, hit)
      }
      const rawTitle = hit.title?.trim() || sess?.title?.trim() || hit.sessionId
      const wsId = hit.workspaceId ?? sess?.workspaceId
      const ws = wsId ? wsById.get(wsId) : undefined
      const roleLabel = hit.role === 'user' ? pCopy.roleUser : hit.role === 'assistant' ? pCopy.roleAssistant : ''
      const turnText = hit.turn ? pCopy.turnLabel.replace('{turn}', String(hit.turn)) : ''
      const metaParts = [roleLabel, turnText, ws?.title].filter(Boolean)
      items.push({
        id: `hit:${hit.sessionId}:${hit.seq ?? hit.turn ?? 'c'}`,
        tab: 'session',
        kind: 'content',
        title: redactSensitiveText(rawTitle),
        snippet: redactSensitiveText(hit.snippet),
        badge: pCopy.kindContent,
        meta: metaParts.join(' · ') || undefined,
        score: (hit.score ?? 100) + 20,
        run: () => openSessionHit(hit.sessionId, wsId, hit.turn, hit.snippet),
      })
    }

    for (const s of allSessions) {
      const title = redactSensitiveText(s.title?.trim() || s.id)
      const ws = s.workspaceId ? wsById.get(s.workspaceId) : undefined
      const wsLabel = ws ? (ws.title || redactPathForUi(ws.path)) : ''
      const searchable = `${title} ${s.id} ${wsLabel}`
      if (!matchText(searchable)) continue
      if (q && contentHitsBySession.has(s.id) && title.toLowerCase() === (contentHitsBySession.get(s.id)?.title ?? '').toLowerCase()) {
        continue
      }
      const isPrefix = q ? title.toLowerCase().startsWith(q) : false
      const isArchived = Boolean(s.archived)
      items.push({
        id: 'sess:' + s.id,
        tab: 'session',
        kind: 'session',
        title,
        snippet: wsLabel || redactPathForUi(ws?.path ?? ''),
        badge: pCopy.kindSession,
        meta: isArchived ? pCopy.archivedBadge : undefined,
        score: q ? (isPrefix ? 140 : 110) : 70,
        run: () => openSessionHit(s.id, s.workspaceId),
      })
      if (!q && items.length >= 8) break
    }

    // 2. Workspaces
    for (const ws of wsList) {
      const safePath = redactPathForUi(ws.path)
      const title = ws.title?.trim() || safePath
      if (!matchText(`${title} ${safePath}`)) continue
      items.push({
        id: 'ws:' + ws.workspaceId,
        tab: 'workspace',
        kind: 'workspace',
        title: redactSensitiveText(title),
        snippet: safePath,
        badge: pCopy.kindWorkspace,
        meta: ws.sessionIds ? `${ws.sessionIds.filter(id => policy.allowsSession(id, ws.workspaceId)).length}` : undefined,
        score: q ? 85 : 50,
        run: () => openWorkspaceHit(ws.workspaceId),
      })
    }

    // 3. Plugins, Skills/Commands, Shortcuts
    if (cachedCatalog) {
      for (const p of cachedCatalog.plugins) {
        if (matchText(p.keywords || p.title)) items.push(p)
      }
      for (const sk of cachedCatalog.skills) {
        if (matchText(sk.keywords || sk.title)) items.push(sk)
      }
      for (const sc of cachedCatalog.shortcuts) {
        if (matchText(sc.keywords || sc.title)) items.push(sc)
      }
    }

    // 4. Quick Actions
    const quickActions: PaletteItem[] = [
      {
        id: 'act:new',
        tab: 'action',
        kind: 'action',
        title: pCopy.actionNewConversation,
        badge: pCopy.kindAction,
        score: 45,
        keywords: `new conversation chat start \u65B0\u5EFA \u5BF9\u8BDD \u5F00\u59CB\u5BF9\u8BDD`,
        run: () => navigation.startSession(),
      },
      {
        id: 'act:sidebar',
        tab: 'action',
        kind: 'action',
        title: pCopy.actionToggleSidebar,
        badge: pCopy.kindAction,
        score: 41,
        keywords: `toggle sidebar left \u4FA7\u8FB9\u680F \u6536\u8D77 \u5C55\u5F00`,
        run: () => controller.toggleSidebarSafe?.() ?? controller.toggleSidebar(),
      },
      {
        id: 'act:rightbar',
        tab: 'action',
        kind: 'action',
        title: pCopy.actionToggleRightbar,
        badge: pCopy.kindAction,
        score: 40,
        keywords: `toggle rightbar right \u53F3\u4FA7\u8FB9\u680F \u5DE5\u5177`,
        run: () => controller.toggleRightbarSafe?.(),
      },
    ]
    for (const act of quickActions) {
      if (matchText(`${act.title} ${act.keywords ?? ''}`)) items.push(act)
    }

    items.sort((a, b) => b.score - a.score)
    return items
  }

  let currentFilteredItems: PaletteItem[] = []

  const closePalette = (): void => {
    isModalOpen = false
    catalogSerial += 1
    cachedCatalog = undefined
    currentFilteredItems = []
    clearModalRequest()
    modalRemoteHits = []
    if (backdropEl) {
      backdropEl.hidden = true
      backdropEl.remove()
    }
    backdropEl = undefined
    modalEl = undefined
    modalInputEl = undefined
    modalClearBtn = undefined
    modalTabsEl = undefined
    modalListEl = undefined
  }

  const executePaletteItem = (item: PaletteItem | undefined): void => {
    if (!isModalOpen || !item || !currentFilteredItems.includes(item)) return
    closePalette()
    input.value = ''
    clearInlineRequest()
    inlineRemoteItems = []
    renderInline()
    item.run()
  }

  const renderPalette = (): void => {
    if (!isModalOpen || !modalTabsEl || !modalListEl || !modalInputEl || !modalClearBtn) return
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const pCopy = copy.searchPalette
    const q = modalInputEl.value.trim()
    modalClearBtn.hidden = modalInputEl.value.length === 0

    const allItems = collectPaletteItems(q, modalRemoteHits)
    const tabDefs: Array<{ id: SearchTabId; label: string }> = [
      { id: 'all', label: pCopy.tabAll },
      { id: 'session', label: pCopy.tabSession },
      { id: 'workspace', label: pCopy.tabWorkspace },
      { id: 'plugin', label: pCopy.tabPlugin },
      { id: 'skill', label: pCopy.tabSkill },
      { id: 'shortcut', label: pCopy.tabShortcut },
      { id: 'action', label: pCopy.tabAction },
    ]
    const counts = new Map<SearchTabId, number>([['all', allItems.length]])
    for (const item of allItems) {
      counts.set(item.tab, (counts.get(item.tab) ?? 0) + 1)
    }

    modalTabsEl.replaceChildren()
    for (const tab of tabDefs) {
      const count = counts.get(tab.id) ?? 0
      const tabBtn = document.createElement('button')
      tabBtn.type = 'button'
      tabBtn.className = tab.id === activeTab ? 'dtd-search-tab dtd-active' : 'dtd-search-tab'
      const lbl = document.createElement('span')
      lbl.textContent = tab.label
      const cnt = document.createElement('span')
      cnt.className = 'dtd-search-tab-count'
      cnt.textContent = String(count)
      tabBtn.append(lbl, cnt)
      tabBtn.addEventListener('click', () => {
        activeTab = tab.id
        activeIndex = 0
        renderPalette()
        modalInputEl?.focus?.()
      })
      modalTabsEl.appendChild(tabBtn)
    }

    currentFilteredItems = activeTab === 'all'
      ? allItems.slice(0, 60)
      : allItems.filter(it => it.tab === activeTab).slice(0, 60)

    if (activeIndex >= currentFilteredItems.length) {
      activeIndex = Math.max(0, currentFilteredItems.length - 1)
    }

    modalListEl.replaceChildren()
    if (currentFilteredItems.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'dtd-search-empty'
      const title = document.createElement('strong')
      title.textContent = isModalSearching ? pCopy.searchingContent : pCopy.noResults
      const hint = document.createElement('span')
      hint.textContent = pCopy.noResultsHint
      empty.append(title, hint)
      modalListEl.appendChild(empty)
      return
    }

    currentFilteredItems.forEach((item, index) => {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'dtd-search-item'
      row.setAttribute('role', 'option')
      if (index === activeIndex) row.setAttribute('data-active', '1')

      const head = document.createElement('div')
      head.className = 'dtd-search-item-head'
      const titleSpan = document.createElement('span')
      titleSpan.className = 'dtd-search-item-title'
      appendHighlightedText(titleSpan, item.title, q)

      const metaBox = document.createElement('span')
      metaBox.className = 'dtd-search-item-meta'
      if (item.meta) {
        const metaBadge = document.createElement('span')
        metaBadge.className = 'dtd-search-item-badge'
        metaBadge.setAttribute('data-muted', '1')
        metaBadge.textContent = item.meta
        metaBox.appendChild(metaBadge)
      }
      const kindBadge = document.createElement('span')
      kindBadge.className = 'dtd-search-item-badge'
      kindBadge.textContent = item.badge
      metaBox.appendChild(kindBadge)

      head.append(titleSpan, metaBox)
      row.appendChild(head)

      if (item.snippet) {
        const snip = document.createElement('p')
        snip.className = 'dtd-search-item-snippet'
        appendHighlightedText(snip, item.snippet, q)
        row.appendChild(snip)
      }

      row.addEventListener('pointerenter', () => {
        activeIndex = index
        const prev = modalListEl?.querySelector?.('[data-active="1"]')
        if (prev && prev !== row) prev.removeAttribute('data-active')
        row.setAttribute('data-active', '1')
      })
      row.addEventListener('click', () => executePaletteItem(item))
      modalListEl!.appendChild(row)
    })

    if (isModalSearching) {
      const status = document.createElement('div')
      status.className = 'dtd-search-empty'
      const span = document.createElement('span')
      span.textContent = pCopy.searchingContent
      status.appendChild(span)
      modalListEl.appendChild(status)
    }
  }

  const triggerModalSearch = (rawQuery: string): void => {
    clearModalRequest()
    modalRemoteHits = []
    isModalSearching = false
    const query = rawQuery.replaceAll('\0', '').trim().slice(0, 500)
    if (query) {
      isModalSearching = true
      const requestId = modalSerial
      const aborter = new AbortController()
      modalPending = aborter
      modalTimer = scheduleTimer(() => {
        modalTimer = undefined
        dispatchContentSearch(query, aborter.signal, res => {
          if (!isModalOpen || isDisposed || modalSerial !== requestId || aborter.signal.aborted) return
          isModalSearching = false
          modalRemoteHits = res.ok ? res.items : []
          renderPalette()
        })
      }, 150)
    }
    renderPalette()
  }

  const openPalette = (seedQuery = '', target?: ScopedCommandTarget): void => {
    if (isDisposed || controller.getSnapshot().mode !== 'delta') return
    if (typeof document.body?.appendChild !== 'function') return
    results.hidden = true
    clearInlineRequest()
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const pCopy = copy.searchPalette

    if (!backdropEl) {
      const backdrop = document.createElement('div')
      backdrop.className = 'dtd-search-backdrop'
      backdrop.addEventListener('pointerdown', (e) => {
        if (e.target === backdrop) closePalette()
      })

      const modal = document.createElement('div')
      modal.className = 'dtd-search-modal'
      modal.setAttribute('role', 'dialog')
      modal.setAttribute('aria-modal', 'true')
      modal.setAttribute('aria-label', copy.ui.searchSessions)
      // Escape belongs to this Delta-owned dialog, never to the page-wide key event.
      modal.addEventListener('keydown', (e: KeyboardEvent) => {
        if (!isModalOpen || e.key !== 'Escape') return
        e.preventDefault?.()
        closePalette()
      })

      const header = document.createElement('div')
      header.className = 'dtd-search-header'
      const icon = createSearchIconSvg()
      const mInput = document.createElement('input')
      mInput.type = 'text'
      mInput.maxLength = 500
      mInput.autocomplete = 'off'
      mInput.className = 'dtd-search-modal-input'
      mInput.placeholder = pCopy.placeholder
      mInput.setAttribute('aria-label', pCopy.placeholder)

      const mClear = document.createElement('button')
      mClear.type = 'button'
      mClear.className = 'dtd-search-clear'
      const clearSvg = createSvgEl('svg', {
        viewBox: '0 0 16 16',
        width: 14,
        height: 14,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.75,
        'stroke-linecap': 'round',
        'aria-hidden': 'true',
      })
      clearSvg.appendChild(createSvgEl('path', { d: 'M4.5 4.5l7 7M11.5 4.5l-7 7' }))
      mClear.appendChild(clearSvg)
      mClear.setAttribute('aria-label', pCopy.clear)
      mClear.hidden = true
      mClear.addEventListener('click', () => {
        mInput.value = ''
        activeIndex = 0
        triggerModalSearch('')
        mInput.focus()
      })

      const escHint = document.createElement('kbd')
      escHint.className = 'dtd-search-kbd'
      escHint.textContent = 'Esc'
      escHint.addEventListener('click', closePalette)

      header.append(icon, mInput, mClear, escHint)

      const tabs = document.createElement('div')
      tabs.className = 'dtd-search-tabs'
      const list = document.createElement('div')
      list.className = 'dtd-search-list'
      list.setAttribute('role', 'listbox')

      const footer = document.createElement('div')
      footer.className = 'dtd-search-footer'
      const hints = document.createElement('div')
      hints.className = 'dtd-search-footer-hints'
      for (const h of [pCopy.footerNav, pCopy.footerOpen, pCopy.footerTab, pCopy.footerEsc]) {
        const s = document.createElement('span')
        s.textContent = h
        hints.appendChild(s)
      }
      footer.appendChild(hints)

      modal.append(header, tabs, list, footer)
      backdrop.appendChild(modal)
      document.body.appendChild(backdrop)

      mInput.addEventListener('input', () => {
        activeIndex = 0
        triggerModalSearch(mInput.value)
      })
      mInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault?.()
          closePalette()
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault?.()
          if (currentFilteredItems.length > 0) {
            activeIndex = (activeIndex + 1) % currentFilteredItems.length
            renderPalette()
            modalListEl?.querySelector?.<HTMLElement>('[data-active="1"]')?.scrollIntoView?.({ block: 'nearest' })
          }
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault?.()
          if (currentFilteredItems.length > 0) {
            activeIndex = (activeIndex - 1 + currentFilteredItems.length) % currentFilteredItems.length
            renderPalette()
            modalListEl?.querySelector?.<HTMLElement>('[data-active="1"]')?.scrollIntoView?.({ block: 'nearest' })
          }
          return
        }
        if (e.key === 'Tab') {
          e.preventDefault?.()
          const order: SearchTabId[] = ['all', 'session', 'workspace', 'plugin', 'skill', 'shortcut', 'action']
          const idx = order.indexOf(activeTab)
          const delta = e.shiftKey ? -1 : 1
          activeTab = order[(idx + delta + order.length) % order.length]
          activeIndex = 0
          renderPalette()
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault?.()
          executePaletteItem(currentFilteredItems[activeIndex])
        }
      })

      backdropEl = backdrop
      modalEl = modal
      modalInputEl = mInput
      modalClearBtn = mClear
      modalTabsEl = tabs
      modalListEl = list
    }

    isModalOpen = true
    const request = ++catalogSerial
    cachedCatalog = undefined
    currentFilteredItems = []
    activeTab = target ? 'skill' : 'all'
    activeIndex = 0
    if (modalInputEl) {
      modalInputEl.value = seedQuery
      modalInputEl.focus?.()
      modalInputEl.select?.()
    }
    triggerModalSearch(seedQuery)
    void buildDynamicCatalog(target).then(cat => {
      if (!isModalOpen || isDisposed || request !== catalogSerial) return
      cachedCatalog = cat
      renderPalette()
    }).catch(() => { /* no stale catalog or guessed commands on failure */ })
  }

  // Public Search Palette access is independent of private composer InputActions.
  // An unavailable public Slot must fall back to Harness native search.
  if (React && searchScope) {
    const react = React
      // Official composer Slot, not a guessed Host sidebar DOM insertion point.
      try {
        searchScope.slots.inject('conversation.input.left', () => searchScope.slots.register({
          name: 'conversation.input.left', id: 'delta.search.palette', order: 65,
          label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions,
        }, () => controller.getSnapshot().mode === 'delta'
          ? react.createElement('button', {
            type: 'button',
            'aria-label': (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions,
            onClick: () => openPalette(''),
          }, (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions)
          : null))
      } catch { /* official Slot missing: preserve native Harness search */ }
  }

  // Register only in the declared session-scoped Host Slot. Older Host builds
  // without the public provider/props simply keep the copy-only sidebar route.
  if (React && searchScope && typeof React.useRef === 'function' && typeof React.useEffect === 'function') {
    const react = React
    try { searchScope.inject(['conversation', 'uiSession'], composerScope => {
      if (isDisposed) return
      const host = composerScope.get?.('conversation') as CommandHost | undefined
      const accessCandidate = composerScope.get?.('uiSession') as CommandAccessHost | undefined
      if (typeof host?.input?.for !== 'function' || typeof host.blocks?.storeFor !== 'function' ||
          typeof accessCandidate?.whenAccess !== 'function') return
      const accessOwner = accessCandidate
      const sameAccessOwner = (): boolean => {
        try { return composerScope.get?.('uiSession') === accessOwner } catch { return false }
      }

      function ScopedCommandEntry(props: CommandSlotProps): unknown {
        const view = react.useSyncExternalStore(controller.subscribe, controller.getSnapshot)
        const input = props.useInput(state => state)
        const allowed = props.useAccess('session/prompt') === true
        const current = react.useRef({ props, allowed })
        current.current = { props, allowed }
        const leaseRef = react.useRef<CommandAccessLease | undefined>(undefined)
        react.useEffect(() => {
          const lease: CommandAccessLease = { sessionId: props.sessionId, allowed: false, revision: 0 }
          leaseRef.current = lease
          let stop: (() => void) | undefined
          // Host's session-specific access subscription revokes immediately,
          // even before a React permission Hook has rendered its new value.
          try {
            stop = accessOwner.whenAccess(lease.sessionId, 'session/prompt', () => {
              lease.allowed = true
              lease.revision += 1
              return () => { lease.allowed = false; lease.revision += 1 }
            })
          } catch { lease.allowed = false }
          return () => {
            lease.allowed = false
            lease.revision += 1
            if (leaseRef.current === lease) leaseRef.current = undefined
            try { stop?.() } catch {}
          }
        }, [props.sessionId])
        if (isDisposed || view.mode !== 'delta' || !allowed ||
            getUniqueMainSessionId() !== props.sessionId || !isEmptyCommandDraft(input)) return null
        const copy = DICTIONARIES[view.language] ?? DICTIONARIES.en
        return react.createElement('button', {
          type: 'button',
          className: 'dtd-context-action',
          title: copy.searchPalette.commandInsertHint,
          onClick: () => {
            const sid = props.sessionId
            const actions = props.inputActions
            const lease = leaseRef.current
            if (!lease?.allowed || lease.sessionId !== sid || !current.current.allowed ||
                current.current.props.sessionId !== sid || current.current.props.inputActions !== actions ||
                !sameAccessOwner()) {
              showDeltaToast(copy.searchPalette.commandInsertFailed)
              return
            }
            const source = readCommandTarget(composerScope, sid)
            if (!source) { showDeltaToast(copy.searchPalette.commandInsertFailed); return }
            const accessRevision = lease.revision
            try {
              const span = actions.captureInsertion()
              if (span.start !== 0 || span.end !== 0 || span.draftRev !== source.input.draftRev) {
                showDeltaToast(copy.searchPalette.commandInsertFailed)
                return
              }
              openPalette('', { sessionId: sid, insert(command) {
                // Recheck the same mounted Slot and live Host generation, block,
                // lock, empty draft and captured revision immediately before edit.
                if (leaseRef.current !== lease || !lease.allowed || lease.revision !== accessRevision ||
                    !current.current.allowed || current.current.props.sessionId !== sid ||
                    current.current.props.inputActions !== actions ||
                    !sameAccessOwner()) return false
                const latest = readCommandTarget(composerScope, sid)
                if (!latest || latest.binding !== source.binding || latest.host !== source.host ||
                    latest.input.draftRev !== span.draftRev) return false
                return actions.insertText(command, span) === true
              } })
            } catch { showDeltaToast(copy.searchPalette.commandInsertFailed) }
          },
        }, copy.searchPalette.commandPickerLabel)
      }

      function ComposerCommandEntry(props: CommandSlotProps): unknown {
        if (typeof props?.sessionId !== 'string' || typeof props.useInput !== 'function' ||
            typeof props.useAccess !== 'function' || typeof props.inputActions?.captureInsertion !== 'function' ||
            typeof props.inputActions?.insertText !== 'function') return null
        return react.createElement(ScopedCommandEntry, props as unknown as Record<string, unknown>)
      }

      try {
        composerScope.slots.inject('conversation.input.left', () => composerScope.slots.register<CommandSlotProps>({
          name: 'conversation.input.left', id: 'delta.search.composer-commands', order: 70,
          label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).searchPalette.commandPickerLabel,
        }, ComposerCommandEntry))
      } catch { /* optional Slot: preserve copy-only search */ }
    }) } catch { /* optional Host services: preserve copy-only search */ }
  }

  // Delta sidebar Enter opens Search Palette; global Ctrl/Cmd+K remains Harness-owned.
  searchField.addEventListener('click', (e) => {
    if (e.target === input || e.target === clearBtn) return
    input.focus?.()
  })
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!isModalOpen && e.key === 'Enter') {
      e.preventDefault?.()
      openPalette(input.value)
    }
  })

  // No Host sidebar DOM selectors, MutationObserver, or shell insertion.
  // Search remains accessible through the verified conversation.input.left Slot.
  const sync = (): void => {
    if (isDisposed) return
    syncSidebarLabels()
    if (controller.getSnapshot().mode !== 'delta') {
      clearInlineRequest()
      closePalette()
    }
  }
  const unsubscribe = controller.subscribe(sync)
  const invalidateSearchProtection = (): void => {
    if (isDisposed) return
    clearInlineRequest()
    clearModalRequest()
    inlineRemoteItems = []
    modalRemoteHits = []
    cachedCatalog = undefined
    catalogSerial += 1
    currentFilteredItems = []
    inlineRenderSerial += 1
    isInlineSearching = false
    isModalSearching = false
    stopRevealTimer?.()
    stopRevealTimer = undefined
    try { renderInline() } catch { results.replaceChildren() }
    try { renderPalette() } catch { modalListEl?.replaceChildren() }
  }
  let previousProtection = deltaFeatures.getSnapshot()
  const unsubscribeProtection = deltaFeatures.subscribe(() => {
    const next = deltaFeatures.getSnapshot()
    const prev = previousProtection
    previousProtection = next
    if (next.isSearchProtectionReady === prev.isSearchProtectionReady &&
        next.lockedSessionIds === prev.lockedSessionIds &&
        next.lockedWorkspaceIds === prev.lockedWorkspaceIds &&
        next.deletedSessionIds === prev.deletedSessionIds &&
        next.movedSessions === prev.movedSessions) return
    invalidateSearchProtection()
  })
  // Membership may change without a new Delta state payload.
  try { searchScope?.inject(['workspaces'], scope => {
    if (isDisposed) return
    const list = scope.workspaces?.list
    if (!list?.subscribe) return
    scope.effect(() => {
      let isListening = true
      const stop = list.subscribe?.(() => {
        if (isListening && deltaFeatures.getSnapshot().lockedWorkspaceIds.length > 0) invalidateSearchProtection()
      })
      if (deltaFeatures.getSnapshot().lockedWorkspaceIds.length > 0) invalidateSearchProtection()
      return () => {
        isListening = false
        stop?.()
        invalidateSearchProtection()
      }
    }, 'delta-suite: search workspace protection observer')
  }) } catch { /* An unavailable workspace snapshot remains excluded by the policy. */ }
  sync()
  return () => {
    if (isDisposed) return
    isDisposed = true
    unsubscribeProtection()
    stopRevealTimer?.()
    closePalette()
    clearInlineRequest()
    unsubscribe()
    shell.remove()
  }
}

window.__ModuleLoader__.load({
  id: DELTA_SUITE_OWNER,
  factory(require) {
    let React: ReactApi
    try {
      React = require('react') as ReactApi
      if (typeof React?.createElement !== 'function' ||
          typeof React?.useState !== 'function' ||
          typeof React?.useSyncExternalStore !== 'function') {
        throw new Error('Host React platform module is incomplete')
      }
    } catch (error) {
      console.error('[delta-suite] React unavailable; native UI remains active:', error)
      return { inject: [], apply() {} }
    }
    const el = React.createElement
    // Optional React portal preserves the Host New Session event handler while
    // placing the native element under the public sidebar navigation.
    let livePortal: ((children: unknown, target: Element) => unknown) | undefined
    try {
      const dom = require('react-dom') as { createPortal?: (children: unknown, target: Element) => unknown }
      if (typeof dom?.createPortal === 'function') livePortal = dom.createPortal
    } catch { /* Host without a React DOM module retains original placement. */ }
    let MenuItemButton: MenuItemButtonApi['MenuItemButton'] | undefined
    let ReactRoot: ReactRootApi | undefined
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives') as MenuItemButtonApi
      const domRoot = require('react-dom/client') as ReactRootApi
      if (typeof primitives?.MenuItemButton === 'function' && typeof domRoot?.createRoot === 'function') {
        MenuItemButton = primitives.MenuItemButton
        ReactRoot = domRoot
      }
    } catch { /* MCP menu dependencies are optional Host modules. */ }
    let mcpServices: McpServices | undefined
    let mcpDialogRoot: ReturnType<ReactRootApi['createRoot']> | undefined
    let mcpDialogHost: HTMLElement | undefined
    function closeMcpManagement(): void {
      const root = mcpDialogRoot
      const host = mcpDialogHost
      mcpDialogRoot = undefined
      mcpDialogHost = undefined
      try { root?.unmount() } catch { /* a removed Host root is already closed */ }
      host?.remove()
    }
    function openMcpManagement(): void {
      if (!ReactRoot || typeof document === 'undefined' || !document.body) return
      closeMcpManagement()
      const host = document.createElement('div')
      host.dataset.dtdMcpRoot = ''
      document.body.appendChild(host)
      mcpDialogHost = host
      mcpDialogRoot = ReactRoot.createRoot(host)
      renderMcpManagement()
    }
    function renderMcpManagement(): void {
      if (mcpDialogRoot) mcpDialogRoot.render(el(McpManagementDialog, {
        services: mcpServices,
        onClose: closeMcpManagement,
      }))
    }
    const EMPTY_MCP_SNAPSHOT: McpConfigSnapshot = Object.freeze({
      status: 'unavailable', value: Object.freeze({ servers: Object.freeze({}) }),
      base: Object.freeze({ servers: Object.freeze({}) }), user: Object.freeze({ servers: Object.freeze({}) }),
      revision: 0, writable: false,
    })
    const emptyMcpDraft = (): McpDraft => ({ name: '', transport: 'stdio', command: '', args: '',
      env: '', cwd: '', url: '', headers: '', enabled: true })
    function asRecord(value: unknown): Record<string, unknown> {
      return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : {}
    }
    function pairLines(source: string): Record<string, string> | undefined {
      const result: Record<string, string> = {}
      for (const line of source.split(/\r?\n/)) {
        if (!line.trim()) continue
        const separator = line.indexOf('=')
        if (separator < 1) return undefined
        const key = line.slice(0, separator).trim()
        if (!key || Object.prototype.hasOwnProperty.call(result, key)) return undefined
        result[key] = line.slice(separator + 1).trim()
      }
      return result
    }
    function pairsText(value: unknown): string {
      const record = asRecord(value)
      return Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, item]) => `${key}=${item}`).join('\n')
    }
    function mcpStatusText(state: string | undefined, copy: DeltaCopy['ui']): string {
      switch (state) {
        case 'connecting': return copy.mcpConnecting
        case 'connected': return copy.mcpConnected
        case 'disabled': return copy.mcpDisabled
        case 'failed': return copy.mcpFailed
        case 'waiting-credentials': return copy.mcpWaitingCredentials
        default: return state || copy.mcpUnknown
      }
    }
    function McpManagementDialog(props: { services?: McpServices; onClose(): void }): unknown {
      const copy = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
      const form = props.services?.form
      const manager = props.services?.manager
      const formSnapshot = React.useSyncExternalStore(
        listener => form?.subscribe(listener) ?? (() => {}),
        () => form?.getSnapshot() ?? EMPTY_MCP_SNAPSHOT,
      )
      const [liveServers, setLiveServers] = React.useState<readonly McpManagedServer[] | undefined>(undefined)
      const [managerError, setManagerError] = React.useState('')
      const [draft, setDraft] = React.useState<McpDraft>(emptyMcpDraft())
      const [editingName, setEditingName] = React.useState<string | undefined>(undefined)
      const [showForm, setShowForm] = React.useState(false)
      const [pending, setPending] = React.useState(false)
      const [busyName, setBusyName] = React.useState<string | undefined>(undefined)
      const [confirmName, setConfirmName] = React.useState<string | undefined>(undefined)
      const [feedback, setFeedback] = React.useState('')
      React.useEffect(() => {
        if (!manager?.watch) return
        const abort = new AbortController()
        let isCurrent = true
        void (async () => {
          try {
            for await (const rows of manager.watch!(abort.signal)) {
              if (!isCurrent || abort.signal.aborted) return
              setLiveServers(rows)
              setManagerError('')
            }
          } catch {
            if (isCurrent && !abort.signal.aborted) setManagerError(copy.mcpOperationFailed)
          }
        })()
        return () => { isCurrent = false; abort.abort() }
      }, [manager])
      React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
          if (event.key === 'Escape' && !pending) props.onClose()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [props.onClose, pending])

      const values = asRecord(formSnapshot.value)
      const configured = asRecord(values.servers)
      const user = asRecord(asRecord(formSnapshot.user).servers)
      const base = asRecord(asRecord(formSnapshot.base).servers)
      const liveByName = new Map((liveServers ?? []).map(server => [server.name, server]))
      const names = new Set([...Object.keys(configured), ...(liveServers ?? []).map(server => server.name)])
      const rows = [...names].sort((a, b) => a.localeCompare(b)).map(name => {
        const live = liveByName.get(name)
        const entry = asRecord(configured[name])
        return { name, entry, live, configured: live?.configured ?? Object.prototype.hasOwnProperty.call(configured, name) }
      })
      const formReady = !!form && formSnapshot.status === 'ready'
      const writable = formReady && formSnapshot.writable === true && !pending

      const beginAdd = (): void => {
        setEditingName(undefined)
        setDraft(emptyMcpDraft())
        setShowForm(true)
        setFeedback('')
      }
      const beginEdit = (name: string): void => {
        const entry = asRecord(configured[name])
        if (!Object.keys(entry).length) return
        const transport = entry.transport === 'streamable-http' ? 'streamable-http' : 'stdio'
        setEditingName(name)
        setShowForm(true)
        setDraft({
          name,
          transport,
          command: typeof entry.command === 'string' ? entry.command : '',
          args: Array.isArray(entry.args) ? entry.args.filter((arg): arg is string => typeof arg === 'string').join('\n') : '',
          env: pairsText(entry.env),
          cwd: typeof entry.cwd === 'string' ? entry.cwd : '',
          url: typeof entry.url === 'string' ? entry.url : '',
          headers: pairsText(entry.headers),
          enabled: entry.enabled !== false,
        })
        setFeedback('')
      }
      const saveDraft = async (): Promise<void> => {
        if (!form || !writable) return
        const name = draft.name.trim()
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) { setFeedback(copy.mcpInvalidName); return }
        if (!editingName && (Object.prototype.hasOwnProperty.call(configured, name) || liveByName.has(name))) {
          setFeedback(copy.mcpDuplicateName); return
        }
        const args = draft.args.split(/\r?\n/).filter(line => line.trim().length > 0)
        let entry: Record<string, unknown> = { ...asRecord(configured[name]), transport: draft.transport, enabled: draft.enabled }
        if (draft.transport === 'stdio') {
          const command = draft.command.trim()
          if (!command) { setFeedback(copy.mcpMissingCommand); return }
          const env = pairLines(draft.env)
          if (!env) { setFeedback(copy.mcpInvalidPairs); return }
          delete entry.url
          delete entry.headers
          entry.command = command
          entry.args = args
          entry.env = env
          if (draft.cwd.trim()) entry.cwd = draft.cwd.trim()
          else delete entry.cwd
        } else {
          const headers = pairLines(draft.headers)
          if (!headers) { setFeedback(copy.mcpInvalidPairs); return }
          let url: URL
          try { url = new URL(draft.url.trim()) } catch { setFeedback(copy.mcpInvalidUrl); return }
          if (url.protocol !== 'http:' && url.protocol !== 'https:') { setFeedback(copy.mcpInvalidUrl); return }
          delete entry.command
          delete entry.args
          delete entry.env
          delete entry.cwd
          entry.url = url.toString()
          entry.headers = headers
        }
        setPending(true)
        setFeedback('')
        try {
          const result = await form.mutate([{ op: 'set', path: ['servers', name], value: entry }], formSnapshot.revision)
          if (result === false) throw new Error('settings write rejected')
          setEditingName(undefined)
          setDraft(emptyMcpDraft())
          setShowForm(false)
          setFeedback(copy.mcpSaveSuccess)
        } catch { setFeedback(copy.mcpSaveFailed) }
        finally { setPending(false) }
      }
      const toggleServer = async (name: string, isEnabled: boolean): Promise<void> => {
        if (!form || !writable) return
        setPending(true)
        setFeedback('')
        try {
          const result = await form.mutate([{ op: 'set', path: ['servers', name, 'enabled'], value: isEnabled }], formSnapshot.revision)
          if (result === false) throw new Error('settings write rejected')
        } catch { setFeedback(copy.mcpSaveFailed) }
        finally { setPending(false) }
      }
      const removeServer = async (name: string): Promise<void> => {
        if (!form || !writable) return
        setPending(true)
        setFeedback('')
        try {
          const result = await form.mutate([{ op: 'unset', path: ['servers', name] }], formSnapshot.revision)
          if (result === false) throw new Error('settings write rejected')
          setConfirmName(undefined)
          setFeedback(copy.mcpRemoveSuccess)
        } catch { setFeedback(copy.mcpRemoveFailed) }
        finally { setPending(false) }
      }
      const managerAction = async (name: string, action: 'probe' | 'restart'): Promise<void> => {
        if (!manager || !manager[action]) return
        setBusyName(name)
        setFeedback('')
        const abort = new AbortController()
        try {
          if (action === 'probe') await manager.probe!(name, abort.signal)
          else await manager.restart!(name)
          setFeedback(action === 'probe' ? copy.mcpProbeComplete : copy.mcpRestartComplete)
        } catch { setFeedback(copy.mcpOperationFailed) }
        finally { setBusyName(undefined) }
      }
      const field = (label: string, value: string, onChange: (value: string) => void,
        options: { multiline?: boolean; hint?: string; required?: boolean; readOnly?: boolean } = {}): unknown => el('label', { className: 'dtd-mcp-field' },
        el('span', null, label, options.required ? ' *' : ''),
        options.multiline
          ? el('textarea', { value, rows: 3, onChange: (event: { currentTarget: { value: string } }) => onChange(event.currentTarget.value) })
          : el('input', { value, required: options.required, readOnly: options.readOnly,
            onChange: (event: { currentTarget: { value: string } }) => onChange(event.currentTarget.value) }),
        options.hint ? el('small', null, options.hint) : null)
      const serverRows = rows.length ? rows.map(row => {
        const isUserOwned = Object.prototype.hasOwnProperty.call(user, row.name)
        const hasBase = Object.prototype.hasOwnProperty.call(base, row.name)
        const canRestore = hasBase && isUserOwned
        const editable = row.configured && Object.prototype.hasOwnProperty.call(configured, row.name)
        const enabled = row.entry.enabled !== false
        const state = row.live?.status?.state ?? (enabled ? undefined : 'disabled')
        return el('article', { className: 'dtd-mcp-server', key: row.name },
          el('div', { className: 'dtd-mcp-server-main' },
            el('div', { className: 'dtd-mcp-server-heading' },
              el('strong', null, row.name),
              el('span', { className: 'dtd-mcp-source' }, row.configured ? copy.mcpConfigured : copy.mcpRegistered)),
            el('div', { className: 'dtd-mcp-server-meta' },
              el('span', null, `${copy.mcpStatus}: ${mcpStatusText(state, copy)}`),
              row.entry.transport ? el('span', null, row.entry.transport === 'stdio' ? copy.mcpStdio : copy.mcpHttp) : null),
            row.live?.status?.reason ? el('small', { title: String(row.live.status.reason) }, String(row.live.status.reason)) : null),
          el('div', { className: 'dtd-mcp-server-actions' },
            editable ? el('button', { type: 'button', className: 'dtd-mcp-button', disabled: pending,
              onClick: () => beginEdit(row.name) }, copy.mcpEditServer) : null,
            editable ? el('button', { type: 'button', className: `dtd-mcp-button${enabled ? ' is-active' : ''}`,
              disabled: pending || !writable, 'aria-pressed': enabled,
              onClick: () => { void toggleServer(row.name, !enabled) } }, enabled ? copy.mcpEnabledState : copy.mcpDisabled) : null,
            manager?.probe ? el('button', { type: 'button', className: 'dtd-mcp-button', disabled: busyName === row.name,
              onClick: () => { void managerAction(row.name, 'probe') } }, busyName === row.name ? copy.mcpWorking : copy.mcpProbe) : null,
            manager?.restart ? el('button', { type: 'button', className: 'dtd-mcp-button', disabled: busyName === row.name,
              onClick: () => { void managerAction(row.name, 'restart') } }, copy.mcpRestart) : null,
            editable && (isUserOwned || canRestore) ? confirmName === row.name
              ? el('span', { className: 'dtd-mcp-confirm' },
                el('button', { type: 'button', className: 'dtd-mcp-button is-danger', disabled: pending,
                  onClick: () => { void removeServer(row.name) } }, copy.mcpConfirmRemove),
                el('button', { type: 'button', className: 'dtd-mcp-button', disabled: pending,
                  onClick: () => setConfirmName(undefined) }, copy.mcpCancelRemove))
              : el('button', { type: 'button', className: 'dtd-mcp-button is-danger', disabled: pending || !writable,
                onClick: () => setConfirmName(row.name) }, canRestore ? copy.mcpRestore : copy.mcpRemove) : null))
      }) : el('p', { className: 'dtd-mcp-empty' }, copy.mcpNoServers)
      const formPane = showForm
        ? el('form', { className: 'dtd-mcp-form', onSubmit: (event: { preventDefault(): void }) => { event.preventDefault(); void saveDraft() } },
          el('section', { className: 'dtd-mcp-form-section' },
            el('h3', null, copy.mcpBasics),
            field(copy.mcpName, draft.name, value => setDraft(state => ({ ...state, name: value })), {
              hint: copy.mcpNameHint, required: true, readOnly: editingName !== undefined,
            })),
          el('section', { className: 'dtd-mcp-form-section' },
            el('h3', null, copy.mcpConnection),
            el('label', { className: 'dtd-mcp-field' }, el('span', null, copy.mcpTransport),
              el('select', { value: draft.transport, onChange: (event: { currentTarget: { value: string } }) =>
                setDraft(state => ({ ...state, transport: event.currentTarget.value === 'streamable-http' ? 'streamable-http' : 'stdio' })) },
              el('option', { value: 'stdio' }, copy.mcpStdio), el('option', { value: 'streamable-http' }, copy.mcpHttp))),
            draft.transport === 'stdio' ? el('div', { className: 'dtd-mcp-transport-fields' },
              field(copy.mcpCommand, draft.command, value => setDraft(state => ({ ...state, command: value })), { required: true }),
              field(copy.mcpArgs, draft.args, value => setDraft(state => ({ ...state, args: value })), { multiline: true, hint: copy.mcpArgsHint }),
              field(copy.mcpCwd, draft.cwd, value => setDraft(state => ({ ...state, cwd: value })))
            ) : field(copy.mcpUrl, draft.url, value => setDraft(state => ({ ...state, url: value })), { required: true })),
          el('section', { className: 'dtd-mcp-form-section' },
            el('h3', null, copy.mcpAuthentication),
            draft.transport === 'stdio'
              ? field(copy.mcpEnv, draft.env, value => setDraft(state => ({ ...state, env: value })), { multiline: true, hint: copy.mcpEnvHint })
              : field(copy.mcpHeaders, draft.headers, value => setDraft(state => ({ ...state, headers: value })), { multiline: true, hint: copy.mcpHeadersHint }),
            el('p', { className: 'dtd-mcp-security' }, copy.mcpSecurityNotice)),
          el('label', { className: 'dtd-mcp-checkbox' }, el('input', { type: 'checkbox', checked: draft.enabled,
            onChange: (event: { currentTarget: { checked: boolean } }) => setDraft(state => ({ ...state, enabled: event.currentTarget.checked })) }),
          el('span', null, copy.mcpEnabled)),
          feedback ? el('p', { className: 'dtd-mcp-feedback', role: 'status' }, feedback) : null,
          el('div', { className: 'dtd-mcp-form-actions' },
            el('button', { type: 'button', className: 'dtd-mcp-button', disabled: pending,
              onClick: () => { setEditingName(undefined); setDraft(emptyMcpDraft()); setShowForm(false); setFeedback('') } }, copy.mcpBackToList),
            el('button', { type: 'submit', className: 'dtd-mcp-button is-primary', disabled: !writable },
              pending ? copy.mcpWorking : copy.mcpSaveServer))) : null

      return el('div', { className: 'dtd-mcp-overlay', role: 'presentation', onMouseDown: (event: { target: unknown; currentTarget: unknown }) => {
        if (event.target === event.currentTarget && !pending) props.onClose()
      } },
        el('section', { className: 'dtd-mcp-dialog', role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'dtd-mcp-title' },
          el('header', { className: 'dtd-mcp-header' },
            el('div', { className: 'dtd-mcp-heading' },
              el('h2', { id: 'dtd-mcp-title' }, showForm ? (editingName ? copy.mcpEditServer : copy.mcpAddTitle) : copy.mcpTitle),
              el('p', null, showForm ? copy.mcpAddDescription : copy.mcpSubtitle)),
            el('div', { className: 'dtd-mcp-header-actions' },
              showForm
                ? el('button', { type: 'button', className: 'dtd-mcp-button', disabled: pending,
                  onClick: () => { setEditingName(undefined); setDraft(emptyMcpDraft()); setShowForm(false); setFeedback('') } }, copy.mcpBackToList)
                : el('button', { type: 'button', className: 'dtd-mcp-button is-primary', disabled: !writable,
                  onClick: beginAdd }, copy.mcpAddServer),
              el('button', { type: 'button', className: 'dtd-mcp-close', 'aria-label': copy.mcpClose,
                disabled: pending, onClick: props.onClose }, '×'))),
          showForm
            ? formReady ? formPane : el('p', { className: 'dtd-mcp-notice', role: 'alert' }, copy.mcpFormUnavailable)
            : el('div', { className: 'dtd-mcp-list-view' },
              !form ? el('p', { className: 'dtd-mcp-notice', role: 'alert' }, copy.mcpFormUnavailable)
                : formSnapshot.status === 'loading' ? el('p', { className: 'dtd-mcp-notice' }, copy.mcpFormPending) : null,
              form && !manager ? el('p', { className: 'dtd-mcp-notice' }, copy.mcpUnavailable) : null,
              managerError ? el('p', { className: 'dtd-mcp-error', role: 'alert' }, managerError) : null,
              formSnapshot.status === 'ready' && formSnapshot.writable === false
                ? el('p', { className: 'dtd-mcp-notice' }, copy.mcpReadOnly) : null,
              el('div', { className: 'dtd-mcp-list', 'aria-live': 'polite' },
                liveServers === undefined && manager?.watch ? el('p', { className: 'dtd-mcp-loading' }, copy.mcpRefreshing) : null,
                serverRows),
              feedback ? el('p', { className: 'dtd-mcp-feedback', role: 'status' }, feedback) : null))
      )
    }
    const ASSISTANT_TAB_ID = DELTA_SUITE_OWNER
    const ASSISTANT_TAB_KIND = 'delta-context-assistant'
    const ASSISTANT_PROTOCOL = 'dtdelta'
    const ASSISTANT_PRESET = 'delta-context'
    const assistantWorkflows = new Map<string, AssistantWorkflow>()
    const discussionAssociations = new Map<string, string>()
    const activeAssistantReleases = new Set<() => void>()
    let assistantServices: AssistantServices | undefined

    function useContentProtectionRevision(): number {
      return React.useSyncExternalStore(deltaFeatures.subscribeContentProtection, deltaFeatures.getContentProtectionRevision)
    }
    function allowsAssistantContent(scope: AssistantServices | undefined, ...ids: string[]): boolean {
      if (!scope || assistantServices !== scope) return false
      try {
        const policy = deltaFeatures.readSearchProtection()
        const rows = scope.sessions.list.getSnapshot().byId
        return !!rows && ids.every(id => !!id && Object.prototype.hasOwnProperty.call(rows, id) &&
          policy.allowsSession(id, rows[id]?.workspaceId))
      } catch { return false }
    }
    function isCurrentAssistantAccess(scope: AssistantServices | undefined, revision: number, ...ids: string[]): boolean {
      return revision === deltaFeatures.getContentProtectionRevision() && allowsAssistantContent(scope, ...ids)
    }
    function hasAssistantAssociation(parsed: Omit<AssistantResource, 'reference' | 'protectionRevision'>): boolean {
      if (parsed.parentSessionId === parsed.assistantSessionId) return false
      if (parsed.purpose === 'discussion') return savedAssistantSession(parsed.parentSessionId) === parsed.assistantSessionId
      const workflow = assistantWorkflows.get(parsed.assistantSessionId)
      return workflow?.purpose === 'optimization' && workflow.parentSessionId === parsed.parentSessionId
    }
    const savedAssistantKey = 'fongap.delta-suite.assistant-sessions.v1'
    function assistantAddress(parentSessionId: string, assistantSessionId: string, purpose: 'discussion' | 'optimization'): string {
      const query = new URLSearchParams({ parent: parentSessionId, purpose })
      return `dsh-resource://${ASSISTANT_PROTOCOL}/session/${encodeURIComponent(assistantSessionId)}?${query}`
    }
    function parseAssistantAddress(address: string): Omit<AssistantResource, 'reference' | 'protectionRevision'> | undefined {
      try {
        const url = new URL(address)
        const parts = url.pathname.split('/').filter(Boolean)
        const parentSessionId = url.searchParams.get('parent')
        const purpose = url.searchParams.get('purpose')
        if (url.protocol !== 'dsh-resource:' || url.hostname !== ASSISTANT_PROTOCOL ||
            parts.length !== 2 || parts[0] !== 'session' || !parentSessionId ||
            (purpose !== 'discussion' && purpose !== 'optimization')) return undefined
        return { parentSessionId, assistantSessionId: decodeURIComponent(parts[1]!), purpose }
      } catch { return undefined }
    }
    function savedAssistantSession(parentSessionId: string): string | undefined {
      const remembered = discussionAssociations.get(parentSessionId)
      if (remembered !== undefined) return remembered
      try {
        const value = JSON.parse(localStorage.getItem(savedAssistantKey) ?? '{}') as Record<string, unknown>
        const saved = value[parentSessionId]
        return typeof saved === 'string' ? saved : undefined
      } catch { return undefined }
    }
    function rememberAssistantSession(parentSessionId: string, sessionId: string): void {
      discussionAssociations.set(parentSessionId, sessionId)
      try {
        const value = JSON.parse(localStorage.getItem(savedAssistantKey) ?? '{}') as Record<string, unknown>
        localStorage.setItem(savedAssistantKey, JSON.stringify({ ...value, [parentSessionId]: sessionId }))
      } catch { /* the current panel remains usable without a saved resume id */ }
    }
    function revokeAssistantAccess(): void {
      assistantWorkflows.clear()
      for (const release of [...activeAssistantReleases]) release()
    }

    // Releasing a Delta reference does not cancel Host-owned running activity.
    // Every retained reference (including a not-yet-ready one) gets one release.
    function retainAssistantAccess(scope: AssistantServices, id: string, signal?: AbortSignal) {
      const reference = scope.sessions.retain(id, { source: 'sidebarChat', ...(signal ? { signal } : {}) })
      let isReleased = false
      let wake: () => void = () => {}
      const ended = new Promise<void>(resolve => { wake = resolve })
      const release = (): void => {
        if (isReleased) return
        isReleased = true
        activeAssistantReleases.delete(release)
        signal?.removeEventListener('abort', release)
        try { reference.release() } catch {} finally { wake() }
      }
      activeAssistantReleases.add(release)
      signal?.addEventListener('abort', release, { once: true })
      if (signal?.aborted) release()
      return {
        reference, release, ended,
        async ready(): Promise<boolean> {
          await Promise.race([reference.ready, ended])
          return !isReleased && reference.sessionId === id && reference.binding.session.sessionId === id
        },
      }
    }

    function registerAssistantSurface(scope: AssistantServices): () => void {
      revokeAssistantAccess()
      discussionAssociations.clear()
      assistantServices = scope
      const stopProtection = deltaFeatures.subscribeContentProtection(revokeAssistantAccess)
      scope.effect(() => scope.resources.register({
        protocol: ASSISTANT_PROTOCOL,
        async *open(address, { signal }) {
          const parsed = parseAssistantAddress(address)
          const revision = deltaFeatures.getContentProtectionRevision()
          if (!parsed || !hasAssistantAssociation(parsed) ||
              !isCurrentAssistantAccess(scope, revision, parsed.parentSessionId, parsed.assistantSessionId)) {
            throw new Error('Delta Assistant: protected or invalid resource')
          }
          if (signal.aborted) return
          const lease = retainAssistantAccess(scope, parsed.assistantSessionId, signal)
          try {
            if (!await lease.ready() || !isCurrentAssistantAccess(scope, revision, parsed.parentSessionId, parsed.assistantSessionId)) return
            yield { ok: true, value: { ...parsed, reference: lease.reference, protectionRevision: revision } }
            await lease.ended
          } finally { lease.release() }
        },
      }), 'delta-suite: independent assistant resources')
      scope.effect(() => scope.sidebarRightTabs.register({
        id: ASSISTANT_TAB_ID,
        kind: ASSISTANT_TAB_KIND,
        patterns: [`dsh-resource://${ASSISTANT_PROTOCOL}/session/**`],
        priority: 'extension',
        canOpen: address => {
          const parsed = parseAssistantAddress(address)
          return !!parsed && hasAssistantAssociation(parsed) &&
            allowsAssistantContent(scope, parsed.parentSessionId, parsed.assistantSessionId)
        },
        title: address => parseAssistantAddress(address)?.purpose === 'optimization'
          ? (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.optimizeDraft
          : (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.discussTask,
      }), 'delta-suite: independent assistant sidebar type')
      scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
        name: 'sidebar.right.pane.tab', key: ASSISTANT_TAB_ID,
        children: { 'delta.assistant.conversation': { kind: 'single', scope: 'session' } },
      }, AssistantTabBody))
      scope.slots.inject('delta.assistant.conversation', () => scope.slots.register({
        name: 'delta.assistant.conversation',
      }, EmbeddedAssistantConversation))
      scope.slots.inject('conversation.input.left', () => scope.slots.register({
        name: 'conversation.input.left', id: 'delta.context.assistant-actions', order: 80,
        label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.discussTask,
      }, AssistantInputControls))
      scope.slots.inject('conversation.chat.assistant-actions', () => scope.slots.register({
        name: 'conversation.chat.assistant-actions', id: 'delta.context.optimizer-apply', order: 90,
        label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.applyOptimization,
      }, OptimizerApplyAction))
      scope.slots.inject('conversation.chat.assistant-actions', () => scope.slots.register({
        name: 'conversation.chat.assistant-actions', id: 'delta.context.compaction-activity', order: 80,
        label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.compacting,
      }, CompactionActivityAction))
      return () => {
        stopProtection()
        if (assistantServices !== scope) return
        assistantServices = undefined
        discussionAssociations.clear()
        revokeAssistantAccess()
      }
    }
    async function openAssistantSession(
      parentSessionId: string,
      purpose: 'discussion' | 'optimization',
      initialPrompt: string,
      workflow?: AssistantWorkflow,
      revision = deltaFeatures.getContentProtectionRevision(),
    ): Promise<string> {
      const services = assistantServices
      if (!services || !isCurrentAssistantAccess(services, revision, parentSessionId)) {
        throw new Error('Delta Assistant: session protected or unavailable')
      }
      let assistantSessionId = purpose === 'discussion' ? savedAssistantSession(parentSessionId) : undefined
      let isCreated = false
      if (assistantSessionId) {
        if (services.sessions.list.getSnapshot().byId?.[assistantSessionId] === undefined) assistantSessionId = undefined
        else if (!isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId)) {
          throw new Error('Delta Assistant: session protected or unavailable')
        }
      }
      if (!assistantSessionId) {
        const parent = services.sessions.list.getSnapshot().byId?.[parentSessionId]
        assistantSessionId = await services.sessions.create({
          agentPreset: ASSISTANT_PRESET,
          ...(parent?.workspaceId ? { workspaceId: parent.workspaceId } : {}),
        })
        isCreated = true
      }
      if (parentSessionId === assistantSessionId ||
          !isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId)) {
        throw new Error('Delta Assistant: session protected or unavailable')
      }
      const lease = retainAssistantAccess(services, assistantSessionId)
      try {
        if (!await lease.ready() || !isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId)) {
          throw new Error('Delta Assistant: session protected or unavailable')
        }
        if (isCreated) {
          const result = await lease.reference.binding.session.prompt([{ type: 'text', text: initialPrompt }], 'queue')
          if (!result.ok) throw new Error(result.error?.message || 'Assistant prompt was rejected')
        }
      } finally { lease.release() }
      if (!isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId)) {
        throw new Error('Delta Assistant: session protected or unavailable')
      }
      if (purpose === 'discussion') rememberAssistantSession(parentSessionId, assistantSessionId)
      if (workflow) assistantWorkflows.set(assistantSessionId, workflow)
      await Promise.resolve(services.sidebarRight.openResource(assistantAddress(parentSessionId, assistantSessionId, purpose)))
      return assistantSessionId
    }
    async function queueMainCorrection(parentSessionId: string, assistantSessionId: string, correction: string, revision: number): Promise<boolean> {
      const services = assistantServices
      if (!services || !correction.trim() || !isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId) ||
          savedAssistantSession(parentSessionId) !== assistantSessionId) return false
      const lease = retainAssistantAccess(services, parentSessionId)
      try {
        if (!await lease.ready() || !isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId)) return false
        const result = await lease.reference.binding.session.prompt([{
          type: 'text', text: `User correction from the Delta side conversation. Treat this as the user's queued instruction for the main task:\n\n${correction.trim()}`,
        }], 'queue')
        return result.ok && isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId)
      } finally { lease.release() }
    }
    function preferenceRow(title: string, description: string, isEnabled: boolean, onChange: (next: boolean) => void): unknown {
      return el('div', { className: 'dtd-preference-row' },
        el('div', { className: 'dtd-preference-copy' }, el('strong', null, title), el('p', null, description)),
        el('button', { type: 'button', role: 'switch', 'aria-label': title, 'aria-checked': isEnabled,
          className: `dtd-switch${isEnabled ? ' dtd-switch-on' : ''}`,
          onClick: () => onChange(!isEnabled) }, isEnabled ? '●' : '○'))
    }
    function FeaturePreferencesSection(): unknown {
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const prefs = useFeaturePreferences(React)
      return el('section', { className: 'dtd-feature-settings', 'aria-label': copy.ui.contextFeatures },
        el('h3', null, copy.ui.contextFeatures), el('p', null, copy.ui.contextFeaturesDescription),
        preferenceRow(copy.ui.showDeepSeekAccountInfo, copy.ui.showDeepSeekAccountInfoDescription,
          prefs.showDeepSeekAccountInfo, value => updateFeaturePreference('showDeepSeekAccountInfo', value)),
        preferenceRow(copy.ui.showModelInfo, copy.ui.showModelInfoDescription,
          prefs.showModelInfo, value => updateFeaturePreference('showModelInfo', value)),
        preferenceRow(copy.ui.inputOptimization, copy.ui.inputOptimizationDescription,
          prefs.inputOptimization, value => updateFeaturePreference('inputOptimization', value)),
        null)
    }
    function ModelLabelExtension(props: AssistantSlotProps & {
      provider?: { id?: string; name?: string }
      model?: { name?: string; reasoning?: {
        efforts?: readonly { id: string; name: string }[]
      } }
      placement?: string
    }): unknown {
      const prefs = useFeaturePreferences(React)
      // The Host's public model catalog owns the effort choices. This
      // non-interactive label only describes what the native selector already
      // advertises; it never probes /v1/models or invents a High/Off toggle.
      const modelName = typeof props.model?.name === 'string' ? props.model.name.trim() : ''
      const accountName = props.provider?.id === 'deepseek-account' && props.placement !== 'option' &&
        typeof props.provider.name === 'string' ? props.provider.name.trim() : ''
      const showModel = prefs.showModelInfo && !!modelName
      const showAccount = prefs.showDeepSeekAccountInfo && !!accountName
      if (!showModel && !showAccount) return null
      const publishedEfforts = props.model?.reasoning?.efforts
      const efforts = Array.isArray(publishedEfforts)
        ? publishedEfforts
          .filter(level => typeof level?.id === 'string' && typeof level?.name === 'string' &&
            level.id.length > 0 && level.name.trim().length > 0)
          .slice(0, 8).map(level => level.name.trim().slice(0, 48))
        : []
      // The public label can also be rendered in narrow Host fixtures without
      // the optional Delta locale provider. No effort metadata needs no copy.
      const title = efforts.length > 0
        ? (typeof DICTIONARIES === 'undefined' ? 'Model reasoning levels'
          : (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.modelReasoningLevels) + ': ' + efforts.join(', ')
        : undefined
      return el('span', { className: 'dtd-model-label', 'data-placement': props.placement || '',
        ...(title ? { title } : {}) },
        showAccount ? el('span', { className: 'dtd-model-account' }, accountName) : null,
        showModel ? el('span', { className: 'dtd-model-name' }, modelName) : null)
    }
    function AssistantInputControls(props: AssistantSlotProps): unknown {
      const revision = useContentProtectionRevision()
      const scope = assistantServices
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const prefs = useFeaturePreferences(React)
      const draft = props.useInput(state => state.draft)
      const session = props.useSession(state => state)
      const chat = props.useChat(state => state)
      const draftRef = React.useRef(draft)
      draftRef.current = draft
      const sessionRef = React.useRef(props.sessionId)
      sessionRef.current = props.sessionId
      const [message, setMessage] = React.useState('')
      const alive = React.useRef(true)
      React.useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
      const canAct = () => alive.current && sessionRef.current === props.sessionId &&
        isCurrentAssistantAccess(scope, revision, props.sessionId)
      if (!canAct()) return null
      const openDiscussion = async (): Promise<void> => {
        if (!canAct()) return
        const context = conversationContext(chat)
        const status = session.running ? 'running' : session.awaitingFirstTurn ? 'waiting for first turn' : 'idle'
        const prompt = `You are an independent discussion assistant for the user's main task. Discuss ideas, clarify requirements, and help plan corrections. This is a separate session: do not claim to have changed or interrupted the main task.\n\nMain task session: ${props.sessionId}\nMain task status: ${status}\n\nRecent loaded conversation context (may be incomplete):\n${context || '(no conversation excerpt available)'}`
        try {
          setMessage(copy.ui.assistantStarting)
          await openAssistantSession(props.sessionId, 'discussion', prompt, undefined, revision)
          if (canAct()) setMessage(copy.ui.assistantReady)
        } catch (error) { setMessage(error instanceof Error ? error.message : copy.ui.assistantUnavailable) }
      }
      const optimize = async (): Promise<void> => {
        if (!canAct()) return
        if (!prefs.inputOptimization) { setMessage(copy.ui.optimizationDisabled); return }
        if (!draft.trim()) return
        const original = draft
        const context = conversationContext(chat, 1800)
        const prompt = `Optimize the user's draft while preserving its exact intent, facts, tone, and constraints. Do not add unsupported facts, requirements, or commitments. Return only the revised text, with no preface or explanation.\n\nMain task context (use only to resolve references; do not add facts):\n${context || '(none)'}\n\n<original-user-input>\n${original}\n</original-user-input>`
        try {
          setMessage(copy.ui.assistantStarting)
          await openAssistantSession(props.sessionId, 'optimization', prompt, {
            purpose: 'optimization', parentSessionId: props.sessionId, originalDraft: original,
            getCurrentDraft: () => canAct() ? draftRef.current : '',
            inputActions: props.inputActions,
          }, revision)
          if (canAct()) setMessage(copy.ui.assistantReady)
        } catch (error) { setMessage(error instanceof Error ? error.message : copy.ui.assistantUnavailable) }
      }
      return el('div', { className: 'dtd-context-controls' },
        el('div', { className: 'dtd-context-actions' },
          el('button', { type: 'button', className: 'dtd-context-action', onClick: () => { void openDiscussion() } }, copy.ui.discussTask),
          prefs.inputOptimization ? el('button', { type: 'button', className: 'dtd-context-action', disabled: !draft.trim(),
            onClick: () => { void optimize() } }, copy.ui.optimizeDraft) : null),
        message ? el('span', { role: 'status', className: 'dtd-context-feedback' }, message) : null)
    }
    function OptimizerApplyAction(props: AssistantSlotProps): unknown {
      const revision = useContentProtectionRevision()
      const scope = assistantServices
      const workflow = assistantWorkflows.get(props.sessionId)
      const chat = props.useChat(state => state)
      const [open, setOpen] = React.useState(false)
      const [edited, setEdited] = React.useState('')
      const [message, setMessage] = React.useState('')
      const canAct = () => !!workflow && assistantWorkflows.get(props.sessionId) === workflow &&
        isCurrentAssistantAccess(scope, revision, props.sessionId, workflow.parentSessionId)
      if (!workflow || workflow.purpose !== 'optimization' || !props.messageId || !canAct()) return null
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const node = chat.nodes?.values().find(value => {
        const data = value?.data as Record<string, any> | undefined
        return data?.finalNode?.messageId === props.messageId || data?.messageId === props.messageId
      })
      const data = node?.data as Record<string, any> | undefined
      const blocks = Array.isArray(data?.blocks) ? data.blocks : []
      const generated = blocks.flatMap((block: any) => block?.kind === 'text' && typeof block.text === 'string' ? [block.text] : []).join('').trim()
      if (!generated) return null
      return el('div', { className: 'dtd-optimizer-action' },
        el('button', { type: 'button', className: 'dtd-context-action', onClick: () => { if (canAct()) { setEdited(generated); setOpen(true); setMessage('') } } }, copy.ui.previewOptimization),
        open ? el('div', { className: 'dtd-optimizer-preview', role: 'dialog', 'aria-label': copy.ui.previewOptimization },
          el('label', null, copy.ui.previewOptimization),
          el('textarea', { value: edited, rows: 7, onChange: (event: { currentTarget: { value: string } }) => setEdited(event.currentTarget.value) }),
          message ? el('p', { role: 'alert' }, message) : null,
          el('div', { className: 'dtd-context-actions' },
            el('button', { type: 'button', onClick: () => {
              if (!canAct()) return
              const current = workflow.getCurrentDraft?.()
              if (!workflow.inputActions || !workflow.getCurrentDraft ||
                  (current !== workflow.originalDraft && current !== workflow.appliedDraft)) {
                setMessage(copy.ui.draftChanged); return
              }
              workflow.inputActions.setDraft(edited)
              workflow.inputActions.persistDraft()
              workflow.appliedDraft = edited
              setMessage(copy.ui.assistantReady)
            } }, copy.ui.applyOptimization),
            el('button', { type: 'button', onClick: () => {
              if (!canAct()) return
              const current = workflow.getCurrentDraft?.()
              if (!workflow.inputActions || !workflow.getCurrentDraft ||
                  (current !== workflow.originalDraft && current !== workflow.appliedDraft)) {
                setMessage(copy.ui.draftChanged); return
              }
              workflow.inputActions.setDraft(workflow.originalDraft || '')
              workflow.inputActions.persistDraft()
              workflow.appliedDraft = undefined
              setMessage(copy.ui.restoreOriginal)
            } }, copy.ui.restoreOriginal),
            el('button', { type: 'button', onClick: () => {
              if (!canAct()) return
              const write = navigator.clipboard?.writeText(edited)
              if (write) void write.then(() => setMessage(copy.ui.copied), () => setMessage(copy.ui.copyFailed))
              else setMessage(copy.ui.copyFailed)
            } }, copy.ui.copyText),
            el('button', { type: 'button', onClick: () => setOpen(false) }, copy.ui.cancel))) : null)
    }
    function CompactionActivityAction(props: AssistantSlotProps): unknown {
      useContentProtectionRevision()
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const chat = props.useChat(state => state)
      const status = props.useProjection<{ seq?: number; phase?: 'idle' | 'running' | 'completed' | 'failed'; failed?: boolean }>(
        'deltaContextCompactionStatus')
      if (!allowsAssistantContent(assistantServices, props.sessionId) ||
          !props.messageId || props.messageId !== latestAssistantMessageId(chat) || !status || (status.seq ?? -1) < 0) return null
      const phase = status.failed ? 'failed' : status.phase ?? 'idle'
      if (phase === 'idle') return null
      const checkpoint = latestCheckpoint(chat)
      const failed = phase === 'failed'
      const label = failed ? copy.ui.automaticCompactionFailed
        : phase === 'running' ? copy.ui.compacting : copy.ui.compactionCompleted
      return el('div', { className: `dtd-compaction-event is-${failed ? 'failed' : phase}`,
        role: failed ? 'alert' : 'status', 'aria-live': 'polite' },
        el('span', { className: 'dtd-compaction-event-icon', 'aria-hidden': true },
          failed ? '!' : phase === 'running' ? el('span', { className: 'dtd-compaction-spinner' }) : '✓'),
        el('span', { className: 'dtd-compaction-event-label' }, label),
        !failed && checkpoint ? el('details', { className: 'dtd-compaction-summary-details' },
          el('summary', null, copy.ui.viewCheckpoint),
          el('pre', { className: 'dtd-compaction-summary' }, checkpoint.summary)) : null)
    }
    function EmbeddedAssistantConversation(props: AssistantSlotProps): unknown {
      useContentProtectionRevision()
      const session = props.useSession(state => state)
      const conversation = props.useConversation?.((value: any) => value)
      if (!allowsAssistantContent(assistantServices, props.sessionId)) return null
      const active = !!conversation && (conversation.activeTargets?.size > 0 || !session.blank || session.running)
      const phase = active ? 'active' : session.promptAttempted ? 'engaging' : 'blank'
      const FixedChatView = (viewProps: { renderSlot(name: string, input: Record<string, unknown>): unknown }): unknown =>
        viewProps.renderSlot('conversation.session', { view: 'chat' })
      return props.renderFactorySlot?.('conversation.content',
        { variant: 'embedded', phase, hero: phase === 'blank' }, { slots: { views: FixedChatView } }) ?? null
    }
    function AssistantTabBody(props: AssistantSlotProps): unknown {
      const revision = useContentProtectionRevision()
      const scope = assistantServices
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const info = props.useTabInfo?.()
      const resource = props.useResource?.<AssistantResource>(info?.tab.contentId || '')
      const mainState = props.useSession(state => state)
      const mainPressure = props.useProjection('contextPressure')
      const breakdown = props.useProjection('contextBreakdown') as Record<string, number> | undefined
      const mainChat = props.useChat(state => state)
      const [correction, setCorrection] = React.useState('')
      const [confirm, setConfirm] = React.useState(false)
      const [feedback, setFeedback] = React.useState('')
      const [correctionOpen, setCorrectionOpen] = React.useState(false)
      const [queuePending, setQueuePending] = React.useState(false)
      const parentId = resource?.value?.parentSessionId
      const assistantId = resource?.value?.assistantSessionId
      const current = React.useRef({ parentId, assistantId, mainSessionId: mainState.sessionId })
      current.current = { parentId, assistantId, mainSessionId: mainState.sessionId }
      const alive = React.useRef(true)
      React.useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
      const canAct = () => !!parentId && !!assistantId && !!resource?.value && alive.current &&
        current.current.parentId === parentId && current.current.assistantId === assistantId &&
        current.current.mainSessionId === parentId && resource.value.protectionRevision === revision &&
        isCurrentAssistantAccess(scope, revision, parentId, assistantId) && hasAssistantAssociation(resource.value)
      React.useEffect(() => {
        setCorrection(''); setConfirm(false); setFeedback(''); setCorrectionOpen(false)
      }, [revision, parentId, assistantId])
      if (!parentId || !assistantId || !canAct()) return null
      const usage = readContextUsage(mainPressure)
      const turns = mainChat.timeline?.turnOrder?.length ?? 0
      const contextExcerpt = conversationContext(mainChat, 3000)
      const mainStatus = mainState.running ? copy.ui.sessionRunning
        : mainState.awaitingFirstTurn ? copy.ui.assistantStarting : copy.ui.sessionIdle
      const checkpoint = latestCheckpoint(mainChat)
      const send = async (): Promise<void> => {
        if (!canAct() || !confirm || !correction.trim() || queuePending) return
        setQueuePending(true)
        try {
          const ok = await queueMainCorrection(parentId, assistantId, correction.trim(), revision)
          if (!canAct()) return
          setFeedback(ok ? copy.ui.correctionQueued : copy.ui.correctionFailed)
          if (ok) { setCorrection(''); setConfirm(false); setCorrectionOpen(false) }
        } catch { if (canAct()) setFeedback(copy.ui.correctionFailed) }
        finally { setQueuePending(false) }
      }
      const conversation = resource?.value
        ? el(props.SessionProvider as any, { session: resource.value.reference },
          el('div', { className: 'dtd-assistant-conversation' }, props.renderSlot?.('delta.assistant.conversation', {}) ?? null)) : null
      return el('section', { className: 'dtd-assistant-panel', 'aria-label': copy.ui.discussTask },
        el('header', { className: 'dtd-assistant-header' },
          el('div', { className: 'dtd-assistant-title-copy' },
            el('strong', null, resource?.value?.purpose === 'optimization' ? copy.ui.optimizeDraft : copy.ui.discussTask),
            el('p', null, copy.ui.assistantContext)),
          el('div', { className: 'dtd-assistant-header-actions' },
            resource?.value?.purpose === 'discussion' ? el('button', { type: 'button', className: 'dtd-assistant-action',
              onClick: () => { if (canAct()) { setCorrectionOpen(true); setConfirm(false); setFeedback('') } } }, copy.ui.queueCorrection) : null,
            assistantServices?.sidebarRight.closeRightbar ? el('button', { type: 'button', className: 'dtd-assistant-close',
              'aria-label': copy.ui.close, title: copy.ui.close,
              onClick: () => assistantServices?.sidebarRight.closeRightbar?.() }, '×') : null)),
        el('details', { className: 'dtd-main-task-status', 'aria-label': copy.ui.mainTaskStatus },
          el('summary', { className: 'dtd-main-task-summary' },
            el('span', { className: `dtd-task-state${mainState.running ? ' is-running' : ''}` }, mainStatus),
            el('span', { className: 'dtd-task-turns' }, `${copy.ui.loadedTurns}: ${turns}`),
            usage ? el('span', { className: 'dtd-task-context' }, `${usage.percent}%`) : null,
            el('span', { className: 'dtd-task-details-label' }, copy.ui.mainTaskStatus)),
          el('div', { className: 'dtd-main-task-details' },
            mainState.lastAgentError ? el('p', { role: 'alert' }, mainState.lastAgentError) : null,
            usage ? el('p', null, `${copy.ui.contextUsage}: ${usage.percent}% (~${usage.used}/${usage.capacity})`) : null,
            breakdown ? el('p', null, `${copy.ui.contextBreakdown}: system ${breakdown.systemTokens ?? 0} · tools ${breakdown.toolsTokens ?? 0} · messages ${breakdown.messageTokens ?? 0}`) : null,
            contextExcerpt ? el('details', { className: 'dtd-checkpoint' },
              el('summary', null, copy.ui.mainContext), el('pre', null, contextExcerpt)) : null,
            checkpoint ? el('details', { className: 'dtd-checkpoint' },
              el('summary', null, copy.ui.checkpoint), el('pre', null, checkpoint.summary)) : null)),
        feedback ? el('p', { className: 'dtd-assistant-feedback', role: 'status' }, feedback) : null,
        conversation,
        correctionOpen ? el('div', { className: 'dtd-correction-overlay', role: 'presentation',
          onMouseDown: (event: { target: unknown; currentTarget: unknown }) => {
            if (event.target === event.currentTarget && !queuePending) setCorrectionOpen(false)
          } },
          el('section', { className: 'dtd-correction-dialog', role: 'dialog', 'aria-modal': true,
            'aria-label': copy.ui.queueCorrection },
            el('header', { className: 'dtd-correction-dialog-header' },
              el('strong', null, copy.ui.queueCorrection),
              el('button', { type: 'button', className: 'dtd-assistant-close', 'aria-label': copy.ui.cancel,
                disabled: queuePending, onClick: () => setCorrectionOpen(false) }, '×')),
            el('p', null, copy.ui.queueOnly),
            el('textarea', { value: correction, rows: 5, placeholder: copy.ui.correctionPlaceholder,
              onChange: (event: { currentTarget: { value: string } }) => { setCorrection(event.currentTarget.value); setConfirm(false); setFeedback('') } }),
            confirm ? el('div', { className: 'dtd-correction-confirm' },
              el('p', null, copy.ui.directionChange), el('pre', null, correction),
              el('button', { type: 'button', disabled: !correction.trim() || queuePending, onClick: () => { void send() } },
                queuePending ? copy.ui.assistantStarting : copy.ui.confirmQueue),
              el('button', { type: 'button', disabled: queuePending, onClick: () => setConfirm(false) }, copy.ui.cancel))
              : el('button', { type: 'button', className: 'dtd-context-action', disabled: !correction.trim(),
                onClick: () => setConfirm(true) }, copy.ui.reviewCorrection),
            feedback && correctionOpen ? el('p', { className: 'dtd-assistant-feedback', role: 'status' }, feedback) : null)) : null)
    }

    function useCopy(controller: DeltaController): { state: DeltaState; copy: DeltaCopy } {
      const state = React.useSyncExternalStore(
        callback => controller.subscribe(callback), () => controller.getSnapshot())
      return { state, copy: DICTIONARIES[state.language] ?? DICTIONARIES.en }
    }
    function SettingsSectionIcon(): unknown {
      return el('svg', { viewBox: '0 0 24 24', width: 17, height: 17,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        el('path', { d: 'M12 21a9 9 0 1 1 8.5-11.9c.5 1.5-.6 3.1-2.2 3.1h-2.1a2 2 0 0 0-2 2c0 .6.2 1.1.6 1.5.5.5.7 1.3.4 2-.5 1.1-1.6 3.3-3.2 3.3Z' }),
        el('circle', { cx: 8.5, cy: 10.5, r: 1, fill: 'currentColor' }),
        el('circle', { cx: 12, cy: 7.5, r: 1, fill: 'currentColor' }),
        el('circle', { cx: 15.5, cy: 10, r: 1, fill: 'currentColor' }),
        el('circle', { cx: 8.5, cy: 15, r: 1, fill: 'currentColor' }))
    }
    function DeltaBrandMark(): unknown {
      return el('span', { 'aria-hidden': true, className: 'dtd-brand-mark' }, 'Δ')
    }
    function DeltaBrandName(): unknown {
      return el('span', { className: 'dtd-brand-name' }, (DICTIONARIES[language()] ?? DICTIONARIES.en).meta.title)
    }
    // Published ui-workspace inline list Slot. No native row children, classes,
    // menus, or layout nodes are queried or changed by this indicator.
    function SessionProtectionIndicator({ sessionId }: { sessionId: string }, controller: DeltaController): unknown {
      useContentProtectionRevision()
      const view = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot)
      if (view.mode !== 'delta' || !sessionId) return null
      const state = deltaFeatures.getSnapshot()
      if (state.deletedSessionIds.includes(sessionId)) return null
      const locked = state.lockedSessionIds.includes(sessionId)
      let isInheritedWorkspaceLocked = false
      try { isInheritedWorkspaceLocked = deltaFeatures.isSessionInLockedWorkspace(sessionId) } catch {}
      if (!locked && !isInheritedWorkspaceLocked) return null
      const copy = DICTIONARIES[view.language] ?? DICTIONARIES.en
      const label = isInheritedWorkspaceLocked && !locked
        ? copy.workspaceMenu.lockedShieldTitle : copy.sessionMenu.lockedShieldTitle
      return el('span', { className: 'dtd-session-protection-mark', role: 'img',
        title: label, 'aria-label': label },
        el('svg', { width: 14, height: 14, viewBox: '0 0 24 24',
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
          strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
          el('rect', { x: 5, y: 10, width: 14, height: 11, rx: 2 }),
          el('path', { d: 'M8 10V7a4 4 0 0 1 8 0v3' })))
    }

    function SessionHoverDetail({ sessionId }: SessionHoverProps, controller: DeltaController): unknown {
      const revision = useContentProtectionRevision()
      const view = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot)
      const hoverSelection = React.useSyncExternalStore<number | null>(
        deltaFeatures.subscribeSessionCatalog,
        () => deltaFeatures.readSessionHoverSelection(sessionId),
      )
      // The published hover Slot is decoration only: no Session binding, raw
      // workspace path or native hover-card layout changes are permitted here.
      if (view.mode !== 'delta' || hoverSelection === null) return null
      const shortId = sessionId.length > 12 ? sessionId.slice(0, 12) + '…' : sessionId
      const copy = DICTIONARIES[view.language] ?? DICTIONARIES.en
      const label = copy.ui.sessionId
      const updatedAt = hoverSelection > 0 ? hoverSelection : undefined
      const updatedText = updatedAt === undefined ? undefined : new Date(updatedAt).toLocaleString(
        view.language === 'zh' ? 'zh-CN' : 'en-US',
        { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
      )
      return el('div', { className: 'dtd-session-meta', role: 'group', 'aria-label': label },
        el('span', { className: 'dtd-session-meta-label' }, label),
        el('span', { className: 'dtd-session-meta-id' }, shortId),
        el('button', {
          type: 'button', className: 'dtd-session-meta-copy',
          'aria-label': copy.ui.copySessionId,
          // Do not trigger the Host row's open/select action when copying.
          onPointerDown: (event?: { stopPropagation?: () => void }) => event?.stopPropagation?.(),
          onClick: (event?: { stopPropagation?: () => void }) => {
            event?.stopPropagation?.()
            const labels = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
            if (controller.getSnapshot().mode !== 'delta' || revision !== deltaFeatures.getContentProtectionRevision() ||
                deltaFeatures.readSessionHoverSelection(sessionId) === null) return
            let request: Promise<void> | undefined
            try { request = typeof navigator !== 'undefined' ? navigator.clipboard?.writeText(sessionId) : undefined }
            catch { /* clipboard security errors are shown as a safe toast */ }
            if (!request) { showDeltaToast(labels.copyFailed); return }
            void request.then(() => showDeltaToast(labels.copied), () => showDeltaToast(labels.copyFailed))
          },
        }, copy.ui.copy),
        updatedText ? el('span', { className: 'dtd-session-meta-updated' },
          copy.ui.sessionLastUpdated + ': ',
          el('time', { dateTime: new Date(updatedAt!).toISOString() }, updatedText)) : null)
    }
    function PersonalizationSection({ controller }: DeltaProps): unknown {
      deltaFeatures.ensureLoaded()
      const { state, copy } = useCopy(controller)
      const fSnap = React.useSyncExternalStore(deltaFeatures.subscribe, deltaFeatures.getSnapshot)
      // These four feature contracts are not verified in the installed Host.
      // Present a truthful native fallback, never a simulated success or
      // a live capability claim inferred from the Host version or DOM.
      const unsupportedNativeFeatures = [
        copy.ui.integrationSidebar,
        copy.ui.integrationCollapse,
        copy.ui.integrationDeletion,
        copy.ui.integrationRunning,
      ]
      return el('section', { className: 'dtd-page', 'data-delta-personalization': '',
        'aria-label': copy.ui.personalization },
        el('div', { className: 'dtd-preference-row' },
          el('div', { className: 'dtd-preference-copy' },
            el('strong', null, copy.ui.appearance),
            el('p', null, copy.ui.appearanceDescription)),
          el('div', { className: 'dtd-segment', role: 'group', 'aria-label': copy.ui.theme },
            (['delta', 'official'] as const).map(mode =>
              el('button', { key: mode, type: 'button', 'aria-pressed': state.mode === mode,
                className: state.mode === mode ? 'dtd-active' : '',
                onClick: () => controller.setMode(mode) },
                mode === 'delta' ? copy.ui.delta : copy.ui.official)))),

        // Host capability report stays visible in both themes and in the
        // installed-bundle Settings entry. An unsupported native operation
        // is never enabled merely because the user switched appearance.
        el('section', { className: 'dtd-integration-status', 'data-delta-integration-status': '',
          'aria-label': copy.ui.integrationTitle },
          el('strong', null, copy.ui.integrationTitle),
          el('p', { className: 'dtd-integration-summary' }, copy.ui.integrationSummary),
          el('ul', { className: 'dtd-integration-list' },
            unsupportedNativeFeatures.map((label, idx) =>
              el('li', { key: idx },
                el('span', null, label),
                el('span', { className: 'dtd-integration-native' }, copy.ui.integrationNative)))),
          el('p', { className: 'dtd-integration-reasoning' }, copy.ui.integrationReasoning),
          el('p', { className: 'dtd-integration-guidance' }, copy.ui.integrationGuidance)),

        el('div', { className: 'dtd-privacy-card', 'data-delta-privacy-card': '' },
          el('div', { className: 'dtd-privacy-header' },
            el('strong', null, copy.privacy.title)),
          el('div', { className: 'dtd-pin-manage-row' },
            el('span', null, `${copy.sessionMenu.pinSettingsTitle}: ${fSnap.hasPin ? copy.sessionMenu.pinSetStatus : copy.sessionMenu.pinUnsetStatus}`),
            fSnap.hasPin ? el('button', {
              type: 'button',
              className: 'dtd-btn-secondary',
              onClick: () => deltaFeatures.openClearPinDialog(),
            }, copy.sessionMenu.clearPin) : null)),
        el('p', { className: 'dtd-current', role: 'status' },
          copy.ui.status + ': ' + (state.mode === 'delta' ? copy.ui.delta : copy.ui.official)),
        state.error ? el('p', { role: 'alert', className: 'dtd-error' }, copy.ui.unavailable) : null,
        el('details', { className: 'dtd-advanced-features' },
          el('summary', null, copy.ui.contextFeatures),
          el(FeaturePreferencesSection, {})))
    }
    return {
      inject: [],
      apply(ctx) {
        try {
          ctx.inject(['slots'], (scope) => {
            try {
              const controller = createController() as DeltaController & {
                syncLanguage(): void
                bindTheme(theme: ThemeApi | undefined): void
                bindLayout(layout: LayoutApi | undefined): void
                bindSidebarRight(sidebarRight: SidebarRightApi | undefined): void
              }
              scope.effect(() => {
                const tag = document.createElement('style')
                tag.dataset.plugin = DELTA_SUITE_OWNER
                tag.textContent = OWNED_CSS
                document.head.appendChild(tag)
                // Official Host LocaleRuntime is the only live language source.
                try {
                  scope.inject(['locale'], localeScope => {
                    const localeApi = localeScope.locale
                    if (!localeApi || typeof localeApi.getSnapshot !== 'function' ||
                        typeof localeApi.subscribe !== 'function') return
                    localeScope.effect(() => {
                      const sync = (): void => {
                        const active = localeApi.getSnapshot()?.active
                        currentHostLocale = typeof active === 'string' ? active : undefined
                        controller.syncLanguage()
                      }
                      const release = localeApi.subscribe(sync)
                      sync()
                      return () => { release(); currentHostLocale = undefined }
                    }, 'delta-suite: public Host Locale subscription')
                  })
                } catch { /* Older Hosts retain initial document/browser language fallback. */ }

                const syncAppearance = (): void => {
                  if (controller.getSnapshot().mode === 'delta') {
                    document.documentElement.setAttribute('data-delta-ui', 'delta')
                    document.body?.setAttribute?.('data-delta-ui', 'delta')
                  } else {
                    document.documentElement.removeAttribute('data-delta-ui')
                    document.body?.removeAttribute?.('data-delta-ui')
                  }
                }
                syncAppearance()
                deltaFeatures.ensureLoaded()
                const stopAppearance = controller.subscribe(syncAppearance)
                // DOM-less Host/test runtimes cannot mount the ZIP's DOM-based
                // presentation, but public feature slots must still register.
                // Legacy DOM-based protection is deliberately not mounted.
                // Host-side business authorization remains authoritative.
                // Native sidebar, session-menu and account chrome remain Host-owned.
                // Only read Harness' published sanitized account UI snapshot.
                // Authentication and confirmation continue through native menu actions.
                try {
                  scope.inject(['accountUi'], accountScope => {
                    const service = (accountScope as unknown as {
                      accountUi?: { getSnapshot(): {
                        view?: { status?: string }
                        details?: { balance?: { status: string; value?: readonly { currency: string; balance: string }[] } }
                      } }
                    }).accountUi
                    if (!service || typeof service.getSnapshot !== 'function') return
                    accountScope.effect(() => {
                      const reader = () => service.getSnapshot()
                      readLiveAccountState = reader
                      return () => { if (readLiveAccountState === reader) readLiveAccountState = undefined }
                    }, 'delta-suite: authenticated account balance projection')
                  })
                } catch { /* no native account UI service keeps balances unavailable */ }
                // Harness owns native image input and model capabilities.

                // Harness owns built-in Slots and Locale services.
                // Delta contributes only through declared public slots and its own copy.
                // Do not suppress Host slot entries or modify Host translation methods.
                // Unsupported native UI adjustments remain under Harness ownership.

                return () => {
                  stopAppearance()
                  clearDeltaToasts()
                  document.documentElement.removeAttribute('data-delta-ui')
                  document.body?.removeAttribute('data-delta-ui')
                  tag.parentNode?.removeChild(tag)
                  controller.dispose()
                }
              }, 'delta-suite: personalization resource ownership')

              const settingsModules: ReadonlyArray<{
                id: string
                order: number
                content: (props: DeltaProps) => unknown
                icon: (props: DeltaProps) => unknown
              }> = [
                {
                  id: 'delta.personalization',
                  order: 18,
                  content: PersonalizationSection,
                  icon: SettingsSectionIcon,
                },
              ]
              for (const feature of settingsModules) {
                // Keep the public Settings section visible under an explicit
                // Suite name in both Delta and Official theme modes.
                scope.slots.inject('settings.section', () => scope.slots.register({
                  name: 'settings.section',
                  id: feature.id,
                  order: feature.order,
                  label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).meta.title,
                  inject: () => ({ controller }),
                }, feature.content))
                scope.slots.inject('settings.section.icon', () => scope.slots.register({
                  name: 'settings.section.icon',
                  id: feature.id,
                  order: feature.order,
                }, feature.icon))
                // Also expose the same form through the public Plugins tab,
                // without modifying any native Settings DOM or controls.
                scope.slots.inject('settings.plugins.tab', () => scope.slots.register({
                  name: 'settings.plugins.tab',
                  id: 'delta.suite.configuration',
                  order: 70,
                  label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).meta.title,
                  inject: () => ({ controller }),
                }, feature.content))
              }

              // Harness' Installed plugins bundle detail is a separate public,
              // keyed seat from Settings. Show the same live Suite configuration
              // in the installed bundle rather than relying on Settings navigation.
              // The key must be the npm package name, not the Cordis row ID.
              scope.slots.inject('plugins.bundle.config', () => scope.slots.register({
                name: 'plugins.bundle.config',
                key: '@fongap-labs/delta-suite',
              }, ({ view }: { view?: 'page' | 'summary' }) => view === 'summary'
                ? null : el(PersonalizationSection, { controller })))

              // The input model label is a public, independent preference surface.
              // Do not gate it on optional sessions, resources or sidebarRight
              // services: the native model picker must still work without them.
              scope.slots.inject('conversation.input.model.label', () => scope.slots.register({
                name: 'conversation.input.model.label',
                id: 'delta.model.route-label',
              }, ModelLabelExtension))

              // ZIP-first: never replace the ZIP sidebar/search/theme. These
              // additional modules only register their own public Host slots.
              scope.effect(() => {
                if (typeof document === 'undefined' || !document.head) return
                const style = document.createElement('style')
                style.dataset.deltaFeatureOnly = ''
                style.textContent = FEATURE_ONLY_CSS
                document.head.appendChild(style)
                return () => { style.parentNode?.removeChild?.(style); closeMcpManagement() }
              }, 'delta-suite: optional feature styles and MCP cleanup')

              try { scope.inject(['configForms', 'remote'], mcpScope => {
                const candidate = mcpScope as ClientContext
                mcpScope.effect(() => {
                  const services: McpServices = {
                    form: candidate.configForms?.get('mcp-manager') ?? candidate.configForms?.get('mcp'),
                    manager: candidate.remote?.mcpManager,
                  }
                  mcpServices = services
                  renderMcpManagement()
                  return () => {
                    if (mcpServices === services) { mcpServices = undefined; renderMcpManagement() }
                  }
                }, 'delta-suite: MCP manager integration')
              }) } catch { /* unavailable official settings services remain optional */ }

              if (MenuItemButton && ReactRoot) {
                scope.slots.inject('plugins.add.actions', () => scope.slots.register<AddPluginActionProps>({
                  name: 'plugins.add.actions', id: 'delta.mcp.add-server', order: -100,
                }, props => el(MenuItemButton!, {
                  onSelect: () => { props.onDismiss?.(); openMcpManagement() },
                }, (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.mcpAddAction)))
              }
              try { scope.inject(['sessions', 'resources', 'sidebarRightTabs', 'sidebarRight'], assistantScope => {
                const capabilities = assistantScope as ClientContext & AssistantServices
                if (!capabilities.sessions || !capabilities.resources ||
                    !capabilities.sidebarRightTabs || !capabilities.sidebarRight) return
                assistantScope.effect(() => registerAssistantSurface(capabilities),
                  'delta-suite: context assistant and compaction activity')
              }) } catch { /* optional context services do not block the ZIP UI */ }

              const registerBrand = (
                name: 'sidebar.brand.mark' | 'sidebar.brand.name',
                id: string,
                component: (props: DeltaProps) => unknown,
              ): void => {
                scope.slots.inject(name, () => {
                  let release: (() => void) | undefined
                  const sync = (): void => {
                    const shouldShow = controller.getSnapshot().mode === 'delta'
                    if (shouldShow && !release) {
                      try {
                        const result = scope.slots.register({ name, id, order: -100, ...({ priority: -100 } as any) }, component)
                        release = typeof result === 'function' ? (result as () => void) : () => {}
                      } catch (error) {
                        console.warn('[delta-suite] Brand slot registration skipped:', error)
                      }
                    } else if (!shouldShow && release) {
                      release?.()
                      release = undefined
                    }
                  }
                  sync()
                  const unsubscribe = controller.subscribe(sync)
                  return () => {
                    unsubscribe()
                    release?.()
                    release = undefined
                  }
                })
              }
              registerBrand('sidebar.brand.mark', 'delta.brand.mark', DeltaBrandMark)
              registerBrand('sidebar.brand.name', 'delta.brand.name', DeltaBrandName)


              // The published inline trailing Slot renders status without owning
              // native Session rows. If an older Host lacks it, retain native UI.
              scope.slots.inject('sidebar.session.row.trailing', () => scope.slots.register<{ sessionId: string }>({
                name: 'sidebar.session.row.trailing',
                id: 'delta.session.protection',
                order: 450,
              }, props => SessionProtectionIndicator(props, controller)))

              scope.slots.inject('sidebar.session.row.hover', () => scope.slots.register<SessionHoverProps>({
                name: 'sidebar.session.row.hover',
                id: 'delta.session.identity',
                order: 500,
              }, props => SessionHoverDetail(props, controller)))

              // Guard Host workspace mutations, register session move/lock/delete menus, and project durable session changes.
              scope.inject(['workspaces'], workspaceScope => {
                const workspaces = workspaceScope.workspaces
                if (!workspaces) return

                // Native WorkspaceBrowser and third-party subscribers keep Host ownership.
                const nativeSnapshot = workspaces.list.getSnapshot
                const readNative = () => nativeSnapshot.call(workspaces.list)
                deltaFeatures.setWorkspacesApi(workspaces, readNative)
                workspaceScope.effect(() => () => deltaFeatures.setWorkspacesApi(undefined),
                  'delta-suite: workspaces reference')

                // Host owns native Workspace mutation permissions and UI.
              })

              scope.inject(['sessions', 'uiWorkspace'], searchScope => {
                if (!searchScope.sessions || !searchScope.uiWorkspace) return
                const sessionsApi = searchScope.sessions
                const navApi = searchScope.uiWorkspace

                // Native navigation stays intact. Observe confirmed mainView retention
                // rather than recording the target of a possibly rejected navigation.
                // Host Session catalogs are authoritative; Delta filters its own UI only.
                deltaFeatures.setSessionsApi(sessionsApi)
                deltaFeatures.setNavigationApi(navApi)
                searchScope.effect(() => observeConfirmedMainSession(
                  sessionsApi.list, id => deltaFeatures.setActiveSessionId(id),
                ), 'delta-suite: confirmed mainView session observer')

                // Register Move, PIN Lock, Delete actions natively in DSH contextMenus when supported
                const contextMenus = searchScope.get?.('contextMenus') as {
                  register?: (spec: {
                    id: string
                    target: 'session' | 'workspace'
                    order: number
                    observe?: (t: any) => unknown[]
                    resolve: (t: any) => unknown[]
                  }) => () => void
                } | undefined
                if (contextMenus && typeof contextMenus.register === 'function') {
                  try {
                    const iconMov = () => el('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
                      el('path', { d: 'M15 3h6v6' }),
                      el('path', { d: 'M10 14 21 3' }),
                      el('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }))
                    const iconLock = (isUnlocked: boolean) => el('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
                      el('rect', { x: 4, y: 11, width: 16, height: 10, rx: 2, ry: 2 }),
                      el('path', { d: isUnlocked ? 'M7 11V7a5 5 0 0 1 9.9-1' : 'M7 11V7a5 5 0 0 1 10 0v4' }))
                    const iconTrash = () => el('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
                      el('path', { d: 'M3 6h18' }),
                      el('path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }),
                      el('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }))

                    const iconStops = [
                      scope.slots.register({ name: 'contextMenu.icon', id: 'delta.icon.move', key: 'delta.session.move' }, iconMov),
                      scope.slots.register({ name: 'contextMenu.icon', id: 'delta.icon.lock', key: 'delta.session.lock' }, () => iconLock(false)),
                      scope.slots.register({ name: 'contextMenu.icon', id: 'delta.icon.unlock', key: 'delta.session.unlock' }, () => iconLock(true)),
                      scope.slots.register({ name: 'contextMenu.icon', id: 'delta.icon.delete', key: 'delta.session.delete' }, iconTrash),
                    ]
                    const menuStops = [
                      contextMenus.register({
                        id: 'session.delta.move',
                        target: 'session',
                        order: 400,
                        resolve: (t) => [{
                          id: 'delta-move',
                          label: (DICTIONARIES[language()] ?? DICTIONARIES.en).sessionMenu.moveSession,
                          icon: { key: 'delta.session.move' },
                          run: () => deltaFeatures.openMoveDialog(t.sessionId, t.displayTitle),
                        }],
                      }),
                      contextMenus.register({
                        id: 'session.delta.lock',
                        target: 'session',
                        order: 580,
                        resolve: (t) => {
                          const locked = deltaFeatures.isLocked(t.sessionId)
                          const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
                          return [{
                            id: 'delta-lock',
                            label: locked ? copy.sessionMenu.unlockSession : copy.sessionMenu.lockSession,
                            icon: { key: locked ? 'delta.session.unlock' : 'delta.session.lock' },
                            afterContent: true,
                            run: () => {
                              if (locked) {
                                deltaFeatures.openUnlockPinDialog(t.sessionId)
                              } else if (deltaFeatures.getSnapshot().hasPin) {
                                void deltaFeatures.lockSession(t.sessionId).then(res => {
                                  if (res.ok) showDeltaToast(copy.sessionMenu.lockedToast)
                                })
                              } else {
                                deltaFeatures.openSetPinDialog(t.sessionId, t.displayTitle)
                              }
                            },
                          }]
                        },
                      }),
                      contextMenus.register({
                        id: 'session.delta.delete',
                        target: 'session',
                        order: 650,
                        resolve: (t) => [{
                          id: 'delta-delete',
                          label: (DICTIONARIES[language()] ?? DICTIONARIES.en).sessionMenu.deleteSession,
                          icon: { key: 'delta.session.delete' },
                          danger: true,
                          separatorBefore: true,
                          afterContent: true,
                          run: () => deltaFeatures.openDeleteDialog(t.sessionId, t.displayTitle),
                        }],
                      }),
                      contextMenus.register({
                        id: 'workspace.delta.lock',
                        target: 'workspace',
                        order: 250,
                        resolve: (t: any) => {
                          const wsId = t?.workspaceId ?? t?.id ?? ''
                          const wsPath = t?.path ?? ''
                          const locked = deltaFeatures.isWorkspaceLocked(wsId || wsPath)
                          const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
                          return [{
                            id: 'delta-workspace-lock',
                            label: locked ? copy.workspaceMenu.unlockWorkspace : copy.workspaceMenu.lockWorkspace,
                            icon: { key: locked ? 'delta.session.unlock' : 'delta.session.lock' },
                            run: () => {
                              if (locked) {
                                deltaFeatures.openUnlockWorkspaceDialog(wsId || wsPath)
                              } else if (deltaFeatures.getSnapshot().hasPin) {
                                void deltaFeatures.lockWorkspace(wsId || wsPath).then(res => {
                                  if (res.ok) showDeltaToast(copy.workspaceMenu.lockedToast)
                                })
                              } else {
                                deltaFeatures.openSetPinWorkspaceDialog(wsId || wsPath, t?.displayTitle ?? t?.title)
                              }
                            },
                          }]
                        },
                      }),
                    ]
                    searchScope.effect(() => () => {
                      for (const s of menuStops) { try { s?.() } catch {} }
                      for (const s of iconStops) { try { if (typeof s === 'function') (s as () => void)() } catch {} }
                    }, 'delta-suite: session move/lock/delete menus')
                  } catch {}
                }

                searchScope.effect(() => {
                  const stopSearch = installHostSearch(controller, sessionsApi, navApi, searchScope, React)
                  return () => {
                    stopSearch()
                    deltaFeatures.setSessionsApi(undefined)
                    deltaFeatures.setNavigationApi(undefined)
                  }
                }, 'delta-suite: public-slot service-backed search palette')
              })

              scope.inject(['theme'], themeScope => {
                controller.bindTheme(themeScope.theme)
                themeScope.effect(() => () => controller.bindTheme(undefined),
                  'delta-suite: theme service lifetime')
              })
              scope.inject(['layout'], layoutScope => {
                controller.bindLayout(layoutScope.layout)
                layoutScope.effect(() => () => controller.bindLayout(undefined),
                  'delta-suite: layout service lifetime')
              })
              try {
                scope.inject(['sidebarRight'], rightScope => {
                  controller.bindSidebarRight(rightScope.sidebarRight)
                  rightScope.effect(() => () => controller.bindSidebarRight(undefined),
                    'delta-suite: right sidebar service lifetime')
                })
              } catch { /* sidebarRight service is optional */ }
            } catch (error) {
              console.error('[delta-suite] Settings mount failed; native UI preserved:', error)
            }
          })
        } catch (error) {
          console.error('[delta-suite] deferred Settings registration failed; native UI preserved:', error)
        }
      },
    }
  },
})
