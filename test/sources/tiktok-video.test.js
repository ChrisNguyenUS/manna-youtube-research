// test/sources/tiktok-video.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTikTokSource } from '../../src/sources/tiktok/index.js';

const fx = (n) => fs.readFileSync(`src/sources/tiktok/fixtures/${n}`, 'utf8');
/** A fetch that serves text by URL; `seen` records what was asked. */
function fakeFetch(routes, seen = []) {
  return async (u) => {
    seen.push(u);
    const body = Object.entries(routes).find(([k]) => u.includes(k))?.[1];
    if (body instanceof Error) throw body;
    return { status: body == null ? 404 : 200, url: u, text: async () => body ?? '', json: async () => JSON.parse(body ?? 'null') };
  };
}
const source = (routes, seen) => createTikTokSource({ fetch: fakeFetch(routes, seen), hasPlaywright: () => false, sleep: async () => {} });
const LINK = 'https://www.tiktok.com/@creator1/video/7662369308550401287';

test('getVideo: one page load gives the numbers; the speech-recognition subtitle becomes the transcript', async () => {
  const seen = [];
  const r = await source({ '/video/7662369308550401287': fx('video-page.html'), 'sub-vi.vtt': fx('subtitle.vtt') }, seen).getVideo(`${LINK}?is_from_webapp=1&sender_device=pc`);
  assert.equal(r.video.plays, 251000);
  assert.equal(r.video.url, LINK, 'tracking parameters are not kept');
  assert.equal(r.transcript.language, 'vie-VN');
  assert.equal(r.transcript.kind, 'auto');
  assert.equal(r.transcript.segments.length, 3);
  assert.equal(r.transcript.segments[0].text, 'kết hôn với người Mỹ');
  assert.deepEqual(seen, [LINK, 'https://v16.example/sub-vi.vtt'], 'two requests, and never the machine translation');
});

test('getVideo: an empty, broken or unreachable subtitle file means no transcript, not a failed video', async () => {
  for (const sub of ['', '<html>Access Denied</html>', new Error('socket hang up')]) {
    const r = await source({ '/video/7662369308550401287': fx('video-page.html'), 'sub-vi.vtt': sub }).getVideo(LINK);
    assert.equal(r.video.id, '7662369308550401287');
    assert.equal(r.transcript, null);
  }
});

test('getVideo: removed video → video_unavailable; challenge page → tiktok_blocked; not a TikTok link → plain error', async () => {
  await assert.rejects(() => source({ '/video/': fx('video-page-gone.html') }).getVideo(LINK), (/** @type {any} */ e) => e.code === 'video_unavailable' && /riêng tư/.test(e.message));
  await assert.rejects(() => source({ '/video/': '<html>Verify</html>' }).getVideo(LINK), (/** @type {any} */ e) => e.code === 'tiktok_blocked');
  await assert.rejects(() => source({}).getVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), /Không phải link video TikTok/);
});
