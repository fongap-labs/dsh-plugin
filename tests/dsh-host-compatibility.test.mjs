/**
 * Host compatibility contract:
 * - Native DSH services are resolved from ctx at runtime.
 * - The only declared Host peer is Cordis (shared with Delta UI).
 * - The TypeScript-only dsh-tools contract is a development dependency.
 * - Avoid pinning RC versions in distributable plugin metadata.
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
  it('does not require a specific dsh-tools runtime package version', () => {
    const ui = readManifest('dsh-ui-delta')
    for (const name of ['dsh-code-worker', 'plugin-template']) {
      const plugin = readManifest(name)
      assert.equal(Object.hasOwn(plugin.peerDependencies ?? {}, '@deepseek-ai/dsh-tools'), false)
      assert.equal(Object.hasOwn(plugin.dependencies ?? {}, '@deepseek-ai/dsh-tools'), false)
      assert.equal(Object.hasOwn(plugin.peerDependenciesMeta ?? {}, '@deepseek-ai/dsh-tools'), false)
      assert.equal(plugin.peerDependencies?.['@deepseek-ai/cordis'], ui.peerDependencies?.['@deepseek-ai/cordis'])
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
