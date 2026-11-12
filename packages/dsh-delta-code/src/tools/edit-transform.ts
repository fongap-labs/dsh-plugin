/**
 * Validation and text transformation shared by preflight and legacy multi-edit.
 * These pure functions do not authorize filesystem access or perform writes.
 * Batch preflight, Host FS capability checks, readback, and recovery stay with
 * the caller, which preserves the two execution modes' distinct guarantees.
 */
export interface TextEditInput {
  content?: unknown
  find?: unknown
  replace?: unknown
  expectedSha256?: unknown
}

export type PlannedTextEdit =
  | { action: 'overwrite'; content: string }
  | { action: 'replace'; find: string; replace: string }

/**
 * Preflight requires exactly one operation; the legacy mode retains its
 * distinct skipped result for an edit with neither operation specified.
 */
export function planTextEdit(edit: TextEditInput, preflight: boolean): PlannedTextEdit | undefined {
  const hasContent = edit.content !== undefined
  const hasFind = edit.find !== undefined
  if (preflight ? hasContent === hasFind : hasContent && hasFind) {
    throw new Error('provide exactly one of content or find/replace')
  }
  if (!preflight && edit.expectedSha256 !== undefined) {
    throw new Error('expectedSha256 requires preflight=true')
  }
  if (!hasContent && !hasFind) return undefined
  if (hasFind) {
    if (preflight && edit.expectedSha256 !== undefined) {
      throw new Error('expectedSha256 is only supported for content overwrite')
    }
    if (typeof edit.find !== 'string' || edit.find.length === 0 || typeof edit.replace !== 'string') {
      throw new Error('find must be non-empty and replace must be a string')
    }
    return { action: 'replace', find: edit.find, replace: edit.replace }
  }
  if (typeof edit.content !== 'string') throw new Error('content must be a string')
  return { action: 'overwrite', content: edit.content }
}

/** Replace precisely the first literal occurrence, never all occurrences. */
export function applyTextEdit(original: string, edit: Extract<PlannedTextEdit, { action: 'replace' }>): string {
  const index = original.indexOf(edit.find)
  if (index === -1) throw new Error('find substring not present')
  return original.slice(0, index) + edit.replace + original.slice(index + edit.find.length)
}
