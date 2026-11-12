import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  normalizeLanguageConventions,
  parseGitFileList,
  identifyAddedFiles,
  checkLanguageConventions,
  describeLanguageViolations,
} from '../packages/dsh-delta-code/lib/consistency.js'
import { createDeliveryGateTool } from '../packages/dsh-delta-code/lib/tools/delivery-gate.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

function git(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
}
async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-language-policy-'))
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'test@example.invalid')
  git(root, 'config', 'user.name', 'Language Policy Test')
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'base.ts'), 'export const base = 1\n')
  await writeFile(join(root, 'src', 'old.ts'), 'export const old = 1\n')
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'initial')
  return root
}
function collectAdded(dir) {
  return identifyAddedFiles(
    git(dir, 'ls-tree', '-r', '--name-only', '-z', 'HEAD', '--'),
    git(dir, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'),
  )
}
const tsRule = [{ directory: 'src', language: 'typescript' }]

describe('explicit language configuration and pure Git evidence', () => {
  it('defaults to no rule and rejects unsafe/ambiguous configuration', () => {
    assert.deepEqual(normalizeConfig({}).languageConventions, [])
    assert.deepEqual(normalizeLanguageConventions(undefined), [])
    assert.deepEqual(normalizeLanguageConventions(tsRule), tsRule)
    assert.throws(() => normalizeLanguageConventions([{ directory: '../other', language: 'typescript' }]), /safe/)
    assert.throws(() => normalizeLanguageConventions([{ directory: 'src', language: 'python' }]), /typescript or javascript/)
    assert.throws(() => normalizeLanguageConventions([...tsRule, ...tsRule]), /duplicate/)
    assert.throws(() => normalizeLanguageConventions('src'), /array/)
  })

  it('parses NUL-terminated file lists strictly', () => {
    assert.deepEqual(parseGitFileList(''), [])
    assert.deepEqual(parseGitFileList('src/a.ts\0src/b.mjs\0'), ['src/a.ts', 'src/b.mjs'])
    assert.throws(() => parseGitFileList('src/a.ts\n'), /incomplete/)
    assert.throws(() => parseGitFileList('src/a.ts\0\0'), /invalid/)
    assert.throws(() => parseGitFileList('../escape.ts\0'), /invalid/)
  })

  it('applies longest explicit directory scope and permits mixed/undeclared areas', () => {
    const rules = normalizeLanguageConventions([
      { directory: '.', language: 'typescript' },
      { directory: 'tests', language: 'javascript' },
    ])
    assert.deepEqual(checkLanguageConventions(['src/add.ts', 'tests/test.mjs', 'notes/README.md'], rules), [])
    const failures = checkLanguageConventions(['src/unsafe.mjs', 'tests/other.ts'], rules)
    assert.equal(failures.length, 2)
    assert.equal(failures[0].directory, '.')
    assert.equal(failures[1].directory, 'tests')
    assert.match(describeLanguageViolations(failures)[0], /explicit directory policy/)
    assert.deepEqual(checkLanguageConventions(['src/unsafe.mjs'], []), [])
  })

  it('allows TS declarations inside a declared JavaScript directory', () => {
    const js = [{ directory: 'src', language: 'javascript' }]
    assert.deepEqual(checkLanguageConventions(['src/types.d.ts', 'src/other.d.mts', 'src/foo.js'], js), [])
    assert.equal(checkLanguageConventions(['src/feature.ts'], js).length, 1)
  })
})

describe('real Git HEAD versus current index/untracked evidence', () => {
  it('includes staged additions, renamed paths and untracked files but never staged deletions', async () => {
    const root = await repository()
    try {
      await writeFile(join(root, 'src', 'staged.mjs'), 'console.log(1)\n')
      await writeFile(join(root, 'src', 'untracked.js'), 'console.log(2)\n')
      git(root, 'add', 'src/staged.mjs')
      git(root, 'mv', 'src/base.ts', 'src/renamed.js')
      git(root, 'rm', '-q', 'src/old.ts')
      assert.deepEqual(collectAdded(root), ['src/renamed.js', 'src/staged.mjs', 'src/untracked.js'])
      assert.equal(checkLanguageConventions(collectAdded(root), tsRule).length, 3)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('does not mistake an ordinary deletion or modification for a new file', async () => {
    const root = await repository()
    try {
      git(root, 'rm', '-q', 'src/old.ts')
      await writeFile(join(root, 'src', 'base.ts'), 'export const base = 2\n')
      assert.deepEqual(collectAdded(root), [])
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('detects nested untracked directories and index intent-to-add entries', async () => {
    const root = await repository()
    try {
      await mkdir(join(root, 'src', 'next'))
      await writeFile(join(root, 'src', 'next', 'a.mjs'), 'export {}\n')
      await writeFile(join(root, 'src', 'intent.js'), 'export {}\n')
      git(root, 'add', '-N', 'src/intent.js')
      assert.deepEqual(collectAdded(root), ['src/intent.js', 'src/next/a.mjs'])
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})

const HEAD = 'a'.repeat(40)
const tasks = [
  { content: 'Locate source', status: 'completed' },
  { content: 'Fix and test', status: 'completed' },
]
const acceptance = [
  { task: 'Locate source', criterion: 'Source located and regression tested', checks: ['test'] },
  { task: 'Fix and test', criterion: 'Regression test passes against final Git evidence', checks: ['test'] },
]
function hostOutput(stdout = '') {
  return {
    done: Promise.resolve({ exitCode: 0, signal: null }),
    collected: {
      stdout: { readFrom: () => ({ text: stdout, lossy: false }) },
      stderr: { readFrom: () => ({ text: '', lossy: false }) },
    },
  }
}
async function gateFixture({ status = '## main\0A  src/new.js\0', current = 'src/old.ts\0src/new.js\0', rules = tsRule } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-language-gate-'))
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
  const commands = []
  const ctx = {
    get: () => undefined,
    subprocess: { spawn(spec) {
      commands.push(spec.argv)
      const argv = spec.argv
      if (argv[0] !== 'git') return hostOutput('tests passed')
      if (argv[1] === 'rev-parse') return hostOutput(HEAD + '\n')
      if (argv[1] === 'status') return hostOutput(status)
      if (argv[1] === 'ls-tree') return hostOutput('src/old.ts\0')
      if (argv[1] === 'ls-files') return hostOutput(current)
      if (argv[1] === 'diff') return hostOutput('')
      throw Error('unexpected git command: ' + argv.join(' '))
    } },
  }
  const settings = normalizeConfig({
    workspaceRoot: root,
    execution: { allowCommands: true, languageConventions: rules },
  })
  return { tool: createDeliveryGateTool(ctx, settings), commands,
    cleanup: () => rm(root, { recursive: true, force: true }) }
}
const runContext = () => ({ agent: { session: { id: 'language-policy-test' } }, signal: new AbortController().signal })
const gateArgs = { tasks, taskAcceptance: acceptance, expectedHead: HEAD, scripts: ['test'] }

describe('delivery-gate integration with explicit rules', () => {
  it('blocks a staged JavaScript addition under a TypeScript rule', async () => {
    const f = await gateFixture()
    try {
      const result = await f.tool.execute(gateArgs, runContext())
      assert.equal(result.stage, 'blocked')
      assert.match(result.blockers.join(' '), /src\/new.js uses javascript/)
      assert.ok(f.commands.some(cmd => cmd[1] === 'ls-tree'))
      assert.ok(f.commands.some(cmd => cmd[1] === 'ls-files'))
    } finally { await f.cleanup() }
  })

  it('accepts a new TypeScript file in the same directory', async () => {
    const f = await gateFixture({ status: '## main\0A  src/new.ts\0', current: 'src/old.ts\0src/new.ts\0' })
    try {
      const result = await f.tool.execute(gateArgs, runContext())
      assert.equal(result.stage, 'verified')
    } finally { await f.cleanup() }
  })

  it('does not execute policy probes when no rule is configured', async () => {
    const f = await gateFixture({ rules: [] })
    try {
      const result = await f.tool.execute(gateArgs, runContext())
      assert.equal(result.stage, 'verified')
      assert.ok(!f.commands.some(cmd => cmd[1] === 'ls-tree' || cmd[1] === 'ls-files'))
    } finally { await f.cleanup() }
  })
})
