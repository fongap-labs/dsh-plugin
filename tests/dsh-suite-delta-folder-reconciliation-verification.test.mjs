import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifiedKnownSessionIds } from '../packages/dsh-suite-delta/lib/host/folder-reconciliation.js'

const notFound = (id) => Object.assign(new Error('session not found'), {
  name: 'SessionPersistenceNotFoundError', sessionId: id,
})

test('only definitive not-found sessions may be considered orphaned', async () => {
  const opens = []
  const reader = {
    list: async () => [{ header: { id: 'archived-1' } }],
    open: async (id, access) => {
      opens.push([id, access])
      if (id === 'removed-1') throw notFound(id)
      return { close: async () => {} }
    },
  }
  const ids = await verifiedKnownSessionIds(reader, { get: () => undefined }, {
    'archived-1': 'folder', 'removed-1': 'folder', 'malformed-but-real': 'folder',
  })
  assert.equal(ids.has('archived-1'), true)
  assert.equal(ids.has('malformed-but-real'), true)
  assert.equal(ids.has('removed-1'), false)
  assert.deepEqual(opens, [['removed-1', 'read'], ['malformed-but-real', 'read']])
})

test('corrupt, unreadable or unsupported sessions abort the entire cleanup', async () => {
  for (const reason of ['SessionPersistenceCorruptionError', 'SessionFormatUnsupportedError', 'EACCES']) {
    const reader = {
      list: async () => [],
      open: async () => { throw Object.assign(new Error('read failure'), { name: reason }) },
    }
    await assert.rejects(
      () => verifiedKnownSessionIds(reader, { get: () => undefined }, { 'uncertain-id': 'folder' }),
      /cleanup refused/,
    )
  }
})

test('a not-found response for a different session cannot authorize cleanup', async () => {
  const reader = {
    list: async () => [],
    open: async () => { throw notFound('another-session') },
  }
  await assert.rejects(
    () => verifiedKnownSessionIds(reader, { get: () => undefined }, { 'expected-session': 'folder' }),
    /cleanup refused/,
  )
})

test('sessions live before or after the inventory scan remain protected', async () => {
  let isActive = true
  const reader = {
    list: async () => [],
    open: async () => {
      throw new Error('read should not be needed for session active at inventory start')
    },
  }
  const ids = await verifiedKnownSessionIds(reader, { get: () => isActive ? {} : undefined }, {
    'live-before-scan': 'folder',
  })
  isActive = false
  assert.equal(ids.has('live-before-scan'), true)
})

test('a read handle is closed, and any close failure fails closed', async () => {
  let closes = 0
  const reader = {
    list: async () => [],
    open: async () => ({ close: () => { closes++; } }),
  }
  const ids = await verifiedKnownSessionIds(reader, { get: () => undefined }, { 'real-but-unlisted': 'folder' })
  assert.equal(ids.has('real-but-unlisted'), true)
  assert.equal(closes, 1)
  await assert.rejects(() => verifiedKnownSessionIds({
    ...reader,
    open: async () => ({ close: () => { throw new Error('close failed') } }),
  }, { get: () => undefined }, { 'real-but-unlisted': 'folder' }), /close failed/)
})

test('incomplete listings and oversized inspections reject without mass deletion', async () => {
  await assert.rejects(
    () => verifiedKnownSessionIds({ list: async () => [{ header: {} }], open: async () => { throw notFound('x') } },
      { get: () => undefined }, { 'x': 'folder' }),
    /listing incomplete/,
  )
  const assignments = Object.fromEntries(Array.from({ length: 101 }, (_, i) => ['candidate-' + i, 'folder']))
  await assert.rejects(
    () => verifiedKnownSessionIds({ list: async () => [], open: async () => { throw notFound('x') } },
      { get: () => undefined }, assignments),
    /Too many unverified sessions/,
  )
})
