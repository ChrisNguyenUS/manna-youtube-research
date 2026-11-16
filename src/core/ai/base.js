// Shared by everything that talks to a language model.

/** Pinned model used when a setting is empty. Changed after the model trial (scripts/llm-try.js). */
export const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash-1017';

/**
 * Error with a code the job runner stores: llm_no_key, llm_auth, llm_unavailable, llm_bad_output.
 * @param {string} code @param {string} message
 */
export const aiError = (code, message) => Object.assign(new Error(message), { code });
