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
  assert.match(result.stdout, /--require-sessions/)
  assert.match(result.stdout, /--accessibility/)
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
    ['--url', 'http://localhost:4000', '--theme', 'light', '--require-sessions', '--require-sessions'],
    ['--url', 'http://localhost:4000', '--theme', 'light', '--accessibility', '--accessibility'],
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
  assert.match(source, /search-above-plugin-manager/)
  assert.match(source, /single-native-session-browser/)
  assert.match(source, /native-session-row/)
  assert.match(source, /responsive-.*width/)
  assert.match(source, /wcag-semantic-contrast/)
  assert.match(source, /contrastRatio\(foreground, background\)/)
  assert.match(source, /reducedMotion: 'reduce'/)
  assert.match(source, /record\('reduced-motion', 'PASS'\)/)
  assert.match(source, /\[360, 800\], \[320, 720\]/)
})

test('the unified page has keyboard focus and preserves native session slots', () => {
  assert.match(client, /\.ens-sidebar-search-input:focus-visible/)
  assert.match(client, /outline: 2px solid var\(--ens-color-ring\)/)
  assert.match(client, /\.ens-sidebar-search-input \{/)
  assert.match(client, /'--ens-color-primary': \{ light: '#286F78', dark: '#60B4BF' \}/)
  assert.match(client, /ctx\.slots\.inject\('sidebar\.session\.row\.trailing'/)
  assert.match(client, /ctx\.slots\.inject\('sidebar\.session\.row\.hover'/)
  assert.doesNotMatch(client, /ctx\.slots\.inject\('sidebar\.panellist'/)
})

test('visual regression requires explicit local baseline and valid tolerances', () => {
  const base = ['--url', 'http://127.0.0.1:4000', '--theme', 'light']
  for (const options of [
    ['--max-diff-pct', '0.5'],
    ['--pixel-tolerance', '16'],
    ['--baseline', '/tmp/private', '--max-diff-pct', '-1'],
    ['--baseline', '/tmp/private', '--max-diff-pct', 'NaN'],
    ['--baseline', '/tmp/private', '--pixel-tolerance', '256'],
  ]) {
    const result = run([...base, ...options])
    assert.equal(result.status, 2, options.join(' '))
    assert.match(result.stderr, /required|Invalid visual regression threshold/)
  }
  assert.match(source, /await import\('pngjs'\)/)
  assert.match(source, /PNG\.sync\.read\(readFileSync\(baselineFile\)\)/)
  assert.match(source, /visual-baseline-/)
  assert.match(source, /Visual difference exceeds baseline threshold/)
  assert.doesNotMatch(source, /writeFileSync\(baseline/)
})


test('real-host runner checks native sidebar, search placement and input composer', () => {
  assert.match(source, /single-native-session-browser/)
  assert.match(source, /search-above-plugin-manager/)
  assert.match(source, /native-session-row/)
  assert.match(source, /conversation-composer/)
  assert.match(source, /Native session list has no disposable sessions for keyboard acceptance/)
  assert.match(source, /Node\.DOCUMENT_POSITION_FOLLOWING/)
  assert.doesNotMatch(source, /Folder panel has no disposable sessions/)
})

test('accessibility mode checks foreground/background pairs and focus indicator contrast', () => {
  assert.match(source, /'--ens-color-primary-foreground'/)
  assert.match(source, /'--ens-color-muted-foreground'/)
  assert.match(source, /'--ens-color-accent-foreground'/)
  assert.match(source, /'--ens-color-destructive-foreground'/)
  assert.match(source, /'--ens-color-ring'/)
  assert.match(source, /\['focus-ring',[^\n]+, 3\]/)
  assert.match(source, /\['primary',[^\n]+, 4\.5\]/)
  assert.match(source, /--accessibility/)
})

test('accessibility mode restores normal motion preference after its reduced-motion check', () => {
  const reduced = source.indexOf("await page.emulateMedia({ reducedMotion: 'reduce' })")
  const restored = source.indexOf("await page.emulateMedia({ reducedMotion: 'no-preference' })", reduced)
  assert.ok(reduced > 0 && restored > reduced)
  assert.match(source.slice(reduced, restored), /transitionDurationMs <= 0\.01/)
  assert.match(source.slice(reduced, restored), /animationName === 'none'/)
})
