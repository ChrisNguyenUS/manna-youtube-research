import { scope } from '../dom.js';
import { records } from '../http/client.js';
import { esc, icon, runJob, progressCard, updateProgress, toast, store, persist, ago, emptyState, bindTips, setUrl, resumeJob } from '../lib.js';
import { scoreCard, bindScoreCards } from '../components/index.js';
import { REGIONS } from './videos.js';

export async function mount(root, params) {
  const st = store('ideas-form', { ideas: '', gl: '' });
  if (params.ideas) st.ideas = params.ideas;
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('bulb')} Chấm điểm từ khoá</h1>
      <p>Kiểu vidIQ: điểm tổng, Volume, Competition và thống kê top 20 kết quả. Dùng để kiểm tra từ khoá, tiêu đề hay format đã có ai làm chưa và làm tốt đến đâu.</p></div></div>
    <div class="card card-pad">
      <div class="form-grid"><div class="field"><label>Từ khoá / ý tưởng / tiêu đề (mỗi dòng một cái, tối đa 30)</label><textarea class="input" rows="4" data-ideas placeholder="ăn chay lành mạnh&#10;nghe thử tiếng việt 2000 năm trước">${esc(st.ideas)}</textarea>
        <div class="help">Mẹo: lấy format đang thắng ở ngách A, áp sang ngách B, rồi chấm điểm ở đây.</div></div>
        <div class="field"><label>Khu vực</label><select class="select input" data-gl>${REGIONS.map(([v, l]) => `<option value="${v}" ${st.gl === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="row" style="margin-top:12px"><button class="btn primary lg" data-run>${icon('bulb')} Chấm điểm</button><span class="muted small">~5 giây mỗi từ khoá · miễn phí</span></div>
      <details class="small" style="margin-top:12px"><summary class="muted" style="cursor:pointer">Điểm được tính thế nào?</summary>
        <div class="callout info" style="margin-top:8px;line-height:1.6">
          <b>Volume (ước tính)</b> = 50% view trung vị top 20 + 30% view/ngày trung vị + 20% YouTube có gợi ý khi gõ. vidIQ dùng lượng tìm kiếm thật; app không có số đó, nên Volume cao có thể chỉ vì video cũ tích luỹ view lâu năm: xem thêm "Tuổi trung bình".<br>
          <b>Competition</b> = 45% sub trung vị của kênh + 25% tiêu đề chứa đúng từ khoá + 15% kênh ≥ 1 triệu sub + 15% video mới trong 30 ngày.<br>
          <b>Điểm tổng</b> = 55% Volume + 45% (100 − Competition). Trọng số tự đặt, chưa hiệu chỉnh theo vidIQ: tin số liệu thống kê hơn tin con số tổng.</div></details>
    </div>
    <div data-out style="margin-top:14px"></div><div class="card" data-history style="margin-top:14px"></div>`;
  const out = root.querySelector('[data-out]');
  const view = scope();
  view.add(bindTips(out));
  view.add(bindScoreCards(out, runJob, st.gl));

  async function run() {
    st.ideas = root.querySelector('[data-ideas]').value.trim();
    st.gl = root.querySelector('[data-gl]').value;
    persist('ideas-form', st);
    if (!st.ideas) return toast('Nhập từ khoá', 'error');
    out.innerHTML = progressCard('Đang chấm điểm');
    try {
      const res = await runJob('idea_check', { keywords: st.ideas.split('\n'), gl: st.gl }, (p) => updateProgress(out, p));
      show(res.id);
      history();
    } catch (e) {
      out.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
    }
  }
  root.querySelector('[data-run]').addEventListener('click', run);

  async function show(id) {
    const rec = await records.get(id);
    setUrl('/ideas', { id: rec.id }); // a reload or a copied link opens this result again
    const results = rec.data.results;
    if (results.length && !results[0].stats && !results[0].error) {
      out.innerHTML = `<div class="callout">Lần kiểm tra này làm bằng bản cũ (chưa có điểm). Bấm <b>Chấm điểm</b> để chạy lại.</div>`;
      root.querySelector('[data-ideas]').value = results.map((r) => r.idea).join('\n');
      return;
    }
    out.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="muted small">${results.length} từ khoá · ${ago(rec.created_at)}</span><span class="spacer"></span><a class="btn sm" href="${records.exportUrl(id, 'csv')}">${icon('download')} CSV</a></div>
      <div class="score-grid">${results.map((r) => scoreCard(r)).join('')}</div>`;
  }
  async function history() {
    const list = await records.list('idea_check', 20);
    root.querySelector('[data-history]').innerHTML = `<div class="card-head"><h3>Đã chấm</h3></div>${
      list.length ? list.map((r) => `<div class="list-row"><a class="name" href="#/ideas?id=${r.id}">${esc(r.title)}</a><span class="when">${ago(r.created_at)}</span><button class="icon-btn" data-del="${r.id}" title="Xoá">${icon('trash')}</button></div>`).join('') : emptyState('Chưa chấm từ khoá nào')
    }`;
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => (await records.remove(b.dataset.del), history())));
  }
  history();
  if (params.id) show(params.id);
  else if (params.ideas && params.run) run();
  else resumeJob('idea_check', out, () => 'Đang chấm điểm', async (res) => (await show(res.id), history()));
  return () => {
    view.off();
  };
}
