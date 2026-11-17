// The brick library's vocabulary: what a video is broken into, and the fixed lists a brick may take its value from.
// Seven Lego bricks after Kallaway (topic, angle, hook structure, story structure, visual format, key visuals,
// audio), the 40 concepts as the vocabulary of "angle", six hook archetypes. Pure.

/** The 40 media concepts, in the course's order (number = index + 1). Their explanations live in the knowledge file. */
export const CONCEPTS = [
  'So sánh', 'Chủ đề hot', 'Hữu ích, thông dụng', 'Mượn người nổi tiếng', 'Lớn, cầu kỳ', 'Hành trình', 'Cảm động', 'Số', 'Real time', 'Tranh cãi',
  'Ủng hộ số đông dư luận', 'Sex, giới tính', 'Bật mí bí mật', 'Cuộc thi, game show', 'Ngược đời, nghịch lý', 'Vùng miền dân tộc', 'Duy nhất', 'Cảnh báo', 'DIY', 'Sử dụng dữ liệu, nghiên cứu',
  'Phi thường', 'Trend', 'Phát kiến mới', 'Chuyện lạ đó đây', 'Đeo bám', 'Thúc giục', 'Kỳ quặc, ngớ ngẩn', 'Chứng nhận', 'UFO', 'Hay',
  'Tốt đẹp một cách bất ngờ', 'Vấn đề và giải pháp trong tưởng tượng', 'Liên kết nguyên nhân, hậu quả', 'Ma, tâm linh, bói toán', 'Giải thưởng', 'Hài hước', 'Hành trình truy lùng, săn đuổi', 'Trò chơi, minigame', 'Pet', 'Người già, trẻ em dễ thương',
];
export const ARCHETYPES = ['Fortune Teller', 'Experimenter', 'Teacher', 'Magician', 'Investigator', 'Contrarian'];
export const BLOCK_TYPES = ['hook', 'lockin', 'body', 'rehook', 'cta', 'other'];
export const BLOCK_LABELS = { hook: 'Hook', lockin: 'Lock-in', body: 'Thân', rehook: 'Rehook', cta: 'CTA', other: 'Khác' };
/** The five kinds of comment of the viral-content-analyst skill: [key, label]. */
export const AUDIENCE = /** @type {const} */ ([['empathy', 'Đồng cảm'], ['debate', 'Tranh cãi'], ['humor', 'Hài hước'], ['character', 'Quan tâm nhân vật'], ['doubt', 'Nghi ngờ, phản đối']]);
export const FIT = ['yes', 'no', 'unclear'];
/** Bricks that must point at transcript lines when the video has a transcript. */
export const EVIDENCED = ['topic', 'seed', 'angle', 'belief', 'facts'];
export const LIMITS = { videos: 50, parallel: 3, transcriptSeconds: 1200, comments: 30, facts: 5, extraConcepts: 2, blocks: 12, evidence: 5, text: 400, commentChars: 300 };

const fold = (t) => String(t ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '');

/** A value from a fixed list, however the model spelled it (case, accents, punctuation); null when it is not in the list. @param {string[]} list @param {any} v */
export function pickFrom(list, v) {
  const want = fold(v);
  return want ? list.find((x) => fold(x) === want) ?? null : null;
}

/** A concept by name ("Bật mí bí mật", "bat mi bi mat", "Concept 13: Bật mí bí mật") or by number (13, "13"). @param {any} v */
export function conceptOf(v) {
  const s = String(v ?? '').trim();
  if (/^\d{1,2}$/.test(s)) return CONCEPTS[Number(s) - 1] ?? null;
  return pickFrom(CONCEPTS, s.replace(/^concept\s*\d*\s*[:.\-–]?\s*/i, ''));
}

export function emptyBricks() {
  return {
    topic: '', pillar: '', seed: '', angle: '', belief: /** @type {{common: string, reality: string}|null} */ (null), facts: /** @type {string[]} */ ([]),
    concept: /** @type {string|null} */ (null), extraConcepts: /** @type {string[]} */ ([]),
    hook: { spoken: '', formula: '', archetype: /** @type {string|null} */ (null), category: '' },
    story: { category: '', description: '', blocks: /** @type {{from: number, to: number|null, type: string, summary: string}[]} */ ([]) },
    audience: { total: 0, counts: Object.fromEntries(AUDIENCE.map(([k]) => [k, 0])), examples: /** @type {Record<string, string[]>} */ ({}) },
    fit: { verdict: 'unclear', reason: '' },
    visual: { format: '', keyVisuals: '', audio: '' },
    evidence: Object.fromEntries(EVIDENCED.map((k) => [k, /** @type {number[]} */ ([])])),
    flags: { noTranscript: false, truncated: false, unsupported: /** @type {string[]} */ ([]) },
  };
}

const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, LIMITS.text) : undefined);
/** Field the owner may correct → how its value is cleaned (undefined = not acceptable). The spoken hook and the counts are facts, not opinions, so they are not editable. */
const EDIT_RULES = {
  topic: text, pillar: text, seed: text, angle: text, 'belief.common': text, 'belief.reality': text,
  concept: (v) => conceptOf(v) ?? undefined,
  'hook.formula': text, 'hook.category': text, 'hook.archetype': (v) => pickFrom(ARCHETYPES, v) ?? undefined,
  'story.category': text, 'story.description': text,
  'visual.format': text, 'visual.keyVisuals': text, 'visual.audio': text,
  'fit.verdict': (v) => (FIT.includes(v) ? v : undefined),
};
export const EDITABLE = Object.keys(EDIT_RULES);

/** @param {string} path @param {any} value @returns {any} the cleaned value, or undefined when the field or the value is not acceptable */
export const cleanEdit = (path, value) => (Object.hasOwn(EDIT_RULES, path) ? EDIT_RULES[path](value) : undefined);

/** The model's bricks with the owner's corrections on top (a new object). @param {ReturnType<typeof emptyBricks>} data @param {Record<string, any>} [edited] path → value */
export function applyEdits(data, edited = {}) {
  const out = structuredClone(data);
  for (const [path, value] of Object.entries(edited || {})) {
    if (!EDITABLE.includes(path)) continue;
    const [a, b] = path.split('.');
    if (!b) out[a] = value;
    else {
      if (a === 'belief' && !out.belief) out.belief = { common: '', reality: '' };
      out[a][b] = value;
    }
  }
  return out;
}
