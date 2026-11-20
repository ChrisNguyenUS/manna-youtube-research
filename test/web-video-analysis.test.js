// test/web-video-analysis.test.js
// The web UI has no DOM tests; this pins the wiring a refactor could silently drop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KINDS, recordHref, jobHref } from '../web/kinds.js';

test('video analysis of either platform is a known result kind that opens on the one screen', () => {
  assert.deepEqual(KINDS.tiktok_video_analysis, { label: 'Phân tích video', path: '/video', icon: 'bars', platform: 'tiktok' });
  assert.deepEqual(KINDS.video_analysis, { label: 'Phân tích video', path: '/video', icon: 'bars', platform: 'youtube' });
  assert.equal(recordHref({ id: 7, kind: 'tiktok_video_analysis' }), '#/video?id=7');
  assert.equal(recordHref({ id: 8, kind: 'video_analysis' }), '#/video?id=8');
  assert.equal(jobHref({ kind: 'video_analysis', status: 'running' }), '#/video');
  assert.equal(jobHref({ kind: 'tiktok_video_analysis', status: 'succeeded', result: { id: 9 } }), '#/video?id=9');
});

test('one sidebar entry, one screen, the old path is an alias, and both jobs have a label', () => {
  const nav = fs.readFileSync('web/nav.js', 'utf8');
  assert.match(nav, /label: 'Phân tích video', tabs: \[\['\/video', 'Phân tích video', \(\) => import\('\.\/views\/video\.js'\)\]\]/);
  assert.match(nav, /'\/tiktok\/video': '\/video'/);
  assert.ok(!fs.existsSync('web/views/tiktok/video.js'));
  const lib = fs.readFileSync('web/lib.js', 'utf8');
  assert.match(lib, /tiktok_video_analysis: 'Phân tích video TikTok'/);
  assert.match(lib, /video_analysis: 'Phân tích video YouTube'/);
  const view = fs.readFileSync('web/views/video.js', 'utf8');
  for (const s of ['data-platform', 'Tự nhận', 'chạy thành hai lần', "from '../video-links.js'"]) assert.ok(view.includes(s), s);
  assert.ok(!/#\/tiktok\/video/.test(fs.readFileSync('web/views/comment-collect.js', 'utf8') + fs.readFileSync('web/components/tiktok-channel/videos.js', 'utf8')), 'links elsewhere point at #/video');
});

test('the result component never calls the server itself', () => {
  const src = fs.readFileSync('web/components/video-analysis.js', 'utf8');
  assert.ok(!/http\/client\.js/.test(src), 'components get data and callbacks; only views talk to the API');
});
