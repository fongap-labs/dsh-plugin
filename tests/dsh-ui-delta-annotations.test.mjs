import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../packages/dsh-ui-delta/lib/client.js', import.meta.url), 'utf8');
const start = source.indexOf('const annotationText =');
const end = source.indexOf('const annotationBlock =', start);
assert.ok(start >= 0 && end > start, 'compiled annotation formatter must exist');
const script = `${source.slice(start, end)} globalThis.format = annotationText;`;
const context = {};
runInNewContext(script, context);
const format = context.format;

describe('selection annotation composition', () => {
  it('combines the selected text with the user’s question', () => {
    assert.equal(format({ quote: '后台任务', note: '什么意思' }), '后台任务是什么意思');
    assert.equal(format({ quote: '后台任务', note: '什么意思？' }), '后台任务是什么意思？');
    assert.equal(format({ quote: '后台任务', note: '怎么暂停？' }), '后台任务怎么暂停？');
  });

  it('avoids repeating the selected text and separates English words', () => {
    assert.equal(format({ quote: '后台任务', note: '如何查看后台任务？' }), '如何查看后台任务？');
    assert.equal(format({ quote: 'background jobs', note: 'explain this' }), 'background jobs explain this');
    assert.equal(format({ quote: '后台任务', note: '' }), '后台任务');
  });
});
