#!/usr/bin/env python3
"""Write the markdown data file the next skill reads: format-finder/output.md (and, when a
growth-system/ folder exists, growth-system/format-playbook.md — the file engine-builder and video-maker read).

Usage: python3 write_output.py analysis.json picks.json output.md [--workspace "..."] [--date "..."] [--credits 0] [--artifact URL]
"""
import argparse, json, os, shutil

ap = argparse.ArgumentParser()
ap.add_argument('analysis'); ap.add_argument('picks'); ap.add_argument('out')
ap.add_argument('--workspace', default=''); ap.add_argument('--date', default=''); ap.add_argument('--credits', default='0'); ap.add_argument('--artifact', default='')
a = ap.parse_args()
A = json.load(open(a.analysis)); P = json.load(open(a.picks))
SN = {s['key']: s for s in A['explain']['structures']}; LN = {l['key']: l for l in A['explain']['layouts']}
nm = lambda s, l: f"{SN[s]['name']} · {LN[l]['name']}"
vid = lambda v: f"[{v['handle']} {v['outlier']}x]({v['url']})" if v else '—'

o = []
o.append(f"# Format Finder — {a.workspace or A['meta'].get('workspace','')} — {a.date}\n")
o.append(f"Niche: {A['meta'].get('niche','')}. Pool: {A['meta']['n_in']} outlier videos ({A['meta']['min_outlier']}x+) from {A['meta']['n_channels']} in-niche watchlist channels. Credits spent: {a.credits}." + (f" Report: {a.artifact}" if a.artifact else '') + "\n")
o.append("## Finding\n\n" + P.get('lead', '').replace('<b>', '**').replace('</b>', '**') + "\n")

o.append("## Matrix (count / median outlier; structure rows × layout columns)\n")
L = A['layouts']; S = A['structures']
o.append('| structure | ' + ' | '.join(LN[l]['name'] for l in L) + ' |')
o.append('|---|' + '---|' * len(L))
WS = {(w['structure'], w['layout']): w for w in A['white_space']}
for s in S:
    row = [SN[s]['name']]
    for l in L:
        c = A['matrix'][f'{s}|{l}']
        if c['count']: row.append(f"{c['count']} / {c['median']}x")
        elif (s, l) in WS: row.append('OPEN' if WS[(s, l)]['tier'] == 'A' else 'next door')
        else: row.append('·')
    o.append('| ' + ' | '.join(row) + ' |')
o.append('')

o.append("## Hottest cells\n")
for c in sorted([c for c in A['matrix'].values() if c['count']], key=lambda c: -c['heat'])[:10]:
    o.append(f"- **{nm(c['structure'], c['layout'])}** — {c['count']} winners, median {c['median']}x, best {c['best']}x, {c['share']}% of outlier performance; {len(c['channels'])} channels; specimen {vid(c['specimen'])}")
o.append('')

o.append("## Try these first\n")
for i, p in enumerate(P.get('picks', []), 1):
    o.append(f"### {i}. {nm(p['structure'], p['layout'])} ({p['kind']})\n\n{p['why']}\n\nSkeleton: " + ' → '.join(p['skeleton']) + f"\n\nShoot it: {p['recipe']}\n")
if P.get('wildcard'):
    w = P['wildcard']; o.append(f"Wildcard: {nm(w['structure'], w['layout'])} — {w['note']}\n")

o.append("## Channels and hero formats\n")
for c in A['channels']:
    heroes = '; '.join(f"{nm(h['structure'], h['layout'])} ({h['count']}, {h['median']}x, {h['share']}%)" for h in c['heroes'])
    o.append(f"- **@{c['handle']}** ({'+'.join(c['platforms'])}) — {c['n']} winners, median {c['median']}x, best {vid(c['best'])} — heroes: {heroes}")
o.append('')

o.append("## White space\n")
for w in A['white_space']:
    ex = ', '.join(vid(v) for v in w['examples'][:3]) or 'no example yet'
    o.append(f"- [{w['tier']}] **{nm(w['structure'], w['layout'])}** — {w['why']} Examples: {ex}")
o.append('')

o.append("## Explainers (name · what it is · opens with · specimen)\n")
for axis in ('structures', 'layouts'):
    for e in A['explain'][axis]:
        v = e.get('specimen')
        opener = (f"“{v['spoken_hook']}”" if v and v.get('spoken_hook') else (v['caption'].split('\n')[0][:90] if v else '—'))
        o.append(f"- `{e['key']}` **{e['name']}** — {e['what']} — opens with: {opener} — {vid(v)}" + (' — ADDED THIS RUN' if e.get('added') else ''))
o.append('')
o.append("Hero-format rule: test 2–3 formats per batch of 7; after 2–3 batches the channel coach crowns the 1–2 hero formats and testing ends.\n")

os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
open(a.out, 'w', encoding='utf-8').write('\n'.join(o))
print(f'wrote {a.out}')
if os.path.isdir('growth-system'):
    shutil.copy(a.out, 'growth-system/format-playbook.md'); print('also wrote growth-system/format-playbook.md')
