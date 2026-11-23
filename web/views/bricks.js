// "Swipe File": videos broken into bricks by AI (topic, angle, belief, hook, story, audience). A table to filter,
// and a detail panel whose tabs follow the owner's reference. Every AI-written brick shows its evidence on click and
// can be corrected; corrected fields are marked and survive a re-extract.
import { bricks } from '../http/client.js';
import { esc, icon, fmt, ago, toast, runJob, progressCard, updateProgress, errorCallout, emptyState, setUrl } from '../lib.js';

const PATH = '/bricks';
const KIND = 'brick_extract';
const NAMES = { tiktok: 'TikTok', youtube: 'YouTube' };
const FIT = { yes: 'Hợp', no: 'Không hợp', unclear: 'Chưa rõ' };
const TABS = [['transcript', 'Transcript', 'message'], ['idea', 'Idea Analysis', 'bulb'], ['hook', 'Hook', 'key'], ['story', 'Storytelling Format', 'bars'], ['visual', 'Visual Layout', 'eye'], ['audience', 'Khán giả', 'users'], ['dive', 'Đào sâu', 'compass']];
const NO_KEY = 'Chưa nhập API key OpenRouter';
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export async function mount(root, params) {
  let lib = await bricks.list();
  const state = { filter: { q: '', platform: '', channel: '', pillar: '', concept: '', archetype: '', hot: false }, open: /** @type {any} */ (null), tab: 'idea', evidence: /** @type {number[]} */ ([]), editing: '', busy: false, compare: '' };

  const chip = (t, cls = '') => (t ? `<span class="fw-chip ${cls}">${esc(t)}</span>` : '<span class="muted">–</span>');
  const options = (label, values, current) => `<option value="">${label}</option>${values.map((v) => `<option ${v === current ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;
  const uniq = (fn) => [...new Set(lib.rows.map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));

  function visible() {
    const f = state.filter;
    const q = f.q.trim().toLowerCase();
    return lib.rows.filter((r) => (!f.platform || r.platform === f.platform) && (!f.channel || r.meta.channelTitle === f.channel) && (!f.pillar || r.bricks.pillar === f.pillar)
      && (!f.concept || r.bricks.concept === f.concept || r.bricks.extraConcepts.includes(f.concept)) && (!f.archetype || r.bricks.hook.archetype === f.archetype) && (!f.hot || r.meta.score != null)
      && (!q || [r.meta.title, r.bricks.topic, r.bricks.hook.spoken, r.bricks.angle].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (f.hot ? (b.meta.score ?? 0) - (a.meta.score ?? 0) : b.analyzedAt - a.analyzedAt));
  }

  /** One video of the Swipe File: what it is, how well it did, its hook, and its elements as chips. @param {any} r */
  const cardHtml = (r) => `<div class="br-card" role="button" data-open="${esc(r.platform)}:${esc(r.videoId)}" tabindex="0">
      <div class="br-card-top"><span class="badge plain">${NAMES[r.platform] ?? ''}</span>${r.meta.score != null ? `<span class="badge accent" title="Outlier = view ÷ sub của kênh">Outlier ×${esc(r.meta.score)}</span>` : ''}${r.bricks.fit.verdict === 'yes' ? '<span class="badge good">Hợp kênh</span>' : r.bricks.fit.verdict === 'no' ? '<span class="badge plain">Không hợp kênh</span>' : ''}</div>
      <b class="br-card-title">${esc(r.meta.title || r.videoId)}</b>
      <div class="muted small">${esc(r.meta.channelTitle || '')}${r.meta.channelTitle ? ' · ' : ''}${ago(r.analyzedAt)}${r.editedPaths.length ? ' · đã sửa tay' : ''}${r.bricks.flags.noTranscript ? ' · không có lời thoại' : ''}</div>
      ${r.bricks.hook.spoken ? `<div class="br-card-hook">“${esc(r.bricks.hook.spoken)}”</div>` : ''}
      ${r.bricks.topic ? `<div class="small">${esc(r.bricks.topic)}</div>` : ''}
      <div class="br-card-chips">${[r.bricks.pillar, r.bricks.concept, r.bricks.hook.archetype].filter(Boolean).map((t) => chip(t)).join('')}</div>
    </div>`;

  function listHtml() {
    const rows = visible();
    const f = state.filter;
    return `
      <div class="card card-pad br-add">
        <div class="input-row"><textarea class="input" rows="1" data-links placeholder="Dán link video TikTok hoặc YouTube để breakdown, mỗi dòng một link"></textarea>
          <button type="button" class="btn primary" data-run ${lib.ai ? '' : 'disabled'}>${icon('layers')} Breakdown</button></div>
        ${lib.ai ? '' : `<div class="help muted small">${NO_KEY}. <a href="#/settings">Mở Cài đặt</a></div>`}
        <div data-prog></div><div data-more></div>
      </div>
      ${lib.rows.length ? `<div class="card">
        <div class="br-filters">
          <input class="input" data-f="q" placeholder="Tìm trong tiêu đề, topic, hook" value="${esc(f.q)}">
          <select class="select input" data-f="platform"><option value="">Mọi nền tảng</option>${Object.entries(NAMES).map(([k, l]) => `<option value="${k}" ${f.platform === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <select class="select input" data-f="channel">${options('Mọi kênh', uniq((r) => r.meta.channelTitle), f.channel)}</select>
          <select class="select input" data-f="pillar">${options('Mọi pillar', uniq((r) => r.bricks.pillar), f.pillar)}</select>
          <select class="select input" data-f="concept">${options('Mọi concept', uniq((r) => r.bricks.concept), f.concept)}</select>
          <select class="select input" data-f="archetype">${options('Mọi kiểu hook', uniq((r) => r.bricks.hook.archetype), f.archetype)}</select>
          <label class="check"><input type="checkbox" data-f="hot" ${f.hot ? 'checked' : ''}> Có điểm outlier, cao nhất trước</label>
          <span class="spacer"></span><a class="btn sm" href="${bricks.exportUrl(rows.map((r) => `${r.platform}:${r.videoId}`))}">${icon('download')} Export .md (${rows.length})</a>
        </div>
        <div class="br-cards">${rows.map(cardHtml).join('')}</div>
        ${rows.length ? '' : '<div class="card-pad muted">Không video nào khớp bộ lọc.</div>'}</div>`
        : emptyState('Thư viện còn trống', ' Dán link ở trên, hoặc bấm "Breakdown" trên một báo cáo Phân tích video.')}`;
  }

  /** One field of the detail: uppercase label, the value, its evidence button, and an edit box when the field is editable. */
  function field(cap, path, value, { italic = false, asChip = false, evidence = null, choices = null } = {}) {
    const r = state.open;
    const editable = lib.editable.includes(path);
    const edited = r.editedPaths.includes(path);
    const shown = value ? (asChip ? chip(value) : `<div class="fw-value">${italic ? `<i>${esc(value)}</i>` : esc(value)}</div>`) : '<div class="fw-value muted">(trống)</div>';
    const tools = `${evidence?.length ? `<button type="button" class="btn sm" data-evidence="${evidence.join(',')}">căn cứ</button>` : ''}${editable ? `<button type="button" class="btn sm" data-edit="${path}">${icon('key')} sửa</button>` : ''}${edited ? '<span class="fw-chip outline">đã sửa tay</span>' : ''}`;
    if (state.editing === path) {
      const input = choices ? `<select class="select input" data-edit-value>${['', ...choices].map((c) => `<option ${c === (value ?? '') ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : `<textarea class="input" rows="2" data-edit-value>${esc(value ?? '')}</textarea>`;
      return `<div class="fw-field"><div class="fw-cap">${cap}</div>${input}<div class="row" style="margin-top:6px"><button type="button" class="btn sm primary" data-save-edit="${path}">${icon('check')} Lưu</button><button type="button" class="btn sm" data-cancel-edit>Bỏ</button></div></div>`;
    }
    return `<div class="fw-field"><div class="fw-cap">${cap} <span class="br-tools">${tools}</span></div>${shown}</div>`;
  }

  function tabHtml() {
    const r = state.open;
    const b = r.bricks;
    const ev = b.evidence;
    if (state.tab === 'transcript') {
      if (!r.source.segments.length) return '<div class="fw-field"><div class="fw-value muted">Không có lời thoại: video này được bóc từ tiêu đề và bình luận.</div></div>';
      const typeAt = (s) => b.story.blocks.find((x) => s.start >= x.from && (x.to == null || s.start < x.to))?.type ?? '';
      return `${r.source.truncated ? '<p class="muted small">Video dài: chỉ 20 phút đầu được đọc.</p>' : ''}<div class="br-script">${r.source.segments.map((s) => `<div class="br-line ${typeAt(s) ? `t-${typeAt(s)}` : ''} ${state.evidence.includes(s.i) ? 'hit' : ''}" data-line="${s.i}"><span class="muted small">${clock(s.start)}</span><span>${esc(s.text)}</span>${typeAt(s) ? `<span class="fw-chip soft">${esc(lib.blockLabels[typeAt(s)] ?? typeAt(s))}</span>` : ''}</div>`).join('')}</div>`;
    }
    if (state.tab === 'idea') return field('TOPIC', 'topic', b.topic, { evidence: ev.topic }) + field('PILLAR', 'pillar', b.pillar, { asChip: true })
      + field('IDEA SEED', 'seed', b.seed, { evidence: ev.seed }) + field('UNIQUE ANGLE', 'angle', b.angle, { evidence: ev.angle })
      + field('COMMON BELIEF', 'belief.common', b.belief?.common, { evidence: ev.belief }) + field('CONTRARIAN REALITY', 'belief.reality', b.belief?.reality, { evidence: ev.belief })
      + `<div class="fw-field"><div class="fw-cap">CORE FACTS ${ev.facts.length ? `<span class="br-tools"><button type="button" class="btn sm" data-evidence="${ev.facts.join(',')}">căn cứ</button></span>` : ''}</div>${b.facts.length ? b.facts.map((x) => `<div class="fw-value">${esc(x)}</div>`).join('') : '<div class="fw-value muted">(trống)</div>'}</div>`
      + field('CONCEPT', 'concept', b.concept, { asChip: true, choices: lib.concepts }) + (b.extraConcepts.length ? `<div class="fw-field"><div class="fw-cap">CONCEPT PHỤ</div>${b.extraConcepts.map((c) => chip(c, 'soft')).join(' ')}</div>` : '')
      + `<div class="fw-field"><div class="fw-cap">HỢP KÊNH</div>${chip(FIT[b.fit.verdict], b.fit.verdict === 'yes' ? '' : 'soft')}${b.fit.reason ? `<div class="fw-value">${esc(b.fit.reason)}</div>` : ''}</div>`;
    if (state.tab === 'hook') return field('CATEGORY', 'hook.category', b.hook.category, { asChip: true }) + field('ARCHETYPE', 'hook.archetype', b.hook.archetype, { asChip: true, choices: lib.archetypes })
      + field('FORMULA', 'hook.formula', b.hook.formula, { italic: true }) + field('SPOKEN HOOK', 'hook.spoken', b.hook.spoken, { italic: true });
    if (state.tab === 'story') return field('CATEGORY', 'story.category', b.story.category, { asChip: true }) + field('DESCRIPTION', 'story.description', b.story.description)
      + `<div class="fw-field"><div class="fw-cap">CÁC KHỐI</div>${b.story.blocks.length ? b.story.blocks.map((x) => `<div class="fw-value"><span class="muted small">${clock(x.from)}${x.to != null ? `–${clock(x.to)}` : ''}</span> ${chip(lib.blockLabels[x.type] ?? x.type, 'soft')} ${esc(x.summary)}</div>`).join('') : '<div class="fw-value muted">(trống)</div>'}</div>`;
    if (state.tab === 'visual') return '<p class="muted small">AI chưa xem được hình và nghe được tiếng của video (đang chờ thử nghiệm). Bạn có thể tự ghi lại ba ô này.</p>'
      + field('CATEGORY', 'visual.format', b.visual.format) + field('KEY VISUALS', 'visual.keyVisuals', b.visual.keyVisuals) + field('AUDIO', 'visual.audio', b.visual.audio);
    if (state.tab === 'dive') {
      const d = r.deepDive;
      if (!d) return `<p class="muted">Phân tích 8 bước theo phương pháp Quan sát, Phân tích, Đúc kết: điểm ấn tượng, nội dung theo thời gian, nhận định, giả thiết, yếu tố cốt lõi và bổ trợ, công thức làm lại. AI không xem được hình và không nghe được tiếng, nên mọi nhận định là giả thiết.</p>
        <button type="button" class="btn primary" data-dive ${lib.ai ? '' : 'disabled'}>${icon('compass')} Đào sâu video này</button>${lib.ai ? '' : `<div class="help muted small">${NO_KEY}. <a href="#/settings">Mở Cài đặt</a></div>`}`;
      const cap = (t) => `<div class="fw-cap">${t}</div>`;
      const val = (t) => `<div class="fw-value">${esc(t)}</div>`;
      const mark = (path) => (d.flagged.includes(path) ? ' <span class="fw-chip outline">chưa đủ đời thường</span>' : '');
      const factors = (items, key) => items.map((x, i) => `<div class="fw-value"><b>${esc(x.what)}</b>${mark(`${key}.${i}.what`)} ${esc(x.why)}${mark(`${key}.${i}.why`)}</div>`).join('') || val('(không có)');
      return `<div class="row"><span class="muted small">Viết ${ago(d.at)} bằng ${esc(d.model)}. Mọi nhận định là giả thiết.</span><span class="spacer"></span><a class="btn sm" href="${bricks.deepDiveUrl(r.platform, r.videoId)}">${icon('download')} Export .md</a><button type="button" class="btn sm" data-dive ${lib.ai ? '' : 'disabled'}>${icon('refresh')} Viết lại</button></div>
        <div class="fw-field">${cap('ĐIỂM ẤN TƯỢNG')}${d.impressions.map(val).join('')}</div>
        <div class="fw-field">${cap('HÌNH THỨC')}${val(d.form)}</div>
        <div class="fw-field">${cap('3 GIÂY ĐẦU')}${val(d.timeline.first3s)}</div><div class="fw-field">${cap('10 GIÂY TIẾP')}${val(d.timeline.next10s)}</div><div class="fw-field">${cap('30 GIÂY TIẾP')}${val(d.timeline.next30s)}</div>
        <div class="fw-field">${cap('CÂU KẾT')}${val(d.timeline.ending)}</div><div class="fw-field">${cap('CÁCH TRIỂN KHAI')}${val(d.timeline.overall)}</div>
        <div class="fw-field">${cap('BÌNH LUẬN NÓI GÌ')}${val(d.comments)}</div>
        <div class="fw-field">${cap('NHẬN ĐỊNH')}${val(`Clip nói về: ${d.verdict.about}`)}${val(`Nhắm tới: ${d.verdict.audience}`)}${val(`Cảm xúc: ${d.verdict.emotion}`)}${val(`Thông điệp: ${d.verdict.message}`)}${d.verdict.special.map(val).join('')}</div>
        <div class="fw-field">${cap('GIẢ THIẾT: BỎ ĐI THÌ SAO')}${d.hypotheses.map((h) => val(`${h.factor}: ${h.ifRemoved}`)).join('')}</div>
        <div class="fw-field">${cap('YẾU TỐ CỐT LÕI')}${factors(d.core, 'core')}</div>
        <div class="fw-field">${cap('YẾU TỐ BỔ TRỢ')}${factors(d.support, 'support')}</div>
        <div class="fw-field">${cap('CÔNG THỨC TRIỂN KHAI')}${d.formula.name ? `<span class="fw-chip">${esc(d.formula.name)}</span>${mark('formula.name')}` : ''}${d.formula.appliesTo ? val(`Áp dụng cho: ${d.formula.appliesTo}`) : ''}${d.formula.steps.map((s, i) => `<div class="fw-value">${i + 1}. ${esc(s)}${mark(`formula.steps.${i}`)}</div>`).join('')}</div>
        <div class="fw-field">${cap('TỰ PHẢN BIỆN')}${d.doubts.map(val).join('')}</div>`;
    }
    const byId = new Map(r.source.comments.map((c) => [c.id, c]));
    return b.audience.total ? lib.audience.map(([k, l]) => `<div class="fw-field"><div class="fw-cap">${esc(l)} · ${b.audience.counts[k]}</div>${(b.audience.examples[k] ?? []).map((id) => (byId.has(id) ? `<div class="fw-quote"><i>"${esc(byId.get(id).text)}"</i> <span class="muted small">${fmt(byId.get(id).likes)} like</span></div>` : '')).join('') || '<div class="fw-value muted">–</div>'}</div>`).join('')
      + `<p class="muted small">Đếm trên ${r.source.comments.length} bình luận được chú ý nhất đã có trong app.</p>` : '<div class="fw-field"><div class="fw-value muted">Chưa có bình luận nào của video này trong app.</div></div>';
  }

  function detailHtml() {
    const r = state.open;
    const b = r.bricks;
    const notes = [b.flags.noTranscript ? 'Không có lời thoại: element được lấy từ tiêu đề và bình luận.' : '', b.flags.truncated ? 'Video dài: chỉ 20 phút đầu được đọc.' : '', b.flags.unsupported.length ? `AI không dẫn được căn cứ cho: ${b.flags.unsupported.join(', ')}. Các ô đó để trống.` : ''].filter(Boolean);
    return `
      <div class="page-head"><div><h1>${icon('layers')} ${esc(r.meta.title || r.videoId)}</h1>
        <p>${NAMES[r.platform] ?? ''}${r.meta.channelTitle ? ` · ${esc(r.meta.channelTitle)}` : ''}${r.meta.views != null ? ` · ${fmt(r.meta.views)} view` : ''}${r.meta.score != null ? ` · outlier ${esc(r.meta.score)}×` : ''} · bóc ${ago(r.analyzedAt)} bằng ${esc(r.model)}</p></div>
        <div class="row"><a class="btn" href="#${PATH}">Về thư viện</a><a class="btn" href="#/board?from=brick:${esc(r.platform)}:${encodeURIComponent(r.videoId)}">${icon('bulb')} Tạo ý tưởng từ video này</a>${r.meta.url ? `<a class="btn" href="${esc(r.meta.url)}" target="_blank" rel="noopener">${icon('play')} Mở video</a>` : ''}
          <a class="btn" href="${bricks.exportUrl([`${r.platform}:${r.videoId}`])}">${icon('download')} Export .md</a><button type="button" class="btn" data-redo ${lib.ai ? '' : 'disabled'}>${icon('refresh')} Bóc lại</button><button type="button" class="btn" data-remove>${icon('trash')} Xoá</button></div></div>
      ${notes.length ? `<div class="callout">${notes.map(esc).join(' ')}</div>` : ''}
      <div data-prog></div>
      <div class="fw-tabs" role="tablist">${TABS.map(([k, t, i]) => `<button type="button" class="fw-tab ${state.tab === k ? 'on' : ''}" role="tab" aria-selected="${state.tab === k}" data-tab="${k}">${icon(i)}<span>${t}</span></button>`).join('')}</div>
      <div class="card fw-panel"><div class="fw-panel-head">${icon(TABS.find((t) => t[0] === state.tab)[2])}<b>${TABS.find((t) => t[0] === state.tab)[1]}</b></div><div class="fw-body">${tabHtml()}</div></div>
      <div data-extra></div>`;
  }

  /** Under the paste box: followed channels with videos worth extracting, and the winners-versus-losers table of a channel. */
  async function moreBlocks() {
    const box = root.querySelector('[data-more]');
    if (!box || state.open) return;
    const cand = await bricks.candidates().catch(() => ({ min: 3, channels: [] }));
    if (!root.contains(box)) return;
    const withNew = cand.channels.filter((c) => c.fresh || c.contrast);
    box.innerHTML = `${cand.channels.length ? `<div class="br-follows"><div class="fw-cap">TỪ KÊNH ĐANG THEO DÕI (VƯỢT KÊNH TỪ ${esc(cand.min)}×)</div>
        ${cand.channels.map((c) => `<label class="check"><input type="checkbox" data-follow="${esc(c.platform)}:${esc(c.ref)}" ${c.fresh ? 'checked' : ''}> ${esc(c.title)} <span class="muted small">${NAMES[c.platform] ?? ''} · ${c.standouts} video outlier, ${c.fresh} chưa có trong thư viện · ${c.contrast} video yếu để đối chiếu</span></label>`).join('')}
        <div class="row" style="margin-top:8px"><label class="check"><input type="checkbox" data-contrast> Kèm video dưới trung vị để đối chiếu (tối đa 5 mỗi kênh)</label><span class="spacer"></span>
          <button type="button" class="btn" data-run-follows ${lib.ai && withNew.length ? '' : 'disabled'}>${icon('layers')} Breakdown các kênh đã chọn</button></div></div>`
      : '<p class="muted small" style="margin-top:10px">Chưa có kênh nào trong Watchlist được Cập nhật. Vào Watchlist, bấm Cập nhật, rồi quay lại đây để breakdown các video outlier.</p>'}
      ${lib.channels?.length ? `<div class="br-compare"><div class="fw-cap">ĐỐI CHIẾU VIDEO THẮNG VÀ THUA CỦA MỘT KÊNH</div>
        <select class="select input" data-compare style="width:auto"><option value="">Chọn kênh</option>${lib.channels.map((c) => `<option value="${esc(c.channelRef)}" ${state.compare === c.channelRef ? 'selected' : ''}>${esc(c.title)} (${c.videos} video)</option>`).join('')}</select><div data-compare-out></div></div>` : ''}`;
    if (state.compare) drawCompare(state.compare);
  }
  async function drawCompare(channelRef) {
    const out = root.querySelector('[data-compare-out]');
    if (!out) return;
    const c = await bricks.compare(channelRef);
    out.innerHTML = `<p class="small ${c.enough ? 'muted' : ''}">${c.winners} video thắng (từ ${esc(c.min)}×), ${c.losers} video thua (dưới 1×). ${c.enough ? 'Đây là đối chiếu trên vài video, không phải chứng minh.' : `Chưa đủ để đối chiếu: cần thêm ${c.need.winners ? `${c.need.winners} video thắng` : ''}${c.need.winners && c.need.losers ? ' và ' : ''}${c.need.losers ? `${c.need.losers} video thua` : ''}.`}</p>
      ${c.attrs.map((a) => `<div class="fw-field"><div class="fw-cap">${esc(a.label)}</div><table class="table br-cmp"><tbody>${a.values.map((v) => `<tr><td>${esc(v.value)} ${v.core ? '<span class="fw-chip">có thể là cốt lõi</span>' : ''}</td><td class="r">${v.wins}/${c.winners} video thắng</td><td class="r">${v.losses}/${c.losers} video thua</td></tr>`).join('')}</tbody></table></div>`).join('')}`;
  }

  function render() {
    root.innerHTML = state.open ? detailHtml() : `<div class="page-head"><div><h1>${icon('layers')} Swipe File</h1><p>Video đã thắng, được AI bóc thành từng element: chủ đề, góc, niềm tin, hook, cách kể, phản ứng khán giả. Mỗi element có căn cứ từ lời thoại hoặc bình luận.</p></div></div>${listHtml()}`;
    if (!state.open) moreBlocks();
  }

  async function extract(body, title) {
    if (state.busy) return;
    state.busy = true;
    const prog = root.querySelector('[data-prog]');
    if (prog) prog.innerHTML = progressCard(title);
    try {
      const res = await runJob(KIND, body, (p) => { const el = root.querySelector('[data-prog]'); if (el) updateProgress(el, p); });
      toast(`Đã bóc ${res.done} video${res.skipped ? `, bỏ qua ${res.skipped} video đã có` : ''}${res.failed.length ? `, ${res.failed.length} video lỗi` : ''}`);
      lib = await bricks.list();
      state.busy = false;
      if (state.open) state.open = await bricks.get(state.open.platform, state.open.videoId);
      render();
      if (res.failed.length) root.querySelector('[data-prog]').innerHTML = `<div class="callout">Không bóc được: ${res.failed.map((x) => `${esc(x.title)} (${esc(x.reason)})`).join('; ')}</div>`;
    } catch (e) {
      state.busy = false;
      const el = root.querySelector('[data-prog]');
      if (el) el.innerHTML = errorCallout(e);
    }
  }
  async function open(key) {
    const [platform, ...rest] = key.split(':');
    try {
      state.open = await bricks.get(platform, rest.join(':'));
      state.evidence = [];
      state.editing = '';
      setUrl(PATH, { v: key });
      render();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  root.addEventListener('input', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (!el.dataset.f) return;
    state.filter[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.f !== 'q') return render();
    // Typing in the search box: redraw only the cards, so the box keeps its focus.
    const body = root.querySelector('.br-cards');
    if (body) body.innerHTML = visible().map(cardHtml).join('');
  });
  root.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const b = /** @type {HTMLElement|null} */ (t.closest('button'));
    const row = /** @type {HTMLElement|null} */ (t.closest('[data-open]'));
    if (!b && row) return open(row.dataset.open);
    if (!b) return;
    const d = b.dataset;
    if (d.runFollows !== undefined) {
      const chosen = [...root.querySelectorAll('[data-follow]:checked')].map((el) => /** @type {HTMLElement} */ (el).dataset.follow);
      if (!chosen.length) return toast('Chọn ít nhất một kênh', 'error');
      extract({ follows: chosen.join(','), contrast: /** @type {HTMLInputElement} */ (root.querySelector('[data-contrast]')).checked }, 'Đang breakdown video của kênh trong Watchlist');
    } else if (d.run !== undefined) {
      const links = /** @type {HTMLTextAreaElement} */ (root.querySelector('[data-links]')).value.trim();
      if (!links) return toast('Dán ít nhất một link video', 'error');
      extract({ links }, 'Đang breakdown');
    } else if (d.tab) { state.tab = d.tab; state.editing = ''; render(); }
    else if (d.evidence) { state.evidence = d.evidence.split(',').map(Number); state.tab = 'transcript'; render(); root.querySelector('.br-line.hit')?.scrollIntoView({ block: 'center' }); }
    else if (d.edit) { state.editing = d.edit; render(); /** @type {HTMLElement|null} */ (root.querySelector('[data-edit-value]'))?.focus(); }
    else if (d.cancelEdit !== undefined) { state.editing = ''; render(); }
    else if (d.saveEdit) {
      try {
        state.open = await bricks.update(state.open.platform, state.open.videoId, { [d.saveEdit]: /** @type {HTMLInputElement} */ (root.querySelector('[data-edit-value]')).value });
        state.editing = '';
        lib = await bricks.list();
        render();
      } catch (err) { toast(err.message, 'error'); }
    } else if (d.redo !== undefined) extract({ links: state.open.meta.url || state.open.videoId, redo: true }, 'Đang bóc lại');
    else if (d.dive !== undefined) {
      const prog = root.querySelector('[data-prog]');
      prog.innerHTML = progressCard('Đang đào sâu video');
      try {
        await runJob('video_deep_dive', { platform: state.open.platform, videoId: state.open.videoId }, (p) => updateProgress(prog, p));
        state.open = await bricks.get(state.open.platform, state.open.videoId);
        render();
      } catch (err) { prog.innerHTML = errorCallout(err); }
    }
    else if (d.remove !== undefined) {
      if (b.dataset.armed) { await bricks.remove(state.open.platform, state.open.videoId); state.open = null; lib = await bricks.list(); setUrl(PATH, {}); render(); }
      else { b.dataset.armed = '1'; b.innerHTML = 'Bấm lần nữa để xoá khỏi thư viện'; }
    }
  });
  root.addEventListener('change', (e) => {
    const el = /** @type {HTMLSelectElement} */ (e.target);
    if (el.dataset?.compare === undefined) return;
    state.compare = el.value;
    if (el.value) drawCompare(el.value);
    else root.querySelector('[data-compare-out]').innerHTML = '';
  });
  root.addEventListener('keydown', (e) => {
    const row = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-open]'));
    if (row && e.key === 'Enter') open(row.dataset.open);
  });

  render();
  if (params.v) await open(params.v);
  else if (params.record) {
    setUrl(PATH, {});
    if (lib.ai) extract({ recordId: Number(params.record) }, 'Đang breakdown các video của báo cáo');
    else toast(`${NO_KEY}. Vào Cài đặt để nhập.`, 'error');
  }
}
