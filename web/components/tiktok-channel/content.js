// Content modules of the TikTok channel dashboard: caption patterns and video lengths, hashtags, caption wording,
// and the way into comment analysis. Numbers show what went together in this channel's past videos, not causes.
import { esc, icon, fmt, mult, median, emptyState } from '../../lib.js';
import { on } from '../../dom.js';
import { pct, captionText, groupOf } from './util.js';
import { analyzeHref } from './videos.js';

const COLORS = ['#7c5cff', '#f2a7c8', '#9fb7ff', '#c4b5fd', '#f6c08b', '#cbd5e1'];
const lift = (x) => (x == null ? '' : x >= 1.2 ? 'tc-up' : x < 0.8 ? 'tc-down' : 'plain');

/** Donut of how many videos fall in each group. @param {{label: string, count: number}[]} rows */
function donut(rows, centre, sub) {
  const total = rows.reduce((a, r) => a + r.count, 0) || 1;
  let acc = 0;
  const R = 52, C = 2 * Math.PI * R;
  return `<svg class="tc-donut" viewBox="0 0 140 140" role="img" aria-label="${esc(sub)}">
    ${rows.map((r, i) => {
      const len = (r.count / total) * C;
      const s = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="20" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 70 70)"/>`;
      acc += len;
      return s;
    }).join('')}
    <text x="70" y="68" text-anchor="middle" class="big">${centre}</text><text x="70" y="86" text-anchor="middle">${esc(sub)}</text></svg>`;
}

/** A. Caption patterns (question, number, warning…) and video lengths. @param {any} data */
export function patternsModule(data) {
  const vids = data.videos.filter((v) => !v.pinned);
  const all = median(vids.map((v) => v.outlierScore));
  const durs = data.durations.filter((d) => d.count);
  const pats = data.patterns || [];
  const byId = new Map(data.videos.map((v) => [String(v.id), v]));
  const pat = (p) => `<li class="${p.count < 3 ? 'tc-few' : ''}">
    <div class="tc-rank-top"><b>${esc(p.label)}</b><span class="muted small">${p.count} video · ${Math.round(p.share * 100)}%${p.count < 3 ? ' · ít video, dễ lệch' : ''}</span><span class="badge ${p.count < 3 ? 'plain' : lift(p.lift)}" title="Trung vị × kênh của nhóm chia trung vị chung">${mult(p.lift)}</span></div>
    <span class="tc-bar"><i style="width:${Math.round(p.share * 100)}%"></i></span>
    ${p.example ? `<div class="small muted tc-ex">Tốt nhất: <a href="${esc(byId.get(String(p.example.id))?.url || '#')}" target="_blank" rel="noopener">${esc(String(p.example.title || '').slice(0, 120) || '(không caption)')}</a> · ${fmt(p.example.views)} view</div>` : ''}</li>`;
  return `<div class="tc-two tc-pat">
    <div><h4>Độ dài video</h4>
      <div class="tc-donut-row">${donut(durs, String(durs.reduce((a, d) => a + d.count, 0)), 'video')}
        <table class="t tc-mini"><thead><tr><th></th><th class="r">Video</th><th class="r">View TV</th><th class="r">× TV</th></tr></thead><tbody>
        ${durs.map((d, i) => `<tr><td><i class="tc-dot" style="background:${COLORS[i % COLORS.length]}"></i>${esc(d.label)}</td><td class="r num">${d.count}</td><td class="r num">${fmt(d.medianPlays)}</td><td class="r"><span class="badge ${lift(d.medianScore && all ? d.medianScore / all : null)}">${mult(d.medianScore)}</span></td></tr>`).join('')}</tbody></table></div></div>
    <div><h4>Mẫu caption</h4>
      ${pats.length ? `<ul class="tc-rank">${pats.slice(0, 6).map(pat).join('')}</ul>${pats.length > 6 ? `<details class="tc-more"><summary>Xem thêm ${pats.length - 6} mẫu</summary><ul class="tc-rank">${pats.slice(6).map(pat).join('')}</ul></details>` : ''}` : emptyState('Không có mẫu caption nào lặp lại')}</div></div>
    <p class="tc-note">Mẫu caption nhận theo quy tắc chữ (có câu hỏi, có con số, từ cảnh báo…). Cột cuối: trung vị "× trung vị kênh" của nhóm chia trung vị chung; trên ×1 là nhóm đó thường được nhiều view hơn mức chung của kênh. App chưa tự phân loại chủ đề video.</p>`;
}

/** B. Hashtags: frequency against how the videos using them did. @param {HTMLElement} el @param {any} data */
export function hashtagModule(el, data) {
  const map = new Map();
  for (const v of data.videos.filter((x) => !x.pinned)) for (const t of new Set((v.hashtags || []).map((h) => String(h).toLowerCase()))) map.set(t, [...(map.get(t) || []), v]);
  const tags = [...map.entries()].map(([tag, list]) => ({ tag, ...groupOf(list) }));
  const most = new Set([...tags].sort((a, b) => b.count - a.count).slice(0, 3).map((t) => t.tag));
  const best = new Set(tags.filter((t) => t.count >= 2).sort((a, b) => (b.medianScore ?? 0) - (a.medianScore ?? 0)).slice(0, 3).map((t) => t.tag));
  const st = { q: '', sort: 'count', min2: true, limit: 10 };
  function render(focus = false) {
    const words = st.q.toLowerCase().replace(/#/g, '').trim();
    const list = tags.filter((t) => (!st.min2 || t.count >= 2) && (!words || t.tag.includes(words))).sort((a, b) => (b[st.sort] ?? -1) - (a[st.sort] ?? -1) || b.count - a.count);
    el.innerHTML = `<div class="tc-tools-row tc-filter">
        <label class="tc-search">${icon('search')}<input class="input" type="search" data-hq placeholder="Tìm hashtag" value="${esc(st.q)}" aria-label="Tìm hashtag"></label>
        <select class="input tc-sort" data-hsort aria-label="Sắp xếp hashtag">${[['count', 'Dùng nhiều nhất'], ['medianScore', '× trung vị cao nhất'], ['medianPlays', 'View trung vị cao nhất'], ['medianEr', 'Tương tác cao nhất']].map(([k, l]) => `<option value="${k}" ${st.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" data-hmin ${st.min2 ? 'checked' : ''}> Chỉ hashtag dùng từ 2 video</label></div>
      ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Hashtag</th><th class="r">Video</th><th class="r">View TV</th><th class="r">× TV kênh</th><th class="r">Tương tác</th></tr></thead><tbody>
        ${list.slice(0, st.limit).map((t) => `<tr><td><b>#${esc(t.tag)}</b> <span class="tc-badges tc-inline">${most.has(t.tag) ? '<span class="badge plain">Dùng nhiều</span>' : ''}${best.has(t.tag) ? '<span class="badge tc-hi">View cao</span>' : ''}</span></td>
          <td class="r num">${t.count}</td><td class="r num">${fmt(t.medianPlays)}</td><td class="r"><span class="badge ${lift(t.medianScore)}">${mult(t.medianScore)}</span></td><td class="r num">${pct(t.medianEr)}</td></tr>`).join('')}</tbody></table></div>
        ${list.length > st.limit ? `<div class="tc-more-row"><span class="muted small">${st.limit}/${list.length} hashtag</span><button type="button" class="btn sm" data-hmore>Xem thêm</button></div>` : ''}`
      : emptyState(tags.length ? 'Không có hashtag khớp' : 'Kênh không dùng hashtag')}
      <p class="tc-note">TV = trung vị các video có hashtag đó. "Dùng nhiều": 3 hashtag có nhiều video nhất. "View cao": 3 hashtag có × trung vị cao nhất (từ 2 video). Không tính video ghim.</p>`;
    if (focus) {
      const i = /** @type {HTMLInputElement} */ (el.querySelector('[data-hq]'));
      i.focus();
      i.setSelectionRange(i.value.length, i.value.length);
    }
  }
  const offs = [
    on(el, 'input', '[data-hq]', (e, b) => ((st.q = /** @type {HTMLInputElement} */ (b).value), (st.limit = 10), render(true))),
    on(el, 'change', '[data-hsort]', (e, b) => ((st.sort = /** @type {HTMLSelectElement} */ (b).value), render())),
    on(el, 'change', '[data-hmin]', (e, b) => ((st.min2 = /** @type {HTMLInputElement} */ (b).checked), render())),
    on(el, 'click', '[data-hmore]', () => ((st.limit += 15), render())),
  ];
  render();
  return () => offs.forEach((f) => f());
}

/** C. Caption wording: repeated phrases, caption length and how many hashtags. @param {any} data */
export function captionModule(data) {
  const vids = data.videos.filter((v) => !v.pinned);
  const groups = (defs) => defs.map(([label, test]) => ({ label, ...groupOf(vids.filter(test)) })).filter((g) => g.count);
  const len = (v) => captionText(v.caption).length;
  const tags = (v) => (v.hashtags || []).length;
  const table = (title, rows) => `<div><h4>${title}</h4><table class="t tc-mini"><thead><tr><th></th><th class="r">Video</th><th class="r">View TV</th><th class="r">× TV</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${r.label}</td><td class="r num">${r.count}</td><td class="r num">${fmt(r.medianPlays)}</td><td class="r"><span class="badge ${lift(r.medianScore)}">${mult(r.medianScore)}</span></td></tr>`).join('')}</tbody></table></div>`;
  const phrases = data.phrases || [];
  const chip = (p) => `<li><span class="tc-phrase">${esc(p.phrase)}</span><span class="muted small">${p.count} video</span><span class="badge ${lift(p.score)}">${mult(p.score)}</span></li>`;
  return `<div class="tc-cap-grid">
    <div><h4>Cụm từ lặp lại</h4>${phrases.length ? `<ul class="tc-phrases">${phrases.slice(0, 8).map(chip).join('')}</ul>
      ${phrases.length > 8 ? `<details class="tc-more"><summary>Xem thêm ${phrases.length - 8} cụm từ</summary><ul class="tc-phrases">${phrases.slice(8).map(chip).join('')}</ul></details>` : ''}` : emptyState('Chưa có cụm từ lặp lại', ' Cần ít nhất 2 video dùng chung một cụm.')}</div>
    ${table('Độ dài caption', groups([['Ngắn (dưới 40 ký tự)', (v) => len(v) < 40], ['Vừa (40–100 ký tự)', (v) => len(v) >= 40 && len(v) <= 100], ['Dài (trên 100 ký tự)', (v) => len(v) > 100]]))}
    ${table('Số hashtag', groups([['Không hashtag', (v) => tags(v) === 0], ['1–3 hashtag', (v) => tags(v) >= 1 && tags(v) <= 3], ['4 hashtag trở lên', (v) => tags(v) >= 4]]))}
  </div>
  <p class="tc-note">Cụm từ lấy từ caption đã bỏ hashtag, xuất hiện ở ít nhất 2 video; × là trung vị "× trung vị kênh" của các video có cụm đó. Số liệu chỉ cho thấy đi cùng nhau, không chứng minh cụm từ hay độ dài gây ra view.</p>`;
}

/** Comments: this report has none, so the section hands the best videos to "Phân tích video", which reads and groups comments. @param {any} data */
export function commentModule(data) {
  const top = data.videos.filter((v) => !v.pinned && v.outlierScore != null).sort((a, b) => b.outlierScore - a.outlierScore).slice(0, 5);
  const most = data.videos.filter((v) => !v.pinned).sort((a, b) => b.comments - a.comments).slice(0, 5);
  const total = data.videos.reduce((a, v) => a + (v.comments || 0), 0);
  const list = (vs) => `<ol class="tc-clist">${vs.map((v) => `<li><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(String(v.caption || '(không caption)').slice(0, 70))}</a><span class="muted small">${fmt(v.comments)} bình luận · ${mult(v.outlierScore)}</span></li>`).join('')}</ol>`;
  return `<div class="tc-comment">
    <div class="tc-callout">${icon('info')}<div><b>Phân tích kênh chưa đọc bình luận.</b> ${data.videos.length} video đã lấy có tổng ${fmt(total)} bình luận. Để đọc bình luận gốc và xem chúng được chia thành câu hỏi, lo lắng, phàn nàn, ý muốn mua và yêu cầu, gửi các video sang màn Phân tích video (tối đa 10 video một lần).</div></div>
    <div class="tc-two">
      <div><h4>5 video nổi bật nhất</h4>${list(top)}<a class="btn primary" href="${analyzeHref(top)}">${icon('message')} Đọc bình luận 5 video này</a></div>
      <div><h4>5 video nhiều bình luận nhất</h4>${list(most)}<a class="btn" href="${analyzeHref(most)}">${icon('message')} Đọc bình luận 5 video này</a></div>
    </div></div>`;
}
