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
export const HOME = { icon: 'home', label: 'Tổng quan', tabs: [['/', 'Tổng quan', () => import('./views/dashboard.js')]] };
/** @type {Item} */
export const SOULPRINT = { icon: 'target', label: 'Soulprint', tabs: [['/soulprint', 'Soulprint', () => import('./views/soulprint.js')]] };

/** @type {{key: string, title: string, items: Item[]}[]} */
export const GROUPS = [
  {
    key: 'find', title: 'Tìm',
    items: [
      // The three search screens show their own TikTok | YouTube switch inside the form (`inline`), with one screen per
      // platform, so switching keeps you on the same job. Kênh exists on YouTube only: its TikTok side shows greyed out.
      {
        icon: 'compass', label: 'Chủ đề', inline: true,
        platforms: {
          tiktok: [['/tiktok/topic', 'Nghiên cứu chủ đề', () => import('./views/tiktok/topic.js')]],
          youtube: [['/research', 'Nghiên cứu chủ đề', () => import('./views/research.js')]],
        },
      },
      {
        icon: 'search', label: 'Video', inline: true,
        platforms: {
          tiktok: [['/tiktok/search', 'Tìm video', () => import('./views/tiktok/search.js')]],
          youtube: [['/videos', 'Tìm video', () => import('./views/videos.js')]],
        },
      },
      { icon: 'users', label: 'Kênh', only: 'youtube', inline: true, tabs: [['/channels', 'Tìm kênh', () => import('./views/channels.js')]] },
      {
        icon: 'key', label: 'Từ khoá', only: 'youtube',
        tabs: [
          ['/keywords', 'Gợi ý từ khoá', () => import('./views/keywords.js')],
          ['/ideas', 'Chấm điểm từ khoá', () => import('./views/ideas.js')],
        ],
      },
      { icon: 'eye', label: 'Theo dõi', tabs: [['/follows', 'Kênh đang theo dõi', () => import('./views/follows.js')]] },
    ],
  },
  {
    key: 'dissect', title: 'Phân tích',
    items: [
      { icon: 'bars', label: 'Phân tích video', tabs: [['/video', 'Phân tích video', () => import('./views/video.js')]] },
      {
        icon: 'users', label: 'Phân tích kênh',
        platforms: {
          tiktok: [['/tiktok/channel', 'Phân tích kênh', () => import('./views/tiktok/channel.js')]],
          youtube: [
            ['/channel', 'Phân tích kênh', () => import('./views/channel.js')],
            ['/compare', 'So sánh kênh', () => import('./views/compare.js')],
          ],
        },
      },
      { icon: 'target', label: 'Thư viện gạch', tabs: [['/bricks', 'Thư viện gạch', () => import('./views/bricks.js')]] },
    ],
  },
  {
    key: 'audience', title: 'Khán giả',
    items: [
      {
        icon: 'message', label: 'Bình luận',
        platforms: {
          tiktok: [['/tiktok/comments', 'Thu thập bình luận', () => import('./views/tiktok/comments.js')]],
          youtube: [['/comments', 'Lấy comment', () => import('./views/comments.js')]],
        },
      },
      {
        icon: 'target', label: 'Insight',
        platforms: {
          tiktok: [
            ['/tiktok/insight', 'Theo từ khoá', () => import('./views/tiktok/insight.js')],
            ['/tiktok/insight/collected', 'Từ comment đã có', () => import('./views/tiktok/insight-collected.js')],
          ],
          youtube: [['/insight', 'Theo từ khoá', () => import('./views/insight.js')]],
        },
      },
      { icon: 'bolt', label: '5W1H', only: 'tiktok', tabs: [['/tiktok/5w1h', '5W1H (AI)', () => import('./views/tiktok/five-w.js')]] },
    ],
  },
  {
    key: 'make', title: 'Làm',
    items: [{ icon: 'bulb', label: 'Bảng ý tưởng', tabs: [['/board', 'Bảng ý tưởng', () => import('./views/board.js')], ['/board/review', 'Chấm lô', () => import('./views/board-review.js')]] }],
  },
  {
    key: 'library', title: 'Lưu trữ',
    items: [
      { icon: 'clock', label: 'Lịch sử', tabs: [['/history', 'Lịch sử', () => import('./views/history.js')]] },
      { icon: 'bookmark', label: 'Đã lưu', tabs: [['/saved', 'Đã lưu', () => import('./views/saved.js')]] },
      { icon: 'settings', label: 'Cài đặt', tabs: [['/settings', 'Cài đặt', () => import('./views/settings.js')]] },
    ],
  },
];

export const ITEMS = [HOME, SOULPRINT, ...GROUPS.flatMap((g) => g.items)];

/** Old paths that now open another screen (the query string is kept). @type {Record<string, string>} */
export const ALIASES = { '/tiktok/video': '/video' };

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
