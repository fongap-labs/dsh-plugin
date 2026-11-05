import assert from 'node:assert/strict'
import test from 'node:test'
import { DesktopSessionEventOrder } from '../packages/dsh-desktop-delta/src/lib/session-event-order.ts'

const event = (sessionId, sequence) => ({
  sessionId,
  sequence,
  eventId: `${sessionId}:${sequence}`,
  occurredAt: 1,
  type: 'session.advanced',
  payload: {},
})

test('tracks a monotonic event sequence per session', () => {
  const order = new DesktopSessionEventOrder()
  assert.equal(order.observe(event('a', 14)), 'accept')
  assert.equal(order.observe(event('a', 15)), 'accept')
  assert.equal(order.observe(event('b', 1)), 'accept')
  assert.equal(order.observe(event('a', 15)), 'duplicate')
  assert.equal(order.observe(event('a', 13)), 'duplicate')
  assert.equal(order.observe(event('b', 2)), 'accept')
  assert.equal(order.observe(event('a', 18)), 'gap')
  assert.equal(order.observe(event('a', 19)), 'accept')
  assert.equal(order.observe(event('a', 17)), 'duplicate')
})

test('rejects invalid cursors and clears deleted session state', () => {
  const order = new DesktopSessionEventOrder()
  assert.equal(order.observe(event('a', Number.NaN)), 'invalid')
  assert.equal(order.observe(event('a', -1)), 'invalid')
  assert.equal(order.observe(event('', 2)), 'invalid')
  assert.equal(order.observe(event('a', 100)), 'accept')
  order.clear('a')
  assert.equal(order.observe(event('a', 1)), 'accept')
})
