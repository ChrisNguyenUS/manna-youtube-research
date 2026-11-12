import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeTikTok, FAKE_VIDEOS } from '../../src/sources/fake/tiktok.js';

test('topic keywords: TikTok suggestions, topic first, other country dropped', async () => {
  const r = await testApp().features.tiktokTopicKeywords({ topic: 'thi quốc tịch mỹ' });
  assert.equal(r.keywords[0].keyword, 'thi quốc tịch mỹ');
  assert.equal(r.keywords.find((k) => k.keyword === 'thi quốc tịch nhật').dropped, 'nước khác');
  assert.ok(!r.keywords.some((k) => k.keyword.endsWith('2026')));
});

test('topic scan: one column per keyword, filtered and ranked, top 3 readable comments, saved as it goes', async () => {
  const a = testApp();
  const steps = [];
  const r = await a.features.tiktokTopicScan({ topic: 'thi quốc tịch mỹ', keywords: 'thi quốc tịch mỹ, phỏng vấn quốc tịch mỹ', perKeyword: 3, minPlays: 1000 }, (p) => steps.push(p));
  const rec = a.store.records.get('local', r.id);
  assert.equal(rec.kind, 'tiktok_topic');
  const d = rec.data;
  assert.equal(d.status, 'done');
  assert.deepEqual(d.columns.map((c) => c.keyword), ['thi quốc tịch mỹ', 'phỏng vấn quốc tịch mỹ']);
  assert.equal(d.columns[0].videos.length, 3);
  assert.deepEqual(d.columns[0].videos.map((v) => v.rank), [1, 2, 3]);
  assert.ok(d.columns[0].videos[0].topComments.length <= 3);
  assert.ok(d.columns[0].videos[0].topComments.every((c) => !('author' in c)), 'no commenter identity');
  assert.equal(d.summary.videos, 3, 'the same videos under two keywords count once');
  assert.ok(steps.some((p) => p.recordId === r.id), 'progress points at the record so the screen can show finished columns');
  assert.equal(d.previous, null);
});

test('without keywords the scan finds them itself; a rescan compares views with the last scan', async () => {
  const tt = createFakeTikTok();
  const a = testApp(undefined, tt);
  const first = await a.features.tiktokTopicScan({ topic: 'thi quốc tịch mỹ', maxKeywords: 3, perKeyword: 5 }, () => {});
  const d1 = a.store.records.get('local', first.id).data;
  assert.equal(d1.columns.length, 3);
  assert.ok(d1.keywords.length > 3, 'all suggestions kept so the screen can show what was left out');
  // Views grow and one new video shows up before the rescan.
  const grown = FAKE_VIDEOS.map((v) => ({ ...v, plays: v.plays + 5000 }));
  const tt2 = createFakeTikTok({ videos: [...grown, { ...grown[0], id: '7000000000000000099' }] });
  a.features.tiktokTopicScan = (await import('../../src/features/tiktok/topic.js')).makeTikTokTopicScan({ tiktok: tt2, records: { add: (k, t, o) => a.store.records.add('local', k, t, o), update: (id, d) => a.store.records.update('local', id, d), latestByRef: (k, ref) => a.store.records.latestByRef('local', k, ref) }, now: Date.now });
  const second = await a.features.tiktokTopicScan({ topic: 'Thi quốc tịch Mỹ', keywords: 'thi quốc tịch mỹ', perKeyword: 10 }, () => {});
  const d2 = a.store.records.get('local', second.id).data;
  assert.equal(d2.previous.id, first.id, 'accents and case do not split a topic');
  const vids = d2.columns[0].videos;
  assert.ok(vids.some((v) => v.gain === 5000));
  assert.ok(vids.some((v) => v.isNew));
});

test('a keyword that fails becomes a column with an error; the scan goes on', async () => {
  const tt = createFakeTikTok();
  const orig = tt.searchVideos;
  tt.searchVideos = async (q, o) => (q === 'hỏng' ? Promise.reject(new Error('TikTok lỗi')) : orig(q, o));
  const a = testApp(undefined, tt);
  const r = await a.features.tiktokTopicScan({ topic: 'thi quốc tịch mỹ', keywords: 'hỏng, thi quốc tịch mỹ' }, () => {});
  const d = a.store.records.get('local', r.id).data;
  assert.equal(d.columns[0].error, 'TikTok lỗi');
  assert.ok(d.columns[1].videos.length > 0);
});

test('login wall stops the scan and the half-done record is not used as the next baseline', async () => {
  const tt = createFakeTikTok();
  tt.searchVideos = async () => Promise.reject(Object.assign(new Error('đăng nhập'), { code: 'tiktok_login_required' }));
  const a = testApp(undefined, tt);
  await assert.rejects(() => a.features.tiktokTopicScan({ topic: 'x', keywords: 'x' }, () => {}), (/** @type {any} */ e) => e.code === 'tiktok_login_required');
  assert.equal(a.store.records.latestByRef('local', 'tiktok_topic', 'x').data.status, 'failed');
});

test('off-topic videos are left out of a column and listed; a keyword that mostly brings unrelated videos is flagged as junk', async () => {
  const mk = (id, caption, hashtags = [], plays = 200_000) => ({ ...FAKE_VIDEOS[0], id, caption, hashtags, plays });
  const byKeyword = {
    'di trú mỹ': [mk('7100000000000000001', 'Luật di trú mới', ['dinhcumy', 'thexanhmy']), mk('7100000000000000002', 'Tin di trú hôm nay', ['dinhcumy', 'thexanhmy']), mk('7100000000000000003', 'Ông Trump siết thẻ xanh', ['dinhcumy', 'thexanhmy'])],
    'Di Trú Mỹ - Vogue': [mk('7100000000000000004', 'JISOO in VOGUE CHINA', ['jisoo'], 2_600_000), mk('7100000000000000005', 'Vogue dance', ['dance']), mk('7100000000000000006', 'phonk session', ['phonk']), mk('7100000000000000007', 'Di trú Mỹ cần biết', ['dinhcumy'])],
  };
  const tt = createFakeTikTok();
  tt.searchVideos = async (q) => (byKeyword[q] ?? []).map((v) => ({ ...v, query: q }));
  const a = testApp(undefined, tt);
  const r = await a.features.tiktokTopicScan({ topic: 'di trú mỹ', keywords: 'di trú mỹ, Di Trú Mỹ - Vogue', topComments: 0 }, () => {});
  const d = a.store.records.get('local', r.id).data;
  assert.equal(d.columns[0].videos.length, 3, '"Ông Trump siết thẻ xanh" kept through the topic hashtags');
  const vogue = d.columns[1];
  assert.equal(vogue.junk, true);
  assert.deepEqual(vogue.videos.map((v) => v.caption), ['Di trú Mỹ cần biết']);
  assert.equal(vogue.offTopic, 3);
  assert.equal(vogue.offTopicVideos[0].caption, 'JISOO in VOGUE CHINA');
  assert.deepEqual(d.summary.junkKeywords, ['Di Trú Mỹ - Vogue']);
  const all = await a.features.tiktokTopicScan({ topic: 'di trú mỹ', keywords: 'Di Trú Mỹ - Vogue', keepOffTopic: true, topComments: 0 }, () => {});
  assert.equal(a.store.records.get('local', all.id).data.columns[0].videos.length, 4, 'keepOffTopic keeps them');
});

test('video search lists what the on-topic rule dropped, with the reason', async () => {
  const r = await testApp().features.tiktokSearch({ keywords: 'thi quốc tịch mỹ' }, () => {});
  assert.ok(r.offTopicVideos.some((v) => v.caption === 'Đi thi chỉ để biết giải nhì' && v.reason === 'không khớp chủ đề'));
});
