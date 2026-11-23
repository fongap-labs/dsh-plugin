import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const client = read('packages/delta-suite/src/client.ts')

test('Delta Suite does not rewrite Harness Slots internals or built-in contributions', () => {
  for (const forbidden of [
    /__deltaWrapped_/, /slotsObj\??\._core/, /slotsObj\??\._host/,
    /target\[methodName\]\s*=/, /wrapSlotMethod\(/,
    /filterSlotEntries\(/, /\bslotRestorers\b/,
  ]) assert.doesNotMatch(client, forbidden)
  assert.match(client, /scope\.slots\.inject\('settings\.section'/)
  assert.match(client, /scope\.slots\.inject\('conversation\.chat\.assistant-actions'/)
})

test('Delta Suite does not mutate Cordis originals or the Host locale service', () => {
  for (const forbidden of [
    /cordis\.original/, /unwrapCordisOriginal/, /__deltaLocaleAttached/,
    /__deltaTranslatePatched/, /__deltaPatched/, /__deltaLocaleHooked/,
    /localeRuntime\.(?:translate|register)\s*=/,
    /rawSlots\.installLocale\s*=/,
    /\brestoreLocaleOnDispose\b/,
  ]) assert.doesNotMatch(client, forbidden)
  assert.match(client, /DICTIONARIES\[language\(\)\]/)
  assert.match(client, /stopAppearance\(\)/)
  assert.match(client, /controller\.dispose\(\)/)
})

test('clean-up still keeps native appearance and unrelated UI resource ownership', () => {
  assert.match(client, /observer\?\.disconnect\(\)/)
  assert.match(client, /stopPrivacyGuards\(\)/)
  assert.doesNotMatch(client, /installClientVisionBridge|stopVisionBridge|data-composer-input/)
  assert.match(client, /tag\.parentNode\?\.removeChild\(tag\)/)
  // Legacy DOM compatibility is intentionally separate and must be migrated later.
  assert.match(client, /function installSidebarCompatibility/)
})
