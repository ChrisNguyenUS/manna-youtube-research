import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSession, sessionCookie } from '../../src/sources/tiktok/session.js';
import { loginInWindow } from '../../src/sources/tiktok/login.js';
import { createBrowser } from '../../src/sources/tiktok/browser.js';
import { searchKeyword } from '../../src/sources/tiktok/search.js';
import { createTikTokSource } from '../../src/sources/tiktok/index.js';

const noSleep = async () => {};
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-tt-')), 'tiktok-session.json');
const inDays = (d) => Math.floor(Date.now() / 1000) + d * 86_400;
const SIGNED_IN = { cookies: [{ name: 'sessionid', value: 'abc', domain: '.tiktok.com', expires: inDays(60) }, { name: 'ttwid', value: 'x', expires: inDays(300) }], origins: [] };

/**
 * Fake Playwright for the sign-in window and searches.
 * cookiesAfter: poll number after which `sessionid` shows up (Infinity = never); pagesLeft: open tabs after N polls.
 */
/** @param {{cookiesAfter?: number, closeAfter?: number, searchBody?: any}} [o] */
function fakePw({ cookiesAfter = 2, closeAfter = Infinity, searchBody = { status_code: 2483 } } = {}) {
  const state = { launches: [], contexts: [], polls: 0, closed: 0, stored: 0 };
  let pagesOpen = 1;
  const page = {
    goto: async () => {},
    bringToFront: async () => {},
    waitForLoadState: async () => {},
    evaluate: async () => ({ status: 200, body: searchBody }),
  };
  const context = {
    newPage: async () => page,
    pages: () => (pagesOpen ? [page] : []),
    cookies: async () => {
      state.polls++;
      if (state.polls > closeAfter) pagesOpen = 0;
      return state.polls > cookiesAfter ? SIGNED_IN.cookies : [{ name: 'ttwid', value: 'x' }];
    },
    storageState: async () => (state.stored++, state.polls > cookiesAfter || state.contexts.length > 0 ? SIGNED_IN : { cookies: [], origins: [] }),
    close: async () => {},
  };
  const browser = { newContext: async (o) => (state.contexts.push(o), context), close: async () => void state.closed++, isConnected: () => true };
  return { state, load: async () => ({ chromium: { launch: async (o) => (state.launches.push(o), browser) } }) };
}

test('session file: saved only when signed in, readable by the user only, status never shows cookies', async () => {
  const s = createSession(tmpFile());
  assert.equal(await s.save({ storageState: async () => ({ cookies: [{ name: 'ttwid', value: 'x' }] }) }), false, 'signed-out state is not saved');
  assert.deepEqual(s.status(), { loggedIn: false, savedAt: null, expiresAt: null });
  assert.equal(await s.save({ storageState: async () => SIGNED_IN }), true);
  assert.equal(fs.statSync(s.file).mode & 0o777, 0o600);
  const st = s.status();
  assert.equal(st.loggedIn, true);
  assert.match(st.expiresAt, /^\d{4}-/);
  assert.ok(!JSON.stringify(st).includes('abc'), 'status carries no cookie value');
  s.clear();
  assert.equal(s.has(), false);
  assert.equal(createSession(undefined).has(), false, 'no file configured → never signed in');
});

test('expired sessionid does not count as signed in', () => {
  assert.equal(sessionCookie([{ name: 'sessionid', value: 'abc', expires: 1000 }]), null);
  assert.ok(sessionCookie([{ name: 'sessionid', value: 'abc', expires: inDays(1) }]));
  assert.equal(sessionCookie([{ name: 'sessionid', value: '', expires: inDays(1) }]), null);
});

test('login window: visible, clean, waits for the user, saves and closes', async () => {
  const pw = fakePw({ cookiesAfter: 2 });
  const session = createSession(tmpFile());
  const st = await loginInWindow({ session, loadPlaywright: pw.load, sleep: noSleep });
  assert.equal(st.loggedIn, true);
  assert.deepEqual(pw.state.launches, [{ headless: false }]);
  assert.equal(pw.state.contexts[0].storageState, undefined, 'never starts from an old session');
  assert.equal(pw.state.polls, 3);
  assert.equal(pw.state.closed, 1);
  assert.equal(session.has(), true);
});

test('login window closed by the user, or nobody signs in: clear error, browser closed, nothing saved', async () => {
  const closed = fakePw({ cookiesAfter: Infinity, closeAfter: 1 });
  const s1 = createSession(tmpFile());
  await assert.rejects(() => loginInWindow({ session: s1, loadPlaywright: closed.load, sleep: noSleep }), (/** @type {any} */ e) => e.code === 'tiktok_login_cancelled');
  assert.equal(closed.state.closed, 1);
  assert.equal(s1.has(), false);

  const idle = fakePw({ cookiesAfter: Infinity });
  let t = 0;
  await assert.rejects(
    () => loginInWindow({ session: createSession(tmpFile()), loadPlaywright: idle.load, sleep: noSleep, timeoutMs: 5000, now: () => (t += 1000) }),
    (/** @type {any} */ e) => e.code === 'tiktok_login_timeout',
  );
  assert.equal(idle.state.closed, 1);
});

test('searches start from the saved sign-in and keep its refreshed cookies', async () => {
  const pw = fakePw({ searchBody: { status_code: 0, has_more: 0, data: [{ type: 1, item: { id: '7376610463154572560', author: { uniqueId: 'a' }, stats: {} } }] } });
  const session = createSession(tmpFile());
  await session.save({ storageState: async () => SIGNED_IN });
  const b = createBrowser({ loadPlaywright: pw.load, session });
  const vids = await searchKeyword(b, 'x', { sleep: noSleep, signedIn: session.has });
  assert.equal(vids.length, 1);
  assert.deepEqual(pw.state.launches, [{ headless: true }]);
  assert.equal(pw.state.contexts[0].storageState, session.file);
  assert.equal(pw.state.stored, 1, 'state saved back after the search');
  await b.close();
});

test('login wall: the message says whether to sign in or sign in again', async () => {
  const pw = fakePw();
  const b = createBrowser({ loadPlaywright: pw.load });
  await assert.rejects(() => searchKeyword(b, 'x', { sleep: noSleep }), (/** @type {any} */ e) => e.code === 'tiktok_login_required' && /npm run login:tiktok/.test(e.message) && !/hết hạn/.test(e.message));
  await assert.rejects(() => searchKeyword(b, 'x', { sleep: noSleep, signedIn: () => true }), (/** @type {any} */ e) => e.code === 'tiktok_login_required' && /hết hạn/.test(e.message));
  await b.close();
});

test('source: two login calls share one window; logout forgets the session', async () => {
  const pw = fakePw({ cookiesAfter: 1 });
  const src = createTikTokSource({ hasPlaywright: () => true, loadPlaywright: pw.load, sleep: noSleep, sessionFile: tmpFile() });
  const [a, b] = await Promise.all([src.login(), src.login()]);
  assert.equal(pw.state.launches.length, 1);
  assert.equal(a.loggedIn && b.loggedIn, true);
  assert.equal(src.loginStatus().loggedIn, true);
  await src.logout();
  assert.equal(src.loginStatus().loggedIn, false);
  const noPw = createTikTokSource({ hasPlaywright: () => false, sessionFile: tmpFile() });
  await assert.rejects(() => noPw.login(), (/** @type {any} */ e) => e.code === 'tiktok_setup_required');
});
