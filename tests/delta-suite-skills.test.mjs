import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stripTypeScriptTypes } from 'node:module'

test('Delta-managed skills lifecycle, native read-only visibility, path safety', async () => {
  const base = await mkdtemp(join(tmpdir(), 'delta-suite-skills-'))
  const original = process.env.DSH_HOME
  process.env.DSH_HOME = base
  try {
    const source = await readFile(new URL('../packages/dsh-suite-delta/src/host/skills.ts', import.meta.url), 'utf8')
    const js = stripTypeScriptTypes(source, { mode: 'strip' })
    const { mutateSkill, listSkills } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
    await assert.rejects(mutateSkill({ action: 'create', name: '../unsafe', description: 'x', body: 'x' }))
    await mutateSkill({ action: 'create', name: 'demo-skill', description: 'Test', body: '# Instructions\nDo something' })
    let item = await mutateSkill({ action: 'read', name: 'demo-skill' })
    assert.match(item.body, /Do something/)
    assert.equal(item.description, 'Test')
    await assert.rejects(mutateSkill({ action: 'create', name: 'demo-skill', description: 'duplicate', body: 'x' }))
    let list = await listSkills({ list: async () => [{ name: 'bundled-skill', description: 'Bundled', source: 'bundled', provider: 'host' }] })
    assert.equal(list.items.find(x => x.name === 'bundled-skill')?.managed, false)
    assert.equal(list.items.find(x => x.name === 'demo-skill')?.managed, true)
    await mutateSkill({ action: 'toggle', name: 'demo-skill', enabled: false })
    list = await listSkills()
    assert.equal(list.items.find(x => x.name === 'demo-skill')?.enabled, false)
    await assert.rejects(mutateSkill({ action: 'create', name: 'demo-skill', description: 'duplicate', body: 'x' }))
    await mutateSkill({ action: 'update', name: 'demo-skill', description: 'Revised', body: '# Updated' })
    item = await mutateSkill({ action: 'read', name: 'demo-skill' })
    assert.match(item.body, /Updated/)
    await mutateSkill({ action: 'toggle', name: 'demo-skill', enabled: true })
    const { listSkillRevisions, restoreSkillRevision } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
    const revisions = await listSkillRevisions('demo-skill')
    assert.equal(revisions.revisions.length, 1)
    await restoreSkillRevision('demo-skill', revisions.revisions[0].id)
    item = await mutateSkill({ action: 'read', name: 'demo-skill' })
    assert.match(item.body, /Do something/)
    assert.equal((await listSkillRevisions('demo-skill')).revisions.length, 2)
    await assert.rejects(restoreSkillRevision('demo-skill', '../../unsafe.md'))
    await mutateSkill({ action: 'delete', name: 'demo-skill' })
    assert.equal((await listSkills()).items.some(x => x.name === 'demo-skill'), false)
    const root = join(base, 'skills')
    await writeFile(join(root, 'foreign.md'), '---\nname: foreign\ndescription: Foreign\n---\nHello')
    await assert.rejects(mutateSkill({ action: 'delete', name: 'foreign' }), /not managed/)
    await assert.rejects(mutateSkill({ action: 'toggle', name: 'foreign', enabled: false }), /not managed/)
  } finally {
    if (original === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = original
    await rm(base, { recursive: true, force: true })
  }
})
