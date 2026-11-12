/**
 * Host-local state persistence for @fongap-labs/dsh-delta-desktop.
 * Stores hashed session-lock PIN (scrypt), locked/moved/deleted session state,
 * and network proxy configuration in the active profile directory.
 * Never exports secret hashes to the Client and keeps zero static node:* imports
 * to stay compatible with `tsconfig.json` `"types": []`.
 */

export type ProxyMode = 'system' | 'direct' | 'manual'

export interface ProxySettings {
  mode: ProxyMode
  httpProxy: string
  httpsProxy: string
  noProxy: string
}

export interface PinHashRecord {
  salt: string
  hash: string
}

export interface DeltaHostState {
  pinHash?: PinHashRecord
  totpSecret?: string
  lockedSessionIds: string[]
  movedSessions: Record<string, string>
  deletedSessionIds: string[]
  proxy: ProxySettings
}

export type SessionLockMode = 'totp' | 'pin' | 'none'

export interface PublicDeltaHostState {
  hasPin: boolean
  lockMode: SessionLockMode
  lockedSessionIds: string[]
  movedSessions: Record<string, string>
  deletedSessionIds: string[]
  proxy: ProxySettings
}

export function loadNodeModule<T = any>(specifier: string): Promise<T> {
  return (Function('m', 'return import(m)') as (m: string) => Promise<T>)(specifier)
}

export function defaultProxySettings(): ProxySettings {
  return {
    mode: 'system',
    httpProxy: '',
    httpsProxy: '',
    noProxy: '',
  }
}

export function normalizeDeltaState(raw: unknown): DeltaHostState {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const locked = Array.isArray(obj.lockedSessionIds)
    ? [...new Set(obj.lockedSessionIds.filter((x): x is string => typeof x === 'string' && x.length > 0))]
    : []
  const deleted = Array.isArray(obj.deletedSessionIds)
    ? [...new Set(obj.deletedSessionIds.filter((x): x is string => typeof x === 'string' && x.length > 0))]
    : []
  const moved: Record<string, string> = {}
  if (obj.movedSessions && typeof obj.movedSessions === 'object') {
    for (const [k, v] of Object.entries(obj.movedSessions as Record<string, unknown>)) {
      if (typeof k === 'string' && k && typeof v === 'string' && v) {
        moved[k] = v
      }
    }
  }
  const rawPin = obj.pinHash && typeof obj.pinHash === 'object' ? (obj.pinHash as Record<string, unknown>) : undefined
  const pinHash = rawPin && typeof rawPin.salt === 'string' && typeof rawPin.hash === 'string' && rawPin.salt && rawPin.hash
    ? { salt: rawPin.salt, hash: rawPin.hash }
    : undefined
  const totpSecret = typeof obj.totpSecret === 'string' ? normalizeBase32Secret(obj.totpSecret) : undefined

  const rawProxy = obj.proxy && typeof obj.proxy === 'object' ? (obj.proxy as Record<string, unknown>) : {}
  const mode: ProxyMode = rawProxy.mode === 'direct' || rawProxy.mode === 'manual' ? rawProxy.mode : 'system'
  const proxy: ProxySettings = {
    mode,
    httpProxy: typeof rawProxy.httpProxy === 'string' ? rawProxy.httpProxy.trim() : '',
    httpsProxy: typeof rawProxy.httpsProxy === 'string' ? rawProxy.httpsProxy.trim() : '',
    noProxy: typeof rawProxy.noProxy === 'string' ? rawProxy.noProxy.trim() : '',
  }
  return {
    ...(pinHash ? { pinHash } : {}),
    ...(totpSecret ? { totpSecret } : {}),
    lockedSessionIds: locked,
    movedSessions: moved,
    deletedSessionIds: deleted,
    proxy,
  }
}

export function toPublicHostState(state: DeltaHostState): PublicDeltaHostState {
  const lockMode: SessionLockMode = state.totpSecret ? 'totp' : state.pinHash ? 'pin' : 'none'
  return {
    hasPin: lockMode !== 'none',
    lockMode,
    lockedSessionIds: [...state.lockedSessionIds],
    movedSessions: { ...state.movedSessions },
    deletedSessionIds: [...state.deletedSessionIds],
    proxy: { ...state.proxy },
  }
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function normalizeBase32Secret(input: string): string | undefined {
  const clean = input.toUpperCase().replace(/[\s\-=]+/g, '')
  if (!clean || clean.length < 16 || clean.length > 128) return undefined
  if (!/^[A-Z2-7]+$/.test(clean)) return undefined
  return clean
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

export function base32Decode(secret: string): Uint8Array {
  const clean = secret.toUpperCase().replace(/[\s\-=]+/g, '')
  const out: number[] = []
  let bits = 0
  let value = 0
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i])
    if (idx < 0) throw new Error('Invalid Base32 character')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export function isSixDigitCode(code: unknown): code is string {
  return typeof code === 'string' && /^\d{6}$/.test(code.trim())
}

export async function generateTotpSecret(byteLength = 20): Promise<string> {
  const crypto = await loadNodeModule<any>('node:crypto')
  const bytes = crypto.randomBytes(byteLength) as Uint8Array
  return base32Encode(bytes)
}

export function buildOtpAuthUri(
  secret: string,
  account = 'DeepSeek Harness',
  issuer = 'Delta Desktop',
): string {
  const clean = secret.toUpperCase().replace(/[\s\-=]+/g, '')
  const encIssuer = encodeURIComponent(issuer)
  const encAccount = encodeURIComponent(account)
  return `otpauth://totp/${encIssuer}:${encAccount}?secret=${clean}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`
}

export async function generateTotpCode(
  secret: string,
  timeMs = Date.now(),
  periodSeconds = 30,
  digits = 6,
): Promise<string> {
  const crypto = await loadNodeModule<any>('node:crypto')
  const bufMod = await loadNodeModule<any>('node:buffer')
  const keyBytes = base32Decode(secret)
  const step = Math.floor(timeMs / 1000 / periodSeconds)
  const counter = bufMod.Buffer.alloc(8)
  counter.writeUInt32BE(Math.floor(step / 0x100000000), 0)
  counter.writeUInt32BE(step >>> 0, 4)
  const digest = crypto.createHmac('sha1', bufMod.Buffer.from(keyBytes)).update(counter).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  const mod = 10 ** digits
  return String(binary % mod).padStart(digits, '0')
}

export async function verifyTotpCode(
  secret: string,
  code: string,
  windowSteps = 1,
  timeMs = Date.now(),
  periodSeconds = 30,
): Promise<boolean> {
  const trimmed = typeof code === 'string' ? code.trim() : ''
  if (!isSixDigitCode(trimmed)) return false
  const norm = normalizeBase32Secret(secret)
  if (!norm) return false
  const crypto = await loadNodeModule<any>('node:crypto')
  const bufMod = await loadNodeModule<any>('node:buffer')
  const actualBuf = bufMod.Buffer.from(trimmed, 'ascii')
  let isMatched = false
  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const candidate = await generateTotpCode(norm, timeMs + offset * periodSeconds * 1000, periodSeconds, 6)
    const expectedBuf = bufMod.Buffer.from(candidate, 'ascii')
    if (expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      isMatched = true
    }
  }
  return isMatched
}

export async function hashPinSecret(pin: string): Promise<PinHashRecord> {
  const crypto = await loadNodeModule<any>('node:crypto')
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = crypto.scryptSync(pin, salt, 32)
  return { salt, hash: derived.toString('hex') }
}

export async function verifyPinSecret(pin: string, record: PinHashRecord | undefined): Promise<boolean> {
  if (!record || !pin) return false
  const crypto = await loadNodeModule<any>('node:crypto')
  const bufMod = await loadNodeModule<any>('node:buffer')
  const expected = bufMod.Buffer.from(record.hash, 'hex')
  const actual = crypto.scryptSync(pin, record.salt, 32)
  if (expected.length !== actual.length) return false
  return crypto.timingSafeEqual(expected, actual)
}

export interface HostStateStore {
  resolvePath(): Promise<string>
  read(): Promise<DeltaHostState>
  update(mutator: (current: DeltaHostState) => DeltaHostState | Promise<DeltaHostState>): Promise<DeltaHostState>
  getCached(): DeltaHostState
}

export async function resolveDshHome(ctx?: { get?(name: string): unknown }): Promise<string> {
  const pathMod = await loadNodeModule<any>('node:path')
  const osMod = await loadNodeModule<any>('node:os')
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
  const envHome = proc?.env?.DSH_HOME?.trim()
  if (envHome) return pathMod.resolve(envHome)

  const profileCtx = ctx?.get?.('profileContext') as { home?: string; dir?: string } | undefined
  if (typeof profileCtx?.home === 'string' && profileCtx.home.trim()) {
    return pathMod.resolve(profileCtx.home.trim())
  }
  if (typeof profileCtx?.dir === 'string' && profileCtx.dir.trim()) {
    const resolvedDir = pathMod.resolve(profileCtx.dir.trim())
    const profilesParent = pathMod.dirname(resolvedDir)
    if (pathMod.basename(profilesParent) === 'profiles') {
      return pathMod.dirname(profilesParent)
    }
  }
  return pathMod.join(osMod.homedir(), '.dsh')
}

export function createHostStateStore(ctx: { get?(name: string): unknown }): HostStateStore {
  let cached: DeltaHostState = normalizeDeltaState(undefined)
  let isLoaded = false
  let readPromise: Promise<DeltaHostState> | undefined
  let writeChain: Promise<unknown> = Promise.resolve()

  const resolvePath = async (): Promise<string> => {
    const pathMod = await loadNodeModule<any>('node:path')
    const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
    const explicit = proc?.env?.DELTA_DESKTOP_STATE_FILE
    if (typeof explicit === 'string' && explicit.trim()) {
      return pathMod.resolve(explicit.trim())
    }
    const envHome = proc?.env?.DSH_HOME?.trim()
    const envProfile = proc?.env?.DSH_PROFILE?.trim()
    const profileCtx = ctx?.get?.('profileContext') as { dir?: string } | undefined
    if (!envHome && !envProfile && typeof profileCtx?.dir === 'string' && profileCtx.dir.trim()) {
      return pathMod.join(pathMod.resolve(profileCtx.dir.trim()), '.delta-desktop-state.json')
    }
    const dshHome = await resolveDshHome(ctx)
    const profile = envProfile || 'desktop'
    return pathMod.join(dshHome, 'profiles', profile, '.delta-desktop-state.json')
  }

  const read = async (): Promise<DeltaHostState> => {
    if (isLoaded) return cached
    if (readPromise) return readPromise
    readPromise = (async () => {
      try {
        const fs = await loadNodeModule<any>('node:fs/promises')
        const filePath = await resolvePath()
        const text = await fs.readFile(filePath, 'utf8')
        if (!isLoaded) cached = normalizeDeltaState(JSON.parse(text))
      } catch {
        if (!isLoaded) cached = normalizeDeltaState(undefined)
      }
      isLoaded = true
      readPromise = undefined
      return cached
    })()
    return readPromise
  }

  const write = async (next: DeltaHostState): Promise<void> => {
    const fs = await loadNodeModule<any>('node:fs/promises')
    const pathMod = await loadNodeModule<any>('node:path')
    const filePath = await resolvePath()
    await fs.mkdir(pathMod.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(next, null, 2) + '\n', 'utf8')
  }

  const update = (mutator: (current: DeltaHostState) => DeltaHostState | Promise<DeltaHostState>): Promise<DeltaHostState> => {
    const nextRun = writeChain.then(async () => {
      const cur = await read()
      const mutated = normalizeDeltaState(await mutator({
        ...cur,
        lockedSessionIds: [...cur.lockedSessionIds],
        movedSessions: { ...cur.movedSessions },
        deletedSessionIds: [...cur.deletedSessionIds],
        proxy: { ...cur.proxy },
      }))
      cached = mutated
      isLoaded = true
      await write(mutated)
      return mutated
    })
    writeChain = nextRun.catch(() => {})
    return nextRun
  }

  return {
    resolvePath,
    read,
    update,
    getCached: () => cached,
  }
}

export function makeJsonResponse(status: number, payload: unknown): unknown {
  const g = globalThis as unknown as {
    Response?: new (body: string, init?: { status?: number; headers?: Record<string, string> }) => unknown
  }
  const body = JSON.stringify(payload)
  if (typeof g.Response === 'function') {
    return new g.Response(body, {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    json: async () => payload,
    text: async () => body,
  }
}

export async function readRequestJson(request: unknown): Promise<Record<string, unknown>> {
  try {
    const req = request as { json?: () => Promise<unknown>; text?: () => Promise<string> }
    if (typeof req?.json === 'function') {
      const data = await req.json()
      return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    }
    if (typeof req?.text === 'function') {
      const txt = await req.text()
      const parsed = JSON.parse(txt)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    }
  } catch {}
  return {}
}
