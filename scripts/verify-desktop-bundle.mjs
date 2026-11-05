import { readdir } from 'node:fs/promises'
import { resolve, relative } from 'node:path'

const platform = process.argv[2] ?? process.platform
const bundleRoot = resolve(process.argv[3] ?? 'packages/dsh-desktop-delta/src-tauri/target/release/bundle')

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = resolve(directory, entry.name)
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath]
  }))
  return nested.flat()
}

let files
try {
  files = await listFiles(bundleRoot)
} catch (error) {
  console.error('Native bundle directory is missing:', bundleRoot)
  process.exitCode = 1
  throw error
}

const names = files.map((file) => relative(bundleRoot, file).replaceAll('\\', '/').toLowerCase())
let found
switch (platform) {
  case 'win32':
    found = names.some((name) => name.endsWith('.msi') || ((name.startsWith('nsis/') || name.includes('/nsis/')) && name.endsWith('-setup.exe')))
    break
  case 'linux':
    found = names.some((name) => name.endsWith('.deb') || name.endsWith('.rpm') || name.endsWith('.appimage'))
    break
  case 'darwin':
    found = names.some((name) => name.endsWith('.dmg'))
    break
  default:
    throw new Error('Unsupported platform: ' + platform)
}

if (!found) {
  console.error('No expected installer package was found for ' + platform + ' under ' + bundleRoot)
  process.exitCode = 1
} else {
  console.log('Native installer package found for ' + platform)
}
