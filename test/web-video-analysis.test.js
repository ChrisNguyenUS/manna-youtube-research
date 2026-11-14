// test/web-video-analysis.test.js
// The web UI has no DOM tests; this pins the wiring a refactor could silently drop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KINDS, recordHref, jobHref } from '../web/kinds.js';

test('video analysis is a known result kind that opens on its own screen', () => {
  assert.deepEqual(KINDS.tiktok_video_analysis, { label: 'Phân tích video', path: '/tiktok/video', icon: 'bars', platform: 'tiktok' });
  assert.equal(recordHref({ id: 7, kind: 'tiktok_video_analysis' }), '#/tiktok/video?id=7');
  assert.equal(jobHref({ kind: 'tiktok_video_analysis', status: 'running' }), '#/tiktok/video');
  assert.equal(jobHref({ kind: 'tiktok_video_analysis', status: 'succeeded', result: { id: 9 } }), '#/tiktok/video?id=9');
});

test('the screen is in the TikTok group of the sidebar and has a job label', () => {
  const app = fs.readFileSync('web/app.js', 'utf8');
  assert.match(app, /label: 'Phân tích video', tabs: \[\['\/tiktok\/video', 'Phân tích video', \(\) => import\('\.\/views\/tiktok\/video\.js'\)\]\]/);
  assert.match(fs.readFileSync('web/lib.js', 'utf8'), /tiktok_video_analysis: 'Phân tích video TikTok'/);
});

test('the result component never calls the server itself', () => {
  const src = fs.readFileSync('web/components/video-analysis.js', 'utf8');
  assert.ok(!/http\/client\.js/.test(src), 'components get data and callbacks; only views talk to the API');
});
