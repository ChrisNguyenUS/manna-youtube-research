import { esc, icon, runJob, progressCard, updateProgress, toast, store, persist, api, fmt, ago, emptyState, ytVideo, thumb, ageText, mult } from '../lib.js';
import { REGIONS } from './videos.js';

const VERDICT = {
  open: ['good', 'Còn trống', 'Có người xem nhưng ít video mới: nên làm.'],
  competitive: ['warn', 'Cạnh tranh', 'Đã có người làm. Cần góc nhìn mới hoặc format tốt hơn.'],
  saturated: ['bad', 'Bão hoà', 'Nhiều video mới và mạnh. Chỉ làm nếu có góc khác hẳn.'],
  low_demand: ['plain', 'Ít người xem', 'Video top có rất ít view.'],
  unclear: ['plain', 'Chưa rõ', ''],
};

export async function mount(root, params) {
  const st = store('ideas-form', { ideas: '', gl: '' });
  if (params.ideas) st.ideas = params.ideas;
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('bulb')} Kiểm tra ý tưởng</h1>
      <p>Trước khi làm: đã có ai làm format/tiêu đề này chưa, làm tốt đến đâu? Lấy 20 kết quả liên quan nhất trên YouTube cho mỗi ý tưởng rồi đo nhu cầu (view) và độ cạnh tranh (video mới, video vượt kênh).</p></div></div>
    <div class="card card-pad">
      <div class="form-grid"><div class="field"><label>Ý tưởng / tiêu đề (mỗi dòng một ý)</label><textarea class="input" rows="5" data-ideas placeholder="Nghe thử tiếng Việt 2000 năm trước&#10;Món ăn thời bao cấp người trẻ chưa từng nghe">${esc(st.ideas)}</textarea>
        <div class="help">Mẹo: lấy format đang thắng ở ngách A, áp sang ngách B, rồi kiểm tra ở đây.</div></div>
        <div class="field"><label>Khu vực</label><select class="select input" data-gl>${REGIONS.map(([v, l]) => `<option value="${v}" ${st.gl === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="row" style="margin-top:12px"><button class="btn primary lg" data-run>${icon('bulb')} Kiểm tra</button></div></div>
    <div data-out style="margin-top:14px"></div><div class="card" data-history style="margin-top:14px"></div>`;
  const out = root.querySelector('[data-out]');
  root.querySelector('[data-run]').addEventListener('click', async () => {
    st.ideas = root.querySelector('[data-ideas]').value.trim();
    st.gl = root.querySelector('[data-gl]').value;
    persist('ideas-form', st);
    if (!st.ideas) return toast('Nhập ý tưởng', 'error');
    out.innerHTML = progressCard('Đang kiểm tra');
    try {
      const res = await runJob('idea_check', { ideas: st.ideas.split('\n'), gl: st.gl }, (p) => updateProgress(out, p));
      show(res.id);
      history();
    } catch (e) {
      out.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
    }
  });

  async function show(id) {
    const rec = await api(`/api/records/${id}`);
    out.innerHTML = rec.data.results
      .map((r) => {
        const [cls, label, why] = VERDICT[r.verdict] || VERDICT.unclear;
        return `<div class="card" style="margin-bottom:14px"><div class="card-head"><h3>${esc(r.idea)} <span class="badge ${cls}">${label}</span></h3><span class="sub">${esc(why)}</span></div>
        <div class="card-pad"><div class="kpis">
          <div class="kpi"><div class="label">View trung vị top 20</div><div class="value">${fmt(r.medianViews)}</div><div class="hint">nhu cầu</div></div>
          <div class="kpi"><div class="label">Video &lt; 1 năm</div><div class="value">${r.recentCount}/20</div><div class="hint">người làm gần đây</div></div>
          <div class="kpi"><div class="label">Video vượt kênh</div><div class="value">${r.strongCount}</div><div class="hint">view ≥ sub</div></div>
          <div class="kpi"><div class="label">Sub trung vị</div><div class="value">${fmt(r.medianSubs)}</div><div class="hint">kênh đang làm</div></div></div>
          <div class="vgrid" style="padding:14px 0 0">${r.top.map((v) => `<div class="vcard"><div class="img"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${thumb(v.id)}" alt=""></a>${v.outlier != null ? `<span class="ov mult">${mult(v.outlier)} sub</span>` : ''}</div>
            <div class="body"><a class="t1" href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a><div class="stats"><b>${fmt(v.views)}</b> view · ${ageText(v.age, v.ageExact)} · ${esc(v.channelTitle)} (${fmt(v.channelSubs)})</div></div></div>`).join('')}</div></div></div>`;
      })
      .join('');
  }
  async function history() {
    const list = await api('/api/records?kind=idea_check&limit=20');
    root.querySelector('[data-history]').innerHTML = `<div class="card-head"><h3>Đã kiểm tra</h3></div>${
      list.length ? list.map((r) => `<div class="list-row"><a class="name" href="#/ideas?id=${r.id}">${esc(r.title)}</a><span class="when">${ago(r.created_at)}</span></div>`).join('') : emptyState('Chưa kiểm tra ý tưởng nào')
    }`;
  }
  history();
  if (params.id) show(params.id);
}
