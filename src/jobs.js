// In-memory background jobs so long scrapes don't block the UI. Results live in SQLite (records).
let seq = 0;
const jobs = new Map();

export function startJob(kind, title, fn) {
  const id = String(++seq);
  const job = { id, kind, title, status: 'running', progress: { step: 'Bắt đầu', done: 0, total: 0 }, result: null, error: null, startedAt: Date.now(), endedAt: null };
  jobs.set(id, job);
  Promise.resolve()
    .then(() => fn((p) => (job.progress = { ...job.progress, ...p })))
    .then((result) => {
      job.status = 'done';
      job.result = result;
    })
    .catch((e) => {
      job.status = 'error';
      job.error = e?.message || String(e);
    })
    .finally(() => {
      job.endedAt = Date.now();
    });
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function listJobs() {
  return [...jobs.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 20)
    .map(({ result, ...j }) => ({ ...j, resultId: result?.id ?? null }));
}
