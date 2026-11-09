/**
 * Native DSH Plugins -> Code Worker -> Configure page.
 * Single, self-contained lazy-CJS client module; no DOM patching or Host fetch endpoints.
 * All writes use the Host's revision-fenced ConfigForm, with path-level secret edits.
 */
interface ReactApi {
  createElement(type: string | ((props: any) => unknown), props?: Record<string, unknown> | null, ...children: unknown[]): unknown
  useState<T>(init: T | (() => T)): [T, (value: T | ((old: T) => T)) => void]
  useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void
}
type Op = { op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] }
type Account = { owner: string; tokenEnv: string; sourceIndex: number }
type Server = { language: string; command: string; args: string }
interface Draft {
  enabled: boolean
  autoRouting: boolean
  workspaceRoot: string
  gitEnabled: boolean
  gitCommand: string
  githubEnabled: boolean
  githubAllowWrites: boolean
  allowWorktreeWrites: boolean
  allowCommands: boolean
  systemPromptText: string
  accounts: Account[]
  servers: Server[]
}
interface ConfigState { status: string; value?: any; revision?: number; writable: boolean }
interface ConfigPageProps {
  view: 'page' | 'summary'
  form?: { state: ConfigState; mutate(ops: Op[], revision?: number): Promise<boolean> }
}
const NAME = '@fongap-labs/dsh-delta-code'
const ROW_KEY = NAME + '#dsh-delta-code'
const OWNER = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i
const ENV = /^[A-Z_][A-Z0-9_]*$/
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
function readDraft(value: any): Draft {
  const git = value?.git ?? {}, github = value?.github ?? {}
  const execution = value?.execution ?? {}, lsp = value?.lsp ?? {}
  const defaults: Server[] = [
    { language: 'typescript', command: 'typescript-language-server', args: '--stdio' },
    { language: 'javascript', command: 'typescript-language-server', args: '--stdio' },
    { language: 'python', command: 'pyright-langserver', args: '--stdio' },
    { language: 'rust', command: 'rust-analyzer', args: '--stdio' },
    { language: 'go', command: 'gopls', args: 'serve' },
  ]
  return {
    enabled: value?.enabled !== false,
    autoRouting: value?.autoRouting !== false,
    workspaceRoot: value?.workspaceRoot ?? '',
    gitEnabled: git.enabled !== false, gitCommand: git.command ?? 'git',
    githubEnabled: github.enabled !== false, githubAllowWrites: github.allowWrites === true,
    allowWorktreeWrites: execution.allowWorktreeWrites === true,
    allowCommands: execution.allowCommands === true, systemPromptText: value?.systemPromptText ?? '',
    accounts: (github.accounts ?? []).map((item: any, index: number) => ({
      owner: item.owner ?? '', tokenEnv: item.tokenEnv ?? '', sourceIndex: index,
    })),
    servers: Array.isArray(lsp.servers)
      ? lsp.servers.map((server: any) => ({
          language: server.language ?? '', command: server.command ?? '',
          args: Array.isArray(server.args) ? server.args.join(' ') : '',
        }))
      : defaults,
  }
}
function validation(draft: Draft, value: any): string | undefined {
  const owners = new Set<string>()
  for (const account of draft.accounts) {
    const owner = account.owner.trim().toLowerCase()
    if (!OWNER.test(owner)) return 'GitHub owner must be a valid username or organization.'
    if (owners.has(owner)) return 'GitHub owner 不允许重复：' + owner
    owners.add(owner)
    const old = account.sourceIndex >= 0 ? value?.github?.accounts?.[account.sourceIndex] : undefined
    if (!account.tokenEnv) return owner + '：需要 Token 环境变量。'
    if (!ENV.test(account.tokenEnv)) return owner + ': invalid token environment variable name.'
  }
  if (!draft.gitCommand.trim()) return 'Git 命令不能为空。'
  for (const server of draft.servers) {
    if (!server.language.trim() || !server.command.trim()) return '语言服务器必须填写语言和命令。'
  }
  return undefined
}
function operations(draft: Draft, value: any): Op[] {
  const original = readDraft(value)
  const ops: Op[] = []
  const set = (path: string[], val: unknown) => { ops.push({ op: 'set', path, value: val }) }
  const scalars: Array<[keyof Draft, string[]]> = [
    ['enabled', ['enabled']], ['autoRouting', ['autoRouting']], ['workspaceRoot', ['workspaceRoot']],
    ['gitEnabled', ['git', 'enabled']], ['gitCommand', ['git', 'command']],
    ['githubEnabled', ['github', 'enabled']], ['githubAllowWrites', ['github', 'allowWrites']],
    ['allowWorktreeWrites', ['execution', 'allowWorktreeWrites']],
    ['allowCommands', ['execution', 'allowCommands']],
    ['systemPromptText', ['systemPromptText']],
  ]
  for (const [name, path] of scalars) {
    if (draft[name] !== original[name]) set(path, draft[name])
  }
  const current = value?.github?.accounts ?? []
  const seen = new Set(draft.accounts.filter(a => a.sourceIndex >= 0).map(a => a.sourceIndex))
  for (const a of draft.accounts.filter(a => a.sourceIndex >= 0)) {
    const prior = current[a.sourceIndex]
    const prefix = ['github', 'accounts', String(a.sourceIndex)]
    if (a.owner.trim() !== prior?.owner) set([...prefix, 'owner'], a.owner.trim())
    if (a.tokenEnv !== (prior?.tokenEnv ?? '')) {
      if (a.tokenEnv) {
        set([...prefix, 'tokenEnv'], a.tokenEnv)
      } else {
        ops.push({ op: 'unset', path: [...prefix, 'tokenEnv'] })
      }
    }
  }
  const removed = current.map((_a: unknown, i: number) => i).filter((i: number) => !seen.has(i))
  for (const index of removed.reverse()) ops.push({ op: 'unset', path: ['github', 'accounts', String(index)] })
  let index = current.length - removed.length
  for (const account of draft.accounts.filter(a => a.sourceIndex < 0)) {
    set(['github', 'accounts', String(index++)], {
      owner: account.owner.trim(), tokenEnv: account.tokenEnv,
    })
  }
  const servers = draft.servers.map(server => ({
    language: server.language.trim(), command: server.command.trim(),
    args: server.args.trim() ? server.args.trim().split(/\s+/) : [],
  }))
  if (JSON.stringify(servers) !== JSON.stringify(original.servers.map(s => ({
    language: s.language, command: s.command, args: s.args.trim() ? s.args.trim().split(/\s+/) : [],
  })))) set(['lsp', 'servers'], servers)
  return ops
}
function installClient(require: (id: string) => unknown) {
  const React = require('react') as ReactApi
  const h = React.createElement
  const uiLang = () => /^zh/i.test(document.documentElement.lang || navigator.language || 'zh')
  const t = (zh: string, en: string) => uiLang() ? zh : en
  const section = (title: string, ...children: unknown[]) => h('section', {
    style: { margin: '22px 0', borderTop: '1px solid var(--dsw-alias-border-l2, #ddd)', paddingTop: '15px' },
  }, h('h3', { style: { fontSize: '15px', margin: '0 0 10px' } }, title), ...children)
  const hint = (text: string) => h('p', { style: { fontSize: '12px', opacity: 0.75, lineHeight: 1.5, margin: '6px 0 10px' } }, text)

  function Page(props: ConfigPageProps) {
    const state = props.form?.state
    const [draft, setDraft] = React.useState<Draft>(() => readDraft(state?.value))
    const [saving, setSaving] = React.useState(false)
    const [notice, setNotice] = React.useState('')
    React.useEffect(() => { setDraft(readDraft(state?.value)); setNotice('') }, [state?.revision])
    if (props.view === 'summary') return t('Delta 编程助手 · 编程工具与 GitHub 多账号配置', 'Delta Code Worker · Coding tools and GitHub accounts')
    if (!props.form || state?.status !== 'ready') return hint(t('当前配置尚未由 Host 加载。', 'Host configuration is not available.'))
    const disabled = !state.writable || saving
    const field = (label: string, value: string, change: (v: string) => void, isSecret = false, placeholder = '') =>
      h('label', { style: { display: 'grid', gap: '5px', fontSize: '13px', minWidth: 0 } },
        h('span', null, label),
        h('input', { style: inputStyle, type: isSecret ? 'password' : 'text', value,
          autoComplete: isSecret ? 'new-password' : 'off', placeholder, disabled,
          onChange: (event: any) => change(event.target.value) }))
    const toggle = (label: string, isChecked: boolean, change: (v: boolean) => void) =>
      h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' } },
        h('input', { type: 'checkbox', checked: isChecked, disabled, onChange: (e: any) => change(e.target.checked) }), label)
    const patch = (value: Partial<Draft>) => setDraft(old => ({ ...old, ...value }))
    const updateAccount = (idx: number, prop: keyof Account, value: string) => setDraft(old => ({
      ...old, accounts: old.accounts.map((a, i) => i === idx ? { ...a, [prop]: value } : a),
    }))
    const updateServer = (idx: number, prop: keyof Server, value: string) => setDraft(old => ({
      ...old, servers: old.servers.map((s, i) => i === idx ? { ...s, [prop]: value } : s),
    }))
    const save = async () => {
      const error = validation(draft, state.value)
      if (error) { setNotice(error); return }
      const ops = operations(draft, state.value)
      if (!ops.length) { setNotice(t('没有待保存的变更。', 'No changes to save.')); return }
      setSaving(true)
      setNotice('')
      try {
        const ok = await props.form!.mutate(ops, state.revision)
        setNotice(ok ? t('配置已保存。Token 不会回显。', 'Saved. Tokens are never displayed.')
          : t('保存被 Host 拒绝，可能已有其他位置修改配置。请刷新后重试。', 'Host rejected the save. Refresh and retry.'))
      } catch {
        setNotice(t('保存失败，请检查 Host 连接及日志。', 'Save failed. Check the Host connection.'))
      } finally { setSaving(false) }
    }
    return h('div', { style: { display: 'grid', gap: '6px', minWidth: 0, paddingBottom: '16px' }, 'data-code-worker-settings': 'true' },
      hint(t('设置通过 DSH 原生配置服务保存。关闭页面不会保存草稿；执行权限默认关闭。',
        'Saved through the native DSH configuration service. Changes are staged; execution is off by default.')),
      section(t('基本与 Git', 'General & Git'),
        toggle(t('启用编程工具', 'Enable coding tools'), draft.enabled, v => patch({ enabled: v })),
        toggle(t('自动路由编程请求', 'Auto-route coding requests'), draft.autoRouting, v => patch({ autoRouting: v })),
        h('div', { style: inset },
          field(t('工作区路径（留空跟随 Host）', 'Workspace root (blank = Host)'), draft.workspaceRoot, v => patch({ workspaceRoot: v })),
          toggle(t('启用 Git', 'Enable Git'), draft.gitEnabled, v => patch({ gitEnabled: v })),
          field(t('Git 可执行文件', 'Git command'), draft.gitCommand, v => patch({ gitCommand: v })),
        )),
      section(t('执行与写入权限', 'Execution & write permissions'),
        toggle(t('允许创建 Worktree', 'Allow worktree writes'), draft.allowWorktreeWrites, v => patch({ allowWorktreeWrites: v })),
        toggle(t('允许执行项目脚本', 'Allow project commands'), draft.allowCommands, v => patch({ allowCommands: v })),
        hint(t('执行脚本仅适用于可信工作区。', 'Only enable project commands in trusted workspaces.'))),
      section(t('GitHub 多账号', 'GitHub accounts'),
        toggle(t('启用 GitHub 工具', 'Enable GitHub tools'), draft.githubEnabled, v => patch({ githubEnabled: v })),
        toggle(t('允许远程写入（默认关闭）', 'Allow remote writes (off by default)'), draft.githubAllowWrites,
          v => patch({ githubAllowWrites: v })),
        hint(t('一个 owner 对应一个 Token。通过 Token 环境变量名引用凭据；Token 不会写入配置，也不会从 Host 回显。',
          'One token per owner. Reference the credential by a Token environment variable name; tokens are never written to config or returned by the Host.')),
        ...draft.accounts.map((a, i) => h('div', { key: a.sourceIndex >= 0 ? 'existing-' + a.sourceIndex : 'new-' + i,
          style: { ...inset, padding: '12px', border: '1px solid var(--dsw-alias-border-l2, #ddd)', borderRadius: '10px' } },
          field(t('用户名或组织名', 'Username or organization'), a.owner, v => updateAccount(i, 'owner', v)),
          field(t('Token 环境变量名称', 'Token environment variable name'), a.tokenEnv,
            v => updateAccount(i, 'tokenEnv', v), false, 'GITHUB_TOKEN_NAME'),
          h('button', { type: 'button', disabled, style: actionStyle,
            onClick: () => patch({ accounts: draft.accounts.filter((_, j) => j !== i) }) },
            t('删除账号', 'Remove account')))),
        h('button', { type: 'button', disabled, style: actionStyle,
          onClick: () => patch({ accounts: [...draft.accounts, { owner: '', tokenEnv: '', sourceIndex: -1 }] }) },
          t('添加 GitHub 账号', 'Add GitHub account'))),
      section(t('语言服务器', 'Language servers'),
        ...draft.servers.map((s, i) => h('div', { key: 'server-' + i,
          style: { ...inset, padding: '12px', border: '1px solid var(--dsw-alias-border-l2, #ddd)', borderRadius: '10px' } },
          field(t('语言', 'Language'), s.language, v => updateServer(i, 'language', v)),
          field(t('启动命令', 'Executable'), s.command, v => updateServer(i, 'command', v)),
          field(t('参数（空格分隔）', 'Arguments (space-separated)'), s.args, v => updateServer(i, 'args', v)),
          h('button', { type: 'button', disabled, style: actionStyle,
            onClick: () => patch({ servers: draft.servers.filter((_, j) => j !== i) }) },
            t('移除语言服务器', 'Remove language server')))),
        h('button', { type: 'button', disabled, style: actionStyle,
          onClick: () => patch({ servers: [...draft.servers, { language: '', command: '', args: '' }] }) },
          t('添加语言服务器', 'Add language server'))),
      section(t('高级', 'Advanced'),
        field(t('系统提示词补充（留空使用默认值）', 'Additional system prompt (blank for default)'),
          draft.systemPromptText, v => patch({ systemPromptText: v }))),
      notice && h('p', { role: 'status', style: { fontSize: '13px', overflowWrap: 'anywhere' } }, notice),
      !state.writable && hint(t('当前 Profile 为只读，无法保存。', 'The active profile is read-only.')),
      h('div', { style: { display: 'flex', gap: '10px', marginTop: '10px' } },
        h('button', { type: 'button', disabled, style: actionStyle,
          onClick: () => { setDraft(readDraft(state.value)); setNotice('') } },
          t('放弃修改', 'Discard')),
        h('button', { type: 'button', disabled, onClick: () => { void save() },
          style: { ...actionStyle, background: 'var(--dsw-alias-brand-primary, #286F78)', color: 'white' } },
          saving ? t('保存中…', 'Saving…') : t('保存配置', 'Save settings'))),
    )
  }
  return {
    inject: ['slots'],
    apply(ctx: any) {
      ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config', key: ROW_KEY,
      }, Page)), 'dsh-delta-code: native settings page')
    },
  }
}
(window as unknown as { __ModuleLoader__: { load(entry: { id: string; factory: (require: (id: string) => unknown) => unknown }): void } })
  .__ModuleLoader__.load({ id: NAME, factory: installClient })
