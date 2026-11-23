import { test } from 'node:test';
import assert from 'node:assert/strict';
// Loaded by URL, not by a literal path: nav.js lazy-loads every screen, and typecheck would follow those imports
// into all of web/ (which is not type-checked).
const { HOME, SOULPRINT, SETTINGS, HIDDEN, GROUPS, ITEMS, ALIASES, allTabs, has, platformOf, tabsFor, firstPath, findItem } = await import(new URL('../web/nav.js', import.meta.url).href);

const LEGACY = ['/', '/soulprint', '/tiktok/topic', '/tiktok/search', '/tiktok/insight', '/tiktok/insight/collected', '/insight', '/insight/collected', '/video', '/tiktok/channel', '/tiktok/comments', '/tiktok/5w1h',
  '/ci', '/ci/topics', '/ci/comments', '/ci/lab/whys', '/ci/lab/brief', '/ci/lab/opportunities', '/ci/runs',
  '/research', '/videos', '/comments', '/channels', '/channel', '/compare', '/keywords', '/ideas', '/follows', '/history', '/saved', '/settings', '/bricks', '/board', '/board/review'];
const item = (label) => ITEMS.find((it) => it.label === label);

test('groups are jobs, in this order, and the sidebar has sixteen entries', () => {
  assert.deepEqual(GROUPS.map((g) => [g.key, g.title, g.items.map((it) => it.label)]), [
    ['find', 'Research', ['Topic Research', 'Search', 'Keywords', 'Watchlist']],
    ['dissect', 'Analyze', ['Video Analysis', 'Channel Analysis', 'Swipe File']],
    ['ci', 'Audience', ['Collect Comments', 'Audience Insights', 'Content Lab']],
    ['make', 'Create', ['Idea Board']],
    ['library', 'Library', ['History', 'Saved']],
  ]);
  assert.deepEqual(ITEMS.slice(0, 2), [HOME, SOULPRINT]);
  assert.deepEqual(ITEMS.slice(-1 - HIDDEN.length), [SETTINGS, ...HIDDEN], 'Settings sits at the foot of the sidebar; hidden screens come last');
  assert.equal(ITEMS.length - HIDDEN.length, 16);
  assert.deepEqual(HIDDEN.map((it) => it.tabs[0][0]), ['/tiktok/5w1h']);
});

test('every old path still belongs to exactly one entry, and no path is listed twice (Review Focus #1)', () => {
  const paths = ITEMS.flatMap((it) => allTabs(it).map((t) => t[0]));
  assert.equal(new Set(paths).size, paths.length);
  // Every old path still opens: from one entry, or as an alias to the screen that replaced it.
  for (const p of LEGACY) assert.equal(ITEMS.filter((it) => has(it, p)).length + (ALIASES[p] ? 1 : 0), 1, p);
  assert.deepEqual([...paths].sort(), LEGACY.filter((p) => !ALIASES[p]).sort());
  for (const it of ITEMS) for (const t of allTabs(it)) assert.equal(typeof t[2], 'function', t[0]);
});

test('entries with a version per platform hold the right screens; single-platform entries say which', () => {
  const paths = (tabs) => tabs.map((t) => t[0]);
  assert.deepEqual([paths(item('Topic Research').platforms.tiktok), paths(item('Topic Research').platforms.youtube)], [['/tiktok/topic'], ['/research']]);
  assert.deepEqual([paths(item('Search').platforms.tiktok), paths(item('Search').platforms.youtube)], [['/tiktok/search'], ['/videos', '/channels']]);
  assert.deepEqual([paths(item('Channel Analysis').platforms.tiktok), paths(item('Channel Analysis').platforms.youtube)], [['/tiktok/channel'], ['/channel', '/compare']]);
  const collect = item('Collect Comments');
  assert.deepEqual([paths(collect.platforms.tiktok), paths(collect.platforms.youtube)], [['/tiktok/comments', '/tiktok/insight'], ['/comments', '/insight']]);
  assert.deepEqual(paths(item('Audience Insights').tabs), ['/ci', '/ci/topics', '/ci/comments', '/ci/runs']);
  assert.deepEqual(paths(item('Content Lab').tabs), ['/ci/lab/whys', '/ci/lab/brief', '/ci/lab/opportunities']);
  assert.deepEqual([item('Keywords').only, item('Watchlist').only], ['youtube', undefined]);
  assert.ok(!item('Video Analysis').platforms, 'one screen for both platforms');
});

test('lookups: the platform of a path, the tabs to show for it, where an entry opens', () => {
  const ch = item('Channel Analysis');
  assert.deepEqual([platformOf(ch, '/compare'), platformOf(ch, '/tiktok/channel'), platformOf(item('Watchlist'), '/follows')], ['youtube', 'tiktok', null]);
  assert.deepEqual(tabsFor(ch, '/compare').map((t) => t[0]), ['/channel', '/compare']);
  assert.deepEqual(tabsFor(item('Keywords'), '/ideas').map((t) => t[0]), ['/keywords', '/ideas']);
  assert.deepEqual([firstPath(ch), firstPath(ch, 'youtube'), firstPath(ch, 'nope'), firstPath(item('Watchlist'), 'youtube')], ['/tiktok/channel', '/channel', '/tiktok/channel', '/follows']);
  assert.equal(findItem('/compare'), ch);
  assert.equal(findItem('/khong-co'), HOME);
  assert.deepEqual(ALIASES, { '/tiktok/video': '/video', '/tiktok/insight/collected': '/ci/runs?new=1', '/insight/collected': '/ci/runs?new=1' });
});

test('search screens draw their own platform switch; Search holds Video on both platforms and Kênh on YouTube', () => {
  assert.deepEqual(ITEMS.filter((it) => it.inline).map((it) => it.label), ['Topic Research', 'Search']);
  const search = item('Search');
  assert.deepEqual([firstPath(search, 'youtube'), firstPath(search, 'tiktok')], ['/videos', '/tiktok/search']);
  assert.deepEqual([tabsFor(search, '/videos').map((t) => t[1]), tabsFor(search, '/tiktok/search').map((t) => t[1])], [['Video', 'Kênh'], ['Video']]);
  assert.deepEqual([tabsFor(item('Topic Research'), '/research').length, platformOf(search, '/channels')], [1, 'youtube']);
  assert.deepEqual([findItem('/channels'), findItem('/tiktok/search')], [search, search]);
});
