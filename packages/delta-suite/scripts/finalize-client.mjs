#!/usr/bin/env node
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = join(root, 'lib/client.js')
let source = readFileSync(path, 'utf8')
const palettePath = join(root, 'lib/client-theme-tokens.js')
const paletteSource = readFileSync(palettePath, 'utf8')
if (/\b(?:import|export)\s/.test(paletteSource)) throw new Error('Palette helper must not import or export at runtime')
if (!/\bconst DELTA_PALETTE\s*=/.test(paletteSource) || !/\bconst TOKENS\s*=/.test(paletteSource)) {
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
source = ';(() => {\n' + paletteSource + '\n' + source + '\n})();\n'
writeFileSync(path, source)
unlinkSync(palettePath) // bundled once into lib/client.js; never shipped as a second runtime module
const manifestPath = join(root, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.description !== dictionaries.en.meta.description) {
  manifest.description = dictionaries.en.meta.description
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
}
