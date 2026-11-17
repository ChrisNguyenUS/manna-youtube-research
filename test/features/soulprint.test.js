import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';

const V = '7000000000000000001';
const none = { who: null, what: null, why: null, when: null, where: null, how: null };

test('a new app has no seeds at all, and reading them does not fail', () => {
  assert.deepEqual(testApp().features.soulprint.seeds(), { channels: [], pains: [], avatar: [], pillars: [] });
});

test('seeds come from follows, the latest 5W1H report, collected questions and the owner\'s own channel report', async () => {
  const a = testApp();
  a.store.follows.put(a.ws, 'tiktok', 'monica', 'Monica', {});
  await a.features.tiktokComments({ videos: `https://www.tiktok.com/@creator/video/${V}`, max: 100, replies: true });
  const ids = a.features.commentData.comments([V]).comments.map((c) => String(c.id));
  a.store.records.add(a.ws, 'comment_5w1h', 'cũ', { data: { codebook: { who: [], why: [{ key: 'cu', label: 'Nhóm cũ', description: '' }] }, tags: { [ids[0]]: { ...none, why: 'cu' } } } });
  await new Promise((r) => setTimeout(r, 5));
  a.store.records.add(a.ws, 'comment_5w1h', 'mới', { data: {
    codebook: { who: [{ key: 'sap_pv', label: 'Người sắp phỏng vấn', description: '' }], why: [{ key: 'so_truot', label: 'Sợ trượt', description: 'Sợ bị đánh trượt' }, { key: 'ton_tien', label: 'Sợ tốn tiền', description: '' }, { key: 'vang', label: 'Không ai nói', description: '' }] },
    tags: Object.fromEntries(ids.map((id, i) => [id, { ...none, who: 'sap_pv', why: i === 0 ? 'ton_tien' : 'so_truot' }])),
  } });
  a.store.records.add(a.ws, 'tiktok_channel', '@toi', { ref: 'toi', data: { phrases: [{ phrase: 'phỏng vấn quốc tịch', count: 4 }, { phrase: 'thẻ xanh', count: 2 }] } });
  a.store.records.add(a.ws, 'tiktok_channel', '@nguoikhac', { ref: 'nguoikhac', data: { phrases: [{ phrase: 'không phải kênh mình', count: 9 }] } });
  a.features.soulprint.save({ channels: [{ platform: 'tiktok', handle: '@Toi' }] });

  const s = a.features.soulprint.seeds();
  assert.deepEqual(s.channels, [{ platform: 'tiktok', handle: '@monica', url: 'https://www.tiktok.com/@monica' }]);
  assert.deepEqual(s.avatar, [{ text: 'Người sắp phỏng vấn', count: ids.length }]);
  const fromReport = s.pains.filter((p) => p.source === '5w1h');
  assert.deepEqual(fromReport, [{ text: 'Sợ trượt: Sợ bị đánh trượt', count: ids.length - 1, source: '5w1h', group: 'Báo cáo 5W1H' }, { text: 'Sợ tốn tiền', count: 1, source: '5w1h', group: 'Báo cáo 5W1H' }], 'the newest report, groups nobody is in left out');
  const fromComments = s.pains.filter((p) => p.source === 'comment');
  assert.ok(fromComments.length >= 1 && fromComments.every((p) => p.text && p.group && p.count >= 1));
  assert.ok(s.pains.length <= 5);
  assert.deepEqual(s.pillars, [{ text: 'phỏng vấn quốc tịch', count: 4 }, { text: 'thẻ xanh', count: 2 }]);
});

test('records with old or odd shapes give empty seeds, not errors (Review Focus #5)', () => {
  const a = testApp();
  a.store.records.add(a.ws, 'comment_5w1h', 'lạ', { data: { codebook: {}, tags: null } });
  a.store.records.add(a.ws, 'tiktok_channel', '@toi', { ref: 'toi', data: { phrases: 'không phải mảng' } });
  a.store.records.add(a.ws, 'channel_analysis', 'Kênh', { ref: 'UC1', data: null });
  a.features.soulprint.save({ channels: [{ handle: '@toi' }, { handle: 'UC1' }] });
  assert.deepEqual(a.features.soulprint.seeds(), { channels: [], pains: [], avatar: [], pillars: [] });
});

test('import only returns drafts: the saved profile is untouched', () => {
  const a = testApp();
  a.features.soulprint.save({ statement: { chosen: 'câu của tôi' } });
  const r = a.features.soulprint.importText('## Lời hứa\ncâu trong file\n## Khán giả\nLan');
  assert.deepEqual(r.drafts, { statement: 'câu trong file', avatar: 'Lan' });
  assert.equal(a.features.soulprint.get().profile.statement.chosen, 'câu của tôi');
  assert.equal(a.features.soulprint.get().profile.avatar.portrait, '');
});

import { createFakeLlm } from '../../src/llm/fake.js';

test('assist asks the write model with the profile on screen, returns a suggestion and saves nothing', async () => {
  const llm = createFakeLlm([{ options: ['Tôi giúp A', 'Tôi giúp B', 'C cho D'], pick: 1, why: 'rõ nhất' }]);
  const a = testApp(undefined, undefined, { llm });
  a.store.settings.set(a.ws, { aiWriteModel: 'write/model' });
  const onScreen = { avatar: { name: 'Lan', portrait: 'Đang bảo lãnh chồng' }, advantage: '200 hồ sơ', oneThing: 'hồ sơ bảo lãnh' };
  const r = await a.features.soulprint.assist('statement', { profile: onScreen });
  assert.deepEqual(r.suggestion, { options: ['Tôi giúp A', 'Tôi giúp B', 'C cho D'], pick: 1, why: 'rõ nhất' });
  assert.deepEqual([r.action, r.usage.model, r.usage.tokensIn], ['statement', 'write/model', 10]);
  assert.equal(llm.calls[0].model, 'write/model');
  assert.match(llm.calls[0].user, /200 hồ sơ/);
  const saved = a.features.soulprint.get();
  assert.deepEqual([saved.updatedAt, saved.profile.statement.chosen, saved.profile.advantage], [null, '', ''], 'neither the suggestion nor the on-screen profile was saved');
});

test('assist without a key, with a failing model, or with junk output fails with the LLM\'s own code', async () => {
  const off = testApp(undefined, undefined, { llm: createFakeLlm([], { ready: false }) });
  await assert.rejects(off.features.soulprint.assist('check', { profile: {} }), (/** @type {any} */ e) => e.code === 'llm_no_key');
  const down = testApp(undefined, undefined, { llm: createFakeLlm([Object.assign(new Error('x'), { code: 'llm_unavailable' })]) });
  await assert.rejects(down.features.soulprint.assist('check', { profile: {} }), (/** @type {any} */ e) => e.code === 'llm_unavailable');
  const junk = testApp(undefined, undefined, { llm: createFakeLlm([{ summary: '' }]) });
  await assert.rejects(junk.features.soulprint.assist('tidy', { profile: {}, questionId: 'q4', answer: 'x' }), (/** @type {any} */ e) => e.code === 'llm_bad_output');
  await assert.rejects(junk.features.soulprint.assist('tidy', { profile: {}, questionId: 'q99', answer: 'x' }), (/** @type {any} */ e) => e.code === 'invalid_input');
});
