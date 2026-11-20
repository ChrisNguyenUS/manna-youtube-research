// Customer Intelligence → Bình luận & Câu hỏi: every comment of the run with its labels (PRD §8.3). Original words
// always shown, AI summary kept apart; the owner corrects labels or marks comments irrelevant (stored apart from the AI).
import { ci } from '../../http/client.js';
import { esc, icon, fmt, toast } from '../../lib.js';
import { resolveRun, noRuns, runBar, bindRunBar, stageHint, commentRow, loading, LABEL_VI, DIM_VI, evidenceDrawer, bindRefs, reload } from '../../components/ci.js';

const PATH = '/ci/comments';
const TABS = [['all', 'Tất cả'], ['questions', 'Câu hỏi'], ['pain', 'Nỗi đau'], ['objections', 'Rào cản'], ['buying', 'Tín hiệu mua'], ['replies', 'Trả lời'], ['review', 'Cần xem lại']];
const DIMS = ['intent', 'pain', 'emotion', 'objection', 'buying_signal', 'experience'];

export async function mount(root, params) {
  root.innerHTML = loading();
  const { runs, run } = await resolveRun(params);
  if (!run) return noRuns(root, 'Bình luận & Câu hỏi');
  const drawer = evidenceDrawer();
  const st = { tab: params.tab || 'all', q: '', source: '', dim: '', value: '', pain: params.pain || '', sort: '', page: 0, picked: new Set() };
  let d = await ci.comments(run.id, { tab: st.tab, pain: st.pain });
  root.innerHTML = `${runBar(d.run, runs, { title: 'Bình luận & Câu hỏi', sub: 'Câu chữ gốc của khách, nhãn do AI gắn (bạn sửa được) và tóm tắt AI tách riêng.', iconName: 'message' })}
    ${stageHint(d.run, 'classify')}<div data-body></div>`;
  const body = /** @type {HTMLElement} */ (root.querySelector('[data-body]'));
  let seq = 0;
  async function load() {
    const mine = ++seq;
    const r = await ci.comments(run.id, { tab: st.tab, q: st.q, source: st.source, dim: st.dim, value: st.value, pain: st.pain, sort: st.sort, page: st.page });
    if (mine !== seq) return;
    d = r;
    draw();
  }
  function draw() {
    const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
    body.innerHTML = `<div class="ci-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${st.tab === k}" class="${st.tab === k ? 'on' : ''}" data-tab="${k}">${l} <span>${fmt(d.counts[k] ?? 0)}</span></button>`).join('')}</div>
      <div class="ci-filters card card-pad">
        <input class="input ci-search" type="search" placeholder="Tìm trong câu chữ…" value="${esc(st.q)}" data-q aria-label="Tìm comment">
        <select class="input" data-source aria-label="Nguồn"><option value="">Mọi nguồn</option>${d.sources.map((s) => `<option value="${esc(s.ref)}" ${st.source === s.ref ? 'selected' : ''}>${esc(s.ref)} · ${esc((s.title || s.platform).slice(0, 50))}</option>`).join('')}</select>
        <select class="input" data-dim aria-label="Nhóm nhãn"><option value="">Mọi nhãn</option>${DIMS.map((k) => `<option value="${k}" ${st.dim === k ? 'selected' : ''}>${DIM_VI[k]}</option>`).join('')}</select>
        ${st.dim ? `<select class="input" data-value aria-label="Nhãn"><option value="">Chọn nhãn</option>${Object.entries(LABEL_VI[st.dim]).map(([k, l]) => `<option value="${k}" ${st.value === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
        <select class="input" data-sort aria-label="Sắp xếp"><option value="">Thứ tự gốc</option><option value="likes" ${st.sort === 'likes' ? 'selected' : ''}>Nhiều like trước</option></select>
        ${st.pain ? `<span class="badge accent">Lọc theo nỗi đau <button type="button" class="linklike" data-clear-pain>bỏ</button></span>` : ''}
      </div>
      <div class="card">
        <div class="card-head"><span class="sub">${fmt(d.total)} comment${st.picked.size ? ` · đã chọn ${st.picked.size}` : ''}</span>
          <div class="row">${st.picked.size ? `<button type="button" class="btn sm" data-bulk-irrelevant>Đánh dấu không liên quan</button><button type="button" class="btn sm ghost" data-bulk-clear>Bỏ chọn</button>` : ''}<a class="btn sm" href="${ci.exportUrl(run.id, 'csv')}">${icon('download')} CSV</a></div></div>
        <div class="ci-list">${d.rows.length ? d.rows.map((c) => `<div class="ci-cm-wrap">${commentRow(c, { select: true })}<div class="ci-cm-acts">${c.pains.length ? `<span class="small muted">${c.pains.map((p) => `<a href="#/ci/topics?run=${run.id}&pain=${p.id}">${esc(p.title)}</a>`).join(' · ')}</span>` : ''}
          <button type="button" class="btn sm ghost" data-relabel="${esc(c.ref)}">${icon('edit')} Sửa nhãn</button><button type="button" class="btn sm ghost" data-irrelevant="${esc(c.ref)}" data-on="${c.irrelevant ? 1 : 0}">${c.irrelevant ? 'Dùng lại' : 'Không liên quan'}</button></div></div>`).join('') : '<div class="card-pad muted">Không có comment nào khớp.</div>'}</div>
        ${pages > 1 ? `<div class="ci-pager"><button type="button" class="btn sm" data-page="${st.page - 1}" ${st.page === 0 ? 'disabled' : ''}>${icon('back')} Trước</button><span class="small muted">Trang ${st.page + 1}/${pages}</span><button type="button" class="btn sm" data-page="${st.page + 1}" ${st.page + 1 >= pages ? 'disabled' : ''}>Sau ${icon('chevron')}</button></div>` : ''}
      </div>`;
    body.querySelectorAll('[data-sel]').forEach((x) => { /** @type {HTMLInputElement} */ (x).checked = st.picked.has(/** @type {HTMLElement} */ (x).dataset.sel); });
  }
  draw();

  function relabelForm(c) {
    return `<form data-label-form="${esc(c.ref)}"><div class="ci-cm-text">“${esc(c.text)}”</div>${c.ai?.reason ? `<div class="ci-cm-ai">AI giải thích: ${esc(c.ai.reason)}</div>` : ''}
      ${DIMS.map((dim) => `<fieldset class="ci-fs"><legend>${DIM_VI[dim]}</legend><div class="chips">${Object.entries(LABEL_VI[dim]).map(([k, l]) => `<label class="chip ${(c.labels?.[dim] ?? []).includes(k) ? 'on' : ''}"><input type="checkbox" name="${dim}" value="${k}" ${(c.labels?.[dim] ?? []).includes(k) ? 'checked' : ''} hidden>${l}</label>`).join('')}</div></fieldset>`).join('')}
      <div class="row"><button class="btn primary" type="submit">Lưu nhãn</button><span class="muted small">Nhãn bạn sửa được giữ riêng, không bị AI ghi đè khi chạy lại.</span></div></form>`;
  }
  const onClick = async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const tab = /** @type {HTMLElement|null} */ (t.closest('[data-tab]'));
    if (tab) return ((st.tab = String(tab.dataset.tab)), (st.page = 0), load());
    const pg = /** @type {HTMLElement|null} */ (t.closest('[data-page]'));
    if (pg) return ((st.page = Number(pg.dataset.page)), load(), root.closest('.main')?.scrollTo({ top: 0 }));
    if (t.closest('[data-clear-pain]')) return ((st.pain = ''), (st.page = 0), load());
    const rl = /** @type {HTMLElement|null} */ (t.closest('[data-relabel]'));
    if (rl) {
      const c = d.rows.find((x) => x.ref === rl.dataset.relabel);
      drawer.open(`Sửa nhãn ${c.ref}`, relabelForm(c));
      return;
    }
    const ir = /** @type {HTMLElement|null} */ (t.closest('[data-irrelevant]'));
    if (ir) {
      await ci.relabel(run.id, ir.dataset.irrelevant, { irrelevant: ir.dataset.on !== '1' });
      toast(ir.dataset.on !== '1' ? 'Đã đánh dấu không liên quan (không tính vào phân tích)' : 'Đã dùng lại comment');
      return load();
    }
    if (t.closest('[data-bulk-irrelevant]')) {
      for (const ref of st.picked) await ci.relabel(run.id, ref, { irrelevant: true });
      toast(`Đã đánh dấu ${st.picked.size} comment không liên quan`);
      st.picked.clear();
      return load();
    }
    if (t.closest('[data-bulk-clear]')) return (st.picked.clear(), draw());
  };
  const onChange = (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.matches('[data-sel]')) return ((t.checked ? st.picked.add(t.dataset.sel) : st.picked.delete(t.dataset.sel)), draw());
    if (t.matches('[data-source]')) st.source = t.value;
    else if (t.matches('[data-dim]')) ((st.dim = t.value), (st.value = ''));
    else if (t.matches('[data-value]')) st.value = t.value;
    else if (t.matches('[data-sort]')) st.sort = t.value;
    else return;
    st.page = 0;
    if (t.matches('[data-dim]') && t.value) return draw(); // pick a label first
    load();
  };
  let timer = 0;
  const onInput = (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (!t.matches('[data-q]')) return;
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      st.q = t.value.trim();
      st.page = 0;
      await load();
      const q = /** @type {HTMLInputElement} */ (body.querySelector('[data-q]'));
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }, 250);
  };
  // The label form lives in the drawer (outside root).
  const onDocChange = (e) => {
    const box = /** @type {HTMLInputElement} */ (e.target);
    if (box.closest?.('[data-label-form]') && box.type === 'checkbox') box.closest('label')?.classList.toggle('on', box.checked);
  };
  const onSubmit = async (e) => {
    const f = /** @type {HTMLFormElement} */ (e.target);
    if (!f.matches?.('[data-label-form]')) return;
    e.preventDefault();
    const fd = new FormData(f);
    const labels = Object.fromEntries(DIMS.map((dim) => [dim, fd.getAll(dim).map(String)]));
    await ci.relabel(run.id, f.dataset.labelForm, { labels });
    drawer.close();
    toast('Đã lưu nhãn');
    load();
  };
  body.addEventListener('click', onClick);
  body.addEventListener('change', onChange);
  body.addEventListener('input', onInput);
  document.addEventListener('change', onDocChange);
  document.addEventListener('submit', onSubmit);
  const offs = [bindRunBar(root, d.run, PATH, reload), bindRefs(root, run.id, drawer), drawer.off,
    () => (body.removeEventListener('click', onClick), body.removeEventListener('change', onChange), body.removeEventListener('input', onInput), document.removeEventListener('change', onDocChange), document.removeEventListener('submit', onSubmit), clearTimeout(timer))];
  return () => offs.forEach((f) => f());
}
