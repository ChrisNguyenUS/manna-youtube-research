// vidIQ-style keyword score card.
import { esc, fmt, full, mult, dur, ageText, thumb, ytVideo, icon, chips, bindChips, isSaved, toggleSave, store, persist, median, emptyState, bindTips, metric } from '../lib.js';
// ---------- keyword score card (vidIQ-style) ----------
const GOOD = '#2f9e44', MID = '#f08c00', BAD = '#c92a2a';
const goodColor = (goodness) => (goodness >= 60 ? GOOD : goodness >= 40 ? MID : BAD);

export const VERDICT = {
  open: ['good', 'Ít người làm gần đây', 'Có người xem nhưng ít video trong 1 năm qua: cửa còn mở.'],
  competitive: ['plain', 'Đã có người làm', 'Cần góc nhìn mới hoặc làm tốt hơn top hiện tại.'],
  saturated: ['warn', 'Nhiều người làm, đang thắng', 'Ngách nóng: nhiều video mới vượt kênh. Vào được nhưng phải khác biệt.'],
  low_demand: ['bad', 'Ít người xem', 'Video top có rất ít view.'],
};

function gauge(score) {
  const R = 80, cx = 100, cy = 96;
  const pt = (pct) => {
    const a = Math.PI * (1 - pct / 100);
    return [cx + R * Math.cos(a), cy - R * Math.sin(a)];
  };
  const [sx, sy] = pt(0), [fx, fy] = pt(100), [ex, ey] = pt(Math.max(score, 0.5));
  return `<svg viewBox="0 0 200 104" class="gauge" role="img" aria-label="Điểm ${score} trên 100">
    <path d="M${sx} ${sy} A${R} ${R} 0 0 1 ${fx} ${fy}" fill="none" stroke="#efedea" stroke-width="13" stroke-linecap="round"/>
    <path d="M${sx} ${sy} A${R} ${R} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="${goodColor(score)}" stroke-width="13" stroke-linecap="round"/>
    <text x="100" y="92" text-anchor="middle" style="font:600 46px var(--font);fill:var(--text)">${score}</text></svg>`;
}

/** Full-width bar like vidIQ. goodness 0–100 decides the color (competition is inverted). */
function bar(label, value, bandLabel, goodness, tip) {
  const c = goodColor(goodness);
  return `<div class="sbar" data-tip="${esc(tip)}"><div class="row between"><span class="sbar-label">${esc(label)} ⓘ</span><b style="color:${c}">${esc(bandLabel)} · ${value}</b></div>
    <div class="sbar-track"><i style="width:${Math.max(value, 2)}%;background:${c}"></i></div></div>`;
}

const breakdown = (list) => list.map((p) => `• ${p.label}: ${p.score}${p.note ? ` (${p.note})` : ''} × ${Math.round(p.weight * 100)}%`).join('\n');

export function scoreCard(r, { onRelated = true } = {}) {
  if (r.error) return `<div class="card card-pad"><b>${esc(r.keyword)}</b><div class="callout" style="margin-top:8px">Lỗi: ${esc(r.error)}</div></div>`;
  const s = r.stats, n = s.results;
  const [vcls, vlabel, vwhy] = VERDICT[r.verdict] || ['plain', '–', ''];
  const stat = (label, value, tip = '') => `<span ${tip ? `data-tip="${esc(tip)}"` : ''}>${esc(label)}</span><b>${value}</b>`;
  return `<div class="card score-card" data-kw="${esc(r.keyword)}">
    <div class="score-term"><span>${esc(r.keyword)}</span>${r.regions?.length > 1 ? `<span class="badge plain">🌐 ${r.regions.length} nước</span>` : r.regions?.[0] ? `<span class="badge plain">${esc(r.regions[0])}</span>` : ''}</div>
    <div class="card-pad" style="padding-bottom:8px">
      ${gauge(r.overall)}
      <div class="score-overall">Điểm tổng<div style="color:${goodColor(r.overall)}">${esc(r.bands.overall.label.toUpperCase())}</div></div>
      ${bar('Volume (ước tính)', r.volume, r.bands.volume.label, r.volume, 'Nhu cầu ước tính từ view của video top, KHÔNG phải lượng tìm kiếm thật:\n' + breakdown(r.parts.volume))}
      ${bar('Competition', r.competition, r.bands.competition.label, 100 - r.competition, 'Độ cạnh tranh (cao = khó):\n' + breakdown(r.parts.competition))}
      <div class="verdict"><span class="badge ${vcls}">${esc(vlabel)}</span> <span class="muted small">${esc(vwhy)} ${r.recentYear}/${n} video trong 1 năm, ${r.strong}/${n} vượt kênh.</span></div>
    </div>
    <div class="score-section">Thống kê top ${n} kết quả</div>
    <div class="card-pad score-stats">
      ${stat('View cao nhất', full(s.highestViews))}
      ${stat('View trung bình', full(s.avgViews))}
      ${stat('Sub trung bình', full(s.avgSubs))}
      ${stat('Tuổi trung bình', ageText(s.avgAgeDays, false))}
      ${stat('Tiêu đề chứa từ khoá', `${s.titleMatch}/${n}`, 'Tiêu đề có đủ các chữ của từ khoá (không phân biệt dấu)')}
      ${stat('Mô tả chứa từ khoá', `${s.descMatch ?? '–'}/${n}`, 'Theo đoạn mô tả YouTube hiện trong kết quả tìm')}
      ${stat('Đăng trong 7 ngày', `${s.added7d}/${n}`)}
      ${stat('Có phụ đề (Captions)', `${s.captionsCount ?? '–'}/${n}`)}
      ${stat('Creative Commons', `${s.ccCount ?? '–'}/${n}`)}
      ${stat('Kênh ≥ 1 triệu sub', `${s.bigChannels}/${n}`)}
      ${r.recent30 ? stat('Video mới 30 ngày', `${r.recent30.count}${r.recent30.count >= 40 ? '+' : ''}`, 'Số video đăng trong 30 ngày qua khớp từ khoá (tối đa 40)') + stat('VPH trung vị video mới', r.recent30.medianVph == null ? '–' : fmt(r.recent30.medianVph), 'View mỗi giờ của video đăng trong 30 ngày qua') : ''}
    </div>
    ${r.topChannels?.length ? `<div class="score-section">Top kênh cho từ khoá này</div><div class="card-pad" style="padding-top:8px">${r.topChannels
      .map((c) => `<div class="row" style="gap:8px;margin:6px 0">${c.avatar ? `<img src="${esc(c.avatar)}" referrerpolicy="no-referrer" alt="" style="width:26px;height:26px;border-radius:50%">` : ''}
        <a href="#/channel?input=${encodeURIComponent(c.id)}" style="font-weight:600">${esc(c.title)}</a><span class="muted small">${fmt(c.subs)} sub</span><span class="spacer"></span><span class="small muted">${c.count} video</span></div>`)
      .join('')}</div>` : ''}
    ${onRelated && r.related?.length ? `<div class="score-section row between"><span>Từ khoá liên quan</span><button class="btn sm" data-score-related disabled>Chấm điểm đã chọn</button></div>
      <div class="card-pad" style="padding-top:6px">${r.related
        .map((k) => `<label class="related-row"><input type="checkbox" data-rel="${esc(k.keyword)}"><span>${esc(k.keyword)}</span><b data-rel-score="${esc(k.keyword)}">${k.overall != null ? k.overall : ''}</b></label>`)
        .join('')}</div>` : ''}
    <div class="row" style="padding:12px 18px 16px;border-top:1px solid var(--line)">
      <a class="btn sm" href="#/videos?q=${encodeURIComponent(r.keyword)}&run=1">${icon('search')} Tìm video</a>
      <a class="btn sm" href="#/channels?q=${encodeURIComponent(r.keyword)}">${icon('users')} Tìm kênh</a>
      <details class="small" style="margin-left:auto"><summary class="muted" style="cursor:pointer">Top ${r.top?.length || 0} video</summary>
        ${(r.top || []).map((v) => `<div style="margin-top:6px"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title.slice(0, 70))}</a> <span class="muted">${fmt(v.views)} · ${fmt(v.channelSubs)} sub</span></div>`).join('')}</details></div>
  </div>`;
}

/** Wire "related keywords" checkboxes inside score cards: score selected ones (lite) and show the number. */
/** Wire related-keyword checkboxes in score cards (score selected ones, lite). Returns off(). */
export function bindScoreCards(root, runJob, gl) {
  const onChange = (e) => {
    const cb = e.target.closest('[data-rel]');
    if (!cb) return;
    const card = cb.closest('.score-card');
    card.querySelector('[data-score-related]').disabled = !card.querySelector('[data-rel]:checked');
  };
  const onClick = async (e) => {
    const btn = e.target.closest('[data-score-related]');
    if (!btn) return;
    const card = btn.closest('.score-card');
    const kws = [...card.querySelectorAll('[data-rel]:checked')].map((x) => x.dataset.rel);
    btn.disabled = true;
    btn.textContent = 'Đang chấm…';
    try {
      const res = await runJob('keyword_score', { keywords: kws, gl, lite: true });
      for (const x of res.results || []) {
        const el = [...card.querySelectorAll('[data-rel-score]')].find((b) => b.dataset.relScore === x.keyword);
        if (el && x.overall != null) {
          el.textContent = x.overall;
          el.style.color = goodColor(x.overall);
          el.dataset.tip = `Volume ${x.volume} · Competition ${x.competition}`;
        }
      }
      card.querySelectorAll('[data-rel]:checked').forEach((x) => (x.checked = false));
    } finally {
      btn.textContent = 'Chấm điểm đã chọn';
    }
  };
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick);
  };
}
