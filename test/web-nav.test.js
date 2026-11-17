import { test } from 'node:test';
import assert from 'node:assert/strict';
// Loaded by URL, not by a literal path: nav.js lazy-loads every screen, and typecheck would follow those imports
// into all of web/ (which is not type-checked).
const { HOME, SOULPRINT, GROUPS, ITEMS, ALIASES, allTabs, has, platformOf, tabsFor, firstPath, findItem } = await import(new URL('../web/nav.js', import.meta.url).href);

const LEGACY = ['/', '/soulprint', '/tiktok/topic', '/tiktok/search', '/tiktok/insight', '/tiktok/insight/collected', '/video', '/tiktok/channel', '/tiktok/comments', '/tiktok/5w1h',
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
  assert.deepEqual(ALIASES, { '/tiktok/video': '/video' });
});
