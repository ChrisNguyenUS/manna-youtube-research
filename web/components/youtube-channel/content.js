// YouTube channel dashboard: content format, topics, keywords and title patterns, comments. Public metadata only;
// numbers describe what went together in this channel's videos, not what caused views.
import { esc, icon, fmt, mult, median, emptyState } from '../../lib.js';
import { on } from '../../dom.js';
import { pct } from '../tiktok-channel/util.js';
import { FORMATS, times } from './videos.js';

const COLORS = ['#e8590c', '#f6a76b', '#9fb7ff', '#cbd5e1'];
const lift = (x) => (x == null ? 'plain' : x >= 1.2 ? 'tc-up' : x < 0.8 ? 'tc-down' : 'plain');
const avg = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
const rateOf = (list) => {
  const ok = list.filter((v) => v.likes != null && v.comments != null && v.views);
  return ok.length ? { rate: ok.reduce((a, v) => a + v.likes + v.comments, 0) / ok.reduce((a, v) => a + v.views, 0), n: ok.length } : { rate: null, n: 0 };
};
/** Small list of videos (title links to YouTube). */
const videoList = (vs, n = 8) => `<ol class="yc-vlist">${vs.slice(0, n).map((v) => `<li><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a><span class="muted small">${fmt(v.views)} view${v.score != null ? ` · ${times(v.score)}` : ''}</span></li>`).join('')}</ol>${vs.length > n ? `<p class="muted small">và ${vs.length - n} video khác</p>` : ''}`;

/** Donut of counts. */
function donut(rows, centre, sub) {
  const total = rows.reduce((a, r) => a + r.count, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return `<svg class="tc-donut" viewBox="0 0 140 140" role="img" aria-label="${esc(sub)}">${rows.map((r, i) => {
    const len = (r.count / total) * C;
    const c = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="20" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 70 70)"/>`;
    acc += len;
    return c;
  }).join('')}<text x="70" y="68" text-anchor="middle" class="big">${centre}</text><text x="70" y="86" text-anchor="middle">${esc(sub)}</text></svg>`;
}

/** Long videos, Shorts, live: YouTube's own tabs decide the format. @param {any} d @param {any[]} list */
export function formatModule(d, list) {
  const s = d.stats;
  const rows = ['long', 'short', 'live'].map((f) => {
    const vs = list.filter((v) => v.format === f);
    const r = rateOf(vs);
    return { f, label: FORMATS[f], count: vs.length, total: vs.reduce((a, v) => a + (v.views || 0), 0), avg: avg(vs.map((v) => v.views).filter((x) => x != null)), median: median(vs.map((v) => v.views)), rate: r.rate, rateN: r.n };
  });
  const shown = rows.filter((r) => r.count);
  const maxAvg = Math.max(...shown.map((r) => r.avg || 0), 1);
  const n = list.length || 1;
  return `<div class="yc-stack">
    <div class="tc-donut-row">${donut(shown, String(list.length), 'video đã lấy')}
      <div class="yc-bars">${shown.map((r, i) => `<div><span><i class="tc-dot" style="background:${COLORS[i]}"></i>${r.label} · ${Math.round((r.count / n) * 100)}%</span><span class="tc-bar"><i style="width:${((r.avg || 0) / maxAvg) * 100}%"></i></span><small>View trung bình ${fmt(r.avg)}</small></div>`).join('')}</div></div>
    <div class="table-wrap"><table class="t tc-mini"><thead><tr><th>Định dạng</th><th class="r">Video</th><th class="r">Tổng view</th><th class="r">TB / video</th><th class="r">Trung vị</th><th class="r">Tương tác</th><th class="r">Nhịp đăng</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.count ? '' : 'muted'}"><td>${r.label}</td><td class="r num">${r.count}${r.f === 'short' && s.shortsCount >= 60 ? '+' : ''}</td><td class="r num">${fmt(r.total)}</td><td class="r num">${fmt(r.avg)}</td><td class="r num">${fmt(r.median)}</td>
        <td class="r num" title="${r.rateN ? `tính trên ${r.rateN} video có số thích và bình luận` : 'chưa có số thích/bình luận'}">${pct(r.rate)}</td><td class="r num">${r.f === 'long' && s.uploadsPerWeek != null ? `${String(s.uploadsPerWeek).replace('.', ',')}/tuần` : '–'}</td></tr>`).join('')}
      <tr class="muted"><td>Livestream đã phát</td><td class="r" colspan="6">Chưa lấy: app chưa đọc tab Live của kênh</td></tr></tbody></table></div></div>
    <p class="tc-note">Phân loại theo tab của chính YouTube: video dài lấy từ tab Video (${s.longCount} video mới nhất), Shorts từ tab Shorts (tối đa 60), không dựa vào độ dài. Shorts chỉ có tiêu đề và view, chưa có ngày đăng hay lượt thích. Shorts và video dài được xem theo cách khác nhau, so view giữa hai định dạng chỉ để tham khảo.</p>`;
}

/** Recurring subjects from titles (phrases with their videos), YouTube categories and tags of the detailed videos. @param {HTMLElement} el @param {any} d @param {any[]} list */
export function topicModule(el, d, list) {
  const byId = new Map(list.map((v) => [String(v.id), v]));
  const long = list.filter((v) => v.format !== 'short');
  const all = median(long.map((v) => v.views));
  const topics = (d.phrases || []).map((p) => {
    const vs = (p.videoIds || []).map((id) => byId.get(String(id))).filter(Boolean).sort((a, b) => (b.views || 0) - (a.views || 0));
    const r = rateOf(vs);
    return { name: p.phrase, vs, count: vs.length, avg: avg(vs.map((v) => v.views || 0)), median: median(vs.map((v) => v.views)), lift: all ? median(vs.map((v) => v.views)) / all : null, rate: r.rate };
  }).filter((t) => t.count >= 2).sort((a, b) => b.count - a.count || (b.median ?? 0) - (a.median ?? 0));
  const covered = new Set(topics.flatMap((t) => t.vs.map((v) => v.id)));
  const other = long.filter((v) => !covered.has(v.id)).length;
  const cats = new Map();
  for (const v of long.filter((x) => x.category)) cats.set(v.category, [...(cats.get(v.category) || []), v]);
  const tags = new Map();
  for (const v of long) for (const t of new Set((v.tags || []).map((x) => String(x).toLowerCase()))) tags.set(t, [...(tags.get(t) || []), v]);
  const tagRows = [...tags.entries()].filter(([, vs]) => vs.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 20);
  const detailed = long.filter((v) => v.category).length;
  const st = { limit: 8 };
  function render() {
    const max = Math.max(...topics.map((t) => t.count), 1);
    el.innerHTML = `<div class="yc-topic-grid">
      <div><h4>Chủ đề lặp lại trong tiêu đề</h4>
        ${topics.length ? `<ul class="yc-topics">${topics.slice(0, st.limit).map((t, i) => `<li><details><summary>
          <span class="yc-t-name">${esc(t.name)}</span><span class="tc-bar"><i style="width:${(t.count / max) * 100}%"></i></span>
          <span class="yc-t-nums"><b>${t.count}</b> video · TV ${fmt(t.median)} · <span class="badge ${lift(t.lift)}">${mult(t.lift)}</span></span></summary>
          <div class="yc-t-body"><p class="small muted">View trung bình ${fmt(t.avg)} · tương tác ${pct(t.rate)}</p>${videoList(t.vs)}</div></details></li>`).join('')}</ul>
          ${topics.length > st.limit ? `<button type="button" class="btn sm" data-tmore>Xem thêm ${Math.min(10, topics.length - st.limit)} chủ đề</button>` : ''}`
          : emptyState('Chưa thấy chủ đề lặp lại')}
        <p class="tc-note">Mỗi chủ đề là một cụm từ xuất hiện trong tiêu đề của ít nhất 2 video; bấm để xem các video đó. ${other} video dài không thuộc cụm nào (Khác / chưa phân loại). Cột × = view trung vị nhóm ÷ view trung vị video dài của kênh.</p></div>
      <div><h4>Danh mục YouTube</h4>
        ${cats.size ? `<table class="t tc-mini"><thead><tr><th></th><th class="r">Video</th><th class="r">View TV</th></tr></thead><tbody>${[...cats.entries()].sort((a, b) => b[1].length - a[1].length).map(([c, vs]) => `<tr><td>${esc(c)}</td><td class="r num">${vs.length}</td><td class="r num">${fmt(median(vs.map((v) => v.views)))}</td></tr>`).join('')}</tbody></table>
          <p class="tc-note">Danh mục do kênh tự chọn, có ở ${detailed} video mới nhất.</p>` : emptyState('Chưa có danh mục', ' Phân tích lại kênh để lấy danh mục và tag của các video mới nhất.')}
        <h4 style="margin-top:14px">Tag dùng nhiều</h4>
        ${tagRows.length ? `<div class="chips">${tagRows.map(([t, vs]) => `<span class="tag" data-tip="View trung vị ${fmt(median(vs.map((v) => v.views)))}">${esc(t)} · <b>${vs.length}</b></span>`).join('')}</div>` : '<p class="muted small">Chưa có tag lặp lại ở các video đã lấy chi tiết.</p>'}
      </div></div>`;
  }
  const off = on(el, 'click', '[data-tmore]', () => ((st.limit += 10), render()));
  render();
  return off;
}

/** Keywords (single words and phrases in titles) and title patterns. @param {HTMLElement} el @param {any} d @param {any[]} list */
export function keywordModule(el, d, list) {
  const byId = new Map(list.map((v) => [String(v.id), v]));
  const long = list.filter((v) => v.format !== 'short');
  const all = median(long.map((v) => v.views));
  const kw = (d.phrases || []).map((p) => {
    const vs = (p.videoIds || []).map((id) => byId.get(String(id))).filter(Boolean);
    return { phrase: p.phrase, count: vs.length, median: median(vs.map((v) => v.views)), avg: avg(vs.map((v) => v.views || 0)), lift: all ? median(vs.map((v) => v.views)) / all : null, rate: rateOf(vs).rate, vs };
  }).filter((k) => k.count);
  const st = { q: '', sort: 'count', limit: 10 };
  const pats = d.patterns || [];
  function render(focus = false) {
    const words = st.q.toLowerCase().trim();
    const rows = kw.filter((k) => !words || k.phrase.includes(words)).sort((a, b) => (b[st.sort] ?? -1) - (a[st.sort] ?? -1) || b.count - a.count);
    el.innerHTML = `<div class="tc-two">
      <div><h4>Từ khoá trong tiêu đề</h4>
        <div class="tc-tools-row tc-filter"><label class="tc-search">${icon('search')}<input class="input" type="search" data-kq placeholder="Tìm từ khoá" value="${esc(st.q)}" aria-label="Tìm từ khoá"></label>
          <select class="input tc-sort" data-ksort aria-label="Sắp xếp từ khoá">${[['count', 'Hay dùng nhất'], ['median', 'View trung vị cao nhất'], ['lift', '× trung vị cao nhất'], ['rate', 'Tương tác cao nhất']].map(([k, l]) => `<option value="${k}" ${st.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${rows.length ? `<div class="table-wrap"><table class="t tc-mini"><thead><tr><th>Từ khoá</th><th class="r">Video</th><th class="r">View TV</th><th class="r">× TV</th><th class="r">Tương tác</th></tr></thead><tbody>
          ${rows.slice(0, st.limit).map((k) => `<tr><td><details class="yc-kw"><summary>${esc(k.phrase)}</summary>${videoList(k.vs, 5)}</details></td><td class="r num">${k.count}</td><td class="r num">${fmt(k.median)}</td><td class="r"><span class="badge ${lift(k.lift)}">${mult(k.lift)}</span></td><td class="r num">${pct(k.rate)}</td></tr>`).join('')}</tbody></table></div>
          ${rows.length > st.limit ? `<div class="tc-more-row"><span class="muted small">${st.limit}/${rows.length}</span><button type="button" class="btn sm" data-kmore>Xem thêm</button></div>` : ''}` : emptyState('Không có từ khoá khớp')}
      </div>
      <div><h4>Mẫu tiêu đề</h4>
        ${pats.length ? `<ul class="tc-rank">${pats.map((p) => `<li class="${p.count < 3 ? 'tc-few' : ''}"><div class="tc-rank-top"><b>${esc(p.label)}</b><span class="muted small">${p.count} video · ${Math.round(p.share * 100)}%${p.count < 3 ? ' · ít video' : ''}</span><span class="badge ${p.count < 3 ? 'plain' : lift(p.lift)}">${mult(p.lift)}</span></div>
          <span class="tc-bar"><i style="width:${Math.round(p.share * 100)}%"></i></span>${p.example ? `<div class="small muted tc-ex">Tốt nhất: <a href="https://www.youtube.com/watch?v=${esc(p.example.id)}" target="_blank" rel="noopener">${esc(p.example.title)}</a> · ${fmt(p.example.views)} view</div>` : ''}</li>`).join('')}</ul>` : emptyState('Chưa nhận ra mẫu tiêu đề nào')}
        <p class="tc-note">Tiêu đề trung vị ${d.titleShape?.medianChars ?? '–'} ký tự, ${d.titleShape?.medianWords ?? '–'} từ. × = trung vị "× trung vị kênh" của nhóm ÷ trung vị chung. CTR là số riêng của chủ kênh nên không biết tiêu đề nào được bấm nhiều hơn; đây chỉ là view của các video có kiểu tiêu đề đó.</p>
      </div></div>`;
    if (focus) {
      const i = /** @type {HTMLInputElement} */ (el.querySelector('[data-kq]'));
      i.focus();
      i.setSelectionRange(i.value.length, i.value.length);
    }
  }
  const offs = [
    on(el, 'input', '[data-kq]', (e, b) => ((st.q = /** @type {HTMLInputElement} */ (b).value), (st.limit = 10), render(true))),
    on(el, 'change', '[data-ksort]', (e, b) => ((st.sort = /** @type {HTMLSelectElement} */ (b).value), render())),
    on(el, 'click', '[data-kmore]', () => ((st.limit += 15), render())),
  ];
  render();
  return () => offs.forEach((f) => f());
}

/** Comments are read per video on the Comment screen; this section points there with the right videos. @param {any[]} list */
export function commentModule(list) {
  const counted = list.filter((v) => v.comments != null);
  const most = [...counted].sort((a, b) => b.comments - a.comments).slice(0, 5);
  const top = list.filter((v) => v.format === 'long' && v.standout).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);
  const link = (vs) => `#/comments?videos=${encodeURIComponent(vs.map((v) => v.id).join(','))}`;
  const box = (title, vs, primary) => `<div><h4>${title}</h4>${vs.length ? `${videoList(vs, 5)}<a class="btn ${primary ? 'primary' : ''}" href="${link(vs)}">${icon('message')} Lấy bình luận ${vs.length} video này</a>` : '<p class="muted small">Chưa có.</p>'}</div>`;
  return `<div class="tc-callout">${icon('info')}<div><b>Trang này chưa đọc bình luận.</b> ${counted.length ? `${counted.length} video mới nhất có tổng ${fmt(counted.reduce((a, v) => a + v.comments, 0))} bình luận công khai.` : ''} Màn Lấy comment đọc bình luận gốc của từng video và chia thành câu hỏi, lo lắng, phàn nàn, ý muốn mua và yêu cầu. Bình luận lấy được chỉ là một phần bình luận công khai; video tắt bình luận sẽ không có.</div></div>
    <div class="tc-two" style="margin-top:14px">${box('Video nhiều bình luận nhất', most, true)}${box('Video dài nổi bật nhất', top, false)}</div>`;
}
