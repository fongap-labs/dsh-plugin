/** Audited, immutable GitHub skill catalog and task-to-skill selection. No Host SDK. */
export interface ApprovedGitHubSkill {
  readonly name: string
  readonly description: string
  readonly owner: string
  readonly repository: string
  readonly commit: string
  readonly path: string
  /** Git's SHA-1 of the exact "blob <byte-length>\0<content>" object. */
  readonly blobSha: string
  readonly keywords: readonly string[]
}

const VERCEL_COMMIT = '1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62'

/** Add entries only after a source review and a separate content-hash update. */
export const APPROVED_GITHUB_SKILLS: readonly ApprovedGitHubSkill[] = [
  {
    name: 'vercel-react-best-practices',
    description: 'Verified pinned Vercel guidance for React and Next.js components, performance, bundles and fetching.',
    owner: 'vercel-labs',
    repository: 'agent-skills',
    commit: VERCEL_COMMIT,
    path: 'skills/react-best-practices/SKILL.md',
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
    blobSha: 'd07025bf943345bc1cf15eb923594f889ff881f0',
    keywords: ['compound component', 'composition pattern', 'render props', 'react context', '组件组合', '复合组件', '组件架构'],
  },
]

/** Suggest at most two specialist skills, never based on untrusted tool output. */
export function matchApprovedGitHubSkills(
  task: string,
  catalog: readonly ApprovedGitHubSkill[] = APPROVED_GITHUB_SKILLS,
): string[] {
  const input = task.toLowerCase().slice(-2048)
  if (!input.trim()) return []
  const hasReactContext = /react|next[.\s-]?js|nextjs|\u7ec4\u4ef6\u7ec4\u5408|\u590d\u5408\u7ec4\u4ef6/.test(input)
  const matches = catalog.filter(entry =>
    entry.keywords.some(keyword => input.includes(keyword.toLowerCase())) &&
    (entry.name !== 'vercel-composition-patterns' || hasReactContext))
  return matches.slice(0, 2).map(entry => entry.name)
}
