// test/features/tiktok-video-analysis.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeTikTok, FAKE_GONE_ID } from '../../src/sources/fake/tiktok.js';
import { linksOf } from '../../src/features/shared-video-analysis.js';

const L = (id) => `https://www.tiktok.com/@creator/video/${id}`;
const A = L('7000000000000000001'); // has a transcript
const B = L('7000000000000000002'); // no subtitles
const GONE = L(FAKE_GONE_ID);

test('a batch: one record with every video, saved as it goes; a failed video does not stop the rest', async () => {
  const a = testApp();
  const steps = [];
  const r = await a.features.tiktokVideoAnalysis({ videos: `${A}\n${GONE}\n${B}` }, (p) => steps.push(p));
  const rec = a.store.records.get('local', r.id);
  assert.equal(rec.kind, 'tiktok_video_analysis');
  assert.equal(rec.title, 'Phỏng vấn quốc tịch Mỹ đậu rồi (+2)');
  const d = rec.data;
  assert.equal(d.platform, 'tiktok');
  assert.deepEqual(d.params, { videos: `${A}\n${GONE}\n${B}`, script: true, comments: 100, replies: true });
  assert.deepEqual(d.videos.map((v) => v.link), [A, GONE, B], 'rows keep the order of the pasted links');

  const [one, gone, two] = d.videos;
  assert.equal(one.error, null);
  assert.equal(one.video.plays, 10000);
  assert.equal(one.row.engagementRate, 0.097, '(900 + 40 + 10 + 20) ÷ 10 000');
  assert.equal(one.transcript.segments.length, 3);
  assert.equal(one.transcriptNote, null);
  assert.equal(one.script.hook, 'Phỏng vấn quốc tịch Mỹ đậu rồi hôm nay mình kể lại từng câu hỏi');
  assert.equal(one.comments.length, 4);
  assert.ok(one.comments.every((c) => c.videoId === one.video.id), 'comments know their video');
  assert.equal(one.groups.total, one.comments.length);
  assert.equal(one.commentsNote, null);

  assert.deepEqual(gone.error, { code: 'video_unavailable', message: 'Video không còn hoặc đang để riêng tư' });
  assert.equal(gone.video, null);
  assert.deepEqual(gone.comments, []);

  assert.equal(two.transcript, null);
  assert.equal(two.transcriptNote, 'none');
  assert.equal(two.script, null);
  assert.equal(two.video.id, '7000000000000000002');

  assert.equal(steps.at(-1).recordId, r.id);
  assert.ok(steps.some((p) => p.recordId === r.id && p.done < 3), 'the record id is reported before the batch ends, so the screen can show finished rows');
});

test('no commenter identity is stored', async () => {
  const a = testApp();
  const r = await a.features.tiktokVideoAnalysis({ videos: A }, () => {});
  const allowed = ['attentionPerDay', 'createdAt', 'id', 'isReply', 'likes', 'parentId', 'parentText', 'pinned', 'replies', 'text', 'videoId'];
  for (const c of a.store.records.get('local', r.id).data.videos[0].comments) assert.deepEqual(Object.keys(c).filter((k) => !allowed.includes(k)), []);
});

test('options: script off, no comments, no replies', async () => {
  const a = testApp();
  const off = a.store.records.get('local', (await a.features.tiktokVideoAnalysis({ videos: A, script: false, comments: 0 }, () => {})).id).data.videos[0];
  assert.equal(off.transcript, null);
  assert.equal(off.transcriptNote, 'off');
  assert.equal(off.script, null);
  assert.deepEqual(off.comments, []);
  const top = a.store.records.get('local', (await a.features.tiktokVideoAnalysis({ videos: A, comments: 300, replies: false }, () => {})).id).data.videos[0];
  assert.ok(top.comments.length > 0 && top.comments.every((c) => !c.isReply));
});

test('the same video pasted twice, or with tracking parameters, is analyzed once', async () => {
  assert.deepEqual(linksOf(`${A}\n${A}?is_from_webapp=1&sender_device=pc\n  ${B}  ,${A}#x`), [A, B]);
  const a = testApp();
  const r = await a.features.tiktokVideoAnalysis({ videos: `${A}\n${A}?is_from_webapp=1` }, () => {});
  const rec = a.store.records.get('local', r.id);
  assert.equal(rec.data.videos.length, 1);
  assert.equal(rec.title, 'Phỏng vấn quốc tịch Mỹ đậu rồi', 'no "(+1)" for a duplicate');
});

test('more than 10 different links, or none, is refused before anything is fetched', async () => {
  const tt = createFakeTikTok();
  const a = testApp(undefined, tt);
  const eleven = Array.from({ length: 11 }, (_, i) => L(`70000000000000001${String(i).padStart(2, '0')}`)).join('\n');
  await assert.rejects(() => a.features.tiktokVideoAnalysis({ videos: eleven }, () => {}), (/** @type {any} */ e) => e.code === 'invalid_input' && e.field === 'videos' && /Tối đa 10/.test(e.message));
  await assert.rejects(() => a.features.tiktokVideoAnalysis({ videos: ' \n ' }, () => {}), (/** @type {any} */ e) => e.code === 'invalid_input');
  assert.equal(tt.stats().requests, 0);
});

test('comments cannot be read: the video keeps its numbers and script, and says why', async () => {
  const tt = createFakeTikTok();
  tt.getComments = async () => { throw new Error('TikTok từ chối trang comment'); };
  const a = testApp(undefined, tt);
  const v = a.store.records.get('local', (await a.features.tiktokVideoAnalysis({ videos: A }, () => {})).id).data.videos[0];
  assert.equal(v.error, null);
  assert.equal(v.video.plays, 10000);
  assert.equal(v.transcript.segments.length, 3);
  assert.deepEqual(v.comments, []);
  assert.equal(v.commentsNote, 'TikTok từ chối trang comment');
});

test('every video failed: the job fails with the first reason and leaves no record', async () => {
  const a = testApp();
  await assert.rejects(() => a.features.tiktokVideoAnalysis({ videos: `${GONE}\nhttps://example.com/x` }, () => {}), (/** @type {any} */ e) => e.code === 'video_unavailable');
  assert.deepEqual(a.store.records.list('local', 'tiktok_video_analysis'), []);
});

test('through the job runner: schema accepts the form, result carries the record id', async () => {
  const a = testApp();
  a.runner.start();
  const { id } = a.runner.enqueue('local', 'tiktok_video_analysis', { videos: A, script: true, comments: 100, replies: true }, 'x');
  let job;
  for (let i = 0; i < 100 && !['succeeded', 'failed'].includes((job = a.runner.get(id)).status); i++) await new Promise((r) => setTimeout(r, 20));
  a.runner.stop();
  assert.equal(job.status, 'succeeded', job.error || '');
  assert.equal(a.store.records.get('local', job.record_id).schema_version, 1);
});
