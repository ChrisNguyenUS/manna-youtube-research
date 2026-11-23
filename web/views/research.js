import { scope } from '../dom.js';
import { findHead, platformTabs, searchBar, section, fieldRows, checkRow, advanced, changedCount, estimate, regionSelect, bindShell } from '../components/find-shell.js';
import { findHistory, rerunRecord } from '../components/find-history.js';
import { resultHeader, kpiGrid, resultTabs, exportMenu, panel, closeMenusOnClick } from '../components/research-result.js';
import { records } from '../http/client.js';
import { esc, icon, chips, bindChips, runJob, progressCard, updateProgress, toast, store, persist, fmt, mult, ago, emptyState, thumb, ytVideo, dur, ageText, bindTips, setUrl, resumeJob, errorCallout } from '../lib.js';
import { mountVideoResults, hbars, patternList, phraseChips, oscoreBadge, outlierTip } from '../components/index.js';
import { DUR_CHIPS, UPLOAD_CHIPS, REGIONS, durToSeconds, durText, knownRegion } from '../search-options.js';
import { nextSteps, link } from '../components/next-steps.js';

const FORM = { topic: '', keywords: '', competitors: '', gl: '', direction: 'top', upload: 'year', dur: '4-20', minDur: '', maxDur: '', perKeyword: 40, readComments: true, commentTop: 5, commentMax: 50 };
const ADVANCED = ['keywords', 'competitors', 'readComments', 'commentTop', 'commentMax', 'perKeyword'];
const DIRS = [
  { v: 'top', t: 'Theo top', s: 'Video nhiều view nhất của ngách', upload: 'year' },
  { v: 'trend', t: 'Theo trend', s: 'Chủ đề mới nổi trong mấy ngày qua', upload: 'week' },
  { v: 'keyword', t: 'Theo từ khoá', s: 'Người xem đang gõ gì, cụm nào nhiều view', upload: 'year' },
];
const median = (xs) => {
  const a = xs.filter((x) => x != null).sort((x, y) => x - y);
  return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null;
};

/**
 * Where a report leads: the top outliers to Video Analysis, their comments to Collect Comments, the best small channel
 * to Channel Analysis. @param {any} d the report @param {Map<string, any>} byId its videos
 */
function researchNextSteps(d, byId) {
  const top = (d.topByViewSub ?? []).map((i) => byId.get(i)).filter(Boolean);
  if (!top.length) return '';
  const ids = (n) => top.slice(0, n).map((v) => v.id);
  const small = d.smallWinners?.[0];
  return nextSteps([
    { href: link('/video', { videos: ids(5).map((id) => `https://www.youtube.com/watch?v=${id}`).join('\n'), run: 1 }), icon: 'play', label: 'Video Analysis 5 video outlier', hint: 'Script, số liệu và comment của 5 video có outlier cao nhất', primary: true },
    { href: link('/comments', { videos: ids(10).join(',') }), icon: 'download', label: 'Collect comment 10 video outlier', hint: 'Mở Collect Comments với 10 video đã điền sẵn; bấm Thu thập để chạy' },
    ...(small?.id ? [{ href: link('/channel', { input: small.id }), icon: 'bars', label: `Channel Analysis ${small.title}`, hint: 'Kênh nhỏ đang thắng tốt nhất trong kết quả' }] : []),
  ]);
}

export async function mount(root, params) {
  const st = store('research-form', FORM);
  if (params.q) st.topic = params.q; // sent from the dashboard's topic box, or typed on the TikTok side
  if (knownRegion(params.gl, REGIONS)) st.gl = params.gl;
  const dirHint = () => DIRS.find((d) => d.v === st.direction)?.s ?? '';
  root.innerHTML = `
    <section data-setup>
      ${findHead('compass', 'Topic Research', 'Khám phá video đang tăng trưởng, kênh nổi bật và nội dung hiệu quả trên TikTok và YouTube.')}
      ${platformTabs('/research')}
      <div data-form>
        ${searchBar({ key: 'topic', value: st.topic, label: 'Chủ đề', placeholder: 'Bạn làm kênh về gì? VD: kể chuyện lịch sử Việt Nam', button: `<button class="btn primary lg" data-run>${icon('doc')} Lập báo cáo</button>` })}
        ${section('target', 'Phạm vi nghiên cứu', fieldRows([
          ['globe', 'Khu vực', regionSelect(st.gl, REGIONS)],
          ['calendar', 'Đăng trong', chips('upload', UPLOAD_CHIPS, st.upload)],
        ]))}
        ${section('sliders', 'Tiêu chí tìm kiếm', fieldRows([
          ['search', 'Tìm theo hướng', `${chips('direction', DIRS.map((d) => ({ v: d.v, label: d.t })), st.direction)}<span class="muted small" data-dirhint>${esc(dirHint())}</span>`],
          ['clock', 'Độ dài video', `${chips('dur', DUR_CHIPS, st.dur)}<span class="muted small">hoặc</span>
            <input class="input sm" style="width:84px" data-k="minDur" placeholder="Từ (phút)" aria-label="Từ (phút)" value="${esc(st.minDur)}"> – <input class="input sm" style="width:84px" data-k="maxDur" placeholder="Đến" aria-label="Đến (phút)" value="${esc(st.maxDur)}">`],
        ]))}
        ${advanced({
          summary: 'Từ khoá tìm, kênh đối thủ, đọc comment, video mỗi từ khoá',
          changed: changedCount(st, FORM, ADVANCED),
          rows: [
            ['key', 'Từ khoá tìm', `<input class="input sm rs-wide" data-k="keywords" placeholder="Để trống = dùng chủ đề. VD: lịch sử việt nam, chuyện xưa" value="${esc(st.keywords)}">
              <span class="muted small">Thị trường Việt thì dùng từ khoá tiếng Việt; từ khoá tiếng Anh trả về kênh nước ngoài triệu sub.</span>`],
            ['users', 'Kênh đối thủ', `<input class="input sm rs-wide" data-k="competitors" placeholder="@kenh1, @kenh2 (không bắt buộc)" value="${esc(st.competitors)}">`],
            ['message', 'Đọc comment', `${checkRow('readComments', 'Có', st.readComments)}
              <span class="muted small">của</span><input class="input sm" style="width:56px" data-k="commentTop" aria-label="Số video đọc comment" value="${esc(st.commentTop)}"><span class="muted small">video có outlier cao nhất ·</span>
              <input class="input sm" style="width:64px" data-k="commentMax" aria-label="Số comment mỗi video" value="${esc(st.commentMax)}"><span class="muted small">comment mỗi video</span>`],
            ['play', 'Video mỗi từ khoá', chips('perKeyword', [{ v: 30, label: '30' }, { v: 40, label: '40' }, { v: 80, label: '80' }, { v: 150, label: '150' }], st.perKeyword)],
          ],
        })}
        ${estimate('Miễn phí · dữ liệu công khai của YouTube · 2 từ khoá + 5 video comment ≈ 30–60 giây')}
      </div>
      <div data-out style="margin-top:14px"></div>
      <div class="card" data-history style="margin-top:18px"></div>
    </section>
    <section data-result hidden></section>`;

  const form = root.querySelector('[data-form]');
  const setupEl = /** @type {HTMLElement} */ (root.querySelector('[data-setup]'));
  const resultEl = /** @type {HTMLElement} */ (root.querySelector('[data-result]'));
  const topicInput = /** @type {HTMLInputElement} */ (form.querySelector('[data-k="topic"]'));
  bindShell(root, { carry: () => ({ q: topicInput.value.trim(), gl: st.gl }), changed: () => changedCount(st, FORM, ADVANCED) });
  const formTips = bindTips(form);
  bindChips(form, (name, v) => {
    st[name] = name === 'perKeyword' ? Number(v) : v;
    if (name === 'direction') {
      // Each direction has its own time window (trend = this week); the chip below follows.
      st.upload = DIRS.find((d) => d.v === st.direction)?.upload ?? st.upload;
      form.querySelectorAll('[data-chips="upload"] .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === st.upload));
      form.querySelector('[data-dirhint]').textContent = dirHint();
    }
    if (name === 'dur') (st.minDur = ''), (st.maxDur = ''), form.querySelectorAll('[data-k="minDur"],[data-k="maxDur"]').forEach((i) => (i.value = ''));
    persist('research-form', st);
  });
  form.querySelectorAll('[data-k]').forEach((el) =>
    el.addEventListener('change', () => {
      st[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.k === 'minDur' || el.dataset.k === 'maxDur') {
        st.dur = '';
        form.querySelectorAll('[data-chips="dur"] .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === ''));
      }
      persist('research-form', st);
    }),
  );
  topicInput.addEventListener('keydown', (e) => e.key === 'Enter' && run());
  form.querySelector('[data-run]').addEventListener('click', run);
  const out = root.querySelector('[data-out]');
  const shown = scope();
  let running = false; // one report at a time from this screen

  function mode(m) {
    setupEl.hidden = m !== 'setup';
    resultEl.hidden = m !== 'result';
    root.closest('.main')?.scrollTo({ top: 0 });
  }

  async function run() {
    form.querySelectorAll('input[data-k]:not([type="checkbox"])').forEach((el) => (st[el.dataset.k] = el.value.trim()));
    persist('research-form', st);
    if (!st.topic && !st.keywords) return toast('Nhập chủ đề', 'error');
    await start({ topic: st.topic, keywords: st.keywords, competitors: st.competitors, gl: st.gl, direction: st.direction, upload: st.upload, perKeyword: st.perKeyword, ...durToSeconds(st), comments: st.readComments ? { top: Number(st.commentTop) || 5, max: Number(st.commentMax) || 50 } : null });
  }

  /** @param {Record<string, any>} body */
  async function start(body) {
    if (running) return toast('Báo cáo trước vẫn đang chạy');
    running = true;
    const btn = /** @type {HTMLButtonElement} */ (form.querySelector('[data-run]'));
    btn.disabled = true;
    mode('setup');
    out.innerHTML = progressCard(`Đang nghiên cứu: ${body.topic || body.keywords}`);
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const res = await runJob('research', body, (p) => updateProgress(out, p));
      out.innerHTML = '';
      history();
      await show(res.id);
    } catch (e) {
      out.innerHTML = errorCallout(e);
    } finally {
      running = false;
      btn.disabled = false;
    }
  }

  /** Back to the form with a report's settings, to change them and run again. @param {Record<string, any>} p */
  function edit(p) {
    const minutes = (x) => (x ? String(Math.round(Number(x) / 60)) : '');
    const chip = DUR_CHIPS.find((c) => c.v && durText(p.minDur, p.maxDur) === c.label);
    Object.assign(st, {
      topic: p.topic ?? '', keywords: p.keywords ?? '', competitors: p.competitors ?? '', gl: p.gl ?? '', direction: p.direction ?? 'top', upload: p.upload ?? 'year',
      perKeyword: p.perKeyword ?? FORM.perKeyword, dur: chip ? chip.v : p.minDur || p.maxDur ? '' : '', minDur: chip ? '' : minutes(p.minDur), maxDur: chip ? '' : minutes(p.maxDur),
      readComments: Boolean(p.comments), commentTop: p.comments?.top ?? FORM.commentTop, commentMax: p.comments?.max ?? FORM.commentMax,
    });
    persist('research-form', st);
    window.__go('/research'); // the form is drawn again from these settings
  }

  async function show(id, tab = 'overview') {
    const rec = await records.get(id);
    setUrl('/research', { id: rec.id }); // a reload or a copied link opens this result again
    const d = rec.data;
    const p = rec.params || {};
    const byId = new Map(d.videos.map((v) => [v.id, v]));
    const s = d.summary;
    const region = REGIONS.find(([v]) => v === (p.gl ?? ''))?.[1] ?? p.gl;
    const tabs = [
      ['overview', 'Tổng quan'],
      ['videos', `Video (${d.videos.length})`],
      ['channels', `Kênh (${d.channels.length})`],
      ['patterns', 'Mẫu nội dung'],
      ['comments', d.comments ? `Comment (${d.comments.total})` : 'Comment'],
      ...(d.suggestions?.length ? [['keywords', `Người xem gõ (${d.suggestions.length})`]] : []),
    ];
    if (!tabs.some(([k]) => k === tab)) tab = 'overview';
    mode('result');
    resultEl.innerHTML = `
      ${resultHeader({
        platform: 'youtube',
        topic: d.topic,
        meta: [
          ['globe', region || ''],
          ['calendar', UPLOAD_CHIPS.find((c) => c.v === d.upload)?.label ?? ''],
          ['search', DIRS.find((x) => x.v === d.direction)?.t ?? ''],
          ['clock', durText(p.minDur, p.maxDur)],
          ['key', `${d.keywords.length} từ khoá`],
          ['check', `Hoàn thành ${ago(rec.created_at)}`],
        ],
        status: `<div class="rr-kw">${d.keywords.map((k) => `<span class="tag">${esc(k)}</span>`).join('')}</div>`,
        actions: `<button class="btn" data-rerun>${icon('refresh')} Quét lại</button><button class="btn" data-edit>${icon('edit')} Chỉnh sửa</button>
          ${exportMenu([[records.exportUrl(id, 'md'), 'Markdown (đưa cho Claude/AI viết báo cáo)'], [records.exportUrl(id, 'csv'), 'CSV (video)'], ...(d.comments ? [[records.exportUrl(id, 'csv', { what: 'comments' }), 'CSV (comment)']] : [])])}`,
      })}
      ${kpiGrid([
        { ic: 'play', value: s.count, label: 'Video tìm được', hint: `${s.channels} kênh` },
        { ic: 'eye', value: fmt(s.medianViews), label: 'View trung vị', hint: `${s.over100k} video trên 100 N`, tip: 'Một nửa số video có ít view hơn mức này. N = nghìn, Tr = triệu.' },
        { ic: 'trend', value: s.viewSubOver1, label: 'Outlier', hint: 'video có view ≥ sub kênh', tip: 'Outlier = view ÷ sub của kênh. ≥ 1× nghĩa là video được xem nhiều hơn số người đăng ký: thắng nhờ nội dung, không nhờ kênh to.' },
        { ic: 'users', value: d.smallWinners.length, label: 'Kênh nhỏ thắng', hint: '< 100 N sub, video outlier' },
        { ic: 'message', value: d.comments ? d.comments.total : '–', label: 'Comment đã đọc', hint: d.comments ? `${d.comments.insights.counts.questions} câu hỏi` : 'chưa đọc' },
      ])}
      ${researchNextSteps(d, byId)}
      <div class="card rr-body">${resultTabs(tabs, tab)}<div data-tabbody></div></div>`;
    shown.off();
    shown.add(bindTips(resultEl));
    shown.add(closeMenusOnClick(resultEl));
    resultEl.querySelectorAll('[data-rtab]').forEach((b) => b.addEventListener('click', () => go(/** @type {HTMLElement} */ (b).dataset.rtab)));
    resultEl.querySelector('[data-back]').addEventListener('click', () => (setUrl('/research'), mode('setup')));
    resultEl.querySelector('[data-rerun]').addEventListener('click', () => start(p));
    resultEl.querySelector('[data-edit]').addEventListener('click', () => edit(p));
    const body = resultEl.querySelector('[data-tabbody]');
    function go(t) {
      resultEl.querySelectorAll('[data-rtab]').forEach((x) => {
        const on = /** @type {HTMLElement} */ (x).dataset.rtab === t;
        x.classList.toggle('on', on);
        x.setAttribute('aria-selected', String(on));
      });
      renderTab(t);
    }

    /** Per search keyword, from the keyword each video was found by (videos found by several count for each). */
    function keywordTable() {
      const rows = d.keywords.map((k) => {
        const vs = d.videos.filter((v) => (v.queries ?? (v.query ? [v.query] : [])).includes(k));
        return { k, n: vs.length, med: median(vs.map((v) => v.views)), max: vs.length ? Math.max(...vs.map((v) => v.views ?? 0)) : null, over: vs.filter((v) => (v.viewSub ?? 0) >= 1).length };
      });
      if (!rows.some((r) => r.n)) return '';
      const best = Math.max(...rows.map((r) => r.med ?? 0));
      return panel('bars', 'So sánh từ khoá', `<div class="table-wrap"><table class="t rr-table"><thead><tr><th>Từ khoá</th><th class="r">Video</th><th class="r">View trung vị</th><th class="r">View cao nhất</th><th class="r" data-tip="Số video có view ≥ sub kênh">Outlier</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${r.med === best && r.n ? '<span class="rr-best" title="View trung vị cao nhất">★</span> ' : ''}<b>${esc(r.k)}</b></td>${r.n
          ? `<td class="r num">${r.n}</td><td class="r num">${fmt(r.med)}</td><td class="r num">${fmt(r.max)}</td><td class="r num">${r.over}</td>`
          : '<td colspan="4" class="muted small">Không tìm thấy video phù hợp với bộ lọc hiện tại.</td>'}</tr>`).join('')}</tbody></table></div>`);
    }

    function renderTab(t) {
      if (t === 'overview') {
        const top = d.topByViewSub.map((i) => byId.get(i)).filter(Boolean);
        const vpd = d.topByViewsPerDay.map((i) => byId.get(i)).filter(Boolean).slice(0, 10);
        body.innerHTML = `<div class="card-pad">${keywordTable()}<div class="row between"><div class="section-label">Video thắng: top theo điểm outlier (view ÷ sub)</div><button type="button" class="btn sm ghost" data-goall>Xem tất cả ${d.videos.length} video ${icon('chevron')}</button></div>
          <div class="vgrid" style="padding:0">${top.map((v, i) => miniCard(v, i)).join('')}</div>
          ${d.topByOutlierScore?.length ? `<div class="section-label" data-tip="${esc(outlierTip())}">Outlier: gấp nhiều lần video thường của chính kênh ⓘ</div>${outlierTable(d.topByOutlierScore.map((i) => byId.get(i)).filter(Boolean).slice(0, 10))}` : ''}
          <div class="section-label">Đang lên nhanh nhất (view/ngày)</div>${miniTable(vpd)}</div>`;
        body.querySelector('[data-goall]').addEventListener('click', () => go('videos'));
      } else if (t === 'patterns') {
        body.innerHTML = `<div class="card-pad"><p class="muted small" style="margin-top:0">Tiêu đề trung vị ${d.titleShape.medianChars} ký tự, ${d.titleShape.medianWords} từ. Hiệu quả = trung vị outlier của nhóm ÷ trung vị chung.</p>
          <div class="section-label">Mẫu tiêu đề</div><div class="table-wrap">${patternList(d.patterns)}</div><div class="section-label">Cụm từ hay xuất hiện (xếp theo outlier trung vị)</div>${phraseChips(d.phrases)}
          <div class="section-label">Độ dài video</div><div class="grid grid-2"><div><div class="small muted" style="margin-bottom:6px">Outlier trung vị theo độ dài</div>${hbars(d.durations, { value: 'medianViewSub', format: mult })}</div>
          <div><div class="small muted" style="margin-bottom:6px">View trung vị theo độ dài</div>${hbars(d.durations, { value: 'medianViews' })}</div></div></div>`;
      } else if (t === 'channels') {
        body.innerHTML = `<div class="card-pad"><p class="muted small" style="margin-top:0">Bước 1 trong quy trình: ưu tiên kênh <b>nhiều view nhưng ít sub</b>, có video mới đạt view tốt. Bấm Phân tích để xem cả kênh.</p>
          <div class="section-label" style="margin-top:0">Kênh nhỏ đang thắng (${d.smallWinners.length})</div>${d.smallWinners.length ? channelTable(d.smallWinners) : emptyState('Chưa có kênh nhỏ nào thắng', 'Không có kênh dưới 100 N sub có video outlier trong kết quả này.')}
          <div class="section-label">Tất cả kênh trong kết quả</div>${channelTable(d.channels)}</div>`;
      } else if (t === 'comments') {
        renderComments();
      } else if (t === 'keywords') {
        body.innerHTML = `<div class="card-pad"><p class="muted small" style="margin-top:0">Gợi ý tìm kiếm của YouTube cho chủ đề: thứ người xem đang gõ. Bấm để tìm video cho từ khoá đó.</p>
          <div class="chips">${d.suggestions.map((s) => `<a class="chip" href="#/videos?q=${encodeURIComponent(s.keyword)}&run=1">${esc(s.keyword)}</a>`).join('')}</div></div>`;
      } else if (t === 'videos') {
        body.innerHTML = '<div style="padding:14px" data-all></div>';
        mountVideoResults(body.querySelector('[data-all]'), d.videos, { key: 'vf-research', regions: [...new Set(d.videos.flatMap((v) => v.regions || []))], onComments: (ids) => window.__go('/comments', { videos: ids.join(',') }) });
      }
    }

    function renderComments() {
      const c = d.comments;
      if (!c) {
        body.innerHTML = `<div class="card-pad"><div class="empty"><b>Chưa đọc comment</b>Đọc comment của các video có outlier cao nhất để biết khán giả hỏi gì, than gì, muốn xem gì.</div>
          <div class="row" style="justify-content:center"><button class="btn primary" data-read>${icon('message')} Đọc comment top 5 video (50 comment mỗi video)</button></div></div>`;
        body.querySelector('[data-read]').addEventListener('click', async () => {
          body.innerHTML = `<div class="card-pad">${progressCard('Đang đọc comment')}</div>`;
          try {
            await runJob('research_comments', { recordId: id, top: 5, max: 50 }, (pr) => updateProgress(body, pr));
            show(id, 'comments');
          } catch (e) {
            body.innerHTML = errorCallout(e);
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
        <div class="section-label">Comment được like nhiều nhất</div>${quotes(i.top)}</div>`;
    }

    function miniCard(v, i) {
      return `<div class="vcard"><div class="img"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${thumb(v.id)}" alt=""></a>
        <span class="ov mult">${mult(v.viewSub)} sub</span><span class="ov rank">#${i + 1}</span><span class="ov dur">${dur(v.durationSec)}</span></div>
        <div class="body"><a class="t1" href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a>
        <div class="stats"><b>${fmt(v.views)}</b> view · ${fmt(v.viewsPerDay)}/ngày · ${ageText(v.age, v.ageExact)}</div>
        <div class="stats"><a href="#/channel?input=${encodeURIComponent(v.channelId)}">${esc(v.channelTitle)}</a> · ${fmt(v.channelSubs)} sub</div></div></div>`;
    }
    function miniTable(list) {
      return `<div class="table-wrap"><table class="t"><thead><tr><th class="thumb"></th><th>Video</th><th class="r">View</th><th class="r">View/ngày</th><th class="r">Outlier</th><th class="r">Đăng</th></tr></thead><tbody>
        ${list.map((v) => `<tr><td class="thumb"><img loading="lazy" src="${thumb(v.id)}" alt=""></td><td class="title-cell"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a><div class="meta">${esc(v.channelTitle)} · ${fmt(v.channelSubs)} sub</div></td>
          <td class="r num">${fmt(v.views)}</td><td class="r num"><b>${fmt(v.viewsPerDay)}</b></td><td class="r">${mult(v.viewSub)}</td><td class="r num">${ageText(v.age, v.ageExact)}</td></tr>`).join('')}</tbody></table></div>`;
    }
    function outlierTable(list) {
      return `<div class="table-wrap"><table class="t"><thead><tr><th class="thumb"></th><th>Video</th><th class="r">View</th><th class="r">View TB kênh</th><th class="r">Outlier</th><th class="r">Đăng</th></tr></thead><tbody>
        ${list.map((v) => `<tr><td class="thumb"><img loading="lazy" src="${thumb(v.id)}" alt=""></td><td class="title-cell"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a><div class="meta">${esc(v.channelTitle)} · ${fmt(v.channelSubs)} sub</div></td>
          <td class="r num">${fmt(v.views)}</td><td class="r num">${fmt(v.channelMedianViews)}</td><td class="r">${oscoreBadge(v)}</td><td class="r num">${ageText(v.age, v.ageExact)}</td></tr>`).join('')}</tbody></table></div>`;
    }
    function channelTable(list) {
      if (!list.length) return emptyState('Không có');
      return `<div class="table-wrap"><table class="t"><thead><tr><th>Kênh</th><th class="r">Sub</th><th class="r">Video trong kết quả</th><th class="r">Outlier cao nhất</th><th>Video tốt nhất</th><th></th></tr></thead><tbody>
        ${list.map((c) => `<tr><td><b>${esc(c.title)}</b><div class="muted small">${esc(c.handle || '')}</div></td><td class="r num">${fmt(c.subs)}</td><td class="r num">${c.count}</td>
          <td class="r"><span class="badge ${c.bestViewSub >= 1 ? 'good' : 'plain'}">${mult(c.bestViewSub)}</span></td>
          <td class="title-cell"><a href="${ytVideo(c.videos[0]?.id)}" target="_blank" rel="noopener">${esc(c.videos[0]?.title || '')}</a><div class="meta">${fmt(c.videos[0]?.views)} view</div></td>
          <td><a class="btn sm" href="#/channel?input=${encodeURIComponent(c.id)}">${icon('bars')} Phân tích</a></td></tr>`).join('')}</tbody></table></div>`;
    }
    renderTab(tab);
  }

  const history = findHistory(root.querySelector('[data-history]'), 'topic');
  history();
  const again = await rerunRecord(params, '/research');
  if (again) start(again.params);
  else if (params.id) show(params.id).catch((e) => toast(e.message, 'error'));
  else resumeJob('research', out, (j) => `Đang nghiên cứu: ${j.title}`, async (res) => (history(), await show(res.id)));
  return () => {
    shown.off();
    formTips();
  };
}
