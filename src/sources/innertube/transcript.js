// YouTube's transcript, read from the watch page with a hidden Chromium: open the description, press "Show
// transcript", read the rows of the panel. YouTube's own transcript endpoints refuse outside callers (checked
// 2026-11-13), and this panel is what a signed-out visitor sees. It depends on the page's layout, so every way it
// can fail has its own code and the rest of a video's analysis never depends on it.
// Layout captured 2026-11-17 (fixtures/transcript-panel.html): rows are <transcript-segment-view-model> with a
// timestamp div and a role="text" span. The older <ytd-transcript-segment-renderer> layout is read too.
import { parseClock } from '../../core/video/transcript.js';
import { throwIfCancelled } from '../../core/cancel.js';
import { PLAYWRIGHT, USER_AGENT, LAUNCH_ARGS, loadChromium } from '../browser/chromium.js';

const SEL = {
  expand: '#description #expand, tp-yt-paper-button#expand',
  open: 'ytd-video-description-transcript-section-renderer button',
  row: 'transcript-segment-view-model, ytd-transcript-segment-renderer',
  time: '.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp',
  text: 'span[role="text"], .segment-text',
};
const err = (code, message) => Object.assign(new Error(message), { code });

/**
 * Panel rows → transcript segments. A segment ends where the next one starts; rows without a readable time or
 * without text are dropped. @param {{time: string, text: string}[]} rows
 * @returns {import('../../core/video/transcript.js').Segment[]}
 */
export function segmentsFromRows(rows) {
  const read = (rows || []).map((r) => ({ start: parseClock(String(r?.time ?? '').trim()), text: String(r?.text ?? '').replace(/\s+/g, ' ').trim() })).filter((r) => r.start != null && Number.isFinite(r.start) && r.text);
  return read.map((r, i) => ({ start: /** @type {number} */ (r.start), end: read[i + 1]?.start ?? null, text: r.text }));
}

/**
 * One hidden browser for transcripts, started on first use and closed after `idleMs` without work.
 * @param {{loadPlaywright?: () => Promise<any>, idleMs?: number}} [o]
 */
export function createTranscriptReader({ loadPlaywright = () => import(PLAYWRIGHT), idleMs = 120_000 } = {}) {
  /** @type {Promise<any>|null} */
  let browserP = null;
  /** @type {any} */
  let idle = null;
  let inUse = 0;
  async function close() {
    clearTimeout(idle);
    const b = browserP;
    browserP = null;
    if (b) await b.then((x) => x.close(), () => {}).catch(() => {});
  }
  function getBrowser() {
    if (!browserP) {
      const p = loadChromium(loadPlaywright).then((chromium) => chromium.launch({ headless: true, args: LAUNCH_ARGS }));
      browserP = p;
      p.catch(() => {
        if (browserP === p) browserP = null; // a failed launch must not stick: the user may install Chromium and retry
      });
    }
    return browserP;
  }
  return {
    /**
     * @param {string} videoId
     * @returns {Promise<import('../../core/video/transcript.js').Transcript|null>} null: the video has no transcript
     */
    async read(videoId) {
      throwIfCancelled();
      clearTimeout(idle);
      inUse++;
      /** @type {any} */
      let context = null;
      try {
        let browser;
        try {
          browser = await getBrowser();
        } catch (e) {
          throw err('setup_required', `Chưa có Chromium để đọc lời thoại YouTube. Cần cài: npm run setup:tiktok (${String(/** @type {any} */ (e)?.message || e).slice(0, 80)})`);
        }
        // English labels and no personalisation: the selectors below do not depend on the label text, the locale
        // only keeps the page the same for everyone.
        context = await browser.newContext({ locale: 'en-US', userAgent: USER_AGENT });
        const page = await context.newPage();
        await page.goto(`https://www.youtube.com/watch?v=${videoId}&hl=en`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.locator(SEL.expand).first().click({ timeout: 20_000 }).catch(() => {}); // some layouts show the description open
        if (!(await page.locator(SEL.open).first().count())) return null;
        await page.locator(SEL.open).first().click({ timeout: 20_000 });
        let rows;
        try {
          await page.waitForSelector(SEL.row, { timeout: 20_000 });
          rows = await page.evaluate(({ row, time, text }) => [...document.querySelectorAll(row)].map((el) => ({ time: el.querySelector(time)?.textContent ?? '', text: el.querySelector(text)?.textContent ?? '' })), SEL);
        } catch (e) {
          throw err('source_changed', `Không đọc được bảng lời thoại của YouTube (trang có thể đã đổi): ${String(/** @type {any} */ (e)?.message || e).slice(0, 80)}`);
        }
        const segments = segmentsFromRows(rows);
        if (!segments.length) throw err('source_changed', 'Bảng lời thoại của YouTube mở ra nhưng không có dòng nào đọc được');
        // The panel does not say whether captions were typed or generated; "auto" is the safe reading.
        return { language: null, kind: 'auto', segments };
      } finally {
        await context?.close().catch(() => {});
        if (--inUse === 0) {
          idle = setTimeout(() => void close(), idleMs);
          idle.unref?.();
        }
      }
    },
    close,
  };
}
