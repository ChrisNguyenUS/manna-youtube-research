// Tiny input validator (no dependency). Schema values:
//   'string!' required string (lists allowed: keywords can be ["a","b"]), 'string?' optional,
//   'int!'/'int?' integer (strings coerced), 'bool?' boolean-ish, ['a','b'] enum.

/**
 * @param {Record<string, string|string[]>} schema
 * @param {Record<string, any>} [value]
 * @returns {{ok: boolean, value?: Record<string, any>, field?: string, message?: string}}
 */
export function validate(schema, value = {}) {
  const out = { ...value };
  for (const [field, rule] of Object.entries(schema)) {
    const v = value[field];
    const missing = v == null || v === '' || (Array.isArray(v) && !v.length);
    if (Array.isArray(rule)) {
      if (!missing && !rule.includes(v)) return { ok: false, field, message: `phải là một trong: ${rule.join(', ')}` };
      continue;
    }
    const flag = rule.slice(-1);
    const type = rule.replace(/[!?]$/, '');
    if (missing) {
      if (flag === '!') return { ok: false, field, message: 'bắt buộc' };
      continue;
    }
    if (type === 'int') {
      const n = Number(v);
      if (!Number.isInteger(n)) return { ok: false, field, message: 'phải là số nguyên' };
      out[field] = n;
    } else if (type === 'string') {
      if (typeof v !== 'string' && !(Array.isArray(v) && v.every((x) => typeof x === 'string'))) return { ok: false, field, message: 'phải là chuỗi' };
    } else if (type === 'bool') {
      out[field] = v === true || v === 'true' || v === 1;
    }
  }
  return { ok: true, value: out };
}
