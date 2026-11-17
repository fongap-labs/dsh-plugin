import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const sourceRoot = new URL('../packages/dsh-delta-code/src/', import.meta.url)

describe('Delta Code public types and DSH Context boundary', () => {
  it('keeps public configuration types independent from the Host SDK', () => {
    const publicTypes = readFileSync(new URL('types.ts', sourceRoot), 'utf8')
    for (const forbidden of ['@deepseek-ai', 'declare module', 'HostFsService', 'WorkingDirectoryService']) {
      assert.equal(publicTypes.includes(forbidden), false, forbidden)
    }
    const adapterTypes = readFileSync(
      new URL('delta-code-adapter/providers/dsh/host-types.ts', sourceRoot), 'utf8')
    assert.ok(adapterTypes.includes("declare module '@deepseek-ai/cordis'"))
    assert.ok(adapterTypes.includes("import type {} from '@deepseek-ai/dsh-system-prompt'"))
    assert.ok(adapterTypes.includes("get(name: 'fs')"))
  })

  it('retains the previous normalized configuration defaults and account selections', () => {
    const config = normalizeConfig({ github: { accounts: [
      { owner: 'company', tokenEnv: 'GH_COMPANY_TOKEN', repositories: ['company/service'] },
    ] } })
    assert.equal(config.enabled, true)
    assert.equal(config.githubAccounts[0].owner, 'company')
    assert.deepEqual(config.githubAccounts[0].repositories, ['company/service'])
  })
})
