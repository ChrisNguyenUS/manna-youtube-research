import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBrowser } from '../../src/sources/tiktok/browser.js';
import { searchKeyword } from '../../src/sources/tiktok/search.js';
import { createTikTokSource } from '../../src/sources/tiktok/index.js';

const page1 = JSON.parse(fs.readFileSync('src/sources/tiktok/fixtures/search-page.json', 'utf8'));
const noSleep = async () => {};

/** Fake Playwright: `bodies` is the sequence of search responses; counts contexts opened/closed. */
function fakePlaywright(bodies) {
  const state = { contexts: 0, closedContexts: 0, launched: 0, closed: 0, paths: [] };
  let i = 0;
  const page = {
    goto: async () => {},
    waitForLoadState: async () => {},
    evaluate: async (fn, path) => (state.paths.push(path), { status: 200, body: bodies[Math.min(i++, bodies.length - 1)] }),
  };
  const context = { newPage: async () => page, close: async () => void state.closedContexts++ };
  const browser = { newContext: async () => (state.contexts++, context), close: async () => void state.closed++ };
  return { state, load: async () => ({ chromium: { launch: async () => (state.launched++, browser) } }) };
}

test('pages with search_id, stops at max, closes the context', async () => {
  const pw = fakePlaywright([page1, { ...page1, cursor: 24, log_pb: { impr_id: 'NEXT' }, data: page1.data.map((d) => (d.item ? { ...d, item: { ...d.item, id: d.item.id + '9' } } : d)) }]);
  const b = createBrowser({ loadPlaywright: pw.load });
  const vids = await searchKeyword(b, 'thi quốc tịch mỹ', { max: 3, sleep: noSleep });
  assert.equal(vids.length, 3);
  assert.match(pw.state.paths[1], /search_id=IMPR123/);
  assert.deepEqual([pw.state.contexts, pw.state.closedContexts], [1, 1]);
  await b.close();
  assert.equal(pw.state.closed, 1);
});

test('blocked first page retries with a new context, then gives up with []', async () => {
  const pw = fakePlaywright([{ status_code: 10201 }]);
  const b = createBrowser({ loadPlaywright: pw.load });
  assert.deepEqual(await searchKeyword(b, 'x', { sleep: noSleep }), []);
  assert.equal(pw.state.contexts, 4, '1 try + 3 retries');
  assert.equal(pw.state.closedContexts, 4);
  await b.close();
});

test('missing Playwright: search fails with tiktok_setup_required, comments still work (Review Focus #1)', async () => {
  const src = createTikTokSource({
    hasPlaywright: () => false,
    loadPlaywright: async () => { throw new Error('Cannot find package playwright'); },
    fetch: async () => ({ ok: true, status: 200, url: '', json: async () => JSON.parse(fs.readFileSync('src/sources/tiktok/fixtures/comment-page.json', 'utf8')) }),
    sleep: noSleep,
  });
  assert.deepEqual(src.capabilities(), { searchReady: false, reason: 'Cần cài: npm run setup:tiktok' });
  await assert.rejects(() => src.searchVideos('x'), (/** @type {any} */ e) => e.code === 'tiktok_setup_required');
  assert.ok((await src.getComments('1', { max: 2, replies: false })).comments.length > 0);
});
