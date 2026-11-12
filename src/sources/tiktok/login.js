// Opens a visible Chromium window on TikTok's sign-in page and waits for the user to sign in themselves
// (QR code from the TikTok app, phone, email…). Once TikTok sets the session cookie, the state is saved and the window closes.
import { sleep as cancellableSleep, throwIfCancelled } from '../../core/cancel.js';
import { loadChromium } from './browser.js';
import { sessionCookie } from './session.js';

const LOGIN_URL = 'https://www.tiktok.com/login';
const fail = (code, message) => Object.assign(new Error(message), { code });

/**
 * @param {{session: ReturnType<typeof import('./session.js').createSession>, loadPlaywright?: () => Promise<any>,
 *   timeoutMs?: number, pollMs?: number, settleMs?: number, sleep?: (ms: number) => Promise<void>, now?: () => number}} o
 * @returns {Promise<import('./session.js').LoginStatus>}
 */
export async function loginInWindow({ session, loadPlaywright, timeoutMs = 10 * 60_000, pollMs = 1500, settleMs = 3000, sleep = cancellableSleep, now = Date.now }) {
  if (!session.file) throw fail('internal', 'Chưa có chỗ lưu phiên đăng nhập TikTok');
  const chromium = await loadChromium(loadPlaywright);
  const browser = await chromium.launch({ headless: false });
  try {
    // Always a clean window: an old cookie could look signed in before TikTok gets to reject it.
    // viewport null: the page follows the real window size, so the sign-in form is not cut off.
    const context = await browser.newContext({ locale: 'vi-VN', viewport: null });
    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.bringToFront?.().catch(() => {});
    const deadline = now() + timeoutMs;
    for (;;) {
      throwIfCancelled();
      if (sessionCookie(await context.cookies('https://www.tiktok.com').catch(() => []))) {
        await sleep(settleMs); // TikTok sets a few more cookies right after sign-in
        if (!(await session.save(context))) throw fail('tiktok_login_cancelled', 'TikTok đã đăng xuất ngay sau khi đăng nhập, thử lại');
        return session.status();
      }
      if (!browser.isConnected() || context.pages().length === 0) throw fail('tiktok_login_cancelled', 'Cửa sổ đăng nhập TikTok đã bị đóng trước khi đăng nhập xong');
      if (now() >= deadline) throw fail('tiktok_login_timeout', `Hết ${Math.round(timeoutMs / 60_000)} phút mà chưa đăng nhập xong, thử lại`);
      await sleep(pollMs);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}
