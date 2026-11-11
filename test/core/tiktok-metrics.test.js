import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoMetrics, attentionPerDay } from '../../src/core/tiktok/metrics.js';
import { foldForMatch, keywordInText } from '../../src/core/analysis/topic.js';
import { METRICS } from '../../src/core/metrics/definitions.js';

const NOW = Date.parse('2026-10-22T12:00:00Z');

test('video metrics follow the old pipeline formulas', () => {
  const m = videoMetrics({ likes: 100, comments: 20, shares: 5, saves: 15, plays: 1000, createdAt: '2026-10-19T12:00:00Z' }, NOW);
  assert.deepEqual(m, { interactions: 140, engagementRate: 0.14, ageDays: 3, hotScore: 28 });
});
test('no plays → engagementRate null; no date → age and hot null; future date clamps to 0', () => {
  assert.equal(videoMetrics({ likes: 1, comments: 0, shares: 0, saves: 0, plays: 0, createdAt: null }, NOW).engagementRate, null);
  assert.deepEqual(videoMetrics({ likes: 1, comments: 0, shares: 0, saves: 0, plays: 5, createdAt: null }, NOW).hotScore, null);
  assert.equal(videoMetrics({ likes: 4, comments: 0, shares: 0, saves: 0, plays: 5, createdAt: '2026-10-23T00:00:00Z' }, NOW).ageDays, 0);
});
test('attention per day = (likes + replies) / (days + 2)', () => {
  assert.equal(attentionPerDay({ likes: 685, replies: 47, createdAt: '2026-10-19T00:00:00Z' }, Date.parse('2026-10-22T00:00:00Z')), 146.4);
  assert.equal(attentionPerDay({ likes: 5, replies: 0, createdAt: null }, NOW), null);
});
test('topic match ignores accents, case and spaces (Review Focus #3)', () => {
  assert.equal(foldForMatch('Thi Quốc tịch Mỹ!'), 'thiquoctichmy');
  assert.equal(keywordInText('Đậu rồi 🎉 #thiquoctichmy #n400', ['thi quốc tịch mỹ']), true);
  assert.equal(keywordInText('đi thi chỉ để biết giải nhì', ['thi quốc tịch mỹ']), false);
  assert.equal(keywordInText('anything', ['  ']), false, 'blank keyword never matches');
});
test('registry has the TikTok metrics', () => {
  for (const id of ['hotScore', 'engagementRate', 'attentionPerDay']) assert.ok(METRICS[id]?.formula, id);
});
