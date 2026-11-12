// Synchronous scrape API: keywords in, ranked TikTok videos out (like Apify's run-sync-get-dataset-items).
// The request stays open while Chromium searches (about 15–60 s per keyword); closing it stops the scrape.
import { httpError } from '../router.js';
import { validate } from '../validate.js';
import { runWithSignal, CancelledError } from '../../core/cancel.js';
import { SORTS } from '../../core/tiktok/rank.js';

export const SCRAPE_SCHEMA = {
  keywords: 'string!',
  perKeyword: 'int?',
  limit: 'int?',
  sort: /** @type {any} */ ([...SORTS]),
  keepOffTopic: 'bool?',
  minPlays: 'int?',
  minLikes: 'int?',
  maxAgeDays: 'int?',
  minEngagement: 'int?',
  save: 'bool?',
};

/** @param {any} app @param {Record<string, any>} input @param {AbortSignal} [signal] */
function scrape(app, input, signal = new AbortController().signal) {
  const v = validate(SCRAPE_SCHEMA, input);
  if (!v.ok) throw httpError('invalid_input', v.message, v.field);
  const progress = () => {
    if (signal.aborted) throw new CancelledError();
  };
  return runWithSignal(signal, null, () => app.features.tiktokScrape(v.value, progress));
}

export const tiktokRoutes = [
  // TikTok sign-in: POST opens a Chromium window on this computer and answers once the user has signed in there
  // (or closed the window, or 10 minutes passed). Only the sign-in state comes back, never cookies.
  { method: 'GET', path: '/api/v1/tiktok/login', handler: ({ app }) => app.tiktok.loginStatus() },
  { method: 'POST', path: '/api/v1/tiktok/login', handler: ({ app, signal }) => runWithSignal(signal ?? new AbortController().signal, null, () => app.tiktok.login()) },
  { method: 'DELETE', path: '/api/v1/tiktok/login', handler: async ({ app }) => (await app.tiktok.logout(), app.tiktok.loginStatus()) },
  // Related keywords for "Tìm theo chủ đề" (about 10 seconds): TikTok's autocomplete and "others searched for", grouped by intent.
  {
    method: 'POST', path: '/api/v1/tiktok/topic/keywords',
    handler: ({ app, body, signal }) => {
      const v = validate({ topic: 'string!', limit: 'int?' }, body);
      if (!v.ok) throw httpError('invalid_input', v.message, v.field);
      return runWithSignal(signal ?? new AbortController().signal, null, () => app.features.tiktokTopicKeywords(v.value));
    },
  },
  { method: 'POST', path: '/api/v1/tiktok/videos', handler: ({ app, body, signal }) => scrape(app, body, signal) },
  {
    method: 'GET', path: '/api/v1/tiktok/videos',
    handler: ({ app, query, signal }) => {
      // ?keywords=a&keywords=b and ?keywords=a,b both work.
      const input = Object.fromEntries(query);
      input.keywords = query.getAll('keywords').join(',');
      return scrape(app, input, signal);
    },
  },
];
