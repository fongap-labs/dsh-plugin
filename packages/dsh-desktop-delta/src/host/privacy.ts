/**
 * Privacy preflight for Delta Suite-controlled free-form outbound text.
 *
 * This is deliberately a conservative BLOCKING detector, not an anonymizer:
 * replacing an unknown portion of a model/search prompt silently can change
 * the user's task. The user should remove sensitive parts locally or choose
 * a trusted local provider before retrying.
 *
 * This covers Delta-owned search and image requests only. It does NOT claim to
 * intercept Harness's model adapters, subprocesses, or third-party plugins.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN (?:[A-Z ]* )?PRIVATE KEY-----/i,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\b(?:authorization\s*[:=]\s*bearer|access[_-]?token\s*[:=]|refresh[_-]?token\s*[:=]|api[_-]?key\s*[:=]|password\s*[:=]|client[_-]?secret\s*[:=])\s*["']?\S+/i,
  /(?:[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/i,
]
const PERSONAL_PATTERNS: readonly RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:[A-Za-z]:\\|\/Users\/|\/home\/|\/root\/|\\\\[^\\\s]+\\)[^\s"'<>]*/i,
  /\b(?:\+?\d[\d\s().-]{8,}\d)\b/,
]
const NONPRINTABLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/

/**
 * Validate text immediately before external transfer.
 * A hit throws a fixed error without echoing or logging the source content.
 * A detector cannot guarantee that all personal data has been found.
 */
export function assertOutboundTextSafe(input: unknown, purpose: string, maxLength: number): string {
  if (typeof input !== 'string' || input.trim().length === 0 || input.length > maxLength) {
    throw new Error(`Privacy guard: invalid ${purpose} input`)
  }
  const value = input.trim()
  if (NONPRINTABLE.test(value) ||
      SECRET_PATTERNS.some(re => re.test(value)) ||
      PERSONAL_PATTERNS.some(re => re.test(value))) {
    throw new Error(`Privacy guard: ${purpose} may contain sensitive data; remove it locally before sending`)
  }
  return value
}
