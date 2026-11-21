#!/usr/bin/env node
/**
 * Windows sandbox CI contract for Action Worker. Only source-level operations:
 * no release credentials, deployments, npm publishing, or host installation.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const targetRoot = resolve(process.argv[2] ?? '.')
const manifest = JSON.parse(readFileSync(join(targetRoot, 'package.json'), 'utf8'))
const manager = manifest.packageManager
if (!/^pnpm@\d+\.\d+\.\d+$/.test(manager)) {
  throw new Error('A pinned pnpm packageManager version is required')
}
function execute(command, args, step) {
  console.log('Windows CI: ' + step)
  const result = spawnSync(command, args, {
    cwd: targetRoot,
    env: { ...process.env, CI: 'true' },
    stdio: 'inherit',
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(step + ' failed with exit ' + result.status)
}
const command = name => process.platform === 'win32' ? name + '.cmd' : name
execute(command('corepack'), ['enable'], 'enable corepack')
execute(command('corepack'), ['prepare', manager, '--activate'], 'activate pinned pnpm')
execute(command('pnpm'), ['install', '--frozen-lockfile'], 'frozen install')
// Discover each Cordis plugin's Host and Client project without trusting a
// PR-controlled build script or accidentally omitting newly added siblings.
const configurations = ['packages/shared/tsconfig.json']
for (const entry of readdirSync(join(targetRoot, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'shared') continue
  const packageDir = join('packages', entry.name)
  if (!existsSync(join(targetRoot, packageDir, 'package.json'))) continue
  for (const configName of ['tsconfig.json', 'tsconfig.client.json']) {
    if (existsSync(join(targetRoot, packageDir, configName))) {
      configurations.push(join(packageDir, configName))
    }
  }
}
for (const config of configurations) {
  execute(process.execPath, [join(targetRoot, 'node_modules/typescript/bin/tsc'), '-p', config],
    'compile ' + config)
}
execute(process.execPath, ['packages/dsh-delta-suite/scripts/finalize-client.mjs'],
  'finalize Delta client')
execute(process.execPath, ['--test', 'tests/**/*.test.mjs'], 'run Windows regression tests')
execute(process.execPath, ['scripts/pack-bundles.mjs', '--check'], 'validate native plugin bundles')
console.log('Windows CI: all phases passed')
