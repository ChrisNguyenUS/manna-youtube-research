import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as P from '../../src/sources/tiktok/parse.js';

const fx = (n) => JSON.parse(fs.readFileSync(`src/sources/tiktok/fixtures/${n}.json`, 'utf8'));

test('search page: videos only, normalized, paging fields', () => {
  const p = P.parseSearchPage(fx('search-page'), 'thi quốc tịch mỹ');
  assert.equal(p.ok, true);
  assert.equal(p.videos.length, 2, 'type 4 (users) skipped');
  assert.deepEqual(p.videos[0], {
    id: '7376610463154572560', url: 'https://www.tiktok.com/@creator1/video/7376610463154572560',
    caption: 'Đậu rồi! #thiquoctichmy #n400', hashtags: ['thiquoctichmy', 'n400'], createdAt: '2024-10-19T12:00:00.000Z',
    durationSec: 45, plays: 1000, likes: 100, comments: 20, shares: 5, saves: 15, author: 'creator1',
    authorName: 'Creator One', authorVerified: true, musicTitle: 'original sound - creator1',
    cover: 'https://p16.tiktokcdn.com/cover.jpg', query: 'thi quốc tịch mỹ',
  });
  assert.equal(p.videos[1].createdAt, null);
  assert.deepEqual([p.videos[1].authorName, p.videos[1].authorVerified, p.videos[1].musicTitle], ['', false, ''], 'missing creator fields default to empty');
  assert.deepEqual([p.hasMore, p.cursor, p.searchId], [true, 12, 'IMPR123']);
});
test('a 203 page with data is not an error; an error status without data is', () => {
  assert.equal(P.parseSearchPage({ ...fx('search-page'), status_code: 203 }, 'q').ok, true);
  assert.equal(P.parseSearchPage({ status_code: 10201 }, 'q').ok, false);
  assert.equal(P.parseSearchPage(null, 'q').ok, false);
});
test('search path carries search_id only after page 1', () => {
  assert.doesNotMatch(P.searchApiPath('a b', 0, 'X'), /search_id/);
  assert.match(P.searchApiPath('a b', 12, 'X'), /offset=12.*search_id=X|search_id=X.*offset=12/);
});
test('comment page drops commenter identity (Review Focus #5)', () => {
  const p = P.parseCommentPage(fx('comment-page'), null);
  assert.deepEqual(p.comments[0], { id: 'c1', parentId: null, isReply: false, text: 'Phỏng vấn có khó không ạ?', likes: 685, replies: 47, createdAt: '2024-10-19T00:00:00.000Z', pinned: false });
  assert.doesNotMatch(JSON.stringify(p), /secret_user|Secret Name|unique_id|nickname/);
  assert.deepEqual([p.hasMore, p.cursor, p.total], [true, 50, 1003]);
  const r = P.parseCommentPage(fx('reply-page'), 'c1');
  assert.deepEqual([r.comments[0].parentId, r.comments[0].isReply], ['c1', true]);
  assert.equal(P.parseCommentPage({ status_code: 10201 }, null).ok, false);
});
test('video ids and short links (Review Focus #2)', () => {
  assert.equal(P.extractVideoId('https://www.tiktok.com/@a/video/7376610463154572560?lang=vi'), '7376610463154572560');
  assert.equal(P.extractVideoId('https://www.tiktok.com/@a/photo/7376610463154572561'), '7376610463154572561');
  assert.equal(P.extractVideoId('7376610463154572560'), '7376610463154572560');
  assert.equal(P.extractVideoId('https://www.tiktok.com/@creator1'), null);
  assert.equal(P.extractVideoId('rác'), null);
  assert.equal(P.isShortLink('https://vm.tiktok.com/ZMabc/'), true);
  assert.equal(P.isShortLink('https://www.tiktok.com/t/ZTabc/'), true);
  assert.equal(P.isShortLink('https://www.tiktok.com/@a/video/1'), false);
});
test('takeNew skips seen ids and respects room', () => {
  const seen = new Set(['a']);
  const page = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.deepEqual(P.takeNew(page, seen, 2).map((c) => c.id), ['b', 'c']);
  assert.deepEqual(P.takeNew(page, seen, 5).map((c) => c.id), ['d']);
});
