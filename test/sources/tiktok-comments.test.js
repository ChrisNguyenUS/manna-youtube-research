import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTikTokHttp } from '../../src/sources/tiktok/http.js';
import { makeComments } from '../../src/sources/tiktok/comments.js';
import { runWithSignal, CancelledError } from '../../src/core/cancel.js';

const fx = (n) => JSON.parse(fs.readFileSync(`src/sources/tiktok/fixtures/${n}.json`, 'utf8'));
const res = (body, { status = 200, url = '' } = {}) => ({ ok: status < 400, status, url, json: async () => body });
const noSleep = async () => {};

test('pages through comments, dedupes overlap, fetches replies', async () => {
  const calls = [];
  const fetch = async (u) => {
    calls.push(u);
    if (u.includes('/reply/')) return res(fx('reply-page'));
    if (u.includes('cursor=0')) return res(fx('comment-page'));
    return res({ status_code: 0, has_more: 0, cursor: 0, comments: [{ cid: 'c1', text: 'dup', digg_count: 1 }, { cid: 'c3', text: 'mới', digg_count: 1 }] });
  };
  const c = makeComments(createTikTokHttp({ fetch, sleep: noSleep }));
  const r = await c.getComments('7376610463154572560', { max: 300, replies: true });
  assert.deepEqual(r.comments.filter((x) => !x.isReply).map((x) => x.id), ['c1', 'c2', 'c3']);
  assert.deepEqual(r.comments.filter((x) => x.isReply).map((x) => [x.id, x.parentId]), [['r1', 'c1']]);
  assert.equal(r.total, 1003);
  assert.equal(calls.filter((u) => u.includes('/reply/')).length, 1, 'only c1 has replies');
});

test('respects max and replies=false', async () => {
  const fetch = async () => res(fx('comment-page'));
  const r = await makeComments(createTikTokHttp({ fetch, sleep: noSleep })).getComments('1', { max: 1, replies: false });
  assert.equal(r.comments.length, 1);
});

test('retries 5xx/429 then gives up with an error', async () => {
  let n = 0;
  const fetch = async () => (n++, res({}, { status: 503 }));
  const http = createTikTokHttp({ fetch, sleep: noSleep, retries: 4 });
  await assert.rejects(() => http.getJson('https://www.tiktok.com/api/x'), /503/);
  assert.equal(n, 4);
});

test('short links resolve through redirects; profile links and junk are rejected (Review Focus #2)', async () => {
  const fetch = async (u) => res(null, { url: u.includes('vm.tiktok.com') ? 'https://www.tiktok.com/@a/video/7376610463154572560?x=1' : u });
  const c = makeComments(createTikTokHttp({ fetch, sleep: noSleep }));
  assert.deepEqual(await c.resolveVideo('https://vm.tiktok.com/ZMabc/'), { id: '7376610463154572560', url: 'https://www.tiktok.com/@a/video/7376610463154572560' });
  assert.deepEqual(await c.resolveVideo('https://www.tiktok.com/@a/photo/7376610463154572561'), { id: '7376610463154572561', url: 'https://www.tiktok.com/@a/photo/7376610463154572561' });
  await assert.rejects(() => c.resolveVideo('https://www.tiktok.com/@creator1'), /link video TikTok/);
  await assert.rejects(() => c.resolveVideo('rác'), /link video TikTok/);
});

test('a cancelled job makes no TikTok request', async () => {
  let n = 0;
  const http = createTikTokHttp({ fetch: async () => (n++, res(fx('comment-page'))), sleep: noSleep });
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(() => runWithSignal(ac.signal, 1, () => http.getJson('https://www.tiktok.com/api/x')), CancelledError);
  assert.equal(n, 0);
});
