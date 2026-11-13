// "Đã lưu": the material kept for writing scripts and ads — customer quotes, TikTok videos, keywords, YouTube videos and channels.
import { saved } from '../http/client.js';
import { esc, icon, fmt, mult, ago, emptyState, ytVideo, thumb, ytChannel, toast, loadSaved, setUrl } from '../lib.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const q = (s) => encodeURIComponent(s);
const img = (cls, src) => (src ? `<img class="${cls}" loading="lazy" src="${esc(src)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : '');

/** Tab order, and how one item of each kind reads: main(s) → HTML, actions(s) → buttons, text(s) → what the search box looks in. */
const KINDS = {
  quote: {
    label: 'Câu chữ của khách', empty: 'Mở một báo cáo Insight khách hàng, tích các comment hay rồi bấm Lưu.',
    text: (s) => `${s.data.text} ${s.data.source} ${(s.data.topics || []).join(' ')}`,
    main: (s) => `<div class="sv-text"><p class="sv-quote">“${esc(s.data.text)}”</p>
      <div class="sv-meta"><span>♥ ${fmt(s.data.likes ?? 0)}</span><span>${fmt(s.data.replies ?? 0)} trả lời</span>
        ${(s.data.topics || []).map((t) => `<span class="tx-topic">${esc(t)}</span>`).join('')}
        ${s.data.source ? `<span>Chủ đề: ${s.data.recordId ? `<a href="#/tiktok/insight?id=${s.data.recordId}">${esc(s.data.source)}</a>` : esc(s.data.source)}</span>` : ''}</div></div>`,
    actions: (s) => `<button type="button" class="btn sm" data-copy="${esc(s.ref)}">${icon('doc')} Chép</button>${s.data.videoUrl ? `<a class="btn sm" href="${esc(s.data.videoUrl)}" target="_blank" rel="noopener">${icon('ext')} Video</a>` : ''}`,
    copy: (s) => `“${String(s.data.text).replace(/\s+/g, ' ').trim()}”`,
  },
  tiktok_video: {
    label: 'Video TikTok', empty: 'Mở một video trong Tìm theo chủ đề hoặc Insight khách hàng rồi bấm Lưu video.',
    text: (s) => `${s.data.caption} ${s.data.author} ${(s.data.keywords || []).join(' ')}`,
    main: (s) => `${img('sv-cover', s.data.cover)}<div class="sv-text"><a class="sv-title" href="${esc(s.data.url)}" target="_blank" rel="noopener">${esc(s.data.caption || '(không caption)')}</a>
      <div class="sv-meta"><span>@${esc(s.data.author)}</span><span><b>${fmt(s.data.plays)}</b> view</span><span>${fmt(s.data.likes)} tim</span><span>${fmt(s.data.comments)} bình luận</span>
        ${(s.data.keywords || []).map((k) => `<span class="tx-kw">${esc(k)}</span>`).join('')}</div></div>`,
    actions: (s) => `<a class="btn sm" href="#/tiktok/comments?videos=${q(s.data.url)}">${icon('message')} Comment</a>`,
  },
  keyword: {
    label: 'Từ khoá', empty: 'Tích từ khoá ở Tìm theo chủ đề (TikTok) hoặc Gợi ý từ khoá (YouTube) rồi bấm Lưu.',
    text: (s) => `${s.data.keyword} ${s.data.topic}`,
    main: (s) => `<div class="sv-text"><b>${esc(s.data.keyword)}</b><div class="sv-meta"><span class="badge plain">${s.data.platform === 'tiktok' ? 'TikTok' : 'YouTube'}</span>${s.data.topic ? `<span>Chủ đề: ${esc(s.data.topic)}</span>` : ''}</div></div>`,
    actions: (s) => (s.data.platform === 'tiktok'
      ? `<a class="btn sm" href="#/tiktok/topic?q=${q(s.data.keyword)}&run=1">${icon('compass')} Tìm theo chủ đề</a><a class="btn sm" href="#/tiktok/insight?q=${q(s.data.keyword)}">${icon('message')} Insight</a>`
      : `<a class="btn sm" href="#/videos?q=${q(s.data.keyword)}&run=1">${icon('search')} Tìm video</a><a class="btn sm" href="#/ideas?ideas=${q(s.data.keyword)}&run=1">${icon('bulb')} Chấm điểm</a>`),
    copy: (s) => s.data.keyword,
  },
  video: {
    label: 'Video YouTube', empty: 'Bấm biểu tượng dấu trang ở kết quả tìm video để lưu.',
    text: (s) => `${s.data.title} ${s.data.channelTitle}`,
    main: (s) => `${img('sv-thumb', thumb(s.data.id))}<div class="sv-text"><a class="sv-title" href="${ytVideo(s.data.id)}" target="_blank" rel="noopener">${esc(s.data.title)}</a>
      <div class="sv-meta"><span>${esc(s.data.channelTitle)}</span><span><b>${fmt(s.data.views)}</b> view</span><span>${mult(s.data.viewSub)} sub</span></div></div>`,
    actions: (s) => `<a class="btn sm" href="#/comments?videos=${q(s.data.id)}">${icon('message')} Comment</a>`,
  },
  channel: {
    label: 'Kênh YouTube', empty: 'Bấm Lưu kênh ở Tìm kênh hoặc Phân tích kênh.',
    text: (s) => `${s.data.title} ${s.data.handle}`,
    main: (s) => `${img('sv-avatar', s.data.avatar)}<div class="sv-text"><a class="sv-title" href="${ytChannel(s.data)}" target="_blank" rel="noopener">${esc(s.data.title || s.title)}</a>
      <div class="sv-meta"><span>${fmt(s.data.subs)} sub</span><span>trung vị ${fmt(s.data.medianViews)} view</span>${s.data.country ? `<span>${esc(s.data.country)}</span>` : ''}</div></div>`,
    actions: (s) => `<a class="btn sm" href="#/channel?input=${q(s.data.id)}">${icon('bars')} Phân tích</a>`,
  },
};

export async function mount(root, params) {
  /** @type {any[]} */
  let all = await saved.list();
  const count = (k) => all.filter((s) => s.kind === k).length;
  let tab = KINDS[params.tab] ? params.tab : Object.keys(KINDS).find(count) || 'quote';
  let find = '';
  let armed = ''; // ref of the row whose delete button waits for a second click

  root.innerHTML = `<div class="page-head"><div><h1>${icon('bookmark')} Đã lưu</h1><p>Chất liệu để viết kịch bản và quảng cáo: câu chữ thật của khách, video, từ khoá, kênh. Ghi chú được cho từng mục.</p></div>
      <a class="btn" href="${saved.exportUrl()}" data-all>${icon('download')} Tải tất cả (Markdown)</a></div>
    <div class="card"><div class="tabs sv-tabs" data-tabs></div>
      <div class="hist-bar"><label class="tt-searchmini hist-q">${icon('search')}<input data-q placeholder="Tìm trong mục đã lưu" autocomplete="off"></label><span class="spacer"></span>
        <span class="muted small" data-count></span>
        <button type="button" class="btn sm" data-copyall>${icon('doc')} Chép Markdown</button><a class="btn sm" data-dl>${icon('download')} Tải Markdown</a></div>
      <div data-body></div></div>`;
  const body = root.querySelector('[data-body]');
  const shown = () => all.filter((s) => s.kind === tab && (!find || fold(KINDS[tab].text(s)).includes(fold(find))));

  function render() {
    const def = KINDS[tab];
    root.querySelector('[data-tabs]').innerHTML = Object.entries(KINDS).map(([k, d]) => `<button type="button" class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${d.label}<b>${count(k)}</b></button>`).join('');
    /** @type {HTMLAnchorElement} */ (root.querySelector('[data-dl]')).href = saved.exportUrl(tab);
    const list = shown();
    root.querySelector('[data-count]').textContent = find ? `${list.length} / ${count(tab)} mục` : `${list.length} mục`;
    /** @type {HTMLButtonElement} */ (root.querySelector('[data-copyall]')).disabled = !count(tab);
    body.innerHTML = list.length
      ? list.map((s) => `<div class="sv-row"><div class="sv-main">${def.main(s)}</div>
          <input class="input sm" data-note="${esc(s.ref)}" placeholder="Ghi chú…" value="${esc(s.note || '')}" aria-label="Ghi chú">
          <div class="sv-act">${def.actions(s)}<span class="muted small">${ago(s.created_at)}</span>
            ${armed === s.ref ? `<button type="button" class="btn sm danger" data-del="${esc(s.ref)}">Bỏ lưu?</button>` : `<button type="button" class="icon-btn" data-del="${esc(s.ref)}" title="Bỏ lưu">${icon('trash')}</button>`}</div></div>`).join('')
      : emptyState(find ? 'Không có mục khớp' : 'Chưa lưu gì ở đây', find ? '' : def.empty);
  }
  const item = (ref) => all.find((s) => s.kind === tab && s.ref === ref);
  const copy = async (text, done) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(done);
    } catch {
      toast('Trình duyệt không cho chép, thử lại', 'error');
    }
  };

  root.querySelector('[data-tabs]').addEventListener('click', (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-tab]'));
    if (!b) return;
    tab = String(b.dataset.tab);
    armed = '';
    setUrl('/saved', { tab });
    render();
  });
  root.querySelector('[data-q]').addEventListener('input', (e) => ((find = /** @type {HTMLInputElement} */ (e.target).value.trim()), render()));
  root.querySelector('[data-copyall]').addEventListener('click', async () => copy(await (await fetch(saved.exportUrl(tab, true))).text(), `Đã chép ${count(tab)} mục dạng Markdown`));
  body.addEventListener('change', async (e) => {
    const i = /** @type {HTMLInputElement} */ (e.target);
    if (!i.dataset.note) return;
    await saved.note({ kind: tab, ref: i.dataset.note, note: i.value });
    const s = item(i.dataset.note);
    if (s) s.note = i.value;
    toast('Đã lưu ghi chú');
  });
  body.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const c = /** @type {HTMLElement|null} */ (t.closest('[data-copy]'));
    if (c) {
      const s = item(c.dataset.copy);
      return s && copy(KINDS[tab].copy(s), 'Đã chép');
    }
    const d = /** @type {HTMLElement|null} */ (t.closest('[data-del]'));
    if (!d) return;
    const ref = String(d.dataset.del);
    if (armed !== ref) {
      armed = ref; // a note typed on the item goes with it: ask once more
      return render();
    }
    await saved.remove({ kind: tab, ref });
    armed = '';
    all = all.filter((s) => !(s.kind === tab && s.ref === ref));
    await loadSaved();
    render();
  });
  render();
}
