// One form shape for the search screens (Chủ đề, Video, Kênh) on both platforms:
//   title + one line
//   [TikTok | YouTube] [main input ............] [Run]
//   main filters (label | choices rows)
//   ▸ Tuỳ chọn nâng cao (platform-specific, closed by default)
//   how long it takes
// Switching platform opens the same screen on the other platform and carries what was typed and the region.
import { esc, icon } from '../lib.js';
import { findItem, firstPath, platformOf, PLATFORM_LABELS } from '../nav.js';

/** @param {string} ic @param {string} title @param {string} line one sentence, HTML allowed */
export const findHead = (ic, title, line) => `<div class="page-head"><div><h1>${icon(ic)} ${esc(title)}</h1><p>${line}</p></div></div>`;

/** TikTok | YouTube for the screen at `path`; the platform without this screen shows greyed out. @param {string} path */
export function platformSwitch(path) {
  const item = findItem(path);
  const cur = platformOf(item, path) ?? item.only;
  return `<div class="plat-switch" role="group" aria-label="Nền tảng">${Object.entries(PLATFORM_LABELS)
    .map(([k, l]) =>
      k === cur
        ? `<span class="on" aria-current="true">${l}</span>`
        : item.platforms
          ? `<a href="#${firstPath(item, k)}" data-plat="${k}" title="Chạy bằng thuật toán ${l}">${l}</a>`
          : `<span class="off" aria-disabled="true" title="Chưa có bản ${l} cho mục này">${l}</span>`,
    )
    .join('')}</div>`;
}

/** Row 1: platform switch, main input, run button. @param {{path: string, input: string, button: string}} o */
export const findBar = ({ path, input, button }) => `<div class="find-bar">${platformSwitch(path)}<div class="find-input">${input}</div>${button}</div>`;

/** Label | control rows. @param {[string, string][]} rows [label HTML, control HTML] */
export const findRows = (rows) =>
  `<div class="filter-table find-rows">${rows.filter(Boolean).map(([l, c]) => `<div class="filter-row"><div class="fr-label">${l}</div><div class="fc">${c}</div></div>`).join('')}</div>`;

/** Settings most searches leave alone. @param {[string, string][]} rows @param {string} [extra] HTML under the rows */
export const findAdvanced = (rows, extra = '') =>
  `<details class="find-adv"><summary>${icon('settings')} Tuỳ chọn nâng cao</summary>${findRows(rows)}${extra}</details>`;

/** @param {string} value @param {string[][]} list [code, label] @param {string} [key] */
export const regionSelect = (value, list, key = 'gl') =>
  `<select class="select input sm find-select" data-k="${key}">${list.map(([v, l]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

/**
 * Clicking the other platform opens its screen with what was typed and the region picked.
 * @param {Element} root @param {() => Record<string, string>} carry
 */
export function bindPlatformSwitch(root, carry) {
  root.querySelector('.plat-switch')?.addEventListener('click', (e) => {
    const a = /** @type {HTMLAnchorElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('a[data-plat]'));
    if (!a) return;
    e.preventDefault();
    const params = Object.fromEntries(Object.entries(carry()).filter(([, v]) => v));
    window.__go(String(a.getAttribute('href')).slice(1), params);
  });
}
