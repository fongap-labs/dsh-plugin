import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../packages/dsh-ui-delta/src/client.ts', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

describe('dsh-ui-delta UI compatibility regressions', () => {
  it('does not hardcode a mismatched runtime version or show its own update banner', () => {
    assert.doesNotMatch(client, /const VERSION\s*=\s*['"]0\.1\.0['"]/);
    assert.doesNotMatch(client, /checkVersion\s*=|versionNotice\s*=/);
    assert.doesNotMatch(client, /Update available v/);
  });

  it('keeps selected conversation styling text-only', () => {
    const selected = client.match(/\.wnFoaW_sessionRow\.wnFoaW_selected\s*\{([^}]*)\}/)?.[1];
    assert.ok(selected, 'expected the selected conversation rule');
    assert.match(selected, /background:\s*transparent/);
    assert.match(selected, /box-shadow:\s*none/);
  });

  it('does not globally override host tooltip or popover classes', () => {
    assert.doesNotMatch(client, /\[class\*=["']tooltip["']\]:not/);
    assert.doesNotMatch(client, /\[class\*=["']popover["']\]\s*\{/);
  });

  it('does not suppress host navigation and session features', () => {
    assert.doesNotMatch(client, /\.wtg9ga_panelRow\[aria-haspopup="menu"\]\s*\{\s*display:\s*none/);
    assert.doesNotMatch(client, /hideHostOptions\(\);/);
    assert.doesNotMatch(client, /mountSearchDock\(\);/);
    assert.match(client, /restoreNativeSearch\(\);/);
    assert.match(client, /hideAccountModels\(\);/);
    assert.match(client, /hideListedModels\(\);/);
  });

  it('never traverses model row ancestors when applying visibility preferences', () => {
    const modelFilters = client.slice(client.indexOf('const hideListedModels = () => {'),
      client.indexOf('// v0.1.0: the working status reads'));
    assert.ok(modelFilters.length > 100);
    assert.doesNotMatch(modelFilters, /row\\.parentElement|group\\.previousElementSibling/);
    assert.match(modelFilters, /row\\.style\\.display/);
  });

  it('documents the actual scoped package and published release asset name', () => {
    assert.match(readme, /@fongap-labs\/dsh-ui-delta@0\.1\.0-beta\.1/);
    assert.match(readme, /releases\/download\/dsh-ui-delta-v0\.1\.0-beta\.1\/fongap-labs-dsh-ui-delta\.tgz/);
  });
});
