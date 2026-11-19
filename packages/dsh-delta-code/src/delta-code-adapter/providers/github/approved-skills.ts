/** Public GitHub Skill bytes are read-only and pinned to a reviewed commit and Git blob. */
import { createHash } from 'node:crypto'
import { isFreeSkillLicense, inspectFreeSkillText } from '../../../delta-code-strategy/free-skill-policy.js'
import {
  APPROVED_GITHUB_SKILLS,
  getActiveApprovedGitHubSkills,
  type ApprovedGitHubSkill,
  type RevokedGitHubSkillRevision,
} from '../../../delta-code-strategy/trusted-github-skills.js'

export interface RemoteSkillCandidate {
  readonly name: string
  readonly description: string
  readonly source: string
  readonly provider: string
  readonly rank: number
  readonly invocation: { readonly modelInvocable: boolean; readonly userInvocable: boolean }
  readonly locator: string
}
export interface RemoteSkillDefinition extends RemoteSkillCandidate { readonly content: string }
export interface RemoteSkillProvider {
  readonly name: string
  list(options?: { signal?: AbortSignal }): Promise<readonly RemoteSkillCandidate[]>
  get(candidate: RemoteSkillCandidate, options?: { signal?: AbortSignal }): Promise<RemoteSkillDefinition | undefined>
}
export type GitHubSkillFetcher = (input: string, init?: RequestInit) => Promise<Response>

export interface ApprovedGitHubSkillProviderOptions {
  /** Aborted by the native Host when this exact provider registration is disposed. */
  readonly signal?: AbortSignal
  /** Injectable only for deterministic policy tests; production uses the reviewed tombstone catalog. */
  readonly revocations?: readonly RevokedGitHubSkillRevision[]
}

const PROVIDER = 'delta-code-approved-github'
const MAX_BYTES = 64 * 1024

function revisionLocator(entry: ApprovedGitHubSkill): string {
  return entry.commit + ':' + entry.blobSha
}

function combineSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const active = signals.filter((signal): signal is AbortSignal => signal !== undefined)
  if (active.length === 0) return undefined
  if (active.length === 1) return active[0]
  return AbortSignal.any(active)
}

/** Apply the cap while reading; a misleading/missing Content-Length never permits unbounded buffering. */
async function readSkillBytes(response: Response, signal?: AbortSignal): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Pinned GitHub Skill response body unavailable')
  const chunks: Uint8Array[] = []
  let size = 0
  const cancelOnAbort = () => { void reader.cancel(signal?.reason).catch(() => {}) }
  signal?.addEventListener('abort', cancelOnAbort, { once: true })
  try {
    while (true) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) {
        void reader.cancel().catch(() => {})
        throw new Error('Pinned GitHub Skill exceeds maximum allowed size')
      }
      chunks.push(value)
    }
  } finally {
    signal?.removeEventListener('abort', cancelOnAbort)
    reader.releaseLock()
  }
  if (!size) throw new Error('Invalid pinned GitHub Skill size')
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** Fetch is deferred until the Host's native skill tool actually loads a match. */
export function createApprovedGitHubSkillProvider(
  fetcher: GitHubSkillFetcher = fetch,
  catalog: readonly ApprovedGitHubSkill[] = APPROVED_GITHUB_SKILLS,
  options: ApprovedGitHubSkillProviderOptions = {},
): RemoteSkillProvider {
  const activeCatalog = getActiveApprovedGitHubSkills(catalog, options.revocations)
    .filter(entry => isFreeSkillLicense(entry.license))
  const entries = new Map<string, ApprovedGitHubSkill>()
  for (const entry of activeCatalog) {
    if (entries.has(entry.name)) throw new Error('Duplicate approved GitHub Skill name: ' + entry.name)
    entries.set(entry.name, entry)
  }
  const summaries = Object.freeze(activeCatalog.map(entry => Object.freeze({
    name: entry.name,
    description: entry.description,
    source: 'github-reviewed',
    provider: PROVIDER,
    rank: 700, // lower precedence than project, runtime and bundled Skills
    invocation: Object.freeze({ modelInvocable: true, userInvocable: false }),
    // Include both immutable identifiers so a candidate from a superseded commit is stale.
    locator: revisionLocator(entry),
  } satisfies RemoteSkillCandidate)))
  return {
    name: PROVIDER,
    async list(lookupOptions) {
      const signal = combineSignals(options.signal, lookupOptions?.signal)
      signal?.throwIfAborted()
      return summaries
    },
    async get(candidate, lookupOptions) {
      const signal = combineSignals(options.signal, lookupOptions?.signal)
      signal?.throwIfAborted()
      const approved = entries.get(candidate.name)
      if (!approved || candidate.locator !== revisionLocator(approved) || candidate.provider !== PROVIDER) return undefined
      if (!/^[0-9a-f]{40}$/.test(approved.commit) || !/^[0-9a-f]{40}$/.test(approved.blobSha)) {
        throw new Error('GitHub Skill is missing its reviewed immutable revision')
      }
      const sourceName = approved.sourceName ?? approved.name
      if (!/^[a-z0-9-]+$/.test(sourceName) || !approved.license.trim()) {
        throw new Error('GitHub Skill source metadata is incomplete')
      }
      if (!/^[a-z0-9-]+$/.test(approved.owner) || !/^[a-z0-9-]+$/.test(approved.repository) ||
        !/^skills\/[a-z0-9-]+\/SKILL\.md$/.test(approved.path)) {
        throw new Error('GitHub Skill source is not approved')
      }
      const url = 'https://raw.githubusercontent.com/' + approved.owner + '/' + approved.repository +
        '/' + approved.commit + '/' + approved.path
      const response = await fetcher(url, { signal, redirect: 'error' })
      signal?.throwIfAborted()
      if (!response.ok) throw new Error('Pinned GitHub Skill could not be loaded: HTTP ' + response.status)
      if (Number(response.headers.get('content-length') ?? '0') > MAX_BYTES) {
        throw new Error('Pinned GitHub Skill exceeds maximum allowed size')
      }
      const bytes = await readSkillBytes(response, signal)
      signal?.throwIfAborted()
      const actual = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
      if (actual !== approved.blobSha) throw new Error('Pinned GitHub Skill content hash mismatch')
      const markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(markdown)
      if (!match || !new RegExp('^name:\\s*' + sourceName + '\\s*$', 'm').test(match[1])) {
        throw new Error('Pinned GitHub Skill metadata mismatch')
      }
      const body = markdown.slice(match[0].length).trim()
      if (!body) throw new Error('Pinned GitHub Skill instructions are empty')
      const cost = inspectFreeSkillText(markdown, approved.license)
      if (!cost.eligible) throw new Error('GitHub Skill excluded by free-only policy: ' + cost.reason)
      return {
        ...summaries.find(entry => entry.name === approved.name)!,
        content: [
          'Read-only external skill reviewed at a fixed GitHub revision. Follow user and Host permission rules first.',
          'Do not install packages, execute scripts, fetch unpinned secondary instructions, or elevate privileges without explicit approval.',
          '',
          body,
        ].join('\n'),
      }
    },
  }
}
