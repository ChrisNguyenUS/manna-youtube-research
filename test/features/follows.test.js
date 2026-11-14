import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeTikTok } from '../../src/sources/fake/tiktok.js';

test('TikTok channel analysis: one record with the profile, scored videos and the biased-baseline flag', async () => {
  const a = testApp();
  const steps = [];
  const r = await a.features.tiktokChannel({ input: 'https://www.tiktok.com/@creator' }, (p) => steps.push(p));
  const rec = a.store.records.get('local', r.id);
  assert.equal(rec.kind, 'tiktok_channel');
  assert.equal(rec.ref, 'creator');
  assert.equal(rec.title, '@creator · Creator');
  const d = rec.data;
  assert.equal(d.stats.sampleSize, 14);
  assert.equal(d.stats.newestCount, 11, 'pinned and search finds are not "newest"');
  assert.equal(d.stats.searchCount, 2);
  assert.equal(d.stats.baselineBiased, false);
  assert.equal(d.stats.medianPlays, 10_250, 'the newest video (1 day old) is left out of the baseline');
  const hit = d.videos.find((v) => v.plays === 120_000);
  assert.equal(hit.outlierScore, 11.7);
  assert.equal(hit.standout, true);
  assert.equal(d.videos.find((v) => v.pinned).outlierScore, 87.8, 'pinned videos are scored but not part of the baseline');
  assert.equal(steps.at(-1).step, 'Xong');
});

test('TikTok channel analysis: an unknown creator fails with channel_not_found', async () => {
  const a = testApp();
  await assert.rejects(a.features.tiktokChannel({ input: '@nobody' }), { code: 'channel_not_found' });
});

test('follow by input: TikTok names are normalised; YouTube handles are resolved to the channel id', async () => {
  const a = testApp();
  assert.deepEqual(await a.features.follows.followInput('tiktok', 'https://www.tiktok.com/@Creator?lang=vi'), { platform: 'tiktok', ref: 'creator' });
  assert.deepEqual(await a.features.follows.followInput('youtube', '@nho'), { platform: 'youtube', ref: 'UC_small_______________' });
  assert.deepEqual(a.features.follows.keys().sort(), ['tiktok:creator', 'youtube:UC_small_______________']);
  await assert.rejects(a.features.follows.followInput('tiktok', 'không phải tên'), { code: 'invalid_input' });
});

test('refresh: every followed channel gets its latest videos; the second check marks unseen videos as new', async () => {
  const a = testApp();
  await a.features.follows.followInput('tiktok', '@creator');
  await a.features.follows.followInput('youtube', '@nho');
  const r1 = await a.features.follows.refresh({});
  assert.deepEqual(r1, { inline: true, checked: 2, failed: 0, newVideos: 0 });
  const tt = a.features.follows.list('tiktok')[0];
  assert.equal(tt.title, 'Creator');
  assert.equal(tt.data.followers, 50_000);
  assert.equal(tt.lastScan.videos.length, 12, 'profile videos only (search runs only as a fallback)');
  assert.ok(tt.lastScan.outlierIds.length >= 1);
  const yt = a.features.follows.list('youtube')[0];
  assert.ok(yt.lastScan.videos.length > 0);
  assert.ok(yt.checkedAt);

  // Pretend the earlier check had not seen the newest TikTok video.
  a.store.follows.saveScan('local', 'tiktok', 'creator', { seen: tt.seen.filter((id) => id !== tt.lastScan.videos[0].id), lastScan: tt.lastScan });
  const r2 = await a.features.follows.refresh({ platform: 'tiktok' });
  assert.equal(r2.checked, 1);
  assert.equal(r2.newVideos, 1);
  assert.deepEqual(a.features.follows.list('tiktok')[0].lastScan.newIds, [tt.lastScan.videos[0].id]);
});

test('refresh: a channel that fails keeps its previous videos and records why; the others still run', async () => {
  const a = testApp(undefined, createFakeTikTok());
  await a.features.follows.followInput('tiktok', '@creator');
  await a.features.follows.refresh({});
  a.store.follows.put('local', 'tiktok', 'nobody', '@nobody', {});
  const r = await a.features.follows.refresh({ platform: 'tiktok' });
  assert.deepEqual([r.checked, r.failed], [2, 1]);
  const [bad] = a.features.follows.list('tiktok').filter((f) => f.ref === 'nobody');
  assert.equal(bad.lastScan.error.code, 'channel_not_found');
  assert.ok(a.features.follows.list('tiktok').find((f) => f.ref === 'creator').lastScan.error === null);
});
