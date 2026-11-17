// Winners versus losers of one channel: which brick values come with the videos that beat the channel and are
// absent from the ones that fell short. A comparison over a handful of videos, shown with its raw counts; the mark
// "có thể là cốt lõi" is a hint to check, never a proof. Pure.

export const RULE = { minWinners: 3, minLosers: 3, winShare: 0.6, lossShare: 0.2, loserBelow: 1 };
const ATTRS = [
  ['concept', 'Concept', (b) => b.concept],
  ['archetype', 'Kiểu hook', (b) => b.hook?.archetype],
  ['story', 'Cách kể', (b) => b.story?.category],
  ['hookCategory', 'Loại hook', (b) => b.hook?.category],
];
const fold = (t) => String(t ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ');

/**
 * @param {{meta: {score?: number|null}, bricks: any}[]} rows the library rows of one channel (edits applied)
 * @param {{min: number}} o min: the library threshold; a video at or above it is a winner
 */
export function compareChannel(rows, { min }) {
  const winners = rows.filter((r) => r.meta?.score != null && r.meta.score >= min);
  const losers = rows.filter((r) => r.meta?.score != null && r.meta.score < RULE.loserBelow);
  const enough = winners.length >= RULE.minWinners && losers.length >= RULE.minLosers;
  const need = { winners: Math.max(0, RULE.minWinners - winners.length), losers: Math.max(0, RULE.minLosers - losers.length) };
  const attrs = [];
  for (const [key, label, read] of ATTRS) {
    /** @type {Map<string, {value: string, wins: number, losses: number}>} */
    const seen = new Map();
    const count = (list, side) => {
      for (const r of list) {
        const raw = String(/** @type {Function} */ (read)(r.bricks) ?? '').trim();
        if (!raw) continue;
        const v = seen.get(fold(raw)) ?? { value: raw, wins: 0, losses: 0 };
        v[side]++;
        seen.set(fold(raw), v);
      }
    };
    count(winners, 'wins');
    count(losers, 'losses');
    if (!seen.size) continue;
    const values = [...seen.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.value.localeCompare(b.value, 'vi'))
      .map((v) => ({ ...v, core: enough && v.wins >= RULE.minWinners && v.wins / winners.length >= RULE.winShare && v.losses / losers.length <= RULE.lossShare }));
    attrs.push({ key, label, values });
  }
  return { winners: winners.length, losers: losers.length, enough, need, attrs };
}
