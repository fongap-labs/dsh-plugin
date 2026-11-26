/** Native, beginner-oriented Delta Suite settings. No DOM patching or secret persistence. */
;(() => {
interface ReactApi {
  createElement(type: string | ((props: any) => unknown), props?: Record<string, unknown> | null, ...children: unknown[]): unknown
  useState<T>(init: T | (() => T)): [T, (value: T | ((old: T) => T)) => void]
  useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void
}
type Op = { op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] }
type Kind = 'duckai' | 'chatgpt' | 'custom-api'
type ProviderDraft = {
  uiKey: string
  id: string
  kind: Kind
  enabled: boolean
  endpoint: string
  authMode: 'none' | 'bearer' | 'host-secret'
  credentialRef: string
  headerName: string
}
type Draft = {
  enabled: boolean
  modules: { duckai: boolean; chatgpt: boolean; customApi: boolean; vision: boolean; modelDiscovery: boolean; capabilityProbe: boolean; apiService: boolean; behaviorEnhancement: boolean }
  providers: ProviderDraft[]
  refreshOnStart: boolean
  refreshIntervalMs: string
  apiEnabled: boolean
  pathPrefix: string
  allowFallback: boolean
  primaryProvider: string
  fallbackProvider: string
  behaviorEnabled: boolean
  instructionMode: 'prepend' | 'append'
  systemPrompt: string
}
interface ConfigState { status: string; value?: any; revision?: number; writable: boolean }
interface CredentialInfo { configured: boolean; writable: boolean }
interface CredentialsRemote {
  describe?(refs: string[]): Promise<Record<string, CredentialInfo>>
  set?(ref: string, value: string): Promise<void>
  unset?(ref: string): Promise<void>
}
interface ConfigPageProps {
  view: 'page' | 'summary'
  form?: { state: ConfigState; mutate(ops: Op[], revision?: number): Promise<boolean> }
  credentials?: CredentialsRemote
}

const NAME = '@fongap-labs/delta-suite'
const ID = /^[a-z0-9][a-z0-9_-]{1,40}$/i
const REF = /^[A-Za-z0-9_.:-]{2,100}$/
const inset: Record<string, string> = { display: 'grid', gap: '10px', margin: '12px 0' }
const inputStyle: Record<string, string> = {
  boxSizing: 'border-box', width: '100%', minWidth: '0', padding: '9px 11px',
  border: '1px solid var(--dsw-alias-border-l3, #aaa)', borderRadius: '9px',
  background: 'var(--dsw-alias-bg-layer-1, transparent)',
  color: 'var(--dsw-alias-label-primary, inherit)', font: 'inherit',
}
const actionStyle: Record<string, string> = {
  padding: '8px 12px', cursor: 'pointer', borderRadius: '9px',
  border: '1px solid var(--dsw-alias-border-l2, #aaa)', color: 'inherit',
  background: 'var(--dsw-alias-bg-layer-2, transparent)',
}
let nextProvider = 0

function providerKind(value: unknown): Kind {
  return value === 'duckai' || value === 'chatgpt' ? value : 'custom-api'
}
function defaultRef(id: string): string {
  const safe = id.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'PROVIDER'
  return 'DSH_DELTA_SUITE_' + safe + '_KEY'
}
function readDraft(value: any): Draft {
  const modules = value?.modules ?? {}
  const discovery = value?.discovery ?? {}
  const api = value?.api ?? {}
  const vision = value?.vision ?? {}
  const behavior = value?.behavior ?? {}
  return {
    enabled: value?.enabled !== false,
    modules: {
      duckai: modules.duckai !== false, chatgpt: modules.chatgpt !== false,
      customApi: modules.customApi !== false, vision: modules.vision !== false,
      modelDiscovery: modules.modelDiscovery !== false, capabilityProbe: modules.capabilityProbe === true,
      apiService: modules.apiService !== false,
      behaviorEnhancement: modules.behaviorEnhancement !== false,
    },
    providers: (Array.isArray(value?.providers) ? value.providers : []).map((item: any, index: number) => ({
      uiKey: 'saved-' + index, id: item.id ?? '', kind: providerKind(item.kind), enabled: item.enabled !== false,
      endpoint: item.endpoint ?? '', authMode: item.auth?.mode === 'none' || item.auth?.mode === 'bearer' ? item.auth.mode : 'host-secret',
      credentialRef: item.auth?.credentialRef ?? '', headerName: item.auth?.headerName ?? '',
    })),
    refreshOnStart: discovery.refreshOnStart !== false,
    refreshIntervalMs: String(discovery.refreshIntervalMs ?? 900000),
    apiEnabled: api.enabled !== false,
    pathPrefix: api.pathPrefix ?? '/delta-suite/v1',
    allowFallback: vision.allowFallback === true,
    primaryProvider: vision.primaryProvider ?? '',
    fallbackProvider: vision.fallbackProvider ?? '',
    behaviorEnabled: behavior.enabled !== false,
    instructionMode: behavior.instructionMode === 'append' ? 'append' : 'prepend',
    systemPrompt: behavior.systemPrompt ?? '',
  }
}
function providerLabel(kind: Kind, isZh: boolean): string {
  if (kind === 'duckai') return 'Duck.ai'
  if (kind === 'chatgpt') {
    return isZh
      ? 'ChatGPT 订阅适配端点'
      : 'ChatGPT subscription adapter endpoint'
  }
  return isZh
    ? '自定义 OpenAI-compatible API'
    : 'Custom OpenAI-compatible API'
}
function serializeProviders(providers: ProviderDraft[]): Record<string, unknown>[] {
  return providers.map(provider => ({
    id: provider.id.trim(), kind: provider.kind, enabled: provider.enabled, endpoint: provider.endpoint.trim(),
    auth: {
      mode: provider.authMode,
      ...(provider.credentialRef.trim() ? { credentialRef: provider.credentialRef.trim() } : {}),
      ...(provider.headerName.trim() ? { headerName: provider.headerName.trim() } : {}),
    },
  }))
}
const INVALID_PROVIDER_ID_MESSAGE = '服务商 ID 只能使用字母、数字、下划线或短横线，且至少 2 个字符。'
function validation(draft: Draft): string | undefined {
  if (!draft.pathPrefix.trim().startsWith('/')) return 'API 路径必须以 / 开头。 / API path must start with /. '
  const ids = new Set<string>()
  for (const provider of draft.providers) {
    const id = provider.id.trim()
    if (!ID.test(id)) return INVALID_PROVIDER_ID_MESSAGE
    if (ids.has(id.toLowerCase())) return '服务商 ID 不能重复。 / Provider IDs must be unique.'
    ids.add(id.toLowerCase())
    if (provider.enabled && !/^https?:\/\//i.test(provider.endpoint.trim())) {
      return `${id}：启用的服务商需要填写 http 或 https 地址。`
    }
    if (provider.authMode !== 'none' && !REF.test(provider.credentialRef.trim())) {
      return `${id}：请填写凭据引用，或选择“无需认证”。`
    }
  }
  const interval = Number(draft.refreshIntervalMs)
  if (!Number.isFinite(interval) || interval < 30000 || interval > 86400000) {
    return '模型刷新间隔需在 30 秒到 24 小时之间。'
  }
  return undefined
}
function credentialValidation(
  draft: Draft,
  inputs: Record<string, string>,
  states: Record<string, CredentialInfo>,
  credentials: CredentialsRemote | undefined,
): string | undefined {
  for (const provider of draft.providers) {
    if (!provider.enabled || provider.authMode === 'none') continue
    const ref = provider.credentialRef.trim()
    if (!ref) continue
    const entered = inputs[provider.uiKey]?.trim()
    if (!entered && credentials?.describe && states[ref]?.configured !== true) {
      return `${provider.id}：请输入 API Key；如果服务商无需密钥，请选择“无需认证”。`
    }
    if (entered && !credentials?.set) return '当前 Host 没有提供安全凭据服务，无法保存 API Key。'
  }
  return undefined
}
function operations(draft: Draft, value: any): Op[] {
  const original = readDraft(value)
  const ops: Op[] = []
  const set = (path: string[], val: unknown) => ops.push({ op: 'set', path, value: val })
  if (draft.enabled !== original.enabled) set(['enabled'], draft.enabled)
  if (JSON.stringify(draft.modules) !== JSON.stringify(original.modules)) set(['modules'], draft.modules)
  if (JSON.stringify(serializeProviders(draft.providers)) !== JSON.stringify(serializeProviders(original.providers))) {
    set(['providers'], serializeProviders(draft.providers))
  }
  if (draft.refreshOnStart !== original.refreshOnStart || draft.refreshIntervalMs !== original.refreshIntervalMs) {
    set(['discovery'], { refreshOnStart: draft.refreshOnStart, refreshIntervalMs: Number(draft.refreshIntervalMs) })
  }
  if (draft.apiEnabled !== original.apiEnabled || draft.pathPrefix !== original.pathPrefix) {
    set(['api'], { enabled: draft.apiEnabled, pathPrefix: draft.pathPrefix.trim(), exposeExternally: false })
  }
  if (draft.allowFallback !== original.allowFallback || draft.primaryProvider !== original.primaryProvider || draft.fallbackProvider !== original.fallbackProvider) {
    set(['vision'], {
      allowFallback: draft.allowFallback,
      ...(draft.primaryProvider ? { primaryProvider: draft.primaryProvider } : {}),
      ...(draft.fallbackProvider ? { fallbackProvider: draft.fallbackProvider } : {}),
    })
  }
  if (draft.behaviorEnabled !== original.behaviorEnabled
    || draft.instructionMode !== original.instructionMode
    || draft.systemPrompt !== original.systemPrompt) {
    set(['behavior'], {
      enabled: draft.behaviorEnabled,
      instructionMode: draft.instructionMode,
      ...(draft.systemPrompt.trim() ? { systemPrompt: draft.systemPrompt.trim() } : {}),
    })
  }
  return ops
}

function installClient(require: (id: string) => unknown) {
  const React = require('react') as ReactApi
  const h = React.createElement
  const isZh = () => /^zh/i.test(document.documentElement.lang || navigator.language || 'zh')
  const t = (zh: string, en: string) => isZh() ? zh : en
  const hint = (text: string) => h('p', { style: { fontSize: '12px', opacity: 0.75, lineHeight: 1.5, margin: '6px 0 10px' } }, text)
  const section = (title: string, ...children: unknown[]) => h('section', {
    style: { margin: '22px 0', borderTop: '1px solid var(--dsw-alias-border-l2, #ddd)', paddingTop: '15px' },
  }, h('h3', { style: { fontSize: '15px', margin: '0 0 10px' } }, title), ...children)

  function Page(props: ConfigPageProps) {
    const state = props.form?.state
    const [draft, setDraft] = React.useState<Draft>(() => readDraft(state?.value))
    const [saving, setSaving] = React.useState(false)
    const [notice, setNotice] = React.useState('')
    const [credentialInputs, setCredentialInputs] = React.useState<Record<string, string>>({})
    const [credentialStates, setCredentialStates] = React.useState<Record<string, CredentialInfo>>({})
    const [testing, setTesting] = React.useState(false)
    const refsKey = draft.providers.map(provider => provider.credentialRef).filter(Boolean).join('|')
    React.useEffect(() => {
      setDraft(previous => {
        const refreshed = readDraft(state?.value)
        for (const provider of refreshed.providers) {
          const before = previous.providers.find(item => item.id === provider.id)
          if (before) provider.uiKey = before.uiKey
        }
        return refreshed
      })
      setNotice('')
    }, [state?.revision])
    React.useEffect(() => {
      let isActive = true
      const refs = [...new Set(draft.providers.map(provider => provider.credentialRef).filter(ref => REF.test(ref)))]
      if (!refs.length || !props.credentials?.describe) { setCredentialStates({}); return () => { isActive = false } }
      void props.credentials.describe(refs).then(result => {
        if (isActive) setCredentialStates(result)
      }).catch(() => { if (isActive) setNotice(t('凭据状态读取失败。', 'Could not read credential status.')) })
      return () => { isActive = false }
    }, [refsKey, props.credentials])
    if (props.view === 'summary') return t('Delta Suite · 模型与视觉桥接', 'Delta Suite · Model and vision bridge')
    if (!props.form || state?.status !== 'ready') return hint(t('当前配置尚未由 Host 加载。', 'Host configuration is not available.'))
    const disabled = !state.writable || saving
    const field = (label: string, value: string, change: (value: string) => void, isSecret = false, placeholder = '') =>
      h('label', { style: { display: 'grid', gap: '5px', fontSize: '13px', minWidth: 0 } },
        h('span', null, label), h('input', {
          style: inputStyle, type: isSecret ? 'password' : 'text', value, placeholder, disabled,
          autoComplete: isSecret ? 'new-password' : 'off', onChange: (event: any) => change(event.target.value),
        }))
    const toggle = (label: string, isChecked: boolean, change: (value: boolean) => void) => h('label', {
      style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' },
    }, h('input', { type: 'checkbox', checked: isChecked, disabled, onChange: (event: any) => change(event.target.checked) }), label)
    const patch = (value: Partial<Draft>) => setDraft(old => ({ ...old, ...value }))
    const updateProvider = (index: number, update: Partial<ProviderDraft>) => setDraft(old => ({
      ...old, providers: old.providers.map((provider, itemIndex) => itemIndex === index ? { ...provider, ...update } : provider),
    }))
    const addProvider = () => {
      const id = 'provider-' + (++nextProvider)
      patch({ providers: [...draft.providers, {
        uiKey: 'new-' + nextProvider, id, kind: 'custom-api', enabled: true, endpoint: '',
        authMode: 'host-secret', credentialRef: defaultRef(id), headerName: '',
      }] })
    }
    const checkModels = async () => {
      const problem = validation(draft)
      if (problem) { setNotice(problem); return }
      if (!draft.providers.length) {
        setNotice(t('请先添加一个服务商，再测试连接。', 'Add a provider before testing the connection.'))
        return
      }
      if (operations(draft, state.value).length || Object.values(credentialInputs).some(value => value.trim())) {
        setNotice(t('请先保存配置，再测试连接。', 'Save the settings before testing the connection.'))
        return
      }
      setTesting(true); setNotice('')
      try {
        const result = await fetch(draft.pathPrefix.replace(/\/$/, '') + '/models')
        const payload = await result.json().catch(() => ({}))
        if (!result.ok) throw new Error(payload?.error?.message || `HTTP ${result.status}`)
        const count = Array.isArray(payload?.data) ? payload.data.length : 0
        setNotice(t(`连接成功，已发现 ${count} 个模型。`, `Connected. Discovered ${count} model(s).`))
      } catch (error) {
        setNotice(t(`连接失败：${error instanceof Error ? error.message : String(error)}`, `Connection failed: ${error instanceof Error ? error.message : String(error)}`))
      } finally { setTesting(false) }
    }
    const save = async () => {
      const error = validation(draft)
      if (error) { setNotice(error); return }
      const credentialError = credentialValidation(draft, credentialInputs, credentialStates, props.credentials)
      if (credentialError) { setNotice(credentialError); return }
      setSaving(true); setNotice('')
      try {
        const saved = await props.form!.mutate(operations(draft, state?.value), state?.revision)
        if (!saved) throw new Error('configuration changed or is read-only')
        const updates = draft.providers.map(provider => ({ ref: provider.credentialRef.trim(), value: credentialInputs[provider.uiKey] ?? '' }))
          .filter(update => update.ref && update.value)
        if (updates.length && !props.credentials?.set) throw new Error('Host credential service is unavailable')
        for (const update of updates) await props.credentials!.set!(update.ref, update.value)
        setCredentialInputs({})
        setNotice(t('已保存。密钥只存入 Host 凭据服务，不会写入插件配置。', 'Saved. Secrets are stored by Host credentials and never written to plugin settings.'))
      } catch (error) {
        setNotice(t(`保存失败：${error instanceof Error ? error.message : String(error)}`, `Save failed: ${error instanceof Error ? error.message : String(error)}`))
      } finally { setSaving(false) }
    }
    const providerOptions = [h('option', { value: '' }, t('自动选择', 'Auto select')), ...draft.providers.map(provider => h('option', { key: provider.uiKey, value: provider.id }, provider.id))]
    return h('div', { style: { display: 'grid', gap: '6px', minWidth: 0, paddingBottom: '16px' }, 'data-delta-suite-settings': 'true' },
      h('h2', { style: { margin: '0 0 4px' } }, t('Delta Suite', 'Delta Suite')),
      hint(t('按下面三步开始：添加服务商 → 保存配置 → 测试连接。第一次使用只需要填写地址和凭据，不需要理解协议细节。',
        'Three steps: add a provider → save settings → test the connection. You only need an endpoint and a credential; protocol details are optional.')),
      section(t('1. 开关', '1. Features'),
        toggle(t('启用 Delta Suite', 'Enable Delta Suite'), draft.enabled, value => patch({ enabled: value })),
        toggle(t('自动发现模型', 'Discover models automatically'), draft.modules.modelDiscovery, value => patch({ modules: { ...draft.modules, modelDiscovery: value } })),
        toggle(t('外挂视觉（纯文本模型也可处理图片）', 'Vision bridge (lets text-only models handle images)'), draft.modules.vision, value => patch({ modules: { ...draft.modules, vision: value } })),
        toggle(t('模型行为增强（推荐）', 'Model behavior guidance (recommended)'), draft.modules.behaviorEnhancement, value => patch({ modules: { ...draft.modules, behaviorEnhancement: value } })),
        hint(t('新手通常只需保留默认开关。模型服务添加完成后，保存并测试连接即可。', 'Most beginners can keep these defaults. Add a model service, save, and test the connection.'))),
      section(t('2. 添加模型服务', '2. Add model services'),
        draft.providers.length === 0 && h('div', { style: { ...inset, padding: '14px', border: '1px dashed var(--dsw-alias-border-l2, #aaa)', borderRadius: '10px' } },
          h('strong', null, t('还没有模型服务', 'No model service yet')),
          hint(t('添加一个服务商后，就可以发现模型并在 Harness 中使用。你只需要填写服务商提供的 API 地址和 API Key。',
            'Add a model service to discover models and use them in Harness. You only need the endpoint and API key supplied by that service.')),
          h('button', { type: 'button', disabled, style: { ...actionStyle, justifySelf: 'start' }, onClick: addProvider }, t('添加第一个服务商', 'Add your first provider')))),
        ...draft.providers.map((provider, index) => h('div', { key: provider.uiKey, style: { ...inset, padding: '12px', border: '1px solid var(--dsw-alias-border-l2, #ddd)', borderRadius: '10px' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' } },
            h('strong', null, providerLabel(provider.kind, isZh())), toggle(t('启用', 'Enabled'), provider.enabled, value => updateProvider(index, { enabled: value }))),
          field(t('服务商名称（例如 openai）', 'Provider name (for example, openai)'), provider.id, value => updateProvider(index, { id: value }), false, 'my-api'),
          h('label', { style: { display: 'grid', gap: '5px', fontSize: '13px' } }, h('span', null, t('服务类型', 'Service type')), h('select', {
            style: inputStyle, value: provider.kind, disabled, onChange: (event: any) => updateProvider(index, { kind: providerKind(event.target.value) }),
          }, h('option', { value: 'duckai' }, 'Duck.ai'), h('option', { value: 'chatgpt' }, 'ChatGPT'), h('option', { value: 'custom-api' }, t('自定义 API', 'Custom API')))),
          field(t('API 地址', 'API endpoint'), provider.endpoint, value => updateProvider(index, { endpoint: value }), false, 'https://example.com/v1'),
          hint(t('请粘贴服务商给出的 OpenAI-compatible 地址，通常以 /v1 结尾。不要把 API Key 粘贴到地址中。',
            'Paste the OpenAI-compatible endpoint supplied by the provider, usually ending in /v1. Do not put the API key in the URL.')),
          h('label', { style: { display: 'grid', gap: '5px', fontSize: '13px' } }, h('span', null, t('认证方式', 'Authentication')), h('select', {
            style: inputStyle, value: provider.authMode, disabled, onChange: (event: any) => updateProvider(index, {
              authMode: event.target.value,
              ...(event.target.value !== 'none' && !provider.credentialRef.trim() ? { credentialRef: defaultRef(provider.id) } : {}),
            }),
          }, h('option', { value: 'host-secret' }, t('API Key / Bearer（推荐）', 'API key / Bearer (recommended)')), h('option', { value: 'none' }, t('无需认证', 'No authentication')))),
          provider.authMode !== 'none' && h('div', { style: inset },
            field(t('API Key（只在本次输入中暂存）', 'API key (temporary input only)'), credentialInputs[provider.uiKey] ?? '', value => setCredentialInputs(old => ({ ...old, [provider.uiKey]: value })), true, t('粘贴 API Key，不会回显', 'Paste API key; it will not be echoed')),
            credentialStates[provider.credentialRef]?.configured
              ? hint(t('凭据已保存。再次输入才会替换它。', 'Credential saved. Enter a new value only to replace it.'))
              : hint(t('首次使用请输入 API Key；保存后由 Host 凭据服务安全管理。', 'Enter the API key the first time; Host credentials manage it securely after saving.'))),
          h('details', null, h('summary', { style: { cursor: 'pointer', fontSize: '12px' } }, t('高级：凭据引用与自定义认证', 'Advanced: credential reference and custom auth')),
            hint(t('通常不需要修改。只有服务商明确要求非 Authorization 头时才填写认证头，例如 X-API-Key。',
              'Usually no changes are needed. Only set a custom header when the provider explicitly requires one, such as X-API-Key.')),
            field(t('凭据引用（默认自动生成）', 'Credential reference (generated by default)'), provider.credentialRef, value => updateProvider(index, { credentialRef: value }), false, defaultRef(provider.id)),
            field(t('自定义认证头名称', 'Custom auth header'), provider.headerName, value => updateProvider(index, { headerName: value }), false, 'X-API-Key')),
          h('button', { type: 'button', disabled, style: actionStyle, onClick: () => patch({ providers: draft.providers.filter((_, itemIndex) => itemIndex !== index) }) }, t('删除服务商', 'Remove provider')))),
        draft.providers.length > 0 && h('button', { type: 'button', disabled, style: actionStyle, onClick: addProvider }, t('再添加一个服务商', 'Add another provider'))),
      h('details', { style: { marginTop: '8px' } }, h('summary', { style: { cursor: 'pointer', fontWeight: 600, padding: '10px 0' } }, t('高级设置（默认无需修改）', 'Advanced settings (usually not needed)')),
        hint(t('只有需要调整刷新策略、视觉备用模型、模型行为或本地 API 路径时才展开。', 'Open this only when you need to change refresh, vision fallback, model behavior, or the local API path.')),
        section(t('模型发现', 'Model discovery'),
          toggle(t('启动时刷新模型', 'Refresh models on startup'), draft.refreshOnStart, value => patch({ refreshOnStart: value })),
          field(t('自动刷新间隔（毫秒）', 'Refresh interval (milliseconds)'), draft.refreshIntervalMs, value => patch({ refreshIntervalMs: value }), false, '900000')),
        section(t('视觉模型', 'Vision model'),
          h('label', { style: { display: 'grid', gap: '5px', fontSize: '13px' } }, h('span', null, t('首选视觉服务商', 'Primary vision provider')), h('select', { style: inputStyle, value: draft.primaryProvider, disabled, onChange: (event: any) => patch({ primaryProvider: event.target.value }) }, ...providerOptions)),
          toggle(t('允许切换备用模型（需明确授权）', 'Allow fallback model switching (requires authorization)'), draft.allowFallback, value => patch({ allowFallback: value })),
          draft.allowFallback && h('label', { style: { display: 'grid', gap: '5px', fontSize: '13px' } }, h('span', null, t('备用服务商', 'Fallback provider')), h('select', { style: inputStyle, value: draft.fallbackProvider, disabled, onChange: (event: any) => patch({ fallbackProvider: event.target.value }) }, ...providerOptions))),
        section(t('模型行为', 'Model behavior'),
          toggle(t('启用指令遵循与证据边界提示', 'Enable instruction and evidence guidance'), draft.behaviorEnabled, value => patch({ behaviorEnabled: value })),
          hint(t('默认会提醒模型遵循用户指令，并区分观察事实、推断和不确定性；不会读取或保存你的密钥。', 'The default guidance asks models to follow user instructions and separate observations, inferences, and uncertainty. It never reads or stores your API key.')),
          h('label', { style: { display: 'grid', gap: '5px', fontSize: '13px' } }, h('span', null, t('提示插入方式', 'Guidance placement')), h('select', { style: inputStyle, value: draft.instructionMode, disabled, onChange: (event: any) => patch({ instructionMode: event.target.value }) }, h('option', { value: 'prepend' }, t('放在已有指令前（推荐）', 'Before existing instructions (recommended)')), h('option', { value: 'append' }, t('接在已有系统指令后', 'After existing system instructions')))),
          field(t('自定义补充提示（可留空）', 'Optional custom guidance'), draft.systemPrompt, value => patch({ systemPrompt: value }), false, t('留空使用默认提示', 'Leave empty to use the default'))),
        section(t('本地 API', 'Local API'),
          toggle(t('启用本地 API 服务', 'Enable local API service'), draft.apiEnabled, value => patch({ apiEnabled: value })),
          field(t('API 路径', 'API path'), draft.pathPrefix, value => patch({ pathPrefix: value }), false, '/delta-suite/v1'),
          hint(t('默认只通过 Harness 的本地 webServer 暴露，不打开新的远程端口。外部暴露被安全策略拒绝；如需远程访问，请由宿主提供认证后的公开路由。',
            'Routes use Harness local webServer and do not open a remote port. External exposure is refused by policy; use a Host-authenticated public route if remote access is required.'))),
      section(t('3. 保存并检查', '3. Save and check'),
        hint(t('先保存配置，再测试连接。测试只访问本地 Delta Suite 路由，不把 API Key 发送到浏览器之外的其他地址。', 'Save first, then test. The test only calls the local Delta Suite route and does not send the API key to another browser address.')),
        notice && h('p', { role: 'status', style: { fontSize: '13px', overflowWrap: 'anywhere' } }, notice),
        !state.writable && hint(t('当前 Profile 为只读，无法保存。', 'The active profile is read-only.')),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' } },
          h('button', { type: 'button', disabled, style: actionStyle, onClick: () => { setDraft(readDraft(state.value)); setCredentialInputs({}); setNotice('') } }, t('放弃修改', 'Discard')),
          h('button', { type: 'button', disabled, style: actionStyle, onClick: () => { void checkModels() } }, testing ? t('检查中…', 'Checking…') : t('测试连接 / 刷新模型', 'Test connection / refresh models')),
          h('button', { type: 'button', disabled, style: { ...actionStyle, background: 'var(--dsw-alias-brand-primary, #286F78)', color: 'white' }, onClick: () => { void save() } }, saving ? t('保存中…', 'Saving…') : t('保存配置', 'Save settings')))),
    )
  }

  return {
    inject: ['slots', 'configForms', 'remote', 'remote.credentials'],
    apply(ctx: any) {
      try {
        const form = ctx.configForms.get('delta-suite')
        const credentials: CredentialsRemote | undefined = ctx.remote?.credentials
        function NativePage() {
          const [snapshot, setSnapshot] = React.useState<ConfigState>(() => form.getSnapshot())
          React.useEffect(() => form.subscribe(() => setSnapshot(form.getSnapshot())), [])
          return h(Page, { view: 'page', form: { state: snapshot, mutate: (ops: Op[], revision?: number) => form.mutate(ops, revision) }, credentials })
        }
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'delta-suite', order: 70,
          label: () => t('Delta Suite', 'Delta Suite'),
        }, NativePage)), 'delta-suite: native settings section')
      } catch (error) {
        console.warn('[delta-suite] settings registration unavailable:', error)
      }
    },
  }
}

(window as unknown as { __ModuleLoader__: { load(entry: { id: string; factory: (require: (id: string) => unknown) => unknown }): void } })
  .__ModuleLoader__.load({ id: NAME, factory: installClient })
})()
