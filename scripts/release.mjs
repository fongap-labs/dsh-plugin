#!/usr/bin/env node
/**
 * dsh-plugin release script.
 *
 * The package.json files in this repo always keep version "0.0.0" as a
 * placeholder. This script reads the version from a git tag (e.g. v1.2.3),
 * temporarily injects it into every publishable package's package.json,
 * builds, publishes to npm, then restores the originals.
 *
 * Usage:
 *   node scripts/release.mjs                    # use latest git tag
 *   node scripts/release.mjs --tag v1.2.3       # explicit tag
 *   node scripts/release.mjs --dry-run          # preview without publishing
 *   node scripts/release.mjs --registry <url>   # private npm registry
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = process.cwd()
const PACKAGES_DIR = join(ROOT, 'packages')

// Publish order: shared first (others depend on it), then the rest.
const PUBLISH_ORDER = [
  'shared',
  'dsh-code-worker',
  'dsh-ui-delta',
  'plugin-template',
]

function parseArgs(argv) {
  const args = argv.slice(2)
  const opts = { tag: null, dryRun: false, registry: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tag') opts.tag = args[++i]
    else if (args[i] === '--dry-run') opts.dryRun = true
    else if (args[i] === '--registry') opts.registry = args[++i]
  }
  return opts
}

function latestTag() {
  return execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim()
}

function parseVersion(tag) {
  const v = tag.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/i.test(v)) {
    throw new Error(`Tag "${tag}" is not a valid semver (expected vX.Y.Z)`)
  }
  return v
}

async function readPkg(dir) {
  return JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
}

async function writePkg(dir, pkg) {
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n',
    'utf8'
  )
}

function run(cmd, cwd = ROOT) {
  console.log(`  $ ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

async function main() {
  const opts = parseArgs(process.argv)
  const tag = opts.tag || latestTag()
  const version = parseVersion(tag)

  console.log(`Release tag : ${tag}`)
  console.log(`Version     : ${version}`)
  console.log(`Mode        : ${opts.dryRun ? 'dry-run' : 'publish'}`)
  if (opts.registry) console.log(`Registry    : ${opts.registry}`)
  console.log('')

  // ── Step 1: read all originals ─────────────────────────────────────
  const packages = []
  for (const name of PUBLISH_ORDER) {
    const dir = join(PACKAGES_DIR, name)
    const original = await readPkg(dir)
    packages.push({ name, dir, original })
  }

  // ── Step 2: inject version into all packages simultaneously ────────
  //  (workspace:* resolution reads package.json at publish time, so
  //   every package must already carry the real version before any
  //   pnpm publish runs.)
  console.log('Injecting version into package.json files...')
  for (const pkg of packages) {
    const modified = { ...pkg.original, version, private: false }
    await writePkg(pkg.dir, modified)
    console.log(`  ${pkg.original.name} → ${version}`)
  }

  try {
    // ── Step 3: build ────────────────────────────────────────────────
    console.log('\nBuilding all packages...')
    run('node node_modules/typescript/bin/tsc -p packages/shared/tsconfig.json')
    run('node node_modules/typescript/bin/tsc -p packages/dsh-code-worker/tsconfig.json')
    run('node node_modules/typescript/bin/tsc -p packages/dsh-ui-delta/tsconfig.json')
    run('node node_modules/typescript/bin/tsc -p packages/plugin-template/tsconfig.json')
    run('node node_modules/typescript/bin/tsc -p packages/dsh-ui-delta/tsconfig.client.json')
    console.log('Build complete.\n')

    // ── Step 4: publish in dependency order ──────────────────────────
    console.log('Publishing...')
    for (const pkg of packages) {
      console.log(`  → ${pkg.original.name}@${version}`)
      if (opts.dryRun) {
        console.log('    (dry-run, skipping actual publish)')
        continue
      }
      const cmd = ['pnpm', 'publish', '--access', 'public', '--no-git-checks']
      if (opts.registry) cmd.push('--registry', opts.registry)
      run(cmd.join(' '), pkg.dir)
    }
  } finally {
    // ── Step 5: restore all originals ────────────────────────────────
    console.log('\nRestoring package.json files...')
    for (const pkg of packages) {
      await writePkg(pkg.dir, pkg.original)
      console.log(`  ${pkg.original.name} → ${pkg.original.version}`)
    }
  }

  console.log(`\nRelease ${version} ${opts.dryRun ? 'preview' : 'complete'}.`)
}

main().catch((err) => {
  console.error(`\nrelease failed: ${err.message}`)
  process.exit(1)
})
