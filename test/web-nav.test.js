import { test } from 'node:test';
import assert from 'node:assert/strict';
// Loaded by URL, not by a literal path: nav.js lazy-loads every screen, and typecheck would follow those imports
// into all of web/ (which is not type-checked).
const { HOME, SOULPRINT, GROUPS, ITEMS, ALIASES, allTabs, has, platformOf, tabsFor, firstPath, findItem } = await import(new URL('../web/nav.js', import.meta.url).href);

const LEGACY = ['/', '/soulprint', '/tiktok/topic', '/tiktok/search', '/tiktok/insight', '/tiktok/insight/collected', '/insight', '/insight/collected', '/video', '/tiktok/channel', '/tiktok/comments', '/tiktok/5w1h',
  '/ci', '/ci/topics', '/ci/comments', '/ci/lab/whys', '/ci/lab/brief', '/ci/lab/opportunities', '/ci/runs',
  '/research', '/videos', '/comments', '/channels', '/channel', '/compare', '/keywords', '/ideas', '/follows', '/history', '/saved', '/settings', '/bricks', '/board', '/board/review'];
const item = (label) => ITEMS.find((it) => it.label === label);

test('groups are jobs, in this order, and the sidebar has twenty entries', () => {
  assert.deepEqual(GROUPS.map((g) => [g.key, g.title, g.items.map((it) => it.label)]), [
    ['find', 'Tìm', ['Chủ đề', 'Video', 'Kênh', 'Từ khoá', 'Theo dõi']],
    ['dissect', 'Phân tích', ['Phân tích video', 'Phân tích kênh', 'Thư viện gạch']],
    ['ci', 'Customer Intelligence', ['Toàn cảnh', 'Chủ đề & Nỗi đau', 'Bình luận & Câu hỏi', 'Content Lab', 'Lần phân tích & AI', 'Thu thập comment']],
    ['make', 'Làm', ['Bảng ý tưởng']],
    ['library', 'Lưu trữ', ['Lịch sử', 'Đã lưu', 'Cài đặt']],
  ]);
  assert.deepEqual(ITEMS.slice(0, 2), [HOME, SOULPRINT]);
  assert.equal(ITEMS.length, 20);
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
  assert.deepEqual([paths(item('Chủ đề').platforms.tiktok), paths(item('Chủ đề').platforms.youtube)], [['/tiktok/topic'], ['/research']]);
  assert.deepEqual([paths(item('Video').platforms.tiktok), paths(item('Video').platforms.youtube)], [['/tiktok/search'], ['/videos']]);
  assert.deepEqual([item('Kênh').only, paths(item('Kênh').tabs)], ['youtube', ['/channels']]);
  assert.deepEqual([paths(item('Phân tích kênh').platforms.tiktok), paths(item('Phân tích kênh').platforms.youtube)], [['/tiktok/channel'], ['/channel', '/compare']]);
  const collect = item('Thu thập comment');
  assert.deepEqual([paths(collect.platforms.tiktok), paths(collect.platforms.youtube)], [['/tiktok/comments', '/tiktok/insight', '/tiktok/insight/collected', '/tiktok/5w1h'], ['/comments', '/insight', '/insight/collected']]);
  assert.deepEqual(paths(item('Content Lab').tabs), ['/ci/lab/whys', '/ci/lab/brief', '/ci/lab/opportunities']);
  assert.deepEqual([item('Từ khoá').only, item('Theo dõi').only], ['youtube', undefined]);
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

test('search screens draw their own platform switch; switching lands on the same job on the other platform', () => {
  assert.deepEqual(ITEMS.filter((it) => it.inline).map((it) => it.label), ['Chủ đề', 'Video', 'Kênh']);
  const video = item('Video');
  assert.deepEqual([firstPath(video, 'youtube'), firstPath(video, 'tiktok')], ['/videos', '/tiktok/search']);
  assert.deepEqual([tabsFor(video, '/videos').length, tabsFor(item('Chủ đề'), '/research').length], [1, 1]);
  assert.deepEqual([findItem('/channels'), findItem('/tiktok/search')], [item('Kênh'), video]);
});
