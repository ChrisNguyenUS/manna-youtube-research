// TikTok formulas (same as ~/tiktok-keyword-comments-actor). Pure: `now` is a parameter.
const DAY = 86_400_000;
const days = (iso, now) => (iso ? Math.max(0, (now - Date.parse(iso)) / DAY) : null);

/** @param {{likes: number, comments: number, shares: number, saves: number, plays: number, createdAt: string|null}} v @param {number} now */
export function videoMetrics(v, now) {
  const interactions = v.likes + v.comments + v.shares + v.saves;
  const age = days(v.createdAt, now);
  return {
    interactions,
    engagementRate: v.plays ? Math.round((interactions / v.plays) * 10000) / 10000 : null,
    ageDays: age == null ? null : Math.round(age * 10) / 10,
    hotScore: age == null ? null : Math.round((interactions / (age + 2)) * 10) / 10,
  };
}

/** @param {{likes: number, replies: number, createdAt: string|null}} c @param {number} now */
export function attentionPerDay(c, now) {
  const age = days(c.createdAt, now);
  return age == null ? null : Math.round(((c.likes + c.replies) / (age + 2)) * 100) / 100;
}
