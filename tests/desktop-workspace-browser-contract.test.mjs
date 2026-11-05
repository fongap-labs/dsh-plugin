import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const rust = read('../packages/dsh-desktop-delta/src-tauri/src/lib.rs')
const client = read('../packages/dsh-desktop-delta/src/lib/desktop-host-client.ts')
const app = read('../packages/dsh-desktop-delta/src/App.tsx')
const browser = read('../packages/dsh-desktop-delta/src/WorkspaceBrowser.tsx')
const documentation = read('../packages/dsh-desktop-delta/HOST_API.md')

test('the local-only workspace capability is conditional on explicit selection', () => {
  assert.match(rust, /if is_workspace_explicit \{/)
  assert.match(rust, /capabilities\.push\("workspace\.files"\)/)
  assert.match(rust, /workspace_root: Arc<Mutex<Option<PathBuf>>>/)
  assert.match(rust, /fn selected_workspace_root\(/)
  assert.match(rust, /RuntimeStatus::Ready/)
  assert.match(rust, /workspace_root\.lock\(\)/)
  assert.match(rust, /list_workspace_files,/)
  assert.match(rust, /preview_workspace_file,/)
  assert.match(app, /await desktopHost\.handshake\(\)/)
})

test('path authorization blocks traversal, symlinks and restricted names', () => {
  assert.match(rust, /fn workspace_path\(/)
  assert.match(rust, /relative_path\.split\('\/'\)/)
  assert.match(rust, /segment == "\.\."/)
  assert.match(rust, /segment\.contains\('\\\\'\)/)
  assert.match(rust, /is_restricted_workspace_name\(segment\)/)
  assert.match(rust, /fs::symlink_metadata\(&candidate\)/)
  assert.match(rust, /metadata\.file_type\(\)\.is_symlink\(\)/)
  assert.match(rust, /canonical\.starts_with\(root\)/)
  assert.match(rust, /MAX_WORKSPACE_ENTRIES: usize = 200/)
  assert.match(rust, /MAX_WORKSPACE_SCAN: usize = 3000/)
})

test('preview is read-only, bounded and UTF-8 only', () => {
  assert.match(rust, /MAX_WORKSPACE_PREVIEW_BYTES: u64 = 64 \* 1024/)
  assert.match(rust, /is_text_preview_allowed\(&path\)/)
  assert.match(rust, /\.take\(MAX_WORKSPACE_PREVIEW_BYTES \+ 1\)/)
  assert.match(rust, /bytes\.contains\(&0\)/)
  assert.match(rust, /String::from_utf8\(bytes\)/)
  assert.doesNotMatch(rust, /fn write_workspace_file\(/)
})

test('renderer only forwards relative paths through a gated Host adapter', () => {
  assert.match(client, /callHost<WorkspaceListing>\('list_workspace_files'/)
  assert.match(client, /callHost<WorkspacePreview>\('preview_workspace_file'/)
  assert.match(client, /capability: 'workspace\.files'/)
  assert.match(browser, /isAvailable/)
  assert.match(browser, /desktopHost\.listWorkspaceFiles\(relativePath\)/)
  assert.match(browser, /desktopHost\.previewWorkspaceFile\(filePath\)/)
  assert.match(browser, /<pre className=/)
  assert.doesNotMatch(browser, /@tauri-apps\/plugin-fs/)
  assert.match(documentation, /64 KiB/)
})
