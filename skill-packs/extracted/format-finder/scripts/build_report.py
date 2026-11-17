#!/usr/bin/env python3
"""Render analysis.json (+ picks.json, screen.json, classified.json) into the house-style HTML report.

Usage: python3 build_report.py analysis.json report.html --picks picks.json --screen screen.json \
         --classified classified.json --workspace "Kallaway Marketing" --date "Sep 17, 2026" --credits 0 [--title "..."] [--standalone]

The output has NO html/head/body wrapper — it is written for the Artifact tool, which adds the page
skeleton. Pass --standalone to wrap it for a plain file (SendUserFile / local preview).
"""
import argparse, json, os
from collections import Counter

ap = argparse.ArgumentParser()
ap.add_argument('analysis'); ap.add_argument('out')
ap.add_argument('--picks', required=True); ap.add_argument('--screen', required=True); ap.add_argument('--classified', required=True)
ap.add_argument('--workspace', default=''); ap.add_argument('--date', default=''); ap.add_argument('--credits', default='0')
ap.add_argument('--title', default=None); ap.add_argument('--standalone', action='store_true')
ap.add_argument('--thumbs', default=None, help='thumbs.json from fetch_thumbs.py: uuid → data URI (required for a published artifact — external images are blocked there)')
a = ap.parse_args()
A = json.load(open(a.analysis)); P = json.load(open(a.picks)); SC = json.load(open(a.screen)); C = json.load(open(a.classified))
niche = A['meta'].get('niche') or SC.get('niche', 'your niche')
workspace = a.workspace or A['meta'].get('workspace') or SC.get('workspace', '')
title = a.title or f"{workspace} Format Finder".strip()

# model videos referenced by picks that the matrix's top-12-per-cell slices might not carry
need = {u for p in P.get('picks', []) for u in p.get('models', [])}
have = {v['uuid'] for c in A['matrix'].values() for v in c['videos']}
extra = []
for v in C:
    if v['uuid'] in need - have:
        extra.append({k: v.get(k) for k in ('uuid', 'handle', 'platform', 'outlier', 'views', 'url', 'sc_url', 'thumb', 'caption', 'spoken_hook', 'structure', 'layout', 'screen')})

# method cards from the screen counts
cnt = Counter(v['screen'] for v in C)
n_pulled = len(C); n_analyzed = sum(1 for v in C if v.get('analyzed'))
off_channels = sorted({v['handle'] for v in C if v['screen'] == 'off-niche'})
excl = SC.get('exclude_handles', [])
method = [
    {'label': 'Pulled, free', 'big': f"{n_pulled}", 'text': f"videos from the watchlist over {SC.get('lookback_days', 365)} days, sorted by outlier score down to a floor of {SC.get('pull_floor_outlier', SC.get('min_outlier', 3))}x. {n_analyzed} were already deep-analyzed, so their structure and layout labels cost nothing."},
    {'label': 'Screened out', 'items': [
        f"<b>{cnt.get('excluded', 0)}</b> from excluded handles ({', '.join('@'+h for h in excl)})",
        f"<b>{cnt.get('off-niche', 0)}</b> from {len(off_channels)} off-niche channels in the watchlist ({', '.join('@'+h for h in off_channels[:8])}{'…' if len(off_channels) > 8 else ''})",
        f"<b>{cnt.get('brand-deal', 0)}</b> brand-deal or boosted outliers (engagement under {int(SC['brand_deal']['max_engagement']*100)}% with views over {SC['brand_deal']['views_over_median']:g}x the channel's median)",
        f"<b>{cnt.get('unanalyzed', 0)}</b> never analyzed — not spent on, by instruction",
        f"<b>{cnt.get('below-band', 0)}</b> under the {SC.get('min_outlier', 3)}x band"]},
    {'label': 'The pool', 'big': f"{A['meta']['n_in']}", 'text': f"outlier videos (3x and up) from {A['meta']['n_channels']} in-niche channels. Sample rule: every already-analyzed outlier from every in-niche watchlist channel, capped by nothing. Credits spent: <b>{a.credits}</b>."},
    {'label': 'Taxonomy', 'items': [
        "Rows are Sandcastles <b>Formats</b> (<span class='mono'>format_type</span>, one row per label, named as on the Collections page); columns are Sandcastles <b>Editing Styles</b> (<span class='mono'>visual_layout_type</span>) bucketed under their categories — the map is references/taxonomy-map.md",
        f"White space needs both halves proven: <b>{A['meta'].get('proven', 8)}+</b> winners on the row and on the column",
        "Nothing is re-keyed from hooks or transcripts; the Sandcastles label decides",
        (f"In Sandcastles' taxonomy but absent from this pool: {', '.join(e['name'] for e in A['explain'].get('absent_structures', []) + A['explain'].get('absent_layouts', []))}" if A['explain'].get('absent_structures') or A['explain'].get('absent_layouts') else "Every Sandcastles label appears in this pool")]},
]
meta = {'niche': niche, 'workspace': workspace, 'date': a.date, 'credits': a.credits, 'lookback_days': SC.get('lookback_days', 365), 'method': method}
data = {'analysis': A, 'picks': P, 'meta': meta, 'extra_videos': extra}

# embed thumbnails once, keyed by uuid; the template resolves THUMBS[uuid] (artifact pages cannot load external images)
if a.thumbs:
    TH = json.load(open(a.thumbs)); used = set()
    def walk(o):
        if isinstance(o, dict):
            if o.get('thumb') and o.get('uuid'): used.add(o['uuid'])
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(data)
    data['thumbs'] = {u: TH[u] for u in used if u in TH}
    print(f"thumbnails embedded: {len(data['thumbs'])} of {len(used)} referenced")
else:
    print('WARNING: no --thumbs given; external thumbnail URLs will render blank on a published artifact')

tpl = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'report-template.html')
html = open(tpl, encoding='utf-8').read()
html = html.replace('__DATA__', json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
html = html.replace('__TITLE__', title).replace('__WORKSPACE__', workspace).replace('__NICHE__', niche).replace('__DATE__', a.date)
if a.standalone:
    head, body = html.split('</style>', 1)
    html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + head + '</style></head><body>' + body + '</body></html>'
open(a.out, 'w', encoding='utf-8').write(html)
print(f'wrote {a.out} ({len(html)//1024} KB) · title "{title}" · {len(extra)} extra model videos')
