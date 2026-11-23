// The one "Export" control of the app: a button that opens the formats a result has (Markdown, CSV…). A result with
// a single format shows a plain "Export .md" / "Export .csv" link instead. Open menus close on a pick or a click elsewhere.
import { esc, icon } from '../lib.js';

/**
 * @param {[string, string][]} links [href, label]
 * @param {{primary?: boolean, sm?: boolean}} [o] primary: the page's main action (a result page); sm: inside a card head
 */
export const exportMenu = (links, { primary = false, sm = false } = {}) =>
  `<details class="tt-menu"><summary class="btn${primary ? ' primary' : ''}${sm ? ' sm' : ''}">${icon('download')} Export</summary><div class="tt-menu-list">${links.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join('')}</div></details>`;

document.addEventListener('click', (e) => {
  const t = /** @type {HTMLElement} */ (e.target);
  for (const m of document.querySelectorAll('details.tt-menu[open]')) if (!m.contains(t) || t.closest('a')) m.removeAttribute('open');
});
