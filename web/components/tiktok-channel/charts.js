// Video performance chart (one bar per video) and posting-time heatmap for the TikTok channel dashboard.
import { esc, fmt, full, mult, median, store, persist } from '../../lib.js';
import { on } from '../../dom.js';
import { METRICS, RANGES, num, pct, ddmm, fullDate, cover, inRange, groupOf, seg } from './util.js';

/**
 * @param {HTMLElement} el
 * @param {any} data the tiktok_channel record data
 * @param {(v: any) => void} open opens a video's detail
 * @returns {() => void} off
 */
export function performanceChart(el, data, open) {
  const st = store('tc-chart', { metric: 'plays', range: 'all', scale: 'log' });
  const mult3 = data.stats.outlierMultiple;
  let shown = [];
  function render() {
    const m = st.metric;
    shown = data.videos.filter((v) => !v.pinned && v.createdAt && inRange(v, st.range)).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    // Views use the channel baseline (newest videos, no pinned ones); the other numbers use the median of the bars shown.
    const ref = m === 'plays' ? data.stats.medianPlays : median(shown.map((v) => v[m]));
    const cls = (v) => (m === 'plays' ? (v.standout ? 'hi' : v.plays >= ref ? 'up' : 'down') : ref && v[m] >= mult3 * ref ? 'hi' : v[m] >= ref ? 'up' : 'down');
    const tools = `${seg('metric', Object.entries(METRICS).map(([k, x]) => [k, x.label]), m)}${seg('range', RANGES, st.range)}${seg('scale', [['log', 'Thang log'], ['linear', 'Thang thường']], st.scale)}`;
    let svg = '<div class="tc-empty">Không có video nào trong khoảng này.</div>';
    if (shown.length) {
      const W = 1000, H = 260, padL = 52, padB = 26, padT = 12;
      const max = Math.max(...shown.map((v) => v[m] || 0), 1);
      const log = st.scale === 'log';
      const top = log ? Math.pow(10, Math.ceil(Math.log10(Math.max(max, 10)))) : niceMax(max);
      const y = (val) => padT + (H - padT - padB) * (1 - (log ? Math.log10(Math.max(val, 1)) / Math.log10(top) : Math.max(val, 0) / top));
      const ticks = log ? Array.from({ length: Math.log10(top) + 1 }, (_, i) => 10 ** i) : [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
      const bw = (W - padL) / shown.length;
      const every = Math.max(1, Math.ceil(shown.length / 8));
      svg = `<svg class="tc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(METRICS[m].label)} từng video theo ngày đăng">
        ${ticks.map((t) => `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')}
        ${shown.map((v, i) => `<rect class="tc-b ${cls(v)}" data-i="${i}" x="${padL + i * bw + bw * 0.14}" y="${y(v[m] || 0)}" width="${Math.max(bw * 0.72, 1.5)}" height="${Math.max(H - padB - y(v[m] || 0), 1)}" rx="2"/>`).join('')}
        ${shown.map((v, i) => (i % every === 0 ? `<text x="${padL + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${ddmm(v.createdAt)}</text>` : '')).join('')}
        ${ref ? `<line x1="${padL}" x2="${W}" y1="${y(ref)}" y2="${y(ref)}" class="ref"/>` : ''}
      </svg>`;
    }
    el.innerHTML = `<div class="tc-tools-row">${tools}</div>
      <div class="tc-chart-wrap">${svg}<div class="tc-ctip" hidden></div></div>
      <div class="tc-legend"><span><i class="hi"></i>${m === 'plays' ? `Nổi bật: ≥ ${mult3}× view trung vị kênh` : `≥ ${mult3}× trung vị`}</span><span><i class="up"></i>Từ trung vị trở lên</span><span><i class="down"></i>Dưới trung vị</span>
        <span><i class="line"></i>${m === 'plays' ? `View trung vị kênh: ${fmt(data.stats.medianPlays)}` : `Trung vị ${METRICS[m].short} của ${shown.length} video đang hiện: ${fmt(median(shown.map((v) => v[m])))}`}</span></div>
      <p class="tc-note">${shown.length} video, bỏ video ghim. Bấm vào cột để xem chi tiết video.${st.scale === 'log' ? ' Thang log: mỗi vạch gấp 10 lần vạch dưới, để video vượt trội không đè bẹp phần còn lại.' : ''}</p>`;
  }
  const tip = () => /** @type {HTMLElement} */ (el.querySelector('.tc-ctip'));
  const offs = [
    on(el, 'click', '[data-seg]', (e, b) => ((st[b.dataset.seg] = b.dataset.v), persist('tc-chart', st), render())),
    on(el, 'click', 'rect.tc-b', (e, b) => open(shown[Number(b.dataset.i)])),
    on(el, 'mouseover', 'rect.tc-b', (e, b) => {
      const v = shown[Number(b.dataset.i)];
      const t = tip();
      t.innerHTML = `${cover(v, 'tc-ctip-img')}<div><div class="tc-ctip-cap">${esc(String(v.caption || '(không caption)').slice(0, 90))}</div>
        <div class="tc-ctip-nums"><b>${full(v.plays)}</b> view · ${mult(v.outlierScore)}<br>♥ ${fmt(v.likes)} · 💬 ${fmt(v.comments)} · ↗ ${fmt(v.shares)}</div><div class="tc-ctip-date">Đăng ${fullDate(v.createdAt)}</div></div>`;
      t.hidden = false;
      const wrap = /** @type {HTMLElement} */ (el.querySelector('.tc-chart-wrap')).getBoundingClientRect();
      const r = b.getBoundingClientRect();
      const x = Math.min(Math.max(r.left - wrap.left + r.width / 2 - 140, 0), wrap.width - 280);
      t.style.left = `${x}px`;
      t.style.top = `${Math.max(r.top - wrap.top - t.offsetHeight - 8, 0)}px`;
    }),
    on(el, 'mouseout', 'rect.tc-b', () => (tip().hidden = true)),
  ];
  render();
  return () => offs.forEach((f) => f());
}

/** Round a maximum up to 1, 2 or 5 × a power of ten. */
function niceMax(x) {
  const p = 10 ** Math.floor(Math.log10(x));
  return [1, 2, 5, 10].map((k) => k * p).find((v) => v >= x) || x;
}

const DAYS = [[1, 'T2'], [2, 'T3'], [3, 'T4'], [4, 'T5'], [5, 'T6'], [6, 'T7'], [0, 'CN']];
const SLOTS = [[0, 6], [6, 9], [9, 12], [12, 15], [15, 18], [18, 21], [21, 24]];

/**
 * Day × hour heatmap of when the videos went up, coloured by a chosen median. Local time of this computer.
 * @param {HTMLElement} el @param {any} data @returns {() => void}
 */
export function postingHeatmap(el, data) {
  const st = store('tc-heat', { by: 'score' });
  const dated = data.videos.filter((v) => v.createdAt && !v.pinned).map((v) => ({ v, d: new Date(v.createdAt) }));
  const cell = (day, [from, to]) => groupOf(dated.filter(({ d }) => d.getDay() === day && d.getHours() >= from && d.getHours() < to).map((x) => x.v));
  const grid = SLOTS.map((s) => DAYS.map(([day]) => cell(day, s)));
  const BY = { score: ['× trung vị', (g) => g.medianScore, mult], plays: ['View trung vị', (g) => g.medianPlays, fmt], er: ['Tương tác', (g) => g.medianEr, pct], count: ['Số video', (g) => g.count || null, String] };
  function render() {
    const [label, val, f] = BY[st.by];
    const max = Math.max(...grid.flat().map((g) => val(g) ?? 0), 0);
    const byDay = DAYS.map(([day, l]) => ({ l, ...groupOf(dated.filter(({ d }) => d.getDay() === day).map((x) => x.v)) }));
    const bySlot = SLOTS.map(([a, b]) => ({ l: `${a}–${b} giờ`, ...groupOf(dated.filter(({ d }) => d.getHours() >= a && d.getHours() < b).map((x) => x.v)) }));
    const list = (title, rows) => `<h4>${title}</h4><div class="table-wrap"><table class="t tc-mini"><thead><tr><th></th><th class="r">Video</th><th class="r">View TV</th><th class="r">× TV</th><th class="r">Tương tác</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.count ? '' : 'muted'}"><td>${r.l}</td><td class="r num">${r.count}</td><td class="r num">${fmt(r.medianPlays)}</td><td class="r num">${mult(r.medianScore)}</td><td class="r num">${pct(r.medianEr)}</td></tr>`).join('')}</tbody></table></div>`;
    el.innerHTML = `<div class="tc-tools-row">${seg('by', Object.entries(BY).map(([k, x]) => [k, x[0]]), st.by)}</div>
      <div class="tc-heat-wrap"><table class="tc-heat" aria-label="${esc(label)} theo ngày và giờ đăng">
        <thead><tr><th></th>${DAYS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
        <tbody>${grid.map((row, i) => `<tr><th>${SLOTS[i][0]}–${SLOTS[i][1]}h</th>${row.map((g, j) => {
          const x = val(g);
          const a = x != null && max ? 0.12 + 0.88 * (x / max) : 0;
          return `<td><span class="tc-cell ${g.count ? (a < 0.5 ? 'light' : '') : 'none'}" style="--a:${a.toFixed(2)}" data-tip="${DAYS[j][1]}, ${SLOTS[i][0]}–${SLOTS[i][1]} giờ: ${g.count} video${g.count ? ` · view trung vị ${fmt(g.medianPlays)} · ${mult(g.medianScore)} trung vị kênh · tương tác ${pct(g.medianEr)}` : ''}">${g.count ? f(x) : ''}</span></td>`;
        }).join('')}</tr>`).join('')}</tbody></table>
        <div class="tc-heat-scale"><span>Thấp</span><i></i><span>Cao</span></div></div>
      <details class="tc-more"><summary>Bảng theo ngày và theo khung giờ</summary><div class="tc-stack">${list('Theo ngày', byDay)}${list('Theo khung giờ', bySlot)}</div></details>
      <p class="tc-note">Giờ theo máy này. Ô càng đậm thì ${esc(label.toLowerCase())} càng cao; ô có ít video thì con số dễ lệch. Đây là kết quả trong quá khứ của kênh, không chứng minh đăng giờ đó sẽ được nhiều view hơn.</p>`;
  }
  const off = on(el, 'click', '[data-seg]', (e, b) => ((st.by = b.dataset.v), persist('tc-heat', st), render()));
  render();
  return off;
}
