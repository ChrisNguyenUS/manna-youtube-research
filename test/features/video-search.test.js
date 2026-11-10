import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';

test('video search computes outlier vs channel and view/sub, saves a record', async () => {
  const a = testApp();
  const r = await a.features.videoSearch({ keywords: 'lịch sử', upload: 'year', perKeyword: 10, exactTop: 0 }, () => {});
  const small = r.videos.find((v) => v.channelId.includes('small'));
  assert.equal(small.outlierScore, 250, '500k ÷ 2k channel median');
  assert.equal(small.viewSub, 100, '500k ÷ 5k subs');
  assert.equal(a.store.records.get('local', r.id).kind, 'video_search');
});

test('GLOBAL searches every configured region and tags videos', async () => {
  const a = testApp();
  a.store.settings.set('local', { globalRegions: 'US,VN' });
  const r = await a.features.videoSearch({ keywords: 'lịch sử', gl: 'GLOBAL', perKeyword: 5, exactTop: 0 }, () => {});
  assert.deepEqual(r.regions, ['US', 'VN']);
});

test('empty keywords are rejected', async () => {
  await assert.rejects(() => testApp().features.videoSearch({ keywords: ' , ' }, () => {}), /từ khoá/);
});
