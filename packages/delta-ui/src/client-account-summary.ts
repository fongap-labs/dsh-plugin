/** Read only the native account owner's published state and explicitly requested
 * wallet balances. No independent login, account stream, polling or persistence.
 */
interface ClientAccountUi {
  getSnapshot(): { view?: { status?: unknown; links?: { usageUrl?: unknown } }; failed?: boolean }
  clientMetadata(locale: string): { version: string; locale: string; timezoneOffsetSeconds: number }
}
interface ClientAccountRemote {
  getBalance(metadata: ReturnType<ClientAccountUi['clientMetadata']>): Promise<{ ok: boolean; value?: unknown }>
}
interface ClientAccountAccess {
  whenAccess(action: 'account/watch' | 'account/getBalance', install: () => () => void): () => void
}
type AccountWalletSummary = Readonly<{ currency: 'CNY' | 'USD'; balance: string }>
type AccountSummarySnapshot = Readonly<{
  status: 'hidden' | 'signed-out' | 'ready' | 'loading' | 'loaded' | 'unavailable'
  usageUrl?: string
  wallets: readonly AccountWalletSummary[]
  bonusWallets: readonly AccountWalletSummary[]
}>
const EMPTY_ACCOUNT_SUMMARY: AccountSummarySnapshot = Object.freeze({
  status: 'hidden', wallets: Object.freeze([]), bonusWallets: Object.freeze([]),
})
function safeAccountUsageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/usage') return
    return url.href
  } catch { return undefined }
}
function readAccountWallets(value: unknown): readonly AccountWalletSummary[] | undefined {
  if (!Array.isArray(value) || value.length > 2) return
  const seen = new Set<string>()
  const result: AccountWalletSummary[] = []
  for (const item of value) {
    if (!item || (item.currency !== 'CNY' && item.currency !== 'USD') ||
        seen.has(item.currency) || typeof item.balance !== 'string' ||
        !/^-?\d{1,32}(?:\.\d{1,32})?$/.test(item.balance)) return
    seen.add(item.currency)
    result.push(Object.freeze({ currency: item.currency, balance: item.balance }))
  }
  return Object.freeze(result)
}
function createClientAccountSummary() {
  let snapshot = EMPTY_ACCOUNT_SUMMARY
  const listeners = new Set<() => void>()
  let isDisposed = false
  let revokeBinding: (() => void) | undefined
  let refreshCurrent: (() => Promise<void>) | undefined
  let usageCurrent: (() => string | undefined) | undefined
  const publish = (next: AccountSummarySnapshot): void => {
    if (snapshot === next) return
    snapshot = Object.freeze(next)
    for (const listener of [...listeners]) {
      try { listener() } catch {}
    }
  }
  const bind = (scope: ClientContext): (() => void) => {
    if (isDisposed) return () => {}
    try { revokeBinding?.() } catch { /* old grant is already invalidated */ }
    const ui = scope.accountUi
    const access = scope.remoteAccess
    const remote = scope.remote?.account
    if (!ui || !access || !remote || typeof scope.on !== 'function' ||
        typeof ui.getSnapshot !== 'function' || typeof ui.clientMetadata !== 'function' ||
        typeof access.whenAccess !== 'function' || typeof remote.getBalance !== 'function') return () => {}
    let isBound = true
    let stopAccess: (() => void) | undefined
    const dispose = (): void => {
      if (!isBound) return
      isBound = false
      if (revokeBinding === dispose) revokeBinding = undefined
      try { stopAccess?.() } finally {
        refreshCurrent = undefined
        usageCurrent = undefined
        publish(EMPTY_ACCOUNT_SUMMARY)
      }
    }
    revokeBinding = dispose
    try {
      stopAccess = access.whenAccess('account/watch', () => access.whenAccess('account/getBalance', () => {
        if (!isBound || isDisposed) return () => {}
        let isAllowed = true
        let generation = 0
        let confirmedView: ReturnType<ClientAccountUi['getSnapshot']>['view']
        const read = (): void => {
          generation++
          confirmedView = undefined
          if (!isAllowed || !isBound || isDisposed) return
          try {
            const state = ui.getSnapshot()
            if (state.failed || !state.view) { publish(EMPTY_ACCOUNT_SUMMARY); return }
            if (state.view.status === 'signed-out') {
              publish({ ...EMPTY_ACCOUNT_SUMMARY, status: 'signed-out' }); return
            }
            if (state.view.status !== 'credential-stored') { publish(EMPTY_ACCOUNT_SUMMARY); return }
            confirmedView = state.view
            publish({ ...EMPTY_ACCOUNT_SUMMARY, status: 'ready', usageUrl: safeAccountUsageUrl(state.view.links?.usageUrl) })
          } catch { publish(EMPTY_ACCOUNT_SUMMARY) }
        }
        // Re-read the native snapshot at the user gesture, not just when the
        // account event arrives. An old rendered action must not target a new
        // sign-in during the interval before the event reaches this listener.
        const isConfirmedViewCurrent = (): boolean => {
          if (!isAllowed || !isBound || isDisposed || !confirmedView) return false
          try {
            const state = ui.getSnapshot()
            if (!state.failed && state.view === confirmedView && state.view.status === 'credential-stored') return true
          } catch {}
          read()
          return false
        }
        const usage = (): string | undefined => isConfirmedViewCurrent() ? snapshot.usageUrl : undefined
        const refresh = async (): Promise<void> => {
          if (!isConfirmedViewCurrent() || !['ready', 'loaded', 'unavailable'].includes(snapshot.status)) return
          const generationAtStart = ++generation
          const current = (): boolean => isAllowed && isBound && !isDisposed && generation === generationAtStart
          const usageUrl = snapshot.usageUrl
          publish({ ...EMPTY_ACCOUNT_SUMMARY, status: 'loading', usageUrl })
          try {
            const result = await remote.getBalance(ui.clientMetadata(currentHostLocale || language()))
            if (!current()) return
            if (!isConfirmedViewCurrent()) return
            const value = result.ok && result.value && typeof result.value === 'object'
              ? result.value as { status?: unknown; value?: unknown; bonusWallets?: unknown } : undefined
            const wallets = value?.status === 'ready' ? readAccountWallets(value.value) : undefined
            const bonusWallets = value?.status === 'ready' ? readAccountWallets(value.bonusWallets) : undefined
            if (!wallets || !bonusWallets) throw new Error('wallets unavailable')
            publish({ status: 'loaded', usageUrl, wallets, bonusWallets })
          } catch {
            if (current() && isConfirmedViewCurrent()) publish({ ...EMPTY_ACCOUNT_SUMMARY, status: 'unavailable', usageUrl })
          }
        }
        const stopChange = scope.on!('account-ui/change', read)
        let stopRefresh: (() => void) | undefined
        try { stopRefresh = scope.on!('account-ui/refresh', read) }
        catch (error) { stopChange(); throw error }
        refreshCurrent = refresh
        usageCurrent = usage
        read()
        return () => {
          isAllowed = false
          generation++
          if (refreshCurrent === refresh) {
            refreshCurrent = undefined
            usageCurrent = undefined
            publish(EMPTY_ACCOUNT_SUMMARY)
          }
          try { stopRefresh?.() } finally { stopChange() }
        }
      }))
    } catch { dispose() }
    return dispose
  }
  return {
    bind,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (isDisposed) return () => {}
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    refresh: async (expected?: AccountSummarySnapshot) => {
      if (expected && expected !== snapshot) return
      await refreshCurrent?.()
    },
    usageUrlFor(expected: AccountSummarySnapshot): string | undefined {
      if (expected !== snapshot) return
      return usageCurrent?.()
    },
    dispose() {
      if (isDisposed) return
      isDisposed = true
      try { revokeBinding?.() } catch {}
      refreshCurrent = undefined
      usageCurrent = undefined
      publish(EMPTY_ACCOUNT_SUMMARY)
      listeners.clear()
    },
  }
}
type ClientAccountSummary = ReturnType<typeof createClientAccountSummary>
const clientAccountSummaries = new WeakMap<DeltaController, ClientAccountSummary>()
