#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const readinessPath = resolve(root, 'projects/dsh-delta-desktop/feature-readiness.json')
const readiness = JSON.parse(readFileSync(readinessPath, 'utf8'))
const incomplete = Object.entries(readiness.required ?? {}).filter(([, done]) => done !== true).map(([name]) => name)
if (incomplete.length !== 0) {
  console.error(`Delta Desktop release blocked: incomplete required capabilities: ${incomplete.join(', ')}`)
  process.exit(65)
}
const script = resolve(root, 'scripts/build-release.mjs')
const result = spawnSync(process.execPath, [script, '--package', 'dsh-delta-desktop', ...process.argv.slice(2)], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
