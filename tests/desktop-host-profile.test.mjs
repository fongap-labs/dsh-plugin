import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../packages/dsh-desktop-delta/src-tauri/src/lib.rs', import.meta.url),
  'utf8',
)

test('Desktop launches the persistent SDK profile without the Harness Web GUI', () => {
  const start = source.indexOf('let mut command = Command::new(node_path)')
  const end = source.indexOf('.current_dir(&workspace)', start)
  assert.notEqual(start, -1, 'Desktop runtime command must exist')
  assert.notEqual(end, -1, 'Desktop runtime command must set its workspace')
  const launch = source.slice(start, end)

  assert.match(launch, /\.arg\("--profile"\)\s*\.arg\("sdk"\)/)
  assert.doesNotMatch(launch, /\.arg\("(?:web|headless)"\)/)
})
