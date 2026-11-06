/**
 * Delta Desktop client bootstrap.
 *
 * The native Harness page completes the official launch-token -> signed-Cookie
 * exchange. Only after the independent route accepts that Cookie do we replace
 * the native page with Delta Desktop on the same origin. Never transfer launch
 * tokens, copy cookies, or bypass connection.admit().
 */
const DESKTOP_PATH = '/dsh-ui-delta/app'
const STATUS_PATH = '/dsh-ui-delta/app/status'

function activateIndependentDesktop(ctx: HarnessClientContext): void {
  const url = new URL(window.location.href)
  // The plugin also loads on other Harness surfaces; never hijack plugins,
  // login callbacks, another embedded tab, or the independent document.
  if (window.self !== window.top || !['http:', 'https:'].includes(url.protocol) ||
      url.pathname !== '/' || url.searchParams.has('token')) return

  const controller = new AbortController()
  let active = true
  ctx.effect(() => {
    void (async () => {
      try {
        const status = await fetch(STATUS_PATH, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal,
        })
        // On an unauthenticated or absent Host route, keep native Harness usable.
        if (!active || !status.ok || status.status !== 200) return
        const payload: unknown = await status.json()
        if (!active || !payload || typeof payload !== 'object' ||
            (payload as { authenticated?: unknown }).authenticated !== true ||
            (payload as { desktop?: unknown }).desktop !== 'Delta Desktop') return
        // Drop any native URL query and fragment; never forward launch material.
        window.location.replace(new URL(DESKTOP_PATH, url.origin).href)
      } catch {
        // A failed health probe must not strand the user on a blank page.
      }
    })()
    return () => { active = false; controller.abort() }
  }, 'dsh-desktop-delta: authenticated independent entry')
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
