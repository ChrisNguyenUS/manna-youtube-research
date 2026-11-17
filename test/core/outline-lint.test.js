import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintScript, RULES } from '../../src/core/outline/lint.js';
import { BANNED } from '../../src/core/outline/lint-words.js';

const rules = (r) => r.issues.map((x) => x.rule);

test('banned words of the checklist, whole phrases only, with what to say instead (Review Focus #4)', () => {
  assert.ok(BANNED.some((b) => b.word === 'tuy nhiên' && /Nhưng mà/.test(b.suggest)));
  const r = lintScript('Video này tăng ENGAGEMENT rất mạnh. Tuy nhiên ai cũng sợ. Đây là insightful content.', { length: 45, leadMagnet: '' });
  const banned = r.issues.filter((x) => x.rule === 'banned');
  assert.deepEqual(banned.map((x) => [x.word, x.sentence]), [['engagement', 'Video này tăng ENGAGEMENT rất mạnh.'], ['tuy nhiên', 'Tuy nhiên ai cũng sợ.']]);
  assert.match(banned[1].suggest, /Nhưng mà/);
});

test('symbols, too many em dashes, a long sentence without a comma', () => {
  const long = Array.from({ length: 32 }, (_, i) => `từ${i}`).join(' ') + '.';
  const r = lintScript(`Hứa nhiều → bỏ cuộc. Một — hai — ba — bốn. ${long}`, { length: 45, leadMagnet: '' });
  assert.deepEqual(rules(r).filter((x) => x !== 'cta'), ['symbol', 'dash', 'long']);
  assert.equal(r.issues.find((x) => x.rule === 'dash').word, '3 lần');
  assert.ok(!rules(lintScript(`${long.slice(0, -1)}, rồi xong. Bấm theo dõi nhé.`, { length: 45, leadMagnet: '' })).includes('long'), 'a comma gives the reader a breath');
});

test('flat rhythm: four sentences in a row of nearly the same length, flagged once per run', () => {
  const flat = 'Tôi đi làm sớm. Tôi về nhà muộn. Tôi ăn cơm tối. Tôi đi ngủ sớm. Tôi dậy lúc năm. Bấm theo dõi nhé.';
  const r = lintScript(flat, { length: 45, leadMagnet: '' });
  assert.deepEqual(r.issues.filter((x) => x.rule === 'flat').map((x) => x.sentence), ['Tôi đi làm sớm.']);
  assert.ok(!rules(lintScript('Ngắn thôi. Câu này dài hơn hẳn vì có nhiều chữ hơn nhiều. Ngắn. Lại một câu dài với rất nhiều chữ ở trong. Bấm theo dõi nhé.', { length: 45, leadMagnet: '' })).includes('flat'));
});

test('call to action: a CTA word or the card\'s lead magnet; pace against the length', () => {
  assert.ok(rules(lintScript('Chỉ kể chuyện thôi.', { length: 45, leadMagnet: '' })).includes('cta'));
  assert.ok(!rules(lintScript('Comment chữ HỎI để nhận danh sách.', { length: 45, leadMagnet: '' })).includes('cta'));
  assert.ok(!rules(lintScript('Mình gửi bạn Danh Sách 100 Câu Hỏi.', { length: 45, leadMagnet: 'danh sách 100 câu hỏi' })).includes('cta'));
  const many = lintScript(`${Array.from({ length: 100 }, () => 'chữ').join(' ')}. Theo dõi nhé.`, { length: 30, leadMagnet: '' });
  assert.deepEqual([many.words, many.maxWords, rules(many).includes('pace')], [103, 90, true]);
  assert.equal(RULES.pace, 'Quá nhiều chữ so với độ dài video');
});

test('line endings, no punctuation, emoji, and the size limit (Review Focus #3)', () => {
  const r = lintScript('dòng một không dấu chấm\r\ndòng hai cũng vậy 😂\r\n\r\ntheo dõi để xem tiếp', { length: 45, leadMagnet: '' });
  assert.deepEqual(r.sentences, 3);
  assert.equal(r.cut, false);
  const big = lintScript(`${'Câu ngắn thôi nhé. '.repeat(1600)}`, { length: 90, leadMagnet: '' });
  assert.equal(big.cut, true);
  assert.deepEqual(lintScript('', { length: 45, leadMagnet: '' }), { words: 0, maxWords: 135, sentences: 0, cut: false, issues: [] });
});
