import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const rust = readFileSync(new URL('../packages/dsh-desktop-delta/src-tauri/src/lib.rs', import.meta.url), 'utf8')

test('unexpected Harness output closure reaps and detaches only its own process', () => {
  assert.match(rust, /child: Arc<Mutex<Child>>/)
  assert.match(rust, /Arc::downgrade\(&self\.connection\)/)
  assert.match(rust, /Arc::ptr_eq\(&connection\.child, &child\)/)
  assert.match(rust, /fn reap_runtime_child/)
  assert.match(rust, /child\.try_wait\(\)/)
  assert.match(rust, /child\.kill\(\)/)
  assert.match(rust, /child\.wait\(\)/)
  assert.match(rust, /RuntimeStatus::Faulted/)
  assert.match(rust, /\u4efb\u52a1\u7ed3\u679c\u53ef\u80fd\u672a\u77e5/)
})
