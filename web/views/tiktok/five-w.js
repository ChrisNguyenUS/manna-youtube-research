// "5W1H (AI)": pick videos that already have comments → a language model groups the comments by Who, What, Why,
// When, Where, How. With ?id= it shows a saved report: the app counts, the AI writes the notes and content ideas.
import { records, tiktokCommentData, tiktokFiveW } from '../../http/client.js';
import { esc, icon, fmt, ago, runJob, progressCard, updateProgress, errorCallout, emptyState, toast } from '../../lib.js';
import { commentExplorer } from '../../components/comment-explorer.js';

const KIND = 'comment_5w1h';
const PATH = '/tiktok/5w1h';
const DIMS = [
  ['who', 'Who', 'Ai đang nói'], ['what', 'What', 'Nói về chuyện gì'], ['why', 'Why', 'Vì sao quan tâm'],
  ['when', 'When', 'Lúc nào'], ['where', 'Where', 'Ở đâu'], ['how', 'How', 'Đang xoay xở ra sao'],
];
const FUNNEL = { biet: 'Biết', thich: 'Thích', tin: 'Tin', yeu: 'Yêu' };
const TAB_ICONS = { who: 'users', what: 'message', why: 'bulb', when: 'clock', where: 'compass', how: 'bolt', ideas: 'flame' };
const NO_KEY = 'Chưa nhập API key OpenRouter';
const usd = (n) => (n == null ? '' : `, $${Number(n).toFixed(4)}`);

export async function mount(root, params) {
  return params.id ? showReport(root, params.id) : showPicker(root);
}

async function showPicker(root) {
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('target')} 5W1H comment (AI)</h1>
      <p>AI đọc bình luận đã thu thập rồi xếp nhóm theo Who, What, Why, When, Where, How. App đếm, AI chỉ viết nhận định và gợi ý content.</p></div></div>
    <div class="card card-pad" data-pick><div class="muted">Đang tải…</div></div>
    <div data-prog></div>
    <div class="card" data-history></div>`;
  const pick = /** @type {HTMLElement} */ (root.querySelector('[data-pick]'));
  const prog = /** @type {HTMLElement} */ (root.querySelector('[data-prog]'));
  const [videos, past] = await Promise.all([tiktokCommentData.videos(), records.list(KIND, 20)]);
  renderHistory(/** @type {HTMLElement} */ (root.querySelector('[data-history]')), past);
  if (!videos.length) {
    pick.innerHTML = emptyState('Chưa có bình luận nào', ' Vào Thu thập bình luận để lấy bình luận của video trước.');
    return;
  }
  const chosen = new Set();
  let seq = 0;
  pick.innerHTML = `
    <div class="row" style="justify-content:space-between"><label class="check"><input type="checkbox" data-all> Chọn tất cả (${videos.length} video)</label><span class="small muted" data-est></span></div>
    <div class="fw-videos">${videos.map((v) => `<label class="check fw-video"><input type="checkbox" data-v="${esc(v.id)}"><span><b>${esc(v.caption || v.url)}</b>
      <span class="muted">${v.author ? `@${esc(v.author)} · ` : ''}${fmt(v.parents)} gốc + ${fmt(v.replies)} trả lời · ${ago(v.lastSeen)}</span></span></label>`).join('')}</div>
    <div class="row" style="margin-top:12px"><button class="btn primary" data-run disabled>${icon('target')} Phân tích 5W1H</button><span class="small muted" data-note></span></div>`;
  const runBtn = /** @type {HTMLButtonElement} */ (pick.querySelector('[data-run]'));
  const est = /** @type {HTMLElement} */ (pick.querySelector('[data-est]'));
  const note = /** @type {HTMLElement} */ (pick.querySelector('[data-note]'));

  async function refresh() {
    runBtn.disabled = !chosen.size;
    est.textContent = '';
    note.innerHTML = '';
    const mine = ++seq;
    if (!chosen.size) return;
    const e = await tiktokFiveW.estimate([...chosen]).catch(() => null);
    if (mine !== seq || !e) return;
    est.textContent = `Sẽ gửi ${fmt(e.comments)} bình luận (${fmt(e.unique)} câu khác nhau), khoảng ${fmt(e.tokens)} token${e.dropped ? `. Bỏ ${fmt(e.dropped)} bình luận ít được chú ý nhất vì vượt 5.000` : ''}`;
    if (!e.ready) {
      runBtn.disabled = true;
      note.innerHTML = `${NO_KEY}. <a href="#/settings">Mở Cài đặt</a>`;
    } else if (!e.comments) {
      runBtn.disabled = true;
      note.textContent = 'Không có comment nào có chữ';
    }
  }
  pick.addEventListener('change', (ev) => {
    const el = /** @type {HTMLInputElement} */ (ev.target);
    if (el.matches('[data-all]')) pick.querySelectorAll('[data-v]').forEach((x) => { /** @type {HTMLInputElement} */ (x).checked = el.checked; el.checked ? chosen.add(/** @type {HTMLElement} */ (x).dataset.v) : chosen.clear(); });
    else if (el.matches('[data-v]')) el.checked ? chosen.add(el.dataset.v) : chosen.delete(el.dataset.v);
    refresh();
  });
  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    prog.innerHTML = progressCard(`Phân tích 5W1H · ${chosen.size} video`);
    try {
      const res = await runJob(KIND, { videos: [...chosen].join(',') }, (p) => updateProgress(prog, p));
      location.hash = `#${PATH}?id=${res.id}`;
    } catch (e) {
      prog.innerHTML = errorCallout(e);
      runBtn.disabled = false;
    }
  });
}

function renderHistory(box, list) {
  box.innerHTML = `<div class="card-head"><b>Báo cáo đã chạy</b></div>${list.length
    ? `<div class="fw-history">${list.map((r) => `<a href="#${PATH}?id=${r.id}">${esc(r.title)}<span class="muted small">${ago(r.created_at)}</span></a>`).join('')}</div>`
    : `<div class="card-pad muted">Chưa có báo cáo nào.</div>`}`;
}

async function showReport(root, id, tab = 'who') {
  let shownTab = tab;
  root.innerHTML = `<div class="card card-pad muted">Đang tải…</div>`;
  let r;
  try {
    r = await tiktokFiveW.report(id);
  } catch (e) {
    root.innerHTML = `${errorCallout(e)}<p><a href="#${PATH}">Về danh sách</a></p>`;
    return;
  }
  const d = r.data;
  const byId = new Map(r.comments.map((c) => [String(c.id), c]));
  const videos = new Map(r.videos.map((v) => [String(v.id), v]));
  const label = (dim, key) => d.codebook[dim].find((g) => g.key === key)?.label ?? key;
  const quote = (cid) => (byId.has(cid) ? `<div class="fw-quote"><i>"${esc(byId.get(cid).text)}"</i> <span class="muted small">${fmt(byId.get(cid).likes)} tim</span></div>` : '');
  const u = d.usage;
  const field = (cap, body) => `<div class="fw-field"><div class="fw-cap">${cap}</div>${body}</div>`;
  const TABS = [...DIMS.map(([k, title, sub]) => ({ key: k, title, sub, icon: TAB_ICONS[k] })), ...(d.ideas?.length ? [{ key: 'ideas', title: 'Gợi ý content', icon: TAB_ICONS.ideas }] : [])];

  const dimPanel = ([dim, , sub]) => {
    const t = r.table.dims[dim];
    const q = field('CÂU HỎI', `<div class="fw-value">${esc(sub)}</div>`);
    if (!t.enough) return q + field('KẾT QUẢ', `<div class="fw-value">Không đủ dữ liệu: bình luận gần như không nói về chiều này.</div>`);
    const notes = (d.notes?.[dim] ?? []).map((n) => `<div class="fw-value">${esc(n.text)}</div>`).join('');
    const groups = t.groups.map((g) => `<button type="button" class="fw-group" data-dim="${dim}" data-key="${esc(g.key)}" title="${esc(g.description)}">
        <span class="fw-chip">${esc(g.label)}</span><span class="muted">${fmt(g.count)} bình luận</span>${g.description ? `<span class="muted small fw-desc">${esc(g.description)}</span>` : ''}</button>`).join('');
    return q + (notes ? field('NHẬN ĐỊNH', notes) : '') + field('NHÓM', `<div class="fw-groups">${groups}</div>`) + `<div data-explorer></div>`;
  };
  const idea = (x, i) => `<div class="fw-idea"><div><b>${i + 1}. ${esc(x.title)}</b> <span class="fw-chip outline">Chưa có tiền lệ outlier</span> <a class="btn sm" href="#/board?from=5w1h:${esc(r.id)}:${i}">${icon('bulb')} Đưa vào bảng</a></div>
    ${x.who ? field('DÀNH CHO', `<div class="fw-value">${esc(label('who', x.who))}</div>`) : ''}
    ${x.pain ? field('NỖI ĐAU', `<div class="fw-value">${esc(x.pain)}</div>`) : ''}
    ${x.belief ? field('ĐANG TIN', `<div class="fw-value"><i>${esc(x.belief.text)}</i></div>${x.belief.evidence.map(quote).join('')}`) : ''}
    ${x.concept ? field('CONCEPT', `<span class="fw-chip">${esc(x.concept)}</span>${(x.extraConcepts ?? []).map((c) => ` <span class="fw-chip soft">${esc(c)}</span>`).join('')}`) : ''}
    ${x.funnel ? field('PHỄU', `<span class="fw-chip">${esc(FUNNEL[x.funnel] ?? x.funnel)}</span>`) : ''}
    ${x.evidence?.length ? field('BẰNG CHỨNG', x.evidence.map(quote).join('')) : ''}</div>`;
  const panelHtml = (tab) => {
    const t = TABS.find((x) => x.key === tab);
    const head = `<div class="fw-panel-head">${icon(t.icon)}<b>${esc(t.title)}</b></div>`;
    if (tab === 'ideas') return `${head}<div class="fw-body"><div class="muted small">Dựa trên nỗi đau trong comment, chưa đối chiếu với video đã thắng</div>${d.ideas.map(idea).join('')}</div>`;
    return `${head}<div class="fw-body">${dimPanel(DIMS.find((x) => x[0] === tab))}</div>`;
  };

  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('target')} 5W1H: ${esc(r.title)}</h1>
      <p>${fmt(r.table.total)} bình luận đã xếp nhóm${d.counts.untagged ? `, ${fmt(d.counts.untagged)} chưa phân loại` : ''}${d.counts.dropped ? `, ${fmt(d.counts.dropped)} bị bỏ vì vượt giới hạn` : ''} · ${ago(r.createdAt)}</p></div>
      <div class="row"><a class="btn" href="#${PATH}">${icon('message')} Chạy lần khác</a><a class="btn" href="${records.exportUrl(r.id, 'md')}">${icon('download')} Markdown</a></div></div>
    <div class="callout info">Nhận định do AI viết, số đếm do app tính. Model gắn mã: <b>${esc(u.tagModel)}</b> · Model tổng hợp: <b>${esc(u.writeModel)}</b> · ${fmt(u.tokensIn + u.tokensOut)} token${usd(u.costUsd)}.
      ${d.hasKnowledge ? '' : ' Chưa có file kiến thức nên gợi ý content không kèm concept, DICK và phễu.'}</div>
    ${d.notes ? '' : `<div class="callout" style="margin-top:10px">AI chưa viết được phần nhận định và gợi ý (${esc(d.summaryError || 'không rõ lỗi')}). Các nhóm và số đếm bên dưới vẫn đúng. <button class="btn sm" data-rewrite>${icon('refresh')} Viết lại phần này</button></div>`}
    <div data-prog></div>
    <div class="fw-tabs" role="tablist">${TABS.map((t) => `<button type="button" class="fw-tab" role="tab" data-tab="${t.key}">${icon(t.icon)}<span>${esc(t.title)}</span></button>`).join('')}</div>
    <div class="card fw-panel" data-panel></div>`;

  // The explorer's listeners sit on elements inside `root`, which the router replaces, so nothing needs cleanup on leave.
  const panel = /** @type {HTMLElement} */ (root.querySelector('[data-panel]'));
  let explorer = null;
  const show = (tab) => {
    explorer?.off();
    explorer = null;
    shownTab = tab;
    root.querySelectorAll('.fw-tab').forEach((b) => {
      const on = /** @type {HTMLElement} */ (b).dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    panel.innerHTML = panelHtml(tab);
  };
  root.querySelector('.fw-tabs').addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('.fw-tab');
    if (b) show(b.dataset.tab);
  });
  panel.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('.fw-group');
    if (!b) return;
    const { dim, key } = b.dataset;
    panel.querySelectorAll('.fw-group.on').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    const ids = r.table.dims[dim].groups.find((g) => g.key === key)?.ids ?? [];
    explorer?.off();
    const box = /** @type {HTMLElement} */ (panel.querySelector('[data-explorer]'));
    box.innerHTML = `<div class="fw-field"><div class="fw-cap">BÌNH LUẬN CỦA NHÓM</div><div data-ex></div></div>`;
    const exBox = /** @type {HTMLElement} */ (box.querySelector('[data-ex]'));
    explorer = commentExplorer(exBox, { comments: ids.map((cid) => byId.get(cid)).filter(Boolean), videos, mode: 'embedded', head: `<h3 class="small">${esc(`${DIMS.find((x) => x[0] === dim)[1]}: ${label(dim, key)}`)}</h3>` });
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  show(shownTab);
  root.querySelector('[data-rewrite]')?.addEventListener('click', async (e) => {
    /** @type {HTMLButtonElement} */ (e.currentTarget).disabled = true;
    const prog = root.querySelector('[data-prog]');
    prog.innerHTML = progressCard('Viết lại nhận định 5W1H');
    try {
      await runJob(KIND, { onlyStep3: Number(r.id) }, (p) => updateProgress(prog, p));
      toast('Đã viết lại');
      showReport(root, id, shownTab);
    } catch (err) {
      prog.innerHTML = errorCallout(err);
    }
  });
}
