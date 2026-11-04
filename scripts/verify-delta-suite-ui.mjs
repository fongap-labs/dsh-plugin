#!/usr/bin/env node
// Read-only smoke checks against a running DSH instance. No folder mutations.
import assert from 'node:assert/strict'
import { mkdirSync, chmodSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import process from 'node:process'

const usage = [
  'Usage: node scripts/verify-delta-suite-ui.mjs --url http://127.0.0.1:PORT --theme light|dark [options]',
  'Options:',
  '  --chromium /path/to/chromium   Chromium executable (optional if Playwright installed browsers)',
  '  --cdp http://127.0.0.1:9222   Attach to a local DSH/Chromium debugging port',
  '  --output /private/path        Save local screenshots and a redacted JSON report',
  '  --help                        Show this message',
  'Install the optional local runner: npm install --no-save playwright-core',
  'Use only a disposable, locally accessible DSH test profile. Never commit screenshots.',
].join('\n')

function parseArgs(args) {
  const flags = new Set(['--url', '--theme', '--chromium', '--cdp', '--output'])
  const values = Object.create(null)
  for (let index = 0; index < args.length; index++) {
    const key = args[index]
    if (key === '--help') return { help: true }
    if (!flags.has(key)) throw new Error('Unknown option: ' + key)
    if (values[key] !== undefined) throw new Error('Duplicate option: ' + key)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error('Missing value: ' + key)
    values[key] = value
  }
  if (!values['--url'] || !['light', 'dark'].includes(values['--theme'])) {
    throw new Error('--url and --theme light|dark are required')
  }
  return values
}

function loopbackUrl(value, description) {
  let url
  try { url = new URL(value) } catch { throw new Error(description + ' must be a URL') }
  if (!['http:', 'https:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error(description + ' must use a plain loopback HTTP(S) address without credentials or query')
  }
  return url
}

function colorHex(cssColor) {
  const value = cssColor.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(value)) return value
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[\s,/]+1(?:\.0*)?)?\s*\)$/.exec(value)
  if (rgb) return '#' + rgb.slice(1, 4).map(x => Number(x).toString(16).padStart(2, '0')).join('')
  return value
}

function checkColors(expected, reported) {
  assert.equal(colorHex(reported), expected, 'Host brand token does not match expected theme; set theme in DSH')
}

function safeError(error) {
  // Do not write browser URLs, session titles, network payloads or credentials.
  const value = error instanceof Error ? error.message : String(error)
  if (/Host brand token/.test(value)) return 'Theme mismatch or theme token missing'
  if (/folder panel/i.test(value)) return 'Folder panel unavailable in Host UI'
  if (/horizontal overflow/i.test(value)) return 'Folder panel horizontal overflow'
  if (/folder API/i.test(value)) return 'Local folder API unavailable'
  return 'UI smoke check failed; inspect local console'
}

async function main() {
  let args
  try { args = parseArgs(process.argv.slice(2)) }
  catch (error) { console.error(error.message + '\n' + usage); process.exitCode = 2; return }
  if (args.help) { console.log(usage); return }
  let target, cdp
  try {
    target = loopbackUrl(args['--url'], '--url')
    if (args['--cdp']) cdp = loopbackUrl(args['--cdp'], '--cdp')
  } catch (error) { console.error(error.message); process.exitCode = 2; return }
  let chromium
  try { ({ chromium } = await import('playwright-core')) }
  catch {
    console.error('playwright-core is not installed. Install locally with npm install --no-save playwright-core')
    process.exitCode = 2
    return
  }

  const output = args['--output'] ? resolve(args['--output']) : null
  if (output) mkdirSync(output, { recursive: true, mode: 0o700 })
  const results = { theme: args['--theme'], cases: [], screenshots: false, host: 'local-only' }
  const record = (name, status, detail = '') => {
    results.cases.push({ name, status, ...(detail ? { detail } : {}) })
    console.log(status + ' ' + name + (detail ? ' (' + detail + ')' : ''))
  }
  const browser = cdp
    ? await chromium.connectOverCDP(cdp.origin)
    : await chromium.launch({
      headless: true,
      ...(args['--chromium'] ? { executablePath: args['--chromium'] } : {}),
    })
  let context
  let page
  try {
    context = cdp
      ? browser.contexts()[0]
      : await browser.newContext({ colorScheme: args['--theme'], viewport: { width: 1440, height: 900 } })
    if (!context) throw new Error('No browser context available')
    page = cdp
      ? context.pages().find(item => item.url().startsWith(target.origin)) || await context.newPage()
      : await context.newPage()
    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 20000 })
    if (new URL(page.url()).origin !== target.origin) throw new Error('Host page redirected away from local origin')
    await page.waitForFunction(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ens-color-primary').trim().length > 0,
      undefined, { timeout: 15000 })

    const expected = args['--theme'] === 'light' ? '#286f78' : '#60b4bf'
    const brand = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ens-color-primary'))
    checkColors(expected, brand)
    record('brand-tokens', 'PASS')

    const endpoint = new URL('/dsh-ui-delta/folders', target.origin)
    const response = await context.request.get(endpoint.href, { timeout: 12000, maxRedirects: 0 })
    assert.equal(response.status(), 200, 'Folder API must return HTTP 200')
    const folderData = await response.json()
    assert.ok(Array.isArray(folderData.folders), 'Invalid folder API response')
    assert.ok(folderData.assignments && typeof folderData.assignments === 'object', 'Invalid folder assignments')
    record('folder-api-readonly', 'PASS')

    const panel = page.locator('.ens-folder-browser').first()
    if (!(await panel.isVisible())) {
      const selectors = [
        '[title="会话文件夹"]', '[title="Session folders"]',
        '[aria-label="会话文件夹"]', '[aria-label="Session folders"]',
      ]
      for (const selector of selectors) {
        const launcher = page.locator(selector).first()
        if (await launcher.count() > 0 && await launcher.isVisible()) {
          await launcher.click()
          if (await panel.isVisible()) break
        }
      }
    }
    if (!(await panel.isVisible())) {
      throw new Error('Folder panel unavailable in Host UI')
    }
    record('native-folder-panel', 'PASS')

    const groupCount = await panel.locator('.ens-folder-browser-group').count()
    assert.equal(groupCount, folderData.folders.length + 1, 'Folder API and browser groups disagree')
    record('folder-count-and-unfiled', 'PASS')

    const groupToggle = panel.locator('.ens-folder-browser-group-head').first()
    const before = await groupToggle.getAttribute('aria-expanded')
    assert.ok(before === 'true' || before === 'false', 'Folder group must expose aria-expanded')
    await groupToggle.focus()
    await groupToggle.press('Space')
    assert.notEqual(await groupToggle.getAttribute('aria-expanded'), before, 'Space must toggle folder group')
    await groupToggle.press('Space')
    assert.equal(await groupToggle.getAttribute('aria-expanded'), before, 'Second Space must restore state')
    record('keyboard-collapse-and-restore', 'PASS')

    const selectCount = await panel.locator('.ens-folder-browser-select').count()
    if (selectCount === 0) record('keyboard-folder-select', 'SKIP', 'No test sessions')
    else {
      assert.ok(await panel.locator('.ens-folder-browser-select').first().isEnabled())
      record('keyboard-folder-select', 'PASS')
    }

    const viewports = [
      [1440, 900], [960, 768], [720, 900], [480, 800],
    ]
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(120)
      const measurement = await panel.evaluate(el => ({
        content: el.scrollWidth, width: el.clientWidth, document: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }))
      assert.ok(measurement.content <= measurement.width + 2,
        'Folder panel horizontal overflow')
      assert.ok(measurement.document <= measurement.viewport + 2,
        'Folder panel horizontal overflow')
      record('responsive-' + width, 'PASS')
      if (output) {
        const path = join(output, args['--theme'] + '-' + width + '.png')
        await page.screenshot({ path, fullPage: false, animations: 'disabled' })
        chmodSync(path, 0o600)
        results.screenshots = true
      }
    }
  } catch (error) {
    record('host-acceptance', 'FAIL', safeError(error))
    process.exitCode = 1
  } finally {
    if (output) {
      const file = join(output, 'summary.json')
      writeFileSync(file, JSON.stringify(results, null, 2) + '\n', { mode: 0o600 })
      chmodSync(file, 0o600)
    }
    await browser.close()
  }
}

await main()
