import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8');

test('recovery uses the Host session list and native navigation, not local cached content', () => {
  assert.match(source, /sessionListRecovery.*defaultOn: true/);
  assert.match(source, /sessions\.list!\.getSnapshot\(\)/);
  assert.match(source, /snapshot\.phase !== 'ready'/);
  assert.match(source, /navigation\.openSession\(id\)/);
  assert.doesNotMatch(source, /location\.reload\(/);
});

test('native sidebar takes precedence and is never replaced', () => {
  assert.match(source, /\[data-sidebar-list-area\]/);
  assert.match(source, /if \(nativeRows\) \{ userOpened = false; clear\(\); return; \}/);
  assert.match(source, /const mode = missing \? 'missing' : 'offer'/);
  assert.match(source, /if \(!show\) return/);
});

test('recovery is reversible and event listeners are disposed on unloading the plugin', () => {
  assert.match(source, /const unsubscribe = sessions\.list\.subscribe\(schedule\)/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(source, /unsubscribe\(\)/);
  assert.match(source, /window\.removeEventListener\('resize', schedule\)/);
  assert.match(source, /clear\(\);\s*\}\s*, 'dsh-ui-delta: session list recovery'\)/);
});
