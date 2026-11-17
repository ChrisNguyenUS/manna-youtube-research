import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, ATTRIBUTES, emptyProfile, cleanProfile, readiness, contextText } from '../../src/core/soulprint/profile.js';

test('an empty profile has every section, and cleaning nothing gives the same', () => {
  const e = emptyProfile();
  assert.deepEqual(Object.keys(e), ['channels', 'startingFromZero', 'business', 'game', 'gameReason', 'objective', 'avatar', 'dreamOutcome', 'pains', 'advantage', 'oneThing', 'statement', 'filter', 'pillars', 'hypothesis', 'voice', 'answers']);
  assert.deepEqual(e.hypothesis.attributes.map((a) => a.name), ATTRIBUTES);
  for (const junk of [undefined, null, 7, 'x', []]) assert.deepEqual(cleanProfile(/** @type {any} */ (junk)), { profile: e, trimmed: [] });
});

test('cleaning keeps valid values, fixes types and drops what it does not know (Review Focus #1)', () => {
  const { profile: p, trimmed } = cleanProfile({
    channels: [{ platform: 'TikTok', handle: ' @toi ', url: 'https://www.tiktok.com/@toi' }, { handle: '' }, 'rác'],
    startingFromZero: 'yes',
    business: { offer: '  Dịch vụ hồ sơ ', price: 500, viewerIsBuyer: 'true', extra: 1 },
    game: 'both', objective: null,
    avatar: { name: 'Lan', believes: ['a', '', 3, 'b'], fears: 'không phải mảng' },
    pains: [{ text: 'Sợ trượt phỏng vấn', type: 'broad', pain: 9, source: 'x' }, { text: '   ' }, 'chuỗi', { text: 'Giấy tờ gì', pain: '2' }],
    statement: { chosen: 'Tôi giúp…', alternates: ['a'] },
    pillars: [{ name: 'Phỏng vấn', belief: 'Không cần luật sư', proof: ['10 hồ sơ'], subtopics: ['hỏi gì'] }, { name: '' }],
    hypothesis: { attributes: [{ name: 'Chủ đề', strength: 'strong', evidence: 'e' }, { name: 'Lạ', strength: 'strong' }], lane: 'l' },
    answers: { q4: 'trả lời', q99: 'lạ', q1: 5 },
    unknown: 1,
  });
  assert.deepEqual(p.channels, [{ platform: 'tiktok', handle: '@toi', url: 'https://www.tiktok.com/@toi' }]);
  assert.equal(p.startingFromZero, false, 'only a real boolean counts');
  assert.deepEqual(p.business, { offer: 'Dịch vụ hồ sơ', price: '500', buyer: '', howBought: '', viewerIsBuyer: null, note: '' });
  assert.deepEqual([p.game, p.objective], [null, '']);
  assert.deepEqual([p.avatar.believes, p.avatar.fears], [['a', '3', 'b'], []]);
  assert.deepEqual(p.pains, [{ text: 'Sợ trượt phỏng vấn', type: 'broad', pain: 5, source: 'self' }, { text: 'Giấy tờ gì', type: 'tactical', pain: 2, source: 'self' }]);
  assert.deepEqual(p.pillars, [{ name: 'Phỏng vấn', belief: 'Không cần luật sư', proof: ['10 hồ sơ'], subtopics: ['hỏi gì'] }]);
  assert.deepEqual(p.hypothesis.attributes.map((a) => [a.name, a.strength]), [['Chủ đề', 'strong'], ['Chiều sâu', null], ['Avatar', null], ['Cách kể', null], ['Hình ảnh', null]]);
  assert.deepEqual(p.answers, { q4: 'trả lời' });
  assert.ok(!('unknown' in p));
  assert.deepEqual(trimmed, []);
});

test('lists and texts over the limits are cut and reported', () => {
  const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const { profile: p, trimmed } = cleanProfile({
    pains: many(40, (i) => ({ text: `đau ${i}` })),
    pillars: many(7, (i) => ({ name: `trụ ${i}`, subtopics: many(35, (j) => `con ${j}`) })),
    avatar: { believes: many(12, (i) => `tin ${i}`), portrait: 'x'.repeat(2500) },
    channels: many(11, (i) => ({ handle: `@k${i}` })),
    oneThing: 'y'.repeat(400),
  });
  assert.deepEqual([p.pains.length, p.pillars.length, p.pillars[0].subtopics.length, p.avatar.believes.length, p.channels.length], [LIMITS.pains, LIMITS.pillars, LIMITS.subtopics, LIMITS.list, LIMITS.channels]);
  assert.deepEqual([p.avatar.portrait.length, p.oneThing.length], [LIMITS.text, LIMITS.short]);
  assert.deepEqual(trimmed, ['channels', 'avatar', 'pains', 'pillars']);
});

test('readiness: six checks, ready only when all hold', () => {
  assert.deepEqual([readiness(emptyProfile()).done, readiness(emptyProfile()).ready], [0, false]);
  const { profile: p } = cleanProfile({
    business: { offer: 'x' }, game: 'conversion', avatar: { portrait: 'p' }, statement: { chosen: 's' },
    pains: [1, 2, 3, 4].map((i) => ({ text: `đau ${i}` })), pillars: [1, 2, 3].map((i) => ({ name: `trụ ${i}` })),
  });
  const r = readiness(p);
  assert.deepEqual([r.done, r.total, r.ready], [5, 6, false]);
  assert.deepEqual(r.checks.filter((c) => !c.ok).map((c) => c.key), ['pains']);
  p.pains.push({ text: 'đau 5', type: 'tactical', pain: 3, source: 'self' });
  assert.equal(readiness(p).ready, true);
});

test('context text: empty profile gives nothing; a filled one names game, statement, avatar, the 5 worst pains, pillars and the filter', () => {
  assert.equal(contextText(emptyProfile()), '');
  const { profile: p } = cleanProfile({
    game: 'conversion', objective: '20 khách mỗi tháng', statement: { chosen: 'Tôi giúp người bảo lãnh tự làm hồ sơ' },
    avatar: { name: 'Lan', tag: 'bảo lãnh chồng', portrait: 'p'.repeat(900) },
    pains: [1, 5, 3, 4, 2, 5, 1].map((n, i) => ({ text: `đau ${i}`, pain: n })),
    pillars: [{ name: 'Phỏng vấn', belief: 'Không cần luật sư' }, { name: 'Giấy tờ' }], filter: 'Có giá trị với Lan không?',
  });
  const t = contextText(p);
  assert.match(t, /^HỒ SƠ KÊNH \(Soulprint\)/);
  assert.match(t, /Game: Trúng \(views đúng người, đo bằng khách\)\. Mục tiêu 12–18 tháng: 20 khách mỗi tháng/);
  assert.match(t, /Câu định vị: Tôi giúp người bảo lãnh tự làm hồ sơ/);
  assert.match(t, /Avatar: Lan \(bảo lãnh chồng\)\. p{600}…/);
  assert.deepEqual([...t.matchAll(/^- đau (\d)$/gm)].map((m) => m[1]), ['1', '5', '3', '2', '4'], 'by pain, ties in the owner\'s order');
  assert.match(t, /- Phỏng vấn: Không cần luật sư\n- Giấy tờ\n/);
  assert.match(t, /Câu lọc: Có giá trị với Lan không\?$/);
  assert.ok(!/Lợi thế|undefined|null/.test(t));
});
