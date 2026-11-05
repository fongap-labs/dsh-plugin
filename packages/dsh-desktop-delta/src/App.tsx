import { isValidElement, useEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Command,
  Copy,
  FileSearch,
  FolderKanban,
  History,
  Layers3,
  MessageSquarePlus,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import { Button } from './components/ui/button'
import { zhCN } from './locales/zh-CN'
import { desktopHost } from './lib/desktop-host-client'
import { desktopHostStatus } from './lib/desktop-host-status'
import type {
  DesktopHostRequest,
  RuntimeStatus,
} from './lib/desktop-host-contract'

type Theme = 'light' | 'dark'
type View = 'chat' | 'activity' | 'skills' | 'history'
type RuntimeConfig = {
  nodePath: string
  dshPath: string
  dshHome: string
  harnessPatchPath: string
  workspace: string
  provider: string
  model: string
}
type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string }
type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
type PendingImage = { id: string; name: string; mimeType: ImageMimeType; data: string }
type QuestionOption = { label: string; description?: string }
type HostQuestion = {
  id: string
  question: string
  detail?: string
  header?: string
  options?: QuestionOption[]
  multiSelect?: boolean
}
type LocalSession = { id: string; title: string; updatedAt: number; customTitle?: boolean }
type ActivityItem = { id: string; callId: string; sessionId: string; toolName: string; summary: string; outcome: 'running' | 'success' | 'error' | 'cancelled' | 'interrupted' }

const defaultRuntimeConfig: RuntimeConfig = {
  nodePath: 'node',
  dshPath: '',
  dshHome: '',
  harnessPatchPath: '',
  workspace: '',
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
}

const supportedImageTypes = new Set<ImageMimeType>(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const maxImageSize = 8 * 1024 * 1024
const maxImageCount = 4

const navItems: Array<{ id: View; label: string; icon: typeof MessageSquarePlus }> = [
  { id: 'chat', label: '对话', icon: MessageSquarePlus },
  { id: 'activity', label: '运行活动', icon: Activity },
  { id: 'skills', label: '技能库', icon: BookOpen },
  { id: 'history', label: '历史记录', icon: History },
]

const viewCopy: Record<View, { title: string; eyebrow: string; description: string }> = {
  chat: {
    title: '把想法，变成下一步。',
    eyebrow: 'DELTA SUITE',
    description: '对话、研究与工作流，都从一个清晰的工作区开始。',
  },
  activity: {
    title: '运行活动',
    eyebrow: 'ACTIVITY',
    description: '查看当前对话中 Harness 已报告的工具调用。',
  },
  skills: {
    title: '技能库',
    eyebrow: 'SKILLS',
    description: '技能仍由 Harness 内核加载；桌面管理接口尚未开放。',
  },
  history: {
    title: '历史记录',
    eyebrow: 'HISTORY',
    description: '查看 Delta 在这台电脑上保存的对话。',
  },
}

function extractNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractNodeText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return extractNodeText(node.props.children)
  return ''
}

function CopyCodeButton({ text }: { text: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    window.setTimeout(() => setCopyState('idle'), 1800)
  }

  return (
    <button aria-label={copyState === 'copied' ? zhCN.copiedCodeStatus : copyState === 'failed' ? zhCN.copyFailedStatus : zhCN.copyCodeLabel} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => void copyCode()} type="button">
      {copyState === 'copied' ? <Check size={12} /> : <Copy size={12} />}
      {copyState === 'copied' ? zhCN.copiedStatus : copyState === 'failed' ? zhCN.failedStatus : zhCN.copyLabel}
    </button>
  )
}

function MarkdownPre({ children, ...props }: ComponentProps<'pre'>) {
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-background/70">
      <div className="flex h-8 items-center justify-between border-b border-border/70 px-2.5">
        <span className="text-[10px] text-muted-foreground">{zhCN.codeLabel}</span>
        <CopyCodeButton text={extractNodeText(children)} />
      </div>
      <pre {...props} className="max-h-[32rem] overflow-auto px-3 py-3 text-[12px] leading-5">{children}</pre>
    </div>
  )
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="my-2 whitespace-pre-wrap last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-2 mt-5 text-lg font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-primary/50 pl-3 text-muted-foreground">{children}</blockquote>,
  a: ({ href, children, ...props }) => <a {...props} className="text-primary underline underline-offset-2" href={href} rel="noreferrer" target="_blank">{children}</a>,
  code: ({ className, children, ...props }) => <code {...props} className={`${className ?? ''} rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]`}>
    {children}
  </code>,
  pre: MarkdownPre,
  table: ({ children }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-left text-xs">{children}</table></div>,
  th: ({ children }) => <th className="border border-border bg-muted/70 px-2 py-1.5 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1.5 align-top">{children}</td>,
  hr: () => <hr className="my-4 border-border" />,
}

function initialTheme(): Theme {
  try {
    return localStorage.getItem('delta-theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function initialRuntimeConfig(): RuntimeConfig {
  try {
    const stored = localStorage.getItem('delta-runtime-config')
    if (!stored) return defaultRuntimeConfig
    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultRuntimeConfig
    const config = parsed as Record<string, unknown>
    return {
      nodePath: typeof config.nodePath === 'string' ? config.nodePath : defaultRuntimeConfig.nodePath,
      dshPath: typeof config.dshPath === 'string' ? config.dshPath : defaultRuntimeConfig.dshPath,
      dshHome: typeof config.dshHome === 'string' ? config.dshHome : defaultRuntimeConfig.dshHome,
      harnessPatchPath: typeof config.harnessPatchPath === 'string' ? config.harnessPatchPath : defaultRuntimeConfig.harnessPatchPath,
      workspace: typeof config.workspace === 'string' ? config.workspace : defaultRuntimeConfig.workspace,
      provider: typeof config.provider === 'string' ? config.provider : defaultRuntimeConfig.provider,
      model: typeof config.model === 'string' ? config.model : defaultRuntimeConfig.model,
    }
  } catch {
    return defaultRuntimeConfig
  }
}

function newSessionId() {
  return `delta-session-${crypto.randomUUID().replaceAll('-', '')}`
}

function isDeltaSessionId(sessionId: string) {
  return /^(?:delta-session|session)-[0-9a-f]{32}$/i.test(sessionId)
}

function initialSessionId() {
  try {
    const stored = localStorage.getItem('delta-active-session')
    return stored && isDeltaSessionId(stored) ? stored : newSessionId()
  } catch {
    return newSessionId()
  }
}

function readImageAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error("Unable to read image"))
        return
      }
      const separator = reader.result.indexOf(',')
      if (separator < 0) {
        reject(new Error("Unrecognized image format"))
        return
      }
      resolve(reader.result.slice(separator + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error("Image read failed"))
    reader.readAsDataURL(file)
  })
}

function imageReadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  switch (message) {
    case 'Unable to read image':
      return zhCN.imageUnreadable
    case 'Unrecognized image format':
      return zhCN.imageFormatUnknown
    case 'Image read failed':
      return zhCN.imageReadFailed
    default:
      return message
  }
}

function loadMessages(sessionId: string): ChatMessage[] {
  try {
    const messages = localStorage.getItem(`delta-messages:${sessionId}`)
    if (!messages) return []
    const parsed: unknown = JSON.parse(messages)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((message: unknown): message is ChatMessage => message !== null
      && typeof message === 'object'
      && 'id' in message && typeof message.id === 'string'
      && 'role' in message && (message.role === 'user' || message.role === 'assistant')
      && 'text' in message && typeof message.text === 'string')
  } catch {
    return []
  }
}

function loadSessions(activeSessionId: string): LocalSession[] {
  try {
    const stored = localStorage.getItem('delta-sessions')
    const parsed: unknown = stored ? JSON.parse(stored) : []
    const sessions = Array.isArray(parsed) ? parsed.filter((session: unknown): session is LocalSession => session !== null
      && typeof session === 'object'
      && 'id' in session && typeof session.id === 'string' && isDeltaSessionId(session.id)
      && 'title' in session && typeof session.title === 'string'
      && 'updatedAt' in session && typeof session.updatedAt === 'number') : []
    if (sessions.some(session => session.id === activeSessionId)) return sessions
    return [{ id: activeSessionId, title: '新对话', updatedAt: Date.now() }, ...sessions].slice(0, 50)
  } catch {
    return [{ id: activeSessionId, title: '新对话', updatedAt: Date.now() }]
  }
}

function App() {
  const runtime = useSyncExternalStore(desktopHostStatus.subscribe, desktopHostStatus.getSnapshot, desktopHostStatus.getSnapshot)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [view, setView] = useState<View>('chat')
  const [isSearchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(initialRuntimeConfig)
  const [isConnectionOpen, setConnectionOpen] = useState(true)
  const [connectionError, setConnectionError] = useState('')
  const [hasStorageError, setHasStorageError] = useState(false)
  const [isHelpOpen, setHelpOpen] = useState(false)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [isWorkspacePickerOpen, setWorkspacePickerOpen] = useState(false)
  const [workspaceDraft, setWorkspaceDraft] = useState('')
  const [workspaceError, setWorkspaceError] = useState('')
  const [sessionId, setSessionId] = useState(initialSessionId)
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(sessionId))
  const [attachments, setAttachments] = useState<PendingImage[]>([])
  const [isReadingImages, setIsReadingImages] = useState(false)
  const [sessions, setSessions] = useState<LocalSession[]>(() => loadSessions(sessionId))
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  const [readySessionIds, setReadySessionIds] = useState<Set<string>>(() => new Set())
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [hostRequests, setHostRequests] = useState<DesktopHostRequest[]>([])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const previousRuntimeState = useRef<RuntimeStatus['state']>(runtime.state)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const connectionSettingsRef = useRef<HTMLElement>(null)
  const copy = viewCopy[view]
  const shortcutModifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
  const isOnline = runtime.state === 'ready'
  const activeHostRequest = hostRequests[0]
  const searchTerm = query.trim().toLocaleLowerCase()
  const filteredSessions = sessions.filter(session => {
    if (!searchTerm || session.title.toLocaleLowerCase().includes(searchTerm)) return true
    return loadMessages(session.id).some(message => message.text.toLocaleLowerCase().includes(searchTerm))
  })
  const activeSessionTitle = sessions.find(session => session.id === sessionId)?.title ?? '新对话'

  useEffect(() => {
    const previousState = previousRuntimeState.current
    previousRuntimeState.current = runtime.state
    if (runtime.state === 'ready') {
      setConnectionOpen(false)
      return
    }
    setHostRequests([])
    if (previousState === 'ready') {
      setIsSending(false)
      setReadySessionIds(new Set())
      setActivities(current => current.map(item => item.outcome === 'running'
        ? { ...item, outcome: 'interrupted' }
        : item))
      setConnectionOpen(true)
    }
  }, [runtime.state])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('delta-theme', theme)
    } catch {
      // Theme remains available for this window when storage is unavailable.
    }
  }, [theme])

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (isHelpOpen || isWorkspacePickerOpen || renamingSessionId || activeHostRequest) return
      const target = event.target
      const isTyping = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

      if (event.key.toLowerCase() === 'k') {
        if (isTyping) return
        event.preventDefault()
        startNewSession()
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setSearchOpen(true)
        window.requestAnimationFrame(() => searchInputRef.current?.focus())
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [startNewSession, isHelpOpen, isWorkspacePickerOpen, renamingSessionId, activeHostRequest])

  useEffect(() => {
    try {
      localStorage.setItem('delta-runtime-config', JSON.stringify(runtimeConfig))
      localStorage.setItem('delta-active-session', sessionId)
      localStorage.setItem(`delta-messages:${sessionId}`, JSON.stringify(messages))
      localStorage.setItem('delta-sessions', JSON.stringify(sessions))
    } catch {
      setHasStorageError(true)
    }
  }, [runtimeConfig, sessionId, messages, sessions])

  useEffect(() => {
    let isDisposed = false
    let unlistenSession: (() => void) | undefined
    let unlistenStatus: (() => void) | undefined
    let unlistenRequest: (() => void) | undefined
    let unlistenRequestCancelled: (() => void) | undefined

    void desktopHost.onSessionEvent(item => {
      if (desktopHostStatus.getSnapshot().state !== 'ready') return
      if (!isDeltaSessionId(item.sessionId) || !sessionsRef.current.some(session => session.id === item.sessionId)) return
      if (item.type === 'tool.started') {
        if (item.sessionId !== sessionId) return
        setActivities(current => [
          { id: item.eventId, callId: item.payload.callId, sessionId: item.sessionId, toolName: item.payload.toolName, summary: item.payload.summary ?? '', outcome: 'running' as const },
          ...current,
        ].slice(0, 30))
        return
      }
      if (item.type === 'tool.completed') {
        if (item.sessionId !== sessionId) return
        setActivities(current => current.map(activity => activity.outcome === 'running' && activity.callId === item.payload.callId
          ? { ...activity, outcome: item.payload.outcome, summary: item.payload.summary ?? activity.summary }
          : activity))
        return
      }
      if (item.type !== 'message.completed') return
      const savedMessages = loadMessages(item.sessionId)
      if (!savedMessages.some(message => message.id === item.payload.messageId)) {
        try {
          localStorage.setItem(`delta-messages:${item.sessionId}`, JSON.stringify([
            ...savedMessages,
            { id: item.payload.messageId, role: item.payload.role, text: item.payload.text },
          ]))
        } catch {
          setHasStorageError(true)
        }
      }
      if (item.sessionId === sessionId) {
        setMessages(current => current.some(message => message.id === item.payload.messageId)
          ? current
          : [...current, { id: item.payload.messageId, role: item.payload.role, text: item.payload.text }])
      }
      if (item.payload.role === 'user') {
        setSessions(current => {
          const existing = current.find(session => session.id === item.sessionId)
          const title = existing && (existing.customTitle || existing.title !== '新对话') ? existing.title : item.payload.text.trim().slice(0, 36) || '新对话'
          const updatedSession = existing
            ? { ...existing, title, updatedAt: Date.now() }
            : { id: item.sessionId, title, updatedAt: Date.now() }
          return [
            updatedSession,
            ...current.filter(session => session.id !== item.sessionId),
          ].slice(0, 50)
        })
      }
    }).then(stop => { if (isDisposed) stop(); else unlistenSession = stop }).catch(() => {})

    void desktopHost.onSessionStatus(status => {
      if (desktopHostStatus.getSnapshot().state !== 'ready') return
      if (status.sessionId === sessionId) setIsSending(status.status === 'running')
    }).then(stop => { if (isDisposed) stop(); else unlistenStatus = stop }).catch(() => {})

    void desktopHost.onHostRequest(request => {
      if (request.method !== 'approval/request' && request.method !== 'user-question/ask') return
      const requestSessionId = request.params.sessionId
      if (typeof requestSessionId !== 'string'
        || !isDeltaSessionId(requestSessionId)
        || !sessionsRef.current.some(session => session.id === requestSessionId)) {
        const result = request.method === 'approval/request'
          ? { outcome: 'rejected' }
          : { cancelled: true }
        void desktopHost.respondRequest(request.id, result).catch(() => {})
        return
      }
      setHostRequests(current => current.some(item => item.id === request.id) ? current : [...current, request])
    }).then(stop => { if (isDisposed) stop(); else unlistenRequest = stop }).catch(() => {})

    void desktopHost.onHostRequestCancelled(requestId => {
      setHostRequests(current => current.filter(item => item.params.requestId !== requestId))
    }).then(stop => { if (isDisposed) stop(); else unlistenRequestCancelled = stop }).catch(() => {})

    return () => {
      isDisposed = true
      unlistenSession?.()
      unlistenStatus?.()
      unlistenRequest?.()
      unlistenRequestCancelled?.()
    }
  }, [sessionId])

  async function connectRuntime() {
    setConnectionError('')
    try {
      await desktopHost.connect(runtimeConfig)
      setConnectionOpen(false)
      setReadySessionIds(new Set())
      if (messages.length > 0) {
        await desktopHost.resume(sessionId)
        setReadySessionIds(new Set([sessionId]))
      }
    } catch (error) {
      setConnectionError(String(error))
    }
  }

  async function sendMessage() {
    const text = draft.trim()
    const images = attachments
    if ((!text && images.length === 0) || !isOnline || isReadingImages) return
    const contentBlocks = [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...images.map(image => ({ type: 'image' as const, data: image.data, mimeType: image.mimeType, name: image.name })),
    ]
    setDraft('')
    setAttachments([])
    setIsSending(true)
    setConnectionError('')
    try {
      if (runtimeConfig.workspace.trim()) {
        await desktopHost.setWorkingDirectory(sessionId, runtimeConfig.workspace.trim())
      }
      await desktopHost.query(sessionId, contentBlocks)
      setReadySessionIds(current => new Set(current).add(sessionId))
    } catch (error) {
      setConnectionError(String(error))
      setDraft(current => current.trim() ? current : text)
      setAttachments(current => current.length > 0 ? current : images)
      setIsSending(false)
    }
  }

  async function addImages(files: FileList | null) {
    const selected = Array.from(files ?? [])
    if (selected.length === 0) return
    if (isReadingImages) return

    setConnectionError('')
    setIsReadingImages(true)
    const remaining = maxImageCount - attachments.length
    const filesToRead = selected.slice(0, Math.max(remaining, 0))
    let errorMessage = ''
    if (selected.length > filesToRead.length) errorMessage = zhCN.maximumImages(maxImageCount)
    const loaded: PendingImage[] = []
    for (const file of filesToRead) {
      const mimeType = file.type.toLowerCase()
      if (!supportedImageTypes.has(mimeType as ImageMimeType)) {
        errorMessage ||= `暂不支持 ${file.name}，请选择 PNG、JPEG、WebP 或 GIF 图片`
        continue
      }
      if (file.size > maxImageSize) {
        errorMessage ||= `${file.name} 太大了，单张图片不能超过 8 MB`
        continue
      }
      try {
        loaded.push({
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: mimeType as ImageMimeType,
          data: await readImageAsBase64(file),
        })
      } catch (error) {
        errorMessage ||= `${file.name} 读取失败：${imageReadErrorMessage(error)}`
      }
    }
    if (loaded.length > 0) setAttachments(current => [...current, ...loaded].slice(0, maxImageCount))
    setConnectionError(errorMessage)
    setIsReadingImages(false)
  }

  function startNewSession() {
    const id = newSessionId()
    setSessionId(id)
    setMessages([])
    setAttachments([])
    setActivities([])
    setDraft('')
    setIsSending(false)
    setSessions(current => [{ id, title: '新对话', updatedAt: Date.now() }, ...current].slice(0, 50))
    setView('chat')
  }

  function beginSessionRename(session: LocalSession) {
    setRenamingSessionId(session.id)
    setRenameDraft(session.title)
  }

  function closeSessionRename() {
    setRenamingSessionId(null)
    setRenameDraft('')
  }

  function saveSessionRename() {
    const title = renameDraft.trim()
    if (!renamingSessionId || !title) return
    setSessions(current => current.map(session => session.id === renamingSessionId
      ? { ...session, title, customTitle: true }
      : session))
    closeSessionRename()
  }

  async function openSession(session: LocalSession) {
    if (session.id === sessionId) {
      setView('chat')
      return
    }
    setConnectionError('')
    if (isOnline && loadMessages(session.id).length > 0 && !readySessionIds.has(session.id)) {
      try {
        await desktopHost.resume(session.id)
        setReadySessionIds(current => new Set(current).add(session.id))
      } catch (error) {
        setConnectionError(`无法恢复这条对话：${String(error)}`)
        return
      }
    }
    setSessionId(session.id)
    setMessages(loadMessages(session.id))
    setAttachments([])
    setActivities([])
    setDraft('')
    setIsSending(false)
    setView('chat')
  }

  async function chooseWorkspace() {
    const path = workspaceDraft.trim()
    if (!path) return
    if (isOnline) {
      try {
        const actualPath = await desktopHost.setWorkingDirectory(sessionId, path)
        setRuntimeConfig(config => ({ ...config, workspace: actualPath }))
        setConnectionError('')
        setWorkspaceError('')
        setWorkspacePickerOpen(false)
      } catch (error) {
        setWorkspaceError(`无法切换工作文件夹：${String(error)}`)
      }
    } else {
      setRuntimeConfig(config => ({ ...config, workspace: path }))
      setWorkspaceError('')
      setWorkspacePickerOpen(false)
    }
  }

  async function chooseWorkspaceFolder() {
    try {
      const path = await openDialog({
        title: '选择工作文件夹',
        defaultPath: workspaceDraft || undefined,
        directory: true,
        multiple: false,
      })
      if (typeof path === 'string') {
        setWorkspaceDraft(path)
        setWorkspaceError('')
      }
    } catch (error) {
      setWorkspaceError(`无法打开文件夹选择窗口：${String(error)}`)
    }
  }

  function openWorkspacePicker() {
    setWorkspaceDraft(runtimeConfig.workspace)
    setWorkspaceError('')
    setWorkspacePickerOpen(true)
  }

  async function chooseHarnessPath(isDirectory: boolean) {
    try {
      const path = await openDialog({
        title: isDirectory ? zhCN.selectHarnessFolder : zhCN.selectDshStartupFile,
        defaultPath: runtimeConfig.dshPath || undefined,
        directory: isDirectory,
        multiple: false,
        filters: isDirectory ? undefined : [{ name: 'Node.js 启动文件', extensions: ['js', 'mjs', 'cjs'] }],
      })
      if (typeof path === 'string') {
        setRuntimeConfig(config => ({ ...config, dshPath: path }))
        setConnectionError('')
      }
    } catch (error) {
      setConnectionError(`无法打开 Harness 选择窗口：${String(error)}`)
    }
  }

  async function chooseNodeProgram() {
    try {
      const path = await openDialog({
        title: '选择 Node.js 程序',
        multiple: false,
        filters: /Win/.test(navigator.platform) ? [{ name: zhCN.nodeProgramFilterName, extensions: ['exe'] }] : undefined,
      })
      if (typeof path === 'string') {
        setRuntimeConfig(config => ({ ...config, nodePath: path }))
        setConnectionError('')
      }
    } catch (error) {
      setConnectionError(`无法打开 Node.js 选择窗口：${String(error)}`)
    }
  }

  async function chooseHarnessPatch() {
    try {
      const path = await openDialog({
        title: '选择 dsh-suite-delta 配置文件',
        defaultPath: runtimeConfig.harnessPatchPath || undefined,
        multiple: false,
        filters: [{ name: 'Harness 配置补丁', extensions: ['yml', 'yaml'] }],
      })
      if (typeof path === 'string') {
        setRuntimeConfig(config => ({ ...config, harnessPatchPath: path }))
        setConnectionError('')
      }
    } catch (error) {
      setConnectionError(`无法打开配置文件选择窗口：${String(error)}`)
    }
  }

  async function disconnectRuntime() {
    try {
      await desktopHost.disconnect()
      setReadySessionIds(new Set())
      setIsSending(false)
    } catch (error) {
      setConnectionError(String(error))
    }
  }

  async function answerHostRequest(request: DesktopHostRequest, result: Record<string, unknown>) {
    try {
      await desktopHost.respondRequest(request.id, result)
      setHostRequests(current => current.filter(item => item.id !== request.id))
      setConnectionError('')
    } catch (error) {
      setConnectionError(String(error))
      throw error
    }
  }

  function openConnectionSettings() {
    setView('chat')
    setConnectionOpen(true)
    window.requestAnimationFrame(() => connectionSettingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function focusComposer(prompt: string) {
    setDraft(prompt)
    window.requestAnimationFrame(() => composerRef.current?.focus())
  }

  return (
    <div className="app-shell flex min-h-screen bg-background text-foreground">
      <aside className="sidebar flex w-[252px] shrink-0 flex-col border-r border-border bg-sidebar px-3 pb-3 pt-4">
        <div className="flex items-center gap-3 px-2 pb-6">
          <div className="brand-mark flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Layers3 size={19} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold tracking-tight">Delta Suite</div>
            <div className="text-[11px] text-muted-foreground">{zhCN.aiWorkbench}</div>
          </div>
          <Button aria-label="连接设置" className="text-muted-foreground" size="icon" variant="ghost" onClick={openConnectionSettings}>
            <MoreHorizontal size={17} />
          </Button>
        </div>

        <Button className="mb-2 w-full justify-start shadow-sm" variant="primary" onClick={startNewSession}>
          <Plus size={16} />
          {zhCN.createConversation}
          <span className="ml-auto rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-medium">{shortcutModifier} K</span>
        </Button>

        <Button
          aria-expanded={isSearchOpen}
          className="mb-5 w-full justify-start"
          variant="outline"
          onClick={() => setSearchOpen(value => !value)}
        >
          <Search size={15} />
          {zhCN.search}
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">{shortcutModifier === '⌘' && <Command size={10} />}{shortcutModifier === 'Ctrl' && 'Ctrl ' }F</span>
        </Button>

        {isSearchOpen && (
          <div className="mb-4 px-1">
            <input
              autoFocus
              aria-label="搜索会话"
              className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onChange={event => setQuery(event.target.value)}
              placeholder="搜索会话…"
              ref={searchInputRef}
              value={query}
            />
            <p className="px-1 pt-2 text-[11px] leading-5 text-muted-foreground">
              {zhCN.searchDescription}
            </p>
          </div>
        )}

        <div className="space-y-1">
          {navItems.map(item => {
            const Icon = item.icon
            const active = view === item.id
            return (
              <button
                key={item.id}
                aria-current={active ? 'page' : undefined}
                className={`flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] transition-colors ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                onClick={() => setView(item.id)}
                type="button"
              >
                <Icon size={16} strokeWidth={1.8} />
                {item.label}
                {item.id === 'activity' && activities.some(activity => activity.sessionId === sessionId) && <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">{activities.filter(activity => activity.sessionId === sessionId).length}</span>}
              </button>
            )
          })}
        </div>

        <div className="mt-8 flex items-center justify-between px-2 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{zhCN.recentConversations}</span>
          <Button aria-label="新建会话" size="icon" variant="ghost" className="size-7" onClick={startNewSession}>
            <Plus size={14} />
          </Button>
        </div>
        {sessions.length > 0 ? (
          <div className="space-y-1 overflow-y-auto">
            {filteredSessions.slice(0, 8).map(session => (
              <button
                className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-xs ${session.id === sessionId ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'}`}
                key={session.id}
                onClick={() => void openSession(session)}
              >
                <MessageSquarePlus size={14} className="mt-0.5 shrink-0" />
                <span className="line-clamp-2">{session.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 px-4 text-center">
            <div className="mb-2 flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MessageSquarePlus size={17} strokeWidth={1.7} />
            </div>
            <p className="text-xs font-medium">{zhCN.emptyConversationsTitle}</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{zhCN.emptyConversationsDescription}</p>
          </div>
        )}

        <div className="mt-3 rounded-xl border border-border/80 bg-card/70 p-2">
          <div className="flex items-center gap-2 rounded-lg px-2 py-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">D</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{zhCN.localWorkspace}</div>
              <div className="truncate text-[10px] text-muted-foreground">Delta Desktop</div>
            </div>
            <ChevronDown size={14} className="text-muted-foreground" />
          </div>
          <div className="flex items-center gap-1 border-t border-border/70 pt-2">
            <Button className="flex-1 justify-start text-xs" size="sm" variant="ghost" onClick={openConnectionSettings}>
              <Settings2 size={14} /> {zhCN.settings}
            </Button>
            <Button
              aria-label={theme === 'light' ? zhCN.switchToDarkMode : zhCN.switchToLightMode}
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
            </Button>
            <Button aria-label="帮助" size="icon" variant="ghost" className="size-8" onClick={() => setHelpOpen(true)}>
              <CircleHelp size={15} />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-border/80 px-7">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{zhCN.workspace}</span>
            <span className="text-border">/</span>
            <span>{copy.eyebrow === 'DELTA SUITE' ? activeSessionTitle : itemLabel(view)}</span>
          </div>
          <div className="flex items-center gap-2">
            <RuntimeBadge state={runtime.state} />
            {!isOnline ? (
              <Button className="text-xs" size="sm" variant="primary" onClick={() => setConnectionOpen(value => !value)}>
                {zhCN.connectHarness}
              </Button>
            ) : (
              <Button className="text-xs" size="sm" title="断开会结束本桌面连接启动的整个 Harness 进程" variant="outline" onClick={() => void disconnectRuntime()}>
                {zhCN.disconnect}
              </Button>
            )}
            <Button className="text-xs" size="sm" variant="outline" onClick={openWorkspacePicker}>
              <FolderKanban size={14} />
              {zhCN.chooseWorkspace}
            </Button>
          </div>
        </header>

        {hasStorageError && <p className="mx-6 mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{zhCN.localSaveFailed}</p>}

        <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 pb-8 pt-[clamp(64px,12vh,142px)]">
          <div className="w-full max-w-[760px]">
            {view === 'history' ? (
              <section className="rounded-2xl border border-border bg-card p-5">
                <h1 className="text-xl font-semibold">{zhCN.history}</h1>
                <p className="mt-1 text-xs text-muted-foreground">{zhCN.historyDescription}</p>
                <div className="mt-4 space-y-2">
                  {filteredSessions.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">{zhCN.emptyHistory}</p> : filteredSessions.map(session => (
                    <div className="flex items-center gap-2 rounded-xl border border-border px-2 hover:border-primary/40 hover:bg-accent/30" key={session.id}>
                      <button className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-1 text-left" onClick={() => void openSession(session)}>
                        <MessageSquarePlus className="shrink-0 text-primary" size={16} />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">{session.title}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(session.updatedAt).toLocaleString()}</span>
                      </button>
                      <Button aria-label={`重命名${session.title}`} className="size-8 shrink-0" size="icon" title="重命名对话" variant="ghost" onClick={() => beginSessionRename(session)}>
                        <Pencil size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            ) : view === 'activity' ? (
              <section className="rounded-2xl border border-border bg-card p-5">
                <h1 className="text-xl font-semibold">{zhCN.activity}</h1>
                <p className="mt-1 text-xs text-muted-foreground">{zhCN.activityDescription}</p>
                <div className="mt-4 space-y-2">
                  {activities.filter(item => item.sessionId === sessionId).length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">{zhCN.emptyActivity}</p> : activities.filter(item => item.sessionId === sessionId).map(item => (
                    <article className="rounded-xl border border-border px-3 py-3" key={item.id}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-xs font-medium">{item.toolName}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] ${item.outcome === 'success' ? 'bg-success/10 text-success' : item.outcome === 'error' ? 'bg-destructive/10 text-destructive' : item.outcome === 'cancelled' || item.outcome === 'interrupted' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                          {item.outcome === 'success' ? zhCN.completed : item.outcome === 'error' ? zhCN.failedStatus : item.outcome === 'cancelled' ? zhCN.cancelled : item.outcome === 'interrupted' ? zhCN.interrupted : zhCN.inProgress}
                        </span>
                      </div>
                      {item.summary && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-4 text-muted-foreground">{item.summary}</pre>}
                      {item.outcome === 'interrupted' && <p className="mt-2 text-[10px] text-muted-foreground">{zhCN.interruptedResult}</p>}
                    </article>
                  ))}
                </div>
              </section>
            ) : view === 'skills' ? (
              <section className="rounded-2xl border border-border bg-card p-5">
                <h1 className="text-xl font-semibold">{zhCN.skills}</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{zhCN.skillsUnavailable}</p>
              </section>
            ) : messages.length === 0 ? (
              <>
                <div className="mb-5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                  <span className="size-1.5 rounded-full bg-primary" />
                  {copy.eyebrow}
                </div>
                <h1 className="max-w-[700px] text-[clamp(32px,4.2vw,48px)] font-semibold leading-[1.08] tracking-[-0.045em]">{copy.title}</h1>
                <p className="mt-4 max-w-[560px] text-[15px] leading-7 text-muted-foreground">{copy.description}</p>

                <div className="mt-9 grid gap-3 sm:grid-cols-3">
                  <FeatureCard icon={<Sparkles size={16} />} label="开启新对话" detail="点一下就可以开始输入。" onClick={() => focusComposer('')} />
                  <FeatureCard icon={<FileSearch size={16} />} label="研究与搜索" detail="先写下你想研究的问题。" onClick={() => focusComposer('请帮我研究：')} />
                  <FeatureCard icon={<Workflow size={16} />} label="运行工作流" detail="描述你要完成的任务。" onClick={() => focusComposer('请帮我完成：')} />
                </div>
              </>
            ) : (
              <div className="mb-8 space-y-6">
                {messages.map(message => (
                  <article key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'whitespace-pre-wrap bg-primary text-primary-foreground' : 'min-w-0 bg-card text-card-foreground'}`}>
                      {message.role === 'assistant' && message.text
                        ? <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                        : message.text || (message.role === 'assistant' ? zhCN.noTextMessage : '')}
                    </div>
                  </article>
                ))}
                {isSending && <p className="text-xs text-muted-foreground">{zhCN.harnessReplying}</p>}
              </div>
            )}

            {view === 'chat' && isConnectionOpen && (
              <section ref={connectionSettingsRef} className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold">{isOnline ? zhCN.connectionSettings : zhCN.connectExistingHarness}</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{zhCN.runtimeOwnership}</p>
                </div>
                <label className="block text-xs font-medium">
                  {zhCN.harnessPath}
                  <input
                    className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={event => setRuntimeConfig(config => ({ ...config, dshPath: event.target.value }))}
                    placeholder="粘贴 Harness 的 @deepseek-ai/dsh 文件夹或 dsh.js 路径"
                    value={runtimeConfig.dshPath}
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void chooseHarnessPath(true)}>{zhCN.browseHarnessFolder}</Button>
                  <Button size="sm" variant="outline" onClick={() => void chooseHarnessPath(false)}>{zhCN.selectDshStartupFile}</Button>
                </div>
                <details className="mt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">{zhCN.moreConnectionSettings}</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <RuntimeField label="Node.js 命令或程序路径" value={runtimeConfig.nodePath} onChange={value => setRuntimeConfig(config => ({ ...config, nodePath: value }))} />
                      <Button className="mt-2" size="sm" variant="outline" onClick={() => void chooseNodeProgram()}>{zhCN.browseNodeProgram}</Button>
                    </div>
                    <RuntimeField label="工作文件夹（可留空）" value={runtimeConfig.workspace} onChange={value => setRuntimeConfig(config => ({ ...config, workspace: value }))} />
                    <RuntimeField label="Harness 数据文件夹（可留空）" value={runtimeConfig.dshHome} onChange={value => setRuntimeConfig(config => ({ ...config, dshHome: value }))} />
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-foreground">
                        {zhCN.pluginConfigFile}
                        <input
                          className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onChange={event => setRuntimeConfig(config => ({ ...config, harnessPatchPath: event.target.value }))}
                          placeholder="选择或粘贴 cordis.patch.yml"
                          value={runtimeConfig.harnessPatchPath}
                        />
                      </label>
                      <Button className="mt-2" size="sm" variant="outline" onClick={() => void chooseHarnessPatch()}>{zhCN.browseConfigFile}</Button>
                      <p className="mt-1 text-[10px] font-normal leading-4 text-muted-foreground">{zhCN.pluginInstallNote}</p>
                    </div>
                    <RuntimeField label="模型提供商" value={runtimeConfig.provider} onChange={value => setRuntimeConfig(config => ({ ...config, provider: value }))} />
                    <RuntimeField label="模型名称" value={runtimeConfig.model} onChange={value => setRuntimeConfig(config => ({ ...config, model: value }))} />
                  </div>
                </details>
                {connectionError && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{connectionError}</p>}
                <Button className="mt-4" variant="primary" disabled={!runtimeConfig.dshPath.trim() || runtime.state === 'starting'} onClick={() => void connectRuntime()}>
                  {runtime.state === 'starting' ? zhCN.connecting : isOnline ? zhCN.saveAndReconnect : zhCN.connectAndStart}
                </Button>
              </section>
            )}

            {view === 'chat' && <div className="mt-8 rounded-2xl border border-border bg-card p-3 shadow-[0_8px_32px_rgba(17,19,22,0.045)]">
              <input
                ref={imageInputRef}
                accept="image/png,image/jpeg,image/webp,image/gif"
                aria-label="选择图片"
                className="hidden"
                multiple
                onChange={event => {
                  void addImages(event.currentTarget.files)
                  event.currentTarget.value = ''
                }}
                type="file"
              />
              {(attachments.length > 0 || isReadingImages) && <div className="mb-3 flex flex-wrap gap-2">
                {attachments.map(image => (
                  <div key={image.id} className="flex items-center gap-2 rounded-xl border border-border bg-background p-1.5 pr-2">
                    <img alt={image.name} className="size-10 rounded-lg object-cover" src={`data:${image.mimeType};base64,${image.data}`} />
                    <span className="max-w-36 truncate text-[10px] text-muted-foreground">{image.name}</span>
                    <button aria-label={`移除 ${image.name}`} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setAttachments(current => current.filter(item => item.id !== image.id))} type="button"><X size={13} /></button>
                  </div>
                ))}
                {isReadingImages && <span className="self-center text-[11px] text-muted-foreground">{zhCN.readingImages}</span>}
              </div>}
              <textarea
                aria-label="输入消息"
                className="min-h-[82px] w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                disabled={!isOnline}
                ref={composerRef}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    void sendMessage()
                  }
                }}
                placeholder={isOnline ? zhCN.promptHarness : zhCN.connectHarnessFirst}
                value={draft}
              />
              <div className="flex items-center justify-between border-t border-border/70 px-2 pt-3">
                <div className="flex items-center gap-1">
                  <Button aria-label="添加图片" className="size-8" size="icon" title="支持 PNG、JPEG、WebP、GIF；单张不超过 8 MB，最多 4 张" variant="ghost" disabled={!isOnline || attachments.length >= maxImageCount || isReadingImages} onClick={() => imageInputRef.current?.click()}><Plus size={16} /></Button>
                  <Button className="h-8 gap-1.5 text-xs" size="sm" variant="ghost" disabled={!isOnline} onClick={openConnectionSettings}>
                    <Zap size={14} />
                    {zhCN.modelSettings}
                    <ChevronDown size={12} />
                  </Button>
                </div>
                <Button aria-label="发送消息" className="size-8 rounded-lg" size="icon" variant="primary" disabled={!isOnline || (!draft.trim() && attachments.length === 0) || isReadingImages} onClick={() => void sendMessage()}>
                  {isOnline ? <ArrowUp size={16} /> : <ArrowDown size={15} />}
                </Button>
              </div>
            </div>}
            {view === 'chat' && connectionError && isOnline && <p className="mt-2 text-xs text-destructive">{connectionError}</p>}
            {view === 'chat' && <p className="mt-3 text-center text-[11px] text-muted-foreground">
              {isOnline ? runtime.message : zhCN.harnessNotConnectedMessage}
            </p>}
          </div>
        </div>
      </main>

      {activeHostRequest && (
        <HostRequestDialog
          key={`${activeHostRequest.id}`}
          request={activeHostRequest}
          onResolve={result => answerHostRequest(activeHostRequest, result)}
        />
      )}

      {isHelpOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]" onMouseDown={event => { if (event.target === event.currentTarget) setHelpOpen(false) }} role="presentation">
          <section aria-labelledby="help-title" aria-modal="true" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" onKeyDown={event => { if (event.key === 'Escape') setHelpOpen(false) }} role="dialog" tabIndex={-1}>
            <h2 className="text-base font-semibold" id="help-title">{zhCN.helpTitle}</h2>
            <div className="mt-4 space-y-3 text-xs leading-5 text-muted-foreground">
              <p>{zhCN.helpConnect}</p>
              <p>{zhCN.helpApproval}</p>
              <p>{zhCN.helpHistory}</p>
              <p>{zhCN.helpCancellation}</p>
              <p>{zhCN.helpUnsupportedFeatures}</p>
            </div>
            <div className="mt-5 flex justify-end">
              <Button autoFocus variant="primary" onClick={() => setHelpOpen(false)}>{zhCN.acknowledge}</Button>
            </div>
          </section>
        </div>
      )}

      {renamingSessionId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]" onMouseDown={event => { if (event.target === event.currentTarget) closeSessionRename() }} role="presentation">
          <form aria-labelledby="rename-session-title" aria-modal="true" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeSessionRename() } }} onSubmit={event => { event.preventDefault(); saveSessionRename() }} role="dialog" tabIndex={-1}>
            <h2 className="text-base font-semibold" id="rename-session-title">{zhCN.renameConversation}</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{zhCN.renameLocalOnly}</p>
            <input
              autoFocus
              className="mt-4 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              maxLength={80}
              onChange={event => setRenameDraft(event.target.value)}
              value={renameDraft}
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeSessionRename}>{zhCN.cancel}</Button>
              <Button disabled={!renameDraft.trim()} type="submit" variant="primary">{zhCN.saveName}</Button>
            </div>
          </form>
        </div>
      )}

      {isWorkspacePickerOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]" role="presentation">
          <section aria-labelledby="workspace-title" aria-modal="true" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" role="dialog">
            <h2 className="text-base font-semibold" id="workspace-title">{zhCN.setWorkspace}</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{zhCN.workspacePickerDescription}</p>
            <div className="mt-4 flex gap-2">
              <input
                autoFocus
                className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={event => setWorkspaceDraft(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') void chooseWorkspace() }}
                placeholder="可粘贴完整路径，或点右侧浏览"
                value={workspaceDraft}
              />
              <Button className="shrink-0" variant="outline" onClick={() => void chooseWorkspaceFolder()}>{zhCN.browse}</Button>
            </div>
            {workspaceError && <p className="mt-2 text-xs text-destructive">{workspaceError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setWorkspacePickerOpen(false)}>{zhCN.cancel}</Button>
              <Button disabled={!workspaceDraft.trim()} variant="primary" onClick={() => void chooseWorkspace()}>{isOnline ? zhCN.switchFolder : zhCN.save}</Button>
            </div>
          </section>
        </div>
      )}

      <aside className="hidden w-[276px] shrink-0 flex-col border-l border-border/80 bg-panel/55 px-4 py-5 xl:flex">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold">{zhCN.runtimeEnvironment}</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">{zhCN.runtimeDescription}</p>
          </div>
            <Button aria-label="连接设置" size="icon" variant="ghost" className="size-8" onClick={openConnectionSettings}><Settings2 size={15} /></Button>
        </div>

        <section className="rounded-xl border border-border bg-card p-3.5">
          <div className="flex items-center gap-2.5">
            <div className={`flex size-8 items-center justify-center rounded-lg ${isOnline ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
              <Layers3 size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium">DeepSeek Harness</div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{runtime.message}</div>
            </div>
            <RuntimeDot state={runtime.state} />
          </div>
          <div className="mt-3 border-t border-border/70 pt-3">
            <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">{zhCN.connectionStatus}</span><span className="font-medium">{runtimeLabel(runtime.state)}</span></div>
            <div className="mt-2 flex justify-between text-[11px]"><span className="text-muted-foreground">{zhCN.runtimeVersion}</span><span className="font-mono text-muted-foreground">{runtime.state === 'ready' ? runtime.version : '—'}</span></div>
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-border bg-card p-3.5">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium"><FolderKanban size={14} className="text-primary" /> {zhCN.workspace}</div>
          <div className="rounded-lg bg-muted/70 px-3 py-3">
            <p className="break-all text-[11px] font-medium">{runtimeConfig.workspace || '使用默认工作文件夹'}</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{zhCN.workspaceProcessingNote}</p>
          </div>
          <Button className="mt-3 w-full text-xs" size="sm" variant="outline" onClick={openWorkspacePicker}>{isOnline ? zhCN.switchWorkspace : zhCN.setWorkspace}</Button>
        </section>

        <section className="mt-4 rounded-xl border border-border bg-card p-3.5">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium"><Activity size={14} className="text-primary" /> {zhCN.currentTask}</div>
          <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-4 py-5 text-center">
            <div className={`mb-2 flex size-8 items-center justify-center rounded-full ${isSending ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{isSending ? <Activity className="animate-pulse" size={15} /> : <Check size={15} />}</div>
            <p className="text-[11px] font-medium">{isSending ? zhCN.harnessProcessing : zhCN.noRunningTask}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{isSending ? zhCN.completionWillAppear : zhCN.sendToSeeStatus}</p>
          </div>
        </section>

        <div className="mt-auto pt-5">
          <div className="flex items-center gap-2 rounded-lg px-1 text-[10px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-warning" />
            {runtime.state === 'offline' ? zhCN.notConnected : runtime.message}
          </div>
        </div>
      </aside>
    </div>
  )
}

function itemLabel(view: View) {
  return navItems.find(item => item.id === view)?.label ?? '新对话'
}

function runtimeLabel(state: RuntimeStatus['state']) {
  if (state === 'ready') return '已连接'
  if (state === 'starting') return '正在启动'
  if (state === 'faulted') return '连接异常'
  return '未连接'
}

function RuntimeDot({ state }: { state: RuntimeStatus['state'] }) {
  const className = state === 'ready'
    ? 'bg-success'
    : state === 'faulted'
      ? 'bg-destructive'
      : state === 'starting'
        ? 'bg-warning animate-pulse'
        : 'bg-muted-foreground/45'
  return <span className={`size-2 shrink-0 rounded-full ${className}`} aria-label={runtimeLabel(state)} />
}

function RuntimeBadge({ state }: { state: RuntimeStatus['state'] }) {
  const styles = state === 'ready'
    ? 'border-success/20 bg-success/8 text-success'
    : state === 'faulted'
      ? 'border-destructive/20 bg-destructive/8 text-destructive'
      : 'border-border bg-muted/60 text-muted-foreground'
  return (
    <span className={`inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-[10px] font-medium ${styles}`}>
      <RuntimeDot state={state} />
      {runtimeLabel(state)}
    </span>
  )
}

function FeatureCard({ icon, label, detail, onClick }: { icon: ReactNode; label: string; detail: string; onClick(): void }) {
  return (
    <button className="group rounded-xl border border-border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md" onClick={onClick} type="button">
      <div className="mb-3 flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">{icon}</div>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{detail}</p>
    </button>
  )
}

function RuntimeField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  return (
    <label className="block text-[11px] font-medium text-foreground">
      {label}
      <input
        className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onChange={event => onChange(event.target.value)}
        value={value}
      />
    </label>
  )
}

function HostRequestDialog({ request, onResolve }: {
  request: DesktopHostRequest
  onResolve(result: Record<string, unknown>): Promise<void>
}) {
  const [isSubmitting, setSubmitting] = useState(false)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [custom, setCustom] = useState<Record<string, string>>({})
  const questions = Array.isArray(request.params.questions) ? request.params.questions as HostQuestion[] : []

  async function resolve(result: Record<string, unknown>) {
    setSubmitting(true)
    try {
      await onResolve(result)
    } catch {
      setSubmitting(false)
    }
  }

  if (request.method === 'approval/request') {
    const toolName = String(request.params.toolName ?? '工具')
    const reason = String(request.params.reason ?? 'Harness 请求允许此操作。')
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]" role="presentation">
        <section aria-labelledby="approval-title" aria-modal="true" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" role="dialog">
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-warning/10 text-warning"><Zap size={19} /></div>
          <h2 className="text-base font-semibold" id="approval-title">{zhCN.approvalTitle}</h2>
          <p className="mt-2 text-sm font-medium">{toolName}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{reason}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button disabled={isSubmitting} variant="outline" onClick={() => void resolve({ outcome: 'rejected' })}>{zhCN.reject}</Button>
            <Button disabled={isSubmitting} variant="primary" onClick={() => void resolve({ outcome: 'allowed-once' })}>{isSubmitting ? zhCN.processing : zhCN.allowOnce}</Button>
          </div>
        </section>
      </div>
    )
  }

  if (request.method !== 'user-question/ask' || questions.length === 0) return null

  const canSubmit = questions.every(question =>
    (selected[question.id]?.length ?? 0) > 0 || Boolean(custom[question.id]?.trim()),
  )
  const answers = questions.map(question => {
    const customAnswer = custom[question.id]?.trim()
    return {
      id: question.id,
      selected: customAnswer && !question.multiSelect ? [] : selected[question.id] ?? [],
      ...(customAnswer ? { custom: customAnswer } : {}),
    }
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]" role="presentation">
      <section aria-labelledby="question-title" aria-modal="true" className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl" role="dialog">
        <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><CircleHelp size={19} /></div>
        <h2 className="text-base font-semibold" id="question-title">{zhCN.questionTitle}</h2>
        {questions.length === 0 && <p className="mt-3 text-xs text-destructive">{zhCN.questionInvalid}</p>}
        <div className="mt-4 space-y-5">
          {questions.map(question => (
            <div key={question.id} className="border-t border-border/70 pt-4">
              {question.header && <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">{question.header}</p>}
              <p className="text-sm font-medium">{question.question}</p>
              {question.detail && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{question.detail}</p>}
              {!!question.options?.length && (
                <div className="mt-3 space-y-2">
                  {question.options.map(option => {
                    const active = (selected[question.id] ?? []).includes(option.label)
                    return (
                      <button
                        aria-pressed={active}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${active ? 'border-primary bg-accent/60' : 'border-border hover:border-primary/40'}`}
                        key={option.label}
                        onClick={() => setSelected(current => {
                          const values = current[question.id] ?? []
                          const next = question.multiSelect
                            ? active ? values.filter(value => value !== option.label) : [...values, option.label]
                            : active ? [] : [option.label]
                          return { ...current, [question.id]: next }
                        })}
                        type="button"
                      >
                        <span className="text-xs font-medium">{option.label}</span>
                        {option.description && <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{option.description}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              <textarea
                aria-label={`${question.question}，补充回答`}
                className="mt-3 min-h-16 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={event => setCustom(current => ({ ...current, [question.id]: event.target.value }))}
                placeholder="补充说明（可选）"
                value={custom[question.id] ?? ''}
              />
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button disabled={isSubmitting} variant="outline" onClick={() => void resolve({ cancelled: true })}>{zhCN.cancel}</Button>
          <Button disabled={isSubmitting || !canSubmit || questions.length === 0} variant="primary" onClick={() => void resolve({ answers })}>{isSubmitting ? zhCN.submitting : zhCN.submitAnswers}</Button>
        </div>
      </section>
    </div>
  )
}

export default App
