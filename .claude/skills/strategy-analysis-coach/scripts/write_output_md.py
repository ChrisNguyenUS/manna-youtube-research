#!/usr/bin/env python3
"""
write_output_md.py — the markdown data file the next skill can read (spec: <slug>/output.md).
Usage: python3 write_output_md.py analysis.json narrative.json output.md
Plain facts, one per line, every video by date + link. No prose beyond the narrative's own sentences.
"""
import json, sys
from datetime import datetime

def ds(d): return datetime.strptime(d, "%Y-%m-%d").strftime("%b %-d")
def v(x): return f"[{ds(x['date'])} {x['out']:g}x]({x['url']})"

A = json.load(open(sys.argv[1])); N = json.load(open(sys.argv[2])); out = sys.argv[3]
ch = N["channel"]; L = []
L.append(f"# Strategy Analysis Coach — {ch['handle']} ({ch['platform']})")
L.append(f"window: {A['window']['first']} → {A['window']['last']} · posts: {A['window']['n_all']} · scored: {A['window']['n_scored']} · dropped in screening: {len(A['meta']['dropped'])}")
L.append(f"\n**Finding:** {N['one_sentence']}\n")
L.append("## Eras")
for e in A["eras"]:
    n = N["eras"].get(e["key"], {})
    L.append(f"- **{e['key']} · {n.get('name', e['label'])}** ({n.get('sub','')}) — {e['start']} → {e['end']} · {e['n']} posts · {e['per_week']}/wk · median {e['median_views']:,} views · median {e['median_out']}x · {e['hit_rate']}% ≥3x · {e['bangers']} ≥8x · {e['comments_per_1k']:.0f} comments/1K")
L.append("\n## Switch moments")
for s in A["switches"]:
    n = N["switches"].get(s["date"], {})
    L.append(f"- **{s['date']} · {n.get('title','')}** — before {v(s['before'])} → after {v(s['after'])}. {n.get('text','')}")
L.append("\n## The six questions")
for q in N["six"]: L.append(f"- **{q['q']}** {q['a']}")
L.append("\n## Topic buckets × era (posts · % ≥3x · median)")
hdr = "| bucket | " + " | ".join(e["key"] for e in A["eras"]) + " | all | best |"
L.append(hdr); L.append("|" + "---|" * (len(A["eras"]) + 3))
for b, row in A["buckets"].items():
    cells = " | ".join(f"{pe['n']} · {pe['hit_rate'] if pe['hit_rate'] is not None else '–'}% · {pe['median_out'] if pe['median_out'] is not None else '–'}x" for pe in row["per_era"].values())
    L.append(f"| {A['bucket_names'][b]} | {cells} | {row['n']} · {row['hit_rate']}% · {row['median_out']}x | {v(row['best'])} |")
L.append("\n## Content formulas (topic · structure · layout)")
for f in A["formulas"]:
    L.append(f"- {f['label']} — {f['n']} posts · median {f['median_out']}x · {f['hit_rate']}% ≥3x · best {v(f['best'])} · {f['status']} · eras {','.join(f['eras'])}")
L.append("\n## Hook styles × era (posts · % ≥3x · median)")
for k, row in A["hook_styles"].items():
    cells = " · ".join(f"{e}: {pe['n']}/{pe['hit_rate'] if pe['hit_rate'] is not None else '–'}%/{pe['median_out'] if pe['median_out'] is not None else '–'}x" for e, pe in row["per_era"].items())
    L.append(f"- {A['hook_style_names'].get(k,k)} — {row['n']} posts · {cells} · best {v(row['best'])}")
if A.get("panels"):
    L.append("\n## Title-card packaging (posts · % ≥3x · median)")
    for k, row in sorted(A["panels"].items(), key=lambda kv: -(kv[1]["hit_rate"] or 0)):
        L.append(f"- {k} — {row['n']} · {row['hit_rate']}% · {row['median_out']}x · best {v(row['best'])}")
L.append("\n## Remixes")
r = A["remix"]
L.append(f"- {r['n_remixes']} remixes of {r['n_originals']} originals · {r['beat_parent']} beat the parent · median {r['median_ratio']} of parent · hit rate remixes {r['hit_rate_remixes']}% vs originals {r['hit_rate_originals']}% · parent ≥8x returns {r['ratio_when_parent_banger']} (n={r['n_banger_parents']}) · parent 3–8x returns {r['ratio_when_parent_outlier']} (n={r['n_outlier_parents']})")
for p in r["pairs"]: L.append(f"  - {v(p['parent'])} → {v(p['child'])} = {p['ratio']}")
L.append("\n## Signature phrases (use → outlier)")
for k, posts in A["phrases"].items(): L.append(f"- {k}: " + ", ".join(f"{ds(p['date'])} {p['out']:g}x" for p in posts))
L.append("\n## CTA mechanics by era")
for e, c in A["cta"].items():
    L.append(f"- {e}: {c['with_keyword']}/{c['n']} with keyword · 'free' {c['free']} · 'if you want' {c['if_you_want']} · {c['comments_per_1k']:.1f} comments/1K · deliverables {dict(c['deliverables'])}")
L.append(f"\n## Duration\n- ≥3x median {A['duration']['hits']}s · others {A['duration']['non_hits']}s · by bucket {A['duration']['by_bucket']} · by era {A['duration']['by_era']}")
L.append("\n## Hidden layer")
for h in N["hidden"]: L.append(f"- **{h['h']}** — {h['b']} So what: {h['so']} Evidence: " + ", ".join(ds(d) for d in h.get("ev", [])))
L.append("\n## What to steal")
for s in N["steal"]: L.append(f"- **{s['move']}** — {s['why']} ({ds(s['ev'])}" + (f", {ds(s['ev2'])})" if s.get("ev2") else ")"))
L.append("\n## Do this next")
for n in N["next"]: L.append(f"- **{n['t']}** — {n['b']}")
L.append("\n## Posts ≥3x (date · outlier · views · bucket · structure · hook style · card · link)")
for h in A["hits"]: L.append(f"- {h['date']} · {h['out']:g}x · {h['views']:,} · {h['bucket']} · {h['structure']} · {h['hook_style']} · {h['panel']} · {h['url']}")
open(out, "w").write("\n".join(L) + "\n"); print(f"wrote {out} · {len(L)} lines")
