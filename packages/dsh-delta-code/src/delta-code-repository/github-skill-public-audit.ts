/** Anonymous, immutable, evidence-only audit. Never evaluates untrusted Skill Markdown. */
import type { DeltaGitHubTransport } from '../delta-code-adapter/contracts/github.js'
import type { DeltaGitHubToolSpec } from './github-operations.js'
import {
  decodePinnedSkillBlob, freeLicenseFromText, inspectFreeSkillText,
} from '../delta-code-strategy/free-skill-policy.js'

const SHA = /^[a-f0-9]{40}$/
const REPOSITORY = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/
const SKILL_PATH = /^skills\/([a-z0-9-]+)\/SKILL\.md$/
const LICENSE_PATH = /^LICENSE(?:\.md|\.txt)?$/i
const MAX_TREE_ENTRIES = 5000
const MAX_CALLS = 4

/** These are static warning signals, never proof that a Skill is safe. */
const RISK_SIGNALS: ReadonlyArray<{ readonly id: string; readonly pattern: RegExp }> = [
  { id: 'external-command-or-installation', pattern: /\b(?:curl|wget|npx|npm\s+install|pip\s+install|bash|chmod|eval|Invoke-WebRequest)\b/i },
  { id: 'credential-or-secret-access', pattern: /(?:\.ssh\/|\.aws\/|GITHUB_TOKEN|API[_-]?KEY|process\.env|credential|secret\s+key)/i },
  { id: 'instruction-override', pattern: /\b(?:ignore (?:previous|all|system) instructions|reveal (?:your )?system prompt|you are now)\b/i },
  { id: 'remote-network-dependency', pattern: /https?:\/\/[^\s)'"]+/i },
]
const LOW_TRUST_NOTE =
  'Static evidence only. No Skill execution, installation, approval, persistent registration or trust elevation. External services may still charge.'

function audited(value: unknown, label: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error('Invalid public Skill audit ' + label)
  }
  return value
}

function frontmatterName(source: string): string | null {
  const match = /^---\r?\n([\s\S]{1,4096}?)\r?\n---\r?\n/.exec(source)
  if (!match || !source.slice(match[0].length).trim()) return null
  return /^name:\s*['"]?([a-z0-9-]+)['"]?\s*$/m.exec(match[1])?.[1] ?? null
}

/** Uses exactly one credential-free read per immutable commit/tree/Skill/license. */
export function createPublicSkillAuditSpecs(transport: DeltaGitHubTransport): DeltaGitHubToolSpec[] {
  return [{
    name: 'code_github_skill_public_review',
    description: 'Read-only, anonymous safety/free-use audit of one pinned public GitHub Skill candidate. Checks immutable Commit, Git Tree, source/license blobs, command and secret-access indicators. Never enables or invokes a Skill.',
    parameters: {
      repository: { type: 'string', required: true },
      path: { type: 'string', required: true },
      commit: { type: 'string', required: true },
      sourceBlobSha: { type: 'string', required: true },
      licenseBlobSha: { type: 'string', required: true },
    },
    async execute(args, exec) {
      const repository = audited(args.repository, 'repository', REPOSITORY)
      const path = audited(args.path, 'path', SKILL_PATH)
      const commit = audited(args.commit, 'commit', SHA)
      const sourceBlobSha = audited(args.sourceBlobSha, 'source SHA', SHA)
      const licenseBlobSha = audited(args.licenseBlobSha, 'license SHA', SHA)
      if (!transport.publicRead) {
        throw Error('anonymous GitHub Skill audit unavailable; never fall back to owner-bound credentials')
      }
      const base = '/repos/' + repository.split('/').map(encodeURIComponent).join('/')
      let apiCalls = 0
      const read = async (suffix: string): Promise<any> => {
        exec.signal.throwIfAborted()
        if (apiCalls >= MAX_CALLS) throw Error('public Skill audit request budget exhausted')
        apiCalls++
        return transport.publicRead!(base + suffix, exec.signal)
      }
      const snapshot = await read('/commits/' + commit)
      const treeSha = snapshot?.commit?.tree?.sha
      if (snapshot?.sha !== commit || typeof treeSha !== 'string' || !SHA.test(treeSha)) {
        throw Error('Skill commit is not an immutable, verified tree snapshot')
      }
      const tree = await read('/git/trees/' + treeSha + '?recursive=1')
      if (tree?.sha !== treeSha || tree.truncated !== false ||
          !Array.isArray(tree.tree) || tree.tree.length > MAX_TREE_ENTRIES) {
        throw Error('Skill Git tree is incomplete or differs from pinned commit')
      }
      const source = tree.tree.find((entry: any) => entry?.path === path)
      const license = tree.tree.find((entry: any) =>
        typeof entry?.path === 'string' && LICENSE_PATH.test(entry.path) &&
        entry.sha === licenseBlobSha)
      // Symlinks/submodules and executable files are not regular documentation.
      if (source?.type !== 'blob' || source?.sha !== sourceBlobSha ||
          source.mode !== '100644' || license?.type !== 'blob' || license.mode !== '100644') {
        throw Error('Skill/license path, Git mode, or immutable blob SHA mismatch')
      }
      const sourceData = await read('/git/blobs/' + sourceBlobSha)
      const licenseData = await read('/git/blobs/' + licenseBlobSha)
      const markdown = decodePinnedSkillBlob(sourceData, sourceBlobSha)
      const licenseText = decodePinnedSkillBlob(licenseData, licenseBlobSha, 32 * 1024)
      const declaredName = frontmatterName(markdown)
      const expectedName = path.match(SKILL_PATH)![1]!
      if (declaredName !== expectedName) throw Error('Pinned Skill name/frontmatter does not match requested path')
      const licenseId = freeLicenseFromText(licenseText)
      const cost = inspectFreeSkillText(markdown, licenseId)
      const riskIndicators = RISK_SIGNALS.filter(rule => rule.pattern.test(markdown)).map(rule => rule.id)
      const reviewStatus = !cost.eligible ? 'excluded-paid-or-unknown' :
        riskIndicators.length ? 'manual-security-review-required' : 'static-review-ready'
      return {
        repository: 'github.com/public',
        account: 'anonymous',
        result: JSON.stringify({
          candidate: { repository, path, commit, sourceBlobSha, licenseBlobSha },
          freeEligibility: cost, license: licenseId,
          riskIndicators, reviewStatus,
          apiCalls, maxApiCalls: MAX_CALLS,
          approvalRequired: true,
          autoEnabled: false, executable: false,
          note: LOW_TRUST_NOTE,
        }),
      }
    },
  }]
}
