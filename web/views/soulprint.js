// "Soulprint": the root profile of the owner's content (game, avatar, pain bank, authority statement, pillars…).
// Three tabs: the form, a twelve-question brainstorm, and import from a file. AI buttons only appear with an API key
// and only ever propose: a suggestion is shown with Nhận / Bỏ, and nothing is saved until the owner presses Lưu.
import { soulprint } from '../http/client.js';
import { esc, icon, toast, ago, errorCallout } from '../lib.js';

const TABS = [['form', 'Hồ sơ', 'target'], ['brainstorm', 'Brainstorm', 'bulb'], ['import', 'Nhập từ file', 'download']];
const STRENGTHS = [['', 'Chưa chấm'], ['strong', 'Mạnh'], ['possible', 'Có thể'], ['no', 'Chưa']];
/** Where a draft from a file or a brainstorm answer lands when the owner adds it to the profile. */
const PRIMARY = { statement: 'statement.chosen', avatar: 'avatar.portrait', advantage: 'advantage', business: 'business.note', voice: 'voice', game: 'gameReason', dreamOutcome: 'dreamOutcome', oneThing: 'oneThing', filter: 'filter', hypothesis: 'hypothesis.lane' };

const get = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);
function set(o, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((v, k) => v[k], o)[last] = value;
}
const linesOf = (text) => String(text || '').split('\n').map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
/** "@handle" or a link → a channel row. */
function channelOf(line) {
  const url = /^https?:\/\//i.test(line) ? line : '';
  const platform = /tiktok\.com/i.test(line) ? 'tiktok' : /youtu\.?be/i.test(line) ? 'youtube' : 'other';
  return { platform, handle: url ? (url.match(/@[\w.-]+/)?.[0] ?? '') : line, url };
}

export async function mount(root, params) {
  const data = await soulprint.get();
  const seeds = await soulprint.seeds().catch(() => ({ channels: [], pains: [], avatar: [], pillars: [] }));
  const state = { p: data.profile, readiness: data.readiness, updatedAt: data.updatedAt, ai: data.ai, tab: TABS.some((t) => t[0] === params.tab) ? params.tab : 'form', q: 0, dirty: false, drafts: null, suggestion: null, busy: '' };
  const { questions, intro, gameTable, sections } = data;
  /** Text pasted or loaded on the import tab; kept here so re-rendering does not lose it. */
  let importText = '';

  const aiBtn = (action, label) => (state.ai ? `<button type="button" class="btn sm" data-ai="${action}" ${state.busy ? 'disabled' : ''}>${icon('bolt')} ${state.busy === action ? 'Đang hỏi AI…' : label}</button>` : '');
  const cap = (label) => `<div class="fw-cap">${label}</div>`;
  const input = (path, label, ph = '') => `<div class="fw-field">${cap(label)}<input class="input" data-path="${path}" value="${esc(get(state.p, path) ?? '')}" placeholder="${esc(ph)}"></div>`;
  const area = (path, label, rows = 3, ph = '') => `<div class="fw-field">${cap(label)}<textarea class="input" rows="${rows}" data-path="${path}" placeholder="${esc(ph)}">${esc(get(state.p, path) ?? '')}</textarea></div>`;
  const lines = (path, label, ph = 'Mỗi dòng một ý') => `<div class="fw-field">${cap(label)}<textarea class="input" rows="3" data-lines="${path}" placeholder="${esc(ph)}">${esc((get(state.p, path) ?? []).join('\n'))}</textarea></div>`;
  const seedRow = (kind, list, text) => (list.length ? `<div class="sp-seeds"><span class="muted small">Gợi ý từ dữ liệu của bạn:</span>${list.map((s, i) => `<button type="button" class="fw-chip" data-seed="${kind}:${i}">+ ${esc(text(s))}</button>`).join('')}</div>` : '');
  const panel = (key, iconName, body, extra = '') => `<div class="card fw-panel sp-section" data-section="${key}"><div class="fw-panel-head">${icon(iconName)}<b>${esc(sections[key])}</b><span class="spacer"></span>${extra}</div><div class="fw-body">${suggestionFor(key)}${body}</div></div>`;

  /** The pending AI suggestion, drawn inside the section it belongs to. */
  function suggestionFor(key) {
    const s = state.suggestion;
    if (!s || s.section !== key) return '';
    const v = s.value;
    const body = s.action === 'avatar' ? `<p><b>${esc(v.name)}</b> ${esc(v.tag)}</p><p>${esc(v.portrait)}</p>${[['Tin', v.believes], ['Sợ', v.fears], ['Đã thử', v.tried], ['Hay than', v.complains]].map(([l, a]) => (a.length ? `<p class="small"><b>${l}:</b> ${esc(a.join(' · '))}</p>` : '')).join('')}`
      : s.action === 'pains' ? `<ol>${v.pains.map((x) => `<li>${esc(x.text)} <span class="muted small">${x.type === 'broad' ? 'lớn' : 'nhỏ'}, độ đau ${x.pain}/5</span></li>`).join('')}</ol>`
      : s.action === 'statement' ? `<ol>${v.options.map((o, i) => `<li>${i === v.pick ? `<b>${esc(o)}</b> <span class="fw-chip">nên chọn</span>` : esc(o)}</li>`).join('')}</ol><p class="small">${esc(v.why)}</p>`
      : s.action === 'check' ? (v.issues.length ? `<ul>${v.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>Không thấy chỗ nào mâu thuẫn.</p>')
      : `<ul>${v.attributes.filter((a) => a.strength).map((a) => `<li><b>${esc(a.name)}:</b> ${esc(STRENGTHS.find((x) => x[0] === a.strength)[1])}. ${esc(a.evidence)}</li>`).join('')}</ul><p>${esc(v.lane)}</p><p class="muted small">Giả thuyết từ hiểu biết của bạn, chưa đối chiếu với đối thủ.</p>`;
    return `<div class="callout info sp-suggest"><div class="fw-cap">AI đề xuất</div>${body}<div class="row" style="margin-top:8px">${s.action === 'check' ? '' : `<button type="button" class="btn sm primary" data-accept>${icon('check')} Nhận</button>`}<button type="button" class="btn sm" data-reject>${s.action === 'check' ? 'Đóng' : 'Bỏ'}</button></div></div>`;
  }

  function formHtml() {
    const p = state.p;
    const r = state.readiness;
    const pains = p.pains.map((x, i) => `<div class="sp-row"><input class="input" data-path="pains.${i}.text" value="${esc(x.text)}">
      <select class="select input" data-path="pains.${i}.type"><option value="broad" ${x.type === 'broad' ? 'selected' : ''}>Lớn</option><option value="tactical" ${x.type === 'tactical' ? 'selected' : ''}>Nhỏ</option></select>
      <select class="select input" data-num data-path="pains.${i}.pain" title="Độ đau">${[5, 4, 3, 2, 1].map((n) => `<option ${x.pain === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
      ${state.dirty ? '' : `<a class="icon-btn" href="#/board?from=pain:${i}" title="Tạo ý tưởng từ nỗi đau này" aria-label="Tạo ý tưởng">${icon('bulb')}</a>`}<button type="button" class="icon-btn" data-del="pains:${i}" title="Xoá" aria-label="Xoá nỗi đau">${icon('x')}</button></div>`).join('');
    const pillars = p.pillars.map((x, i) => `<div class="sp-pillar"><div class="sp-row"><input class="input" data-path="pillars.${i}.name" value="${esc(x.name)}" placeholder="Tên trụ">
      <button type="button" class="icon-btn" data-del="pillars:${i}" title="Xoá" aria-label="Xoá trụ">${icon('x')}</button></div>
      ${input(`pillars.${i}.belief`, 'NIỀM TIN ĐI NGƯỢC SỐ ĐÔNG')}${lines(`pillars.${i}.proof`, 'BẰNG CHỨNG')}
      ${lines(`pillars.${i}.subtopics`, `CHỦ ĐỀ CON (${x.subtopics.length}/20)`, 'Thử kể 20 chủ đề con, mỗi dòng một chủ đề')}</div>`).join('');
    return `
      <div class="callout ${r.ready ? 'info' : ''}"><b>Hồ sơ đủ dùng: ${r.done}/${r.total}.</b> ${r.ready ? 'Các tính năng AI đã biết kênh này dành cho ai.' : `Còn thiếu: ${esc(r.checks.filter((c) => !c.ok).map((c) => c.label).join(', '))}.`}
        ${state.updatedAt ? `<span class="muted small"> Lưu lần cuối ${ago(state.updatedAt)}.</span>` : ''}</div>
      ${panel('channels', 'users', `<div class="fw-field">${cap('KÊNH (MỖI DÒNG MỘT HANDLE HOẶC LINK)')}<textarea class="input" rows="2" data-channels>${esc(p.channels.map((c) => c.url || c.handle).join('\n'))}</textarea></div>
        <label class="check"><input type="checkbox" data-check="startingFromZero" ${p.startingFromZero ? 'checked' : ''}> Bắt đầu từ số 0</label>${seedRow('channels', seeds.channels, (s) => s.handle)}`)}
      ${panel('business', 'key', `${input('business.offer', 'BÁN GÌ')}${input('business.price', 'GIÁ')}${input('business.buyer', 'AI TRẢ TIỀN')}${input('business.howBought', 'MUA BẰNG CÁCH NÀO')}
        <div class="fw-field">${cap('NGƯỜI XEM CÓ PHẢI NGƯỜI TRẢ TIỀN')}<select class="select input" data-bool="business.viewerIsBuyer"><option value="">Chưa rõ</option><option value="true" ${p.business.viewerIsBuyer === true ? 'selected' : ''}>Có</option><option value="false" ${p.business.viewerIsBuyer === false ? 'selected' : ''}>Không</option></select></div>${area('business.note', 'GHI CHÚ')}`)}
      ${panel('game', 'target', `<div class="fw-field">${cap('GAME')}<div class="sp-games">${[['reach', 'Rộng', 'Views tối đa, đo bằng view và lượt chia sẻ'], ['conversion', 'Trúng', 'Views đúng người, đo bằng khách']].map(([k, t, d]) => `<button type="button" class="sp-game ${p.game === k ? 'on' : ''}" data-game="${k}"><b>${t}</b><span class="muted small">${d}</span></button>`).join('')}</div></div>
        ${input('objective', 'MỤC TIÊU 12–18 THÁNG')}${area('gameReason', 'VÌ SAO CHỌN GAME NÀY')}`, aiBtn('check', 'Kiểm tra khớp'))}
      ${panel('avatar', 'users', `${input('avatar.name', 'TÊN')}${input('avatar.tag', 'MÔ TẢ NGẮN')}${area('avatar.portrait', 'CHÂN DUNG', 4)}${lines('avatar.believes', 'TIN GÌ')}${lines('avatar.fears', 'SỢ GÌ')}${lines('avatar.tried', 'ĐÃ THỬ GÌ')}${lines('avatar.complains', 'HAY THAN GÌ')}
        ${seedRow('avatar', seeds.avatar, (s) => `${s.text} (${s.count} bình luận)`)}`, aiBtn('avatar', 'Điền từ câu trả lời'))}
      ${panel('dreamOutcome', 'flame', area('dreamOutcome', 'PHẦN THƯỞNG CUỐI CÙNG'))}
      ${panel('pains', 'message', `<div class="fw-field">${cap(`NỖI ĐAU (${p.pains.length}), ĐAU NHẤT Ở TRÊN`)}${pains}<button type="button" class="btn sm" data-add="pains">${icon('plus')} Thêm nỗi đau</button></div>
        ${seedRow('pains', seeds.pains, (s) => `${s.text} (${s.count})`)}`, aiBtn('pains', 'Xếp hạng'))}
      ${panel('advantage', 'bolt', area('advantage', 'LỢI THẾ', 4))}
      ${panel('oneThing', 'bulb', input('oneThing', 'KHI AI ĐÓ CẦN ______ THÌ NGHĨ TỚI TÔI'))}
      ${panel('statement', 'compass', `${area('statement.chosen', 'CÂU ĐÃ CHỌN', 2, 'Tôi giúp [ai] với [việc gì] theo cách [cách của tôi]')}${lines('statement.alternates', 'DẠNG KHÁC')}${area('statement.why', 'VÌ SAO CHỌN CÂU NÀY', 2)}`, aiBtn('statement', 'Soạn câu định vị'))}
      ${panel('filter', 'check', area('filter', 'HỎI TRƯỚC MỖI VIDEO', 2, 'Cái này có thật sự có giá trị với … không?'))}
      ${panel('pillars', 'bars', `<div class="fw-field">${cap(`TRỤ NỘI DUNG (${p.pillars.length}/5)`)}${pillars}<button type="button" class="btn sm" data-add="pillars" ${p.pillars.length >= 5 ? 'disabled' : ''}>${icon('plus')} Thêm trụ</button></div>
        ${seedRow('pillars', seeds.pillars, (s) => s.text)}`)}
      ${panel('hypothesis', 'eye', `<p class="muted small">Giả thuyết từ hiểu biết của bạn, chưa đối chiếu với đối thủ.</p>${p.hypothesis.attributes.map((a, i) => `<div class="sp-row"><span class="sp-attr">${esc(a.name)}</span>
        <select class="select input" data-path="hypothesis.attributes.${i}.strength">${STRENGTHS.map(([v, l]) => `<option value="${v}" ${(a.strength ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="input" data-path="hypothesis.attributes.${i}.evidence" value="${esc(a.evidence)}" placeholder="Căn cứ"></div>`).join('')}${area('hypothesis.lane', 'HƯỚNG CÓ THỂ CHIẾM')}`, aiBtn('hypothesis', 'Đọc giả thuyết'))}
      ${panel('voice', 'message', area('voice', 'GIỌNG NÓI, CÁ TÍNH'))}`;
  }

  function brainstormHtml() {
    const q = questions[state.q];
    const answer = state.p.answers[q.id] ?? '';
    const s = state.suggestion?.action === 'tidy' ? state.suggestion.value : null;
    return `<div class="card fw-panel"><div class="fw-panel-head">${icon('bulb')}<b>Câu ${state.q + 1}/${questions.length}: ${esc(q.title)}</b></div><div class="fw-body">
      ${state.q === 0 ? `<p class="muted">${esc(intro)}</p>` : ''}
      <div class="fw-field">${cap('CÂU HỎI')}<div class="fw-value">${esc(q.ask)}</div></div>
      ${q.id === 'q2' ? `<div class="table-wrap"><table class="t sp-table"><thead><tr>${gameTable.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${gameTable.rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="sp-games">${[['reach', 'Chọn Rộng'], ['conversion', 'Chọn Trúng']].map(([k, t]) => `<button type="button" class="sp-game ${state.p.game === k ? 'on' : ''}" data-game="${k}"><b>${t}</b></button>`).join('')}</div>` : ''}
      <div class="fw-field">${cap('CÂU TRẢ LỜI CỦA BẠN')}<textarea class="input" rows="6" data-answer placeholder="Cứ viết dài, lộn xộn cũng được">${esc(answer)}</textarea></div>
      ${s ? `<div class="callout info sp-suggest"><div class="fw-cap">AI gọn lại</div><p>${esc(s.summary)}</p>${s.guess ? `<p><i>${esc(s.guess)}</i></p>` : ''}<div class="row" style="margin-top:8px"><button type="button" class="btn sm primary" data-accept>${icon('check')} Nhận</button><button type="button" class="btn sm" data-reject>Bỏ</button></div></div>` : ''}
      <details class="sp-help"><summary>Trả lời còn chung chung? Xem câu đẩy${q.example ? ' và ví dụ' : ''}</summary>${q.push ? `<p>${esc(q.push)}</p>` : ''}${q.example ? `<p><span class="fw-chip outline">Chưa đạt</span> ${esc(q.example.bad)}</p><p><span class="fw-chip">Đạt</span> ${esc(q.example.good)}</p>` : ''}</details>
      <div class="row" style="margin-top:14px"><button type="button" class="btn" data-prev ${state.q === 0 ? 'disabled' : ''}>Lùi</button>${aiBtn('tidy', 'Gọn lại')}<span class="spacer"></span>
        <button type="button" class="btn primary" data-next>${state.q === questions.length - 1 ? 'Xong, về Hồ sơ' : 'Lưu và sang câu sau'}</button></div>
      <p class="muted small">Câu trả lời được lưu nguyên văn. Nếu ô "${esc(sections[q.section])}" trong Hồ sơ còn trống, câu trả lời này được chép vào đó; ô đã có nội dung thì giữ nguyên.</p></div></div>`;
  }

  function importHtml() {
    const d = state.drafts;
    return `<div class="card fw-panel"><div class="fw-panel-head">${icon('download')}<b>Nhập từ file</b></div><div class="fw-body">
      <p class="muted">Dán nội dung BRAND.md, strategy.md hoặc positioning.md, hoặc chọn file. App tách theo tiêu đề cấp 2 thành bản nháp cho từng mục. Bản nháp chỉ vào hồ sơ khi bạn bấm thêm, và không ghi đè ô đã có nội dung.</p>
      <div class="fw-field">${cap('NỘI DUNG FILE')}<textarea class="input" rows="8" data-import placeholder="## Lời hứa&#10;…">${esc(importText)}</textarea></div>
      <div class="row"><input type="file" accept=".md,.txt,text/markdown,text/plain" data-file><span class="spacer"></span><button type="button" class="btn primary" data-split>Tách theo tiêu đề</button>${aiBtn('import', 'Điền từ file')}</div>
      ${d ? `<div class="fw-field">${cap('BẢN NHÁP')}${d.cut ? '<p class="callout">File dài hơn 50.000 ký tự: chỉ đọc 50.000 ký tự đầu.</p>' : ''}
        ${Object.keys(d.drafts).length ? Object.entries(d.drafts).map(([k, t]) => `<div class="sp-draft"><div class="row"><span class="fw-chip">${esc(sections[k] ?? k)}</span><span class="spacer"></span>${k === 'pillars' || k === 'channels' ? '<span class="muted small">Tự chép sang ô tương ứng</span>' : `<button type="button" class="btn sm" data-use="${esc(k)}">${icon('plus')} Thêm vào hồ sơ</button>`}</div><pre>${esc(t)}</pre></div>`).join('') : '<p class="muted">Không tách được mục nào theo tiêu đề.</p>'}
        ${d.unsorted?.length ? `${cap('CHƯA XẾP ĐƯỢC')}${d.unsorted.map((u) => `<div class="sp-draft">${u.heading ? `<b>${esc(u.heading)}</b>` : ''}<pre>${esc(u.text)}</pre></div>`).join('')}` : ''}</div>` : ''}</div></div>`;
  }

  function render() {
    root.innerHTML = `
      <div class="page-head"><div><h1>${icon('target')} Soulprint</h1><p>Hồ sơ gốc của content: bạn chơi game nào, nói cho ai, các trụ nội dung là gì. Mọi tính năng AI đọc hồ sơ này.</p></div>
        <div class="row"><a class="btn" href="${soulprint.exportUrl()}">${icon('download')} Markdown</a><button type="button" class="btn primary" data-save>${icon('check')} Lưu${state.dirty ? ' *' : ''}</button></div></div>
      <div class="fw-tabs" role="tablist">${TABS.map(([k, t, i]) => `<button type="button" class="fw-tab ${state.tab === k ? 'on' : ''}" role="tab" aria-selected="${state.tab === k}" data-tab="${k}">${icon(i)}<span>${t}</span></button>`).join('')}</div>
      <div data-err></div>
      <div data-body>${state.tab === 'form' ? formHtml() : state.tab === 'brainstorm' ? brainstormHtml() : importHtml()}</div>`;
  }
  const fail = (e) => { const box = root.querySelector('[data-err]'); if (box) box.innerHTML = errorCallout(e); };

  async function save(quiet = false) {
    try {
      const r = await soulprint.save(state.p);
      Object.assign(state, { p: r.profile, readiness: r.readiness, updatedAt: r.updatedAt, dirty: false });
      if (r.trimmed.length) toast(`Đã lưu. Danh sách quá dài bị cắt bớt ở: ${r.trimmed.map((k) => sections[k]).join(', ')}`);
      else if (!quiet) toast('Đã lưu Soulprint');
      render();
    } catch (e) {
      render();
      fail(e);
    }
  }
  /** Adds text to a profile field without replacing what is there. */
  function addTo(section, text) {
    if (section === 'pains') {
      const have = new Set(state.p.pains.map((x) => x.text.toLowerCase()));
      for (const t of linesOf(text)) if (!have.has(t.toLowerCase())) state.p.pains.push({ text: t, type: 'tactical', pain: 3, source: 'self' });
    } else if (PRIMARY[section]) {
      const cur = get(state.p, PRIMARY[section]) || '';
      set(state.p, PRIMARY[section], cur ? `${cur}\n\n${text}` : text);
    }
    state.dirty = true;
  }
  /** A brainstorm answer fills its profile field only while that field is empty. */
  function carryAnswer(q, answer) {
    if (!answer) return;
    if (q.target === 'channels') { if (!state.p.channels.length) state.p.channels = linesOf(answer).filter((l) => /^@|https?:\/\//i.test(l)).map(channelOf); }
    else if (q.target === 'pains') { if (!state.p.pains.length) addTo('pains', answer); }
    else if (q.target === 'pillars') { if (!state.p.pillars.length) state.p.pillars = linesOf(answer).slice(0, 5).map((name) => ({ name: name.slice(0, 100), belief: '', proof: [], subtopics: [] })); }
    else if (!get(state.p, q.target)) set(state.p, q.target, answer);
  }
  function accept() {
    const s = state.suggestion;
    if (!s) return;
    const v = s.value;
    if (s.action === 'tidy') state.p.answers[questions[state.q].id] = v.summary;
    else if (s.action === 'avatar') state.p.avatar = v;
    else if (s.action === 'pains') state.p.pains = v.pains;
    else if (s.action === 'statement') state.p.statement = { chosen: v.options[v.pick], alternates: v.options.filter((_, i) => i !== v.pick), why: v.why };
    else if (s.action === 'hypothesis') state.p.hypothesis = v;
    state.suggestion = null;
    state.dirty = true;
    render();
  }
  async function ask(action) {
    state.busy = action;
    state.suggestion = null;
    render();
    try {
      const q = questions[state.q];
      const input = action === 'tidy' ? { profile: state.p, questionId: q.id, answer: state.p.answers[q.id] ?? '' } : action === 'import' ? { profile: state.p, text: importText } : { profile: state.p };
      const r = await soulprint.assist(action, input);
      state.busy = '';
      if (action === 'import') state.drafts = { drafts: r.suggestion.drafts, unsorted: [], cut: false };
      else state.suggestion = { action, section: action === 'check' ? 'game' : action, value: r.suggestion };
      render();
    } catch (e) {
      state.busy = '';
      render();
      fail(e);
    }
  }

  root.addEventListener('input', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.dataset.path) set(state.p, el.dataset.path, el.dataset.num !== undefined ? Number(el.value) : el.dataset.path.endsWith('.strength') ? el.value || null : el.value);
    else if (el.dataset.lines) set(state.p, el.dataset.lines, linesOf(el.value));
    else if (el.dataset.bool) set(state.p, el.dataset.bool, el.value === '' ? null : el.value === 'true');
    else if (el.dataset.check) state.p[el.dataset.check] = el.checked;
    else if (el.dataset.channels !== undefined) state.p.channels = linesOf(el.value).map(channelOf);
    else if (el.dataset.answer !== undefined) state.p.answers[questions[state.q].id] = el.value;
    else if (el.dataset.import !== undefined) { importText = el.value; return; }
    else return;
    if (!state.dirty) { state.dirty = true; const b = root.querySelector('[data-save]'); if (b && !b.textContent.includes('*')) b.append(' *'); }
  });
  root.addEventListener('change', async (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.dataset.file === undefined || !el.files?.[0]) return;
    importText = await el.files[0].text();
    /** @type {HTMLTextAreaElement} */ (root.querySelector('[data-import]')).value = importText;
  });
  root.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (e.target).closest('button'));
    if (!t) return;
    const d = t.dataset;
    if (d.tab) { state.tab = d.tab; state.suggestion = null; render(); }
    else if (d.save !== undefined) save();
    else if (d.game) { state.p.game = d.game; state.dirty = true; render(); }
    else if (d.add === 'pains') { state.p.pains.push({ text: '', type: 'tactical', pain: 3, source: 'self' }); render(); }
    else if (d.add === 'pillars') { state.p.pillars.push({ name: '', belief: '', proof: [], subtopics: [] }); render(); }
    else if (d.del) { const [list, i] = d.del.split(':'); state.p[list].splice(Number(i), 1); state.dirty = true; render(); }
    else if (d.seed) {
      const [kind, i] = d.seed.split(':');
      const s = seeds[kind][Number(i)];
      if (kind === 'channels') state.p.channels.push(s);
      else if (kind === 'pains') state.p.pains.push({ text: s.text, type: 'tactical', pain: 3, source: s.source });
      else if (kind === 'avatar') state.p.avatar.tag = state.p.avatar.tag || s.text;
      else if (state.p.pillars.length < 5) state.p.pillars.push({ name: s.text, belief: '', proof: [], subtopics: [] });
      state.dirty = true;
      render();
    }
    else if (d.ai) ask(d.ai);
    else if (d.accept !== undefined) accept();
    else if (d.reject !== undefined) { state.suggestion = null; render(); }
    else if (d.prev !== undefined) { state.q = Math.max(0, state.q - 1); state.suggestion = null; render(); }
    else if (d.next !== undefined) {
      const q = questions[state.q];
      carryAnswer(q, (state.p.answers[q.id] ?? '').trim());
      state.suggestion = null;
      if (state.q === questions.length - 1) state.tab = 'form';
      else state.q += 1;
      await save(true);
    }
    else if (d.split !== undefined) {
      try { state.drafts = await soulprint.importText(importText); render(); } catch (err) { fail(err); }
    }
    else if (d.use) { addTo(d.use, state.drafts.drafts[d.use]); delete state.drafts.drafts[d.use]; toast(`Đã thêm vào ${sections[d.use]}. Bấm Lưu để giữ lại.`); render(); }
  });
  render();
}
