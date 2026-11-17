/** Audited, immutable GitHub skill catalog and task-to-skill selection. No Host SDK. */
/** Increment only when the reviewed active/revoked catalog changes. */
export const APPROVED_GITHUB_SKILLS_CATALOG_VERSION = 1

export interface ApprovedGitHubSkill {
  readonly name: string
  readonly sourceName?: string
  readonly description: string
  readonly license: string
  readonly owner: string
  readonly repository: string
  readonly commit: string
  readonly path: string
  /** Git's SHA-1 of the exact "blob <byte-length>\0<content>" object. */
  readonly blobSha: string
  readonly keywords: readonly string[]
}

/** Explicit user refusal of external Skill use; not a generic coding-mode opt-out. */
const EXTERNAL_SKILL_OPT_OUT = /(?:\b(?:do\s+not|don't|dont|never|avoid|skip|stop|without)\s+(?:(?:the|any|all|external|github|remote|approved|third-party)\s+){0,3}(?:(?:use|using|load|loading|invoke|call|search|find|discover|recommend)\s+(?:(?:the|any|all|external|github|remote|approved|third-party|react)\s+){0,3})?skills?\b|\bno\s+(?:(?:external|github|remote)\s+){0,2}skills?\b|(?:\u4e0d\u8981|\u7981\u6b62|\u522b|\u65e0\u9700|\u4e0d\u9700\u8981|\u907f\u514d|\u8df3\u8fc7|\u505c\u6b62|\u4e0d\u4f7f\u7528|\u4e0d\u8c03\u7528|\u4e0d\u52a0\u8f7d)[^\n\u3002.!?\uff1f]{0,40}(?:skill|\u6280\u80fd))/i

/** Current user task only: negated Skill intent must not trigger discovery or loading. */
export function isExternalSkillOptOut(text: string): boolean {
  return EXTERNAL_SKILL_OPT_OUT.test(text.slice(-2048))
}

const VERCEL_COMMIT = '1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62'
const ANTHROPIC_COMMIT = 'e4bb5d960d87126ff3b3a8af1a104b7db67560ba'
const ADDY_COMMIT = '39b723ceebf81474d0557c1fecd01eddab585563'

/** Add entries only after a source review and a separate content-hash update. */
export const APPROVED_GITHUB_SKILLS: readonly ApprovedGitHubSkill[] = [
  {
    name: 'vercel-react-best-practices',
    description: 'Verified pinned Vercel guidance for React and Next.js components, performance, bundles and fetching.',
    owner: 'vercel-labs',
    repository: 'agent-skills',
    commit: VERCEL_COMMIT,
    path: 'skills/react-best-practices/SKILL.md',
    license: 'MIT',
    blobSha: '237988de4a66dd8a71d30a2c24ebe1a86b58d04e',
    keywords: ['react', 'next.js', 'nextjs', 'next js', 'react组件', 'react 组件', 'react性能', 'react 性能'],
  },
  {
    name: 'vercel-composition-patterns',
    description: 'Verified pinned Vercel guidance for compound React components, reusable APIs, providers and component composition.',
    owner: 'vercel-labs',
    repository: 'agent-skills',
    commit: VERCEL_COMMIT,
    path: 'skills/composition-patterns/SKILL.md',
    license: 'MIT',
    blobSha: 'd07025bf943345bc1cf15eb923594f889ff881f0',
    keywords: ['compound component', 'composition pattern', 'render props', 'react context', '组件组合', '复合组件', '组件架构'],
  },
  {
    name: 'anthropic-frontend-design',
    sourceName: 'frontend-design',
    description: 'Pinned Anthropic guidance for distinctive UI design, typography, accessibility, restraint and self-critique.',
    owner: 'anthropics',
    repository: 'skills',
    commit: ANTHROPIC_COMMIT,
    path: 'skills/frontend-design/SKILL.md',
    blobSha: 'a5333457c414d20d625f307df945842c0952ecc3',
    license: 'Apache-2.0',
    keywords: ['frontend design', 'ui design', 'visual design', 'desktop ui', 'tauri ui', 'react ui', 'layout design', 'design system', '前端设计', '界面设计', 'UI设计', 'UI 设计', '视觉设计', '交互设计', '桌面界面'],
  },
  {
    name: 'addy-api-and-interface-design',
    sourceName: 'api-and-interface-design',
    description: 'Pinned Addy Osmani guidance for stable APIs, module boundaries, contracts, error semantics and backward compatibility.',
    owner: 'addyosmani',
    repository: 'agent-skills',
    commit: ADDY_COMMIT,
    path: 'skills/api-and-interface-design/SKILL.md',
    blobSha: 'ce58d72ed0ee6568400f36564c94becfaeede717',
    license: 'MIT',
    keywords: ['api design', 'api contract', 'api compatibility', 'public interface', 'module boundary', 'module boundaries', 'interface contract', 'protocol design', 'rest api design', 'contract first', '接口设计', 'API设计', '接口契约', '模块边界', '协议设计', '向后兼容', '兼容性设计'],
  },
]


/** Exact immutable revisions withdrawn by a reviewed catalog change. */
export interface RevokedGitHubSkillRevision {
  readonly name: string
  readonly commit: string
  readonly blobSha: string
  readonly revokedAt: string
  readonly reason: string
}

/**
 * Revocation is code-reviewed and ships with the plugin; there is deliberately
 * no remote kill-switch or mutable third-party catalog in the trust path.
 * Keep tombstones so a withdrawn immutable revision cannot be re-added by mistake.
 */
export const REVOKED_GITHUB_SKILL_REVISIONS: readonly RevokedGitHubSkillRevision[] = []

export function isRevokedGitHubSkillRevision(
  skill: ApprovedGitHubSkill,
  revocations: readonly RevokedGitHubSkillRevision[] = REVOKED_GITHUB_SKILL_REVISIONS,
): boolean {
  return revocations.some(revoked =>
    revoked.name === skill.name &&
    revoked.commit === skill.commit &&
    revoked.blobSha === skill.blobSha)
}

export function getActiveApprovedGitHubSkills(
  catalog: readonly ApprovedGitHubSkill[] = APPROVED_GITHUB_SKILLS,
  revocations: readonly RevokedGitHubSkillRevision[] = REVOKED_GITHUB_SKILL_REVISIONS,
): readonly ApprovedGitHubSkill[] {
  return catalog.filter(skill => !isRevokedGitHubSkillRevision(skill, revocations))
}

/** Suggest at most two specialist skills, never based on untrusted tool output. */
export function matchApprovedGitHubSkills(
  task: string,
  catalog: readonly ApprovedGitHubSkill[] = APPROVED_GITHUB_SKILLS,
  revocations: readonly RevokedGitHubSkillRevision[] = REVOKED_GITHUB_SKILL_REVISIONS,
): string[] {
  const input = task.toLowerCase().slice(-2048)
  if (!input.trim() || isExternalSkillOptOut(input)) return []
  const hasReactContext = /react|next[.\s-]?js|nextjs|\u7ec4\u4ef6\u7ec4\u5408|\u590d\u5408\u7ec4\u4ef6/.test(input)
  const matches = getActiveApprovedGitHubSkills(catalog, revocations).filter(entry =>
    entry.keywords.some(keyword => input.includes(keyword.toLowerCase())) &&
    (entry.name !== 'vercel-composition-patterns' || hasReactContext))
  return matches.slice(0, 2).map(entry => entry.name)
}
