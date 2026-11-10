import { httpError } from '../router.js';
import { validate } from '../validate.js';

/** Input schema for each job kind (kinds themselves are registered in src/app.js). */
export const JOB_SCHEMAS = {
  video_search: { keywords: 'string!', upload: ['any', 'today', 'week', 'month', 'year'], sort: ['relevance', 'popularity', 'date'], perKeyword: 'int?', exactTop: 'int?', gl: 'string?', minDur: 'int?', maxDur: 'int?', cc: 'bool?', likes: 'bool?' },
  channel_search: { keywords: 'string!', source: ['both', 'channels', 'videos'], perKeyword: 'int?', gl: 'string?', upload: ['any', 'today', 'week', 'month', 'year'] },
  channel_analysis: { input: 'string!', max: 'int?' },
  research: { topic: 'string?', keywords: 'string?', competitors: 'string?', direction: ['top', 'trend', 'keyword'], upload: ['any', 'today', 'week', 'month', 'year'], perKeyword: 'int?', gl: 'string?', minDur: 'int?', maxDur: 'int?' },
  research_comments: { recordId: 'int!', top: 'int?', max: 'int?' },
  comments: { videos: 'string!', max: 'int?', sort: ['top', 'newest'], replies: 'bool?' },
  idea_check: { keywords: 'string!', gl: 'string?' },
  keyword_score: { keywords: 'string!', gl: 'string?', lite: 'bool?' },
  keywords: { seed: 'string!', gl: 'string?' },
};

/** Job as the web UI sees it: small; big results live in /records. */
export function jobView(j) {
  const inline = j.result?.inline ? j.result : null;
  return {
    id: j.id, kind: j.kind, title: j.title, status: j.status, params: j.params,
    progress: j.progress || { step: 'Đang chờ', done: 0, total: 0 },
    error: j.error, resultId: j.record_id,
    result: j.status === 'succeeded' ? inline || { id: j.record_id } : null,
    startedAt: j.started_at, endedAt: j.finished_at,
  };
}

const titleOf = (b, kind) => String(b.keywords || b.topic || b.input || b.seed || b.ideas || b.videos || kind).slice(0, 80);

export const jobRoutes = [
  {
    method: 'POST', path: '/api/v1/jobs/:kind',
    handler: ({ app, ws, params, body }) => {
      const schema = JOB_SCHEMAS[params.kind];
      if (!schema) throw httpError('invalid_input', `Không có tác vụ: ${params.kind}`, 'kind');
      const v = validate(schema, body);
      if (!v.ok) throw httpError('invalid_input', v.message, v.field);
      return app.runner.enqueue(ws, params.kind, v.value, titleOf(v.value, params.kind));
    },
  },
  { method: 'POST', path: '/api/v1/jobs/:id/cancel', handler: ({ app, params }) => (app.runner.cancel(Number(params.id)), { ok: true }) },
  { method: 'GET', path: '/api/v1/jobs', handler: ({ app, ws }) => app.runner.list(ws).map(jobView) },
  {
    method: 'GET', path: '/api/v1/jobs/:id',
    handler: ({ app, params }) => {
      const j = app.runner.get(Number(params.id));
      if (!j) throw httpError('not_found', 'Không thấy tác vụ');
      return jobView(j);
    },
  },
];
