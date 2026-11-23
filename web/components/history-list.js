// The "Recent" card at the bottom of a screen: the 5 newest results of one kind, a link to the full history, delete.
// The same search run again shows once, newest first, with how many times it ran (like the search screens' Recent).
import { records } from '../http/client.js';
import { esc, icon, ago, emptyState, toast } from '../lib.js';

/**
 * @param {Element} el the card
 * @param {{kind: string, path: string, title?: string, empty: string, extra?: (r: any) => string, limit?: number}} o
 *   title: HTML of the heading; extra(r): plain text shown next to the name (search criteria…)
 * @returns {() => Promise<void>} refresh, to call after a new result was saved
 */
export function historyList(el, { kind, path, title = `${icon('clock')} Recent`, empty, extra = () => '', limit = 5 }) {
  /** One search, whatever run: its name and criteria. @param {any} r */
  const sameKey = (r) => `${r.title}\u0000${extra(r)}`;
  let armed = ''; // id of the row whose delete button waits for a second click
  /** @type {any[]} */
  let list = [];
  /** @type {Map<string, number>} */
  let times = new Map();
  function render() {
    el.innerHTML = `<div class="card-head"><h3>${title}</h3><a class="btn sm" href="#/history?kind=${kind}">Xem tất cả</a></div>${
      list.length
        ? list.map((r) => `<div class="list-row"><a class="name" href="#${path}?id=${r.id}">${esc(r.title)}</a>${extra(r) ? `<span class="small muted">${esc(extra(r))}</span>` : ''}<span class="when">${ago(r.created_at)}${(times.get(sameKey(r)) ?? 1) > 1 ? ` · ${times.get(sameKey(r))} lần` : ''}</span>
            ${armed === String(r.id) ? `<button type="button" class="btn sm danger" data-del="${r.id}">Xoá hẳn?</button>` : `<button type="button" class="icon-btn" data-del="${r.id}" title="Xoá">${icon('trash')}</button>`}</div>`).join('')
        : emptyState(empty)
    }`;
  }
  async function refresh() {
    const all = await records.list(kind, limit * 6);
    times = new Map();
    for (const r of all) times.set(sameKey(r), (times.get(sameKey(r)) ?? 0) + 1);
    const seen = new Set();
    list = all.filter((r) => !seen.has(sameKey(r)) && seen.add(sameKey(r))).slice(0, limit);
    armed = '';
    render();
  }
  el.addEventListener('click', async (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-del]'));
    if (!b) return;
    const id = String(b.dataset.del);
    if (armed !== id) {
      armed = id; // a deleted result cannot be brought back: the first click only asks
      return render();
    }
    await records.remove(id);
    toast('Đã xoá');
    refresh();
  });
  return refresh;
}
