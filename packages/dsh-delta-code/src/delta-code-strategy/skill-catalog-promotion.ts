/**
 * Pure catalog promotion preparation. The staged proposal is an immutable
 * precondition; no untrusted Skill text is evaluated or copied into source
 * code. Every promoted revision still requires a new CI-verified PR.
 */
import {
  assertReviewedSkillCatalog,
  reviewedSkillAdmissionPath,
  validateReviewedSkillAdmission,
  type ReviewedSkillAdmission,
} from './skill-catalog-admission.js'
import type { ApprovedGitHubSkill } from './trusted-github-skills.js'

const VERSION = /export const APPROVED_GITHUB_SKILLS_CATALOG_VERSION = ([1-9][0-9]*)/
const CATALOG = 'export const APPROVED_GITHUB_SKILLS: readonly ApprovedGitHubSkill[] = ['
const SKILL_NAME = /^skills\/([a-z0-9-]+)\/SKILL\.md$/
const MAX_CATALOG_BYTES = 96 * 1024

export interface PreparedSkillPromotion {
  readonly admissionPath: string
  readonly admissionJson: string
  readonly catalogPath: 'packages/dsh-delta-code/src/delta-code-strategy/trusted-github-skills.ts'
  readonly catalogContent: string
  readonly entry: ApprovedGitHubSkill
  readonly nextVersion: number
}

/** No caller-provided executable instructions, description or keyword metadata. */
export function prepareReviewedSkillPromotion(
  record: unknown,
  source: string,
): PreparedSkillPromotion {
  const admission = validateReviewedSkillAdmission(record)
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > MAX_CATALOG_BYTES) {
    throw Error('Trusted Skill catalog is unavailable or exceeds size budget')
  }
  const versionMatch = VERSION.exec(source)
  const catalogStart = source.indexOf(CATALOG)
  if (!versionMatch || source.match(new RegExp(VERSION.source, 'g'))?.length !== 1 ||
      catalogStart === -1 || source.indexOf(CATALOG, catalogStart + 1) !== -1) {
    throw Error('Trusted catalog source layout changed; manual review required')
  }
  const version = Number(versionMatch[1])
  if (!Number.isSafeInteger(version) || version >= Number.MAX_SAFE_INTEGER) {
    throw Error('Invalid trusted Skill catalog version')
  }
  const arrayEnd = source.indexOf('\n]', catalogStart + CATALOG.length)
  if (arrayEnd === -1 || !source.slice(arrayEnd).startsWith('\n]\n')) {
    throw Error('Trusted catalog array terminator is missing')
  }
  const proposal = admission.proposal
  const name = proposal.source.path.match(SKILL_NAME)?.[1]
  const [owner, repository] = proposal.source.repository.split('/')
  if (!name || !owner || !repository || !/^[a-z0-9-]+$/.test(owner) ||
      !/^[a-z0-9_.-]+$/.test(repository)) {
    throw Error('Unrecognized reviewed Skill source name')
  }
  // An owner prefix avoids collisions between otherwise identical Skill
  // folders in different repositories; all metadata is generated locally.
  const publicName = owner + '-' + name
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(publicName) ||
      new RegExp('\\bname:\\s*[\\x27\\x22]' + publicName + '[\\x27\\x22]').test(
        source.slice(catalogStart, arrayEnd))) {
    throw Error('A trusted Skill with this name already exists')
  }
  const tokens = name.split('-').filter(token => token.length >= 2 && token.length <= 64)
  const keywords = [...new Set([name, ...tokens])].filter(token => token.length >= 2 && token.length <= 64)
  if (!keywords.length) throw Error('Skill must have at least one safe search keyword')
  const entry: ApprovedGitHubSkill = {
    name: publicName,
    sourceName: name,
    description: 'Pinned free documentation skill ' + name + ' from ' + owner + '/' + repository,
    owner, repository,
    path: proposal.source.path,
    commit: proposal.source.commit,
    blobSha: proposal.source.sourceBlobSha,
    license: proposal.source.license,
    keywords,
  }
  assertReviewedSkillCatalog([entry], [admission], version + 1)
  const serialized = JSON.stringify(entry, null, 2).split('\n')
    .map(line => '  ' + line).join('\n')
  const catalogContent = source.slice(0, arrayEnd) + '\n' + serialized + ',' +
    source.slice(arrayEnd)
  const versioned = catalogContent.replace(VERSION,
    'export const APPROVED_GITHUB_SKILLS_CATALOG_VERSION = ' + (version + 1))
  return {
    admissionPath: reviewedSkillAdmissionPath(admission),
    admissionJson: JSON.stringify(admission, null, 2) + '\n',
    catalogPath: 'packages/dsh-delta-code/src/delta-code-strategy/trusted-github-skills.ts',
    catalogContent: versioned,
    entry,
    nextVersion: version + 1,
  }
}
