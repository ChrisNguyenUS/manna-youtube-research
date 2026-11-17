// Use case: Soulprint, the root profile of the owner's content (spec 2026-11-16-soulprint-design.md).
// Reads and saves the profile, and hands other AI features its context text. AI helpers and seeds are added in
// later tasks of the plan; nothing here ever saves a model's output.
import { cleanProfile, readiness, contextText, SECTION_LABELS } from '../core/soulprint/profile.js';
import { QUESTIONS, INTRO, GAME_TABLE } from '../core/soulprint/questions.js';
import { soulprintMarkdown } from '../core/report/soulprint.js';

/**
 * @param {{repo: {get: (ws: string) => {data: any, updatedAt: number} | null, save: (ws: string, data: any) => number}, ws: string,
 *   llm: import('../ports/llm.js').LlmClient}} deps
 */
export function makeSoulprint({ repo, ws, llm }) {
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
  return { get, save, context: () => contextText(stored().profile), markdown: () => soulprintMarkdown(stored().profile) };
}
