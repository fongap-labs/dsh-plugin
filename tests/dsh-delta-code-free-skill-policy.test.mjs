import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { isFreeSkillLicense, freeLicenseFromText, inspectFreeSkillText, referencedLocalSkillFiles, hasUnlinkedSkillDependencies, FREE_ONLY_TOOL_GUIDANCE } from '../packages/dsh-delta-code/lib/delta-code-strategy/free-skill-policy.js'
import { createApprovedGitHubSkillProvider } from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/github/approved-skills.js'

const skill = body => ['---','name: example','description: Free coding guidance','---','','# Skill',body].join('\n')
const sha = text => {
  const bytes = Buffer.from(text)
  return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
}

describe('Delta Code free-only external Skill policy', () => {
  it('recognizes free license evidence but treats unknown or commercial licenses as unavailable', () => {
    assert.equal(isFreeSkillLicense('MIT'), true)
    assert.equal(isFreeSkillLicense('Apache-2.0'), true)
    assert.equal(isFreeSkillLicense('NOASSERTION'), false)
    assert.equal(isFreeSkillLicense(undefined), false)
    assert.equal(freeLicenseFromText('MIT License\nPermission is hereby granted'), 'MIT')
    assert.equal(freeLicenseFromText('SPDX-License-Identifier: Apache-2.0'), 'Apache-2.0')
    assert.equal(freeLicenseFromText('Paid proprietary license'), null)
  })
  it('excludes paid APIs, subscriptions, and unreviewed dependencies', () => {
    for (const body of [
      'Requires a paid API subscription.',
      'You must purchase credits to access this tool.',
      'Only available on a pro plan account.',
      '\u8c03\u7528\u8be5\u5de5\u5177\u5fc5\u987b\u4ed8\u8d39\u8ba2\u9605\u670d\u52a1\u3002',
    ]) assert.equal(inspectFreeSkillText(skill(body), 'MIT').status, 'paid', body)
    assert.equal(inspectFreeSkillText(skill('Use the built-in file reader.'), 'MIT').eligible, true)
    assert.equal(inspectFreeSkillText(skill('See [script](./scripts/tool.sh)'), 'MIT').status, 'unknown')
    for (const reference of [
      '[mini rules](refactoring.mini.md)', '[docs](refactoring.md#examples)',
      '[notes](../references/rules.md)', '[subfolder](references/tool.md)',
      '[link](./README.md)', '[absolute](/external/steps.md)',
    ]) {
      assert.equal(inspectFreeSkillText(skill('Before work, read ' + reference), 'MIT').status, 'unknown')
    }
    assert.deepEqual(referencedLocalSkillFiles('[mini](refactoring.mini.md) [web](https://example.com) [anchor](#intro)'),
      ['refactoring.mini.md'])
    assert.match(FREE_ONLY_TOOL_GUIDANCE, /unknown prices/)
  })
  it('detects unlinked bundle dependencies without rejecting fully linked free references', () => {
    for (const source of [
      'Read guide.mini.md for details.',
      'See references/setup.txt',
      'Read ../private.md for additional instructions.',
      'Use ./scripts/install.sh before work.',
      'Open scripts/start.sh',
      'Review references/guide.md next.',
      '\u8bf7\u9605\u8bfb guide.nano.md \u5b8c\u6210\u4efb\u52a1\u3002',
      'Review [mini](guide.mini.md) and then read extra.md.',
      'Read [mini](guide.mini.md) then follow scripts/run.sh.',
    ]) assert.equal(hasUnlinkedSkillDependencies(source), true, source)
    for (const source of [
      'Read [mini](guide.mini.md) before starting.',
      'See [guide](references/guide.md#intro) for safe instructions.',
      'Use the built-in file reader only.',
      'The example references file names in general, without retrieving files.',
    ]) assert.equal(hasUnlinkedSkillDependencies(source), false, source)
  })

  it('does not expose paid remote Skill content through native provider get()', async () => {
    const content = skill('Requires a paid API subscription.')
    const catalog = [{
      name: 'example', description: 'Example', owner: 'demo', repository: 'skills',
      path: 'skills/example/SKILL.md', license: 'MIT', commit: 'a'.repeat(40),
      blobSha: sha(content), keywords: ['example'],
    }]
    let requests = 0
    const provider = createApprovedGitHubSkillProvider(async () => {
      requests++
      return new Response(content)
    }, catalog)
    const [candidate] = await provider.list()
    assert.ok(candidate)
    await assert.rejects(provider.get(candidate), /excluded by free-only policy/)
    assert.equal(requests, 1)
    const unknown = createApprovedGitHubSkillProvider(async () => {
      throw Error('should never fetch unknown-cost Skill')
    }, [{ ...catalog[0], license: 'Commercial' }])
    assert.deepEqual(await unknown.list(), [])
  })
})
