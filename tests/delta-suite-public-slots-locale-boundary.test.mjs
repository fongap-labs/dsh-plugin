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
  assert.doesNotMatch(client, /function installSidebarCompatibility\(/)
  assert.doesNotMatch(client, /onMenuClickCapture|hiddenSoleWorkspaceNodes/)
  assert.doesNotMatch(client, /stopPrivacyGuards\(\)|installClientPrivacyGuards\(/)
  assert.doesNotMatch(client, /installClientVisionBridge|stopVisionBridge|data-composer-input/)
  assert.match(client, /mountClientOwnedStyle\(OWNED_CSS, 'plugin', DELTA_SUITE_OWNER\)/)
  assert.match(client, /releaseOwnedStyle\?\.\(\)/)
  const lifecycle = read('packages/delta-suite/src/client-registration-lifecycle.ts')
  assert.match(lifecycle, /if \(tag\?\.parentNode\) tag\.parentNode\.removeChild\(tag\)/)
  // Native Sidebar adapter was retired; public Host Slots retain ownership.
  assert.doesNotMatch(client, /function installSidebarCompatibility/)
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
  for (const name of ['settings', 'signIn', 'signOut', 'navigationPlugins',
    'navigationSchedules', 'navigationSession', 'accountBalance', 'todaySpending',
    'dataUnavailable']) {
    assert.equal(name in zhCopy.ui, false, 'retired native chrome copy: ' + name)
    assert.equal(name in enCopy.ui, false, 'retired native chrome copy: ' + name)
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

test('language uses public Locale first and a scoped read-only lang Patch as fallback', () => {
  const lifecycle = read('packages/delta-suite/src/client-registration-lifecycle.ts')
  assert.match(client, /bindClientLocale\(scope,/)
  assert.match(client, /releaseLocale\(\)/)
  assert.match(lifecycle, /scope\.inject\(\['locale'\], localeScope =>/)
  assert.match(lifecycle, /localeApi\.getSnapshot\(\)\?\.active/)
  assert.match(lifecycle, /localeApi\.subscribe\(sync\)/)
  assert.match(lifecycle, /typeof release === 'function'\) release\(\)/)
  assert.match(lifecycle, /fallback\.stop\(\)/)
  assert.match(lifecycle, /fallback\.dispose\(\)/)
  const fallback = lifecycle.slice(lifecycle.indexOf('function createClientLocaleFallback('), lifecycle.indexOf('function bindClientLocale('))
  assert.match(fallback, /observer\.observe\(document\.documentElement, \{ attributes: true, attributeFilter: \['lang'\] \}\)/)
  assert.doesNotMatch(fallback, /subtree:\s*true|\.setAttribute\(|\.removeAttribute\(|setInterval\(/)
  assert.doesNotMatch(client + lifecycle, /localeApi\.setLocale\(/)
})

test('Suite locale dictionaries contain no unused leaf key', () => {
  const used = key =>
    client.includes('.' + key) ||
    client.includes("['" + key + "']") ||
    client.includes('["' + key + '"]') ||
    client.includes("'" + key + "'")
  for (const [name] of flattenCopy(zhCopy)) {
    const key = name.split('.').at(-1)
    assert.ok(used(key), 'unused Suite locale key: ' + name)
  }
})

test('MCP credentials stay native: Suite publishes no credential editor, service or styles', () => {
  const types = read('packages/delta-suite/src/client-types.d.ts')
  const css = read('packages/delta-suite/src/feature-extras.css')
  for (const pattern of [
    /McpManagementDialog/, /pairsText\(/, /entry\.env/, /entry\.headers/,
    /scope\.slots\.inject\('plugins\.add\.actions'/,
    /scope\.inject\(\['configForms', 'remote'\]/,
  ]) assert.doesNotMatch(client, pattern)
  assert.doesNotMatch(types, /McpConfigSnapshot|McpServices|CredentialRemoteApi/)
  assert.doesNotMatch(css, /\.dtd-mcp-/, 'retired MCP credential editor must not ship CSS')
  for (const dictionary of [zhCopy, enCopy]) {
    assert.equal(Object.keys(dictionary.ui).some(key => /^mcp[A-Z]/.test(key)), false)
  }
})

// The locale contract must enumerate real dictionary keys, without a catch-all
// index signature that silently accepts misspelled UI keys.
test('DeltaCopy type declares exactly the actual bilingual dictionary schema', () => {
  const types = read('packages/delta-suite/src/client-types.d.ts').replace(/\r\n/g, '\n')
  const start = types.indexOf('interface DeltaCopy {')
  const end = types.indexOf('\ntype Language =', start)
  assert.ok(start >= 0 && end > start)
  const expected = 'interface DeltaCopy {\n' + Object.entries(enCopy).map(([section, entries]) =>
    '  ' + section + ': {\n' + Object.keys(entries).map(key => '    ' + key + ': string').join('\n') + '\n  }'
  ).join('\n') + '\n}'
  assert.equal(types.slice(start, end), expected)
})

test('compatibility copy describes implemented sidebar Patch without claiming installed Host acceptance', () => {
  assert.match(enCopy.ui.integrationSummary, /scoped, reversible compatibility patches/)
  assert.ok(zhCopy.ui.integrationSummary.includes("局部、可撤销的兼容补丁"))
  assert.match(enCopy.ui.integrationSidebar, /client verification pending/)
  assert.ok(zhCopy.ui.integrationSidebar.includes("待客户端验收"))
  assert.match(client, /nativeFeatureNotes\.map/)
  assert.match(enCopy.ui.integrationGuidance, /switch to the official theme or disable Delta Suite/)
  assert.ok(zhCopy.ui.integrationGuidance.includes("切换至官方主题或停用 Delta Suite"))
})
