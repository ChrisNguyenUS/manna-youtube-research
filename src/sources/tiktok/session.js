// The user's own TikTok sign-in, kept as a Playwright storage state (cookies + localStorage) in the data folder.
// Only the user signs in, in a visible window; the app never sees or stores a password.
import fs from 'node:fs';
import path from 'node:path';

/** TikTok sets `sessionid` once an account is signed in. */
export const SESSION_COOKIE = 'sessionid';

/** @param {{name: string, value: string, expires?: number}[]} cookies @param {number} [now] */
export function sessionCookie(cookies, now = Date.now()) {
  const c = (cookies ?? []).find((x) => x?.name === SESSION_COOKIE && x.value);
  if (!c) return null;
  // expires is in seconds; -1 means "until the browser closes", which TikTok does not use for sessionid.
  if (Number(c.expires) > 0 && c.expires * 1000 <= now) return null;
  return c;
}

/** @typedef {{loggedIn: boolean, savedAt: string|null, expiresAt: string|null}} LoginStatus */

/** @param {string} [file] absolute path of the saved state; without it the app never signs in */
export function createSession(file) {
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  };
  return {
    file,
    /** True when a saved, unexpired sign-in exists (new browser contexts should load it). */
    has: () => Boolean(file && sessionCookie(read()?.cookies)),
    /** @returns {LoginStatus} */
    status() {
      const c = file ? sessionCookie(read()?.cookies) : null;
      if (!c) return { loggedIn: false, savedAt: null, expiresAt: null };
      return { loggedIn: true, savedAt: fs.statSync(file).mtime.toISOString(), expiresAt: Number(c.expires) > 0 ? new Date(c.expires * 1000).toISOString() : null };
    },
    /**
     * Saves the context's cookies when it is still signed in; a signed-out context never overwrites a good file.
     * @param {{storageState: () => Promise<{cookies: any[]}>}} context
     */
    async save(context) {
      if (!file) return false;
      const state = await context.storageState();
      if (!sessionCookie(state?.cookies)) return false;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      // Session cookies are as good as a password for the account: readable by this user only.
      fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
      fs.renameSync(tmp, file);
      return true;
    },
    clear() {
      if (file) fs.rmSync(file, { force: true });
    },
  };
}
