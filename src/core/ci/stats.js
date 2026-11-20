// Customer Intelligence numbers, all computed in code (PRD §1.2 "Code before AI", master prompt §M.10): counts,
// evidence strength, the seven score dimensions and the priority score. A dimension without data is null, never 0. Pure.
import { WEIGHTS, bandOf } from './taxonomy.js';

const DAY = 86_400_000;
const round = (x) => (x == null ? null : Math.round(x));
const clamp = (x) => Math.max(0, Math.min(100, x));

/**
 * @typedef {{comments: Map<string, any>, labels: Map<string, Record<string, string[]>>, total: number, maxShare?: number, now?: number,
 *   thresholds?: {strongComments?: number, strongSources?: number, moderateComments?: number, moderateSources?: number}}} Ctx
 *   comments: analysable comments by ref; labels: effective labels by ref; total: analysable comments of the run
 */

/** Counts behind a pain point / insight. @param {string[]} refs @param {Ctx} ctx */
export function countsOf(refs, ctx) {
  const rows = [...new Set(refs)].map((r) => ctx.comments.get(r)).filter(Boolean);
  const sources = new Set(rows.map((c) => c.sourceRef));
  const platforms = [...new Set(rows.map((c) => c.platform))];
  // People are counted only when every comment carries an author hash; otherwise it is unknown, not the comment count.
  const unique = rows.length && rows.every((c) => c.authorHash) ? new Set(rows.map((c) => c.authorHash)).size : null;
  const dates = rows.map((c) => (c.createdAt ? Date.parse(c.createdAt) : NaN)).filter(Number.isFinite).sort((a, b) => a - b);
  const likes = rows.map((c) => c.likes).filter((x) => x != null);
  /** @type {Record<string, number>} */
  const emotions = {};
  for (const c of rows) for (const e of ctx.labels.get(c.ref)?.emotion ?? []) if (e !== 'unknown' && e !== 'neutral') emotions[e] = (emotions[e] ?? 0) + 1;
  const topEmotion = Object.entries(emotions).sort((a, b) => b[1] - a[1])[0] ?? null;
  return {
    commentCount: rows.length, uniqueCommenterCount: unique, sourceItemCount: sources.size, platforms,
    share: ctx.total ? rows.length / ctx.total : null,
    firstAt: dates.length ? new Date(dates[0]).toISOString() : null, lastAt: dates.length ? new Date(dates[dates.length - 1]).toISOString() : null, dated: dates.length,
    likes: likes.length ? likes.reduce((s, x) => s + x, 0) : null,
    topEmotion: topEmotion ? { key: topEmotion[0], share: topEmotion[1] / rows.length } : null,
  };
}

/**
 * PRD §7.4. Thresholds are per run (config), with defaults for a small niche.
 * @param {{commentCount: number, sourceItemCount: number}} counts @param {boolean} contradictionChecked @param {Ctx['thresholds']} [t]
 * @returns {'strong'|'moderate'|'weak'}
 */
export function evidenceStrength(counts, contradictionChecked, t = {}) {
  const sc = t.strongComments ?? 10, ss = t.strongSources ?? 3, mc = t.moderateComments ?? 4, ms = t.moderateSources ?? 2;
  if (counts.commentCount >= sc && counts.sourceItemCount >= ss && contradictionChecked) return 'strong';
  if (counts.commentCount >= mc && (counts.sourceItemCount >= ms || counts.commentCount >= sc)) return 'moderate';
  return 'weak';
}
const STRENGTH_SCORE = { strong: 100, moderate: 60, weak: 25 };

const shareWith = (rows, ctx, test) => (rows.length ? rows.filter((c) => test(ctx.labels.get(c.ref) ?? {})).length / rows.length : null);
const has = (l, d, values) => (l[d] ?? []).some((v) => values.includes(v));

/**
 * The seven dimensions (0–100 or null) with a one-line reason each.
 * @param {string[]} refs @param {Ctx} ctx @param {{strength: string, userDims?: Record<string, number|null>}} o
 */
export function scoreDims(refs, ctx, { strength, userDims = {} }) {
  const rows = [...new Set(refs)].map((r) => ctx.comments.get(r)).filter(Boolean);
  const labelled = rows.filter((c) => ctx.labels.has(c.ref));
  /** @type {Record<string, number|null>} */
  const dims = {};
  /** @type {Record<string, string>} */
  const why = {};
  const pct = (x) => `${Math.round(x * 100)}%`;

  const share = ctx.total ? rows.length / ctx.total : null;
  dims.prevalence = share == null || !ctx.maxShare ? null : clamp((share / ctx.maxShare) * 100);
  why.prevalence = share == null ? 'Chưa có số comment hợp lệ' : `${rows.length}/${ctx.total} comment hợp lệ (${pct(share)}), so với nỗi đau phổ biến nhất của lần phân tích`;

  const sev = shareWith(labelled, ctx, (l) => has(l, 'emotion', ['anxiety', 'frustration', 'anger']) || has(l, 'pain', ['outcome_risk', 'delay']));
  dims.severity = labelled.length ? clamp((/** @type {number} */ (sev) / 0.6) * 100) : null;
  why.severity = labelled.length ? `${pct(/** @type {number} */ (sev))} comment có lo lắng/bực bội/tức giận hoặc sợ rủi ro/chậm trễ (theo nhãn đã phân loại)` : 'Chưa có nhãn phân loại';

  const intent = shareWith(labelled, ctx, (l) => has(l, 'buying_signal', ['asks_price', 'asks_service', 'asks_consultation', 'asks_next_step', 'explicit_purchase']) || has(l, 'intent', ['service_request', 'recommendation_request']));
  dims.intent = labelled.length ? clamp((/** @type {number} */ (intent) / 0.3) * 100) : null;
  why.intent = labelled.length ? `${pct(/** @type {number} */ (intent))} comment hỏi bước tiếp, giá, dịch vụ hoặc xin gợi ý (like không được tính là ý định)` : 'Chưa có nhãn phân loại';

  // Engagement: each comment's likes ranked within its own platform (no raw cross-platform comparison).
  const byPlatform = new Map();
  for (const c of ctx.comments.values()) if (c.likes != null) (byPlatform.get(c.platform) ?? byPlatform.set(c.platform, []).get(c.platform)).push(c.likes);
  for (const l of byPlatform.values()) l.sort((a, b) => a - b);
  const ranks = rows.filter((c) => c.likes != null).map((c) => {
    const l = byPlatform.get(c.platform);
    let below = 0;
    while (below < l.length && l[below] < c.likes) below++;
    return l.length > 1 ? below / (l.length - 1) : 0.5;
  });
  dims.engagement = ranks.length ? clamp((ranks.reduce((s, x) => s + x, 0) / ranks.length) * 100) : null;
  why.engagement = ranks.length ? `Thứ hạng like trung bình của các comment này trong cùng nền tảng: ${Math.round(/** @type {number} */ (dims.engagement))}/100` : 'Nguồn không có số like';

  dims.evidence_strength = STRENGTH_SCORE[strength] ?? null;
  why.evidence_strength = `Bằng chứng ${strength === 'strong' ? 'mạnh' : strength === 'moderate' ? 'vừa' : 'yếu'}`;

  const now = ctx.now ?? Date.now();
  const ages = rows.map((c) => (c.createdAt ? (now - Date.parse(c.createdAt)) / DAY : NaN)).filter(Number.isFinite).sort((a, b) => a - b);
  if (ages.length) {
    const median = ages[Math.floor(ages.length / 2)];
    dims.freshness = clamp(median <= 7 ? 100 : 100 - ((median - 7) / (180 - 7)) * 100);
    why.freshness = `Tuổi trung vị của comment: ${Math.round(median)} ngày (${ages.length}/${rows.length} comment có ngày)`;
  } else {
    dims.freshness = null;
    why.freshness = 'Không có ngày của comment';
  }

  const fit = userDims.strategic_fit;
  dims.strategic_fit = typeof fit === 'number' ? clamp(fit) : null;
  why.strategic_fit = typeof fit === 'number' ? 'Bạn tự chấm' : 'Chưa chấm: bấm để nhập mức phù hợp với dịch vụ/mục tiêu';

  for (const k of Object.keys(dims)) dims[k] = round(dims[k]);
  return { dims, why };
}

/**
 * PRD §7.2: weighted average of the dimensions that have data, weights renormalised; coverage = weight that had data.
 * @param {Record<string, number|null>} dims @param {Record<string, number>} [weights]
 */
export function priorityOf(dims, weights = WEIGHTS) {
  let sum = 0;
  let w = 0;
  for (const [k, wt] of Object.entries(weights)) {
    if (dims[k] == null) continue;
    sum += /** @type {number} */ (dims[k]) * wt;
    w += wt;
  }
  const total = Object.values(weights).reduce((s, x) => s + x, 0);
  const score = w ? Math.round(sum / w) : null;
  const coverage = total ? w / total : 0;
  return { score, coverage: Math.round(coverage * 100) / 100, band: bandOf(score), dataCoverage: coverage >= 0.7 ? 'good' : coverage >= 0.4 ? 'partial' : 'insufficient_for_scoring' };
}
