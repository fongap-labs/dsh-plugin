#!/usr/bin/env node
/** Delta build-time UI patch. Feature/structure detection, no Harness version pin. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MARK = 'delta-suite:native-ui-v1'
function requireShape(ok, where) {
  if (!ok) throw new Error('[delta-suite patch] upstream contract changed: ' + where)
}
function replaceUnique(source, needle, replacement, where) {
  const at = source.indexOf(needle)
  requireShape(at >= 0 && source.indexOf(needle, at + needle.length) < 0, where)
  return source.slice(0, at) + replacement + source.slice(at + needle.length)
}

export function patchSidebarRoot(source) {
  if (source.includes(MARK + ' sidebar')) return source
  const begin = '      {canStartSession && (\n        <div className={css.newSessionRow}>'
  const endMark = '      <div className={css.scrollRegion}>'
  const at = source.indexOf(begin)
  const end = source.indexOf(endMark, at + begin.length)
  requireShape(at >= 0 && source.indexOf(begin, at + 1) < 0 && end > at, 'native New Session container')
  const section = source.slice(at, end)
  const suffix = '\n      )}\n'
  const closing = section.lastIndexOf(suffix)
  requireShape(closing > 0 && section.slice(closing + suffix.length).trim() === '', 'New Session closing JSX')
  const markup = section.slice('      {canStartSession && (\n'.length, closing)
  requireShape(markup.includes("renderSlot('sidebar.session.action'") &&
    markup.includes('onClick={openNewSession}') &&
    markup.includes('className={css.newSessionRow}'), 'native New Session action')
  let next = source.slice(0, at) +
    '      {(!wide || panels.length === 0) && deltaNewSessionAction}\n\n' + source.slice(end)
  const returnAnchor = '  return (\n    <div\n      ref={column}'
  next = replaceUnique(next, returnAnchor,
    '  // ' + MARK + ' sidebar\n' +
    '  const deltaNewSessionAction = canStartSession ? (\n' +
    markup + '\n  ) : null\n\n' + returnAnchor, 'SidebarRoot component return')
  const listAnchor = '              {hasEntryActions && (\n                <PanelMoreMenu'
  next = replaceUnique(next, listAnchor,
    '              {wide && deltaNewSessionAction}\n' + listAnchor, 'panel list before More')
  return next
}

const sidebarCSS = [
  "/* Scope to Delta; never hide native sidebar toggle or clone its handler. */",
  ":global(html[data-delta-ui='delta']) .brand { display: none; }",
  ":global(html[data-delta-ui='delta'][data-windows-titlebar]) .logoRow,",
  ":global(html[data-delta-ui='delta'][data-platform='darwin']) .logoRow {",
  "  height: 0; min-height: 0; margin: 0; padding: 0; overflow: visible;",
  "}",
  ":global(html[data-delta-ui='delta']:not([data-windows-titlebar]):not([data-platform='darwin'])) .logoRow {",
  "  height: 28px; min-height: 28px; /* retain non-native sidebar opener */",
  "}",
  ":global(html[data-delta-ui='delta']) .panelList .newSessionRow { margin: 0 4px; width: auto; }",
  ":global(html[data-delta-ui='delta']) .panelList .newSession {",
  "  justify-content: flex-start; height: 36px; border: 0; background: transparent; padding: 8px 12px;",
  "}",
  ":global(html[data-delta-ui='delta']) .panelList .newSessionLabelMask { flex: 0 1 auto; }",
  ":global(html[data-delta-ui='delta']) .panelList .newSessionContent { justify-content: flex-start; gap: 8px; }",
  ":global(html[data-delta-ui='delta']) .panelList .newSessionShortcut { display: none; }",
].join('\n')

export function patchSidebarStyle(source) {
  if (source.includes(MARK + ' sidebar-style')) return source
  requireShape(source.includes('.logoRow {') && source.includes('.panelList {') &&
    source.includes('.newSessionRow {'), 'sidebar stylesheet')
  return source + '\n/* ' + MARK + ' sidebar-style */\n' + sidebarCSS + '\n'
}

const heroCSS = [
  ":global(html[data-delta-ui='delta']) .titleGroup { order: 1; }",
  ":global(html[data-delta-ui='delta']) .fishHitbox {",
  "  order: 2; align-self: center; transform: translateY(-6px);",
  "}",
  ":global(html[data-delta-ui='delta']) .previewBadge { display: none; }",
].join('\n')

export function patchHeroStyle(source) {
  if (source.includes(MARK + ' hero-style')) return source
  requireShape(source.includes('.titleGroup {') && source.includes('.fishHitbox {') &&
    source.includes('.previewBadge {'), 'hero stylesheet')
  return source + '\n/* ' + MARK + ' hero-style */\n' + heroCSS + '\n'
}

export function patchDictionary(source, lang, key, before, after) {
  const declaration = 'export const ' + lang + ' = {'
  const begin = source.indexOf(declaration)
  requireShape(begin >= 0, 'missing dictionary ' + lang)
  const following = source.indexOf('\nexport const ', begin + declaration.length)
  const end = following < 0 ? source.length : following
  const part = source.slice(begin, end)
  const keyPattern = key.replaceAll('.', '\\.')
  const line = new RegExp("(^[ \\t]*['\"]?" + keyPattern + "['\"]?[ \\t]*:[ \\t]*')([^'\"\\n]*)(['\"][^\\n]*$)", 'm')
  const found = part.match(line)
  requireShape(found && found.index !== undefined, lang + '.' + key + ' entry')
  requireShape(found[2] === before || found[2] === after, lang + '.' + key + ' value')
  if (found[2] === after) return source
  const replaced = part.slice(0, found.index) + found[1] + after + found[3] +
    part.slice(found.index + found[0].length)
  return source.slice(0, begin) + replaced + source.slice(end)
}

function dictionary(entries) {
  return source => entries.reduce((result, entry) => patchDictionary(result, ...entry), source)
}
export const changes = [
  { package: '@deepseek-ai/dsh-client-ui-sidebar', file: 'src/client/SidebarRoot.tsx', transform: patchSidebarRoot },
  { package: '@deepseek-ai/dsh-client-ui-sidebar', file: 'src/client/SidebarRoot.module.css', transform: patchSidebarStyle },
  { package: '@deepseek-ai/dsh-client-ui-sidebar', file: 'src/client/locales.ts', transform: dictionary([
    ['zh', 'session.new', '新会话', '开始对话'],
    ['zh', 'session.new.label', '新建会话', '开始对话'],
    ['en', 'session.new', 'New Session', 'Start Conversation'],
    ['en', 'session.new.label', 'New session', 'Start Conversation'],
  ]) },
  { package: '@deepseek-ai/dsh-client-ui-conversation', file: 'src/client/skeleton/HeroShell.module.css', transform: patchHeroStyle },
  { package: '@deepseek-ai/dsh-client-ui-plugin-manager', file: 'src/client/locales.ts', transform: dictionary([
    ['zh', 'panel', '插件', '插件管理'],
    ['zh', 'title', '插件', '插件管理'],
    ['en', 'panel', 'Plugins', 'Plugin Manager'],
    ['en', 'title', 'Plugins', 'Plugin Manager'],
  ]) },
  { package: '@deepseek-ai/dsh-client-ui-schedule', file: 'src/client/task-manager-locales.ts', transform: dictionary([
    ['zh', 'panel', '自动化任务', '定时任务'],
    ['zh', 'title', '自动化任务', '定时任务'],
    ['en', 'panel', 'Automation tasks', 'Scheduled Tasks'],
    ['en', 'title', 'Automation tasks', 'Scheduled Tasks'],
  ]) },
  { package: '@deepseek-ai/dsh-client-ui-schedule', file: 'src/client/locales.ts', transform: dictionary([
    ['zh', 'trigger.label', '自动化任务', '定时任务'],
    ['en', 'trigger.label', 'Automation tasks', 'Scheduled Tasks'],
  ]) },
]

function discoverPackages(root) {
  const base = join(root, 'packages')
  requireShape(existsSync(base), 'Harness checkout packages directory')
  const required = new Set(changes.map(item => item.package))
  const discovered = new Map()
  const visit = (dir, depth) => {
    if (depth > 5 || discovered.size === required.size) return
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name)
      if (item.isFile() && item.name === 'package.json') {
        try {
          const name = JSON.parse(readFileSync(path, 'utf8')).name
          if (required.has(name)) discovered.set(name, dir)
        } catch { /* unrelated manifests are not targets */ }
      } else if (item.isDirectory() && !['node_modules', 'lib', 'dist', '.git'].includes(item.name)) {
        visit(path, depth + 1)
      }
    }
  }
  visit(base, 0)
  for (const name of required) requireShape(discovered.has(name), 'Host package ' + name)
  return discovered
}

export function planPatches(root) {
  const locations = discoverPackages(root)
  return changes.map(item => {
    const file = join(locations.get(item.package), item.file)
    requireShape(existsSync(file), item.package + '/' + item.file)
    const oldText = readFileSync(file, 'utf8')
    const newText = item.transform(oldText)
    return { file, oldText, newText, changed: oldText !== newText }
  })
}

function main() {
  const args = process.argv.slice(2)
  const index = args.indexOf('--root')
  const root = index >= 0 ? args[index + 1] : process.env.DELTA_HARNESS_ROOT
  requireShape(Boolean(root), '--root <Harness source checkout> or DELTA_HARNESS_ROOT')
  requireShape(!(args.includes('--check') && args.includes('--apply')), 'choose --check OR --apply')
  const write = args.includes('--apply')
  const plan = planPatches(resolve(root))
  // All targets are validated before the first write.
  if (write) for (const item of plan) if (item.changed) writeFileSync(item.file, item.newText)
  for (const item of plan) {
    process.stdout.write((item.changed ? (write ? 'PATCHED ' : 'PENDING ') : 'UNCHANGED ') + item.file + '\n')
  }
  process.stdout.write('[delta-suite patch] ' + (write ? 'applied' : 'checked') + '; no Harness version pin\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
