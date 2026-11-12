import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from '../features/helpers.js';
import { createFakeTikTok } from '../../src/sources/fake/tiktok.js';
import { createHttpServer } from '../../src/http/server.js';

async function boot(tiktok) {
  const app = testApp(undefined, tiktok);
  const srv = createHttpServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  return { app, base: `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}/api/v1/tiktok/videos`, close: () => srv.close() };
}
const post = (u, b, init = {}) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b), ...init });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('POST returns ranked rows with the old actor field names', async () => {
  const s = await boot();
  const r = await post(s.base, { keywords: 'thi quốc tịch mỹ' });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.sort, 'score');
  assert.deepEqual(out.ranking.weights, { trending: 0.5, engagement: 0.3, fresh: 0.2 });
  assert.equal(out.videos.length, 3, 'off-topic video dropped');
  assert.deepEqual(out.videos.map((v) => v.rank), [1, 2, 3]);
  for (let i = 1; i < out.videos.length; i++) assert.ok(out.videos[i - 1].score >= out.videos[i].score);
  const row = out.videos[0];
  for (const k of ['videoId', 'videoUrl', 'caption', 'hashtags', 'createdAt', 'durationSeconds', 'playCount', 'likeCount', 'commentCount', 'shareCount', 'saveCount',
    'engagementRate', 'hotScore', 'ageDays', 'interactions', 'authorUsername', 'authorName', 'authorVerified', 'musicTitle', 'scrapedAt',
    'playsPerDay', 'trendingScore', 'engagementScore', 'freshnessScore', 'score', 'keywordInCaption', 'searchQueries']) assert.ok(k in row, k);
  assert.equal(out.counts.offTopic, 1);
  assert.equal(out.counts.returned, 3);
  assert.equal(out.recordId, null, 'nothing saved unless asked');
  s.close();
});

test('GET works from a browser: sort, limit, repeated keywords', async () => {
  const s = await boot();
  const out = await (await fetch(`${s.base}?keywords=thi+qu%E1%BB%91c+t%E1%BB%8Bch+m%E1%BB%B9&keywords=ph%E1%BB%8Fng+v%E1%BA%A5n&sort=fresh&limit=2`)).json();
  assert.deepEqual(out.keywords, ['thi quốc tịch mỹ', 'phỏng vấn']);
  assert.equal(out.videos.length, 2);
  assert.ok(out.videos[0].ageDays <= out.videos[1].ageDays, 'newest first');
  s.close();
});

test('bad input is 400; TikTok not set up is 503 with its code', async () => {
  const s = await boot();
  assert.equal((await post(s.base, {})).status, 400);
  const bad = await post(s.base, { keywords: 'x', sort: 'views' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.field, 'sort');
  s.close();
  const t = await boot(createFakeTikTok({ searchReady: false }));
  const r = await post(t.base, { keywords: 'x' });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error.code, 'tiktok_setup_required');
  t.close();
});

test('save:true keeps the search so the web app can open it', async () => {
  const s = await boot();
  const out = await (await post(s.base, { keywords: 'thi quốc tịch mỹ', save: true })).json();
  assert.equal(s.app.store.records.get('local', out.recordId).kind, 'tiktok_search');
  s.close();
});

test('login API: status, sign in, sign out', async () => {
  const fake = createFakeTikTok();
  const s = await boot(fake);
  const url = s.base.replace(/videos$/, 'login');
  assert.equal((await (await fetch(url)).json()).loggedIn, false);
  const after = await (await post(url, {})).json();
  assert.equal(after.loggedIn, true);
  assert.equal(fake.state.logins, 1);
  assert.equal((await (await fetch(url)).json()).loggedIn, true);
  assert.equal((await (await fetch(url, { method: 'DELETE' })).json()).loggedIn, false);
  s.close();
  const t = await boot(createFakeTikTok({ searchReady: false }));
  assert.equal((await post(t.base.replace(/videos$/, 'login'), {})).status, 503);
  t.close();
});

test('one scrape at a time, and closing the request stops the scrape', async () => {
  const fake = createFakeTikTok({ delayMs: 60 });
  let running = 0;
  let peak = 0;
  const search = fake.searchVideos;
  fake.searchVideos = async (...a) => {
    peak = Math.max(peak, ++running);
    try {
      return await search(...a);
    } finally {
      running--;
    }
  };
  const s = await boot(fake);
  await Promise.all([post(s.base, { keywords: 'thi quốc tịch mỹ' }), post(s.base, { keywords: 'phỏng vấn quốc tịch' })]);
  assert.equal(peak, 1);

  const before = fake.state.searches;
  const ac = new AbortController();
  const req = post(s.base, { keywords: ['a', 'b', 'c'], keepOffTopic: true }, { signal: ac.signal }).catch(() => null);
  await sleep(30);
  ac.abort();
  await req;
  await sleep(200);
  assert.equal(fake.state.searches - before, 1, 'keywords after the disconnect are not searched');
  s.close();
});
