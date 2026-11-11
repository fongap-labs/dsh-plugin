#!/usr/bin/env node
/**
 * Actual DSH CLI preflight (not a replacement for H01-H10 interactive evidence).
 * All writes go to an automatically removed DSH_HOME and disposable workspace.
 * No model, GitHub or user-profile credentials are requested or passed through.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function parseArgs(argv) {
  const options = { dsh: 'dsh', pluginDir: resolve(import.meta.dirname, '../packages/dsh-delta-code'), profile: 'sdk', bootMs: 3500 }
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    if (!['--dsh', '--plugin-dir', '--profile', '--boot-ms'].includes(flag) || !argv[index + 1]) {
      throw new Error('expected --dsh PATH, --plugin-dir PATH, --profile sdk|sdk-minimal or --boot-ms INTEGER')
    }
    const value = argv[++index]
    if (flag === '--dsh') options.dsh = value
    if (flag === '--plugin-dir') options.pluginDir = resolve(value)
    if (flag === '--profile') {
      if (value !== 'sdk' && value !== 'sdk-minimal') throw new Error('--profile must be sdk or sdk-minimal')
      options.profile = value
    }
    if (flag === '--boot-ms') {
      const number = Number(value)
      if (!Number.isInteger(number) || number < 250 || number > 30000) {
        throw new Error('--boot-ms must be an integer between 250 and 30000')
      }
      options.bootMs = number
    }
  }
  return options
}

function cliCommand(binary) {
  // Running a JS bin through Node also supports Windows, where npm exposes .cmd shims.
  return /\.(?:mjs|cjs|js)$/i.test(binary)
    ? { binary: process.execPath, prefix: [binary] }
    : { binary, prefix: [] }
}

function isolatedEnv(home) {
  // Never forward tokens or model-provider credentials into a disposable smoke run.
  const names = ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR']
  const env = Object.fromEntries(names.filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]))
  return { ...env, DSH_HOME: home, CI: 'true', NO_COLOR: '1' }
}

function invoke(bin, args, options, timeoutMs = 90000) {
  return new Promise((resolveResult, rejectResult) => {
    let done = false
    let captured = ''
    const child = spawn(bin, args, { cwd: options.cwd, env: options.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const finish = (error, code) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (error) rejectResult(error)
      else if (code !== 0) rejectResult(new Error('CLI returned nonzero exit code ' + code))
      else resolveResult(captured)
    }
    child.stdout.on('data', chunk => {
      captured += chunk.toString('utf8')
      if (captured.length > 512 * 1024) {
        child.kill()
        finish(new Error('CLI output exceeded safe capture limit'))
      }
    })
    child.stderr.on('data', () => {}) // Never echo potentially private diagnostic content.
    child.on('error', error => finish(new Error('CLI execution failed: ' + (error.code ?? 'UNKNOWN'))))
    child.on('close', code => finish(undefined, code))
    const timer = setTimeout(() => {
      child.kill()
      finish(new Error('CLI step timed out'))
    }, timeoutMs)
  })
}

function bootProfile(bin, prefix, options, bootMs, profile) {
  return new Promise((resolveResult, rejectResult) => {
    let completed = false
    let observedAlive = false
    let exitedEarly = false
    let terminationRequested = false
    let closeDeadline
    const child = spawn(bin, [...prefix, '--profile', profile], {
      cwd: options.cwd, env: options.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    })
    child.stdout.on('data', () => {})
    child.stderr.on('data', () => {})
    const finish = (error) => {
      if (completed) return
      completed = true
      clearTimeout(timer)
      clearTimeout(closeDeadline)
      if (error) rejectResult(error)
      else resolveResult()
    }
    // On Windows, kill() requests termination but does not guarantee the child
    // has released its cwd. The caller must wait for 'close' before rm(scratch).
    child.on('error', error => finish(new Error('Host startup failed: ' + (error.code ?? 'UNKNOWN'))))
    child.on('exit', () => {
      if (!observedAlive) exitedEarly = true
    })
    child.on('close', code => {
      if (exitedEarly || !observedAlive) {
        finish(new Error('Host exited before boot observation window: ' + code))
      } else if (!terminationRequested) {
        finish(new Error('Host termination was not requested'))
      } else {
        finish()
      }
    })
    const timer = setTimeout(() => {
      if (completed || exitedEarly) return
      observedAlive = true
      terminationRequested = child.kill()
      if (!terminationRequested) {
        // Preserve a failed verdict even if the process closes concurrently.
        finish(new Error('Host termination request failed'))
        return
      }
      closeDeadline = setTimeout(() => {
        finish(new Error('Host did not close after termination'))
      }, 15000)
    }, bootMs)
  })
}

export async function preflight(options) {
  const profile = options.profile ?? 'sdk'
  if (profile !== 'sdk' && profile !== 'sdk-minimal') throw new Error('profile must be sdk or sdk-minimal')
  const report = {
    profile,
    kind: 'dsh-code-worker-host-preflight',
    nativeProfileProcessObserved: false, // Process liveness is not a Host tool acceptance result.
    h01Complete: false, // Tool invocation must be verified separately inside a session.
    h02ToH10Complete: false,
    stages: [],
    status: 'blocked',
    reason: null,
  }
  const scratch = await mkdtemp(join(tmpdir(), 'dsh-code-host-'))
  const home = join(scratch, 'home')
  const cwd = join(scratch, 'workspace')
  let stage = 'validate-plugin'
  try {
    await mkdir(home)
    await mkdir(cwd)
    const metadata = JSON.parse(await readFile(join(options.pluginDir, 'package.json'), 'utf8'))
    const built = await stat(join(options.pluginDir, 'lib', 'index.js'))
    if (metadata.name !== '@fongap-labs/dsh-delta-code' || !built.isFile()) {
      throw new Error('plugin must be built before real Host preflight')
    }
    report.stages.push('plugin-build-present')
    const runtime = { cwd, env: isolatedEnv(home) }
    const cli = cliCommand(options.dsh)
    stage = 'version'
    const version = await invoke(cli.binary, [...cli.prefix, '--version'], runtime, 15000)
    if (!/\d+\.\d+\.\d+/.test(version)) throw new Error('DSH CLI version not reported')
    report.dshVersion = version.trim().slice(0, 120)
    report.stages.push('dsh-version')
    stage = 'initialize-profile'
    await invoke(cli.binary, [...cli.prefix, '--profile', profile, '--dump-default-config'], runtime)
    report.stages.push('isolated-profile-initialized')
    stage = 'install-plugin'
    await invoke(cli.binary, [...cli.prefix, 'plugin', '--profile', profile, 'add', 'link:' + options.pluginDir], runtime)
    report.stages.push('plugin-linked-in-isolated-profile')
    stage = 'inspect-composition'
    const composition = await invoke(cli.binary, [...cli.prefix, '--profile', profile, '--dump-config'], runtime)
    if (!composition.includes('dsh-delta-code')) throw new Error('plugin absent from effective Host profile composition')
    report.stages.push('effective-profile-includes-plugin')
    stage = 'boot-native-host'
    await bootProfile(cli.binary, cli.prefix, runtime, options.bootMs, profile)
    report.stages.push('native-' + profile + '-process-alive')
    report.nativeProfileProcessObserved = true
    report.status = 'preflight-pass'
    return report
  } catch (error) {
    report.reason = stage + ': ' + (error instanceof Error ? error.message : 'unknown failure')
    return report
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await preflight(parseArgs(process.argv.slice(2)))
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    if (result.status !== 'preflight-pass') process.exitCode = 1
  } catch (error) {
    process.stdout.write(JSON.stringify({ kind: 'dsh-code-worker-host-preflight', status: 'blocked', reason: error.message }) + '\n')
    process.exitCode = 1
  }
}
