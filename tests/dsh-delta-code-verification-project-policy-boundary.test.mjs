import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  verificationMetadataFiles, detectVerificationProjects, selectVerificationPackageManager,
  parseDeclaredNodeVerificationScripts,
} from '../packages/dsh-delta-code/lib/delta-code-quality/verification-project-policy.js'
import { chooseVerificationCommand } from '../packages/dsh-delta-code/lib/delta-code-quality/verify-presets.js'

describe('Delta Code Host-neutral verification project policy', () => {
  it('contains no DSH context, Host FS, shell or process dependency', () => {
    const policy = readFileSync(new URL('../packages/dsh-delta-code/src/delta-code-quality/verification-project-policy.ts', import.meta.url), 'utf8')
    const adapter = readFileSync(new URL('../packages/dsh-delta-code/src/delta-code-adapter/providers/dsh/verify.ts', import.meta.url), 'utf8')
    const facade = readFileSync(new URL('../packages/dsh-delta-code/src/delta-code-quality/verify.ts', import.meta.url), 'utf8')
    for (const forbidden of ['@deepseek-ai', 'runCommand(', 'node:fs', 'process.env', 'requireHostFs(']) {
      assert.equal(policy.includes(forbidden), false, forbidden)
    }
    assert.ok(adapter.includes('verificationMetadataFiles'))
    assert.ok(adapter.includes('parseDeclaredNodeVerificationScripts(JSON.parse(raw))'))
    assert.ok(facade.includes("from '../delta-code-adapter/providers/dsh/verify.js'"))
    assert.ok(!facade.includes('runCommand('))
    assert.equal(verificationMetadataFiles.filter(x => x === 'requirements.txt').length, 1)
  })

  it('detects manifests and selects package managers with unchanged priority', () => {
    assert.deepEqual(detectVerificationProjects(new Set(['requirements.txt', 'pyproject.toml', 'Cargo.toml'])), ['rust', 'python'])
    assert.deepEqual(detectVerificationProjects(new Set(['package.json', 'go.mod'])), ['node', 'go'])
    assert.equal(selectVerificationPackageManager(new Set(['bun.lock', 'pnpm-lock.yaml', 'yarn.lock'])), 'pnpm')
    assert.equal(selectVerificationPackageManager(new Set(['bun.lockb', 'yarn.lock'])), 'yarn')
    assert.equal(selectVerificationPackageManager(new Set(['bun.lock'])), 'bun')
    assert.equal(selectVerificationPackageManager(new Set()), 'npm')
  })

  it('accepts only declared safe Node scripts and rejects malformed package metadata', () => {
    const scripts = parseDeclaredNodeVerificationScripts({ scripts: {
      test: 'node --test', 'test:unit': 'node --test unit', build: '  ',
      'test;rm': 'unsafe', lint: 123, check: 'tsc --noEmit',
    } })
    assert.deepEqual(scripts, ['test', 'test:unit', 'check'])
    assert.deepEqual(chooseVerificationCommand('test:unit', 'node', ['node'], 'npm', scripts), {
      project: 'node', command: 'npm', args: ['run', 'test:unit'],
    })
    assert.throws(() => chooseVerificationCommand('build', 'node', ['node'], 'npm', scripts), /does not declare/)
    assert.throws(() => parseDeclaredNodeVerificationScripts([]), /invalid package.json/)
    assert.throws(() => parseDeclaredNodeVerificationScripts({ scripts: [] }), /scripts must be an object/)
    assert.deepEqual(parseDeclaredNodeVerificationScripts({}), [])
  })
})
