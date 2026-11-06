#!/usr/bin/env node
/**
 * A single-command, isolated local acceptance Host for the already released
 * Delta Suite P0 probe. This file never changes the user's real DSH_HOME.
 *
 * The Release tag is pinned to the source SHA already confirmed for beta.1.
 * No model or account credentials are copied. All test data stays in a fresh
 * temporary DSH home, which is removed after the child Host process exits.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RELEASE_URL =
  'https://github.com/fongap-labs/dsh-plugin/releases/download/dsh-suite-delta-v0.1.0-beta.1/fongap-labs-dsh-suite-delta.tgz'
const BUNDLE = '@fongap-labs/dsh-suite-delta'
const PROFILE = 'delta-poc'
const DEFAULT_PORT = 3081

function parseArgs(argv) {
  let port = DEFAULT_PORT
  let isDryRun = false
  let isHelp = false
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    if (value === '--help' || value === '-h') isHelp = true
    else if (value === '--dry-run') isDryRun = true
    else if (value === '--port') {
      if (i + 1 >= argv.length) throw new Error('port-required')
      const raw = argv[++i]
      if (!/^[0-9]{4,5}$/.test(raw) || Number(raw) < 1025 || Number(raw) > 65535) {
        throw new Error('port-invalid')
      }
      port = Number(raw)
    } else throw new Error('unknown-option')
  }
  return { port, isDryRun, isHelp }
}

function usage() {
  return [
    'Delta Suite isolated P0 Host',
    'Usage: node scripts/run-delta-poc-isolated.mjs [--port 3081] [--dry-run]',
    'Requirements: installed dsh CLI, local network access to GitHub Release.',
    'Uses a NEW temporary DSH_HOME and the official web template.',
    'Never copies real profiles, credentials, sessions, cookies, or model settings.',
    'The installed Delta Suite P0 page is enabled ONLY in that temporary profile.',
    'Open the URL printed by Harness (it supplies the official launch token).',
    'Then navigate in the same authenticated browser to /dsh-ui-delta/poc.',
    'Stop the child Host with Ctrl+C to delete the temporary profile.',
    'No model prompts or tool approvals are executed by this launcher.',
  ].join('\n')
}

function dshCommand() {
  return process.platform === 'win32' ? 'dsh.cmd' : 'dsh'
}

function runDsh(args, environment) {
  const result = spawnSync(dshCommand(), args, {
    env: environment,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) throw new Error('dsh-cli-not-available')
  if (result.status !== 0) throw new Error('dsh-command-failed')
}

function addBundle(profileDir) {
  const manifestFile = join(profileDir, 'package.json')
  if (!existsSync(manifestFile)) throw new Error('profile-not-initialized')
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  const installed = join(profileDir, 'node_modules', '@fongap-labs', 'dsh-suite-delta', 'package.json')
  if (!existsSync(installed)) throw new Error('installed-bundle-not-found')
  const ownPackage = JSON.parse(readFileSync(installed, 'utf8'))
  if (ownPackage.name !== BUNDLE || ownPackage.version !== '0.1.0-beta.1') {
    throw new Error('unexpected-bundle-identity-or-version')
  }
  const current = manifest.dsh?.profile?.bundles
  if (!Array.isArray(current)) throw new Error('profile-bundle-list-missing')
  if (!current.includes(BUNDLE)) current.push(BUNDLE)
  manifest.dsh.profile.bundles = current
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
  // This is the only write to a Cordis config file. Fresh test profile only.
  const patchFile = join(profileDir, 'cordis.patch.yml')
  writeFileSync(patchFile,
    '- id: dsh-suite-delta\n  config:\n    standalonePoc: true\n',
    { mode: 0o600 })
}

async function main() {
  let options
  try { options = parseArgs(process.argv.slice(2)) } catch {
    console.error('Invalid option. Run with --help.')
    process.exitCode = 2
    return
  }
  if (options.isHelp) { console.log(usage()); return }
  if (options.isDryRun) {
    console.log(usage())
    console.log('Dry run: no files, downloads, or Host processes were created.')
    return
  }

  // Never use the caller's existing profile/home or accept a path from input.
  const home = mkdtempSync(join(tmpdir(), 'delta-poc-dsh-home-'))
  const profileDir = join(home, 'profiles', PROFILE)
  const environment = { ...process.env, DSH_HOME: home }
  let child
  let isChildStopped = true
  const stopChild = () => {
    if (!child || isChildStopped) return
    if (process.platform === 'win32' && typeof child.pid === 'number') {
      // Windows shell mode launches cmd.exe; killing only that shell can leave
      // the real Harness process alive against a deleted temporary DSH_HOME.
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } else {
      child.kill('SIGINT')
    }
  }
  try {
    console.log('Preparing a disposable Delta Suite P0 Host.')
    console.log('Installation remains inside a temporary home.')
    runDsh(['--profile', PROFILE, '--from-default-profile', 'web', '--dump-config'], environment)
    runDsh(['plugin', '--profile', PROFILE, 'add', RELEASE_URL], environment)
    addBundle(profileDir)
    console.log('Starting the isolated Harness Web UI.')
    console.log('P0 route: /dsh-ui-delta/poc (same authenticated browser and origin).')
    child = spawn(dshCommand(), ['--profile', PROFILE, '--port', String(options.port)], {
      stdio: 'inherit',
      env: environment,
      shell: process.platform === 'win32',
    })
    isChildStopped = false
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (exitCode, signal) => {
        resolve(signal ? 0 : (exitCode ?? 1))
      })
      const interrupt = () => {
        stopChild()
      }
      process.once('SIGINT', interrupt)
      process.once('SIGTERM', interrupt)
    })
    isChildStopped = true
    if (code !== 0) process.exitCode = code
  } catch (error) {
    console.error('Isolated Host could not start: ' + (error instanceof Error ? error.message : 'unknown-error'))
    process.exitCode = 1
  } finally {
    if (!isChildStopped && child) stopChild()
    // No user-controlled path or existing DSH_HOME is ever removed.
    rmSync(home, { recursive: true, force: true })
    console.log('Disposable P0 home cleaned up.')
  }
}

await main()
