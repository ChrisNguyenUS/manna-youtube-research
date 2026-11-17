#!/usr/bin/env python3
"""Turn videos.json + classification.json into analysis.json.

Usage: python3 analyze.py videos.json classification.json analysis.json [--seed 7] [--batch 10]

What it computes (all the report's numbers come from here):
  * per video: ring, bucket, reason, band, emails (= comments / 2), rate (= emails / views), has_cta, batch
  * per ring: count, share, outlier mean/median, reach (median + total views), conversion (median + total
    emails), efficiency (pooled rate = total emails / total views, and the per-video median rate)
  * the aim hypothesis (biggest dots toward rings 3-4; ring 5 empty or underperforming; Viral Trap check)
  * the money hypothesis (reach rises outward; rate rises inward; absolute conversions peak mid-ring)
  * bucket x ring cells with the same reach / conversion / efficiency stats, ranked by bang for buck
    (median emails per video, then pooled rate), n >= 3 to rank
  * the recipe: per-video attributes (thing_magnet, claude_verb, cta_early, named_framework, numbered_steps),
    a 0-4 score = ring fit (ring 4 = 2, rings 1 and 3 = 1, rings 2 and 5 = 0) + thing magnet + "turn Claude into",
    with / without splits for each attribute, emails and rate by score, and the attributes tested but not scored
  * batches of --batch videos from the oldest: each batch's stats, the cumulative best cell through that
    batch (the recommendation for the next batch), and how the next batch followed it and fared
  * forward mode: the last --batch videos and the recommendation for the next --batch
  * a deterministic dot layout on a 600-unit wheel with 60-unit bands

classification.json is written by Claude after reading every script (see SKILL.md Stage 4d):
  {"rings": {"1": "...", ..., "5": "..."}, "center": "...",
   "buckets": {"key": "Plain name", ...},
   "videos": {"<n>": {"ring": 1-5, "bucket": "key", "reason": "one line"}}}
where <n> is the video's position in videos.json (1 = newest).
"""
import argparse, json, math, random, re, statistics
from collections import Counter, defaultdict

ap = argparse.ArgumentParser()
ap.add_argument('videos'); ap.add_argument('classification'); ap.add_argument('out')
ap.add_argument('--seed', type=int, default=7)
ap.add_argument('--batch', type=int, default=10)
ap.add_argument('--min-cell', type=int, default=3, help='videos a bucket x ring cell needs before it is ranked')
ap.add_argument('--ring-fit', default='', help='override the derived ring-fit points, e.g. "1,0,1,2,0"')
ap.add_argument('--no-claude', action='store_true', help='drop the "turn Claude into" attribute (channels with no AI reels); the score runs 0-3')
a = ap.parse_args()

V = json.load(open(a.videos, encoding='utf-8'))
C = json.load(open(a.classification, encoding='utf-8'))
vids = V['videos']
CTA_RE = re.compile(r'\bcomment\b\s*[“"\'‘]?\s*[A-Za-z0-9#$&+]', re.I)  # "comment X" — a keyword CTA in any phrasing
for v in vids:
    c = C['videos'][str(v['n'])]
    v['ring'] = int(c['ring']); v['bucket'] = c['bucket']; v['reason'] = c['reason']
    v['emails'] = round(v['comments'] / 2, 1)
    v['rate'] = round(v['emails'] / v['views'], 5) if v['views'] else 0
    v['has_cta'] = bool(CTA_RE.search(v.get('caption', '')))
    cap = v.get('caption', '')
    # recipe attributes (computable proxies; the SKILL.md explains each)
    v['thing_magnet'] = bool(re.search(r'database|template|skill\b|\bdoc\b|library|collection|playbook|system\b|\blinks?\b|\bpdf\b|instructions|leaderboard|dashboard', cap, re.I))
    v['claude_verb'] = ('turn_into' if re.search(r'turn(s|ing)?\s+(claude|chatgpt|ai)\s+into', cap, re.I)
                        else 'use_to' if re.search(r'\buse\s+(claude|chatgpt|ai)\s+to\b|\bwith\s+(claude|chatgpt)\b', cap, re.I)
                        else 'other' if re.search(r'\bclaude\b|chatgpt', cap, re.I) else 'none')
    v['named_framework'] = bool(re.search(r"\b(is|it'?s|are|they'?re) called\b|\bI call (this|it|them|these)\b|\bthe [A-Z][\w-]+ (Method|Framework|Effect|Rule|Ladder|Loop|Stack|Arc|Test|Score|Trap|Funnel)\b", cap))
# batches count from the oldest video
oldest_first = sorted(vids, key=lambda v: v['published_at'] if 'published_at' in v else v['date'])
for i, v in enumerate(oldest_first): v['seq'] = i + 1; v['batch'] = i // a.batch + 1

BANDS = {'flop': (0, .5), 'baseline': (.5, 1), 'gem': (1, 3), 'outlier': (3, 8), 'banger': (8, 1e9)}
def band(o):
    for k, (lo, hi) in BANDS.items():
        if lo <= o < hi: return k
    return 'banger'
for v in vids: v['band'] = band(v['outlier'])

def med(xs): return round(statistics.median(xs), 2) if xs else None
def mean(xs): return round(statistics.mean(xs), 2) if xs else None
def stats(rv):
    """reach / conversion / efficiency block for any list of videos"""
    if not rv: return {'count': 0}
    tv = sum(v['views'] for v in rv); te = sum(v['emails'] for v in rv)
    return {
        'count': len(rv),
        'mean_outlier': mean([v['outlier'] for v in rv]), 'median_outlier': med([v['outlier'] for v in rv]),
        'at_3x_plus': sum(1 for v in rv if v['outlier'] >= 3),
        'median_views': med([v['views'] for v in rv]), 'total_views': tv,
        'median_emails': med([v['emails'] for v in rv]), 'total_emails': round(te),
        'pooled_rate': round(te / tv, 5) if tv else 0, 'median_rate': med([v['rate'] for v in rv]),
        'n_cta': sum(1 for v in rv if v['has_cta']),
        'best': max(rv, key=lambda v: v['outlier'])['n'],
        'best_emails': max(rv, key=lambda v: v['emails'])['n'],
        'bands': dict(Counter(v['band'] for v in rv)),
    }

# ---------- per ring ----------
rings = {}
for r in range(1, 6):
    rv = [v for v in vids if v['ring'] == r]
    rings[str(r)] = {'label': C['rings'][str(r)], 'share': round(len(rv) / len(vids), 3) if vids else 0, **stats(rv)}
on_strategy = [v for v in vids if v['ring'] in (2, 3, 4)]
summary = {
    'n': len(vids), 'on_strategy': len(on_strategy), 'on_strategy_pct': round(100 * len(on_strategy) / len(vids)),
    'ring1_pct': round(100 * rings['1']['count'] / len(vids)), 'ring5_pct': round(100 * rings['5']['count'] / len(vids)),
    'channel_mean_outlier': mean([v['outlier'] for v in vids]), 'channel_median_outlier': med([v['outlier'] for v in vids]),
    'total_views': sum(v['views'] for v in vids), 'total_emails': round(sum(v['emails'] for v in vids)),
    'pooled_rate': round(sum(v['emails'] for v in vids) / sum(v['views'] for v in vids), 5),
    'median_views': med([v['views'] for v in vids]), 'median_emails': med([v['emails'] for v in vids]),
    'n_cta': sum(1 for v in vids if v['has_cta']),
    'date_from': oldest_first[0]['date'], 'date_to': oldest_first[-1]['date'],
    'batch_size': a.batch, 'n_batches': math.ceil(len(vids) / a.batch),
}

# ---------- aim hypothesis: biggest dots toward rings 3-4; ring 5 empty or underperforming ----------
ranked = sorted(vids, key=lambda v: v['outlier'], reverse=True)
top10 = ranked[:10]; top5 = ranked[:5]
top10_rings = Counter(v['ring'] for v in top10)
ring5 = rings['5']
h = {
    'top10': [v['n'] for v in top10],
    'top10_by_ring': {str(r): top10_rings.get(r, 0) for r in range(1, 6)},
    'top10_in_3_4': top10_rings.get(3, 0) + top10_rings.get(4, 0), 'top10_in_2': top10_rings.get(2, 0),
    'top10_in_1': top10_rings.get(1, 0), 'top10_in_5': top10_rings.get(5, 0),
    'ring5_count': ring5['count'], 'ring5_mean': ring5.get('mean_outlier'), 'ring4_count': rings['4']['count'],
    'viral_trap_videos': [v['n'] for v in top5 if v['ring'] == 5],
}
h['ring5_verdict'] = 'confirmed' if (h['top10_in_5'] == 0 and (ring5['count'] == 0 or (ring5.get('mean_outlier') or 0) < summary['channel_median_outlier'])) else 'contradicted'
if h['top10_in_3_4'] >= 6: h['outer_verdict'] = 'confirmed'
elif h['top10_in_3_4'] + h['top10_in_2'] >= 8 and h['top10_in_1'] <= 1: h['outer_verdict'] = 'confirmed at ring 3 and 2'
else: h['outer_verdict'] = 'not confirmed'
h['ring4_tested'] = rings['4']['count'] > 0

# ---------- money hypothesis: reach rises outward, rate rises inward, absolute conversions peak mid ----------
tested = [r for r in range(1, 6) if rings[str(r)]['count'] >= a.min_cell]
def monotone(seq, up=True):
    return all((b >= a_) if up else (b <= a_) for a_, b in zip(seq, seq[1:]))
mv = [rings[str(r)]['median_views'] for r in tested]; pr = [rings[str(r)]['pooled_rate'] for r in tested]; me = [rings[str(r)]['median_emails'] for r in tested]
money = {
    'rings_tested': tested,
    'median_views_by_ring': {str(r): rings[str(r)]['median_views'] for r in tested},
    'pooled_rate_by_ring': {str(r): rings[str(r)]['pooled_rate'] for r in tested},
    'median_emails_by_ring': {str(r): rings[str(r)]['median_emails'] for r in tested},
    'reach_up_outward': monotone(mv, True) if len(mv) > 1 else None,
    'reach_up_to_peak': (monotone(mv[:mv.index(max(mv)) + 1], True) and mv.index(max(mv)) > 0) if len(mv) > 1 else None,
    'rate_up_inward': monotone(pr, False) if len(pr) > 1 else None,
    'peak_emails_ring': tested[me.index(max(me))] if me else None,
    'peak_views_ring': tested[mv.index(max(mv))] if mv else None,
    'peak_rate_ring': tested[pr.index(max(pr))] if pr else None,
}
money['abs_conv_peaks_mid'] = money['peak_emails_ring'] in (2, 3, 4) if money['peak_emails_ring'] else None

# ---------- recipe: ring fit + two multipliers -> a 0-4 score per video ----------
# Ring fit is derived from the channel's own numbers (override with --ring-fit "1,0,1,2,0"):
#   2 = the ring with the most emails per video (n >= min-cell)
#   1 = a ring within 80% of the channel on BOTH median emails per video and pooled rate
#   0 = everything else (and rings with fewer than min-cell videos)
if a.ring_fit:
    RING_FIT = {r + 1: int(x) for r, x in enumerate(a.ring_fit.split(','))}
else:
    ok_rings = [r for r in range(1, 6) if rings[str(r)]['count'] >= a.min_cell]
    best_r = max(ok_rings, key=lambda r: (rings[str(r)]['median_emails'], rings[str(r)]['pooled_rate'])) if ok_rings else None
    RING_FIT = {}
    for r in range(1, 6):
        R = rings[str(r)]
        if r == best_r: RING_FIT[r] = 2
        elif r in ok_rings and R['median_emails'] >= 0.8 * summary['median_emails'] and R['pooled_rate'] >= 0.8 * summary['pooled_rate']: RING_FIT[r] = 1
        else: RING_FIT[r] = 0
for v in vids:
    v['cta_early'] = bool(re.search(r'\bcomment\b', ' / '.join(v.get('caption', '').split('\n')[:3]), re.I))
    v['numbered_steps'] = bool(re.search(r'\b(step|number|level|element|tip)\s*1\b|\n1\.', v.get('caption', ''), re.I))
    v['score'] = RING_FIT[v['ring']] + int(v['thing_magnet']) + (0 if a.no_claude else int(v['claude_verb'] == 'turn_into'))
def split(name, pred):
    a = [v for v in vids if pred(v)]; b = [v for v in vids if not pred(v)]
    return {'attribute': name, 'with': stats(a), 'without': stats(b)}
recipe = {
    'ring_fit_points': RING_FIT,
    'attributes': [split('thing_magnet', lambda v: v['thing_magnet'])] + ([] if a.no_claude else [split('claude_turn_into', lambda v: v['claude_verb'] == 'turn_into')]),
    'max_score': 3 if a.no_claude else 4,
    'ring_fit_derived': not bool(a.ring_fit),
    'claude_reels': sum(1 for v in vids if v['claude_verb'] == 'turn_into'),
    'tested_not_scored': [
        split('named_framework', lambda v: v['named_framework']),
        split('numbered_steps', lambda v: v['numbered_steps']),
        split('cta_early', lambda v: v['cta_early']),
    ],
    'by_ring_fit': {str(r): {'points': RING_FIT[r], **stats([v for v in vids if v['ring'] == r])} for r in range(1, 6)},
    'claude_verbs': {k: stats([v for v in vids if v['claude_verb'] == k]) for k in ('turn_into', 'use_to', 'other', 'none')},
    'by_score': {str(sc): stats([v for v in vids if v['score'] == sc]) for sc in range(0, 5)},
    'threshold_rule': 'the lowest score at which median emails per video is at least double the median of the scores below it (floor 2)',
    'bands': {'low': stats([v for v in vids if v['score'] <= 2]), 'high': stats([v for v in vids if v['score'] >= 3])},
    'threshold': (lambda: next((sc for sc in range(2, 5) if stats([v for v in vids if v['score'] == sc])['count'] and stats([v for v in vids if v['score'] < sc])['count'] and (stats([v for v in vids if v['score'] == sc])['median_emails'] or 0) >= 2 * (stats([v for v in vids if v['score'] < sc])['median_emails'] or 0)), 3))(),
    'top': [v['n'] for v in sorted(vids, key=lambda v: (-v['score'], -v['emails'])) if v['score'] >= 3][:8],
}

# ---------- buckets and bucket x ring cells ----------
buckets = {}
for key, name in C['buckets'].items():
    bv = [v for v in vids if v['bucket'] == key]
    by_ring = Counter(v['ring'] for v in bv)
    if bv:
        top = max(by_ring.values()); placed = max(r for r, c in by_ring.items() if c == top)
        com = sum(v['ring'] for v in bv) / len(bv)
    else:
        placed, com = None, None
    buckets[key] = {'name': name, 'by_ring': {str(r): by_ring.get(r, 0) for r in range(1, 6)},
                    'placed_ring': placed, 'center_of_mass': round(com, 2) if com else None,
                    'videos': [v['n'] for v in sorted(bv, key=lambda v: v['outlier'], reverse=True)],
                    'flag': ('too narrow for a bucket — lift to ring 2' if placed == 1 else 'too broad — the Viral Trap' if placed == 5 else ''),
                    **stats(bv)}
cells = []
for key in C['buckets']:
    for r in range(1, 6):
        cv = [v for v in vids if v['bucket'] == key and v['ring'] == r]
        if cv:
            cells.append({'bucket': key, 'ring': r, 'videos': [v['n'] for v in sorted(cv, key=lambda v: v['emails'], reverse=True)], **stats(cv)})
def rank_key(c): return (c['median_emails'], c['pooled_rate'])
for key in C['buckets']:
    bc = [c for c in cells if c['bucket'] == key]
    ok = [c for c in bc if c['count'] >= a.min_cell] or [c for c in bc if c['count'] >= 2]
    buckets[key]['aim_ring'] = max(ok, key=rank_key)['ring'] if ok else None
    buckets[key]['aim_basis'] = ('n>=%d' % a.min_cell) if any(c['count'] >= a.min_cell for c in bc) else ('n>=2' if ok else 'too few')
    buckets[key]['reach_ring'] = max(ok, key=lambda c: c['median_views'])['ring'] if ok else None
    buckets[key]['rate_ring'] = max(ok, key=lambda c: c['pooled_rate'])['ring'] if ok else None
ranked_cells = sorted([c for c in cells if c['count'] >= a.min_cell], key=rank_key, reverse=True)
for i, c in enumerate(ranked_cells): c['bang_rank'] = i + 1
reach_sorted = sorted([c for c in cells if c['count'] >= a.min_cell], key=lambda c: c['median_views'], reverse=True)
for i, c in enumerate(reach_sorted): c['reach_rank'] = i + 1
rate_sorted = sorted([c for c in cells if c['count'] >= a.min_cell], key=lambda c: c['pooled_rate'], reverse=True)
for i, c in enumerate(rate_sorted): c['rate_rank'] = i + 1

# ---------- batches (walk-forward) ----------
def best_cell(pool, min_n):
    cc = defaultdict(list)
    for v in pool: cc[(v['bucket'], v['ring'])].append(v)
    cands = [(k, stats(vs)) for k, vs in cc.items() if len(vs) >= min_n]
    if not cands: return None
    k, s = max(cands, key=lambda kv: rank_key(kv[1]))
    return {'bucket': k[0], 'ring': k[1], **s}
batches = []
nb = summary['n_batches']
for k in range(1, nb + 1):
    bv = [v for v in oldest_first if v['batch'] == k]
    cum = [v for v in oldest_first if v['batch'] <= k]
    rec = best_cell(cum, a.min_cell)
    entry = {'k': k, 'videos': [v['n'] for v in bv], 'seq_from': bv[0]['seq'], 'seq_to': bv[-1]['seq'],
             'date_from': bv[0]['date'], 'date_to': bv[-1]['date'], 'partial': len(bv) < a.batch,
             'by_ring': {str(r): sum(1 for v in bv if v['ring'] == r) for r in range(1, 6)},
             'by_bucket': {key: sum(1 for v in bv if v['bucket'] == key) for key in C['buckets']},
             'stats': stats(bv), 'batch_best': best_cell(bv, 2), 'cumulative_best': rec, 'cumulative_n': len(cum)}
    if k > 1:
        prev = batches[-1]['stats']
        entry['vs_prev'] = {'median_emails_delta': round(entry['stats']['median_emails'] - prev['median_emails'], 1),
                            'median_views_delta': round(entry['stats']['median_views'] - prev['median_views'])}
    nxt = [v for v in oldest_first if v['batch'] == k + 1]
    if rec and nxt:
        inside = [v for v in nxt if v['bucket'] == rec['bucket'] and v['ring'] == rec['ring']]
        outside = [v for v in nxt if not (v['bucket'] == rec['bucket'] and v['ring'] == rec['ring'])]
        in_ring = [v for v in nxt if v['ring'] == rec['ring']]
        entry['follow_through'] = {
            'next_n': len(nxt), 'in_cell': len(inside), 'in_ring': len(in_ring),
            'in_cell_median_emails': med([v['emails'] for v in inside]), 'out_cell_median_emails': med([v['emails'] for v in outside]),
            'in_cell_median_views': med([v['views'] for v in inside]), 'out_cell_median_views': med([v['views'] for v in outside]),
            'in_ring_median_emails': med([v['emails'] for v in in_ring]), 'out_ring_median_emails': med([v['emails'] for v in nxt if v['ring'] != rec['ring']]),
        }
    batches.append(entry)
# scorecard: across batches where the next batch had >=1 video in the recommended cell
ft = [b['follow_through'] for b in batches if b.get('follow_through')]
paid = [f for f in ft if f['in_cell'] and f['out_cell_median_emails'] is not None and f['in_cell_median_emails'] is not None]
scorecard = {
    'checkpoints': len(ft),
    'next_batch_touched_cell': sum(1 for f in ft if f['in_cell']),
    'cell_beat_rest': sum(1 for f in paid if f['in_cell_median_emails'] > f['out_cell_median_emails']),
    'cell_compared': len(paid),
    'ring_beat_rest': sum(1 for f in ft if f['in_ring'] and f['out_ring_median_emails'] is not None and f['in_ring_median_emails'] is not None and f['in_ring_median_emails'] > f['out_ring_median_emails']),
    'ring_compared': sum(1 for f in ft if f['in_ring'] and f['out_ring_median_emails'] is not None and f['in_ring_median_emails'] is not None),
}
# forward mode: the last --batch posted
last = oldest_first[-a.batch:]
forward = {'videos': [v['n'] for v in last], 'date_from': last[0]['date'], 'date_to': last[-1]['date'],
           'by_ring': {str(r): sum(1 for v in last if v['ring'] == r) for r in range(1, 6)},
           'by_bucket': {key: sum(1 for v in last if v['bucket'] == key) for key in C['buckets']},
           'stats': stats(last), 'top_cells': [{k: c[k] for k in ('bucket', 'ring', 'count', 'median_views', 'median_emails', 'pooled_rate', 'bang_rank')} for c in ranked_cells[:3]],
           'untested_rings': [r for r in range(1, 6) if rings[str(r)]['count'] < a.min_cell]}

# ---------- dot layouts (deterministic): one sized by outlier score, one sized by emails ----------
SIZE = 600; CX = CY = SIZE // 2; BAND = 60
def dot_r(o): return round(4 + 12 * math.sqrt(min(o, 8) / 8), 1)
email_cap = sorted(v['emails'] for v in vids)[int(0.9 * (len(vids) - 1))] or 1  # 90th percentile caps the biggest dot
def dot_re(e): return round(4 + 12 * math.sqrt(min(e, email_cap) / email_cap), 1)
def layout(radius_fn, seed):
    rng = random.Random(seed); pts = []
    for v in vids:
        r = radius_fn(v); inner = (v['ring'] - 1) * BAND; outer = v['ring'] * BAND
        lo = (inner + r + 2) if v['ring'] > 1 else 0; hi = outer - r - 2
        rad = rng.uniform(lo, hi) if hi > lo else (lo + hi) / 2; ang = rng.uniform(0, 2 * math.pi)
        pts.append({'v': v, 'r': r, 'x': CX + rad * math.cos(ang), 'y': CY + rad * math.sin(ang), 'lo': lo, 'hi': hi})
    for _ in range(900):
        moved = False
        for i in range(len(pts)):
            for j in range(i + 1, len(pts)):
                p, q = pts[i], pts[j]
                dx, dy = q['x'] - p['x'], q['y'] - p['y']; d = math.hypot(dx, dy) or 1e-6
                mind = p['r'] + q['r'] + 3
                if d < mind:
                    push = (mind - d) / 2; ux, uy = dx / d, dy / d
                    p['x'] -= ux * push; p['y'] -= uy * push; q['x'] += ux * push; q['y'] += uy * push; moved = True
        for p in pts:
            dx, dy = p['x'] - CX, p['y'] - CY; rad = math.hypot(dx, dy) or 1e-6
            if rad < p['lo'] or rad > p['hi']:
                t = min(max(rad, p['lo']), p['hi']) / rad; p['x'] = CX + dx * t; p['y'] = CY + dy * t; moved = True
        if not moved: break
    return {p['v']['n']: {'x': round(p['x'], 1), 'y': round(p['y'], 1), 'r': p['r']} for p in pts}
L1 = layout(lambda v: dot_r(v['outlier']), a.seed); L2 = layout(lambda v: dot_re(v['emails']), a.seed + 1)
for v in vids: v['dot'] = L1[v['n']]; v['dot_e'] = L2[v['n']]

json.dump({
    'channel': V['channel'], 'pulled_at': V['pulled_at'], 'center': C['center'],
    'rings': rings, 'summary': summary, 'hypothesis': h, 'money': money,
    'buckets': buckets, 'cells': cells, 'recipe': recipe, 'batches': batches, 'scorecard': scorecard, 'forward': forward,
    'screening': {'requested': V['requested'], 'kept': V['kept'], 'dropped': V['dropped'],
                  'unanalyzed': V['unanalyzed'], 'fresh': V['fresh'], 'median_views_all': V['median_views_all']},
    'wheel': {'viewbox': SIZE, 'cx': CX, 'band': BAND, 'size_rule': 'r = 4 + 12*sqrt(min(outlier,8)/8)', 'email_cap': email_cap, 'size_rule_emails': 'r = 4 + 12*sqrt(min(emails,p90)/p90)'},
    'videos': vids,
}, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

print(f"n={summary['n']} on-strategy={summary['on_strategy_pct']}% pooled rate={summary['pooled_rate']*100:.2f}% | " +
      ' '.join(f"R{r}: n={rings[str(r)]['count']} out={rings[str(r)].get('mean_outlier')} views~{rings[str(r)].get('median_views')} emails~{rings[str(r)].get('median_emails')} rate={round((rings[str(r)].get('pooled_rate') or 0)*100,2)}%" for r in range(1, 6)))
print('aim:', h['outer_verdict'], '/', h['ring5_verdict'], '| money: reach up outward', money['reach_up_outward'], '· rate up inward', money['rate_up_inward'], '· emails peak ring', money['peak_emails_ring'], '· views peak', money['peak_views_ring'], '· rate peak', money['peak_rate_ring'])
for c in ranked_cells[:6]:
    print(f"  #{c['bang_rank']} {buckets[c['bucket']]['name']:30} R{c['ring']} n={c['count']:2} views~{c['median_views']:>8} emails~{c['median_emails']:>6} rate={c['pooled_rate']*100:.2f}%")
print('scorecard', scorecard)
