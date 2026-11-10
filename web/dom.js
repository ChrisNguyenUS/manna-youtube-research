// Listener bookkeeping so a re-render or route change never leaves listeners behind.

/** Delegated listener on root for elements matching selector (or root itself when selector is null). Returns off(). */
export function on(root, event, selector, handler) {
  const fn = (e) => {
    const el = selector ? e.target.closest?.(selector) : root;
    if (el && root.contains(el)) handler(e, el);
  };
  root.addEventListener(event, fn);
  return () => root.removeEventListener(event, fn);
}

/** Collects listeners/timers; off() removes all of them (call before re-rendering or on unmount). */
export function scope() {
  const offs = [];
  return {
    on: (root, event, selector, handler) => offs.push(on(root, event, selector, handler)),
    add: (off) => offs.push(off),
    off: () => offs.splice(0).forEach((f) => f()),
  };
}
