// One headless Chromium per process (Playwright, imported only when a TikTok search runs).
// Each search gets a fresh context, always closed afterwards; the browser closes after idleMs.

// Kept as a variable so typecheck does not require the optional package to be installed.
const PLAYWRIGHT = 'playwright';
// TikTok answers a creator's video list with an empty body to a browser that says it is automated or headless,
// so the hidden browser presents itself as an ordinary desktop Chrome (the user allowed this, 2026-11-13).
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const LAUNCH_ARGS = ['--disable-blink-features=AutomationControlled'];

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
      const p = loadChromium(loadPlaywright).then((chromium) => chromium.launch({ headless: true, args: LAUNCH_ARGS }));
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
    /**
     * @template T @param {(page: any) => Promise<T>} fn
     * @param {{signedIn?: boolean}} [o] signedIn: false opens the page without the user's sign-in even when one is saved
     * @returns {Promise<T>}
     */
    async withPage(fn, { signedIn: useSession = true } = {}) {
      // The idle timer only runs while no page is in use, so it never closes a browser mid-search.
      clearTimeout(idle);
      inUse++;
      let context = null;
      try {
        const browser = await getBrowser();
        const signedIn = useSession && (session?.has() ?? false);
        context = await browser.newContext({ locale: 'vi-VN', userAgent: USER_AGENT, ...(signedIn ? { storageState: session.file } : {}) });
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
