import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';

test('channel analysis keeps likes, comments and the detail sample size for the newest videos only', async () => {
  const a = testApp();
  const r = await a.features.analyzeChannel('@nho', {}, () => {});
  const d = a.store.records.get('local', r.id).data;
  const detailed = d.videos.filter((v) => v.detailed);
  assert.equal(d.stats.detailSample, detailed.length);
  assert.ok(detailed.length > 0 && detailed.length <= 30);
  assert.deepEqual([detailed[0].likes, detailed[0].comments], [10, 3]);
  const rest = d.videos.filter((v) => !v.detailed);
  assert.ok(rest.every((v) => v.likes === undefined && v.comments === undefined), 'unknown numbers are left out, not set to 0');
});

test('history: one snapshot per saved analysis of the channel, oldest first; other channels are left out', async () => {
  const a = testApp();
  await a.features.analyzeChannel('@nho', {}, () => {});
  await a.features.analyzeChannel('@to', {}, () => {});
  await a.features.analyzeChannel('@nho', {}, () => {});
  const h = a.features.channelHistory('UC_small_______________');
  assert.equal(h.length, 2);
  assert.ok(h[0].recordId < h[1].recordId);
  assert.equal(h[0].subs, 5000);
  assert.equal(h[0].totalViews, 2e6);
  assert.ok(Object.keys(h[0].views).length > 0, 'views of each video at that time');
  assert.deepEqual(a.features.channelHistory('UC_nobody'), []);
});
