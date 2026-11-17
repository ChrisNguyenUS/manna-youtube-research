import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, emptyPublished, cleanPublished, addSnapshot, metricsOf, rankBatch, attributesOf, brickTable, rowText, proposalsOf, loserDiffs, cleanLearned } from '../../src/core/ideas/review.js';
import { cleanCard } from '../../src/core/ideas/card.js';
import { cleanOutline } from '../../src/core/outline/outline.js';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();
/** A posted video: its numbers on one check, and the owner's own counts. */
const pub = (o = {}) => cleanPublished({ url: 'u', platform: 'tiktok', postedAt: daysAgo(o.age ?? 10), snapshots: o.views === undefined ? [] : [{ at: daysAgo(0), views: o.views, shares: o.shares ?? 0, likes: 1, comments: 1 }], leads: o.leads, followers: o.followers, views: o.manual });

test('a result: junk becomes empty, a count is a whole number from 0 or unknown, never 0 by default', () => {
  assert.deepEqual(cleanPublished(null), emptyPublished());
  const p = cleanPublished({ url: ' https://x ', platform: 'facebook', postedAt: 'hôm qua', leads: '5', followers: -1, views: 2.5, snapshots: [{ at: 'x', views: 1 }, { at: daysAgo(1), views: '7', shares: 'nhiều' }] });
  assert.deepEqual([p.url, p.platform, p.postedAt, p.leads, p.followers, p.views], ['https://x', null, null, 5, null, null]);
  assert.deepEqual(p.snapshots, [{ at: daysAgo(1), views: 7, likes: null, comments: null, shares: null, saves: null }]);
  assert.equal(cleanPublished({ leads: 0 }).leads, 0, 'zero is a number, not "unknown"');
  assert.equal(cleanPublished({ snapshots: Array.from({ length: 40 }, (_, i) => ({ at: daysAgo(40 - i), views: i })) }).snapshots.length, 30);
});

test('snapshots: one per day, the newest of a day wins; numbers today come from the last one, or the owner\'s count', () => {
  let p = cleanPublished({ url: 'u', postedAt: daysAgo(2) });
  p = addSnapshot(p, { views: 100, shares: 5 }, '2026-11-16T08:00:00.000Z');
  p = addSnapshot(p, { views: 300, shares: 30 }, '2026-11-17T08:00:00.000Z');
  p = addSnapshot({ ...p, error: 'cũ' }, { views: 400, shares: 40 }, '2026-11-17T11:00:00.000Z');
  assert.deepEqual([p.snapshots.map((s) => s.views), p.error], [[100, 400], null]);
  const m = metricsOf(p, NOW);
  assert.deepEqual([m.views, m.shares, m.shareRate, m.ageDays, m.fresh, m.checkedAt], [400, 40, 0.1, 2, true, '2026-11-17T11:00:00.000Z']);
  const manual = metricsOf(cleanPublished({ url: 'u', views: 900 }), NOW);
  assert.deepEqual([manual.views, manual.shareRate, manual.ageDays, manual.fresh], [900, null, null, false], 'no posting date: never "còn mới"');
});

test('ranking for the conversion game: leads, then followers, then views; a video without both counts goes last', () => {
  const r = rankBatch([
    { id: 1, title: 'A', published: pub({ views: 100, leads: 5, followers: 10 }) },
    { id: 2, title: 'B', published: pub({ views: 50, leads: 5, followers: 20 }) },
    { id: 3, title: 'C', published: pub({ views: 10000, followers: 3 }) },
    { id: 4, title: 'D', published: pub({ views: 10, leads: 9, followers: 0 }) },
    { id: 5, title: 'E', published: pub({ views: 5, leads: 0, followers: 0 }) },
  ], 'conversion', NOW);
  assert.deepEqual(r.rows.map((x) => [x.rank, x.id, x.missing]), [[1, 4, false], [2, 2, false], [3, 1, false], [4, 5, false], [5, 3, true]]);
  assert.equal(r.note, null);
});

test('ranking for reach: views, then share rate; with no game: views, and a note to choose one', () => {
  const items = [
    { id: 1, title: 'A', published: pub({ views: 1000, shares: 10 }) },
    { id: 2, title: 'B', published: pub({ views: 1000, shares: 100 }) },
    { id: 3, title: 'C', published: pub({ manual: 5000 }) },
    { id: 4, title: 'D', published: pub({}) },
  ];
  assert.deepEqual(rankBatch(items, 'reach', NOW).rows.map((x) => [x.id, x.missing]), [[3, false], [2, false], [1, false], [4, true]]);
  const none = rankBatch(items, null, NOW);
  assert.deepEqual(none.rows.map((x) => x.id), [3, 1, 2, 4]);
  assert.match(/** @type {string} */ (none.note), /Chưa chọn game trong Soulprint/);
});

test('attributes of a card: pillar, concept, funnel, the chosen hook\'s archetype, length, bricks, source', () => {
  const card = cleanCard({ origin: { kind: 'brick', ref: 'tiktok:1', snapshot: {} }, pillar: 'Phỏng vấn', concept: 'So sánh', funnel: 'tin', keep: ['topic', 'audio'], remix: ['hookStructure'] });
  const outline = cleanOutline({ length: 30, hooks: [{ archetype: 'Teacher', lean: 'l' }], chosenHook: 0 });
  assert.deepEqual(attributesOf(card, outline), [['Pillar', 'Phỏng vấn'], ['Concept', 'So sánh'], ['Phễu', 'Tin'], ['Kiểu hook', 'Teacher'], ['Độ dài', '30 giây'], ['Gạch giữ', 'Topic'], ['Gạch giữ', 'Audio'], ['Gạch làm lại', 'Hook Structure'], ['Nguồn', 'Từ dữ liệu']]);
  assert.deepEqual(attributesOf(cleanCard({}), null), [['Nguồn', 'Tự nghĩ']], 'no outline: no length, no hook');
});

/** Seven videos, best first; the fourth is the middle one. */
const SEVEN = new Map(/** @type {[number, [string, string][]][]} */ ([
  [1, [['Pillar', 'P'], ['Concept', 'So sánh'], ['Kiểu hook', 'Teacher'], ['Nguồn', 'Tự nghĩ']]],
  [2, [['Pillar', 'P'], ['Concept', 'So sánh'], ['Kiểu hook', 'Magician'], ['Nguồn', 'Tự nghĩ']]],
  [3, [['Pillar', 'P'], ['Concept', 'So sánh'], ['Kiểu hook', 'Magician'], ['Nguồn', 'Tự nghĩ']]],
  [4, [['Pillar', 'P'], ['Concept', 'Số'], ['Kiểu hook', 'Teacher'], ['Nguồn', 'Tự nghĩ']]],
  [5, [['Pillar', 'P'], ['Concept', 'So sánh'], ['Kiểu hook', 'Teacher'], ['Nguồn', 'Tự nghĩ']]],
  [6, [['Pillar', 'P'], ['Concept', 'Số'], ['Kiểu hook', 'Teacher'], ['Nguồn', 'Tự nghĩ']]],
  [7, [['Pillar', 'P'], ['Concept', 'Số'], ['Kiểu hook', 'Teacher'], ['Nguồn', 'Tự nghĩ']]],
]));
const ranked = (ids) => ids.map((id) => ({ id }));

test('the brick table: halves without the middle video, keep and review at their limits, shared values hidden', () => {
  const t = brickTable(ranked([1, 2, 3, 4, 5, 6, 7]), SEVEN);
  assert.deepEqual([t.n, t.top, t.bottom], [7, [1, 2, 3], [5, 6, 7]]);
  assert.deepEqual(t.rows.map((r) => [r.attr, r.value, r.top, r.bottom, r.label]), [
    ['Concept', 'So sánh', 3, 1, 'keep'],
    ['Kiểu hook', 'Teacher', 1, 3, 'review'],
    ['Concept', 'Số', 0, 2, null],
    ['Kiểu hook', 'Magician', 2, 0, null],
  ], 'Pillar P and Nguồn Tự nghĩ are on every video: not shown');
  assert.equal(t.note, 'Mới có 7 video, chưa đủ để kết luận. Kallaway khuyên xem theo lô 10.');
  assert.equal(rowText(t.rows[0]), 'Concept So sánh: 3 video nửa trên, 1 video nửa dưới');
  assert.deepEqual(proposalsOf(t), [{ kind: 'keep', text: 'Concept So sánh: 3 video nửa trên, 1 video nửa dưới' }, { kind: 'review', text: 'Kiểu hook Teacher: 1 video nửa trên, 3 video nửa dưới' }]);
  const ten = new Map([...SEVEN, [8, SEVEN.get(1)], [9, SEVEN.get(1)], [10, SEVEN.get(7)]]);
  assert.equal(brickTable(ranked([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), ten).note, null, 'ten videos: no warning');
  assert.deepEqual(brickTable(ranked([1]), SEVEN), { n: 1, top: [], bottom: [], note: 'Mới có 1 video, chưa đủ để kết luận. Kallaway khuyên xem theo lô 10.', rows: [] });
});

test('the bottom half: what differs from the top videos of the same pillar, including a brick they all kept', () => {
  const t = brickTable(ranked([1, 2, 3, 4, 5, 6, 7]), SEVEN);
  const titles = new Map([...SEVEN.keys()].map((id) => [id, `Video ${id}`]));
  const l = loserDiffs(t, SEVEN, titles);
  assert.deepEqual(l.map((x) => [x.id, x.diffs, x.note]), [
    [5, [], 'Giống các video nửa trên cùng pillar ở mọi gạch đã ghi'],
    [6, [{ attr: 'Concept', mine: 'Số', theirs: ['So sánh'] }], null],
    [7, [{ attr: 'Concept', mine: 'Số', theirs: ['So sánh'] }], null],
  ]);
  const four = new Map(/** @type {[number, [string, string][]][]} */ ([
    [1, [['Pillar', 'P'], ['Gạch giữ', 'Audio'], ['Concept', 'X']]],
    [2, [['Pillar', 'P'], ['Gạch giữ', 'Audio'], ['Concept', 'X']]],
    [3, [['Pillar', 'P'], ['Concept', 'X']]],
    [4, [['Pillar', 'Q'], ['Concept', 'X']]],
  ]));
  const l4 = loserDiffs(brickTable(ranked([1, 2, 3, 4]), four), four, new Map());
  assert.deepEqual(l4.map((x) => [x.id, x.diffs, x.note]), [
    [3, [{ attr: 'Gạch giữ', mine: 'không giữ', theirs: ['Audio'] }], null],
    [4, [], 'Không có video nửa trên cùng pillar "Q" để so'],
  ]);
  const noPillar = new Map(/** @type {[number, [string, string][]][]} */ ([[1, [['Concept', 'X']]], [2, [['Concept', 'Y']]]]));
  assert.equal(loserDiffs(brickTable(ranked([1, 2]), noPillar), noPillar, new Map())[0].note, 'Thẻ chưa ghi pillar nên chưa so được');
});

test('what a closed batch leaves: short distinct lines, the game it was judged by; the view ceilings are only a hint', () => {
  const l = cleanLearned({ keep: [' Concept So sánh ', 'Concept So sánh', '', 3, 'x'.repeat(300)], review: 'không phải mảng' }, { game: 'reach', at: 't' });
  assert.deepEqual([l.game, l.keep.length, l.keep[0], l.keep[1].length, l.review, l.at], ['reach', 2, 'Concept So sánh', 200, [], 't']);
  assert.equal(cleanLearned({}, { game: 'robot', at: 't' }).game, null);
  assert.deepEqual(LEVELS.map((x) => x[0]), ['Khoảng 1K view', 'Khoảng 10K view', 'Khoảng 100K view']);
});
