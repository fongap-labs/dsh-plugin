/**
 * Privacy-preserving data minimization & redaction utilities.
 * Strips sensitive tokens, credentials, PII, and OS usernames before indexing
 * or rendering in local search UI. Zero external runtime imports.
 */

const HOME_WIN_RE = /\b([A-Za-z]):[\\/]+Users[\\/]+([^\\/\s"'`]+)(?=[\\/\s"'`,;:]|$)/gi
const HOME_POSIX_RE = /(?<![A-Za-z0-9._-])\/(?:Users|home)\/([^/\s"'`,;:]+)(?=[/\s"'`,;:]|$)/g
const PRIVATE_BLOCK_RE = /<private>[\s\S]*?<\/private>/gi
const AUTH_HEADER_RE = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi
const KNOWN_TOKEN_RE = /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g
const SECRET_ASSIGN_RE = /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|session[_-]?token|authorization|cookie)\b(\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;`"']+)/gi
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const CN_MOBILE_RE = /(?<![A-Za-z0-9_-])1[3-9]\d{9}(?![A-Za-z0-9_-])/g

/**
 * Redacts OS user home folder names while keeping project relative segments readable.
 */
export function redactPathForUi(input: string): string {
  if (!input) return ''
  return input
    .replace(HOME_WIN_RE, '~')
    .replace(HOME_POSIX_RE, '~')
}

/**
 * Redacts private blocks, credentials, tokens, emails, phone numbers, and OS usernames.
 */
export function redactSensitiveText(input: string): string {
  if (!input) return ''
  return redactPathForUi(input)
    .replace(PRIVATE_BLOCK_RE, '[redacted]')
    .replace(AUTH_HEADER_RE, '$1 [redacted]')
    .replace(KNOWN_TOKEN_RE, '[redacted-token]')
    .replace(SECRET_ASSIGN_RE, '$1$2[redacted]')
    .replace(EMAIL_RE, '[email]')
    .replace(CN_MOBILE_RE, '[phone]')
}
