import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { name, inject, apply } from '../packages/plugin-template/lib/index.js'
import { normalizeTemplateConfig } from '../packages/plugin-template/lib/host/config.js'
import { scaffoldPlugin } from '../scripts/scaffold-plugin.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

describe('plugin-template Host lifecycle', () => {
  it('keeps the published template contract and opt-in prompt behavior', async () => {
    assert.equal(name, readJson(join(root, 'packages/plugin-template/package.json')).name)
    assert.deepEqual(inject, ['tools'])
    assert.equal(normalizeTemplateConfig({ greeting: '', enabled: false }).enabled, false)

    const registered = []
    const disposed = []
    let promptCalls = 0
    const ctx = {
      tools: { register(tool) {
        registered.push(tool)
        return () => disposed.push(tool.name)
      } },
      inject(deps, callback) {
        assert.deepEqual(deps, ['systemPrompt'])
        callback({ systemPrompt: { getSectionOrder: () => 2100, section: spec => {
          promptCalls++
          assert.equal(spec.name, `${name}:guidance`)
          assert.equal(spec.order, 2100)
          assert.equal(spec.text, 'Use the plugin tools when needed.')
          return () => disposed.push('prompt')
        } } })
      },
    }
    const cleanup = apply(ctx, { greeting: 'Welcome', systemPromptText: 'Use the plugin tools when needed.' })
    assert.equal(registered.length, 1)
    assert.equal(registered[0].name, 'plugin_template_greet')
    assert.deepEqual(await registered[0].execute({ name: 'Ada' }, {}), { text: 'Welcome, Ada!' })
    assert.equal(promptCalls, 1)
    cleanup()
    cleanup()
    assert.deepEqual(disposed, ['prompt', 'plugin_template_greet'])
  })

  it('does not register tools or prompt when disabled, and degrades without optional services', () => {
    let registered = 0
    const ctx = { tools: { register() { registered++; return () => {} } } }
    assert.doesNotThrow(() => apply(ctx, { enabled: false, systemPromptText: 'ignored' })())
    assert.equal(registered, 0)
    assert.doesNotThrow(() => apply({}, { systemPromptText: 'optional' })())
  })

  it('ignores late optional service injection after disposal', () => {
    let after
    let registered = 0
    const ctx = {
      tools: { register: () => () => {} },
      inject: (_deps, callback) => { after = callback },
    }
    const cleanup = apply(ctx, { systemPromptText: 'use guidance' })
    cleanup()
    after({ systemPrompt: { section() { registered++ } } })
    assert.equal(registered, 0)
  })
})

describe('plugin-template scaffold generation', () => {
  const withFixture = run => {
    const folder = mkdtempSync(join(tmpdir(), 'dsh-scaffold-'))
    try {
      mkdirSync(join(folder, 'packages'), { recursive: true })
      mkdirSync(join(folder, 'projects/plugin-template'), { recursive: true })
      cpSync(join(root, 'packages/plugin-template'), join(folder, 'packages/plugin-template'), {
        recursive: true,
        filter: path => !path.split(/[\\/]/).some(s => ['node_modules', 'lib', 'dist'].includes(s)),
      })
      cpSync(join(root, 'projects/plugin-template/release.manifest.json'),
        join(folder, 'projects/plugin-template/release.manifest.json'))
      run(folder)
    } finally { rmSync(folder, { recursive: true, force: true }) }
  }

  it('derives package, Cordis identity, scripts, locale, assets and release metadata together', () => withFixture(folder => {
    const before = scaffoldPlugin({ root: folder, name: 'plugin-example', dryRun: true })
    assert.equal(before.packageName, '@fongap-labs/plugin-example')
    assert.equal(existsSync(before.targetDir), false)
    const result = scaffoldPlugin({ root: folder, name: 'plugin-example', description: 'Example Host plugin' })
    const packageDir = result.targetDir
    const pkg = readJson(join(packageDir, 'package.json'))
    const rel = readJson(join(result.targetProjectDir, 'release.manifest.json'))
    const patch = readFileSync(join(packageDir, 'cordis.patch.yml'), 'utf8')
    const source = readFileSync(join(packageDir, 'src/index.ts'), 'utf8')
    const build = readFileSync(join(packageDir, 'build-release.ps1'), 'utf8')
    assert.equal(pkg.name, result.packageName)
    assert.equal(pkg.description, 'Example Host plugin')
    assert.match(patch, /- id: plugin-example/)
    assert.ok(patch.includes(`name: '${pkg.name}'`))
    assert.match(source, /export const name = '@fongap-labs\/plugin-example'/)
    assert.match(build, /-Package plugin-example -Target/)
    assert.equal(readJson(join(packageDir, 'locale/en.json')).meta.title, 'plugin-example')
    assert.equal(readJson(join(packageDir, 'locale/zh.json')).meta.description, pkg.description)
    assert.equal(rel.release_key, 'plugin-example')
    assert.equal(rel.license_expression, pkg.license)
    assert.equal(rel.builds[0].script, 'plugin-example/build-release.ps1')
    assert.deepEqual(rel.builds[0].assets, ['fongap-labs-plugin-example.zip', 'fongap-labs-plugin-example.tgz'])
    assert.ok(!existsSync(join(packageDir, 'lib')))
    assert.throws(() => scaffoldPlugin({ root: folder, name: 'plugin-example' }), /already exists/)
  }))

  it('rejects unsafe, duplicate and placeholder names without touching the workspace', () => withFixture(folder => {
    for (const slug of ['../escape', 'Example', 'plugin--bad', 'plugin-template']) {
      assert.throws(() => scaffoldPlugin({ root: folder, name: slug }), /name must/)
    }
    assert.equal(existsSync(join(folder, 'packages/escape')), false)
  }))
})
