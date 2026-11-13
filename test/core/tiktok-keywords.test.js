import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandKeywords, intentOf, foldWords, topHashtags } from '../../src/core/tiktok/keywords.js';
import { customerVoice, classifyVoice, voiceTopics } from '../../src/core/analysis/customer-voice.js';
import { toXlsx } from '../../src/core/report/xlsx.js';

// What TikTok returned for "bảo lãnh vợ chồng" on 2026-11-12 (trimmed).
const FOUND = {
  suggestions: ['bảo lãnh vợ chồng qua mỹ', 'bảo lãnh vợ chồng 2026', 'bảo lãnh vợ chồng mới nhất', 'cách làm timeline bảo lãnh vợ chồng', 'bảo lãnh vợ chồng mất bao lâu', 'bảo lãnh vợ chồng từ f1'],
  related: ['bảo lãnh vợ chồng 2026', 'bảo lãnh vợ chồng 100 nghìn usd', 'bảo lãnh hôn phu', 'bảo lãnh vợ sang nhật', 'bảo lãnh vợ chồng bao lâu'],
};

test('related keywords: topic first, dated variants merged, other countries dropped, grouped by intent', () => {
  const list = expandKeywords('bảo lãnh vợ chồng', FOUND, { limit: 5 });
  assert.equal(list[0].keyword, 'bảo lãnh vợ chồng');
  assert.deepEqual(list[0].sources.sort(), ['related', 'suggest', 'topic'], '"… 2026" and "… mới nhất" are the topic itself');
  assert.ok(!list.some((k) => /2026|mới nhất/.test(k.keyword)));
  const nhat = list.find((k) => k.keyword === 'bảo lãnh vợ sang nhật');
  assert.equal(nhat.dropped, 'nước khác');
  assert.equal(nhat.selected, false);
  assert.equal(list.filter((k) => k.selected).length, 5);
  assert.equal(list.find((k) => k.keyword.includes('100 nghìn usd')).intent, 'cost');
  assert.equal(list.find((k) => k.keyword.includes('timeline')).intent, 'howto');
  assert.equal(list.find((k) => k.keyword.includes('mất bao lâu')).intent, 'time');
  assert.equal(list.find((k) => k.keyword === 'bảo lãnh hôn phu').intent, 'related');
});

test('a US topic drops the same procedure in Vietnam; a topic without a country keeps it', () => {
  assert.equal(expandKeywords('thi quốc tịch mỹ', { suggestions: ['thi quốc tịch việt nam'], related: [] })[1].dropped, 'nước khác');
  assert.equal(expandKeywords('bảo lãnh vợ chồng', { suggestions: ['bảo lãnh vợ chồng việt nam'], related: [] })[1].dropped, undefined);
});

test('a topic that names a country keeps keywords about that country', () => {
  const list = expandKeywords('du học nhật', { suggestions: ['du học nhật bản 2026', 'du học nhật bản chi phí'], related: [] });
  assert.ok(list.every((k) => !k.dropped));
});

test('intent words that collide once accents are gone do not misfire', () => {
  assert.equal(intentOf('bảo lãnh gia đình'), 'related', '"gia" in "gia đình" is not a price');
  assert.equal(intentOf('du lịch mỹ'), 'related', '"lịch" alone is not a waiting schedule');
  assert.equal(foldWords('Bảo  Lãnh ĐỊNH cư!'), 'bao lanh dinh cu');
});

test('hashtags: most shared first, generic fyp tags left out', () => {
  const tags = topHashtags([{ hashtags: ['dinhcumy', 'fyp'] }, { hashtags: ['DinhCuMy', 'visamy'] }, { hashtags: ['xuhuong'] }]);
  assert.deepEqual(tags, [{ tag: 'dinhcumy', videos: 2 }, { tag: 'visamy', videos: 1 }]);
});

const c = (id, text, likes, replies = 0) => ({ id, text, likes, replies });

test('customer voice: questions grouped by theme, replies count, immigration fears and service buyers', () => {
  const v = customerVoice([
    c('1', 'Chị ơi cho em hỏi bảo lãnh diện vợ chồng khoảng bao lâu ah', 3, 10),
    c('2', 'Người mĩ bảo lãnh vợ mất bao lâu', 4, 4),
    c('3', 'bao nhiêu ạ. mở tại vn là bao nhiêu tiền', 3, 11),
    c('4', 'Bạn tự làm hs hay qua dịch vụ ạ ?', 2, 4),
    c('5', 'up đầy đủ tránh giấy xanh', 3, 0),
    c('6', 'Chị trả lời sao ạ? Phỏng vấn hỏi gì vậy', 9, 8),
    c('7', '😂😂', 50, 0),
    c('8', 'Em sợ bị đánh trượt lắm', 2, 0),
  ]);
  assert.equal(v.total, 7, 'emoji-only comment dropped');
  assert.equal(v.questions[0].id, '6', 'likes + replies decide the order');
  const time = v.themes.find((t) => t.key === 'time');
  assert.equal(time.count, 2);
  assert.equal(time.replies, 14);
  assert.ok(v.themes.find((t) => t.key === 'service'));
  assert.deepEqual(v.fears.map((x) => x.id).sort(), ['5', '8']);
  assert.ok(v.buying.some((x) => x.id === '4'));
  assert.ok(v.voiceLines.length > 0 && v.voiceLines.every((l) => l.text.length >= 10));
});

test('sellers answering in the comments are not customers; "bao lâu được phỏng vấn" is a time question', () => {
  const v = customerVoice([
    c('s', 'Bạn để lại số điện thoại để chuyên viên liên hệ tư vấn chi tiết cho bạn', 5, 0),
    c('b', 'Tư vấn giùm e với ạ', 1, 0),
    c('t', 'Mình I-130 nộp 10/10/2025 thì bao lâu đc phỏng vấn ạ', 2, 1),
  ]);
  assert.deepEqual(v.buying.map((x) => x.id), ['b']);
  assert.equal(v.total, 2);
  assert.deepEqual(v.themes.map((t) => t.key).filter((k) => k !== 'papers'), ['time']);
  assert.equal(classifyVoice('Phỏng vấn hỏi gì vậy chị?').themes[0], 'interview');
});

test('"hồ sơ" is not a fear and "số" is not "sợ"', () => {
  assert.equal(classifyVoice('hồ sơ số 5 nộp rồi').fear, false);
  assert.equal(classifyVoice('em sợ quá').fear, true);
});

test('xlsx: a zip with workbook, styles and one sheet per tab; captions are never formulas', () => {
  const bytes = toXlsx([{ name: 'Video', header: ['A', 'B'], rows: [['=1+1', 5], ['x & <y>', null]] }, { name: 'Từ khoá', header: ['K'], rows: [] }]);
  const text = new TextDecoder().decode(bytes);
  assert.equal(text.slice(0, 2), 'PK');
  for (const f of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) assert.ok(text.includes(f), f);
  assert.ok(text.includes('t="inlineStr"><is><t xml:space="preserve">=1+1</t>'));
  assert.ok(text.includes('x &amp; &lt;y&gt;'));
  assert.ok(!text.includes('<f>'));
  assert.ok(text.includes('name="Từ khoá"'));
});

test('topic explorer groups: same groups and counts as the report, each with the ids of real comments', () => {
  const comments = [
    { id: 'a', text: 'Hồ sơ bảo lãnh vợ mất bao lâu vậy ạ?', likes: 40, replies: 5 },
    { id: 'b', text: 'Chi phí hết bao nhiêu tiền vậy anh?', likes: 12, replies: 1 },
    { id: 'c', text: 'Em sợ bị từ chối quá', likes: 3, replies: 0 },
    { id: 'd', text: 'Bên em hỗ trợ, để lại số điện thoại nhé', likes: 0, replies: 0 },
    { id: 'e', text: 'Phỏng vấn hỏi gì vậy mọi người?', likes: 7, replies: 2 },
    { id: 'f', text: 'hay quá', likes: 1, replies: 0 },
  ];
  const v = customerVoice(comments);
  const g = voiceTopics(comments);
  const questions = g.topics.filter((t) => t.kind === 'question');
  assert.deepEqual(questions.map((t) => [t.key, t.count]), v.themes.map((t) => [t.key, t.count]), 'aggregation unchanged');
  for (const t of g.topics) {
    assert.equal(t.ids.length, t.count);
    assert.ok(t.ids.every((id) => comments.some((c) => c.id === id)), 'only real comment ids');
  }
  assert.ok(!g.topics.some((t) => t.ids.includes('d')), 'sellers left out, as in the report');
  assert.deepEqual(g.topics.find((t) => t.key === 'fear').ids, ['c']);
  assert.deepEqual(g.topics.find((t) => t.key === 'time').ids, ['a']);
});
