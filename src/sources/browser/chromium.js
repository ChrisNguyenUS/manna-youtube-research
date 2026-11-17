// How the app loads and presents its hidden Chromium (Playwright is optional and imported only when needed).
// Shared by the TikTok source and the YouTube transcript reader; each keeps its own browser lifecycle.

// Kept as a variable so typecheck does not require the optional package to be installed.
export const PLAYWRIGHT = 'playwright';
// Sites answer a browser that says it is automated or headless with empty pages, so the hidden browser presents
// itself as an ordinary desktop Chrome (the user allowed this, 2026-11-13).
export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export const LAUNCH_ARGS = ['--disable-blink-features=AutomationControlled'];

/** Playwright's chromium from the module, whichever way it was exported. @param {() => Promise<any>} [load] */
export const loadChromium = async (load = () => import(PLAYWRIGHT)) => {
  const pw = await load();
  return pw.chromium ?? pw.default?.chromium;
};
