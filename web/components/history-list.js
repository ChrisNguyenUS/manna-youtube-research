// The "latest results" card at the bottom of a screen: the 5 newest of one kind, a link to the full history, delete.
import { records } from '../http/client.js';
import { esc, icon, ago, emptyState, toast } from '../lib.js';

/**
 * @param {Element} el the card
 * @param {{kind: string, path: string, title: string, empty: string, extra?: (r: any) => string, limit?: number}} o
 *   title: HTML of the heading; extra(r): plain text shown next to the name (search criteria…)
 * @returns {() => Promise<void>} refresh, to call after a new result was saved
 */
export function historyList(el, { kind, path, title, empty, extra = () => '', limit = 5 }) {
  let armed = ''; // id of the row whose delete button waits for a second click
  /** @type {any[]} */
  let list = [];
  function render() {
    el.innerHTML = `<div class="card-head"><h3>${title}</h3><a class="btn sm" href="#/history?kind=${kind}">Xem tất cả</a></div>${
      list.length
        ? list.map((r) => `<div class="list-row"><a class="name" href="#${path}?id=${r.id}">${esc(r.title)}</a>${extra(r) ? `<span class="small muted">${esc(extra(r))}</span>` : ''}<span class="when">${ago(r.created_at)}</span>
            ${armed === String(r.id) ? `<button type="button" class="btn sm danger" data-del="${r.id}">Xoá hẳn?</button>` : `<button type="button" class="icon-btn" data-del="${r.id}" title="Xoá">${icon('trash')}</button>`}</div>`).join('')
        : emptyState(empty)
    }`;
  }
  async function refresh() {
    list = await records.list(kind, limit);
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
