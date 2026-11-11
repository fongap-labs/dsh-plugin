/**
 * Request-local, reversible masking for text that is about to cross an LLM
 * provider boundary. Original message history remains Host-owned and local.
 */
export interface SensitiveRedactor {
  redact(text: string): string
  restore(text: string): string
  safePrefixLength(text: string): number
  hasMatches(): boolean
}

type Pattern = { kind: string; expression: RegExp; valueGroup?: number; accept?: (match: string) => boolean }

function passesLuhn(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  let sum = 0
  let isDouble = false
  for (let index = digits.length - 1; index >= 0; index--) {
    let digit = Number(digits[index])
    if (isDouble) { digit *= 2; if (digit > 9) digit -= 9 }
    sum += digit
    isDouble = !isDouble
  }
  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0
}

function isChineseResidentId(value: string): boolean {
  const normalized = value.toUpperCase()
  if (!/^\d{17}[\dX]$/.test(normalized)) return false
  const year = Number(normalized.slice(6, 10))
  const month = Number(normalized.slice(10, 12))
  const day = Number(normalized.slice(12, 14))
  if (year < 1900 || year > new Date().getFullYear()) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const checks = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']
  let sum = 0
  for (let index = 0; index < 17; index++) sum += Number(normalized[index]) * weights[index]!
  return checks[sum % 11] === normalized[17]
}

const PATTERNS: readonly Pattern[] = [
  {
    kind: 'private key',
    expression: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  },
  {
    kind: 'authorization header',
    expression: /(["']?)(\bauthorization\b)\1(\s*[:=]\s*)(["']?)(?!⟦dtd:)([^\r\n"'`,;]+)\4/gi,
    valueGroup: 5,
  },
  {
    kind: 'credential',
    expression: /(["']?)(\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password|passwd|secret|token)\b)\1(\s*[:=]\s*)(["']?)(?!⟦dtd:)([^\s"'`,;]+)\4/gi,
    valueGroup: 5,
  },
  { kind: 'bearer token', expression: /\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}/gi },
  { kind: 'GitHub token', expression: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { kind: 'cloud access key', expression: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'API token', expression: /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g },
  { kind: 'resident ID format', expression: /(?<!\d)\d{17}[\dXx](?!\d)/g, accept: isChineseResidentId },
  { kind: 'payment card', expression: /(?<!\d)(?<!\d[ -])(?:\d[ -]?){12,18}\d(?!\d)(?![ -]\d)/g, accept: passesLuhn },
  { kind: 'mobile number', expression: /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g },
  { kind: 'email address', expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: 'phone number', expression: /(?<!\w)(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]?\d{3,4}(?!\w)/g },
]

function randomNonce(): string {
  // The marker is a delimiter, not a credential. A per-request nonce prevents
  // natural prompt text from accidentally matching a restoration token.
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

export function createSensitiveRedactor(): SensitiveRedactor {
  const nonce = randomNonce()
  const values = new Map<string, string>()
  const markers = new Map<string, string>()
  let serial = 0
  const tokenFor = (value: string): string => {
    const existing = values.get(value)
    if (existing) return existing
    const marker = `⟦dtd:${nonce}:${serial++}⟧`
    values.set(value, marker)
    markers.set(marker, value)
    return marker
  }

  return {
    redact(text: string): string {
      let output = text
      for (const { expression, valueGroup, accept } of PATTERNS) {
        expression.lastIndex = 0
        output = output.replace(expression, (...args: unknown[]) => {
          const match = String(args[0] ?? '')
          if (accept?.(match) === false) return match
          if (valueGroup === undefined) return tokenFor(match)
          const keyQuote = String(args[1] ?? '')
          const key = String(args[2] ?? '')
          const prefix = String(args[3] ?? '')
          const quote = String(args[4] ?? '')
          const value = String(args[valueGroup] ?? '')
          return `${keyQuote}${key}${keyQuote}${prefix}${quote}${tokenFor(value)}${quote}`
        })
      }
      return output
    },
    restore(text: string): string {
      if (markers.size === 0) return text
      let output = text
      for (const [marker, value] of markers) output = output.split(marker).join(value)
      return output
    },
    safePrefixLength(text: string): number {
      let safeLength = text.length
      for (const marker of markers.keys()) {
        const max = Math.min(marker.length - 1, text.length)
        for (let length = max; length > 0; length--) {
          if (text.endsWith(marker.slice(0, length))) {
            safeLength = Math.min(safeLength, text.length - length)
            break
          }
        }
      }
      return safeLength
    },
    hasMatches: () => markers.size > 0,
  }
}

export interface TextContentBlock { type: 'text' | 'reasoning'; text: string; [key: string]: unknown }
export interface ToolCallContentBlock { type: 'tool-call'; arguments: string; [key: string]: unknown }
export interface RequestMessage {
  role: string
  content?: readonly Record<string, unknown>[]
  [key: string]: unknown
}
export interface ModelRequest {
  messages: readonly RequestMessage[]
  system?: string
  tools?: readonly Record<string, unknown>[]
  [key: string]: unknown
}

function redactJsonValue(value: unknown, redactor: SensitiveRedactor): unknown {
  if (typeof value === 'string') return redactor.redact(value)
  if (Array.isArray(value)) return value.map(item => redactJsonValue(item, redactor))
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      Object.defineProperty(result, key, {
        value: redactJsonValue(item, redactor), enumerable: true, configurable: true, writable: true,
      })
    }
    return result
  }
  return value
}

/** Redact model-visible text while preserving binary attachment references. */
export function redactModelRequest<T extends ModelRequest>(request: T, redactor: SensitiveRedactor): T {
  const messages = request.messages.map(message => ({
    ...message,
    ...(Array.isArray(message.content) ? {
      content: message.content.map(block => {
        if (block.type === 'image' || block.type === 'file') return block
        if ((block.type === 'text' || block.type === 'reasoning') && typeof block.text === 'string') {
          return { ...block, text: redactor.redact(block.text) }
        }
        if (block.type === 'tool-call' && typeof block.arguments === 'string') {
          return { ...block, arguments: redactor.redact(block.arguments) }
        }
        return redactJsonValue(block, redactor) as Record<string, unknown>
      }),
    } : {}),
  }))
  return {
    ...request,
    messages,
    ...(typeof request.system === 'string' ? { system: redactor.redact(request.system) } : {}),
    ...(Array.isArray(request.tools) ? { tools: redactJsonValue(request.tools, redactor) as Record<string, unknown>[] } : {}),
    ...(request.toolHistory ? { toolHistory: redactJsonValue(request.toolHistory, redactor) } : {}),
  } as T
}

export interface StreamChunkLike {
  type: string
  index?: number
  text?: string
  argumentsDelta?: string
  block?: Record<string, unknown>
  [key: string]: unknown
}

type PendingDelta = { type: 'text-delta' | 'reasoning-delta'; index: number; text: string; template: StreamChunkLike }

/** Preserve streaming while holding only the possible tail of a split marker. */
export async function* restoreStream<T extends StreamChunkLike>(
  source: AsyncIterable<T>, redactor: SensitiveRedactor,
): AsyncIterable<T> {
  if (!redactor.hasMatches()) { yield* source; return }
  const pending = new Map<string, PendingDelta>()
  const keyFor = (type: PendingDelta['type'], index: number): string => `${type}:${index}`
  const emitPending = (key: string, isFinal = false): T | undefined => {
    const item = pending.get(key)
    if (!item) return undefined
    const split = isFinal ? item.text.length : redactor.safePrefixLength(item.text)
    if (split === 0 && !isFinal) return undefined
    const prefix = item.text.slice(0, split)
    item.text = item.text.slice(split)
    if (item.text.length === 0) pending.delete(key)
    return { ...item.template, type: item.type, index: item.index, text: redactor.restore(prefix) } as T
  }

  for await (const chunk of source) {
    const index = typeof chunk.index === 'number' ? chunk.index : -1
    if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') {
      const key = keyFor(chunk.type, index)
      const item = pending.get(key) ?? { type: chunk.type, index, text: '', template: chunk }
      item.text += typeof chunk.text === 'string' ? chunk.text : ''
      item.template = { ...item.template, ...chunk }
      pending.set(key, item)
      const ready = emitPending(key)
      if (ready) yield ready
      continue
    }
    if (chunk.type === 'tool-call-delta') {
      // Tool calls can reach external tools. Never turn masked values back into secrets here.
      yield chunk
      continue
    }
    if (chunk.type === 'block-end') {
      for (const type of ['text-delta', 'reasoning-delta'] as const) {
        const ready = emitPending(keyFor(type, index), true)
        if (ready) yield ready
      }
      if (chunk.block) {
        const block = { ...chunk.block }
        if ((block.type === 'text' || block.type === 'reasoning') && typeof block.text === 'string') {
          block.text = redactor.restore(block.text)
        }
        yield { ...chunk, block } as T
      } else yield chunk
      continue
    }
    if (chunk.type === 'finish') {
      for (const key of [...pending.keys()]) {
        const ready = emitPending(key, true)
        if (ready) yield ready
      }
    }
    yield chunk
  }
  for (const key of [...pending.keys()]) {
    const ready = emitPending(key, true)
    if (ready) yield ready
  }
}
