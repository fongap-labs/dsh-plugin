import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  rankSkillEvidence, DEFAULT_SKILL_RANKING_WEIGHTS,
} from '../packages/delta-code/lib/delta-code-repository/github-skill-ranking.js'

const NOW = new Date('2026-11-19T00:00:00Z')
const evidence = {
  stars: 1250, forks: 98,
  ownerCreatedAt: '2016-01-01T00:00:00Z',
  repositoryCreatedAt: '2021-01-01T00:00:00Z',
  lastPushAt: '2026-11-01T00:00:00Z',
  archived: false, disabled: false,
}

describe('Delta Code evidence-only Skill ranking', () => {
  it('gives interpretable, capped, log-scaled Star and maintainer-history scores', () => {
    const score = rankSkillEvidence(evidence, NOW)
    assert.equal(score.maximum, Object.values(DEFAULT_SKILL_RANKING_WEIGHTS).reduce((a, b) => a + b))
    assert.equal(score.completeness, 'complete')
    assert.equal(score.inputs.stars, 1250)
    assert.equal(score.inputs.forks, 98)
    assert.equal(score.components.maintainerTenure, DEFAULT_SKILL_RANKING_WEIGHTS.maintainerTenure)
    assert.equal(score.components.repositoryAge, DEFAULT_SKILL_RANKING_WEIGHTS.repositoryAge)
    assert.ok(score.score <= score.maximum)
    assert.ok(score.components.stars > 0)
    assert.ok(score.components.stars < DEFAULT_SKILL_RANKING_WEIGHTS.stars)
    assert.match(score.warning, /not.*approval/i)
    const viral = rankSkillEvidence({ ...evidence, stars: 10_000_000 }, NOW)
    assert.equal(viral.components.stars, DEFAULT_SKILL_RANKING_WEIGHTS.stars)
    assert.equal(viral.components.maintainerTenure, score.components.maintainerTenure)
    assert.ok(viral.score - score.score <= DEFAULT_SKILL_RANKING_WEIGHTS.stars)
    const newborn = rankSkillEvidence({ ...evidence, ownerCreatedAt: '2026-11-18T00:00:00Z' }, NOW)
    assert.ok(newborn.components.maintainerTenure < score.components.maintainerTenure)
  })

  it('marks absent and impossible metadata unknown rather than inventing credibility', () => {
    const unknown = rankSkillEvidence({}, NOW)
    assert.equal(unknown.score, 0)
    assert.equal(unknown.completeness, 'unavailable')
    assert.ok(Object.values(unknown.components).every(x => x === null))
    const partial = rankSkillEvidence({
      stars: 0, forks: -12, ownerCreatedAt: '2099-01-01T00:00:00Z',
      repositoryCreatedAt: 'invalid', lastPushAt: 42,
    }, NOW)
    assert.equal(partial.completeness, 'partial')
    assert.equal(partial.components.stars, 0)
    assert.equal(partial.components.forks, null)
    assert.equal(partial.components.maintainerTenure, null)
    assert.equal(partial.inputs.ownerCreatedAt, null)
    assert.equal(partial.inputs.forks, null)
  })

  it('keeps disabled/archived repositories out of ranked suggestions without authorizing any skill', () => {
    assert.equal(rankSkillEvidence({ ...evidence, archived: true }, NOW).score, 0)
    assert.equal(rankSkillEvidence({ ...evidence, disabled: true }, NOW).score, 0)
    const score = rankSkillEvidence(evidence, NOW)
    assert.equal(Object.hasOwn(score, 'approved'), false)
    assert.equal(Object.hasOwn(score, 'allowedToRun'), false)
  })

  it('allows reviewed scoring policy changes but rejects invalid budgets', () => {
    const weights = { stars: 0, forks: 0, maintainerTenure: 5, repositoryAge: 5, recentMaintenance: 10 }
    const score = rankSkillEvidence(evidence, NOW, weights)
    assert.equal(score.maximum, 20)
    assert.equal(score.components.stars, 0)
    assert.ok(score.score <= 20)
    assert.throws(() => rankSkillEvidence(evidence, NOW, { ...weights, stars: 101 }), /weights/)
    assert.throws(() => rankSkillEvidence(evidence, NOW, { ...weights, stars: -1 }), /weights/)
    assert.throws(() => rankSkillEvidence(evidence, NOW, { ...weights, stars: Number.NaN }), /weights/)
    assert.throws(() => rankSkillEvidence(evidence, NOW, { ...weights, stars: 90 }), /budget/)
    assert.throws(() => rankSkillEvidence(evidence, NOW, { ...weights, stars: 0, forks: 0,
      maintainerTenure: 0, repositoryAge: 0, recentMaintenance: 0 }), /budget/)
  })
})
