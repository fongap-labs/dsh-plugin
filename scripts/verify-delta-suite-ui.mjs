#!/usr/bin/env node
// Read-only smoke checks against a running DSH instance. No folder mutations.
import assert from 'node:assert/strict'
import { mkdirSync, chmodSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import process from 'node:process'
import { contrastRatio } from './lib/wcag-contrast.mjs'

const usage = [
  'Usage: node scripts/verify-delta-suite-ui.mjs --url http://127.0.0.1:PORT --theme light|dark [options]',
  'Options:',
  '  --chromium /path/to/chromium   Chromium executable (optional if Playwright installed browsers)',
  '  --cdp http://127.0.0.1:9222   Attach to a local DSH/Chromium debugging port',
  '  --output /private/path        Save local screenshots and a redacted JSON report',
  '  --baseline /private/path      Compare screenshots to a local, read-only baseline directory',
  '  --max-diff-pct 0.5           Maximum percentage of pixels different (requires --baseline)',
  '  --pixel-tolerance 16        Per-channel RGB tolerance, from 0 through 255',
  '  --require-sessions          Fail if no disposable sessions expose keyboard selectors',
  '  --accessibility              Check semantic color contrast and reduced motion',
  'Baselines are never updated automatically. Use only anonymized test sessions.',
  '  --help                        Show this message',
  'Install the optional local runner: npm install --no-save playwright-core',
  'Use only a disposable, locally accessible DSH test profile. Never commit screenshots.',
].join('\n')

function parseArgs(args) {
  const flags = new Set(['--url', '--theme', '--chromium', '--cdp', '--output', '--baseline', '--max-diff-pct', '--pixel-tolerance'])
  const switches = new Set(['--require-sessions', '--accessibility'])
  const values = Object.create(null)
  for (let index = 0; index < args.length; index++) {
    const key = args[index]
    if (key === '--help') return { help: true }
    if (switches.has(key)) {
      if (values[key] !== undefined) throw new Error('Duplicate option: ' + key)
      values[key] = true
      continue
    }
    if (!flags.has(key)) throw new Error('Unknown option: ' + key)
    if (values[key] !== undefined) throw new Error('Duplicate option: ' + key)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error('Missing value: ' + key)
    values[key] = value
  }
  if (!values['--url'] || !['light', 'dark'].includes(values['--theme'])) {
    throw new Error('--url and --theme light|dark are required')
  }
  if ((values['--max-diff-pct'] || values['--pixel-tolerance']) && !values['--baseline']) {
    throw new Error('--baseline required when setting comparison thresholds')
  }
  const percent = Number(values['--max-diff-pct'] ?? '0.5')
  const tolerance = Number(values['--pixel-tolerance'] ?? '16')
  if (!Number.isFinite(percent) || percent < 0 || percent > 100 ||
      !Number.isInteger(tolerance) || tolerance < 0 || tolerance > 255) {
    throw new Error('Invalid visual regression threshold')
  }
  return { ...values, maxDiffPct: percent, pixelTolerance: tolerance }
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
  if (/no disposable sessions/i.test(value)) return 'Disposable sessions required for full keyboard acceptance'
  if (/folder panel/i.test(value)) return 'Folder panel unavailable in Host UI'
  if (/horizontal overflow/i.test(value)) return 'Folder panel horizontal overflow'
  if (/folder API/i.test(value)) return 'Local folder API unavailable'
  if (/baseline|visual difference|screenshot dimensions/i.test(value)) return 'Local visual baseline regression'
  return 'UI smoke check failed; inspect local console'
}


async function panelMotionProbe(page) {
  return page.locator('.ens-folder-browser-header .ens-ui-button').first().evaluate(element => {
    const style = getComputedStyle(element)
    const toMilliseconds = value => {
      const duration = value.split(',')[0].trim()
      if (duration.endsWith('ms')) return Number.parseFloat(duration)
      if (duration.endsWith('s')) return Number.parseFloat(duration) * 1000
      return Number.POSITIVE_INFINITY
    }
    return {
      transitionDurationMs: toMilliseconds(style.transitionDuration),
      animationDurationMs: toMilliseconds(style.animationDuration),
      animationName: style.animationName,
    }
  })
}

async function createPixelComparator() {
  let PNG
  try { ({ PNG } = await import('pngjs')) }
  catch { throw new Error('Visual baseline comparison requires local pngjs') }
  return (currentBuffer, baselineFile, maxDiffPct, pixelTolerance) => {
    // Decode locally in Node, never expose the baseline to Host page JavaScript.
    const current = PNG.sync.read(currentBuffer)
    const baseline = PNG.sync.read(readFileSync(baselineFile))
    assert.equal(current.width, baseline.width, 'Screenshot dimensions differ from baseline')
    assert.equal(current.height, baseline.height, 'Screenshot dimensions differ from baseline')
    const pixels = current.width * current.height
    let different = 0
    for (let i = 0; i < pixels * 4; i += 4) {
      const r = Math.abs(current.data[i] - baseline.data[i])
      const g = Math.abs(current.data[i + 1] - baseline.data[i + 1])
      const b = Math.abs(current.data[i + 2] - baseline.data[i + 2])
      if (Math.max(r, g, b) > pixelTolerance) different++
    }
    const diffPct = (different / pixels) * 100
    assert.ok(diffPct <= maxDiffPct, 'Visual difference exceeds baseline threshold')
    return diffPct
  }
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
  const baseline = args['--baseline'] ? resolve(args['--baseline']) : null
  const comparePixels = baseline ? await createPixelComparator() : null
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

    if (args['--accessibility']) {
      const tokens = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement)
        const names = [
          '--ens-color-primary', '--ens-color-primary-foreground',
          '--ens-color-foreground', '--ens-color-background',
          '--ens-color-muted-foreground', '--ens-color-accent',
          '--ens-color-accent-foreground', '--ens-color-destructive',
          '--ens-color-destructive-foreground', '--ens-color-ring',
        ]
        return Object.fromEntries(names.map(name => [name, style.getPropertyValue(name).trim()]))
      })
      const checks = [
        ['primary', tokens['--ens-color-primary-foreground'], tokens['--ens-color-primary'], 4.5],
        ['body', tokens['--ens-color-foreground'], tokens['--ens-color-background'], 4.5],
        ['muted', tokens['--ens-color-muted-foreground'], tokens['--ens-color-background'], 4.5],
        ['accent', tokens['--ens-color-accent-foreground'], tokens['--ens-color-accent'], 4.5],
        ['destructive', tokens['--ens-color-destructive-foreground'], tokens['--ens-color-destructive'], 4.5],
        ['focus-ring', tokens['--ens-color-ring'], tokens['--ens-color-background'], 3],
      ]
      const ratios = checks.map(([name, foreground, background, minimum]) => {
        const ratio = contrastRatio(foreground, background)
        assert.ok(ratio >= minimum,
          name + ' contrast is below ' + minimum + ':1 (actual ' + ratio.toFixed(2) + ':1)')
        return name + '=' + ratio.toFixed(2) + ':1'
      })
      record('wcag-semantic-contrast', 'PASS', ratios.join(', '))

    }

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

    if (args['--accessibility']) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const motion = await panelMotionProbe(page)
      assert.ok(motion.transitionDurationMs <= 0.01,
        'Reduced-motion transition duration must not exceed 0.01ms')
      assert.ok(motion.animationName === 'none' || motion.animationDurationMs <= 0.01,
        'Reduced-motion animation must be disabled or near-instant')
      record('reduced-motion', 'PASS')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }

    const groupCount = await panel.locator('.ens-folder-browser-group').count()
    assert.equal(groupCount, folderData.folders.length + 1, 'Folder API and browser groups disagree')
    record('folder-count-and-unfiled', 'PASS')

    const groupToggle = panel.locator('.ens-folder-browser-group-head').first()
    const before = await groupToggle.getAttribute('aria-expanded')
    assert.ok(before === 'true' || before === 'false', 'Folder group must expose aria-expanded')
    const controlledId = await groupToggle.getAttribute('aria-controls')
    assert.ok(controlledId && /^delta-folder-items-[a-z0-9-]+$/.test(controlledId),
      'Folder disclosure must reference a stable content region')
    const groupContent = groupToggle.locator('..').locator('.ens-folder-browser-items').first()
    assert.equal(await groupContent.getAttribute('id'), controlledId,
      'Disclosure control and content region must have matching IDs')
    assert.equal(await groupContent.isVisible(), before === 'true',
      'Expanded state must agree with controlled content visibility')
    record('folder-disclosure-semantics', 'PASS')
    await groupToggle.focus()
    assert.ok(await groupToggle.evaluate(el => document.activeElement === el),
      'Folder disclosure must be keyboard focusable')
    await groupToggle.press('Space')
    assert.notEqual(await groupToggle.getAttribute('aria-expanded'), before, 'Space must toggle folder group')
    assert.equal(await groupContent.isVisible(), before !== 'true',
      'Collapsed content must be hidden from focus and layout')
    await groupToggle.press('Space')
    assert.equal(await groupToggle.getAttribute('aria-expanded'), before, 'Second Space must restore state')
    assert.equal(await groupContent.isVisible(), before === 'true',
      'Second Space must restore controlled content visibility')
    record('keyboard-collapse-and-restore', 'PASS')

    const selects = panel.locator('.ens-folder-browser-select')
    const selectCount = await selects.count()
    if (selectCount === 0) {
      if (args['--require-sessions']) {
        throw new Error('Folder panel has no disposable sessions for keyboard acceptance')
      }
      record('keyboard-folder-select', 'SKIP', 'No disposable sessions')
    } else {
      // Verify a bounded sample without changing any Session folder assignments.
      for (let index = 0; index < Math.min(selectCount, 5); index++) {
        const select = selects.nth(index)
        assert.ok(await select.isEnabled(), 'Folder selector must be enabled')
        const row = select.locator('..')
        const sessionTitle = (await row.locator('.ens-folder-browser-open').textContent() || '').trim()
        const label = await select.getAttribute('aria-label') || ''
        assert.ok(sessionTitle && label.endsWith(': ' + sessionTitle),
          'Folder selector accessible name must identify its Session')
        await select.focus()
        assert.ok(await select.evaluate(el => document.activeElement === el),
          'Folder selector must accept keyboard focus')
      }
      record('keyboard-folder-select', 'PASS')
      record('session-specific-accessible-names', 'PASS')
    }

    const viewports = [
      [1440, 900], [960, 768], [720, 900], [480, 800], [360, 800], [320, 720],
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
      if (output || baseline) {
        const name = args['--theme'] + '-' + width + '.png'
        const path = output ? join(output, name) : undefined
        const pixels = await page.screenshot({ ...(path ? { path } : {}), fullPage: false, animations: 'disabled' })
        if (path) {
          chmodSync(path, 0o600)
          results.screenshots = true
        }
        if (baseline) {
          const difference = comparePixels(pixels, join(baseline, name), args.maxDiffPct, args.pixelTolerance)
          record('visual-baseline-' + width, 'PASS', difference.toFixed(3) + '% pixels changed')
        }
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
