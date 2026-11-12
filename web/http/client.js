// The only module in the web app that talks to the server (docs/ARCHITECTURE.md §10).
const BASE = '/api/v1';

/** @param {string} path @param {{method?: string, body?: any}} [o] */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || data.error || `Lỗi ${res.status}`);
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
  remove: (id) => api(`/records/${id}`, { method: 'DELETE' }),
  /** Link for downloads: export.md / export.csv (+ query like {what: 'comments'}). */
  exportUrl: (id, ext, query = {}) => `${BASE}/records/${id}/export.${ext}${q(query)}`,
};

export const saved = {
  /** @param {string} [kind] */
  list: (kind) => api(`/saved${q({ kind })}`),
  keys: () => api('/saved/keys'),
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
/** TikTok sign-in: start() opens a window on this computer and resolves once the user has signed in there. */
export const tiktokLogin = {
  get: () => api('/tiktok/login'),
  start: () => api('/tiktok/login', { method: 'POST', body: {} }),
  logout: () => api('/tiktok/login', { method: 'DELETE', body: {} }),
};
/** @param {string[]} ids */
export const compareChannels = (ids) => api('/compare', { method: 'POST', body: { ids } });
