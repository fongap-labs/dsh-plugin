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
      '-p', fixture('packages/dsh-delta-desktop/tsconfig.client.json'),
      '--outDir', temp,
    ], { stdio: 'pipe' })
    let source = readFileSync(join(temp, 'client.js'), 'utf8')
    const dictionaries = Object.fromEntries(['zh', 'en'].map(lang => [
      lang, JSON.parse(readFileSync(fixture('packages/dsh-delta-desktop/locale/' + lang + '.json'), 'utf8')),
    ]))
    const replacements = new Map([
      ['__DELTA_DESKTOP_LOCALES__', JSON.stringify(dictionaries)],
      ['__DELTA_DESKTOP_STYLE__', JSON.stringify(readFileSync(fixture('packages/dsh-delta-desktop/src/theme.css'), 'utf8'))],
      ['__DELTA_DESKTOP_FEATURE_STYLE__', JSON.stringify(readFileSync(fixture('packages/dsh-delta-desktop/src/feature-extras.css'), 'utf8'))],
    ])
    for (const [marker, value] of replacements) {
      const literal = "'" + marker + "'"
      if (source.split(literal).length !== 2) throw new Error('Expected exactly one ' + marker)
      source = source.replace(literal, value)
    }
    if (/\b(?:from|import)\s*\(['"]|\bprocess\.env\b|__DELTA_DESKTOP_/.test(source)) {
      throw new Error('Fixture client contains unresolved runtime imports or markers')
    }
    if (!source.includes('window.__ModuleLoader__.load({')) {
      throw new Error('Fixture client registration missing')
    }
    return ';(() => {\n' + source + '\n})();\n'
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}
