// "Nghiên cứu chủ đề" on TikTok, two screens in one view:
// 1. Setup: the search-screen form (topic, region, time, views, advanced) → related keywords TikTok itself suggests
//    (picked as cards), the picked ones and the scan button on the side.
// 2. Result: KPIs, "So sánh theo từ khoá" (one column per keyword) and "Tất cả video" (grid or list).
//    Videos are ticked by hand on either tab; only the ticked ones go to the existing comment scraper.
import { records, tiktokTopic } from '../../http/client.js';
import { esc, icon, chips, bindChips, runJob, progressCard, updateProgress, toast, store, persist, fmt, ago, emptyState, ageText, bindTips, activeJob, watchJob, isSaved, toggleSave, saveMany, errorCallout } from '../../lib.js';
import { savedTikTokVideo, savedKeyword } from '../../saved-items.js';
import { scope } from '../../dom.js';
import { tiktokLoginNotice } from '../../components/tiktok-login.js';
import { findHead, platformTabs, searchBar, section, fieldRows, checkRow, advanced, changedCount, estimate, regionSelect, bindShell } from '../../components/find-shell.js';
import { resultHeader, kpiGrid, resultTabs, exportMenu, panel, closeMenusOnClick } from '../../components/research-result.js';
import { findHistory, rerunRecord } from '../../components/find-history.js';
import { TIKTOK_REGIONS, TIKTOK_COUNTRY, TIKTOK_AGE_CHIPS, TIKTOK_PLAYS_CHIPS, knownRegion } from '../../search-options.js';

const FORM = {
  topic: '', gl: '', minPlays: 100000, maxAgeDays: 0, sort: 'score', maxKeywords: 10, perKeyword: 10, topComments: 3, keepOffTopic: 0, keepPrevious: 1,
  // How the result is shown (never sent to the server).
  tab: 'overview', layout: 'grid', show: 10, vsort: 'rank', cmShow: 1, colw: 320,
};
const SORT_LABELS = { score: 'Tổng hợp', plays: 'Lượt xem', trending: 'View/ngày', fresh: 'Mới nhất' };
const INTENT_ORDER = ['time', 'cost', 'howto', 'interview', 'condition', 'experience', 'related'];
const INTENT_LABELS = { time: 'Thời gian', cost: 'Chi phí', howto: 'Cách làm, giấy tờ', interview: 'Phỏng vấn', condition: 'Điều kiện', experience: 'Kinh nghiệm', related: 'Liên quan' };
const SOURCE_LABELS = { topic: 'Chủ đề gốc', related: 'Người khác cũng tìm', suggest: 'Gợi ý khi gõ', manual: 'Bạn thêm' };
// Re-sorting the videos already on screen (the scan itself is not re-run). [label, key for the merged list, key inside a column]
const VIEW_SORTS = {
  rank: ['Thứ hạng lúc quét', (v) => v.score ?? 0, (v) => -(v.rank ?? 999)],
  plays: ['Lượt xem cao nhất', (v) => v.plays],
  trending: ['View/ngày cao nhất', (v) => v.playsPerDay ?? 0],
  fresh: ['Mới đăng nhất', (v) => -(v.ageDays ?? 1e9)],
  gain: ['Tăng view từ lần trước', (v) => v.gain ?? -1],
  likes: ['Nhiều tim nhất', (v) => v.likes],
  comments: ['Nhiều bình luận nhất', (v) => v.comments],
};
// Scan settings shown as chip rows: [label, options [value, label]]. Defaults are FORM's.
const SORT_CHIPS = Object.entries(SORT_LABELS).map(([v, label]) => ({ v, label }));
const PER_KEYWORD_CHIPS = [5, 10, 20, 30].map((v) => ({ v, label: String(v) }));
const MAX_KEYWORDS_CHIPS = [5, 10, 15, 20].map((v) => ({ v, label: `${v} từ khoá đầu` }));
const ADVANCED = ['maxKeywords'];
const OFF_TOPIC_TIP = 'Đúng chủ đề = caption/hashtag có từ khoá (bỏ chữ “mỹ”, năm), hoặc có ≥ 2 hashtag của chủ đề; video về nước khác bị bỏ. Bỏ tích để giữ hết.';
const PREVIOUS_TIP = 'Mỗi lần tìm, TikTok trả về một bộ video hơi khác. Khi quét lại chủ đề cũ, video lần trước có mà lần này TikTok không trả về vẫn được giữ (nhãn “Lần trước”, view tính đến lần quét đó), tối đa 30 ngày.';
const COUNTRY_REGION = Object.fromEntries(Object.entries(TIKTOK_COUNTRY).map(([gl, c]) => [c, gl]));
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
const setHash = (h) => window.history.replaceState(null, '', h);

/**
 * Ticked videos: video id → the keyword columns it was ticked in. A video found under several keywords is one
 * video for the comment scraper, but its box is ticked only in the column where you ticked it.
 * Survives a trip to the comments screen and back (per result, until "Bỏ chọn").
 * @typedef {Map<string, Set<number>>} Selection
 */
const selKey = (id) => `ytr:tt-topic-sel:v2:${id}`;
/** @returns {Selection} */
const loadSel = (id) => {
  try {
    return new Map(JSON.parse(sessionStorage.getItem(selKey(id)) || '[]').map(([v, cols]) => [v, new Set(cols)]));
  } catch {
    return new Map();
  }
};
/** @param {Selection} sel */
const saveSel = (id, sel) => {
  try {
    sessionStorage.setItem(selKey(id), JSON.stringify([...sel].map(([v, cols]) => [v, [...cols]])));
  } catch {
    /* private mode */
  }
};

export async function mount(root, params) {
  const st = store('tt-topic-form', FORM);
  /** @type {{keyword: string, intent: string, selected: boolean, dropped?: string, sources: string[]}[]} */
  let kws = [];
  let kwTopic = '';
  let intentFilter = 'all';
  /** @type {any} */
  let current = null; // record on screen
  let showJunk = false; // columns of keywords that mostly brought unrelated videos stay hidden until asked
  /** @type {Selection} */
  let selected = new Map();
  let exploreKw = 'all';
  let exploreQ = '';
  /** @type {string|null} */
  let openId = null; // video shown in the side panel
  const shown = scope();

  if (knownRegion(params.gl, TIKTOK_REGIONS)) st.gl = params.gl; // carried over from the YouTube side
  root.innerHTML = `
    <section data-setup>
      ${findHead('compass', 'Nghiên cứu chủ đề', 'Khám phá video đang tăng trưởng, kênh nổi bật và nội dung hiệu quả trên TikTok và YouTube.')}
      ${platformTabs('/tiktok/topic')}
      <div data-ttlogin></div>
      <div data-form>
        ${searchBar({ key: 'topic', value: st.topic, label: 'Chủ đề', placeholder: 'Chủ đề. VD: di trú mỹ, bảo lãnh vợ chồng', button: `<button class="btn primary lg" data-find>${icon('layers')} Tìm từ khoá</button>` })}
        ${section('target', 'Phạm vi nghiên cứu', fieldRows([
          ['globe', 'Khu vực', `${regionSelect(st.gl, TIKTOK_REGIONS)}<span class="rs-tip" tabindex="0" data-tip="TikTok luôn tìm như người xem ở Việt Nam. Khu vực ở đây là nước mà video phải nói tới: video về thủ tục nước khác bị bỏ." aria-label="Giải thích khu vực">${icon('info')}</span><span class="muted small">Video nói về nước này</span>`],
          ['calendar', 'Đăng trong', chips('maxAgeDays', TIKTOK_AGE_CHIPS, st.maxAgeDays || 0)],
          ['eye', 'View tối thiểu', chips('minPlays', TIKTOK_PLAYS_CHIPS, st.minPlays || 0)],
        ]))}
        ${section('sliders', 'Tiêu chí tìm kiếm', fieldRows([
          ['sort', 'Xếp hạng theo', chips('sort', SORT_CHIPS, st.sort)],
          ['play', 'Video mỗi từ khoá', chips('perKeyword', PER_KEYWORD_CHIPS, st.perKeyword)],
        ]), [
          checkRow('topComments', 'Lấy top comment', Boolean(st.topComments), '3 comment nhiều tym nhất của mỗi video. Bỏ tích để quét nhanh hơn.'),
          checkRow('filterOffTopic', 'Lọc video lạc đề', !st.keepOffTopic, OFF_TOPIC_TIP),
          checkRow('keepPrevious', 'Giữ video lần trước', Boolean(st.keepPrevious), PREVIOUS_TIP),
        ].join(''))}
        ${advanced({ summary: 'Tự chọn sẵn bao nhiêu từ khoá gợi ý', changed: changedCount(st, FORM, ADVANCED), rows: [['check', 'Tự chọn sẵn', chips('maxKeywords', MAX_KEYWORDS_CHIPS, st.maxKeywords)]] })}
        <div data-estimate></div>
      </div>
      <div class="tt-setup" data-kwarea>
        <div class="card" data-kwpanel></div>
        <aside class="card tt-side" data-side></aside>
      </div>
      <div class="card tt-history" data-history style="margin-top:18px"></div>
    </section>
    <section data-result hidden><div data-prog></div><div data-res></div></section>`;

  const setupEl = /** @type {HTMLElement} */ (root.querySelector('[data-setup]'));
  const resultEl = /** @type {HTMLElement} */ (root.querySelector('[data-result]'));
  const kwPanel = root.querySelector('[data-kwpanel]');
  const side = /** @type {HTMLElement} */ (root.querySelector('[data-side]'));
  const kwArea = /** @type {HTMLElement} */ (root.querySelector('[data-kwarea]'));
  const resBox = root.querySelector('[data-res]');
  const progBox = root.querySelector('[data-prog]');
  const topicInput = /** @type {HTMLInputElement} */ (root.querySelector('[data-k="topic"]'));
  const form = /** @type {HTMLElement} */ (root.querySelector('[data-form]'));
  const historyList = findHistory(root.querySelector('[data-history]'), 'topic');
  shown.add(bindTips(form));
  const syncChanged = bindShell(root, { carry: () => ({ q: topicInput.value.trim(), gl: st.gl }), changed: () => changedCount(st, FORM, ADVANCED) });
  const renderEstimate = () => {
    form.querySelector('[data-estimate]').innerHTML = estimate(`Miễn phí · khoảng ${st.topComments ? 25 : 12} giây mỗi từ khoá${st.topComments ? ' (có lấy comment; không lấy thì khoảng 12 giây)' : ''}`);
  };
  renderEstimate();
  // Switches: shown the way people think of them ("lọc" = drop off-topic videos), stored as before.
  form.querySelector('[data-k="topComments"]').addEventListener('change', (e) => ((st.topComments = e.target.checked ? 3 : 0), persist('tt-topic-form', st), renderEstimate(), renderSide()));
  form.querySelector('[data-k="filterOffTopic"]').addEventListener('change', (e) => ((st.keepOffTopic = e.target.checked ? 0 : 1), persist('tt-topic-form', st)));
  form.querySelector('[data-k="keepPrevious"]').addEventListener('change', (e) => ((st.keepPrevious = e.target.checked ? 1 : 0), persist('tt-topic-form', st)));
  form.querySelector('[data-k="gl"]').addEventListener('change', (e) => ((st.gl = e.target.value), persist('tt-topic-form', st)));
  bindChips(form, (k, v) => {
    st[k] = k === 'sort' ? v : Number(v) || 0;
    persist('tt-topic-form', st);
    if (k === 'maxKeywords' && kws.length) return preselect();
  });
  /** The form shows `st` again (after "Chỉnh sửa từ khoá" loaded an old scan's settings). */
  const syncForm = () => {
    form.querySelectorAll('[data-chips]').forEach((g) => g.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.v === String(st[g.dataset.chips] ?? ''))));
    /** @type {HTMLSelectElement} */ (form.querySelector('[data-k="gl"]')).value = st.gl;
    /** @type {HTMLInputElement} */ (form.querySelector('[data-k="topComments"]')).checked = Boolean(st.topComments);
    /** @type {HTMLInputElement} */ (form.querySelector('[data-k="filterOffTopic"]')).checked = !st.keepOffTopic;
    /** @type {HTMLInputElement} */ (form.querySelector('[data-k="keepPrevious"]')).checked = Boolean(st.keepPrevious);
    renderEstimate();
    syncChanged();
  };
  shown.add(tiktokLoginNotice(root.querySelector('[data-ttlogin]')));

  function mode(m) {
    setupEl.hidden = m !== 'setup';
    resultEl.hidden = m !== 'result';
    // The result uses the whole window width: more keyword columns side by side.
    root.classList.toggle('tt-wide', m === 'result');
    if (m !== 'result') closeDrawer();
    root.closest('.main')?.scrollTo({ top: 0 });
  }

  // ---------------- setup ----------------
  root.querySelector('[data-find]').addEventListener('click', findKeywords);
  topicInput.addEventListener('keydown', (e) => e.key === 'Enter' && findKeywords());

  async function findKeywords() {
    st.topic = topicInput.value.trim();
    persist('tt-topic-form', st);
    if (!st.topic) return toast('Nhập chủ đề', 'error');
    kwArea.classList.remove('tt-setup-empty');
    const btn = /** @type {HTMLButtonElement} */ (form.querySelector('[data-find]'));
    btn.disabled = true;
    kwPanel.innerHTML = `<div class="card-head"><h3>${icon('layers')} Từ khoá gợi ý</h3></div><div class="card-pad"><div class="callout info">Đang hỏi TikTok các từ khoá liên quan tới “${esc(st.topic)}”… (khoảng 10 giây)</div><div class="tt-kwgrid">${'<div class="skel tt-kwskel"></div>'.repeat(6)}</div></div>`;
    try {
      const r = await tiktokTopic.keywords(st.topic, st.maxKeywords);
      // Same topic again (e.g. after "Chỉnh sửa từ khoá"): keep what was picked, including your own keywords.
      const before = fold(kwTopic) === fold(st.topic) ? kws : [];
      const picked = new Set(before.filter((k) => k.selected).map((k) => fold(k.keyword)));
      kws = r.keywords.map((k) => (before.length ? { ...k, selected: !k.dropped && picked.has(fold(k.keyword)) } : k));
      for (const k of before) if (!kws.some((x) => fold(x.keyword) === fold(k.keyword))) kws.push(k);
      kwTopic = st.topic;
      intentFilter = 'all';
      renderKeywords();
    } catch (e) {
      kwPanel.innerHTML = `<div class="card-head"><h3>${icon('layers')} Từ khoá gợi ý</h3></div><div class="card-pad">${errorCallout(e)}</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  function preselect() {
    let n = 0;
    for (const k of kws) k.selected = !k.dropped && n++ < st.maxKeywords;
    renderKeywords();
  }

  function renderKeywords() {
    // No suggestions yet: one compact line saying how to get them, not two empty panels.
    kwArea.classList.toggle('tt-setup-empty', !kws.length);
    side.hidden = !kws.length;
    if (!kws.length) {
      kwPanel.innerHTML = `<div class="tt-kwhint">${icon('layers')}<div><b>Từ khoá gợi ý</b><span>Gõ chủ đề rồi bấm “Tìm từ khoá”: app lấy các từ khoá TikTok gợi ý khi gõ và mục “Người khác cũng tìm kiếm”, nhóm theo ý định, rồi bạn chọn từ khoá để quét.</span></div></div>`;
      return renderSide();
    }
    const live = kws.filter((k) => !k.dropped);
    const dropped = kws.filter((k) => k.dropped);
    const groups = INTENT_ORDER.map((i) => [i, live.filter((k) => k.intent === i).length]).filter(([, n]) => n);
    const list = live.filter((k) => intentFilter === 'all' || k.intent === intentFilter);
    kwPanel.innerHTML = `
      <div class="card-head"><h3>${icon('layers')} Từ khoá gợi ý (${live.length})</h3>
        <div class="row"><button class="btn sm" data-kwall>${icon('check')} Chọn tất cả</button><button class="btn sm" data-kwnone>Bỏ chọn</button></div></div>
      <div class="card-pad">
        <div class="chips"><button type="button" class="chip ${intentFilter === 'all' ? 'on' : ''}" data-intent="all">Tất cả (${live.length})</button>${groups.map(([i, n]) => `<button type="button" class="chip ${intentFilter === i ? 'on' : ''}" data-intent="${i}">${esc(INTENT_LABELS[i])} (${n})</button>`).join('')}</div>
        <div class="tt-kwgrid">${list.map((k) => `<label class="tt-kwcard ${k.selected ? 'on' : ''}"><input type="checkbox" data-kwi="${kws.indexOf(k)}" ${k.selected ? 'checked' : ''}>
          <span><b>${esc(k.keyword)}</b><span class="small muted">${esc(INTENT_LABELS[k.intent] || '')} · ${esc(k.sources.map((s) => SOURCE_LABELS[s] || s).join(', '))}</span></span></label>`).join('')}</div>
        ${dropped.length ? `<details class="tt-off" style="margin-top:12px"><summary>Đã loại ${dropped.length} từ khoá (nước khác, trùng nghĩa…)</summary><div class="chips" style="padding-top:8px">${dropped.map((k) => `<span class="chip tt-dropped" title="${esc(k.dropped)}">${esc(k.keyword)} · ${esc(k.dropped)}</span>`).join('')}</div></details>` : ''}
        <div class="tt-addkw"><div class="tt-addkw-title">${icon('plus')} Thêm từ khoá của bạn</div>
          <div class="row"><input class="input" data-add placeholder="Ví dụ: visa EB3, phỏng vấn EB3" style="flex:1;min-width:200px"><button class="btn" data-add-btn>${icon('plus')} Thêm</button></div></div>
      </div>`;
    renderSide();
  }

  function renderSide() {
    const picked = kws.filter((k) => k.selected);
    const n = picked.length;
    const minutes = Math.max(1, Math.round((n * (st.topComments ? 25 : 12)) / 60));
    side.innerHTML = `
      <div class="card-head"><h3>${icon('layers')} Từ khoá đã chọn (${n})</h3>${n ? `<button class="btn sm ghost danger" data-kwnone>${icon('trash')} Xoá tất cả</button>` : ''}</div>
      <div class="card-pad">
        <div class="tt-selkws">${n ? picked.map((k) => `<span class="tt-selkw">${esc(k.keyword)}<button type="button" data-unpick="${kws.indexOf(k)}" title="Bỏ từ khoá này">${icon('x')}</button></span>`).join('') : '<span class="small muted">Chưa chọn từ khoá nào.</span>'}</div>
        ${n ? `<button type="button" class="btn sm ghost" data-kwsave style="margin-top:8px" title="Giữ các từ khoá này trong Đã lưu">${icon('bookmark')} Lưu ${n} từ khoá</button>` : ''}
        <button class="btn primary lg tt-scan" data-scan ${n ? '' : 'disabled'}>${icon('play')} Quét ${n} từ khoá</button>
        <div class="small muted" style="text-align:center;margin-top:6px">${n ? `Dự kiến khoảng ${minutes} phút` : 'Chọn ít nhất một từ khoá'}</div>
      </div>`;
  }

  shown.add(bindTips(side));
  shown.on(setupEl, 'click', '[data-intent]', (e, el) => ((intentFilter = el.dataset.intent), renderKeywords()));
  shown.on(setupEl, 'change', '[data-kwi]', (e, el) => {
    const k = kws[Number(el.dataset.kwi)];
    if (k) k.selected = el.checked;
    renderKeywords();
  });
  shown.on(setupEl, 'click', '[data-kwsave]', () => saveMany('keyword', kws.filter((k) => k.selected).map((k) => savedKeyword(k.keyword, 'tiktok', kwTopic || topicInput.value.trim())), 'từ khoá'));
  shown.on(setupEl, 'click', '[data-unpick]', (e, el) => {
    const k = kws[Number(el.dataset.unpick)];
    if (k) k.selected = false;
    renderKeywords();
  });
  shown.on(setupEl, 'click', '[data-kwall]', () => {
    for (const k of kws) if (!k.dropped && (intentFilter === 'all' || k.intent === intentFilter)) k.selected = true;
    renderKeywords();
  });
  shown.on(setupEl, 'click', '[data-kwnone]', () => {
    for (const k of kws) k.selected = false;
    renderKeywords();
  });
  shown.on(setupEl, 'click', '[data-add-btn]', addKeyword);
  shown.on(setupEl, 'keydown', '[data-add]', (e) => e.key === 'Enter' && addKeyword());
  shown.on(setupEl, 'click', '[data-scan]', () => scan(kws.filter((k) => k.selected).map((k) => k.keyword)));

  function addKeyword() {
    const input = /** @type {HTMLInputElement} */ (kwPanel.querySelector('[data-add]'));
    const word = input?.value.trim();
    if (!word) return;
    const same = kws.find((k) => fold(k.keyword) === fold(word));
    if (same) same.selected = true;
    else kws.push({ keyword: word, intent: 'related', selected: true, sources: ['manual'] });
    if (!kwTopic) kwTopic = topicInput.value.trim();
    renderKeywords();
    /** @type {HTMLInputElement} */ (kwPanel.querySelector('[data-add]'))?.focus();
  }

  // ---------------- scan ----------------
  /** @param {string[]} keywords @param {Record<string, any>} [o] */
  async function scan(keywords, o = st) {
    const topic = o.topic || topicInput.value.trim() || st.topic;
    if (!topic) return toast('Nhập chủ đề', 'error');
    if (!keywords.length) return toast('Chọn ít nhất một từ khoá', 'error');
    if (scanning) return toast('Lần quét trước vẫn đang chạy');
    st.topic = topic;
    persist('tt-topic-form', st);
    const country = 'country' in o ? o.country : TIKTOK_COUNTRY[o.gl];
    const body = { topic, keywords: keywords.join('\n'), ...(country ? { country } : {}), perKeyword: o.perKeyword, sort: o.sort, minPlays: o.minPlays || 0, maxAgeDays: o.maxAgeDays || 0, topComments: o.topComments ? 3 : 0, keepOffTopic: Boolean(o.keepOffTopic), keepPrevious: o.keepPrevious !== 0 && o.keepPrevious !== false };
    await follow(topic, (onProgress) => runJob('tiktok_topic', body, onProgress));
  }

  let scanning = false; // one scan at a time from this screen
  /**
   * Show a scan in progress (each keyword's column as soon as it is saved), then the result.
   * Also used when coming back to this screen while a scan is still running.
   * @param {string} topic @param {(onProgress: (p: any) => void) => Promise<any>} job
   */
  async function follow(topic, job) {
    scanning = true;
    mode('result');
    resBox.innerHTML = '';
    current = null;
    progBox.innerHTML = progressCard(`Đang quét chủ đề: ${topic}`);
    let lastDone = -1;
    try {
      const res = await job(async (p) => {
        updateProgress(progBox, p);
        // Each finished keyword is saved right away: show its column without waiting for the rest.
        if (p?.recordId && p.done !== lastDone && p.done > 0) {
          lastDone = p.done;
          const rec = await records.get(p.recordId).catch(() => null);
          if (rec) renderResult(rec);
        }
      });
      progBox.innerHTML = '';
      await show(res.id);
      historyList();
    } catch (e) {
      const prog = progBox.querySelector('[data-progress]');
      if (prog) prog.outerHTML = errorCallout(e);
    } finally {
      scanning = false;
    }
  }

  async function show(id) {
    const rec = await records.get(id);
    // So "Back" from the comments screen lands on this result again.
    setHash(`#/tiktok/topic?id=${rec.id}`);
    mode('result');
    renderResult(rec);
  }

  // ---------------- result ----------------
  const visibleCols = () => (current ? current.data.columns.filter((c) => showJunk || !c.junk) : []);
  const uniqueVideos = (cols) => {
    const m = new Map();
    for (const c of cols) for (const v of c.videos) {
      const cur = m.get(v.id);
      if (cur) cur.keywords.push(c.keyword);
      else m.set(v.id, { ...v, keywords: [c.keyword] });
    }
    return [...m.values()];
  };
  const viewSort = () => (VIEW_SORTS[st.vsort] && (st.vsort !== 'gain' || current?.data.previous) ? st.vsort : 'rank');
  const sortVideos = (list, key, merged = false) => {
    const [, primary, inColumn] = VIEW_SORTS[key] || VIEW_SORTS.rank;
    const f = !merged && inColumn ? inColumn : primary;
    return [...list].sort((a, b) => f(b) - f(a));
  };

  /** Tabs the scan has data for. */
  const resultTabsFor = (nKw, nVideos, nCreators, hasComments) => [
    ['overview', 'Tổng quan'],
    ['videos', `Video (${nVideos})`],
    ['keywords', `Từ khoá (${nKw})`],
    ['creators', `Kênh (${nCreators})`],
    ...(hasComments ? [['comments', 'Bình luận']] : []),
  ];

  /** @param {any} rec */
  function renderResult(rec) {
    if (current?.id !== rec.id) {
      selected = loadSel(rec.id);
      exploreKw = 'all';
      exploreQ = '';
    }
    current = rec;
    const d = rec.data;
    const done = d.status === 'done';
    const s = d.summary;
    const junk = d.columns.filter((c) => c.junk);
    const cols = visibleCols();
    const all = uniqueVideos(cols);
    const offTopic = d.columns.reduce((a, c) => a + (c.offTopic ?? 0), 0);
    const sum = (k) => all.reduce((a, v) => a + (v[k] || 0), 0);
    const p = d.params;
    const region = TIKTOK_REGIONS.find(([v]) => v === (COUNTRY_REGION[p.country] ?? ''))?.[1];
    const when = done ? `Hoàn thành ${ago(Date.parse(d.scannedAt))}` : d.status === 'failed' ? 'Lần quét bị dừng giữa chừng' : 'Đang quét…';
    const fresh30 = all.filter((v) => v.ageDays != null && v.ageDays <= 30).length;
    const hasComments = all.some((v) => v.topComments?.length);
    const tabs = resultTabsFor(cols.length, all.length, new Set(all.map((v) => v.author)).size, hasComments);
    if (!tabs.some(([k]) => k === st.tab)) st.tab = 'overview';
    resBox.innerHTML = `
      ${resultHeader({
        platform: 'tiktok',
        topic: d.topic,
        meta: [
          ['globe', region ? `Video về ${region}` : 'Nước: tự đoán từ chủ đề'],
          ['calendar', p.maxAgeDays ? (p.maxAgeDays === 365 ? '1 năm' : `${p.maxAgeDays} ngày`) : 'Mọi lúc'],
          ['eye', p.minPlays ? `≥ ${fmt(p.minPlays)} view` : 'Không lọc view'],
          ['sort', `Xếp theo ${(SORT_LABELS[p.sort] || p.sort).toLowerCase()}`],
          ['layers', `${d.columns.length} từ khoá`],
          ['check', when],
        ],
        status: `${p.keepOffTopic ? '<div class="small muted">Giữ cả video lạc đề</div>' : ''}${d.previous ? `<div class="small muted">So với lần quét ${ago(Date.parse(d.previous.scannedAt))}</div>` : ''}`,
        actions: done
          ? `<button class="btn" data-rescan>${icon('refresh')} Quét lại</button><button class="btn" data-editkw>${icon('edit')} Chỉnh sửa từ khoá</button>
            ${exportMenu([[records.exportUrl(rec.id, 'xlsx'), 'Excel (.xlsx), 2 sheet'], [records.exportUrl(rec.id, 'csv'), 'CSV'], [records.exportUrl(rec.id, 'md'), 'Markdown (dán cho Claude)']])}`
          : '',
      })}
      ${kpiGrid([
        { ic: 'layers', value: cols.length, label: 'Từ khoá', hint: junk.length && !showJunk ? `ẩn ${junk.length} từ khoá rác` : '' },
        { ic: 'play', value: all.length, label: 'Video', hint: [p.keepOffTopic ? 'đã gộp video trùng' : `đã gộp trùng · bỏ ${offTopic} lạc đề`, all.some((v) => v.carried) ? `${all.filter((v) => v.carried).length} giữ từ lần trước` : ''].filter(Boolean).join(' · ') },
        { ic: 'users', value: new Set(all.map((v) => v.author)).size, label: 'Kênh (creator)' },
        { ic: 'eye', value: fmt(sum('plays')), label: 'Tổng lượt xem', hint: `${fresh30} video đăng ≤ 30 ngày`, tip: 'Cộng lượt xem của các video trong kết quả (video trùng tính một lần). N = nghìn, Tr = triệu.' },
        { ic: 'heart', value: fmt(sum('likes')), label: 'Tổng lượt tim' },
        { ic: 'message', value: fmt(sum('comments')), label: 'Tổng bình luận', hint: s?.newSincePrevious != null ? `${s.newSincePrevious} video mới so với lần trước` : '' },
      ])}
      <div class="card tt-results rr-body">
        ${resultTabs(tabs, st.tab)}
        <div class="tt-rbar" data-rbar><div class="row" data-controls></div></div>
        <div data-rbody></div>
      </div>
      <div class="tt-selbar" data-selbar hidden></div>
      <aside class="tt-drawer" data-drawer hidden aria-label="Chi tiết video"></aside>`;
    renderBody();
    if (openId) renderDrawer();
  }

  const pill = (k, label, options, value) => `<label class="tt-pill"><span class="muted">${label}</span><select data-view-opt="${k}">${options.map(([v, l]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const sortOptions = () => Object.entries(VIEW_SORTS).filter(([k]) => k !== 'gain' || current?.data.previous).map(([k, [l]]) => [k, l]);

  function renderBody() {
    if (!current) return;
    const controls = resBox.querySelector('[data-controls]');
    const bar = /** @type {HTMLElement} */ (resBox.querySelector('[data-rbar]'));
    const body = resBox.querySelector('[data-rbody]');
    bar.hidden = !['videos', 'keywords'].includes(st.tab);
    controls.innerHTML = '';
    if (st.tab === 'videos') {
      controls.innerHTML = `<label class="tt-searchmini">${icon('search')}<input data-q placeholder="Tìm trong caption, @kênh…" value="${esc(exploreQ)}" aria-label="Tìm trong video"></label>
        <div class="tt-seg"><button type="button" class="${st.layout === 'grid' ? 'on' : ''}" data-layout="grid">${icon('grid')} Lưới</button><button type="button" class="${st.layout === 'list' ? 'on' : ''}" data-layout="list">${icon('list')} Danh sách</button></div>
        ${pill('vsort', 'Sắp xếp:', sortOptions(), viewSort())}`;
      body.innerHTML = `<div class="tt-kwfilter chips" data-kwfilter></div><div data-explore></div>`;
      renderExplore();
    } else if (st.tab === 'keywords') {
      controls.innerHTML = `${pill('show', 'Hiển thị:', [[5, '5 video/từ khoá'], [10, '10 video/từ khoá'], [20, '20 video/từ khoá'], [0, 'Tất cả video']], st.show)}
        ${pill('cmShow', 'Comment:', [[0, 'Ẩn'], [1, 'Top 1'], [3, 'Top 3']], st.cmShow)}
        ${pill('colw', 'Cột:', [[260, 'Gọn'], [320, 'Vừa'], [420, 'Rộng']], st.colw)}
        ${pill('vsort', 'Sắp xếp:', sortOptions(), viewSort())}`;
      body.innerHTML = compareView(visibleCols(), viewSort());
      linkTopScroll();
      syncSel();
    } else if (st.tab === 'creators') {
      body.innerHTML = creatorsView();
    } else if (st.tab === 'comments') {
      body.innerHTML = commentsView();
    } else {
      body.innerHTML = overviewView();
      syncSel();
    }
  }

  /** Tổng quan: the keywords side by side (table), what to notice, and the top videos. */
  function overviewView() {
    const d = current.data;
    const cols = visibleCols();
    const all = sortVideos(uniqueVideos(cols), viewSort(), true);
    const rows = d.columns.map((c, i) => ({ c, i, n: c.videos.length, med: c.stats?.medianPlays ?? null, max: c.videos.length ? Math.max(...c.videos.map((v) => v.plays || 0)) : null, cm: c.videos.reduce((a, v) => a + (v.comments || 0), 0) }));
    const best = Math.max(...rows.map((r) => r.med ?? 0));
    const junk = d.columns.filter((c) => c.junk);
    const offTopic = d.columns.reduce((a, c) => a + (c.offTopic ?? 0), 0);
    const carried = all.filter((v) => v.carried).length;
    const notes = [
      offTopic && !d.params.keepOffTopic ? `Đã bỏ ${offTopic} video lạc đề (xem trong tab Từ khoá).` : '',
      junk.length ? `${junk.length} từ khoá rác (quá nửa video lạc đề): ${junk.map((c) => `<span class="tag">${esc(c.keyword)}</span>`).join(' ')} <button type="button" class="btn sm ghost" data-showjunk>${showJunk ? 'Ẩn từ khoá rác' : 'Hiện từ khoá rác'}</button>` : '',
      rows.some((r) => !r.n) ? `${rows.filter((r) => !r.n).length} từ khoá không có video đạt bộ lọc.` : '',
      carried ? `${carried} video giữ từ lần quét trước (TikTok lần này không trả về).` : '',
      d.summary?.newSincePrevious != null ? `${d.summary.newSincePrevious} video mới so với lần quét trước.` : '',
    ].filter(Boolean);
    const table = `<div class="table-wrap"><table class="t rr-table"><thead><tr><th>Từ khoá</th><th class="r">Video</th><th class="r">View trung vị</th><th class="r">View cao nhất</th><th class="r">Bình luận</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.c.junk ? 'muted' : ''}"><td><button type="button" class="linklike" data-kwgo="${r.i}" title="Xem video của từ khoá này">${r.med === best && r.n ? '<span class="rr-best" title="View trung vị cao nhất">★</span> ' : ''}<b>${esc(r.c.keyword)}</b></button>${r.c.junk ? ' <span class="badge plain">rác</span>' : ''}<div class="small muted">${esc(r.c.intentLabel || '')}</div></td>${r.n
        ? `<td class="r num">${r.n}</td><td class="r num">${r.med != null ? fmt(r.med) : '–'}</td><td class="r num">${fmt(r.max)}</td><td class="r num">${fmt(r.cm)}</td>`
        : `<td colspan="4" class="muted small">${r.c.error ? `Lỗi: ${esc(r.c.error)}` : 'Không tìm thấy video phù hợp với bộ lọc hiện tại.'}</td>`}</tr>`).join('')}</tbody></table></div>`;
    const side = `<div class="card-pad rr-notes">${notes.length ? `<ul>${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : '<div class="small muted">Không có gì bất thường trong lần quét này.</div>'}
      ${d.hashtags?.length ? `<div class="section-label">Hashtag hay đi chung</div><div class="chips">${d.hashtags.map((h) => `<span class="tag">#${esc(h.tag)} · ${h.videos}</span>`).join('')}</div>` : ''}</div>`;
    const top = all.slice(0, 10);
    return `<div class="rr-overview">
        ${panel('bars', 'So sánh từ khoá', table)}
        ${panel('info', 'Đáng chú ý', side)}
      </div>
      <div class="rr-sub"><h3>${icon('play')} Video nổi bật <span class="muted">(${all.length})</span></h3><span class="muted small">xếp theo ${esc((VIEW_SORTS[viewSort()] || VIEW_SORTS.rank)[0].toLowerCase())}</span><span class="spacer"></span>${all.length > top.length ? `<button type="button" class="btn sm" data-goto-videos>Xem tất cả ${all.length} video ${icon('chevron')}</button>` : ''}</div>
      ${top.length ? gridCards(top) : `<div class="card-pad">${emptyState('Không có video đạt bộ lọc', 'Thử nới bộ lọc (view tối thiểu, thời gian) rồi quét lại.')}</div>`}`;
  }

  /** Creators in the result: how many of their videos, their views, their best video. */
  function creatorsView() {
    const by = new Map();
    for (const v of uniqueVideos(visibleCols())) {
      const c = by.get(v.author) ?? { author: v.author, name: v.authorName, videos: [], keywords: new Set() };
      c.videos.push(v);
      v.keywords.forEach((k) => c.keywords.add(k));
      by.set(v.author, c);
    }
    const list = [...by.values()].map((c) => ({ ...c, plays: c.videos.reduce((a, v) => a + (v.plays || 0), 0), best: c.videos.reduce((a, v) => ((v.plays || 0) > (a.plays || 0) ? v : a)) })).sort((a, b) => b.plays - a.plays);
    if (!list.length) return `<div class="card-pad">${emptyState('Chưa có kênh nào', 'Kênh hiện ra khi có video đạt bộ lọc.')}</div>`;
    return `<div class="table-wrap"><table class="t rr-table"><thead><tr><th>Kênh</th><th class="r">Video trong kết quả</th><th class="r">Tổng view</th><th>Video nhiều view nhất</th><th>Từ khoá</th><th></th></tr></thead><tbody>
      ${list.map((c) => `<tr><td><b>@${esc(c.author)}</b>${c.name ? `<div class="small muted">${esc(c.name)}</div>` : ''}</td><td class="r num">${c.videos.length}</td><td class="r num">${fmt(c.plays)}</td>
        <td class="title-cell"><a href="${esc(c.best.url)}" target="_blank" rel="noopener">${esc((c.best.caption || '(không có caption)').slice(0, 90))}</a><div class="meta">${fmt(c.best.plays)} view · ${ageText(c.best.ageDays, true)}</div></td>
        <td class="small">${[...c.keywords].map((k) => `<span class="tag">${esc(k)}</span>`).join(' ')}</td>
        <td><a class="btn sm" href="#/tiktok/channel?input=${encodeURIComponent('@' + c.author)}">${icon('bars')} Phân tích</a></td></tr>`).join('')}</tbody></table></div>`;
  }

  /** The top comments the scan collected, most liked first, each with its video. */
  function commentsView() {
    const rows = uniqueVideos(visibleCols()).flatMap((v) => (v.topComments || []).map((c) => ({ c, v }))).sort((a, b) => (b.c.likes || 0) - (a.c.likes || 0));
    if (!rows.length) return `<div class="card-pad">${emptyState('Không có bình luận', 'Lần quét này không lấy top comment.')}</div>`;
    return `<div class="card-pad"><p class="muted small" style="margin-top:0">${rows.length} bình luận nhiều tym nhất (tối đa 3 mỗi video). Muốn đọc hết comment: tích chọn video rồi bấm “Lấy comment”.</p>
      ${rows.slice(0, 150).map(({ c, v }) => `<blockquote class="quote">${esc(c.text)}<div class="m">♥ ${fmt(c.likes)} · <a href="${esc(v.url)}" target="_blank" rel="noopener">${esc((v.caption || '(không có caption)').slice(0, 70))}</a> · @${esc(v.author)}</div></blockquote>`).join('')}</div>`;
  }

  const gainBadge = (v) => (v.carried ? `<span class="tt-gain old" title="Lần quét này TikTok không trả về video này. Giữ từ lần quét ${esc(String(v.lastSeenAt).slice(0, 10))}, view tính đến hôm đó.">Lần trước</span>` : v.gain != null ? `<span class="tt-gain ${v.gain > 0 ? 'up' : ''}" title="Tăng ${fmt(v.gainPerDay)} view/ngày từ lần quét trước">+${fmt(v.gain)} view</span>` : v.isNew ? '<span class="tt-gain new" title="Lần quét trước chưa có video này">Mới</span>' : '');
  const commentsHtml = (list, n = 3) => (list?.length && n ? `<div class="tt-cm">${list.slice(0, n).map((c) => `<div class="tt-cm-row" title="${esc(c.text)}"><span class="tt-cm-likes">♥ ${fmt(c.likes)}</span> “${esc(c.text)}”</div>`).join('')}</div>` : '');
  const cover = (v) => (v.cover ? `<img loading="lazy" src="${esc(v.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : '');
  const cb = (v) => `<input type="checkbox" class="tt-cb" data-sel="${esc(v.id)}" aria-label="Chọn video để lấy comment">`;
  /** What the on-topic rule left out of a column, so the user can check it. */
  const offTopicList = (c) => (c.offTopic ? `<details class="tt-off"><summary>Bỏ ${c.offTopic} video lạc đề</summary>${(c.offTopicVideos ?? []).map((v) => `<div class="small"><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.caption || '(không có caption)')}</a> <span class="muted">· ${fmt(v.plays)} view · ${esc(v.reason)}</span></div>`).join('')}</details>` : '');

  function compareView(cols, vsort) {
    if (!cols.length) return `<div class="card-pad">${emptyState('Chưa có cột nào', 'Cột của từng từ khoá hiện ra ngay khi quét xong từ khoá đó.')}</div>`;
    const limit = Number(st.show) || Infinity;
    return `<div class="tt-colnav"><button type="button" class="icon-btn" data-scroll="-1" title="Cột trước">${icon('back')}</button>
        <div class="chips">${cols.map((c) => `<button type="button" class="chip" data-jump="${current.data.columns.indexOf(c)}">${current.data.columns.indexOf(c) + 1}. ${esc(c.keyword)}</button>`).join('')}</div>
        <button type="button" class="icon-btn tt-flip" data-scroll="1" title="Cột sau">${icon('back')}</button></div>
      <div class="tt-topscroll" data-topscroll aria-hidden="true"><div></div></div>
      <div class="tt-cols" style="--tt-colw:${Number(st.colw) || 320}px">${cols.map((c) => {
      const i = current.data.columns.indexOf(c);
      const list = sortVideos(c.videos, vsort).slice(0, limit);
      const tot = (k) => c.videos.reduce((a, v) => a + (v[k] || 0), 0);
      return `<div class="tt-col ${c.junk ? 'tt-col-junk' : ''} ${c.videos.length ? '' : 'tt-col-none'}" data-col="${i}">
        <div class="tt-col-head">
          <div class="tt-col-title"><span class="tt-num">${i + 1}</span><span class="tt-col-kw" title="${esc(c.keyword)}">${esc(c.keyword)}</span><span class="tt-count">${c.videos.length} video</span></div>
          <div class="tt-col-stats"><span>${icon('eye')} ${fmt(tot('plays'))}</span><span>${icon('heart')} ${fmt(tot('likes'))}</span><span>${icon('message')} ${fmt(tot('comments'))}</span></div>
          <div class="small muted">${esc(c.intentLabel)}${c.stats?.medianPlays != null ? ` · trung vị ${fmt(c.stats.medianPlays)} view` : ''}${c.stats?.fresh30 ? ` · ${c.stats.fresh30} mới ≤ 30 ngày` : ''}</div>
          ${c.junk ? '<div class="small" style="color:var(--warn)">Từ khoá rác: quá nửa video lạc đề</div>' : ''}
          ${c.error ? `<div class="small" style="color:var(--bad)">Lỗi: ${esc(c.error)}</div>` : ''}${offTopicList(c)}
          ${list.length ? `<label class="tt-colsel"><input type="checkbox" data-selcol="${i}"> Chọn ${list.length} video của cột</label>` : ''}
        </div>
        ${list.length ? list.map((v, k) => (k < 5 ? `<div class="tt-row" data-vid="${esc(v.id)}">
            ${cb(v)}<span class="tt-rank">${k + 1}</span>
            <a class="tt-thumb" href="${esc(v.url)}" target="_blank" rel="noopener">${cover(v)}</a>
            <div class="tt-info"><a class="tt-cap" href="${esc(v.url)}" target="_blank" rel="noopener" title="${esc(v.caption)}">${esc(v.caption || '(không có caption)')}</a>
              <div class="tt-meta">@${esc(v.author)} · ${ageText(v.ageDays, true)} ${gainBadge(v)}</div></div>
            <div class="tt-views">${icon('eye')}${fmt(v.plays)}</div>
            ${commentsHtml(v.topComments, Number(st.cmShow))}
          </div>` : `<div class="tt-row compact" data-vid="${esc(v.id)}">${cb(v)}<span class="tt-rank">${k + 1}</span>
            <a class="tt-cap1" href="${esc(v.url)}" target="_blank" rel="noopener" title="${esc(v.caption)}">${esc(v.caption || '(không có caption)')}</a><span class="tt-views">${fmt(v.plays)}</span></div>`)).join('')
        : `<div class="tt-colempty">${c.error ? 'Không lấy được video của từ khoá này.' : 'Không tìm thấy video phù hợp với bộ lọc hiện tại.'}</div>`}
      </div>`;
    }).join('')}</div>`;
  }

  /** Video cards: cover, caption, creator and age, views, likes/comments/shares, keywords, the top comment, a tick box. */
  const gridCards = (list) => `<div class="tt-grid">${list.map((v) => `<div class="tt-gcard" data-vid="${esc(v.id)}">
      <div class="tt-gcover"><a href="${esc(v.url)}" target="_blank" rel="noopener">${cover(v)}</a><label class="tt-gsel">${cb(v)}</label><span class="tt-gviews">${icon('eye')}${fmt(v.plays)}</span></div>
      <div class="tt-gbody"><a class="tt-cap" href="${esc(v.url)}" target="_blank" rel="noopener" title="${esc(v.caption)}">${esc(v.caption || '(không có caption)')}</a>
        <div class="tt-meta">@${esc(v.author)} · ${ageText(v.ageDays, true)} ${gainBadge(v)}</div>
        <div class="tt-meta">${icon('heart')} ${fmt(v.likes)} · ${icon('message')} ${fmt(v.comments)} · ${fmt(v.shares)} share</div>
        <div>${v.keywords.map((k) => `<span class="tag">${esc(k)}</span>`).join('')}</div>
        ${commentsHtml(v.topComments, 1)}</div></div>`).join('')}</div>`;

  function renderExplore() {
    const q = fold(exploreQ);
    const all = uniqueVideos(visibleCols());
    const list = sortVideos(all.filter((v) => (exploreKw === 'all' || v.keywords.includes(exploreKw)) && (!q || fold(`${v.caption} @${v.author} ${v.authorName || ''}`).includes(q))), viewSort(), true);
    resBox.querySelector('[data-kwfilter]').innerHTML = `<button type="button" class="chip ${exploreKw === 'all' ? 'on' : ''}" data-kwf="all">Tất cả (${all.length})</button>${visibleCols().map((c) => `<button type="button" class="chip ${exploreKw === c.keyword ? 'on' : ''}" data-kwf="${esc(c.keyword)}">${esc(c.keyword)} (${c.videos.length})</button>`).join('')}`;
    const box = resBox.querySelector('[data-explore]');
    if (!list.length) box.innerHTML = `<div class="card-pad">${emptyState('Không có video khớp', exploreQ ? 'Thử bỏ bớt chữ tìm kiếm.' : '')}</div>`;
    else if (st.layout === 'list') box.innerHTML = tableView(list);
    else box.innerHTML = gridCards(list);
    syncSel();
  }

  function tableView(rows) {
    const gain = Boolean(current.data.previous);
    return `<div class="table-wrap"><table class="t tt-table"><thead><tr><th></th><th>Video</th><th>Từ khoá</th><th class="num">View</th><th class="num">Tim</th><th class="num">Cmt</th><th class="num">Share</th><th class="num">Tuổi</th><th class="num">View/ngày</th>${gain ? '<th class="num">Tăng</th>' : ''}<th>Top comment</th></tr></thead><tbody>
      ${rows.map((v) => `<tr data-vid="${esc(v.id)}"><td>${cb(v)}</td>
        <td><div class="tt-trow"><a class="tt-thumb sm" href="${esc(v.url)}" target="_blank" rel="noopener">${cover(v)}</a><div><a class="tt-cap" href="${esc(v.url)}" target="_blank" rel="noopener">${esc((v.caption || '(không có caption)').slice(0, 140))}</a><div class="tt-meta">@${esc(v.author)}</div></div></div></td>
        <td class="small">${v.keywords.map(esc).join('<br>')}</td><td class="num">${fmt(v.plays)}</td><td class="num">${fmt(v.likes)}</td><td class="num">${fmt(v.comments)}</td><td class="num">${fmt(v.shares)}</td>
        <td class="num">${ageText(v.ageDays, true)}</td><td class="num">${fmt(v.playsPerDay)}</td>${gain ? `<td class="num">${gainBadge(v)}</td>` : ''}<td style="max-width:320px">${commentsHtml(v.topComments)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  // ---------------- selection ----------------
  /** The keyword column a checkbox sits in, or null (all-videos tab, detail panel). */
  const colOf = (el) => {
    const c = /** @type {HTMLElement} */ (el.closest('.tt-col'));
    return c ? Number(c.dataset.col) : null;
  };
  /** Where a video ticked outside the columns shows as ticked in them: its first keyword column. */
  const firstCol = (id) => Math.max(0, current?.data.columns.findIndex((c) => c.videos.some((v) => v.id === id)) ?? 0);
  /** @param {string} id @param {number|null} col @param {boolean} on */
  function tick(id, col, on) {
    if (col == null) {
      if (!on) selected.delete(id);
      else if (!selected.has(id)) selected.set(id, new Set([firstCol(id)]));
      return;
    }
    const cols = selected.get(id) ?? new Set();
    on ? cols.add(col) : cols.delete(col);
    cols.size ? selected.set(id, cols) : selected.delete(id);
  }
  /** Ticked as shown: in a column only if ticked there; elsewhere if ticked anywhere. */
  const isOn = (el) => {
    const id = el.dataset.sel;
    const col = colOf(el);
    return col == null ? selected.has(id) : Boolean(selected.get(id)?.has(col));
  };
  const displayedBoxes = () => [...resBox.querySelectorAll('[data-rbody] [data-sel]')];

  function syncSel() {
    for (const el of resBox.querySelectorAll('[data-sel]')) {
      const on = isOn(el);
      /** @type {HTMLInputElement} */ (el).checked = on;
      el.closest('[data-vid]')?.classList.toggle('on', on);
    }
    for (const el of resBox.querySelectorAll('[data-selcol]')) {
      const boxes = [...el.closest('.tt-col').querySelectorAll('[data-sel]')];
      const n = boxes.filter(isOn).length;
      /** @type {HTMLInputElement} */ (el).checked = n > 0 && n === boxes.length;
      /** @type {HTMLInputElement} */ (el).indeterminate = n > 0 && n < boxes.length;
    }
    if (current) saveSel(current.id, selected);
    renderSelbar();
  }

  function renderSelbar() {
    const bar = /** @type {HTMLElement} */ (resBox.querySelector('[data-selbar]'));
    if (!bar) return;
    const n = selected.size;
    bar.hidden = !n;
    if (!n) return;
    const boxes = displayedBoxes();
    const rest = boxes.some((el) => !isOn(el));
    const max = store('tt-comments-form', { max: 300 }).max;
    bar.innerHTML = `<span class="tt-selcount">${icon('check')}<b>${n}</b> video đã chọn</span>
      <span class="tt-selsep"></span>
      ${rest ? `<button type="button" class="btn sm ghost" data-selall>Chọn tất cả đang hiển thị</button>` : ''}
      <button type="button" class="btn sm ghost" data-selnone>Bỏ chọn</button>
      <label class="tt-pill"><select data-cmmax title="Số comment tối đa đọc ở mỗi video">${[100, 300].map((v) => `<option value="${v}" ${v === Number(max) ? 'selected' : ''}>Tối đa ${v} cmt/video</option>`).join('')}</select></label>
      <button type="button" class="btn primary sm" data-cm>${icon('message')} Lấy comment (${n})</button>`;
  }

  shown.on(resBox, 'change', '[data-sel]', (e, el) => {
    tick(el.dataset.sel, colOf(el), el.checked);
    syncSel();
  });
  shown.on(resBox, 'change', '[data-selcol]', (e, el) => {
    const col = colOf(el);
    for (const x of el.closest('.tt-col').querySelectorAll('[data-sel]')) tick(x.dataset.sel, col, el.checked);
    syncSel();
  });
  shown.on(resBox, 'click', '[data-selall]', () => {
    for (const el of displayedBoxes()) if (!isOn(el)) tick(/** @type {HTMLElement} */ (el).dataset.sel, colOf(el), true);
    syncSel();
  });
  shown.on(resBox, 'click', '[data-selnone]', () => {
    selected.clear();
    syncSel();
  });
  shown.on(resBox, 'change', '[data-cmmax]', (e, el) => persist('tt-comments-form', { ...store('tt-comments-form', { videos: '', max: 300, replies: true }), max: Number(el.value) }));
  // Only the ticked videos go to the existing comment scraper ("Comment TikTok" screen), which starts right away.
  shown.on(resBox, 'click', '[data-cm]', () => {
    if (!current || !selected.size) return;
    const urls = new Map(current.data.columns.flatMap((c) => c.videos.map((v) => [v.id, v.url])));
    const list = [...selected.keys()].map((id) => urls.get(id)).filter(Boolean);
    if (!list.length) return toast('Không tìm thấy link của video đã chọn', 'error');
    saveSel(current.id, selected);
    window.__go('/tiktok/comments', { videos: list.join('\n'), run: '1' });
  });

  // ---------------- video detail panel ----------------
  // Click a video (row, cover or caption) to see everything about it; ↑/↓ moves through the videos on screen.
  // Cmd/Ctrl-click still opens it on TikTok.
  const navIds = () => [...new Set([...resBox.querySelectorAll('[data-rbody] [data-vid]')].map((el) => /** @type {HTMLElement} */ (el).dataset.vid))];
  const dateText = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '–');
  const pct = (x) => (x == null ? '–' : `${(x * 100).toFixed(1).replace('.', ',')}%`);

  function openDrawer(id) {
    openId = id;
    renderDrawer();
  }
  function closeDrawer() {
    openId = null;
    const dr = /** @type {HTMLElement} */ (resBox.querySelector('[data-drawer]'));
    if (dr) dr.hidden = true;
    resBox.querySelectorAll('[data-vid].active').forEach((el) => el.classList.remove('active'));
  }

  function renderDrawer() {
    const dr = /** @type {HTMLElement} */ (resBox.querySelector('[data-drawer]'));
    if (!dr || !current || !openId) return;
    const all = uniqueVideos(current.data.columns);
    const v = all.find((x) => x.id === openId);
    if (!v) return closeDrawer();
    const ids = navIds();
    const k = ids.indexOf(v.id);
    // Where it ranks in each keyword column.
    const places = current.data.columns.map((c) => [c, c.videos.find((x) => x.id === v.id)]).filter(([, x]) => x);
    const stat = (label, value, hint = '') => `<div class="tt-dr-stat"><div class="l">${label}</div><div class="v">${value}</div>${hint ? `<div class="h">${hint}</div>` : ''}</div>`;
    dr.innerHTML = `
      <div class="tt-dr-head">
        <button type="button" class="icon-btn" data-dr-step="-1" title="Video trước (↑)" ${k > 0 ? '' : 'disabled'}>${icon('back')}</button>
        <span class="small muted">${k >= 0 ? `${k + 1} / ${ids.length}` : ''}</span>
        <button type="button" class="icon-btn tt-flip" data-dr-step="1" title="Video sau (↓)" ${k >= 0 && k < ids.length - 1 ? '' : 'disabled'}>${icon('back')}</button>
        <span class="spacer"></span><span class="small muted">↑ ↓ chuyển video · X chọn · Esc đóng</span>
        <button type="button" class="icon-btn" data-dr-close title="Đóng (Esc)">${icon('x')}</button>
      </div>
      <div class="tt-dr-body">
        <div class="tt-dr-top">
          <a class="tt-dr-cover" href="${esc(v.url)}" target="_blank" rel="noopener">${cover(v)}<span class="tt-gviews">${icon('eye')}${fmt(v.plays)}</span></a>
          <div class="tt-dr-who">
            <div><b>@${esc(v.author)}</b>${v.authorName ? `<div class="small muted">${esc(v.authorName)}</div>` : ''}</div>
            <div class="small">Đăng ${dateText(v.createdAt)} · ${ageText(v.ageDays, true)}</div>
            <div>${gainBadge(v)}</div>
            <label class="tt-dr-sel"><input type="checkbox" class="tt-cb" data-sel="${esc(v.id)}"> Chọn để lấy comment</label>
            <a class="btn sm primary" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('ext')} Mở trên TikTok</a>
            <button type="button" class="btn sm ${isSaved('tiktok_video', v.id) ? 'on' : ''}" data-dr-save>${icon('bookmark')} ${isSaved('tiktok_video', v.id) ? 'Đã lưu' : 'Lưu video'}</button>
          </div>
        </div>
        <p class="tt-dr-cap">${esc(v.caption || '(không có caption)')}</p>
        ${v.hashtags?.length ? `<div>${v.hashtags.map((h) => `<span class="tag">#${esc(h)}</span>`).join('')}</div>` : ''}
        <div class="tt-dr-stats">
          ${stat('Lượt xem', fmt(v.plays), v.carried ? `tính đến ${dateText(v.lastSeenAt)}` : '')}
          ${stat('View/ngày', fmt(v.playsPerDay))}
          ${stat('Tăng từ lần trước', v.gain != null ? `+${fmt(v.gain)}` : v.isNew ? 'Mới' : '–', v.gainPerDay != null ? `${fmt(v.gainPerDay)}/ngày` : '')}
          ${stat('Tim', fmt(v.likes))}${stat('Bình luận', fmt(v.comments))}${stat('Chia sẻ', fmt(v.shares))}
          ${stat('Lưu', fmt(v.saves))}${stat('Tỉ lệ tương tác', pct(v.engagementRate), '(tim + cmt + share + lưu) ÷ view')}${stat('Điểm tổng hợp', v.score != null ? fmt(v.score) : '–')}
        </div>
        <div class="tt-dr-sec">Nằm trong từ khoá</div>
        <div>${places.map(([c, x]) => `<button type="button" class="chip" data-dr-col="${current.data.columns.indexOf(c)}">#${x.rank} · ${esc(c.keyword)}</button>`).join(' ')}</div>
        <div class="tt-dr-sec">Top comment nhiều tym</div>
        ${v.topComments?.length ? v.topComments.map((c) => `<div class="tt-dr-cm"><span class="tt-cm-likes">♥ ${fmt(c.likes)}</span> ${esc(c.text)}</div>`).join('') : '<div class="small muted">Lần quét này không lấy comment.</div>'}
      </div>`;
    dr.hidden = false;
    syncSel();
    resBox.querySelectorAll('[data-vid]').forEach((el) => el.classList.toggle('active', /** @type {HTMLElement} */ (el).dataset.vid === v.id));
    resBox.querySelector(`[data-rbody] [data-vid="${CSS.escape(v.id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  function stepDrawer(d) {
    const ids = navIds();
    const k = ids.indexOf(openId);
    const next = ids[k + d];
    if (next) openDrawer(next);
  }

  shown.on(resBox, 'click', '[data-rbody] [data-vid]', (e, el) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('input, label, select, button')) return;
    const a = t.closest('a');
    if (a && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return; // open on TikTok as usual
    e.preventDefault();
    openId === el.dataset.vid ? closeDrawer() : openDrawer(el.dataset.vid);
  });
  shown.on(resBox, 'click', '[data-dr-close]', closeDrawer);
  shown.on(resBox, 'click', '[data-dr-save]', async () => {
    const cols = current.data.columns;
    const v = uniqueVideos(cols).find((x) => x.id === openId);
    if (!v) return;
    const it = savedTikTokVideo(v, cols.filter((c) => c.videos.some((x) => x.id === v.id)).map((c) => c.keyword));
    await toggleSave('tiktok_video', it.ref, it.title, it.data);
    renderDrawer();
  });
  shown.on(resBox, 'click', '[data-dr-step]', (e, el) => stepDrawer(Number(el.dataset.drStep)));
  shown.on(resBox, 'click', '[data-dr-col]', (e, el) => {
    showTab('keywords');
    jumpTo(Number(el.dataset.drCol));
  });
  const onKey = (e) => {
    if (!openId || resultEl.hidden) return;
    if (/** @type {HTMLElement} */ (e.target).closest?.('input, select, textarea')) return;
    if (e.key === 'Escape') closeDrawer();
    else if (e.key === 'ArrowDown' || e.key === 'j') (e.preventDefault(), stepDrawer(1));
    else if (e.key === 'ArrowUp' || e.key === 'k') (e.preventDefault(), stepDrawer(-1));
    else if (e.key === 'x') {
      tick(openId, null, !selected.has(openId));
      syncSel();
    }
  };
  document.addEventListener('keydown', onKey);
  shown.add(() => document.removeEventListener('keydown', onKey));

  // ---------------- column navigation ----------------
  // The columns' horizontal scrollbar sits on top (and stays in view while scrolling down): a thin bar
  // of the same width, kept in step with the columns both ways.
  /** @type {ResizeObserver|null} */
  let colsObserver = null;
  function linkTopScroll() {
    colsObserver?.disconnect();
    const bar = /** @type {HTMLElement} */ (resBox.querySelector('[data-topscroll]'));
    const cols = /** @type {HTMLElement} */ (resBox.querySelector('.tt-cols'));
    if (!bar || !cols) return;
    const inner = /** @type {HTMLElement} */ (bar.firstElementChild);
    const size = () => {
      inner.style.width = `${cols.scrollWidth}px`;
      bar.hidden = cols.scrollWidth <= cols.clientWidth + 1;
    };
    size();
    colsObserver = new ResizeObserver(size);
    colsObserver.observe(cols);
    // Same width on both, so copying the position only when it differs ends the echo of the other's event.
    bar.addEventListener('scroll', () => {
      if (cols.scrollLeft !== bar.scrollLeft) cols.scrollLeft = bar.scrollLeft;
    });
    cols.addEventListener('scroll', () => {
      if (bar.scrollLeft !== cols.scrollLeft) bar.scrollLeft = cols.scrollLeft;
    });
  }

  function jumpTo(i) {
    const cols = resBox.querySelector('.tt-cols');
    const col = /** @type {HTMLElement} */ (resBox.querySelector(`.tt-col[data-col="${i}"]`));
    if (cols && col) cols.scrollTo({ left: col.offsetLeft - /** @type {HTMLElement} */ (cols).offsetLeft - 14, behavior: 'smooth' });
  }
  shown.on(resBox, 'click', '[data-jump]', (e, el) => jumpTo(Number(el.dataset.jump)));
  shown.on(resBox, 'click', '[data-scroll]', (e, el) => {
    const cols = resBox.querySelector('.tt-cols');
    cols?.scrollBy({ left: Number(el.dataset.scroll) * ((Number(st.colw) || 320) + 12), behavior: 'smooth' });
  });

  // ---------------- result controls ----------------
  function showTab(t) {
    if (st.tab === t) return;
    st.tab = t;
    persist('tt-topic-form', st);
    resBox.querySelectorAll('[data-rtab]').forEach((b) => {
      const on = /** @type {HTMLElement} */ (b).dataset.rtab === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    renderBody();
  }
  shown.on(resBox, 'click', '[data-rtab]', (e, el) => showTab(el.dataset.rtab));
  shown.on(resBox, 'click', '[data-goto-videos]', () => showTab('videos'));
  shown.on(resBox, 'click', '[data-kwgo]', (e, el) => {
    showTab('keywords');
    requestAnimationFrame(() => jumpTo(Number(el.dataset.kwgo)));
  });
  shown.on(resBox, 'change', '[data-view-opt]', (e, el) => {
    const k = el.dataset.viewOpt;
    st[k] = k === 'vsort' ? el.value : Number(el.value);
    persist('tt-topic-form', st);
    if (st.tab === 'videos') renderExplore();
    else renderBody();
  });
  shown.on(resBox, 'click', '[data-layout]', (e, el) => {
    st.layout = el.dataset.layout;
    persist('tt-topic-form', st);
    resBox.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('on', b === el));
    renderExplore();
  });
  shown.on(resBox, 'click', '[data-kwf]', (e, el) => ((exploreKw = el.dataset.kwf), renderExplore()));
  shown.on(resBox, 'input', '[data-q]', (e, el) => ((exploreQ = el.value), renderExplore()));
  shown.on(resBox, 'click', '[data-showjunk]', () => {
    showJunk = !showJunk;
    if (current) renderResult(current);
  });
  shown.on(resBox, 'click', '[data-rescan]', () => rescan(current));
  shown.on(resBox, 'click', '[data-editkw]', () => editKeywords(current));
  shown.on(resBox, 'click', '[data-back]', () => {
    setHash('#/tiktok/topic');
    mode('setup');
  });
  // Close the export menu after a pick or a click elsewhere.
  const closeMenus = (e) => {
    for (const m of resBox.querySelectorAll('details.tt-menu[open]')) if (!m.contains(e.target) || e.target.closest('a')) m.removeAttribute('open');
  };
  document.addEventListener('click', closeMenus);
  shown.add(() => document.removeEventListener('click', closeMenus));

  /** Same topic, same keywords and filters as that scan. @param {any} rec */
  function rescan(rec) {
    const p = rec.data.params;
    scan(rec.data.columns.map((c) => c.keyword), { topic: rec.data.topic, country: p.country, perKeyword: p.perKeyword, sort: p.sort, minPlays: p.minPlays, maxAgeDays: p.maxAgeDays, topComments: p.topComments, keepOffTopic: p.keepOffTopic ? 1 : 0, keepPrevious: p.keepPrevious === false ? 0 : 1 });
  }

  /** Back to setup with this scan's topic, keywords and settings, to add or drop keywords. @param {any} rec */
  function editKeywords(rec) {
    const d = rec.data;
    const used = new Set(d.columns.map((c) => fold(c.keyword)));
    kws = (d.keywords ?? []).map((k) => ({ ...k, selected: !k.dropped && used.has(fold(k.keyword)) }));
    for (const c of d.columns) if (!kws.some((k) => fold(k.keyword) === fold(c.keyword))) kws.push({ keyword: c.keyword, intent: c.intent || 'related', selected: true, sources: ['manual'] });
    kwTopic = d.topic;
    topicInput.value = d.topic;
    Object.assign(st, { topic: d.topic, gl: COUNTRY_REGION[d.params.country] ?? '', perKeyword: d.params.perKeyword, sort: d.params.sort, minPlays: d.params.minPlays, maxAgeDays: d.params.maxAgeDays, topComments: d.params.topComments, keepOffTopic: d.params.keepOffTopic ? 1 : 0, keepPrevious: d.params.keepPrevious === false ? 0 : 1 });
    persist('tt-topic-form', st);
    syncForm();
    intentFilter = 'all';
    renderKeywords();
    setHash('#/tiktok/topic');
    mode('setup');
    if (!d.keywords?.length) toast('Bấm “Tìm từ khoá” để xem thêm gợi ý của TikTok');
  }

  renderKeywords();
  historyList();
  const again = await rerunRecord(params, '/tiktok/topic');
  if (again) rescan(again);
  else if (params.id) show(params.id).catch((e) => toast(e.message, 'error'));
  else if (params.q) {
    // Sent from the dashboard's topic box: ask TikTok for keywords at once, once (a reload must not ask again).
    topicInput.value = params.q;
    setHash('#/tiktok/topic');
    if (params.run) findKeywords();
  } else activeJob('tiktok_topic').then((live) => live && follow(live.params.topic, (onProgress) => watchJob(live.id, onProgress)));
  return () => (shown.off(), colsObserver?.disconnect());
}
