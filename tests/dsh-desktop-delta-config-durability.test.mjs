import { it, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const HOME = path.join(os.tmpdir(), 'dsh-suite-delta-config-test')
const CONFIG_DIR = path.join(HOME, '.dsh-ui-delta')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

/** Point the module at a throwaway home directory before it is imported. */
function useTempHome() {
  const original = os.homedir
  mock.method(os, 'homedir', () => HOME)
  syncBuiltinESMExports()
}

afterEach(() => {
  mock.restoreAll()
  syncBuiltinESMExports()
  fs.rmSync(HOME, { recursive: true, force: true })
})

it('writes the config through a temporary file and renames it into place', async () => {
  useTempHome()
  const { updateConfig, publicView } = await import('../packages/dsh-suite-delta/lib/host/config.js')
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  await updateConfig({ section: 'imageGen', model: 'image-model' })
  assert.equal(publicView().imageGen.model, 'image-model')
  // The temp file must not survive a successful write.
  assert.deepEqual(fs.readdirSync(CONFIG_DIR), ['config.json'])
  assert.equal(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).imageGen.model, 'image-model')
})

it('preserves an unreadable config file instead of overwriting it', async () => {
  useTempHome()
  const { readConfig } = await import('../packages/dsh-suite-delta/lib/host/config.js')
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, '{ this is not json', 'utf8')
  assert.deepEqual(readConfig(), {})
  const entries = fs.readdirSync(CONFIG_DIR)
  assert.equal(entries.includes('config.json'), false)
  const backup = entries.find(name => name.startsWith('config.json.unreadable-'))
  assert.ok(backup, 'the broken config must be preserved under a backup name')
  assert.equal(fs.readFileSync(path.join(CONFIG_DIR, backup), 'utf8'), '{ this is not json')
})

it('treats a missing config file as the normal first-run state', async () => {
  useTempHome()
  const { readConfig } = await import('../packages/dsh-suite-delta/lib/host/config.js')
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  assert.deepEqual(readConfig(), {})
  assert.deepEqual(fs.readdirSync(CONFIG_DIR), [])
})
