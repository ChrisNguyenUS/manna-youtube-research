// The sidebar, as data. One entry per job to be done; screens that work on the same thing share an entry and show
// as tabs above the page. An entry whose job exists on both platforms lists its screens per platform (`platforms`),
// and the page shows a TikTok | YouTube switch; `only` marks an entry that exists on one platform. No DOM here.
// The platform picked last is remembered once for the whole app (not per entry).

/**
 * @typedef {[string, string, () => Promise<any>]} Tab  [path, tab label, loader of its screen]
 * @typedef {{icon: string, label: string, tabs?: Tab[], platforms?: {tiktok: Tab[], youtube: Tab[]}, only?: 'tiktok'|'youtube', inline?: boolean}} Item
 *   inline: the screen draws the platform switch itself (inside its form), so none is drawn above the page
 */

export const PLATFORM_LABELS = { tiktok: 'TikTok', youtube: 'YouTube' };

/** @type {Item} */
export const HOME = { icon: 'home', label: 'Home', tabs: [['/', 'Home', () => import('./views/dashboard.js')]] };
/** @type {Item} */
export const SOULPRINT = { icon: 'fingerprint', label: 'Soulprint', tabs: [['/soulprint', 'Soulprint', () => import('./views/soulprint.js')]] };

/** @type {{key: string, title: string, items: Item[]}[]} */
export const GROUPS = [
  {
    key: 'find', title: 'Research',
    items: [
      // The three search screens show their own TikTok | YouTube switch inside the form (`inline`), with one screen per
      // platform, so switching keeps you on the same job.
      {
        icon: 'compass', label: 'Topic Research', inline: true,
        platforms: {
          tiktok: [['/tiktok/topic', 'Topic Research', () => import('./views/tiktok/topic.js')]],
          youtube: [['/research', 'Topic Research', () => import('./views/research.js')]],
        },
      },
      {
        // One entry for both searches: Video on TikTok and YouTube, Kênh on YouTube only (TikTok has no channel search).
        icon: 'search', label: 'Search', inline: true,
        platforms: {
          tiktok: [['/tiktok/search', 'Video', () => import('./views/tiktok/search.js')]],
          youtube: [
            ['/videos', 'Video', () => import('./views/videos.js')],
            ['/channels', 'Kênh', () => import('./views/channels.js')],
          ],
        },
      },
      {
        icon: 'key', label: 'Keywords', only: 'youtube',
        tabs: [
          ['/keywords', 'Gợi ý', () => import('./views/keywords.js')],
          ['/ideas', 'Chấm điểm', () => import('./views/ideas.js')],
        ],
      },
      { icon: 'eye', label: 'Watchlist', tabs: [['/follows', 'Watchlist', () => import('./views/follows.js')]] },
    ],
  },
  {
    key: 'dissect', title: 'Analyze',
    items: [
      { icon: 'play', label: 'Video Analysis', tabs: [['/video', 'Video Analysis', () => import('./views/video.js')]] },
      {
        icon: 'bars', label: 'Channel Analysis',
        platforms: {
          tiktok: [['/tiktok/channel', 'Channel Analysis', () => import('./views/tiktok/channel.js')]],
          youtube: [
            ['/channel', 'Channel Analysis', () => import('./views/channel.js')],
            ['/compare', 'Compare', () => import('./views/compare.js')],
          ],
        },
      },
      { icon: 'layers', label: 'Swipe File', tabs: [['/bricks', 'Swipe File', () => import('./views/bricks.js')]] },
    ],
  },
  {
    // Audience (docs/customer-intelligence): collect comments, read them as one run (Audience Insights), then dig in
    // Content Lab. The old "Từ comment đã có" screens became New run (ALIASES); the old 5W1H reports still open (HIDDEN).
    key: 'ci', title: 'Audience',
    items: [
      {
        // One screen per way in (views/comment-collect.js and views/insight-view.js), the same on both platforms.
        icon: 'download', label: 'Collect Comments',
        platforms: {
          tiktok: [
            ['/tiktok/comments', 'Theo link', () => import('./views/comment-collect.js')],
            ['/tiktok/insight', 'Theo từ khoá', () => import('./views/tiktok/insight.js')],
          ],
          youtube: [
            ['/comments', 'Theo link', () => import('./views/comment-collect.js')],
            ['/insight', 'Theo từ khoá', () => import('./views/insight.js')],
          ],
        },
      },
      {
        icon: 'pie', label: 'Audience Insights',
        tabs: [
          ['/ci', 'Overview', () => import('./views/ci/overview.js')],
          ['/ci/topics', 'Pain Points', () => import('./views/ci/topics.js')],
          ['/ci/comments', 'Questions', () => import('./views/ci/comments.js')],
          ['/ci/runs', 'Runs', () => import('./views/ci/runs.js')],
        ],
      },
      {
        icon: 'flask', label: 'Content Lab',
        tabs: [
          ['/ci/lab/whys', '5 Whys', () => import('./views/ci/whys.js')],
          ['/ci/lab/brief', '5W1H Brief', () => import('./views/ci/brief.js')],
          ['/ci/lab/opportunities', 'Opportunities', () => import('./views/ci/opportunities.js')],
        ],
      },
    ],
  },
  {
    key: 'make', title: 'Create',
    items: [{ icon: 'bulb', label: 'Idea Board', tabs: [['/board', 'Idea Board', () => import('./views/board.js')], ['/board/review', 'Batch Review', () => import('./views/board-review.js')]] }],
  },
  {
    key: 'library', title: 'Library',
    items: [
      { icon: 'clock', label: 'History', tabs: [['/history', 'History', () => import('./views/history.js')]] },
      { icon: 'bookmark', label: 'Saved', tabs: [['/saved', 'Saved', () => import('./views/saved.js')]] },
    ],
  },
];

/** Pinned to the foot of the sidebar, so the sidebar fits without scrolling. @type {Item} */
export const SETTINGS = { icon: 'settings', label: 'Settings', tabs: [['/settings', 'Settings', () => import('./views/settings.js')]] };

/**
 * Screens that still open from a link (history, an old result) but have no place in the sidebar: the 5W1H reports made
 * before Content Lab. Opened without an id, the screen sends you on to 5W1H Brief. @type {Item[]}
 */
export const HIDDEN = [{ icon: 'doc', label: '5W1H (bản cũ)', tabs: [['/tiktok/5w1h', '5W1H (bản cũ)', () => import('./views/tiktok/five-w.js')]] }];

export const ITEMS = [HOME, SOULPRINT, ...GROUPS.flatMap((g) => g.items), SETTINGS, ...HIDDEN];

/** Old paths that now open another screen (the query strings of both are kept). @type {Record<string, string>} */
export const ALIASES = {
  '/tiktok/video': '/video',
  '/tiktok/insight/collected': '/ci/runs?new=1',
  '/insight/collected': '/ci/runs?new=1',
};

/** Every screen of an entry, whatever the platform. @param {Item} item @returns {Tab[]} */
export const allTabs = (item) => (item.platforms ? [...item.platforms.tiktok, ...item.platforms.youtube] : item.tabs ?? []);
/** @param {Item} item @param {string} path */
export const has = (item, path) => allTabs(item).some((t) => t[0] === path);
/** The platform a screen belongs to inside an entry that has both; null for entries without the switch. @param {Item} item @param {string} path */
export const platformOf = (item, path) => (!item.platforms ? null : item.platforms.youtube.some((t) => t[0] === path) ? 'youtube' : 'tiktok');
/** The tabs shown above a screen: its platform's screens, or all of the entry's. @param {Item} item @param {string} path @returns {Tab[]} */
export const tabsFor = (item, path) => (item.platforms ? item.platforms[platformOf(item, path) ?? 'tiktok'] : item.tabs ?? []);
/** Where the sidebar link of an entry leads: the first screen of the remembered platform. @param {Item} item @param {string} [platform] */
export const firstPath = (item, platform) => (item.platforms ? (item.platforms[platform === 'youtube' ? 'youtube' : 'tiktok'][0] ?? item.platforms.tiktok[0])[0] : (item.tabs ?? [])[0][0]);
/** The entry a path belongs to; unknown paths open Tổng quan. @param {string} path */
export const findItem = (path) => ITEMS.find((it) => has(it, path)) || HOME;
