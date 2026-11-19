/** Staged Skill proposal contract. Proposal files are inert: never a trusted Skill catalog. */
import { isFreeSkillLicense } from './free-skill-policy.js'

const SHA = /^[a-f0-9]{40}$/
const REPOSITORY = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/
const SKILL_PATH = /^skills\/([a-z0-9-]+)\/SKILL\.md$/

export interface PendingSkillProposal {
  readonly schemaVersion: 1
  readonly state: 'pending-ci-review'
  readonly source: {
    readonly repository: string
    readonly path: string
    readonly commit: string
    readonly sourceBlobSha: string
    readonly licenseBlobSha: string
    readonly license: string
  }
  readonly staticAudit: {
    readonly status: 'static-review-ready'
    readonly riskIndicators: readonly []
    readonly freeUseEvidence: true
  }
  readonly approvalRequired: true
  readonly autoEnabled: false
  readonly executable: false
}

export function makePendingSkillProposal(report: unknown): PendingSkillProposal {
  const data = report as {
    candidate?: Record<string, unknown>; license?: unknown
    reviewStatus?: unknown; freeEligibility?: { eligible?: unknown; status?: unknown }
    riskIndicators?: unknown; approvalRequired?: unknown; autoEnabled?: unknown; executable?: unknown
  }
  if (!data || data.reviewStatus !== 'static-review-ready' ||
      data.freeEligibility?.eligible !== true || data.freeEligibility.status !== 'free-evidence' ||
      !isFreeSkillLicense(data.license) || !Array.isArray(data.riskIndicators) ||
      data.riskIndicators.length !== 0 || data.approvalRequired !== true ||
      data.autoEnabled !== false || data.executable !== false) {
    throw new Error('Skill requires additional security/free-use review; refusing automatic catalog admission')
  }
  const source = data.candidate
  if (!source || typeof source.repository !== 'string' || !REPOSITORY.test(source.repository) ||
      typeof source.path !== 'string' || !SKILL_PATH.test(source.path) ||
      source.repository.includes('..') || ['.', '..'].includes(source.repository.split('/')[1]!) ||
      !['commit', 'sourceBlobSha', 'licenseBlobSha'].every(key =>
        typeof source[key] === 'string' && SHA.test(source[key]))) {
    throw new Error('Unverified immutable Skill proposal source')
  }
  return {
    schemaVersion: 1,
    state: 'pending-ci-review',
    source: {
      repository: source.repository, path: source.path,
      commit: source.commit as string, sourceBlobSha: source.sourceBlobSha as string,
      licenseBlobSha: source.licenseBlobSha as string, license: data.license as string,
    },
    staticAudit: {
      status: 'static-review-ready', riskIndicators: [], freeUseEvidence: true,
    },
    approvalRequired: true, autoEnabled: false, executable: false,
  }
}

export function validatePendingSkillProposal(input: unknown): PendingSkillProposal {
  const value = input as PendingSkillProposal
  if (!value || value.schemaVersion !== 1 || value.state !== 'pending-ci-review' ||
      value.approvalRequired !== true || value.autoEnabled !== false ||
      value.executable !== false || !value.staticAudit ||
      value.staticAudit.status !== 'static-review-ready' ||
      value.staticAudit.freeUseEvidence !== true ||
      !Array.isArray(value.staticAudit.riskIndicators) ||
      value.staticAudit.riskIndicators.length !== 0 ||
      !value.source || !isFreeSkillLicense(value.source.license)) {
    throw new Error('Invalid inert Skill proposal manifest')
  }
  const check = makePendingSkillProposal({
    candidate: value.source, license: value.source.license,
    reviewStatus: value.staticAudit.status,
    freeEligibility: { status: 'free-evidence', eligible: value.staticAudit.freeUseEvidence },
    riskIndicators: value.staticAudit.riskIndicators,
    approvalRequired: value.approvalRequired,
    autoEnabled: value.autoEnabled, executable: value.executable,
  })
  if (JSON.stringify(value) !== JSON.stringify(check)) {
    throw new Error('Skill proposal has unrecognized fields or different canonical representation')
  }
  return check
}

export function pendingSkillProposalPath(proposal: PendingSkillProposal): string {
  const { repository, path, commit } = proposal.source
  const [owner, name] = repository.toLowerCase().split('/')
  const skill = path.match(SKILL_PATH)![1]!
  return 'packages/dsh-delta-code/skill-proposals/' +
    [owner, name, skill, commit.slice(0, 12)].join('-') + '.json'
}
