#!/usr/bin/env node
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = join(root, 'lib/client.js')
let source = readFileSync(path, 'utf8')
// The browser tsconfig defines the ordered, build-only helper scripts.
const config = JSON.parse(readFileSync(join(root, 'tsconfig.client.json'), 'utf8'))
const helperPaths = config.include.filter(file => /^src\/client-.+\.ts$/.test(file) && !file.endsWith('.d.ts'))
  .map(file => join(root, 'lib', file.slice(4).replace(/\.ts$/, '.js')))
const helperSources = helperPaths.map(file => readFileSync(file, 'utf8'))
for (const helper of helperSources) {
  if (/^\s*(?:import|export)\s/m.test(helper)) throw new Error('Client helper must not import or export at runtime')
}
const paletteSource = helperSources[0]
if (!paletteSource || !/\bconst DELTA_PALETTE\s*=/.test(paletteSource) || !/\bconst TOKENS\s*=/.test(paletteSource)) {
  throw new Error('Compiled palette must contain the complete Theme API token map')
}
const dictionaries = Object.fromEntries(['zh', 'en'].map(lang => [lang, JSON.parse(readFileSync(join(root, 'locale', lang + '.json'), 'utf8'))]))
const one = (marker, code) => {
  const literal = "'" + marker + "'"
  if (source.split(literal).length !== 2) throw new Error('Expected exactly one ' + marker + ' in compiled client')
  source = source.replace(literal, code)
}
one('__DELTA_SUITE_LOCALES__', JSON.stringify(dictionaries))
one('__DELTA_SUITE_STYLE__', JSON.stringify(readFileSync(join(root, 'src/theme.css'), 'utf8')))
one('__DELTA_SUITE_FEATURE_STYLE__', JSON.stringify(readFileSync(join(root, 'src/feature-extras.css'), 'utf8')))
if (/\b(?:from|import)\s*\(['"]|\bprocess\.env\b|__DELTA_SUITE_/.test(source)) throw new Error('Client bundle contains unresolved runtime imports or markers')
if (!source.includes('window.__ModuleLoader__.load({')) throw new Error('Client module registration missing')
source = ';(() => {\n' + helperSources.join('\n') + '\n' + source + '\n})();\n'
writeFileSync(path, source)
for (const helperPath of helperPaths) unlinkSync(helperPath) // all helpers are bundled into the single browser module
const manifestPath = join(root, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.description !== dictionaries.en.meta.description) {
  manifest.description = dictionaries.en.meta.description
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
}
