/** Read-only, account-scoped GitHub Skill discovery and candidate evidence. */
import { createHash } from 'node:crypto'
import type { Settings } from '../types.js'
import type { DeltaGitHubTransport } from '../delta-code-adapter/contracts/github.js'
import { GitHubApiFailure } from '../delta-code-adapter/contracts/github.js'
import { selectGitHubAccount, validatedCommitSha } from './github-policy.js'
import { APPROVED_GITHUB_SKILLS } from '../delta-code-strategy/trusted-github-skills.js'
import type { DeltaGitHubExecution, DeltaGitHubRepositoryResolver, DeltaGitHubToolSpec } from './github-operations.js'

const SKILL_PATH = /^skills\/[a-z0-9-]+\/SKILL\.md$/
const MAX_SKILL_BYTES = 64 * 1024
const MAX_LICENSE_BYTES = 32 * 1024
const LICENSE_PATH = /^(?:LICENSE(?:\.md|\.txt)?|skills\/[a-z0-9-]+\/LICENSE(?:\.md|\.txt)?)$/

function decodeFile(data: any, maximum: number): { text: string; sha: string } {
  if (!data || Array.isArray(data) || data.type !== 'file' ||
    data.encoding !== 'base64' || typeof data.content !== 'string' ||
    !Number.isSafeInteger(data.size) || data.size <= 0 || data.size > maximum) {
    throw Error('Skill review requires one bounded GitHub UTF-8 file')
  }
  const clean = data.content.replace(/\s/g, '')
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(clean)) {
    throw Error('Invalid GitHub file encoding')
  }
  const bytes = Buffer.from(clean, 'base64')
  if (!bytes.length || bytes.length !== data.size || bytes.length > maximum) {
    throw Error('Invalid GitHub file size')
  }
  const sha = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
  if (sha !== data.sha) throw Error('GitHub file content hash mismatch')
  return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), sha }
}

function candidateMetadata(markdown: string): { name: string; description: string; hasRelativeReferences: boolean; hasCommandInstructions: boolean } {
  const frontmatter = /^---\r?\n([\s\S]{1,4096}?)\r?\n---\r?\n/.exec(markdown)
  if (!frontmatter || !markdown.slice(frontmatter[0].length).trim()) {
    throw Error('Skill candidate has no bounded SKILL.md frontmatter or body')
  }
  const name = /^name:\s*['"]?([a-z0-9-]+)['"]?\s*$/m.exec(frontmatter[1])?.[1]
  const description = /^description:\s*(.+?)\s*$/m.exec(frontmatter[1])?.[1]
  if (!name || !description) throw Error('Skill candidate name or description unavailable')
  return {
    name, description: description.slice(0, 200),
    hasRelativeReferences: /\]\((?:\.\.?\/|references\/|scripts\/|assets\/)[^)]*\)|(?:^|\s)(?:\.\.?\/)?(?:references|scripts|assets)\//im.test(markdown),
    hasCommandInstructions: /(?:^|\s)(?:curl|wget|npm\s+install|pip\s+install|bash|chmod|eval|npx)\b/im.test(markdown),
  }
}

export function createGitHubSkillDiscoverySpecs(
  settings: Settings, transport: DeltaGitHubTransport, resolveRepo: DeltaGitHubRepositoryResolver,
): DeltaGitHubToolSpec[] {
  const get = async (repository: string, exec: DeltaGitHubExecution, path: string) => {
    exec.signal.throwIfAborted()
    const account = selectGitHubAccount(settings.githubAccounts, repository)
    const response = await transport.request({
      repository, account: account.owner, method: 'GET', path, signal: exec.signal,
    })
    exec.signal.throwIfAborted()
    return response
  }
  const prefix = (repository: string) => '/repos/' + repository.split('/').map(encodeURIComponent).join('/')
  const output = (repository: string, account: string, result: unknown) => ({
    repository, account, result: JSON.stringify(result),
  })
  return [
    {
      name: 'code_github_skill_candidates',
      description: 'Search public GitHub SKILL.md candidates within one configured, authorized repository; results are untrusted and not invocable.',
      parameters: { repository: { type: 'string', required: true }, query: { type: 'string', required: true } },
      async execute(args, exec) {
        if (typeof args.query !== 'string' || !/^[\p{L}\p{N}_ .+\-]{2,100}$/u.test(args.query.trim())) {
          throw Error('Skill search requires a bounded plain-text query')
        }
        const repository = await resolveRepo(args.repository, exec)
        const q = 'repo:' + repository + ' filename:SKILL.md ' + args.query.trim()
        const result = await get(repository, exec, '/search/code?per_page=20&q=' + encodeURIComponent(q))
        if (!Array.isArray(result.data?.items) || !Number.isSafeInteger(result.data?.total_count)) {
          throw Error('GitHub Skill search response is incomplete')
        }
        const latest = await get(repository, exec, prefix(repository) + '/commits?per_page=1')
        const suggestedCommit = Array.isArray(latest.data) &&
          /^[a-f0-9]{40}$/.test(latest.data[0]?.sha) ? latest.data[0].sha : null
        const candidates = result.data.items.slice(0, 20)
          .filter((item: any) => item && typeof item.path === 'string' && SKILL_PATH.test(item.path))
          .map((item: any) => ({ repository, path: item.path, name: item.path.split('/')[1],
            suggestedCommit, status: 'unreviewed', requiresReview: true }))
        return output(repository, result.account, {
          totalMatches: result.data.total_count, candidates, truncated: result.data.total_count > 20,
          note: 'Candidates come from the search index; suggestedCommit is a separate default-branch snapshot, not proof the result exists at that commit. Verify the pinned file before proposing approval.',
        })
      },
    },
    {
      name: 'code_github_skill_review',
      description: 'Inspect one pinned GitHub SKILL.md and its license evidence without running or loading it; always requires independent approval.',
      parameters: {
        repository: { type: 'string', required: true }, path: { type: 'string', required: true },
        commit: { type: 'string', required: true }, licensePath: { type: 'string' },
      },
      async execute(args, exec) {
        const repository = await resolveRepo(args.repository, exec)
        const commit = validatedCommitSha(args.commit, 'Skill candidate')
        if (typeof args.path !== 'string' || !SKILL_PATH.test(args.path)) {
          throw Error('Skill candidate must be a single skills/name/SKILL.md file')
        }
        const licensePath = args.licensePath ?? 'LICENSE'
        if (typeof licensePath !== 'string' || !LICENSE_PATH.test(licensePath)) {
          throw Error('Unsupported Skill license evidence path')
        }
        const path = prefix(repository) + '/contents/' + args.path + '?ref=' + commit
        const skill = await get(repository, exec, path)
        const source = decodeFile(skill.data, MAX_SKILL_BYTES)
        const metadata = candidateMetadata(source.text)
        if (metadata.name !== args.path.split('/')[1]) {
          throw Error('Skill candidate name does not match its source path')
        }
        let licenseEvidence: { path: string; blobSha: string } | null = null
        try {
          const license = await get(repository, exec, prefix(repository) +
            '/contents/' + licensePath + '?ref=' + commit)
          const verified = decodeFile(license.data, MAX_LICENSE_BYTES)
          licenseEvidence = { path: licensePath, blobSha: verified.sha }
        } catch (error) {
          if (!(error instanceof GitHubApiFailure && error.status === 404)) throw error
        }
        const approved = APPROVED_GITHUB_SKILLS.some(entry =>
          (entry.owner + '/' + entry.repository).toLowerCase() === repository.toLowerCase() &&
          entry.commit === commit && entry.path === args.path && entry.blobSha === source.sha)
        return output(repository, skill.account, {
          reviewState: approved ? 'already-approved' : 'requires-human-review',
          metadata, source: { repository, path: args.path, commit, blobSha: source.sha },
          licenseEvidence, licenseVerified: false,
          hasRequiredBundleReview: metadata.hasRelativeReferences,
          warnings: [
            ...(licenseEvidence ? [] : ['No pinned license file found']),
            ...(metadata.hasRelativeReferences ? ['Relative resources require individually pinned bundle review'] : []),
            ...(metadata.hasCommandInstructions ? ['Command instructions require explicit security review'] : []),
          ],
          approvalRequired: !approved,
          note: 'Read-only evidence, not installation, trust approval or a model-invocable Skill. Update the reviewed catalog by PR only.',
        })
      },
    },
  ]
}
