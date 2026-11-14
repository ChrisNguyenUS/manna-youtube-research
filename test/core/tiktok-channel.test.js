import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiktokBaseline, tiktokChannelReport, captionText } from '../../src/core/tiktok/channel.js';
import { followScan } from '../../src/core/follows.js';

const NOW = Date.parse('2026-11-13T00:00:00Z');
const v = (id, plays, age, o = {}) => ({ id, plays, likes: 10, comments: 1, shares: 0, saves: 0, caption: `video ${id}`, hashtags: [], durationSec: 30, createdAt: new Date(NOW - age * 86_400_000).toISOString(), url: `u${id}`, ...o });

test('baseline: median of the newest videos, leaving out pinned ones, search finds and videos younger than 2 days', () => {
  const list = [v('a', 1, 0.5), v('b', 100, 3), v('c', 200, 5), v('d', 300, 7), v('e', 400, 9), v('f', 500, 11), v('p', 1e7, 300, { pinned: true }), v('s', 1e6, 20, { from: 'search' })]
    .map((x) => ({ ...x, ageDays: (NOW - Date.parse(x.createdAt)) / 86_400_000 }));
  assert.deepEqual(tiktokBaseline(list), { medianPlays: 300, sample: 5, biased: false });
});

test('baseline: with fewer than 5 newest videos the search finds count too, and the baseline says it is biased', () => {
  const list = [v('a', 100, 3), v('b', 200, 4), v('s1', 9000, 20, { from: 'search' }), v('s2', 8000, 30, { from: 'search' })].map((x) => ({ ...x, ageDays: 5 }));
  const b = tiktokBaseline(list);
  assert.equal(b.biased, true);
  assert.equal(b.medianPlays, 4100);
});

test('report: outlier score = plays ÷ baseline, standout at the outlier multiple, newest first', () => {
  const profile = { username: 'x', followers: 1000, likes: 5000, videoCount: 10 };
  const r = tiktokChannelReport(profile, [v('old', 100, 9), v('hit', 1000, 3, { hashtags: ['a'] }), v('n1', 100, 4, { hashtags: ['a'] }), v('n2', 100, 5), v('n3', 100, 6)], { now: NOW, outlierMultiple: 3 });
  assert.deepEqual(r.videos.map((x) => x.id), ['hit', 'n1', 'n2', 'n3', 'old']);
  assert.equal(r.stats.medianPlays, 100);
  assert.deepEqual(r.videos.map((x) => x.outlierScore), [10, 1, 1, 1, 1]);
  assert.deepEqual(r.videos.filter((x) => x.standout).map((x) => x.id), ['hit']);
  assert.equal(r.stats.playsPerFollower, 0.1);
  assert.equal(r.stats.likesPerVideo, 500);
  assert.equal(r.stats.postsPerWeek, 4.7, '4 gaps over 6 days');
  assert.deepEqual(r.hashtags.map((h) => [h.label, h.count, h.medianScore]), [['#a', 2, 5.5]]);
});

test('captions lose hashtags and mentions before phrase mining', () => {
  assert.equal(captionText('Mẹo hay #quoctich nhé @ban.than  '), 'Mẹo hay nhé');
});

test('follow check: nothing is new on the first check; later, unseen ids are new; outliers are kept even past the first 12', () => {
  const vids = Array.from({ length: 15 }, (_, i) => ({ id: `v${i}`, title: '', url: '', thumb: null, views: 1, score: 1, ageDays: i, standout: i === 14 }));
  const first = followScan(vids, [], { at: 'T1' });
  assert.deepEqual(first.lastScan.newIds, []);
  assert.equal(first.lastScan.videos.length, 13, '12 newest + the old outlier');
  assert.deepEqual(first.lastScan.outlierIds, ['v14']);
  const next = followScan([{ ...vids[0], id: 'fresh' }, ...vids], first.seen, { at: 'T2' });
  assert.deepEqual(next.lastScan.newIds, ['fresh']);
  assert.equal(next.seen.length, 16);
});
