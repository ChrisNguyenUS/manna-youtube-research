# Consolidate the app (phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A menu organised by job instead of by platform, and one "Phân tích video" screen that takes TikTok and YouTube links in the same box, including YouTube video analysis, which does not exist yet.

**Architecture:** The sidebar data moves out of `web/app.js` into a pure module (`web/nav.js`) that also knows which screens are platform variants of the same job; `app.js` only renders it. YouTube video analysis reuses the batch loop both platforms were designed to share (`features/shared-video-analysis.js`) and the existing result component. Link parsing for the merged screen is a pure module tested in Node. YouTube transcripts are read from the watch page with a hidden Chromium, behind one new port method, as the last and separable task.

**Tech Stack:** Node ES modules, JSDoc + `tsc --checkJs`, `node:test`. Web: plain ES modules, no build. Playwright (already an optional dependency) for Task 4 only. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-consolidate-app-design.md` (and `docs/superpowers/specs/2026-11-13-video-analysis-design.md` §5.2 for the YouTube transcript approach).

## Global Constraints

- No new npm dependencies. Layer rules of `docs/ARCHITECTURE.md` hold; `test/arch.test.js` must pass.
- Run tests with `npm test`. One file: `node --disable-warning=ExperimentalWarning --test test/path/file.test.js`. Always pass files or quoted globs to `--test`, never a bare directory.
- Never start a server on the real `data/` folder. Browser checks use `preview-5w1h` in `.claude/launch.json` (data in `/tmp/ytr-5w1h-preview`, port 5199).
- No screen path changes except: `#/tiktok/video` becomes an alias of `#/video`. Every other existing path keeps working and keeps its screen.
- No job is renamed, no stored data is changed. Job kinds: `tiktok_video_analysis` (exists), `video_analysis` (new, YouTube).
- At most 10 links per platform per run. One platform per job; mixed links run as two jobs, one after the other.
- Platform detection: `tiktok.com` hosts and bare ids of 15–25 digits are TikTok; `youtube.com`, `youtu.be` hosts and bare 11-character ids (`[A-Za-z0-9_-]{11}`) are YouTube.
- User-facing text is Vietnamese exactly as written here. Code comments are English. Every server- or user-provided string goes through `esc()` before entering HTML.
- Commit after every task. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A saved link or bookmark to any old screen** (`#/channel?id=12`, `#/tiktok/video?videos=…`, `#/compare`). Expected: it opens the same screen, the right sidebar entry is highlighted and the platform switch stands on that screen's platform. Test in Task 1 (every legacy path) and Task 3 (alias keeps the query).
2. **A YouTube link with a query string** (`watch?v=ID&t=30s`, `youtu.be/ID?si=…`, `/shorts/ID`). Expected: the id survives; the shared loop's "strip the query" rule for TikTok links must not eat `?v=`. Test in Task 2.
3. **A pasted list mixing both platforms, duplicates, and lines that are neither.** Expected: each platform gets its own list, duplicates are named, junk lines are named, and nothing junk is sent. Test in Task 3.
4. **One platform's job fails while the other succeeds.** Expected: the successful result stays on screen and the failure is shown in its own block. Browser check in Task 3.
5. **YouTube's transcript panel is missing, changed, or Chromium is not installed.** Expected: numbers and comments are still saved, with a note saying why there is no script. Test in Task 4.

---

## File structure

| File | Responsibility |
|---|---|
| `web/nav.js` (new) | sidebar data, platform variants, aliases, pure lookups |
| `web/app.js` (modify) | renders the sidebar, tab bar and platform switch from `web/nav.js` |
| `web/video-links.js` (new) | pasted text → links per platform (pure) |
| `web/views/video.js` (new) | the merged "Phân tích video" screen |
| `web/views/tiktok/video.js` (delete) | replaced by the merged screen |
| `src/features/video-analysis.js` (new) | job `video_analysis` (YouTube) |
| `src/features/shared-video-analysis.js` (modify) | per-platform link parsing |
| `src/features/tiktok/video-analysis.js` (modify) | history lists both kinds |
| `src/sources/browser/chromium.js` (new) | how Chromium is loaded and presented, shared by both sources |
| `src/sources/innertube/transcript.js` (new) | read the transcript panel of a watch page |
| `src/ports/youtube-source.js`, `src/sources/innertube/index.js`, `src/sources/fake/index.js` (modify) | `getTranscript` |

---

### Task 1: Menu by job, platform switch

**Files:**
- Create: `web/nav.js`
- Modify: `web/app.js`, `web/styles.css`, `test/web-soulprint.test.js`, `test/web-five-w.test.js`, `test/web-video-analysis.test.js`
- Test: `test/web-nav.test.js`

**Interfaces:**
- Produces (from `web/nav.js`): `HOME`, `SOULPRINT`, `GROUPS`, `ITEMS`, `ALIASES`, `PLATFORM_LABELS`, `allTabs(item) → Tab[]`, `has(item, path) → boolean`, `platformOf(item, path) → 'tiktok'|'youtube'|null`, `tabsFor(item, path) → Tab[]`, `firstPath(item, platform?) → string`, `findItem(path) → Item`
- `Item = {icon, label, tabs?: Tab[], platforms?: {tiktok: Tab[], youtube: Tab[]}, only?: 'tiktok'|'youtube'}`; `Tab = [path, label, loader]`

- [ ] **Step 1: Write the failing test**

`test/web-nav.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOME, SOULPRINT, GROUPS, ITEMS, ALIASES, allTabs, has, platformOf, tabsFor, firstPath, findItem } from '../web/nav.js';

const LEGACY = ['/', '/soulprint', '/tiktok/topic', '/tiktok/search', '/tiktok/insight', '/tiktok/insight/collected', '/tiktok/video', '/tiktok/channel', '/tiktok/comments', '/tiktok/5w1h',
  '/research', '/videos', '/comments', '/channels', '/channel', '/compare', '/keywords', '/ideas', '/follows', '/history', '/saved', '/settings'];
const item = (label) => ITEMS.find((it) => it.label === label);

test('groups are jobs, in this order, and the sidebar has thirteen entries', () => {
  assert.deepEqual(GROUPS.map((g) => [g.key, g.title, g.items.map((it) => it.label)]), [
    ['find', 'Tìm', ['Chủ đề', 'Từ khoá', 'Theo dõi']],
    ['dissect', 'Mổ xẻ', ['Phân tích video', 'Phân tích kênh']],
    ['audience', 'Khán giả', ['Bình luận', 'Insight', '5W1H']],
    ['library', 'Lưu trữ', ['Lịch sử', 'Đã lưu', 'Cài đặt']],
  ]);
  assert.deepEqual(ITEMS.slice(0, 2), [HOME, SOULPRINT]);
  assert.equal(ITEMS.length, 13);
});

test('every old path still belongs to exactly one entry, and no path is listed twice (Review Focus #1)', () => {
  const paths = ITEMS.flatMap((it) => allTabs(it).map((t) => t[0]));
  assert.equal(new Set(paths).size, paths.length);
  for (const p of LEGACY) assert.equal(ITEMS.filter((it) => has(it, p)).length, 1, p);
  assert.deepEqual([...paths].sort(), [...LEGACY].sort());
  for (const it of ITEMS) for (const t of allTabs(it)) assert.equal(typeof t[2], 'function', t[0]);
});

test('entries with a version per platform hold the right screens; single-platform entries say which', () => {
  const paths = (tabs) => tabs.map((t) => t[0]);
  assert.deepEqual([paths(item('Chủ đề').platforms.tiktok), paths(item('Chủ đề').platforms.youtube)], [['/tiktok/topic', '/tiktok/search'], ['/research', '/videos', '/channels']]);
  assert.deepEqual([paths(item('Phân tích kênh').platforms.tiktok), paths(item('Phân tích kênh').platforms.youtube)], [['/tiktok/channel'], ['/channel', '/compare']]);
  assert.deepEqual([paths(item('Bình luận').platforms.tiktok), paths(item('Bình luận').platforms.youtube)], [['/tiktok/comments'], ['/comments']]);
  assert.deepEqual([item('Từ khoá').only, item('Insight').only, item('5W1H').only, item('Theo dõi').only], ['youtube', 'tiktok', 'tiktok', undefined]);
  assert.ok(!item('Phân tích video').platforms, 'one screen for both platforms');
});

test('lookups: the platform of a path, the tabs to show for it, where an entry opens', () => {
  const ch = item('Phân tích kênh');
  assert.deepEqual([platformOf(ch, '/compare'), platformOf(ch, '/tiktok/channel'), platformOf(item('Theo dõi'), '/follows')], ['youtube', 'tiktok', null]);
  assert.deepEqual(tabsFor(ch, '/compare').map((t) => t[0]), ['/channel', '/compare']);
  assert.deepEqual(tabsFor(item('Từ khoá'), '/ideas').map((t) => t[0]), ['/keywords', '/ideas']);
  assert.deepEqual([firstPath(ch), firstPath(ch, 'youtube'), firstPath(ch, 'nope'), firstPath(item('Theo dõi'), 'youtube')], ['/tiktok/channel', '/channel', '/tiktok/channel', '/follows']);
  assert.equal(findItem('/compare'), ch);
  assert.equal(findItem('/khong-co'), HOME);
  assert.deepEqual(ALIASES, {});
});
```

Update the three tests that read `web/app.js` for sidebar data so they read `web/nav.js` instead (same intent, new home):
- `test/web-soulprint.test.js`: read `web/nav.js` for the `const SOULPRINT = …` regex (the constant becomes `export const SOULPRINT = …`, so make the regex start at `const SOULPRINT`), and for `ITEMS`: `/export const ITEMS = \[HOME, SOULPRINT, /`. Keep reading `web/app.js` for `navItem(HOME, path) +\s*navItem(SOULPRINT, path)`.
- `test/web-five-w.test.js`: read `web/nav.js` for the `['/tiktok/5w1h', '5W1H (AI)', …]` tuple.
- `test/web-video-analysis.test.js`: read `web/nav.js` and match `/label: 'Phân tích video', tabs: \[\['\/tiktok\/video', 'Phân tích video', \(\) => import\('\.\/views\/tiktok\/video\.js'\)\]\]/` (unchanged tuple; Task 3 changes it).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/web-nav.test.js`
Expected: FAIL, "Cannot find module … web/nav.js".

- [ ] **Step 3: The sidebar data**

`web/nav.js`:

```js
// The sidebar, as data. One entry per job to be done; screens that work on the same thing share an entry and show
// as tabs above the page. An entry whose job exists on both platforms lists its screens per platform (`platforms`),
// and the page shows a TikTok | YouTube switch; `only` marks an entry that exists on one platform. No DOM here.

/**
 * @typedef {[string, string, () => Promise<any>]} Tab  [path, tab label, loader of its screen]
 * @typedef {{icon: string, label: string, tabs?: Tab[], platforms?: {tiktok: Tab[], youtube: Tab[]}, only?: 'tiktok'|'youtube'}} Item
 */

export const PLATFORM_LABELS = { tiktok: 'TikTok', youtube: 'YouTube' };

/** @type {Item} */
export const HOME = { icon: 'home', label: 'Tổng quan', tabs: [['/', 'Tổng quan', () => import('./views/dashboard.js')]] };
/** @type {Item} */
export const SOULPRINT = { icon: 'target', label: 'Soulprint', tabs: [['/soulprint', 'Soulprint', () => import('./views/soulprint.js')]] };

/** @type {{key: string, title: string, items: Item[]}[]} */
export const GROUPS = [
  {
    key: 'find', title: 'Tìm',
    items: [
      {
        icon: 'compass', label: 'Chủ đề',
        platforms: {
          tiktok: [
            ['/tiktok/topic', 'Tìm theo chủ đề', () => import('./views/tiktok/topic.js')],
            ['/tiktok/search', 'Tìm video', () => import('./views/tiktok/search.js')],
          ],
          youtube: [
            ['/research', 'Nghiên cứu chủ đề', () => import('./views/research.js')],
            ['/videos', 'Tìm video', () => import('./views/videos.js')],
            ['/channels', 'Tìm kênh', () => import('./views/channels.js')],
          ],
        },
      },
      {
        icon: 'key', label: 'Từ khoá', only: 'youtube',
        tabs: [
          ['/keywords', 'Gợi ý từ khoá', () => import('./views/keywords.js')],
          ['/ideas', 'Chấm điểm từ khoá', () => import('./views/ideas.js')],
        ],
      },
      { icon: 'eye', label: 'Theo dõi', tabs: [['/follows', 'Kênh đang theo dõi', () => import('./views/follows.js')]] },
    ],
  },
  {
    key: 'dissect', title: 'Mổ xẻ',
    items: [
      { icon: 'bars', label: 'Phân tích video', tabs: [['/tiktok/video', 'Phân tích video', () => import('./views/tiktok/video.js')]] },
      {
        icon: 'users', label: 'Phân tích kênh',
        platforms: {
          tiktok: [['/tiktok/channel', 'Phân tích kênh', () => import('./views/tiktok/channel.js')]],
          youtube: [
            ['/channel', 'Phân tích kênh', () => import('./views/channel.js')],
            ['/compare', 'So sánh kênh', () => import('./views/compare.js')],
          ],
        },
      },
    ],
  },
  {
    key: 'audience', title: 'Khán giả',
    items: [
      {
        icon: 'message', label: 'Bình luận',
        platforms: {
          tiktok: [['/tiktok/comments', 'Thu thập bình luận', () => import('./views/tiktok/comments.js')]],
          youtube: [['/comments', 'Lấy comment', () => import('./views/comments.js')]],
        },
      },
      {
        icon: 'target', label: 'Insight', only: 'tiktok',
        tabs: [
          ['/tiktok/insight', 'Theo từ khoá', () => import('./views/tiktok/insight.js')],
          ['/tiktok/insight/collected', 'Từ comment đã có', () => import('./views/tiktok/insight-collected.js')],
        ],
      },
      { icon: 'bolt', label: '5W1H', only: 'tiktok', tabs: [['/tiktok/5w1h', '5W1H (AI)', () => import('./views/tiktok/five-w.js')]] },
    ],
  },
  {
    key: 'library', title: 'Lưu trữ',
    items: [
      { icon: 'clock', label: 'Lịch sử', tabs: [['/history', 'Lịch sử', () => import('./views/history.js')]] },
      { icon: 'bookmark', label: 'Đã lưu', tabs: [['/saved', 'Đã lưu', () => import('./views/saved.js')]] },
      { icon: 'settings', label: 'Cài đặt', tabs: [['/settings', 'Cài đặt', () => import('./views/settings.js')]] },
    ],
  },
];

export const ITEMS = [HOME, SOULPRINT, ...GROUPS.flatMap((g) => g.items)];

/** Old paths that now open another screen (the query string is kept). @type {Record<string, string>} */
export const ALIASES = {};

/** Every screen of an entry, whatever the platform. @param {Item} item @returns {Tab[]} */
export const allTabs = (item) => (item.platforms ? [...item.platforms.tiktok, ...item.platforms.youtube] : item.tabs ?? []);
/** @param {Item} item @param {string} path */
export const has = (item, path) => allTabs(item).some((t) => t[0] === path);
/** The platform a screen belongs to inside an entry that has both; null for entries without the switch. @param {Item} item @param {string} path */
export const platformOf = (item, path) => (!item.platforms ? null : item.platforms.youtube.some((t) => t[0] === path) ? 'youtube' : 'tiktok');
/** The tabs shown above a screen: its platform's screens, or all of the entry's. @param {Item} item @param {string} path @returns {Tab[]} */
export const tabsFor = (item, path) => (item.platforms ? item.platforms[platformOf(item, path) ?? 'tiktok'] : item.tabs ?? []);
/** Where the sidebar link of an entry leads: the first screen of the remembered platform. @param {Item} item @param {string} [platform] */
export const firstPath = (item, platform) => (item.platforms ? (item.platforms[platform === 'youtube' ? 'youtube' : 'tiktok'][0] ?? item.platforms.tiktok[0])[0] : (item.tabs ?? [])[0][0]);
/** The entry a path belongs to; unknown paths open Tổng quan. @param {string} path */
export const findItem = (path) => ITEMS.find((it) => has(it, path)) || HOME;
```

Check `web/lib.js` `icon()` for the name `bolt`; if it does not exist, use the closest existing icon for the 5W1H entry.

- [ ] **Step 4: Render it**

`web/app.js`:
1. Delete the `Tab`/`Item` typedef comment, `HOME`, `SOULPRINT`, `GROUPS`, `ITEMS` and `has`. Import instead:

```js
import { HOME, SOULPRINT, GROUPS, ALIASES, PLATFORM_LABELS, has, platformOf, tabsFor, firstPath, findItem } from './nav.js';
```

2. `NAV_STATE` gains the remembered platform per entry: `const NAV_STATE = { collapsed: {}, platform: {} };`
3. `navItem` links to the remembered platform's first screen:

```js
const navItem = (it, path) => `<a class="nav-item ${has(it, path) ? 'active' : ''}" href="#${firstPath(it, store('nav', NAV_STATE).platform?.[it.label])}" ${has(it, path) ? 'aria-current="page"' : ''}>${icon(it.icon)}<span>${esc(it.label)}</span></a>`;
```

4. In `route()`, replace the first lines up to and including the `const tabs = …` line with:

```js
  const { path, params } = parseHash();
  if (ALIASES[path]) {
    const qs = new URLSearchParams(params).toString();
    return void location.replace('#' + ALIASES[path] + (qs ? '?' + qs : ''));
  }
  const item = findItem(path);
  const shown = tabsFor(item, path);
  const tab = shown.find((t) => t[0] === path) || shown[0];
  const platform = platformOf(item, tab[0]);
  if (platform) {
    const st = store('nav', NAV_STATE);
    if (st.platform?.[item.label] !== platform) persist('nav', { ...st, platform: { ...st.platform, [item.label]: platform } });
  }
  renderNav(tab[0]);
  const main = document.getElementById('main');
  unmount?.(); // let the previous view remove its listeners
  leaveView(); // its job watchers stop; the jobs themselves keep running
  unmount = null;
  main.scrollTop = 0;
  // Above the page: the TikTok | YouTube switch of an entry that exists on both, then the tabs of the screens that
  // share the entry. An entry that exists on one platform says which.
  const platformSwitch = platform
    ? `<div class="page-plat" role="group" aria-label="Nền tảng">${Object.entries(PLATFORM_LABELS).map(([k, l]) => `<a href="#${firstPath(item, k)}" class="${k === platform ? 'on' : ''}" ${k === platform ? 'aria-current="true"' : ''}>${l}</a>`).join('')}</div>`
    : item.only ? `<span class="page-plat-only">${PLATFORM_LABELS[item.only]}</span>` : '';
  const tabLinks = shown.length > 1 ? `<nav class="page-tabs" aria-label="${esc(item.label)}">${shown.map((t) => `<a href="#${t[0]}" class="${t === tab ? 'on' : ''}" ${t === tab ? 'aria-current="page"' : ''}>${esc(t[1])}</a>`).join('')}</nav>` : '';
  const tabs = platformSwitch || tabLinks ? `<div class="page-tabs-wrap">${platformSwitch}${tabLinks}</div>` : '';
```

(Keep the existing `main.innerHTML = \`${tabs}<div class="page"></div>\`` line and everything after it. Read the current `const tabs = …` line first: if the `<nav class="page-tabs">` markup there has more attributes or a closing structure different from the snippet above, keep the existing markup for `tabLinks` and only add the switch.)

5. Saved sidebar state from before this change has group keys `tiktok` and `youtube`; they match no group now and are ignored. No migration.

`web/styles.css`: append

```css
/* TikTok | YouTube switch of a sidebar entry that exists on both platforms */
.page-tabs-wrap { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.page-plat { display: inline-flex; padding: 3px; gap: 2px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); }
.page-plat a { padding: 5px 14px; border-radius: calc(var(--radius-sm) - 2px); color: var(--text-2); text-decoration: none; font-size: 13.5px; font-weight: 600; }
.page-plat a.on { background: var(--surface); color: var(--text); box-shadow: 0 0 0 1px var(--line); }
.page-plat-only { font-size: 12px; color: var(--muted); border: 1px solid var(--line); border-radius: 10px; padding: 2px 9px; }
```

(Read the existing `.page-tabs-wrap` rule first; if it already sets `display`, merge instead of overriding, and check the tab bar still looks right with one row.)

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/nav.js web/app.js web/styles.css test/web-nav.test.js test/web-soulprint.test.js test/web-five-w.test.js test/web-video-analysis.test.js
git commit -m "feat(web): sidebar by job with a TikTok | YouTube switch"
```

- [ ] **Step 7: Browser check (done by the controller)**

On `preview-5w1h`: every sidebar entry opens; Chủ đề, Phân tích kênh and Bình luận show the switch and remember the last platform after going elsewhere and back; `#/compare` opened directly highlights Phân tích kênh with the switch on YouTube; Từ khoá, Insight and 5W1H show the platform label; no console errors; at 900 px the switch and tabs wrap without page-wide scroll.

---

### Task 2: YouTube video analysis (numbers and comments)

**Files:**
- Create: `src/features/video-analysis.js`
- Modify: `src/features/shared-video-analysis.js`, `src/features/tiktok/video-analysis.js` (history), `src/app.js`, `src/http/routes/jobs.js`, `src/core/report/video-analysis.js` (one note), `web/components/video-analysis.js` (one note)
- Test: `test/features/video-analysis.test.js`, append to `test/http/video-analysis-export.test.js`

**Interfaces:**
- Consumes: `makeVideoAnalysisRunner({kind, platform, records, now, fetchVideo, fetchComments, titleOf})`; `source.getVideo(id, {likes: true})`; `source.getComments(id, {max, sort, replies}, onProgress) → {comments, disabled}`.
- Produces:
  - `makeVideoAnalysisRunner` accepts `parseLinks?: (videos) => string[]` (default: the existing `linksOf`)
  - `youtubeIdOf(link) → string|null`, `youtubeLinksOf(videos) → string[]`, `makeYouTubeVideoAnalysis({source, records, now}) → (params, progress) => Promise<{id}>` from `src/features/video-analysis.js`
  - job kind `video_analysis`, body `{videos: string, script?: bool, comments?: 0|100|300, replies?: bool}`; record kind `video_analysis`, same data shape as TikTok's with `platform: 'youtube'`
  - each entry's `video` has `id`, `url` (`https://www.youtube.com/watch?v=ID`), `cover`, plus what `getVideo` returns; `transcriptNote: 'unsupported'` until Task 4
  - `makeVideoAnalysisHistory` lists both kinds; each row gains `platform`

- [ ] **Step 1: Write the failing tests**

`test/features/video-analysis.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { youtubeIdOf, youtubeLinksOf } from '../../src/features/video-analysis.js';

const A = 'dQw4w9WgXcQ';
const B = 'abcdefghi_-';

test('the id survives every link shape, with or without a query string (Review Focus #2)', () => {
  for (const link of [`https://www.youtube.com/watch?v=${A}`, `https://www.youtube.com/watch?v=${A}&t=30s`, `https://www.youtube.com/watch?feature=share&v=${A}`, `https://youtu.be/${A}?si=xyz`,
    `https://www.youtube.com/shorts/${A}`, `https://www.youtube.com/shorts/${A}?feature=share`, `https://m.youtube.com/watch?v=${A}`, `https://www.youtube.com/embed/${A}`, `https://www.youtube.com/live/${A}`, A]) {
    assert.equal(youtubeIdOf(link), A, link);
  }
  for (const junk of ['https://www.tiktok.com/@a/video/7000000000000000001', 'https://www.youtube.com/@kenh', 'xin chào', '']) assert.equal(youtubeIdOf(junk), null, junk);
  assert.deepEqual(youtubeLinksOf(`https://youtu.be/${A}?si=1\nhttps://www.youtube.com/watch?v=${A}&t=5\n ${B} , không phải link`), [`https://www.youtube.com/watch?v=${A}`, `https://www.youtube.com/watch?v=${B}`, 'không phải link']);
});

test('a YouTube batch: numbers and comments per video, one record, no script yet', async () => {
  const a = testApp();
  const steps = [];
  const { id } = await a.features.videoAnalysis({ videos: `https://youtu.be/${A}?si=1\nhttps://www.youtube.com/shorts/${B}`, comments: 100 }, (p) => steps.push(p.step));
  const rec = a.store.records.get(a.ws, id);
  assert.equal(rec.kind, 'video_analysis');
  assert.deepEqual([rec.data.platform, rec.data.videos.length], ['youtube', 2]);
  const e = rec.data.videos[0];
  assert.deepEqual([e.video.id, e.video.url, e.video.cover], [A, `https://www.youtube.com/watch?v=${A}`, `https://i.ytimg.com/vi/${A}/hqdefault.jpg`]);
  assert.deepEqual([e.transcript, e.transcriptNote, e.script], [null, 'unsupported', null]);
  assert.equal(e.row.views, 1);
  assert.deepEqual(e.comments.map((c) => [c.id, c.videoId]), [['c1', A]]);
  assert.equal(e.error, undefined);
  assert.ok(steps.some((s) => /Video 2\/2/.test(s)));
});

test('a line that is not a YouTube video becomes a row with its reason; more than 10 is refused; comments can be turned off', async () => {
  const a = testApp();
  const { id } = await a.features.videoAnalysis({ videos: `không phải link\n${A}`, comments: 0 });
  const d = a.store.records.get(a.ws, id).data;
  assert.match(d.videos[0].error.message, /Không phải link video YouTube/);
  assert.equal(d.videos[1].video.id, A);
  assert.deepEqual(d.videos[1].comments, []);
  const many = Array.from({ length: 11 }, (_, i) => `${String(i).padStart(2, '0')}abcdefghi`).join('\n');
  await assert.rejects(a.features.videoAnalysis({ videos: many }), (/** @type {any} */ e) => e.code === 'invalid_input' && /Tối đa 10/.test(e.message));
});

test('history lists runs of both platforms, newest first, each saying its platform', async () => {
  const a = testApp();
  await a.features.tiktokVideoAnalysis({ videos: 'https://www.tiktok.com/@creator/video/7000000000000000001', comments: 0 });
  await new Promise((r) => setTimeout(r, 5));
  await a.features.videoAnalysis({ videos: A, comments: 0 });
  const h = a.features.videoAnalysisHistory(10);
  assert.deepEqual(h.map((r) => r.platform), ['youtube', 'tiktok']);
  assert.deepEqual([h[0].items[0].caption, h[0].items[0].script], ['x', false]);
});
```

Append to `test/http/video-analysis-export.test.js` (read the file first and reuse its `boot`/`post`/`waitJob` helpers; if it has none, copy the three helpers from `test/http/five-w-api.test.js`):

```js
test('YouTube: the job runs over HTTP, its Markdown says YouTube, and bad input is a 400', async () => {
  const s = await boot();
  const job = await waitJob(s.base, (await (await post(`${s.base}/api/v1/jobs/video_analysis`, { videos: 'dQw4w9WgXcQ', comments: 100 })).json()).id);
  assert.equal(job.status, 'succeeded', job.error);
  const md = await (await fetch(`${s.base}/api/v1/records/${job.result.id}/export.md?inline=1`)).text();
  assert.match(md, /# Phân tích video YouTube/);
  assert.match(md, /YouTube chưa lấy được lời thoại/);
  const bad = await post(`${s.base}/api/v1/jobs/video_analysis`, { videos: 'x', comments: 7 });
  assert.equal(bad.status, 400);
  s.close();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/features/video-analysis.test.js`
Expected: FAIL, "Cannot find module … src/features/video-analysis.js".

- [ ] **Step 3: Per-platform link parsing in the shared loop**

`src/features/shared-video-analysis.js`: add `parseLinks = linksOf` to the destructured options of `makeVideoAnalysisRunner` (and to its JSDoc: `parseLinks?: (videos: any) => string[]` with the note "pasted text → distinct links; TikTok drops the query string, YouTube must keep its id"), and change `const links = linksOf(params.videos);` to `const links = parseLinks(params.videos);`.

- [ ] **Step 4: The YouTube use case**

`src/features/video-analysis.js`:

```js
// Use case: "Phân tích video" for YouTube links — numbers and comments of each video, one record per batch.
// The batch loop is the one TikTok uses (shared-video-analysis.js). The script comes from source.getTranscript when
// the source has it; until then every video is saved with the note "unsupported".
import { makeVideoAnalysisRunner } from './shared-video-analysis.js';
import { splitList } from './shared.js';

const ID = '[A-Za-z0-9_-]{11}';
const IN_LINK = new RegExp(`(?:[?&]v=|youtu\\.be/|/shorts/|/embed/|/live/)(${ID})(?![A-Za-z0-9_-])`);
const BARE = new RegExp(`^${ID}$`);

/** The video id inside a YouTube link (watch, youtu.be, shorts, embed, live) or a bare id; null for anything else. @param {string} link */
export function youtubeIdOf(link) {
  const s = String(link ?? '').trim();
  if (BARE.test(s)) return s;
  return /(^|\/\/)([\w-]+\.)*(youtube\.com|youtu\.be)\//i.test(s) ? s.match(IN_LINK)?.[1] ?? null : null;
}

const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

/**
 * Pasted text → distinct watch links, in order (one link per line or comma). A line without a video id is kept as
 * written, so it shows up as a failed row. @param {any} videos
 */
export function youtubeLinksOf(videos) {
  const lines = splitList(videos).map((l) => (youtubeIdOf(l) ? watchUrl(/** @type {string} */ (youtubeIdOf(l))) : l));
  return [...new Set(lines)];
}

/** @param {{source: import('../ports/youtube-source.js').YouTubeSource, records: any, now: () => number}} deps */
export function makeYouTubeVideoAnalysis({ source, records, now }) {
  return makeVideoAnalysisRunner({
    kind: 'video_analysis', platform: 'youtube', records, now, parseLinks: youtubeLinksOf,
    fetchVideo: async (link) => {
      const id = youtubeIdOf(link);
      if (!id) throw Object.assign(new Error('Không phải link video YouTube'), { code: 'invalid_input' });
      const v = await source.getVideo(id, { likes: true });
      return { video: { ...v, id, url: watchUrl(id), cover: v.thumb ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }, transcript: null, transcriptNote: 'unsupported' };
    },
    fetchComments: async (video, o, onProgress) => {
      const r = await source.getComments(video.id, { max: o.max, sort: 'top', replies: o.replies }, onProgress);
      if (r.disabled) throw new Error('Video này tắt bình luận');
      return r.comments;
    },
    titleOf: (v) => String(v.title || v.url).replace(/\s+/g, ' ').trim().slice(0, 80),
  });
}
```

(`splitList` in `src/features/shared.js` splits on commas and new lines and trims, so a line of several words stays one line.)

- [ ] **Step 5: Notes, history, wiring**

`src/core/report/video-analysis.js`: add to the `NOTES` map `unsupported: 'YouTube chưa lấy được lời thoại'`. `web/components/video-analysis.js`: add the same key and text to its `NOTES` map.

`src/features/tiktok/video-analysis.js`, `makeVideoAnalysisHistory`: list both kinds and say the platform. Replace the body of `videoAnalysisHistory` with:

```js
    const rows = ['tiktok_video_analysis', 'video_analysis'].flatMap((kind) => store.records.list(ws, kind, limit)).sort((a, b) => b.created_at - a.created_at || b.id - a.id).slice(0, limit);
    return rows.map((r) => {
      const d = store.records.get(ws, r.id)?.data;
      const items = (d?.videos || []).map((e) => ({
        url: e.video?.url ?? e.link, caption: e.video?.caption ?? e.video?.title ?? '', author: e.video?.author ?? e.video?.channelTitle ?? '', cover: e.video?.cover ?? null,
        script: e.error ? null : e.transcript ? true : e.transcriptNote === 'off' ? null : false,
        parents: (e.comments || []).filter((c) => !c.parentId).length, replies: (e.comments || []).filter((c) => c.parentId).length,
        reused: !!e.commentsReused, error: e.error?.message ?? null,
      }));
      return { id: r.id, platform: r.kind === 'video_analysis' ? 'youtube' : 'tiktok', title: r.title, createdAt: r.created_at, params: r.params, items, failed: items.filter((x) => x.error).length };
    });
```

and update the comment above it ("each saved run of either platform…").

`src/app.js`: import `makeYouTubeVideoAnalysis` from `./features/video-analysis.js`; add to `features`: `videoAnalysis: makeYouTubeVideoAnalysis({ source, records: base.records, now: base.now }),` and after the TikTok handler: `handlers.video_analysis = (p, ctx) => features.videoAnalysis(p, ctx.progress);`

`src/http/routes/jobs.js`: add to `JOB_SCHEMAS` after `tiktok_video_analysis`:

```js
  video_analysis: { videos: 'string!', script: 'bool?', comments: /** @type {any} */ ([0, 100, 300]), replies: 'bool?' },
```

(`titleOf` there already handles any kind ending in `video_analysis`; `routes/records.js` already exports both kinds.)

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS. If the history test's caption or the fake source's video fields differ from what the test assumes, read `src/sources/fake/index.js` (`getVideo`, `getComments`) and adjust the expected values in the test to the fake's real output, not the feature.

- [ ] **Step 7: Commit**

```bash
git add src/features/video-analysis.js src/features/shared-video-analysis.js src/features/tiktok/video-analysis.js src/app.js src/http/routes/jobs.js src/core/report/video-analysis.js web/components/video-analysis.js test/features/video-analysis.test.js test/http/video-analysis-export.test.js
git commit -m "feat: YouTube video analysis job (numbers and comments)"
```

---

### Task 3: One "Phân tích video" screen

**Files:**
- Create: `web/video-links.js`, `web/views/video.js`
- Delete: `web/views/tiktok/video.js`
- Modify: `web/nav.js`, `web/kinds.js`, `web/lib.js` (job label), `web/components/video-analysis.js`, `web/components/tiktok-channel/videos.js:13`, `web/views/tiktok/comments.js` (two links), `test/web-video-analysis.test.js`, `test/web-nav.test.js`
- Test: `test/web-video-links.test.js`

**Interfaces:**
- Consumes: jobs `tiktok_video_analysis` and `video_analysis`; `tiktokCommentData.analyses(limit)` (now both platforms, rows with `platform`); the `videoAnalysis(box, {exportUrl})` component.
- Produces:
  - `MAX_PER_PLATFORM = 10`, `platformOfLink(line) → 'tiktok'|'youtube'|null`, `readVideoLinks(text, force?) → {tiktok: string[], youtube: string[], dup: string[], bad: string[], wrong: string[]}` from `web/video-links.js`
  - screen `#/video`; `ALIASES['/tiktok/video'] = '/video'`; both record kinds open at `/video`

- [ ] **Step 1: Write the failing tests**

`test/web-video-links.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PER_PLATFORM, platformOfLink, readVideoLinks } from '../web/video-links.js';

const T = 'https://www.tiktok.com/@creator/video/7000000000000000001';
const Y = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

test('each line is recognised by its host or by the shape of a bare id', () => {
  const cases = [[T, 'tiktok'], ['https://vm.tiktok.com/ZSabc/', 'tiktok'], ['7000000000000000001', 'tiktok'], [Y, 'youtube'], ['https://youtu.be/dQw4w9WgXcQ?si=1', 'youtube'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube'], ['youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'], ['dQw4w9WgXcQ', 'youtube'], ['https://example.com/x', null], ['xin chào các bạn', null], ['12345', null]];
  for (const [line, want] of cases) assert.equal(platformOfLink(line), want, line);
  assert.equal(MAX_PER_PLATFORM, 10);
});

test('a mixed paste gives one list per platform; duplicates and junk are named, not sent (Review Focus #3)', () => {
  const r = readVideoLinks([T, `${T}?is_from_webapp=1`, Y, `${Y}&t=30s`, 'https://youtu.be/dQw4w9WgXcQ', 'https://vm.tiktok.com/ZSabc/', 'không phải link', '', 'https://example.com/x'].join('\n'));
  assert.deepEqual(r.tiktok, [T, 'https://vm.tiktok.com/ZSabc/']);
  assert.deepEqual(r.youtube, [Y]);
  assert.deepEqual(r.dup, [`${T}?is_from_webapp=1`, `${Y}&t=30s`, 'https://youtu.be/dQw4w9WgXcQ']);
  assert.deepEqual(r.bad, ['không phải link', 'https://example.com/x']);
  assert.deepEqual(r.wrong, []);
});

test('several links on one line and commas work; a line of plain words is one wrong entry', () => {
  const r = readVideoLinks(`${T} ${Y}, 7000000000000000002\nmột dòng chữ thường`);
  assert.deepEqual([r.tiktok, r.youtube, r.bad], [[T, '7000000000000000002'], [Y], ['một dòng chữ thường']]);
});

test('forcing a platform: unknown lines are tried as that platform, lines of the other platform are set aside', () => {
  const asYt = readVideoLinks(`${T}\n${Y}\nabc`, 'youtube');
  assert.deepEqual([asYt.youtube, asYt.tiktok, asYt.wrong, asYt.bad], [[Y, 'abc'], [], [T], []]);
  const asTt = readVideoLinks(`${T}\n${Y}\nabc`, 'tiktok');
  assert.deepEqual([asTt.tiktok, asTt.youtube, asTt.wrong], [[T, 'abc'], [], [Y]]);
  assert.deepEqual(readVideoLinks('', 'auto'), { tiktok: [], youtube: [], dup: [], bad: [], wrong: [] });
});
```

In `test/web-nav.test.js`: change `LEGACY` so `/tiktok/video` is replaced by `/video`, and replace the last assertion `assert.deepEqual(ALIASES, {});` with `assert.deepEqual(ALIASES, { '/tiktok/video': '/video' });`.

Rewrite `test/web-video-analysis.test.js`'s first two tests to the new home (keep the third test as it is):

```js
test('video analysis of either platform is a known result kind that opens on the one screen', () => {
  assert.deepEqual(KINDS.tiktok_video_analysis, { label: 'Phân tích video', path: '/video', icon: 'bars', platform: 'tiktok' });
  assert.deepEqual(KINDS.video_analysis, { label: 'Phân tích video', path: '/video', icon: 'bars', platform: 'youtube' });
  assert.equal(recordHref({ id: 7, kind: 'tiktok_video_analysis' }), '#/video?id=7');
  assert.equal(recordHref({ id: 8, kind: 'video_analysis' }), '#/video?id=8');
  assert.equal(jobHref({ kind: 'video_analysis', status: 'running' }), '#/video');
  assert.equal(jobHref({ kind: 'tiktok_video_analysis', status: 'succeeded', result: { id: 9 } }), '#/video?id=9');
});

test('one sidebar entry, one screen, the old path is an alias, and both jobs have a label', () => {
  const nav = fs.readFileSync('web/nav.js', 'utf8');
  assert.match(nav, /label: 'Phân tích video', tabs: \[\['\/video', 'Phân tích video', \(\) => import\('\.\/views\/video\.js'\)\]\]/);
  assert.match(nav, /'\/tiktok\/video': '\/video'/);
  assert.ok(!fs.existsSync('web/views/tiktok/video.js'));
  const lib = fs.readFileSync('web/lib.js', 'utf8');
  assert.match(lib, /tiktok_video_analysis: 'Phân tích video TikTok'/);
  assert.match(lib, /video_analysis: 'Phân tích video YouTube'/);
  const view = fs.readFileSync('web/views/video.js', 'utf8');
  for (const s of ['data-platform', 'Tự nhận', 'chạy thành hai lần', "from '../video-links.js'"]) assert.ok(view.includes(s), s);
  assert.ok(!/#\/tiktok\/video/.test(fs.readFileSync('web/views/tiktok/comments.js', 'utf8') + fs.readFileSync('web/components/tiktok-channel/videos.js', 'utf8')), 'links elsewhere point at #/video');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/web-video-links.test.js test/web-video-analysis.test.js test/web-nav.test.js`
Expected: FAIL (no `web/video-links.js`; kinds and nav still point at `/tiktok/video`).

- [ ] **Step 3: Link parsing**

`web/video-links.js`:

```js
// "Phân tích video": pasted text → the links of each platform. Pure, so it is tested in Node.
// TikTok and YouTube links go to different jobs; a line that is neither is named and never sent.

export const MAX_PER_PLATFORM = 10;

const TIKTOK_HOST = /^(https?:\/\/)?([a-z0-9-]+\.)*tiktok\.com\//i;
const YOUTUBE_HOST = /^(https?:\/\/)?([a-z0-9-]+\.)*(youtube\.com|youtu\.be)\//i;
const TIKTOK_ID = /^\d{15,25}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_IN_LINK = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;

/** @param {string} line @returns {'tiktok'|'youtube'|null} */
export function platformOfLink(line) {
  const s = String(line ?? '').trim();
  if (TIKTOK_HOST.test(s) || TIKTOK_ID.test(s)) return 'tiktok';
  if (YOUTUBE_HOST.test(s) || YOUTUBE_ID.test(s)) return 'youtube';
  return null;
}

/** What makes two lines the same video: the id when the link shows it, else the link without its query. */
function keyOf(platform, link) {
  const bare = link.replace(/[?#].*$/, '');
  if (platform === 'youtube') return `y:${YOUTUBE_ID.test(link) ? link : link.match(YT_IN_LINK)?.[1] ?? bare}`;
  return `t:${bare.match(/\/(?:video|photo)\/(\d{15,25})/)?.[1] ?? bare}`;
}

/**
 * @param {string} text one link per line; several links on a line, or commas, also work
 * @param {'auto'|'tiktok'|'youtube'} [force] 'auto' recognises each line; a platform makes unrecognised lines count as
 *   that platform (they fail in the job if they are not) and sets the other platform's links aside as `wrong`
 * @returns {{tiktok: string[], youtube: string[], dup: string[], bad: string[], wrong: string[]}}
 */
export function readVideoLinks(text, force = 'auto') {
  const out = { tiktok: /** @type {string[]} */ ([]), youtube: /** @type {string[]} */ ([]), dup: /** @type {string[]} */ ([]), bad: /** @type {string[]} */ ([]), wrong: /** @type {string[]} */ ([]) };
  const seen = new Set();
  // One entry per line or comma; inside a line every token that looks like a link or an id is its own entry, and a
  // line with none is one entry (a sentence is one wrong line, not one per word).
  const entries = String(text || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)
    .flatMap((line) => {
      const tokens = line.split(/\s+/).filter((t) => platformOfLink(t));
      return tokens.length ? tokens : [line];
    });
  for (const raw of entries) {
    const found = platformOfLink(raw);
    if (force !== 'auto' && found && found !== force) {
      out.wrong.push(raw);
      continue;
    }
    const platform = found ?? (force === 'auto' ? null : force);
    if (!platform) {
      out.bad.push(raw);
      continue;
    }
    // TikTok links lose their tracking query; YouTube links keep theirs (the id is in it).
    const link = platform === 'tiktok' ? raw.replace(/[?#].*$/, '') : raw;
    const key = keyOf(platform, link);
    if (seen.has(key)) out.dup.push(raw);
    else (seen.add(key), out[platform].push(link));
  }
  return out;
}
```

Check the second test by hand: `T?is_from_webapp=1` → TikTok, key is the video id, duplicate, pushed raw into `dup`; `Y&t=30s` and `youtu.be/dQw4w9WgXcQ` → the same YouTube id, duplicates; `Y` itself is kept with its query (`[Y]`).

- [ ] **Step 4: Nav, kinds, labels, links elsewhere**

`web/nav.js`: the Phân tích video entry becomes `{ icon: 'bars', label: 'Phân tích video', tabs: [['/video', 'Phân tích video', () => import('./views/video.js')]] },` and `export const ALIASES = { '/tiktok/video': '/video' };`

`web/kinds.js`: `tiktok_video_analysis: { label: 'Phân tích video', path: '/video', icon: 'bars', platform: 'tiktok' },` and add `video_analysis: { label: 'Phân tích video', path: '/video', icon: 'bars', platform: 'youtube' },` in the YouTube block.

`web/lib.js` `LABELS`: add `video_analysis: 'Phân tích video YouTube',`.

`web/components/tiktok-channel/videos.js:13` and the two links in `web/views/tiktok/comments.js` (`href="#/tiktok/video?videos=…"`): change `#/tiktok/video` to `#/video`.

`web/components/video-analysis.js` line 157 (the comment browser's `openFull`): pass it only for TikTok, because YouTube comments are not in the shared dataset:

```js
openFull: rec.data.platform === 'tiktok' ? `#/tiktok/comments?video=${encodeURIComponent(e.video.id)}` : undefined
```

(Read the surrounding call and `commentBrowser`'s handling of a missing `openFull`; if it renders the link unconditionally, guard it there.)

- [ ] **Step 5: The merged screen**

Create `web/views/video.js` from `web/views/tiktok/video.js` (`git mv web/views/tiktok/video.js web/views/video.js`, then fix the relative imports: `'../../http/client.js'` → `'../http/client.js'`, `'../../lib.js'` → `'../lib.js'`, `'../../dom.js'` → `'../dom.js'`, `'../../components/video-analysis.js'` → `'../components/video-analysis.js'`). Then make these changes; everything not listed stays as it is.

1. **Header and constants.** Replace the file comment, `KIND`, `PATH`, `MAX`, `FORM`, the `TIKTOK`/`YOUTUBE` regexes, `idOf` and the exported `readLinks` with:

```js
// "Phân tích video": paste up to 10 links per platform → numbers, script and comments of each, side by side.
// TikTok and YouTube links share the box; each platform runs as its own job and shows its own result block.
// TikTok comments already collected anywhere in the app are reused when the dataset allows it.
import { records, tiktokCommentData } from '../http/client.js';
import { esc, icon, runJob, watchJob, activeJob, progressCard, updateProgress, errorCallout, toast, store, persist, setUrl, bindTips, fmt, ago, emptyState } from '../lib.js';
import { scope } from '../dom.js';
import { videoAnalysis } from '../components/video-analysis.js';
import { MAX_PER_PLATFORM as MAX, readVideoLinks } from '../video-links.js';

const KINDS = { tiktok: 'tiktok_video_analysis', youtube: 'video_analysis' };
const NAMES = { tiktok: 'TikTok', youtube: 'YouTube' };
const PLATFORMS = /** @type {const} */ (['tiktok', 'youtube']);
const PATH = '/video';
const FORM = { videos: '', platform: 'auto', script: true, comments: 100, replies: true, reuse: true };
const tiktokIdOf = (link) => link.match(/\/(?:video|photo)\/(\d{15,25})/)?.[1] ?? (/^\d{15,25}$/.test(link) ? link : null);
```

(Keep in the import list only the names the file still uses after the edits.) Everywhere the old code calls `idOf(…)`, call `tiktokIdOf(…)`.

2. **Saved form.** `const st = store('video-form', store('tt-video-form', FORM));` then `if (!['auto', 'tiktok', 'youtube'].includes(st.platform)) st.platform = 'auto';`, and `persist('video-form', st)` in `save`.

3. **Template.** Title `Phân tích video`; intro `Số liệu, script và bình luận của video TikTok hoặc YouTube, đặt cạnh nhau để so. Dán chung một ô; mỗi nền tảng chạy thành một lần riêng.`; textarea placeholder `Dán link video TikTok hoặc YouTube, mỗi dòng một link (tối đa ${MAX} mỗi nền tảng)`. In the options bar, before the "Lấy script" checkbox, add:

```js
        <label class="small muted" for="va-plat">Nền tảng</label>
        <select class="select input" id="va-plat" data-platform style="width:auto">${[['auto', 'Tự nhận'], ['tiktok', 'TikTok'], ['youtube', 'YouTube']].map(([v, l]) => `<option value="${v}" ${st.platform === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="va-sep"></span>
```

Mark the "dùng lại comment" checkbox's label with `data-tt-opt` in addition to `data-cm-opt`. Replace the single `<div data-prog></div><div data-out></div>` with one block per platform:

```js
    ${PLATFORMS.map((p) => `<section data-block="${p}" hidden><h3 class="section-label" data-block-title>${NAMES[p]}</h3><div data-prog></div><div data-out></div></section>`).join('')}
```

4. **State per platform.** Replace `prog`, `out`, `shownId` and `view` with:

```js
  const blocks = Object.fromEntries(PLATFORMS.map((p) => {
    const el = /** @type {HTMLElement} */ (root.querySelector(`[data-block="${p}"]`));
    const b = { el, prog: /** @type {HTMLElement} */ (el.querySelector('[data-prog]')), out: /** @type {HTMLElement} */ (el.querySelector('[data-out]')), shownId: /** @type {number|string|null} */ (null), view: /** @type {any} */ (null) };
    b.view = videoAnalysis(b.out, { exportUrl: (ext, query) => records.exportUrl(b.shownId, ext, query) });
    shown.add(b.view.off);
    return [p, b];
  }));
  /** The block titles only matter when both platforms are on screen. */
  const showBlocks = () => {
    const open = PLATFORMS.filter((p) => !blocks[p].el.hidden);
    for (const p of PLATFORMS) /** @type {HTMLElement} */ (blocks[p].el.querySelector('[data-block-title]')).hidden = open.length < 2;
  };
```

5. **`check()`.** Replace its link reading and messages with:

```js
    const r = readVideoLinks(linksEl.value, st.platform);
    const n = { tiktok: r.tiktok.length, youtube: r.youtube.length };
    const over = PLATFORMS.filter((p) => n[p] > MAX);
    const total = n.tiktok + n.youtube;
    linksEl.rows = Math.min(10, Math.max(2, linksEl.value.split('\n').length));
    const parts = PLATFORMS.filter((p) => n[p]).map((p) => `<span class="${n[p] > MAX ? 'cc-bad' : 'cc-ok'}">${n[p] <= MAX ? icon('check') : ''} ${n[p]} video ${NAMES[p]}${n[p] > MAX ? `, thừa ${n[p] - MAX} (tối đa ${MAX} mỗi nền tảng)` : ''}</span>`);
    if (n.tiktok && n.youtube && !over.length) parts.push('<span class="muted">chạy thành hai lần, mỗi nền tảng một kết quả</span>');
    if (r.dup.length) parts.push(`<span class="cc-warn">${r.dup.length} link trùng, sẽ bỏ qua</span>`);
    if (r.wrong.length) parts.push(`<span class="cc-warn" title="${esc(r.wrong.join('\n'))}">${r.wrong.length} link của nền tảng kia không chạy vì đang chọn ${NAMES[st.platform]}</span>`);
    if (r.bad.length) parts.push(`<span class="cc-bad" title="${esc(r.bad.join('\n'))}">${r.bad.length} dòng không phải link video: ${esc(r.bad.slice(0, 2).join(', '))}${r.bad.length > 2 ? '…' : ''}</span>`);
    form.querySelector('[data-check]').innerHTML = parts.join('') || '<span class="muted">Link TikTok (tiktok.com/@kênh/video/…, vm.tiktok.com/…) hoặc YouTube (youtube.com/watch?v=…, youtu.be/…, /shorts/…)</span>';
    runBtn.disabled = !total || over.length > 0;
    runBtn.innerHTML = `${icon('bars')} Phân tích ${total && !over.length ? `${total} ` : ''}video`;
    form.querySelectorAll('[data-cm-opt]').forEach((el) => (/** @type {HTMLElement} */ (el).hidden = !st.comments));
    form.querySelectorAll('[data-tt-opt]').forEach((el) => (/** @type {HTMLElement} */ (el).hidden = !st.comments || !n.tiktok));
```

Keep the reuse and estimate lines after it, with `r.ok` replaced by `r.tiktok` for the reuse set, `fresh` and `known(…)`, and the estimate becoming:

```js
    // Rough estimate: ~10 s per TikTok page and ~5 s per YouTube video, plus comments read from the platform.
    const cm = st.comments ? (st.comments === 300 ? 25 : 10) : 0;
    const secs = n.tiktok * 10 + fresh * cm + n.youtube * (5 + cm);
    form.querySelector('[data-eta]').textContent = total && !over.length ? `khoảng ${secs < 90 ? `${secs} giây` : `${Math.round(secs / 60)} phút`}` : '';
```

The message text "chạy thành hai lần" must appear exactly once in the source as written above (the test checks it).

6. **Platform select.** After the `data-k` listeners: `root.querySelector('[data-platform]').addEventListener('change', (e) => ((st.platform = /** @type {HTMLSelectElement} */ (e.target).value), save(), check()));`

7. **`follow`, `run`, `show`.** They take the platform:

```js
  /** Show one platform's batch being analyzed (rows appear as videos finish), then its finished result. */
  async function follow(p, title, job) {
    const b = blocks[p];
    b.el.hidden = false;
    showBlocks();
    b.prog.innerHTML = progressCard(title);
    let last = -1;
    try {
      const res = await job(async (pr) => {
        updateProgress(b.prog, pr);
        if (pr?.recordId && pr.done !== last) {
          last = pr.done;
          const rec = await records.get(pr.recordId).catch(() => null);
          if (rec) ((b.shownId = rec.id), b.view.show(rec));
        }
      });
      b.prog.innerHTML = '';
      await show(res.id, false);
      history();
    } catch (e) {
      b.prog.innerHTML = errorCallout(e); // the other platform's block is untouched
    }
  }

  async function run() {
    const r = check();
    const todo = PLATFORMS.filter((p) => r[p].length);
    if (!todo.length) return toast('Dán ít nhất một link video TikTok hoặc YouTube', 'error');
    if (todo.some((p) => r[p].length > MAX)) return toast(`Tối đa ${MAX} video mỗi nền tảng`, 'error');
    for (const p of PLATFORMS) ((blocks[p].el.hidden = true), (blocks[p].shownId = null), (blocks[p].out.innerHTML = ''), (blocks[p].prog.innerHTML = ''));
    runBtn.disabled = true;
    // One job per platform, one after the other: a failed one shows its error and the next still runs.
    for (const p of todo) {
      const body = { videos: r[p].join('\n'), script: st.script, comments: st.comments, replies: st.replies, ...(p === 'tiktok' ? { reuse: st.reuse } : {}) };
      await follow(p, `Đang phân tích ${r[p].length} video ${NAMES[p]}`, (onProgress) => runJob(KINDS[p], body, onProgress));
    }
    check();
  }

  /** Open a saved result in its platform's block. `alone`: opened from history or a link, so the other block is closed. */
  async function show(id, alone = true) {
    const rec = await records.get(id);
    const p = rec.data?.platform === 'youtube' ? 'youtube' : 'tiktok';
    if (alone) for (const q of PLATFORMS) if (q !== p) ((blocks[q].el.hidden = true), (blocks[q].shownId = null));
    blocks[p].el.hidden = false;
    showBlocks();
    setUrl(PATH, { id: rec.id }); // a reload or a copied link opens this result again
    blocks[p].shownId = rec.id;
    blocks[p].view.show(rec);
  }
```

`check()` must return `r` (it already returns its link result; make sure it returns the new object).

8. **History.** `tiktokCommentData.analyses(30)` now returns both platforms. In `renderHistory`: the row is "on" when `PLATFORMS.some((p) => String(blocks[p].shownId) === String(r.id))`; show `<span class="tag">${NAMES[r.platform] ?? ''}</span>` before the title; links use `#${PATH}?id=${r.id}`. Wherever the history code or the rest of the file used `shownId`, use the block of the row's platform.

9. **Coming back to a running job, and opening by link.** The old code resumes one running job of `KIND` and opens `params.id` or `params.videos`. Do the same for each platform: for every `p` in `PLATFORMS`, if `activeJob(KINDS[p])` finds a job, `follow(p, 'Đang phân tích video ' + NAMES[p], (onProgress) => watchJob(job.id, onProgress))`; `params.id` goes to `show(params.id)`; `params.videos` fills the box as now. Keep the order the old file used (read its last ~25 lines).

Then check the whole file once for any remaining use of `KIND`, `out`, `prog`, `view`, `shownId`, `r.ok`, `r.other` or `readLinks`, and fix each according to the rules above.

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS (typecheck included; `web/` is type-checked if `jsconfig.json` covers it).

- [ ] **Step 7: Commit**

```bash
git add -A web/views/video.js web/views/tiktok/video.js web/video-links.js web/nav.js web/kinds.js web/lib.js web/components/video-analysis.js web/components/tiktok-channel/videos.js web/views/tiktok/comments.js test/web-video-links.test.js test/web-video-analysis.test.js test/web-nav.test.js
git commit -m "feat(web): one Phân tích video screen for TikTok and YouTube links"
```

- [ ] **Step 8: Browser check (done by the controller)**

On `preview-5w1h` (the preview's sources are real; TikTok and YouTube pages are fetched, no API key needed):
1. `#/tiktok/video?videos=abc` lands on `#/video?videos=abc` with the box filled.
2. Paste one TikTok link and one YouTube link: the check line says "1 video TikTok", "1 video YouTube", "chạy thành hai lần…"; run; two blocks appear, each with its table; the YouTube row's script column says "YouTube chưa lấy được lời thoại".
3. Paste a YouTube link plus one line of words: the words are named as not a link and the button counts 1.
4. Choose Nền tảng: YouTube with a TikTok link in the box: it is set aside with the reason.
5. Make one platform fail (a TikTok link to a deleted video with a valid YouTube link): the YouTube block shows its result, the TikTok block its error (Review Focus #4).
6. History lists both runs with their platform tag; opening one shows it alone; the old report from before this change opens.
7. Lịch sử opens a `video_analysis` record at `#/video?id=…`. No console errors.

---

### Task 4: YouTube transcript

This task is separable: phases after this one work without it (YouTube videos are then analysed from title and comments). It depends on YouTube's watch page, so it starts by capturing the page as it is today.

**Files:**
- Create: `src/sources/browser/chromium.js`, `src/sources/innertube/transcript.js`, `src/sources/innertube/fixtures/transcript-panel.html`
- Modify: `src/sources/tiktok/browser.js` (import from the shared module), `src/ports/youtube-source.js`, `src/sources/innertube/index.js`, `src/sources/fake/index.js`, `src/features/video-analysis.js`, `src/core/report/video-analysis.js` and `web/components/video-analysis.js` (two notes), `src/app.js` (close), `scripts/probe.js`, `test/arch.test.js`
- Test: `test/sources/youtube-transcript.test.js`, append to `test/features/video-analysis.test.js`

**Interfaces:**
- Consumes: `parseClock(s)` from `src/core/video/transcript.js` (`"1:23"` → 83); the `Transcript` shape `{language: string|null, kind: 'auto'|'manual', segments: [{start, end, text}]}`.
- Produces:
  - `loadChromium(load?)`, `USER_AGENT`, `LAUNCH_ARGS`, `PLAYWRIGHT` from `src/sources/browser/chromium.js`
  - `segmentsFromRows(rows: {time: string, text: string}[]) → Segment[]` and `createTranscriptReader({loadPlaywright?, idleMs?}) → {read(videoId) → Promise<Transcript|null>, close()}` from `src/sources/innertube/transcript.js`
  - port: `getTranscript(id) → Promise<Transcript|null>`; throws an error with `code: 'setup_required'` when Chromium is missing and `code: 'source_changed'` when the panel cannot be read; resolves `null` when the video has no transcript
  - `source.close?.()` closes the hidden browser
  - `transcriptNote` values for YouTube: `'none'` (no transcript), `'setup'` (Chromium missing), `'changed'` (panel unreadable); `'unsupported'` only when the source has no `getTranscript`

- [ ] **Step 1: Capture today's transcript panel**

Run this once (it opens a hidden Chromium on one public video; no sign-in; writes one HTML file):

```bash
node --disable-warning=ExperimentalWarning --input-type=module -e "
const { chromium } = await import('playwright');
const b = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await b.newContext({ locale: 'en-US', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' });
const page = await ctx.newPage();
await page.goto('https://www.youtube.com/watch?v=NcZSPhEvIjk&hl=en', { waitUntil: 'domcontentloaded', timeout: 60000 });
const consent = page.locator('button[aria-label*=\"Accept\"], button[aria-label*=\"Reject\"]').first();
if (await consent.count()) await consent.click().catch(() => {});
await page.locator('#description #expand, tp-yt-paper-button#expand').first().click({ timeout: 20000 });
await page.locator('ytd-video-description-transcript-section-renderer button').first().click({ timeout: 20000 });
await page.waitForSelector('ytd-transcript-segment-renderer', { timeout: 20000 });
const html = await page.locator('ytd-transcript-segment-list-renderer').first().evaluate((el) => el.outerHTML);
const n = await page.locator('ytd-transcript-segment-renderer').count();
(await import('node:fs')).writeFileSync('src/sources/innertube/fixtures/transcript-panel.html', html.slice(0, 60000));
console.log('segments on page:', n, 'bytes saved:', Math.min(html.length, 60000));
await b.close();
"
```

Expected: `segments on page:` followed by a number above 5. Open the saved file and confirm each segment has an element holding the timestamp (expected class `segment-timestamp`) and one holding the text (expected class `segment-text`).

If Playwright is not installed: `npm run setup:tiktok`. If a selector fails, open the watch page in a normal browser, find how the transcript is opened and what the segment rows look like today, use those selectors here **and in Step 4**, and write what you changed in your report. If the page cannot be read at all (sign-in wall, bot check), stop and report BLOCKED with what the page showed; do not invent a fixture.

- [ ] **Step 2: Write the failing tests**

`test/sources/youtube-transcript.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { segmentsFromRows, createTranscriptReader } from '../../src/sources/innertube/transcript.js';

test('rows become segments: clock text to seconds, each ending where the next starts; unreadable rows are dropped', () => {
  const segs = segmentsFromRows([{ time: '0:00', text: ' Xin chào ' }, { time: '0:04', text: 'hôm nay\nmình kể' }, { time: 'x', text: 'rác' }, { time: '1:02:03', text: 'kết' }, { time: '1:02:05', text: '' }]);
  assert.deepEqual(segs, [{ start: 0, end: 4, text: 'Xin chào' }, { start: 4, end: 3723, text: 'hôm nay mình kể' }, { start: 3723, end: null, text: 'kết' }]);
  assert.deepEqual(segmentsFromRows([]), []);
});

test('the captured panel still has the two things the reader looks for', () => {
  const html = fs.readFileSync('src/sources/innertube/fixtures/transcript-panel.html', 'utf8');
  assert.ok((html.match(/ytd-transcript-segment-renderer/g) ?? []).length >= 5);
  assert.match(html, /segment-timestamp/);
  assert.match(html, /segment-text/);
});

/** A fake Playwright: one page whose locators answer from a script. */
function fakePlaywright({ rows, hasButton = true, launchFails = false }) {
  const calls = [];
  const locator = (sel) => ({
    first: () => locator(sel),
    count: async () => (sel.includes('transcript-section') ? (hasButton ? 1 : 0) : 0),
    click: async () => void calls.push(`click ${sel}`),
  });
  const page = {
    goto: async (url) => void calls.push(`goto ${url}`),
    locator,
    waitForSelector: async (sel) => { if (!rows) throw new Error(`timeout ${sel}`); },
    evaluate: async () => rows,
  };
  const context = { newPage: async () => page, close: async () => void calls.push('context closed') };
  const browser = { newContext: async () => context, close: async () => void calls.push('browser closed') };
  return { calls, load: async () => ({ chromium: { launch: async () => { if (launchFails) throw new Error('Executable doesn\'t exist'); return browser; } } }) };
}

test('reader: opens the watch page, opens the panel, returns the transcript and closes the page', async () => {
  const pw = fakePlaywright({ rows: [{ time: '0:00', text: 'Xin chào' }, { time: '0:03', text: 'các bạn' }] });
  const reader = createTranscriptReader({ loadPlaywright: pw.load, idleMs: 10 });
  const t = await reader.read('dQw4w9WgXcQ');
  assert.deepEqual(t, { language: null, kind: 'auto', segments: [{ start: 0, end: 3, text: 'Xin chào' }, { start: 3, end: null, text: 'các bạn' }] });
  assert.match(pw.calls[0], /^goto https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ&hl=en$/);
  assert.ok(pw.calls.includes('context closed'));
  await reader.close();
  assert.ok(pw.calls.includes('browser closed'));
});

test('reader: no transcript button is "no transcript"; a panel that never fills is source_changed; no Chromium is setup_required (Review Focus #5)', async () => {
  const none = createTranscriptReader({ loadPlaywright: fakePlaywright({ rows: [], hasButton: false }).load });
  assert.equal(await none.read('dQw4w9WgXcQ'), null);
  const changed = createTranscriptReader({ loadPlaywright: fakePlaywright({ rows: null }).load });
  await assert.rejects(changed.read('dQw4w9WgXcQ'), (/** @type {any} */ e) => e.code === 'source_changed');
  const empty = createTranscriptReader({ loadPlaywright: fakePlaywright({ rows: [] }).load });
  await assert.rejects(empty.read('dQw4w9WgXcQ'), (/** @type {any} */ e) => e.code === 'source_changed');
  const missing = createTranscriptReader({ loadPlaywright: fakePlaywright({ rows: [], launchFails: true }).load });
  await assert.rejects(missing.read('dQw4w9WgXcQ'), (/** @type {any} */ e) => e.code === 'setup_required' && /setup:tiktok/.test(e.message));
  const noModule = createTranscriptReader({ loadPlaywright: async () => { throw new Error('Cannot find package playwright'); } });
  await assert.rejects(noModule.read('dQw4w9WgXcQ'), (/** @type {any} */ e) => e.code === 'setup_required');
});
```

Append to `test/features/video-analysis.test.js`:

```js
import { createFakeSource } from '../../src/sources/fake/index.js';

test('with a transcript the script is saved with its stats; each failure keeps numbers and comments and says why', async () => {
  const transcript = { language: null, kind: 'auto', segments: [{ start: 0, end: 3, text: 'Xin chào các bạn' }, { start: 3, end: null, text: 'hôm nay mình kể chuyện' }] };
  const run = async (getTranscript, params = {}) => {
    const a = testApp({ ...createFakeSource(), getTranscript });
    return a.store.records.get(a.ws, (await a.features.videoAnalysis({ videos: A, comments: 100, ...params })).id).data.videos[0];
  };
  const ok = await run(async () => transcript);
  assert.deepEqual([ok.transcript.segments.length, ok.transcriptNote, ok.script.hook], [2, null, 'Xin chào các bạn']);
  const cases = [[async () => null, 'none'], [async () => { throw Object.assign(new Error('x'), { code: 'setup_required' }); }, 'setup'], [async () => { throw Object.assign(new Error('x'), { code: 'source_changed' }); }, 'changed'], [async () => { throw new Error('lạ'); }, 'changed']];
  for (const [fn, note] of cases) {
    const e = await run(/** @type {any} */ (fn));
    assert.deepEqual([e.transcript, e.transcriptNote, e.error, e.comments.length], [null, note, undefined, 1], String(note));
  }
  let asked = 0;
  const off = await run(async () => (asked++, transcript), { script: false });
  assert.deepEqual([off.transcriptNote, asked], ['off', 0], 'script turned off: the page is never opened');
});
```

(Check the expected `script.hook` against `scriptStats` in `src/core/video/transcript.js`: the hook is the text of the segments that start within the first `HOOK_SECONDS`. If both segments fall inside that window, the expected hook is both texts joined; set the expected value from the function's rule.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/sources/youtube-transcript.test.js test/features/video-analysis.test.js`
Expected: FAIL, "Cannot find module … src/sources/innertube/transcript.js".

- [ ] **Step 4: The shared Chromium module and the reader**

`src/sources/browser/chromium.js` (move these four out of `src/sources/tiktok/browser.js`, which then imports them from here; its behaviour does not change):

```js
// How the app loads and presents its hidden Chromium (Playwright is optional and imported only when needed).
// Shared by the TikTok source and the YouTube transcript reader; each keeps its own browser lifecycle.

// Kept as a variable so typecheck does not require the optional package to be installed.
export const PLAYWRIGHT = 'playwright';
// Sites answer a browser that says it is automated or headless with empty pages, so the hidden browser presents
// itself as an ordinary desktop Chrome (the user allowed this, 2026-11-13).
export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export const LAUNCH_ARGS = ['--disable-blink-features=AutomationControlled'];

/** Playwright's chromium from the module, whichever way it was exported. @param {() => Promise<any>} [load] */
export const loadChromium = async (load = () => import(PLAYWRIGHT)) => {
  const pw = await load();
  return pw.chromium ?? pw.default?.chromium;
};
```

In `src/sources/tiktok/browser.js` delete the four definitions and add `import { PLAYWRIGHT, USER_AGENT, LAUNCH_ARGS, loadChromium } from '../browser/chromium.js';` plus `export { loadChromium };` if other files import `loadChromium` from `./browser.js` (grep `loadChromium` under `src/` and `test/` and keep every import working).

`test/arch.test.js`: add the layer `'sources/browser/': ['sources/tiktok/', 'sources/innertube/', 'features/', 'http/', 'store/', 'jobs/', 'llm/'],`.

`src/sources/innertube/transcript.js`:

```js
// YouTube's transcript, read from the watch page with a hidden Chromium: open the description, press "Show
// transcript", read the rows of the panel. YouTube's own transcript endpoints refuse outside callers (checked
// 2026-11-13), and this panel is what a signed-out visitor sees. It depends on the page's layout, so every way it
// can fail has its own code and the rest of a video's analysis never depends on it.
import { parseClock } from '../../core/video/transcript.js';
import { throwIfCancelled } from '../../core/cancel.js';
import { PLAYWRIGHT, USER_AGENT, LAUNCH_ARGS, loadChromium } from '../browser/chromium.js';

const SEL = {
  expand: '#description #expand, tp-yt-paper-button#expand',
  open: 'ytd-video-description-transcript-section-renderer button',
  row: 'ytd-transcript-segment-renderer',
  time: '.segment-timestamp',
  text: '.segment-text',
};
const err = (code, message) => Object.assign(new Error(message), { code });

/**
 * Panel rows → transcript segments. A segment ends where the next one starts; rows without a readable time or
 * without text are dropped. @param {{time: string, text: string}[]} rows
 * @returns {import('../../core/video/transcript.js').Segment[]}
 */
export function segmentsFromRows(rows) {
  const read = (rows || []).map((r) => ({ start: parseClock(String(r?.time ?? '').trim()), text: String(r?.text ?? '').replace(/\s+/g, ' ').trim() })).filter((r) => Number.isFinite(r.start) && r.text);
  return read.map((r, i) => ({ start: /** @type {number} */ (r.start), end: read[i + 1]?.start ?? null, text: r.text }));
}

/**
 * One hidden browser for transcripts, started on first use and closed after `idleMs` without work.
 * @param {{loadPlaywright?: () => Promise<any>, idleMs?: number}} [o]
 */
export function createTranscriptReader({ loadPlaywright = () => import(PLAYWRIGHT), idleMs = 120_000 } = {}) {
  let browserP = null;
  let idle = null;
  let inUse = 0;
  async function close() {
    clearTimeout(idle);
    const b = browserP;
    browserP = null;
    if (b) await b.then((x) => x.close(), () => {}).catch(() => {});
  }
  function getBrowser() {
    if (!browserP) {
      const p = loadChromium(loadPlaywright).then((chromium) => chromium.launch({ headless: true, args: LAUNCH_ARGS }));
      browserP = p;
      p.catch(() => {
        if (browserP === p) browserP = null; // a failed launch must not stick: the user may install Chromium and retry
      });
    }
    return browserP;
  }
  return {
    /**
     * @param {string} videoId
     * @returns {Promise<import('../../core/video/transcript.js').Transcript|null>} null: the video has no transcript
     */
    async read(videoId) {
      throwIfCancelled();
      clearTimeout(idle);
      inUse++;
      let context = null;
      try {
        let browser;
        try {
          browser = await getBrowser();
        } catch (e) {
          throw err('setup_required', `Chưa có Chromium để đọc lời thoại YouTube. Cần cài: npm run setup:tiktok (${String(e?.message || e).slice(0, 80)})`);
        }
        // English labels and no personalisation: the selectors below do not depend on the label text, the locale
        // only keeps the page the same for everyone.
        context = await browser.newContext({ locale: 'en-US', userAgent: USER_AGENT });
        const page = await context.newPage();
        await page.goto(`https://www.youtube.com/watch?v=${videoId}&hl=en`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.locator(SEL.expand).first().click({ timeout: 20_000 }).catch(() => {}); // some layouts show the description open
        if (!(await page.locator(SEL.open).first().count())) return null;
        await page.locator(SEL.open).first().click({ timeout: 20_000 });
        let rows;
        try {
          await page.waitForSelector(SEL.row, { timeout: 20_000 });
          rows = await page.evaluate(({ row, time, text }) => [...document.querySelectorAll(row)].map((el) => ({ time: el.querySelector(time)?.textContent ?? '', text: el.querySelector(text)?.textContent ?? '' })), SEL);
        } catch (e) {
          throw err('source_changed', `Không đọc được bảng lời thoại của YouTube (trang có thể đã đổi): ${String(e?.message || e).slice(0, 80)}`);
        }
        const segments = segmentsFromRows(rows);
        if (!segments.length) throw err('source_changed', 'Bảng lời thoại của YouTube mở ra nhưng không có dòng nào đọc được');
        // The panel does not say whether captions were typed or generated; "auto" is the safe reading.
        return { language: null, kind: 'auto', segments };
      } finally {
        await context?.close().catch(() => {});
        if (--inUse === 0) {
          idle = setTimeout(() => void close(), idleMs);
          idle.unref?.();
        }
      }
    },
    close,
  };
}
```

If Step 1 found different selectors, change `SEL` to them. The fake Playwright in the test answers `count()` as 1 for any selector containing `transcript-section`; if the "open" selector you ended with does not contain that text, change the fake's check to match the new selector.

- [ ] **Step 5: Port, sources, use case, notes**

`src/ports/youtube-source.js`: add to the typedef

```js
 * @property {(id: string) => Promise<import('../core/video/transcript.js').Transcript|null>} [getTranscript]  null: the video has none. Throws with code
 *   'setup_required' (Chromium missing) or 'source_changed' (the watch page could not be read)
 * @property {() => Promise<void>} [close]  closes the hidden browser, if one was started
```

(`core/` types referenced from `ports/` are allowed.)

`src/sources/innertube/index.js`: import `createTranscriptReader` from `./transcript.js`; in `createInnertubeSource` create `const transcripts = createTranscriptReader(cfg.loadPlaywright ? { loadPlaywright: cfg.loadPlaywright } : {});` and add to the returned object `getTranscript: (id) => transcripts.read(id),` and `close: () => transcripts.close(),`.

`src/sources/fake/index.js`: leave it without `getTranscript` (the feature then answers `'unsupported'`, which Task 2's tests rely on).

`src/features/video-analysis.js`: `fetchVideo` receives `{script}` as its second argument. Replace the `return` of `fetchVideo` with:

```js
      const video = { ...v, id, url: watchUrl(id), cover: v.thumb ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
      if (!script) return { video, transcript: null };
      if (!source.getTranscript) return { video, transcript: null, transcriptNote: 'unsupported' };
      try {
        const transcript = await source.getTranscript(id);
        return { video, transcript, transcriptNote: transcript ? null : 'none' };
      } catch (e) {
        rethrowIfCancelled(e);
        // Numbers and comments are still worth keeping; the note says why there is no script.
        return { video, transcript: null, transcriptNote: e?.code === 'setup_required' ? 'setup' : 'changed' };
      }
```

with the signature `fetchVideo: async (link, { script }) => {` and `import { rethrowIfCancelled } from '../core/cancel.js';`. Update the file comment (the script now comes from `source.getTranscript`).

`src/core/report/video-analysis.js` and `web/components/video-analysis.js` `NOTES`: add `setup: 'Chưa có Chromium để đọc lời thoại (npm run setup:tiktok)'` and `changed: 'Không đọc được lời thoại: trang YouTube có thể đã đổi'` unless those keys already exist (the 2026-11-13 spec planned them; keep existing texts if present).

`src/app.js`: `close: async () => { await tiktok.close(); await source.close?.(); },`

`scripts/probe.js`: add a check `['youtube-transcript', async () => ((await src.getTranscript('NcZSPhEvIjk'))?.segments.length ?? 0) >= 5],` and `await src.close?.();` next to `await tt.close();`.

- [ ] **Step 6: Run all tests, then the live probe**

Run: `npm test`
Expected: PASS.

Run: `npm run probe`
Expected: `✔ youtube-transcript` among the lines. A failure here with passing tests means the live page differs from the fixture: fix `SEL`, re-capture the fixture (Step 1), and re-run.

- [ ] **Step 7: Commit**

```bash
git add src/sources/browser src/sources/innertube src/sources/tiktok/browser.js src/ports/youtube-source.js src/features/video-analysis.js src/core/report/video-analysis.js web/components/video-analysis.js src/app.js scripts/probe.js test/arch.test.js test/sources/youtube-transcript.test.js test/features/video-analysis.test.js
git commit -m "feat: YouTube transcript from the watch page (hidden Chromium), with setup and source-changed notes"
```

- [ ] **Step 8: Browser check (done by the controller)**

On `preview-5w1h`: analyse one YouTube video that has captions with "Lấy script" on: the Script tab shows lines with times and the table shows the hook; analyse one with "Lấy script" off: no Chromium is started and the note is the "off" one.

---

## Self-review notes

- Spec §4 menu and §5 switch: Task 1. §6.1–6.2 merged screen: Task 3. §6.3 YouTube numbers and comments: Task 2. §6.4 transcript: Task 4. §8 edge cases: tests in Tasks 2–4 and the browser checks. §9 tests: each task.
- The spec says the menu goes "from 13 to 11" entries; counting Tổng quan and Soulprint it goes from 15 to 13. The spec is corrected.
- The spec keeps `web/views/tiktok/video.js` as a one-line redirect; the plan removes the file and redirects in the router through `ALIASES`, so the old path needs no screen of its own. The spec is updated.
- The 2026-11-13 spec planned one Chromium shared by both sources, created in `app.js`. The TikTok browser is tied to the TikTok sign-in session and opens tiktok.com on every page, so the YouTube reader keeps its own browser (started only when a transcript is read, closed after two idle minutes) and shares only how Chromium is loaded. Cost: two Chromium processes when a TikTok search and a YouTube transcript run at the same moment.
- Dashboard shortcuts keep working unchanged: they link to screen paths, and the tab names they show still exist. No dashboard edit is needed.
