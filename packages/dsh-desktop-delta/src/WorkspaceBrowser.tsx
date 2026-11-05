import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, FileText, Folder, RefreshCw } from 'lucide-react'
import { Button } from './components/ui/button'
import { desktopHost } from './lib/desktop-host-client'
import type { WorkspaceListing, WorkspacePreview } from './lib/desktop-host-contract'
import { zhCN } from './locales/zh-CN'

export function WorkspaceBrowser({
  isAvailable,
  onChooseWorkspace,
}: {
  isAvailable: boolean
  onChooseWorkspace: () => void
}) {
  const [relativePath, setRelativePath] = useState('')
  const [refreshCounter, setRefreshCounter] = useState(0)
  const [listing, setListing] = useState<WorkspaceListing | null>(null)
  const [preview, setPreview] = useState<WorkspacePreview | null>(null)
  const [browseError, setBrowseError] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isPreviewLoading, setPreviewLoading] = useState(false)
  const previewEpoch = useRef(0)

  useEffect(() => {
    let isStale = false
    setPreview(null)
    setPreviewError('')
    previewEpoch.current += 1
    if (!isAvailable) {
      setListing(null)
      setBrowseError('')
      setIsLoading(false)
      return () => { isStale = true }
    }
    setIsLoading(true)
    setBrowseError('')
    void desktopHost.listWorkspaceFiles(relativePath).then(
      value => {
        if (isStale) return
        setListing(value)
        setIsLoading(false)
      },
      () => {
        if (isStale) return
        setListing(null)
        setBrowseError(zhCN.workspaceBrowseError)
        setIsLoading(false)
      },
    )
    return () => { isStale = true }
  }, [isAvailable, relativePath, refreshCounter])

  function openPreview(filePath: string) {
    const epoch = ++previewEpoch.current
    setPreview(null)
    setPreviewError('')
    setPreviewLoading(true)
    void desktopHost.previewWorkspaceFile(filePath).then(
      value => {
        if (epoch !== previewEpoch.current) return
        setPreview(value)
        setPreviewLoading(false)
      },
      () => {
        if (epoch !== previewEpoch.current) return
        setPreviewError(zhCN.workspacePreviewError)
        setPreviewLoading(false)
      },
    )
  }

  function moveToDirectory(path: string) {
    previewEpoch.current += 1
    setPreviewLoading(false)
    setRelativePath(path)
  }

  function moveUp() {
    const parts = relativePath.split('/')
    parts.pop()
    moveToDirectory(parts.join('/'))
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{zhCN.workspaceFiles}</h1>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{zhCN.workspaceFilesDescription}</p>
          <p className="mt-1 text-xs text-muted-foreground">{zhCN.workspaceFilePreviewLimit}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onChooseWorkspace}>
          <Folder size={14} /> {zhCN.workspaceFolderSelect}
        </Button>
      </div>
      {!isAvailable ? (
        <p className="mt-6 text-xs text-muted-foreground">{zhCN.workspaceFilesUnavailable}</p>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Button size="sm" variant="outline" disabled={!relativePath || isLoading} onClick={moveUp}>
              <ArrowLeft size={14} />{zhCN.workspaceBrowseUp}
            </Button>
            <Button size="sm" variant="outline" disabled={isLoading} onClick={() => setRefreshCounter(value => value + 1)}>
              <RefreshCw size={14} />{zhCN.workspaceBrowseRefresh}
            </Button>
            <span className="min-w-0 break-all text-muted-foreground">
              {listing?.rootName || zhCN.workspace} / {relativePath}
            </span>
          </div>
          {browseError && <p className="text-xs text-destructive" role="alert">{browseError}</p>}
          {isLoading && <p className="text-xs text-muted-foreground">{zhCN.processing}</p>}
          {listing?.isTruncated && <p className="text-xs text-muted-foreground">{zhCN.workspaceBrowseTruncated}</p>}
          <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <div aria-label={zhCN.workspaceFiles} className="max-h-[420px] space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {!isLoading && listing?.entries.length === 0 && <p className="p-3 text-xs text-muted-foreground">{zhCN.workspaceFolderEmpty}</p>}
              {listing?.entries.map(entry => (
                <button
                  key={entry.relativePath}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => entry.kind === 'directory' ? moveToDirectory(entry.relativePath) : openPreview(entry.relativePath)}
                  type="button"
                >
                  {entry.kind === 'directory' ? <Folder className="shrink-0 text-primary" size={15} /> : <FileText className="shrink-0 text-muted-foreground" size={15} />}
                  <span className="min-w-0 break-all">{entry.name}</span>
                </button>
              ))}
            </div>
            <div className="min-h-48 min-w-0 rounded-xl border border-border p-3">
              <p className="mb-3 break-all text-xs font-medium">{preview?.relativePath ?? zhCN.workspaceFilePreviewTitle}</p>
              {isPreviewLoading ? <p className="text-xs text-muted-foreground">{zhCN.processing}</p> :
                previewError ? <p className="text-xs text-destructive" role="alert">{previewError}</p> :
                  preview ? <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">{preview.text}</pre> :
                    <p className="text-xs text-muted-foreground">{zhCN.workspaceFilePreviewNotSelected}</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
