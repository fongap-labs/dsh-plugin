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
  featurePreferences = Object.freeze({ ...featurePreferences, [key]: isEnabled })
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
