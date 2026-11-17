#!/usr/bin/env python3
"""Aggregate classified.json into analysis.json: the Sandcastles format × editing-style matrix, per-channel
hero formats, white-space cells. Rows and columns come from references/taxonomy-map.md; only labels present
in the pulled pool become rows/columns (the rest are listed as absent).

Usage: python3 build_matrix.py classified.json analysis.json --niche "..." --workspace "..." [--examples examples.json]

Definitions (all deterministic; the synthesis guide explains the judgment calls that feed them):
  heat        = Σ min(outlier, 50) over the cell's in-niche videos ("win mass": count × size of the wins,
                capped so one 300x banger can't paint a cell red by itself)
  tier        = r1..r5 by heat quantile among non-empty cells (r1 = hottest fifth)
  specimen    = highest-outlier video in the cell (ties → more views)
  hero format = a channel's top cells by its own win mass; keep cells covering ≥60% of the channel's mass,
                min 1, max 4; needs ≥2 videos in the cell unless the channel has <4 videos
  white space = empty cell whose format row AND editing-style column are each proven in the niche
                (≥ --proven winners, default 8) and which is not on the incompatibility list; ranked by
                row-median × column-median. Tier B white space = empty cell where one axis is unproven
                in the niche but the off-niche/any-niche example pool has ≥2 outlier videos for it.
"""
import argparse, json, math, statistics as st
from collections import defaultdict, Counter

import os, re

def load_map(path):
    m = re.search(r"```python\n(.*?)```", open(path, encoding='utf-8').read(), re.S)
    ns = {}; exec(m.group(1), ns); return ns

CAP = 50.0


def med(xs):
    return round(st.median(xs), 1) if xs else None


def slim(v):
    d = {k: v.get(k) for k in ('uuid', 'handle', 'platform', 'outlier', 'views', 'url', 'sc_url', 'thumb', 'caption',
                                  'spoken_hook', 'topic', 'sc_format_type', 'sc_layout_category', 'sc_layout_type', 'structure', 'layout',
                                  'structure_reason', 'layout_reason', 'date', 'screen')}
    d['caption'] = (d.get('caption') or '')[:240]
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('inp'); ap.add_argument('out')
    ap.add_argument('--niche', default=''); ap.add_argument('--workspace', default='')
    ap.add_argument('--examples', default=None, help='optional examples.json with hand-picked any-niche examples per cell')
    ap.add_argument('--min-outlier', type=float, default=3.0)
    ap.add_argument('--proven', type=int, default=8, help='winners an axis needs before an empty cell on it counts as white space')
    ap.add_argument('--map', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'references', 'taxonomy-map.md'))
    a = ap.parse_args()
    M = load_map(a.map)
    INCOMPATIBLE = set(M['INCOMPATIBLE'])
    allv = json.load(open(a.inp))
    inn = [v for v in allv if v.get('screen') == 'in' and v.get('structure')]
    offn = [v for v in allv if v.get('screen') in ('off-niche', 'brand-deal', 'below-band') and v.get('structure')]
    pool_f = Counter(v['structure'] for v in inn + offn); pool_l = Counter(v['layout'] for v in inn + offn)
    in_f = Counter(v['structure'] for v in inn); in_l = Counter(v['layout'] for v in inn)
    # rows: Sandcastles formats present anywhere in the pool, in-niche volume first, then next-door-only rows
    STRUCTURES = sorted([f for f in M['FORMATS'] if pool_f[f[0]]], key=lambda f: (-in_f[f[0]], -pool_f[f[0]]))
    if pool_f['other']: STRUCTURES.append(('other', 'Other', 'A Sandcastles label this map does not know yet'))
    absent_f = [f for f in M['FORMATS'] if not pool_f[f[0]]]
    # columns: keep Sandcastles' category order (as on the Collections page), drop buckets with nothing in the pool
    LAYOUTS = [l for l in M['LAYOUTS'] if pool_l[l[0]]]
    absent_l = [l for l in M['LAYOUTS'] if not pool_l[l[0]]]
    S = [s[0] for s in STRUCTURES]; L = [l[0] for l in LAYOUTS]

    cells = defaultdict(list)
    for v in inn:
        cells[(v['structure'], v['layout'])].append(v)
    heat = {k: sum(min(v['outlier'], CAP) for v in vs) for k, vs in cells.items()}
    total_heat = sum(heat.values()) or 1
    ranked = sorted(heat, key=lambda k: -heat[k])
    n = len(ranked)
    tier = {}
    for i, k in enumerate(ranked):
        q = i / max(n, 1)
        tier[k] = 'r1' if q < .2 else 'r2' if q < .4 else 'r3' if q < .6 else 'r4' if q < .8 else 'r5'

    row_tot = Counter(v['structure'] for v in inn); col_tot = Counter(v['layout'] for v in inn)
    row_med = {s: med([v['outlier'] for v in inn if v['structure'] == s]) for s in S}
    col_med = {l: med([v['outlier'] for v in inn if v['layout'] == l]) for l in L}

    matrix = {}
    for s in S:
        for l in L:
            vs = sorted(cells.get((s, l), []), key=lambda v: (-v['outlier'], -v['views']))
            c = {'structure': s, 'layout': l, 'count': len(vs), 'median': med([v['outlier'] for v in vs]),
                 'best': vs[0]['outlier'] if vs else None, 'heat': round(heat.get((s, l), 0), 1),
                 'share': round(100 * heat.get((s, l), 0) / total_heat, 1), 'tier': tier.get((s, l)),
                 'channels': sorted(Counter(v['handle'] for v in vs).items(), key=lambda x: -x[1]),
                 'flavors': sorted(Counter(v['sc_layout_category'] + '/' + v['sc_layout_type'] for v in vs).items(), key=lambda x: -x[1])[:4],
                 'specimen': slim(vs[0]) if vs else None,
                 'videos': [slim(v) for v in vs[:12]]}
            matrix[f'{s}|{l}'] = c

    # per-channel hero formats
    channels = {}
    for h in sorted({v['handle'] for v in inn}):
        cv = [v for v in inn if v['handle'] == h]
        cc = defaultdict(list)
        for v in cv: cc[(v['structure'], v['layout'])].append(v)
        mass = {k: sum(min(v['outlier'], CAP) for v in vs) for k, vs in cc.items()}
        tot = sum(mass.values()) or 1
        order = sorted(mass, key=lambda k: -mass[k])
        heroes, acc = [], 0
        for k in order:
            if len(heroes) >= 4: break
            if len(cv) >= 4 and len(cc[k]) < 2 and heroes: break
            heroes.append({'structure': k[0], 'layout': k[1], 'count': len(cc[k]), 'median': med([v['outlier'] for v in cc[k]]),
                           'share': round(100 * mass[k] / tot), 'best': slim(max(cc[k], key=lambda v: v['outlier']))})
            acc += mass[k] / tot
            if acc >= .6 and len(heroes) >= 1: break
        best = max(cv, key=lambda v: v['outlier'])
        channels[h] = {'handle': h, 'platforms': sorted({v['platform'] for v in cv}), 'n': len(cv),
                       'median': med([v['outlier'] for v in cv]), 'best': slim(best), 'heroes': heroes,
                       'mass': round(sum(mass.values()), 1), 'distinct_cells': len(cc)}
    chan_rank = sorted(channels.values(), key=lambda c: (-c['mass'], -c['n']))

    # white space
    off_cells = defaultdict(list)
    for v in offn: off_cells[(v['structure'], v['layout'])].append(v)
    off_row = Counter(v['structure'] for v in offn); off_col = Counter(v['layout'] for v in offn)
    examples = json.load(open(a.examples)) if a.examples else {}
    ws = []
    for s in S:
        for l in L:
            if cells.get((s, l)) or (s, l) in INCOMPATIBLE: continue
            proven_s, proven_l = row_tot[s] >= a.proven, col_tot[l] >= a.proven
            ex = [slim(v) for v in sorted(off_cells.get((s, l), []), key=lambda v: -v['outlier'])[:3]]
            ex += examples.get(f'{s}|{l}', [])
            if proven_s and proven_l:
                # shrink thin rows/columns toward the niche median so 4 huge screen demos can't outrank 40 solid ones
                k = 5.0; gm = med([v['outlier'] for v in inn]) or 1
                rs = (row_tot[s] * (row_med[s] or gm) + k * gm) / (row_tot[s] + k)
                cs = (col_tot[l] * (col_med[l] or gm) + k * gm) / (col_tot[l] + k)
                score = rs * cs
                ws.append({'structure': s, 'layout': l, 'tier': 'A', 'score': round(math.sqrt(score), 1),
                           'why': f'{next(x[1] for x in STRUCTURES if x[0]==s)} is proven here ({row_tot[s]} winners, median {row_med[s]}x) and so is {next(x[1] for x in LAYOUTS if x[0]==l)} ({col_tot[l]} winners, median {col_med[l]}x); nobody has put them together.',
                           'row_n': row_tot[s], 'row_med': row_med[s], 'col_n': col_tot[l], 'col_med': col_med[l], 'examples': ex})
            else:
                near = (off_row[s] >= 2 and (proven_l or off_col[l] >= 2)) or (off_col[l] >= 2 and (proven_s or off_row[s] >= 2))
                if near and ex:
                    ws.append({'structure': s, 'layout': l, 'tier': 'B', 'score': round(max(v['outlier'] for v in ex), 1),
                               'why': f'Unused in this niche; the same watchlist has {len(ex)} outlier example(s) of it next door (best {max(v["outlier"] for v in ex)}x).',
                               'row_n': row_tot[s], 'row_med': row_med[s], 'col_n': col_tot[l], 'col_med': col_med[l], 'examples': ex})
    ws.sort(key=lambda w: (w['tier'], -w['score']))

    # four-part explainers: specimen = highest-outlier in-niche video of that structure / layout
    def spec(key, axis):
        vs = [v for v in inn if v[axis] == key]
        return slim(max(vs, key=lambda v: v['outlier'])) if vs else None
    explain = {'structures': [{'key': k, 'name': nm, 'what': w, 'n': row_tot[k], 'median': row_med[k], 'specimen': spec(k, 'structure'), 'pool': pool_f[k]} for k, nm, w in STRUCTURES],
               'layouts': [{'key': k, 'name': nm, 'category': cat, 'what': w, 'n': col_tot[k], 'median': col_med[k], 'specimen': spec(k, 'layout'), 'pool': pool_l[k],
                            'types': sorted(Counter(v['sc_layout_type'] for v in inn if v['layout'] == k).items(), key=lambda x: -x[1])} for k, nm, cat, w in LAYOUTS],
               'absent_structures': [{'key': k, 'name': nm, 'what': w} for k, nm, w in absent_f],
               'absent_layouts': [{'key': k, 'name': nm, 'category': cat, 'what': w} for k, nm, cat, w in absent_l]}

    out = {'meta': {'niche': a.niche, 'workspace': a.workspace, 'n_in': len(inn), 'n_channels': len(channels), 'min_outlier': a.min_outlier, 'proven': a.proven,
                    'n_off': len(offn), 'total_heat': round(total_heat, 1)},
           'structures': S, 'layouts': L, 'matrix': matrix, 'row_totals': dict(row_tot), 'col_totals': dict(col_tot),
           'row_medians': row_med, 'col_medians': col_med, 'channels': chan_rank, 'white_space': ws, 'explain': explain,
           'incompatible': sorted(INCOMPATIBLE), 'layout_categories': {l[0]: l[2] for l in LAYOUTS}}
    json.dump(out, open(a.out, 'w'), indent=1, ensure_ascii=False)
    print(f"matrix: {len(inn)} videos · {len(channels)} channels · {sum(1 for c in matrix.values() if c['count'])} filled cells of {len(S)*len(L)} · white space A={sum(1 for w in ws if w['tier']=='A')} B={sum(1 for w in ws if w['tier']=='B')}")
    for k in ranked[:6]:
        c = matrix[f'{k[0]}|{k[1]}']; print(f"  {k[0]:13s} × {k[1]:16s} n={c['count']:3d} median={c['median']}x share={c['share']}% tier={c['tier']}")
    print('  white space:', ', '.join(f"{w['structure']}×{w['layout']}({w['tier']})" for w in ws[:10]))


if __name__ == '__main__':
    main()
