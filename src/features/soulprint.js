// Use case: Soulprint, the root profile of the owner's content (spec 2026-11-16-soulprint-design.md).
// Reads and saves the profile, offers seeds from data the app already holds, sorts a pasted file into drafts, and
// hands other AI features its context text. Nothing here ever saves a model's output or an imported draft.
import { cleanProfile, readiness, contextText, splitByHeadings, SECTION_LABELS } from '../core/soulprint/profile.js';
import { QUESTIONS, INTRO, GAME_TABLE } from '../core/soulprint/questions.js';
import { soulprintMarkdown } from '../core/report/soulprint.js';

const SEEDS = 5;
const CHANNEL_KINDS = ['tiktok_channel', 'channel_analysis'];
const bare = (s) => String(s ?? '').trim().replace(/^@/, '').toLowerCase();
/** A seed source that is missing or has an unexpected shape gives no seeds, never an error. */
const safe = (fn) => {
  try {
    return fn();
  } catch {
    return [];
  }
};

/**
 * @param {{repo: {get: (ws: string) => {data: any, updatedAt: number} | null, save: (ws: string, data: any) => number}, ws: string,
 *   llm: import('../ports/llm.js').LlmClient, follows: {list: (ws: string) => any[]},
 *   records: {list: (ws: string, kind: string, limit: number) => any[], get: (ws: string, id: number) => any},
 *   commentData: {videos: () => any[], comments: (ids: string[]) => any}}} deps
 */
export function makeSoulprint({ repo, ws, llm, follows, records, commentData }) {
  const stored = () => {
    const row = repo.get(ws);
    return { profile: cleanProfile(row?.data).profile, updatedAt: row?.updatedAt ?? null };
  };
  const view = (profile, updatedAt) => ({ profile, readiness: readiness(profile), updatedAt, ai: llm.ready(), questions: QUESTIONS, intro: INTRO, gameTable: GAME_TABLE, sections: SECTION_LABELS });

  function get() {
    const { profile, updatedAt } = stored();
    return view(profile, updatedAt);
  }
  /** @param {any} input a whole profile from the screen */
  function save(input) {
    const { profile, trimmed } = cleanProfile(input);
    return { ...view(profile, repo.save(ws, profile)), trimmed };
  }

  /** Groups of one dimension of the newest 5W1H report, with how many comments are in each (largest first). */
  function fiveWGroups(dim) {
    const latest = records.list(ws, 'comment_5w1h', 1)[0];
    const d = latest ? records.get(ws, latest.id)?.data : null;
    const groups = Array.isArray(d?.codebook?.[dim]) ? d.codebook[dim] : [];
    const tags = Object.values(d?.tags ?? {});
    return groups.map((g) => ({ label: String(g.label ?? ''), description: String(g.description ?? ''), count: tags.filter((t) => t?.[dim] === g.key).length }))
      .filter((g) => g.label && g.count).sort((a, b) => b.count - a.count);
  }

  /** Suggestions per section from what the app already holds; at most five each. */
  function seeds() {
    const { profile } = stored();
    const channels = safe(() => follows.list(ws).slice(0, SEEDS).map((f) => (f.platform === 'tiktok'
      ? { platform: 'tiktok', handle: `@${f.ref}`, url: `https://www.tiktok.com/@${f.ref}` }
      : { platform: 'youtube', handle: f.title || f.ref, url: `https://www.youtube.com/channel/${f.ref}` })));
    const reportPains = safe(() => fiveWGroups('why').map((g) => ({ text: g.description ? `${g.label}: ${g.description}` : g.label, count: g.count, source: '5w1h', group: 'Báo cáo 5W1H' })));
    const commentPains = safe(() => {
      const ids = commentData.videos().slice(0, 20).map((v) => String(v.id));
      if (!ids.length) return [];
      const got = commentData.comments(ids);
      const byId = new Map(got.comments.map((c) => [String(c.id), c]));
      return got.themes.topics.filter((t) => t.kind === 'question').map((t) => ({ text: String(byId.get(String(t.ids[0]))?.text ?? '').trim(), count: t.count, source: 'comment', group: t.label })).filter((p) => p.text);
    });
    const avatar = safe(() => fiveWGroups('who').slice(0, SEEDS).map((g) => ({ text: g.label, count: g.count })));
    const pillars = safe(() => {
      const mine = new Set(profile.channels.flatMap((c) => [bare(c.handle), bare(c.url.split('/').filter(Boolean).pop())]).filter(Boolean));
      if (!mine.size) return [];
      const own = CHANNEL_KINDS.flatMap((kind) => records.list(ws, kind, 20)).find((r) => mine.has(bare(r.ref)) || mine.has(bare(r.title)));
      const phrases = own ? records.get(ws, own.id)?.data?.phrases : null;
      return (Array.isArray(phrases) ? phrases : []).filter((x) => x?.phrase).slice(0, SEEDS).map((x) => ({ text: String(x.phrase), count: Number(x.count) || 0 }));
    });
    return { channels, pains: [...reportPains, ...commentPains].slice(0, SEEDS), avatar, pillars };
  }

  return { get, save, seeds, importText: (text) => splitByHeadings(text), context: () => contextText(stored().profile), markdown: () => soulprintMarkdown(stored().profile) };
}
