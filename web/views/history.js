// Every saved result of both platforms in one place: search by name, filter by platform and kind, open, delete.
import { records } from '../http/client.js';
import { esc, icon, ago, emptyState, setUrl, toast } from '../lib.js';
import { KINDS, PLATFORMS, recordHref } from '../kinds.js';

const PAGE = 50;

export async function mount(root, params) {
  const st = { q: params.q || '', platform: params.platform || 'all', kind: params.kind || '' };
  if (st.kind && KINDS[st.kind]) st.platform = KINDS[st.kind].platform;
  /** @type {any[]} */
  let items = [];
  let total = 0;
  /** @type {Record<string, number>} */
  let counts = {};
  let seq = 0; // answers of an older search are dropped
  let armed = ''; // id of the row whose delete button waits for a second click

  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('clock')} Lịch sử</h1><p>Mọi báo cáo và lần tìm đã chạy trên TikTok và YouTube. Bấm tên để mở lại.</p></div></div>
    <div class="card">
      <div class="hist-bar">
        <label class="tt-searchmini hist-q">${icon('search')}<input data-q placeholder="Tìm theo tên, không cần gõ dấu" value="${esc(st.q)}" autocomplete="off"></label>
        <div class="chips" data-platform></div>
        <label class="tt-pill"><select data-kind aria-label="Loại báo cáo"></select></label>
        <span class="spacer"></span><span class="muted small" data-count></span>
      </div>
      <div data-list></div>
      <div class="hist-more" data-more hidden><button type="button" class="btn" data-load>Hiện thêm</button></div>
    </div>`;
  const list = root.querySelector('[data-list]');
  const kindsOf = () => (st.kind ? [st.kind] : st.platform === 'all' ? [] : Object.keys(KINDS).filter((k) => KINDS[k].platform === st.platform));

  function renderBar() {
    const n = (p) => Object.entries(counts).reduce((a, [k, c]) => a + (p === 'all' || KINDS[k]?.platform === p ? c : 0), 0);
    root.querySelector('[data-platform]').innerHTML = [['all', 'Tất cả'], ...Object.entries(PLATFORMS)].map(([k, l]) => `<button type="button" class="chip ${st.platform === k ? 'on' : ''}" data-v="${k}">${l} (${n(k)})</button>`).join('');
    const kinds = Object.keys(counts).filter((k) => KINDS[k] && (st.platform === 'all' || KINDS[k].platform === st.platform));
    root.querySelector('[data-kind]').innerHTML = `<option value="">Mọi loại</option>` + kinds.map((k) => `<option value="${k}" ${st.kind === k ? 'selected' : ''}>${st.platform === 'all' ? PLATFORMS[KINDS[k].platform] + ' · ' : ''}${esc(KINDS[k].label)} (${counts[k]})</option>`).join('');
  }
  const row = (r) => {
    const k = KINDS[r.kind];
    return `<div class="list-row" data-row="${r.id}"><span class="badge plain home-kind">${k ? `${icon(k.icon)} ${PLATFORMS[k.platform]} · ${esc(k.label)}` : esc(r.kind)}</span>
      <a class="name home-title" href="${recordHref(r)}">${esc(r.title)}</a><span class="when" title="${new Date(r.created_at).toLocaleString('vi-VN')}">${ago(r.created_at)}</span>
      ${armed === String(r.id) ? `<button type="button" class="btn sm danger" data-del="${r.id}">Xoá hẳn?</button>` : `<button type="button" class="icon-btn" data-del="${r.id}" title="Xoá báo cáo này">${icon('trash')}</button>`}</div>`;
  };
  function renderList() {
    list.innerHTML = items.length ? items.map(row).join('') : emptyState(st.q || st.kind || st.platform !== 'all' ? 'Không có báo cáo khớp' : 'Chưa có báo cáo nào', st.q ? 'Thử gõ ít chữ hơn hoặc bỏ bộ lọc.' : '');
    root.querySelector('[data-count]').textContent = total ? `${items.length} / ${total} báo cáo` : '';
    /** @type {HTMLElement} */ (root.querySelector('[data-more]')).hidden = items.length >= total;
  }
  async function load(more = false) {
    const mine = ++seq;
    const res = await records.search({ q: st.q, kinds: kindsOf(), limit: PAGE, offset: more ? items.length : 0 });
    if (mine !== seq) return;
    items = more ? [...items, ...res.items] : res.items;
    ({ total, counts } = res);
    renderBar();
    renderList();
  }
  const changed = () => {
    setUrl('/history', Object.fromEntries(Object.entries({ q: st.q, kind: st.kind, platform: st.kind || st.platform === 'all' ? '' : st.platform }).filter(([, v]) => v)));
    armed = '';
    return load();
  };

  let typing = 0;
  root.querySelector('[data-q]').addEventListener('input', (e) => {
    st.q = /** @type {HTMLInputElement} */ (e.target).value.trim();
    clearTimeout(typing);
    typing = window.setTimeout(changed, 180);
  });
  root.querySelector('[data-platform]').addEventListener('click', (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('.chip'));
    if (!b) return;
    st.platform = b.dataset.v;
    st.kind = '';
    changed();
  });
  root.querySelector('[data-kind]').addEventListener('change', (e) => ((st.kind = /** @type {HTMLSelectElement} */ (e.target).value), changed()));
  root.querySelector('[data-load]').addEventListener('click', () => load(true));
  list.addEventListener('click', async (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-del]'));
    if (!b) return;
    const id = String(b.dataset.del);
    if (armed !== id) {
      // First click only arms the button: a report cannot be brought back once deleted.
      armed = id;
      return renderList();
    }
    await records.remove(id);
    armed = '';
    toast('Đã xoá báo cáo');
    load();
  });
  await load();
  return () => clearTimeout(typing);
}
