import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCount, parseRelativeAge, parseDuration, parseJoined, classifyInput } from '../src/yt/parse.js';
import { buildSearchParams, durationBucket, parseChannelRenderer } from '../src/yt/search.js';
import { addVideoMetrics, channelStats, median, durationBuckets } from '../src/analysis/metrics.js';
import { titlePatterns, titlePhrases, classifyComment, tokenize } from '../src/analysis/text.js';

test('parseCount', () => {
  assert.equal(parseCount('11,093,866 views'), 11093866);
  assert.equal(parseCount('1.2M views'), 1200000);
  assert.equal(parseCount('783K subscribers'), 783000);
  assert.equal(parseCount('2.3B views'), 2300000000);
  assert.equal(parseCount('No views'), 0);
  assert.equal(parseCount('1 view'), 1);
  assert.equal(parseCount(''), null);
  assert.equal(parseCount('47'), 47);
});

test('parseRelativeAge', () => {
  assert.equal(parseRelativeAge('1 day ago'), 1);
  assert.equal(parseRelativeAge('Streamed 2 weeks ago'), 14);
  assert.ok(Math.abs(parseRelativeAge('9 months ago') - 274) < 1);
  assert.ok(parseRelativeAge('3 hours ago') < 1);
  assert.equal(parseRelativeAge('Premiered Jan 1'), null);
});

test('parseDuration', () => {
  assert.equal(parseDuration('19:53'), 1193);
  assert.equal(parseDuration('1:07:32'), 4052);
  assert.equal(parseDuration('SHORTS'), null);
});

test('parseJoined', () => {
  assert.equal(parseJoined('Joined Mar 22, 2023'), '2023-03-22');
});

test('classifyInput', () => {
  assert.deepEqual(classifyInput('https://www.youtube.com/watch?v=WI29qBvzUXI&t=2626s'), { type: 'video', id: 'WI29qBvzUXI' });
  assert.deepEqual(classifyInput('@BlackJournals'), { type: 'handle', url: 'https://www.youtube.com/@BlackJournals' });
  assert.deepEqual(classifyInput('https://www.youtube.com/channel/UCWCreFX8bTVLJ6Y9lh6eZ5A'), { type: 'channel', id: 'UCWCreFX8bTVLJ6Y9lh6eZ5A' });
});

test('search params match YouTube filter menu', () => {
  // Values copied from YouTube's own filter links (2026-11-06).
  assert.equal(buildSearchParams({ sort: 'popularity', upload: 'year', type: 'video', duration: 'mid4to20' }), 'CAMSBggFEAEYAw==');
  assert.equal(buildSearchParams({ sort: 'popularity', upload: 'week', type: 'video', duration: 'mid4to20' }), 'CAMSBggDEAEYAw==');
  assert.equal(buildSearchParams({ sort: 'popularity', upload: 'year', type: 'video', duration: 'over20' }), 'CAMSBggFEAEYAg==');
  assert.equal(buildSearchParams({ sort: 'relevance', type: 'channel' }), 'EgIQAg==');
  assert.equal(buildSearchParams({ sort: 'popularity', upload: 'year', type: 'video', duration: 'mid4to20', cc: true }), 'CAMSCAgFEAEYAzAB');
});

test('durationBucket only narrows when it contains the range', () => {
  assert.equal(durationBucket(240, 1200), 'mid4to20');
  assert.equal(durationBucket(1200, null), 'over20');
  assert.equal(durationBucket(null, 240), 'under4');
  assert.equal(durationBucket(600, 1800), 'any');
});

test('channel renderer swaps handle and subscriber fields', () => {
  const c = parseChannelRenderer({ channelId: 'UC1', title: { simpleText: 'X' }, subscriberCountText: { simpleText: '@x' }, videoCountText: { simpleText: '252K subscribers' } });
  assert.equal(c.handle, '@x');
  assert.equal(c.subs, 252000);
});

test('outlier and views/day', () => {
  const now = Date.parse('2026-11-06T00:00:00Z');
  const [a, b, c] = addVideoMetrics(
    [
      { id: 'a', views: 100000, channelSubs: 10000, publishedAt: '2026-10-27T00:00:00Z' },
      { id: 'b', views: 5000, channelSubs: 300, ageDays: 5 },
      { id: 'c', views: 10, channelSubs: 1000, ageDays: 0.2 },
    ],
    { minSubs: 500, now },
  );
  assert.equal(a.outlier, 10);
  assert.equal(a.viewsPerDay, 10000);
  assert.equal(a.ageExact, true);
  assert.equal(b.outlier, null, 'channels under minSubs are ignored');
  assert.equal(c.viewsPerDay, 10, 'age is floored to 1 day');
});

test('channelStats', () => {
  const vids = [
    { views: 100, ageDays: 2 },
    { views: 300, ageDays: 6 },
    { views: 5000, ageDays: 20 },
    { views: 200, ageDays: 40 },
  ];
  const s = channelStats({ subs: 1000, joined: null }, vids, { outlierMultiple: 3 });
  assert.equal(s.medianViews, 250);
  assert.equal(s.views7d, 400);
  assert.equal(s.views30d, 5400);
  assert.equal(s.outlierCount, 1);
  assert.equal(s.lastUploadDays, 2);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(durationBuckets([{ durationSec: 700, views: 5 }])[0].key, '10-20');
});

test('Vietnamese title patterns and comment classification', () => {
  const vids = [
    { id: '1', title: '7 SỰ THẬT không ai kể về Hà Nội', outlier: 5 },
    { id: '2', title: 'Tại sao người Việt thích ăn phở?', outlier: 1 },
    { id: '3', title: 'Câu chuyện người lính già | Ký ức', outlier: 2 },
    { id: '4', title: 'Bí mật không ai kể', outlier: 3 },
  ];
  const keys = titlePatterns(vids).map((p) => p.key);
  assert.ok(keys.includes('number'));
  assert.ok(keys.includes('question'));
  assert.ok(keys.includes('secret'));
  assert.ok(keys.includes('caps'));
  assert.ok(titlePhrases(vids, { metric: 'outlier' }).some((p) => p.phrase === 'không ai kể'));
  assert.equal(classifyComment('Cái này là gì vậy').question, true);
  assert.equal(classifyComment('Ad ơi làm phần 2 đi').request, true);
  assert.equal(classifyComment('Giọng AI khó nghe quá').complaint, true);
  assert.equal(classifyComment('Hay quá').question, false);
  assert.deepEqual(tokenize('Kể chuyện #history @abc https://x.y'), ['kể', 'chuyện']);
});

import { regionsFor, mergeByRegion } from '../src/yt/search.js';
import { realGl, configure } from '../src/yt/innertube.js';

test('global mode: regions and merge', () => {
  assert.deepEqual(regionsFor('VN'), ['VN']);
  assert.deepEqual(regionsFor('GLOBAL', 'us, gb,US,xx1'), ['US', 'GB']);
  assert.deepEqual(regionsFor('GLOBAL', ''), ['US']);
  const merged = mergeByRegion([
    { gl: 'US', list: [{ id: 'a', views: 10 }, { id: 'b', views: 5 }] },
    { gl: 'VN', list: [{ id: 'c', views: 7 }, { id: 'a', views: 12 }] },
  ]);
  assert.deepEqual(merged.map((x) => x.id), ['a', 'c', 'b'], 'round-robin keeps each region top near the top');
  assert.deepEqual(merged[0].regions, ['US', 'VN']);
  assert.equal(merged[0].views, 12);
  configure({ gl: 'GLOBAL' });
  assert.equal(realGl(), 'US', 'a request never sends GLOBAL to YouTube');
  assert.equal(realGl('VN'), 'VN');
  configure({ gl: 'US' });
});
