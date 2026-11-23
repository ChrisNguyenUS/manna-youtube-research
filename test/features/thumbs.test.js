import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeThumbs, isThumbUrl } from '../../src/features/thumbs.js';

const IMG = 'https://p16-sign-va.tiktokcdn.com/obj/cover.jpeg?x-expires=1';
const fakeFetch = () => {
  const calls = [];
  const f = async (u) => {
    calls.push(u);
    return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  };
  return { f, calls };
};

test('only TikTok image hosts over https are fetched', () => {
  assert.ok(isThumbUrl(IMG));
  assert.ok(isThumbUrl('https://p19-common-sign.tiktokcdn-us.com/a.webp'));
  for (const u of ['http://p16.tiktokcdn.com/a.jpg', 'https://evil.com/tiktokcdn.com/a.jpg', 'https://tiktokcdn.com.evil.com/a', 'https://127.0.0.1/x', 'file:///etc/passwd', '']) assert.ok(!isThumbUrl(u), u);
});

test('an image is fetched once, kept on disk, and served from the copy afterwards', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbs-'));
  const { f, calls } = fakeFetch();
  const t = makeThumbs({ dir, fetchImpl: /** @type {any} */ (f) });
  const a = await t.get(IMG);
  const b = await t.get(IMG);
  assert.deepEqual([a?.type, [...(b?.body ?? [])], calls.length], ['image/jpeg', [1, 2, 3], 1]);
  assert.equal(await t.get('https://example.com/a.jpg'), null);
  assert.equal(calls.length, 1, 'other hosts are never fetched');
});

test('warm keeps every TikTok image of a saved result and skips other links', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbs-'));
  const { f, calls } = fakeFetch();
  const t = makeThumbs({ dir, fetchImpl: /** @type {any} */ (f) });
  t.warm({ videos: [{ cover: IMG }, { cover: IMG }, { url: 'https://www.tiktok.com/@a/video/1' }], author: { avatar: 'https://p16.ibyteimg.com/a.jpg' } });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(calls.sort(), ['https://p16.ibyteimg.com/a.jpg', IMG].sort());
});
