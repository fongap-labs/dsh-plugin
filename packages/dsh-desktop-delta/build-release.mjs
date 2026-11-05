#!/usr/bin/env node
// Native Tauri release builder for the central Action Worker release contract.
// The source repository owns the build logic; the central worker verifies and publishes assets.
import { readFile, writeFile, mkdir, readdir, copyFile, stat, rm } from 'node:fs/promises'
import { resolve, dirname, join, extname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const product = join(root, 'packages', 'dsh-desktop-delta')
const tauri = join(product, 'src-tauri')
const targets = Object.freeze({
  'linux-x64': { platform: 'linux', arch: 'x64', bundle: 'deb', extension: '.deb', directory: 'deb' },
  'windows-x64': { platform: 'win32', arch: 'x64', bundle: 'nsis', extension: '.exe', directory: 'nsis' },
  'macos-arm64': { platform: 'darwin', arch: 'arm64', bundle: 'dmg', extension: '.dmg', directory: 'dmg' },
})

export function parseReleaseArgs(args, platform = process.platform, arch = process.arch) {
  const map = new Map()
  for (let i = 0; i < args.length; i += 2) {
    if (!['--target', '--version', '--output-dir'].includes(args[i]) || !args[i + 1] || map.has(args[i])) {
      throw new Error('Expected --target, --version and --output-dir exactly once')
    }
    map.set(args[i], args[i + 1])
  }
  if (map.size !== 3) throw new Error('Incomplete desktop release request')
  const target = map.get('--target')
  const version = map.get('--version')
  const config = targets[target]
  if (!config) throw new Error('Unsupported desktop release target: ' + target)
  if (config.platform !== platform || config.arch !== arch) {
    throw new Error(`Release target ${target} requires ${config.platform}/${config.arch}; runner is ${platform}/${arch}`)
  }
  if (!/^\d+\.\d+\.\d+(?:-beta\.[1-9]\d*)?$/.test(version)) {
    throw new Error('Invalid governed release version: ' + version)
  }
  return { target, version, config, outputDir: resolve(map.get('--output-dir')) }
}

export async function findInstaller(bundleRoot, config) {
  const directory = join(bundleRoot, config.directory)
  const entries = await readdir(directory, { withFileTypes: true })
  const files = entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(config.extension))
  if (files.length !== 1) {
    throw new Error(`Expected exactly one ${config.extension} installer in ${directory}; got ${files.length}`)
  }
  const installer = join(directory, files[0].name)
  if ((await stat(installer)).size === 0) throw new Error('Installer is empty: ' + installer)
  return installer
}

function run(program, args, cwd = root) {
  const result = spawnSync(program, args, { cwd, stdio: 'inherit', shell: false })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(program + ' exited with status ' + result.status)
}

function pnpm(args) {
  // Use the exactly pinned package manager without altering the host installation.
  const program = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  run(program, ['exec', '--yes', '--package=pnpm@11.28.5', '--', 'pnpm', ...args])
}

async function main() {
  const { target, version, config, outputDir } = parseReleaseArgs(process.argv.slice(2))
  const packagePath = join(product, 'package.json')
  const tauriPath = join(tauri, 'tauri.conf.json')
  const cargoPath = join(tauri, 'Cargo.toml')
  const files = [packagePath, tauriPath, cargoPath]
  const originals = await Promise.all(files.map(path => readFile(path, 'utf8')))
  // Install against the committed lockfile before temporarily injecting the release version.
  pnpm(['install', '--frozen-lockfile'])
  if (config.platform === 'linux') {
    run('sudo', ['apt-get', 'update'])
    run('sudo', ['apt-get', 'install', '-y', 'libwebkit2gtk-4.1-dev', 'build-essential', 'curl', 'wget',
      'file', 'libxdo-dev', 'libssl-dev', 'libayatana-appindicator3-dev', 'librsvg2-dev'])
  }
  const packageManifest = JSON.parse(originals[0])
  const tauriManifest = JSON.parse(originals[1])
  const cargoVersion = originals[2].match(/(^\s*version\s*=\s*")([^"]+)(")/m)
  if (!cargoVersion) throw new Error('Cargo package version not found')
  try {
    await writeFile(packagePath, JSON.stringify({ ...packageManifest, version }, null, 2) + '\n')
    await writeFile(tauriPath, JSON.stringify({ ...tauriManifest, version }, null, 2) + '\n')
    await writeFile(cargoPath, originals[2].replace(cargoVersion[0], cargoVersion[1] + version + cargoVersion[3]))
    pnpm(['--filter', '@fongap-labs/dsh-desktop-delta', 'tauri', 'build', '--bundles', config.bundle])
    const installer = await findInstaller(join(tauri, 'target', 'release', 'bundle'), config)
    await mkdir(outputDir, { recursive: true })
    const targetFile = join(outputDir, 'dsh-desktop-delta-' + target + config.extension)
    await copyFile(installer, targetFile)
    if ((await stat(targetFile)).size === 0) throw new Error('Copied installer is empty')
    console.log('Desktop release artifact: ' + targetFile)
  } finally {
    // Never leave a release-request version in tracked source files.
    await Promise.all(files.map((path, index) => writeFile(path, originals[index])))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1 })
}
