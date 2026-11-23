import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const fixture = rel => fileURLToPath(new URL('../' + rel, import.meta.url))
const compileDir = mkdtempSync(join(tmpdir(), 'delta-host-'))
let host
try {
  writeFileSync(join(compileDir, 'package.json'), '{"type":"module"}\n')
  const dependenciesDir = join(compileDir, 'node_modules')
  mkdirSync(dependenciesDir)
  cpSync(fixture('packages/delta-suite/node_modules/zod'), join(dependenciesDir, 'zod'), { recursive: true, dereference: true })
  const harnessDependencies = join(dependenciesDir, '@deepseek-ai')
  mkdirSync(harnessDependencies)
  const schemasteryPath = fixture('packages/delta-suite/node_modules/@deepseek-ai/schemastery/package.json')
  const schemasteryRequire = createRequire(realpathSync(schemasteryPath))
  let cosmokitRoot = dirname(schemasteryRequire.resolve('@deepseek-ai/cosmokit'))
  while (basename(cosmokitRoot) !== 'cosmokit') {
    const parent = dirname(cosmokitRoot)
    if (parent === cosmokitRoot) throw new Error('Could not resolve the schemastery cosmokit dependency')
    cosmokitRoot = parent
  }
  cpSync(fixture('packages/delta-suite/node_modules/@deepseek-ai/schemastery'),
    join(harnessDependencies, 'schemastery'), { recursive: true, dereference: true })
  cpSync(cosmokitRoot, join(harnessDependencies, 'cosmokit'), { recursive: true, dereference: true })
  execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
    fixture('packages/delta-suite/tsconfig.json'), '--outDir', compileDir], { stdio: 'pipe' })
  host = await import(pathToFileURL(join(compileDir, 'index.js')).href)
} finally { rmSync(compileDir, { recursive: true, force: true }) }

test('Host plugin does not patch workspace deletion', () => {
  const registry = { async delete() { return true } }
  const original = registry.delete
  const stop = host.apply({ workspaceRegistry: registry, inject() {} })
  assert.equal(registry.delete, original)
  stop()
  assert.equal(registry.delete, original)
})

test('missing and incompatible Host contracts fail closed', () => {
  const required = ['sidebar.compose', 'workspace.before-delete']
  const absent = host.negotiateHostCapabilities(null, required)
  assert.equal(absent.compatible, false)
  assert.deepEqual(absent.missing, required)
  assert.equal(absent.reason, 'missing-manifest')
  const outdated = host.negotiateHostCapabilities({
    contractVersion: 2, capabilities: required,
  }, required)
  assert.equal(outdated.compatible, false)
  assert.equal(outdated.reason, 'unsupported-contract')
})

test('capability negotiation is explicit and version independent', () => {
  const manifest = {
    contractVersion: host.DELTA_HOST_CONTRACT_VERSION,
    capabilities: ['theme.tokens', 'settings.section', 'random.private.host.feature'],
  }
  const ready = host.negotiateHostCapabilities(manifest, ['theme.tokens'])
  assert.equal(ready.compatible, true)
  assert.deepEqual(ready.available, ['theme.tokens', 'settings.section'])
  const denied = host.negotiateHostCapabilities(manifest, ['workspace.before-delete'])
  assert.equal(denied.compatible, false)
  assert.deepEqual(denied.missing, ['workspace.before-delete'])
})

test('unsupported required capability fails closed even when the Host advertises it', () => {
  const future = 'sidebar.compose-next'
  const manifest = {
    contractVersion: host.DELTA_HOST_CONTRACT_VERSION,
    capabilities: ['theme.tokens', future],
  }
  const denied = host.negotiateHostCapabilities(manifest, [future])
  assert.equal(denied.compatible, false)
  assert.deepEqual(denied.available, ['theme.tokens'])
  assert.deepEqual(denied.missing, [future])
  assert.equal(denied.reason, 'missing-capabilities')

  const mixed = host.negotiateHostCapabilities(manifest, [
    'theme.tokens', future, future, 'workspace.before-delete',
  ])
  assert.equal(mixed.compatible, false)
  assert.deepEqual(mixed.missing, [future, 'workspace.before-delete'])
  const stable = host.negotiateHostCapabilities(manifest, ['theme.tokens'])
  assert.equal(stable.compatible, true, 'unrelated Host extensions cannot break known supported capabilities')
})

test('Gateway service cannot read credentials or register a phantom feature', () => {
  const service = readFileSync(fixture('packages/delta-suite/src/host-gateway-effort.ts'), 'utf8')
  const composition = readFileSync(fixture('packages/delta-suite/src/delta-suite-composition.ts'), 'utf8')
  const client = readFileSync(fixture('packages/delta-suite/src/client.ts'), 'utf8')
  assert.doesNotMatch(service, /credentials\\.resolve|credential\\.value|authorization:|Bearer /)
  assert.doesNotMatch(composition, /id: 'integrations\\.gateway-effort'/)
  assert.doesNotMatch(client, /scope\\.slots\\.inject\\('settings\\.models\\.footer'/)
  let touched = false
  const cleanup = host.installHostGatewayEffortSync({
    inject() { touched = true; throw Error('the Host must not be probed') },
  })
  assert.equal(touched, false)
  assert.doesNotThrow(cleanup)
})

test('Delta leaves native DOM, Workspace operations and original Host source untouched', () => {
  const client = readFileSync(fixture('packages/delta-suite/src/client.ts'), 'utf8')
  const pkg = JSON.parse(readFileSync(fixture('packages/delta-suite/package.json'), 'utf8'))
  assert.doesNotMatch(client, /const stopLivePresentation = installLiveNativePresentation\\(/)
  assert.doesNotMatch(client, /workspaceScope\\.effect\\(\\(\\) => installWorkspaceMutationGuards\\(/)
  assert.equal(pkg.files.includes('scripts/apply-harness-ui-patch.mjs'), false)
  assert.ok(pkg.files.includes('cordis.patch.yml'), 'official Cordis patch remains')
})
