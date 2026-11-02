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

  it('themes host hover previews through the preview-card token hook only', () => {
    assert.doesNotMatch(client, /\[class\*=["']tooltip["']\]:not/);
    assert.doesNotMatch(client, /\[class\*=["']popover["']\]\s*\{/);
    assert.match(client, /\[style\*=["']--dsh-hover-preview-fade["']\]/);
    assert.match(client, /background:\s*var\(--dsw-alias-bg-layer-1\)\s*!important/);
  });

  it('applies requested sidebar and model settings changes without replacing host slots', () => {
    assert.match(client, /function hideHostOptions\(\)/);
    assert.match(client, /hideHostOptions\(\);/);
    assert.match(client, /hideThirdPartyProviders\(\);/);
    assert.match(client, /mountSearchDock\(\);/);
    assert.match(client, /restoreNativeSearch\(\);/);
    assert.match(client, /hideAccountModels\(\);/);
    assert.match(client, /hideListedModels\(\);/);
  });

  it('hides account model menu items and their empty provider group', () => {
    const modelFilters = client.slice(client.indexOf('const hideAccountModels = () => {'),
      client.indexOf('// v0.1.0: the working status reads'));
    assert.ok(modelFilters.length > 100);
    assert.match(modelFilters, /\[role="menu"\] \[data-provider-id="deepseek-account"\]/);
    assert.match(modelFilters, /closest<HTMLElement>\('\[role="menuitemradio"\]'\)/);
    assert.match(modelFilters, /\[role="group"\]\[data-menu-group\]/);
  });

  it('documents the actual scoped package and published release asset name', () => {
    const manifest = JSON.parse(readFileSync(
      new URL('../packages/dsh-ui-delta/package.json', import.meta.url), 'utf8'
    ));
    const release = JSON.parse(readFileSync(
      new URL('../projects/dsh-ui-delta/release.manifest.json', import.meta.url), 'utf8'
    ));
    const npmSpec = readme.match(/pnpm view (\S+)@(\d+\.\d+\.\d+(?:-beta\.\d+)?) version --registry/);
    assert.ok(npmSpec, 'README must show a versioned npm package query');
    assert.equal(npmSpec[1], manifest.name, 'README package must match package.json');
    const tarball = release.builds.flatMap((build) => build.assets)
      .find((asset) => asset.endsWith('.tgz'));
    assert.ok(tarball, 'release manifest must declare a tarball');
    const expectedUrl = `releases/download/${release.release_key}-v${npmSpec[2]}/${tarball}`;
    assert.ok(readme.includes(expectedUrl), 'README tarball URL must match the npm version and release manifest');
  });
});

describe('Delta settings privacy and usability', () => {
  const host = readFileSync(new URL('../packages/dsh-ui-delta/src/index.ts', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../packages/dsh-ui-delta/src/host/config.ts', import.meta.url), 'utf8');
  it('excludes official DeepSeek session log contributions before reading them', () => {
    assert.match(host, /registerExclusion\(\(\) => true\)/);
  });
  it('accepts credentials in the same provider update as the other fields', () => {
    assert.match(config, /input\.apiKey\.trim\(\)/);
    assert.match(client, /data-provider-field/);
    assert.match(client, /保存配置/);
    assert.match(client, /if \(!r\.ok \|\| d\.error\)/);
  });
  it('searches all nonempty text queries, not only Chinese', () => {
    assert.match(client, /if \(signal\.aborted \|\| !needle\) return base/);
  });
  it('keeps privacy copy precise and labels the settings section correctly', () => {
    assert.match(client, /Delta 配置/);
    assert.match(client, /模型配置/);
    assert.doesNotMatch(client, /本插件不收集、不上传任何数据/);
  });
});
