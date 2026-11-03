/** Delta-managed user skills. Harness filesystem provider owns discovery and loading. */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { mkdir, readdir, readFile, writeFile, rename, lstat, rm, chmod } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const ROOT = () => resolve(process.env.DSH_HOME || join(homedir(), '.dsh'), 'skills')
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_BODY = 128_000
const MAX_LIST = 500
const HEADER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/
const validName = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 80 || !NAME.test(value)) throw new Error('Invalid kebab-case skill name')
  return value
}
const pathOf = (name: string, disabled = false) => join(ROOT(), name + (disabled ? '.md.disabled' : '.md'))
const managedMarker = '# delta-suite-managed: true'
const metadata = (name: string, description: string, body: string) => {
  if (typeof description !== 'string' || !description.trim() || description.length > 500 || /[\r\n]/.test(description)) throw new Error('Invalid skill description')
  if (typeof body !== 'string' || !body.trim() || Buffer.byteLength(body) > MAX_BODY || body.includes('\u0000')) throw new Error('Invalid skill body')
  const title = description.trim().replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  return `---\nname: ${name}\ndescription: "${title}"\n---\n\n${managedMarker}\n\n${body.trim()}\n`
}
const checkFile = async (path: string): Promise<string> => {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BODY + 2048) throw new Error('Unsafe skill file')
  const text = await readFile(path, 'utf8')
  if (!text.includes(managedMarker) || !HEADER.test(text)) throw new Error('Skill is not managed by Delta Suite')
  return text
}
const managed = async (name: string) => {
  const active = pathOf(name)
  try { return { path: active, enabled: true, text: await checkFile(active) } }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const disabled = pathOf(name, true)
    return { path: disabled, enabled: false, text: await checkFile(disabled) }
  }
}
const writeNew = async (name: string, text: string): Promise<void> => {
  await mkdir(ROOT(), { recursive: true, mode: 0o700 })
  // Exclusive write protects externally managed skills from overwrite.
  const target = pathOf(name)
  await writeFile(target, text, { flag: 'wx', mode: 0o600 })
}
export interface SkillRow {
  name: string; description: string; source: string; provider: string;
  enabled: boolean; managed: boolean; path?: string; diagnostics?: string
}
type Registry = { list(options?: { cwd?: string }): Promise<ReadonlyArray<{ name: string; description: string; source: string; provider: string; path?: string }>> }
export const listSkills = async (registry?: Registry): Promise<{ items: SkillRow[]; diagnostics: string[] }> => {
  const diagnostics: string[] = []
  const all: SkillRow[] = []
  if (registry?.list) {
    try {
      const items = await registry.list()
      for (const entry of items) {
        if (!NAME.test(entry.name)) continue
        all.push({ name: entry.name, description: entry.description, source: entry.source,
          provider: entry.provider, path: entry.path, enabled: true, managed: false })
      }
    } catch (error) { diagnostics.push('Harness skill catalog unavailable: ' + String(error)) }
  } else diagnostics.push('Harness ctx.skills unavailable; only local Delta-managed skills are shown')
  let files: string[] = []
  try { files = await readdir(ROOT()) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') diagnostics.push('Skills directory unavailable: ' + String(error))
  }
  for (const file of files.slice(0, MAX_LIST)) {
    const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.md(\.disabled)?$/.exec(file)
    if (!match) continue
    const name = match[1]!
    try {
      const text = await checkFile(join(ROOT(), file))
      const description = /\ndescription:\s*"?([^"\r\n]+)"?/.exec(text)?.[1] || ''
      const enabled = !match[2]
      const existing = all.find(item => item.name === name && item.path === pathOf(name))
      if (existing) { existing.managed = true; continue }
      all.push({ name, description, source: 'user-dsh', provider: 'filesystem',
        path: join(ROOT(), file), enabled, managed: true,
        diagnostics: enabled ? 'Waiting for Harness discovery or shadowed by a higher priority skill' : undefined })
    } catch (error) { diagnostics.push(file + ': ' + String(error)) }
  }
  if (files.length > MAX_LIST) diagnostics.push('Skill list truncated to 500 local entries')
  return { items: all.sort((a,b) => a.name.localeCompare(b.name)), diagnostics }
}
export type SkillAction = { action: 'create' | 'update' | 'toggle' | 'delete' | 'read'; name: string; description?: string; body?: string; enabled?: boolean }
export const mutateSkill = async (input: SkillAction): Promise<Record<string, unknown>> => {
  const name = validName(input.name)
  if (input.action === 'create') {
    // Do not override a disabled record with the same name.
    try { await lstat(pathOf(name,true)); throw new Error('A disabled skill already has this name') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    await writeNew(name, metadata(name, input.description ?? '', input.body ?? ''))
    return { ok: true }
  }
  const entry = await managed(name)
  if (input.action === 'read') {
    const body = entry.text.replace(HEADER, '').replace(managedMarker, '').trim()
    const description = /\ndescription:\s*"?([^"\r\n]+)"?/.exec(entry.text)?.[1] || ''
    return { name, enabled: entry.enabled, description, body }
  }
  if (input.action === 'toggle') {
    if (typeof input.enabled !== 'boolean') throw new Error('enabled must be boolean')
    if (entry.enabled !== input.enabled) {
      const target = pathOf(name, !input.enabled)
      try { await lstat(target); throw new Error('Target skill file already exists') }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      await rename(entry.path, target)
    }
    return { ok: true, enabled: input.enabled }
  }
  if (input.action === 'delete') {
    await rm(entry.path)
    return { ok: true }
  }
  if (input.action === 'update') {
    const existing = await mutateSkill({ action: 'read', name })
    const next = metadata(name, input.description ?? String(existing.description), input.body ?? String(existing.body))
    // atomic replacement; never follow the managed file as a symlink.
    const temp = join(ROOT(), `.${name}.${randomUUID()}.tmp`)
    try {
      await writeFile(temp, next, { flag: 'wx', mode: 0o600 })
      await checkFile(entry.path)
      await rename(temp, entry.path)
      try { await chmod(entry.path, 0o600) } catch { /* Windows ACL */ }
    } finally { await rm(temp, { force: true }).catch(() => {}) }
    return { ok: true }
  }
  throw new Error('Unsupported skill action')
}
