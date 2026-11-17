// Batch review (spec 2026-11-16-batch-review-design.md): what happened to the posted videos of a batch, ranked by the
// game chosen in Soulprint, and which bricks go with its top half and its bottom half. Counting only, no AI. Pure.
import { LEGO, FUNNEL } from './card.js';

export const LIMITS = { snapshots: 30, freshDays: 3, enough: 10, keepTop: 3, keepOther: 1, url: 500, line: 200, lines: 10 };
/** Soulprint's game → its name on screen. */
export const GAMES = { conversion: 'Trúng', reach: 'Rộng' };
/** Kallaway's view ceilings. From one Instagram post: a hint to read, never assigned to a video by the app. */
export const LEVELS = /** @type {const} */ ([
  ['Khoảng 1K view', 'Hook thiếu rõ ràng: chủ thể, được mất, đơn giản, siêu rõ'],
  ['Khoảng 10K view', 'Cách đặt vấn đề chưa gắn với kết quả người xem nhận được'],
  ['Khoảng 100K view', 'Góc thiếu độ nổ hoặc thiếu độ rộng'],
]);
const NUMS = ['views', 'likes', 'comments', 'shares', 'saves'];
const DAY = 86_400_000;

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);
/** A count: a whole number from 0, or null for "not known" (never 0). */
const count = (v) => (v === '' || v == null || !Number.isInteger(Number(v)) || Number(v) < 0 ? null : Number(v));
const iso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

export function emptyPublished() {
  return {
    url: '', platform: /** @type {'tiktok'|'youtube'|null} */ (null), videoId: /** @type {string|null} */ (null), postedAt: /** @type {string|null} */ (null),
    snapshots: /** @type {{at: string, views: number|null, likes: number|null, comments: number|null, shares: number|null, saves: number|null}[]} */ ([]),
    leads: /** @type {number|null} */ (null), followers: /** @type {number|null} */ (null), views: /** @type {number|null} */ (null), error: /** @type {string|null} */ (null),
  };
}

/** Whatever is stored or sent → a result with every key. `views` is the owner's own count, for a link the app could not read. @param {any} input */
export function cleanPublished(input) {
  const s = obj(input);
  const p = emptyPublished();
  p.url = typeof s.url === 'string' ? s.url.trim().slice(0, LIMITS.url) : '';
  p.platform = s.platform === 'tiktok' || s.platform === 'youtube' ? s.platform : null;
  p.videoId = typeof s.videoId === 'string' && s.videoId ? s.videoId.slice(0, 64) : null;
  p.postedAt = iso(s.postedAt);
  p.snapshots = /** @type {any} */ (list(s.snapshots).map(obj).filter((x) => iso(x.at)).map((x) => ({ at: iso(x.at), ...Object.fromEntries(NUMS.map((k) => [k, count(x[k])])) })).slice(-LIMITS.snapshots));
  p.leads = count(s.leads);
  p.followers = count(s.followers);
  p.views = count(s.views);
  p.error = typeof s.error === 'string' && s.error ? s.error.slice(0, 300) : null;
  return /** @type {ReturnType<typeof emptyPublished>} */ (p);
}

/** One more set of numbers. A second check on the same day replaces that day's. @param {ReturnType<typeof emptyPublished>} p @param {Record<string, any>} numbers @param {string} at ISO */
export function addSnapshot(p, numbers, at) {
  const snap = { at, ...Object.fromEntries(NUMS.map((k) => [k, count(numbers[k])])) };
  const last = p.snapshots.at(-1);
  const kept = last && last.at.slice(0, 10) === at.slice(0, 10) ? p.snapshots.slice(0, -1) : p.snapshots;
  return cleanPublished({ ...p, snapshots: [...kept, snap], error: null });
}

/** The numbers of one posted video today. @param {ReturnType<typeof emptyPublished>} p @param {number} now ms */
export function metricsOf(p, now) {
  const last = p.snapshots.at(-1) ?? null;
  const views = last?.views ?? p.views;
  const ageDays = p.postedAt ? Math.max(0, Math.floor((now - Date.parse(p.postedAt)) / DAY)) : null;
  return {
    views, likes: last?.likes ?? null, comments: last?.comments ?? null, shares: last?.shares ?? null, saves: last?.saves ?? null,
    shareRate: views && last?.shares != null ? last.shares / views : null,
    leads: p.leads, followers: p.followers, ageDays, fresh: ageDays != null && ageDays < LIMITS.freshDays, checkedAt: last?.at ?? null,
  };
}

/** Kallaway: for a business, money then people then views; for reach, views then shares. */
const ORDER = { conversion: ['leads', 'followers', 'views'], reach: ['views', 'shareRate'], none: ['views'] };
/** Higher first; an unknown number goes after any known one. */
function compare(a, b, keys) {
  for (const k of keys) {
    const x = a[k] ?? -1;
    const y = b[k] ?? -1;
    if (x !== y) return y - x;
  }
  return 0;
}

/**
 * The posted videos of a batch, best first, by the game. A video without the numbers its game ranks by goes after
 * those that have them, and is marked `missing`.
 * @param {{id: number, title: string, published: ReturnType<typeof emptyPublished>}[]} items @param {'conversion'|'reach'|null} game @param {number} now ms
 */
export function rankBatch(items, game, now) {
  const keys = ORDER[game ?? 'none'];
  const rows = items.map((x) => {
    const metrics = metricsOf(x.published, now);
    return { id: x.id, title: x.title, metrics, missing: game === 'conversion' ? metrics.leads == null || metrics.followers == null : metrics.views == null };
  });
  rows.sort((a, b) => Number(a.missing) - Number(b.missing) || compare(a.metrics, b.metrics, keys) || a.id - b.id);
  return { game: game ?? null, note: game ? null : 'Chưa chọn game trong Soulprint. Tạm xếp theo view; chọn game để xếp hạng đúng.', rows: rows.map((r, i) => ({ ...r, rank: i + 1 })) };
}

/**
 * What a card is made of, compared between the halves of a batch: [attribute, value] pairs.
 * @param {any} card a cleaned card @param {any} outline a cleaned outline, or null when the card never had one
 * @returns {[string, string][]}
 */
export function attributesOf(card, outline) {
  const label = (pairs, k) => pairs.find(([x]) => x === k)?.[1] ?? k;
  const hook = outline && outline.chosenHook != null ? outline.hooks[outline.chosenHook] : null;
  return /** @type {[string, string][]} */ ([
    ['Pillar', card.pillar],
    ['Concept', card.concept ?? ''],
    ['Phễu', card.funnel ? label(FUNNEL, card.funnel) : ''],
    ['Kiểu hook', hook?.archetype ?? ''],
    ['Độ dài', outline ? `${outline.length} giây` : ''],
    ...card.keep.map((k) => ['Gạch giữ', label(LEGO, k)]),
    ...card.remix.map((k) => ['Gạch làm lại', label(LEGO, k)]),
    ['Nguồn', card.origin.kind === 'self' ? 'Tự nghĩ' : 'Từ dữ liệu'],
  ].filter(([, v]) => v));
}

const LABEL_ORDER = { keep: 0, review: 1, none: 2 };
const has = (attrs, id, a, v) => (attrs.get(id) ?? []).some(([x, y]) => x === a && y === v);

/**
 * The bricks of the top half against the bottom half. `eligible`: ranked rows with their numbers, posted at least
 * three days ago, best first. With an odd count the middle video belongs to neither half.
 * @param {{id: number}[]} eligible @param {Map<number, [string, string][]>} attrs attributesOf of each card, by id
 */
export function brickTable(eligible, attrs) {
  const n = eligible.length;
  const half = Math.floor(n / 2);
  const top = eligible.slice(0, half).map((r) => r.id);
  const bottom = eligible.slice(n - half).map((r) => r.id);
  const pairs = new Map();
  for (const r of eligible) for (const [a, v] of attrs.get(r.id) ?? []) pairs.set(`${a}\u0000${v}`, [a, v]);
  const rows = [...pairs.values()]
    .filter(([a, v]) => !eligible.every((r) => has(attrs, r.id, a, v))) // every video has it: it tells nothing apart
    .map(([a, v]) => {
      const t = top.filter((id) => has(attrs, id, a, v)).length;
      const d = bottom.filter((id) => has(attrs, id, a, v)).length;
      const label = t >= LIMITS.keepTop && d <= LIMITS.keepOther ? 'keep' : d >= LIMITS.keepTop && t <= LIMITS.keepOther ? 'review' : null;
      return { attr: a, value: v, top: t, bottom: d, label };
    })
    .filter((r) => r.top + r.bottom > 0)
    .sort((a, b) => LABEL_ORDER[a.label ?? 'none'] - LABEL_ORDER[b.label ?? 'none'] || b.top + b.bottom - (a.top + a.bottom) || a.attr.localeCompare(b.attr) || a.value.localeCompare(b.value));
  return { n, top, bottom, note: n < LIMITS.enough ? `Mới có ${n} video, chưa đủ để kết luận. Kallaway khuyên xem theo lô 10.` : null, rows };
}

/** "Concept So sánh: 4 video nửa trên, 1 video nửa dưới". @param {{attr: string, value: string, top: number, bottom: number}} r */
export const rowText = (r) => `${r.attr} ${r.value}: ${r.top} video nửa trên, ${r.bottom} video nửa dưới`;

/** The table's rows that carry a label, as lines to take into the next batch. @param {ReturnType<typeof brickTable>} table */
export const proposalsOf = (table) => table.rows.filter((r) => r.label).map((r) => ({ kind: /** @type {'keep'|'review'} */ (r.label), text: rowText(r) }));

const SINGLE = ['Concept', 'Phễu', 'Kiểu hook', 'Độ dài', 'Nguồn'];
const valueOf = (attrs, id, a) => (attrs.get(id) ?? []).find(([x]) => x === a)?.[1] ?? '';

/**
 * For each video of the bottom half: where it differs from the top-half videos of the same pillar. Kallaway: find the
 * brick that lost before remaking, rather than dropping the whole format.
 * @param {ReturnType<typeof brickTable>} table @param {Map<number, [string, string][]>} attrs @param {Map<number, string>} titles
 */
export function loserDiffs(table, attrs, titles) {
  return table.bottom.map((id) => {
    const pillar = valueOf(attrs, id, 'Pillar');
    const peers = pillar ? table.top.filter((t) => valueOf(attrs, t, 'Pillar') === pillar) : [];
    const base = { id, title: titles.get(id) ?? '', pillar };
    if (!pillar) return { ...base, diffs: [], note: 'Thẻ chưa ghi pillar nên chưa so được' };
    if (!peers.length) return { ...base, diffs: [], note: `Không có video nửa trên cùng pillar "${pillar}" để so` };
    const diffs = [];
    for (const a of SINGLE) {
      const mine = valueOf(attrs, id, a);
      const theirs = [...new Set(peers.map((p) => valueOf(attrs, p, a)).filter(Boolean))];
      if (theirs.length && !theirs.includes(mine)) diffs.push({ attr: a, mine: mine || '(chưa có)', theirs });
    }
    // A brick every top video of the pillar kept, and this one did not.
    const kept = [...new Set(peers.flatMap((p) => (attrs.get(p) ?? []).filter(([x]) => x === 'Gạch giữ').map(([, v]) => v)))];
    for (const v of kept) if (peers.every((p) => has(attrs, p, 'Gạch giữ', v)) && !has(attrs, id, 'Gạch giữ', v)) diffs.push({ attr: 'Gạch giữ', mine: 'không giữ', theirs: [v] });
    return { ...base, diffs, note: diffs.length ? null : 'Giống các video nửa trên cùng pillar ở mọi gạch đã ghi' };
  });
}

/** What the owner takes from a closed batch, with the game it was judged by. @param {any} input @param {{game: string|null, at: string}} o */
export function cleanLearned(input, { game, at }) {
  const s = obj(input);
  const lines = (v) => [...new Set(list(v).map((x) => (typeof x === 'string' ? x.trim().slice(0, LIMITS.line) : '')).filter(Boolean))].slice(0, LIMITS.lines);
  return { game: game === 'conversion' || game === 'reach' ? game : null, keep: lines(s.keep), review: lines(s.review), at };
}
