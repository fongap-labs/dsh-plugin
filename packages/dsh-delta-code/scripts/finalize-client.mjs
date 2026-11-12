#!/usr/bin/env node
// DSH concatenates third-party browser clients into combo scripts. Keep all
// Code Worker top-level declarations out of the shared global lexical scope.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { Script, createContext } from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const clientPath = resolve(root, 'lib/client.js')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const original = readFileSync(clientPath, 'utf8')
if (!original.includes('window.__ModuleLoader__.load(')) {
  throw new Error('Delta Code client registration is missing from compiled output')
}
if (/^\s*(?:import|export)\s/m.test(original)) {
  throw new Error('Delta Code client must be a classic browser script, not ESM')
}
const wrapped = original.startsWith(';(() => {\n')
  ? original
  : ';(() => {\n' + original + '\n})();\n'
const registrations = []
const context = createContext({
  window: { __ModuleLoader__: { load(entry) { registrations.push(entry) } } },
})
// Simulate the already-loaded UI plugins that own these lexical names.
new Script('const NAME = "existing-module"; const ROW_KEY = "existing-row";').runInContext(context)
const script = new Script(wrapped, { filename: 'dsh-delta-code/client.js' })
script.runInContext(context, { timeout: 1000 })
script.runInContext(context, { timeout: 1000 })
if (registrations.length !== 2 ||
    registrations.some(entry => entry?.id !== manifest.name || typeof entry.factory !== 'function')) {
  throw new Error('Delta Code client must register its exact package id on every load')
}
writeFileSync(clientPath, wrapped)
