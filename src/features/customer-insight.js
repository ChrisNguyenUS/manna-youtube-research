// The customer-voice part of an insight report, the same for TikTok and YouTube: what people ask (by theme), fear,
// are about to buy, their own words, and the comments that drew the most attention per day.
import { customerVoice } from '../core/analysis/customer-voice.js';

/** @param {any[]} scored comments with attentionPerDay (see withAttention) */
export function insightOf(scored) {
  const voice = customerVoice(scored, { limit: 50 });
  return {
    version: 2,
    questions: voice.questions,
    // Ids are not stored: the topic explorer works them out from the stored comments (old reports too).
    themes: voice.themes.map(({ ids, ...t }) => t),
    fears: voice.fears,
    buying: voice.buying,
    voiceLines: voice.voiceLines,
    topByAttention: [...scored].filter((c) => c.attentionPerDay != null).sort((a, b) => b.attentionPerDay - a.attentionPerDay).slice(0, 100),
    groupCounts: voice.counts,
  };
}
