/** Free-only Skill discovery and loading policy. Deliberately fail closed on missing evidence. */
import { createHash } from 'node:crypto'

/** Reviewed open licenses. Licensing is necessary but does not prove a tool/API is free. */
export const FREE_SKILL_LICENSES: readonly string[] = Object.freeze([
  'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0',
  'GPL-2.0-only', 'GPL-3.0-only', 'LGPL-2.1-only', 'LGPL-3.0-only',
  'AGPL-3.0-only', 'Unlicense', 'CC0-1.0', 'CC-BY-4.0',
])

export function isFreeSkillLicense(value: unknown): boolean {
  return typeof value === 'string' && FREE_SKILL_LICENSES.includes(value)
}

/** Only affirmative payment requirements. Generic mentions of "cost" are not evidence. */
const PAID_REQUIREMENTS = [
  /\b(?:requires?|needs?|must\s+(?:use|have|purchase|buy)|only\s+available\s+(?:with|on))\b[^\n.!?]{0,90}\b(?:paid|premium|pro\s+plan|enterprise\s+plan|subscription|billing\s+account|payment|credit\s+card|purchased?\s+credits?)\b/i,
  /\b(?:paid|premium|subscription(?:-based)?|pro-only|enterprise-only|pay-per-use|pay-as-you-go|usage-based\s+billing)\b[^\n.!?]{0,90}\b(?:api|tool|service|plan|account|access|key|token|credits?)\b/i,
  /(?:必须|需要|要求|仅限|依赖)[^\n。！？]{0,40}(?:付费|收费|订阅|充值|购买额度|购买积分|付费接口|付费API|付费\s*API)/,
  /(?:付费|收费|订阅|充值|购买额度)[^\n。！？]{0,30}(?:才能|方可|服务|接口|工具|API|api)/,
]

export function paidSkillRequirement(text: string): string | null {
  const bounded = text.slice(0, 64 * 1024)
  for (const pattern of PAID_REQUIREMENTS) {
    const match = bounded.match(pattern)
    if (match) return match[0].slice(0, 120)
  }
  return null
}

/** Secondary scripts/services cannot be assumed free until reviewed as a bundle. */
export function hasUnverifiedSkillDependencies(markdown: string): boolean {
  return /\]\((?:\.\.?\/|references\/|scripts\/|assets\/)[^)]*\)|(?:^|\s)(?:\.\.?\/)?(?:references|scripts|assets)\//im.test(markdown)
}

/** Structural verification for a pinned GitHub blob; never run the Markdown as commands. */
export function decodePinnedSkillBlob(data: unknown, expectedSha: string, maximum = 64 * 1024): string {
  const value = data as { encoding?: unknown; content?: unknown; size?: unknown; sha?: unknown }
  if (!value || value.encoding !== 'base64' || typeof value.content !== 'string' ||
    typeof value.size !== 'number' || !Number.isSafeInteger(value.size) ||
    value.size <= 0 || value.size > maximum || value.sha !== expectedSha) {
    throw Error('Incomplete or oversized pinned Skill blob evidence')
  }
  const compact = value.content.replace(/\s/g, '')
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)) {
    throw Error('Invalid base64 Skill blob evidence')
  }
  const bytes = Buffer.from(compact, 'base64')
  if (bytes.length !== value.size) throw Error('Pinned Skill blob size mismatch')
  const calculated = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
  if (calculated !== expectedSha) throw Error('Pinned Skill blob SHA mismatch')
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export function inspectFreeSkillText(
  markdown: string, license: unknown,
): { readonly eligible: boolean; readonly status: 'free-evidence' | 'paid' | 'unknown'; readonly reason: string } {
  if (!isFreeSkillLicense(license)) return { eligible: false, status: 'unknown', reason: 'Free license not verified' }
  const charge = paidSkillRequirement(markdown)
  if (charge) return { eligible: false, status: 'paid', reason: 'Skill requires a paid service or subscription' }
  if (hasUnverifiedSkillDependencies(markdown)) {
    return { eligible: false, status: 'unknown', reason: 'Relative Skill dependencies need free-use review' }
  }
  return { eligible: true, status: 'free-evidence', reason: 'Open license and no detected paid prerequisites; external service costs are not guaranteed' }
}
