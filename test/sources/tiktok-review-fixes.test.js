// Final-review fixes I1, I2, I3, I5, I6 (ledger "Final:" lines).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowser } from '../../src/sources/tiktok/browser.js';
import { searchKeyword } from '../../src/sources/tiktok/search.js';
import { createTikTokSource } from '../../src/sources/tiktok/index.js';
import { parseCommentPage } from '../../src/sources/tiktok/parse.js';

const noSleep = async () => {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** @param {{failLaunches?: number, body?: any}} [o] */
function fakePw({ failLaunches = 0, body = { status_code: 0, data: [] } } = {}) {
  const state = { launched: 0, closed: 0, contexts: 0 };
  const page = { goto: async () => {}, waitForLoadState: async () => {}, evaluate: async () => ({ status: 200, body }) };
  const browser = { newContext: async () => (state.contexts++, { newPage: async () => page, close: async () => {} }), close: async () => void state.closed++ };
  const launch = async () => {
    if (state.launched++ < failLaunches) throw new Error("browserType.launch: Executable doesn't exist at /x/chrome-headless-shell");
    return browser;
  };
  return { state, load: async () => ({ chromium: { launch } }) };
}

test('I1: a failed launch is not remembered; close() still resolves', async () => {
  const pw = fakePw({ failLaunches: 1 });
  const b = createBrowser({ loadPlaywright: pw.load });
  await assert.rejects(() => b.withPage(async () => 1));
  await b.close();
  assert.equal(await b.withPage(async () => 2), 2);
  await b.close();
});

test('I3: the idle timer never closes the browser while a page is in use', async () => {
  const pw = fakePw();
  const b = createBrowser({ loadPlaywright: pw.load, idleMs: 20 });
  await b.withPage(async () => {});
  await b.withPage(async () => {
    await wait(60);
    assert.equal(pw.state.closed, 0);
  });
  await wait(60);
  assert.equal(pw.state.closed, 1, 'closes once idle');
});

test('I2: missing Chromium binary surfaces as tiktok_setup_required', async () => {
  const pw = fakePw({ failLaunches: 9 });
  const src = createTikTokSource({ hasPlaywright: () => true, loadPlaywright: pw.load, sleep: noSleep });
  await assert.rejects(() => src.searchVideos('x'), (/** @type {any} */ e) => e.code === 'tiktok_setup_required' && /npm run setup:tiktok/.test(e.message));
  await src.close();
});

test('I5: TikTok login wall (2483) fails at once with its own code, no retries', async () => {
  const pw = fakePw({ body: { status_code: 2483, status_msg: 'Please login your account first' } });
  const b = createBrowser({ loadPlaywright: pw.load });
  await assert.rejects(() => searchKeyword(b, 'x', { sleep: noSleep }), (/** @type {any} */ e) => e.code === 'tiktok_login_required' && /đăng nhập/.test(e.message));
  assert.equal(pw.state.contexts, 1);
  await b.close();
});

test('I6: handles tagged inside comment text are masked', () => {
  const r = parseCommentPage({ status_code: 0, comments: [{ cid: '1', text: '@ten_ban.99 xem nè @Ngọc_Ánh' }] }, null);
  assert.equal(r.comments[0].text, '@… xem nè @…');
});
