import { records, tiktokInsight, jobs } from '../../http/client.js';
import { esc, icon, runJob, progressCard, updateProgress, toast, store, persist, fmt, ago, emptyState, bindTips } from '../../lib.js';
import { tiktokVideoCard, commentGroups, bindCommentGroups, tiktokFilterSelects, offTopicDetails, tiktokCriteria, topicExplorer } from '../../components/index.js';
import { scope } from '../../dom.js';

const FORM = { keywords: '', top: 10, commentsPerVideo: 300, replies: true, keepOffTopic: false, minPlays: 0, minLikes: 0, maxAgeDays: 0, minEngagement: 0 };

export async function mount(root, params) {
  const st = store('tt-insight-form', FORM);
  // Presets only set the two scale controls; any value can still be changed by hand afterwards.
  const PRESETS = [
    ['quick', 'bolt', 'Nghiên cứu nhanh', 'Kiểm tra nhanh một chủ đề.', 5, 100],
    ['standard', 'bars', 'Nghiên cứu tiêu chuẩn', 'Đủ để lên kế hoạch content.', 10, 100],
    ['deep', 'target', 'Nghiên cứu chuyên sâu', 'Nhiều video, nhiều comment hơn.', 30, 300],
  ];
  const seg = (name, values, cur) => `<div class="ix-seg" role="radiogroup" data-seg="${name}">${values.map((v) => `<button type="button" role="radio" aria-checked="${v === cur}" class="${v === cur ? 'on' : ''}" data-v="${v}">${v}</button>`).join('')}</div>`;
  const head = (n, ic, title, sub) => `<div class="ix-head"><span class="ix-ic">${icon(ic)}</span><div><h3>${n}. ${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div></div>`;
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('message')} Insight khách hàng (TikTok)</h1>
      <p>Đọc comment của các video TikTok top đúng chủ đề để biết khách đang hỏi gì, sợ gì, ai đang cân nhắc thuê dịch vụ, và câu chữ thật của họ.</p></div></div>
    <div class="ix-form" data-form>
      <section class="card ix-card">${head(1, 'target', 'Chủ đề nghiên cứu', 'Nhập chủ đề cụ thể bạn muốn nghiên cứu trên TikTok.')}
        <div class="tt-searchbox">${icon('search')}<input data-k="keywords" placeholder="Ví dụ: di trú mỹ, phỏng vấn quốc tịch" value="${esc(st.keywords)}" autocomplete="off"><button type="button" class="icon-btn" data-clear title="Xoá">${icon('x')}</button></div>
        <div class="ix-help">Viết tiếng Việt, ghi rõ nước (“di trú mỹ”, không chỉ “di trú”). Nhiều từ khoá thì cách nhau bằng dấu phẩy.</div></section>

      <section class="card ix-card">${head(2, 'layers', 'Quy mô nghiên cứu', 'Chọn sẵn một mức, hoặc tự chỉnh số video và số comment bên dưới.')}
        <div class="ix-presets" data-presets></div>
        <div class="ix-scale">
          <div><div class="ix-flabel">Số video TikTok <span class="ix-tip" data-tip="Số video top (đúng chủ đề, qua bộ lọc) được đọc comment.">${icon('info')}</span></div>${seg('top', [5, 10, 20, 30], st.top)}</div>
          <div><div class="ix-flabel">Comment mỗi video <span class="ix-tip" data-tip="Số comment gốc tối đa đọc ở mỗi video. TikTok xếp comment nổi bật lên trước.">${icon('info')}</span></div>${seg('commentsPerVideo', [100, 300], st.commentsPerVideo)}</div>
          <div class="ix-volume" data-volume></div>
        </div></section>

      <section class="card ix-card">${head(3, 'filter', 'Bộ lọc chất lượng video', 'Chỉ đọc comment của video đạt các mức này. Để “Không lọc” nếu không cần.')}
        ${tiktokFilterSelects(st)}</section>

      <section class="card ix-card">${head(4, 'message', 'Tùy chọn thu thập comment', '')}
        <label class="ix-check"><input type="checkbox" data-k="replies" ${st.replies ? 'checked' : ''}><span><b>Lấy cả replies (trả lời comment)</b><span class="ix-help">Đọc thêm tối đa 20 trả lời dưới mỗi comment. Không tính vào số comment tối đa ở trên.</span></span></label>
        <label class="ix-check"><input type="checkbox" data-k="keepOffTopic" ${st.keepOffTopic ? 'checked' : ''}><span><b>Giữ lại video ngoài chủ đề để tham khảo</b><span class="ix-help">Bình thường video không khớp chủ đề (hoặc nói về nước khác) bị bỏ. Bật lên để đọc comment của cả những video đó.</span></span></label>
      </section>

      <section class="card ix-submit">
        <div class="ix-summary" data-summary></div>
        <button class="btn primary lg" data-run>${icon('doc')} Lập báo cáo Insight</button>
        <div class="ix-eta small muted" data-eta></div>
      </section>
    </div>
    <div data-out style="margin-top:14px"></div><div class="card" data-history style="margin-top:14px"></div>`;
  const form = root.querySelector('[data-form]');
  const out = root.querySelector('[data-out]');
  const shown = scope();
  const kwInput = /** @type {HTMLInputElement} */ (form.querySelector('[data-k="keywords"]'));
  const save = () => persist('tt-insight-form', st);
  shown.add(bindTips(form));

  function renderPresets() {
    form.querySelector('[data-presets]').innerHTML = PRESETS.map(([k, ic, title, sub, top, cpv]) => {
      const on = Number(st.top) === top && Number(st.commentsPerVideo) === cpv;
      return `<button type="button" class="ix-preset ${on ? 'on' : ''}" data-preset="${k}" aria-pressed="${on}">
        <span class="ix-pic">${icon(ic)}</span><span class="ix-ptext"><b>${title}</b><span>${sub}</span><span class="ix-pval">${top} video × ${cpv} comment</span></span>${on ? `<span class="ix-pcheck">${icon('check')}</span>` : ''}</button>`;
    }).join('');
  }
  function renderSegs() {
    for (const g of form.querySelectorAll('[data-seg]')) {
      for (const b of g.querySelectorAll('button')) {
        const on = Number(b.dataset.v) === Number(st[g.dataset.seg]);
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      }
    }
  }
  /** Most comments the settings can read: an upper bound, not a promise. */
  function renderVolume() {
    const max = Number(st.top) * Number(st.commentsPerVideo);
    form.querySelector('[data-volume]').innerHTML = `<div class="ix-flabel">${icon('layers')} Quy mô dữ liệu (tối đa)</div>
      <div class="ix-vnum">${max.toLocaleString('vi-VN')} comment</div>
      <div class="ix-help">${st.top} video × ${st.commentsPerVideo} comment/video. Đây là mức tối đa: video có ít comment hơn thì đọc hết số đang có${st.replies ? ', chưa tính trả lời' : ''}.</div>`;
  }
  function renderSummary() {
    const kw = kwInput.value.trim();
    const max = Number(st.top) * Number(st.commentsPerVideo);
    const filters = tiktokCriteria({ minPlays: st.minPlays, minLikes: st.minLikes, maxAgeDays: st.maxAgeDays, minEngagement: st.minEngagement, keepOffTopic: st.keepOffTopic });
    form.querySelector('[data-summary]').innerHTML = `<span class="ix-sumlabel">${icon('info')} Tóm tắt</span>
      <span class="ix-chip ${kw ? 'accent' : 'warn'}">${kw ? `Chủ đề: ${esc(kw)}` : 'Chưa nhập chủ đề'}</span>
      <span class="ix-chip">${st.top} video</span><span class="ix-chip">${st.commentsPerVideo} comment/video</span><span class="ix-chip">Tối đa ${max.toLocaleString('vi-VN')} comment</span>
      ${filters ? `<span class="ix-chip">${esc(filters)}</span>` : ''}${st.replies ? '<span class="ix-chip">có trả lời</span>' : ''}`;
  }
  function renderAll() {
    renderPresets();
    renderSegs();
    renderVolume();
    renderSummary();
  }

  // How long earlier reports with the same scale really took (job start → end), shown only when there are a few.
  async function renderEta() {
    const el = form.querySelector('[data-eta]');
    let text = 'Thời gian tuỳ số video và comment thật sự có. Tiến độ hiện ngay bên dưới khi chạy.';
    try {
      const same = (await jobs.list()).filter((j) => j.kind === 'tiktok_insight' && j.status === 'succeeded' && j.startedAt && j.endedAt
        && Number(j.params?.top) === Number(st.top) && Number(j.params?.commentsPerVideo) === Number(st.commentsPerVideo));
      if (same.length >= 3) {
        const secs = same.map((j) => (j.endedAt - j.startedAt) / 1000).sort((a, b) => a - b);
        const t = (x) => (x < 90 ? `${Math.round(x)} giây` : `${Math.round(x / 60)} phút`);
        text = `${same.length} lần lập gần đây với cùng quy mô mất từ ${t(secs[0])} đến ${t(secs[secs.length - 1])}. Tiến độ hiện ngay bên dưới khi chạy.`;
      }
    } catch {
      /* keep the neutral text */
    }
    el.textContent = text;
  }

  form.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const p = t.closest('[data-preset]');
    if (p) {
      const [, , , , top, cpv] = PRESETS.find((x) => x[0] === p.getAttribute('data-preset'));
      Object.assign(st, { top, commentsPerVideo: cpv });
      save();
      renderAll();
      renderEta();
      return;
    }
    const b = t.closest('[data-seg] button');
    if (b) {
      st[b.closest('[data-seg]').getAttribute('data-seg')] = Number(b.getAttribute('data-v'));
      save();
      renderAll();
      renderEta();
      return;
    }
    if (t.closest('[data-clear]')) {
      kwInput.value = '';
      kwInput.focus();
      renderSummary();
    }
  });
  form.addEventListener('change', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.matches('[data-filter]')) st[t.dataset.filter] = Number(t.value) || 0;
    else if (t.matches('input[type=checkbox][data-k]')) st[t.dataset.k] = t.checked;
    else return;
    save();
    renderAll();
  });
  kwInput.addEventListener('input', renderSummary);
  kwInput.addEventListener('keydown', (e) => e.key === 'Enter' && run());
  form.querySelector('[data-run]').addEventListener('click', run);
  renderAll();
  renderEta();

  async function run() {
    st.keywords = kwInput.value.trim();
    persist('tt-insight-form', st);
    if (!st.keywords) {
      kwInput.focus();
      return toast('Nhập chủ đề nghiên cứu', 'error');
    }
    out.innerHTML = progressCard(`Đang lập báo cáo: ${st.keywords}`);
    try {
      const res = await runJob('tiktok_insight', st, (p) => updateProgress(out, p));
      history();
      await show(res.id);
    } catch (e) {
      out.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
    }
  }

  async function show(id) {
    const rec = await records.get(id);
    const d = rec.data;
    const g = d.insight.groupCounts;
    out.innerHTML = `
      <div class="card card-pad"><div class="row between"><div><h2 style="margin:0;font-size:18px">${esc(d.keywords.join(', '))}</h2><div class="muted small">${ago(rec.created_at)} · ${d.counts.found} video tìm được · ${d.counts.offTopic} lạc đề bỏ${d.counts.belowFilters ? ` · ${d.counts.belowFilters} dưới ngưỡng lọc` : ''}${d.failedVideos.length ? ` · ${d.failedVideos.length} video lỗi` : ''}</div></div>
        <div class="head-actions"><a class="btn sm" href="${records.exportUrl(id, 'md')}">${icon('download')} Markdown</a><a class="btn sm" href="${records.exportUrl(id, 'csv')}">${icon('download')} CSV</a></div></div></div>
      ${offTopicDetails(d.offTopicVideos, d.offTopicVideos ? d.counts.offTopic : 0)}
      <div class="kpis" style="margin-top:14px">
        <div class="kpi"><div class="label">Video đọc comment</div><div class="value">${d.videos.length}</div></div>
        <div class="kpi"><div class="label">Comment đã đọc</div><div class="value">${fmt(d.counts.commentsRead)}</div></div>
        <div class="kpi"><div class="label">Câu hỏi</div><div class="value">${g.questions}</div></div>
        <div class="kpi"><div class="label">Lo sợ</div><div class="value">${g.fears}</div></div>
        <div class="kpi"><div class="label">${d.insight.themes ? 'Cân nhắc mua' : 'Muốn mua'}</div><div class="value">${g.buying}</div></div></div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>${icon('layers')} Khám phá chủ đề</h3><span class="sub">Bấm một chủ đề để đọc từng comment gốc của nó · bấm comment để xem đủ câu, video và creator · không lưu tên người bình luận</span></div>
        <div data-explorer><div class="card-pad muted">Đang gom comment theo chủ đề…</div></div></div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>Khách đang nói gì</h3><span class="sub">Trích nguyên văn, không có tên người viết</span></div>
        ${commentGroups(d.insight, { extraTabs: [['top', 'Comment nổi bật', d.insight.topByAttention]] })}</div>
      ${d.insight.voiceLines ? `<div class="card" style="margin-top:14px"><div class="card-head"><h3>Câu chữ thật của khách</h3><span class="sub">Câu ngắn nguyên văn được nhiều người phản ứng: nguyên liệu cho hook</span></div>
        <div class="card-pad">${d.insight.voiceLines.map((v) => `<div class="tt-voice">“${esc(v.text)}” <span class="small muted">♥ ${fmt(v.likes)} · ↩ ${fmt(v.replies)}</span></div>`).join('') || '<span class="muted">Chưa đủ comment</span>'}</div></div>`
        : `<div class="card" style="margin-top:14px"><div class="card-head"><h3>Câu chữ thật</h3><span class="sub">Cụm từ lặp lại ≥ 3 lần: nguyên liệu cho hook</span></div>
        <div class="card-pad"><div class="chips">${(d.insight.phrases || []).map((p) => `<span class="tag">${esc(p.phrase)} · <b>${p.count}</b></span>`).join('') || '<span class="muted">Chưa đủ comment</span>'}</div></div></div>`}
      <div class="card" style="margin-top:14px"><div class="card-head"><h3>Video hot</h3></div><div class="vgrid">${d.videos.map((v) => tiktokVideoCard(v)).join('') || emptyState('Không có')}</div></div>`;
    shown.off();
    shown.add(bindCommentGroups(out));
    const ex = /** @type {HTMLElement} */ (out.querySelector('[data-explorer]'));
    try {
      shown.add(topicExplorer(ex, rec, await tiktokInsight.topics(id)));
    } catch (e) {
      ex.innerHTML = `<div class="card-pad"><div class="callout">Không gom được chủ đề: ${esc(e.message)}</div></div>`;
    }
  }

  async function history() {
    const list = await records.list('tiktok_insight', 30);
    root.querySelector('[data-history]').innerHTML = `<div class="card-head"><h3>${icon('clock')} Báo cáo đã lập</h3><span class="sub">Bấm tên để mở lại</span></div>${list.length ? list.map((r) => `<div class="list-row"><a class="name" href="#/tiktok/insight?id=${r.id}">${esc(r.title)}</a>${tiktokCriteria(r.params) ? `<span class="small muted">${esc(tiktokCriteria(r.params))}</span>` : ''}<span class="when">${ago(r.created_at)}</span><button class="icon-btn" data-del="${r.id}" title="Xoá">${icon('trash')}</button></div>`).join('') : emptyState('Chưa có báo cáo nào')}`;
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => (await records.remove(b.dataset.del), history())));
  }
  history();
  if (params.id) show(params.id);
  return () => shown.off();
}
