import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mountDeltaCodeFeatures } from '../packages/delta-code/lib/delta-code-kernel/feature.js'
import { deltaCodeCodingWithoutCommands, deltaCodeCodingCommands } from '../packages/delta-code/lib/delta-code-coding/index.js'
import { deltaCodeQuality } from '../packages/delta-code/lib/delta-code-quality/index.js'
import { deltaCodeRepositoryRemote, deltaCodeRepositoryCommands } from '../packages/delta-code/lib/delta-code-repository/index.js'

const sourceRoot = new URL('../packages/delta-code/src/', import.meta.url)

describe('Delta Code host-independent feature composition', () => {
  it('keeps feature entrypoints free of DSH SDK and runtime Context dependencies', () => {
    for (const file of ['delta-code-coding/index.ts', 'delta-code-quality/index.ts',
      'delta-code-repository/index.ts']) {
      const text = readFileSync(new URL(file, sourceRoot), 'utf8')
      for (const forbidden of ['@deepseek-ai', 'Context', 'ToolDefinition', 'providers/dsh/']) {
        assert.equal(text.includes(forbidden), false, file + ' should not depend on ' + forbidden)
      }
    }
    const provider = readFileSync(
      new URL('delta-code-adapter/providers/dsh/feature-tools.ts', sourceRoot), 'utf8')
    assert.match(provider, /createDshQualityTools/)
    assert.match(provider, /createDshRepositoryRemoteTools/)
  })

  it('mounts stable tools and preserves core versus subprocess capability boundaries', () => {
    const core = [{ name: 'code_multi_edit' }, { name: 'code_project_profile' }]
    const commands = [{ name: 'code_lsp_probe' }]
    const remote = [{ name: 'code_github_connection' }]
    const quality = [{ name: 'code_verify' }]
    const local = [{ name: 'code_git_status' }]
    const coreFeatures = [deltaCodeCodingWithoutCommands(core), deltaCodeRepositoryRemote(remote)]
    const commandFeatures = [deltaCodeCodingCommands(commands), deltaCodeQuality(quality),
      deltaCodeRepositoryCommands(local)]
    const registered = new Map()
    const registrar = { register(tool) {
      registered.set(tool.name, tool)
      return () => registered.delete(tool.name)
    } }
    const releaseCore = mountDeltaCodeFeatures(coreFeatures, registrar)
    assert.deepEqual([...registered.keys()], ['code_multi_edit', 'code_project_profile',
      'code_github_connection'])
    const releaseCommands = mountDeltaCodeFeatures(commandFeatures, registrar)
    assert.equal(registered.size, 6)
    releaseCommands()
    assert.deepEqual([...registered.keys()], ['code_multi_edit', 'code_project_profile',
      'code_github_connection'])
    releaseCore()
    assert.equal(registered.size, 0)
  })
})
