/** Safe, bounded GitHub Skill layouts. Never trusts raw Git tree paths. */
export const SKILL_SOURCE_PATH = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/){1,3}SKILL\.md$/
const LICENSE_FILE = /^LICENSE(?:\.md|\.txt)?$/i

export function skillNameFromPath(path: unknown): string | null {
  if (typeof path !== 'string' || path.length > 240 || !SKILL_SOURCE_PATH.test(path)) return null
  return path.split('/').at(-2) ?? null
}

/**
 * Closest legal terms override repository metadata. If the nearest LICENSE
 * cannot be validated, fail closed; do not silently fall back to a root MIT.
 * Blob type, mode and SHA are checked separately by the review boundary.
 */
export function nearestSkillLicense<T extends { readonly path?: string }>(
  tree: readonly T[], skillPath: string,
): T | undefined {
  if (!skillNameFromPath(skillPath)) return undefined
  const parent = skillPath.slice(0, skillPath.lastIndexOf('/') + 1)
  const at = (prefix: string) => tree.filter(entry =>
    typeof entry?.path === 'string' && entry.path.startsWith(prefix) &&
      LICENSE_FILE.test(entry.path.slice(prefix.length)))
    .sort((a, b) => a.path!.localeCompare(b.path!))[0]
  return at(parent) ?? at('')
}
