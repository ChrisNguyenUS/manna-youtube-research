// Video toolbar, table and grid renderers; outlier and view/sub badges.
import { esc, fmt, full, mult, dur, ageText, thumb, ytVideo, icon, chips, bindChips, isSaved, toggleSave, store, persist, median, emptyState, bindTips, metric } from '../lib.js';
export function videoToolbar(f, count, total) {
  return `<div class="row" style="padding:12px 16px;border-bottom:1px solid var(--line)">
    <b>${count}</b><span class="muted">/ ${total} video</span>
    <input class="input sm" style="max-width:240px" data-f="q" placeholder="Lọc theo chữ trong tiêu đề, kênh" value="${esc(f.q)}">
    <span class="spacer"></span>
    <label class="small muted">Xếp theo</label>
    <select class="select input sm" style="width:auto" data-f="sort">
      ${[['views', 'Lượt xem'], ['oscore', 'Outlier (× kênh)'], ['viewSub', 'View/sub'], ['vph', 'VPH (view/giờ)'], ['vpd', 'View/ngày'], ['new', 'Mới nhất'], ['subsAsc', 'Kênh ít sub nhất'], ['likes', 'Like'], ['dur', 'Dài nhất']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <button class="icon-btn ${f.view === 'grid' ? 'on' : ''}" data-viewmode="grid" title="Dạng lưới">${icon('grid')}</button>
    <button class="icon-btn ${f.view === 'table' ? 'on' : ''}" data-viewmode="table" title="Dạng bảng">${icon('list')}</button>
  </div>`;
}

/** Tooltip text for the outlier column; read at render time so it follows the server registry. */
export const outlierTip = () => `${metric('outlierScore').label.vi} = ${metric('outlierScore').formula}. Như 1of10/vidIQ.`;
/** vidIQ-style brackets: < 2× · 2–5× · 5–10× · 10×+ */
export function oscoreBadge(v) {
  const o = v.outlierScore;
  if (o == null) return '<span class="muted">–</span>';
  const cls = o >= 10 ? 'accent' : o >= 5 ? 'purple' : o >= 2 ? 'blue' : 'plain';
  const tip = v.outlierBasis === 'vph' ? `VPH gấp ${o} lần video mới của kênh (video < 7 ngày)` : `${full(v.views)} view ÷ ${full(v.channelMedianViews)} (trung vị ${v.channelBaselineSample} video của kênh)`;
  return `<span class="badge ${cls}" data-tip="${esc(tip)}">${mult(o)}${v.outlierBasis === 'vph' ? '<small> VPH</small>' : ''}</span>`;
}
const outlierBadge = (o) => (o == null ? '<span class="muted">–</span>' : `<span class="badge ${o >= 10 ? 'accent' : o >= 1 ? 'good' : 'plain'}">${mult(o)}</span>`);

export function videoTable(list, { selected = new Set(), rankOffset = 0 } = {}) {
  if (!list.length) return emptyState('Không có video nào khớp bộ lọc', 'Bỏ bớt bộ lọc ở trên.');
  return `<div class="table-wrap"><table class="t"><thead><tr>
    <th style="width:28px"><input type="checkbox" data-selall></th><th>#</th><th class="thumb"></th><th>Video</th>
    <th class="r">View</th><th class="r" data-tip="${esc(outlierTip())}">Outlier</th><th class="r" data-tip="View ÷ sub của kênh">View/sub</th><th class="r" data-tip="View mỗi giờ kể từ lúc đăng">VPH</th><th class="r">View/ngày</th><th class="r">Sub kênh</th><th class="r">Dài</th><th class="r">Đăng</th><th></th></tr></thead><tbody>
    ${list
      .map(
        (v, i) => `<tr data-id="${v.id}">
      <td><input type="checkbox" data-sel="${v.id}" ${selected.has(v.id) ? 'checked' : ''}></td>
      <td class="muted num">${i + 1 + rankOffset}</td>
      <td class="thumb"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${thumb(v.id)}" alt=""></a></td>
      <td class="title-cell"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a>
        <div class="meta"><a href="#/channel?input=${encodeURIComponent(v.channelId || '')}" style="display:inline" data-tip="Phân tích kênh này">${esc(v.channelTitle)}</a>${v.likes != null ? ` · ${fmt(v.likes)} like` : ''}${v.regions?.length > 1 ? ` · <span class="tag" data-tip="Video hiện trong kết quả tìm ở các nước này">🌐 ${esc(v.regions.join(' '))}</span>` : ''}${v.queries?.length ? ` · <span class="tag">${esc(v.queries[0])}</span>` : ''}</div></td>
      <td class="r num"><b>${fmt(v.views)}</b></td>
      <td class="r">${oscoreBadge(v)}</td>
      <td class="r">${outlierBadge(v.viewSub)}</td>
      <td class="r num">${v.vph == null ? '–' : v.vph < 10 ? String(v.vph).replace('.', ',') : fmt(v.vph)}</td>
      <td class="r num">${fmt(v.viewsPerDay)}</td>
      <td class="r num">${fmt(v.channelSubs)}</td>
      <td class="r num">${dur(v.durationSec)}</td>
      <td class="r num" ${v.publishedAt ? `data-tip="${esc(new Date(v.publishedAt).toLocaleDateString('vi-VN'))}"` : 'data-tip="Ước tính từ YouTube (vd: 3 tháng trước)"'}>${ageText(v.age, v.ageExact)}</td>
      <td class="actions"><button class="icon-btn ${isSaved('video', v.id) ? 'on' : ''}" data-save="${v.id}" title="Lưu">${icon('bookmark')}</button></td>
    </tr>`,
      )
      .join('')}</tbody></table></div>`;
}

export function videoGrid(list, { selected = new Set() } = {}) {
  if (!list.length) return emptyState('Không có video nào khớp bộ lọc');
  return `<div class="vgrid">${list
    .map(
      (v, i) => `<div class="vcard" data-id="${v.id}">
      <div class="img"><a href="${ytVideo(v.id)}" target="_blank" rel="noopener"><img loading="lazy" src="${thumb(v.id)}" alt=""></a>
        ${v.outlierScore != null ? `<span class="ov mult" data-tip="${esc(outlierTip())}">${mult(v.outlierScore)} kênh</span>` : v.viewSub != null ? `<span class="ov mult">${mult(v.viewSub)} sub</span>` : ''}<span class="ov rank">#${i + 1}</span><span class="ov dur">${dur(v.durationSec)}</span>
        <label class="ov sel"><input type="checkbox" data-sel="${v.id}" ${selected.has(v.id) ? 'checked' : ''}></label></div>
      <div class="body"><a class="t1" href="${ytVideo(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a>
        <div class="stats"><b>${fmt(v.views)}</b> lượt xem · ${v.vph == null ? '–' : fmt(v.vph)} VPH · ${ageText(v.age, v.ageExact)}</div>
        <div class="stats">${esc(v.channelTitle)} · ${fmt(v.channelSubs)} sub${v.viewSub != null ? ` · ${mult(v.viewSub)} sub` : ''}${v.regions?.length > 1 ? ` · 🌐 ${esc(v.regions.join(' '))}` : ''}</div>
        <div class="foot"><a class="btn sm" href="#/channel?input=${encodeURIComponent(v.channelId || '')}">${icon('bars')} Kênh</a>
          <button class="btn sm" data-comment="${v.id}">${icon('message')} Comment</button>
          <button class="icon-btn ${isSaved('video', v.id) ? 'on' : ''}" data-save="${v.id}" title="Lưu">${icon('bookmark')}</button></div></div>
    </div>`,
    )
    .join('')}</div>`;
}

/**
 * Full interactive video results block. Returns { el, getSelected }.
 * opts: { key (filter storage key), extraActions(html) }
 */
