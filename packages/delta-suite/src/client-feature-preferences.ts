/** Suite-owned, non-sensitive presentation preferences. Keep the persisted key
 * and schema compatible with previously installed Suite versions.
 */
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
function isFeaturePreferenceKey(key: unknown): key is FeaturePreferenceKey {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_FEATURE_PREFERENCES, key)
}
function persistFeaturePreferences(value: FeaturePreferences): void {
  try { localStorage.setItem(FEATURE_STORAGE_KEY, JSON.stringify(value)) }
  catch { /* preference remains available for this runtime */ }
}
function readFeaturePreferences(): FeaturePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(FEATURE_STORAGE_KEY) ?? 'null') as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const saved = value as Record<string, unknown>
      const preferences = Object.freeze({
        showDeepSeekAccountInfo: typeof saved.showDeepSeekAccountInfo === 'boolean' ? saved.showDeepSeekAccountInfo : true,
        showModelInfo: typeof saved.showModelInfo === 'boolean' ? saved.showModelInfo : true,
        inputOptimization: typeof saved.inputOptimization === 'boolean' ? saved.inputOptimization : true,
      })
      const keys = Object.keys(saved)
      if (keys.some(isFeaturePreferenceKey) && keys.some(key => !isFeaturePreferenceKey(key))) {
        persistFeaturePreferences(preferences)
      }
      return preferences
    }
  } catch { /* blocked or malformed preference storage falls back to defaults */ }
  return DEFAULT_FEATURE_PREFERENCES
}
let featurePreferences = readFeaturePreferences()
const featurePreferenceListeners = new Set<() => void>()
function updateFeaturePreference(key: FeaturePreferenceKey, isEnabled: boolean): void {
  if (!isFeaturePreferenceKey(key) || typeof isEnabled !== 'boolean' || featurePreferences[key] === isEnabled) return
  replaceFeaturePreferences({ ...featurePreferences, [key]: isEnabled })
}
function replaceFeaturePreferences(next: FeaturePreferences): void {
  if (featurePreferences.showDeepSeekAccountInfo === next.showDeepSeekAccountInfo &&
      featurePreferences.showModelInfo === next.showModelInfo &&
      featurePreferences.inputOptimization === next.inputOptimization) return
  featurePreferences = Object.freeze({
    showDeepSeekAccountInfo: next.showDeepSeekAccountInfo,
    showModelInfo: next.showModelInfo,
    inputOptimization: next.inputOptimization,
  })
  persistFeaturePreferences(featurePreferences)
  for (const listener of [...featurePreferenceListeners]) {
    if (!featurePreferenceListeners.has(listener)) continue
    try { listener() } catch { /* a failed view must not block independent consumers */ }
  }
}
function subscribeFeaturePreferences(listener: () => void): () => void {
  featurePreferenceListeners.add(listener)
  return () => { featurePreferenceListeners.delete(listener) }
}
function useFeaturePreferences(React: ReactApi): FeaturePreferences {
  return React.useSyncExternalStore(subscribeFeaturePreferences, () => featurePreferences)
}

/** Portable preferences only; never serialize native settings or security state. */
type ClientPreferenceBackup = Readonly<{
  format: 'delta-suite-preferences'
  schema: 1
  mode: Mode
  preferences: FeaturePreferences
}>
const MAX_PREFERENCE_BACKUP_LENGTH = 4096
function createClientPreferenceBackup(mode: Mode): string {
  const value: ClientPreferenceBackup = {
    format: 'delta-suite-preferences', schema: 1, mode,
    preferences: {
      showDeepSeekAccountInfo: featurePreferences.showDeepSeekAccountInfo,
      showModelInfo: featurePreferences.showModelInfo,
      inputOptimization: featurePreferences.inputOptimization,
    },
  }
  return JSON.stringify(value, null, 2)
}
function parseClientPreferenceBackup(text: string): ClientPreferenceBackup | undefined {
  if (typeof text !== 'string' || text.length > MAX_PREFERENCE_BACKUP_LENGTH) return
  const exactRecord = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
  try {
    const value: unknown = JSON.parse(text)
    if (!exactRecord(value, ['format', 'schema', 'mode', 'preferences']) ||
        value.format !== 'delta-suite-preferences' || value.schema !== 1 ||
        (value.mode !== 'delta' && value.mode !== 'official')) return
    const prefs = value.preferences
    if (!exactRecord(prefs, ['showDeepSeekAccountInfo', 'showModelInfo', 'inputOptimization']) ||
        typeof prefs.showDeepSeekAccountInfo !== 'boolean' ||
        typeof prefs.showModelInfo !== 'boolean' || typeof prefs.inputOptimization !== 'boolean') return
    return Object.freeze({
      format: 'delta-suite-preferences', schema: 1, mode: value.mode,
      preferences: Object.freeze({
        showDeepSeekAccountInfo: prefs.showDeepSeekAccountInfo,
        showModelInfo: prefs.showModelInfo, inputOptimization: prefs.inputOptimization,
      }),
    })
  } catch { return undefined }
}
function restoreClientPreferenceBackup(controller: DeltaController, text: string): 'applied' | 'invalid' | 'unavailable' {
  const backup = parseClientPreferenceBackup(text)
  if (!backup) return 'invalid'
  if (!controller.isActive()) return 'unavailable'
  // A failed appearance operation must not silently import other settings.
  controller.setMode(backup.mode)
  const state = controller.getSnapshot()
  if (!controller.isActive() || state.error || state.mode !== backup.mode) return 'unavailable'
  replaceFeaturePreferences(backup.preferences)
  return 'applied'
}
