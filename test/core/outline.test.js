import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LENGTHS, BLOCKS, FOUR_S, emptyOutline, cleanOutline, timelineOf, outlineGaps } from '../../src/core/outline/outline.js';

const hook = (o = {}) => ({ archetype: 'Contrarian', lean: 'Ai đi phỏng vấn quốc tịch cũng sợ', interjection: 'Nhưng', snapback: 'Câu hỏi khó nhất lại là câu dễ nhất', text: 'Câu dễ nhất', visual: 'Cầm giấy hẹn phỏng vấn', ...o });
const block = (point, example = '') => ({ point, example });
const full = () => cleanOutline({
  scenes: ['face'], hooks: [hook()], chosenHook: 0,
  blocks: { lockin: block('Hứa 3 câu hay bị hỏi'), body1: block('Câu 1'), rehook1: block('Nhưng câu thứ ba mới hay trượt'), body2: block('Câu 2 và 3'), cta: block('Tải danh sách 100 câu') },
});

test('the lists: four lengths, eight blocks after the hook, the four S', () => {
  assert.deepEqual(LENGTHS, [30, 45, 60, 90]);
  assert.deepEqual(BLOCKS.map((b) => b[0]), ['lockin', 'body1', 'rehook1', 'body2', 'rehook2', 'body3', 'closing', 'cta']);
  assert.deepEqual(BLOCKS.filter((b) => b[2]).map((b) => b[0]), ['rehook2', 'body3', 'closing']);
  assert.deepEqual(FOUR_S.map((s) => s[0]), ['subject', 'stakes', 'simple', 'superclear']);
});

test('cleaning: lengths and scenes from the lists, three hooks at most, archetypes matched, an out-of-range choice dropped', () => {
  const o = cleanOutline({
    length: 50, scenes: ['face', 'robot', 'face', 'screen'], sceneNote: ' bàn làm việc ',
    hooks: [hook({ archetype: 'teacher' }), hook({ archetype: 'Hero' }), hook(), hook(), { lean: '', snapback: '', text: '' }],
    chosenHook: 5, fourS: { subject: { ok: 'yes', note: 'rõ' }, stakes: { ok: 'maybe' } },
    blocks: { body1: { point: ' Ý mạnh nhất ', example: 'ví dụ' }, nope: { point: 'x' } }, loop: { stakes: 'Trượt là mất phí', extra: 1 }, junk: 1,
  });
  assert.deepEqual([o.length, o.scenes, o.sceneNote], [45, ['face', 'screen'], 'bàn làm việc']);
  assert.deepEqual([o.hooks.length, o.hooks[0].archetype, o.hooks[1].archetype, o.chosenHook], [3, 'Teacher', null, null]);
  assert.deepEqual([o.fourS.subject, o.fourS.stakes], [{ ok: 'yes', note: 'rõ' }, { ok: null, note: '' }]);
  assert.deepEqual([o.blocks.body1, o.blocks.cta, 'nope' in o.blocks], [{ point: 'Ý mạnh nhất', example: 'ví dụ' }, { point: '', example: '' }, false]);
  assert.deepEqual(o.loop, { stakes: 'Trượt là mất phí', question: '', headfake: '', newLoop: '' });
  assert.ok(!('junk' in o));
  assert.deepEqual(cleanOutline(null), emptyOutline());
  assert.equal(cleanOutline({ hooks: [hook()], chosenHook: 0 }).chosenHook, 0);
});

test('timeline: Kallaway\'s 45-second template, scaled, whole seconds, optional blocks share the body', () => {
  const at = (o) => timelineOf(cleanOutline(o)).map((x) => [x.key, x.from, x.to]);
  assert.deepEqual(at({}), [['hook', 0, 3], ['lockin', 3, 8], ['body1', 8, 25], ['rehook1', 25, 28], ['body2', 28, 42], ['cta', 42, 45]]);
  assert.deepEqual(at({ length: 30 }), [['hook', 0, 2], ['lockin', 2, 5], ['body1', 5, 17], ['rehook1', 17, 19], ['body2', 19, 28], ['cta', 28, 30]]);
  assert.deepEqual(at({ length: 60 }), [['hook', 0, 4], ['lockin', 4, 11], ['body1', 11, 33], ['rehook1', 33, 37], ['body2', 37, 56], ['cta', 56, 60]]);
  assert.deepEqual(at({ blocks: { rehook2: block('Mở vòng mới'), body3: block('Ý ba') } }).slice(4, 7), [['body2', 28, 35], ['rehook2', 35, 36], ['body3', 36, 42]]);
  assert.deepEqual(at({ blocks: { closing: block('Câu chốt') } }).slice(4, 6), [['body2', 28, 40], ['closing', 40, 42]]);
  assert.deepEqual(timelineOf(cleanOutline({})).map((x) => x.label), ['Hook', 'Lock-in', 'Thân 1', 'Rehook 1', 'Thân 2', 'CTA']);
});

test('gaps: what is still missing before filming, in plain words', () => {
  assert.deepEqual(outlineGaps(full(), { leadMagnet: 'Danh sách 100 câu' }), []);
  const empty = outlineGaps(emptyOutline(), { leadMagnet: '' });
  assert.deepEqual(empty, ['Chưa chọn hook', 'Chưa chọn cảnh quay được', 'Thiếu Lock-in', 'Thiếu Thân 1', 'Thiếu Rehook 1', 'Thiếu Thân 2', 'Thiếu CTA', 'Thẻ chưa có lead magnet cho CTA']);
  const thin = cleanOutline({ ...full(), hooks: [hook({ text: '', visual: '', snapback: '' })], fourS: { stakes: { ok: 'no' } } });
  assert.deepEqual(outlineGaps(thin, { leadMagnet: 'x' }), ['Hook chưa đủ ba bước', 'Hook chưa có chữ trên màn hình', 'Hook chưa có hình mở đầu', '4 chữ S chưa đạt: Stakes']);
});
