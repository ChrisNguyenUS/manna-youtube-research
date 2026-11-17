import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';

test('the board opens on a first batch, empty, with the lists the screen needs', () => {
  const f = testApp().features.ideas;
  const b = f.board();
  assert.deepEqual([b.batch.title, b.batch.status, b.cards, b.batches.length], ['Lô 1', 'open', [], 1]);
  assert.deepEqual([b.lists.lego.length, b.lists.statuses.length, b.lists.questions.length, b.lists.concepts.length], [7, 5, 6, 40]);
  assert.deepEqual([b.counts.live, b.nudge, b.hasFilter, b.ai], [0, null, false, false]);
  assert.equal(f.board().batch.id, b.batch.id, 'opening again does not make another batch');
});

test('a self-made card: created, edited, cleaned, checked; the origin cannot be changed by an edit', () => {
  const f = testApp().features.ideas;
  const c = f.create({ from: 'self' });
  assert.deepEqual([c.status, c.card.origin.kind, c.trial, c.checks[0].ok], ['draft', 'self', true, 'no']);
  const u = f.update(c.id, { status: 'chosen', topic: ' Phỏng vấn ', angle: 'Không cần luật sư', concept: 'so sanh', origin: { kind: 'brick', ref: 'tiktok:1' }, nope: 1 });
  assert.deepEqual([u.status, u.card.topic, u.card.concept, u.card.origin.kind, u.checks[2].ok], ['chosen', 'Phỏng vấn', 'So sánh', 'self', 'yes']);
  assert.equal(f.board().cards[0].card.angle, 'Không cần luật sư');
  assert.throws(() => f.update(999, { topic: 'x' }), (/** @type {any} */ e) => e.code === 'not_found');
  assert.throws(() => f.create({ from: 'lạ' }), (/** @type {any} */ e) => e.code === 'invalid_input');
});

test('ten live cards per batch; dropping frees a slot; a dropped card cannot come back into a full batch (Review Focus #2)', () => {
  const f = testApp().features.ideas;
  const ids = Array.from({ length: 10 }, () => f.create({ from: 'self' }).id);
  assert.throws(() => f.create({ from: 'self' }), (/** @type {any} */ e) => e.code === 'invalid_input' && /đủ 10 thẻ/.test(e.message) && /mở lô mới/.test(e.message));
  f.update(ids[0], { status: 'dropped' });
  const eleventh = f.create({ from: 'self' });
  assert.deepEqual([f.board().counts.live, f.board().counts.dropped], [10, 1]);
  assert.throws(() => f.update(ids[0], { status: 'draft' }), (/** @type {any} */ e) => e.code === 'invalid_input');
  f.remove(eleventh.id);
  assert.equal(f.update(ids[0], { status: 'draft' }).status, 'draft');
});

test('a new batch closes the open one; old batches stay readable; Markdown of a batch', () => {
  const a = testApp();
  const f = a.features.ideas;
  const first = f.create({ from: 'self' });
  f.update(first.id, { topic: 'Thẻ xanh mất bao lâu', pain: { text: 'Sợ chờ lâu' }, title: { text: 'Chờ thẻ xanh bao lâu' }, leadMagnet: 'Lịch từng bước' });
  const old = f.board().batch.id;
  const b2 = f.newBatch('Lô tháng 12');
  assert.deepEqual([b2.batch.title, b2.cards.length, b2.batches.map((x) => [x.title, x.status, x.live])], ['Lô tháng 12', 0, [['Lô tháng 12', 'open', 0], ['Lô 1', 'closed', 1]]]);
  assert.equal(f.board(old).cards[0].card.topic, 'Thẻ xanh mất bao lâu');
  assert.equal(f.newBatch().batch.title, 'Lô 3');
  const md = f.markdown(old);
  assert.match(md, /^# Lô 1: 1 thẻ/);
  assert.match(md, /## 1\. Chờ thẻ xanh bao lâu \(Nháp\)/);
  assert.match(md, /- Nỗi đau: Sợ chờ lâu/);
  assert.match(md, /- Lead magnet: Lịch từng bước/);
  assert.match(md, /- Câu 1: chưa\. Ý tưởng tự nghĩ: thử nghiệm gốc/);
  assert.throws(() => f.board(999), (/** @type {any} */ e) => e.code === 'not_found');
});

test('the filter question of Soulprint makes the filter answer part of being ready', () => {
  const a = testApp();
  const f = a.features.ideas;
  const c = f.create({ from: 'self' });
  a.features.soulprint.save({ filter: 'Có giá trị với Lan không?', pillars: [{ name: 'Phỏng vấn' }] });
  const b = f.board();
  assert.deepEqual([b.hasFilter, b.pillars], [true, ['Phỏng vấn']]);
  assert.ok(b.cards.find((x) => x.id === c.id).missing.includes('Câu lọc'));
});
