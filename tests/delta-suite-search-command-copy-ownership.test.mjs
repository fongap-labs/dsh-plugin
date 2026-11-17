import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-desktop-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-desktop/src/client.ts')
const normalized = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-desktop/src/theme.css')
const searchStart = normalized.indexOf('function installHostSearch(')
const searchEnd = normalized.indexOf('\nwindow.__ModuleLoader__.load(', searchStart)
const search = searchStart >= 0 && searchEnd > searchStart
  ? normalized.slice(searchStart, searchEnd) : ''
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'data-delta-compat dtd-native-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('Search Palette never queries or mutates the Host composer/editor DOM', () => {
  assert.ok(search.length > 0)
  assert.doesNotMatch(search, /insertSlashCommand|data-lexical-editor|data-composer-input|\[contenteditable|HTMLTextAreaElement/)
  assert.doesNotMatch(search, /execCommand\(['"]insertText['"]/)
  assert.doesNotMatch(search, /editor\.textContent\s*=|dispatchEvent\(new Event\(['"]input['"]/)
  assert.match(search, /navigator\.clipboard/)
  assert.match(search, /clipboard\.writeText\(commandName\)/)
  assert.match(search, /if \(!target\) \{ copySlashCommand\(name\); return \}/)
  assert.match(search, /run: \(\) => dispatchSlashCommand\(/)
  assert.match(search, /target \? pCopy\.commandInsertLabel : pCopy\.commandCopyLabel/)
  assert.match(search, /target \? pCopy\.commandInsertHint : pCopy\.commandCopyHint/)
  assert.match(search, /showDeltaToast\(copy\.searchPalette\.commandCopied\)/)
  assert.match(search, /showDeltaToast\(copy\.searchPalette\.commandCopyFailed\)/)
})

test('copy action returns to conversation only after clipboard success', () => {
  const start = search.indexOf('const copySlashCommand =')
  const end = search.indexOf('\n  const getShortcutsService', start)
  assert.ok(start >= 0 && end > start)
  const action = search.slice(start, end)
  assert.ok(action.indexOf('clipboard.writeText(commandName)') < action.indexOf('controller.openConversation()'))
  assert.match(action, /if \(typeof clipboard\?\.writeText !== 'function'\)/)
  assert.match(action, /showDeltaToast\(copy\.searchPalette\.commandCopyFailed\)/)
})

test('Chinese and English labels disclose copy-and-paste semantics', () => {
  for (const lang of ['en', 'zh']) {
    const dictionary = JSON.parse(read('packages/dsh-delta-desktop/locale/' + lang + '.json'))
    const palette = dictionary.searchPalette
    for (const key of ['commandCopyLabel', 'commandCopyHint', 'commandCopied', 'commandCopyFailed',
      'commandPickerLabel', 'commandInsertLabel', 'commandInsertHint', 'commandInserted', 'commandInsertFailed']) {
      assert.equal(typeof palette[key], 'string', lang + '.' + key)
      assert.ok(palette[key].length > 0, lang + '.' + key)
    }
  }
})

test('ZIP3 Search Region review pin rejects restored editor DOM injection', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = '// Unscoped sidebar search has no authorized composer target.'
  assert.ok(source.includes(anchor))
  const tampered = source.replace(anchor, anchor +
    "\n      document.querySelector('[contenteditable=true]')?.textContent = commandName")
  assert.notEqual(tampered, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

test('native command insertion is authorized only by a scoped Host Slot', () => {
  assert.match(search, /composerScope\.slots\.inject\('conversation\.input\.left'/)
  assert.match(search, /props\.inputActions\?\.captureInsertion/)
  assert.match(search, /props\.inputActions\?\.insertText/)
  assert.match(search, /actions\.captureInsertion\(\)/)
  assert.match(search, /actions\.insertText\(command, span\) === true/)
  assert.match(search, /accessOwner\.whenAccess\(lease\.sessionId, 'session\/prompt'/)
  assert.match(search, /leaseRef\.current !== lease \|\| !lease\.allowed \|\| lease\.revision !== accessRevision/)
  assert.match(search, /latest\.binding !== source\.binding/)
  assert.match(search, /latest\.host !== source\.host/)
  assert.match(search, /latest\.input\.draftRev !== span\.draftRev/)
  assert.match(search, /current\.current\.props\.inputActions !== actions/)
  assert.match(search, /getUniqueMainSessionId\(\) !== sessionId/)
  assert.match(search, /host\.blocks\.storeFor\(sessionId\)\.getSnapshot\(\) !== undefined/)
  assert.match(search, /input\?\.phase === 'plain' && input\.draft === ''/)
  assert.doesNotMatch(search, /actions\.setDraft|actions\.submit\(|inputActions\.submit\(/)
  assert.doesNotMatch(search, /Object\.keys\(sessions\.list\.getSnapshot\(\)\.byId\)\[0\]/)
  assert.match(search, /request !== catalogSerial/)
  assert.match(search, /cachedCatalog = undefined/)
  assert.match(search, /!currentFilteredItems\.includes\(item\)/)
})
