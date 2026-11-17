// "Bảng ý tưởng": idea cards in batches of ten, each checked against Kallaway's six idea questions. A card is
// edited in a panel and saved with Lưu. Other screens open `#/board?from=…`; the card is made here, when the
// board opens.
import { ideas } from '../http/client.js';
import { esc, icon, toast, ago, errorCallout, emptyState, setUrl } from '../lib.js';

const PATH = '/board';
const TABS = [['idea', 'Ý tưởng', 'bulb'], ['checks', 'Chấm', 'check'], ['source', 'Gạch gốc', 'target']];
const OK = { yes: ['có', 'on'], no: ['chưa', ''], unknown: ['chưa rõ', ''], skip: ['không áp dụng', 'skip'] };
const ORIGIN = { self: 'Tự nghĩ', brick: 'Từ video đã thắng', pain: 'Từ nỗi đau', '5w1h': 'Từ 5W1H' };

const get = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);
function set(o, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((v, k) => v[k], o)[last] = value;
}

export async function mount(root, params) {
  let b;
  try {
    b = await ideas.board(params.batch);
  } catch (e) {
    root.innerHTML = errorCallout(e);
    return;
  }
  const state = { open: /** @type {any} */ (null), draft: /** @type {any} */ (null), tab: 'idea', dirty: false, suggestion: /** @type {any} */ (null), busy: '' };
  const label = (pairs, k) => pairs.find((x) => x[0] === k)?.[1] ?? k;
  const chip = (t, cls = '') => (t ? `<span class="fw-chip ${cls}">${esc(t)}</span>` : '');
  const aiBtn = (action, text) => (b.ai ? `<button type="button" class="btn sm" data-ai="${action}" ${state.busy ? 'disabled' : ''}>${icon('bolt')} ${state.busy === action ? 'Đang hỏi AI…' : text}</button>` : '');
  const cap = (t) => `<div class="fw-cap">${t}</div>`;
  const input = (path, capText, ph = '') => `<div class="fw-field">${cap(capText)}<input class="input" data-path="${path}" value="${esc(get(state.draft, path) ?? '')}" placeholder="${esc(ph)}"></div>`;
  const area = (path, capText, ph = '') => `<div class="fw-field">${cap(capText)}<textarea class="input" rows="2" data-path="${path}" placeholder="${esc(ph)}">${esc(get(state.draft, path) ?? '')}</textarea></div>`;
  const select = (path, capText, pairs, empty) => `<div class="fw-field">${cap(capText)}<select class="select input" data-path="${path}"><option value="">${empty}</option>${pairs.map(([k, l]) => `<option value="${esc(k)}" ${get(state.draft, path) === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  const dots = (x) => `<span class="bd-dots">${x.checks.map((c) => `<span class="bd-dot ${OK[c.ok][1]}" data-dot title="Câu ${c.key.slice(1)}: ${esc(OK[c.ok][0])}"></span>`).join('')}</span>`;

  function rowHtml(x, i) {
    const c = x.card;
    return `<button type="button" class="bd-row ${state.open?.id === x.id ? 'on' : ''} ${x.status === 'dropped' ? 'dropped' : ''}" data-open="${x.id}">
      <span class="bd-n">${i + 1}</span>${chip(label(b.lists.statuses, x.status), x.status === 'chosen' ? '' : 'soft')}
      <span class="bd-title"><b>${esc(c.title.text || c.topic || '(chưa có tiêu đề)')}</b><span class="muted small">${esc(ORIGIN[c.origin.kind])}${c.pillar ? ` · ${esc(c.pillar)}` : ''}${x.trial ? ' · thử nghiệm gốc' : ''}</span></span>
      ${dots(x)}${x.ready ? chip('đủ căn cứ', '') : ''}</button>`;
  }

  function ideaTab() {
    const d = state.draft;
    const lego = b.lists.lego;
    const bricks = (key) => `<div class="bd-lego">${lego.map(([k, l]) => `<label class="check"><input type="checkbox" data-lego="${key}:${k}" ${d.card[key].includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>`;
    return `<div class="row">${aiBtn('draft', state.open.card.origin.kind === 'brick' ? 'Dựng thẻ từ video gốc' : 'Nháp các ô còn thiếu')}${aiBtn('titles', 'Gợi ý tiêu đề')}${b.ai ? '' : '<span class="muted small">Có API key OpenRouter thì AI nháp giúp được.</span>'}</div>
      ${suggestionHtml()}
      <div class="fw-field">${cap('TRẠNG THÁI')}<select class="select input" data-path="status">${b.lists.statuses.map(([k, l]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      ${input('card.topic', 'TOPIC', 'Chủ đề video của bạn')}
      <div class="fw-field">${cap('PILLAR')}<select class="select input" data-path="card.pillar"><option value="">Chưa chọn</option>${[...new Set([...b.pillars, d.card.pillar].filter(Boolean))].map((p) => `<option ${d.card.pillar === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
      ${area('card.pain.text', 'NỖI ĐAU', 'Nỗi đau của avatar, nói trong một câu')}
      ${d.card.pain.evidence.length ? `<div class="fw-field">${cap('BẰNG CHỨNG TỪ BÌNH LUẬN')}${d.card.pain.evidence.map((e) => `<div class="fw-quote"><i>"${esc(e.text)}"</i> <span class="muted small">${esc(e.likes)} tim</span></div>`).join('')}</div>` : ''}
      ${area('card.belief.common', 'ĐIỀU NGƯỜI TA ĐANG TIN')}${area('card.belief.reality', 'ĐIỀU VIDEO SẼ CHỈ RA')}
      ${input('card.angle', 'GÓC ĐI NGƯỢC', 'Một dòng')}
      <div class="fw-field">${cap('TIÊU ĐỀ (DICK)')}<div class="bd-dick">${[['d', 'Đối tượng'], ['i', 'Insight'], ['c', 'Concept'], ['k', 'Khác']].map(([k, l]) => `<input class="input" data-path="card.title.${k}" value="${esc(d.card.title[k])}" placeholder="${l}">`).join('')}</div>
        <input class="input" data-path="card.title.text" value="${esc(d.card.title.text)}" placeholder="Câu tiêu đề ghép lại" style="margin-top:6px"></div>
      ${select('card.concept', 'CONCEPT', b.lists.concepts.map((c) => [c, c]), 'Chưa chọn')}
      ${select('card.funnel', 'PHỄU', b.lists.funnel, 'Chưa chọn')}
      ${input('card.leadMagnet', 'LEAD MAGNET', 'Thứ tặng khớp với chủ đề, dẫn về email hoặc tin nhắn')}
      ${d.card.origin.kind === 'self' ? '' : `<div class="fw-field">${cap('GIỮ GẠCH')}${bricks('keep')}</div><div class="fw-field">${cap('LÀM LẠI GẠCH')}${bricks('remix')}</div>`}
      ${b.hasFilter ? select('card.filterOk', 'CÂU LỌC CỦA SOULPRINT', [['yes', 'Có giá trị với avatar'], ['no', 'Không'], ['unknown', 'Chưa rõ']], 'Chưa rõ') : ''}
      ${input('card.publishDate', 'NGÀY ĐĂNG (TUỲ CHỌN)', 'YYYY-MM-DD')}`;
  }

  function suggestionHtml() {
    const s = state.suggestion;
    if (!s) return '';
    const v = s.value;
    const body = s.action === 'titles'
      ? v.titles.map((t, i) => `<label class="check"><input type="radio" name="bd-title" value="${i}" ${i === 0 ? 'checked' : ''}> <span><b>${esc(t.text)}</b><span class="muted small"> ${esc([t.d, t.i, t.c, t.k].filter(Boolean).join(' · '))}</span></span></label>`).join('')
      : `${[['Topic', v.topic], ['Nỗi đau', v.pain], ['Đang tin', v.belief.common], ['Video chỉ ra', v.belief.reality], ['Góc', v.angle]].filter(([, x]) => x).map(([l, x]) => `<div class="small"><b>${l}:</b> ${esc(x)}</div>`).join('')}
        ${v.keep.length ? `<div class="small"><b>Giữ:</b> ${esc(v.keep.map((k) => label(b.lists.lego, k)).join(', '))}</div>` : ''}${v.remix.length ? `<div class="small"><b>Làm lại:</b> ${esc(v.remix.map((k) => label(b.lists.lego, k)).join(', '))}</div>` : ''}
        ${v.why ? `<div class="small muted">${esc(v.why)}</div>` : ''}`;
    return `<div class="callout info"><div class="fw-cap">AI đề xuất</div>${body}<div class="row" style="margin-top:8px"><button type="button" class="btn sm primary" data-accept>${icon('check')} Nhận</button><button type="button" class="btn sm" data-reject>Bỏ</button></div><div class="muted small">Nhận chỉ điền vào thẻ đang mở; bấm Lưu để giữ lại.</div></div>`;
  }

  function checksTab() {
    const x = state.open;
    return `<p class="${x.ready ? '' : 'muted'}">${x.ready ? 'Thẻ đủ căn cứ để chốt.' : `Chưa đủ căn cứ để chốt: còn thiếu ${esc(x.missing.join(', '))}. Vẫn chốt được nếu bạn muốn thử.`}</p>
      ${x.checks.map((c) => `<div class="fw-field">${cap(`CÂU ${c.key.slice(1)}`)}<div class="fw-value">${esc(c.question)}</div>
        <div class="row" style="margin-top:4px">${chip(OK[c.ok][0], c.ok === 'yes' ? '' : 'soft')}${c.key === 'q1' ? '' : `<input class="input" data-path="card.notes.${c.key}" value="${esc(state.draft.card.notes[c.key])}" placeholder="Ghi chú">`}</div>
        ${c.key === 'q1' && c.note ? `<div class="fw-value muted small">${esc(c.note)}</div>` : ''}
        ${c.key === 'q1' && x.matches.length ? x.matches.map((m) => `<a class="fw-value small" href="#/bricks?v=${esc(m.platform)}:${encodeURIComponent(m.videoId)}">${esc(m.title)} · ${esc(m.score)}×</a>`).join('') : ''}</div>`).join('')}
      <p class="muted small">Câu 2 đến câu 6 là "có" khi ô tương ứng ở tab Ý tưởng đã có nội dung. Câu 1 do app tra trong Thư viện gạch.</p>`;
  }

  function sourceTab() {
    const o = state.open.card.origin;
    const s = o.snapshot;
    if (o.kind === 'self') return '<p class="muted">Ý tưởng tự nghĩ: không có video gốc. Đây là một thử nghiệm gốc trong lô.</p>';
    if (o.kind === 'pain') return `<div class="fw-field">${cap('NỖI ĐAU TRONG SOULPRINT')}<div class="fw-value">${esc(s?.text)}</div></div><a class="btn sm" href="#/soulprint">Mở Soulprint</a>`;
    if (o.kind === '5w1h') return `<div class="fw-field">${cap('GỢI Ý TRONG BÁO CÁO 5W1H')}<div class="fw-value">${esc(s?.title)}</div><div class="muted small">${esc(s?.recordTitle)}</div></div><a class="btn sm" href="#/tiktok/5w1h?id=${esc(s?.recordId)}">Mở báo cáo</a>`;
    return `<p class="muted small">Gạch của video gốc lúc tạo thẻ.</p>
      <div class="fw-field">${cap('VIDEO')}<div class="fw-value">${esc(s?.title)}</div><div class="muted small">${esc(s?.channelTitle ?? '')}${s?.score != null ? ` · vượt kênh ${esc(s.score)}×` : ''}</div></div>
      <div class="fw-field">${cap('TOPIC')}<div class="fw-value">${esc(s?.topic)}</div></div>
      <div class="fw-field">${cap('UNIQUE ANGLE')}<div class="fw-value">${esc(s?.angle)}</div></div>
      <div class="fw-field">${cap('CONCEPT')}${chip(s?.concept)}</div>
      <div class="fw-field">${cap('SPOKEN HOOK')}<div class="fw-value"><i>${esc(s?.hook?.spoken)}</i></div></div>
      <div class="fw-field">${cap('FORMULA')}<div class="fw-value"><i>${esc(s?.hook?.formula)}</i></div></div>
      <div class="fw-field">${cap('ARCHETYPE')}${chip(s?.hook?.archetype)}</div>
      <div class="fw-field">${cap('STORYTELLING')}${chip(s?.story?.category)}</div>
      <div class="row"><a class="btn sm" href="#/bricks?v=${esc(s?.platform)}:${encodeURIComponent(s?.videoId ?? '')}">Mở trong Thư viện gạch</a>${s?.url ? `<a class="btn sm" href="${esc(s.url)}" target="_blank" rel="noopener">Mở video</a>` : ''}</div>`;
  }

  function panelHtml() {
    const x = state.open;
    if (!x) return `<div class="card card-pad muted">Chọn một thẻ để xem và sửa.</div>`;
    const t = TABS.find((y) => y[0] === state.tab);
    return `<div class="fw-tabs" role="tablist">${TABS.map(([k, l, i]) => `<button type="button" class="fw-tab ${state.tab === k ? 'on' : ''}" role="tab" aria-selected="${state.tab === k}" data-tab="${k}">${icon(i)}<span>${l}</span></button>`).join('')}</div>
      <div class="card fw-panel"><div class="fw-panel-head">${icon(t[2])}<b>${t[1]}</b><span class="spacer"></span>
        <button type="button" class="btn sm primary" data-save>${icon('check')} Lưu${state.dirty ? ' *' : ''}</button>
        <button type="button" class="btn sm" data-drop>${x.status === 'dropped' ? 'Đưa lại vào lô' : 'Bỏ thẻ'}</button>
        <button type="button" class="btn sm" data-remove>${icon('trash')}</button></div>
      <div class="fw-body" data-ai-slot>${state.tab === 'idea' ? ideaTab() : state.tab === 'checks' ? checksTab() : sourceTab()}</div></div>`;
  }

  function render() {
    const { live, outlier: fromWinners, other, ready, chosen } = b.counts; // renamed here: web code keeps clear of the v0 field name
    const closed = b.batch.status !== 'open';
    root.innerHTML = `
      <div class="page-head"><div><h1>${icon('bulb')} Bảng ý tưởng</h1>
        <p>Ý tưởng làm theo lô 10, mỗi thẻ được chấm bằng sáu câu hỏi của Kallaway. Câu 1 do app tra trong Thư viện gạch.</p></div>
        <div class="row"><select class="select input" data-batch style="width:auto">${b.batches.map((x) => `<option value="${x.id}" ${x.id === b.batch.id ? 'selected' : ''}>${esc(x.title)}${x.status === 'open' ? ' (đang mở)' : ''} · ${x.live} thẻ</option>`).join('')}</select>
          <a class="btn" href="${ideas.exportUrl(b.batch.id)}">${icon('download')} Markdown</a><button type="button" class="btn" data-new-batch>Mở lô mới</button>
          <button type="button" class="btn primary" data-new ${closed ? 'disabled' : ''}>${icon('plus')} Thẻ tự nghĩ</button></div></div>
      ${closed ? `<div class="callout">Lô này đã đóng ${b.batch.closedAt ? ago(b.batch.closedAt) : ''}. Thẻ mới vào lô đang mở.</div>` : ''}
      <div class="card card-pad bd-head"><b>${esc(b.batch.title)}</b><span>${live}/10 thẻ</span><span class="muted">${fromWinners} từ video đã thắng · ${other} khác · ${ready} đủ căn cứ để chốt · ${chosen} đã chốt</span></div>
      ${b.nudge ? `<div class="callout info">${esc(b.nudge)}</div>` : ''}
      <div data-err></div>
      <div class="bd-grid"><div class="card bd-list">${b.cards.length ? b.cards.map(rowHtml).join('') : emptyState('Lô còn trống', ' Tạo thẻ tự nghĩ, hoặc bấm "Tạo ý tưởng" ở Thư viện gạch, Soulprint hay báo cáo 5W1H.')}</div>
        <div class="bd-panel">${panelHtml()}</div></div>`;
  }
  const fail = (e) => { const box = root.querySelector('[data-err]'); if (box) box.innerHTML = /đủ 10 thẻ/.test(e?.message ?? '') ? `<div class="callout">${esc(e.message)} <button type="button" class="btn sm" data-new-batch>Mở lô mới</button></div>` : errorCallout(e); };

  function openCard(id) {
    const x = b.cards.find((y) => y.id === Number(id));
    if (!x) return;
    state.open = x;
    state.draft = { status: x.status, card: structuredClone(x.card) };
    state.dirty = false;
    state.suggestion = null;
    setUrl(PATH, { batch: b.batch.id, card: x.id });
    render();
  }
  async function reload(batch = b.batch.id, cardId = state.open?.id) {
    b = await ideas.board(batch);
    state.open = null;
    if (cardId) openCard(cardId);
    else render();
  }
  async function save(patch) {
    try {
      const x = await ideas.update(state.open.id, patch ?? { status: state.draft.status, ...state.draft.card });
      await reload(b.batch.id, x.id);
      toast('Đã lưu thẻ');
    } catch (e) { fail(e); }
  }

  root.addEventListener('input', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.dataset.path) set(state.draft, el.dataset.path, el.value || (el.tagName === 'SELECT' && el.dataset.path !== 'card.pillar' ? null : el.value));
    else if (el.dataset.lego) {
      const [key, k] = el.dataset.lego.split(':');
      const list = state.draft.card[key];
      state.draft.card[key] = el.checked ? [...new Set([...list, k])] : list.filter((y) => y !== k);
    } else return;
    if (!state.dirty) { state.dirty = true; const s = root.querySelector('[data-save]'); if (s) s.append(' *'); }
  });
  root.addEventListener('change', async (e) => {
    const el = /** @type {HTMLSelectElement} */ (e.target);
    if (el.dataset.batch !== undefined) { setUrl(PATH, { batch: el.value }); await reload(Number(el.value), null); }
  });
  root.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('button'));
    if (!t) return;
    const d = t.dataset;
    try {
      if (d.open) openCard(d.open);
      else if (d.tab) { state.tab = d.tab; state.suggestion = null; render(); }
      else if (d.save !== undefined) await save();
      else if (d.drop !== undefined) await save({ status: state.open.status === 'dropped' ? 'draft' : 'dropped' });
      else if (d.remove !== undefined) {
        if (!t.dataset.armed) { t.dataset.armed = '1'; t.textContent = 'Bấm lần nữa để xoá hẳn'; return; }
        await ideas.remove(state.open.id);
        setUrl(PATH, { batch: b.batch.id });
        await reload(b.batch.id, null);
      } else if (d.ai) {
        state.busy = d.ai;
        state.suggestion = null;
        render();
        try {
          const r = await ideas.assist(d.ai, state.open.id, state.draft.card);
          state.suggestion = { action: d.ai, value: r.suggestion };
        } finally { state.busy = ''; render(); }
      } else if (d.accept !== undefined) {
        const s = state.suggestion;
        const c = state.draft.card;
        if (s.action === 'titles') c.title = s.value.titles[Number(/** @type {HTMLInputElement|null} */ (root.querySelector('input[name="bd-title"]:checked'))?.value ?? 0)];
        else {
          const v = s.value;
          Object.assign(c, { topic: v.topic || c.topic, angle: v.angle || c.angle, belief: { common: v.belief.common || c.belief.common, reality: v.belief.reality || c.belief.reality }, keep: v.keep.length || v.remix.length ? v.keep : c.keep, remix: v.keep.length || v.remix.length ? v.remix : c.remix });
          c.pain = { ...c.pain, text: v.pain || c.pain.text };
        }
        state.suggestion = null;
        state.dirty = true;
        render();
      } else if (d.reject !== undefined) { state.suggestion = null; render(); }
      else if (d.new !== undefined) { const x = await ideas.create('self'); await reload(x.batchId, x.id); }
      else if (d.newBatch !== undefined) { const nb = await ideas.newBatch(); setUrl(PATH, { batch: nb.batch.id }); b = nb; state.open = null; render(); }
    } catch (err) { fail(err); }
  });

  render();
  if (params.from) {
    try {
      const x = await ideas.create(params.from);
      await reload(x.batchId, x.id);
      toast('Đã tạo thẻ ý tưởng');
    } catch (e) {
      setUrl(PATH, {});
      fail(e);
    }
  } else if (params.card) openCard(params.card);
}
