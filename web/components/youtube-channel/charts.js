// YouTube channel dashboard charts: public-number trend from saved snapshots, views of each video, posting heatmap.
import { esc, fmt, full, mult, median, store, persist, emptyState } from '../../lib.js';
import { on } from '../../dom.js';
import { pct, ddmm, fullDate, seg } from '../tiktok-channel/util.js';

const DAY = 86_400_000;
/** YouTube changed what a public view count means on this day; numbers either side of it are not like for like. */
const VIEW_RULE_CHANGE = Date.parse('2026-08-24T00:00:00Z');
export const TREND_RANGES = [['7', '7 ngày'], ['30', '30 ngày'], ['90', '90 ngày'], ['180', '180 ngày'], ['all', 'Tất cả']];

/**
 * Line chart of snapshots (one per saved analysis). Fewer than two snapshots: explains when tracking started.
 * @param {HTMLElement} el @param {any[]} history oldest first @param {() => void} rerun
 */
export function trendChart(el, history, rerun) {
  const st = store('yc-trend', { metric: 'subs', range: 'all' });
  const METRICS = {
    subs: ['Subscriber (số tại lần chụp)', (s) => s.subs, 'Subscriber'],
    totalViews: ['Tổng view kênh (cộng dồn)', (s) => s.totalViews, 'Tổng view'],
    added: ['View tăng thêm giữa 2 lần chụp', (s, i, list) => (i && s.totalViews != null && list[i - 1].totalViews != null ? s.totalViews - list[i - 1].totalViews : null), 'View tăng thêm'],
    videoCount: ['Số video công khai', (s) => s.videoCount, 'Số video'],
    newVideos: ['Video mới giữa 2 lần chụp', (s, i, list) => (i && s.videoCount != null && list[i - 1].videoCount != null ? s.videoCount - list[i - 1].videoCount : null), 'Video mới'],
  };
  function render() {
    const first = history[0];
    if (history.length < 2) {
      el.innerHTML = `<div class="yc-empty-trend"><b>Theo dõi bắt đầu từ ${first ? fullDate(new Date(first.at).toISOString()) : 'lần phân tích này'}.</b>
        <p>YouTube không công bố số liệu theo ngày của kênh người khác, nên app tự chụp số công khai (subscriber, tổng view, số video, view từng video) mỗi lần bạn phân tích kênh. Xu hướng sẽ hiện khi có từ 2 lần chụp trở lên.</p>
        <button type="button" class="btn sm primary" data-rerun>Phân tích lại để thêm một lần chụp</button></div>`;
      return;
    }
    const [label, get] = METRICS[st.metric];
    const now = history[history.length - 1].at;
    const list = history.map((s, i) => ({ s, y: get(s, i, history) })).filter((p, i) => (st.range === 'all' || p.s.at >= now - Number(st.range) * DAY) && p.y != null && !(st.metric === 'added' || st.metric === 'newVideos' ? i === 0 : false));
    const straddle = history[0].at < VIEW_RULE_CHANGE && now >= VIEW_RULE_CHANGE && /view|View/i.test(label);
    let svg = emptyState('Không có lần chụp nào trong khoảng này');
    if (list.length) {
      const W = 640, H = 260, padL = 60, padR = 14, padB = 26, padT = 14;
      const ys = list.map((p) => p.y);
      let lo = Math.min(...ys), hi = Math.max(...ys);
      if (lo === hi) (lo -= Math.max(1, Math.abs(lo) * 0.05)), (hi += Math.max(1, Math.abs(hi) * 0.05));
      const t0 = list[0].s.at, t1 = list[list.length - 1].s.at;
      const x = (t) => (t1 === t0 ? (padL + W - padR) / 2 : padL + ((W - padL - padR) * (t - t0)) / (t1 - t0));
      const y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
      const ticks = [0, 0.5, 1].map((f) => lo + f * (hi - lo));
      svg = `<svg class="tc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
        ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')}
        <polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${list.map((p) => `${x(p.s.at)},${y(p.y)}`).join(' ')}"/>
        ${list.map((p) => `<a href="#/channel?id=${p.s.recordId}"><circle cx="${x(p.s.at)}" cy="${y(p.y)}" r="6" class="yc-pt" data-tip="${esc(fullDate(new Date(p.s.at).toISOString()))}: ${esc(full(p.y))} · bấm để mở lần phân tích này"/></a>`).join('')}
        <text x="${padL}" y="${H - 6}">${ddmm(new Date(t0).toISOString())}</text><text x="${W - padR}" y="${H - 6}" text-anchor="end">${ddmm(new Date(t1).toISOString())}</text></svg>`;
    }
    el.innerHTML = `<div class="tc-tools-row">${seg('metric', Object.entries(METRICS).map(([k, m]) => [k, m[2]]), st.metric)}${seg('range', TREND_RANGES, st.range)}</div>
      ${svg}
      <p class="tc-note">${esc(label)}. ${history.length} lần chụp, từ ${fullDate(new Date(history[0].at).toISOString())}. Mỗi điểm là một lần bạn phân tích kênh; giữa các điểm không có số liệu. Subscriber là số YouTube làm tròn.${straddle ? ' YouTube đổi cách đếm view công khai từ 24/08/2026, nên view trước và sau mốc này không hoàn toàn so được với nhau.' : ''}</p>`;
  }
  const offs = [
    on(el, 'click', '[data-seg]', (e, b) => ((st[b.dataset.seg] = b.dataset.v), persist('yc-trend', st), render())),
    on(el, 'click', '[data-rerun]', () => rerun()),
  ];
  render();
  return () => offs.forEach((f) => f());
}

/** Views of each long video by upload order (log scale), standouts highlighted. @param {HTMLElement} el @param {any[]} videos long videos newest first @param {any} stats @param {(v: any) => void} open */
export function videosChart(el, videos, stats, open) {
  const list = videos.filter((v) => v.views != null).reverse(); // a premiere or live with no public count yet is left out
  if (!list.length) return void (el.innerHTML = emptyState('Không có video dài'));
  const W = 1000, H = 230, padL = 52, padB = 24, padT = 10;
  const top = Math.pow(10, Math.ceil(Math.log10(Math.max(...list.map((v) => v.views || 1), 10))));
  const y = (val) => padT + (H - padT - padB) * (1 - Math.log10(Math.max(val, 1)) / Math.log10(top));
  const bw = (W - padL) / list.length;
  const ticks = Array.from({ length: Math.log10(top) + 1 }, (_, i) => 10 ** i).filter((t) => t >= 10);
  const med = stats.medianAll;
  el.innerHTML = `<svg class="tc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lượt xem từng video dài">
      ${ticks.map((t) => `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')}
      ${list.map((v, i) => `<rect class="tc-b ${v.standout ? 'hi' : med && v.views >= med ? 'up' : 'down'}" data-i="${i}" x="${padL + i * bw + bw * 0.14}" y="${y(v.views || 1)}" width="${Math.max(bw * 0.72, 1.5)}" height="${Math.max(H - padB - y(v.views || 1), 1)}" rx="2" data-tip="${esc(v.title)} — ${full(v.views)} view · ${mult(v.vsMedian)} trung vị · ${v.publishedAt ? fullDate(v.publishedAt) : esc(v.published || '')}"/>`).join('')}
      ${med ? `<line x1="${padL}" x2="${W}" y1="${y(med)}" y2="${y(med)}" class="ref"/>` : ''}
      <text x="${padL}" y="${H - 6}">Cũ hơn</text><text x="${W}" y="${H - 6}" text-anchor="end">Mới nhất</text></svg>
    <div class="tc-legend"><span><i class="hi"></i>Nổi bật: ≥ ${stats.outlierMultiple}× trung vị</span><span><i class="up"></i>Từ trung vị trở lên</span><span><i class="down"></i>Dưới trung vị</span><span><i class="line"></i>View trung vị ${list.length} video dài: ${fmt(med)}</span></div>
    <p class="tc-note">Lượt xem cộng dồn tới lúc phân tích, nên video cũ có nhiều thời gian hơn để lên view. Thang log. Bấm cột để xem chi tiết.</p>`;
  return on(el, 'click', 'rect.tc-b', (e, b) => open(list[Number(b.dataset.i)]));
}

const DAYS = [[1, 'T2'], [2, 'T3'], [3, 'T4'], [4, 'T5'], [5, 'T6'], [6, 'T7'], [0, 'CN']];
const SLOTS = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => [h, h + 3]);
const rate = (list) => {
  const ok = list.filter((v) => v.likes != null && v.comments != null && v.views);
  return ok.length ? ok.reduce((a, v) => a + v.likes + v.comments, 0) / ok.reduce((a, v) => a + v.views, 0) : null;
};

/** Day × 3-hour heatmap of the videos with an exact upload time. @param {HTMLElement} el @param {any[]} videos */
export function scheduleHeatmap(el, videos) {
  const st = store('yc-heat', { by: 'count' });
  const dated = videos.filter((v) => v.ageExact && v.publishedAt).map((v) => ({ v, d: new Date(v.publishedAt) }));
  const groupOf = (vs) => ({ count: vs.length, median: median(vs.map((v) => v.views)), avg: vs.length ? vs.reduce((a, v) => a + (v.views || 0), 0) / vs.length : null, rate: rate(vs) });
  const pick = (day, [a, b]) => dated.filter(({ d }) => d.getDay() === day && d.getHours() >= a && d.getHours() < b).map((x) => x.v);
  const grid = SLOTS.map((s) => DAYS.map(([day]) => groupOf(pick(day, s))));
  const cells = grid.flatMap((row, i) => row.map((g, j) => ({ g, label: `${DAYS[j][1]}, ${SLOTS[i][0]}–${SLOTS[i][1]} giờ` })));
  const most = [...cells].sort((a, b) => b.g.count - a.g.count)[0];
  const bestEnough = cells.filter((c) => c.g.count >= 2).sort((a, b) => (b.g.median ?? 0) - (a.g.median ?? 0))[0];
  const BY = { count: ['Số video', (g) => g.count || null, String], median: ['View trung vị', (g) => g.median, fmt], avg: ['View trung bình', (g) => g.avg, fmt], rate: ['Tương tác', (g) => g.rate, pct] };
  function render() {
    if (!dated.length) return void (el.innerHTML = emptyState('Chưa có giờ đăng chính xác', ' Phân tích lại kênh để lấy giờ đăng của các video mới nhất.'));
    const [label, val, f] = BY[st.by];
    const max = Math.max(...grid.flat().map((g) => val(g) ?? 0), 0);
    el.innerHTML = `<div class="tc-tools-row">${seg('by', Object.entries(BY).map(([k, x]) => [k, x[0]]), st.by)}</div>
      <div class="yc-heat-grid"><div class="tc-heat-wrap"><table class="tc-heat" aria-label="${esc(label)} theo ngày và giờ đăng">
        <thead><tr><th></th>${DAYS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
        <tbody>${grid.map((row, i) => `<tr><th>${SLOTS[i][0]}–${SLOTS[i][1]}h</th>${row.map((g, j) => {
          const x = val(g);
          const a = x != null && max ? 0.12 + 0.88 * (x / max) : 0;
          return `<td><span class="tc-cell ${g.count ? (a < 0.5 ? 'light' : '') : 'none'}" style="--a:${a.toFixed(2)}" data-tip="${DAYS[j][1]}, ${SLOTS[i][0]}–${SLOTS[i][1]} giờ: ${g.count} video${g.count ? ` · view trung vị ${fmt(g.median)} · trung bình ${fmt(g.avg)} · tương tác ${pct(g.rate)}` : ''}">${g.count ? f(x) : ''}</span></td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="yc-facts">
          <div><span>Hay đăng nhất</span><b>${most?.g.count ? esc(most.label) : '–'}</b><small>${most?.g.count ?? 0} video</small></div>
          <div><span>View trung vị cao nhất (từ 2 video)</span><b>${bestEnough ? esc(bestEnough.label) : '–'}</b><small>${bestEnough ? `${fmt(bestEnough.g.median)} view · ${bestEnough.g.count} video` : 'chưa ô nào đủ 2 video'}</small></div>
        </div></div>
      <p class="tc-note">${dated.length} video dài có giờ đăng chính xác (giờ theo máy này). Shorts không có ngày giờ đăng nên không nằm ở đây. "Hay đăng" và "view cao" là hai chuyện khác nhau; ô ít video dễ lệch, và giờ đăng không chứng minh gây ra view.</p>`;
  }
  const off = on(el, 'click', '[data-seg]', (e, b) => ((st.by = b.dataset.v), persist('yc-heat', st), render()));
  render();
  return off;
}

