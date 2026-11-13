import { scope } from '../dom.js';
import { historyList } from '../components/history-list.js';
import { records } from '../http/client.js';
import { esc, icon, runJob, progressCard, updateProgress, toast, store, persist, ago, emptyState, setUrl, resumeJob, saveMany } from '../lib.js';
import { savedKeyword } from '../saved-items.js';
import { REGIONS } from './videos.js';

export async function mount(root, params) {
  const st = store('kw-form', { seed: '', gl: '' });
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('key')} Gợi ý từ khoá</h1>
      <p>Gợi ý tìm kiếm của YouTube cho một từ khoá gốc (thêm a, b, c… phía sau): thứ người xem thật sự gõ. Chọn từ khoá để tìm video, tìm kênh, hoặc kiểm tra như ý tưởng.</p></div></div>
    <div class="card card-pad"><div class="input-row">
      <input class="input" data-seed placeholder="VD: kể chuyện" value="${esc(params.seed || st.seed)}">
      <select class="select input" style="width:180px" data-gl>${REGIONS.map(([v, l]) => `<option value="${v}" ${st.gl === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn primary" data-run>${icon('key')} Lấy gợi ý</button></div></div>
    <div data-out style="margin-top:14px"></div><div class="card" data-history style="margin-top:14px"></div>`;
  const out = root.querySelector('[data-out]');
  const shown = scope(); // listeners of the current result; reset on every render
  const run = async () => {
    st.seed = root.querySelector('[data-seed]').value.trim();
    st.gl = root.querySelector('[data-gl]').value;
    persist('kw-form', st);
    if (!st.seed) return toast('Nhập từ khoá', 'error');
    out.innerHTML = progressCard('Đang lấy gợi ý');
    try {
      const res = await runJob('keywords', st, (p) => updateProgress(out, p));
      show(res.id);
      history();
    } catch (e) {
      out.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
    }
  };
  root.querySelector('[data-run]').addEventListener('click', run);
  root.querySelector('[data-seed]').addEventListener('keydown', (e) => e.key === 'Enter' && run());

  async function show(id) {
    const rec = await records.get(id);
    setUrl('/keywords', { id: rec.id }); // a reload or a copied link opens this result again
    const sel = new Set();
    out.innerHTML = `<div class="card"><div class="card-head"><h3>${rec.data.list.length} gợi ý cho "${esc(rec.data.seed)}"</h3>
      <div class="row"><button class="btn sm" data-act="videos" disabled>${icon('search')} Tìm video</button><button class="btn sm" data-act="channels" disabled>${icon('users')} Tìm kênh</button><button class="btn sm" data-act="save" disabled title="Giữ các từ khoá đã tích trong Đã lưu">${icon('bookmark')} Lưu</button><button class="btn sm" data-act="ideas" disabled>${icon('bulb')} Chấm điểm</button><a class="btn sm" href="${records.exportUrl(id, 'csv')}">${icon('download')} CSV</a></div></div>
      <table class="t"><thead><tr><th style="width:30px"></th><th>Từ khoá</th><th class="r" data-tip="Số lần xuất hiện qua các lần gõ thử">Xuất hiện</th><th></th></tr></thead><tbody>
      ${rec.data.list.map((k, i) => `<tr><td><input type="checkbox" data-k="${i}"></td><td><b>${esc(k.keyword)}</b></td><td class="r num">${k.hits}</td>
        <td class="actions"><a class="btn sm" href="#/videos?q=${encodeURIComponent(k.keyword)}&run=1">${icon('search')} Video</a></td></tr>`).join('')}</tbody></table></div>`;
    const btns = out.querySelectorAll('[data-act]');
    shown.off();
    shown.on(out, 'change', '[data-k]', (e, c) => {
      const kw = rec.data.list[c.dataset.k].keyword;
      c.checked ? sel.add(kw) : sel.delete(kw);
      btns.forEach((b) => (b.disabled = !sel.size));
    });
    btns.forEach((b) => b.addEventListener('click', () => {
      const list = [...sel];
      if (b.dataset.act === 'save') saveMany('keyword', list.map((k) => savedKeyword(k, 'youtube', rec.data.seed)), 'từ khoá');
      else if (b.dataset.act === 'ideas') window.__go('/ideas', { ideas: list.join('\n'), run: 1 });
      else window.__go('/' + b.dataset.act, { q: list.join(', ') });
    }));
  }
  const history = historyList(root.querySelector('[data-history]'), { kind: 'keywords', path: '/keywords', title: 'Đã lấy', empty: 'Chưa có' });
  history();
  if (params.id) show(params.id);
  else resumeJob('keywords', out, () => 'Đang lấy gợi ý', async (res) => (await show(res.id), history()));
  return () => {
    shown.off();
  };
}
