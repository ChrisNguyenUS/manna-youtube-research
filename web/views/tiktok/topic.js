// "Tìm theo chủ đề" (TikTok only): topic → related keywords picked on screen → one column of videos per keyword,
// each with its 3 most liked comments. Columns appear as each keyword finishes; a rescan shows views gained since.
import { records, tiktokTopic } from '../../http/client.js';
import { esc, icon, chips, bindChips, runJob, progressCard, updateProgress, toast, store, persist, fmt, ago, emptyState, ageText, bindTips } from '../../lib.js';
import { scope } from '../../dom.js';

const FORM = { topic: '', minPlays: 100000, maxAgeDays: 0, sort: 'score', maxKeywords: 10, perKeyword: 10, topComments: 3, keepOffTopic: 0, view: 'columns' };
const SORT_LABELS = { score: 'Tổng hợp', plays: 'View', trending: 'View/ngày', fresh: 'Mới nhất' };
const INTENT_ORDER = ['time', 'cost', 'howto', 'interview', 'condition', 'experience', 'related'];
const INTENT_LABELS = { time: 'Thời gian', cost: 'Chi phí', howto: 'Cách làm, giấy tờ', interview: 'Phỏng vấn', condition: 'Điều kiện', experience: 'Kinh nghiệm, câu chuyện', related: 'Chủ đề liên quan' };

export async function mount(root, params) {
  const st = store('tt-topic-form', FORM);
  /** @type {{keyword: string, intent: string, selected: boolean, dropped?: string, sources: string[]}[]} */
  let kws = [];
  let current = null; // record on screen
  let showJunk = false; // columns of keywords that mostly brought unrelated videos stay hidden until asked
  const selected = new Set();
  const shown = scope();

  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('compass')} Tìm theo chủ đề (TikTok)</h1>
      <p>Gõ một chủ đề, app lấy các từ khoá liên quan mà chính TikTok gợi ý, rồi xếp video top của từng từ khoá thành cột, kèm 3 comment nhiều tym nhất. Quét lại chủ đề cũ để thấy video nào đang tăng view.</p></div></div>
    <div class="card card-pad" data-form>
      <div class="row" style="align-items:flex-end">
        <div class="field" style="flex:1;min-width:260px;margin:0"><label>Chủ đề (tiếng Việt, cụ thể)</label><input class="input" data-k="topic" placeholder="bảo lãnh vợ chồng" value="${esc(st.topic)}"></div>
        <button class="btn primary lg" data-find>${icon('search')} Tìm từ khoá</button>
      </div>
      <div class="filter-table" style="margin-top:14px">
        <div class="filter-row"><div class="fr-label">View tối thiểu</div>${chips('minPlays', [10_000, 100_000, 1_000_000].map((v) => ({ v, label: fmt(v) + '+' })), st.minPlays || '').replace('data-chips=', 'data-allow-off data-chips=')}<div></div></div>
        <div class="filter-row"><div class="fr-label">Đăng trong</div>${chips('maxAgeDays', [7, 30, 90, 365].map((v) => ({ v, label: v === 365 ? '1 năm' : `${v} ngày` })), st.maxAgeDays || '').replace('data-chips=', 'data-allow-off data-chips=')}<div></div></div>
        <div class="filter-row"><div class="fr-label">Xếp theo</div>${chips('sort', Object.entries(SORT_LABELS).map(([v, label]) => ({ v, label })), st.sort)}<div></div></div>
        <div class="filter-row"><div class="fr-label">Số từ khoá</div>${chips('maxKeywords', [5, 10, 15, 20].map((v) => ({ v, label: String(v) })), st.maxKeywords)}<div></div></div>
        <div class="filter-row"><div class="fr-label">Video mỗi từ khoá</div>${chips('perKeyword', [5, 10, 20].map((v) => ({ v, label: String(v) })), st.perKeyword)}<div></div></div>
        <div class="filter-row"><div class="fr-label" data-tip="Đúng chủ đề = caption/hashtag có từ khoá (bỏ chữ “mỹ”, năm), hoặc có ≥ 2 hashtag của chủ đề; bỏ video về nước khác">Video lạc đề</div>${chips('keepOffTopic', [{ v: 0, label: 'Bỏ (chỉ giữ video đúng chủ đề)' }, { v: 1, label: 'Giữ hết' }], st.keepOffTopic || 0)}<div></div></div>
        <div class="filter-row"><div class="fr-label">Top comment</div>${chips('topComments', [{ v: 3, label: '3 comment nhiều tym' }, { v: 0, label: 'Không lấy (nhanh hơn)' }], st.topComments)}<div></div></div>
      </div>
      <div data-kws></div>
    </div>
    <div data-out style="margin-top:14px"></div><div class="card" data-history style="margin-top:14px"></div>`;

  const form = root.querySelector('[data-form]');
  shown.add(bindTips(form));
  const kwBox = root.querySelector('[data-kws]');
  const out = root.querySelector('[data-out]');
  const topicInput = /** @type {HTMLInputElement} */ (root.querySelector('[data-k="topic"]'));
  bindChips(form, (n, v) => {
    st[n] = n === 'sort' ? v : Number(v) || 0;
    persist('tt-topic-form', st);
    if (n === 'maxKeywords' && kws.length) preselect();
  });
  root.querySelector('[data-find]').addEventListener('click', findKeywords);
  topicInput.addEventListener('keydown', (e) => e.key === 'Enter' && findKeywords());

  async function findKeywords() {
    st.topic = topicInput.value.trim();
    persist('tt-topic-form', st);
    if (!st.topic) return toast('Nhập chủ đề', 'error');
    kwBox.innerHTML = `<div class="callout info" style="margin-top:14px">Đang hỏi TikTok các từ khoá liên quan tới “${esc(st.topic)}”… (khoảng 10 giây)</div>`;
    try {
      const r = await tiktokTopic.keywords(st.topic, st.maxKeywords);
      kws = r.keywords;
      renderKeywords();
    } catch (e) {
      kwBox.innerHTML = `<div class="callout" style="margin-top:14px">Lỗi: ${esc(e.message)}</div>`;
    }
  }

  function preselect() {
    let n = 0;
    for (const k of kws) k.selected = !k.dropped && n++ < st.maxKeywords;
    renderKeywords();
  }

  function renderKeywords() {
    const groups = INTENT_ORDER.map((intent) => [intent, kws.filter((k) => k.intent === intent && !k.dropped)]).filter(([, l]) => l.length);
    const dropped = kws.filter((k) => k.dropped);
    const n = kws.filter((k) => k.selected).length;
    const chip = (k) => `<button type="button" class="chip ${k.selected ? 'on' : ''}" data-kw="${esc(k.keyword)}" title="${esc(k.sources.map((s) => ({ topic: 'chủ đề gốc', related: 'Người khác tìm kiếm', suggest: 'gợi ý khi gõ', manual: 'bạn thêm' })[s] || s).join(', '))}">${esc(k.keyword)}</button>`;
    kwBox.innerHTML = `<div class="tt-kws">
      <div class="row between"><b>Từ khoá liên quan</b><span class="muted small">Bấm để bật/tắt. Đang chọn <b>${n}</b> từ khoá.</span></div>
      ${groups.map(([intent, list]) => `<div class="tt-kw-group"><div class="tt-kw-label">${esc(INTENT_LABELS[intent])}</div><div class="chips">${list.map(chip).join('')}</div></div>`).join('')}
      ${dropped.length ? `<div class="tt-kw-group"><div class="tt-kw-label">Đã loại</div><div class="chips">${dropped.map((k) => `<span class="chip tt-dropped" title="${esc(k.dropped)}">${esc(k.keyword)} · ${esc(k.dropped)}</span>`).join('')}</div></div>` : ''}
      <div class="row" style="margin-top:12px"><input class="input" data-add placeholder="Thêm từ khoá của bạn" style="max-width:320px"><button class="btn" data-add-btn>${icon('plus')} Thêm</button>
        <span class="spacer"></span><span class="muted small">Ước chừng ${Math.max(1, Math.round((n * (st.topComments ? 25 : 12)) / 60))} phút</span>
        <button class="btn primary lg" data-scan ${n ? '' : 'disabled'}>${icon('play')} Quét ${n} từ khoá</button></div></div>`;
  }

  kwBox.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const b = t.closest('[data-kw]');
    if (b) {
      const k = kws.find((x) => x.keyword === b.getAttribute('data-kw'));
      if (k) k.selected = !k.selected;
      return renderKeywords();
    }
    if (t.closest('[data-add-btn]')) return addKeyword();
    if (t.closest('[data-scan]')) scan(kws.filter((k) => k.selected).map((k) => k.keyword));
  });
  kwBox.addEventListener('keydown', (e) => e.key === 'Enter' && /** @type {HTMLElement} */ (e.target).matches('[data-add]') && addKeyword());
  function addKeyword() {
    const input = /** @type {HTMLInputElement} */ (kwBox.querySelector('[data-add]'));
    const word = input.value.trim();
    if (!word) return;
    if (!kws.some((k) => k.keyword.toLowerCase() === word.toLowerCase())) kws.push({ keyword: word, intent: 'related', selected: true, sources: ['manual'] });
    renderKeywords();
  }

  /** @param {string[]} keywords @param {Record<string, any>} [o] */
  async function scan(keywords, o = st) {
    const topic = o.topic || st.topic;
    if (!keywords.length) return toast('Chọn ít nhất một từ khoá', 'error');
    out.innerHTML = progressCard(`Đang quét chủ đề: ${topic}`) + '<div data-partial></div>';
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    let lastDone = -1;
    const body = { topic, keywords: keywords.join('\n'), perKeyword: o.perKeyword, sort: o.sort, minPlays: o.minPlays || 0, maxAgeDays: o.maxAgeDays || 0, topComments: o.topComments ? 3 : 0, keepOffTopic: Boolean(o.keepOffTopic) };
    try {
      const res = await runJob('tiktok_topic', body, async (p) => {
        updateProgress(out, p);
        // Each finished keyword is saved right away: show its column without waiting for the rest.
        if (p?.recordId && p.done !== lastDone && p.done > 0) {
          lastDone = p.done;
          const rec = await records.get(p.recordId).catch(() => null);
          if (rec) renderResult(rec, out.querySelector('[data-partial]'));
        }
      });
      await show(res.id);
      history();
    } catch (e) {
      const prog = out.querySelector('[data-progress]');
      if (prog) prog.outerHTML = `<div class="callout">Lỗi: ${esc(e.message)}</div>`;
    }
  }

  async function show(id) {
    const rec = await records.get(id);
    out.innerHTML = '';
    renderResult(rec, out);
  }

  /** @param {any} rec @param {Element} box */
  function renderResult(rec, box) {
    current = rec;
    const d = rec.data;
    const done = d.status === 'done';
    const s = d.summary;
    const junk = d.columns.filter((c) => c.junk);
    const cols = d.columns.filter((c) => showJunk || !c.junk);
    const offTopic = d.columns.reduce((a, c) => a + (c.offTopic ?? 0), 0);
    const vids = cols.flatMap((c) => c.videos);
    const unique = new Map(vids.map((v) => [v.id, v]));
    const kpi = (label, value, hint = '') => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    box.innerHTML = `
      <div class="card card-pad"><div class="row between"><div><h2 style="margin:0;font-size:18px">${esc(d.topic)}</h2>
          <div class="muted small">${done ? `Quét ${ago(Date.parse(d.scannedAt))}` : d.status === 'failed' ? 'Lần quét bị dừng giữa chừng' : 'Đang quét…'}${d.previous ? ` · so với lần quét ${ago(Date.parse(d.previous.scannedAt))}` : ''} · xếp theo ${esc(SORT_LABELS[d.params.sort] || d.params.sort)}${d.params.minPlays ? ` · từ ${fmt(d.params.minPlays)} view` : ''}${d.params.maxAgeDays ? ` · đăng trong ${d.params.maxAgeDays} ngày` : ''}</div></div>
        ${done ? `<div class="head-actions"><button class="btn sm" data-rescan>${icon('refresh')} Quét lại</button><a class="btn sm primary" href="${records.exportUrl(rec.id, 'xlsx')}">${icon('download')} Excel</a><a class="btn sm" href="${records.exportUrl(rec.id, 'csv')}">${icon('download')} CSV</a><a class="btn sm" href="${records.exportUrl(rec.id, 'md')}">${icon('download')} Markdown</a></div>` : ''}</div></div>
      <div class="kpis" style="margin-top:14px">
        ${kpi('Từ khoá', cols.length, junk.length && !showJunk ? `ẩn ${junk.length} từ khoá rác` : '')}${kpi('Video', unique.size, d.params.keepOffTopic ? 'đã gộp video trùng · giữ cả lạc đề' : `đã gộp video trùng · bỏ ${offTopic} lạc đề`)}
        ${kpi('Tổng view', fmt([...unique.values()].reduce((a, v) => a + v.plays, 0)))}
        ${kpi('Video cao nhất', fmt(Math.max(0, ...[...unique.values()].map((v) => v.plays))))}
        ${kpi('Đăng ≤ 30 ngày', [...unique.values()].filter((v) => v.ageDays != null && v.ageDays <= 30).length, s?.newSincePrevious != null ? `${s.newSincePrevious} video mới so với lần trước` : '')}
      </div>
      <div class="card" style="margin-top:14px"><div class="card-pad">
        <div class="chips">${cols.map((c, i) => `<button type="button" class="chip ${c.junk ? 'tt-dropped-soft' : ''}" data-jump="${i}">${esc(c.keyword)} <b>${c.videos.length}</b></button>`).join('')}</div>
        ${junk.length ? `<div class="small muted" style="margin-top:10px">Từ khoá rác (quá nửa video lạc đề): ${junk.map((c) => `<span class="tag">${esc(c.keyword)} · ${c.offTopic} video lạc đề</span>`).join('')} <button type="button" class="btn sm ghost" data-showjunk>${showJunk ? 'Ẩn cột rác' : 'Hiện cột rác'}</button></div>` : ''}
        ${d.hashtags?.length ? `<div class="small muted" style="margin-top:10px">Hashtag hay đi chung: ${d.hashtags.map((h) => `<span class="tag">#${esc(h.tag)} · ${h.videos}</span>`).join('')}</div>` : ''}
      </div>
      <div class="row" style="padding:10px 16px;border-top:1px solid var(--line)">
        <div class="chips" data-view>${[['columns', 'Cột theo từ khoá'], ['table', 'Bảng gộp']].map(([v, l]) => `<button type="button" class="chip ${st.view === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
        <span class="spacer"></span><span class="small muted" data-selcount>${selected.size ? `Đã chọn ${selected.size} video` : 'Tick video để lấy comment'}</span>
        <button class="btn sm" data-cm ${selected.size ? '' : 'disabled'}>${icon('message')} Lấy comment → insight</button></div>
      <div data-body></div></div>`;
    const bodyEl = box.querySelector('[data-body]');
    bodyEl.innerHTML = st.view === 'table' ? tableView(cols, [...unique.values()], d.params.sort) : columnsView(cols);
  }

  const gainBadge = (v) => (v.gain != null ? `<span class="tt-gain ${v.gain > 0 ? 'up' : ''}" title="Tăng ${fmt(v.gainPerDay)} view/ngày">+${fmt(v.gain)} view</span>` : v.isNew ? '<span class="tt-gain new">Mới</span>' : '');
  const commentsHtml = (list) => (list?.length ? `<div class="tt-cm">${list.map((c, i) => `<div class="tt-cm-row" title="${esc(c.text)}"><b>${i + 1}.</b> <span class="tt-cm-likes">♥ ${fmt(c.likes)}</span> “${esc(c.text)}”</div>`).join('')}</div>` : '');

  /** What the on-topic rule left out of a column, so the user can check it. */
  const offTopicList = (c) => (c.offTopic ? `<details class="tt-off"><summary>Bỏ ${c.offTopic} video lạc đề</summary>${(c.offTopicVideos ?? []).map((v) => `<div class="small"><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.caption || '(không có caption)')}</a> <span class="muted">· ${fmt(v.plays)} view · ${esc(v.reason)}</span></div>`).join('')}</details>` : '');

  function columnsView(cols) {
    return `<div class="tt-cols">${cols.map((c, i) => `<div class="tt-col ${c.junk ? 'tt-col-junk' : ''}" data-col="${i}">
      <div class="tt-col-head"><div class="tt-col-title"><span class="tt-num">${i + 1}</span>${esc(c.keyword)}</div>
        <div class="small muted">${esc(c.intentLabel)} · ${c.videos.length} video${c.stats?.medianPlays != null ? ` · trung vị ${fmt(c.stats.medianPlays)} view` : ''}${c.stats?.fresh30 ? ` · ${c.stats.fresh30} mới 30 ngày` : ''}</div>
        ${c.junk ? '<div class="small" style="color:var(--warn)">Từ khoá rác: quá nửa video lạc đề</div>' : ''}
        ${c.error ? `<div class="small" style="color:var(--bad)">Lỗi: ${esc(c.error)}</div>` : ''}${offTopicList(c)}</div>
      ${c.videos.length ? c.videos.map((v) => `<div class="tt-row">
        <label class="tt-sel"><input type="checkbox" data-sel="${esc(v.id)}" ${selected.has(v.id) ? 'checked' : ''}></label>
        <div class="tt-thumb">${v.cover ? `<img loading="lazy" src="${esc(v.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : ''}<span>${v.rank}</span></div>
        <div class="tt-info"><a class="tt-cap" href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.caption || '(không có caption)')}</a>
          <div class="small"><b>${fmt(v.plays)}</b> view · ${ageText(v.ageDays, true)} · ${fmt(v.playsPerDay)}/ngày ${gainBadge(v)}</div>
          <div class="small muted">@${esc(v.author)} · ${fmt(v.likes)} tim · ${fmt(v.comments)} cmt · ${fmt(v.shares)} share</div>
          ${commentsHtml(v.topComments)}</div></div>`).join('') : `<div class="card-pad">${emptyState(c.error ? 'Không lấy được' : 'Không có video đạt bộ lọc')}</div>`}
    </div>`).join('')}</div>`;
  }

  function tableView(cols, list, sort) {
    const kwOf = new Map();
    for (const c of cols) for (const v of c.videos) kwOf.set(v.id, [...(kwOf.get(v.id) || []), c.keyword]);
    const sortKey = { score: (v) => v.score ?? 0, plays: (v) => v.plays, trending: (v) => v.playsPerDay ?? 0, fresh: (v) => -(v.ageDays ?? 1e9) }[sort] || ((v) => v.plays);
    const rows = [...list].sort((a, b) => sortKey(b) - sortKey(a));
    return `<div class="table-wrap"><table class="t tt-table"><thead><tr><th></th><th>Video</th><th>Từ khoá</th><th class="num">View</th><th class="num">Tim</th><th class="num">Cmt</th><th class="num">Share</th><th class="num">Tuổi</th><th class="num">View/ngày</th><th class="num">Tăng</th><th>Top comment</th></tr></thead><tbody>
      ${rows.map((v) => `<tr><td><input type="checkbox" data-sel="${esc(v.id)}" ${selected.has(v.id) ? 'checked' : ''}></td>
        <td style="max-width:300px"><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc((v.caption || '(không có caption)').slice(0, 120))}</a><div class="small muted">@${esc(v.author)}</div></td>
        <td class="small">${(kwOf.get(v.id) || []).map(esc).join('<br>')}</td><td class="num">${fmt(v.plays)}</td><td class="num">${fmt(v.likes)}</td><td class="num">${fmt(v.comments)}</td><td class="num">${fmt(v.shares)}</td>
        <td class="num">${ageText(v.ageDays, true)}</td><td class="num">${fmt(v.playsPerDay)}</td><td class="num">${gainBadge(v)}</td><td style="max-width:320px">${commentsHtml(v.topComments)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  shown.on(out, 'click', '[data-jump]', (e, el) => {
    if (st.view !== 'columns') return;
    out.querySelector(`[data-col="${el.dataset.jump}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  });
  shown.on(out, 'click', '[data-showjunk]', () => {
    showJunk = !showJunk;
    if (current) renderResult(current, out.querySelector('[data-partial]') || out);
  });
  shown.on(out, 'click', '[data-view] .chip', (e, el) => {
    st.view = el.dataset.v;
    persist('tt-topic-form', st);
    if (current) {
      const box = out.querySelector('[data-partial]') || out;
      renderResult(current, box);
    }
  });
  shown.on(out, 'change', '[data-sel]', (e, el) => {
    el.checked ? selected.add(el.dataset.sel) : selected.delete(el.dataset.sel);
    const btn = out.querySelector('[data-cm]');
    if (btn) btn.toggleAttribute('disabled', !selected.size);
    const count = out.querySelector('[data-selcount]');
    if (count) count.textContent = selected.size ? `Đã chọn ${selected.size} video` : 'Tick video để lấy comment';
  });
  shown.on(out, 'click', '[data-cm]', () => {
    if (!current || !selected.size) return;
    const urls = new Map(current.data.columns.flatMap((c) => c.videos.map((v) => [v.id, v.url])));
    window.__go('/tiktok/comments', { videos: [...selected].map((id) => urls.get(id)).filter(Boolean).join('\n') });
  });
  shown.on(out, 'click', '[data-rescan]', () => rescan(current));

  /** Same topic, same keywords and filters as that scan. @param {any} rec */
  function rescan(rec) {
    const p = rec.data.params;
    scan(rec.data.columns.map((c) => c.keyword), { topic: rec.data.topic, perKeyword: p.perKeyword, sort: p.sort, minPlays: p.minPlays, maxAgeDays: p.maxAgeDays, topComments: p.topComments, keepOffTopic: p.keepOffTopic ? 1 : 0 });
  }

  async function history() {
    const list = await records.list('tiktok_topic', 60);
    // One line per topic (latest scan), with how many times it was scanned.
    const byRef = new Map();
    for (const r of list) {
      const cur = byRef.get(r.ref);
      if (cur) cur.count++;
      else byRef.set(r.ref, { ...r, count: 1 });
    }
    const el = root.querySelector('[data-history]');
    el.innerHTML = `<div class="card-head"><h3>Chủ đề đã quét</h3><span class="sub">Quét lại để thấy video nào đang tăng view</span></div>${byRef.size ? [...byRef.values()].map((r) => `<div class="list-row"><a class="name" href="#/tiktok/topic?id=${r.id}">${esc(r.title)}</a><span class="when">${ago(r.created_at)}${r.count > 1 ? ` · ${r.count} lần quét` : ''}</span><button class="btn sm" data-re="${r.id}">${icon('refresh')} Quét lại</button><button class="icon-btn" data-del="${r.id}" title="Xoá lần quét này">${icon('trash')}</button></div>`).join('') : emptyState('Chưa quét chủ đề nào')}`;
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => (await records.remove(b.getAttribute('data-del')), history())));
    el.querySelectorAll('[data-re]').forEach((b) => b.addEventListener('click', async () => rescan(await records.get(b.getAttribute('data-re')))));
  }
  history();
  if (params.id) show(params.id);
  return () => shown.off();
}
