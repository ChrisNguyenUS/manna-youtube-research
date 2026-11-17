#!/usr/bin/env python3
"""Turn rows.json into analysis.json: feature lifts, the data-driven "recipe ladder",
confound checks, group comparisons, null results, and the per-video explorer payload.

Usage: python3 analyze.py rows.json analysis.json [--handle @name] [--platform instagram]
Requires numpy + scipy (pip install numpy scipy).
"""
import json, sys, argparse
from collections import defaultdict
import numpy as np
from scipy import stats

ap = argparse.ArgumentParser()
ap.add_argument('rows'); ap.add_argument('out')
ap.add_argument('--handle', default=''); ap.add_argument('--platform', default='')
args = ap.parse_args()

rows = json.load(open(args.rows))
main = [r for r in rows if r['has_cta'] and r['script_visible']]
capo = [r for r in rows if r['has_cta'] and not r['script_visible']]
nocta = [r for r in rows if not r['has_cta']]
if len(main) < 8:
    sys.exit(f'Only {len(main)} videos have a keyword CTA and a visible script — need at least 8 (ideally 30+) for the report to mean anything.')
conv = np.array([r['conv'] for r in main])
base_med = float(np.median(conv))
def med(xs): return float(np.median(xs)) if len(xs) else 0.0
def pooled(rs): v = sum(r['views'] for r in rs); return round(sum(r['leads'] for r in rs) / v * 1000, 2) if v else 0

ASSET = ('doc_guide', 'database', 'claude_skill', 'links_setup')
LEVERS = {  # key: (label when true, label when false, description, predicate)
    'multi_mention': ('2+ CTA mentions', 'single mention', 'The keyword is asked for 2+ times in the script (usually hook + close)', lambda r: r['mentions'] >= 2),
    'bookend': ('bookend (hook + close)', 'close only', 'CTA in the first 3 lines AND at the end', lambda r: r['placement'] == 'bookend'),
    'send_through': ('"send it through"', '"send you / to you"', 'Delivery verb on the final line: "send (it) through" vs "send you / send it to you"', lambda r: r['send_style'] == 'through'),
    'imperative': ('starts "Comment X"', 'other opener', 'Closing CTA line opens with the imperative "Comment"', lambda r: r['imperative']),
    'conditional': ('starts "If you want…"', 'other opener', 'Closing CTA line opens with a conditional', lambda r: r['conditional']),
    'asset_magnet': ('asset magnet (doc/database/skill/link)', 'video or vague magnet', 'Promises a thing to keep, not a video to watch', lambda r: r['magnet'] in ASSET),
    'video_magnet': ('video magnet', 'non-video magnet', 'Promises "a video / deep dive / breakdown"', lambda r: r['magnet'] == 'video'),
    'magnet_named': ('named magnet', 'vague "it"', 'CTA names a concrete deliverable vs "I\'ll send it through"', lambda r: r['magnet_named']),
    'for_free': ('says "for free"', 'no "free"', 'The word "free" appears in the closing CTA', lambda r: r['for_free']),
    'quantified': ('has a number', 'no number', 'CTA quantifies the magnet ("47 hooks", "the other 7", "18 pages")', lambda r: r['quantified']),
    'tease_remainder': ('teases "the other N"', 'no remainder tease', 'CTA offers the rest of a list the video only partially covered', lambda r: r['tease_remainder']),
    'totality': ('totality word', 'none', '"entire", "whole", "full", "all", "everything", "complete"', lambda r: r['totality']),
    'exact': ('says "exact/exactly"', 'none', 'The word "exact" or "exactly" in the CTA', lambda r: r['exact']),
    'possessive_my': ('says "my"/"our"', 'none', 'Possessive ownership of the magnet ("my doc", "our database")', lambda r: r['possessive_my']),
    'effort': ('effort framing', 'none', '"I put together / I built / I spent…"', lambda r: r['effort']),
    'benefit': ('benefit clause', 'none', '"so you can…", "to help you…", "so you never have to…"', lambda r: r['benefit']),
    'with_examples': ('mentions examples', 'none', 'Magnet promised "with examples"', lambda r: r['with_examples']),
    'ai_feed': ('AI-usable', 'none', '"feed this into AI" / mentions Claude or GPT', lambda r: r['ai_feed']),
    'kw_caps': ('keyword ALL CAPS', 'lowercase/Title', 'Keyword written in all caps in the caption', lambda r: r['kw_caps']),
    'kw_in_body': ('keyword = topic word', 'keyword not in script', 'Keyword is a word that also appears in the script body', lambda r: r['kw_in_body']),
    'kw_short': ('keyword ≤ 5 letters', 'longer keyword', 'Keyword length', lambda r: r['kw_len'] <= 5),
    'long_cta': ('long CTA (30+ words)', 'short CTA (<30)', 'Closing CTA block is 30+ words', lambda r: r['cta_words'] >= 30),
    'short_final': ('final line ≤ 12 words', 'longer final line', 'The last CTA sentence is 12 words or fewer', lambda r: r['final_line_words'] <= 12),
    'power3': ('3+ power words', '<3 power words', 'Three or more power words in the CTA block', lambda r: r['power_count'] >= 3),
}
RECIPE_POOL = ['multi_mention', 'send_through', 'imperative', 'asset_magnet', 'for_free', 'quantified', 'benefit', 'magnet_named', 'effort', 'with_examples', 'kw_caps', 'totality', 'exact', 'tease_remainder', 'possessive_my', 'ai_feed', 'kw_in_body', 'short_final']

def split(key, subset=None):
    rs = subset if subset is not None else main
    pred = LEVERS[key][3]
    a = [r['conv'] for r in rs if pred(r)]; b = [r['conv'] for r in rs if not pred(r)]
    return a, b

features = []
for key, (lt, lf, desc, pred) in LEVERS.items():
    a, b = split(key)
    if len(a) < 4 or len(b) < 4: continue
    p = float(stats.mannwhitneyu(a, b, alternative='two-sided').pvalue)
    features.append(dict(feature=key, desc=desc, with_label=lt, without_label=lf, n_with=len(a), n_without=len(b),
                         med_with=round(med(a), 2), med_without=round(med(b), 2), mean_with=round(float(np.mean(a)), 2),
                         mean_without=round(float(np.mean(b)), 2), lift=round(med(a) / med(b), 2) if med(b) else 0, p=round(p, 3)))
features.sort(key=lambda x: -x['lift'])
F = {f['feature']: f for f in features}

# --- data-driven recipe: up to 4 levers that help, are reasonably supported, and are mutually distinct
cands = [f for f in features if f['feature'] in RECIPE_POOL and f['lift'] >= 1.12 and f['p'] < 0.2 and f['n_with'] >= 6 and f['n_without'] >= 6]
cands.sort(key=lambda f: (f['p'], -f['lift']))
recipe, overlaps = [], []
for f in cands:  # skip levers that are near-duplicates of one already chosen (e.g. bookend ⊂ multi_mention)
    mask = [bool(LEVERS[f['feature']][3](r)) for r in main]
    dup = None
    for k, m in zip(recipe, overlaps):
        inter = sum(1 for a, b in zip(mask, m) if a and b); union = sum(1 for a, b in zip(mask, m) if a or b)
        if union and inter / union >= 0.6: dup = k; break
    if dup: f['overlaps_with'] = dup; continue
    recipe.append(f['feature']); overlaps.append(mask)
    if len(recipe) == 4: break
# if the data can't support 4, fall back to the best-supported few (never fewer than 2 so the ladder has rungs)
if len(recipe) < 2:
    extra = [f['feature'] for f in features if f['feature'] in RECIPE_POOL and f['lift'] > 1.0 and f['feature'] not in recipe]
    recipe = (recipe + extra)[:2]
def score(r): return sum(1 for k in recipe if LEVERS[k][3](r))
ladder = []
for k in range(len(recipe) + 1):
    rs = [r for r in main if score(r) == k]
    ladder.append(dict(score=k, n=len(rs), med=round(med([r['conv'] for r in rs]), 1) if rs else 0, pooled=pooled(rs) if rs else 0))
recipe_p = float(stats.spearmanr([score(r) for r in main], conv).pvalue) if len(recipe) else 1.0

# --- confound checks: re-test each recipe lever inside the subset LACKING the strongest lever
confounds = []
if recipe:
    top = recipe[0]
    for k in recipe[1:]:
        sub = [r for r in main if not LEVERS[top][3](r)]
        a, b = split(k, sub)
        if len(a) >= 4 and len(b) >= 4:
            p = float(stats.mannwhitneyu(a, b, alternative='two-sided').pvalue)
            confounds.append(dict(title=f'{LEVERS[k][0]} — only among videos WITHOUT {LEVERS[top][0]}',
                                  sub=f'Removes the {LEVERS[top][0]} effect', rows=[[LEVERS[k][0], round(med(a), 1), len(a)], [LEVERS[k][1], round(med(b), 1), len(b)]],
                                  p=p, holds=(med(a) > med(b))))
    # and the top lever inside the two biggest hook-category groups (a topic/format proxy)
    hc = defaultdict(list)
    for r in main: hc[r['hook_cat'] or 'unknown'].append(r)
    for cat, rs in sorted(hc.items(), key=lambda x: -len(x[1]))[:2]:
        a, b = split(top, rs)
        if len(a) >= 4 and len(b) >= 4:
            p = float(stats.mannwhitneyu(a, b, alternative='two-sided').pvalue)
            confounds.append(dict(title=f'{LEVERS[top][0]} — only among "{cat}" hook videos', sub='Holds the hook style (a topic proxy) constant',
                                  rows=[[LEVERS[top][0], round(med(a), 1), len(a)], [LEVERS[top][1], round(med(b), 1), len(b)]], p=p, holds=(med(a) > med(b))))

def group(key, min_n=3):
    g = defaultdict(list)
    for r in main: g[str(r[key])].append(r)
    out = []
    for k, rs in g.items():
        if len(rs) < min_n: continue
        c = [r['conv'] for r in rs]
        out.append(dict(group=k, n=len(rs), med=round(med(c), 2), mean=round(float(np.mean(c)), 2), leads=round(sum(r['leads'] for r in rs)),
                        views=sum(r['views'] for r in rs), pooled=pooled(rs),
                        examples=[dict(date=r['date'], conv=r['conv'], line=r['final_line'][:140]) for r in sorted(rs, key=lambda r: -r['conv'])[:3]]))
    return sorted(out, key=lambda x: -x['med'])
groups = dict(magnet=group('magnet'), send_style=group('send_style'), placement=group('placement'), hook_cat=group('hook_cat', 4),
              format_cat=group('format_cat', 4), mentions=group('mentions'), kw=group('kw', 3))

numeric = []
for key, label in [('cta_words', 'Closing CTA length (words)'), ('final_line_words', 'Final CTA sentence length (words)'), ('power_count', 'Power-word count'),
                   ('kw_len', 'Keyword length (chars)'), ('script_words', 'Script length (words)'), ('mentions', 'Number of CTA mentions'), ('views', 'Views'), ('outlier', 'Outlier score')]:
    x = [r[key] for r in main]
    if len(set(x)) < 2: continue
    rho, p = stats.spearmanr(x, conv)
    numeric.append(dict(feature=label, key=key, rho=round(float(rho), 3), p=round(float(p), 3)))

pw = defaultdict(list)
for r in main:
    for w in set(r['power_words']): pw[w].append(r['conv'])
power_table = sorted([dict(word=w, n=len(c), med=round(med(c), 2), lift=round(med(c) / base_med, 2)) for w, c in pw.items() if len(c) >= 4], key=lambda x: -x['lift'])
buckets = []
for lo, hi, lab in [(0, 15, '≤15 words'), (16, 30, '16–30'), (31, 50, '31–50'), (51, 9999, '51+')]:
    rs = [r for r in main if lo <= r['cta_words'] <= hi]
    if rs: buckets.append(dict(bucket=lab, n=len(rs), med=round(med([r['conv'] for r in rs]), 2), pooled=pooled(rs)))
monthly = defaultdict(list)
for r in main: monthly[r['date'][:7]].append(r)
trend = [dict(month=m, n=len(rs), med=round(med([r['conv'] for r in rs]), 2), leads=round(sum(r['leads'] for r in rs)), views=sum(r['views'] for r in rs)) for m, rs in sorted(monthly.items())]

views_rho = next((n['rho'] for n in numeric if n['key'] == 'views'), 0)
summary = dict(
    handle=args.handle, platform=args.platform, n_total=len(rows), n_main=len(main), n_caption_only=len(capo), n_nocta=len(nocta),
    base_med=round(base_med, 2), base_mean=round(float(conv.mean()), 2), total_leads=round(sum(r['leads'] for r in main)),
    total_views=sum(r['views'] for r in main), pooled=pooled(main),
    nocta_conv=[dict(date=r['date'], views=r['views'], comments=r['comments'], conv=r['conv'], hook=r['hook_line'][:90]) for r in sorted(nocta, key=lambda r: r['conv'])[:3]],
    nocta_med=round(med([r['conv'] for r in nocta]), 2) if nocta else None,
    caption_only=dict(n=len(capo), med=round(med([r['conv'] for r in capo]), 2), pooled=pooled(capo)) if capo else None,
    date_range=[min(r['date'] for r in rows if r['date']), max(r['date'] for r in rows if r['date'])],
    corr_views_conv=views_rho, recipe=recipe, recipe_labels=[LEVERS[k][0] for k in recipe], recipe_desc=[LEVERS[k][2] for k in recipe],
    recipe_p=round(recipe_p, 4), kw_mismatch=[dict(date=r['date'], url=r['url']) for r in main if r['kw_mismatch']],
    manual=all(r.get('source') == 'manual' for r in rows),
)
keep = ['uuid', 'date', 'url', 'sc_url', 'thumb', 'views', 'likes', 'comments', 'leads', 'conv', 'outlier', 'hook_cat', 'format_cat', 'topic', 'hook_line', 'kw', 'magnet',
        'placement', 'mentions', 'send_style', 'cta_words', 'final_line_words', 'power_words', 'power_count', 'for_free', 'quantified', 'tease_remainder', 'totality', 'exact',
        'possessive_my', 'effort', 'benefit', 'conditional', 'imperative', 'with_examples', 'ai_feed', 'magnet_named', 'kw_caps', 'kw_mismatch', 'cta_block', 'final_line',
        'all_cta_lines', 'script_visible', 'has_cta', 'script_words', 'kw_len', 'kw_in_body']
out = dict(summary=summary, features=features, ladder=ladder, confounds=confounds, groups=groups, numeric=numeric, power_table=power_table,
           length_buckets=buckets, trend=trend, videos=[{k: r.get(k) for k in keep} for r in rows])
json.dump(out, open(args.out, 'w'), indent=1, ensure_ascii=False)

print(f'n={len(main)} · median {base_med:.2f} · pooled {summary["pooled"]} leads/1K · recipe: {summary["recipe_labels"]} (trend p={recipe_p:.3f})')
print('ladder:', [(l['score'], l['n'], l['med']) for l in ladder])
for f in features[:6] + features[-3:]:
    print(f'  {f["with_label"]:34s} lift {f["lift"]:.2f}  n={f["n_with"]}/{f["n_without"]}  p={f["p"]}')
