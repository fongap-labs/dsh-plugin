#!/usr/bin/env node
// Desktop-only portable release entry. Shared orchestration stays in scripts/.
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const values = new Map()
for (let i = 0; i < args.length; i += 2) {
  if (!['--target', '--version', '--output-dir'].includes(args[i]) ||
      !args[i + 1] || values.has(args[i])) {
    throw new Error('Desktop release requires --target, --version, --output-dir')
  }
  values.set(args[i], args[i + 1])
}
if (values.size !== 3) throw new Error('Desktop release needs three distinct parameters')
const output = resolve(values.get('--output-dir'))
function run(command, parameters) {
  const result = spawnSync(command, parameters, { cwd: root, stdio: 'inherit', shell: false })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(command + ' failed: ' + result.status)
}
run(process.execPath, [
  join(root, 'scripts/build-release.mjs'),
  '--package', 'dsh-delta-desktop', ...args,
])
// Generic builder validates the bundle and produces assets; this independent
// product verifier additionally inspects the shipped Host + Client in *both* archives.
run(process.execPath, [
  join(root, 'packages', 'dsh-delta-desktop', 'verify-release.mjs'),
  '--zip', join(output, 'fongap-labs-dsh-delta-desktop.zip'),
  '--tgz', join(output, 'fongap-labs-dsh-delta-desktop.tgz'),
  '--version', values.get('--version'),
])
