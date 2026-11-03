/** Preview-only skill imports. Never extract or execute files from external archives. */
import { inflateRawSync } from 'node:zlib'

const MAX_SKILL_BYTES = 128_000
const MAX_ZIP_BYTES = 2_000_000
const SKILL_HEADER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface SkillPreview {
  name: string
  description: string
  body: string
  source: string
  warning: string
}

export const parseSkillMarkdown = (markdown: string, source: string): SkillPreview => {
  if (Buffer.byteLength(markdown, 'utf8') > MAX_SKILL_BYTES + 2048) throw new Error('SKILL.md is too large')
  const header = SKILL_HEADER.exec(markdown)
  if (!header || header[1]!.length > 2000) throw new Error('SKILL.md requires a short YAML frontmatter header')
  const front = header[1]!
  const field = (key: string) => {
    const value = front.split(/\r?\n/).find(line => line.startsWith(key + ':'))?.slice(key.length + 1).trim()
    if (!value) return ''
    if ((value[0] === '"' && value.endsWith('"')) || (value[0] === "'" && value.endsWith("'"))) {
      return value.slice(1, -1).replace(/\\(["\\])/g, '$1')
    }
    return value
  }
  const name = field('name')
  const description = field('description')
  const body = markdown.slice(header[0].length).trim()
  if (!SKILL_NAME.test(name) || name.length > 80) throw new Error('Invalid SKILL.md name')
  if (!description || description.length > 500 || /[\r\n]/.test(description)) throw new Error('Invalid SKILL.md description')
  if (!body || Buffer.byteLength(body, 'utf8') > MAX_SKILL_BYTES || body.includes('\0')) throw new Error('Invalid SKILL.md instructions')
  return { name, description, body, source,
    warning: 'Preview only: external instructions are untrusted. Review them before saving. Referenced scripts and files are not installed.' }
}

/** Fixed GitHub hosts only; no arbitrary URL fetch, credentials, ports, query, or redirects. */
export const githubSkillEndpoint = (input: string): string => {
  if (typeof input !== 'string' || input.length > 700) throw new Error('Invalid GitHub URL')
  let url: URL
  try { url = new URL(input) } catch { throw new Error('Invalid GitHub URL') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw new Error('Only plain HTTPS GitHub URLs are allowed')
  const segments = url.pathname.split('/').filter(Boolean)
  const owner = segments[0], repo = segments[1]
  const valid = (s: string | undefined) => !!s && /^[a-zA-Z0-9_.-]{1,100}$/.test(s) && s !== '.' && s !== '..'
  if (!valid(owner) || !valid(repo) || !segments.every(valid)) throw new Error('Invalid GitHub repository path')
  const repository = repo!.replace(/\.git$/, '')
  if (url.hostname === 'github.com') {
    if (segments.length === 2) {
      return `https://api.github.com/repos/${owner}/${repository}/contents/SKILL.md`
    }
    if ((segments[2] !== 'blob' && segments[2] !== 'tree') || segments.length < 4) throw new Error('Use a repository or a GitHub SKILL.md file URL')
    const branch = segments[3]!
    const rest = segments.slice(4)
    const path = rest.length ? rest.join('/') : ''
    const file = path.endsWith('SKILL.md') ? path : (path ? path + '/SKILL.md' : 'SKILL.md')
    return `https://raw.githubusercontent.com/${owner}/${repository}/${branch}/${file}`
  }
  if (url.hostname === 'raw.githubusercontent.com' && segments.length >= 4) {
    if (segments.at(-1) !== 'SKILL.md') throw new Error('Raw GitHub URL must point to SKILL.md')
    return `https://raw.githubusercontent.com/${segments.join('/')}`
  }
  throw new Error('Only github.com and raw.githubusercontent.com are supported')
}

const readLimited = async (response: Response, max: number): Promise<Buffer> => {
  const length = Number(response.headers.get('content-length') || 0)
  if (length > max) throw new Error('Remote SKILL.md exceeds size limit')
  if (!response.body) throw new Error('Empty GitHub response')
  const chunks: Buffer[] = []
  let count = 0
  for await (const chunk of response.body) {
    const part = Buffer.from(chunk)
    count += part.length
    if (count > max) { await response.body.cancel().catch(() => {}); throw new Error('Remote SKILL.md exceeds size limit') }
    chunks.push(part)
  }
  return Buffer.concat(chunks, count)
}

export const previewGithubSkill = async (url: string, fetcher: typeof fetch = fetch): Promise<SkillPreview> => {
  const endpoint = githubSkillEndpoint(url)
  const response = await fetcher(endpoint, {
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: { 'User-Agent': 'delta-suite-skills', Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error(`GitHub download failed: HTTP ${response.status}`)
  const raw = await readLimited(response, MAX_SKILL_BYTES * 2)
  let content: string
  if (endpoint.startsWith('https://api.github.com/')) {
    const data = JSON.parse(raw.toString('utf8')) as { encoding?: string; content?: string; type?: string }
    if (data.type !== 'file' || data.encoding !== 'base64' || !data.content) throw new Error('GitHub repository root has no SKILL.md')
    content = Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf8')
  } else content = raw.toString('utf8')
  return parseSkillMarkdown(content, url)
}

/** ZIP central directory reader; select exactly one SKILL.md, never extract paths. */
export const previewZipSkill = (archive: Buffer): SkillPreview => {
  if (!Buffer.isBuffer(archive) || archive.length < 22 || archive.length > MAX_ZIP_BYTES) throw new Error('ZIP archive exceeds 2 MB or is invalid')
  const u16 = (at: number) => archive.readUInt16LE(at)
  const u32 = (at: number) => archive.readUInt32LE(at)
  let end = -1
  for (let i = archive.length - 22; i >= Math.max(0, archive.length - 65_557); i--) {
    if (u32(i) === 0x06054b50) { end = i; break }
  }
  if (end < 0 || u16(end + 4) !== 0 || u16(end + 6) !== 0) throw new Error('Invalid or multi-disk ZIP archive')
  const count = u16(end + 10)
  const centralSize = u32(end + 12)
  const centralStart = u32(end + 16)
  if (count > 1000 || centralStart + centralSize > end) throw new Error('Invalid ZIP directory')
  let offset = centralStart
  const found: Array<{ name: string; offset: number; packed: number; size: number; method: number; crc: number }> = []
  for (let i = 0; i < count; i++) {
    if (offset + 46 > archive.length || u32(offset) !== 0x02014b50) throw new Error('Invalid ZIP entry')
    const flags = u16(offset + 8), method = u16(offset + 10)
    const crc = u32(offset + 16), packed = u32(offset + 20), size = u32(offset + 24)
    const nameLen = u16(offset + 28), extraLen = u16(offset + 30), commentLen = u16(offset + 32)
    const external = u32(offset + 38)
    const localOffset = u32(offset + 42)
    const next = offset + 46 + nameLen + extraLen + commentLen
    if (next > centralStart + centralSize || (flags & 1) || packed === 0xffffffff || size === 0xffffffff) throw new Error('Unsupported ZIP entry')
    const name = archive.subarray(offset + 46, offset + 46 + nameLen).toString('utf8')
    if (!name || name.startsWith('/') || name.includes('\\') || name.includes('\0') || name.split('/').some(x => x === '..' || x === '.')) throw new Error('Unsafe ZIP filename')
    if (((external >>> 16) & 0xf000) === 0xa000) throw new Error('ZIP symlinks are not supported')
    if (name === 'SKILL.md' || name.endsWith('/SKILL.md')) found.push({ name, offset: localOffset, packed, size, method, crc })
    offset = next
  }
  if (found.length !== 1) throw new Error('ZIP must contain exactly one SKILL.md')
  const entry = found[0]!
  if (entry.size > MAX_SKILL_BYTES + 2048 || entry.packed > MAX_ZIP_BYTES || ![0, 8].includes(entry.method)) throw new Error('Unsupported or oversized ZIP skill')
  if (entry.offset + 30 > centralStart || u32(entry.offset) !== 0x04034b50) throw new Error('Invalid local ZIP header')
  if (u16(entry.offset + 8) !== entry.method) throw new Error('ZIP method mismatch')
  const nameLen = u16(entry.offset + 26), extraLen = u16(entry.offset + 28)
  const start = entry.offset + 30 + nameLen + extraLen
  if (start + entry.packed > centralStart) throw new Error('Invalid ZIP file bounds')
  if (archive.subarray(entry.offset + 30, entry.offset + 30 + nameLen).toString('utf8') !== entry.name) throw new Error('ZIP filename mismatch')
  const compressed = archive.subarray(start, start + entry.packed)
  const decoded = entry.method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: MAX_SKILL_BYTES + 2049 })
  if (decoded.length !== entry.size) throw new Error('ZIP size mismatch')
  // CRC32 protects against corrupt or tampered archive entries.
  let crc = 0xffffffff
  for (const byte of decoded) {
    crc ^= byte
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  if (((crc ^ 0xffffffff) >>> 0) !== entry.crc) throw new Error('ZIP checksum mismatch')
  return parseSkillMarkdown(decoded.toString('utf8'), 'zip:' + entry.name)
}
