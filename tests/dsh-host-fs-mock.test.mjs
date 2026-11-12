import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sep } from 'node:path'
import { mockHostPathContains, mockHostFsContext } from './helpers/host-fs-mock.mjs'

describe('Shared test-only DSH Host FS contract', () => {
  it('accepts the directory itself and direct or nested children', () => {
    const root = { key: 'workspace' }
    assert.equal(mockHostPathContains(root, { key: 'workspace' }, 'key'), true)
    assert.equal(mockHostPathContains(root, { key: 'workspace' + sep + 'src' }, 'key'), true)
    assert.equal(mockHostPathContains(root, { key: 'workspace' + sep + 'src' + sep + 'a.ts' }, 'key'), true)
  })

  it('rejects sibling prefixes and paths outside the virtual workspace', () => {
    const root = { path: '/workspace' }
    assert.equal(mockHostPathContains(root, { path: '/workspace-extra/secret' }, 'path', '/'), false)
    assert.equal(mockHostPathContains(root, { path: '/another/secret' }, 'path', '/'), false)
  })

  it('supports all four target shapes without converting POSIX Host paths to local paths', () => {
    for (const field of ['key', 'path', 'targetKey', 'p']) {
      assert.equal(mockHostPathContains({ [field]: '/host' }, { [field]: '/host/repo' }, field, '/'), true)
    }
  })

  it('fails on missing or incorrectly typed Host identity fields', () => {
    assert.throws(() => mockHostPathContains({ key: '/repo' }, { path: '/repo/a' }, 'key'), /typed/)
    assert.throws(() => mockHostPathContains({ key: 5 }, { key: '/repo/a' }, 'key'), /typed/)
    assert.throws(() => mockHostPathContains({ key: '' }, { key: '/repo/a' }, 'key'), /typed/)
    assert.throws(() => mockHostPathContains({ key: '/repo' }, { key: '/repo/a' }, 'key', ''), /typed/)
  })

  it('exposes the exact Host FS instance only under the fs service', () => {
    const fs = { resolve: async () => ({ key: '/host' }) }
    const subprocess = { spawn: () => { throw new Error('Host denied') } }
    const ctx = mockHostFsContext(fs, { subprocess, get: () => 'unsafe shadow' })
    assert.strictEqual(ctx.get('fs'), fs)
    assert.equal(ctx.get('workingDirectory'), undefined)
    assert.strictEqual(ctx.subprocess, subprocess)
    assert.deepEqual(Object.keys(ctx.get('fs')), ['resolve'])
  })

  it('does not add optional capabilities to an incomplete Host', () => {
    const ctx = mockHostFsContext({ resolve: async () => undefined })
    assert.equal('contains' in ctx.get('fs'), false)
    assert.equal(ctx.get('fs').readText, undefined)
    assert.equal(ctx.subprocess, undefined)
  })
})
