# Batch review (phase 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the loop of the idea board: attach each posted video to its card (numbers read by the app, leads and followers typed by the owner), rank a batch by the game chosen in Soulprint, show which bricks go with the top half and which with the bottom half, and close the batch with what to keep, shown at the top of the next one, with a one-click remake of the batch's winner.

**Architecture:** The result of a card lives in a new `published` column of `ideas`, beside the card JSON (same reason as the outline: `cleanCard` drops unknown keys). Pure logic in `src/core/ideas/review.js` (cleaning, snapshots, metrics, ranking, brick halves, the bottom half's differences, closing lines). The idea feature reads numbers through the existing TikTok and YouTube sources, runs the `batch_refresh` job, and builds the review. The board gains a "Kết quả" tab; a new "Chấm lô" screen is the second tab of the board's sidebar entry.

**Tech Stack:** Node ES modules, JSDoc + `tsc --checkJs`, `node:test`, `node:sqlite`. Web: plain ES modules. No AI. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-batch-review-design.md`

**Reference build:** branch `feature/batch-review` holds this exact plan already built and checked (436 tests, browser check on the preview server). Execute the plan from `main`, or compare against that branch, or merge it instead of executing.

## Global Constraints

- No new npm dependencies. Layer rules of `docs/ARCHITECTURE.md` hold and `test/arch.test.js` must pass: `core/` is pure; features never import adapters; only `src/app.js` picks adapters; only web views import `web/http/client.js`.
- Run tests with `npm test` (typecheck first). One file: `node --disable-warning=ExperimentalWarning --test test/path/file.test.js`. Always pass files or quoted globs to `--test`, never a bare directory. An HTTP test that fails before `s.close()` hangs the run: wrap new HTTP tests in `try { … } finally { s.close(); }`.
- Never start a server on the real `data/` folder. Browser checks use `preview-5w1h` in `.claude/launch.json` (data in `/tmp/ytr-5w1h-preview`, port 5199).
- No AI anywhere in this phase. Everything is counted by code.
- Numbers the app reads: TikTok `plays, likes, comments, shares, saves, createdAt`; YouTube `views, likes, comments, publishedAt` (no shares, no saves). Numbers the owner types: leads (khách hoặc email), followers gained, and views only for a link the app could not read. Empty means "not known", which is never the same as 0.
- Ranking: game `conversion` (Trúng) → leads, then followers, then views; game `reach` (Rộng) → views, then share rate (shares ÷ views); no game → views, with the note "Chưa chọn game trong Soulprint. Tạm xếp theo view; chọn game để xếp hạng đúng." A video without the numbers its game ranks by goes after the others and is marked "chưa nhập" (conversion) or "chưa có view".
- A video posted fewer than 3 days ago is marked "còn mới" and left out of the brick table.
- Brick table: the videos with their numbers and at least 3 days old, best first, split into a top half and a bottom half; with an odd count the middle video is in neither. A value is "nên giữ" at ≥ 3 top and ≤ 1 bottom, "xem lại" at ≥ 3 bottom and ≤ 1 top. A value every such video has is not shown. Under 10 videos: "Mới có N video, chưa đủ để kết luận. Kallaway khuyên xem theo lô 10."
- Kallaway's view ceilings (1K, 10K, 100K) are shown as a hint, "Chỉ từ một bài đăng, không phải luật", and the app never assigns a video to one.
- One snapshot per calendar day (a second check the same day replaces it), at most 30 per card.
- A video link is attached to one card only, checked again after a short link is loaded.
- Closing an open batch keeps the ticked lines in `idea_batches.learned` with the game at that moment and opens a new batch. A closed batch can have its lines replaced; its numbers stay editable. "Làm lại video này" only after the batch is closed, into the open batch.
- User-facing text is Vietnamese exactly as written here. Code comments are English. Every server- or user-provided string goes through `esc()` before entering HTML.
- Commit after every task. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A short TikTok link (`vm.tiktok.com/…`) for a video already on another card.** Expected: refused once loaded, by the real id; nothing saved on the second card. Test in Task 2.
2. **The owner types 0, leaves a box empty, or types −1, 2.5, "nhiều".** Expected: 0 is a number, empty is "not known", the rest refused with the field named; a box not sent stays as it was. Test in Task 2.
3. **A video posted today in a batch otherwise old enough.** Expected: ranked and marked "còn mới", but in neither half of the brick table. Test in Task 3.
4. **The game changes after a batch was closed.** Expected: the ranking follows the new game; the closed lines keep the game they were judged by, and are replaced (with today's game) only when the owner saves them again. Test in Task 3.
5. **Attaching a link while the card has unsaved edits on another tab.** Expected: the card on screen takes the new status and result, the unsaved edits stay, and a later Lưu does not undo "Đã đăng". Browser check in Task 4 (`swapIn`).

---

## File structure

| File | Responsibility |
|---|---|
| `src/core/ideas/review.js` (new) | result shape and cleaning, snapshots, metrics, ranking, brick halves, bottom-half differences, closing lines, view ceilings |
| `src/core/report/review.js` (new) | Markdown of a reviewed batch |
| `src/store/sqlite/migrations/010_published.sql` (new) | one column on `ideas` |
| `src/store/sqlite/repos/ideas.js` (modify) | `published` on a card row; `savePublished`, `publishedCards`, `saveLearned`, `lastLearned` |
| `src/core/ideas/card.js`, `src/core/ideas/precedent.js`, `src/core/report/ideas.js` (modify) | the `redo` origin |
| `src/features/ideas.js` (modify) | attach, counts, refresh job, review, close, remake source |
| `src/features/bricks.js` (modify) | export `TIKTOK_LINK` |
| `src/app.js`, `src/http/routes/ideas.js`, `src/http/routes/jobs.js` (modify) | wiring, routes, job schema |
| `web/views/board.js`, `web/views/board-review.js` (new), `web/http/client.js`, `web/nav.js`, `web/lib.js`, `web/kinds.js` (modify) | Kết quả tab, Chấm lô screen |

---

### Task 1: Core: results, ranking, brick halves

**Files:**
- Create: `src/core/ideas/review.js`
- Test: `test/core/review.test.js`

**Interfaces:**
- Consumes: `LEGO`, `FUNNEL`, `cleanCard` from `src/core/ideas/card.js`; `cleanOutline` from `src/core/outline/outline.js` (tests only).
- Produces (used by Tasks 2–4):
  - `LIMITS`, `GAMES = { conversion: 'Trúng', reach: 'Rộng' }`, `LEVELS: [label, cause][]`
  - `emptyPublished()`, `cleanPublished(input)` → `{url, platform, videoId, postedAt, snapshots[], leads, followers, views, error}`
  - `addSnapshot(p, numbers, atIso)` → cleaned result
  - `metricsOf(p, nowMs)` → `{views, likes, comments, shares, saves, shareRate, leads, followers, ageDays, fresh, checkedAt}`
  - `rankBatch(items, game, nowMs)` → `{game, note, rows: {id, title, metrics, missing, rank}[]}`
  - `attributesOf(card, outline|null)` → `[attr, value][]`
  - `brickTable(eligible, attrs)` → `{n, top: id[], bottom: id[], note, rows: {attr, value, top, bottom, label}[]}`
  - `rowText(row)`, `proposalsOf(table)` → `{kind, text}[]`
  - `loserDiffs(table, attrs, titles)` → `{id, title, pillar, diffs: {attr, mine, theirs[]}[], note}[]`
  - `cleanLearned(input, {game, at})` → `{game, keep[], review[], at}`

- [ ] **Step 1: Write the failing test**

Create `test/core/review.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, emptyPublished, cleanPublished, addSnapshot, metricsOf, rankBatch, attributesOf, brickTable, rowText, proposalsOf, loserDiffs, cleanLearned } from '../../src/core/ideas/review.js';
import { cleanCard } from '../../src/core/ideas/card.js';
import { cleanOutline } from '../../src/core/outline/outline.js';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();
/** A posted video: its numbers on one check, and the owner's own counts. */
const pub = (o = {}) => cleanPublished({ url: 'u', platform: 'tiktok', postedAt: daysAgo(o.age ?? 10), snapshots: o.views === undefined ? [] : [{ at: daysAgo(0), views: o.views, shares: o.shares ?? 0, likes: 1, comments: 1 }], leads: o.leads, followers: o.followers, views: o.manual });

test('a result: junk becomes empty, a count is a whole number from 0 or unknown, never 0 by default', () => {
  assert.deepEqual(cleanPublished(null), emptyPublished());
  const p = cleanPublished({ url: ' https://x ', platform: 'facebook', postedAt: 'hôm qua', leads: '5', followers: -1, views: 2.5, snapshots: [{ at: 'x', views: 1 }, { at: daysAgo(1), views: '7', shares: 'nhiều' }] });
  assert.deepEqual([p.url, p.platform, p.postedAt, p.leads, p.followers, p.views], ['https://x', null, null, 5, null, null]);
  assert.deepEqual(p.snapshots, [{ at: daysAgo(1), views: 7, likes: null, comments: null, shares: null, saves: null }]);
  assert.equal(cleanPublished({ leads: 0 }).leads, 0, 'zero is a number, not "unknown"');
  assert.equal(cleanPublished({ snapshots: Array.from({ length: 40 }, (_, i) => ({ at: daysAgo(40 - i), views: i })) }).snapshots.length, 30);
});

test('snapshots: one per day, the newest of a day wins; numbers today come from the last one, or the owner\'s count', () => {
  let p = cleanPublished({ url: 'u', postedAt: daysAgo(2) });
  p = addSnapshot(p, { views: 100, shares: 5 }, '2026-11-16T08:00:00.000Z');
  p = addSnapshot(p, { views: 300, shares: 30 }, '2026-11-17T08:00:00.000Z');
  p = addSnapshot({ ...p, error: 'cũ' }, { views: 400, shares: 40 }, '2026-11-17T11:00:00.000Z');
  assert.deepEqual([p.snapshots.map((s) => s.views), p.error], [[100, 400], null]);
  const m = metricsOf(p, NOW);
  assert.deepEqual([m.views, m.shares, m.shareRate, m.ageDays, m.fresh, m.checkedAt], [400, 40, 0.1, 2, true, '2026-11-17T11:00:00.000Z']);
  const manual = metricsOf(cleanPublished({ url: 'u', views: 900 }), NOW);
  assert.deepEqual([manual.views, manual.shareRate, manual.ageDays, manual.fresh], [900, null, null, false], 'no posting date: never "còn mới"');
});

test('ranking for the conversion game: leads, then followers, then views; a video without both counts goes last', () => {
  const r = rankBatch([
    { id: 1, title: 'A', published: pub({ views: 100, leads: 5, followers: 10 }) },
    { id: 2, title: 'B', published: pub({ views: 50, leads: 5, followers: 20 }) },
    { id: 3, title: 'C', published: pub({ views: 10000, followers: 3 }) },
    { id: 4, title: 'D', published: pub({ views: 10, leads: 9, followers: 0 }) },
    { id: 5, title: 'E', published: pub({ views: 5, leads: 0, followers: 0 }) },
  ], 'conversion', NOW);
  assert.deepEqual(r.rows.map((x) => [x.rank, x.id, x.missing]), [[1, 4, false], [2, 2, false], [3, 1, false], [4, 5, false], [5, 3, true]]);
  assert.equal(r.note, null);
});

test('ranking for reach: views, then share rate; with no game: views, and a note to choose one', () => {
  const items = [
    { id: 1, title: 'A', published: pub({ views: 1000, shares: 10 }) },
    { id: 2, title: 'B', published: pub({ views: 1000, shares: 100 }) },
    { id: 3, title: 'C', published: pub({ manual: 5000 }) },
    { id: 4, title: 'D', published: pub({}) },
  ];
  assert.deepEqual(rankBatch(items, 'reach', NOW).rows.map((x) => [x.id, x.missing]), [[3, false], [2, false], [1, false], [4, true]]);
  const none = rankBatch(items, null, NOW);
  assert.deepEqual(none.rows.map((x) => x.id), [3, 1, 2, 4]);
  assert.match(/** @type {string} */ (none.note), /Chưa chọn game trong Soulprint/);
});

test('attributes of a card: pillar, concept, funnel, the chosen hook\'s archetype, length, bricks, source', () => {
  const card = cleanCard({ origin: { kind: 'brick', ref: 'tiktok:1', snapshot: {} }, pillar: 'Phỏng vấn', concept: 'So sánh', funnel: 'tin', keep: ['topic', 'audio'], remix: ['hookStructure'] });
  const outline = cleanOutline({ length: 30, hooks: [{ archetype: 'Teacher', lean: 'l' }], chosenHook: 0 });
  assert.deepEqual(attributesOf(card, outline), [['Pillar', 'Phỏng vấn'], ['Concept', 'So sánh'], ['Phễu', 'Tin'], ['Kiểu hook', 'Teacher'], ['Độ dài', '30 giây'], ['Gạch giữ', 'Topic'], ['Gạch giữ', 'Audio'], ['Gạch làm lại', 'Hook Structure'], ['Nguồn', 'Từ dữ liệu']]);
  assert.deepEqual(attributesOf(cleanCard({}), null), [['Nguồn', 'Tự nghĩ']], 'no outline: no length, no hook');
});

/** Seven videos, best first; the fourth is the middle one. */
const SEVEN = new Map(/** @type {[number, [string, string][]][]} */ ([
  [1, [['Pillar', 'P'], ['Concept', 'So sánh'], ['Kiểu hook', 'Teacher'], ['Nguồn', 'Tự nghĩ']]],
  [2, [['Pillar', 'P'], ['Concept', 'So sánh'], ['Kiểu hook', 'Magician'], ['Nguồn', 'Tự nghĩ']]],
  [3, [['Pillar', 'P'], ['Concept', 'So sánh'], ['Kiểu hook', 'Magician'], ['Nguồn', 'Tự nghĩ']]],
  [4, [['Pillar', 'P'], ['Concept', 'Số'], ['Kiểu hook', 'Teacher'], ['Nguồn', 'Tự nghĩ']]],
  [5, [['Pillar', 'P'], ['Concept', 'So sánh'], ['Kiểu hook', 'Teacher'], ['Nguồn', 'Tự nghĩ']]],
  [6, [['Pillar', 'P'], ['Concept', 'Số'], ['Kiểu hook', 'Teacher'], ['Nguồn', 'Tự nghĩ']]],
  [7, [['Pillar', 'P'], ['Concept', 'Số'], ['Kiểu hook', 'Teacher'], ['Nguồn', 'Tự nghĩ']]],
]));
const ranked = (ids) => ids.map((id) => ({ id }));

test('the brick table: halves without the middle video, keep and review at their limits, shared values hidden', () => {
  const t = brickTable(ranked([1, 2, 3, 4, 5, 6, 7]), SEVEN);
  assert.deepEqual([t.n, t.top, t.bottom], [7, [1, 2, 3], [5, 6, 7]]);
  assert.deepEqual(t.rows.map((r) => [r.attr, r.value, r.top, r.bottom, r.label]), [
    ['Concept', 'So sánh', 3, 1, 'keep'],
    ['Kiểu hook', 'Teacher', 1, 3, 'review'],
    ['Concept', 'Số', 0, 2, null],
    ['Kiểu hook', 'Magician', 2, 0, null],
  ], 'Pillar P and Nguồn Tự nghĩ are on every video: not shown');
  assert.equal(t.note, 'Mới có 7 video, chưa đủ để kết luận. Kallaway khuyên xem theo lô 10.');
  assert.equal(rowText(t.rows[0]), 'Concept So sánh: 3 video nửa trên, 1 video nửa dưới');
  assert.deepEqual(proposalsOf(t), [{ kind: 'keep', text: 'Concept So sánh: 3 video nửa trên, 1 video nửa dưới' }, { kind: 'review', text: 'Kiểu hook Teacher: 1 video nửa trên, 3 video nửa dưới' }]);
  const ten = new Map([...SEVEN, [8, SEVEN.get(1)], [9, SEVEN.get(1)], [10, SEVEN.get(7)]]);
  assert.equal(brickTable(ranked([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), ten).note, null, 'ten videos: no warning');
  assert.deepEqual(brickTable(ranked([1]), SEVEN), { n: 1, top: [], bottom: [], note: 'Mới có 1 video, chưa đủ để kết luận. Kallaway khuyên xem theo lô 10.', rows: [] });
});

test('the bottom half: what differs from the top videos of the same pillar, including a brick they all kept', () => {
  const t = brickTable(ranked([1, 2, 3, 4, 5, 6, 7]), SEVEN);
  const titles = new Map([...SEVEN.keys()].map((id) => [id, `Video ${id}`]));
  const l = loserDiffs(t, SEVEN, titles);
  assert.deepEqual(l.map((x) => [x.id, x.diffs, x.note]), [
    [5, [], 'Giống các video nửa trên cùng pillar ở mọi gạch đã ghi'],
    [6, [{ attr: 'Concept', mine: 'Số', theirs: ['So sánh'] }], null],
    [7, [{ attr: 'Concept', mine: 'Số', theirs: ['So sánh'] }], null],
  ]);
  const four = new Map(/** @type {[number, [string, string][]][]} */ ([
    [1, [['Pillar', 'P'], ['Gạch giữ', 'Audio'], ['Concept', 'X']]],
    [2, [['Pillar', 'P'], ['Gạch giữ', 'Audio'], ['Concept', 'X']]],
    [3, [['Pillar', 'P'], ['Concept', 'X']]],
    [4, [['Pillar', 'Q'], ['Concept', 'X']]],
  ]));
  const l4 = loserDiffs(brickTable(ranked([1, 2, 3, 4]), four), four, new Map());
  assert.deepEqual(l4.map((x) => [x.id, x.diffs, x.note]), [
    [3, [{ attr: 'Gạch giữ', mine: 'không giữ', theirs: ['Audio'] }], null],
    [4, [], 'Không có video nửa trên cùng pillar "Q" để so'],
  ]);
  const noPillar = new Map(/** @type {[number, [string, string][]][]} */ ([[1, [['Concept', 'X']]], [2, [['Concept', 'Y']]]]));
  assert.equal(loserDiffs(brickTable(ranked([1, 2]), noPillar), noPillar, new Map())[0].note, 'Thẻ chưa ghi pillar nên chưa so được');
});

test('what a closed batch leaves: short distinct lines, the game it was judged by; the view ceilings are only a hint', () => {
  const l = cleanLearned({ keep: [' Concept So sánh ', 'Concept So sánh', '', 3, 'x'.repeat(300)], review: 'không phải mảng' }, { game: 'reach', at: 't' });
  assert.deepEqual([l.game, l.keep.length, l.keep[0], l.keep[1].length, l.review, l.at], ['reach', 2, 'Concept So sánh', 200, [], 't']);
  assert.equal(cleanLearned({}, { game: 'robot', at: 't' }).game, null);
  assert.deepEqual(LEVELS.map((x) => x[0]), ['Khoảng 1K view', 'Khoảng 10K view', 'Khoảng 100K view']);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --disable-warning=ExperimentalWarning --test test/core/review.test.js`
Expected: FAIL, `Cannot find module '…/src/core/ideas/review.js'`.

- [ ] **Step 3: Write the module**

Create `src/core/ideas/review.js`:

```js
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
```

- [ ] **Step 4: Run the test and the typecheck**

Run: `node --disable-warning=ExperimentalWarning --test test/core/review.test.js && npm run typecheck`
Expected: 8 pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/core/ideas/review.js test/core/review.test.js
git commit -m "feat: core of the batch review (results, ranking by game, brick halves)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Posted links, own counts, the refresh job

**Files:**
- Create: `src/store/sqlite/migrations/010_published.sql`, `test/features/ideas-review.test.js`
- Modify: `src/store/sqlite/repos/ideas.js`, `src/features/ideas.js`, `src/features/bricks.js:15`, `src/app.js`, `src/http/routes/jobs.js`, `src/http/routes/ideas.js`
- Test: `test/features/ideas-review.test.js`, `test/http/ideas-api.test.js`

**Interfaces:**
- Consumes: Task 1 (`cleanPublished`, `addSnapshot`, `metricsOf`); ports `TikTokSource.getVideo(url)` → `{video}`; `YouTubeSource.getVideo(id, {likes: true})`; `youtubeIdOf` from `src/features/video-analysis.js`; `noop` from `src/features/shared.js`; `rethrowIfCancelled` from `src/core/cancel.js`.
- Produces:
  - repo: card rows carry `published` (parsed JSON or null); `savePublished(ws, id, published|null)`; `publishedCards(ws)`
  - `makeIdeas` takes `tiktok, source, now = Date.now`
  - a card view gains `published` (cleaned or null) and `result` (`metricsOf` or null)
  - `features.ideas.attachVideo(id, url)`, `clearVideo(id)`, `saveResult(id, {leads?, followers?, views?})` → card view; `refresh({batchId}, progress)` → `{inline: true, checked, failed}`
  - routes `POST /api/v1/ideas/:id/video {url}`, `DELETE /api/v1/ideas/:id/video`, `POST /api/v1/ideas/:id/result {leads, followers, views}`; job kind `batch_refresh {batchId}` titled "Cập nhật số liệu lô"

- [ ] **Step 1: Write the failing feature test**

Create `test/features/ideas-review.test.js`:

```js
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
```

- [ ] **Step 2: Write the failing HTTP test**

Append to `test/http/ideas-api.test.js`:

```js
test('a posted video, own counts and the refresh job over HTTP', async () => {
  const s = await boot();
  try {
    const c = await (await post(`${s.base}/api/v1/ideas`, { from: 'self' })).json();
    const v = await (await post(`${s.base}/api/v1/ideas/${c.id}/video`, { url: 'https://www.tiktok.com/@creator/video/7000000000000000002' })).json();
    assert.deepEqual([v.status, v.published.videoId], ['posted', '7000000000000000002']);
    assert.equal((await post(`${s.base}/api/v1/ideas/${c.id}/video`, {})).status, 400);
    const bad = await post(`${s.base}/api/v1/ideas/${c.id}/result`, { leads: -1 });
    assert.deepEqual([bad.status, (await bad.json()).error.field], [400, 'leads']);
    assert.equal((await (await post(`${s.base}/api/v1/ideas/${c.id}/result`, { leads: 3 })).json()).published.leads, 3);
    const job = await (await post(`${s.base}/api/v1/jobs/batch_refresh`, { batchId: c.batchId })).json();
    let j = job;
    for (let i = 0; i < 50 && !['succeeded', 'failed'].includes(j.status); i++) j = await (await new Promise((ok) => setTimeout(ok, 20)), get(`${s.base}/api/v1/jobs/${job.id}`));
    assert.deepEqual([j.status, j.title, j.result.checked], ['succeeded', 'Cập nhật số liệu lô', 1]);
    assert.equal((await post(`${s.base}/api/v1/jobs/batch_refresh`, {})).status, 400, 'batchId is required');
    const off = await (await fetch(`${s.base}/api/v1/ideas/${c.id}/video`, { method: 'DELETE' })).json();
    assert.deepEqual([off.published, off.status], [null, 'filmed']);
  } finally {
    s.close();
  }
});
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/features/ideas-review.test.js`
Expected: FAIL, `f.attachVideo is not a function`.

- [ ] **Step 4: The column and the repo**

Create `src/store/sqlite/migrations/010_published.sql`:

```sql
-- What happened to an idea card once posted (core/ideas/review.js): the link, snapshots of its numbers and the owner's
-- own counts. Beside the card's JSON, like the outline, so the card's cleaning never touches it.
ALTER TABLE ideas ADD COLUMN published TEXT;
```

In `src/store/sqlite/repos/ideas.js`, the card row gains `published` (after `script`):

```js
  const card = (r) => (r ? { id: r.id, batchId: r.batch_id, status: r.status, data: JSON.parse(r.data), outline: r.outline ? JSON.parse(r.outline) : null, script: r.script ?? '', published: r.published ? JSON.parse(r.published) : null, createdAt: r.created_at, updatedAt: r.updated_at } : null);
```

and, right before `removeCard`:

```js
    /** @param {any} published null: the link is removed */
    savePublished: (ws, id, published) => void db.prepare('UPDATE ideas SET published = ?, updated_at = ? WHERE workspace_id = ? AND id = ?').run(published == null ? null : JSON.stringify(published), now(), ws, id),
    /** Every card with a posted link, in any batch: a link is attached to one card only. */
    publishedCards: (ws) => /** @type {any[]} */ (db.prepare('SELECT * FROM ideas WHERE workspace_id = ? AND published IS NOT NULL ORDER BY id').all(ws)).map(card),
```

- [ ] **Step 5: Share the TikTok link pattern**

In `src/features/bricks.js`, export the existing constant:

```js
/** A TikTok link, or a bare video id. Shared with the idea board's posted links. */
export const TIKTOK_LINK = /^(https?:\/\/)?([a-z0-9-]+\.)*tiktok\.com\/|^\d{15,25}$/i;
```

- [ ] **Step 6: The use case**

In `src/features/ideas.js`:

Add imports after the outline imports:

```js
import { cleanPublished, addSnapshot, metricsOf } from '../core/ideas/review.js';
import { TIKTOK_LINK } from './bricks.js';
import { youtubeIdOf } from './video-analysis.js';
import { noop } from './shared.js';
import { rethrowIfCancelled } from '../core/cancel.js';
```

Replace the deps JSDoc tail and the signature:

```js
 *   knowledge?: string, hookKnowledge?: string, profileText?: () => string,
 *   tiktok: import('../ports/tiktok-source.js').TikTokSource, source: import('../ports/youtube-source.js').YouTubeSource, now?: () => number}} deps
 *   library: the brick library (features.bricks), read for question 1 and for cards made from a video
 *   tiktok, source: read the numbers of posted videos
 */
export function makeIdeas({ repo, ws, settings, profile, library, fiveW, llm, knowledge = '', hookKnowledge = '', profileText = () => '', tiktok, source, now = Date.now }) {
```

Right before `function openBatchId() {`:

```js
  /** How a card is named in messages and lists. @param {any} row */
  function titleOf(row) {
    const c = cleanCard(row.data);
    return c.title.text || c.topic || `Thẻ ${row.id}`;
  }

```

In `view(row, ctx)`, read the result after the outline:

```js
    const outline = cleanOutline(row.outline);
    const published = row.published ? cleanPublished(row.published) : null;
```

and add it to the returned view, after `gaps: outlineGaps(outline, card),`:

```js
published, result: published && metricsOf(published, now()),
```

Right before the final `return {` of `makeIdeas`:

```js
  /** A pasted link → its platform and id; null when it is neither. A short TikTok link shows its id only once loaded. @param {string} url */
  function linkOf(url) {
    if (TIKTOK_LINK.test(url)) return { platform: /** @type {const} */ ('tiktok'), videoId: url.match(/(\d{15,25})/)?.[1] ?? null };
    const yt = youtubeIdOf(url);
    return yt ? { platform: /** @type {const} */ ('youtube'), videoId: yt } : null;
  }
  /** The numbers of one posted video, from its platform. @param {'tiktok'|'youtube'} platform @param {string} url @param {string|null} videoId */
  async function fetchNumbers(platform, url, videoId) {
    if (platform === 'tiktok') {
      const { video: v } = await tiktok.getVideo(url);
      return { videoId: String(v.id), postedAt: v.createdAt ?? null, numbers: { views: v.plays, likes: v.likes, comments: v.comments, shares: v.shares, saves: v.saves } };
    }
    const v = await source.getVideo(/** @type {string} */ (videoId), { likes: true });
    return { videoId: /** @type {string} */ (videoId), postedAt: v.publishedAt ?? null, numbers: { views: v.views, likes: v.likes, comments: v.comments, shares: null, saves: null } };
  }
  /** Throws when another card already holds this video. @param {number} id @param {string} url @param {{platform: string, videoId: string|null}} link */
  function notTaken(id, url, { platform, videoId }) {
    const other = repo.publishedCards(ws).find((r) => r.id !== id && (r.published.url === url || (videoId && r.published.platform === platform && r.published.videoId === videoId)));
    if (other) throw invalid(`Video này đã gắn vào thẻ "${titleOf(other)}"`, 'url');
  }

  /**
   * Attaches the posted video to a card and reads its numbers. A link the app cannot read is kept with the reason, and
   * the owner can type the views. The card becomes "Đã đăng". @param {number|string} id @param {string} url
   */
  async function attachVideo(id, url) {
    const row = one(id);
    if (row.status === 'dropped') throw invalid('Thẻ đang bị bỏ. Đưa thẻ lại vào lô trước khi gắn video.', 'status');
    const clean = String(url ?? '').trim().slice(0, 500);
    const link = linkOf(clean);
    if (!link) throw invalid('Không nhận ra link video TikTok hoặc YouTube', 'url');
    notTaken(row.id, clean, link);
    const before = cleanPublished(row.published);
    // A new link starts its numbers over; the owner's own counts stay.
    let p = cleanPublished({ ...before, url: clean, platform: link.platform, videoId: link.videoId, ...(before.url === clean ? {} : { snapshots: [], postedAt: null }) });
    try {
      const got = await fetchNumbers(link.platform, clean, link.videoId);
      notTaken(row.id, clean, { platform: link.platform, videoId: got.videoId });
      p = addSnapshot(cleanPublished({ ...p, videoId: got.videoId, postedAt: got.postedAt ?? p.postedAt }), got.numbers, new Date(now()).toISOString());
    } catch (e) {
      if (/** @type {any} */ (e)?.code === 'invalid_input') throw e;
      p = cleanPublished({ ...p, error: `Không lấy được số liệu: ${String(/** @type {any} */ (e)?.message || e)}. Có thể nhập view bằng tay.` });
    }
    repo.savePublished(ws, row.id, p);
    if (row.status !== 'posted') repo.saveCard(ws, row.id, 'posted', cleanCard(row.data));
    return view(repo.getCard(ws, row.id), context());
  }
  /** Removes the link and its numbers; a posted card goes back to "Đã quay". @param {number|string} id */
  function clearVideo(id) {
    const row = one(id);
    repo.savePublished(ws, row.id, null);
    if (row.status === 'posted') repo.saveCard(ws, row.id, 'filmed', cleanCard(row.data));
    return view(repo.getCard(ws, row.id), context());
  }
  /**
   * The owner's own counts: leads, followers gained, and views when the link could not be read. A key left out stays
   * as it was; empty means "not known". @param {number|string} id @param {{leads?: any, followers?: any, views?: any}} input
   */
  function saveResult(id, input) {
    const row = one(id);
    if (!row.published?.url) throw invalid('Gắn link video đã đăng trước khi nhập số', 'url');
    const s = input && typeof input === 'object' ? input : {};
    const before = cleanPublished(row.published);
    const num = (k, label) => {
      const v = s[k];
      if (v === undefined) return before[k];
      if (v === null || v === '') return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) throw invalid(`${label} phải là số nguyên từ 0 trở lên, hoặc để trống nếu chưa biết`, k);
      return n;
    };
    repo.savePublished(ws, row.id, cleanPublished({ ...before, leads: num('leads', 'Số khách'), followers: num('followers', 'Số follower tăng'), views: num('views', 'Số view') }));
    return view(repo.getCard(ws, row.id), context());
  }

  /** Job batch_refresh: new numbers for every card of a batch with a link. A failed video keeps its old numbers and says why. */
  async function refresh(p = /** @type {any} */ ({}), progress = noop) {
    const batch = repo.getBatch(ws, Number(p.batchId));
    if (!batch) throw notFound('Không thấy lô này');
    const list = repo.cards(ws, batch.id).filter((r) => r.status !== 'dropped' && r.published?.url && r.published.platform);
    let failed = 0;
    for (const [i, r] of list.entries()) {
      progress({ step: `Cập nhật ${titleOf(r)} (${i + 1}/${list.length})`, done: i, total: list.length });
      const pub = cleanPublished(r.published);
      try {
        const got = await fetchNumbers(/** @type {'tiktok'|'youtube'} */ (pub.platform), pub.url, pub.videoId);
        repo.savePublished(ws, r.id, addSnapshot(cleanPublished({ ...pub, videoId: got.videoId, postedAt: pub.postedAt ?? got.postedAt }), got.numbers, new Date(now()).toISOString()));
      } catch (e) {
        rethrowIfCancelled(e);
        failed++;
        repo.savePublished(ws, r.id, cleanPublished({ ...pub, error: `Không lấy được số liệu: ${String(/** @type {any} */ (e)?.message || e)}` }));
      }
    }
    progress({ step: 'Xong', done: list.length, total: list.length });
    return { inline: true, checked: list.length, failed };
  }
```

and add `attachVideo, clearVideo, saveResult, refresh,` at the start of the returned object.

- [ ] **Step 7: Wiring, job and routes**

`src/app.js`: give the idea feature the sources (`makeIdeas({ repo: store.ideas, ws, settings, llm, tiktok, source, …`) and, after the `follow_refresh` handler:

```js
  handlers.batch_refresh = (p, ctx) => features.ideas.refresh(p, ctx.progress);
```

`src/http/routes/jobs.js`: in `JOB_SCHEMAS`, before `follow_refresh`:

```js
  batch_refresh: { batchId: 'int!' },
```

and in `titleOf`, after the `follow_refresh` case: `|| (kind === 'batch_refresh' && 'Cập nhật số liệu lô')`.

`src/http/routes/ideas.js`: before the comment `// AI helpers on the outline: …`:

```js
  // The posted video of a card: its link (numbers read by the app) and the owner's own counts.
  {
    method: 'POST', path: '/api/v1/ideas/:id/video',
    handler: ({ app, params, body }) => {
      const id = idOf(params.id);
      if (typeof body?.url !== 'string') throw httpError('invalid_input', 'Thiếu link video', 'url');
      return app.features.ideas.attachVideo(id, body.url);
    },
  },
  { method: 'DELETE', path: '/api/v1/ideas/:id/video', handler: ({ app, params }) => app.features.ideas.clearVideo(idOf(params.id)) },
  { method: 'POST', path: '/api/v1/ideas/:id/result', handler: ({ app, params, body }) => app.features.ideas.saveResult(idOf(params.id), body ?? {}) },
```

- [ ] **Step 8: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/features/ideas-review.test.js test/http/ideas-api.test.js && npm test`
Expected: all pass. The YouTube case reads the fake source (`views: 1`, published `2026-10-01`).

- [ ] **Step 9: Commit**

```bash
git add -A src test
git commit -m "feat: posted links on idea cards, the owner's counts, the batch_refresh job

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The review, closing a batch, remaking the winner

**Files:**
- Create: `src/core/report/review.js`
- Modify: `src/core/ideas/card.js`, `src/core/ideas/precedent.js`, `src/core/report/ideas.js:6`, `src/store/sqlite/repos/ideas.js`, `src/features/ideas.js`, `src/http/routes/ideas.js`
- Test: `test/features/ideas-review.test.js`, `test/http/ideas-api.test.js`

**Interfaces:**
- Consumes: Task 1 (`GAMES`, `LEVELS`, `rankBatch`, `attributesOf`, `brickTable`, `proposalsOf`, `loserDiffs`, `cleanLearned`, `rowText`); Task 2 (`titleOf`, card `published`, `now`); `profile().game` (`'conversion'|'reach'|null`, from Soulprint).
- Produces:
  - origin kind `redo` (ref: the card id; snapshot `{title, url, platform, videoId, views, leads, batchId}`); `isFromWinner` is true for it; question 1 is "có"
  - repo `saveLearned(ws, id, learned)`, `lastLearned(ws, id)` (newest earlier batch with lines)
  - `board()` gains `learnedFrom: {id, title, learned}|null`
  - `features.ideas.review(batchId)` → `{batch, game, gameLabel, note, rows, table, losers, proposals, levels, winner: {id, title}|null, posted, live}`; `close(batchId, {keep[], review[]})` → review; `reviewMarkdown(batchId)` → string
  - routes `GET /api/v1/ideas/batches/:id/review`, `GET …/review.md`, `POST …/close {learned}` (placed before the `/:id` routes)

- [ ] **Step 1: Write the failing tests**

Append to `test/features/ideas-review.test.js`:

```js
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
```

Append to `test/http/ideas-api.test.js`:

```js
test('the review of a batch, its Markdown and closing it over HTTP', async () => {
  const s = await boot();
  try {
    const c = await (await post(`${s.base}/api/v1/ideas`, { from: 'self' })).json();
    await post(`${s.base}/api/v1/ideas/${c.id}/video`, { url: 'https://www.tiktok.com/@creator/video/7000000000000000002' });
    const r = await get(`${s.base}/api/v1/ideas/batches/${c.batchId}/review`);
    assert.deepEqual([r.posted, r.rows.length, r.levels.length], [1, 1, 3]);
    assert.match(await (await fetch(`${s.base}/api/v1/ideas/batches/${c.batchId}/review.md?inline=1`)).text(), /^# Chấm lô/);
    const closed = await (await post(`${s.base}/api/v1/ideas/batches/${c.batchId}/close`, { learned: { keep: ['Giữ hook'], review: [] } })).json();
    assert.deepEqual([closed.batch.status, closed.batch.learned.keep], ['closed', ['Giữ hook']]);
    assert.equal((await get(`${s.base}/api/v1/ideas`)).learnedFrom.id, c.batchId);
    assert.equal((await get(`${s.base}/api/v1/ideas/batches/999/review`)).error.code, 'not_found');
  } finally {
    s.close();
  }
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/features/ideas-review.test.js`
Expected: FAIL, `f.review is not a function`.

- [ ] **Step 3: The `redo` origin**

`src/core/ideas/card.js`:

```js
/**
 * self: thought up by the owner; brick: from a video of the brick library; pain: a pain of Soulprint; 5w1h: a suggestion
 * of a 5W1H report; redo: a remake of the owner's own posted video that won its batch.
 */
export const ORIGINS = ['self', 'brick', 'pain', '5w1h', 'redo'];
```

and in `isFromWinner` (update its comment to mention "or a remake of the owner's own winner"):

```js
export const isFromWinner = (card, min) => card.origin.kind === 'redo' || card.origin.kind === 'brick' && card.origin.snapshot?.score != null && card.origin.snapshot.score >= min;
```

`src/core/ideas/precedent.js`, first line of `precedentOf`:

```js
  if (card.origin.kind === 'redo') return { ok: 'yes', note: 'Làm lại video đã thắng lô của chính bạn', matches: [] };
```

`src/core/report/ideas.js`, in `SRC`: add `redo: 'làm lại video của bạn'`.

- [ ] **Step 4: The report**

Create `src/core/report/review.js`:

```js
// A reviewed batch as Markdown: the ranking by game, the bricks of the two halves, the bottom half's differences, and
// what was kept when the batch was closed. Counting only; it never claims a cause.
import { rowText } from '../ideas/review.js';

const n = (v) => (v == null ? '–' : String(v));
const cell = (t) => String(t ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ');

/** @param {any} r the review of features.ideas.review() */
export function reviewMarkdown(r) {
  const conv = r.game === 'conversion';
  const L = [`# Chấm lô: ${r.batch.title}`, ''];
  L.push(r.gameLabel ? `Game ${r.gameLabel}: ${conv ? 'xếp theo khách, rồi follower tăng, rồi view' : 'xếp theo view, rồi tỉ lệ chia sẻ'}.` : r.note, '', `${r.posted}/${r.live} thẻ đã gắn link video.`);
  L.push('', '## Xếp hạng', '', '| # | Video | Khách | Follower tăng | View | Chia sẻ | Ghi chú |', '|---|---|---|---|---|---|---|');
  for (const x of r.rows) {
    const m = x.metrics;
    const flags = [x.missing ? (conv ? 'chưa nhập' : 'chưa có view') : '', m.fresh ? 'còn mới' : ''].filter(Boolean).join(', ');
    L.push(`| ${x.rank} | ${cell(x.title)} | ${n(m.leads)} | ${n(m.followers)} | ${n(m.views)} | ${n(m.shares)} | ${flags} |`);
  }
  L.push('', '## Gạch thắng và thua', '');
  if (r.table.note) L.push(`> ${r.table.note}`, '');
  if (r.table.rows.length) for (const x of r.table.rows) L.push(`- ${rowText(x)}${x.label ? ` (**${x.label === 'keep' ? 'nên giữ' : 'xem lại'}**)` : ''}`);
  else L.push('Chưa có gì để so: cần ít nhất 2 video đủ số liệu và đăng từ 3 ngày.');
  if (r.losers.length) {
    L.push('', '## Nửa dưới: gạch nào khác', '');
    for (const l of r.losers) L.push(`- ${l.title}: ${l.diffs.length ? l.diffs.map((d) => `${d.attr} ${d.mine} (nửa trên cùng pillar: ${d.theirs.join(', ')})`).join('; ') : l.note}`);
  }
  const learned = r.batch.learned;
  if (learned && (learned.keep.length || learned.review.length)) {
    L.push('', '## Mang sang lô sau', '');
    for (const t of learned.keep) L.push(`- Nên giữ: ${t}`);
    for (const t of learned.review) L.push(`- Nên xem lại: ${t}`);
  }
  L.push('', '---', '', 'Bảng gạch là đối chiếu trên một lô nhỏ, không phải nguyên nhân chắc chắn.');
  return L.join('\n') + '\n';
}
```

- [ ] **Step 5: The repo**

In `src/store/sqlite/repos/ideas.js`, before `closeBatch`:

```js
    saveLearned: (ws, id, learned) => void db.prepare('UPDATE idea_batches SET learned = ? WHERE workspace_id = ? AND id = ?').run(JSON.stringify(learned), ws, id),
    /** The newest batch before `id` that left something learned. */
    lastLearned: (ws, id) => batch(db.prepare('SELECT * FROM idea_batches WHERE workspace_id = ? AND id < ? AND learned IS NOT NULL ORDER BY id DESC LIMIT 1').get(ws, id)),
```

- [ ] **Step 6: The use case**

In `src/features/ideas.js`, widen the Task 1 import and add the report:

```js
import { GAMES, LEVELS, cleanPublished, addSnapshot, metricsOf, rankBatch, attributesOf, brickTable, proposalsOf, loserDiffs, cleanLearned } from '../core/ideas/review.js';
import { reviewMarkdown } from '../core/report/review.js';
```

The remake source, right before `/** How a card is named in messages and lists. */`:

```js
  /** redo:CARDID — remake a posted video of an earlier batch: same idea, every brick kept; the owner changes one. */
  sources.redo = ([cardId]) => {
    const row = repo.getCard(ws, Number(cardId));
    if (!row || !row.published?.url) throw notFound('Không thấy video đã đăng của thẻ này');
    if (row.batchId === openBatchId()) throw invalid('Thẻ này còn trong lô đang mở. Đóng lô ở màn Chấm lô trước, rồi làm lại video trong lô sau.', 'from');
    const c = cleanCard(row.data);
    const p = cleanPublished(row.published);
    const m = metricsOf(p, now());
    return {
      origin: { kind: 'redo', ref: String(row.id), snapshot: { title: titleOf(row), url: p.url, platform: p.platform, videoId: p.videoId, views: m.views, leads: m.leads, batchId: row.batchId } },
      topic: c.topic, pillar: c.pillar, angle: c.angle, concept: c.concept, funnel: c.funnel, pain: c.pain, belief: c.belief, leadMagnet: c.leadMagnet,
      keep: LEGO.map(([k]) => k),
    };
  };
```

In `board()`, after `ai: llm.ready(),`:

```js
      learnedFrom: learnedBefore(id),
```

Right before the final `return {` (after `refresh`):

```js
  /** What the newest earlier batch left for this one, when it left anything. @param {number} id */
  function learnedBefore(id) {
    const prev = repo.lastLearned(ws, id);
    return prev && (prev.learned.keep?.length || prev.learned.review?.length) ? { id: prev.id, title: prev.title, learned: prev.learned } : null;
  }

  /** A batch ranked by Soulprint's game, the bricks of its halves, the bottom half's differences. @param {number|string} batchId */
  function review(batchId) {
    const batch = repo.getBatch(ws, Number(batchId));
    if (!batch) throw notFound('Không thấy lô này');
    const game = profile()?.game ?? null;
    const live = repo.cards(ws, batch.id).filter((r) => r.status !== 'dropped');
    const posted = live.filter((r) => r.published?.url);
    const ranked = rankBatch(posted.map((r) => ({ id: r.id, title: titleOf(r), published: cleanPublished(r.published) })), game, now());
    const attrs = new Map(posted.map((r) => [r.id, attributesOf(cleanCard(r.data), r.outline ? cleanOutline(r.outline) : null)]));
    // Only videos with the numbers their game ranks by, posted three days ago or more, say anything about bricks.
    const eligible = ranked.rows.filter((r) => !r.missing && !r.metrics.fresh);
    const table = brickTable(eligible, attrs);
    const winner = eligible[0] ?? null;
    return {
      batch, game, gameLabel: game ? GAMES[game] : null, note: ranked.note, rows: ranked.rows, table,
      losers: loserDiffs(table, attrs, new Map(ranked.rows.map((r) => [r.id, r.title]))), proposals: proposalsOf(table), levels: LEVELS,
      winner: winner && { id: winner.id, title: winner.title }, posted: posted.length, live: live.length,
    };
  }
  /**
   * Keeps what the owner takes from a batch. An open batch is closed and a new one opened; a closed one only gets its
   * lines replaced. Numbers stay editable after. @param {number|string} batchId @param {any} learned {keep: string[], review: string[]}
   */
  function close(batchId, learned) {
    const batch = repo.getBatch(ws, Number(batchId));
    if (!batch) throw notFound('Không thấy lô này');
    const l = cleanLearned(learned, { game: profile()?.game ?? null, at: new Date(now()).toISOString() });
    if (batch.status === 'open') {
      repo.closeBatch(ws, batch.id, l);
      repo.addBatch(ws, `Lô ${repo.listBatches(ws).length + 1}`);
    } else repo.saveLearned(ws, batch.id, l);
    return review(batch.id);
  }
```

and add `review, close, reviewMarkdown: (batchId) => reviewMarkdown(review(batchId)),` to the returned object.

- [ ] **Step 7: Routes**

In `src/http/routes/ideas.js`, before the comment `// AI helpers: a suggestion for the card on screen.` (so they come before every `/:id` route):

```js
  // Chấm lô: before the /:id routes.
  { method: 'GET', path: '/api/v1/ideas/batches/:id/review', handler: ({ app, params }) => app.features.ideas.review(idOf(params.id)) },
  {
    method: 'GET', path: '/api/v1/ideas/batches/:id/review.md',
    handler: ({ app, params, query }) => {
      const md = app.features.ideas.reviewMarkdown(idOf(params.id));
      return query.get('inline') ? raw(md, 'text/markdown; charset=utf-8') : raw(md, 'text/markdown; charset=utf-8', attachment('cham-lo.md'));
    },
  },
  { method: 'POST', path: '/api/v1/ideas/batches/:id/close', handler: ({ app, params, body }) => app.features.ideas.close(idOf(params.id), body?.learned) },
```

- [ ] **Step 8: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/features/ideas-review.test.js test/http/ideas-api.test.js test/core/ideas.test.js && npm test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add -A src test
git commit -m "feat: batch review by game, brick halves, closing a batch, remaking its winner

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Web: the Kết quả tab and the Chấm lô screen

**Files:**
- Create: `web/views/board-review.js`
- Modify: `web/views/board.js`, `web/http/client.js`, `web/nav.js`, `web/lib.js`, `web/kinds.js`
- Test: `test/web-board.test.js`, `test/web-nav.test.js`

**Interfaces:**
- Consumes: the routes of Tasks 2 and 3; card views with `published`, `result`; board `learnedFrom`; `runJob`, `progressCard`, `updateProgress`, `fmt`, `setUrl` from `web/lib.js`.
- Produces: `#/board/review?batch=N`; the board's tab `result`; `#/board?from=redo:ID` handled by the board's existing `from` parameter.

- [ ] **Step 1: Write the failing web tests**

In `test/web-nav.test.js`, add `'/board/review'` at the end of `LEGACY`:

```js
  '/research', '/videos', '/comments', '/channels', '/channel', '/compare', '/keywords', '/ideas', '/follows', '/history', '/saved', '/settings', '/bricks', '/board', '/board/review'];
```

Append to `test/web-board.test.js`:

```js
test('phase 7: Chấm lô is a tab of the board entry; the Kết quả tab; the refresh job is named and linked', () => {
  const make = GROUPS.find((g) => g.key === 'make').items[0];
  assert.deepEqual(make.tabs.map((t) => [t[0], t[1]]), [['/board', 'Bảng ý tưởng'], ['/board/review', 'Chấm lô']]);
  const src = view();
  for (const s of ["'Kết quả'", 'data-attach', 'data-detach', 'data-save-result', 'Để trống nghĩa là chưa biết', 'swapIn(', '#/board/review?batch=', 'learnedHtml(b.learnedFrom)', 'Làm lại video đã đăng']) assert.ok(src.includes(s), s);
  const rv = fs.readFileSync('web/views/board-review.js', 'utf8');
  for (const s of ["runJob('batch_refresh'", 'data-confirm-close', 'from=redo:', 'không phải luật', 'chưa nhập', 'còn mới', 'không phải nguyên nhân']) assert.ok(rv.includes(s), s);
  assert.ok(!/\bfetch\(/.test(rv));
  assert.match(rv, /import \{[^}]*\besc\b[^}]*\} from '\.\.\/lib\.js'/);
  const client = fs.readFileSync('web/http/client.js', 'utf8');
  for (const name of ['attachVideo:', 'clearVideo:', 'saveResult:', 'review:', 'close:', 'reviewUrl:']) assert.ok(client.slice(client.indexOf('export const ideas')).includes(name), name);
  assert.match(fs.readFileSync('web/lib.js', 'utf8'), /batch_refresh: 'Cập nhật số liệu lô'/);
  assert.match(fs.readFileSync('web/kinds.js', 'utf8'), /j\.kind === 'batch_refresh'\) return `#\/board\/review\?batch=/);
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/web-board.test.js test/web-nav.test.js`
Expected: FAIL on the tabs of the board entry.

- [ ] **Step 3: Client, job label and link, nav**

`web/http/client.js`, in `ideas`, after `outlineUrl`:

```js
  /** The posted video of a card; the app reads its numbers. @param {number} id @param {string} url */
  attachVideo: (id, url) => api(`/ideas/${id}/video`, { method: 'POST', body: { url } }),
  clearVideo: (id) => api(`/ideas/${id}/video`, { method: 'DELETE' }),
  /** The owner's own counts; '' means not known. @param {number} id @param {{leads?: string, followers?: string, views?: string}} counts */
  saveResult: (id, counts) => api(`/ideas/${id}/result`, { method: 'POST', body: counts }),
  /** @param {number} batchId */
  review: (batchId) => api(`/ideas/batches/${batchId}/review`),
  /** @param {number} batchId @param {{keep: string[], review: string[]}} learned */
  close: (batchId, learned) => api(`/ideas/batches/${batchId}/close`, { method: 'POST', body: { learned } }),
  reviewUrl: (batchId) => `${BASE}/ideas/batches/${batchId}/review.md`,
```

`web/lib.js`: add `batch_refresh: 'Cập nhật số liệu lô'` to `LABELS`.

`web/kinds.js`, in `jobHref` after the `follow_refresh` line:

```js
  if (j.kind === 'batch_refresh') return `#/board/review?batch=${j.params?.batchId ?? ''}`; // numbers live on the cards
```

`web/nav.js`, the `make` group: Chấm lô is the second tab of the board's entry.

```js
    items: [{ icon: 'bulb', label: 'Bảng ý tưởng', tabs: [['/board', 'Bảng ý tưởng', () => import('./views/board.js')], ['/board/review', 'Chấm lô', () => import('./views/board-review.js')]] }],
```

- [ ] **Step 4: The Kết quả tab on the board**

In `web/views/board.js`:

- import `fmt` from `../lib.js`;
- `TABS` gains `['result', 'Kết quả', 'trend']` at the end;
- `ORIGIN` gains `redo: 'Làm lại video đã đăng'`;
- the header row gains, after "Mở lô mới": `<a class="btn" href="#/board/review?batch=${b.batch.id}">${icon('bars')} Chấm lô</a>`;
- after the nudge: `${b.learnedFrom ? learnedHtml(b.learnedFrom) : ''}`;
- the panel body: `… : state.tab === 'source' ? sourceTab() : state.tab === 'outline' ? outlineTab() : resultTab()}`.

Before `function checksTab() {`:

```js
  /** The posted video: its link (numbers read by the app) and the owner's own counts. Saves on its own buttons. */
  function resultTab() {
    const x = state.open;
    const p = x.published;
    const m = x.result;
    const numIn = (k, ph, v) => `<input class="input" type="number" min="0" step="1" inputmode="numeric" data-result="${k}" value="${v ?? ''}" placeholder="${esc(ph)}" style="width:150px">`;
    const linkRow = `<div class="fw-field">${cap('LINK VIDEO ĐÃ ĐĂNG')}<div class="row"><input class="input" data-video-url value="${esc(p?.url ?? '')}" placeholder="Link TikTok hoặc YouTube" style="flex:1;min-width:220px">
      <button type="button" class="btn sm primary" data-attach ${state.busy ? 'disabled' : ''}>${state.busy === 'attach' ? 'Đang lấy số…' : p ? 'Gắn lại' : 'Gắn link'}</button>${p ? '<button type="button" class="btn sm" data-detach>Gỡ link</button>' : ''}</div></div>`;
    if (!p) return `<p class="muted small">Đăng xong thì dán link vào đây. App tự lấy view, tim, comment, chia sẻ; số khách và follower tăng bạn tự nhập.</p>${linkRow}`;
    const stats = [['VIEW', m.views], ['TIM', m.likes], ['COMMENT', m.comments], ['CHIA SẺ', m.shares], ['LƯU', m.saves]].filter(([, v]) => v != null);
    return `${linkRow}
      ${p.error ? `<div class="callout">${esc(p.error)}</div>` : ''}
      <div class="muted small">${p.platform === 'youtube' ? 'YouTube' : 'TikTok'}${m.ageDays != null ? ` · đăng ${m.ageDays} ngày trước` : ''}${m.fresh ? ' · còn mới, chưa tính vào bảng gạch' : ''}${m.checkedAt ? ` · số lấy ${ago(Date.parse(m.checkedAt))}` : ''}</div>
      ${stats.length ? `<div class="row bd-stats">${stats.map(([l, v]) => `<div class="fw-field">${cap(l)}<div class="fw-value"><b>${fmt(v)}</b></div></div>`).join('')}</div>` : ''}
      <div class="fw-field">${cap('SỐ BẠN TỰ NHẬP')}<p class="muted small">Để trống nghĩa là chưa biết, khác với 0.</p>
        <div class="row">${numIn('leads', 'Khách hoặc email', p.leads)}${numIn('followers', 'Follower tăng', p.followers)}${!p.snapshots.length || p.views != null ? numIn('views', 'View (nhập tay)', p.views) : ''}
        <button type="button" class="btn sm" data-save-result>${icon('check')} Lưu số</button></div></div>
      ${p.snapshots.length > 1 ? `<div class="fw-field">${cap('CÁC MỐC')}${p.snapshots.slice().reverse().map((s) => `<div class="small">${esc(s.at.slice(0, 10))}: ${fmt(s.views)} view · ${fmt(s.likes)} tim · ${fmt(s.shares)} chia sẻ</div>`).join('')}</div>` : ''}
      <a class="btn sm" href="#/board/review?batch=${x.batchId}">${icon('bars')} Chấm lô này</a>`;
  }
  /** A card the Kết quả tab changed on the server: swapped in, the unsaved edits of the other tabs kept. @param {any} x */
  function swapIn(x) {
    b.cards = b.cards.map((y) => (y.id === x.id ? x : y));
    state.open = x;
    state.draft.status = x.status;
    render();
  }
```

At the top of `sourceTab()`, before the `self` case:

```js
    if (o.kind === 'redo') return `<p class="muted small">Làm lại video đã đăng của bạn: giữ mọi gạch, đổi một gạch để thử.</p>
      <div class="fw-field">${cap('VIDEO GỐC')}<div class="fw-value">${esc(s?.title)}</div><div class="muted small">${s?.views != null ? `${fmt(s.views)} view` : ''}${s?.leads != null ? ` · ${fmt(s.leads)} khách` : ''}</div></div>
      ${s?.url ? `<a class="btn sm" href="${esc(s.url)}" target="_blank" rel="noopener">Mở video</a>` : ''}<a class="btn sm" href="#/board/review?batch=${esc(s?.batchId)}">Mở lô cũ</a>`;
```

Right before `function render() {`:

```js
  /** What the previous batch left, shown at the top of this one. @param {{title: string, learned: {keep: string[], review: string[]}}} l */
  const learnedHtml = (l) => `<div class="callout info"><div class="fw-cap">TỪ ${esc(l.title.toUpperCase())}</div>
    ${l.learned.keep.length ? `<div class="small"><b>Nên giữ:</b> ${esc(l.learned.keep.join('; '))}</div>` : ''}${l.learned.review.length ? `<div class="small"><b>Nên xem lại:</b> ${esc(l.learned.review.join('; '))}</div>` : ''}</div>`;
```

In the click handler, before `else if (d.length) {`:

```js
      else if (d.attach !== undefined) {
        const url = /** @type {HTMLInputElement} */ (root.querySelector('[data-video-url]')).value;
        state.busy = 'attach';
        render();
        let x;
        try { x = await ideas.attachVideo(state.open.id, url); } finally { state.busy = ''; render(); }
        toast(x.published.error ? 'Đã gắn link, nhưng chưa lấy được số' : 'Đã gắn video và lấy số');
        swapIn(x);
      } else if (d.detach !== undefined) {
        if (!window.confirm('Gỡ link video khỏi thẻ? Các số đã lấy và đã nhập sẽ mất.')) return;
        swapIn(await ideas.clearVideo(state.open.id));
      } else if (d.saveResult !== undefined) {
        const counts = Object.fromEntries([...root.querySelectorAll('[data-result]')].map((el) => [/** @type {HTMLInputElement} */ (el).dataset.result, /** @type {HTMLInputElement} */ (el).value.trim()]));
        swapIn(await ideas.saveResult(state.open.id, counts));
        toast('Đã lưu số');
      }
```

`swapIn` keeps the draft's other edits and copies the server's status into the draft, so a later Lưu never sends back the old status (Review Focus #5).

- [ ] **Step 5: The Chấm lô screen**

Create `web/views/board-review.js`:

```js
// Chấm lô (spec 2026-11-16-batch-review-design.md): the posted videos of a batch ranked by Soulprint's game, the
// bricks that go with its top and bottom halves, and closing it with what to keep. Counting only; the numbers come
// from each card's Kết quả tab and the batch_refresh job.
import { ideas } from '../http/client.js';
import { esc, icon, fmt, toast, errorCallout, emptyState, setUrl, runJob, progressCard, updateProgress } from '../lib.js';

const PATH = '/board/review';
const LABEL = { keep: ['nên giữ', ''], review: ['xem lại', 'soft'] };

export async function mount(root, params) {
  /** @type {any} */ let r;
  /** @type {any[]} */ let batches = [];
  /** The close form: lines the owner ticks and edits before they are kept. @type {{on: boolean, kind: 'keep'|'review', text: string}[]|null} */
  let closing = null;
  let busy = false;

  async function load(batchId) {
    const b = await ideas.board(batchId);
    batches = b.batches;
    r = await ideas.review(b.batch.id);
    setUrl(PATH, { batch: r.batch.id });
  }
  try {
    await load(params.batch ? Number(params.batch) : undefined);
  } catch (e) {
    root.innerHTML = errorCallout(e);
    return;
  }

  const cap = (t) => `<div class="fw-cap">${t}</div>`;
  const pct = (v) => (v == null ? '–' : `${(v * 100).toFixed(1)}%`);
  const chip = (t, cls = '') => `<span class="fw-chip ${cls}">${esc(t)}</span>`;

  function rankHtml() {
    if (!r.rows.length) return emptyState('Chưa có video nào được gắn link', 'Mở một thẻ ở Bảng ý tưởng, tab Kết quả, rồi dán link video đã đăng.');
    const conv = r.game === 'conversion';
    const reach = r.game === 'reach';
    // Kallaway: for a business, views of the wrong people are empty calories; the column stays, dimmed, never ranked by.
    const dim = conv ? 'muted' : '';
    return `<div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Video</th>${conv ? '<th>Khách</th><th>Follower tăng</th>' : ''}<th class="${dim}">View</th>${reach ? '<th>Tỉ lệ chia sẻ</th>' : ''}<th>Tim</th><th>Comment</th><th></th></tr></thead><tbody>
      ${r.rows.map((x) => `<tr><td>${x.rank}</td><td><a href="#/board?batch=${r.batch.id}&card=${x.id}">${esc(x.title)}</a></td>
        ${conv ? `<td>${fmt(x.metrics.leads)}</td><td>${fmt(x.metrics.followers)}</td>` : ''}<td class="${dim}">${fmt(x.metrics.views)}</td>${reach ? `<td>${pct(x.metrics.shareRate)}</td>` : ''}
        <td>${fmt(x.metrics.likes)}</td><td>${fmt(x.metrics.comments)}</td>
        <td>${x.missing ? chip(conv ? 'chưa nhập' : 'chưa có view', 'soft') : ''} ${x.metrics.fresh ? chip('còn mới', 'soft') : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function tableHtml() {
    const t = r.table;
    const rows = t.rows.length
      ? t.rows.map((x) => `<div class="bd-issue">${x.label ? `${chip(LABEL[x.label][0], LABEL[x.label][1])} ` : ''}<b>${esc(x.attr)} ${esc(x.value)}</b>: ${x.top} video nửa trên, ${x.bottom} video nửa dưới</div>`).join('')
      : '<p class="muted small">Chưa có gì để so: cần ít nhất 2 video đủ số liệu và đăng từ 3 ngày.</p>';
    return `${t.note ? `<div class="callout">${esc(t.note)}</div>` : ''}<div class="bd-lint">${rows}</div>
      <p class="muted small">Nên giữ: có ở ít nhất 3 video nửa trên và nhiều nhất 1 video nửa dưới. Xem lại: ngược lại. Đây là đối chiếu trên một lô nhỏ, không phải nguyên nhân.</p>`;
  }

  function losersHtml() {
    if (!r.losers.length) return '';
    return `<div class="fw-field">${cap('NỬA DƯỚI: GẠCH NÀO KHÁC')}${r.losers.map((l) => `<div class="bd-issue"><b>${esc(l.title)}</b>
        ${l.diffs.length ? l.diffs.map((d) => `<div class="small">${esc(d.attr)}: <b>${esc(d.mine)}</b>, nửa trên cùng pillar: ${esc(d.theirs.join(', '))}</div>`).join('') : `<div class="muted small">${esc(l.note)}</div>`}</div>`).join('')}
      <p class="muted small">Lần làm lại, sửa đúng gạch khác đó, đừng bỏ cả format.</p></div>`;
  }

  function levelsHtml() {
    return `<details class="fw-field"><summary class="small">Mức kẹt view của Kallaway</summary>${r.levels.map(([a, b]) => `<div class="small"><b>${esc(a)}:</b> ${esc(b)}</div>`).join('')}
      <p class="muted small">Chỉ từ một bài đăng, không phải luật. App không tự xếp video nào vào mức nào.</p></details>`;
  }

  function learnedHtml() {
    const l = r.batch.learned;
    if (!l || !(l.keep.length || l.review.length)) return '';
    return `<div class="callout info"><div class="fw-cap">ĐÃ MANG SANG LÔ SAU</div>${l.keep.length ? `<div class="small"><b>Nên giữ:</b> ${esc(l.keep.join('; '))}</div>` : ''}${l.review.length ? `<div class="small"><b>Nên xem lại:</b> ${esc(l.review.join('; '))}</div>` : ''}</div>`;
  }

  function closeHtml() {
    if (!closing) return '';
    const open = r.batch.status === 'open';
    return `<div class="card card-pad"><div class="fw-cap">MANG SANG LÔ SAU</div><p class="muted small">Tick dòng muốn giữ, sửa chữ nếu cần.</p>
      ${closing.map((c, i) => `<div class="row" style="margin-top:6px"><input type="checkbox" data-take="${i}" ${c.on ? 'checked' : ''} aria-label="Mang dòng này sang">
        <select class="select input" data-kind="${i}" style="width:auto"><option value="keep" ${c.kind === 'keep' ? 'selected' : ''}>Nên giữ</option><option value="review" ${c.kind === 'review' ? 'selected' : ''}>Nên xem lại</option></select>
        <input class="input" data-line="${i}" value="${esc(c.text)}" style="flex:1;min-width:220px"></div>`).join('')}
      <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-add-line>${icon('plus')} Thêm dòng</button><span class="spacer"></span>
        <button type="button" class="btn sm" data-cancel-close>Huỷ</button><button type="button" class="btn sm primary" data-confirm-close>${icon('check')} ${open ? 'Đóng lô' : 'Lưu'}</button></div>
      ${open ? '<p class="muted small">Đóng lô sẽ mở lô mới. Số liệu vẫn cập nhật và sửa được sau đó.</p>' : ''}</div>`;
  }

  function render() {
    const open = r.batch.status === 'open';
    const how = r.game === 'conversion' ? 'xếp theo khách, rồi follower tăng, rồi view' : 'xếp theo view, rồi tỉ lệ chia sẻ';
    root.innerHTML = `
      <div class="page-head"><div><h1>${icon('bars')} Chấm lô</h1>
        <p>Xem theo lô 10, không phán từng video. Xếp theo game trong Soulprint, rồi xem gạch nào đi với video thắng, gạch nào đi với video thua.</p></div>
        <div class="row"><select class="select input" data-batch style="width:auto">${batches.map((x) => `<option value="${x.id}" ${x.id === r.batch.id ? 'selected' : ''}>${esc(x.title)}${x.status === 'open' ? ' (đang mở)' : ''}</option>`).join('')}</select>
          <button type="button" class="btn" data-refresh ${r.posted && !busy ? '' : 'disabled'}>${icon('refresh')} Cập nhật số liệu cả lô</button>
          <a class="btn" href="${ideas.reviewUrl(r.batch.id)}">${icon('download')} Markdown</a>
          <button type="button" class="btn primary" data-close ${closing ? 'disabled' : ''}>${open ? 'Đóng lô' : 'Sửa điều mang sang'}</button></div></div>
      <div data-prog></div><div data-err></div>
      <div class="card card-pad bd-head"><b>${esc(r.batch.title)}</b><span>${r.posted}/${r.live} thẻ đã gắn link</span>${r.gameLabel ? `<span class="muted">Game ${esc(r.gameLabel)}: ${how}</span>` : ''}</div>
      ${r.note ? `<div class="callout">${esc(r.note)} <a href="#/soulprint">Mở Soulprint</a></div>` : ''}
      ${closeHtml()}${learnedHtml()}
      <div class="card fw-panel"><div class="fw-panel-head">${icon('bars')}<b>Xếp hạng</b></div><div class="fw-body">${rankHtml()}
        ${r.winner && !open ? `<div class="row" style="margin-top:8px"><a class="btn sm primary" href="#/board?from=redo:${r.winner.id}">${icon('refresh')} Làm lại video này: ${esc(r.winner.title)}</a></div>` : ''}
        ${r.winner && open ? '<p class="muted small">Đóng lô xong sẽ có nút làm lại video thắng nhất, vào lô sau.</p>' : ''}</div></div>
      <div class="card fw-panel"><div class="fw-panel-head">${icon('layers')}<b>Gạch thắng và thua</b></div><div class="fw-body">${tableHtml()}${losersHtml()}${levelsHtml()}</div></div>`;
  }

  const fail = (e) => {
    const box = root.querySelector('[data-err]');
    if (box) box.innerHTML = errorCallout(e);
  };

  root.addEventListener('change', async (e) => {
    const el = /** @type {HTMLSelectElement} */ (e.target);
    if (!el.matches('[data-batch]')) return;
    try {
      closing = null;
      await load(Number(el.value));
      render();
    } catch (err) { fail(err); }
  });
  root.addEventListener('input', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const d = el.dataset;
    if (!closing) return;
    if (d.line !== undefined) closing[Number(d.line)].text = el.value;
    else if (d.take !== undefined) closing[Number(d.take)].on = el.checked;
    else if (d.kind !== undefined) closing[Number(d.kind)].kind = /** @type {'keep'|'review'} */ (el.value);
  });
  root.addEventListener('click', async (e) => {
    const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('button'));
    if (!el) return;
    const d = el.dataset;
    try {
      if (d.refresh !== undefined) {
        busy = true;
        render();
        const box = /** @type {HTMLElement} */ (root.querySelector('[data-prog]'));
        box.innerHTML = progressCard(`Đang cập nhật ${r.posted} video`);
        try {
          const res = await runJob('batch_refresh', { batchId: r.batch.id }, (p) => updateProgress(box, p));
          toast(`Đã cập nhật ${res.checked} video${res.failed ? `, ${res.failed} video lỗi` : ''}`);
          await load(r.batch.id);
        } finally { busy = false; render(); }
      } else if (d.close !== undefined) {
        const l = r.batch.learned;
        closing = l && (l.keep.length || l.review.length)
          ? [...l.keep.map((text) => ({ on: true, kind: /** @type {const} */ ('keep'), text })), ...l.review.map((text) => ({ on: true, kind: /** @type {const} */ ('review'), text }))]
          : r.proposals.map((p) => ({ on: true, kind: p.kind, text: p.text }));
        if (!closing.length) closing.push({ on: true, kind: 'keep', text: '' });
        render();
      } else if (d.addLine !== undefined && closing) {
        closing.push({ on: true, kind: 'keep', text: '' });
        render();
      } else if (d.cancelClose !== undefined) {
        closing = null;
        render();
      } else if (d.confirmClose !== undefined && closing) {
        const take = closing.filter((c) => c.on && c.text.trim());
        const wasOpen = r.batch.status === 'open';
        await ideas.close(r.batch.id, { keep: take.filter((c) => c.kind === 'keep').map((c) => c.text), review: take.filter((c) => c.kind === 'review').map((c) => c.text) });
        closing = null;
        await load(r.batch.id);
        toast(wasOpen ? 'Đã đóng lô. Lô mới đã mở.' : 'Đã lưu điều mang sang');
        render();
      }
    } catch (err) { fail(err); }
  });

  render();
}
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: all pass (436 on top of main with the outline review fixes).

- [ ] **Step 7: Browser check**

Start `preview-5w1h`. On `#/board`, open a card, tab Kết quả:
1. Paste `https://www.youtube.com/watch?v=jNQXAC9IVRw`, Gắn link: numbers appear (VIEW, TIM, COMMENT), card shows "Đã đăng".
2. Type 4 in "Khách hoặc email", Lưu số: kept. Type −2 in "Follower tăng": the error names the field.
3. Edit the topic on tab Ý tưởng without saving, attach again on Kết quả, then Lưu: the topic is saved and the status stays "Đã đăng".
4. Chấm lô: the row shows "chưa nhập" until both counts are in; "Cập nhật số liệu cả lô" runs and the progress card goes away.
5. Đóng lô: the proposals (or one empty line) appear; tick, edit, Đóng lô. A new batch opens; `#/board` shows "TỪ <lô cũ>" with the lines.
6. No console errors other than the 400 of step 2.

- [ ] **Step 8: Commit**

```bash
git add web test
git commit -m "feat(web): Kết quả tab on idea cards and the Chấm lô screen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
