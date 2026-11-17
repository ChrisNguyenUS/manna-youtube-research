#!/usr/bin/env python3
"""write_output.py — the markdown data file the next skill reads (content-formula-miner/output.md).

Usage:
  python3 write_output.py analysis.json niche.json picks.json content-formula-miner/output.md \
      --workspace "Kallaway Marketing" --handle @kallawaymarketing --date "Sep 18, 2026" --credits 1 --artifact "<url>"
"""
import argparse, json, os


def x(v):
    return "—" if v is None else f"{round(v, 1)}x"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("analysis"); ap.add_argument("niche"); ap.add_argument("picks"); ap.add_argument("out")
    ap.add_argument("--workspace", default=""); ap.add_argument("--handle", default=""); ap.add_argument("--date", default="")
    ap.add_argument("--credits", default="0"); ap.add_argument("--artifact", default="")
    a = ap.parse_args()
    A = json.load(open(a.analysis)); N = json.load(open(a.niche)); P = json.load(open(a.picks))
    V = A["videos"]; names = A["names"]; ch = A["channel"]
    L = []
    L.append(f"# Content Formula Miner — {a.handle}\n")
    L.append(f"workspace: {a.workspace} · built: {a.date} · reels: {ch['n']} ({ch['first']} → {ch['last']}) · credits spent: {a.credits} · report: {a.artifact}\n")
    L.append(f"lead: {P['lead']}\n")
    L.append("## Proven parts\n")
    L.append(f"- topics: {', '.join(A['proven']['topics']) or '—'}")
    L.append(f"- structures: {', '.join(names[s][0] + ' (' + s + ')' for s in A['proven']['structures']) or '—'}")
    L.append(f"- layouts: {', '.join(names[l][0] + ' (' + l + ')' for l in A['proven']['layouts']) or '—'}")
    L.append(f"- rule: {A['rules']['proven']}\n")
    L.append("## Scorecard (ranked by shrunk median, k=2)\n")
    L.append("| # | tag | topic | structure | layout | n | median | best | best reel | top-10 | leads/1K |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|")
    for i, f in enumerate(A["formulas"], 1):
        b = V[f["best"]["uuid"]]
        L.append(f"| {i} | {f['tag']} | {f['bucket']} | {names[f['structure']][0]} | {names[f['layout']][0]} | {f['n']} | {x(f['median'])} | {x(f['best']['outlier'])} | [{b['published_at']}]({b['url']}) | {f['top10']} | {f['leads_per_1k'] if f['leads_per_1k'] is None else round(f['leads_per_1k'], 1)} |")
    L.append("")
    L.append("## Untried (never made)\n")
    for u in A["untried"]:
        L.append(f"- [{u['tier']}] {u['label']} — {u['why']}")
    if not A["untried"]: L.append("- none by the strict rule")
    L.append("")
    L.append("## Axes\n")
    for axis, rows in A["axes"].items():
        L.append(f"### {axis}")
        for r in rows:
            L.append(f"- {r['name']}: n={r['n']}, median {x(r['median'])}, best {x(r['best']['outlier'])}, top-10 {r['top10']}, tag {r['tag']}")
        L.append("")
    if A.get("substrate"):
        L.append("## Top-half substrate (Sandcastles fine labels inside a collapsed layout)\n")
        for s in A["substrate"]:
            L.append(f"- {s['substrate']} ({s['sc_label']}): n={s['n']}, median {x(s['median'])}, best {x(s['best']['outlier'])}")
        L.append("")
    L.append("## Do this next\n")
    for c in P["do_next"]:
        L.append(f"- **{c['title']}** — {c['text']}")
    L.append("\n## Try next\n")
    for t in P["try_next"]:
        L.append(f"- {t['label']} — {t['source']}: {t['why']}")
    L.append("\n## Next batch of 7\n")
    for s in P["batch"]:
        L.append(f"{s['slot']}. {s['label']} — {s['role']}{' · bet' if s.get('bet') else ''}")
    L.append(f"\n{P.get('batch_note', '')}\n")
    L.append("## Niche panel\n")
    src = N.get("source") or {}
    L.append(f"source: {src.get('kind')} {src.get('date', '')} · top channels: {', '.join('@' + c['handle'] + ' (' + str(c['n']) + ')' for c in N['top_channels'])}")
    for f in N["never_run"][:8]:
        L.append(f"- never run by you: {f['label']} — {f['n']} niche winners, best {x(f['best']['outlier'])} @{f['best']['handle']} ({f['best']['url']})")
    L.append("")
    L.append("## Per-video tags\n")
    L.append("| date | outlier | topic | structure | layout | substrate | reel |")
    L.append("|---|---|---|---|---|---|---|")
    for v in sorted(V.values(), key=lambda v: v["published_at"]):
        L.append(f"| {v['published_at']} | {x(v['outlier'])} | {v['bucket']} | {v['structure']} | {v['layout']} | {v.get('substrate') or ''} | [{v['uuid'][:8]}]({v['url']}) |")
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    open(a.out, "w", encoding="utf-8").write("\n".join(L) + "\n")
    print(f"write_output: {a.out} ({len(L)} lines)")


if __name__ == "__main__":
    main()
