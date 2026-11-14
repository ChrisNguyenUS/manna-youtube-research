// test/core/video-metrics.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoRow } from '../../src/core/video/metrics.js';
import { METRICS } from '../../src/core/metrics/definitions.js';

const NOW = Date.parse('2026-11-13T00:00:00Z');

test('videoRow (tiktok): engagement counts like + comment + share + save over plays', () => {
  const r = videoRow({ plays: 10000, likes: 500, comments: 40, shares: 10, saves: 50, createdAt: '2026-11-03T00:00:00Z' }, 'tiktok', NOW);
  assert.deepEqual(r, { views: 10000, ageDays: 10, viewsPerDay: 1000, engagementRate: 0.06 });
});

test('videoRow (youtube): engagement counts like + comment over views, date from publishedAt', () => {
  const r = videoRow({ views: 2000, likes: 90, comments: 10, publishedAt: '2026-11-11T00:00:00Z' }, 'youtube', NOW);
  assert.deepEqual(r, { views: 2000, ageDays: 2, viewsPerDay: 1000, engagementRate: 0.05 });
});

test('videoRow: a video younger than a day is divided by one day; missing date or views give nulls, not NaN', () => {
  assert.equal(videoRow({ plays: 800, likes: 0, comments: 0, shares: 0, saves: 0, createdAt: '2026-11-12T18:00:00Z' }, 'tiktok', NOW).viewsPerDay, 800);
  assert.deepEqual(videoRow({ plays: 0, likes: 5, comments: 0, shares: 0, saves: 0, createdAt: null }, 'tiktok', NOW), { views: 0, ageDays: null, viewsPerDay: null, engagementRate: null });
  assert.deepEqual(videoRow({ likes: null, comments: null, publishedAt: null }, 'youtube', NOW), { views: null, ageDays: null, viewsPerDay: null, engagementRate: null });
});

test('words per minute is defined once in the metric registry', () => {
  assert.equal(METRICS.wordsPerMinute.label.vi, 'Tốc độ nói');
  assert.match(METRICS.wordsPerMinute.formula, /10 giây/);
});
