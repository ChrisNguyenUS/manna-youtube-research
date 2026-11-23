// One "Thu thập bình luận" screen for both platforms (web/views/comment-collect.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Loaded by URL: web/ is not type-checked.
const { readLinks } = await import(new URL('../web/comment-links.js', import.meta.url).href);
const { ITEMS } = await import(new URL('../web/nav.js', import.meta.url).href);

test('both platforms open the same screen under their own path, so old links keep working', () => {
  const collect = ITEMS.find((it) => it.label === 'Collect Comments');
  const tt = collect.platforms.tiktok[0];
  const yt = collect.platforms.youtube[0];
  assert.deepEqual([tt[0], tt[1], yt[0], yt[1]], ['/tiktok/comments', 'Theo link', '/comments', 'Theo link']);
  assert.equal(String(tt[2]), String(yt[2]), 'one module');
  assert.ok(!fs.existsSync('web/views/comments.js') && !fs.existsSync('web/views/tiktok/comments.js'));
});

test('links are read per platform: valid ones with their id, duplicates, and lines of the other platform', () => {
  const tt = readLinks('https://www.tiktok.com/@a/video/7674941877212302599?lang=vi\nhttps://vm.tiktok.com/ZMabc/\nhttps://www.tiktok.com/@a/video/7674941877212302599\nhttps://youtu.be/tgg58EbifsI', 'tiktok');
  assert.deepEqual([tt.ok.map((x) => x.id), tt.dup.length, tt.bad.length], [['7674941877212302599', null], 1, 1]);
  const yt = readLinks('https://www.youtube.com/watch?v=tgg58EbifsI&t=3\nyoutu.be/aaaaaaaaaaa\nhttps://www.youtube.com/shorts/bbbbbbbbbbb, ccccccccccc\nhttps://youtu.be/tgg58EbifsI\nhttps://www.tiktok.com/@a/video/7674941877212302599', 'youtube');
  assert.deepEqual(yt.ok.map((x) => x.id), ['tgg58EbifsI', 'aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
  assert.equal(yt.ok[0].link, 'https://www.youtube.com/watch?v=tgg58EbifsI');
  assert.deepEqual([yt.dup.length, yt.bad.length], [1, 1]);
});
