import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const source = readFileSync(fileURLToPath(
  new URL('../packages/delta-suite/src/client.ts', import.meta.url)), 'utf8')
const readiness = JSON.parse(readFileSync(fileURLToPath(
  new URL('../projects/delta-suite/feature-readiness.json', import.meta.url)), 'utf8'))
const preferences = readFileSync(fileURLToPath(
  new URL('../packages/delta-suite/src/client-feature-preferences.ts', import.meta.url)), 'utf8')
const labelStart = source.indexOf('    function ModelLabelExtension(')
const labelEnd = source.indexOf('    function AssistantInputControls(', labelStart)
assert.ok(preferences.includes('function updateFeaturePreference(') &&
  labelStart >= 0 && labelEnd > labelStart, 'the real preference and model-slot implementations must exist')

function fixture(initial = null, { blocked = false } = {}) {
  let stored = initial
  let writes = 0
  const localStorage = {
    getItem(key) {
      assert.equal(key, 'fongap.delta-suite.features.v1')
      return stored
    },
    setItem(key, value) {
      assert.equal(key, 'fongap.delta-suite.features.v1')
      writes++
      if (blocked) throw Error('storage unavailable')
      stored = value
    },
  }
  const context = {
    localStorage,
    React: { useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot() } },
    el(type, props, ...children) { return { type, props, children } },
  }
  const body = stripTypeScriptTypes(preferences + '\n' +
    source.slice(labelStart, labelEnd) +
    '\nthis.render = ModelLabelExtension; this.update = updateFeaturePreference; this.snapshot = () => featurePreferences; this.subscribe = subscribeFeaturePreferences',
    { mode: 'strip' })
  runInNewContext(body, context, { timeout: 1000 })
  return { render: context.render, update: context.update, snapshot: context.snapshot,
    getStored: () => stored, getWrites: () => writes, subscribe: context.subscribe }
}
const route = {
  provider: { id: 'deepseek-account', name: 'DeepSeek Account' },
  model: { name: 'DeepSeek-V3' }, placement: 'selected',
}
const stringify = value => JSON.stringify(value)

test('the public model-label Slot is the only source of route metadata', () => {
  assert.match(source, /scope\.slots\.inject\('conversation\.input\.model\.label'/)
  assert.match(source, /name: 'conversation\.input\.model\.label'/)
  assert.equal(readiness.required.deepseek_account_route_label_preference, true)
  assert.doesNotMatch(source.slice(labelStart, labelEnd),
    /credentials|apiKey|token|fetch\(|querySelector|localStorage|private/)
})

test('selected DeepSeek Account model displays public account and model names', () => {
  const f = fixture()
  const value = f.render(route)
  assert.equal(value.type, 'span')
  assert.equal(value.props.className, 'dtd-model-label')
  assert.match(stringify(value), /DeepSeek Account/)
  assert.match(stringify(value), /DeepSeek-V3/)
  assert.match(stringify(value), /dtd-model-account/)
  assert.match(stringify(value), /dtd-model-name/)
})

test('the account label and model label preferences remain independent and persisted', () => {
  const f = fixture()
  f.update('showModelInfo', false)
  assert.match(stringify(f.render(route)), /DeepSeek Account/)
  assert.doesNotMatch(stringify(f.render(route)), /DeepSeek-V3/)
  f.update('showDeepSeekAccountInfo', false)
  assert.equal(f.render(route), null)
  f.update('showModelInfo', true)
  assert.match(stringify(f.render(route)), /DeepSeek-V3/)
  assert.doesNotMatch(stringify(f.render(route)), /DeepSeek Account/)
  const saved = JSON.parse(f.getStored())
  assert.equal(saved.showModelInfo, true)
  assert.equal(saved.showDeepSeekAccountInfo, false)
  const restored = fixture(f.getStored())
  assert.doesNotMatch(stringify(restored.render(route)), /DeepSeek Account/)
  assert.match(stringify(restored.render(route)), /DeepSeek-V3/)
})

test('account labels do not appear on unrelated routes or model options', () => {
  const f = fixture()
  for (const provider of [
    { id: 'deepseek-official', name: 'DeepSeek Account' },
    { id: 'openai', name: 'OpenAI' },
    { id: '', name: 'DeepSeek Account' },
    undefined,
  ]) {
    const rendered = stringify(f.render({ ...route, provider }))
    assert.doesNotMatch(rendered, /dtd-model-account/)
    assert.match(rendered, /DeepSeek-V3/)
  }
  const option = stringify(f.render({ ...route, placement: 'option' }))
  assert.doesNotMatch(option, /dtd-model-account/)
  assert.match(option, /DeepSeek-V3/)
})

test('missing and whitespace-only public labels do not render empty badges', () => {
  const f = fixture()
  assert.equal(f.render({ provider: { id: 'deepseek-account', name: '   ' } }), null)
  assert.equal(f.render({ provider: { id: 'deepseek-account' }, model: { name: '  ' } }), null)
  const trimmed = stringify(f.render({
    provider: { id: 'deepseek-account', name: ' DeepSeek Account ' },
    model: { name: ' DeepSeek-V3 ' }, placement: 'selected',
  }))
  assert.match(trimmed, /DeepSeek Account/)
  assert.match(trimmed, /DeepSeek-V3/)
  assert.doesNotMatch(trimmed, /DeepSeek Account /)
})

test('malformed persisted preferences do not leak account metadata', () => {
  const f = fixture('not-json')
  assert.equal(f.snapshot().showDeepSeekAccountInfo, true)
  f.update('showDeepSeekAccountInfo', false)
  assert.equal(f.render(route)?.children?.[0], null)
})

test('same preference value and invalid inputs neither publish nor write', () => {
  const f = fixture()
  const before = f.snapshot()
  let notifications = 0
  const release = f.subscribe(() => { notifications++ })
  for (const [key, value] of [['showModelInfo', true], ['retired', false], ['__proto__', false], ['inputOptimization', 'false']]) {
    f.update(key, value)
  }
  assert.equal(f.snapshot(), before)
  assert.equal(notifications, 0)
  assert.equal(f.getWrites(), 0)
  f.update('showModelInfo', false)
  assert.equal(notifications, 1)
  assert.equal(f.getWrites(), 1)
  release()
  f.update('showModelInfo', true)
  assert.equal(notifications, 1)
})

test('blocked storage and throwing subscribers preserve independent preferences', () => {
  const f = fixture(null, { blocked: true })
  f.subscribe(() => { throw Error('view unavailable') })
  let notifications = 0
  f.subscribe(() => { notifications++ })
  f.update('inputOptimization', false)
  assert.equal(f.snapshot().inputOptimization, false)
  assert.equal(f.snapshot().showModelInfo, true)
  assert.equal(notifications, 1)
  assert.equal(f.getStored(), null)
  assert.equal(f.getWrites(), 1)
})

test('existing feature preferences retain supported values and discard retired keys', () => {
  const f = fixture(JSON.stringify({ showModelInfo: false, retiredOption: true, inputOptimization: 'invalid' }))
  assert.equal(f.snapshot().showModelInfo, false)
  assert.equal(f.snapshot().inputOptimization, true)
  assert.deepEqual(Object.keys(JSON.parse(f.getStored())).sort(), ['inputOptimization', 'showDeepSeekAccountInfo', 'showModelInfo'])
  assert.equal(f.getWrites(), 1)
  const invalid = fixture('[]')
  assert.equal(invalid.snapshot().showModelInfo, true)
  assert.equal(invalid.getWrites(), 0)
})
