#!/usr/bin/env python3
"""Tag every video in videos.json with its Sandcastles format (row) and editing-style bucket (column).

Usage: python3 classify.py videos.json classified.json [--map ../references/taxonomy-map.md]

The tables live in references/taxonomy-map.md inside a ```python block; this script executes that block so
the markdown stays the single source of truth. Row = analysis.format_type, verbatim. Column = the bucket for
analysis.visual_layout_type (type first, then category). Nothing is re-keyed from hooks or narrative text.
Unknown labels print as UNMAPPED and fall to `other` / the category bucket so a run never silently drops a video.
"""
import argparse, json, os, re, sys
from collections import Counter


def load_map(path):
    txt = open(path, encoding='utf-8').read()
    m = re.search(r"```python\n(.*?)```", txt, re.S)
    if not m:
        sys.exit(f'no ```python block in {path}')
    ns = {}
    exec(m.group(1), ns)
    return ns


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('inp'); ap.add_argument('out')
    ap.add_argument('--map', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'references', 'taxonomy-map.md'))
    a = ap.parse_args()
    M = load_map(a.map)
    fmt_keys = {f[0] for f in M['FORMATS']}
    vids = json.load(open(a.inp))
    unmapped_f, unmapped_l = Counter(), Counter()
    for v in vids:
        if not v.get('has_details'):
            v['structure'] = v['layout'] = None
            continue
        ft = (v.get('sc_format_type') or '').lower()
        if ft in fmt_keys:
            v['structure'], v['structure_reason'] = ft, f'format_type={ft}'
        else:
            v['structure'], v['structure_reason'] = 'other', f'UNMAPPED format_type={ft or "∅"} → other'
            unmapped_f[ft or '∅'] += 1
        cat = (v.get('sc_layout_category') or '').lower(); typ = (v.get('sc_layout_type') or '').lower()
        if typ in M['LAYOUT_BY_TYPE']:
            v['layout'], v['layout_reason'] = M['LAYOUT_BY_TYPE'][typ], f'{cat}/{typ}'
        elif cat in M['LAYOUT_BY_CATEGORY']:
            v['layout'], v['layout_reason'] = M['LAYOUT_BY_CATEGORY'][cat], f'UNMAPPED type {cat}/{typ} → category bucket'
            unmapped_l[f'{cat}/{typ}'] += 1
        else:
            v['layout'], v['layout_reason'] = 'office_room_yap', f'UNMAPPED {cat}/{typ} → office_room_yap'
            unmapped_l[f'{cat}/{typ}'] += 1
    json.dump(vids, open(a.out, 'w'), indent=1, ensure_ascii=False)
    inn = [v for v in vids if v.get('screen') == 'in' and v.get('structure')]
    cs, cl = Counter(v['structure'] for v in inn), Counter(v['layout'] for v in inn)
    FN = {f[0]: f[1] for f in M['FORMATS']}; LN = {l[0]: l[1] for l in M['LAYOUTS']}
    print(f"{len(inn)} in-niche videos classified → {a.out}")
    print('formats: ' + ', '.join(f'{FN.get(k, k)}={n}' for k, n in cs.most_common()))
    print('layouts: ' + ', '.join(f'{LN.get(k, k)}={n}' for k, n in cl.most_common()))
    if unmapped_f: print('UNMAPPED format_type (add to taxonomy-map.md):', dict(unmapped_f))
    if unmapped_l: print('UNMAPPED layout type (add to taxonomy-map.md):', dict(unmapped_l))


if __name__ == '__main__':
    main()
