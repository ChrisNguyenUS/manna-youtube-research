// The outline of one short video, after Kallaway's short-form frame: a three-step hook in three layers, a lock-in,
// body blocks with rehooks, the dopamine loop, and a CTA. Times are computed here, never by the model. Pure.
import { ARCHETYPES, pickFrom } from '../bricks/schema.js';

export const LENGTHS = [30, 45, 60, 90];
/** What the owner can actually film: hook options are built only from these. [key, label]. */
export const SCENES = /** @type {const} */ ([['face', 'Quay mặt nói'], ['screen', 'Quay màn hình'], ['demo', 'Làm thật, thí nghiệm'], ['beforeAfter', 'Trước và sau'], ['broll', 'Cảnh minh hoạ'], ['interview', 'Phỏng vấn người khác']]);
/** Blocks after the hook: [key, label, optional]. */
export const BLOCKS = /** @type {const} */ ([['lockin', 'Lock-in', false], ['body1', 'Thân 1', false], ['rehook1', 'Rehook 1', false], ['body2', 'Thân 2', false], ['rehook2', 'Rehook 2', true], ['body3', 'Thân 3', true], ['closing', 'Câu chốt', true], ['cta', 'CTA', false]]);
/** Kallaway's four S of a clear hook: [key, label, question]. */
export const FOUR_S = /** @type {const} */ ([['subject', 'Subject', 'Nói rõ ai hoặc cái gì?'], ['stakes', 'Stakes', 'Được mất gì?'], ['simple', 'Simple', 'Đơn giản không?'], ['superclear', 'Superclear', 'Rõ tới mức không cần nghĩ?']]);
export const LIMITS = { hooks: 3, text: 300, short: 60 };

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);
const text = (v, max = LIMITS.text) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');

export function emptyOutline() {
  return {
    length: 45, scenes: /** @type {string[]} */ ([]), sceneNote: '',
    hooks: /** @type {{archetype: string|null, lean: string, interjection: string, snapback: string, text: string, visual: string}[]} */ ([]),
    chosenHook: /** @type {number|null} */ (null),
    fourS: Object.fromEntries(FOUR_S.map(([k]) => [k, { ok: /** @type {string|null} */ (null), note: '' }])),
    blocks: Object.fromEntries(BLOCKS.map(([k]) => [k, { point: '', example: '' }])),
    loop: { stakes: '', question: '', headfake: '', newLoop: '' },
  };
}

/** Whatever the screen or a model sends → an outline with every key, right types and sizes. @param {any} input */
export function cleanOutline(input) {
  const s = obj(input);
  const o = emptyOutline();
  o.length = LENGTHS.includes(Number(s.length)) ? Number(s.length) : 45;
  const keys = SCENES.map(([k]) => k);
  o.scenes = [...new Set(list(s.scenes).filter((k) => keys.includes(k)))];
  o.sceneNote = text(s.sceneNote);
  o.hooks = list(s.hooks).map((h) => obj(h)).map((h) => ({ archetype: pickFrom(ARCHETYPES, h.archetype), lean: text(h.lean), interjection: text(h.interjection, LIMITS.short), snapback: text(h.snapback), text: text(h.text, LIMITS.short), visual: text(h.visual) }))
    .filter((h) => h.lean || h.snapback || h.text).slice(0, LIMITS.hooks);
  o.chosenHook = Number.isInteger(s.chosenHook) && s.chosenHook >= 0 && s.chosenHook < o.hooks.length ? s.chosenHook : null;
  const f = obj(s.fourS);
  o.fourS = Object.fromEntries(FOUR_S.map(([k]) => [k, { ok: ['yes', 'no'].includes(obj(f[k]).ok) ? obj(f[k]).ok : null, note: text(obj(f[k]).note) }]));
  const b = obj(s.blocks);
  o.blocks = Object.fromEntries(BLOCKS.map(([k]) => [k, { point: text(obj(b[k]).point), example: text(obj(b[k]).example) }]));
  const l = obj(s.loop);
  o.loop = { stakes: text(l.stakes), question: text(l.question), headfake: text(l.headfake), newLoop: text(l.newLoop) };
  return o;
}

const BASE = 45;
const FIXED = [['hook', 0, 3], ['lockin', 3, 8], ['body1', 8, 25], ['rehook1', 25, 28]];
/** The rest of the body (28–42 s of the template) is shared by these, by weight; body 2 is always there. */
const MIDDLE = /** @type {[string, number][]} */ ([['body2', 10], ['rehook2', 2], ['body3', 8], ['closing', 2]]);
const MIDDLE_SPAN = [28, 42];
const LABELS = { hook: 'Hook', ...Object.fromEntries(BLOCKS.map(([k, l]) => [k, l])) };

/** The blocks in order with their start and end second, for the chosen length. @param {ReturnType<typeof emptyOutline>} o */
export function timelineOf(o) {
  const f = o.length / BASE;
  const at = (x) => Math.round(x * f);
  const middle = MIDDLE.filter(([k]) => k === 'body2' || o.blocks[k].point);
  const weight = middle.reduce((n, [, w]) => n + w, 0);
  const out = FIXED.map(([key, from, to]) => ({ key, from: at(from), to: at(to) }));
  let cursor = MIDDLE_SPAN[0];
  for (const [key, w] of middle) {
    const end = cursor + ((MIDDLE_SPAN[1] - MIDDLE_SPAN[0]) * w) / weight;
    out.push({ key, from: at(cursor), to: at(end) });
    cursor = end;
  }
  out.push({ key: 'cta', from: at(MIDDLE_SPAN[1]), to: o.length });
  return out.map((x) => ({ ...x, label: LABELS[x.key] }));
}

/** What is still missing before filming. @param {ReturnType<typeof emptyOutline>} o @param {{leadMagnet: string}} card */
export function outlineGaps(o, card) {
  const gaps = [];
  const h = o.chosenHook == null ? null : o.hooks[o.chosenHook];
  if (!h) gaps.push('Chưa chọn hook');
  else {
    if (!h.lean || !h.snapback) gaps.push('Hook chưa đủ ba bước');
    if (!h.text) gaps.push('Hook chưa có chữ trên màn hình');
    if (!h.visual) gaps.push('Hook chưa có hình mở đầu');
  }
  if (!o.scenes.length) gaps.push('Chưa chọn cảnh quay được');
  for (const [k, label, optional] of BLOCKS) if (!optional && !o.blocks[k].point) gaps.push(`Thiếu ${label}`);
  if (!card.leadMagnet) gaps.push('Thẻ chưa có lead magnet cho CTA');
  const weak = FOUR_S.filter(([k]) => o.fourS[k].ok === 'no').map(([, l]) => l);
  if (weak.length) gaps.push(`4 chữ S chưa đạt: ${weak.join(', ')}`);
  return gaps;
}
