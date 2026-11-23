// "Bước tiếp" under a result: where this result leads in the four steps (Research → Analyze → Audience → Create),
// each button carrying the result's own videos or channels along, so nothing is pasted or scraped again by hand.
import { esc, icon } from '../lib.js';

/**
 * @param {{href: string, icon: string, label: string, hint?: string, primary?: boolean}[]} steps
 *   href: a #/path link with the data in its query; steps without data are left out by the caller
 */
export const nextSteps = (steps) =>
  steps.length
    ? `<div class="next-steps" role="group" aria-label="Bước tiếp"><span class="next-steps-l">Bước tiếp</span>${steps
        .map((s) => `<a class="btn sm${s.primary ? ' primary' : ''}" href="${esc(s.href)}"${s.hint ? ` title="${esc(s.hint)}"` : ''}>${icon(s.icon)} ${esc(s.label)}</a>`)
        .join('')}</div>`
    : '';

/** #/path?query from params, the way screens read them. @param {string} path @param {Record<string, string|number>} params */
export const link = (path, params) => `#${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`;
