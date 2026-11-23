import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const client = read('packages/delta-suite/src/client.ts')

test('Delta Suite does not rewrite Harness Slots internals or built-in contributions', () => {
  for (const forbidden of [
    /__deltaWrapped_/, /slotsObj\??\._core/, /slotsObj\??\._host/,
    /target\[methodName\]\s*=/, /wrapSlotMethod\(/,
    /filterSlotEntries\(/, /\bslotRestorers\b/,
  ]) assert.doesNotMatch(client, forbidden)
  assert.match(client, /scope\.slots\.inject\('settings\.section'/)
  assert.match(client, /scope\.slots\.inject\('conversation\.chat\.assistant-actions'/)
})

test('Delta Suite does not mutate Cordis originals or the Host locale service', () => {
  for (const forbidden of [
    /cordis\.original/, /unwrapCordisOriginal/, /__deltaLocaleAttached/,
    /__deltaTranslatePatched/, /__deltaPatched/, /__deltaLocaleHooked/,
    /localeRuntime\.(?:translate|register)\s*=/,
    /rawSlots\.installLocale\s*=/,
    /\brestoreLocaleOnDispose\b/,
  ]) assert.doesNotMatch(client, forbidden)
  assert.match(client, /DICTIONARIES\[language\(\)\]/)
  assert.match(client, /stopAppearance\(\)/)
  assert.match(client, /controller\.dispose\(\)/)
})

test('clean-up still keeps native appearance and unrelated UI resource ownership', () => {
  assert.match(client, /observer\?\.disconnect\(\)/)
  assert.doesNotMatch(client, /stopPrivacyGuards\(\)|installClientPrivacyGuards\(/)
  assert.doesNotMatch(client, /installClientVisionBridge|stopVisionBridge|data-composer-input/)
  assert.match(client, /tag\.parentNode\?\.removeChild\(tag\)/)
  // Legacy DOM compatibility is intentionally separate and must be migrated later.
  assert.match(client, /function installSidebarCompatibility/)
  assert.doesNotMatch(client, /installSidebarCompatibility\(controller\)/)
})


const zhCopy = JSON.parse(read('packages/delta-suite/locale/zh.json'))
const enCopy = JSON.parse(read('packages/delta-suite/locale/en.json'))
const flattenCopy = (value, prefix = '') =>
  Object.entries(value).flatMap(([key, entry]) => typeof entry === 'string'
    ? [[prefix + key, entry]]
    : flattenCopy(entry, prefix + key + '.'))
const placeholders = value => [...value.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_.-]*)\}/g)]
  .map(match => match[1]).sort()

test('Suite zh and en dictionaries have identical nonempty keys and placeholders', () => {
  const zh = new Map(flattenCopy(zhCopy))
  const en = new Map(flattenCopy(enCopy))
  assert.deepEqual([...zh.keys()].sort(), [...en.keys()].sort())
  for (const [key, text] of zh) {
    assert.ok(text.trim(), key + ' missing zh copy')
    assert.ok(en.get(key)?.trim(), key + ' missing en copy')
    assert.deepEqual(placeholders(text), placeholders(en.get(key)), key + ' placeholder mismatch')
    assert.doesNotMatch(text + en.get(key), /[\u200B\uFEFF]/, key + ' contains forbidden format characters')
  }
})

test('navigation and palette copy uses central dictionaries without dead Gateway keys', () => {
  assert.equal('gatewayEffort' in zhCopy, false)
  assert.equal('gatewayEffort' in enCopy, false)
  assert.doesNotMatch(client, /GatewayEffortFooter|nativeGatewaySelection|emptyGatewayDirectoryState/)
  const types = read('packages/delta-suite/src/client-types.d.ts')
  assert.doesNotMatch(types, /gatewayEffort|GatewayModelDirectory|modelDirectories/)
  assert.equal('gatewayEffort' in zhCopy, false)
  assert.equal('gatewayEffort' in enCopy, false)
  assert.doesNotMatch(client, /\bsay\(\s*'[^'\n]+'\s*,\s*'[^'\n]+'/)
  for (const name of ['navigationPlugins', 'navigationSchedules', 'navigationSession',
    'accountBalance', 'todaySpending', 'dataUnavailable']) {
    assert.ok(client.includes('.' + name), 'unused account or nav key ' + name)
  }
  for (const name of ['globalCommandSearch', 'workspaceFiles', 'builtInBrowser',
    'archivedBadge', 'builtinPlan', 'builtinGoal', 'builtinCompact',
    'builtinSchedule', 'builtinBrowser', 'builtinBoost']) {
    assert.ok(client.includes('.' + name), 'unused palette key ' + name)
  }
  assert.doesNotMatch(client, /const wording:\s*Record<'zh'/)
  assert.match(client, /function language\(\): Language/)
  assert.match(client, /\/\^zh\(\?:-\|\$\)\/i/)
})

test('language subscription uses public Locale and never DOM observer', () => {
  assert.match(client, /scope\.inject\(\['locale'\], localeScope =>/)
  assert.match(client, /localeApi\.getSnapshot\(\)\?\.active/)
  assert.match(client, /localeApi\.subscribe\(sync\)/)
  assert.match(client, /release\(\)/)
  assert.doesNotMatch(client, /new MutationObserver\(\(\) => controller\.syncLanguage\(\)\)/)
  assert.doesNotMatch(client, /observer\?\.observe\(document\.documentElement/)
  assert.doesNotMatch(client, /localeApi\.setLocale\(/)
})
