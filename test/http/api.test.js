import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from '../features/helpers.js';
import { createHttpServer } from '../../src/http/server.js';
import { validate } from '../../src/http/validate.js';

async function boot() {
  const app = testApp();
  app.runner.start();
  const srv = createHttpServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  const base = `http://127.0.0.1:${/** @type {any} */ (srv.address()).port}`;
  return { app, base, close: () => { app.runner.stop(); srv.close(); } };
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('validate: required, int coercion, enums', () => {
  assert.deepEqual(validate({ keywords: 'string!' }, {}), { ok: false, field: 'keywords', message: 'bắt buộc' });
  assert.equal(validate({ n: 'int?' }, { n: '12' }).value.n, 12);
  assert.equal(validate({ n: 'int?' }, { n: 'many' }).ok, false);
  assert.equal(validate({ sort: ['top', 'newest'] }, { sort: 'x' }).ok, false);
  assert.equal(validate({ keywords: 'string!' }, { keywords: ['a'] }).ok, true, 'lists of keywords are allowed');
});

test('invalid job input → 400 invalid_input with field', async () => {
  const s = await boot();
  const r = await post(`${s.base}/api/v1/jobs/video_search`, { perKeyword: 'many' });
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.equal(j.error.code, 'invalid_input');
  assert.equal(j.error.field, 'keywords');
  s.close();
});

test('legacy /api alias and job lifecycle', async () => {
  const s = await boot();
  const { id } = await (await post(`${s.base}/api/jobs/idea_check`, { keywords: ['lịch sử'] })).json();
  let job;
  for (let i = 0; i < 100 && job?.status !== 'succeeded'; i++) {
    job = await (await fetch(`${s.base}/api/v1/jobs/${id}`)).json();
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(job.status, 'succeeded');
  assert.ok(job.result.id);
  const rec = await (await fetch(`${s.base}/api/v1/records/${job.result.id}`)).json();
  assert.equal(rec.kind, 'idea_check');
  s.close();
});

test('unknown record → 404 not_found; unknown kind → 400; unknown route → 404', async () => {
  const s = await boot();
  const r404 = await fetch(`${s.base}/api/v1/records/999`);
  assert.equal(r404.status, 404);
  assert.equal((await r404.json()).error.code, 'not_found');
  assert.equal((await post(`${s.base}/api/v1/jobs/hack`, {})).status, 400);
  assert.equal((await fetch(`${s.base}/api/v1/nope`)).status, 404);
  s.close();
});

test('malformed JSON body → 400', async () => {
  const s = await boot();
  const r = await fetch(`${s.base}/api/v1/jobs/video_search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(r.status, 400);
  s.close();
});

test('static files and SPA fallback; no path traversal', async () => {
  const s = await boot();
  assert.match(await (await fetch(`${s.base}/`)).text(), /<title>Content Research/);
  assert.match(await (await fetch(`${s.base}/some/route`)).text(), /<title>Content Research/);
  const t = await fetch(`${s.base}/..%2f..%2fpackage.json`);
  assert.doesNotMatch(await t.text(), /"devDependencies"/);
  // Static files are revalidated: same file → 304 without a body; API answers are never cached.
  const css = await fetch(`${s.base}/styles.css`);
  assert.equal(css.headers.get('cache-control'), 'no-cache');
  const again = await fetch(`${s.base}/styles.css`, { headers: { 'if-none-match': css.headers.get('etag') || '' } });
  assert.equal(again.status, 304);
  assert.equal(await again.text(), '');
  assert.equal((await fetch(`${s.base}/styles.css`, { headers: { 'if-none-match': '"old"' } })).status, 200);
  assert.equal((await fetch(`${s.base}/api/v1/status`)).headers.get('cache-control'), 'no-store');
  s.close();
});

test('status, metrics, settings and saved round-trip', async () => {
  const s = await boot();
  assert.equal(typeof (await (await fetch(`${s.base}/api/v1/status`)).json()).requests, 'number');
  assert.ok((await (await fetch(`${s.base}/api/v1/metrics`)).json()).outlierScore);
  await post(`${s.base}/api/v1/settings`, { gl: 'VN', aiKey: 'sk-secret' });
  const st = await (await fetch(`${s.base}/api/v1/settings`)).json();
  assert.equal(st.gl, 'VN');
  assert.equal(st.aiKey, '••••', 'secrets are masked');
  await post(`${s.base}/api/v1/saved`, { kind: 'channel', ref: 'UC1', title: 'T', data: {} });
  assert.deepEqual(await (await fetch(`${s.base}/api/v1/saved/keys`)).json(), ['channel:UC1']);
  s.close();
});

test('shutdown: only a same-origin JSON request stops the app', async () => {
  const s = await boot();
  let stops = 0;
  const url = `${s.base}/api/v1/shutdown`;
  const json = { 'content-type': 'application/json' };

  assert.equal((await fetch(url, { method: 'POST', headers: json, body: '{}' })).status, 503, 'nothing owns the process in tests until a handler is set');
  s.app.shutdown = () => void stops++;

  // What another website can send without a preflight: a form or plain-text POST, with its own Origin.
  assert.equal((await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...json, origin: 'https://evil.example' }, body: '{}' })).status, 403);
  assert.equal((await fetch(url)).status, 404, 'GET never stops anything');
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(stops, 0);

  const ok = await fetch(url, { method: 'POST', headers: { ...json, origin: s.base }, body: '{}' });
  assert.equal(ok.status, 200);
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(stops, 1);
  s.close();
});
