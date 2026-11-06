import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('..', import.meta.url)

describe('Delta UI Host provider key lifecycle', () => {
  it('clears the in-memory key when a provider is cleared or removed', { skip: process.platform === 'win32' }, () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-ui-delta-keys-'))
    const script = `
      import assert from 'node:assert/strict';
      import { publicView, updateConfig, openKey } from './packages/dsh-suite-delta/lib/host/config.js';

      await updateConfig({ section: 'search', addProvider: true });
      const first = publicView().search.providers[0];
      assert.ok(first?.id);

      await updateConfig({ section: 'search', apiKey: 'secret-before-clear' });
      assert.equal(await openKey('search', first), 'secret-before-clear');

      await updateConfig({ section: 'search', clearKey: true });
      assert.equal(await openKey('search', first), '');

      await updateConfig({ section: 'search', apiKey: 'secret-before-remove' });
      assert.equal(await openKey('search', first), 'secret-before-remove');

      await updateConfig({ section: 'search', removeProvider: first.id });
      assert.equal(await openKey('search', first), '');
      assert.equal(publicView().search.providers.length, 0);
    `

    try {
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: root,
        env: { ...process.env, HOME: home, USERPROFILE: home },
        encoding: 'utf8',
      })
      assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error || ''))
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
