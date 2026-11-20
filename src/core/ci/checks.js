// Model output is untrusted (master prompt §M): every answer is cleaned here before anything is stored.
// IDs the model was not given are dropped and counted, enums are checked, quotes must really be in the comment. Pure.
import { LABEL_DIMS, DIM_KEYS, EPISTEMIC, VALIDATION_DECISIONS, STOP_DECISIONS, BRIEF_FIELD_STATUSES, OBJECTIVES, OPPORTUNITY_TYPES, STRENGTHS } from './taxonomy.js';

const list = (v) => (Array.isArray(v) ? v : []);
const text = (v, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const textN = (v, max = 600) => text(v, max) || null;
const oneOf = (v, values, fallback) => (values.includes(v) ? v : fallback);
const conf = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);
export const slug = (t) => String(t ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
const squash = (t) => String(t ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Collects what had to be thrown away, so the app can say "AI tham chiếu N ID không có trong dữ liệu". */
export function makeAudit() {
  const a = { fabricatedIds: /** @type {string[]} */ ([]), badEnums: 0, droppedQuotes: 0, dropped: 0 };
  return {
    a,
    /** Only refs that were in the input. @param {any} v @param {Set<string>} allowed */
    refs(v, allowed) {
      const out = [];
      for (const x of list(v)) {
        const r = String(x ?? '').trim().toUpperCase();
        if (allowed.has(r)) out.includes(r) || out.push(r);
        else if (r) a.fabricatedIds.push(r);
      }
      return out;
    },
    /** @param {any} v @param {readonly string[]} values @param {string} fallback */
    en(v, values, fallback) {
      if (values.includes(v)) return v;
      if (v != null && v !== '') a.badEnums++;
      return fallback;
    },
  };
}
export const auditSummary = (a) => ({ fabricatedIds: [...new Set(a.fabricatedIds)].slice(0, 20), fabricatedCount: a.fabricatedIds.length, badEnums: a.badEnums, droppedQuotes: a.droppedQuotes, dropped: a.dropped });

/** A quote is kept only if it is really in the comment (whitespace and case aside; "…" may join pieces). @param {string} quote @param {string} source */
export function quoteIsReal(quote, source) {
  const q = squash(quote).replace(/^["“”']+|["“”']+$/g, '');
  const s = squash(source);
  if (!q) return false;
  return q.split(/\s*(?:…|\.\.\.)\s*/).filter(Boolean).every((part) => s.includes(part));
}

// ---------- classify_comments ----------
/** @param {any} json @param {Set<string>} asked @param {string[]} [topicLabels] */
export function checkClassify(json, asked, topicLabels = []) {
  const au = makeAudit();
  const out = new Map();
  for (const r of list(json?.results)) {
    const ref = String(r?.comment_id ?? '').trim().toUpperCase();
    if (!asked.has(ref) || out.has(ref)) {
      au.a.fabricatedIds.push(ref);
      continue;
    }
    /** @type {Record<string, string[]>} */
    const labels = {};
    for (const d of DIM_KEYS) {
      const vals = list(r?.labels?.[d]).filter((x) => (/** @type {readonly string[]} */ (LABEL_DIMS[d]).includes(x) ? true : (au.a.badEnums++, false)));
      labels[d] = [...new Set(vals)];
    }
    if (!labels.buying_signal.length) labels.buying_signal = ['unknown'];
    labels.topics = topicLabels.length ? list(r?.labels?.topics).filter((t) => topicLabels.includes(t)) : [];
    out.set(ref, { labels, summary: text(r?.neutral_summary, 300), spans: list(r?.evidence_spans).map((s) => text(s, 200)).filter(Boolean).slice(0, 4), confidence: conf(r?.confidence), needsReview: Boolean(r?.needs_review), reason: text(r?.reason, 300), language: text(r?.language, 8) || null });
  }
  const missing = [...asked].filter((r) => !out.has(r));
  return { results: out, missing, suggested: list(json?.suggested_new_labels).map((x) => text(x, 60)).filter(Boolean).slice(0, 10), warnings: list(json?.warnings).map((x) => text(x, 300)).filter(Boolean), audit: auditSummary(au.a) };
}

// ---------- discover_topics ----------
/** @param {any} json @param {Set<string>} allowed @param {{maxTopics: number, maxPains: number}} lim */
export function checkDiscover(json, allowed, lim) {
  const au = makeAudit();
  const topics = [];
  const painKeys = new Set();
  const topicKeys = new Set();
  for (const t of list(json?.topics)) {
    const key = slug(t?.topic_key || t?.name);
    if (!key || topicKeys.has(key) || topics.length >= lim.maxTopics) {
      au.a.dropped++;
      continue;
    }
    const pains = [];
    for (const p of list(t?.suggested_pain_points)) {
      let pk = slug(p?.pain_key || p?.title);
      if (pk && painKeys.has(pk)) pk = `${key}_${pk}`.slice(0, 48);
      const refs = au.refs(p?.evidence_ids, allowed);
      if (!pk || painKeys.has(pk) || !text(p?.title) || !refs.length || pains.length >= lim.maxPains) {
        au.a.dropped++;
        continue;
      }
      painKeys.add(pk);
      pains.push({ key: pk, title: text(p.title, 160), statement: text(p?.statement, 400), refs, status: au.en(p?.epistemic_status, EPISTEMIC, 'hypothesis') });
    }
    const refs = [...new Set([...au.refs(t?.comment_ids, allowed), ...pains.flatMap((p) => p.refs)])];
    if (!text(t?.name) || refs.length < 1) {
      au.a.dropped++;
      continue;
    }
    topicKeys.add(key);
    topics.push({ key, name: text(t.name, 120), description: text(t?.description, 400), refs, pains, confidence: conf(t?.confidence) });
  }
  return {
    topics, unclassified: au.refs(json?.unclassified_comment_ids, allowed),
    notes: list(json?.merge_split_notes).map((x) => text(x, 300)).filter(Boolean), warnings: list(json?.warnings).map((x) => text(x, 300)).filter(Boolean), audit: auditSummary(au.a),
  };
}

/** @param {any} json @param {Set<string>} asked @param {Set<string>} painKeys @returns {{byRef: Map<string, string[]>, audit: any}} */
export function checkAssign(json, asked, painKeys) {
  const au = makeAudit();
  const byRef = new Map();
  for (const r of list(json?.assignments)) {
    const ref = String(r?.comment_id ?? '').trim().toUpperCase();
    if (!asked.has(ref)) {
      au.a.fabricatedIds.push(ref);
      continue;
    }
    const keys = list(r?.pain_keys).map(slug).filter((k) => (painKeys.has(k) ? true : (au.a.badEnums++, false)));
    byRef.set(ref, [...new Set(keys)]);
  }
  return { byRef, audit: auditSummary(au.a) };
}

// ---------- synthesize_insight ----------
/** @param {any} json @param {Set<string>} allowed @param {Set<string>} painKeys @param {Map<string, string>} textByRef */
export function checkInsights(json, allowed, painKeys, textByRef) {
  const au = makeAudit();
  const out = new Map();
  for (const x of list(json?.insights)) {
    const key = slug(x?.insight_key);
    if (!painKeys.has(key) || out.has(key) || !text(x?.title)) {
      au.a.dropped++;
      continue;
    }
    const quotes = [];
    for (const q of list(x?.what_customers_say)) {
      const ref = au.refs([q?.comment_id], allowed)[0];
      if (ref && quoteIsReal(q?.quote, textByRef.get(ref) ?? '')) quotes.push({ ref, quote: text(q.quote, 300) });
      else au.a.droppedQuotes++;
    }
    const supporting = au.refs(x?.supporting_evidence_ids, allowed);
    out.set(key, {
      title: text(x.title, 200), observedPattern: text(x?.observed_pattern, 600),
      segment: { description: textN(x?.customer_segment?.description, 300), status: au.en(x?.customer_segment?.epistemic_status, EPISTEMIC, 'unverified'), refs: au.refs(x?.customer_segment?.evidence_ids, allowed) },
      need: { statement: textN(x?.possible_underlying_need?.statement, 400), status: au.en(x?.possible_underlying_need?.epistemic_status, EPISTEMIC, 'hypothesis'), refs: au.refs(x?.possible_underlying_need?.evidence_ids, allowed) },
      quotes: quotes.slice(0, 5), supporting, contradicting: au.refs(x?.contradicting_evidence_ids, allowed).filter((r) => !supporting.includes(r)),
      status: au.en(x?.epistemic_status, EPISTEMIC, 'hypothesis'), confidence: conf(x?.confidence),
      gaps: list(x?.evidence_gaps).map((g) => text(g, 300)).filter(Boolean), warnings: list(x?.warnings).map((g) => text(g, 300)).filter(Boolean),
    });
  }
  return { insights: out, audit: auditSummary(au.a) };
}

// ---------- validate_insight ----------
/** @param {any} json @param {Set<string>} allowed */
export function checkValidation(json, allowed) {
  const au = makeAudit();
  const claims = (v) => list(v).map((c) => ({ claim: text(c?.claim, 400), refs: au.refs(c?.evidence_ids, allowed) })).filter((c) => c.claim);
  const out = {
    decision: au.en(json?.decision, VALIDATION_DECISIONS, 'needs_evidence'), status: au.en(json?.epistemic_status, EPISTEMIC, 'unverified'),
    supported: claims(json?.supported_claims).filter((c) => c.refs.length), unsupported: list(json?.unsupported_claims).map((x) => text(x, 400)).filter(Boolean),
    contradictions: claims(json?.contradictions), gaps: list(json?.evidence_gaps).map((x) => text(x, 300)).filter(Boolean),
    edits: list(json?.recommended_edits).map((x) => text(x, 400)).filter(Boolean), warnings: list(json?.warnings).map((x) => text(x, 300)).filter(Boolean),
  };
  // A claim the model calls supported but backs with nothing it was given is not supported.
  return { ...out, audit: auditSummary(au.a) };
}

// ---------- five_whys ----------
/**
 * @param {any} json @param {Set<string>} allowed
 * @param {{known: Map<string, number>, focusKey: string|null, maxNodes: number, maxDepth: number}} o
 *   known: node keys already stored → their depth
 */
export function checkWhys(json, allowed, { known, focusKey, maxNodes, maxDepth }) {
  const au = makeAudit();
  const depth = new Map(known);
  const nodes = [];
  for (const n of list(json?.nodes)) {
    const key = String(n?.node_key ?? '').trim();
    const parent = n?.parent_node_key == null || n.parent_node_key === '' ? null : String(n.parent_node_key).trim();
    if (!key || depth.has(key) || !text(n?.question) || !text(n?.answer)) {
      au.a.dropped++;
      continue;
    }
    if (parent !== null && !depth.has(parent)) {
      au.a.dropped++;
      continue;
    }
    if (focusKey && parent === null) {
      au.a.dropped++;
      continue; // continuing a branch: a new first-level Why is not what was asked
    }
    const d = parent === null ? 1 : /** @type {number} */ (depth.get(parent)) + 1;
    if (d > maxDepth || nodes.length >= maxNodes) {
      au.a.dropped++;
      continue;
    }
    depth.set(key, d);
    const supporting = au.refs(n?.supporting_evidence_ids, allowed);
    let status = au.en(n?.epistemic_status, EPISTEMIC, 'hypothesis');
    // "supported" with no evidence it was given is a hypothesis.
    if ((status === 'supported' || status === 'observed') && !supporting.length) status = 'hypothesis';
    nodes.push({
      key, parentKey: parent, depth: d, question: text(n.question, 300), answer: text(n.answer, 600), reasoning: text(n?.reasoning_summary, 600),
      supporting, contradicting: au.refs(n?.contradicting_evidence_ids, allowed), status, confidence: conf(n?.confidence), gap: textN(n?.evidence_gap, 400),
    });
  }
  const keys = new Set(depth.keys());
  return {
    root: { statement: text(json?.root_problem?.statement, 400), refs: au.refs(json?.root_problem?.evidence_ids, allowed), status: au.en(json?.root_problem?.epistemic_status, EPISTEMIC, 'observed') },
    nodes, next: au.en(json?.next_action, STOP_DECISIONS, 'stop_evidence_insufficient'), stopReason: text(json?.stop_reason, 400),
    candidates: list(json?.root_cause_candidates).map((c) => ({ statement: text(c?.statement, 400), nodeKeys: list(c?.node_keys).map(String).filter((k) => keys.has(k)), status: au.en(c?.epistemic_status, EPISTEMIC, 'hypothesis') })).filter((c) => c.statement),
    warnings: list(json?.warnings).map((x) => text(x, 300)).filter(Boolean), audit: auditSummary(au.a),
  };
}

// ---------- five_w_one_h ----------
/** @param {any} json @param {Set<string>} allowed */
export function checkBrief(json, allowed) {
  const au = makeAudit();
  const field = (f) => {
    const refs = au.refs(f?.evidence_ids, allowed);
    let status = au.en(f?.status, BRIEF_FIELD_STATUSES, 'needs_input');
    const value = textN(f?.value, 500);
    if (!value) status = 'needs_input';
    else if ((status === 'supported' || status === 'observed') && !refs.length) status = 'hypothesis';
    return { value, status, refs };
  };
  const h = json?.how ?? {};
  return {
    who: field(json?.who), what: field(json?.what), why: field(json?.why), when: field(json?.when), where: field(json?.where),
    how: {
      formats: list(h.recommended_format).map((x) => text(x, 80)).filter(Boolean).slice(0, 4), narrative: textN(h.narrative_approach, 400), proof: textN(h.proof_type, 300),
      visual: textN(h.visual_demonstration, 300), cta: textN(h.cta_intent, 300), status: au.en(h.status, BRIEF_FIELD_STATUSES, 'hypothesis'), refs: au.refs(h.evidence_ids, allowed),
    },
    centralInsight: text(json?.central_insight, 500), objective: au.en(json?.communication_objective, OBJECTIVES, 'educate'), message: text(json?.message_to_land, 400),
    misconception: field(json?.misconception_to_address), proof: list(json?.proof_required).map((x) => text(x, 300)).filter(Boolean),
    cta: text(json?.cta_intent, 300), compliance: list(json?.compliance_notes).map((x) => text(x, 300)).filter(Boolean),
    questions: list(json?.open_questions).map((x) => text(x, 300)).filter(Boolean), warnings: list(json?.warnings).map((x) => text(x, 300)).filter(Boolean), audit: auditSummary(au.a),
  };
}

// ---------- generate_opportunities ----------
/** @param {any} json @param {Set<string>} allowed @param {number} max */
export function checkOpportunities(json, allowed, max) {
  const au = makeAudit();
  const out = [];
  const seen = new Set();
  for (const o of list(json?.opportunities)) {
    const title = text(o?.title, 200);
    const refs = au.refs(o?.evidence_ids, allowed);
    const key = String(o?.opportunity_key ?? '').trim() || `OPP_${out.length + 1}`;
    if (!title || seen.has(key) || out.length >= max) {
      au.a.dropped++;
      continue;
    }
    seen.add(key);
    const warnings = list(o?.warnings).map((x) => text(x, 300)).filter(Boolean);
    if (!refs.length) warnings.push('Không có comment nào làm bằng chứng trực tiếp: cần thêm dữ liệu trước khi ưu tiên.');
    out.push({
      key, title, segment: text(o?.target_segment, 300), type: au.en(o?.opportunity_type, OPPORTUNITY_TYPES, 'education'), angle: text(o?.angle, 500), whyPrioritize: text(o?.why_prioritize, 500),
      hooks: list(o?.hook_options).map((x) => text(x, 200)).filter(Boolean).slice(0, 3),
      format: { platform: textN(o?.recommended_format?.platform, 40), format: text(o?.recommended_format?.format, 80), duration: Number.isInteger(o?.recommended_format?.duration_seconds) ? o.recommended_format.duration_seconds : null },
      outline: list(o?.outline).map((x) => text(x, 300)).filter(Boolean).slice(0, 6), cta: text(o?.cta, 300), audienceAction: text(o?.audience_action, 300),
      refs, facts: list(o?.facts_to_verify).map((x) => text(x, 300)).filter(Boolean), compliance: list(o?.compliance_notes).map((x) => text(x, 300)).filter(Boolean),
      aiStrength: au.en(o?.evidence_strength, STRENGTHS, 'weak'), status: refs.length ? au.en(o?.epistemic_status, EPISTEMIC, 'hypothesis') : 'unverified', warnings,
    });
  }
  return { opportunities: out, duplicates: list(json?.near_duplicates).map((d) => ({ keys: list(d?.opportunity_keys).map(String), note: text(d?.note, 300) })), warnings: list(json?.overall_warnings).map((x) => text(x, 300)).filter(Boolean), audit: auditSummary(au.a) };
}

/** @param {any} json @param {Set<string>} keys */
export function checkEvaluation(json, keys) {
  const out = new Map();
  for (const e of list(json?.evaluations)) {
    const k = String(e?.opportunity_key ?? '').trim();
    if (!keys.has(k) || out.has(k)) continue;
    out.set(k, {
      coverage: text(e?.pain_point_coverage, 300), specificity: text(e?.audience_specificity, 300), evidence: text(e?.evidence_strength, 300), differentiation: text(e?.differentiation, 300),
      feasibility: text(e?.feasibility, 300), fit: text(e?.strategic_fit, 300), compliance: text(e?.compliance_load, 300), recommendation: oneOf(e?.recommendation, ['prioritize', 'keep', 'merge', 'drop'], 'keep'), reason: text(e?.reason, 500),
    });
  }
  return { byKey: out, summary: text(json?.summary, 800), warnings: list(json?.warnings).map((x) => text(x, 300)).filter(Boolean) };
}
