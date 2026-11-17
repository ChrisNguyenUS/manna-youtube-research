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
