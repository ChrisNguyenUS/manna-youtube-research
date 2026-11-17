import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, INTRO, GAME_TABLE } from '../../src/core/soulprint/questions.js';
import { SECTIONS, emptyProfile } from '../../src/core/soulprint/profile.js';

test('twelve questions in order, each pointing at a real section and a real field', () => {
  assert.deepEqual(QUESTIONS.map((q) => q.id), ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11']);
  assert.deepEqual(QUESTIONS.map((q) => q.section), ['channels', 'business', 'game', 'game', 'avatar', 'dreamOutcome', 'pains', 'advantage', 'oneThing', 'statement', 'filter', 'pillars']);
  const e = /** @type {any} */ (emptyProfile());
  for (const q of QUESTIONS) {
    assert.ok(SECTIONS.includes(q.section), q.id);
    assert.ok(q.title && q.ask.length > 20, q.id);
    const root = q.target.split('.')[0];
    assert.ok(root in e, `${q.id} target ${q.target}`);
  }
});

test('the unfair advantage is asked before the authority statement, and "both games" has its tiebreakers', () => {
  const at = (s) => QUESTIONS.findIndex((q) => q.section === s);
  assert.ok(at('advantage') < at('statement'));
  assert.match(QUESTIONS[2].push, /1 triệu follower phần lớn không mua, hay 30\.000 follower có mua/);
  assert.match(QUESTIONS[9].ask, /lấy từ lợi thế ở câu 7/);
  assert.match(INTRO, /Khoảng 10 phút/);
  assert.deepEqual([GAME_TABLE.head.length, GAME_TABLE.rows.length], [3, 4]);
});
