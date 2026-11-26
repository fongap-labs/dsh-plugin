import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixture = relative => fileURLToPath(new URL('../../' + relative, import.meta.url))

/**
 * Compile the browser client into an isolated directory, not shared lib/.
 * Node's test runner executes files in parallel; recompiling lib/client.js
 * concurrently with finalize-client.mjs caused one suite to read unresolved
 * locale/CSS markers and incorrectly report missing UI dictionaries.
 *
 * Mirror the release finalizer's exact one-marker replacements while keeping
 * the source tree and package manifest unchanged.
 */
export function buildDesktopClientFixture() {
  const temp = mkdtempSync(join(tmpdir(), 'dtd-client-fixture-'))
  try {
    execFileSync(process.execPath, [
      fixture('node_modules/typescript/bin/tsc'),
      '-p', fixture('packages/delta-ui/tsconfig.client.json'),
      '--outDir', temp,
    ], { stdio: 'pipe' })
    let source = readFileSync(join(temp, 'client.js'), 'utf8')
    const config = JSON.parse(readFileSync(fixture('packages/delta-ui/tsconfig.client.json'), 'utf8'))
    const helperSources = config.include.filter(file => /^src\/client-.+\.ts$/.test(file) && !file.endsWith('.d.ts'))
      .map(file => readFileSync(join(temp, file.slice(4).replace(/\.ts$/, '.js')), 'utf8'))
    for (const helper of helperSources) {
      if (/^\s*(?:import|export)\s/m.test(helper)) throw new Error('Client helper must not import or export at runtime')
    }
    const paletteSource = helperSources[0]
    if (!/\bconst TOKENS\s*=/.test(paletteSource)) throw new Error('Compiled Theme palette missing')
    const dictionaries = Object.fromEntries(['zh', 'en'].map(lang => [
      lang, JSON.parse(readFileSync(fixture('packages/delta-ui/locale/' + lang + '.json'), 'utf8')),
    ]))
    const replacements = new Map([
      ['__DELTA_UI_LOCALES__', JSON.stringify(dictionaries)],
      ['__DELTA_UI_STYLE__', JSON.stringify(readFileSync(fixture('packages/delta-ui/src/theme.css'), 'utf8'))],
      ['__DELTA_UI_FEATURE_STYLE__', JSON.stringify(readFileSync(fixture('packages/delta-ui/src/feature-extras.css'), 'utf8'))],
    ])
    for (const [marker, value] of replacements) {
      const literal = "'" + marker + "'"
      if (source.split(literal).length !== 2) throw new Error('Expected exactly one ' + marker)
      source = source.replace(literal, value)
    }
    if (/\b(?:from|import)\s*\(['"]|\bprocess\.env\b|__DELTA_UI_/.test(source)) {
      throw new Error('Fixture client contains unresolved runtime imports or markers')
    }
    if (!source.includes('window.__ModuleLoader__.load({')) {
      throw new Error('Fixture client registration missing')
    }
    return ';(() => {\n' + helperSources.join('\n') + '\n' + source + '\n})();\n'
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}
