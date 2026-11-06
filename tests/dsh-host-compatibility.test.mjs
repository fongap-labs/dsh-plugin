/**
 * Host compatibility contract:
 * - Native DSH services are resolved from ctx at runtime.
 * - Cordis and dsh-tools are provided by the Host; no Host peer is installed in plugin bundles.
 * - Host types remain pinned only in root development dependencies.
 * - Runtime access goes through the Host Context rather than a private Cordis instance.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const readManifest = (name) => JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'))

function walkTypeScript(directory) {
  const files = []
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, file.name)
    if (file.isDirectory()) files.push(...walkTypeScript(path))
    if (file.isFile() && path.endsWith('.ts')) files.push(path)
  }
  return files
}

describe('one-plugin compatibility with the native Harness Host', () => {
  it('never pins or installs Host framework packages in distributed plugin manifests', () => {
    for (const name of ['dsh-desktop-delta', 'dsh-code-worker', 'plugin-template']) {
      const plugin = readManifest(name)
      for (const hostPackage of ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools']) {
        assert.equal(Object.hasOwn(plugin.peerDependencies ?? {}, hostPackage), false)
        assert.equal(Object.hasOwn(plugin.dependencies ?? {}, hostPackage), false)
        assert.equal(Object.hasOwn(plugin.peerDependenciesMeta ?? {}, hostPackage), false)
        assert.equal((plugin.bundleDependencies ?? []).includes(hostPackage), false)
      }
    }
    const development = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    assert.match(development.devDependencies?.['@deepseek-ai/cordis'] ?? '', /^\d+\.\d+\.\d+$/)
    assert.match(development.devDependencies?.['@deepseek-ai/dsh-tools'] ?? '', /^\d+\.\d+\.\d+-rc\.\d+$/)
  })

  it('imports Cordis only as a type and never as a runtime module', () => {
    for (const folder of ['dsh-desktop-delta', 'dsh-code-worker', 'plugin-template', 'shared']) {
      const files = walkTypeScript(join(root, 'packages', folder, 'src'))
      for (const file of files) {
        const source = readFileSync(file, 'utf8')
        // Track each import declaration separately; a cross-import regex can
        // misclassify a valid import type when another import precedes it.
        let declaration = ''
        for (const line of source.split(/\r?\n/)) {
          if (/^\s*(?:import|export)\s/.test(line)) declaration = line.trim()
          if (/\bfrom\s+['"]@deepseek-ai\/cordis['"]/.test(line)) {
            assert.match(declaration, /^(?:import|export)\s+type\b/, `runtime Cordis import in ${file}`)
          }
        }
        assert.doesNotMatch(source, /\bimport\s*\(\s*['"]@deepseek-ai\/cordis['"]/, `dynamic Cordis import in ${file}`)
        assert.doesNotMatch(source, /^\s*import\s*['"]@deepseek-ai\/cordis['"]/m, `side effect Cordis import in ${file}`)
      }
    }
  })

  it('uses only type-level static dsh-tools imports', () => {
    for (const folder of ['dsh-code-worker', 'shared']) {
      const files = walkTypeScript(join(root, 'packages', folder, 'src'))
      for (const file of files) {
        const source = readFileSync(file, 'utf8')
        // Runtime tools are registered via ctx.tools. Any direct static host import
        // would turn the optional Host package into an actual runtime dependency.
        let statement = ''
        for (const line of source.split(/\r?\n/)) {
          if (/^\s*(?:import|export)\s/.test(line)) statement = line.trim()
          if (/\bfrom\s+['"]@deepseek-ai\/dsh-tools['"]/.test(line)) {
            assert.match(statement, /^(?:import|export)\s+type\b/,
              `runtime dsh-tools import in ${file}`)
          }
        }
      }
    }
  })

  it('does not bundle a second copy of the Host tools implementation', () => {
    for (const name of ['dsh-code-worker', 'plugin-template']) {
      const plugin = readManifest(name)
      assert.equal((plugin.bundleDependencies ?? []).includes('@deepseek-ai/dsh-tools'), false)
    }
  })

  it('continues using the Host tool registry contract', () => {
    const source = readFileSync(join(root, 'packages/dsh-code-worker/src/index.ts'), 'utf8')
    assert.match(source, /registerTool\(ctx, tool\)/)
    const shared = readFileSync(join(root, 'packages/shared/src/tool.ts'), 'utf8')
    assert.match(shared, /registry\.register\(definition\)/)
    assert.match(shared, /fallbackDefineTool/)
  })
})
