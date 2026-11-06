import test from 'node:test'
import assert from 'node:assert/strict'
import { stripTypeScriptTypes } from 'node:module'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../packages/dsh-desktop-delta/src/host/skill-import.ts', import.meta.url), 'utf8')
const js = stripTypeScriptTypes(source, { mode: 'strip' })
const { parseSkillMarkdown, githubSkillEndpoint, previewGithubSkill, previewZipSkill } =
  await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
const markdown = '---\nname: sample-skill\ndescription: Safe example\n---\n# Demo\nInspect content first.'
const crc32 = bytes => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
const createZip = (name, contents) => {
  const filename = Buffer.from(name)
  const bytes = Buffer.from(contents)
  const crc = crc32(bytes)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(bytes.length, 18)
  local.writeUInt32LE(bytes.length, 22)
  local.writeUInt16LE(filename.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(bytes.length, 20)
  central.writeUInt32LE(bytes.length, 24)
  central.writeUInt16LE(filename.length, 28)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + filename.length, 12)
  end.writeUInt32LE(local.length + filename.length + bytes.length, 16)
  return Buffer.concat([local, filename, bytes, central, filename, end])
}
test('SKILL.md validation handles invalid metadata and renders preview only', () => {
  const preview = parseSkillMarkdown(markdown, 'local')
  assert.equal(preview.name, 'sample-skill')
  assert.match(preview.warning, /Preview only/)
  assert.throws(() => parseSkillMarkdown('bad', 'local'), /frontmatter/)
  assert.throws(() => parseSkillMarkdown(markdown.replace('sample-skill', '../bad'), 'local'), /name/)
})
test('GitHub import permits only fixed hosts and no credentials or redirects', async () => {
  assert.match(githubSkillEndpoint('https://github.com/owner/repo/blob/main/SKILL.md'), /^https:\/\/raw\.githubusercontent\.com\//)
  assert.match(githubSkillEndpoint('https://github.com/owner/repo'), /^https:\/\/api\.github\.com\//)
  for (const url of ['https://localhost/private', 'http://github.com/owner/repo',
    'https://github.com@evil.example/repo', 'https://github.com/owner/repo?token=secret',
    'https://github.com/owner/../repo', 'https://github.com/owner/repo/blob/main/%2e%2e/SKILL.md']) {
    assert.throws(() => githubSkillEndpoint(url), /GitHub|HTTPS|path/)
  }
  let called = false
  const preview = await previewGithubSkill('https://raw.githubusercontent.com/owner/repo/main/SKILL.md', async (url, options) => {
    called = true
    assert.equal(options.redirect, 'error')
    return new Response(markdown, { status: 200 })
  })
  assert.ok(called)
  assert.equal(preview.name, 'sample-skill')
  await assert.rejects(previewGithubSkill('https://github.com/owner/repo', async () =>
    new Response('no', { status: 404 })), /HTTP 404/)
})
test('ZIP parser reads a single SKILL.md without extracting other files', () => {
  const zip = createZip('my-folder/SKILL.md', markdown)
  const preview = previewZipSkill(zip)
  assert.equal(preview.name, 'sample-skill')
  assert.equal(preview.source, 'zip:my-folder/SKILL.md')
  assert.throws(() => previewZipSkill(createZip('../SKILL.md', markdown)), /Unsafe ZIP/)
  const corrupt = Buffer.from(zip)
  corrupt[45] ^= 255
  assert.throws(() => previewZipSkill(corrupt), /checksum|Invalid|ZIP/)
  assert.throws(() => previewZipSkill(Buffer.alloc(2200000)), /2 MB/)
})
