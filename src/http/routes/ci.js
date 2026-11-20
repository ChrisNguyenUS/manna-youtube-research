// Customer Intelligence. Bulk analysis is the ci_analyze job (routes/jobs.js); everything here answers synchronously,
// including the on-demand AI steps (5 Whys, brief, opportunities), which are one call each.
import { httpError, raw } from '../router.js';

const attachment = (name) => ({ 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` });
const idOf = (v, field = 'id') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw httpError('invalid_input', 'Mã không hợp lệ', field);
  return n;
};
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const ci = (app) => app.features.ci;
const q = (query) => Object.fromEntries(query.entries());

export const ciRoutes = [
  { method: 'GET', path: '/api/v1/ci/available', handler: ({ app }) => ci(app).available() },
  { method: 'POST', path: '/api/v1/ci/preview', handler: ({ app, body }) => ci(app).preview(obj(body)) },
  { method: 'GET', path: '/api/v1/ci/runs', handler: ({ app }) => ci(app).runs() },
  { method: 'POST', path: '/api/v1/ci/runs', handler: ({ app, body }) => ci(app).createRun(obj(body)) },
  { method: 'GET', path: '/api/v1/ci/runs/:id', handler: ({ app, params }) => ci(app).run(idOf(params.id)) },
  { method: 'POST', path: '/api/v1/ci/runs/:id', handler: ({ app, params, body }) => ci(app).rename(idOf(params.id), obj(body).title) },
  { method: 'DELETE', path: '/api/v1/ci/runs/:id', handler: ({ app, params }) => ci(app).removeRun(idOf(params.id)) },
  { method: 'GET', path: '/api/v1/ci/runs/:id/overview', handler: ({ app, params }) => ci(app).overview(idOf(params.id)) },
  { method: 'GET', path: '/api/v1/ci/runs/:id/topics', handler: ({ app, params }) => ci(app).topicList(idOf(params.id)) },
  { method: 'GET', path: '/api/v1/ci/runs/:id/pains/:pain', handler: ({ app, params }) => ci(app).painDetail(idOf(params.id), idOf(params.pain, 'pain')) },
  { method: 'POST', path: '/api/v1/ci/runs/:id/pains/:pain', handler: ({ app, params, body }) => ci(app).editPain(idOf(params.id), idOf(params.pain, 'pain'), obj(body)) },
  { method: 'POST', path: '/api/v1/ci/runs/:id/topics/merge', handler: ({ app, params, body }) => ci(app).mergeTopics(idOf(params.id), idOf(obj(body).into, 'into'), Array.isArray(body?.from) ? body.from : []) },
  { method: 'POST', path: '/api/v1/ci/runs/:id/topics/:topic', handler: ({ app, params, body }) => ci(app).editTopic(idOf(params.id), idOf(params.topic, 'topic'), obj(body)) },
  { method: 'GET', path: '/api/v1/ci/runs/:id/comments', handler: ({ app, params, query }) => ci(app).comments(idOf(params.id), q(query)) },
  { method: 'POST', path: '/api/v1/ci/runs/:id/comments/:ref', handler: ({ app, params, body }) => ci(app).relabel(idOf(params.id), String(params.ref), obj(body)) },
  { method: 'GET', path: '/api/v1/ci/runs/:id/whys', handler: ({ app, params }) => ci(app).whysOfRun(idOf(params.id)) },
  { method: 'GET', path: '/api/v1/ci/runs/:id/briefs', handler: ({ app, params }) => ci(app).briefsOfRun(idOf(params.id)) },
  { method: 'GET', path: '/api/v1/ci/runs/:id/opportunities', handler: ({ app, params }) => ci(app).opportunities(idOf(params.id)) },
  { method: 'POST', path: '/api/v1/ci/runs/:id/opportunities/evaluate', handler: ({ app, params, body }) => ci(app).evaluate(idOf(params.id), Array.isArray(body?.ids) ? body.ids : []) },
  { method: 'GET', path: '/api/v1/ci/runs/:id/usage', handler: ({ app, params }) => ci(app).usage(idOf(params.id)) },
  { method: 'POST', path: '/api/v1/ci/runs/:id/budget', handler: ({ app, params, body }) => ci(app).setBudget(idOf(params.id), obj(body).budgetUsd ?? null) },
  {
    method: 'GET', path: '/api/v1/ci/runs/:id/export.:ext',
    handler: ({ app, params }) => {
      const id = idOf(params.id);
      const ext = String(params.ext);
      if (ext === 'json') return raw(JSON.stringify(ci(app).exportRun(id, 'json'), null, 2), 'application/json; charset=utf-8', attachment(`customer-intelligence-${id}.json`));
      if (ext === 'csv') return raw(ci(app).exportRun(id, 'csv'), 'text/csv; charset=utf-8', attachment(`customer-intelligence-${id}-comments.csv`));
      if (ext === 'md') return raw(ci(app).exportRun(id, 'md'), 'text/markdown; charset=utf-8', attachment(`customer-intelligence-${id}.md`));
      throw httpError('invalid_input', 'Định dạng không hỗ trợ', 'ext');
    },
  },
  { method: 'GET', path: '/api/v1/ci/insights/:id', handler: ({ app, params }) => ci(app).insight(idOf(params.id)) },
  { method: 'POST', path: '/api/v1/ci/insights/:id', handler: ({ app, params, body }) => ci(app).insightAction(idOf(params.id), obj(body)) },
  { method: 'POST', path: '/api/v1/ci/insights/:id/validate', handler: ({ app, params }) => ci(app).validateInsight(idOf(params.id)) },
  { method: 'POST', path: '/api/v1/ci/insights/:id/why-analyses', handler: ({ app, params }) => ci(app).startWhys(idOf(params.id)) },
  { method: 'POST', path: '/api/v1/ci/insights/:id/briefs', handler: ({ app, params, body }) => ci(app).makeBrief(idOf(params.id), Array.isArray(body?.whyNodeIds) ? body.whyNodeIds : []) },
  { method: 'GET', path: '/api/v1/ci/why-analyses/:id', handler: ({ app, params }) => ci(app).whyView(idOf(params.id)) },
  { method: 'POST', path: '/api/v1/ci/why-nodes/:id/continue', handler: ({ app, params }) => ci(app).continueWhy(idOf(params.id)) },
  { method: 'POST', path: '/api/v1/ci/why-nodes/:id', handler: ({ app, params, body }) => ci(app).editNode(idOf(params.id), obj(body)) },
  { method: 'GET', path: '/api/v1/ci/briefs/:id', handler: ({ app, params }) => ci(app).getBrief(idOf(params.id)) },
  { method: 'POST', path: '/api/v1/ci/briefs/:id', handler: ({ app, params, body }) => ci(app).editBrief(idOf(params.id), obj(body)) },
  { method: 'POST', path: '/api/v1/ci/briefs/:id/opportunities', handler: ({ app, params }) => ci(app).makeOpportunities(idOf(params.id)) },
  { method: 'POST', path: '/api/v1/ci/opportunities/:id', handler: ({ app, params, body }) => ci(app).setOpportunity(idOf(params.id), obj(body)) },
  { method: 'POST', path: '/api/v1/ci/opportunities/:id/approve', handler: ({ app, params }) => ci(app).approve(idOf(params.id)) },
];
