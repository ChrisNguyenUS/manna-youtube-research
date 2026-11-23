// The web UI has no DOM tests; this pins the wiring a refactor could silently drop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Loaded by URL: typecheck must not follow nav.js's lazy imports into web/ (not type-checked).
const { ITEMS, GROUPS } = await import(new URL('../web/nav.js', import.meta.url).href);

const view = () => fs.readFileSync('web/views/bricks.js', 'utf8');

test('Swipe File is the third entry of Analyze and has its client and job label', () => {
  assert.deepEqual(GROUPS.find((g) => g.key === 'dissect').items.map((it) => it.label), ['Video Analysis', 'Channel Analysis', 'Swipe File']);
  assert.equal(ITEMS.find((it) => it.label === 'Swipe File').tabs[0][0], '/bricks');
  const client = fs.readFileSync('web/http/client.js', 'utf8');
  for (const name of ['list:', 'get:', 'update:', 'remove:', 'exportUrl:']) assert.ok(client.slice(client.indexOf('export const bricks')).includes(name), name);
  assert.match(fs.readFileSync('web/lib.js', 'utf8'), /brick_extract: 'Breakdown video'/);
});

test('the detail has the reference tabs, in order, with uppercase field labels', () => {
  const src = view();
  const tabs = ['Transcript', 'Idea Analysis', 'Hook', 'Storytelling Format', 'Visual Layout', 'Khán giả', 'Đào sâu'];
  let at = -1;
  for (const t of tabs) {
    const i = src.indexOf(`'${t}'`);
    assert.ok(i > at, `${t} is missing or out of order`);
    at = i;
  }
  for (const s of ['TOPIC', 'IDEA SEED', 'UNIQUE ANGLE', 'COMMON BELIEF', 'CONTRARIAN REALITY', 'CORE FACTS', 'CATEGORY', 'FORMULA', 'SPOKEN HOOK', 'DESCRIPTION', 'fw-tabs', 'fw-cap', 'fw-chip']) assert.ok(src.includes(s), s);
});

test('evidence is one click away, edits are marked, and flags are said in words', () => {
  const src = view();
  for (const s of ['data-evidence', 'data-edit', 'đã sửa tay', 'Không có lời thoại', 'AI không dẫn được căn cứ', 'chỉ 20 phút đầu', 'Chưa nhập API key OpenRouter']) assert.ok(src.includes(s), s);
  assert.ok(!/\bfetch\(/.test(src));
});

test('a video-analysis report links to the library with its record id', () => {
  assert.match(fs.readFileSync('web/components/video-analysis.js', 'utf8'), /href="#\/bricks\?record=\$\{/);
});

test('followed channels and the winners-versus-losers table are on the library screen; the follows screen links there', () => {
  const src = view();
  for (const s of ['data-run-follows', 'data-contrast', 'data-compare', 'có thể là cốt lõi', 'không phải chứng minh', 'Chưa đủ để đối chiếu']) assert.ok(src.includes(s), s);
  assert.match(fs.readFileSync('web/views/follows.js', 'utf8'), /href="#\/bricks"/);
  assert.match(fs.readFileSync('web/views/settings.js', 'utf8'), /data-k="bricksMinScore"/);
});

test('the deep dive tab: every section, the plain-language flag, the hypothesis wording, the job label', () => {
  const src = view();
  for (const s of ['YẾU TỐ CỐT LÕI', 'YẾU TỐ BỔ TRỢ', 'CÔNG THỨC TRIỂN KHAI', 'chưa đủ đời thường', 'Mọi nhận định là giả thiết', 'data-dive']) assert.ok(src.includes(s), s);
  assert.match(fs.readFileSync('web/lib.js', 'utf8'), /video_deep_dive: 'Đào sâu video'/);
});
