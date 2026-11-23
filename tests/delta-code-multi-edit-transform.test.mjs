import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyTextEdit, planTextEdit } from '../packages/delta-code/lib/tools/edit-transform.js'

describe('Shared multi-edit validation and first-match text transformation', () => {
  it('replaces only the first literal occurrence, preserving all remaining content', () => {
    for (const preflight of [true, false]) {
      const plan = planTextEdit({ find: 'red', replace: 'blue' }, preflight)
      assert.equal(plan.action, 'replace')
      assert.equal(applyTextEdit('red red readable', plan), 'blue red readable')
    }
  })

  it('rejects ambiguous text replacements in guarded mode but preserves legacy first-match behavior', () => {
    const plan = planTextEdit({ find: 'item', replace: 'entry' }, true)
    assert.throws(() => applyTextEdit('item item', plan, true), /multiple locations/)
    assert.equal(applyTextEdit('item item', plan), 'entry item')
    assert.equal(applyTextEdit('item', plan, true), 'entry')
  })

  it('supports empty replacement, Unicode text and empty overwrite content', () => {
    const remove = planTextEdit({ find: '中', replace: '' }, true)
    assert.equal(applyTextEdit('中文中', remove), '文中')
    assert.deepEqual(planTextEdit({ content: '' }, false), { action: 'overwrite', content: '' })
  })

  it('retains legacy missing-edit skip and strict preflight rejection', () => {
    assert.equal(planTextEdit({}, false), undefined)
    assert.throws(() => planTextEdit({}, true), /provide exactly one/)
    for (const mode of [true, false]) {
      assert.throws(() => planTextEdit({ content: 'x', find: 'x', replace: 'y' }, mode), /exactly one/)
    }
  })

  it('retains preflight-only hash ownership and blocks hashes on replacements', () => {
    assert.deepEqual(planTextEdit({ content: 'new', expectedSha256: 'f'.repeat(64) }, true),
      { action: 'overwrite', content: 'new' })
    assert.throws(() => planTextEdit({ content: 'new', expectedSha256: 'f'.repeat(64) }, false),
      /requires preflight=true/)
    assert.throws(() => planTextEdit({ find: 'x', replace: 'y', expectedSha256: 'f'.repeat(64) }, true),
      /only supported for content overwrite/)
    assert.throws(() => planTextEdit({ expectedSha256: 'f'.repeat(64) }, false),
      /requires preflight=true/)
  })

  it('preserves first-match failure and per-field validation errors', () => {
    for (const mode of [true, false]) {
      assert.throws(() => planTextEdit({ find: '', replace: 'x' }, mode), /find must be non-empty/)
      assert.throws(() => planTextEdit({ find: 'x', replace: 1 }, mode), /replace must be a string/)
      assert.throws(() => planTextEdit({ content: null }, mode), /content must be a string/)
      const plan = planTextEdit({ find: 'absent', replace: 'x' }, mode)
      assert.throws(() => applyTextEdit('present', plan), /find substring not present/)
    }
  })

  it('rejects binary-like NUL in source files and attempted text edits', () => {
    for (const preflight of [true, false]) {
      assert.throws(() => planTextEdit({ content: 'new\0bytes' }, preflight), /binary-like/)
      assert.throws(() => planTextEdit({ find: 'foo\0', replace: 'bar' }, preflight), /binary-like/)
      assert.throws(() => planTextEdit({ find: 'foo', replace: 'bar\0' }, preflight), /binary-like/)
      const replacement = planTextEdit({ find: 'foo', replace: 'bar' }, preflight)
      assert.throws(() => applyTextEdit('foo\0bar', replacement), /binary-like/)
    }
  })

  it('does not mutate the caller input and ignores unknown keys', () => {
    const input = Object.freeze({ find: '.', replace: '/', arbitrary: 'unused' })
    const plan = planTextEdit(input, true)
    assert.equal(applyTextEdit('a.b.c', plan), 'a/b.c')
    assert.equal(input.find, '.')
  })
})

describe('Multi-edit newline compatibility', () => {
  it('matches LF input in CRLF files and preserves unrelated bytes and CRLF replacements', () => {
    const plan = planTextEdit({ find: 'first\nsecond', replace: 'third\nfourth' }, true)
    assert.equal(applyTextEdit('before\r\nfirst\r\nsecond\r\nafter\n', plan, true),
      'before\r\nthird\r\nfourth\r\nafter\n')
  })
  it('matches CRLF input in LF files without adding CRLF', () => {
    const plan = planTextEdit({ find: 'first\r\nsecond', replace: 'third\r\nfourth' }, false)
    assert.equal(applyTextEdit('first\nsecond\n', plan), 'third\nfourth\n')
  })
  it('rejects ambiguity across newline styles in preflight', () => {
    const plan = planTextEdit({ find: 'a\nb', replace: 'c' }, true)
    assert.throws(() => applyTextEdit('a\r\nb\na\nb', plan, true), /multiple locations/)
  })
})

it('does not mistake the LF inside a CRLF pair for a second match', () => {
  const plan = planTextEdit({ find: '\n', replace: '!' }, true)
  assert.equal(applyTextEdit('a\r\nb', plan, true), 'a!b')
})
