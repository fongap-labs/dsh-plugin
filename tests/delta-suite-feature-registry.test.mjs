import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const fixture = relative => fileURLToPath(new URL('../' + relative, import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'dtd-feature-registry-'))
let Registry, readHostContextActivationCapabilities
try {
  execFileSync(process.execPath, [
    fixture('node_modules/typescript/bin/tsc'),
    fixture('packages/delta-ui/src/feature-registry.ts'),
    fixture('packages/delta-ui/src/host-capabilities.ts'),
    '--target', 'ES2022', '--module', 'node16', '--moduleResolution', 'node16',
    '--outDir', temp, '--strict', '--skipLibCheck',
  ], { stdio: 'pipe' })
  writeFileSync(join(temp, 'package.json'), '{"type":"module"}\n')
  const compiled = await import(pathToFileURL(join(temp, 'feature-registry.js')).href)
  Registry = compiled.DeltaFeatureRegistry
  const adapter = await import(pathToFileURL(join(temp, 'host-capabilities.js')).href)
  readHostContextActivationCapabilities = adapter.readHostContextActivationCapabilities
} finally {
  rmSync(temp, { recursive: true, force: true })
}

test('MECE registry requires a unique feature ID, owner and approved UI surface', () => {
  const registry = new Registry()
  registry.register({ id: 'security.privacy', owner: 'security',
    surfaces: ['settings'], install: () => () => {} })
  assert.throws(() => registry.register({ id: 'security.privacy', owner: 'security',
    install: () => () => {} }), /Duplicate Delta feature/)
  assert.throws(() => registry.register({ id: 'bad', owner: 'security',
    install: () => () => {} }), /Invalid Delta feature ID/)
  assert.throws(() => registry.register({ id: 'shell.open', owner: 'not-a-domain',
    install: () => () => {} }), /Unknown Delta feature owner/)
  assert.throws(() => registry.register({ id: 'shell.body', owner: 'shell',
    surfaces: ['chat-body'], install: () => () => {} }), /Unapproved Delta feature surface/)
  assert.throws(() => registry.register({ id: 'shell.mirror', owner: 'shell',
    surfaces: ['settings', 'settings'], install: () => () => {} }), /Duplicate Delta feature surface/)
})

test('lifecycle installs once, skips absent optional capabilities and disposes in reverse order', () => {
  const called = [], diagnostics = []
  const registry = new Registry()
  registry.register({ id: 'security.policy', owner: 'security',
    requires: ['host.privacy'], install: () => { called.push('security+'); return () => called.push('security-') } })
  registry.register({ id: 'integrations.mcp', owner: 'integrations', optional: true,
    requires: ['host.mcp'], install: () => { throw new Error('should not install') } })
  registry.register({ id: 'context.assistant', owner: 'context', optional: true,
    install: () => { throw new Error('not available') } })
  registry.register({ id: 'sessions.operations', owner: 'sessions',
    install: () => { called.push('sessions+'); return () => called.push('sessions-') } })
  const runtime = registry.mount({}, new Set(['host.privacy']), error => diagnostics.push(error.id))
  assert.deepEqual(runtime.mounted, ['security.policy', 'sessions.operations'])
  assert.deepEqual(runtime.skipped, ['integrations.mcp', 'context.assistant'])
  assert.deepEqual(diagnostics, ['context.assistant'])
  assert.deepEqual(called, ['security+', 'sessions+'])
  assert.throws(() => registry.mount({}, new Set()), /only be mounted once/)
  assert.throws(() => registry.register({ id: 'shell.new', owner: 'shell',
    install: () => () => {} }), /already mounted or disposed/)
  runtime.dispose()
  runtime.dispose()
  assert.deepEqual(called, ['security+', 'sessions+', 'sessions-', 'security-'])
})

test('required feature failures roll back, missing capabilities never grant permissions', () => {
  const called = []
  const registry = new Registry()
  registry.register({ id: 'security.authority', owner: 'security',
    install: () => { called.push('install'); return () => called.push('undo') } })
  registry.register({ id: 'sessions.mutation', owner: 'sessions',
    requires: ['host.session-write'], install: () => { called.push('unsafe'); return () => {} } })
  assert.throws(() => registry.mount({}, new Set()), /Missing required Host capabilities/)
  assert.deepEqual(called, ['install', 'undo'])
  assert.throws(() => registry.mount({}, new Set(['host.session-write'])), /only be mounted once/)
})

test('required startup exception rolls back all earlier extensions even when disposal throws', () => {
  const called = [], registry = new Registry()
  registry.register({ id: 'security.guard', owner: 'security',
    install: () => () => { called.push('dispose-security'); throw new Error('cleanup failed') } })
  registry.register({ id: 'shell.breaker', owner: 'shell',
    install: () => { throw new Error('required feature failed') } })
  assert.throws(() => registry.mount({}, new Set()), /required feature failed/)
  assert.deepEqual(called, ['dispose-security'])
})


test('activation prerequisites use only public registration methods, not Host version or claimed permissions', () => {
  const ctx = {
    version: '999', capabilities: ['host-context.inject', 'host-context.on'],
    get() { throw new Error('must not probe services at startup') },
  }
  assert.deepEqual([...readHostContextActivationCapabilities(ctx)], [])
  assert.deepEqual([...readHostContextActivationCapabilities({ ...ctx, inject() {} })], ['host-context.inject'])
  assert.deepEqual([...readHostContextActivationCapabilities({ ...ctx, inject() {}, on() {} })],
    ['host-context.inject', 'host-context.on'])
  assert.deepEqual([...readHostContextActivationCapabilities({
    get inject() { throw new Error('missing') }, on() {},
  })], ['host-context.on'])
})

test('actual Host feature prerequisites skip optional context features without disabling protection installers', () => {
  const manifest = JSON.parse(readFileSync(fixture('projects/delta-ui/architecture-mece.json'), 'utf8'))
  for (const [ctx, expectedSkipped] of [
    [{}, ['context.compaction-status', 'context.task-intent']],
    [{ inject() {} }, ['context.task-intent']],
    [{ inject() {}, on() {} }, []],
  ]) {
    const registry = new Registry()
    for (const [id, definition] of Object.entries(manifest.host_feature_access)) {
      registry.register({ id, owner: manifest.host_feature_registration[id],
        optional: id.startsWith('context.'), requires: definition.activation_requires,
        install: () => () => {} })
    }
    const runtime = registry.mount(ctx, readHostContextActivationCapabilities(ctx))
    assert.deepEqual(runtime.skipped, expectedSkipped)
    for (const id of ['security.privacy-guards', 'discovery.session-search', 'sessions.session-operations']) {
      assert.ok(runtime.mounted.includes(id))
    }
    runtime.dispose()
  }
})
