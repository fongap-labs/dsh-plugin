import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'
import { DEFAULT_LSP_SERVERS } from '../packages/dsh-delta-code/lib/lsp-defaults.js'
const root = new URL('../packages/dsh-delta-code/', import.meta.url)
const read = (p) => readFileSync(new URL(p,root),'utf8')
describe('code worker native settings contract', () => {
  it('uses localized Delta Code Worker labels without changing the bundle identity', () => {
    const en = JSON.parse(read('locale/en.json'))
    const zh = JSON.parse(read('locale/zh.json'))
    const pkg = JSON.parse(read('package.json'))
    assert.equal(en.meta.title, 'Delta Code Worker')
    assert.equal(zh.meta.title, 'Delta 编程助手')
    assert.equal(pkg.name, '@fongap-labs/dsh-delta-code')
    const client = read('src/client.ts')
    assert.match(client, /Delta Code Worker/)
  })

  it('ships Host Config with volatile paths and tokenEnv-only credentials', () => {
    assert.match(read('src/config.ts'), /volatile\(\)/)
    assert.match(read('src/config.ts'), /tokenEnv: Schema\.string\(\)\.required\(\)/)
    assert.doesNotMatch(read('src/config.ts'), /role\('secret'\)/)
  })
  it('uses one shared default LSP catalog in settings and runtime', () => {
    assert.deepEqual(normalizeConfig({}).lspServers, DEFAULT_LSP_SERVERS)
    const settings = read('src/config.ts')
    const runtime = read('src/runtime.ts')
    assert.match(settings, /import \{ DEFAULT_LSP_SERVERS \} from '\.\/lsp-defaults\.js'/)
    assert.match(runtime, /import \{ DEFAULT_LSP_SERVERS \} from '\.\/lsp-defaults\.js'/)
    assert.doesNotMatch(settings, /typescript-language-server/)
    assert.doesNotMatch(runtime, /typescript-language-server/)
    assert.equal(DEFAULT_LSP_SERVERS.length, 5)
  })
  it('ships a proper client entry, not an HTML/DOM overlay', () => {
    const pkg = JSON.parse(read('package.json'))
    assert.equal(pkg.exports['./client'], './lib/client.js')
    assert.ok(existsSync(new URL('lib/client.js', root)), 'build must emit the DSH client script')
    assert.match(read('lib/client.js'), /__ModuleLoader__\.load\(/)
    assert.doesNotMatch(read('lib/client.js'), /\bexport\s*\{/)
    const tsconfig = JSON.parse(read('tsconfig.json'))
    assert.equal(tsconfig.compilerOptions.moduleDetection, 'legacy')
    assert.equal(pkg.dsh.client.platform,'web')
    assert.match(read('src/client.ts'), /plugins\.row\.config/)
    assert.match(read('src/client.ts'), /mutate\(ops, state\.revision\)/)
  })
  it('supports an explicit legacy and guarded Host FS write contract in native settings', () => {
    const client = read('src/client.ts')
    const schema = read('src/config.ts')
    assert.match(client, /fsWriteContract/)
    assert.match(client, /legacy-overwrite/)
    assert.match(client, /guarded-intent/)
    assert.match(client, /\['fsWriteContract', \['execution', 'fsWriteContract'\]\]/)
    assert.match(schema, /fsWriteContract: Schema\.string\(\)\.default\('legacy-overwrite'\)/)
  })
  it('stores only tokenEnv references with path-level updates', () => {
    const source=read('src/client.ts')
    assert.match(source, /sourceIndex/)
    assert.match(source,/set\(\[\.\.\.prefix, 'tokenEnv'\], a\.tokenEnv\)/)
    assert.doesNotMatch(source,/set\(\[\.\.\.prefix, 'token'\]/)
    assert.doesNotMatch(source,/type: 'password'/)
  })
})

describe('code worker cyclic config protection', () => {
  it('rejects cyclic objects, arrays, and volatile get() wrappers', () => {
    const config = { enabled: true }
    config.git = config
    assert.throws(() => normalizeConfig(config), /circular configuration reference/)
    const list = []
    list.push(list)
    assert.throws(() => normalizeConfig({ lsp: { servers: list } }), /circular configuration reference/)
    const node = { get() { return node } }
    assert.throws(() => normalizeConfig({ git: node }), /circular configuration reference/)
  })

  it('allows shared subobjects and limits excessive nesting', () => {
    const shared = { command: 'git' }
    const config = { git: shared, other: shared }
    assert.equal(normalizeConfig(config).gitCommand, 'git')
    assert.equal(config.git, shared)
    let nested = {}
    for (let i = 0; i < 75; i++) nested = { child: nested }
    assert.throws(() => normalizeConfig({ nested }), /configuration nesting limit exceeded/)
  })
})
