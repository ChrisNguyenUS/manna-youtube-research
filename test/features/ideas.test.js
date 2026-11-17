import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeLlm } from '../../src/llm/fake.js';

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
  const again = f.newBatch('Đổi tên');
  assert.deepEqual([again.batch.id, again.batch.title, again.batches.length], [b2.batch.id, 'Đổi tên', 2], 'an open batch with no card is reused, not left behind empty');
  f.create({ from: 'self' });
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
const brickRow = (a, videoId, score, b) => a.store.bricks.put(a.ws, {
  platform: 'tiktok', videoId, channelRef: 'tiktok:monica', model: 'm', source: { segments: [], comments: [] },
  meta: { title: `Video ${videoId}`, url: `https://www.tiktok.com/@monica/video/${videoId}`, channelTitle: 'Monica', score },
  data: { topic: '', pillar: '', seed: '', angle: '', belief: null, facts: [], concept: null, extraConcepts: [], hook: { spoken: '', formula: '', archetype: null, category: '' }, story: { category: '', description: '', blocks: [] },
    audience: { total: 0, counts: {}, examples: {} }, fit: { verdict: 'unclear', reason: '' }, visual: { format: '', keyVisuals: '', audio: '' }, evidence: {}, flags: { noTranscript: true, truncated: false, unsupported: [] }, ...b },
});

test('from a library video: topic, pillar, concept and the crowd\'s belief are carried; the source is kept as a snapshot (Review Focus #1)', () => {
  const a = testApp();
  brickRow(a, '1', 6, { topic: 'Phỏng vấn hỏi gì', pillar: 'Phỏng vấn', concept: 'Bật mí bí mật', angle: 'Hỏi thật', belief: { common: 'Phỏng vấn khó', reality: 'Toàn câu quen' }, hook: { spoken: 'Đi phỏng vấn mà không biết điều này', formula: '[x] mà không biết [y]', archetype: 'Investigator', category: '' } });
  a.store.bricks.setEdited(a.ws, 'tiktok', '1', { topic: 'Phỏng vấn quốc tịch hỏi gì' });
  const c = a.features.ideas.create({ from: 'brick:tiktok:1' });
  assert.deepEqual([c.card.origin.kind, c.card.origin.ref, c.trial], ['brick', 'tiktok:1', false]);
  assert.deepEqual([c.card.topic, c.card.pillar, c.card.concept, c.card.angle, c.card.belief], ['Phỏng vấn quốc tịch hỏi gì', 'Phỏng vấn', 'Bật mí bí mật', '', { common: 'Phỏng vấn khó', reality: '' }], 'the owner writes their own angle and reality');
  assert.deepEqual([c.card.origin.snapshot.title, c.card.origin.snapshot.score, c.card.origin.snapshot.hook.archetype, c.card.origin.snapshot.angle], ['Video 1', 6, 'Investigator', 'Hỏi thật']);
  assert.deepEqual([c.checks[0].ok, c.matches.map((m) => m.videoId)], ['yes', ['1']]);
  a.features.bricks.remove('tiktok', '1');
  const after = a.features.ideas.get(c.id);
  assert.deepEqual([after.card.origin.snapshot.title, after.checks[0].ok], ['Video 1', 'unknown'], 'the card still opens; the library no longer has the video');
  assert.throws(() => a.features.ideas.create({ from: 'brick:tiktok:999' }), (/** @type {any} */ e) => e.code === 'not_found');
  assert.throws(() => a.features.ideas.create({ from: 'brick:x' }), (/** @type {any} */ e) => e.code === 'invalid_input');
});

test('from a Soulprint pain: the pain and where it came from; a pain that is gone is not_found', () => {
  const a = testApp();
  a.features.soulprint.save({ pains: [{ text: 'Sợ trượt phỏng vấn', source: '5w1h' }, { text: 'Không biết giấy tờ gì' }] });
  const c = a.features.ideas.create({ from: 'pain:1' });
  assert.deepEqual([c.card.origin.kind, c.card.origin.ref, c.card.origin.snapshot, c.card.pain], ['pain', '1', { text: 'Không biết giấy tờ gì' }, { text: 'Không biết giấy tờ gì', source: 'soulprint', evidence: [] }]);
  assert.equal(a.features.ideas.create({ from: 'pain:0' }).card.pain.source, '5w1h');
  assert.throws(() => a.features.ideas.create({ from: 'pain:7' }), (/** @type {any} */ e) => e.code === 'not_found');
  a.features.soulprint.save({ pains: [] });
  assert.equal(a.features.ideas.get(c.id).card.pain.text, 'Không biết giấy tờ gì', 'the card keeps the pain after Soulprint drops it');
});

test('from a 5W1H suggestion: title, pain with the real comments as evidence, belief, concept and funnel', async () => {
  const a = testApp();
  const V = '7000000000000000001';
  await a.features.tiktokComments({ videos: `https://www.tiktok.com/@creator/video/${V}`, max: 100, replies: true });
  const comments = a.features.commentData.comments([V]).comments;
  const dims = { who: [], what: [], why: [], when: [], where: [], how: [] };
  const recordId = a.store.records.add(a.ws, 'comment_5w1h', '1 video', { data: {
    videoIds: [V], codebook: dims, tags: {}, notes: null, counts: {}, usage: {},
    ideas: [{ title: 'Phỏng vấn hỏi gì', who: null, pain: 'Sợ trượt', belief: { text: 'Phỏng vấn khó', evidence: [comments[0].id] }, concept: 'Bật mí bí mật', extraConcepts: [], funnel: 'biet', evidence: [comments[0].id, 'mất rồi'] }],
  } });
  const c = a.features.ideas.create({ from: `5w1h:${recordId}:0` });
  assert.deepEqual([c.card.origin.kind, c.card.origin.ref, c.card.origin.snapshot], ['5w1h', `${recordId}:0`, { recordId, recordTitle: '1 video', title: 'Phỏng vấn hỏi gì' }]);
  assert.deepEqual([c.card.title.text, c.card.pain.text, c.card.pain.source, c.card.belief.common, c.card.concept, c.card.funnel], ['Phỏng vấn hỏi gì', 'Sợ trượt', '5w1h', 'Phỏng vấn khó', 'Bật mí bí mật', 'biet']);
  assert.deepEqual(c.card.pain.evidence, [{ text: comments[0].text, likes: comments[0].likes ?? 0 }], 'a comment that is gone is skipped');
  assert.throws(() => a.features.ideas.create({ from: `5w1h:${recordId}:5` }), (/** @type {any} */ e) => e.code === 'not_found');
  assert.throws(() => a.features.ideas.create({ from: '5w1h:9999:0' }), (/** @type {any} */ e) => e.code === 'not_found');
});

test('assist uses the card on screen, Soulprint and the idea knowledge, and saves nothing', async () => {
  const llm = createFakeLlm([{ topic: 'T', angle: 'Góc mới', pain: 'P', belief_common: 'C', belief_reality: 'R', keep: [], remix: [], why: 'w' }]);
  const a = testApp(undefined, undefined, { llm, knowledgeFiles: { dick: 'DICK', funnel: 'PHỄU', kallaway: 'KALLAWAY', analyst: 'KHÔNG DÙNG' } });
  a.store.settings.set(a.ws, { aiWriteModel: 'write/model' });
  a.features.soulprint.save({ statement: { chosen: 'Tôi giúp người bảo lãnh' } });
  const c = a.features.ideas.create({ from: 'self' });
  const r = await a.features.ideas.assist('draft', { id: c.id, card: { ...c.card, topic: 'Chưa lưu' } });
  assert.deepEqual([r.action, r.suggestion.angle, r.usage.model], ['draft', 'Góc mới', 'write/model']);
  assert.match(llm.calls[0].user, /Chưa lưu/);
  assert.match(llm.calls[0].user, /Tôi giúp người bảo lãnh/);
  assert.match(llm.calls[0].system, /DICK[\s\S]*PHỄU[\s\S]*KALLAWAY/);
  assert.ok(!llm.calls[0].system.includes('KHÔNG DÙNG'));
  assert.deepEqual([a.features.ideas.get(c.id).card.topic, a.features.ideas.get(c.id).card.angle], ['', '']);
  const off = testApp(undefined, undefined, { llm: createFakeLlm([], { ready: false }) });
  const oc = off.features.ideas.create({ from: 'self' });
  await assert.rejects(off.features.ideas.assist('draft', { id: oc.id, card: { topic: 'x' } }), (/** @type {any} */ e) => e.code === 'llm_no_key');
  await assert.rejects(a.features.ideas.assist('draft', { id: 999 }), (/** @type {any} */ e) => e.code === 'not_found');
});

test('a card from a weak library video is not counted as mined from a winner, and says so', () => {
  const a = testApp();
  brickRow(a, 'win', 6, { topic: 'Thắng' });
  brickRow(a, 'weak', 0.5, { topic: 'Yếu' });
  const f = a.features.ideas;
  const w = f.create({ from: 'brick:tiktok:win' });
  const k = f.create({ from: 'brick:tiktok:weak' });
  assert.deepEqual([w.fromWinner, k.fromWinner], [true, false]);
  assert.deepEqual([f.board().counts.outlier, f.board().counts.other], [1, 1]);
  const md = f.markdown();
  assert.match(md, /- Nguồn: video đã thắng: Video win/);
  assert.match(md, /- Nguồn: thư viện gạch, video vượt kênh 0\.5×: Video weak/);
});

test('the outline lives beside the card: saving one never wipes the other (Review Focus #1)', () => {
  const a = testApp();
  const f = a.features.ideas;
  const c = f.create({ from: 'self' });
  assert.deepEqual([c.outline.length, c.script, c.gaps[0], c.timeline.length], [45, '', 'Chưa chọn hook', 6]);
  const o = f.saveOutline(c.id, { length: 30, scenes: ['face', 'robot'], blocks: { lockin: { point: 'Hứa' } } });
  assert.deepEqual([o.outline.length, o.outline.scenes, o.outline.blocks.lockin.point, o.timeline.at(-1).to], [30, ['face'], 'Hứa', 30]);
  f.update(c.id, { topic: 'Sửa thẻ sau' });
  assert.deepEqual([f.get(c.id).outline.blocks.lockin.point, f.get(c.id).card.topic], ['Hứa', 'Sửa thẻ sau']);
  f.saveOutline(c.id, { length: 30, blocks: { lockin: { point: 'Hứa lại' } } });
  assert.equal(f.get(c.id).card.topic, 'Sửa thẻ sau');
  assert.throws(() => f.saveOutline(999, {}), (/** @type {any} */ e) => e.code === 'not_found');
});

test('a pasted script is saved with its check, measured against the outline\'s length and the card\'s lead magnet', () => {
  const a = testApp();
  const f = a.features.ideas;
  const c = f.create({ from: 'self' });
  f.update(c.id, { leadMagnet: 'danh sách 20 câu' });
  f.saveOutline(c.id, { length: 30 });
  const r = f.saveScript(c.id, 'Tuy nhiên mình gửi bạn danh sách 20 câu.');
  assert.deepEqual([r.view.script, r.lint.maxWords, r.lint.issues.map((x) => x.rule)], ['Tuy nhiên mình gửi bạn danh sách 20 câu.', 90, ['banned']]);
  assert.equal(f.get(c.id).script, 'Tuy nhiên mình gửi bạn danh sách 20 câu.');
  assert.deepEqual(f.lint('Chỉ kể thôi.', { length: 45, leadMagnet: '' }).issues.map((x) => x.rule), ['cta']);
  assert.equal(f.lint('Kể.', { length: 999 }).maxWords, 135, 'an unknown length falls back to 45 seconds');
  assert.match(f.outlineMarkdown(c.id), /^# Dàn ý: /);
});

test('outline helpers use the outline and card on screen and the hooks file, and save nothing', async () => {
  const reply = { hooks: [{ archetype: 'Teacher', lean: 'l', interjection: 'Nhưng', snapback: 's', text: 't', visual: 'v' }], lockin: 'Hứa', body1_point: 'Ý 1', body1_example: '', rehook1: 'r', body2_point: 'Ý 2', body2_example: '', rehook2: '', body3_point: '', body3_example: '', closing: '', cta: 'Comment để nhận', loop_stakes: '', loop_question: '', loop_headfake: '', loop_newLoop: '' };
  const llm = createFakeLlm([reply]);
  const a = testApp(undefined, undefined, { llm, knowledgeFiles: { hooks: 'HOOK 3 BƯỚC', dick: 'DICK' } });
  const c = a.features.ideas.create({ from: 'self' });
  const r = await a.features.ideas.outlineAssist('outline', { id: c.id, outline: { scenes: ['face'] }, card: { topic: 'Phỏng vấn' } });
  assert.deepEqual([r.suggestion.hooks.length, r.suggestion.blocks.cta.point], [1, 'Comment để nhận']);
  assert.match(llm.calls[0].system, /HOOK 3 BƯỚC/);
  assert.ok(!llm.calls[0].system.includes('DICK'));
  assert.match(llm.calls[0].user, /Phỏng vấn/);
  assert.deepEqual([a.features.ideas.get(c.id).outline.scenes, a.features.ideas.get(c.id).card.topic], [[], '']);
  await assert.rejects(a.features.ideas.outlineAssist('outline', { id: 999 }), (/** @type {any} */ e) => e.code === 'not_found');
});
