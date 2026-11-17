import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeSource } from '../../src/sources/fake/index.js';
import { youtubeIdOf, youtubeLinksOf } from '../../src/features/video-analysis.js';

const A = 'dQw4w9WgXcQ';
const B = 'abcdefghi_-';

test('the id survives every link shape, with or without a query string (Review Focus #2)', () => {
  for (const link of [`https://www.youtube.com/watch?v=${A}`, `https://www.youtube.com/watch?v=${A}&t=30s`, `https://www.youtube.com/watch?feature=share&v=${A}`, `https://youtu.be/${A}?si=xyz`,
    `https://www.youtube.com/shorts/${A}`, `https://www.youtube.com/shorts/${A}?feature=share`, `https://m.youtube.com/watch?v=${A}`, `https://www.youtube.com/embed/${A}`, `https://www.youtube.com/live/${A}`, A]) {
    assert.equal(youtubeIdOf(link), A, link);
  }
  for (const junk of ['https://www.tiktok.com/@a/video/7000000000000000001', 'https://www.youtube.com/@kenh', 'xin chào', '']) assert.equal(youtubeIdOf(junk), null, junk);
  assert.deepEqual(youtubeLinksOf(`https://youtu.be/${A}?si=1\nhttps://www.youtube.com/watch?v=${A}&t=5\n ${B} , không phải link`), [`https://www.youtube.com/watch?v=${A}`, `https://www.youtube.com/watch?v=${B}`, 'không phải link']);
});

test('a YouTube batch: numbers and comments per video, one record, no script yet', async () => {
  const a = testApp();
  const steps = [];
  const { id } = await a.features.videoAnalysis({ videos: `https://youtu.be/${A}?si=1\nhttps://www.youtube.com/shorts/${B}`, comments: 100 }, (p) => steps.push(p.step));
  const rec = a.store.records.get(a.ws, id);
  assert.equal(rec.kind, 'video_analysis');
  assert.deepEqual([rec.data.platform, rec.data.videos.length], ['youtube', 2]);
  const e = rec.data.videos[0];
  assert.deepEqual([e.video.id, e.video.url, e.video.cover], [A, `https://www.youtube.com/watch?v=${A}`, `https://i.ytimg.com/vi/${A}/hqdefault.jpg`]);
  assert.deepEqual([e.transcript, e.transcriptNote, e.script], [null, 'unsupported', null]);
  assert.equal(e.row.views, 1);
  assert.deepEqual(e.comments.map((c) => [c.id, c.videoId]), [['c1', A]]);
  assert.equal(e.error, null);
  assert.ok(steps.some((s) => /Video 2\/2/.test(s)));
});

test('a line that is not a YouTube video becomes a row with its reason; more than 10 is refused; comments can be turned off', async () => {
  const a = testApp();
  const { id } = await a.features.videoAnalysis({ videos: `không phải link\n${A}`, comments: 0 });
  const d = a.store.records.get(a.ws, id).data;
  assert.match(d.videos[0].error.message, /Không phải link video YouTube/);
  assert.equal(d.videos[1].video.id, A);
  assert.deepEqual(d.videos[1].comments, []);
  const many = Array.from({ length: 11 }, (_, i) => `${String(i).padStart(2, '0')}abcdefghi`).join('\n');
  await assert.rejects(a.features.videoAnalysis({ videos: many }), (/** @type {any} */ e) => e.code === 'invalid_input' && /Tối đa 10/.test(e.message));
});

test('history lists runs of both platforms, newest first, each saying its platform', async () => {
  const a = testApp();
  await a.features.tiktokVideoAnalysis({ videos: 'https://www.tiktok.com/@creator/video/7000000000000000001', comments: 0 });
  await new Promise((r) => setTimeout(r, 5));
  await a.features.videoAnalysis({ videos: A, comments: 0 });
  const h = a.features.videoAnalysisHistory(10);
  assert.deepEqual(h.map((r) => r.platform), ['youtube', 'tiktok']);
  assert.deepEqual([h[0].items[0].caption, h[0].items[0].script], ['x', false]);
});

test('with a transcript the script is saved with its stats; each failure keeps numbers and comments and says why', async () => {
  const transcript = { language: null, kind: 'auto', segments: [{ start: 0, end: 3, text: 'Xin chào các bạn' }, { start: 3, end: null, text: 'hôm nay mình kể chuyện' }] };
  const run = async (getTranscript, params = {}) => {
    const a = testApp({ ...createFakeSource(), getTranscript });
    return a.store.records.get(a.ws, (await a.features.videoAnalysis({ videos: A, comments: 100, ...params })).id).data.videos[0];
  };
  const ok = await run(async () => transcript);
  assert.deepEqual([ok.transcript.segments.length, ok.transcriptNote, ok.script.hook], [2, null, 'Xin chào các bạn hôm nay mình kể chuyện']);
  const cases = [[async () => null, 'none'], [async () => { throw Object.assign(new Error('x'), { code: 'setup_required' }); }, 'setup'], [async () => { throw Object.assign(new Error('x'), { code: 'source_changed' }); }, 'changed'], [async () => { throw new Error('lạ'); }, 'changed']];
  for (const [fn, note] of cases) {
    const e = await run(/** @type {any} */ (fn));
    assert.deepEqual([e.transcript, e.transcriptNote, e.error, e.comments.length], [null, note, null, 1], String(note));
  }
  let asked = 0;
  const off = await run(async () => (asked++, transcript), { script: false });
  assert.deepEqual([off.transcriptNote, asked], ['off', 0], 'script turned off: the page is never opened');
});
