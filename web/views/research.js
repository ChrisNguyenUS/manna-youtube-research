import { scope } from '../dom.js';
import { records } from '../http/client.js';
import { esc, icon, chips, bindChips, runJob, progressCard, updateProgress, toast, store, persist, fmt, mult, ago, emptyState, thumb, ytVideo, dur, ageText, bindTips, setUrl, resumeJob } from '../lib.js';
import { mountVideoResults, hbars, patternList, phraseChips, oscoreBadge, outlierTip } from '../components/index.js';
import { DUR_CHIPS, UPLOAD_CHIPS, REGIONS, durToSeconds } from './videos.js';

const FORM = { topic: '', keywords: '', competitors: '', gl: '', direction: 'top', upload: 'year', dur: '4-20', minDur: '', maxDur: '', perKeyword: 40, readComments: true, commentTop: 5, commentMax: 50 };
const DIRS = [
  { v: 'top', t: 'Theo top', s: 'Video nhiều view nhất của ngách', upload: 'year' },
  { v: 'trend', t: 'Theo trend', s: 'Chủ đề mới nổi trong mấy ngày qua', upload: 'week' },
  { v: 'keyword', t: 'Theo từ khoá', s: 'Người xem đang gõ gì, cụm nào nhiều view', upload: 'year' },
];

export async function mount(root, params) {
  const st = store('research-form', FORM);
  if (params.q) st.topic = params.q; // sent from the dashboard's topic box
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('compass')} Nghiên cứu chủ đề</h1>
      <p>Trả lời 4 câu: video nào đang thắng nhờ nội dung (không nhờ kênh to) · tiêu đề viết theo mẫu nào · khán giả hỏi gì, than gì · khoảng trống nào chưa ai làm tốt.</p></div></div>
    <div class="card card-pad" data-form>
      <div class="form-grid">
        <div class="field"><label>Bạn làm kênh về gì?</label><input class="input" data-k="topic" placeholder="VD: kể chuyện lịch sử Việt Nam" value="${esc(st.topic)}"></div>
        <div class="field"><label>Khu vực tìm</label><select class="select input" data-k="gl">${REGIONS.map(([v, l]) => `<option value="${v}" ${st.gl === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Từ khoá tìm (không bắt buộc, cách nhau bằng dấu phẩy)</label><input class="input" data-k="keywords" placeholder="Để trống = dùng chủ đề. VD: lịch sử việt nam, chuyện xưa" value="${esc(st.keywords)}">
          <div class="help">Nghiên cứu thị trường Việt thì dùng từ khoá tiếng Việt; từ khoá tiếng Anh trả về kênh nước ngoài triệu sub.</div></div>
        <div class="field"><label>Kênh đối thủ đã biết (không bắt buộc)</label><input class="input" data-k="competitors" placeholder="@kenh1, @kenh2" value="${esc(st.competitors)}"></div>
      </div>
      <div class="section-label">Tìm theo hướng</div>
      <div class="direction">${DIRS.map((d) => `<button type="button" class="dir-card ${st.direction === d.v ? 'on' : ''}" data-dir="${d.v}"><b>${d.t}</b><span>${d.s}</span></button>`).join('')}</div>
      <div class="grid grid-2" style="margin-top:6px">
        <div><div class="section-label">Chỉ lấy video đăng trong</div>${chips('upload', UPLOAD_CHIPS, st.upload)}
          <div class="section-label">Độ dài video</div>${chips('dur', DUR_CHIPS, st.dur)}</div>
        <div><div class="section-label">Tuỳ chọn</div>
          <label class="check"><input type="checkbox" data-k="readComments" ${st.readComments ? 'checked' : ''}> Đọc comment của <input class="input sm" style="width:52px;display:inline" data-k="commentTop" value="${st.commentTop}"> video vượt kênh nhất, <input class="input sm" style="width:60px;display:inline" data-k="commentMax" value="${st.commentMax}"> comment mỗi video</label>
          <div class="row" style="margin-top:8px"><span class="small muted">Số video mỗi từ khoá</span>${chips('perKeyword', [{ v: 30, label: '30' }, { v: 40, label: '40' }, { v: 80, label: '80' }, { v: 150, label: '150' }], st.perKeyword)}</div>
          <div class="help muted small" style="margin-top:8px">Miễn phí · dữ liệu công khai của YouTube · 2 từ khoá + 5 video comment ≈ 30–60 giây.</div></div>
      </div>
      <div class="row" style="margin-top:16px"><button class="btn primary lg" data-run>${icon('doc')} Lập báo cáo</button></div>
    </div>
    <div data-out style="margin-top:14px"></div>
    <div class="card" data-history style="margin-top:14px"></div>`;

  const form = root.querySelector('[data-form]');
  bindChips(form, (name, v) => {
    st[name] = name === 'perKeyword' ? Number(v) : v;
    persist('research-form', st);
  });
  form.querySelectorAll('[data-dir]').forEach((b) =>
    b.addEventListener('click', () => {
      st.direction = b.dataset.dir;
      st.upload = DIRS.find((d) => d.v === st.direction).upload;
      form.querySelectorAll('[data-dir]').forEach((x) => x.classList.toggle('on', x === b));
      form.querySelectorAll('[data-chips="upload"] .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === st.upload));
      persist('research-form', st);
    }),
  );
  form.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => ((st[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value), persist('research-form', st))));
  form.querySelector('[data-run]').addEventListener('click', run);
  const out = root.querySelector('[data-out]');
  const shown = scope();

  async function run() {
    form.querySelectorAll('input.input[data-k]').forEach((el) => (st[el.dataset.k] = el.value.trim()));
    persist('research-form', st);
    if (!st.topic && !st.keywords) return toast('Nhập chủ đề', 'error');
    out.innerHTML = progressCard(`Đang nghiên cứu: ${st.topic || st.keywords}`);
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const body = { topic: st.topic, keywords: st.keywords, competitors: st.competitors, gl: st.gl, direction: st.direction, upload: st.upload, perKeyword: st.perKeyword, ...durToSeconds(st), comments: st.readComments ? { top: Number(st.commentTop) || 5, max: Number(st.commentMax) || 50 } : null };
      const res = await runJob('research', body, (p) => updateProgress(out, p));
      history();
      await show(res.id);
    } catch (e) {
      out.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
    }
  }

  async function show(id, tab = 'overview') {
    const rec = await records.get(id);
    setUrl('/research', { id: rec.id }); // a reload or a copied link opens this result again
    const d = rec.data;
    const byId = new Map(d.videos.map((v) => [v.id, v]));
    const s = d.summary;
    const tabs = [
      ['overview', 'Video thắng'],
      ['titles', 'Mẫu tiêu đề'],
      ['durations', 'Độ dài'],
      ['channels', `Kênh nhỏ đang thắng (${d.smallWinners.length})`],
      ['comments', d.comments ? `Comment (${d.comments.total})` : 'Comment'],
      ...(d.suggestions?.length ? [['keywords', 'Người xem gõ']] : []),
      ['all', `Tất cả video (${d.videos.length})`],
    ];
    out.innerHTML = `
      <div class="card card-pad"><div class="row between"><div><h2 style="margin:0;font-size:18px">${esc(d.topic)}</h2>
        <div class="muted small">${esc(rec.title)} · ${ago(rec.created_at)} · từ khoá: ${d.keywords.map((k) => `<span class="tag">${esc(k)}</span>`).join('')}</div></div>
        <div class="head-actions"><a class="btn sm" href="${records.exportUrl(id, 'md')}\" title="File Markdown: đưa cho Claude hoặc AI để viết báo cáo">${icon('download')} Markdown</a><a class="btn sm" href="${records.exportUrl(id, 'csv')}">${icon('download')} CSV</a></div></div></div>
      <div class="kpis" style="margin-top:14px">
        <div class="kpi"><div class="label">Video tìm được</div><div class="value">${s.count}</div><div class="hint">${s.channels} kênh</div></div>
        <div class="kpi"><div class="label">View trung vị</div><div class="value">${fmt(s.medianViews)}</div><div class="hint">${s.over100k} video trên 100 N</div></div>
        <div class="kpi"><div class="label">Vượt kênh</div><div class="value">${s.viewSubOver1}</div><div class="hint accent">video có view ≥ sub kênh</div></div>
        <div class="kpi"><div class="label">Kênh nhỏ thắng</div><div class="value">${d.smallWinners.length}</div><div class="hint">&lt; 100 N sub, video vượt kênh</div></div>
        <div class="kpi"><div class="label">Comment đã đọc</div><div class="value">${d.comments ? d.comments.total : '–'}</div><div class="hint">${d.comments ? `${d.comments.insights.counts.questions} câu hỏi` : 'chưa đọc'}</div></div>
      </div>
      <div class="card" style="margin-top:14px"><div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${esc(l)}</button>`).join('')}</div><div data-tabbody></div></div>`;
    out.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      out.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
      renderTab(b.dataset.tab);
    }));
    shown.off();
    shown.add(bindTips(out));
    const body = out.querySelector('[data-tabbody]');

    function renderTab(t) {
      if (t === 'overview') {
        const top = d.topByViewSub.map((i) => byId.get(i)).filter(Boolean);
        const vpd = d.topByViewsPerDay.map((i) => byId.get(i)).filter(Boolean).slice(0, 10);
        body.innerHTML = `<div class="card-pad"><div class="section-label" style="margin-top:0">Top theo điểm vượt kênh (view ÷ sub)</div>
          <div class="vgrid" style="padding:0">${top.map((v, i) => miniCard(v, i)).join('')}</div>
          ${d.topByOutlierScore?.length ? `<div class="section-label" data-tip="${esc(outlierTip())}">Outlier: gấp nhiều lần video thường của chính kênh ⓘ</div>${outlierTable(d.topByOutlierScore.map((i) => byId.get(i)).filter(Boolean).slice(0, 10))}` : ''}
          <div class="section-label">Đang lên nhanh nhất (view/ngày)</div>${miniTable(vpd)}</div>`;
      } else if (t === 'titles') {
        body.innerHTML = `<div class="card-pad"><p class="muted small" style="margin-top:0">Tiêu đề trung vị ${d.titleShape.medianChars} ký tự, ${d.titleShape.medianWords} từ. Hiệu quả = trung vị vượt kênh của nhóm ÷ trung vị chung.</p>
          ${patternList(d.patterns)}<div class="section-label">Cụm từ hay xuất hiện (xếp theo vượt kênh trung vị)</div>${phraseChips(d.phrases)}</div>`;
      } else if (t === 'durations') {
        body.innerHTML = `<div class="card-pad"><div class="grid grid-2"><div><div class="section-label" style="margin-top:0">Vượt kênh trung vị theo độ dài</div>${hbars(d.durations, { value: 'medianViewSub', format: mult })}</div>
          <div><div class="section-label" style="margin-top:0">View trung vị theo độ dài</div>${hbars(d.durations, { value: 'medianViews' })}</div></div></div>`;
      } else if (t === 'channels') {
        body.innerHTML = `<div class="card-pad"><p class="muted small" style="margin-top:0">Bước 1 trong quy trình: ưu tiên kênh <b>nhiều view nhưng ít sub</b>, có video mới đạt view tốt. Bấm Phân tích để xem cả kênh.</p>
          ${channelTable(d.smallWinners.length ? d.smallWinners : d.channels.slice(0, 15))}
          <div class="section-label">Tất cả kênh trong kết quả</div>${channelTable(d.channels)}</div>`;
      } else if (t === 'comments') {
        renderComments();
      } else if (t === 'keywords') {
        body.innerHTML = `<div class="card-pad"><p class="muted small" style="margin-top:0">Gợi ý tìm kiếm của YouTube cho chủ đề: thứ người xem đang gõ. Bấm để tìm video cho từ khoá đó.</p>
          <div class="chips">${d.suggestions.map((s) => `<a class="chip" href="#/videos?q=${encodeURIComponent(s.keyword)}&run=1">${esc(s.keyword)}</a>`).join('')}</div></div>`;
      } else if (t === 'all') {
        body.innerHTML = '<div style="padding:14px" data-all></div>';
        mountVideoResults(body.querySelector('[data-all]'), d.videos, { key: 'vf-research', regions: [...new Set(d.videos.flatMap((v) => v.regions || []))], onComments: (ids) => window.__go('/comments', { videos: ids.join(',') }) });
      }
    }

    function renderComments() {
      const c = d.comments;
      if (!c) {
        body.innerHTML = `<div class="card-pad"><div class="empty"><b>Chưa đọc comment</b>Đọc comment của các video vượt kênh nhất để biết khán giả hỏi gì, than gì, muốn xem gì.</div>
          <div class="row" style="justify-content:center"><button class="btn primary" data-read>${icon('message')} Đọc comment top 5 video (50 comment mỗi video)</button></div></div>`;
        body.querySelector('[data-read]').addEventListener('click', async () => {
          body.innerHTML = `<div class="card-pad">${progressCard('Đang đọc comment')}</div>`;
          try {
            await runJob('research_comments', { recordId: id, top: 5, max: 50 }, (p) => updateProgress(body, p));
            show(id, 'comments');
          } catch (e) {
            body.innerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
          }
        });
        return;
      }
      const i = c.insights;
      const quotes = (list) => (list.length ? list.slice(0, 15).map((x) => `<blockquote class="quote">${esc(x.text)}<div class="m">${x.likes} like · ${x.replies} trả lời · ${esc((x.videoTitle || '').slice(0, 60))}</div></blockquote>`).join('') : emptyState('Không có'));
      body.innerHTML = `<div class="card-pad">
        <p class="muted small" style="margin-top:0">${c.total} comment từ ${c.videos.length} video: ${c.videos.map((v) => `<a href="${ytVideo(v.id)}" target="_blank" rel="noopener" class="tag">${esc(v.title.slice(0, 40))} (${v.count}${v.disabled ? ', tắt comment' : ''})</a>`).join('')} · Không lưu tên người viết.</p>
        <div class="grid grid-2">
          <div><div class="section-label" style="margin-top:0">Khán giả hỏi (${i.counts.questions})</div>${quotes(i.questions)}</div>
          <div><div class="section-label" style="margin-top:0">Muốn xem tiếp / yêu cầu (${i.counts.requests})</div>${quotes(i.requests)}
            <div class="section-label">Phàn nàn (${i.counts.complaints})</div>${quotes(i.complaints)}</div>
        </div>
        <div class="section-label">Cụm từ lặp lại trong comment</div><div class="chips">${i.phrases.map((p) => `<span class="tag">${esc(p.phrase)} · <b>${p.count}</b></span>`).join('')}</div>
        <div class="section-label">Comment được like nhiều nhất</div>${quotes(i.top)}
        <div class="row" style="margin-top:12px"><a class="btn sm" href="${records.exportUrl(id, 'csv', { what: 'comments' })}">${icon('download')} CSV comment</a></div></div>`;
    }

    function miniCard(v, i) {
      return `<div class="vcard"><div class="img"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${thumb(v.id)}" alt=""></a>
        <span class="ov mult">${mult(v.viewSub)} sub</span><span class="ov rank">#${i + 1}</span><span class="ov dur">${dur(v.durationSec)}</span></div>
        <div class="body"><a class="t1" href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a>
        <div class="stats"><b>${fmt(v.views)}</b> view · ${fmt(v.viewsPerDay)}/ngày · ${ageText(v.age, v.ageExact)}</div>
        <div class="stats"><a href="#/channel?input=${encodeURIComponent(v.channelId)}">${esc(v.channelTitle)}</a> · ${fmt(v.channelSubs)} sub</div></div></div>`;
    }
    function miniTable(list) {
      return `<table class="t"><thead><tr><th class="thumb"></th><th>Video</th><th class="r">View</th><th class="r">View/ngày</th><th class="r">Vượt kênh</th><th class="r">Đăng</th></tr></thead><tbody>
        ${list.map((v) => `<tr><td class="thumb"><img loading="lazy" src="${thumb(v.id)}" alt=""></td><td class="title-cell"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a><div class="meta">${esc(v.channelTitle)} · ${fmt(v.channelSubs)} sub</div></td>
          <td class="r num">${fmt(v.views)}</td><td class="r num"><b>${fmt(v.viewsPerDay)}</b></td><td class="r">${mult(v.viewSub)}</td><td class="r num">${ageText(v.age, v.ageExact)}</td></tr>`).join('')}</tbody></table>`;
    }
    function outlierTable(list) {
      return `<table class="t"><thead><tr><th class="thumb"></th><th>Video</th><th class="r">View</th><th class="r">View TB kênh</th><th class="r">Outlier</th><th class="r">Đăng</th></tr></thead><tbody>
        ${list.map((v) => `<tr><td class="thumb"><img loading="lazy" src="${thumb(v.id)}" alt=""></td><td class="title-cell"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a><div class="meta">${esc(v.channelTitle)} · ${fmt(v.channelSubs)} sub</div></td>
          <td class="r num">${fmt(v.views)}</td><td class="r num">${fmt(v.channelMedianViews)}</td><td class="r">${oscoreBadge(v)}</td><td class="r num">${ageText(v.age, v.ageExact)}</td></tr>`).join('')}</tbody></table>`;
    }
    function channelTable(list) {
      if (!list.length) return emptyState('Không có');
      return `<table class="t"><thead><tr><th>Kênh</th><th class="r">Sub</th><th class="r">Video trong kết quả</th><th class="r">Vượt kênh tốt nhất</th><th>Video tốt nhất</th><th></th></tr></thead><tbody>
        ${list.map((c) => `<tr><td><b>${esc(c.title)}</b><div class="muted small">${esc(c.handle || '')}</div></td><td class="r num">${fmt(c.subs)}</td><td class="r num">${c.count}</td>
          <td class="r"><span class="badge ${c.bestViewSub >= 1 ? 'good' : 'plain'}">${mult(c.bestViewSub)}</span></td>
          <td class="title-cell"><a href="${ytVideo(c.videos[0]?.id)}" target="_blank" rel="noopener">${esc(c.videos[0]?.title || '')}</a><div class="meta">${fmt(c.videos[0]?.views)} view</div></td>
          <td><a class="btn sm" href="#/channel?input=${encodeURIComponent(c.id)}">${icon('bars')} Phân tích</a></td></tr>`).join('')}</tbody></table>`;
    }
    renderTab(tab);
  }

  async function history() {
    const list = await records.list('research', 5);
    root.querySelector('[data-history]').innerHTML = `<div class="card-head"><h3>${icon('doc')} Báo cáo đã lập</h3><a class="btn sm" href="#/history?kind=research">Xem tất cả</a></div>${
      list.length ? list.map((r) => `<div class="list-row"><a class="name" href="#/research?id=${r.id}">${esc(r.title)}</a><span class="when">${ago(r.created_at)}</span><button class="icon-btn" data-del="${r.id}" title="Xoá">${icon('trash')}</button></div>`).join('') : emptyState('Chưa có báo cáo nào')
    }`;
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => (await records.remove(b.dataset.del), history())));
  }
  history();
  if (params.id) show(params.id);
  else resumeJob('research', out, (j) => `Đang nghiên cứu: ${j.title}`, async (res) => (history(), await show(res.id)));
  return () => {
    shown.off();
  };
}
