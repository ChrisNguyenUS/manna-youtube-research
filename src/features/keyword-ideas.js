// Use case: YouTube autocomplete keyword ideas. Receives everything through deps (docs/ARCHITECTURE.md §4).
import { noop } from './shared.js';

/** @param {import('./shared.js').Deps & Record<string, any>} deps */
export function makeKeywordIdeas(deps) {
  const { source, store, settings, now, records } = deps;
  /** @param {string} seed @param {{gl?: string, hl?: string, depth?: string}} [o] */
  return async function keywordIdeas(seed, { gl, hl = 'vi', depth = 'full' } = {}, progress = noop) {
    const s = settings();
    const g = gl || s.gl;
    const lang = /[à-ỹđ]/i.test(seed) ? 'vi' : hl === 'vi' && g !== 'VN' ? 'en' : hl;
    const letters = depth === 'quick' ? [''] : ['', ...'abcdefghiklmnopqrstuvxy'.split('')];
    const prefixes = [...letters.map((l) => (l ? `${seed} ${l}` : seed))];
    if (depth !== 'quick') prefixes.push(`${seed} là gì`, `cách ${seed}`, `tại sao ${seed}`, `how to ${seed}`, `${seed} for`);
    const counts = new Map();
    await source.mapLimit(
      prefixes,
      async (q, i) => {
        const list = await source.suggest(q, { gl: g, hl: lang });
        list.forEach((k, rank) => {
          const cur = counts.get(k) || { keyword: k, hits: 0, bestRank: 99, sources: [] };
          cur.hits++;
          cur.bestRank = Math.min(cur.bestRank, rank + (i === 0 ? 0 : 3));
          cur.sources.push(q);
          counts.set(k, cur);
        });
      },
      (done, total) => progress({ step: 'Gợi ý tìm kiếm của YouTube', done, total }),
    );
    return [...counts.values()].filter((k) => k.keyword !== seed).sort((a, b) => a.bestRank - b.bestRank || b.hits - a.hits);
  };
}
