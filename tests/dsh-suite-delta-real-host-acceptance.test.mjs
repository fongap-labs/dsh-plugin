import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/verify-delta-suite-ui.mjs', import.meta.url))
const source = readFileSync(script, 'utf8')
const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
}

test('visual acceptance runner advertises its opt-in local-only prerequisites', () => {
  const result = run(['--help'])
  assert.equal(result.status, 0)
  assert.match(result.stdout, /--theme light\|dark/)
  assert.match(result.stdout, /playwright-core/)
  assert.match(result.stdout, /disposable, locally accessible DSH test profile/)
  assert.doesNotMatch(result.stdout, /PASS brand-tokens/)
})

test('visual acceptance refuses remote hosts before any browser tooling is loaded', () => {
  for (const url of [
    'https://github.com', 'http://example.com:3000', 'https://user:pass@localhost:4000',
    'http://localhost:4000/?token=secret', 'file:///tmp/test.html',
  ]) {
    const result = run(['--url', url, '--theme', 'light'])
    assert.equal(result.status, 2, url)
    assert.match(result.stderr, /loopback HTTP\(S\)/)
    assert.doesNotMatch(result.stderr, /playwright-core is not installed/)
  }
})

test('visual acceptance requires a theme and rejects invalid or duplicate options', () => {
  for (const args of [
    [], ['--url', 'http://127.0.0.1:4000'], ['--url', 'http://localhost:4000', '--theme', 'auto'],
    ['--url', 'http://localhost:4000', '--theme', 'light', '--theme', 'dark'],
    ['--url', 'http://localhost:4000', '--theme', 'light', '--write'],
  ]) {
    const result = run(args)
    assert.equal(result.status, 2)
    assert.match(result.stderr, /required|Duplicate option|Unknown option/)
  }
})

test('runner never mutates folder assignments and only captures explicit private evidence', () => {
  assert.match(source, /context\.request\.get\(endpoint\.href/)
  assert.match(source, /maxRedirects: 0/)
  assert.match(source, /new URL\(page\.url\(\)\)\.origin !== target\.origin/)
  assert.doesNotMatch(source, /context\.request\.(?:post|patch|put|delete)\(/)
  assert.doesNotMatch(source, /page\.request\.(?:post|patch|put|delete)\(/)
  assert.match(source, /const output = args\['--output'\] \? resolve/)
  assert.match(source, /chmodSync\(path, 0o600\)/)
  assert.match(source, /writeFileSync\(file, JSON\.stringify\(results, null, 2\)/)
  assert.match(source, /SafeError|safeError/)
  assert.match(source, /keyboard-collapse-and-restore/)
  assert.match(source, /responsive-.*width/)
})

test('folder buttons have visible keyboard focus and semantic light-dark tokens', () => {
  assert.match(client, /\.ens-folder-browser-group-head:focus-visible,/)
  assert.match(client, /\.ens-folder-browser-open:focus-visible \{/)
  assert.match(client, /outline: 2px solid var\(--ens-color-ring\)/)
  assert.match(client, /\.ens-folder-browser-session:focus-within \{/)
  assert.match(client, /'--ens-color-primary': \{ light: '#286F78', dark: '#60B4BF' \}/)
  assert.match(client, /ctx\.slots\.inject\('sidebar\.session\.row\.trailing'/)
  assert.match(client, /ctx\.slots\.inject\('sidebar\.session\.row\.hover'/)
})
