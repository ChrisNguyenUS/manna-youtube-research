// test/sources/tiktok-video-page.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseVideoPage, pickSubtitle } from '../../src/sources/tiktok/parse.js';

const html = (n) => fs.readFileSync(`src/sources/tiktok/fixtures/${n}.html`, 'utf8');

test('video page: the video with its numbers, and only WebVTT subtitles', () => {
  const p = parseVideoPage(html('video-page'));
  assert.equal(p.ok, true);
  assert.deepEqual(p.video, {
    id: '7662369308550401287', url: 'https://www.tiktok.com/@creator1/video/7662369308550401287',
    caption: 'Kết hôn giả sẽ không còn dễ #ditrumy #thexanh', hashtags: ['ditrumy', 'thexanh'], createdAt: '2024-10-19T12:00:00.000Z',
    durationSec: 47, plays: 251000, likes: 6300, comments: 412, shares: 980, saves: 1500,
    author: 'creator1', authorName: 'Creator Một', authorVerified: true, musicTitle: 'nhạc nền - Creator Một',
    cover: 'https://p16.example/cover.jpeg', query: '',
  });
  assert.deepEqual(p.subtitles, [
    { url: 'https://v16.example/sub-en.vtt', language: 'eng-US', source: 'MT' },
    { url: 'https://v16.example/sub-vi.vtt', language: 'vie-VN', source: 'ASR' },
  ]);
});

test('video page: a removed or private video is "unavailable"; a page without the data block is "blocked"', () => {
  assert.deepEqual(parseVideoPage(html('video-page-gone')), { ok: false, reason: 'unavailable' });
  assert.deepEqual(parseVideoPage('<html><body>Verify to continue</body></html>'), { ok: false, reason: 'blocked' });
  assert.deepEqual(parseVideoPage('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{not json</script>'), { ok: false, reason: 'blocked' });
  assert.deepEqual(parseVideoPage(/** @type {any} */ (undefined)), { ok: false, reason: 'blocked' });
});

test('video page: a video without subtitles has an empty list, not an error', () => {
  const page = html('video-page').replace(/,"subtitleInfos":\[.*?\]\}\}\}\}\}\}/, '}}}}}}');
  const p = parseVideoPage(page);
  assert.equal(p.ok, true);
  assert.deepEqual(p.subtitles, []);
});

test('pickSubtitle: speech recognition first, then the creator\'s own; a machine translation is never used', () => {
  const asr = { url: 'a', language: 'vie-VN', source: 'ASR' };
  const mt = { url: 'b', language: 'eng-US', source: 'MT' };
  const own = { url: 'c', language: 'vie-VN', source: 'LC' };
  assert.equal(pickSubtitle([mt, own, asr]), asr);
  assert.equal(pickSubtitle([mt, own]), own);
  assert.equal(pickSubtitle([mt]), null, 'only a machine translation: treated as no subtitles');
  assert.equal(pickSubtitle([]), null);
});
