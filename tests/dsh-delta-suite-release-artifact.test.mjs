import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readZip, readTgz, verifyEntries, hasUnsafeHostPatch } from '../scripts/verify-delta-suite-release.mjs'

const approvedTheme = readFileSync(join(import.meta.dirname, '../packages/dsh-delta-suite/src/theme.css'), 'utf8')

function validEntries(version = '0.1.0-beta.2') {
  const files = {
    'package.json': JSON.stringify({
      name: '@fongap-labs/dsh-delta-suite', version,
      dsh: { client: { platform: 'web' } },
      exports: { './client': './lib/client.js' },
    }),
    'cordis.patch.yml': 'id: dsh-delta-suite\nname: @fongap-labs/dsh-delta-suite',
    'lib/index.js': 'export { negotiateHostCapabilities, DELTA_HOST_CONTRACT_VERSION } from "./host-capabilities.js"',
    'lib/host-capabilities.js': "export * from './delta-suite-adapter/host-capability-contract.js';",
    'lib/delta-suite-adapter/host-capability-contract.js': [
      'export const DELTA_HOST_CONTRACT_VERSION = 1;',
      'export function negotiateHostCapabilities() {}',
    ].join('\n'),
    'lib/client.js': [
      'window.__ModuleLoader__.load({ settings.section sidebar.brand.mark data-delta-ui',
      "scope.slots.inject('settings.section'",
      "scope.slots.inject('settings.plugins.tab'",
      "id: 'delta.suite.configuration'",
      "'data-delta-personalization'",
      "scope.slots.inject('conversation.input.model.label'",
      'function installSidebarCompatibility() {}',
      'function installHostSearch() {}',
      'data-delta-compat',
      'dtd-host-search',
      'const OWNED_CSS = ' + JSON.stringify(approvedTheme) + ';',
    ].join('\n'),
    'locale/en.json': JSON.stringify({ meta: { title: 'Delta' }, ui: { newConversation: 'New conversation' } }),
    'locale/zh.json': JSON.stringify({ meta: { title: 'Delta' }, ui: { newConversation: 'Start' } }),
    'icon.svg': '<svg/>',
  }
  return new Map(Object.entries(files).map(([key, value]) => [key, Buffer.from(value)]))
}

function singleZip(path, content) {
  const name = Buffer.from(path)
  const h = Buffer.alloc(30)
  h.writeUInt32LE(0x04034b50)
  h.writeUInt16LE(content.length, 18)
  h.writeUInt16LE(content.length, 22)
  h.writeUInt16LE(name.length, 26)
  return Buffer.concat([h, name, content])
}
function singleTgz(path, content) {
  const h = Buffer.alloc(512)
  h.write(path, 0, 'utf8')
  h.write(content.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii')
  h.write('0', 156, 'ascii')
  const padding = Buffer.alloc((512 - content.length % 512) % 512)
  return gzipSync(Buffer.concat([h, content, padding, Buffer.alloc(1024)]))
}

test('ZIP and TGZ parser preserve packaged member content', () => {
  assert.equal(readZip(singleZip('lib/client.js', Buffer.from('client'))).get('lib/client.js').toString(), 'client')
  assert.equal(readTgz(singleTgz('package/lib/client.js', Buffer.from('client'))).get('lib/client.js').toString(), 'client')
})

test('reject stale names, missing client, mismatched versions and unresolved markers', () => {
  const entries = validEntries()
  assert.doesNotThrow(() => verifyEntries(entries, '0.1.0-beta.2', 'ZIP'))
  assert.throws(() => verifyEntries(entries, '0.1.0-beta.3', 'ZIP'), /version/)
  const noClient = new Map(entries)
  noClient.delete('lib/client.js')
  assert.throws(() => verifyEntries(noClient, '0.1.0-beta.2', 'TGZ'), /missing lib\/client.js/)
  const noContract = new Map(entries)
  noContract.delete('lib/host-capabilities.js')
  assert.throws(() => verifyEntries(noContract, '0.1.0-beta.2', 'TGZ'), /missing lib\/host-capabilities.js/)
  const unresolved = new Map(entries)
  unresolved.set('lib/client.js', Buffer.from(entries.get('lib/client.js').toString() + '__DELTA_SUITE_STYLE__'))
  assert.throws(() => verifyEntries(unresolved, '0.1.0-beta.2', 'ZIP'), /build markers/)
  const oldName = new Map(entries)
  oldName.set('package.json', Buffer.from(JSON.stringify({ ...JSON.parse(entries.get('package.json').toString()),
    name: '@fongap-labs/dsh-desktop-delta' })))
  assert.throws(() => verifyEntries(oldName, '0.1.0-beta.2', 'ZIP'), /name/)
  const unsafeHost = new Map(entries)
  unsafeHost.set('lib/index.js', Buffer.from(entries.get('lib/index.js').toString() + ' workspaceRegistry'))
  assert.throws(() => verifyEntries(unsafeHost, '0.1.0-beta.2', 'ZIP'), /unsafe Host patch/)
  const unsafeClient = new Map(entries)
  unsafeClient.set('lib/client.js', Buffer.from(entries.get('lib/client.js').toString() + '\nfunction installSidebarCompatibility() {}'))
  assert.throws(() => verifyEntries(unsafeClient, '0.1.0-beta.2', 'ZIP'), /duplicated/)
  const unsafeCss = new Map(entries)
  unsafeCss.set('lib/client.js', Buffer.from(entries.get('lib/client.js').toString()
    .replace('--dtd-brand:', '--dtd-unapproved-brand:')))
  assert.throws(() => verifyEntries(unsafeCss, '0.1.0-beta.2', 'ZIP'), /approved theme differs/)
})

test('validates the concrete capability contract and compatibility link in ZIP and TGZ', () => {
  const valid = validEntries()
  const implementation = 'lib/delta-suite-adapter/host-capability-contract.js'
  const compatibility = 'lib/host-capabilities.js'
  for (const format of ['ZIP', 'TGZ']) {
    assert.doesNotThrow(() => verifyEntries(valid, '0.1.0-beta.2', format))

    const noImplementation = new Map(valid)
    noImplementation.delete(implementation)
    assert.throws(() => verifyEntries(noImplementation, '0.1.0-beta.2', format),
      /missing lib\/delta-suite-adapter\/host-capability-contract\.js/)

    const wrongLink = new Map(valid)
    wrongLink.set(compatibility, Buffer.from("export * from './incorrect-module.js';"))
    assert.throws(() => verifyEntries(wrongLink, '0.1.0-beta.2', format),
      /capability compatibility export/)

    for (const invalid of [
      'export const DELTA_HOST_CONTRACT_VERSION = 1;',
      'export function negotiateHostCapabilities() {}',
      'export function missingCapabilityContract() {}',
    ]) {
      const incomplete = new Map(valid)
      incomplete.set(implementation, Buffer.from(invalid))
      assert.throws(() => verifyEntries(incomplete, '0.1.0-beta.2', format),
        /capability module/)
    }
  }
})

test('release refuses stale ZIP and TGZ bundles missing public Settings or model label surfaces', () => {
  const valid = validEntries()
  const shipped = valid.get('lib/client.js').toString()
  for (const marker of [
    "scope.slots.inject('settings.section'",
    "scope.slots.inject('settings.plugins.tab'",
    "id: 'delta.suite.configuration'",
    "'data-delta-personalization'",
    "scope.slots.inject('conversation.input.model.label'",
  ]) {
    for (const format of ['ZIP', 'TGZ']) {
      const broken = new Map(valid)
      broken.set('lib/client.js', Buffer.from(shipped.replace(marker, '')))
      assert.throws(() => verifyEntries(broken, '0.1.0-beta.2', format),
        /installable Suite UI registration/, format + ': ' + marker)
    }
  }
})

test('central manual release verifies both packaged archives after build', () => {
  const script = readFileSync(join(import.meta.dirname, '../scripts/build-release.mjs'), 'utf8')
  assert.match(script, /verify-delta-suite-release\.mjs/)
  assert.match(script, /--zip/)
  assert.match(script, /--tgz/)
  assert.match(script, /--version/)
})

test('comment-only Host patch references do not invalidate a compiled archive', () => {
  const markerOnly = [
    '/**',
    ' * Never access Host workspaceRegistry; do not patch protected-default-workspace.',
    ' */',
    'export function apply() { return () => {} }',
  ].join('\n')
  assert.equal(hasUnsafeHostPatch(markerOnly), false)
  const entries = validEntries()
  entries.set('lib/index.js', Buffer.from(entries.get('lib/index.js').toString() + '\n' + markerOnly))
  assert.doesNotThrow(() => verifyEntries(entries, '0.1.0-beta.2', 'ZIP'))
})

test('executable Host service references still block release', () => {
  for (const statement of [
    'ctx.workspaceRegistry.delete("default")',
    'const manager = ctx["workspaceRegistry"]',
    'const key = "protected-default-workspace"',
  ]) {
    const entries = validEntries()
    entries.set('lib/index.js', Buffer.from(entries.get('lib/index.js').toString() + '\n' + statement))
    assert.equal(hasUnsafeHostPatch(statement), true)
    assert.throws(() => verifyEntries(entries, '0.1.0-beta.2', 'ZIP'), /unsafe Host patch/)
  }
})
