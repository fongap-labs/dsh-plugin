/**
 * Delta-first plugin bootstrap.
 *
 * The official Harness launch flow owns authentication. The client module
 * never reads, forwards or stores a launch token. The signed same-origin
 * cookie is verified by the protected Delta routes before navigation.
 */
const DESKTOP_PATH = '/dsh-ui-delta/app'
const STATUS_PATH = '/dsh-ui-delta/app/status'

function activateIndependentDesktop(ctx: HarnessClientContext): void {
  const url = new URL(window.location.href)
  // A one-shot fallback remains in native Harness, without a redirect loop.
  // Electron Desktop owns dsh-app://app/ and forwards other paths to its
  // authenticated Host. Reject other custom-scheme or unowned documents.
  const isDesktopShell = url.protocol === 'dsh-app:' && url.hostname === 'app'
  if (window.self !== window.top ||
      (!['http:', 'https:'].includes(url.protocol) && !isDesktopShell) ||
      url.pathname !== '/' || url.searchParams.get('delta-native-fallback') === '1') return

  const isOfficialLaunch = !isDesktopShell && url.searchParams.has('token')
  const controller = new AbortController()
  let isActive = true
  ctx.effect(() => {
    const root = document.documentElement
    const previousVisibility = root.style.visibility
    // Allow the official token-to-Cookie handoff UI to complete first.
    if (!isOfficialLaunch) root.style.visibility = 'hidden'
    const fallback = () => {
      if (isActive) root.style.visibility = previousVisibility
    }
    const startupTimeout = setTimeout(() => { controller.abort(); fallback() }, 8000)
    void (async () => {
      try {
        // Official token launches may register the Cookie after the client
        // plugin loads. Retry the protected route, not the raw token.
        for (let attempt = 0; isActive && attempt < (isOfficialLaunch ? 24 : 1); attempt++) {
          try {
            const status = await fetch(STATUS_PATH, {
              method: 'GET', credentials: 'same-origin', cache: 'no-store',
              referrerPolicy: 'no-referrer', redirect: 'error',
              signal: controller.signal,
            })
            if (!isActive) return
            if (status.status !== 200) {
              if (!isOfficialLaunch) { fallback(); return }
            } else {
              const payload: unknown = await status.json()
              if (payload && typeof payload === 'object' &&
                  (payload as { authenticated?: unknown }).authenticated === true &&
                  (payload as { desktop?: unknown }).desktop === 'Delta Desktop') {
                // Verify actual HTML before replacing the one native document.
                const page = await fetch(DESKTOP_PATH, {
                  method: 'HEAD', credentials: 'same-origin', cache: 'no-store',
                  referrerPolicy: 'no-referrer', redirect: 'error',
                  signal: controller.signal,
                })
                if (!isActive) return
                if (page.status === 200 &&
                    (page.headers.get('content-type') || '').includes('text/html')) {
                  // No query or fragment, in particular no launch material.
                  // Custom-scheme URL.origin is "null"; keep the trusted
                  // document's scheme/authority and drop all launch queries.
                  window.location.replace(new URL(DESKTOP_PATH, url.href).href)
                  return
                }
                if (!isOfficialLaunch) { fallback(); return }
              } else if (!isOfficialLaunch) {
                fallback()
                return
              }
            }
          } catch {
            if (!isOfficialLaunch) { fallback(); return }
          }
          if (isActive && isOfficialLaunch) {
            await new Promise<void>(resolve => setTimeout(resolve, 300))
          }
        }
        fallback()
      } finally {
        clearTimeout(startupTimeout)
      }
    })()
    return () => {
      isActive = false
      controller.abort()
      clearTimeout(startupTimeout)
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
