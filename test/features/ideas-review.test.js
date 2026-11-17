import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeTikTok, FAKE_VIDEOS, FAKE_GONE_ID } from '../../src/sources/fake/tiktok.js';

const DAY = 86_400_000;
/** A TikTok video of the owner's: `age` days old, with these views and shares. */
const vid = (n, plays, { shares = 10, age = 20 } = {}) => {
  const id = `7100000000000000${String(n).padStart(3, '0')}`;
  return { id, url: `https://www.tiktok.com/@me/video/${id}`, caption: `Video ${n}`, hashtags: /** @type {string[]} */ ([]), createdAt: new Date(Date.now() - age * DAY).toISOString(), durationSec: 40, plays, likes: 1, comments: 1, shares, saves: 1, author: 'me', authorName: 'Me', authorVerified: false, musicTitle: '', cover: null, query: '' };
};
const link = (v) => v.url;

test('a posted link: numbers read, one snapshot kept, the card marked posted; card edits never touch it', async () => {
  const f = testApp().features.ideas;
  const c = f.create({ from: 'self' });
  const v = FAKE_VIDEOS[1];
  const x = await f.attachVideo(c.id, ` ${v.url} `);
  assert.deepEqual([x.status, x.published.platform, x.published.videoId, x.published.snapshots.length, x.result.views, x.result.shares, x.published.error], ['posted', 'tiktok', v.id, 1, v.plays, v.shares, null]);
  assert.equal(x.result.ageDays, 10);
  f.update(c.id, { topic: 'Sửa thẻ sau' });
  assert.equal(f.get(c.id).published.videoId, v.id, 'saving the card keeps the link');
  const yt = await f.attachVideo(f.create({ from: 'self' }).id, 'https://youtu.be/dQw4w9WgXcQ');
  assert.deepEqual([yt.published.platform, yt.published.videoId, yt.result.views, yt.result.shares, yt.published.postedAt], ['youtube', 'dQw4w9WgXcQ', 1, null, '2026-10-01T00:00:00.000Z']);
});

test('a link on two cards, an unknown link, a dropped card are refused; a video that cannot be read is kept with why', async () => {
  const f = testApp().features.ideas;
  const [a, b] = [f.create({ from: 'self' }), f.create({ from: 'self' })];
  await f.attachVideo(a.id, FAKE_VIDEOS[1].url);
  await assert.rejects(f.attachVideo(b.id, FAKE_VIDEOS[1].url), (/** @type {any} */ e) => e.code === 'invalid_input' && /đã gắn vào thẻ "Thẻ \d+"/.test(e.message));
  await assert.rejects(f.attachVideo(b.id, 'facebook.com/x'), (/** @type {any} */ e) => e.code === 'invalid_input' && e.field === 'url');
  f.update(b.id, { status: 'dropped' });
  await assert.rejects(f.attachVideo(b.id, FAKE_VIDEOS[2].url), (/** @type {any} */ e) => e.field === 'status');
  const c = f.create({ from: 'self' });
  const gone = await f.attachVideo(c.id, `https://www.tiktok.com/@x/video/${FAKE_GONE_ID}`);
  assert.deepEqual([gone.status, gone.published.snapshots, gone.result.views], ['posted', [], null]);
  assert.match(/** @type {string} */ (gone.published.error), /Không lấy được số liệu.*nhập view bằng tay/);
  assert.equal(f.saveResult(c.id, { views: '1200' }).result.views, 1200, 'the owner types the views instead');
});

test('a short link is checked again once loaded, by the id it really points to (Review Focus #1)', async () => {
  const mine = vid(1, 500);
  const tiktok = /** @type {any} */ ({ ...createFakeTikTok({ videos: [mine] }), getVideo: async () => ({ video: mine, transcript: null }) });
  const f = testApp(undefined, tiktok).features.ideas;
  const [a, b] = [f.create({ from: 'self' }), f.create({ from: 'self' })];
  await f.attachVideo(a.id, link(mine));
  await assert.rejects(f.attachVideo(b.id, 'https://vm.tiktok.com/ZMshort/'), (/** @type {any} */ e) => /đã gắn vào thẻ/.test(e.message));
  assert.equal(f.get(b.id).published, null);
});

test('the owner\'s counts: empty is "not known", 0 is a number, anything else is refused with the field (Review Focus #2)', async () => {
  const f = testApp().features.ideas;
  const c = f.create({ from: 'self' });
  assert.throws(() => f.saveResult(c.id, { leads: 1 }), (/** @type {any} */ e) => e.field === 'url');
  await f.attachVideo(c.id, FAKE_VIDEOS[1].url);
  const r = f.saveResult(c.id, { leads: '0', followers: '' });
  assert.deepEqual([r.published.leads, r.published.followers], [0, null]);
  assert.equal(f.saveResult(c.id, { followers: 7 }).published.leads, 0, 'a key left out stays');
  for (const bad of [-1, 2.5, 'nhiều']) assert.throws(() => f.saveResult(c.id, { leads: bad }), (/** @type {any} */ e) => e.code === 'invalid_input' && e.field === 'leads' && /số nguyên từ 0/.test(e.message));
  const off = f.clearVideo(c.id);
  assert.deepEqual([off.published, off.status], [null, 'filmed']);
});

test('refreshing a batch: one snapshot a day, a failed video keeps its numbers and says why', async () => {
  const videos = [vid(1, 500), vid(2, 900)];
  const tiktok = createFakeTikTok({ videos });
  const a = testApp(undefined, tiktok);
  const f = a.features.ideas;
  const [c1, c2] = [f.create({ from: 'self' }), f.create({ from: 'self' })];
  await f.attachVideo(c1.id, link(videos[0]));
  await f.attachVideo(c2.id, link(videos[1]));
  videos[0].plays = 800;
  videos.pop(); // the second video is gone
  const steps = [];
  const r = await f.refresh({ batchId: c1.batchId }, (p) => steps.push(p.step));
  assert.deepEqual([r.checked, r.failed], [2, 1]);
  assert.deepEqual([f.get(c1.id).published.snapshots.length, f.get(c1.id).result.views], [1, 800], 'same day: replaced, not added');
  assert.deepEqual([f.get(c2.id).result.views, /Không lấy được số liệu/.test(f.get(c2.id).published.error)], [900, true]);
  assert.equal(steps.at(-1), 'Xong');
  await assert.rejects(f.refresh({ batchId: 999 }), (/** @type {any} */ e) => e.code === 'not_found');
});

/** A batch of four posted cards: views 1000, 5000, 300, and 800 posted today. */
async function batchOfFour(extra) {
  const videos = [vid(1, 1000), vid(2, 5000), vid(3, 300), vid(4, 800, { age: 0 })];
  const a = testApp(undefined, createFakeTikTok({ videos }), extra);
  const f = a.features.ideas;
  const cards = [];
  for (const [i, v] of videos.entries()) {
    const c = f.create({ from: 'self' });
    f.update(c.id, { topic: `Ý ${i + 1}`, pillar: 'Phỏng vấn', concept: i % 2 ? 'Số' : 'So sánh' });
    await f.attachVideo(c.id, link(v));
    cards.push(c.id);
  }
  return { a, f, ids: cards, batchId: f.get(cards[0]).batchId };
}

test('the review follows the game: views when none is chosen, leads then followers for conversion (Review Focus #4)', async () => {
  const { a, f, ids: [c1, c2, c3, c4], batchId } = await batchOfFour();
  const none = f.review(batchId);
  assert.deepEqual([none.rows.map((x) => x.id), none.game, none.posted, none.live], [[c2, c1, c4, c3], null, 4, 4]);
  assert.match(/** @type {string} */ (none.note), /Chưa chọn game/);
  assert.deepEqual(none.rows.map((x) => x.metrics.fresh), [false, false, true, false]);
  assert.deepEqual([none.table.top, none.table.bottom], [[c2], [c3]], 'the video posted today is left out of the halves (Review Focus #3)');
  a.features.soulprint.save({ game: 'conversion' });
  f.saveResult(c3, { leads: 9, followers: 1 });
  f.saveResult(c1, { leads: 2, followers: 5 });
  const conv = f.review(batchId);
  assert.deepEqual([conv.rows.map((x) => [x.id, x.missing]), conv.gameLabel, conv.note], [[[c3, false], [c1, false], [c2, true], [c4, true]], 'Trúng', null]);
  assert.deepEqual([conv.winner?.id, conv.table.top, conv.table.bottom, conv.table.note], [c3, [c3], [c1], 'Mới có 2 video, chưa đủ để kết luận. Kallaway khuyên xem theo lô 10.']);
  assert.deepEqual(conv.table.rows, [], 'both halves are So sánh, Phỏng vấn, Tự nghĩ: nothing tells them apart');
  assert.match(f.reviewMarkdown(batchId), /^# Chấm lô: Lô 1\n\nGame Trúng: xếp theo khách/);
  assert.throws(() => f.review(999), (/** @type {any} */ e) => e.code === 'not_found');
});

test('closing a batch: lines kept with the game, a new batch opened that shows them; a winner remade there', async () => {
  const { a, f, ids: [c1, , c3], batchId } = await batchOfFour();
  a.features.soulprint.save({ game: 'conversion' });
  f.saveResult(c3, { leads: 9, followers: 1 });
  f.saveResult(c1, { leads: 2, followers: 5 });
  assert.throws(() => f.create({ from: `redo:${c3}` }), (/** @type {any} */ e) => e.code === 'invalid_input' && /Đóng lô/.test(e.message), 'not into the batch it came from');
  const r = f.close(batchId, { keep: ['Concept Số: 1 video nửa trên, 0 video nửa dưới'], review: [] });
  assert.deepEqual([r.batch.status, r.batch.learned.game, r.batch.learned.keep.length], ['closed', 'conversion', 1]);
  const next = f.board();
  assert.notEqual(next.batch.id, batchId);
  assert.deepEqual([next.learnedFrom?.id, next.learnedFrom?.learned.keep], [batchId, ['Concept Số: 1 video nửa trên, 0 video nửa dưới']]);
  const redo = f.create({ from: `redo:${c3}` });
  assert.deepEqual([redo.batchId, redo.card.origin.kind, redo.card.keep.length, redo.card.topic, redo.fromWinner, redo.checks[0].ok], [next.batch.id, 'redo', 7, 'Ý 3', true, 'yes']);
  assert.throws(() => f.create({ from: 'redo:999' }), (/** @type {any} */ e) => e.code === 'not_found');
  // Closed, still editable; closing again only replaces the lines, and the game at closing stays.
  f.saveResult(c1, { leads: 20 });
  a.features.soulprint.save({ game: 'reach' });
  assert.equal(f.review(batchId).rows[0].id, f.review(batchId).rows.find((x) => x.metrics.views === 5000)?.id, 'reach ranks by views now');
  const again = f.close(batchId, { keep: [], review: ['Kiểu hook Teacher'] });
  assert.deepEqual([again.batch.learned.review, again.batch.learned.game, f.board().batches.length], [['Kiểu hook Teacher'], 'reach', 2]);
});
