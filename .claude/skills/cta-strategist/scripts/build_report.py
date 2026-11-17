#!/usr/bin/env python3
"""Render analysis.json into the interactive HTML report (house style).

Usage: python3 build_report.py analysis.json report.html --handle @name --platform "Instagram Reels"
           [--title "Name CTA Lab"] [--built "Sep 17, 2026"] [--no-inline-thumbs] [--md output.md] [--standalone]

The output has NO <html>/<head>/<body> wrapper — it is written for the Artifact tool, which adds
the page skeleton. If you deliver it as a plain file instead, pass --standalone to wrap it.

Thumbnails: the Artifact sandbox blocks images from any external host, so by default every video
thumbnail is downloaded, shrunk to 96px wide and embedded as a data: URI (~3 KB each, cached in
./thumbs/). Pass --no-inline-thumbs to keep the remote URLs (fine for a local file, broken in an
artifact). A thumbnail that fails to download keeps its URL — the report still renders.

--md writes the one-page markdown hand-off (baseline, recipe, ladder, lift table, nulls) that the
other skills in the growth system can read.
"""
import argparse, base64, io, json, os, sys, datetime
from concurrent.futures import ThreadPoolExecutor

ap = argparse.ArgumentParser()
ap.add_argument('analysis'); ap.add_argument('out')
ap.add_argument('--handle', default=''); ap.add_argument('--platform', default='')
ap.add_argument('--title', default=None); ap.add_argument('--built', default=None)
ap.add_argument('--no-inline-thumbs', action='store_true'); ap.add_argument('--thumb-width', type=int, default=96)
ap.add_argument('--md', default=None); ap.add_argument('--standalone', action='store_true')
a = ap.parse_args()
A = json.load(open(a.analysis))
S = A['summary']
handle = a.handle or S.get('handle') or 'this channel'
title = a.title or f"{handle.lstrip('@').replace('_', ' ').title()} CTA Lab"
built = a.built or datetime.date.today().strftime('%b %-d, %Y')

# ---- thumbnails → data URIs (best effort, cached) ----
def inline_thumbs(videos, width):
    try:
        import urllib.request
        from PIL import Image
    except Exception as e:
        print(f'  thumbnails left as URLs ({e})'); return 0
    cache = os.path.join(os.path.dirname(os.path.abspath(a.out)), 'thumbs'); os.makedirs(cache, exist_ok=True)
    def one(v):
        url = v.get('thumb') or ''
        if not url.startswith('http'): return 0
        path = os.path.join(cache, f"{v['uuid']}.jpg")
        try:
            if not os.path.exists(path):
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                raw = urllib.request.urlopen(req, timeout=20).read()
                im = Image.open(io.BytesIO(raw)).convert('RGB')
                h = max(1, round(im.height * width / im.width)); im = im.resize((width, h), Image.LANCZOS)
                im.save(path, 'JPEG', quality=72, optimize=True)
            v['thumb'] = 'data:image/jpeg;base64,' + base64.b64encode(open(path, 'rb').read()).decode('ascii')
            return 1
        except Exception:
            return 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        return sum(ex.map(one, videos))

n_inl = 0
if not a.no_inline_thumbs:
    n_inl = inline_thumbs(A['videos'], a.thumb_width)

# ---- html ----
tpl_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'report-template.html')
html = open(tpl_path, encoding='utf-8').read()
html = html.replace('__DATA__', json.dumps(A, ensure_ascii=False).replace('</', '<\\/'))
html = (html.replace('__TITLE__', title).replace('__HANDLE__', handle)
            .replace('__PLATFORM__', a.platform or S.get('platform') or '').replace('__BUILT__', built))
if a.standalone:
    head, body = html.split('</style>', 1)
    html = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            + head + '</style></head><body>' + body + '</body></html>')
open(a.out, 'w', encoding='utf-8').write(html)
print(f'wrote {a.out} ({len(html)//1024} KB) · title "{title}" · built {built} · {n_inl}/{len(A["videos"])} thumbnails inlined')

# ---- markdown hand-off ----
if a.md:
    F = A['features']; L = A['ladder']
    def f1(x): return f'{x:.1f}'
    lines = [f'# {title} — CTA Strategist output', '',
             f'- handle: {handle} · platform: {a.platform or S.get("platform","")} · built: {built}',
             f'- videos: {S["n_total"]} pulled · {S["n_main"]} with a keyword CTA and visible script · {S["n_nocta"]} no-CTA controls · {S["date_range"][0]} → {S["date_range"][1]}',
             f'- baseline: median {f1(S["base_med"])} leads per 1K views · pooled {f1(S["pooled"])} · ~{S["total_leads"]:,} leads on {S["total_views"]:,} views',
             f'- no-CTA control median: {S["nocta_med"]} per 1K' if S.get('nocta_med') is not None else '- no-CTA control: none on this channel',
             '', '## Recipe (levers this channel\'s data supports)', '']
    for k, lab in zip(S['recipe'], S['recipe_labels']):
        f = next((x for x in F if x['feature'] == k), None)
        if f: lines.append(f'- {lab}: {f["lift"]:.2f}× (median {f1(f["med_with"])} vs {f1(f["med_without"])}, n {f["n_with"]}/{f["n_without"]}, p {f["p"]})')
    lines += ['', 'Ladder: ' + ' · '.join(f'{l["score"]} of {len(S["recipe"])} → {f1(l["med"])} (n={l["n"]})' for l in L) + f' · trend p = {S["recipe_p"]}', '',
              '## Every feature', '', '| feature | lift | median with | median without | n with / without | p |', '|---|---|---|---|---|---|']
    for f in F:
        lines.append(f'| {f["with_label"]} | {f["lift"]:.2f}× | {f1(f["med_with"])} | {f1(f["med_without"])} | {f["n_with"]} / {f["n_without"]} | {f["p"]} |')
    nulls = [f for f in F if 0.85 < f['lift'] < 1.15 and f['p'] > 0.15]
    lines += ['', '## Null results (within ±15% of baseline, p > 0.15)', '', ', '.join(f['with_label'] for f in nulls) or 'none', '']
    lines += ['## Lowest-converting CTAs with 3,000+ views (rewrite candidates)', '']
    cand = sorted([v for v in A['videos'] if v['has_cta'] and v['script_visible'] and v['views'] >= 3000], key=lambda v: v['conv'])[:5]
    for v in cand:
        lines.append(f'- {v["date"]} · {f1(v["conv"])} per 1K · {v["views"]:,} views · {v["url"]}\n  > {v["final_line"]}')
    open(a.md, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'wrote {a.md}')
