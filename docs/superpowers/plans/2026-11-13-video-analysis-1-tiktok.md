# Phân tích video, đợt 1 (TikTok) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Màn `#/tiktok/video`: dán tới 10 link TikTok, nhận thông số, script (phụ đề) và comment của từng video, một bảng so sánh, và file Markdown/CSV.

**Architecture:** Tính toán thuần về script nằm ở `core/video/` (dùng lại cho YouTube ở đợt 2). Nguồn TikTok thêm `getVideo` (một lần tải trang video cho cả thông số lẫn phụ đề, không trình duyệt, không đăng nhập). Một khung chạy lô dùng chung (`features/shared-video-analysis.js`) ghi dần vào **một** record cho cả lô; use case TikTok chỉ cấp ba hàm của nền tảng. Giao diện là một component (`web/components/video-analysis.js`) cộng một view mỏng.

**Tech Stack:** Node ≥ 22.13 (ESM, `node:test`, `node:sqlite`), JS + JSDoc kiểm bằng `tsc --checkJs`, frontend JS thuần không build. Không thêm dependency.

**Spec:** [docs/superpowers/specs/2026-11-13-video-analysis-design.md](../specs/2026-11-13-video-analysis-design.md). Plan này làm **đợt 1 của §11**. Đợt 2 (YouTube) và đợt 3 (dọn menu, đường vào) có plan riêng, viết sau khi đợt 1 gộp xong.

## Global Constraints

- Tối đa **10** link mỗi lần chạy; hơn thì `invalid_input`, field `videos`.
- Tham số job: `{ videos: 'string!', script: 'bool?', comments: [0, 100, 300], replies: 'bool?' }`. Mặc định: script bật, 100 comment, có trả lời.
- Job kind và record kind: `tiktok_video_analysis`, `schema_version` 1. Một record cho cả lô.
- Hook = chữ của các đoạn có `start < 5` giây; không có đoạn nào thì lấy đoạn đầu; cắt còn 200 ký tự.
- `wpm` = số từ ÷ phút nói; `null` khi khoảng nói dưới 10 giây.
- Không lưu tên hay username của người comment ở bất kỳ đâu. Username của **chủ video** được lưu.
- Không lấy phụ đề máy dịch (`Source: 'MT'`).
- Không cần đăng nhập TikTok, không dùng Playwright trong đợt này.
- Luật lớp ở `docs/ARCHITECTURE.md` §4: `core/` thuần; `features/tiktok/` không import use case YouTube; `web/` chỉ gọi server qua `web/http/client.js`; component không tự gọi API.
- Chuỗi giao diện bằng tiếng Việt. Nhãn và công thức chỉ số đăng ký trong `src/core/metrics/definitions.js`.
- `npm test` (typecheck + test, không mạng) phải xanh sau mỗi task.
- Kiểm tra tay chỉ trên bản sao dữ liệu: `YTR_DATA_DIR` riêng, cổng 5191, không khởi động server trên `data/` thật (xem Task 8).

## Review Focus

Năm tình huống spec không nói rõ nhưng người dùng sẽ gặp. Mỗi dòng có test ở task ghi trong ngoặc.

1. Dán cùng một link hai lần, hoặc link kèm `?is_from_webapp=1&…`: chỉ phân tích một lần, không tính hai suất trong giới hạn 10 (Task 5).
2. Video chỉ có phụ đề máy dịch: coi như không có phụ đề, không lấy bản dịch (Task 3).
3. File phụ đề rỗng hoặc hỏng định dạng: video vẫn có thông số và comment, script ghi "không có phụ đề", không văng lỗi (Task 1, Task 4).
4. Lấy comment thất bại (bị tắt, bị chặn) trong khi thông số lấy được: dòng video vẫn đủ số, tab Comment ghi lý do, lô chạy tiếp (Task 5).
5. Rời màn giữa lúc chạy rồi quay lại: tiến trình nối lại và các video đã xong hiện trong bảng (Task 7, kiểm tra tay ở Task 8).

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/core/video/transcript.js` (mới) | `parseClock`, `parseVtt`, `scriptStats`, `scriptText`, `clock` |
| `src/core/video/metrics.js` (mới) | `videoRow`: view, tuổi, view/ngày, tỉ lệ tương tác |
| `src/core/metrics/definitions.js` (sửa) | thêm `wordsPerMinute` |
| `src/sources/tiktok/parse.js` (sửa) | `parseVideoPage`, `pickSubtitle` |
| `src/sources/tiktok/http.js` (sửa) | `getText` |
| `src/sources/tiktok/video.js` (mới) | `makeVideo(http, resolveVideo)` → `getVideo` |
| `src/sources/tiktok/index.js`, `src/ports/tiktok-source.js`, `src/sources/fake/tiktok.js` (sửa) | nối `getVideo` vào port, adapter thật, adapter giả |
| `src/sources/tiktok/fixtures/video-page.html`, `video-page-gone.html`, `subtitle.vtt` (mới) | dữ liệu mẫu |
| `src/features/shared-video-analysis.js` (mới) | khung chạy lô dùng chung hai nền tảng |
| `src/features/tiktok/video-analysis.js` (mới) | use case TikTok |
| `src/app.js`, `src/http/routes/jobs.js`, `src/store/upgrades/index.js`, `src/store/upgrades/video_analysis.js` (sửa/mới) | đăng ký job, schema, phiên bản record |
| `src/core/report/video-analysis.js` (mới) | Markdown và cột CSV |
| `src/http/routes/records.js` (sửa) | xuất `.md` (cả lô, `?video=`) và `.csv` |
| `web/components/video-analysis.js` (mới) | bảng so sánh + ba tab chi tiết |
| `web/views/tiktok/video.js` (mới) | màn nhập, chạy, nối lại, lịch sử |
| `web/app.js`, `web/kinds.js`, `web/lib.js`, `web/styles.css` (sửa) | menu, nhãn, CSS |
| `scripts/probe.js`, `docs/ARCHITECTURE.md`, `README.md` (sửa) | phép thử sống, tài liệu |

---

### Task 1: Đọc phụ đề và đo script (`core/video/transcript.js`)

**Files:**
- Create: `src/core/video/transcript.js`
- Test: `test/core/video-transcript.test.js`

**Interfaces:**
- Consumes: không.
- Produces:
  - `parseClock(s: string): number|null` — `"1:02:03"`, `"2:03"`, `"00:00:00.040"` → giây.
  - `parseVtt(text: string): {start: number, end: number|null, text: string}[]`
  - `scriptStats(transcript: {segments: Segment[]}|null, durationSec?: number|null): {words: number, hook: string, wpm: number|null, segments: number}|null`
  - `clock(sec: number): string` — `"0:07"`, `"1:02:03"`.
  - `scriptText(transcript, {timestamps?: boolean}): string`
  - `HOOK_SECONDS = 5`

- [ ] **Step 1: Viết test (đang fail)**

```js
// test/core/video-transcript.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClock, parseVtt, scriptStats, scriptText, clock } from '../../src/core/video/transcript.js';

const VTT = `WEBVTT

00:00:00.040 --> 00:00:00.760
hồn với người Mỹ

00:00:00.761 --> 00:00:02.641
không còn được cấp
<c>thẻ xanh</c> dễ nữa

00:00:06.000 --> 00:00:20.000
đây là phần thân bài
`;

test('parseClock: with and without hours, with milliseconds, junk → null', () => {
  assert.equal(parseClock('0:07'), 7);
  assert.equal(parseClock('2:03'), 123);
  assert.equal(parseClock('1:02:03'), 3723);
  assert.equal(parseClock('00:00:00.040'), 0.04);
  assert.equal(parseClock('abc'), null);
  assert.equal(parseClock(''), null);
});

test('parseVtt: cues in order, multi-line cues joined, tags removed', () => {
  assert.deepEqual(parseVtt(VTT), [
    { start: 0.04, end: 0.76, text: 'hồn với người Mỹ' },
    { start: 0.761, end: 2.641, text: 'không còn được cấp thẻ xanh dễ nữa' },
    { start: 6, end: 20, text: 'đây là phần thân bài' },
  ]);
});

test('parseVtt: empty, header only or malformed text gives no segments instead of throwing', () => {
  assert.deepEqual(parseVtt(''), []);
  assert.deepEqual(parseVtt('WEBVTT\n\n'), []);
  assert.deepEqual(parseVtt('<html>blocked</html>'), []);
  assert.deepEqual(parseVtt('WEBVTT\n\nxx --> yy\nchữ\n'), [], 'a cue whose start cannot be read is dropped');
  assert.deepEqual(parseVtt(/** @type {any} */ (null)), []);
});

test('scriptStats: hook is what is said before second 5; words and words per minute', () => {
  const s = scriptStats({ segments: parseVtt(VTT) });
  assert.equal(s.hook, 'hồn với người Mỹ không còn được cấp thẻ xanh dễ nữa');
  assert.equal(s.words, 4 + 8 + 5);
  assert.equal(s.segments, 3);
  assert.equal(s.wpm, Math.round(17 / ((20 - 0.04) / 60)));
});

test('scriptStats: nothing before second 5 → the first segment is the hook; capped at 200 characters', () => {
  assert.equal(scriptStats({ segments: [{ start: 8, end: 30, text: 'mở đầu muộn' }, { start: 31, end: 40, text: 'tiếp' }] }).hook, 'mở đầu muộn');
  assert.equal(scriptStats({ segments: [{ start: 0, end: 30, text: 'a'.repeat(500) }] }).hook.length, 200);
});

test('scriptStats: wpm is null under 10 seconds of speech; missing end falls back to the video length', () => {
  assert.equal(scriptStats({ segments: [{ start: 0, end: 4, text: 'ngắn quá' }] }).wpm, null);
  const noEnd = [{ start: 0, end: null, text: 'một hai ba' }, { start: 30, end: null, text: 'bốn năm sáu' }];
  assert.equal(scriptStats({ segments: noEnd }, 60).wpm, 6);
  assert.equal(scriptStats({ segments: noEnd }).wpm, null, 'no end and no duration: cannot tell');
  assert.equal(scriptStats({ segments: noEnd }, 10).wpm, null, 'a duration before the last segment is not believed');
});

test('scriptStats: no transcript or no segments → null', () => {
  assert.equal(scriptStats(null), null);
  assert.equal(scriptStats({ segments: [] }), null);
});

test('clock and scriptText', () => {
  assert.equal(clock(7.9), '0:07');
  assert.equal(clock(123), '2:03');
  assert.equal(clock(3723), '1:02:03');
  const t = { segments: [{ start: 0, end: 2, text: 'xin chào' }, { start: 65, end: 70, text: 'tạm biệt' }] };
  assert.equal(scriptText(t), '[0:00] xin chào\n[1:05] tạm biệt');
  assert.equal(scriptText(t, { timestamps: false }), 'xin chào\ntạm biệt');
  assert.equal(scriptText(null), '');
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `node --disable-warning=ExperimentalWarning --test test/core/video-transcript.test.js`
Expected: FAIL, `Cannot find module '.../src/core/video/transcript.js'`

- [ ] **Step 3: Viết code**

```js
// src/core/video/transcript.js
// A video's spoken words: reading subtitle files and measuring the script. Pure; shared by TikTok and YouTube.

/** @typedef {{start: number, end: number|null, text: string}} Segment */
/** @typedef {{language: string|null, kind: 'auto'|'manual', segments: Segment[]}} Transcript */

export const HOOK_SECONDS = 5;
const HOOK_CHARS = 200;
const MIN_SPOKEN_SECONDS = 10;
const CLOCK = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/;

/** "1:02:03", "2:03", "00:00:00.040" → seconds; anything else → null. @param {string} s */
export function parseClock(s) {
  const m = String(s ?? '').trim().match(CLOCK);
  if (!m) return null;
  const ms = m[4] ? Number(m[4].padEnd(3, '0')) / 1000 : 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms;
}

/** WebVTT → segments. Cues without a readable start or without text are dropped; never throws. @param {string} text @returns {Segment[]} */
export function parseVtt(text) {
  /** @type {Segment[]} */
  const out = [];
  for (const block of String(text ?? '').replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->').map((x) => x.trim().split(/\s+/)[0]);
    const start = parseClock(a);
    const said = lines.slice(at + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (start == null || !said) continue;
    out.push({ start, end: parseClock(b), text: said });
  }
  return out;
}

/**
 * What the compare table shows about a script.
 * @param {{segments: Segment[]}|null|undefined} transcript @param {number|null} [durationSec] the video's length, used when segments have no end
 * @returns {{words: number, hook: string, wpm: number|null, segments: number}|null}
 */
export function scriptStats(transcript, durationSec = null) {
  const segs = transcript?.segments ?? [];
  if (!segs.length) return null;
  const words = segs.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  const early = segs.filter((s) => s.start < HOOK_SECONDS);
  const hook = (early.length ? early : segs.slice(0, 1)).map((s) => s.text).join(' ').slice(0, HOOK_CHARS);
  const last = segs[segs.length - 1];
  const endAt = last.end ?? (durationSec != null && durationSec > last.start ? durationSec : null);
  const spoken = endAt == null ? null : endAt - segs[0].start;
  return { words, hook, wpm: spoken != null && spoken >= MIN_SPOKEN_SECONDS ? Math.round(words / (spoken / 60)) : null, segments: segs.length };
}

/** 7.9 → "0:07", 3723 → "1:02:03". @param {number} sec */
export function clock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** The script as text to copy or export, one segment per line. @param {{segments: Segment[]}|null|undefined} transcript @param {{timestamps?: boolean}} [o] */
export function scriptText(transcript, { timestamps = true } = {}) {
  return (transcript?.segments ?? []).map((s) => (timestamps ? `[${clock(s.start)}] ${s.text}` : s.text)).join('\n');
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `node --disable-warning=ExperimentalWarning --test test/core/video-transcript.test.js`
Expected: `pass 8`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/core/video/transcript.js test/core/video-transcript.test.js
git commit -m "feat(core): read subtitle files and measure a script (hook, words, words per minute)"
```

---

### Task 2: Dòng số liệu của một video (`core/video/metrics.js`)

**Files:**
- Create: `src/core/video/metrics.js`
- Modify: `src/core/metrics/definitions.js` (thêm một mục vào `METRICS`, ngay sau dòng `engagementRate`)
- Test: `test/core/video-metrics.test.js`

**Interfaces:**
- Consumes: không.
- Produces: `videoRow(video, platform: 'tiktok'|'youtube', now: number): {views: number|null, ageDays: number|null, viewsPerDay: number|null, engagementRate: number|null}`; chỉ số `wordsPerMinute` trong registry.

- [ ] **Step 1: Viết test (đang fail)**

```js
// test/core/video-metrics.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoRow } from '../../src/core/video/metrics.js';
import { METRICS } from '../../src/core/metrics/definitions.js';

const NOW = Date.parse('2026-11-13T00:00:00Z');

test('videoRow (tiktok): engagement counts like + comment + share + save over plays', () => {
  const r = videoRow({ plays: 10000, likes: 500, comments: 40, shares: 10, saves: 50, createdAt: '2026-11-03T00:00:00Z' }, 'tiktok', NOW);
  assert.deepEqual(r, { views: 10000, ageDays: 10, viewsPerDay: 1000, engagementRate: 0.06 });
});

test('videoRow (youtube): engagement counts like + comment over views, date from publishedAt', () => {
  const r = videoRow({ views: 2000, likes: 90, comments: 10, publishedAt: '2026-11-11T00:00:00Z' }, 'youtube', NOW);
  assert.deepEqual(r, { views: 2000, ageDays: 2, viewsPerDay: 1000, engagementRate: 0.05 });
});

test('videoRow: a video younger than a day is divided by one day; missing date or views give nulls, not NaN', () => {
  assert.equal(videoRow({ plays: 800, likes: 0, comments: 0, shares: 0, saves: 0, createdAt: '2026-11-12T18:00:00Z' }, 'tiktok', NOW).viewsPerDay, 800);
  assert.deepEqual(videoRow({ plays: 0, likes: 5, comments: 0, shares: 0, saves: 0, createdAt: null }, 'tiktok', NOW), { views: 0, ageDays: null, viewsPerDay: null, engagementRate: null });
  assert.deepEqual(videoRow({ likes: null, comments: null, publishedAt: null }, 'youtube', NOW), { views: null, ageDays: null, viewsPerDay: null, engagementRate: null });
});

test('words per minute is defined once in the metric registry', () => {
  assert.equal(METRICS.wordsPerMinute.label.vi, 'Tốc độ nói');
  assert.match(METRICS.wordsPerMinute.formula, /10 giây/);
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `node --disable-warning=ExperimentalWarning --test test/core/video-metrics.test.js`
Expected: FAIL, `Cannot find module '.../src/core/video/metrics.js'`

- [ ] **Step 3: Viết code**

```js
// src/core/video/metrics.js
// The numbers of one video in the "Phân tích video" compare table. Pure: `now` is a parameter.
const DAY = 86_400_000;

/**
 * @param {Record<string, any>} video a TikTokVideo (plays, createdAt, shares, saves) or a YouTube video (views, publishedAt)
 * @param {'tiktok'|'youtube'} platform @param {number} now
 * @returns {{views: number|null, ageDays: number|null, viewsPerDay: number|null, engagementRate: number|null}}
 */
export function videoRow(video, platform, now) {
  const tiktok = platform === 'tiktok';
  const views = (tiktok ? video.plays : video.views) ?? null;
  const at = tiktok ? video.createdAt : video.publishedAt;
  const age = at ? Math.max(0, (now - Date.parse(at)) / DAY) : null;
  const n = (x) => Number(x ?? 0);
  const interactions = n(video.likes) + n(video.comments) + (tiktok ? n(video.shares) + n(video.saves) : 0);
  return {
    views,
    ageDays: age == null ? null : Math.round(age * 10) / 10,
    viewsPerDay: views != null && age != null ? Math.round(views / Math.max(age, 1)) : null,
    engagementRate: views ? Math.round((interactions / views) * 10000) / 10000 : null,
  };
}
```

Trong `src/core/metrics/definitions.js`, thêm đúng một dòng ngay dưới dòng bắt đầu bằng `  engagementRate:`:

```js
  wordsPerMinute: { label: { vi: 'Tốc độ nói', en: 'Words per minute' }, unit: 'count', version: 1, formula: 'số từ trong script ÷ số phút từ câu đầu tới câu cuối; để trống khi nói dưới 10 giây' },
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `node --disable-warning=ExperimentalWarning --test test/core/video-metrics.test.js test/core/definitions.test.js`
Expected: `fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/core/video/metrics.js src/core/metrics/definitions.js test/core/video-metrics.test.js
git commit -m "feat(core): per-video row for the analysis table; words per minute in the metric registry"
```

---

### Task 3: Đọc trang video TikTok (`parseVideoPage`, `pickSubtitle`)

**Files:**
- Modify: `src/sources/tiktok/parse.js` (thêm hai export ở cuối file; dùng lại hàm `parseVideo` có sẵn trong file)
- Create: `src/sources/tiktok/fixtures/video-page.html`, `src/sources/tiktok/fixtures/video-page-gone.html`, `src/sources/tiktok/fixtures/subtitle.vtt`
- Test: `test/sources/tiktok-video-page.test.js`

**Interfaces:**
- Consumes: `parseVideo(item, query)` (hàm nội bộ có sẵn ở đầu `parse.js`, trả `TikTokVideo|null`).
- Produces:
  - `parseVideoPage(html: string): {ok: true, video: TikTokVideo, subtitles: {url: string, language: string, source: string}[]} | {ok: false, reason: 'blocked'|'unavailable'}`
  - `pickSubtitle(subtitles): {url, language, source}|null` — ưu tiên `source === 'ASR'`, rồi tới bản không phải `'MT'`; chỉ có `'MT'` thì `null`.

- [ ] **Step 1: Tạo fixture**

`src/sources/tiktok/fixtures/video-page.html` (một dòng JSON trong thẻ script, đúng hình dạng trang thật đã kiểm ngày 2026-11-13; đã lược còn các trường parser đọc):

```html
<!doctype html><html><head><title>TikTok</title></head><body>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"__DEFAULT_SCOPE__":{"webapp.video-detail":{"statusCode":0,"itemInfo":{"itemStruct":{"id":"7662369308550401287","desc":"Kết hôn giả sẽ không còn dễ #ditrumy #thexanh","createTime":1729339200,"textExtra":[{"hashtagName":"ditrumy"},{"hashtagName":"thexanh"},{"hashtagName":""}],"author":{"uniqueId":"creator1","nickname":"Creator Một","verified":true},"music":{"title":"nhạc nền - Creator Một"},"stats":{"playCount":251000,"diggCount":6300,"commentCount":412,"shareCount":980,"collectCount":1500},"video":{"duration":47,"cover":"https://p16.example/cover.jpeg","subtitleInfos":[{"LanguageCodeName":"eng-US","Source":"MT","Format":"webvtt","Url":"https://v16.example/sub-en.vtt"},{"LanguageCodeName":"vie-VN","Source":"ASR","Format":"webvtt","Url":"https://v16.example/sub-vi.vtt"},{"LanguageCodeName":"vie-VN","Source":"ASR","Format":"creator_caption","Url":"https://v16.example/sub-vi.json"}]}}}}}}</script>
</body></html>
```

`src/sources/tiktok/fixtures/video-page-gone.html`:

```html
<!doctype html><html><body>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"__DEFAULT_SCOPE__":{"webapp.video-detail":{"statusCode":10204,"statusMsg":"item doesn't exist"}}}</script>
</body></html>
```

`src/sources/tiktok/fixtures/subtitle.vtt`:

```
WEBVTT

00:00:00.040 --> 00:00:00.760
kết hôn với người Mỹ

00:00:00.761 --> 00:00:02.641
không còn được cấp thẻ xanh dễ như trước

00:00:06.000 --> 00:00:46.000
vì sở di trú vừa đổi cách phỏng vấn
```

- [ ] **Step 2: Viết test (đang fail)**

```js
// test/sources/tiktok-video-page.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseVideoPage, pickSubtitle } from '../../src/sources/tiktok/parse.js';

const html = (n) => fs.readFileSync(`src/sources/tiktok/fixtures/${n}.html`, 'utf8');

test('video page: the video with its numbers, and only WebVTT subtitles', () => {
  const p = parseVideoPage(html('video-page'));
  assert.equal(p.ok, true);
  assert.deepEqual(p.video, {
    id: '7662369308550401287', url: 'https://www.tiktok.com/@creator1/video/7662369308550401287',
    caption: 'Kết hôn giả sẽ không còn dễ #ditrumy #thexanh', hashtags: ['ditrumy', 'thexanh'], createdAt: '2024-10-19T12:00:00.000Z',
    durationSec: 47, plays: 251000, likes: 6300, comments: 412, shares: 980, saves: 1500,
    author: 'creator1', authorName: 'Creator Một', authorVerified: true, musicTitle: 'nhạc nền - Creator Một',
    cover: 'https://p16.example/cover.jpeg', query: '',
  });
  assert.deepEqual(p.subtitles, [
    { url: 'https://v16.example/sub-en.vtt', language: 'eng-US', source: 'MT' },
    { url: 'https://v16.example/sub-vi.vtt', language: 'vie-VN', source: 'ASR' },
  ]);
});

test('video page: a removed or private video is "unavailable"; a page without the data block is "blocked"', () => {
  assert.deepEqual(parseVideoPage(html('video-page-gone')), { ok: false, reason: 'unavailable' });
  assert.deepEqual(parseVideoPage('<html><body>Verify to continue</body></html>'), { ok: false, reason: 'blocked' });
  assert.deepEqual(parseVideoPage('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{not json</script>'), { ok: false, reason: 'blocked' });
  assert.deepEqual(parseVideoPage(/** @type {any} */ (undefined)), { ok: false, reason: 'blocked' });
});

test('video page: a video without subtitles has an empty list, not an error', () => {
  const page = html('video-page').replace(/,"subtitleInfos":\[.*?\]\}\}\}\}\}\}/, '}}}}}}');
  const p = parseVideoPage(page);
  assert.equal(p.ok, true);
  assert.deepEqual(p.subtitles, []);
});

test('pickSubtitle: speech recognition first, then the creator\'s own; a machine translation is never used', () => {
  const asr = { url: 'a', language: 'vie-VN', source: 'ASR' };
  const mt = { url: 'b', language: 'eng-US', source: 'MT' };
  const own = { url: 'c', language: 'vie-VN', source: 'LC' };
  assert.equal(pickSubtitle([mt, own, asr]), asr);
  assert.equal(pickSubtitle([mt, own]), own);
  assert.equal(pickSubtitle([mt]), null, 'only a machine translation: treated as no subtitles');
  assert.equal(pickSubtitle([]), null);
});
```

- [ ] **Step 3: Chạy test, xác nhận fail**

Run: `node --disable-warning=ExperimentalWarning --test test/sources/tiktok-video-page.test.js`
Expected: FAIL, `parseVideoPage is not a function` (hoặc lỗi export không tồn tại)

- [ ] **Step 4: Viết code** (thêm vào cuối `src/sources/tiktok/parse.js`)

```js
/**
 * A video's own page (no login): the JSON TikTok embeds for its web app has the video and its subtitle files.
 * @param {string} html
 * @returns {{ok: true, video: NonNullable<ReturnType<typeof parseVideo>>, subtitles: {url: string, language: string, source: string}[]} | {ok: false, reason: 'blocked'|'unavailable'}}
 */
export function parseVideoPage(html) {
  const m = String(html ?? '').match(/<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  let detail = null;
  try {
    detail = m ? JSON.parse(m[1])?.__DEFAULT_SCOPE__?.['webapp.video-detail'] ?? null : null;
  } catch {
    detail = null;
  }
  // No data block at all: TikTok answered with a challenge or an error page instead of the video page.
  if (!detail) return { ok: false, reason: 'blocked' };
  const item = detail.itemInfo?.itemStruct;
  const video = item ? parseVideo(item, '') : null;
  if (!video) return { ok: false, reason: 'unavailable' };
  const subtitles = (Array.isArray(item.video?.subtitleInfos) ? item.video.subtitleInfos : [])
    .filter((s) => s?.Url && String(s.Format ?? '').toLowerCase() === 'webvtt')
    .map((s) => ({ url: String(s.Url), language: String(s.LanguageCodeName ?? ''), source: String(s.Source ?? '') }));
  return { ok: true, video, subtitles };
}

/**
 * Which subtitle file is the video's own speech: TikTok's speech recognition (ASR) first, then whatever the creator added.
 * A machine translation (MT) is another language's guess at the words and is never used.
 * @template {{source: string}} S @param {S[]} subtitles @returns {S|null}
 */
export const pickSubtitle = (subtitles) => subtitles.find((s) => s.source === 'ASR') ?? subtitles.find((s) => s.source !== 'MT') ?? null;
```

- [ ] **Step 5: Chạy test, xác nhận pass**

Run: `node --disable-warning=ExperimentalWarning --test test/sources/tiktok-video-page.test.js test/sources/tiktok-parse.test.js`
Expected: `fail 0`

- [ ] **Step 6: Commit**

```bash
git add src/sources/tiktok/parse.js src/sources/tiktok/fixtures/video-page.html src/sources/tiktok/fixtures/video-page-gone.html src/sources/tiktok/fixtures/subtitle.vtt test/sources/tiktok-video-page.test.js
git commit -m "feat(tiktok): parse a video's own page for its numbers and subtitle files"
```

---

### Task 4: `getVideo` trên nguồn TikTok (port, adapter thật, adapter giả)

**Files:**
- Modify: `src/sources/tiktok/http.js` (typedef `FetchLike`, thêm `getText`)
- Create: `src/sources/tiktok/video.js`
- Modify: `src/sources/tiktok/index.js` (import, tạo `getVideo`, thêm vào object trả về)
- Modify: `src/ports/tiktok-source.js` (typedef `Transcript`, method `getVideo`)
- Modify: `src/sources/fake/tiktok.js` (thêm `FAKE_TRANSCRIPT`, `getVideo`)
- Modify: `test/sources/tiktok-contract.js`, `test/sources/tiktok-contract.test.js`
- Test: `test/sources/tiktok-video.test.js`

**Interfaces:**
- Consumes: `parseVideoPage`, `pickSubtitle` (Task 3); `parseVtt` (Task 1); `resolveVideo(urlOrId): Promise<{id, url}>` có sẵn; `rethrowIfCancelled(e)` từ `src/core/cancel.js`.
- Produces: `tiktok.getVideo(urlOrId: string): Promise<{video: TikTokVideo, transcript: Transcript|null}>`. Lỗi mang `code`: `'video_unavailable'` hoặc `'tiktok_blocked'`. Adapter giả: id `7000000000000000001` có transcript, `…0002` không có, `7000000000000000009` ném `video_unavailable`.

- [ ] **Step 1: Viết test (đang fail)**

```js
// test/sources/tiktok-video.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTikTokSource } from '../../src/sources/tiktok/index.js';

const fx = (n) => fs.readFileSync(`src/sources/tiktok/fixtures/${n}`, 'utf8');
/** A fetch that serves text by URL; `seen` records what was asked. */
function fakeFetch(routes, seen = []) {
  return async (u) => {
    seen.push(u);
    const body = Object.entries(routes).find(([k]) => u.includes(k))?.[1];
    if (body instanceof Error) throw body;
    return { status: body == null ? 404 : 200, url: u, text: async () => body ?? '', json: async () => JSON.parse(body ?? 'null') };
  };
}
const source = (routes, seen) => createTikTokSource({ fetch: fakeFetch(routes, seen), hasPlaywright: () => false, sleep: async () => {} });
const LINK = 'https://www.tiktok.com/@creator1/video/7662369308550401287';

test('getVideo: one page load gives the numbers; the speech-recognition subtitle becomes the transcript', async () => {
  const seen = [];
  const r = await source({ '/video/7662369308550401287': fx('video-page.html'), 'sub-vi.vtt': fx('subtitle.vtt') }, seen).getVideo(`${LINK}?is_from_webapp=1&sender_device=pc`);
  assert.equal(r.video.plays, 251000);
  assert.equal(r.video.url, LINK, 'tracking parameters are not kept');
  assert.equal(r.transcript.language, 'vie-VN');
  assert.equal(r.transcript.kind, 'auto');
  assert.equal(r.transcript.segments.length, 3);
  assert.equal(r.transcript.segments[0].text, 'kết hôn với người Mỹ');
  assert.deepEqual(seen, [LINK, 'https://v16.example/sub-vi.vtt'], 'two requests, and never the machine translation');
});

test('getVideo: an empty, broken or unreachable subtitle file means no transcript, not a failed video', async () => {
  for (const sub of ['', '<html>Access Denied</html>', new Error('socket hang up')]) {
    const r = await source({ '/video/7662369308550401287': fx('video-page.html'), 'sub-vi.vtt': sub }).getVideo(LINK);
    assert.equal(r.video.id, '7662369308550401287');
    assert.equal(r.transcript, null);
  }
});

test('getVideo: removed video → video_unavailable; challenge page → tiktok_blocked; not a TikTok link → plain error', async () => {
  await assert.rejects(() => source({ '/video/': fx('video-page-gone.html') }).getVideo(LINK), (e) => e.code === 'video_unavailable' && /riêng tư/.test(e.message));
  await assert.rejects(() => source({ '/video/': '<html>Verify</html>' }).getVideo(LINK), (e) => e.code === 'tiktok_blocked');
  await assert.rejects(() => source({}).getVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), /Không phải link video TikTok/);
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `node --disable-warning=ExperimentalWarning --test test/sources/tiktok-video.test.js`
Expected: FAIL, `getVideo is not a function`

- [ ] **Step 3: `getText` trong `src/sources/tiktok/http.js`**

Sửa typedef `FetchLike` (thêm `text`):

```js
/** Only the parts of fetch/Response this module uses, so tests can pass a small fake.
 * @typedef {(url: string, init?: any) => Promise<{status: number, url?: string, json: () => Promise<any>, text?: () => Promise<string>}>} FetchLike */
```

Trong object trả về, thêm ngay sau method `getJson`:

```js
    /** Body as text (a video's page, a subtitle file). An empty body counts as a failed request. @param {string} url */
    async getText(url) {
      const res = await request(url);
      const body = res.text ? await res.text().catch(() => '') : '';
      if (!body) throw new Error('TikTok trả về dữ liệu không đọc được');
      return body;
    },
```

- [ ] **Step 4: `src/sources/tiktok/video.js`**

```js
// One TikTok video from its link, over plain HTTP (no login, no browser): its numbers and, when it has one, its subtitle file.
import { parseVideoPage, pickSubtitle } from './parse.js';
import { parseVtt } from '../../core/video/transcript.js';
import { rethrowIfCancelled } from '../../core/cancel.js';

const FAIL = {
  unavailable: ['video_unavailable', 'Video không còn hoặc đang để riêng tư'],
  blocked: ['tiktok_blocked', 'TikTok chặn trang video này, thử lại sau ít phút'],
};

/**
 * @param {ReturnType<typeof import('./http.js').createTikTokHttp>} http
 * @param {(urlOrId: string) => Promise<{id: string, url: string}>} resolveVideo
 */
export function makeVideo(http, resolveVideo) {
  /** @param {string} urlOrId */
  return async function getVideo(urlOrId) {
    const ref = await resolveVideo(urlOrId);
    const page = parseVideoPage(await http.getText(ref.url));
    if (!page.ok) {
      const [code, message] = FAIL[page.reason];
      throw Object.assign(new Error(message), { code });
    }
    const sub = pickSubtitle(page.subtitles);
    /** @type {import('../../ports/tiktok-source.js').Transcript|null} */
    let transcript = null;
    if (sub) {
      try {
        const segments = parseVtt(await http.getText(sub.url));
        if (segments.length) transcript = { language: sub.language || null, kind: sub.source === 'ASR' ? 'auto' : 'manual', segments };
      } catch (e) {
        rethrowIfCancelled(e); // a subtitle file that cannot be read is "no script", never a failed video
      }
    }
    return { video: page.video, transcript };
  };
}
```

- [ ] **Step 5: Nối vào adapter thật và port**

`src/sources/tiktok/index.js`: thêm import cạnh các import adapter khác:

```js
import { makeVideo } from './video.js';
```

Trong `createTikTokSource`, ngay sau dòng `const comments = makeComments(http);`:

```js
  const getVideo = makeVideo(http, comments.resolveVideo);
```

Trong object trả về, ngay sau dòng `getComments: comments.getComments,`:

```js
    getVideo,
```

`src/ports/tiktok-source.js`: thêm typedef ngay trước dòng `/** @typedef {{loggedIn: boolean, …}} LoginStatus …`:

```js
/**
 * A video's spoken words. `end` is null when the platform only gives where a segment starts.
 * @typedef {{language: string|null, kind: 'auto'|'manual', segments: {start: number, end: number|null, text: string}[]}} Transcript
 */
```

và thêm một dòng vào typedef `TikTokSource`, ngay sau dòng `getComments`:

```js
 * @property {(urlOrId: string) => Promise<{video: TikTokVideo, transcript: Transcript|null}>} getVideo   one page load: numbers + subtitles (null when it has none). Throws code 'video_unavailable' | 'tiktok_blocked'
```

- [ ] **Step 6: Adapter giả** (`src/sources/fake/tiktok.js`)

Thêm ngay sau khai báo `FAKE_COMMENTS`:

```js
/** @type {import('../../ports/tiktok-source.js').Transcript} */
export const FAKE_TRANSCRIPT = {
  language: 'vie-VN', kind: 'auto',
  segments: [
    { start: 0, end: 3, text: 'Phỏng vấn quốc tịch Mỹ đậu rồi' },
    { start: 3, end: 6, text: 'hôm nay mình kể lại từng câu hỏi' },
    { start: 6, end: 40, text: 'câu đầu tiên là về tên và ngày sinh' },
  ],
};
/** Ids with special behaviour in getVideo. */
export const FAKE_GONE_ID = '7000000000000000009';
```

Trong object trả về của `createFakeTikTok`, ngay sau method `getComments`:

```js
    async getVideo(u) {
      const id = String(u).match(/(\d{15,25})/)?.[1];
      if (!id) throw new Error(`Không phải link video TikTok: ${u}`);
      requests++;
      await wait();
      const v = videos.find((x) => x.id === id);
      if (id === FAKE_GONE_ID || !v) throw Object.assign(new Error('Video không còn hoặc đang để riêng tư'), { code: 'video_unavailable' });
      // Only the first fake video has subtitles, so tests cover both cases.
      return { video: { ...v, query: '' }, transcript: id === videos[0].id ? { ...FAKE_TRANSCRIPT, segments: FAKE_TRANSCRIPT.segments.map((s) => ({ ...s })) } : null };
    },
```

- [ ] **Step 7: Test hợp đồng**

`test/sources/tiktok-contract.js`: thêm tham số thứ ba và một test, ngay trước test `capabilities + close`:

```js
/** @param {string} name @param {() => import('../../src/ports/tiktok-source.js').TikTokSource} make @param {{videoLink: string}} o a link the adapter can load */
export function runTikTokContract(name, make, o) {
```

```js
  test(`${name}: getVideo returns a normalized video and a transcript or null`, async () => {
    const r = await make().getVideo(o.videoLink);
    assert.match(r.video.id, /^\d{15,25}$/);
    for (const k of ['plays', 'likes', 'comments', 'shares', 'saves', 'durationSec']) assert.ok(Number.isFinite(r.video[k]), k);
    assert.equal(typeof r.video.author, 'string');
    if (r.transcript !== null) {
      assert.ok(['auto', 'manual'].includes(r.transcript.kind));
      assert.ok(r.transcript.segments.length > 0);
      for (const s of r.transcript.segments) {
        assert.deepEqual(Object.keys(s).sort(), ['end', 'start', 'text']);
        assert.ok(Number.isFinite(s.start) && s.text.length > 0);
      }
    }
  });
```

`test/sources/tiktok-contract.test.js`: thay dòng `const fetch = …` và hai dòng `runTikTokContract(…)` bằng:

```js
const text = (n) => fs.readFileSync(`src/sources/tiktok/fixtures/${n}`, 'utf8');
const fetch = async (u) => {
  if (u.includes('/video/')) return { ok: true, status: 200, url: u, text: async () => text('video-page.html'), json: async () => null };
  if (u.endsWith('.vtt')) return { ok: true, status: 200, url: u, text: async () => text('subtitle.vtt'), json: async () => null };
  return { ok: true, status: 200, url: u, text: async () => '', json: async () => (u.includes('/reply/') ? fx('reply-page') : { ...fx('comment-page'), has_more: 0 }) };
};

runTikTokContract('fake', () => createFakeTikTok(), { videoLink: 'https://www.tiktok.com/@creator/video/7000000000000000001' });
runTikTokContract('tiktok adapter (fixtures)', () => createTikTokSource({ fetch, loadPlaywright: pw, hasPlaywright: () => true, sleep: async () => {} }), { videoLink: 'https://www.tiktok.com/@creator1/video/7662369308550401287' });
```

- [ ] **Step 8: Chạy test, xác nhận pass**

Run: `npm test`
Expected: `fail 0` (gồm typecheck)

- [ ] **Step 9: Commit**

```bash
git add src/sources/tiktok/http.js src/sources/tiktok/video.js src/sources/tiktok/index.js src/ports/tiktok-source.js src/sources/fake/tiktok.js test/sources/tiktok-contract.js test/sources/tiktok-contract.test.js test/sources/tiktok-video.test.js
git commit -m "feat(tiktok): getVideo — a video's numbers and transcript from its link, without sign-in"
```

---

### Task 5: Use case chạy lô và job `tiktok_video_analysis`

**Files:**
- Create: `src/features/shared-video-analysis.js`, `src/features/tiktok/video-analysis.js`, `src/store/upgrades/video_analysis.js`
- Modify: `src/app.js` (import, feature, handler), `src/http/routes/jobs.js` (`JOB_SCHEMAS`), `src/store/upgrades/index.js`
- Test: `test/features/tiktok-video-analysis.test.js`

**Interfaces:**
- Consumes: `tiktok.getVideo` (Task 4), `tiktok.getComments(id, {max, replies}, onProgress)` có sẵn, `withAttention(comments, now)` từ `src/features/tiktok/comments.js`, `scriptStats` (Task 1), `videoRow` (Task 2), `voiceTopics(comments)` từ `src/core/analysis/customer-voice.js`, `noop`, `splitList` từ `src/features/shared.js`, `rethrowIfCancelled`.
- Produces:
  - `MAX_VIDEOS = 10`, `linksOf(videos: string): string[]` (bỏ trùng, bỏ query string).
  - `makeVideoAnalysisRunner({kind, platform, records, now, fetchVideo, fetchComments, titleOf})` → `(params, progress) => Promise<{id: number}>`.
  - `app.features.tiktokVideoAnalysis(params, progress)`; job `tiktok_video_analysis`.
  - Record `data`: `{platform, params, analyzedAt, videos: Entry[]}` với `Entry = {link, video, row, transcript, transcriptNote, script, comments, commentsNote, groups, error}`. `commentsNote` là chuỗi lý do khi không lấy được comment (bổ sung so với spec §7, cần cho Review Focus 4), `null` khi bình thường.

- [ ] **Step 1: Viết test (đang fail)**

```js
// test/features/tiktok-video-analysis.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeTikTok, FAKE_GONE_ID } from '../../src/sources/fake/tiktok.js';
import { linksOf } from '../../src/features/shared-video-analysis.js';

const L = (id) => `https://www.tiktok.com/@creator/video/${id}`;
const A = L('7000000000000000001'); // has a transcript
const B = L('7000000000000000002'); // no subtitles
const GONE = L(FAKE_GONE_ID);

test('a batch: one record with every video, saved as it goes; a failed video does not stop the rest', async () => {
  const a = testApp();
  const steps = [];
  const r = await a.features.tiktokVideoAnalysis({ videos: `${A}\n${GONE}\n${B}` }, (p) => steps.push(p));
  const rec = a.store.records.get('local', r.id);
  assert.equal(rec.kind, 'tiktok_video_analysis');
  assert.equal(rec.title, 'Phỏng vấn quốc tịch Mỹ đậu rồi (+2)');
  const d = rec.data;
  assert.equal(d.platform, 'tiktok');
  assert.deepEqual(d.params, { videos: `${A}\n${GONE}\n${B}`, script: true, comments: 100, replies: true });
  assert.deepEqual(d.videos.map((v) => v.link), [A, GONE, B], 'rows keep the order of the pasted links');

  const [one, gone, two] = d.videos;
  assert.equal(one.error, null);
  assert.equal(one.video.plays, 10000);
  assert.equal(one.row.engagementRate, 0.097, '(900 + 40 + 10 + 20) ÷ 10 000');
  assert.equal(one.transcript.segments.length, 3);
  assert.equal(one.transcriptNote, null);
  assert.equal(one.script.hook, 'Phỏng vấn quốc tịch Mỹ đậu rồi hôm nay mình kể lại từng câu hỏi');
  assert.equal(one.comments.length, 4);
  assert.ok(one.comments.every((c) => c.videoId === one.video.id), 'comments know their video');
  assert.equal(one.groups.total, one.comments.length);
  assert.equal(one.commentsNote, null);

  assert.deepEqual(gone.error, { code: 'video_unavailable', message: 'Video không còn hoặc đang để riêng tư' });
  assert.equal(gone.video, null);
  assert.deepEqual(gone.comments, []);

  assert.equal(two.transcript, null);
  assert.equal(two.transcriptNote, 'none');
  assert.equal(two.script, null);
  assert.equal(two.video.id, '7000000000000000002');

  assert.equal(steps.at(-1).recordId, r.id);
  assert.ok(steps.some((p) => p.recordId === r.id && p.done < 3), 'the record id is reported before the batch ends, so the screen can show finished rows');
});

test('no commenter identity is stored', async () => {
  const a = testApp();
  const r = await a.features.tiktokVideoAnalysis({ videos: A }, () => {});
  const allowed = ['attentionPerDay', 'createdAt', 'id', 'isReply', 'likes', 'parentId', 'parentText', 'pinned', 'replies', 'text', 'videoId'];
  for (const c of a.store.records.get('local', r.id).data.videos[0].comments) assert.deepEqual(Object.keys(c).filter((k) => !allowed.includes(k)), []);
});

test('options: script off, no comments, no replies', async () => {
  const a = testApp();
  const off = a.store.records.get('local', (await a.features.tiktokVideoAnalysis({ videos: A, script: false, comments: 0 }, () => {})).id).data.videos[0];
  assert.equal(off.transcript, null);
  assert.equal(off.transcriptNote, 'off');
  assert.equal(off.script, null);
  assert.deepEqual(off.comments, []);
  const top = a.store.records.get('local', (await a.features.tiktokVideoAnalysis({ videos: A, comments: 300, replies: false }, () => {})).id).data.videos[0];
  assert.ok(top.comments.length > 0 && top.comments.every((c) => !c.isReply));
});

test('the same video pasted twice, or with tracking parameters, is analyzed once', async () => {
  assert.deepEqual(linksOf(`${A}\n${A}?is_from_webapp=1&sender_device=pc\n  ${B}  ,${A}#x`), [A, B]);
  const a = testApp();
  const r = await a.features.tiktokVideoAnalysis({ videos: `${A}\n${A}?is_from_webapp=1` }, () => {});
  const rec = a.store.records.get('local', r.id);
  assert.equal(rec.data.videos.length, 1);
  assert.equal(rec.title, 'Phỏng vấn quốc tịch Mỹ đậu rồi', 'no "(+1)" for a duplicate');
});

test('more than 10 different links, or none, is refused before anything is fetched', async () => {
  const tt = createFakeTikTok();
  const a = testApp(undefined, tt);
  const eleven = Array.from({ length: 11 }, (_, i) => L(`70000000000000001${String(i).padStart(2, '0')}`)).join('\n');
  await assert.rejects(() => a.features.tiktokVideoAnalysis({ videos: eleven }, () => {}), (e) => e.code === 'invalid_input' && e.field === 'videos' && /Tối đa 10/.test(e.message));
  await assert.rejects(() => a.features.tiktokVideoAnalysis({ videos: ' \n ' }, () => {}), (e) => e.code === 'invalid_input');
  assert.equal(tt.stats().requests, 0);
});

test('comments cannot be read: the video keeps its numbers and script, and says why', async () => {
  const tt = createFakeTikTok();
  tt.getComments = async () => { throw new Error('TikTok từ chối trang comment'); };
  const a = testApp(undefined, tt);
  const v = a.store.records.get('local', (await a.features.tiktokVideoAnalysis({ videos: A }, () => {})).id).data.videos[0];
  assert.equal(v.error, null);
  assert.equal(v.video.plays, 10000);
  assert.equal(v.transcript.segments.length, 3);
  assert.deepEqual(v.comments, []);
  assert.equal(v.commentsNote, 'TikTok từ chối trang comment');
});

test('every video failed: the job fails with the first reason and leaves no record', async () => {
  const a = testApp();
  await assert.rejects(() => a.features.tiktokVideoAnalysis({ videos: `${GONE}\nhttps://example.com/x` }, () => {}), (e) => e.code === 'video_unavailable');
  assert.deepEqual(a.store.records.list('local', 'tiktok_video_analysis'), []);
});

test('through the job runner: schema accepts the form, result carries the record id', async () => {
  const a = testApp();
  a.runner.start();
  const { id } = a.runner.enqueue('local', 'tiktok_video_analysis', { videos: A, script: true, comments: 100, replies: true }, 'x');
  let job;
  for (let i = 0; i < 100 && !['succeeded', 'failed'].includes((job = a.runner.get(id)).status); i++) await new Promise((r) => setTimeout(r, 20));
  a.runner.stop();
  assert.equal(job.status, 'succeeded', job.error || '');
  assert.equal(a.store.records.get('local', job.record_id).schema_version, 1);
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `node --disable-warning=ExperimentalWarning --test test/features/tiktok-video-analysis.test.js`
Expected: FAIL, `Cannot find module '.../src/features/shared-video-analysis.js'`

- [ ] **Step 3: Khung chạy lô** (`src/features/shared-video-analysis.js`)

```js
// "Phân tích video": the batch loop both platforms share. One record for the whole batch, written after every video,
// so the screen shows rows as they finish. A video that cannot be analyzed becomes a row with its reason.
// Imports no YouTube use case, so features/tiktok/ may use it (docs/ARCHITECTURE.md §4).
import { noop, splitList } from './shared.js';
import { rethrowIfCancelled } from '../core/cancel.js';
import { scriptStats } from '../core/video/transcript.js';
import { videoRow } from '../core/video/metrics.js';
import { voiceTopics } from '../core/analysis/customer-voice.js';

export const MAX_VIDEOS = 10;
const COMMENT_CHOICES = [0, 100, 300];

/** Pasted text → distinct links, in order, without the tracking parameters share buttons add. @param {string|string[]|undefined} videos */
export const linksOf = (videos) => [...new Set(splitList(String(videos ?? '').replace(/\s+/g, '\n')).map((l) => l.replace(/[?#].*$/, '')))];

const invalid = (message) => Object.assign(new Error(message), { code: 'invalid_input', field: 'videos' });

/**
 * @param {{
 *   kind: string, platform: 'tiktok'|'youtube', records: any, now: () => number,
 *   fetchVideo: (link: string, o: {script: boolean}) => Promise<{video: any, transcript: any|null, transcriptNote?: string|null}>,
 *   fetchComments: (video: any, o: {max: number, replies: boolean}, onProgress: (n: number) => void) => Promise<any[]>,
 *   titleOf: (video: any) => string,
 * }} o  fetchVideo throws (with a code) when the video cannot be analyzed; transcriptNote says why there is no script ('none' by default)
 */
export function makeVideoAnalysisRunner({ kind, platform, records, now, fetchVideo, fetchComments, titleOf }) {
  /** @param {Record<string, any>} params {videos, script?, comments?, replies?} */
  return async function videoAnalysis(params, progress = noop) {
    const links = linksOf(params.videos);
    if (!links.length) throw invalid('Dán ít nhất một link video');
    if (links.length > MAX_VIDEOS) throw invalid(`Tối đa ${MAX_VIDEOS} video mỗi lần (đang có ${links.length})`);
    const script = params.script !== false;
    const max = COMMENT_CHOICES.includes(Number(params.comments)) ? Number(params.comments) : 100;
    const replies = params.replies !== false;
    const clean = { videos: links.join('\n'), script, comments: max, replies };
    const data = { platform, params: clean, analyzedAt: new Date(now()).toISOString(), videos: /** @type {any[]} */ ([]) };
    /** @type {number|null} */
    let id = null;
    const at = (i, step) => progress({ step, done: i, total: links.length, ...(id != null ? { recordId: id } : {}) });

    for (const [i, link] of links.entries()) {
      const label = `Video ${i + 1}/${links.length}`;
      at(i, `${label}: thông số${script ? ' và script' : ''}`);
      const entry = { link, video: null, row: null, transcript: null, transcriptNote: script ? null : 'off', script: null, comments: [], commentsNote: null, groups: voiceTopics([]), error: null };
      try {
        const got = await fetchVideo(link, { script });
        entry.video = got.video;
        entry.row = videoRow(got.video, platform, now());
        if (script) {
          entry.transcript = got.transcript ?? null;
          entry.transcriptNote = entry.transcript ? null : got.transcriptNote ?? 'none';
          entry.script = scriptStats(entry.transcript, got.video.durationSec ?? null);
        }
        if (max > 0) {
          try {
            const list = await fetchComments(got.video, { max, replies }, (n) => at(i, `${label}: comment ${n}/${max}`));
            entry.comments = list.map((c) => ({ ...c, videoId: got.video.id }));
            entry.groups = voiceTopics(entry.comments);
          } catch (e) {
            rethrowIfCancelled(e);
            entry.commentsNote = String(e?.message || e); // numbers and script are still worth keeping
          }
        }
      } catch (e) {
        rethrowIfCancelled(e);
        entry.error = { code: typeof e?.code === 'string' ? e.code : 'failed', message: String(e?.message || e) };
      }
      data.videos.push(entry);
      const first = data.videos.find((v) => !v.error);
      if (!first) continue; // nothing worth a record yet
      if (id == null) id = records.add(kind, titleOf(first.video) + (links.length > 1 ? ` (+${links.length - 1})` : ''), { params: clean, data });
      else records.update(id, data);
    }
    if (id == null) {
      const why = data.videos[0]?.error;
      throw Object.assign(new Error(why?.message || 'Không phân tích được video nào'), { code: why?.code });
    }
    at(links.length, 'Xong');
    return { id };
  };
}
```

- [ ] **Step 4: Use case TikTok** (`src/features/tiktok/video-analysis.js`)

```js
// Use case: "Phân tích video" for TikTok links — numbers, script and comments of each video, one record per batch.
import { makeVideoAnalysisRunner } from '../shared-video-analysis.js';
import { withAttention } from './comments.js';

/** @param {{tiktok: import('../../ports/tiktok-source.js').TikTokSource, records: any, now: () => number}} deps */
export function makeTikTokVideoAnalysis({ tiktok, records, now }) {
  return makeVideoAnalysisRunner({
    kind: 'tiktok_video_analysis', platform: 'tiktok', records, now,
    fetchVideo: (link) => tiktok.getVideo(link),
    fetchComments: async (video, o, onProgress) => withAttention((await tiktok.getComments(video.id, { max: o.max, replies: o.replies }, onProgress)).comments, now()),
    titleOf: (v) => String(v.caption || `@${v.author}`).replace(/\s+/g, ' ').trim().slice(0, 80),
  });
}
```

- [ ] **Step 5: Đăng ký**

`src/store/upgrades/video_analysis.js`:

```js
// Shape of a "Phân tích video" record (both platforms). v1 is the first; add a step here when the shape changes.
export const latest = 1;
/** @type {Record<number, (d: any) => any>} */
export const steps = {};
```

`src/store/upgrades/index.js`: thêm import và hai mục vào `KINDS`:

```js
import * as videoAnalysis from './video_analysis.js';

const KINDS = { video_search: videoSearch, research, channel_analysis: channelAnalysis, idea_check: ideaCheck, tiktok_video_analysis: videoAnalysis, video_analysis: videoAnalysis };
```

`src/http/routes/jobs.js`: thêm vào `JOB_SCHEMAS`, ngay sau dòng `tiktok_topic`:

```js
  tiktok_video_analysis: { videos: 'string!', script: 'bool?', comments: /** @type {any} */ ([0, 100, 300]), replies: 'bool?' },
```

`src/app.js`: thêm import cạnh các import TikTok:

```js
import { makeTikTokVideoAnalysis } from './features/tiktok/video-analysis.js';
```

thêm vào object `features`, ngay sau dòng `tiktokTopicScan`:

```js
    tiktokVideoAnalysis: makeTikTokVideoAnalysis({ tiktok, records: base.records, now: base.now }),
```

và thêm handler ngay sau dòng `handlers.tiktok_topic = …`:

```js
  handlers.tiktok_video_analysis = (p, ctx) => features.tiktokVideoAnalysis(p, ctx.progress);
```

- [ ] **Step 6: Chạy test, xác nhận pass**

Run: `npm test`
Expected: `fail 0`. Nếu test `title` lệch vì `(+N)`: `N` là số link **sau khi bỏ trùng** trừ 1.

- [ ] **Step 7: Commit**

```bash
git add src/features/shared-video-analysis.js src/features/tiktok/video-analysis.js src/store/upgrades/video_analysis.js src/store/upgrades/index.js src/http/routes/jobs.js src/app.js test/features/tiktok-video-analysis.test.js
git commit -m "feat(tiktok): video analysis job — numbers, script and comments of up to 10 links in one record"
```

---

### Task 6: Xuất Markdown và CSV

**Files:**
- Create: `src/core/report/video-analysis.js`
- Modify: `src/http/routes/records.js` (import; nhánh `.md`; nhánh `.csv`)
- Test: `test/http/video-analysis-export.test.js`

**Interfaces:**
- Consumes: record `data` của Task 5; `scriptText` (Task 1); `metricLabel` từ `src/core/metrics/definitions.js`; `toCsv(rows, cols)` từ `src/core/report/csv.js` (cột dạng `{key?, label, get?}`).
- Produces:
  - `videoAnalysisMarkdown(data, {only?: number}): string` — `only` là số thứ tự video bắt đầu từ 1; bỏ trống là cả lô.
  - `VIDEO_ANALYSIS_COLS` — cột CSV, nhận từng `Entry`.
  - `transcriptNoteText(note: string|null): string`.
  - HTTP: `GET /api/v1/records/:id/export.md[?video=N]`, `GET /api/v1/records/:id/export.csv` cho kind `tiktok_video_analysis` và `video_analysis`.

- [ ] **Step 1: Viết test (đang fail)**

```js
// test/http/video-analysis-export.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from '../features/helpers.js';
import { createHttpServer } from '../../src/http/server.js';
import { FAKE_GONE_ID } from '../../src/sources/fake/tiktok.js';
import { videoAnalysisMarkdown, transcriptNoteText } from '../../src/core/report/video-analysis.js';

const L = (id) => `https://www.tiktok.com/@creator/video/${id}`;
async function boot() {
  const app = testApp();
  const srv = createHttpServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  const base = `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}`;
  const { id } = await app.features.tiktokVideoAnalysis({ videos: `${L('7000000000000000001')}\n${L(FAKE_GONE_ID)}\n${L('7000000000000000002')}` }, () => {});
  return { app, base, id, close: () => srv.close() };
}

test('Markdown of the batch: compare table, then each video with hook, script and quoted comments', async () => {
  const s = await boot();
  const r = await fetch(`${s.base}/api/v1/records/${s.id}/export.md`);
  assert.match(r.headers.get('content-disposition') || '', /attachment/);
  const md = await r.text();
  assert.match(md, /^# Phân tích video TikTok — 3 video/);
  assert.match(md, /Không có tên người bình luận/);
  assert.match(md, /\| # \| Video \| Kênh \| View \|/);
  assert.match(md, /## 1\. Phỏng vấn quốc tịch Mỹ đậu rồi/);
  assert.match(md, /\*\*Mở đầu:\*\* Phỏng vấn quốc tịch Mỹ đậu rồi hôm nay mình kể lại từng câu hỏi/);
  assert.match(md, /\[0:00\] Phỏng vấn quốc tịch Mỹ đậu rồi\n\[0:03\] hôm nay mình kể lại từng câu hỏi/);
  assert.match(md, /Phụ đề tự động/);
  assert.match(md, /- \(♥50 ↩1\) Phỏng vấn có khó không ạ\?/);
  assert.match(md, /## 2\. [^\n]*\n\nLink: [^\n]*\n\n> Không phân tích được: Video không còn hoặc đang để riêng tư/);
  assert.match(md, /## 3\. Kinh nghiệm thi quốc tịch mỹ[\s\S]*Video không có phụ đề/);
  s.close();
});

test('Markdown of one video: ?video=N (1-based); out of range → 400', async () => {
  const s = await boot();
  const one = await (await fetch(`${s.base}/api/v1/records/${s.id}/export.md?video=3&inline=1`)).text();
  assert.match(one, /^# Kinh nghiệm thi quốc tịch mỹ/);
  assert.ok(!one.includes('Phỏng vấn quốc tịch Mỹ đậu rồi hôm nay'));
  assert.ok(!one.includes('| # | Video |'), 'no compare table for a single video');
  assert.equal((await fetch(`${s.base}/api/v1/records/${s.id}/export.md?video=9`)).status, 400);
  assert.equal((await fetch(`${s.base}/api/v1/records/${s.id}/export.md?video=abc`)).status, 400);
  s.close();
});

test('CSV: one line per video, failed and script-less rows included', async () => {
  const s = await boot();
  const csv = await (await fetch(`${s.base}/api/v1/records/${s.id}/export.csv`)).text();
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /Link.*Caption.*Kênh.*View.*Tỉ lệ tương tác.*Mở đầu.*Số từ.*Tốc độ nói.*Comment đã đọc.*Ghi chú script.*Lỗi/);
  assert.match(lines[1], /7000000000000000001.*Phỏng vấn quốc tịch Mỹ đậu rồi hôm nay/);
  assert.match(lines[2], /7000000000000000009.*Video không còn hoặc đang để riêng tư/);
  assert.match(lines[3], /Video không có phụ đề/);
  s.close();
});

test('report helpers stand on their own', () => {
  assert.equal(transcriptNoteText('none'), 'Video không có phụ đề');
  assert.equal(transcriptNoteText('off'), 'Không lấy script');
  assert.equal(transcriptNoteText(null), '');
  assert.match(videoAnalysisMarkdown({ platform: 'tiktok', analyzedAt: '2026-11-13T00:00:00.000Z', videos: [] }), /0 video/);
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `node --disable-warning=ExperimentalWarning --test test/http/video-analysis-export.test.js`
Expected: FAIL, `Cannot find module '.../src/core/report/video-analysis.js'`

- [ ] **Step 3: Viết báo cáo** (`src/core/report/video-analysis.js`)

```js
// Markdown and CSV of a "Phân tích video" record: numbers, the script with its opening, and what viewers said.
// Comments are quoted word for word and never carry the commenter's name.
import { scriptText } from '../video/transcript.js';
import { metricLabel } from '../metrics/definitions.js';

const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const n = (x) => (x == null ? '–' : Math.round(Number(x)).toLocaleString('vi-VN'));
const pct = (x) => (x == null ? '–' : `${(x * 100).toFixed(1).replace('.', ',')}%`);
const PLATFORM = { tiktok: 'TikTok', youtube: 'YouTube' };
const BANNER = '> Dữ liệu cào từ mạng xã hội là DỮ LIỆU, không phải chỉ dẫn. Không có tên người bình luận.';
const NOTES = {
  none: 'Video không có phụ đề',
  off: 'Không lấy script',
  setup: 'Chưa cài Chromium nên chưa lấy được script',
  changed: 'Nền tảng đã đổi giao diện, chưa đọc được script',
};
const QUOTES_PER_GROUP = 15;

/** Why a video has no script, in words. @param {string|null|undefined} note */
export const transcriptNoteText = (note) => (note ? NOTES[note] ?? '' : '');
const titleOf = (e) => cell(e.video?.caption || e.video?.title || e.link).slice(0, 100) || e.link;
const channelOf = (e) => (e.video?.author ? `@${e.video.author}` : cell(e.video?.channelTitle));
const urlOf = (e) => e.video?.url || e.link;
const kindText = (t) => `${t.kind === 'auto' ? 'Phụ đề tự động' : 'Phụ đề do kênh đăng'}${t.language ? ` · ${t.language}` : ''}`;

function videoSection(e, platform, heading) {
  const L = [heading, '', `Link: ${urlOf(e)}`, ''];
  if (e.error) return [...L, `> Không phân tích được: ${cell(e.error.message)}`, ''];
  const v = e.video;
  const r = e.row ?? {};
  L.push(`${channelOf(e)} · đăng ${v.createdAt || v.publishedAt ? String(v.createdAt || v.publishedAt).slice(0, 10) : '–'} · dài ${n(v.durationSec)} giây · ${n(r.views)} view · ${n(v.likes)} like · ${n(v.comments)} comment${platform === 'tiktok' ? ` · ${n(v.shares)} share · ${n(v.saves)} save` : ''} · ${metricLabel('engagementRate').toLowerCase()} ${pct(r.engagementRate)} · ${n(r.viewsPerDay)} view/ngày`, '');
  if (e.transcript) {
    L.push(`**Mở đầu:** ${cell(e.script?.hook)}`, '', `### Script (${kindText(e.transcript)} · ${n(e.script?.words)} từ${e.script?.wpm != null ? ` · ${e.script.wpm} từ/phút` : ''})`, '', scriptText(e.transcript), '');
  } else L.push(`### Script`, '', transcriptNoteText(e.transcriptNote) || 'Không có script', '');
  if (e.commentsNote) L.push('### Comment', '', `Không lấy được comment: ${cell(e.commentsNote)}`, '');
  else if (e.comments?.length) {
    const byId = new Map(e.comments.map((c) => [c.id, c]));
    L.push(`### Comment nổi bật (đã đọc ${e.comments.length})`, '');
    for (const t of e.groups?.topics ?? []) {
      const list = t.ids.map((id) => byId.get(id)).filter(Boolean).sort((a, b) => (b.likes ?? 0) + (b.replies ?? 0) - ((a.likes ?? 0) + (a.replies ?? 0))).slice(0, QUOTES_PER_GROUP);
      if (!list.length) continue;
      L.push(`**${cell(t.label)} (${t.count})**`, '', ...list.map((c) => `- (♥${c.likes ?? 0} ↩${c.replies ?? 0}) ${cell(c.text).slice(0, 300)}`), '');
    }
  }
  return L;
}

/**
 * @param {any} d record data @param {{only?: number}} [o] only: 1-based index of the one video to export
 */
export function videoAnalysisMarkdown(d, { only } = {}) {
  const videos = d.videos ?? [];
  if (only != null) return [...videoSection(videos[only - 1], d.platform, `# ${titleOf(videos[only - 1])}`), BANNER, ''].join('\n');
  const L = [`# Phân tích video ${PLATFORM[d.platform] ?? ''} — ${videos.length} video — ${String(d.analyzedAt ?? '').slice(0, 10)}`, '', BANNER, ''];
  if (videos.length) {
    L.push('| # | Video | Kênh | View | Tương tác | View/ngày | Mở đầu | Từ/phút |', '|---|---|---|---|---|---|---|---|');
    for (const [i, e] of videos.entries()) L.push(e.error ? `| ${i + 1} | ${titleOf(e)} | – | – | – | – | Lỗi: ${cell(e.error.message)} | – |` : `| ${i + 1} | ${titleOf(e)} | ${channelOf(e)} | ${n(e.row?.views)} | ${pct(e.row?.engagementRate)} | ${n(e.row?.viewsPerDay)} | ${cell(e.script?.hook).slice(0, 80) || '–'} | ${e.script?.wpm ?? '–'} |`);
    L.push('');
  }
  for (const [i, e] of videos.entries()) L.push(...videoSection(e, d.platform, `## ${i + 1}. ${titleOf(e)}`));
  return L.join('\n');
}

/** CSV of the compare table; each row is one entry of data.videos. */
export const VIDEO_ANALYSIS_COLS = [
  { label: 'Link', get: urlOf },
  { label: 'Caption', get: (e) => e.video?.caption ?? e.video?.title ?? '' },
  { label: 'Kênh', get: channelOf },
  { label: 'Ngày đăng', get: (e) => String(e.video?.createdAt ?? e.video?.publishedAt ?? '').slice(0, 10) },
  { label: 'Dài (giây)', get: (e) => e.video?.durationSec ?? '' },
  { label: 'View', get: (e) => e.row?.views ?? '' },
  { label: 'Like', get: (e) => e.video?.likes ?? '' },
  { label: 'Comment', get: (e) => e.video?.comments ?? '' },
  { label: 'Share', get: (e) => e.video?.shares ?? '' },
  { label: 'Save', get: (e) => e.video?.saves ?? '' },
  { label: metricLabel('engagementRate'), get: (e) => e.row?.engagementRate ?? '' },
  { label: metricLabel('viewsPerDay'), get: (e) => e.row?.viewsPerDay ?? '' },
  { label: 'Mở đầu', get: (e) => e.script?.hook ?? '' },
  { label: 'Số từ', get: (e) => e.script?.words ?? '' },
  { label: metricLabel('wordsPerMinute'), get: (e) => e.script?.wpm ?? '' },
  { label: 'Comment đã đọc', get: (e) => (e.error ? '' : e.comments?.length ?? 0) },
  { label: 'Ghi chú script', get: (e) => transcriptNoteText(e.transcriptNote) },
  { label: 'Lỗi', get: (e) => e.error?.message ?? '' },
];
```

- [ ] **Step 4: Nối vào route** (`src/http/routes/records.js`)

Thêm import cạnh các import report:

```js
import { videoAnalysisMarkdown, VIDEO_ANALYSIS_COLS } from '../../core/report/video-analysis.js';
```

Trong `exportRecord`, ngay sau dòng `const what = query.get('what');`:

```js
    const isVideoAnalysis = r.kind === 'tiktok_video_analysis' || r.kind === 'video_analysis';
    if (isVideoAnalysis && params.ext === 'md') {
      const raw1 = query.get('video');
      const only = raw1 == null ? undefined : Number(raw1);
      if (only !== undefined && !(Number.isInteger(only) && only >= 1 && only <= r.data.videos.length)) throw httpError('invalid_input', `phải là số từ 1 đến ${r.data.videos.length}`, 'video');
      const md = videoAnalysisMarkdown(r.data, { only });
      return query.get('inline') ? raw(md, 'text/markdown; charset=utf-8') : raw(md, 'text/markdown; charset=utf-8', attachment(`${name}${only ? `-video-${only}` : ''}.md`));
    }
```

Trong chuỗi `if / else if` dựng `csv`, thêm một nhánh **trước** nhánh cuối `else csv = toCsv(r.data.videos || [], VIDEO_COLS);`:

```js
    else if (isVideoAnalysis) csv = toCsv(r.data.videos, VIDEO_ANALYSIS_COLS);
```

- [ ] **Step 5: Chạy test, xác nhận pass**

Run: `npm test`
Expected: `fail 0`

- [ ] **Step 6: Commit**

```bash
git add src/core/report/video-analysis.js src/http/routes/records.js test/http/video-analysis-export.test.js
git commit -m "feat: export a video analysis as Markdown (batch or one video) and CSV"
```

---

### Task 7: Giao diện: component kết quả, màn `#/tiktok/video`, menu

**Files:**
- Create: `web/components/video-analysis.js`, `web/views/tiktok/video.js`
- Modify: `web/kinds.js`, `web/lib.js` (`LABELS`), `web/app.js` (mục menu), `web/styles.css`
- Test: `test/web-video-analysis.test.js` (kiểm tra tĩnh: màn có trong menu và trong bảng kinds)

**Interfaces:**
- Consumes (đã có trong `web/`): `runJob`, `watchJob`, `activeJob`, `progressCard`, `updateProgress`, `errorCallout`, `setUrl`, `store`, `persist`, `toast`, `esc`, `icon`, `fmt`, `dur`, `ago`, `emptyState`, `isSaved`, `toggleSave`, `metric` từ `web/lib.js`; `records` từ `web/http/client.js`; `historyList(el, {kind, path, title, empty})` từ `web/components/history-list.js`; `insightContext(rec, groups)`, `commentBrowser(box, ctx, {base, filters})` từ `web/components/insight-workspace.js`; `savedTikTokVideo(v)` từ `web/saved-items.js`; `scope()` từ `web/dom.js`.
- Produces: `videoAnalysis(box, {exportUrl: (ext, query?) => string}) → {show(rec): void, off(): void}`; route `#/tiktok/video` (`?id=`, `?videos=`, `&run=1`).

- [ ] **Step 1: Viết test tĩnh (đang fail)**

```js
// test/web-video-analysis.test.js
// The web UI has no DOM tests; this pins the wiring a refactor could silently drop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KINDS, recordHref, jobHref } from '../web/kinds.js';

test('video analysis is a known result kind that opens on its own screen', () => {
  assert.deepEqual(KINDS.tiktok_video_analysis, { label: 'Phân tích video', path: '/tiktok/video', icon: 'bars', platform: 'tiktok' });
  assert.equal(recordHref({ id: 7, kind: 'tiktok_video_analysis' }), '#/tiktok/video?id=7');
  assert.equal(jobHref({ kind: 'tiktok_video_analysis', status: 'running' }), '#/tiktok/video');
  assert.equal(jobHref({ kind: 'tiktok_video_analysis', status: 'succeeded', result: { id: 9 } }), '#/tiktok/video?id=9');
});

test('the screen is in the TikTok group of the sidebar and has a job label', () => {
  const app = fs.readFileSync('web/app.js', 'utf8');
  assert.match(app, /label: 'Phân tích video', tabs: \[\['\/tiktok\/video', 'Phân tích video', \(\) => import\('\.\/views\/tiktok\/video\.js'\)\]\]/);
  assert.match(fs.readFileSync('web/lib.js', 'utf8'), /tiktok_video_analysis: 'Phân tích video TikTok'/);
});

test('the result component never calls the server itself', () => {
  const src = fs.readFileSync('web/components/video-analysis.js', 'utf8');
  assert.ok(!/http\/client\.js/.test(src), 'components get data and callbacks; only views talk to the API');
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `node --disable-warning=ExperimentalWarning --test test/web-video-analysis.test.js`
Expected: FAIL (`KINDS.tiktok_video_analysis` là `undefined`)

- [ ] **Step 3: Bảng kinds, nhãn job, mục menu**

`web/kinds.js`: thêm vào `KINDS`, ngay sau dòng `tiktok_insight`:

```js
  tiktok_video_analysis: { label: 'Phân tích video', path: '/tiktok/video', icon: 'bars', platform: 'tiktok' },
```

`web/lib.js`: trong object `LABELS`, thêm `tiktok_video_analysis: 'Phân tích video TikTok', ` ngay sau `tiktok_topic: 'Tìm theo chủ đề TikTok', `.

`web/app.js`: trong nhóm `tiktok` của `GROUPS`, thêm một mục ngay sau mục `Insight khách hàng` (đợt 3 mới gỡ mục `Video & comment`):

```js
      { icon: 'bars', label: 'Phân tích video', tabs: [['/tiktok/video', 'Phân tích video', () => import('./views/tiktok/video.js')]] },
```

- [ ] **Step 4: Component kết quả** (`web/components/video-analysis.js`)

```js
// Result of a "Phân tích video" batch: the compare table on top, and under it the chosen video's
// script, comments and numbers. Gets the record and an export-link builder; never calls the server.
import { esc, icon, fmt, dur, emptyState, toast, isSaved, toggleSave, metric } from '../lib.js';
import { insightContext, commentBrowser } from './insight-workspace.js';
import { savedTikTokVideo } from '../saved-items.js';

const NOTES = { none: 'Video không có phụ đề', off: 'Không lấy script', setup: 'Chưa cài Chromium nên chưa lấy được script', changed: 'Nền tảng đã đổi giao diện, chưa đọc được script' };
const HOOK_SECONDS = 5;
const pct = (x) => (x == null ? '–' : `${(x * 100).toFixed(1).replace('.', ',')}%`);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '–');
const clock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const titleOf = (e) => e.video?.caption || e.video?.title || e.link;
const channelOf = (e) => (e.video?.author ? `@${e.video.author}` : e.video?.channelTitle || '');
const cover = (v) => (v?.cover ? `<img loading="lazy" src="${esc(v.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : '');

/** Sortable columns: [key, heading, value for sorting, cell HTML, platforms]. */
const COLS = [
  ['date', 'Đăng', (e) => Date.parse(e.video?.createdAt || e.video?.publishedAt || '') || 0, (e) => day(e.video?.createdAt || e.video?.publishedAt)],
  ['dur', 'Dài', (e) => e.video?.durationSec ?? -1, (e) => dur(e.video?.durationSec)],
  ['views', 'View', (e) => e.row?.views ?? -1, (e) => fmt(e.row?.views)],
  ['likes', 'Like', (e) => e.video?.likes ?? -1, (e) => fmt(e.video?.likes)],
  ['comments', 'Comment', (e) => e.video?.comments ?? -1, (e) => fmt(e.video?.comments)],
  ['shares', 'Share', (e) => e.video?.shares ?? -1, (e) => fmt(e.video?.shares), 'tiktok'],
  ['saves', 'Save', (e) => e.video?.saves ?? -1, (e) => fmt(e.video?.saves), 'tiktok'],
  ['er', 'Tương tác', (e) => e.row?.engagementRate ?? -1, (e) => pct(e.row?.engagementRate)],
  ['vpd', 'View/ngày', (e) => e.row?.viewsPerDay ?? -1, (e) => fmt(e.row?.viewsPerDay)],
  ['words', 'Số từ', (e) => e.script?.words ?? -1, (e) => (e.script ? fmt(e.script.words) : '–')],
  ['wpm', 'Từ/phút', (e) => e.script?.wpm ?? -1, (e) => e.script?.wpm ?? '–'],
  ['read', 'Cmt đã đọc', (e) => e.comments?.length ?? -1, (e) => fmt(e.comments?.length ?? 0)],
];
const TIPS = { er: 'engagementRate', vpd: 'viewsPerDay', wpm: 'wordsPerMinute' };

/**
 * @param {HTMLElement} box
 * @param {{exportUrl: (ext: string, query?: Record<string, any>) => string}} o
 * @returns {{show: (rec: any) => void, off: () => void}} show() may be called again as more videos of the batch finish
 */
export function videoAnalysis(box, { exportUrl }) {
  /** @type {any} */
  let rec = null;
  let sel = 0; // index in rec.data.videos
  let tab = 'script';
  let sort = { key: '', dir: -1 };
  let stamps = true;
  let find = '';
  /** @type {null | (() => void)} */
  let offTab = null;

  const entries = () => rec?.data.videos ?? [];
  const cols = () => COLS.filter((c) => !c[4] || c[4] === rec.data.platform);

  function table() {
    const list = entries().map((e, i) => ({ e, i }));
    const col = cols().find((c) => c[0] === sort.key);
    if (col) list.sort((a, b) => (col[2](a.e) - col[2](b.e)) * sort.dir);
    return `<div class="table-wrap"><table class="t va-table"><thead><tr><th>Video</th>
        ${cols().map((c) => `<th class="r ${sort.key === c[0] ? 'sorted' : ''}" data-sort="${c[0]}" ${TIPS[c[0]] ? `data-tip="${esc(metric(TIPS[c[0]]).formula)}"` : ''} role="button" tabindex="0">${c[1]}${sort.key === c[0] ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}
        <th>Mở đầu</th></tr></thead><tbody>
      ${list.map(({ e, i }) => (e.error
        ? `<tr class="va-row bad ${i === sel ? 'on' : ''}" data-row="${i}"><td><div class="va-vid"><span class="va-cover"></span><div><b>Video ${i + 1}</b><div class="small muted">${esc(e.link)}</div></div></div></td><td colspan="${cols().length + 1}" class="va-err">${esc(e.error.message)}</td></tr>`
        : `<tr class="va-row ${i === sel ? 'on' : ''}" data-row="${i}"><td><div class="va-vid"><span class="va-cover">${cover(e.video)}</span><div><b class="va-title">${esc(titleOf(e))}</b><div class="small muted">${esc(channelOf(e))}</div></div></div></td>
            ${cols().map((c) => `<td class="r num">${c[3](e)}</td>`).join('')}
            <td class="va-hook">${e.script ? esc(e.script.hook) : `<span class="muted">${esc(NOTES[e.transcriptNote] || '–')}</span>`}</td></tr>`)).join('')}
      </tbody></table></div>`;
  }

  function scriptTab(e) {
    if (!e.transcript) return `<div class="card-pad">${emptyState(NOTES[e.transcriptNote] || 'Không có script', e.transcriptNote === 'none' ? 'Video không có lời nói, hoặc nền tảng chưa tạo phụ đề cho video này.' : '')}</div>`;
    const q = fold(find);
    const segs = e.transcript.segments.filter((s) => !q || fold(s.text).includes(q));
    return `<div class="va-tools"><label class="tt-searchmini">${icon('search')}<input data-find placeholder="Tìm trong script" value="${esc(find)}"></label>
        <label class="check"><input type="checkbox" data-stamps ${stamps ? 'checked' : ''}> Hiện mốc thời gian</label><span class="spacer"></span>
        <span class="small muted">${e.transcript.kind === 'auto' ? 'Phụ đề tự động, có thể sai chữ' : 'Phụ đề do kênh đăng'}${e.transcript.language ? ` · ${esc(e.transcript.language)}` : ''} · ${fmt(e.script.words)} từ${e.script.wpm != null ? ` · ${e.script.wpm} từ/phút` : ''}</span>
        <button type="button" class="btn sm" data-copy>${icon('doc')} Chép script</button></div>
      <div class="va-script">${segs.length ? segs.map((s) => `<div class="va-seg ${s.start < HOOK_SECONDS ? 'hook' : ''}">${stamps ? `<span class="va-t">${clock(s.start)}</span>` : ''}<span>${esc(s.text)}</span>${s.start < HOOK_SECONDS && s === e.transcript.segments[0] ? '<span class="tag">Mở đầu</span>' : ''}</div>`).join('') : emptyState('Không có đoạn nào khớp')}</div>`;
  }

  function statsTab(e) {
    const v = e.video;
    const stat = (l, val) => `<div class="tt-dr-stat"><div class="l">${l}</div><div class="v">${val}</div></div>`;
    const tiktok = rec.data.platform === 'tiktok';
    return `<div class="card-pad"><div class="tt-dr-stats">
        ${stat('Lượt xem', fmt(e.row?.views))}${stat('Like', fmt(v.likes))}${stat('Comment', fmt(v.comments))}${tiktok ? stat('Share', fmt(v.shares)) + stat('Save', fmt(v.saves)) : ''}
        ${stat('Tỉ lệ tương tác', pct(e.row?.engagementRate))}${stat('View/ngày', fmt(e.row?.viewsPerDay))}${stat('Đăng', day(v.createdAt || v.publishedAt))}${stat('Độ dài', dur(v.durationSec))}</div>
      <div class="section-label">${tiktok ? 'Caption' : 'Mô tả'}</div><p class="va-desc">${esc(v.caption ?? v.description ?? '') || '<span class="muted">(trống)</span>'}</p>
      ${(v.hashtags ?? v.tags ?? []).length ? `<div>${(v.hashtags ?? v.tags).map((h) => `<span class="tag">${tiktok ? '#' : ''}${esc(h)}</span>`).join(' ')}</div>` : ''}
      ${v.musicTitle ? `<p class="small muted" style="margin-top:10px">Nhạc: ${esc(v.musicTitle)}</p>` : ''}</div>`;
  }

  function commentsTab(body, e) {
    if (e.commentsNote) return void (body.innerHTML = `<div class="card-pad"><div class="callout">Không lấy được comment của video này: ${esc(e.commentsNote)}</div></div>`);
    if (!e.comments.length) return void (body.innerHTML = `<div class="card-pad">${emptyState('Chưa đọc comment nào', rec.data.params.comments ? 'Video chưa có comment có chữ.' : 'Lần chạy này tắt phần comment.')}</div>`);
    // The comment browser of the insight report, fed with this one video (no record id: saved quotes must not link to an insight report).
    const ctx = insightContext({ id: undefined, title: titleOf(e), data: { comments: e.comments, videos: [{ ...e.video, rank: sel + 1 }], keywords: [] } }, e.groups);
    offTab = commentBrowser(body, ctx, { base: ctx.all, filters: ['topic'] }).off;
  }

  function detail() {
    const e = entries()[sel];
    if (!e) return '';
    if (e.error) return `<div class="card" style="margin-top:14px"><div class="card-pad"><div class="callout">Không phân tích được video này: ${esc(e.error.message)}<div class="small" style="margin-top:6px">${esc(e.link)}</div></div></div></div>`;
    const saved = rec.data.platform === 'tiktok' && isSaved('tiktok_video', e.video.id);
    return `<div class="card va-detail" style="margin-top:14px"><div class="card-head"><h3>${icon('play')} <span class="va-dtitle">${sel + 1}. ${esc(titleOf(e))}</span></h3>
        <div class="row"><a class="btn sm" href="${esc(e.video.url)}" target="_blank" rel="noopener">${icon('ext')} Mở video</a>
          ${rec.data.platform === 'tiktok' ? `<button type="button" class="btn sm ${saved ? 'on' : ''}" data-save>${icon('bookmark')} ${saved ? 'Đã lưu' : 'Lưu video'}</button>` : ''}
          <a class="btn sm" href="${exportUrl('md', { video: sel + 1 })}">${icon('download')} Markdown video này</a></div></div>
      <div class="tabs" role="tablist">${[['script', 'Script'], ['comments', `Comment (${e.comments.length})`], ['stats', 'Thông số']].map(([k, l]) => `<button type="button" role="tab" class="tab ${tab === k ? 'on' : ''}" aria-selected="${tab === k}" data-vtab="${k}">${l}</button>`).join('')}</div>
      <div data-vbody></div></div>`;
  }

  function fillTab() {
    offTab?.();
    offTab = null;
    const body = /** @type {HTMLElement|null} */ (box.querySelector('[data-vbody]'));
    const e = entries()[sel];
    if (!body || !e || e.error) return;
    if (tab === 'script') body.innerHTML = scriptTab(e);
    else if (tab === 'stats') body.innerHTML = statsTab(e);
    else commentsTab(body, e);
  }

  function render() {
    offTab?.();
    offTab = null;
    if (!rec) return void (box.innerHTML = '');
    const ok = entries().filter((e) => !e.error).length;
    box.innerHTML = `<div class="card"><div class="card-head"><h3>${icon('columns')} So sánh ${entries().length} video</h3>
        <div class="row"><span class="small muted">${ok < entries().length ? `${entries().length - ok} video lỗi · ` : ''}Bấm một dòng để xem chi tiết</span>
          <a class="btn sm" href="${exportUrl('md')}">${icon('download')} Markdown cả lô</a><a class="btn sm" href="${exportUrl('csv')}">${icon('download')} CSV</a></div></div>${table()}</div>${detail()}`;
    fillTab();
  }

  const onClick = async (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target);
    const sortBy = /** @type {HTMLElement|null} */ (t.closest('[data-sort]'));
    if (sortBy) {
      const key = String(sortBy.dataset.sort);
      const keep = entries()[sel];
      sort = { key, dir: sort.key === key ? -sort.dir : -1 };
      sel = Math.max(0, entries().indexOf(keep));
      return render();
    }
    const row = /** @type {HTMLElement|null} */ (t.closest('[data-row]'));
    if (row && !t.closest('a')) {
      sel = Number(row.dataset.row);
      find = '';
      return render();
    }
    const vt = /** @type {HTMLElement|null} */ (t.closest('[data-vtab]'));
    if (vt) {
      tab = String(vt.dataset.vtab);
      box.querySelectorAll('[data-vtab]').forEach((b) => (b.classList.toggle('on', b === vt), b.setAttribute('aria-selected', String(b === vt))));
      return fillTab();
    }
    const e = entries()[sel];
    if (t.closest('[data-copy]') && e?.transcript) {
      const text = e.transcript.segments.map((s) => (stamps ? `[${clock(s.start)}] ${s.text}` : s.text)).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        toast(`Đã chép script (${e.script.words} từ)`);
      } catch {
        toast('Trình duyệt không cho chép, thử lại', 'error');
      }
    } else if (t.closest('[data-save]') && e?.video) {
      const it = savedTikTokVideo(e.video);
      await toggleSave('tiktok_video', it.ref, it.title, it.data);
      render();
    }
  };
  const onInput = (ev) => {
    const t = /** @type {HTMLInputElement} */ (ev.target);
    if (t.matches('[data-find]')) {
      find = t.value;
      const at = t.selectionStart;
      fillTab();
      const again = /** @type {HTMLInputElement|null} */ (box.querySelector('[data-find]'));
      again?.focus();
      if (again && at != null) again.setSelectionRange(at, at);
    } else if (t.matches('[data-stamps]')) {
      stamps = t.checked;
      fillTab();
    }
  };
  const onKey = (ev) => {
    const th = /** @type {HTMLElement} */ (ev.target).closest?.('[data-sort]');
    if (th && (ev.key === 'Enter' || ev.key === ' ')) (ev.preventDefault(), /** @type {HTMLElement} */ (th).click());
  };
  box.addEventListener('click', onClick);
  box.addEventListener('input', onInput);
  box.addEventListener('keydown', onKey);

  return {
    show(r) {
      const first = !rec;
      rec = r;
      if (first) sel = Math.max(0, entries().findIndex((e) => !e.error));
      sel = Math.min(sel, Math.max(0, entries().length - 1));
      render();
    },
    off() {
      offTab?.();
      box.removeEventListener('click', onClick);
      box.removeEventListener('input', onInput);
      box.removeEventListener('keydown', onKey);
    },
  };
}
```

- [ ] **Step 5: View** (`web/views/tiktok/video.js`)

```js
// "Phân tích video" (TikTok): paste up to 10 links → numbers, script and comments of each, side by side.
import { records } from '../../http/client.js';
import { esc, icon, chips, bindChips, runJob, watchJob, activeJob, progressCard, updateProgress, errorCallout, toast, store, persist, setUrl, bindTips } from '../../lib.js';
import { scope } from '../../dom.js';
import { historyList } from '../../components/history-list.js';
import { videoAnalysis } from '../../components/video-analysis.js';

const KIND = 'tiktok_video_analysis';
const PATH = '/tiktok/video';
const MAX = 10;
const FORM = { videos: '', script: true, comments: 100, replies: true };
const TIKTOK = /^(https?:\/\/)?([a-z0-9-]+\.)*tiktok\.com\//i;
const YOUTUBE = /^(https?:\/\/)?([a-z0-9-]+\.)*(youtube\.com|youtu\.be)\//i;

/** Pasted text → what each line is. Duplicates (ignoring tracking parameters) count once. */
export function readLinks(text) {
  const seen = new Set();
  const ok = [];
  const other = [];
  const bad = [];
  for (const raw of String(text || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)) {
    const link = raw.replace(/[?#].*$/, '');
    if (seen.has(link)) continue;
    seen.add(link);
    if (TIKTOK.test(link) || /^\d{15,25}$/.test(link)) ok.push(link);
    else if (YOUTUBE.test(raw)) other.push(raw);
    else bad.push(raw);
  }
  return { ok, other, bad };
}

export async function mount(root, params) {
  const st = store('tt-video-form', FORM);
  if (params.videos) st.videos = params.videos;
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('bars')} Phân tích video (TikTok)</h1>
      <p>Dán link video TikTok để lấy thông số, script (lời thoại từ phụ đề) và comment của từng video, đặt cạnh nhau để so. Không cần đăng nhập TikTok.</p></div></div>
    <div class="card card-pad" data-form>
      <div class="field"><label for="va-links">Link video, mỗi dòng một link (tối đa ${MAX})</label>
        <textarea class="input" id="va-links" data-links rows="4" placeholder="https://www.tiktok.com/@kenh/video/7376610463154572560">${esc(st.videos)}</textarea>
        <div class="help" data-check></div></div>
      <div class="row" style="margin-top:12px">
        <label class="check"><input type="checkbox" data-k="script" ${st.script ? 'checked' : ''}> Lấy script</label>
        <span class="small muted" style="margin-left:14px">Comment mỗi video</span>${chips('comments', [0, 100, 300].map((v) => ({ v, label: v ? String(v) : 'Không lấy' })), st.comments)}
        <label class="check" data-replies-wrap><input type="checkbox" data-k="replies" ${st.replies ? 'checked' : ''}> Lấy cả trả lời</label>
      </div>
      <div class="row" style="margin-top:14px"><button type="button" class="btn primary lg" data-run>${icon('bars')} Phân tích</button><span class="muted small" data-eta></span></div>
    </div>
    <div data-prog style="margin-top:14px"></div>
    <div data-out style="margin-top:14px"></div>
    <div class="card" data-history style="margin-top:14px"></div>`;

  const shown = scope();
  const form = root.querySelector('[data-form]');
  const linksEl = /** @type {HTMLTextAreaElement} */ (root.querySelector('[data-links]'));
  const prog = /** @type {HTMLElement} */ (root.querySelector('[data-prog]'));
  const out = /** @type {HTMLElement} */ (root.querySelector('[data-out]'));
  const runBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-run]'));
  /** @type {number|string|null} */
  let shownId = null;
  const view = videoAnalysis(out, { exportUrl: (ext, query) => records.exportUrl(shownId, ext, query) });
  shown.add(view.off);
  shown.add(bindTips(out));
  const history = historyList(root.querySelector('[data-history]'), { kind: KIND, path: PATH, title: `${icon('clock')} Lần phân tích trước`, empty: 'Chưa phân tích video nào' });

  function check() {
    const r = readLinks(linksEl.value);
    const notes = [];
    if (r.other.length) notes.push(`<span class="va-warn">${r.other.length} link YouTube không chạy ở màn này.</span>`);
    if (r.bad.length) notes.push(`<span class="va-warn">Không nhận ra: ${esc(r.bad.slice(0, 3).join(', '))}${r.bad.length > 3 ? '…' : ''}</span>`);
    if (r.ok.length > MAX) notes.push(`<span class="va-warn">Đang có ${r.ok.length} link, thừa ${r.ok.length - MAX}. Tối đa ${MAX} mỗi lần.</span>`);
    root.querySelector('[data-check]').innerHTML = notes.join(' ') || (r.ok.length ? `${r.ok.length} link TikTok.` : 'Link dạng tiktok.com/@kênh/video/… hoặc link rút gọn vm.tiktok.com.');
    runBtn.disabled = !r.ok.length || r.ok.length > MAX;
    runBtn.innerHTML = `${icon('bars')} Phân tích${r.ok.length ? ` ${Math.min(r.ok.length, MAX)} video` : ''}`;
    const secs = r.ok.length * (10 + (st.comments ? (st.comments === 300 ? 25 : 10) : 0));
    root.querySelector('[data-eta]').textContent = r.ok.length ? `Dự kiến khoảng ${secs < 90 ? `${secs} giây` : `${Math.round(secs / 60)} phút`}` : '';
    /** @type {HTMLElement} */ (root.querySelector('[data-replies-wrap]')).hidden = !st.comments;
    return r;
  }
  const save = () => persist('tt-video-form', st);
  linksEl.addEventListener('input', () => ((st.videos = linksEl.value), save(), check()));
  bindChips(form, (n, v) => ((st[n] = Number(v)), save(), check()), { toggleOff: false });
  form.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => ((st[/** @type {HTMLElement} */ (el).dataset.k] = /** @type {HTMLInputElement} */ (el).checked), save())));

  /** Show a batch being analyzed (rows appear as videos finish), then the finished result. Also used when coming back mid-run. */
  async function follow(title, job) {
    prog.innerHTML = progressCard(title);
    let last = -1;
    try {
      const res = await job(async (p) => {
        updateProgress(prog, p);
        if (p?.recordId && p.done !== last) {
          last = p.done;
          const rec = await records.get(p.recordId).catch(() => null);
          if (rec) ((shownId = rec.id), view.show(rec));
        }
      });
      prog.innerHTML = '';
      await show(res.id);
      history();
    } catch (e) {
      prog.innerHTML = errorCallout(e);
    }
  }

  function run() {
    const r = check();
    if (!r.ok.length) return toast('Dán ít nhất một link TikTok', 'error');
    if (r.ok.length > MAX) return toast(`Tối đa ${MAX} video mỗi lần`, 'error');
    const body = { videos: r.ok.join('\n'), script: st.script, comments: st.comments, replies: st.replies };
    shownId = null;
    out.innerHTML = '';
    follow(`Đang phân tích ${r.ok.length} video`, (onProgress) => runJob(KIND, body, onProgress));
  }
  runBtn.addEventListener('click', run);

  async function show(id) {
    const rec = await records.get(id);
    setUrl(PATH, { id: rec.id }); // a reload or a copied link opens this result again
    shownId = rec.id;
    view.show(rec);
  }

  check();
  history();
  if (params.id) show(params.id).catch((e) => (out.innerHTML = errorCallout(e)));
  else if (params.videos && params.run) {
    setUrl(PATH); // started once: a reload must not start it again
    run();
  } else activeJob(KIND).then((live) => live && follow(`Đang phân tích: ${live.title}`, (onProgress) => watchJob(live.id, onProgress)));
  return () => shown.off();
}
```

Lưu ý cho người làm: `view.show()` được gọi nhiều lần trong lúc chạy; component giữ dòng đang chọn và tab đang mở qua các lần gọi (biến `sel`, `tab` nằm ngoài `render`).

- [ ] **Step 6: CSS** (`web/styles.css`, thêm ngay trước dòng `/* ---------- Lịch sử, Đã lưu ---------- */`)

```css
/* ---------- Phân tích video ---------- */
textarea.input { width: 100%; resize: vertical; font: inherit; line-height: 1.5; }
.va-warn { color: var(--bad); font-weight: 600; }
.va-table th[data-sort] { cursor: pointer; white-space: nowrap; user-select: none; }
.va-table th[data-sort]:focus-visible { outline: 2px solid var(--accent-line); outline-offset: -2px; }
.va-row { cursor: pointer; }
.va-row:hover td { background: var(--surface-2); }
.va-row.on td { background: var(--accent-soft); }
.va-row.on td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
.va-vid { display: flex; gap: 10px; align-items: center; min-width: 220px; max-width: 320px; }
.va-cover { width: 36px; height: 48px; flex: none; border-radius: 5px; background: var(--line); overflow: hidden; position: relative; }
.va-cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.va-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-weight: 600; }
.va-hook { min-width: 220px; max-width: 360px; font-size: 13px; }
.va-err { color: var(--bad); }
.va-dtitle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 52ch; display: inline-block; vertical-align: bottom; }
.va-tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.va-script { padding: 10px 16px 16px; max-height: 560px; overflow-y: auto; }
.va-seg { display: flex; gap: 12px; align-items: baseline; padding: 5px 8px; border-radius: 6px; line-height: 1.5; }
.va-seg.hook { background: var(--accent-soft); }
.va-t { flex: none; width: 48px; font: 12px var(--mono); color: var(--muted); font-variant-numeric: tabular-nums; }
.va-desc { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 0 10px; }
```

- [ ] **Step 7: Chạy test, xác nhận pass**

Run: `npm test`
Expected: `fail 0`

- [ ] **Step 8: Commit**

```bash
git add web/components/video-analysis.js web/views/tiktok/video.js web/kinds.js web/lib.js web/app.js web/styles.css test/web-video-analysis.test.js
git commit -m "feat(web): Phân tích video (TikTok) — compare table, script, comments and numbers per video"
```

---

### Task 8: Phép thử sống, tài liệu, kiểm tra tay

**Files:**
- Modify: `scripts/probe.js`, `docs/ARCHITECTURE.md`, `README.md`

**Interfaces:**
- Consumes: `tt.getVideo` (Task 4), màn `#/tiktok/video` (Task 7).
- Produces: `npm run probe` có thêm dòng `tiktok-video`; tài liệu nhắc tính năng mới.

- [ ] **Step 1: Phép thử sống** (`scripts/probe.js`)

Thêm một phần tử vào mảng `checks`, ngay sau dòng `['tiktok-comments', …]`:

```js
  ['tiktok-video', async () => { const r = await tt.getVideo('https://www.tiktok.com/@monica.chuyengiaditru/video/7662369308550401287'); return r.video.plays > 0 && !!r.video.author && (r.transcript === null || r.transcript.segments.length > 0); }],
```

- [ ] **Step 2: Chạy phép thử sống (cần mạng)**

Run: `npm run probe`
Expected: có dòng `✔ tiktok-video`. Nếu `✖ tiktok-video` kèm "TikTok chặn trang video này": chạy lại sau một phút; nếu vẫn lỗi thì dừng và báo lại, không sửa parser theo phỏng đoán.

- [ ] **Step 3: Tài liệu**

`docs/ARCHITECTURE.md`, trong cây thư mục ở §3:
- dưới dòng `analysis/` của `core/`, thêm dòng: `    video/                # transcript.js (đọc WebVTT, hook, số từ, từ/phút), metrics.js (dòng số liệu một video); dùng chung TikTok và YouTube`
- trong dòng `report/`, thêm `, video-analysis.js (Markdown/CSV của Phân tích video)` trước dấu chấm kết.
- trong dòng `tiktok/` của `sources/`, thêm `, video.js (một video theo link: thông số + phụ đề, không trình duyệt)`.
- trong dòng `tiktok/` của `features/`, thêm `, video-analysis.js (Phân tích video)`; và thêm một dòng mới ngay trên nó: `    shared-video-analysis.js # khung chạy lô của Phân tích video, dùng chung hai nền tảng`.
- trong dòng `tiktok/` của `web/views/`, thêm `, video.js`.

`README.md`: trong bảng "Lấy dữ liệu thế nào", thêm một dòng cuối bảng:

```markdown
| Thông số + script một video TikTok | trang của video (JSON nhúng) + file phụ đề WebVTT | Không đăng nhập. Script là phụ đề tự động của TikTok; video không có phụ đề thì không có script |
```

- [ ] **Step 4: Kiểm tra tay trên bản sao dữ liệu**

Không bao giờ khởi động server trên `data/` thật. Làm đúng thứ tự:

```bash
curl -s -m 3 localhost:5178/api/v1/jobs
```

(Chỉ để biết app thật có job đang chạy không; không khởi động lại nó.)

```bash
mkdir -p data/preview && rm -f data/preview/research.db data/preview/research.db-wal data/preview/research.db-shm && sqlite3 data/research.db "VACUUM INTO 'data/preview/research.db'"
```

Ghi tạm `.claude/launch.json` thành một cấu hình duy nhất tên `preview-copy`: `runtimeExecutable: "env"`, `runtimeArgs: ["YTR_DATA_DIR=<repo>/data/preview", "PORT=5191", "node", "--disable-warning=ExperimentalWarning", "src/main.js"]`, `port: 5191`, `autoPort: false`. Mở bằng công cụ preview, xác nhận tên cấu hình trả về là `preview-copy`.

Mở `http://localhost:5191/#/tiktok/video` và kiểm:
1. Dán 3 link TikTok thật (lấy từ một báo cáo Tìm theo chủ đề trong Lịch sử), cộng một link YouTube và một dòng chữ bất kỳ: dòng trợ giúp báo đúng 1 link YouTube và 1 dòng không nhận ra; nút ghi "Phân tích 3 video".
2. Bấm chạy: bảng hiện từng dòng khi mỗi video xong; chạy xong URL có `?id=`.
3. Bấm tiêu đề cột "View": bảng xếp lại, dòng đang chọn vẫn là video cũ.
4. Tab Script: đoạn trước giây 5 được tô; gõ vào ô tìm thì lọc và không mất con trỏ; bỏ tích "Hiện mốc thời gian"; bấm "Chép script".
5. Tab Comment: lọc theo nhóm, tích hai comment, bấm Lưu; mở Đã lưu thấy hai câu.
6. Bấm "Markdown cả lô" và "CSV": hai file tải về, mở ra đúng nội dung.
7. Chạy một lô 5 video, sang màn khác giữa chừng rồi quay lại: thẻ tiến trình và các dòng đã xong hiện lại (Review Focus 5).
8. Tải lại trang ở `?id=`: kết quả vẫn còn.

Xong thì dọn:

```bash
git checkout .claude/launch.json && rm -f data/preview/research.db data/preview/research.db-wal data/preview/research.db-shm; rmdir data/preview
```

- [ ] **Step 5: Chạy toàn bộ test**

Run: `npm test`
Expected: `fail 0`

- [ ] **Step 6: Commit**

```bash
git add scripts/probe.js docs/ARCHITECTURE.md README.md
git commit -m "docs: video analysis in the architecture map and README; live probe for a TikTok video page"
```

---

## Sau đợt 1

- Gộp nhánh vào `main` (merge `--no-ff`, theo quy ước của repo).
- Viết plan đợt 2 (YouTube: `sources/browser/` dùng chung, `getTranscript`, màn `#/video` dùng lại `web/components/video-analysis.js` và `features/shared-video-analysis.js`), rồi plan đợt 3 (gỡ bốn màn cũ, đổi các nút ở màn khác).
