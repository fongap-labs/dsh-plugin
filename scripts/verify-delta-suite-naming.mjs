#!/usr/bin/env node
// Fail the build if product names, package IDs or release paths regress.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Compose retired identifiers, so this guard does not preserve their literal
// spellings in the source tree it audits.
const retired = [
  ['dsh', 'delta', 'desktop'].join('-'),
  ['delta', 'desktop'].join('-'),
  ['delta', 'desktop'].join('_'),
  ['Delta', 'Desktop'].join(' '),
  ['Delta', '桌面'].join(' '),
  ['DELTA', 'DESKTOP'].join('_'),
  ['Delta', 'Desktop'].join(''),
  ['delta', 'Desktop'].join(''),
]

const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'coverage',
  '.cache', '.next', '.pnpm-store', '.turbo'])
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Desktop is a new, independent product. Its exact identity is no longer a
// retired Suite identity; keep blocking obsolete variants in all other files.
const legitimateDesktopIdentity = new Set([
  ['dsh', 'delta', 'desktop'].join('-'),
  ['delta', 'desktop'].join('-'),
  ['Delta', 'Desktop'].join(' '),
])
const legitimateDesktopLocations = new Set([
  'README.md', 'CHANGELOG.md', 'package.json', 'pnpm-lock.yaml',
])
const desktopPrefix = ['packages', ['dsh', 'delta', 'desktop'].join('-')].join('/') + '/'
const allowedNewDesktopIdentity = (path, token) =>
  legitimateDesktopIdentity.has(token) &&
  (path.startsWith(desktopPrefix) || legitimateDesktopLocations.has(path))

export function findRetiredIdentifiers(projectRoot = root) {
  const found = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue
      if (!entry.isDirectory() && !entry.isFile()) continue
      const absolute = join(directory, entry.name)
      const name = relative(projectRoot, absolute).replaceAll('\\', '/')
      for (const token of retired) {
        if (name.includes(token) && !allowedNewDesktopIdentity(name, token)) found.push(name + ': path contains an obsolete identifier')
      }
      if (entry.isDirectory()) { visit(absolute); continue }
      const bytes = readFileSync(absolute)
      for (const token of retired) {
        // Central release governance makes previously published CHANGELOG
        // entries immutable. Product *identity* strings remain disallowed,
        // but historic display labels in that audit log cannot be rewritten
        // by a normal source PR.
        if (name === 'CHANGELOG.md' &&
            (token === ['Delta', 'Desktop'].join(' ') ||
             token === ['Delta', '桌面'].join(' '))) continue
        if (!allowedNewDesktopIdentity(name, token) && bytes.includes(Buffer.from(token, 'utf8'))) {
          found.push(name + ': content contains an obsolete identifier')
        }
      }
    }
  }
  visit(projectRoot)
  return found
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = findRetiredIdentifiers()
  if (errors.length) {
    for (const problem of errors) console.error(problem)
    process.exitCode = 1
  } else {
    console.log('Delta Suite naming audit: no obsolete identifiers')
  }
}
