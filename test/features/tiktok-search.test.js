import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeTikTok, FAKE_VIDEOS } from '../../src/sources/fake/tiktok.js';

test('strict filter drops off-topic, ranks by hot score, counts what was dropped', async () => {
  const a = testApp();
  const r = await a.features.tiktokSearch({ keywords: 'thi quốc tịch mỹ' }, () => {});
  // hot: v1 (900+40+10+20)/(2+2)=242.5 · v4 (500+0+10+20)/(1+2)=176.7 · v2 (300+40+10+20)/(10+2)=30.8
  assert.deepEqual(r.videos.map((v) => v.id), ['7000000000000000001', '7000000000000000004', '7000000000000000002']);
  assert.equal(r.videos.every((v) => v.onTopic), true);
  assert.equal(r.counts.offTopic, 1);
  assert.equal(r.counts.zeroComment, 1);
  for (let i = 1; i < r.videos.length; i++) assert.ok((r.videos[i - 1].hotScore ?? -1) >= (r.videos[i].hotScore ?? -1));
  assert.equal(a.store.records.get('local', r.id).kind, 'tiktok_search');
});

test('keepOffTopic keeps everything; two keywords merge and dedupe', async () => {
  const r = await testApp().features.tiktokSearch({ keywords: ['thi quốc tịch mỹ', 'phỏng vấn quốc tịch'], keepOffTopic: true }, () => {});
  assert.equal(r.videos.length, FAKE_VIDEOS.length);
  assert.equal(r.counts.duplicates, FAKE_VIDEOS.length);
  assert.ok(r.videos[0].queries.length >= 1);
});

test('every keyword blocked → tiktok_blocked; setup missing → tiktok_setup_required', async () => {
  await assert.rejects(() => testApp(undefined, createFakeTikTok({ videos: [] })).features.tiktokSearch({ keywords: 'x' }, () => {}), (/** @type {any} */ e) => e.code === 'tiktok_blocked');
  await assert.rejects(() => testApp(undefined, createFakeTikTok({ searchReady: false })).features.tiktokSearch({ keywords: 'x' }, () => {}), (/** @type {any} */ e) => e.code === 'tiktok_setup_required');
});

test('save:false writes no record', async () => {
  const a = testApp();
  const r = await a.features.tiktokSearch({ keywords: 'thi quốc tịch mỹ' }, () => {}, { save: false });
  assert.equal(r.id, null);
  assert.equal(a.store.records.list('local', 'tiktok_search').length, 0);
});
