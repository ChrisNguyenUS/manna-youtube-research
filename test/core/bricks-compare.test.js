import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareChannel } from '../../src/core/bricks/compare.js';

const row = (score, concept, archetype, story = 'Tự sự', hookCat = 'Ngược đời') => ({ meta: { score }, bricks: { concept, hook: { archetype, category: hookCat }, story: { category: story } } });
const value = (r, key, v) => r.attrs.find((a) => a.key === key).values.find((x) => x.value === v);

test('winners are at or above the threshold, losers are under 1×; a value in most winners and few losers is marked', () => {
  const rows = [row(8, 'So sánh', 'Contrarian'), row(5, 'So sánh', 'Contrarian'), row(4, 'So sánh', 'Teacher'), row(3, 'Số', 'Contrarian'), row(3.5, 'So sánh', 'Contrarian'),
    row(0.4, 'Số', 'Teacher'), row(0.7, 'Số', 'Teacher'), row(0.9, 'So sánh', 'Teacher'), row(0.2, 'Hài hước', 'Teacher'), row(0.5, 'Số', 'Contrarian'),
    row(1.8, 'Trend', 'Magician'), row(null, 'Trend', 'Magician')];
  const r = compareChannel(rows, { min: 3 });
  assert.deepEqual([r.winners, r.losers, r.enough, r.need], [5, 5, true, { winners: 0, losers: 0 }]);
  assert.deepEqual(value(r, 'concept', 'So sánh'), { value: 'So sánh', wins: 4, losses: 1, core: true }, '4/5 winners, 1/5 losers');
  assert.deepEqual(value(r, 'archetype', 'Contrarian'), { value: 'Contrarian', wins: 4, losses: 1, core: true });
  assert.deepEqual(value(r, 'concept', 'Số'), { value: 'Số', wins: 1, losses: 3, core: false });
  assert.equal(value(r, 'concept', 'Trend'), undefined, 'a video between 1× and the threshold, or without a score, counts as neither');
  assert.deepEqual(r.attrs.map((a) => [a.key, a.label]), [['concept', 'Concept'], ['archetype', 'Kiểu hook'], ['story', 'Cách kể'], ['hookCategory', 'Loại hook']]);
  assert.equal(r.attrs[0].values[0].value, 'So sánh', 'most common among winners first');
});

test('the mark needs all three: 60% of winners, at most 20% of losers, at least 3 winners', () => {
  const mk = (winsWith, wins, lossesWith, losses) => compareChannel([
    ...Array.from({ length: winsWith }, () => row(5, 'A', 'Teacher')), ...Array.from({ length: wins - winsWith }, () => row(5, 'B', 'Teacher')),
    ...Array.from({ length: lossesWith }, () => row(0.5, 'A', 'Teacher')), ...Array.from({ length: losses - lossesWith }, () => row(0.5, 'C', 'Teacher')),
  ], { min: 3 });
  assert.equal(value(mk(3, 5, 1, 5), 'concept', 'A').core, true, '60% and 20%: both at the edge');
  assert.equal(value(mk(2, 3, 0, 3), 'concept', 'A').core, false, '67% of winners but only 2 of them');
  assert.equal(value(mk(3, 6, 0, 5), 'concept', 'A').core, false, '50% of winners');
  assert.equal(value(mk(4, 5, 2, 5), 'concept', 'A').core, false, '40% of losers');
  assert.equal(value(mk(3, 3, 0, 3), 'archetype', 'Teacher').core, false, 'in every winner and every loser: tells nothing');
});

test('too few videos: says how many are missing and marks nothing (Review Focus #5)', () => {
  const r = compareChannel([row(9, 'A', 'Teacher'), row(7, 'A', 'Teacher'), row(0.3, 'B', 'Teacher'), row(null, 'A', 'Teacher')], { min: 3 });
  assert.deepEqual([r.winners, r.losers, r.enough, r.need], [2, 1, false, { winners: 1, losers: 2 }]);
  assert.ok(r.attrs.every((a) => a.values.every((v) => !v.core)));
  assert.deepEqual(compareChannel([], { min: 3 }), { winners: 0, losers: 0, enough: false, need: { winners: 3, losers: 3 }, attrs: [] });
});

test('free-text categories are compared without case or accents; empty values are left out', () => {
  const r = compareChannel([row(5, null, null, 'Kể chuyện tự sự'), row(5, null, null, 'kể chuyện tự sự '), row(5, null, null, 'Ke chuyen tu su'), row(0.5, null, null, ''), row(0.5, null, null, 'So sánh từng cặp'), row(0.5, null, null, 'So sánh từng cặp')], { min: 3 });
  assert.deepEqual(value(r, 'story', 'Kể chuyện tự sự'), { value: 'Kể chuyện tự sự', wins: 3, losses: 0, core: true });
  assert.equal(r.attrs.find((a) => a.key === 'concept'), undefined, 'an attribute nobody has is not listed');
});
