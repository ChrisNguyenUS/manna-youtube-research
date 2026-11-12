import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyComment, commentInsights } from '../../src/core/analysis/text.js';

test('fear catches Vietnamese and English worries', () => {
  for (const t of ['Em sợ bị lừa mất tiền', 'uống cái này có sao không ạ', 'có tác dụng phụ không', 'is it safe for kids?', 'looks like a scam']) assert.equal(classifyComment(t).fear, true, t);
});
test('fear does not fire on look-alike words', () => {
  // Bare "lo" is too broad ("lo cho con"); only phrases like "lo quá" count.
  for (const t of ['cái lọ này đẹp', 'logo mới xịn', 'lo quá đi']) assert.equal(classifyComment(t).fear, t === 'lo quá đi', t);
});
test('buying catches purchase intent', () => {
  for (const t of ['giá bao nhiêu vậy shop', 'mua ở đâu ạ', 'có ship Cần Thơ không', 'ib em nha', 'how much is it', 'where to buy']) assert.equal(classifyComment(t).buying, true, t);
  assert.equal(classifyComment('video hay quá').buying, false);
});
test('insights expose the new groups and counts', () => {
  const c = (id, text, likes) => ({ id, text, likes, replies: 0 });
  const i = commentInsights([c('1', 'sợ bị lừa', 5), c('2', 'giá bao nhiêu', 9), c('3', 'hay', 1)]);
  assert.equal(i.fears[0].id, '1');
  assert.equal(i.buying[0].id, '2');
  assert.deepEqual([i.counts.fears, i.counts.buying], [1, 1]);
});
