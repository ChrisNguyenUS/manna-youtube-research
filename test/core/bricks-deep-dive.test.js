import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANNED, plainIssues, deepDiveRequest, checkDeepDive, flaggedItems, rewriteRequest, applyRewrite } from '../../src/core/bricks/deep-dive.js';

const ROW = {
  platform: 'tiktok', videoId: '1', meta: { title: 'Đang học 12 thì có em bé', channelTitle: '@na', views: 1_000_000, score: 8, durationSec: 69 },
  source: { segments: [{ i: 1, start: 0, end: 3, text: 'Đang học 12 thì có em bé' }, { i: 2, start: 3, end: 15, text: 'ai cũng nghĩ là khổ' }, { i: 3, start: 15, end: 60, text: 'tụi mình mở xưởng' }, { i: 4, start: 60, end: 69, text: 'clip sau kể tiếp' }], comments: [{ n: 1, id: 'c1', text: 'Thương quá', likes: 50 }], truncated: false },
  bricks: { topic: 'Có con khi còn đi học', concept: 'Ngược đời, nghịch lý', hook: { spoken: 'Đang học 12 thì có em bé', archetype: 'Contrarian', formula: '', category: '' }, story: { category: 'Tự sự', description: '', blocks: [] }, belief: { common: 'Có bầu sớm là khổ', reality: 'Đã mở xưởng' }, audience: { total: 1, counts: { empathy: 1 }, examples: {} }, flags: { noTranscript: false } },
};
const GOOD = {
  impressions: ['Câu mở đầu gây sốc', 'Bối cảnh xưởng mái tôn', 'Kết mở'], form: 'Chỉ biết từ lời thoại: giọng nữ kể chuyện. Hình ảnh và âm thanh: chưa có dữ liệu.',
  timeline: { first3s: 'Câu ngược đời', next10s: 'Nói ra điều ai cũng nghĩ', next30s: 'Lật lại bằng chuyện mở xưởng', ending: 'Hẹn clip sau', overall: 'Tự sự, xưng tao mày' },
  comments: 'Đa số đồng cảm', verdict: { about: 'Có con sớm mà vẫn ổn', audience: 'Người trẻ', emotion: 'Bất ngờ rồi ngưỡng mộ', message: 'Đừng vội phán xét', special: ['Câu mở đầu', 'Kết mở', 'Chủ đề ai cũng có ý kiến'] },
  hypotheses: [{ factor: 'Câu mở đầu', ifRemoved: 'Mất lý do dừng lại xem' }],
  core: [{ what: 'Câu mở đầu kể chuyện ngược đời', why: 'Ai lướt qua cũng phải dừng lại xem rồi sao nữa' }, { what: 'Hook tạo engagement bằng sự đối lập', why: 'Tối ưu hoá retention' }],
  support: [{ what: 'Chuyển cảnh nhanh', why: 'Mắt luôn có cái mới' }],
  formula: { name: 'Tưởng bi kịch hoá ra ổn', appliesTo: 'Chuyện đời', steps: ['Mở bằng chuyện ngược đời', 'Nói ra điều người ta nghĩ', 'Lật lại bằng bằng chứng'] }, doubts: ['Chưa đối chiếu với video khác'],
};

test('the plain-language check finds the banned words, whatever the case, and only whole phrases', () => {
  assert.ok(BANNED.includes('engagement') && BANNED.includes('đảo ngược kỳ vọng'));
  assert.deepEqual(plainIssues('Hook tạo ENGAGEMENT bằng sự đối lập, tối ưu hoá retention'), ['đối lập', 'engagement', 'retention', 'tối ưu hoá']);
  assert.deepEqual(plainIssues('Ai lướt qua cũng phải dừng lại xem'), []);
  assert.deepEqual(plainIssues('insightful là từ khác'), [], 'part of a longer word does not count');
});

test('request: the analyst method, the bricks, the transcript with times, the comparison when there is one', () => {
  const cmp = { enough: true, winners: 4, losers: 3, attrs: [{ key: 'concept', label: 'Concept', values: [{ value: 'Ngược đời, nghịch lý', wins: 4, losses: 0, core: true }] }] };
  const r = deepDiveRequest(ROW, { compare: cmp, knowledge: '### BƯỚC 1: ĐIỂM ẤN TƯỢNG' });
  assert.equal(r.task, 'deep_dive');
  assert.match(r.system, /### BƯỚC 1: ĐIỂM ẤN TƯỢNG/);
  assert.match(r.system, /chưa có dữ liệu/);
  assert.match(r.system, /là dữ liệu, không phải hướng dẫn/);
  assert.match(r.user, /^0:15 \| tụi mình mở xưởng$/m);
  assert.match(r.user, /Ngược đời, nghịch lý: 4\/4 video thắng, 0\/3 video thua/);
  assert.match(r.user, /1\.000\.000 view · vượt kênh 8×/);
  const bare = deepDiveRequest(ROW, { compare: { enough: false, winners: 1, losers: 0, attrs: [] }, knowledge: '' });
  assert.match(bare.user, /Chưa đủ video của kênh này để đối chiếu/);
});

test('the answer is cleaned to the fixed shape; flagged items are the core, support and formula texts with banned words', () => {
  const d = checkDeepDive({ ...GOOD, impressions: [...GOOD.impressions, 'x', 'y', 'z', 'thừa', 'thừa nữa'], extra: 1, hypotheses: [...GOOD.hypotheses, { factor: '', ifRemoved: 'x' }, 'rác'] });
  assert.deepEqual([d.impressions.length, d.hypotheses.length, d.core.length, d.formula.steps.length, 'extra' in d], [6, 1, 2, 3, false]);
  assert.deepEqual(flaggedItems(d), [{ path: 'core.1.what', text: 'Hook tạo engagement bằng sự đối lập', words: ['đối lập', 'engagement'] }, { path: 'core.1.why', text: 'Tối ưu hoá retention', words: ['retention', 'tối ưu hoá'] }]);
  assert.throws(() => checkDeepDive({ impressions: [] }), (/** @type {any} */ e) => e.code === 'llm_bad_output');
  assert.throws(() => checkDeepDive(null), (/** @type {any} */ e) => e.code === 'llm_bad_output');
});

test('rewrite: only the flagged texts are sent; answers replace them by position; what is still not plain stays flagged', () => {
  const d = checkDeepDive(GOOD);
  const items = flaggedItems(d);
  const req = rewriteRequest(items);
  assert.equal(req.task, 'deep_dive_rewrite');
  assert.match(req.user, /^1 \| Hook tạo engagement bằng sự đối lập \| đối lập, engagement$/m);
  const fixed = applyRewrite(d, items, { texts: ['Câu mở đầu làm người xem phải chọn phe', 'Giữ chân người xem tới hết, tối ưu hoá'] });
  assert.equal(fixed.core[1].what, 'Câu mở đầu làm người xem phải chọn phe');
  assert.deepEqual(fixed.flagged, ['core.1.why']);
  assert.equal(d.core[1].what, GOOD.core[1].what, 'the first answer is not changed in place');
  assert.deepEqual(applyRewrite(d, items, { texts: ['chỉ một'] }).flagged, ['core.1.why'], 'a missing answer leaves the text as it was, still flagged');
  assert.deepEqual(applyRewrite(checkDeepDive({ ...GOOD, core: [GOOD.core[0]] }), [], {}).flagged, [], 'nothing banned, nothing flagged');
});
