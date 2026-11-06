import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const client = readFileSync(new URL('../packages/dsh-desktop-delta/lib/client.js', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('../packages/dsh-desktop-delta/package.json', import.meta.url), 'utf8'))

test('client starts without contextMenus and registers its menu when the service appears', () => {
  let entry
  const window = { __ModuleLoader__: { load(value) { entry = value } }, addEventListener() {}, dispatchEvent() {} }
  const document = { documentElement: { lang: 'en' }, addEventListener() {}, querySelector() { return null } }
  const storage = { getItem() { return null }, setItem() {}, removeItem() {} }
  runInNewContext(client, { window, document, localStorage: storage, sessionStorage: storage, console: { info() {}, warn() {} } })
  const plugin = entry.factory(() => { throw new Error('module unavailable') })
  assert.equal(plugin.inject.includes('contextMenus'), false)
  assert.equal(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-context-menu'), false)

  let onMenuService
  const ctx = {
    inject(deps, callback) { if (deps.includes('contextMenus')) onMenuService = callback },
    effect() {},
    get() { return undefined },
  }
  assert.doesNotThrow(() => plugin.apply(ctx))
  assert.equal(typeof onMenuService, 'function')
  let registered
  let isCleanedUp
  onMenuService({
    get() { return { register(definition) { registered = definition; return () => { isCleanedUp = true } } } },
    effect(callback) { const dispose = callback(); dispose() },
  })
  assert.equal(registered.id, 'session.delta-delete')
  assert.equal(isCleanedUp, true)
})
