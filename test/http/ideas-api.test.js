import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from '../features/helpers.js';
import { createHttpServer } from '../../src/http/server.js';

async function boot() {
  const app = testApp();
  const srv = createHttpServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  return { app, base: `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}`, close: () => srv.close() };
}
const post = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const get = async (u) => (await fetch(u)).json();

test('board → create → edit → export → new batch → delete', async () => {
  const s = await boot();
  assert.equal((await get(`${s.base}/api/v1/ideas`)).batch.title, 'Lô 1');
  const c = await (await post(`${s.base}/api/v1/ideas`, { from: 'self' })).json();
  const e = await (await post(`${s.base}/api/v1/ideas/${c.id}`, { patch: { topic: 'Phỏng vấn', status: 'chosen' } })).json();
  assert.deepEqual([e.card.topic, e.status], ['Phỏng vấn', 'chosen']);
  assert.equal((await get(`${s.base}/api/v1/ideas/${c.id}`)).card.topic, 'Phỏng vấn');
  const md = await (await fetch(`${s.base}/api/v1/ideas/export.md?inline=1`)).text();
  assert.match(md, /^# Lô 1: 1 thẻ/);
  const nb = await (await post(`${s.base}/api/v1/ideas/batches`, { title: 'Lô mới' })).json();
  assert.equal(nb.batch.title, 'Lô mới');
  assert.equal((await fetch(`${s.base}/api/v1/ideas/${c.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${s.base}/api/v1/ideas/${c.id}`)).status, 404);
  s.close();
});

test('bad input is a 400, an unknown card a 404', async () => {
  const s = await boot();
  assert.equal((await post(`${s.base}/api/v1/ideas`, {})).status, 400);
  assert.equal((await post(`${s.base}/api/v1/ideas`, { from: 'brick:x' })).status, 400);
  const c = await (await post(`${s.base}/api/v1/ideas`, { from: 'self' })).json();
  assert.equal((await post(`${s.base}/api/v1/ideas/${c.id}`, {})).status, 400);
  assert.equal((await post(`${s.base}/api/v1/ideas/abc`, { patch: {} })).status, 400);
  assert.equal((await fetch(`${s.base}/api/v1/ideas/9999`)).status, 404);
  assert.equal((await fetch(`${s.base}/api/v1/ideas?batch=9999`)).status, 404);
  s.close();
});
