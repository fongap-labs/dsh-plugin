import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('..', import.meta.url)
const version = process.versions.node.split('.').map(Number)
const hasSqlite = version[0] > 22 || (version[0] === 22 && version[1] >= 13)

describe('Delta memory backup restore integrity', () => {
  it('never rolls an active decision back to an older imported decision', { skip: !hasSqlite }, () => {
    const home = mkdtempSync(join(tmpdir(), 'delta-memory-backup-'))
    const program = "import assert from 'node:assert/strict'\nimport { deltaMemory } from './packages/dsh-desktop-delta/lib/host/memory.js'\nconst sqlite = deltaMemory\nassert.deepEqual(await sqlite.settings(), { autoCapture: false, recall: true })\nconst current = await sqlite.save({scope:'project',scopeId:'workspace-z',key:'language',category:'decision',content:'Use TypeScript for the implementation',sourceSession:'new-session'})\nconst older = {scope:'project',scopeId:'workspace-z',key:'language',category:'decision',content:'Use Rust for the implementation',sourceSession:'old-session'}\nconst fresh = {scope:'project',scopeId:'workspace-z',key:'api-contract',category:'fact',content:'API follows standard schema',sourceSession:'old-session'}\nconst report = await sqlite.import({version:1,memories:[older,fresh]})\nassert.deepEqual(report,{imported:1,skipped:1})\nassert.equal((await sqlite.search({query:'TypeScript',projectId:'workspace-z'})).length,1)\nassert.equal((await sqlite.search({query:'Rust',projectId:'workspace-z'})).length,0)\nassert.equal((await sqlite.search({query:'schema',projectId:'workspace-z'})).length,1)\nassert.equal((await sqlite.get(current.id)).status,'active')\nassert.deepEqual(await sqlite.import({version:1,memories:[older,fresh]}),{imported:0,skipped:2})\nawait assert.rejects(sqlite.import({version:1,memories:Array(501).fill(fresh)}),/at most 500/)\nassert.equal((await sqlite.scopes()).find(x=>x.scope==='project'&&x.scopeId==='workspace-z').count,2)\nawait sqlite.remove(current.id)\nassert.equal((await sqlite.search({query:'TypeScript',projectId:'workspace-z'})).length,0)\nsqlite.close()"
    try {
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
        cwd: root, env: { ...process.env, DSH_HOME: home }, encoding: 'utf8',
      })
      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error || ''))
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('keeps UI backups chunked below Host request limits', () => {
    const client = readFileSync(new URL('../packages/dsh-desktop-delta/src/client.ts', import.meta.url), 'utf8')
    assert.match(client, /records\.length < 200/)
    assert.match(client, /1_500_000/)
    assert.match(client, /existing decisions preserved/)
  })
})
