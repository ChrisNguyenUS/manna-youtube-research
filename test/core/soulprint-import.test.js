import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitByHeadings, LIMITS } from '../../src/core/soulprint/profile.js';

test('a Vietnamese BRAND.md is sorted by its level-2 headings; unknown headings are kept aside', () => {
  const r = splitByHeadings(['# BRAND — kênh di trú', 'dòng mở đầu', '## Lời hứa', 'Tôi giúp người bảo lãnh', '', '## Khán giả', 'Lan, 34 tuổi', '## Bằng chứng', '10 hồ sơ', '## Cơ chế độc quyền', 'Lịch từng ngày',
    '## Góc nhìn', 'Không cần luật sư', '## Đường ra tiền', 'Dịch vụ 500 đô', '## Giọng nói', 'Thẳng', '## Cá tính', 'Vui', '## Sứ mệnh', 'Giúp người Việt', '## Bio mẫu', 'bio'].join('\n'));
  assert.deepEqual(r.drafts, {
    statement: 'Tôi giúp người bảo lãnh', avatar: 'Lan, 34 tuổi', advantage: '10 hồ sơ\n\nLịch từng ngày', pillars: 'Không cần luật sư',
    business: 'Dịch vụ 500 đô', voice: 'Thẳng\n\nVui',
  });
  assert.deepEqual(r.unsorted, [{ heading: 'Sứ mệnh', text: 'Giúp người Việt' }, { heading: 'Bio mẫu', text: 'bio' }]);
  assert.equal(r.cut, false);
});

test('the interview skills\' English headings work, with numbering, decoration and Windows line endings (Review Focus #2)', () => {
  const r = splitByHeadings(['## 1. The business:', 'Remodel, $40k', '## 🎯 Ideal Viewer Avatar', 'Comeback Chris', '## 3) The game', 'Efficient', '## Pain-point bank', '- a\r\n- b', '## Dream outcome', 'd',
    '## The one thing', 'o', '## The Avatar Filter', 'f', '## Target Authority Statement', 's', '## Raw material', 'r', '## Unfair advantage', 'u', '## The two filter questions', 'f2'].join('\r\n'));
  assert.deepEqual(r.drafts, { business: 'Remodel, $40k', avatar: 'Comeback Chris', game: 'Efficient', pains: '- a\n- b', dreamOutcome: 'd', oneThing: 'o', filter: 'f\n\nf2', statement: 's', advantage: 'r\n\nu' });
  assert.deepEqual(r.unsorted, []);
});

test('text without headings is one unsorted block; over the limit it is cut and says so; nothing gives nothing', () => {
  assert.deepEqual(splitByHeadings('chỉ một đoạn văn'), { drafts: {}, unsorted: [{ heading: '', text: 'chỉ một đoạn văn' }], cut: false });
  const long = splitByHeadings(`## Lời hứa\n${'x'.repeat(LIMITS.importChars + 10)}`);
  assert.equal(long.cut, true);
  assert.equal(long.drafts.statement.length, LIMITS.importChars - '## Lời hứa\n'.length);
  for (const v of ['', '   ', null, 5]) assert.deepEqual(splitByHeadings(/** @type {any} */ (v)), { drafts: {}, unsorted: [], cut: false });
});
