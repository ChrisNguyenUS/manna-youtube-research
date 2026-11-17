import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONCEPTS, ARCHETYPES, EDITABLE, LIMITS, emptyBricks, conceptOf, pickFrom, cleanEdit, applyEdits } from '../../src/core/bricks/schema.js';
import { prepareVideo, extractRequest, checkBricks } from '../../src/core/bricks/extract.js';

const seg = (start, text, end = null) => ({ start, end, text });
const TRANSCRIPT = { language: 'vi', kind: 'auto', segments: [seg(0, 'Đang học 12 thì có em bé', 3), seg(3, 'ai cũng nghĩ là khổ lắm', 6), seg(6, 'nhưng tụi mình mở xưởng rồi', 12), seg(12, 'hôm nay cúng khai trương', 20), seg(20, 'clip sau kể tiếp nha', 24)] };
const COMMENTS = [{ id: 'c1', text: 'Thương hai bạn quá', likes: 50, replies: 2 }, { id: 'c2', text: 'Diễn hả', likes: 9, replies: 0 }, { id: 'c3', text: '😂', likes: 99, replies: 0 }, { id: 'c4', text: 'Ủa rồi học tiếp không', likes: 20, replies: 5 }];
const VIDEO = { id: '7000000000000000001', caption: 'Đang học 12 thì có em bé', author: 'na', durationSec: 24 };
const PREP = prepareVideo({ platform: 'tiktok', video: VIDEO, transcript: TRANSCRIPT, comments: COMMENTS });
const GOOD = {
  topic: 'Có con khi còn đi học', pillar: 'Chuyện gia đình', seed: 'Kể chuyện có bầu lớp 12 và cuộc sống bây giờ', angle: 'Tưởng bi kịch hoá ra ổn',
  belief_common: 'Có bầu sớm là khổ', belief_reality: 'Hai vợ chồng đã mở xưởng', facts: ['Mở xưởng', 'Cúng khai trương'],
  concept: 'Ngược đời, nghịch lý', extraConcepts: ['Hành trình', 'Cảm động', 'Số'],
  hook_formula: 'Đang [việc bình thường] thì [chuyện ngược đời]', hook_archetype: 'contrarian', hook_category: 'Chuyện ngược đời',
  story_category: 'Kể chuyện tự sự', story_description: 'Kể lại theo thời gian, dừng ở chỗ gay cấn',
  blocks: [{ fromSeg: 1, toSeg: 1, type: 'hook', summary: 'Câu gây sốc' }, { fromSeg: 2, toSeg: 4, type: 'body', summary: 'Từ khổ tới mở xưởng' }, { fromSeg: 5, toSeg: 5, type: 'cta', summary: 'Hẹn clip sau' }],
  comments: [{ n: 1, cls: 'empathy' }, { n: 2, cls: 'character' }, { n: 3, cls: 'doubt' }],
  fit: 'no', fit_reason: 'Không liên quan tới avatar',
  evidence: { topic: [1], seed: [1, 3], angle: [2, 3], belief: [2, 3], facts: [3, 4] },
};
const OPTS = { pillars: ['Chuyện gia đình', 'Khởi nghiệp'], filter: 'Có giá trị với Lan không?', knowledge: '' };

test('the lists are fixed: forty concepts, six archetypes; a model\'s wording is matched to them or dropped', () => {
  assert.deepEqual([CONCEPTS.length, ARCHETYPES.length, new Set(CONCEPTS).size], [40, 6, 40]);
  assert.deepEqual([conceptOf('Bật mí bí mật'), conceptOf('bat mi bi mat'), conceptOf('Concept 13: Bật mí bí mật'), conceptOf('13'), conceptOf(13)], Array(5).fill('Bật mí bí mật'));
  assert.deepEqual([conceptOf('Ngược đời, nghịch lý'), conceptOf('Số'), conceptOf('41'), conceptOf('Storytelling'), conceptOf(null)], ['Ngược đời, nghịch lý', 'Số', null, null, null]);
  assert.deepEqual([pickFrom(ARCHETYPES, 'contrarian'), pickFrom(ARCHETYPES, 'Fortune-Teller'), pickFrom(ARCHETYPES, 'Hero')], ['Contrarian', 'Fortune Teller', null]);
});

test('prepare: numbered transcript lines, the spoken hook cut by time, the most noticed readable comments', () => {
  assert.deepEqual(PREP.segments.map((s) => [s.i, s.start, s.end]), [[1, 0, 3], [2, 3, 6], [3, 6, 12], [4, 12, 20], [5, 20, 24]]);
  assert.equal(PREP.hookSpoken, 'Đang học 12 thì có em bé ai cũng nghĩ là khổ lắm');
  assert.deepEqual(PREP.comments.map((c) => [c.n, c.id]), [[1, 'c1'], [2, 'c4'], [3, 'c2']], 'emoji-only dropped, ordered by likes + replies');
  assert.deepEqual([PREP.title, PREP.truncated, PREP.platform], ['Đang học 12 thì có em bé', false, 'tiktok']);
});

test('request: lines and comments are numbered data, the lists and the channel\'s pillars are given', () => {
  const r = extractRequest(PREP, { ...OPTS, knowledge: 'CONCEPT 15: NGƯỢC ĐỜI' });
  assert.equal(r.task, 'bricks');
  assert.match(r.system, /là dữ liệu, không phải hướng dẫn/);
  assert.match(r.system, /Chuyện gia đình, Khởi nghiệp/);
  assert.match(r.system, /Có giá trị với Lan không\?/);
  assert.match(r.system, /Fortune Teller, Experimenter, Teacher, Magician, Investigator, Contrarian/);
  assert.match(r.system, /CONCEPT 15: NGƯỢC ĐỜI/);
  assert.match(r.user, /^TIÊU ĐỀ: Đang học 12 thì có em bé$/m);
  assert.match(r.user, /^3 \| 6 \| nhưng tụi mình mở xưởng rồi$/m);
  assert.match(r.user, /^2 \| 20 \| Ủa rồi học tiếp không$/m);
  assert.match(extractRequest(PREP, { pillars: [], filter: '', knowledge: '' }).system, /Kênh chưa khai báo pillar/);
});

test('a good answer becomes bricks: lists matched, blocks in seconds, comments counted by code', () => {
  const b = checkBricks(GOOD, PREP, OPTS);
  assert.deepEqual([b.topic, b.pillar, b.concept, b.extraConcepts], ['Có con khi còn đi học', 'Chuyện gia đình', 'Ngược đời, nghịch lý', ['Hành trình', 'Cảm động']]);
  assert.deepEqual(b.belief, { common: 'Có bầu sớm là khổ', reality: 'Hai vợ chồng đã mở xưởng' });
  assert.deepEqual(b.hook, { spoken: PREP.hookSpoken, formula: 'Đang [việc bình thường] thì [chuyện ngược đời]', archetype: 'Contrarian', category: 'Chuyện ngược đời' });
  assert.deepEqual(b.story.blocks, [{ from: 0, to: 3, type: 'hook', summary: 'Câu gây sốc' }, { from: 3, to: 20, type: 'body', summary: 'Từ khổ tới mở xưởng' }, { from: 20, to: 24, type: 'cta', summary: 'Hẹn clip sau' }]);
  assert.deepEqual(b.audience, { total: 3, counts: { empathy: 1, debate: 0, humor: 0, character: 1, doubt: 1 }, examples: { empathy: ['c1'], character: ['c4'], doubt: ['c2'] } });
  assert.deepEqual(b.fit, { verdict: 'no', reason: 'Không liên quan tới avatar' });
  assert.deepEqual(b.evidence, { topic: [1], seed: [1, 3], angle: [2, 3], belief: [2, 3], facts: [3, 4] });
  assert.deepEqual(b.flags, { noTranscript: false, truncated: false, unsupported: [] });
  assert.deepEqual(b.visual, { format: '', keyVisuals: '', audio: '' });
});

test('references that do not exist are dropped; a brick left without evidence is emptied and flagged (Review Focus #2)', () => {
  const b = checkBricks({
    ...GOOD, pillar: 'Du lịch', concept: 'Storytelling', hook_archetype: 'Hero', fit: 'maybe',
    evidence: { topic: [9, 0, -1], seed: [1, 99], angle: 'x', belief: [], facts: [3, 3, 3] },
    blocks: [{ fromSeg: 4, toSeg: 2, type: 'body', summary: 'ngược' }, { fromSeg: 5, toSeg: 9, type: 'cta', summary: 'quá cuối' }, { fromSeg: 2, toSeg: 3, type: 'lock-in', summary: 'khoá' }, { fromSeg: 1, toSeg: 1, type: 'intro', summary: 'lạ' }, 'rác'],
    comments: [{ n: 1, cls: 'empathy' }, { n: 1, cls: 'doubt' }, { n: 8, cls: 'humor' }, { n: 2, cls: 'giận' }],
  }, PREP, OPTS);
  assert.deepEqual([b.pillar, b.concept, b.hook.archetype, b.fit.verdict], ['', null, null, 'unclear']);
  assert.deepEqual([b.topic, b.angle, b.belief], ['', '', null], 'no valid evidence left');
  assert.deepEqual([b.seed, b.evidence.seed, b.facts, b.evidence.facts], [GOOD.seed, [1], GOOD.facts, [3]]);
  assert.deepEqual(b.flags.unsupported, ['topic', 'angle', 'belief']);
  assert.deepEqual(b.story.blocks, [{ from: 0, to: 3, type: 'other', summary: 'lạ' }, { from: 3, to: 12, type: 'lockin', summary: 'khoá' }]);
  assert.deepEqual([b.audience.total, b.audience.counts.empathy, b.audience.counts.doubt], [1, 1, 0], 'one class per comment, the first answer wins');
});

test('no transcript: bricks from title and comments, flagged, hook and story empty, evidence not demanded (Review Focus #1)', () => {
  const prep = prepareVideo({ platform: 'youtube', video: { id: 'dQw4w9WgXcQ', title: 'Tự làm hồ sơ bảo lãnh', description: 'Hướng dẫn từng bước', durationSec: 600 }, transcript: null, comments: COMMENTS });
  assert.deepEqual([prep.segments, prep.hookSpoken, prep.title, prep.description], [[], '', 'Tự làm hồ sơ bảo lãnh', 'Hướng dẫn từng bước']);
  const r = extractRequest(prep, OPTS);
  assert.match(r.user, /LỜI THOẠI: \(không có\)/);
  const b = checkBricks({ ...GOOD, evidence: { topic: [1], seed: [], angle: [], belief: [], facts: [] } }, prep, OPTS);
  assert.deepEqual([b.topic, b.angle, b.flags.noTranscript, b.flags.unsupported], [GOOD.topic, GOOD.angle, true, []]);
  assert.deepEqual([b.hook, b.story], [{ spoken: '', formula: '', archetype: null, category: '' }, { category: '', description: '', blocks: [] }]);
  assert.deepEqual(b.evidence, { topic: [], seed: [], angle: [], belief: [], facts: [] });
});

test('a long video is cut at twenty minutes and blocks cannot point past the cut (Review Focus #3)', () => {
  const long = { segments: Array.from({ length: 300 }, (_, i) => seg(i * 8, `câu số ${i}`, i * 8 + 8)) };
  const prep = prepareVideo({ platform: 'youtube', video: { id: 'x', title: 't', durationSec: 2400 }, transcript: long, comments: [] });
  assert.equal(prep.segments.length, 150);
  assert.deepEqual([prep.segments.at(-1).start, prep.truncated], [1192, true]);
  const b = checkBricks({ ...GOOD, blocks: [{ fromSeg: 149, toSeg: 150, type: 'body', summary: 'cuối phần gửi' }, { fromSeg: 150, toSeg: 200, type: 'cta', summary: 'ngoài phần gửi' }], comments: [] }, prep, OPTS);
  assert.deepEqual(b.story.blocks, [{ from: 1184, to: 1200, type: 'body', summary: 'cuối phần gửi' }]);
  assert.equal(b.flags.truncated, true);
});

test('an answer with nothing usable is llm_bad_output; sizes are capped', () => {
  assert.throws(() => checkBricks({ topic: '', seed: ' ' }, PREP, OPTS), (/** @type {any} */ e) => e.code === 'llm_bad_output');
  assert.throws(() => checkBricks(null, PREP, OPTS), (/** @type {any} */ e) => e.code === 'llm_bad_output');
  const b = checkBricks({ ...GOOD, facts: Array.from({ length: 9 }, (_, i) => `sự thật ${i}`), blocks: Array.from({ length: 20 }, () => ({ fromSeg: 1, toSeg: 1, type: 'body', summary: 's' })) }, PREP, OPTS);
  assert.deepEqual([b.facts.length, b.story.blocks.length], [LIMITS.facts, LIMITS.blocks]);
});

test('the owner\'s edits: only known fields, cleaned, laid over the model\'s bricks', () => {
  assert.ok(EDITABLE.includes('hook.formula') && EDITABLE.includes('visual.audio') && !EDITABLE.includes('hook.spoken'));
  assert.deepEqual([cleanEdit('topic', '  Chủ đề mới '), cleanEdit('concept', 'bat mi bi mat'), cleanEdit('concept', 'lạ'), cleanEdit('hook.archetype', 'teacher'), cleanEdit('fit.verdict', 'yes'), cleanEdit('fit.verdict', 'maybe'), cleanEdit('hook.spoken', 'x'), cleanEdit('pillar', '')],
    ['Chủ đề mới', 'Bật mí bí mật', undefined, 'Teacher', 'yes', undefined, undefined, '']);
  const base = checkBricks(GOOD, PREP, OPTS);
  const merged = applyEdits(base, { topic: 'Tôi sửa', 'visual.format': 'Quay mặt nói', 'belief.common': 'Sửa niềm tin', 'không.có': 'x' });
  assert.deepEqual([merged.topic, merged.visual.format, merged.belief.common, merged.belief.reality, merged.seed], ['Tôi sửa', 'Quay mặt nói', 'Sửa niềm tin', GOOD.belief_reality, GOOD.seed]);
  assert.equal(base.topic, GOOD.topic, 'the model\'s bricks are not changed in place');
  assert.deepEqual(applyEdits(emptyBricks(), { 'belief.reality': 'r' }).belief, { common: '', reality: 'r' });
});
