// The only module in the web app that talks to the server (docs/ARCHITECTURE.md §10).
const BASE = '/api/v1';

/** @param {string} path @param {{method?: string, body?: any}} [o] */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  // The page is always loaded fresh from disk, but a server started before an update still runs the old code.
  if (res.status === 404 && data.error?.message === 'Không có API này') throw new Error('Server đang chạy bản cũ, chưa có tính năng này. Tắt app (Stop Content Research) rồi mở lại.');
  if (!res.ok) throw Object.assign(new Error(data.error?.message || data.error || `Lỗi ${res.status}`), { code: data.error?.code });
  return data;
}

const q = (o) => {
  const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : '';
};

export const jobs = {
  /** @param {string} kind @param {any} params @returns {Promise<{id: number, reused: boolean}>} */
  start: (kind, params) => api(`/jobs/${kind}`, { method: 'POST', body: params }),
  get: (id) => api(`/jobs/${id}`),
  list: () => api('/jobs'),
  cancel: (id) => api(`/jobs/${id}/cancel`, { method: 'POST', body: {} }),
};

export const records = {
  /** @param {string|null} kind @param {number} [limit] */
  list: (kind, limit) => api(`/records${q({ kind, limit })}`),
  get: (id) => api(`/records/${id}`),
  /** History page. @param {{q?: string, kinds?: string[], limit?: number, offset?: number}} o @returns {Promise<{total: number, items: any[], counts: Record<string, number>}>} */
  search: ({ q: text, kinds = [], limit, offset } = {}) => api(`/records/search${q({ q: text, kinds: kinds.join(','), limit, offset })}`),
  remove: (id) => api(`/records/${id}`, { method: 'DELETE' }),
  /** Link for downloads: export.md / export.csv (+ query like {what: 'comments'}). */
  exportUrl: (id, ext, query = {}) => `${BASE}/records/${id}/export.${ext}${q(query)}`,
};

export const saved = {
  /** @param {string} [kind] */
  list: (kind) => api(`/saved${q({ kind })}`),
  keys: () => api('/saved/keys'),
  /** Markdown of the saved items (one kind, or all). @param {string} [kind] @param {boolean} [inline] */
  exportUrl: (kind, inline = false) => `${BASE}/saved/export.md${q({ kind, inline: inline ? 1 : '' })}`,
  /** @param {{kind: string, ref: string, title?: string, data?: any, note?: string}} item */
  put: (item) => api('/saved', { method: 'POST', body: item }),
  /** @param {{kind: string, ref: string, note: string}} item */
  note: (item) => api('/saved', { method: 'PATCH', body: item }),
  /** @param {{kind: string, ref: string}} item */
  remove: (item) => api('/saved', { method: 'DELETE', body: item }),
};

export const settings = {
  get: () => api('/settings'),
  save: (obj) => api('/settings', { method: 'POST', body: obj }),
};

export const metrics = { load: () => api('/metrics') };
export const status = { get: () => api('/status') };
/** Stop the whole app (server, running jobs, the hidden TikTok browser). The window stays open but stops working. */
export const shutdown = () => api('/shutdown', { method: 'POST', body: { confirm: true } });
/** TikTok sign-in: start() opens a window on this computer and resolves once the user has signed in there. */
export const tiktokLogin = {
  get: () => api('/tiktok/login'),
  start: () => api('/tiktok/login', { method: 'POST', body: {} }),
  logout: () => api('/tiktok/login', { method: 'DELETE', body: {} }),
};
/** "Tìm theo chủ đề": related keywords for a topic (about 10 seconds). */
export const tiktokTopic = {
  /** @param {string} topic @param {number} [limit] */
  keywords: (topic, limit) => api('/tiktok/topic/keywords', { method: 'POST', body: { topic, limit } }),
};
/** Insight report: its comment groups with the ids of their comments, for the topic explorer. */
export const tiktokInsight = {
  /** @param {number|string} id */
  topics: (id) => api(`/tiktok/insight/${id}/topics`),
};
/** @param {string[]} ids */
export const compareChannels = (ids) => api('/compare', { method: 'POST', body: { ids } });
/** "Theo dõi": followed YouTube/TikTok channels. Checking them is the follow_refresh job. */
export const follows = {
  /** @param {'youtube'|'tiktok'} [platform] */
  list: (platform) => api(`/follows${q({ platform })}`),
  keys: () => api('/follows/keys'),
  /** @param {{platform: string, ref: string, title?: string, data?: any}} f */
  add: (f) => api('/follows', { method: 'POST', body: f }),
  /** From what the user typed (@name or link). @param {'youtube'|'tiktok'} platform @param {string} input @returns {Promise<{platform: string, ref: string}>} */
  addInput: (platform, input) => api('/follows/input', { method: 'POST', body: { platform, input } }),
  /** @param {{platform: string, ref: string, note: string}} f */
  note: (f) => api('/follows', { method: 'PATCH', body: f }),
  /** @param {{platform: string, ref: string}} f */
  remove: (f) => api('/follows', { method: 'DELETE', body: f }),
};
/** Snapshots of a YouTube channel's public numbers, one per saved analysis (oldest first). @param {string} id */
export const channelHistory = (id) => api(`/channels/${encodeURIComponent(id)}/history`);
/** Shared TikTok comment dataset (every screen that collected comments). */
export const tiktokCommentData = {
  /** Videos with collected comments, with counts and the reports holding them. */
  videos: () => api('/tiktok/comment-videos'),
  /** "Thu thập bình luận" runs, newest first. */
  collections: () => api('/tiktok/comment-collections'),
  /** How much of each video is already collected, and whether it can be reused for `max` parent comments. @param {string[]} ids @param {{max?: number, replies?: boolean}} [want] */
  coverage: (ids, { max = 100, replies = true } = {}) => api(`/tiktok/comment-coverage?ids=${encodeURIComponent(ids.join(','))}&max=${max}&replies=${replies}`),
  /** "Phân tích video" runs with their videos, script status and comment counts. @param {number} [limit] */
  analyses: (limit = 20) => api(`/tiktok/video-analyses?limit=${limit}`),
  /** All collected comments of these videos, with intents and question groups. @param {string[]} ids */
  of: (ids) => api(`/tiktok/comments?videos=${encodeURIComponent(ids.join(','))}`),
};

/** 5W1H report over collected TikTok comments (AI). The run itself is the job `comment_5w1h`. */
export const tiktokFiveW = {
  /** How many comments and tokens a run would send, and whether an API key is set. @param {string[]} ids */
  estimate: (ids) => api(`/tiktok/5w1h/estimate?videos=${encodeURIComponent(ids.join(','))}`),
  /** A saved report with its comments and the counted table. @param {number|string} id */
  report: (id) => api(`/tiktok/5w1h/${id}`),
};

/** Soulprint: the root profile of the owner's content. AI helpers return suggestions; only `save` writes. */
export const soulprint = {
  get: () => api('/soulprint'),
  /** @param {any} profile the whole profile on screen */
  save: (profile) => api('/soulprint', { method: 'POST', body: { profile } }),
  seeds: () => api('/soulprint/seeds'),
  /** @param {string} action @param {{profile: any, questionId?: string, answer?: string, text?: string}} input */
  assist: (action, input) => api('/soulprint/assist', { method: 'POST', body: { action, ...input } }),
  /** @param {string} text */
  importText: (text) => api('/soulprint/import', { method: 'POST', body: { text } }),
  exportUrl: (inline = false) => `${BASE}/soulprint/export.md${inline ? '?inline=1' : ''}`,
};

/** The brick library: videos broken into bricks by AI. Extraction is the job `brick_extract`. */
export const bricks = {
  /** Rows plus the fixed lists the filters and editors use. */
  list: () => api('/bricks'),
  /** @param {string} platform @param {string} id */
  deepDiveUrl: (platform, id) => `${BASE}/bricks/${platform}/${encodeURIComponent(id)}/deep-dive.md`,
  candidates: () => api('/bricks/candidates'),
  /** @param {string} channelRef "platform:ref" */
  compare: (channelRef) => api(`/bricks/compare${q({ channel: channelRef })}`),
  /** @param {string} platform @param {string} id */
  get: (platform, id) => api(`/bricks/${platform}/${encodeURIComponent(id)}`),
  /** @param {string} platform @param {string} id @param {Record<string, any>} edits path → value */
  update: (platform, id, edits) => api(`/bricks/${platform}/${encodeURIComponent(id)}`, { method: 'POST', body: { edits } }),
  remove: (platform, id) => api(`/bricks/${platform}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** @param {string[]} keys "platform:id"; none: the whole library */
  exportUrl: (keys = []) => `${BASE}/bricks/export.md${q({ keys: keys.join(',') })}`,
};
