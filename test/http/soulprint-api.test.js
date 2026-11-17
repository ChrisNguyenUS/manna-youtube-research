import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from '../features/helpers.js';
import { createHttpServer } from '../../src/http/server.js';

async function boot(opts) {
  const app = testApp(undefined, undefined, opts);
  const srv = createHttpServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  return { app, base: `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}`, close: () => srv.close() };
}
const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

test('a new database answers with an empty profile, the questions and readiness 0 of 6', async () => {
  const s = await boot();
  const r = await (await fetch(`${s.base}/api/v1/soulprint`)).json();
  assert.deepEqual([r.readiness.done, r.readiness.total, r.updatedAt, r.ai], [0, 6, null, false]);
  assert.equal(r.questions.length, 12);
  assert.equal(r.profile.game, null);
  assert.equal(r.sections.pains, 'Kho nỗi đau');
  assert.ok(r.intro && r.gameTable.rows.length === 4);
  s.close();
});

test('saving cleans, reports what was cut, and the profile comes back the same', async () => {
  const s = await boot();
  const saved = await (await post(`${s.base}/api/v1/soulprint`, { profile: { game: 'conversion', business: { offer: 'Dịch vụ hồ sơ' }, pains: Array.from({ length: 31 }, (_, i) => ({ text: `đau ${i}` })), junk: 1 } })).json();
  assert.deepEqual(saved.trimmed, ['pains']);
  assert.deepEqual([saved.profile.game, saved.profile.pains.length, saved.readiness.done], ['conversion', 30, 3]);
  assert.ok(saved.updatedAt > 0);
  const again = await (await fetch(`${s.base}/api/v1/soulprint`)).json();
  assert.deepEqual(again.profile, saved.profile);
  assert.equal((await post(`${s.base}/api/v1/soulprint`, {})).status, 400);
  s.close();
});

test('markdown export names the sections that are filled and says what is missing', async () => {
  const s = await boot();
  await post(`${s.base}/api/v1/soulprint`, { profile: { game: 'conversion', objective: '20 khách', avatar: { name: 'Lan', portrait: 'Đang bảo lãnh chồng' }, pains: [{ text: 'Sợ trượt', pain: 5, type: 'broad' }], pillars: [{ name: 'Phỏng vấn', belief: 'Không cần luật sư', subtopics: ['hỏi gì'] }] } });
  const res = await fetch(`${s.base}/api/v1/soulprint/export.md?inline=1`);
  const md = await res.text();
  assert.match(res.headers.get('content-type') || '', /markdown/);
  assert.match(md, /^# Soulprint/);
  assert.match(md, /Hồ sơ đủ dùng: 2\/6\. Còn thiếu: Bán gì, Ít nhất 5 nỗi đau, Câu định vị, Ít nhất 3 pillars/);
  assert.match(md, /## Game\n\nTrúng \(views đúng người, đo bằng khách\)\n\nMục tiêu 12–18 tháng: 20 khách/);
  assert.match(md, /## Avatar\n\n\*\*Lan\*\*\n\nĐang bảo lãnh chồng/);
  assert.match(md, /## Kho nỗi đau\n\n1\. Sợ trượt \(lớn, độ đau 5\/5\)/);
  assert.match(md, /### Phỏng vấn\n\nNiềm tin đi ngược: Không cần luật sư\n\nChủ đề con \(1\): hỏi gì/);
  assert.ok(!/## Lợi thế riêng/.test(md), 'empty sections are left out');
  s.close();
});
