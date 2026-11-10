// Persistent background job runner (docs/jobs-and-scraping-L4.md).
// queued → running → succeeded | failed | cancelled ; running at boot → interrupted.
import crypto from 'node:crypto';

/** Canonical form of params so the same request always hashes the same. */
const norm = (v) =>
  typeof v === 'string'
    ? v.trim().toLowerCase().replace(/\s+/g, ' ')
    : Array.isArray(v)
      ? v.map(norm)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])]))
        : v;

/** @param {string} ws @param {string} kind @param {any} params */
export const idempotencyKey = (ws, kind, params) => crypto.createHash('sha1').update(JSON.stringify([ws, kind, norm(params)])).digest('hex');

/**
 * @typedef {{workspaceId: string, signal: AbortSignal, progress: (p: {step?: string, done?: number, total?: number}) => void}} JobContext
 * @typedef {(params: any, ctx: JobContext) => Promise<any>} JobHandler
 */

/**
 * @param {{jobsRepo: ReturnType<typeof import('../store/sqlite/repos/jobs.js').jobsRepo>, handlers: Record<string, JobHandler>, maxParallel?: number, now?: () => number}} o
 */
export function createRunner({ jobsRepo, handlers, maxParallel = 2, now = Date.now }) {
  const controllers = new Map();
  let timer = null;
  let active = 0;

  /** @param {string} ws @param {string} kind @param {any} params @param {string} title */
  function enqueue(ws, kind, params, title) {
    if (!handlers[kind]) throw Object.assign(new Error(`Không có tác vụ: ${kind}`), { code: 'invalid_input' });
    const key = idempotencyKey(ws, kind, params);
    const existing = jobsRepo.findActiveByKey(key);
    if (existing) return { id: existing.id, reused: true };
    try {
      const id = jobsRepo.insert({ workspace_id: ws, kind, title, status: 'queued', params: JSON.stringify(params), idempotency_key: key, created_at: now() });
      queueMicrotask(pump);
      return { id, reused: false };
    } catch (e) {
      const again = jobsRepo.findActiveByKey(key); // another insert won the race
      if (again) return { id: again.id, reused: true };
      throw e;
    }
  }

  async function run(job) {
    const ac = new AbortController();
    controllers.set(job.id, ac);
    jobsRepo.update(job.id, { started_at: now(), attempts: job.attempts + 1 });
    /** @type {JobContext} */
    const ctx = {
      workspaceId: job.workspace_id,
      signal: ac.signal,
      // Handlers report progress between steps; that is also where a cancelled job stops,
      // so features don't each need their own abort checks.
      progress: (p) => {
        if (ac.signal.aborted) throw new Error('cancelled');
        jobsRepo.update(job.id, { progress: { ...(jobsRepo.get(job.id)?.progress || {}), ...p } });
      },
    };
    try {
      const result = await handlers[job.kind](job.params, ctx);
      if (ac.signal.aborted) throw new Error('cancelled');
      jobsRepo.update(job.id, { status: 'succeeded', finished_at: now(), record_id: result?.id ?? null, result: result?.inline ? result : null });
    } catch (e) {
      const cancelled = ac.signal.aborted;
      jobsRepo.update(job.id, { status: cancelled ? 'cancelled' : 'failed', finished_at: now(), error: cancelled ? null : String(e?.message || e) });
    } finally {
      controllers.delete(job.id);
      active--;
      queueMicrotask(pump);
    }
  }

  function pump() {
    while (active < maxParallel) {
      const job = jobsRepo.nextQueued();
      if (!job) return;
      active++;
      jobsRepo.update(job.id, { status: 'running' }); // claim before the first await
      run(job);
    }
  }

  return {
    enqueue,
    /** @param {number} id */
    get: (id) => jobsRepo.get(id),
    /** @param {string} ws */
    list: (ws) => jobsRepo.list(ws),
    /** @param {number} id */
    cancel(id) {
      jobsRepo.update(id, { cancel_requested: 1 });
      const ac = controllers.get(id);
      if (ac) ac.abort();
      else if (jobsRepo.get(id)?.status === 'queued') jobsRepo.update(id, { status: 'cancelled', finished_at: now() });
    },
    start() {
      jobsRepo.markInterrupted();
      timer = setInterval(pump, 1000);
      timer.unref?.();
      pump();
    },
    stop() {
      clearInterval(timer);
      for (const ac of controllers.values()) ac.abort();
    },
  };
}
