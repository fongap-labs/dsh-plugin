/**
 * Delta-first launcher. Harness still performs its own signed-cookie exchange.
 * Hide the native chat while probing; expose it only if Delta is unavailable.
 * Successful navigation replaces the native document (never two chat UIs).
 */
const DESKTOP_PATH = '/dsh-ui-delta/app'
const STATUS_PATH = '/dsh-ui-delta/app/status'

function activateIndependentDesktop(ctx: HarnessClientContext): void {
  const url = new URL(window.location.href)
  // Preserve official launch-token handling, nested tools and plugin routes.
  if (window.self !== window.top || !['http:', 'https:'].includes(url.protocol) ||
      url.pathname !== '/' || url.searchParams.has('token') ||
      url.searchParams.get('delta-native-fallback') === '1') return

  const controller = new AbortController()
  let isActive = true
  ctx.effect(() => {
    const root = document.documentElement
    const previousVisibility = root.style.visibility
    root.style.visibility = 'hidden'
    const fallback = () => {
      if (isActive) root.style.visibility = previousVisibility
    }
    void (async () => {
      try {
        const status = await fetch(STATUS_PATH, {
          method: 'GET', credentials: 'same-origin', cache: 'no-store',
          redirect: 'error', signal: controller.signal,
        })
        if (!isActive || status.status !== 200) { fallback(); return }
        const payload: unknown = await status.json()
        if (!isActive || !payload || typeof payload !== 'object' ||
            (payload as { authenticated?: unknown }).authenticated !== true ||
            (payload as { desktop?: unknown }).desktop !== 'Delta Desktop') {
          fallback()
          return
        }
        // Verify the actual document route before replacing the native page.
        const page = await fetch(DESKTOP_PATH, {
          method: 'HEAD', credentials: 'same-origin', cache: 'no-store',
          redirect: 'error', signal: controller.signal,
        })
        if (!isActive || page.status !== 200 ||
            !(page.headers.get('content-type') || '').includes('text/html')) {
          fallback()
          return
        }
        // Never carry launch tokens, query parameters or fragments into Delta.
        window.location.replace(new URL(DESKTOP_PATH, url.origin).href)
      } catch {
        fallback()
      }
    })()
    return () => {
      isActive = false
      controller.abort()
      root.style.visibility = previousVisibility
    }
  }, 'dsh-desktop-delta: delta-first authenticated entry')
}

window.__ModuleLoader__.load({
  id: '@fongap-labs/dsh-desktop-delta',
  factory(_require: HarnessRequire): HarnessModuleExports {
    return {
      inject: [],
      apply(ctx: HarnessClientContext): void {
        activateIndependentDesktop(ctx)
      },
    }
  },
})
