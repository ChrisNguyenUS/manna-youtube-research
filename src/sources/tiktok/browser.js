// One headless Chromium per process (Playwright, imported only when a TikTok search runs).
// Each search gets a fresh context, always closed afterwards; the browser closes after idleMs.

// Kept as a variable so typecheck does not require the optional package to be installed.
const PLAYWRIGHT = 'playwright';

/** Playwright's chromium from the module, whichever way it was exported. @param {() => Promise<any>} [load] */
export const loadChromium = async (load = () => import(PLAYWRIGHT)) => {
  const pw = await load();
  return pw.chromium ?? pw.default?.chromium;
};

/**
 * With `session`, each search context starts from the user's saved TikTok sign-in and saves the refreshed cookies after.
 * @param {{loadPlaywright?: () => Promise<any>, idleMs?: number, session?: ReturnType<typeof import('./session.js').createSession>}} [o]
 */
export function createBrowser({ loadPlaywright = () => import(PLAYWRIGHT), idleMs = 120_000, session } = {}) {
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
      const p = loadChromium(loadPlaywright).then((chromium) => chromium.launch({ headless: true }));
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
        const signedIn = session?.has() ?? false;
        context = await browser.newContext({ locale: 'vi-VN', ...(signedIn ? { storageState: session.file } : {}) });
        const page = await context.newPage();
        await page.goto('https://www.tiktok.com/explore', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        const out = await fn(page);
        // TikTok rotates some cookies while browsing; keep the newest so the sign-in lasts.
        if (signedIn && session.has()) await session.save(context).catch(() => {});
        return out;
      } finally {
        await context?.close().catch(() => {});
        if (--inUse === 0) arm();
      }
    },
    close,
    isOpen: () => browserP != null,
  };
}
