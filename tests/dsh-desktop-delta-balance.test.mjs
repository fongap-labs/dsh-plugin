import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../packages/dsh-desktop-delta/lib/client.js', import.meta.url), 'utf8');
const start = source.indexOf('const formatAccountBalance =');
const end = source.indexOf('function syncBalance()', start);
assert.ok(start >= 0 && end > start, 'compiled balance formatter must exist');
const context = {};
runInNewContext(`${source.slice(start, end)} globalThis.format = formatAccountBalance;`, context);

it('formats account balances without inventing a zero or rounding away precision', () => {
  const format = context.format;
  assert.equal(format('12.345', 'CNY'), '¥12.34');
  assert.equal(format('0.001', 'CNY'), '<¥0.01');
  assert.equal(format('-0.001', 'USD'), '-$0.01');
  assert.equal(format('0', 'USD'), '$0.00');
  assert.equal(format('123456789012345.67', 'CNY'), '¥123,456,789,012,345.67');
  assert.equal(format('', 'CNY'), '');
  assert.equal(format(undefined, 'CNY'), '');
  assert.equal(format('42', undefined), '');
});
