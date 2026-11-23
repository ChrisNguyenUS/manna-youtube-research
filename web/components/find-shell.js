// One setup shape for the search screens (Chủ đề, Video, Kênh) on both platforms:
//   title + one line                                   [Lịch sử]
//   [   TikTok   |   YouTube   ]   (same screen, the other platform's algorithm)
//   [🔍 main input ......................... ✕] [Run]
//   Phạm vi nghiên cứu   (region, time, views: the filters both platforms share)
//   Tiêu chí tìm kiếm    (platform-specific; switches on the right)
//   ▸ Tuỳ chọn nâng cao  (closed; says how many settings differ from the defaults)
//   ⓘ how long it takes (secondary)
// Switching platform carries what was typed and the region; each platform keeps its own settings.
import { esc, icon } from '../lib.js';
import { findItem, platformOf, PLATFORM_LABELS } from '../nav.js';

/** Platform marks (filled, unlike the stroke icons): a play button and a note. @param {'tiktok'|'youtube'} p */
export const platformMark = (p) =>
  p === 'youtube'
    ? '<svg class="pmark" viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="5" width="21" height="14" rx="4" fill="#ff0033"/><path d="M10 9v6l5.2-3z" fill="#fff"/></svg>'
    : '<svg class="pmark" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 3h3c.3 2 1.6 3.4 3.6 3.6v3c-1.4 0-2.6-.4-3.6-1.1v6.3a5.3 5.3 0 1 1-5.3-5.3c.3 0 .6 0 .9.1v3.1a2.3 2.3 0 1 0 1.4 2.1z" fill="currentColor"/></svg>';

/** @param {string} ic @param {string} title @param {string} line one sentence, HTML allowed */
export const findHead = (ic, title, line) =>
  `<div class="page-head"><div><h1>${icon(ic)} ${esc(title)}</h1><p>${line}</p></div><button type="button" class="btn" data-goto-history>${icon('clock')} History</button></div>`;

/**
 * TikTok | YouTube for the screen at `path`: the other platform's screen in the same place of the entry (Search → Video
 * opens the other Video); a platform without that screen shows greyed out (Search → Kênh on TikTok). @param {string} path
 */
export function platformTabs(path) {
  const item = findItem(path);
  const cur = platformOf(item, path) ?? item.only;
  const at = item.platforms ? item.platforms[cur].findIndex((t) => t[0] === path) : -1;
  const target = (k) => (item.platforms ? item.platforms[k][at]?.[0] : null);
  return `<div class="rs-plat" role="group" aria-label="Nền tảng">${Object.entries(PLATFORM_LABELS)
    .map(([k, l]) => {
      const inner = `${platformMark(/** @type {any} */ (k))}<span>${l}</span>`;
      if (k === cur) return `<span class="on" aria-current="true">${inner}</span>`;
      if (target(k)) return `<a href="#${target(k)}" data-plat="${k}" title="Chạy bằng thuật toán ${l}">${inner}</a>`;
      return `<span class="off" aria-disabled="true" title="Chưa có bản ${l} cho mục này">${inner}<small>chưa có</small></span>`;
    })
    .join('')}</div>`;
}

/**
 * Main input with a search icon and a clear button, and the run button.
 * @param {{key: string, value: string, placeholder: string, button: string, label: string}} o button: HTML of the run button
 */
export const searchBar = ({ key, value, placeholder, button, label }) =>
  `<div class="rs-bar"><label class="rs-search">${icon('search')}<input data-k="${key}" value="${esc(value)}" placeholder="${esc(placeholder)}" aria-label="${esc(label)}" autocomplete="off"><button type="button" class="icon-btn" data-clear title="Xoá" aria-label="Xoá">${icon('x')}</button></label>${button}</div>`;

/** @param {string} ic @param {string} title @param {string} body @param {string} [side] HTML in a right-hand column (switches) */
export const section = (ic, title, body, side = '') =>
  `<section class="rs-sec"><h3>${icon(ic)}${esc(title)}</h3>${side ? `<div class="rs-split"><div>${body}</div><div class="rs-side">${side}</div></div>` : body}</section>`;

/** Label | control rows. @param {([string, string, string]|false|null)[]} rows [icon, label HTML, control HTML] */
export const fieldRows = (rows) =>
  `<div class="rs-rows">${rows.filter(Boolean).map(([ic, l, c]) => `<div class="rs-row"><div class="rs-label">${icon(ic)}<span>${l}</span></div><div class="rs-ctl">${c}</div></div>`).join('')}</div>`;

/** A checkbox with a label and an optional explanation (ⓘ). @param {string} key @param {string} label @param {boolean} on @param {string} [tip] */
export const checkRow = (key, label, on, tip = '') =>
  `<label class="rs-check"><input type="checkbox" data-k="${key}" ${on ? 'checked' : ''}><span>${label}</span>${tip ? `<span class="rs-tip" data-tip="${esc(tip)}" tabindex="0" aria-label="${esc(tip)}">${icon('info')}</span>` : ''}</label>`;

/**
 * Settings most searches leave alone, closed by default.
 * @param {{rows: ([string, string, string]|false|null)[], summary: string, changed?: number, extra?: string}} o
 *   summary: what is inside, in a few words; changed: how many differ from the defaults
 */
export const advanced = ({ rows, summary, changed = 0, extra = '' }) =>
  `<details class="rs-adv" data-adv><summary>${icon('settings')}<b>Tuỳ chọn nâng cao</b><span class="rs-changed" data-changed ${changed ? '' : 'hidden'}>${changed} đã đổi</span><span class="rs-advsum">${esc(summary)}</span>${icon('chevron')}</summary><div class="rs-advbody">${fieldRows(rows)}${extra}</div></details>`;

/** How many of `keys` differ from `defaults`. @param {Record<string, any>} st @param {Record<string, any>} defaults @param {string[]} keys */
export const changedCount = (st, defaults, keys) => keys.filter((k) => String(st[k] ?? '') !== String(defaults[k] ?? '')).length;

/** Time and cost, as secondary text. @param {string} html */
export const estimate = (html) => `<div class="rs-est">${icon('info')}<span>${html}</span></div>`;

/** @param {string} value @param {string[][]} list [code, label] @param {string} [key] */
export const regionSelect = (value, list, key = 'gl') =>
  `<select class="select input sm rs-select" data-k="${key}" aria-label="Khu vực">${list.map(([v, l]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

/**
 * Wire the shared parts: the platform switch (opens the other platform's screen with what was typed and the region),
 * the clear button, "Lịch sử" (scrolls to the history card) and the "đã đổi" count of the advanced settings.
 * @param {Element} root
 * @param {{carry: () => Record<string, string>, changed?: () => number}} o
 * @returns {() => void} refresh of the "đã đổi" count (call after loading other settings)
 */
export function bindShell(root, { carry, changed }) {
  root.querySelector('.rs-plat')?.addEventListener('click', (e) => {
    const a = /** @type {HTMLAnchorElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('a[data-plat]'));
    if (!a) return;
    e.preventDefault();
    const params = Object.fromEntries(Object.entries(carry()).filter(([, v]) => v));
    window.__go(String(a.getAttribute('href')).slice(1), params);
  });
  root.querySelector('.rs-search [data-clear]')?.addEventListener('click', (e) => {
    const input = /** @type {HTMLInputElement} */ (/** @type {HTMLElement} */ (e.currentTarget).closest('.rs-search').querySelector('input'));
    input.value = '';
    input.dispatchEvent(new Event('change'));
    input.focus();
  });
  // The tabs above the page (Search: Video | Kênh) take what was typed along, like the platform switch.
  root.parentElement?.querySelector('.page-tabs')?.addEventListener('click', (e) => {
    const a = /** @type {HTMLAnchorElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('a[href^="#/"]'));
    if (!a || a.classList.contains('on')) return;
    e.preventDefault();
    window.__go(String(a.getAttribute('href')).slice(1), Object.fromEntries(Object.entries(carry()).filter(([, v]) => v)));
  });
  root.querySelector('[data-goto-history]')?.addEventListener('click', () => root.querySelector('[data-history]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const sync = () => {
    const el = /** @type {HTMLElement|null} */ (root.querySelector('[data-changed]'));
    if (!el || !changed) return;
    const n = changed();
    el.hidden = !n;
    el.textContent = `${n} đã đổi`;
  };
  // After the screen's own handlers have stored the new value.
  const adv = root.querySelector('[data-adv]');
  adv?.addEventListener('click', () => setTimeout(sync));
  adv?.addEventListener('change', () => setTimeout(sync));
  return sync;
}
