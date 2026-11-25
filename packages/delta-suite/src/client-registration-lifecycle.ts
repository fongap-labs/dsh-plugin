/** Synchronous rollback for a group of public browser registrations.
 * Cordis owns the group lifetime; this helper owns only returned disposers.
 */
function registerClientFeatureGroup(install: (track: (release: unknown) => void) => void): () => void {
  const releases: Array<() => void> = []
  let isDisposed = false
  const dispose = (): void => {
    if (isDisposed) return
    isDisposed = true
    for (let index = releases.length - 1; index >= 0; index--) {
      try { releases[index]() } catch { /* continue releasing sibling registrations */ }
    }
    releases.length = 0
  }
  const track = (release: unknown): void => {
    // Older public Slot APIs may not return a disposer. Their registrations
    // remain Cordis-owned; do not invent a private removal mechanism.
    if (typeof release === 'function') releases.push(release as () => void)
  }
  try {
    install(track)
    return dispose
  } catch (error) {
    dispose()
    throw error
  }
}

/** Give each public service binding its own generation, even for the same service object. */
function createClientBindingLifetime() {
  let generation = 0
  return (install: () => void, clear: () => void) => {
    const token = ++generation
    let isActive = true
    const isCurrent = (): boolean => isActive && token === generation
    const dispose = (): void => {
      if (!isActive) return
      const shouldClear = isCurrent()
      isActive = false
      if (shouldClear) clear()
    }
    try { install() }
    catch (error) {
      try { dispose() } catch { /* preserve the installation error */ }
      throw error
    }
    return { isCurrent, dispose }
  }
}

/** Narrow read-only Patch for older Hosts: observe only the document language attribute.
 * No subtree scanning, mutations, polling, or Host preference writes.
 */
function createClientLocaleFallback(sync: () => void) {
  let observer: MutationObserver | undefined
  let isDisposed = false
  let generation = 0
  const stop = (): void => {
    generation++
    const previous = observer
    observer = undefined
    try { previous?.disconnect() } catch { /* optional compatibility path */ }
  }
  const start = (): void => {
    if (isDisposed || observer) return
    const token = ++generation
    try {
      if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.documentElement) return
      observer = new MutationObserver(() => {
        if (!isDisposed && token === generation) sync()
      })
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    } catch { stop() }
  }
  return { start, stop, dispose: () => { isDisposed = true; stop() } }
}
