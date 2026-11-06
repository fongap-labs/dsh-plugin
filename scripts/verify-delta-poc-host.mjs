#!/usr/bin/env node
/**
 * Opt-in acceptance against a disposable, already-authenticated local Harness.
 * This script does not launch Harness, install plugins or acquire credentials.
 * Existing CDP browser context supplies official cookie admission.
 */
import assert from 'node:assert/strict'
import { writeFileSync, chmodSync } from 'node:fs'

const usage = [
  'Usage: node scripts/verify-delta-poc-host.mjs --url http://127.0.0.1:3080 --cdp http://127.0.0.1:9222 [--session SESSION_ID] [--output private.json]',
  'Optional: --create-session to create an empty disposable Host session.',
  'Optional: --send-text MESSAGE (requires --allow-agent and --create-session).',
  'Read-only by default. Requires an already running local Harness with standalonePoc: true.',
  'Open the official launch URL in the CDP browser first, so Harness issues its own signed Cookie.',
  'Requires locally installed playwright-core. No tokens, cookies, session content or IDs are logged.',
].join('\n')

function parse(args) {
  if (args.includes('--help')) return { help: true }
  const flags = new Set(['--url', '--cdp', '--session', '--output', '--send-text'])
  const switches = new Set(['--create-session', '--allow-agent'])
  const options = Object.create(null)
  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    if (!flags.has(key) && !switches.has(key)) throw Error('Unknown option: ' + key)
    if (Object.hasOwn(options, key)) throw Error('Duplicate option: ' + key)
    if (switches.has(key)) { options[key] = true; continue }
    const value = args[++i]
    if (!value || value.startsWith('--')) throw Error('Missing value: ' + key)
    options[key] = value
  }
  if (!options['--url'] || !options['--cdp']) throw Error('--url and --cdp are required')
  if (options['--send-text'] && (!options['--allow-agent'] || !options['--create-session'])) {
    throw Error('--send-text requires both --allow-agent and --create-session')
  }
  if (options['--session'] && options['--create-session']) throw Error('Choose either --session or --create-session')
  if (options['--session'] && !/^[A-Za-z0-9._:-]{1,150}$/.test(options['--session'])) {
    throw Error('Invalid test session identifier')
  }
  if (options['--send-text'] && options['--send-text'].length > 160) throw Error('Test message is too long')
  return options
}

function localUrl(value, name) {
  let url
  try { url = new URL(value) } catch { throw Error(name + ' must be a URL') }
  if (!['http:', 'https:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw Error(name + ' requires a plain loopback HTTP(S) origin without credentials, path or query')
  }
  return url
}

function label(error) {
  const message = error instanceof Error ? error.message : String(error)
  if (/browser|playwright/i.test(message)) return 'Local browser is unavailable'
  if (/cookie|unauth|401|403|authentication/i.test(message)) return 'Harness browser authentication did not pass'
  if (/Session|session|snapshot/i.test(message)) return 'Session stream acceptance did not pass'
  if (/Gateway|WebSocket|socket/i.test(message)) return 'Gateway event stream acceptance did not pass'
  return 'Host acceptance failed; inspect private local browser diagnostics'
}

async function main() {
  let args, host, cdp
  try {
    args = parse(process.argv.slice(2))
    if (args.help) { console.log(usage); return }
    host = localUrl(args['--url'], '--url')
    cdp = localUrl(args['--cdp'], '--cdp')
  } catch (error) {
    console.error(label(error) + '\n' + usage)
    process.exitCode = 2
    return
  }
  let chromium
  try { ({ chromium } = await import('playwright-core')) }
  catch {
    console.error('playwright-core is required for local acceptance')
    process.exitCode = 2
    return
  }

  const report = { schemaVersion: 1, source: 'local-disposable-harness', cases: [] }
  const record = (name, status) => {
    report.cases.push({ name, status })
    console.log(status + ' ' + name)
  }
  let browser
  let page
  let createdSession = false
  try {
    browser = await chromium.connectOverCDP(cdp.origin)
    const context = browser.contexts()[0]
    assert.ok(context, 'CDP browser context not available')
    page = await context.newPage()
    const target = new URL('/dsh-ui-delta/poc', host)
    if (args['--session']) target.searchParams.set('session', args['--session'])
    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 15000 })
    assert.equal(new URL(page.url()).origin, host.origin, 'Host navigation redirected off loopback origin')
    assert.equal(new URL(page.url()).pathname, '/dsh-ui-delta/poc', 'Probe was not served')
    assert.ok(await page.locator('#auth').count() === 1, 'Probe did not render')
    record('independent-document', 'PASS')

    await page.waitForFunction(() => document.querySelector('#auth')?.dataset.state !== 'pending', null, { timeout: 15000 })
    assert.equal(await page.locator('#auth').getAttribute('data-state'), 'pass', 'Authenticated status endpoint unavailable')
    record('signed-cookie-admission', 'PASS')

    await page.waitForFunction(() => document.querySelector('#socket')?.dataset.state === 'pass' ||
      document.querySelector('#socket')?.dataset.state === 'fail', null, { timeout: 15000 })
    assert.equal(await page.locator('#socket').getAttribute('data-state'), 'pass', 'Gateway events not ready')
    record('gateway-events-ready', 'PASS')

    await page.waitForFunction(() => document.querySelector('#gateway')?.dataset.state !== 'pending', null, { timeout: 15000 })
    assert.equal(await page.locator('#gateway').getAttribute('data-state'), 'pass', 'Session list RPC failed')
    record('session-list-rpc', 'PASS')

    if (args['--create-session']) {
      await page.locator('#create').click()
      await page.waitForFunction(() => document.querySelector('#current')?.dataset.state === 'pass', null, { timeout: 15000 })
      createdSession = true
      record('create-disposable-session', 'PASS')
    }
    if (args['--session'] || createdSession) {
      await page.waitForFunction(() => ['pass', 'fail'].includes(
        document.querySelector('#snapshot')?.dataset.state), null, { timeout: 20000 })
      assert.equal(await page.locator('#snapshot').getAttribute('data-state'), 'pass',
        'Session snapshot not received from Host')
      record('session-follow-snapshot', 'PASS')
      const baseline = await page.evaluate(() => ({
        current: document.querySelector('#current')?.dataset.state,
        history: new URL(location.href).searchParams.has('session'),
      }))
      assert.equal(baseline.current, 'pass', 'Session was not selected')
      assert.equal(baseline.history, true, 'Session identifier was not retained in navigation URL')
      record('session-select', 'PASS')

      if (args['--send-text']) {
        await page.locator('#message').fill(args['--send-text'])
        await page.locator('#send').click()
        await page.waitForFunction(() => document.querySelector('#message')?.value === '' ||
          document.querySelector('#diagnostic')?.textContent.includes('failed'), null, { timeout: 15000 })
        assert.equal(await page.locator('#message').inputValue(), '', 'Prompt was not accepted')
        record('explicit-prompt-accepted', 'PASS')
      }

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => document.querySelector('#socket')?.dataset.state === 'pass' &&
        document.querySelector('#current')?.dataset.state === 'pass' &&
        document.querySelector('#snapshot')?.dataset.state === 'pass', null, { timeout: 20000 })
      assert.equal(await page.locator('#socket').getAttribute('data-state'), 'pass')
      assert.equal(await page.locator('#snapshot').getAttribute('data-state'), 'pass')
      record('reload-reconnect-snapshot', 'PASS')
    } else {
      record('session-select', 'SKIP')
      record('session-follow-snapshot', 'SKIP')
      record('reload-reconnect-snapshot', 'SKIP')
    }
    // Tool approval is intentionally not triggered automatically. It requires
    // a policy-controlled, non-destructive tool event and a human decision.
    record('tool-approval', 'SKIP')
  } catch (error) {
    record('real-host-acceptance', 'FAIL')
    console.error(label(error))
    process.exitCode = 1
  } finally {
    await page?.close().catch(() => {})
    await browser?.close().catch(() => {})
    if (args['--output']) {
      const file = args['--output']
      writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
      chmodSync(file, 0o600)
    }
  }
}

await main()
