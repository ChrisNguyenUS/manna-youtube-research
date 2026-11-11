// One headless Chromium per process (Playwright, imported only when a TikTok search runs).
// Each search gets a fresh context, always closed afterwards; the browser closes after idleMs.

// Kept as a variable so typecheck does not require the optional package to be installed.
const PLAYWRIGHT = 'playwright';

/** @param {{loadPlaywright?: () => Promise<any>, idleMs?: number}} [o] */
export function createBrowser({ loadPlaywright = () => import(PLAYWRIGHT), idleMs = 120_000 } = {}) {
  let browserP = null;
  let idle = null;
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(() => void close(), idleMs);
    idle.unref?.();
  };
  async function getBrowser() {
    browserP ??= loadPlaywright().then((pw) => (pw.chromium ?? pw.default?.chromium).launch({ headless: true }));
    return browserP;
  }
  async function close() {
    clearTimeout(idle);
    const b = browserP;
    browserP = null;
    if (b) await (await b).close().catch(() => {});
  }
  return {
    /** @template T @param {(page: any) => Promise<T>} fn @returns {Promise<T>} */
    async withPage(fn) {
      const browser = await getBrowser();
      const context = await browser.newContext({ locale: 'vi-VN' });
      try {
        const page = await context.newPage();
        await page.goto('https://www.tiktok.com/explore', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        return await fn(page);
      } finally {
        await context.close().catch(() => {});
        arm();
      }
    },
    close,
    isOpen: () => browserP != null,
  };
}
