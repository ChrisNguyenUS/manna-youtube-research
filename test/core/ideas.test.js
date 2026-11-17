import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGO, QUESTIONS, LIMITS, emptyCard, cleanCard, statusOf, checksOf, batchCounts, batchNudge } from '../../src/core/ideas/card.js';
import { keywords, precedentOf } from '../../src/core/ideas/precedent.js';

const row = (platform, videoId, score, b) => ({ platform, videoId, meta: { title: `Video ${videoId}`, score }, bricks: { pillar: '', concept: null, topic: '', ...b } });
const LIB = [
  row('tiktok', '1', 8, { pillar: 'Phỏng vấn', concept: 'Bật mí bí mật', topic: 'Phỏng vấn quốc tịch hỏi gì' }),
  row('tiktok', '2', 5, { pillar: 'Giấy tờ', concept: 'Số', topic: 'Giấy tờ bảo lãnh vợ chồng' }),
  row('tiktok', '3', 0.5, { pillar: 'Phỏng vấn', concept: 'Bật mí bí mật', topic: 'Phỏng vấn hỏi gì' }),
  row('youtube', '4', null, { pillar: 'Phỏng vấn', concept: 'Bật mí bí mật', topic: 'Phỏng vấn hỏi gì' }),
  row('tiktok', '5', 3, { pillar: 'Khác', concept: 'Hài hước', topic: 'Phỏng vấn quốc tịch trượt vì đâu' }),
];
const card = (o) => cleanCard({ origin: { kind: 'pain', ref: '0', snapshot: { text: 'x' } }, ...o });

test('the lists: seven bricks, six questions, ten live cards per batch', () => {
  assert.deepEqual(LEGO.map((x) => x[1]), ['Topic', 'Angle', 'Hook Structure', 'Story Structure', 'Visual Format', 'Key Visuals', 'Audio']);
  assert.deepEqual(QUESTIONS.map((x) => x[0]), ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']);
  assert.equal(LIMITS.live, 10);
  assert.deepEqual([statusOf('chosen'), statusOf('xong'), statusOf(undefined)], ['chosen', 'draft', 'draft']);
});

test('cleaning: unknown origins become self, bricks are from the seven and never both kept and remixed, values are matched or dropped', () => {
  const c = cleanCard({
    origin: { kind: 'robot', ref: 'x', snapshot: { a: 1 } },
    keep: ['topic', 'hookStructure', 'nope', 'topic'], remix: ['hookStructure', 'audio'],
    topic: '  Phỏng vấn hỏi gì ', concept: 'bat mi bi mat', funnel: 'mua', filterOk: 'maybe', publishDate: '17/11/2026',
    pain: { text: 'Sợ trượt', source: 'x', evidence: [{ text: 'Em sợ', likes: '7' }, { text: '' }, 'rác'] },
    title: { d: 'Người bảo lãnh', text: 'Bật mí 5 câu hỏi' }, notes: { q2: 'đã hỏi khách', q9: 'x' }, extra: 1,
  });
  assert.deepEqual(c.origin, { kind: 'self', ref: null, snapshot: null });
  assert.deepEqual([c.keep, c.remix], [['topic', 'hookStructure'], ['audio']]);
  assert.deepEqual([c.topic, c.concept, c.funnel, c.filterOk, c.publishDate], ['Phỏng vấn hỏi gì', 'Bật mí bí mật', null, 'unknown', '']);
  assert.deepEqual(c.pain, { text: 'Sợ trượt', source: 'self', evidence: [{ text: 'Em sợ', likes: 7 }] });
  assert.deepEqual(c.title, { d: 'Người bảo lãnh', i: '', c: '', k: '', text: 'Bật mí 5 câu hỏi' });
  assert.deepEqual(c.notes, { q1: '', q2: 'đã hỏi khách', q3: '', q4: '', q5: '', q6: '' });
  assert.ok(!('extra' in c));
  assert.deepEqual(cleanCard(null), emptyCard());
  assert.equal(cleanCard({ origin: { kind: 'brick', ref: 'tiktok:1', snapshot: { title: 't' } } }).origin.snapshot.title, 't');
});

test('keywords: accents and case ignored, common words never count (Review Focus #4)', () => {
  assert.deepEqual(keywords('Phỏng vấn quốc tịch hỏi GÌ khi đi'), ['phong', 'van', 'quoc', 'tich', 'hoi']);
  assert.deepEqual(keywords('Bảo lãnh, bao lâu?'), ['bao', 'lanh', 'lau']);
  assert.deepEqual(keywords('là có của và'), []);
});

test('precedent: winners only, by pillar and concept or by two shared keywords, highest score first', () => {
  const a = precedentOf(card({ pillar: 'Phỏng vấn', concept: 'Bật mí bí mật', topic: 'Hỏi gì khi đi phỏng vấn' }), LIB, { min: 3 });
  assert.deepEqual([a.ok, a.matches.map((m) => m.videoId)], ['yes', ['1', '5']]);
  assert.match(a.note, /2 video vượt kênh tương tự/);
  assert.deepEqual(a.matches[0], { platform: 'tiktok', videoId: '1', title: 'Video 1', score: 8 });
  assert.deepEqual(precedentOf(card({ pillar: 'Phỏng vấn', concept: 'Bật mí bí mật', topic: 'Hỏi gì khi đi phỏng vấn' }), LIB, { min: 6 }).matches.map((m) => m.videoId), ['1']);
  const b = precedentOf(card({ topic: 'Thẻ xanh mất bao lâu' }), LIB, { min: 3 });
  assert.deepEqual([b.ok, b.matches], ['no', []]);
  assert.match(b.note, /Chưa thấy video vượt kênh nào/);
});

test('precedent: a card made from a winning video counts its own video; self-made, empty library, no winners', () => {
  const own = precedentOf(card({ origin: { kind: 'brick', ref: 'tiktok:2', snapshot: { score: 5 } }, topic: 'Chủ đề khác hẳn' }), LIB, { min: 3 });
  assert.deepEqual(own.matches.map((m) => m.videoId), ['2']);
  const weakOwn = precedentOf(card({ origin: { kind: 'brick', ref: 'tiktok:3', snapshot: { score: 0.5 } }, topic: 'Chủ đề khác hẳn' }), LIB, { min: 3 });
  assert.equal(weakOwn.ok, 'no');
  const self = precedentOf(cleanCard({ pillar: 'Phỏng vấn', concept: 'Bật mí bí mật' }), LIB, { min: 3 });
  assert.deepEqual([self.ok, self.matches], ['no', []]);
  assert.match(self.note, /thử nghiệm gốc/);
  assert.deepEqual(precedentOf(card({ topic: 'x' }), [], { min: 3 }), { ok: 'unknown', note: 'Thư viện gạch chưa có video nào', matches: [] });
  const losers = precedentOf(card({ topic: 'x' }), [LIB[2], LIB[3]], { min: 3 });
  assert.deepEqual([losers.ok, losers.note], ['unknown', 'Thư viện gạch chưa có video nào vượt kênh từ 3×']);
});

test('the six checks come from the card; ready needs q1 to q4, q6 and the filter when there is one', () => {
  const yes = { ok: 'yes', note: '1 video vượt kênh tương tự', matches: [] };
  const full = card({ pain: { text: 'Sợ trượt' }, angle: 'Không cần luật sư', belief: { common: 'Phải thuê', reality: 'Tự làm được' }, leadMagnet: 'Danh sách 100 câu hỏi', filterOk: 'yes', notes: { q3: 'góc của tôi' } });
  const r = checksOf(full, yes, { hasFilter: true });
  assert.deepEqual(r.checks.map((c) => [c.key, c.ok]), [['q1', 'yes'], ['q2', 'yes'], ['q3', 'yes'], ['q4', 'yes'], ['q5', 'no'], ['q6', 'yes']]);
  assert.deepEqual([r.ready, r.missing], [true, []], 'q5 is not needed to be ready');
  assert.deepEqual([r.checks[0].note, r.checks[2].note, r.checks[2].by], ['1 video vượt kênh tương tự', 'góc của tôi', 'code']);
  const noFilter = checksOf({ ...full, filterOk: 'unknown' }, yes, { hasFilter: true });
  assert.deepEqual([noFilter.ready, noFilter.missing], [false, ['Câu lọc']]);
  assert.equal(checksOf({ ...full, filterOk: 'unknown' }, yes, { hasFilter: false }).ready, true, 'no filter question in Soulprint: not required');
  const thin = checksOf(card({ pain: { text: 'Sợ trượt' } }), { ok: 'unknown', note: '', matches: [] }, { hasFilter: false });
  assert.deepEqual(thin.missing, ['Câu 1', 'Câu 3', 'Câu 4', 'Câu 6']);
  assert.equal(checksOf(cleanCard({ keep: ['topic'] }), yes, { hasFilter: false }).checks[4].ok, 'skip', 'a self-made card has no source bricks to keep');
  assert.equal(checksOf(card({ remix: ['audio'] }), yes, { hasFilter: false }).checks[4].ok, 'yes');
});

test('batch counts and the nudge after Kallaway\'s mix', () => {
  const cards = [
    ...Array.from({ length: 3 }, () => ({ status: 'draft', card: card({ origin: { kind: 'brick', ref: 'tiktok:1', snapshot: {} } }), ready: true })),
    ...Array.from({ length: 3 }, () => ({ status: 'chosen', card: cleanCard({}), ready: false })),
    { status: 'dropped', card: cleanCard({}), ready: false },
  ];
  const n = batchCounts(cards);
  assert.deepEqual(n, { live: 6, outlier: 3, other: 3, dropped: 1, ready: 3, chosen: 3 });
  assert.match(batchNudge(n), /nhiều ý không đến từ video đã thắng/);
  assert.equal(batchNudge({ live: 3, outlier: 1, other: 2, dropped: 0, ready: 0, chosen: 0 }), null, 'too early to say');
  assert.match(batchNudge({ live: 8, outlier: 8, other: 0, dropped: 0, ready: 0, chosen: 0 }), /Chưa có ý nào ngoài video đã thắng/);
  assert.equal(batchNudge({ live: 10, outlier: 8, other: 2, dropped: 0, ready: 0, chosen: 0 }), null);
});
