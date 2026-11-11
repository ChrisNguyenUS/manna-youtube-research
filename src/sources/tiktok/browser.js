// One headless Chromium per process (Playwright, imported only when a TikTok search runs).
// Each search gets a fresh context, always closed afterwards; the browser closes after idleMs.

// Kept as a variable so typecheck does not require the optional package to be installed.
const PLAYWRIGHT = 'playwright';

/** @param {{loadPlaywright?: () => Promise<any>, idleMs?: number}} [o] */
export function createBrowser({ loadPlaywright = () => import(PLAYWRIGHT), idleMs = 120_000 } = {}) {
  let browserP = null;
  let idle = null;
  let inUse = 0;
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(() => void close(), idleMs);
    idle.unref?.();
  };
  async function getBrowser() {
    if (!browserP) {
      const p = loadPlaywright().then((pw) => (pw.chromium ?? pw.default?.chromium).launch({ headless: true }));
      browserP = p;
      // A failed launch must not stick: the user may install Chromium and try again.
      p.catch(() => {
        if (browserP === p) browserP = null;
      });
    }
    return browserP;
  }
  async function close() {
    clearTimeout(idle);
    const b = browserP;
    browserP = null;
    if (b) await b.then((x) => x.close(), () => {}).catch(() => {});
  }
  return {
    /** @template T @param {(page: any) => Promise<T>} fn @returns {Promise<T>} */
    async withPage(fn) {
      // The idle timer only runs while no page is in use, so it never closes a browser mid-search.
      clearTimeout(idle);
      inUse++;
      let context = null;
      try {
        const browser = await getBrowser();
        context = await browser.newContext({ locale: 'vi-VN' });
        const page = await context.newPage();
        await page.goto('https://www.tiktok.com/explore', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        return await fn(page);
      } finally {
        await context?.close().catch(() => {});
        if (--inUse === 0) arm();
      }
    },
    close,
    isOpen: () => browserP != null,
  };
}
