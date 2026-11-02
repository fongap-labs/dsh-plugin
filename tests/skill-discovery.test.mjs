import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const skill = new URL('../.agents/skills/dsh-plugin-dev/SKILL.md', import.meta.url)
const legacy = new URL('../.dsh/skills/SKILL.md', import.meta.url)

test('development skill uses a supported project-level agents discovery path', () => {
  const text = readFileSync(skill, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)
  assert.ok(match, 'Skill must have YAML frontmatter')
  assert.match(match[1], /^name: dsh-plugin-dev$/m)
  assert.match(match[1], /^description: \S.+$/m)
  assert.equal(existsSync(legacy), false, 'Do not keep a duplicate legacy skill')
})
