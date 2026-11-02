#!/usr/bin/env node
/**
 * Portable DSH plugin release builder. No platform-native binaries are emitted.
 * Action Worker calls the thin package entry with --target, --version, --output-dir.
 */
import { readFile, writeFile, mkdir, copyFile, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const slugPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const versionPattern = /^\d+\.\d+\.\d+(?:-beta\.[1-9]\d*)?$/

function args(argv) {
  const values = new Map()
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    if (!['--package', '--target', '--version', '--output-dir'].includes(key) ||
        !argv[i + 1] || values.has(key)) throw new Error('Invalid release arguments')
    values.set(key, argv[i + 1])
  }
  if (values.size !== 4) throw new Error('Expected --package, --target, --version, --output-dir')
  const name = values.get('--package')
  const version = values.get('--version')
  if (!slugPattern.test(name) || !versionPattern.test(version)) {
    throw new Error('Invalid plugin name or release version')
  }
  return { name, target: values.get('--target'), version, output: resolve(values.get('--output-dir')) }
}

function run(executable, parameters) {
  const result = spawnSync(executable, parameters, { cwd: root, stdio: 'inherit', shell: false })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(executable + ' failed (exit ' + result.status + ')')
}

async function main() {
  const { name, target, version, output } = args(process.argv.slice(2))
  if (target !== 'portable') throw new Error('Portable plugin release requires target=portable')
  const packagePath = join(root, 'packages', name, 'package.json')
  const original = await readFile(packagePath, 'utf8')
  const manifest = JSON.parse(original)
  if (!manifest?.dsh?.bundle?.patch || !manifest.name?.startsWith('@')) {
    throw new Error('Not a valid DSH plugin package: ' + name)
  }
  const safeName = manifest.name.replace(/^@/, '').replaceAll('/', '-')
  await mkdir(output, { recursive: true })
  const patched = { ...manifest, version, private: false }
  try {
    await writeFile(packagePath, JSON.stringify(patched, null, 2) + '\n')
    // Pin package manager to the version declared at the workspace root.
    const workspace = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    const manager = workspace.packageManager
    if (!/^pnpm@\d+\.\d+\.\d+$/.test(manager)) {
      throw new Error('Expected pinned pnpm packageManager in root package.json')
    }
    // npm exec is present with setup-node; it avoids dependence on runner pnpm shims.
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const pnpm = (parameters) => run(npm, ['exec', '--yes', manager, '--', ...parameters])
    pnpm(['install', '--frozen-lockfile'])
    pnpm(['build'])
    pnpm(['pack:bundles', '--package=' + name])
    const zip = join(root, 'dist', safeName + '-' + version + '.zip')
    if (!existsSync(zip)) throw new Error('Bundle was not produced: ' + zip)
    await copyFile(zip, join(output, safeName + '.zip'))
    const temp = join(root, 'dist', 'release-tgz-' + name)
    await rm(temp, { recursive: true, force: true })
    try {
      await mkdir(temp, { recursive: true })
      pnpm(['--filter', './packages/' + name, 'pack', '--pack-destination', temp])
      const archives = (await readdir(temp)).filter(x => x.endsWith('.tgz'))
      if (archives.length !== 1) throw new Error('Expected exactly one npm tarball')
      await copyFile(join(temp, archives[0]), join(output, safeName + '.tgz'))
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
    console.log('Portable release assembled: ' + name + '@' + version)
  } finally {
    await writeFile(packagePath, original)
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
