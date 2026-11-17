// Soulprint: the root profile of the owner's content. Pure: shape, cleaning, readiness and the text other AI
// features put in their prompts. Sources: the brand-game and niche interviews, and Kallaway's positioning chapter.

export const LIMITS = { pains: 30, pillars: 5, subtopics: 30, list: 10, channels: 10, text: 2000, short: 300, importChars: 50_000, context: 600 };
export const GAMES = /** @type {const} */ (['reach', 'conversion']);
export const GAME_LABELS = { reach: 'Rộng (views tối đa, đo bằng view và lượt chia sẻ)', conversion: 'Trúng (views đúng người, đo bằng khách)' };
export const SECTIONS = ['channels', 'business', 'game', 'avatar', 'dreamOutcome', 'pains', 'advantage', 'oneThing', 'statement', 'filter', 'pillars', 'hypothesis', 'voice'];
export const SECTION_LABELS = {
  channels: 'Kênh đang có', business: 'Việc kinh doanh', game: 'Game', avatar: 'Avatar', dreamOutcome: 'Kết quả mơ tới', pains: 'Kho nỗi đau',
  advantage: 'Lợi thế riêng', oneThing: 'Điều duy nhất', statement: 'Câu định vị', filter: 'Câu lọc', pillars: 'Pillars', hypothesis: 'Giả thuyết định vị', voice: 'Giọng nói',
};
/** The five positioning attributes of the niche interview. */
export const ATTRIBUTES = ['Chủ đề', 'Chiều sâu', 'Avatar', 'Cách kể', 'Hình ảnh'];
export const STRENGTHS = ['strong', 'possible', 'no'];
const PLATFORMS = ['tiktok', 'youtube', 'other'];
const PAIN_TYPES = ['broad', 'tactical'];
const PAIN_SOURCES = ['self', '5w1h', 'comment'];
/** Ids the brainstorm may store answers under (core/soulprint/questions.js). */
const ANSWER_IDS = Array.from({ length: 12 }, (_, i) => `q${i}`);

export function emptyProfile() {
  return {
    channels: [], startingFromZero: false,
    business: { offer: '', price: '', buyer: '', howBought: '', viewerIsBuyer: /** @type {boolean|null} */ (null), note: '' },
    game: /** @type {'reach'|'conversion'|null} */ (null), gameReason: '', objective: '',
    avatar: { name: '', tag: '', portrait: '', believes: [], fears: [], tried: [], complains: [] },
    dreamOutcome: '', pains: [], advantage: '', oneThing: '',
    statement: { chosen: '', alternates: [], why: '' }, filter: '', pillars: [],
    hypothesis: { attributes: ATTRIBUTES.map((name) => ({ name, strength: /** @type {string|null} */ (null), evidence: '' })), lane: '' },
    voice: '', answers: {},
  };
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const text = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

/**
 * Whatever the screen, a file or a model sends → a profile with every key, right types and sizes within LIMITS.
 * @param {any} input @returns {{profile: ReturnType<typeof emptyProfile>, trimmed: string[]}} trimmed: sections whose lists were cut
 */
export function cleanProfile(input) {
  const src = obj(input);
  const cut = new Set();
  /** A list of non-empty strings, at most `max` (the section is reported when more were sent). */
  const lines = (v, max, section, len = LIMITS.short) => {
    const all = (Array.isArray(v) ? v : []).map((x) => text(x, len)).filter(Boolean);
    if (all.length > max) cut.add(section);
    return all.slice(0, max);
  };
  const rows = (v, max, section, make) => {
    const all = (Array.isArray(v) ? v : []).map((x) => make(obj(x))).filter(Boolean);
    if (all.length > max) cut.add(section);
    return all.slice(0, max);
  };
  const p = emptyProfile();
  const b = obj(src.business);
  const a = obj(src.avatar);
  const s = obj(src.statement);
  const h = obj(src.hypothesis);
  p.channels = rows(src.channels, LIMITS.channels, 'channels', (c) => {
    const handle = text(c.handle, 100);
    const url = text(c.url, LIMITS.short);
    return handle || url ? { platform: oneOf(String(c.platform || '').toLowerCase(), PLATFORMS, 'other'), handle, url } : null;
  });
  p.startingFromZero = src.startingFromZero === true;
  p.business = { offer: text(b.offer, LIMITS.short), price: text(b.price, LIMITS.short), buyer: text(b.buyer, LIMITS.short), howBought: text(b.howBought, LIMITS.short), viewerIsBuyer: typeof b.viewerIsBuyer === 'boolean' ? b.viewerIsBuyer : null, note: text(b.note, LIMITS.text) };
  p.game = oneOf(src.game, GAMES, null);
  p.gameReason = text(src.gameReason, LIMITS.text);
  p.objective = text(src.objective, LIMITS.short);
  p.avatar = {
    name: text(a.name, 100), tag: text(a.tag, 100), portrait: text(a.portrait, LIMITS.text),
    believes: lines(a.believes, LIMITS.list, 'avatar'), fears: lines(a.fears, LIMITS.list, 'avatar'), tried: lines(a.tried, LIMITS.list, 'avatar'), complains: lines(a.complains, LIMITS.list, 'avatar'),
  };
  p.dreamOutcome = text(src.dreamOutcome, LIMITS.text);
  p.pains = rows(src.pains, LIMITS.pains, 'pains', (x) => {
    const t = text(x.text, LIMITS.short);
    const n = Math.round(Number(x.pain));
    return t ? { text: t, type: oneOf(x.type, PAIN_TYPES, 'tactical'), pain: Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3, source: oneOf(x.source, PAIN_SOURCES, 'self') } : null;
  });
  p.advantage = text(src.advantage, LIMITS.text);
  p.oneThing = text(src.oneThing, LIMITS.short);
  p.statement = { chosen: text(s.chosen, LIMITS.short), alternates: lines(s.alternates, 5, 'statement'), why: text(s.why, LIMITS.text) };
  p.filter = text(src.filter, LIMITS.short);
  p.pillars = rows(src.pillars, LIMITS.pillars, 'pillars', (x) => {
    const name = text(x.name, 100);
    return name ? { name, belief: text(x.belief, LIMITS.short), proof: lines(x.proof, LIMITS.list, 'pillars'), subtopics: lines(x.subtopics, LIMITS.subtopics, 'pillars', 150) } : null;
  });
  const given = new Map((Array.isArray(h.attributes) ? h.attributes : []).map((x) => [obj(x).name, obj(x)]));
  p.hypothesis = { attributes: ATTRIBUTES.map((name) => ({ name, strength: oneOf(given.get(name)?.strength, STRENGTHS, null), evidence: text(given.get(name)?.evidence, LIMITS.short) })), lane: text(h.lane, LIMITS.text) };
  p.voice = text(src.voice, LIMITS.text);
  const ans = obj(src.answers);
  p.answers = Object.fromEntries(ANSWER_IDS.filter((id) => typeof ans[id] === 'string' && ans[id].trim()).map((id) => [id, ans[id].trim().slice(0, LIMITS.text * 2)]));
  return { profile: p, trimmed: SECTIONS.filter((k) => cut.has(k)) };
}

/** The six things other features need before they can judge a video or an idea against this channel. */
export function readiness(p) {
  const checks = [
    { key: 'offer', label: 'Bán gì', ok: !!p.business.offer },
    { key: 'game', label: 'Game', ok: !!p.game },
    { key: 'avatar', label: 'Chân dung avatar', ok: !!p.avatar.portrait },
    { key: 'pains', label: 'Ít nhất 5 nỗi đau', ok: p.pains.length >= 5 },
    { key: 'statement', label: 'Câu định vị', ok: !!p.statement.chosen },
    { key: 'pillars', label: 'Ít nhất 3 pillars', ok: p.pillars.length >= 3 },
  ];
  const done = checks.filter((c) => c.ok).length;
  return { done, total: checks.length, ready: done === checks.length, checks };
}

/**
 * The profile as a short text block for AI prompts ('' when nothing useful is filled). Empty parts are left out.
 * @param {ReturnType<typeof emptyProfile>} p
 */
export function contextText(p) {
  const out = [];
  if (p.game) out.push(`Game: ${GAME_LABELS[p.game]}.${p.objective ? ` Mục tiêu 12–18 tháng: ${p.objective}` : ''}`);
  if (p.statement.chosen) out.push(`Câu định vị: ${p.statement.chosen}`);
  if (p.avatar.name || p.avatar.portrait) {
    const who = [p.avatar.name, p.avatar.tag ? `(${p.avatar.tag})` : ''].filter(Boolean).join(' ');
    const portrait = p.avatar.portrait.length > LIMITS.context ? `${p.avatar.portrait.slice(0, LIMITS.context)}…` : p.avatar.portrait;
    out.push(`Avatar: ${[who, portrait].filter(Boolean).join('. ')}`);
  }
  if (p.pains.length) out.push(`Nỗi đau lớn nhất:\n${p.pains.map((x, i) => ({ x, i })).sort((a, b) => b.x.pain - a.x.pain || a.i - b.i).slice(0, 5).map(({ x }) => `- ${x.text}`).join('\n')}`);
  if (p.pillars.length) out.push(`Pillars:\n${p.pillars.map((x) => `- ${x.name}${x.belief ? `: ${x.belief}` : ''}`).join('\n')}`);
  if (p.filter) out.push(`Câu lọc: ${p.filter}`);
  return out.length ? `HỒ SƠ KÊNH (Soulprint)\n${out.join('\n')}` : '';
}

const foldPlain = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
/** Heading text (accents dropped, lower case) → section. First match wins: the filter rows stand before "avatar". */
const HEADINGS = [
  [/avatar filter|filter questions/, 'filter'],
  [/loi hua|target authority statement/, 'statement'],
  [/khan gia|ideal viewer/, 'avatar'],
  [/bang chung|co che doc quyen|raw material|unfair advantage/, 'advantage'],
  [/goc nhin/, 'pillars'],
  [/duong ra tien|the business/, 'business'],
  [/giong noi|ca tinh/, 'voice'],
  [/the game/, 'game'],
  [/pain.?point bank/, 'pains'],
  [/dream outcome/, 'dreamOutcome'],
  [/the one thing/, 'oneThing'],
];

/**
 * A pasted document (BRAND.md, the interview skills' strategy.md or positioning.md) → draft text per section, by its
 * level-2 headings. Headings nobody knows are returned aside; nothing is thrown away except what exceeds the limit.
 * @param {any} input @returns {{drafts: Record<string, string>, unsorted: {heading: string, text: string}[], cut: boolean}}
 */
export function splitByHeadings(input) {
  const all = typeof input === 'string' ? input.replace(/\r\n?/g, '\n') : '';
  const cut = all.length > LIMITS.importChars;
  const src = all.slice(0, LIMITS.importChars);
  /** @type {Record<string, string>} */
  const drafts = {};
  const unsorted = [];
  if (!src.trim()) return { drafts, unsorted, cut: false };
  // Text before the first level-2 heading is the document's title and intro, unless there is no heading at all.
  const parts = src.split(/^##(?!#)[ \t]*(.*)$/m);
  if (parts.length === 1) return { drafts, unsorted: [{ heading: '', text: src.trim() }], cut };
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i].replace(/^[^\p{L}]+/u, '').replace(/[\s:：]+$/, '');
    const body = (parts[i + 1] ?? '').trim();
    if (!body) continue;
    const section = HEADINGS.find(([re]) => /** @type {RegExp} */ (re).test(foldPlain(heading)))?.[1];
    if (section) drafts[/** @type {string} */ (section)] = drafts[/** @type {string} */ (section)] ? `${drafts[/** @type {string} */ (section)]}\n\n${body}` : body;
    else unsorted.push({ heading, text: body });
  }
  return { drafts, unsorted, cut };
}
