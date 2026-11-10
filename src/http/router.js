// Declarative routes: { method, path: '/api/v1/jobs/:id', schema?, handler(ctx) }.
// Handlers return a JSON-able value or raw(...) for files; they throw httpError(...) for failures.

const STATUS = { invalid_input: 400, not_found: 404, license_required: 402, rate_limited: 429, internal: 500 };

/** @param {keyof typeof STATUS} code @param {string} message @param {string} [field] */
export function httpError(code, message, field) {
  return Object.assign(new Error(message), { code, field });
}

/** A non-JSON response (downloads, markdown). */
export const raw = (body, type, headers = {}) => ({ __raw: true, body, type, headers });

/** @param {{method: string, path: string, schema?: any, handler: (ctx: any) => any}[]} routes */
export function createRouter(routes) {
  const compiled = routes.map((r) => {
    const keys = [];
    const re = new RegExp('^' + r.path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')).replace(/\./g, '\\.') + '$');
    return { ...r, re, keys };
  });
  /** @param {string} method @param {string} pathname */
  function match(method, pathname) {
    // v0 clients call /api/x; everything lives under /api/v1/x.
    const p = pathname.startsWith('/api/v1/') ? pathname : pathname.replace(/^\/api\//, '/api/v1/');
    let pathMatched = false;
    for (const r of compiled) {
      const m = p.match(r.re);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return { route: null, pathMatched };
  }
  return { match };
}

/** @param {any} e */
export function errorBody(e) {
  const code = e?.code in STATUS ? e.code : 'internal';
  return { status: STATUS[code], body: { error: { code, message: e?.message || 'Lỗi', ...(e?.field ? { field: e.field } : {}) } } };
}
