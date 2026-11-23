// "Insight theo từ khoá" screen, the same on TikTok and YouTube: a form (topic, scale, the platform's video filters,
// comment options), then the report (KPIs and five tabs on the shared insight workspace). What differs per platform
// comes in `pf` (web/views/tiktok/insight.js, web/views/insight.js).
import { records, tiktokInsight, jobs } from '../http/client.js';
import { historyList } from '../components/history-list.js';
import { esc, icon, runJob, progressCard, updateProgress, toast, store, persist, fmt, ago, emptyState, bindTips, setUrl, activeJob, watchJob, errorCallout } from '../lib.js';
import { commentGroups, bindCommentGroups, insightContext, insightOverview, topicExplorer, commentBrowser, videoGallery } from '../components/index.js';
import { scope } from '../dom.js';
import { COMMENT_COUNTS } from '../search-options.js';
import { exportMenu } from '../components/export-menu.js';

/**
 * @typedef {{
 *   kind: string, path: string, formKey: string, form: Record<string, any>, label: string,
 *   title: string, intro: string, placeholder: string, help: string, commentTip: string,
 *   notice?: (el: Element) => (() => void),
 *   filters: (st: Record<string, any>) => string,
 *   onFilter: (el: HTMLElement, st: Record<string, any>, ev: 'click'|'change') => boolean,
 *   checks: (st: Record<string, any>) => string,
 *   criteria: (p: Record<string, any>) => string,
 *   body: (st: Record<string, any>) => Record<string, any>,
 *   fromParams: (p: Record<string, any>) => Record<string, any>,
 *   countsLine: (d: any) => string,
 *   reportExtra?: (d: any) => string,
 * }} InsightCfg
 *   filters: HTML of section 3; onFilter: handle a click/change inside it (true = handled, st updated);
 *   checks: extra switches of section 4; body: the job input from the form; fromParams: form values from a report's input
 */

/** @param {Element} root @param {Record<string, string>} params @param {InsightCfg} pf the platform's parts */
export async function mountInsight(root, params, pf) {
  const FORM = pf.form;
  const st = store(pf.formKey, FORM);
  if (params.q) st.keywords = params.q; // sent from the dashboard's topic box
  // Presets only set the two scale controls; any value can still be changed by hand afterwards.
  const PRESETS = [
    ['quick', 'bolt', 'Nghiên cứu nhanh', 'Kiểm tra nhanh một chủ đề.', 5, 100],
    ['standard', 'bars', 'Nghiên cứu tiêu chuẩn', 'Đủ để lên kế hoạch content.', 10, 100],
    ['deep', 'target', 'Nghiên cứu chuyên sâu', 'Nhiều video, nhiều comment hơn.', 30, 300],
  ];
  const seg = (name, values, cur, cap = Infinity, capWhy = '') => `<div class="ix-seg" role="radiogroup" data-seg="${name}">${values.map((v) => `<button type="button" role="radio" aria-checked="${v === cur}" class="${v === cur ? 'on' : ''}" data-v="${v}" ${v > cap ? `disabled title="${capWhy}"` : ''}>${v.toLocaleString('vi-VN')}</button>`).join('')}</div>`;
  const head = (n, ic, title, sub) => `<div class="ix-head"><span class="ix-ic">${icon(ic)}</span><div><h3>${n}. ${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div></div>`;
  root.innerHTML = `
    <div class="page-head"><div><h1>${icon('message')} ${esc(pf.title)}</h1>
      <p>${pf.intro}</p></div></div>
    <div data-notice></div>
    <div class="ix-cfgbar card" data-cfgbar hidden></div>
    <div class="ix-form" data-form>
      <section class="card ix-card">${head(1, 'target', 'Chủ đề nghiên cứu', `Nhập chủ đề cụ thể bạn muốn nghiên cứu trên ${pf.label}.`)}
        <div class="tt-searchbox">${icon('search')}<input data-k="keywords" placeholder="${esc(pf.placeholder)}" value="${esc(st.keywords)}" autocomplete="off"><button type="button" class="icon-btn" data-clear title="Xoá">${icon('x')}</button></div>
        <div class="ix-help">${pf.help}</div></section>

      <section class="card ix-card">${head(2, 'layers', 'Quy mô nghiên cứu', 'Chọn sẵn một mức, hoặc tự chỉnh số video và số comment bên dưới.')}
        <div class="ix-presets" data-presets></div>
        <div class="ix-scale">
          <div><div class="ix-flabel">Số video ${pf.label} <span class="ix-tip" data-tip="Số video top (qua bộ lọc) được đọc comment.">${icon('info')}</span></div>${seg('top', [5, 10, 20, 30], st.top)}</div>
          <div><div class="ix-flabel">Comment mỗi video <span class="ix-tip" data-tip="${esc(pf.commentTip)}">${icon('info')}</span></div>${seg('commentsPerVideo', COMMENT_COUNTS, st.commentsPerVideo, 300, 'Đọc theo từ khoá lấy tối đa 300 comment mỗi video')}</div>
          <div class="ix-volume" data-volume></div>
        </div></section>

      <section class="card ix-card">${head(3, 'filter', 'Bộ lọc video', 'Chỉ đọc comment của video đạt các mức này.')}
        <div data-filters>${pf.filters(st)}</div></section>

      <section class="card ix-card">${head(4, 'message', 'Tùy chọn thu thập comment', '')}
        <label class="ix-check"><input type="checkbox" data-k="replies" ${st.replies ? 'checked' : ''}><span><b>Lấy cả replies (trả lời comment)</b><span class="ix-help">Đọc thêm tối đa 20 trả lời dưới mỗi comment. Không tính vào số comment tối đa ở trên.</span></span></label>
        ${pf.checks(st)}
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
  if (pf.notice) shown.add(pf.notice(root.querySelector('[data-notice]')));
  const kwInput = /** @type {HTMLInputElement} */ (form.querySelector('[data-k="keywords"]'));
  const save = () => persist(pf.formKey, st);
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
    const filters = pf.criteria(pf.body(st));
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
      const same = (await jobs.list()).filter((j) => j.kind === pf.kind && j.status === 'succeeded' && j.startedAt && j.endedAt
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
    if (t.closest('[data-filters]') && pf.onFilter(t, st, 'click')) {
      save();
      renderAll();
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
    if (t.closest('[data-filters]')) {
      if (!pf.onFilter(t, st, 'change')) return;
    } else if (t.matches('input[type=checkbox][data-k]')) st[t.dataset.k] = t.checked;
    else return;
    save();
    renderAll();
  });
  kwInput.addEventListener('input', renderSummary);
  kwInput.addEventListener('keydown', (e) => e.key === 'Enter' && run());
  // Not `run` itself: the click event would be taken for an earlier report's settings and reset the form.
  form.querySelector('[data-run]').addEventListener('click', () => run());
  renderAll();
  renderEta();

  // ---------- configuration: full form before a run, a one-line summary during and after ----------
  const FORM_KEYS = Object.keys(FORM);
  const pick = (p) => {
    const v = pf.fromParams(p ?? {});
    return Object.fromEntries(FORM_KEYS.filter((k) => k in v).map((k) => [k, v[k]]));
  };
  /** @type {{mode: 'full'|'summary', status: null|'running'|'done'|'failed', params: any, at?: number}} */
  const cfg = { mode: 'full', status: null, params: null };
  const cfgBar = /** @type {HTMLElement} */ (root.querySelector('[data-cfgbar]'));

  /** Put values (from a report) back into every control of the form. */
  function syncForm() {
    kwInput.value = st.keywords ?? '';
    form.querySelector('[data-filters]').innerHTML = pf.filters(st);
    for (const el of form.querySelectorAll('input[type=checkbox][data-k]')) /** @type {HTMLInputElement} */ (el).checked = Boolean(st[/** @type {HTMLElement} */ (el).dataset.k]);
    renderAll();
    renderEta();
  }

  function renderCfg() {
    /** @type {HTMLElement} */ (form).hidden = cfg.mode !== 'full';
    cfgBar.hidden = !cfg.status;
    if (!cfg.status) return;
    const p = cfg.params ?? {};
    const max = Number(p.top) * Number(p.commentsPerVideo);
    const filters = pf.criteria(p);
    const status = { running: '<span class="ix-status run">Đang chạy…</span>', done: `<span class="ix-status ok">${icon('check')} Xong${cfg.at ? ` · ${ago(cfg.at)}` : ''}</span>`, failed: '<span class="ix-status bad">Bị lỗi</span>' }[cfg.status];
    cfgBar.innerHTML = `<div class="ix-cfgline">${status}
        <span class="ix-chip accent">Chủ đề: ${esc(p.keywords ?? '')}</span><span class="ix-chip">${p.top} video</span><span class="ix-chip">${p.commentsPerVideo} comment/video</span>
        ${max ? `<span class="ix-chip">Tối đa ${max.toLocaleString('vi-VN')} comment</span>` : ''}${filters ? `<span class="ix-chip">${esc(filters)}</span>` : ''}${p.replies ? '<span class="ix-chip">có trả lời</span>' : ''}</div>
      <div class="ix-cfgact">
        ${cfg.mode === 'full' ? `<button type="button" class="btn sm" data-cfg="collapse">${icon('back')} Thu gọn cấu hình</button>` : `<button type="button" class="btn sm" data-cfg="edit">${icon('edit')} ${cfg.status === 'running' ? 'Xem cấu hình' : 'Chỉnh cấu hình'}</button>`}
        ${cfg.status !== 'running' ? `<button type="button" class="btn sm primary" data-cfg="again">${icon('refresh')} Chạy lại</button>` : ''}
      </div>`;
  }
  cfgBar.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-cfg]');
    if (!b) return;
    const act = b.getAttribute('data-cfg');
    if (act === 'collapse') cfg.mode = 'summary';
    else if (act === 'edit') {
      // The form takes the shown report's settings, ready to change and run.
      if (cfg.status !== 'running' && cfg.params) {
        Object.assign(st, pick(cfg.params));
        save();
        syncForm();
      }
      cfg.mode = 'full';
    } else if (act === 'again') return void run(cfg.params);
    renderCfg();
    if (cfg.mode === 'full') form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /** @param {any} [again] settings of an earlier report to run once more */
  async function run(again) {
    if (again) {
      Object.assign(st, pick(again));
      syncForm();
    }
    st.keywords = kwInput.value.trim();
    persist(pf.formKey, st);
    if (!st.keywords) {
      cfg.mode = 'full';
      renderCfg();
      kwInput.focus();
      return toast('Nhập chủ đề nghiên cứu', 'error');
    }
    const body = pf.body(st);
    await follow(body, (onProgress) => runJob(pf.kind, body, onProgress));
  }

  /**
   * Show a report being made, then the report. Also used when coming back to this screen while one is still running.
   * @param {Record<string, any>} p its settings @param {(onProgress: (p: any) => void) => Promise<any>} job
   */
  async function follow(p, job) {
    Object.assign(cfg, { mode: 'summary', status: 'running', params: { ...p }, at: undefined });
    renderCfg();
    tabOff();
    out.innerHTML = progressCard(`Đang lập báo cáo: ${p.keywords}`);
    root.closest('.main')?.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const res = await job((pr) => updateProgress(out, pr));
      history();
      await show(res.id);
    } catch (e) {
      cfg.status = 'failed';
      renderCfg();
      out.innerHTML = errorCallout(e);
    }
  }

  // ---------- the report: header, KPIs, five tabs ----------
  const TABS = [['overview', 'Tổng quan', 'grid'], ['topics', 'Chủ đề', 'layers'], ['comments', 'Comment', 'message'], ['questions', 'Câu hỏi', 'bulb'], ['videos', 'Video', 'play']];
  /** @type {import('../../components/insight-workspace.js').InsightCtx|null} */
  let ctx = null;
  let tabOffFn = null;
  const tabOff = () => (tabOffFn?.(), (tabOffFn = null));

  async function show(id) {
    const rec = await records.get(id);
    setUrl(pf.path, { id: rec.id }); // a reload or a copied link opens this result again
    const d = rec.data;
    const g = d.insight.groupCounts;
    Object.assign(cfg, { mode: 'summary', status: 'done', params: rec.params, at: rec.created_at });
    renderCfg();
    tabOff();
    ctx = null;
    const kpi = (ic, value, label, tip) => `<div class="tt-kpi"><span class="tt-kpi-ic">${icon(ic)}</span><div><div class="tt-kpi-v">${value}</div><div class="tt-kpi-l">${label} <span class="ix-tip" data-tip="${esc(tip)}">${icon('info')}</span></div></div></div>`;
    out.innerHTML = `
      <div class="card ix-rhead"><div><h2>${esc(d.keywords.join(', '))}</h2>
          <div class="muted small">Lập ${ago(rec.created_at)} · ${pf.countsLine(d)}</div></div>
        <div class="head-actions"><a class="btn sm primary" href="#/ci/runs?new=1&${pf.kind.startsWith('tiktok') ? 'tiktok' : 'youtube'}=${encodeURIComponent(d.videos.map((v) => v.id).filter(Boolean).join(','))}" title="Tạo New run từ comment của các video trong báo cáo này: nỗi đau, 5 Whys, cơ hội nội dung">${icon('pie')} Phân tích audience (AI)</a>${exportMenu([[records.exportUrl(id, 'md'), 'Markdown (.md)'], [records.exportUrl(id, 'csv'), 'Bảng comment (.csv)']], { sm: true })}</div></div>
      ${pf.reportExtra ? pf.reportExtra(d) : ''}
      <div class="tt-kpis ix-kpis">
        ${kpi('play', d.videos.length, 'Video đọc comment', 'Video top qua bộ lọc đã được đọc comment.')}
        ${kpi('message', fmt(d.counts.commentsRead), 'Comment đã đọc', 'Comment có chữ (bỏ comment chỉ có emoji), gồm cả trả lời nếu đã bật lấy trả lời.')}
        ${kpi('bulb', g.questions, 'Câu hỏi', 'Comment có dấu hỏi hoặc từ để hỏi. Không tính comment của người bán dịch vụ.')}
        ${kpi('heart', g.fears, 'Lo sợ', 'Comment nhắc tới nỗi sợ, rào cản: bị từ chối, chờ lâu, lừa đảo, tốn tiền…')}
        ${kpi('target', g.buying, d.insight.themes ? 'Cân nhắc mua' : 'Muốn mua', 'Comment hỏi giá, xin liên hệ, hoặc phân vân tự làm hay thuê dịch vụ.')}
      </div>
      <div class="card ix-work">
        <div class="tt-tabs ix-tabs" role="tablist">${TABS.map(([k, l, ic]) => `<button type="button" role="tab" class="tab" data-tab="${k}">${icon(ic)} ${l} <span class="ix-tcount" data-tcount="${k}"></span></button>`).join('')}</div>
        <div data-tabbody><div class="card-pad muted">Đang gom comment theo chủ đề…</div></div>
      </div>
      ${d.insight.themes ? '' : `<div class="card" style="margin-top:14px"><div class="card-head"><h3>Khách đang nói gì</h3><span class="sub">Báo cáo kiểu cũ: nhóm phàn nàn, muốn xem thêm…</span></div>${commentGroups(d.insight, { extraTabs: [['top', 'Comment nổi bật', d.insight.topByAttention]] })}</div>`}`;
    shown.off();
    shown.add(bindTips(form));
    shown.add(bindTips(out));
    shown.add(bindTips(cfgBar));
    if (!d.insight.themes) shown.add(bindCommentGroups(out));
    try {
      ctx = insightContext(rec, await tiktokInsight.topics(id));
    } catch (e) {
      out.querySelector('[data-tabbody]').innerHTML = `<div class="card-pad"><div class="callout">Không gom được chủ đề: ${esc(e.message)}</div></div>`;
      return;
    }
    const counts = { topics: ctx.topics.length, comments: fmt(ctx.all.length), questions: ctx.questions.length, videos: ctx.videos.size };
    for (const [k, n] of Object.entries(counts)) out.querySelector(`[data-tcount="${k}"]`).textContent = String(n);
    out.querySelector('.ix-tabs').addEventListener('click', (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-tab]');
      if (b) openTab(b.getAttribute('data-tab'));
    });
    openTab('overview');
  }

  /** @param {string} tab @param {Record<string, any>} [o] where to land in it (topic, video, search) */
  function openTab(tab, o = {}) {
    if (!ctx) return;
    tabOff();
    out.querySelectorAll('[data-tab]').forEach((b) => {
      const on = b.getAttribute('data-tab') === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    const body = /** @type {HTMLElement} */ (out.querySelector('[data-tabbody]'));
    const go = (t, x) => {
      openTab(t, x);
      out.querySelector('.ix-work')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (tab === 'overview') tabOffFn = insightOverview(body, ctx, { go });
    else if (tab === 'topics') tabOffFn = topicExplorer(body, ctx, { topic: o.topic });
    else if (tab === 'comments') {
      tabOffFn = commentBrowser(body, ctx, {
        base: ctx.all, initial: { video: o.video ?? '', q: o.q ?? '', open: o.open ?? null, topic: o.topic ?? '' },
        head: '<div class="ix-tabintro small muted">Mọi comment đã đọc. Lọc theo nhóm, từ khoá, video; bấm một comment để đọc đủ câu, video, creator và các trả lời. Không lưu tên người bình luận.</div>',
        placeholder: `Tìm trong ${ctx.all.length} comment…`,
      }).off;
    } else if (tab === 'questions') {
      tabOffFn = commentBrowser(body, ctx, {
        base: ctx.questions, topicChoices: ctx.topics.filter((t) => t.kind === 'question'), initial: { topic: o.topic ?? '' },
        head: '<div class="ix-tabintro small muted">Comment là câu hỏi (có dấu hỏi hoặc từ để hỏi), không tính người bán dịch vụ, gom theo nhóm của báo cáo. Bấm một câu hỏi để xem video và các trả lời đã đọc.</div>',
        placeholder: `Tìm trong ${ctx.questions.length} câu hỏi…`,
      }).off;
    } else if (tab === 'videos') tabOffFn = videoGallery(body, ctx, { video: o.video, onAllComments: (video) => go('comments', { video }) });
  }

  const history = historyList(root.querySelector('[data-history]'), { kind: pf.kind, path: pf.path, empty: 'Chưa có báo cáo nào', extra: (r) => pf.criteria(r.params ?? {}) });
  history();
  if (params.id) show(params.id);
  else if (!params.q) activeJob(pf.kind).then((live) => live && follow(live.params, (onProgress) => watchJob(live.id, onProgress)));
  return () => (shown.off(), tabOff());
}
