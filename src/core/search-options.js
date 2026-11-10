// Pure helpers that turn user search options into source options. Shared by features and sources.

/** Pick the server-side duration bucket that fully contains [minSec, maxSec]; exact filtering happens after. */
export function durationBucket(minSec, maxSec) {
  const lo = minSec || 0;
  const hi = maxSec || Infinity;
  if (hi <= 180) return 'under3';
  if (hi <= 240) return 'under4';
  if (lo >= 1200) return 'over20';
  if (lo >= 240 && hi <= 1200) return 'mid4to20';
  if (lo >= 180 && hi <= 1200) return 'mid3to20';
  return 'any';
}

export const GLOBAL = 'GLOBAL';

/** "GLOBAL" -> list of region codes from settings; "VN" -> ["VN"]. */
export function regionsFor(gl, globalRegions = 'US,GB,IN,CA,AU,PH,VN,ID') {
  if (gl !== GLOBAL) return [gl || null];
  const list = String(globalRegions).split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
  return list.length ? [...new Set(list)] : ['US'];
}
