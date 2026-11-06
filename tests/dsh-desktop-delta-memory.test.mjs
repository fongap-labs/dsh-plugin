import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('..', import.meta.url)
const version = process.versions.node.split('.').map(Number)
const sqliteReady = version[0] > 22 || (version[0] === 22 && version[1] >= 13)

describe('Delta memory storage, privacy and native integration', () => {
  it('uses native compaction instead of installing a competing compactor', () => {
    const entry = readFileSync(new URL('../packages/dsh-suite-delta/src/index.ts', import.meta.url), 'utf8')
    const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')
    assert.match(client, /const contextRow =/)
    assert.match(client, /\/compact/)
    assert.doesNotMatch(entry, /compactIfNeeded|compactNow|compaction\/summary/)
    assert.match(entry, /registerMemoryTools/)
  })

  it('persists scoped memories, supersedes conflicts and prevents credential storage', { skip: !sqliteReady }, () => {
    const home = mkdtempSync(join(tmpdir(), 'delta-memory-test-'))
    const program = "import assert from 'node:assert/strict'\nimport { deltaMemory, DeltaMemory } from './packages/dsh-suite-delta/lib/host/memory.js'\nconst db = deltaMemory\nassert.deepEqual(await db.settings(), { autoCapture: false, recall: true })\nconst first = await db.save({ scope: 'project', scopeId: 'workspace-a', key: 'architecture', category: 'decision', content: 'Use Rust for the backend', sourceSession: 'session-a', source: 'manual' })\nassert.equal(first.category, 'decision')\nassert.equal((await db.search({ query: 'Rust', projectId: 'workspace-a' })).length, 1)\nassert.equal((await db.search({ query: 'Rust', projectId: 'workspace-b' })).length, 0)\nassert.equal((await db.search({ query: 'Rust', sessionId: 'session-a' })).length, 0)\nconst second = await db.save({ scope: 'project', scopeId: 'workspace-a', key: 'architecture', category: 'decision', content: 'Use TypeScript for the backend', sourceSession: 'session-b', source: 'manual' })\nassert.notEqual(first.id, second.id)\nassert.equal((await db.search({ query: 'Rust', projectId: 'workspace-a' })).length, 0)\nassert.equal((await db.search({ query: 'TypeScript', projectId: 'workspace-a' })).length, 1)\nassert.equal((await db.get(first.id)).status, 'superseded')\nconst global = await db.save({ content: 'Prefer concise responses', key: 'style', category: 'preference', scope: 'global' })\nassert.equal((await db.search({ query: 'concise' })).length, 1)\nawait db.save({ content: 'Session-specific note', scope: 'session', scopeId: 'session-a' })\nassert.equal((await db.search({ query: 'Session-specific', sessionId: 'session-a' })).length, 1)\nassert.equal((await db.search({ query: 'Session-specific', sessionId: 'session-b' })).length, 0)\nawait assert.rejects(db.save({ content: 'api_key: abc-secret' }), /credential/i)\nawait assert.rejects(db.save({ content: 'password=secret123' }), /credential/i)\nawait assert.rejects(db.save({ content: 'Expired', expiresAt: Date.now() - 1 }), /future/)\nawait assert.rejects(db.save({ content: 'Bad', scope: 'project' }), /scopeId/)\nassert.equal((await db.list({ scope: 'project', scopeId: 'workspace-a' })).length, 1)\nawait db.setSettings({ autoCapture: true, recall: false })\nassert.deepEqual(await db.settings(), { autoCapture: true, recall: false })\nconst backup = await db.export()\nassert.equal(backup.version, 1)\nassert.ok(backup.memories.length >= 3)\nassert.equal(await db.remove(global.id), true)\nassert.equal((await db.search({ query: 'concise' })).length, 0)\nconst restored = await db.import({ version: 1, memories: [global] })\nassert.equal(restored.imported, 1)\nassert.equal((await db.search({ query: 'concise' })).length, 1)\nassert.ok((await db.get(second.id)).sourceSession === 'session-b')\ndb.close()\nconst reopened = new DeltaMemory()\nassert.equal((await reopened.search({ query: 'TypeScript', projectId: 'workspace-a' })).length, 1)\nassert.deepEqual(await reopened.settings(), { autoCapture: true, recall: false })\nreopened.close()"
    try {
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
        cwd: root, env: { ...process.env, DSH_HOME: home }, encoding: 'utf8',
      })
      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error || ''))
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
