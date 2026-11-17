import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  PROJECT_FILES, ancestorRuleDirectories, declaredScripts, profileSummary,
} from '../packages/dsh-delta-code/lib/delta-code-coding/project-profile-policy.js'
import { inspectProjectWithHost } from '../packages/dsh-delta-code/lib/tools/profile.js'

describe('Delta Code project profile policy boundary', () => {
  it('contains no Harness SDK, Host FS or Node file-reading calls', () => {
    const source = readFileSync(new URL(
      '../packages/dsh-delta-code/src/delta-code-coding/project-profile-policy.ts', import.meta.url), 'utf8')
    for (const forbidden of ['@deepseek-ai', 'ToolDefinition', 'Context', 'node:fs',
      'requireHostFs', 'readFile(', 'realpath(']) {
      assert.equal(source.includes(forbidden), false, forbidden)
    }
    assert.ok(PROJECT_FILES.includes('AGENTS.md'))
    assert.equal(typeof inspectProjectWithHost, 'function')
  })

  it('finds bounded ancestor directories only inside the workspace', () => {
    const root = resolve('virtual-project')
    const nested = join(root, 'src', 'components')
    assert.deepEqual(ancestorRuleDirectories(nested, root), [join(root, 'src'), root])
    assert.deepEqual(ancestorRuleDirectories(root, root), [])
    assert.deepEqual(ancestorRuleDirectories(resolve('outside-project'), root), [])
    assert.deepEqual(profileSummary(nested, ['AGENTS.md'], [], ['../CLAUDE.md']).guidance,
      ['AGENTS.md', '../CLAUDE.md'])
  })

  it('selects only safe declared package scripts and does not reveal command bodies', () => {
    const scripts = declaredScripts(JSON.stringify({ scripts: {
      test: 'echo secret', typecheck: 'tsc', build: 'vite build',
      publish: 'curl external', lint: 123,
    } }))
    assert.deepEqual(scripts, ['test', 'typecheck', 'build'])
    assert.equal(scripts.includes('echo secret'), false)
    assert.deepEqual(declaredScripts('{invalid'), [])
    assert.deepEqual(declaredScripts(JSON.stringify({ scripts: ['test'] })), [])
    assert.deepEqual(declaredScripts(' '.repeat(1024 * 1024 + 1)), [])
  })

  it('produces identical project stack, rule discovery and check recommendations', () => {
    const profile = profileSummary('x'.repeat(300), [
      'AGENTS.md', 'CLAUDE.md', 'package.json', 'tsconfig.json', 'Cargo.toml',
    ], ['test', 'typecheck', 'build'])
    assert.equal(profile.cwd.length, 240)
    assert.deepEqual(profile.technologies, ['node', 'typescript', 'rust'])
    assert.deepEqual(profile.guidance, ['AGENTS.md', 'CLAUDE.md'])
    assert.deepEqual(profile.suggestedChecks, ['test', 'typecheck'])
    assert.deepEqual(profileSummary('/workspace', [], ['build']).suggestedChecks, ['build'])
  })
})
