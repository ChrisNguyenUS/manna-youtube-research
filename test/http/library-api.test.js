// History search and the wider "Đã lưu" (TikTok videos, customer quotes, keywords) with its Markdown export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from '../features/helpers.js';
import { createHttpServer } from '../../src/http/server.js';
import { savedMarkdown } from '../../src/core/report/saved.js';

async function boot() {
  const app = testApp();
  const srv = createHttpServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  const base = `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}`;
  return { app, base, close: () => srv.close() };
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const get = async (url) => (await fetch(url)).json();

test('history search: kinds, accent-insensitive words, paging, counts', async () => {
  const s = await boot();
  const add = (kind, title) => s.app.store.records.add('local', kind, title, { data: {} });
  add('tiktok_insight', 'di trú mỹ');
  add('tiktok_topic', 'Di trú Mỹ');
  add('video_search', 'kể chuyện lịch sử');
  add('tiktok_insight', 'bảo lãnh vợ chồng');

  const all = await get(`${s.base}/api/v1/records/search`);
  assert.equal(all.total, 4);
  assert.deepEqual(all.counts, { tiktok_insight: 2, tiktok_topic: 1, video_search: 1 });
  assert.ok(!('data' in all.items[0]), 'rows stay small: no data, no params');

  const q = await get(`${s.base}/api/v1/records/search?q=${encodeURIComponent('tru MY')}`);
  assert.deepEqual(q.items.map((r) => r.kind).sort(), ['tiktok_insight', 'tiktok_topic'], 'no accents, any case, any word order');
  assert.equal((await get(`${s.base}/api/v1/records/search?q=ru`)).total, 0, 'a word must start a word of the title');

  const kinds = await get(`${s.base}/api/v1/records/search?kinds=tiktok_insight,video_search&q=${encodeURIComponent('lịch')}`);
  assert.deepEqual(kinds.items.map((r) => r.title), ['kể chuyện lịch sử']);

  const page = await get(`${s.base}/api/v1/records/search?limit=1&offset=1`);
  assert.equal(page.total, 4);
  assert.equal(page.items.length, 1);

  assert.equal((await fetch(`${s.base}/api/v1/records/${all.items[0].id}`)).status, 200, 'records/:id still answers');
  s.close();
});

test('saved: TikTok videos, quotes and keywords round-trip; unknown kinds are refused', async () => {
  const s = await boot();
  assert.equal((await post(`${s.base}/api/v1/saved`, { kind: 'tiktok_video', ref: '7', title: 'cap', data: { url: 'https://www.tiktok.com/@a/video/7', caption: 'cap', author: 'a', plays: 1200 } })).status, 200);
  assert.equal((await post(`${s.base}/api/v1/saved`, { kind: 'quote', ref: 'c1', title: 'Hồ sơ bao lâu?', data: { text: 'Hồ sơ  bao lâu?', likes: 12, replies: 3, topics: ['Mất bao lâu'], source: 'di trú mỹ' } })).status, 200);
  assert.equal((await post(`${s.base}/api/v1/saved`, { kind: 'keyword', ref: 'tiktok:bao lanh', title: 'bảo lãnh', data: { keyword: 'bảo lãnh', platform: 'tiktok' } })).status, 200);
  const bad = await post(`${s.base}/api/v1/saved`, { kind: 'password', ref: 'x' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.field, 'kind');

  assert.equal((await get(`${s.base}/api/v1/saved?kind=quote`)).length, 1);
  const r = await fetch(`${s.base}/api/v1/saved/export.md`);
  assert.match(r.headers.get('content-disposition') || '', /^attachment; filename="da-luu-\d{4}-\d\d-\d\d\.md"$/);
  const md = await r.text();
  assert.match(md, /## Câu chữ của khách \(1\)\n\n1\. "Hồ sơ bao lâu\?" \(♥ 12, 3 trả lời\) · nhóm: Mất bao lâu · chủ đề: di trú mỹ/);
  assert.match(md, /## Video TikTok \(1\)/);
  assert.match(md, /1\. bảo lãnh · TikTok/);
  const only = await (await fetch(`${s.base}/api/v1/saved/export.md?kind=keyword&inline=1`)).text();
  assert.ok(!only.includes('Video TikTok'));
  assert.equal((await fetch(`${s.base}/api/v1/saved/export.md?kind=nope`)).status, 400);
  s.close();
});

test('savedMarkdown: notes follow their item; an empty list says so', () => {
  const md = savedMarkdown([{ kind: 'video', title: 'T', note: 'hook  hay', data: { id: 'abc', title: 'T', channelTitle: 'K', views: 1500 } }], { date: '2026-11-13' });
  assert.equal(md, '# Đã lưu — 2026-11-13\n\n## Video YouTube (1)\n\n1. [T](https://www.youtube.com/watch?v=abc) · K · 1.500 view\n   - Ghi chú: hook hay\n');
  assert.match(savedMarkdown([]), /Chưa lưu gì\./);
});
