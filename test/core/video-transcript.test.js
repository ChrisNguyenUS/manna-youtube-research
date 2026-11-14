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
