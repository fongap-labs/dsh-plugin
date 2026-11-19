/** Public GitHub repository discovery. Never borrows any owner-bound GitHub Token. */
import type { DeltaGitHubTransport } from '../delta-code-adapter/contracts/github.js'
import { GitHubApiFailure } from '../delta-code-adapter/contracts/github.js'
import type { DeltaGitHubToolSpec } from './github-operations.js'
import { rankSkillEvidence } from './github-skill-ranking.js'

const SEARCH_PAGE = 8
const MAX_REPOSITORIES = 4
const MAX_RESULTS = 12
const MAX_CALLS = 13 // one repository search, then at most four commits, trees and owner records
const SKILL_PATH = /^skills\/([a-z0-9-]+)\/SKILL\.md$/
const FULL_NAME = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/
const SHA = /^[a-f0-9]{40}$/
const BRANCH = /^[A-Za-z0-9_][A-Za-z0-9._/-]{0,99}$/

function validatedQuery(value: unknown): string {
  if (typeof value !== 'string') throw new Error('GitHub Skill discovery query must be text')
  const query = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  if (!/^[\p{L}\p{N}_ .+\-]{2,80}$/u.test(query)) {
    throw new Error('GitHub Skill discovery requires a bounded plain-text task')
  }
  return query
}

function relevance(task: string, name: string, repository: string, description: string): {
  readonly score: number; readonly matched: readonly string[]
} {
  const terms = [...new Set(task.toLowerCase().split(/\s+/u).filter(x => x.length >= 2))]
  const haystack = (name + ' ' + repository + ' ' + description).toLowerCase()
  const matched = terms.filter(term => haystack.includes(term))
  return {
    score: terms.length === 0 ? 0 : Math.round(50 * matched.length / terms.length),
    matched,
  }
}

/**
 * A bounded first-page *repository* search, not exhaustive GitHub code search.
 * Only SKILL.md paths found in verified, non-truncated Git trees are returned.
 * Neither public discovery nor the ranking engine grants Skill approval.
 */
export function createPublicSkillDiscoverySpecs(transport: DeltaGitHubTransport): DeltaGitHubToolSpec[] {
  return [{
    name: 'code_github_skill_discover',
    description: 'Search public GitHub repositories for relevant, unapproved SKILL.md candidates. Bounded repository search plus pinned Git tree verification; never uses a configured GitHub Token. Run only when approved/local Skills do not fit and user has not disabled external Skills.',
    parameters: { query: { type: 'string', required: true } },
    async execute(args, exec) {
      const query = validatedQuery(args.query)
      if (!transport.publicRead) {
        throw new Error('public GitHub discovery transport unavailable; do not reuse owner-bound credentials')
      }
      const reader = transport.publicRead
      let calls = 0
      const read = async (path: string): Promise<any> => {
        exec.signal.throwIfAborted()
        if (calls >= MAX_CALLS) throw Error('public GitHub Skill discovery request budget exhausted')
        calls++
        return reader(path, exec.signal)
      }
      const search = await read('/search/repositories?per_page=' + SEARCH_PAGE +
        '&q=' + encodeURIComponent(query + ' skills in:name,description,readme'))
      if (!Array.isArray(search?.items) || !Number.isSafeInteger(search?.total_count) ||
          search.total_count < 0) {
        throw Error('incomplete GitHub public repository search response')
      }

      const results: Array<{
        repository: string; path: string; name: string; suggestedCommit: string;
        sourceBlobSha: string; status: 'unreviewed'; requiresReview: true;
        relevance: ReturnType<typeof relevance>;
        ranking: ReturnType<typeof rankSkillEvidence>; recommendationScore: number
      }> = []
      const seenRepos = new Set<string>()
      const owners = new Map<string, any | null>()
      const skipped: string[] = []
      let isRateLimited = false
      let checkedRepositories = 0
      const repositories = search.items.slice(0, SEARCH_PAGE).filter((item: any) => {
        const full = item?.full_name
        if (typeof full !== 'string' || !FULL_NAME.test(full) ||
            item.private !== false || item.archived === true || item.disabled === true ||
            typeof item.default_branch !== 'string' || !BRANCH.test(item.default_branch) ||
            item.default_branch.includes('..')) return false
        const key = full.toLowerCase()
        if (seenRepos.has(key)) return false
        seenRepos.add(key)
        return true
      }).slice(0, MAX_REPOSITORIES)

      for (const repo of repositories) {
        exec.signal.throwIfAborted()
        const repository: string = repo.full_name
        const owner = repository.split('/')[0]!
        const base = '/repos/' + repository.split('/').map(encodeURIComponent).join('/')
        try {
          const snapshot = await read(base + '/commits/' + encodeURIComponent(repo.default_branch))
          const commit: unknown = snapshot?.sha
          const treeSha: unknown = snapshot?.commit?.tree?.sha
          if (typeof commit !== 'string' || !SHA.test(commit) ||
              typeof treeSha !== 'string' || !SHA.test(treeSha)) {
            skipped.push(repository + ': missing pinned commit/tree')
            continue
          }
          const tree = await read(base + '/git/trees/' + treeSha + '?recursive=1')
          checkedRepositories++
          if (!Array.isArray(tree?.tree) || tree.truncated !== false ||
              tree.sha !== treeSha || tree.tree.length > 5000) {
            skipped.push(repository + ': unverified or truncated Git tree')
            continue
          }
          const skills = tree.tree.filter((entry: any) =>
            entry && entry.type === 'blob' && typeof entry.path === 'string' &&
            SKILL_PATH.test(entry.path) && typeof entry.sha === 'string' && SHA.test(entry.sha))
            .slice(0, MAX_RESULTS)
          if (!skills.length) continue
          const ownerKey = owner.toLowerCase()
          if (!owners.has(ownerKey)) {
            try {
              const record = await read('/users/' + encodeURIComponent(owner))
              owners.set(ownerKey, record?.login?.toLowerCase() === ownerKey ? record : null)
            } catch (error) {
              if (!(error instanceof GitHubApiFailure && [403, 404, 429].includes(error.status))) throw error
              owners.set(ownerKey, null)
              if (error.status === 403 || error.status === 429) isRateLimited = true
            }
          }
          const ownerRecord = owners.get(ownerKey)
          const ranking = rankSkillEvidence({
            stars: repo.stargazers_count, forks: repo.forks_count,
            ownerCreatedAt: ownerRecord?.created_at,
            repositoryCreatedAt: repo.created_at, lastPushAt: repo.pushed_at,
            archived: repo.archived, disabled: repo.disabled,
          })
          for (const skill of skills) {
            const name: string = skill.path.match(SKILL_PATH)![1]!
            const fit = relevance(query, name, repository,
              typeof repo.description === 'string' ? repo.description.slice(0, 200) : '')
            results.push({
              repository, path: skill.path, name, suggestedCommit: commit,
              sourceBlobSha: skill.sha, status: 'unreviewed', requiresReview: true,
              relevance: fit, ranking, recommendationScore: ranking.score + fit.score,
            })
          }
        } catch (error) {
          if (!(error instanceof GitHubApiFailure && [403, 404, 429].includes(error.status))) throw error
          skipped.push(repository + ': public metadata unavailable (HTTP ' + error.status + ')')
          if (error.status === 403 || error.status === 429) { isRateLimited = true; break }
        }
        if (results.length >= MAX_RESULTS || isRateLimited) break
      }
      results.sort((a, b) => b.recommendationScore - a.recommendationScore ||
        a.repository.localeCompare(b.repository) || a.path.localeCompare(b.path))
      return {
        repository: 'github.com/public',
        account: 'anonymous',
        result: JSON.stringify({
          totalRepositoryMatches: search.total_count,
          checkedRepositories, apiCalls: calls, maxApiCalls: MAX_CALLS,
          isRateLimited, skipped, candidates: results.slice(0, MAX_RESULTS),
          truncated: search.total_count > repositories.length || results.length > MAX_RESULTS ||
            isRateLimited,
          note: 'First-page public repository discovery, NOT exhaustive code search. Candidate paths and Git blobs are pinned to a suggested commit but source, license, dependencies, safety and relevance still require code_github_skill_review with an authorized owner binding. No public candidate is trusted or invocable.',
        }),
      }
    },
  }]
}
