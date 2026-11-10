import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { researchMarkdown } from '../../src/core/report/markdown.js';

test('research produces the digest sections the skill reads', async () => {
  const a = testApp();
  const r = await a.features.research({ topic: 'lịch sử', keywords: 'lịch sử', comments: { top: 1, max: 5 } }, () => {});
  const rec = a.store.records.get('local', r.id);
  const md = researchMarkdown(rec.data);
  for (const h of ['## Top video theo điểm vượt kênh', '## Mẫu tiêu đề', '## Độ dài video', '## Comment']) assert.ok(md.includes(h), h);
  assert.ok(!/@\w+/.test(md.split('## Comment')[1]), 'no commenter handles');
  assert.equal(rec.data.channels[0].videos[0].viewSub != null, true, 'channel videos use viewSub');
  assert.equal(a.store.records.list('local', 'video_search').length, 0, 'intermediate search record removed');
});

test('keyword scores: full result saved, lite result inline', async () => {
  const a = testApp();
  const full = await a.features.keywordScores({ keywords: ['lịch sử'] }, () => {});
  assert.ok(full.id);
  assert.equal(typeof full.results[0].overall, 'number');
  const lite = await a.features.keywordScores({ keywords: ['lịch sử'], lite: true }, () => {});
  assert.equal(lite.inline, true);
});

test('channel analysis and compare use the stored record', async () => {
  const a = testApp();
  const r = await a.features.analyzeChannel('@nho', {}, () => {});
  assert.equal(r.info.handle, '@nho');
  const cmp = a.features.compareChannels([r.info.id]);
  assert.equal(cmp[0].id, r.info.id);
});
