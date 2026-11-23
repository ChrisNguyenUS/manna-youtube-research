// The result page of "Topic Research", same frame on both platforms: breadcrumb, header (topic, platform, the
// settings it ran with, when), actions, KPI cards and the section tabs. What goes inside each tab stays with the
// platform's screen, since the data differs.
import { esc, icon } from '../lib.js';
import { platformMark } from './find-shell.js';
import { PLATFORM_LABELS } from '../nav.js';
import { exportMenu as sharedExportMenu } from './export-menu.js';

/**
 * @param {{platform: 'tiktok'|'youtube', topic: string, meta: [string, string][], actions: string, status?: string}} o
 *   meta: [icon, text] pairs (text is escaped); actions: HTML of the buttons on the right; status: HTML under the meta line
 */
export const resultHeader = ({ platform, topic, meta, actions, status = '' }) => `
  <nav class="rr-crumb" aria-label="Đường dẫn"><button type="button" class="btn ghost sm" data-back>${icon('back')} Topic Research</button><span aria-hidden="true">/</span><b>Kết quả nghiên cứu</b></nav>
  <div class="rr-head">
    <div class="rr-title"><h1>${platformMark(platform)}<span>${esc(topic)}</span><span class="rr-plat">${PLATFORM_LABELS[platform]}</span></h1>
      <div class="rr-meta">${meta.filter(([, t]) => t).map(([ic, t]) => `<span>${icon(ic)}${esc(t)}</span>`).join('')}</div>${status}</div>
    <div class="head-actions">${actions}</div>
  </div>`;

/**
 * KPI cards: icon, value, label, a short hint, and an explanation on hover/focus for less familiar metrics.
 * @param {{ic: string, value: string|number, label: string, hint?: string, tip?: string}[]} items
 */
export const kpiGrid = (items) =>
  `<div class="rr-kpis">${items
    .map(
      (k) => `<div class="rr-kpi"${k.tip ? ` data-tip="${esc(k.tip)}" tabindex="0"` : ''}><span class="rr-kpi-ic">${icon(k.ic)}</span><div class="rr-kpi-txt"><div class="rr-kpi-v">${k.value}</div><div class="rr-kpi-l">${esc(k.label)}${k.tip ? ` ${icon('info')}` : ''}</div>${k.hint ? `<div class="rr-kpi-h" title="${esc(k.hint)}">${esc(k.hint)}</div>` : ''}</div></div>`,
    )
    .join('')}</div>`;

/** Section tabs; only pass the ones the data supports. @param {[string, string][]} tabs [key, label] @param {string} on */
export const resultTabs = (tabs, on) =>
  `<div class="tabs rr-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" class="tab ${k === on ? 'on' : ''}" aria-selected="${k === on}" data-rtab="${k}">${esc(l)}</button>`).join('')}</div>`;

/** "Export" with the formats the record has: the main action of a result page. @param {[string, string][]} links [href, label] */
export const exportMenu = (links) => sharedExportMenu(links, { primary: true });

/** Card with a title (and optional right-hand controls). @param {string} ic @param {string} title @param {string} body @param {string} [right] */
export const panel = (ic, title, body, right = '') =>
  `<section class="card rr-panel"><div class="card-head"><h3>${icon(ic)} ${title}</h3>${right}</div>${body}</section>`;

/** Close an open "Export" menu after a pick or a click elsewhere. @param {Element} box @returns {() => void} off */
export function closeMenusOnClick(box) {
  const close = (e) => {
    for (const m of box.querySelectorAll('details.tt-menu[open]')) if (!m.contains(e.target) || e.target.closest('a')) m.removeAttribute('open');
  };
  document.addEventListener('click', close);
  return () => document.removeEventListener('click', close);
}
