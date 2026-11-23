#!/usr/bin/env node
// Enforce the current Delta plugin names. Historical releases are immutable.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const retired = ['dsh', 'delta'].join('-') + '-'
const plugins = ['suite', 'code'].map(suffix => 'delta-' + suffix)
const ignored = new Set(['.git', 'node_modules', 'dist', 'coverage',
  '.cache', '.next', '.pnpm-store', '.turbo'])

export function findRetiredIdentifiers(projectRoot = root) {
  const errors = []
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignored.has(entry.name)) continue
      if (!entry.isDirectory() && !entry.isFile()) continue
      const path = join(directory, entry.name)
      const name = relative(projectRoot, path).replaceAll('\\', '/')
      if (name.includes(retired)) errors.push(name + ': legacy plugin path')
      if (entry.isDirectory()) { scan(path); continue }
      // The changelog records released history and cannot be rewritten.
      if (name !== 'CHANGELOG.md' && readFileSync(path).includes(Buffer.from(retired))) {
        errors.push(name + ': legacy plugin identifier')
      }
    }
  }
  scan(projectRoot)

  for (const name of plugins) {
    const pkgPath = join(projectRoot, 'packages', name, 'package.json')
    const releasePath = join(projectRoot, 'projects', name, 'release.manifest.json')
    if (!existsSync(pkgPath) || !existsSync(releasePath)) {
      errors.push(name + ': missing package or release manifest')
      continue
    }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const release = JSON.parse(readFileSync(releasePath, 'utf8'))
    const packageName = '@fongap-labs/' + name
    if (pkg.name !== packageName) errors.push(name + ': package name mismatch')
    const patchPath = resolve(projectRoot, 'packages', name, pkg.dsh?.bundle?.patch ?? 'missing')
    if (!existsSync(patchPath)) {
      errors.push(name + ': missing Cordis patch')
    } else {
      const patch = readFileSync(patchPath, 'utf8')
      if (!patch.includes('id: ' + name) || !patch.includes("name: '" + packageName + "'")) {
        errors.push(name + ': Cordis identity mismatch')
      }
    }
    if (release.release_key !== name ||
        release.artifact_name !== name + '-release' ||
        release.sbom_asset !== name + '-sbom.cdx.json') {
      errors.push(name + ': release identity mismatch')
    }
    const expected = ['fongap-labs-' + name + '.zip', 'fongap-labs-' + name + '.tgz']
    if (JSON.stringify(release.builds?.[0]?.assets) !== JSON.stringify(expected)) {
      errors.push(name + ': release assets mismatch')
    }
  }
  return errors
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = findRetiredIdentifiers()
  for (const error of errors) console.error(error)
  if (errors.length) process.exitCode = 1
  else console.log('Delta plugin naming audit passed')
}
