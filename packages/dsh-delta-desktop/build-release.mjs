#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const script = resolve(root, 'scripts/build-release.mjs')
const result = spawnSync(process.execPath, [script, '--package', 'dsh-delta-desktop', ...process.argv.slice(2)], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
