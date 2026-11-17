#!/usr/bin/env python3
"""score.py — aggregate every content formula (topic bucket · structure · layout), rank it, tag it,
and build the three heat maps.

Usage:
  python3 score.py classified.json analysis.json [--k 2] [--top 10]

Tag rules (from the master spec):
  WORKING   median outlier ≥ 1.5x with n ≥ 3
  PROMISING n < 3 but best ≥ 3x
  DEAD      median < 0.8x with n ≥ 3
  FLAT      n ≥ 3, median between 0.8x and 1.5x (tried, baseline)
  EARLY     n < 3 and best < 3x (tried, nothing to say yet)
  UNTRIED   a proven topic × proven structure × proven layout that has never been made (n = 0)
"Proven" part = appears in at least one WORKING formula.

Rank = shrunk median: (n·median + k·1.0)/(n + k), k = 2. A thin formula is pulled toward the channel's
own 1.0x until it earns its rank; the raw median and n are always shown beside it.
Heat = Σ min(outlier, 50) per cell (a 300x banger can't paint a 2-video cell red).
"""
import argparse, json, statistics
from collections import defaultdict

CAP = 50.0


def med(xs):
    return round(statistics.median(xs), 2) if xs else None


def tag_for(n, median, best):
    if n >= 3 and median >= 1.5: return "working"
    if n >= 3 and median < 0.8: return "dead"
    if n >= 3: return "flat"
    if n >= 1 and best >= 3: return "promising"
    if n >= 1: return "early"
    return "untried"


def summarize(vs, k, top10_ids):
    xs = [v["outlier"] for v in vs]
    n = len(vs); m = med(xs); best = max(vs, key=lambda v: v["outlier"]) if vs else None
    cta = [v for v in vs if v.get("keyword_cta")]
    leads = [((v["comments"] / 2) / (v["views"] / 1000)) for v in cta if v["views"] > 0]
    crate = [v["comments"] / v["views"] * 100 for v in vs if v["views"] > 0]
    return {
        "n": n, "median": m, "mean": round(sum(xs) / n, 2) if n else None,
        "shrunk": round((n * (m or 0) + k * 1.0) / (n + k), 2) if n else None,
        "best": {"uuid": best["uuid"], "outlier": best["outlier"]} if best else None,
        "top10": sum(1 for v in vs if v["uuid"] in top10_ids),
        "views": sum(v["views"] for v in vs),
        "comment_rate": med(crate), "cta_n": len(cta), "leads_per_1k": med(leads),
        "heat": round(sum(min(x, CAP) for x in xs), 1),
        "first": min(v["published_at"] for v in vs) if vs else None, "last": max(v["published_at"] for v in vs) if vs else None,
        "videos": [v["uuid"] for v in sorted(vs, key=lambda v: -v["outlier"])],
        "tag": tag_for(n, m or 0, best["outlier"] if best else 0),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("classified"); ap.add_argument("out")
    ap.add_argument("--k", type=float, default=2.0); ap.add_argument("--top", type=int, default=10)
    a = ap.parse_args()
    C = json.load(open(a.classified)); V = [v for v in C["videos"] if v.get("bucket") and v.get("structure") and v.get("layout")]
    buckets = [b["name"] for b in C["buckets"]]
    names = C["names"]
    top10 = [v["uuid"] for v in sorted(V, key=lambda v: -v["outlier"])[: a.top]]
    top10_ids = set(top10)

    by_formula = defaultdict(list)
    for v in V:
        by_formula[(v["bucket"], v["structure"], v["layout"])].append(v)
    formulas = []
    for (b, s, l), vs in by_formula.items():
        f = summarize(vs, a.k, top10_ids)
        f.update({"bucket": b, "structure": s, "layout": l, "label": f"{b} · {names[s][0]} · {names[l][0]}"})
        formulas.append(f)

    # proven parts
    working = [f for f in formulas if f["tag"] == "working"]
    proven = {"topics": sorted({f["bucket"] for f in working}, key=buckets.index),
              "structures": sorted({f["structure"] for f in working}, key=C["structures"].index),
              "layouts": sorted({f["layout"] for f in working}, key=C["layouts"].index)}
    proven_rule = "appears in at least one WORKING formula"
    if not working:
        proven_rule = "no WORKING formula yet — fell back to parts with n ≥ 5 and median ≥ 1.2x"
    # axis stats
    axes = {}
    for axis, key, order in (("topics", "bucket", buckets), ("structures", "structure", C["structures"]), ("layouts", "layout", C["layouts"])):
        rows = []
        for k in order:
            vs = [v for v in V if v[key] == k]
            if vs:
                r = summarize(vs, a.k, top10_ids); r["key"] = k; r["name"] = names.get(k, (k,))[0] if key != "bucket" else k; rows.append(r)
                if not working and r["n"] >= 5 and r["median"] >= 1.2:
                    proven[axis].append(k)
        axes[axis] = rows
    for f in formulas:
        f["parts_proven"] = {"topic": f["bucket"] in proven["topics"], "structure": f["structure"] in proven["structures"], "layout": f["layout"] in proven["layouts"]}

    # untried, tier A: proven × proven × proven, never made (the master-spec rule)
    untried, seen_u = [], set()
    def add_untried(b, s, l, tier, why):
        if (b, s, l) in by_formula or (b, s, l) in seen_u: return
        seen_u.add((b, s, l))
        untried.append({"bucket": b, "structure": s, "layout": l, "label": f"{b} · {names[s][0]} · {names[l][0]}", "tag": "untried", "tier": tier, "n": 0, "why": why})
    for b in proven["topics"]:
        for s in proven["structures"]:
            for l in proven["layouts"]:
                add_untried(b, s, l, "A", "all three parts proven on this channel, never combined")
    # tier B (half-proven): a proven structure never pointed at a topic you already make (n ≥ 3 overall),
    # and a promising structure (best ≥ 3x somewhere) never paired with a proven topic. Same layout must be proven.
    tried_topics = [r["key"] for r in axes["topics"] if r["n"] >= 3]
    promising_structures = sorted({f["structure"] for f in formulas if f["tag"] == "promising"}, key=C["structures"].index)
    for l in proven["layouts"]:
        for s in proven["structures"]:
            fs = [f for f in formulas if f["structure"] == s and f["layout"] == l]
            wins = sum(1 for f in fs if f["tag"] == "working")
            for b in tried_topics:
                add_untried(b, s, l, "B", f"{names[s][0]} is working in {wins} of the {len(fs)} topics you've pointed it at, and has never been pointed at {b}")
        for s in promising_structures:
            for b in proven["topics"]:
                add_untried(b, s, l, "B", f"{names[s][0]} hit {max(f['best']['outlier'] for f in formulas if f['structure']==s)}x for you once and has never been paired with {b}")

    # heat maps
    def heat(rowkey, colkey, rows, cols, ukeys):
        cells = {}
        for r in rows:
            for c in cols:
                vs = [v for v in V if v[rowkey] == r and v[colkey] == c]
                cell = summarize(vs, a.k, top10_ids) if vs else {"n": 0, "median": None, "best": None, "heat": 0, "videos": [], "top10": 0, "shrunk": None}
                if not vs:
                    tiers = [u["tier"] for u in untried if (u[ukeys[0]], u[ukeys[1]]) == (r, c)]
                    cell["tag"] = "untried" if tiers else "empty"
                    if tiers: cell["tier"] = "A" if "A" in tiers else "B"
                cells[f"{r}|{c}"] = cell
        return cells
    heatmaps = {
        "topic_structure": {"rows": buckets, "cols": C["structures"], "cells": heat("bucket", "structure", buckets, C["structures"], ("bucket", "structure"))},
        "topic_layout": {"rows": buckets, "cols": C["layouts"], "cells": heat("bucket", "layout", buckets, C["layouts"], ("bucket", "layout"))},
        "structure_layout": {"rows": C["structures"], "cols": C["layouts"], "cells": heat("structure", "layout", C["structures"], C["layouts"], ("structure", "layout"))},
    }

    # substrate panel (Sandcastles fine layout labels inside a collapsed layout)
    sub = defaultdict(list)
    for v in V:
        sub[(v["layout"], v.get("substrate") or v["sc"].get("visual_layout_type"))].append(v)
    substrate = []
    for (l, s), vs in sub.items():
        r = summarize(vs, a.k, top10_ids); r.update({"layout": l, "substrate": s, "sc_label": vs[0]["sc"].get("visual_layout_type")}); substrate.append(r)
    substrate.sort(key=lambda r: -(r["median"] or 0))

    order = {"working": 0, "promising": 1, "flat": 2, "early": 3, "dead": 4}
    formulas.sort(key=lambda f: (-(f["shrunk"] or 0), -f["n"]))
    channel = {"n": len(V), "median_outlier": med([v["outlier"] for v in V]), "top10": top10,
               "first": min(v["published_at"] for v in V), "last": max(v["published_at"] for v in V),
               "views": sum(v["views"] for v in V), "bangers": sum(1 for v in V if v["outlier"] >= 8), "outliers": sum(1 for v in V if 3 <= v["outlier"] < 8),
               "gems": sum(1 for v in V if 1 <= v["outlier"] < 3), "baseline": sum(1 for v in V if 0.5 <= v["outlier"] < 1), "flops": sum(1 for v in V if v["outlier"] < 0.5)}
    out = {"channel": channel, "screen": C.get("screen"), "buckets": C["buckets"], "names": names, "added": C.get("added", {}),
           "structures": C["structures"], "layouts": C["layouts"], "overrides": C.get("overrides", {}),
           "rules": {"working": "median ≥ 1.5x, n ≥ 3", "promising": "n < 3, best ≥ 3x", "dead": "median < 0.8x, n ≥ 3", "flat": "n ≥ 3, 0.8–1.5x", "early": "n < 3, best < 3x",
                     "untried": "proven topic × proven structure × proven layout, never made", "proven": proven_rule, "rank": f"shrunk median, k={a.k}", "heat": "Σ min(outlier, 50)"},
           "formulas": formulas, "untried": untried, "proven": proven, "axes": axes, "heatmaps": heatmaps, "substrate": substrate,
           "videos": {v["uuid"]: v for v in V}}
    json.dump(out, open(a.out, "w"), indent=1)
    tags = defaultdict(int)
    for f in formulas: tags[f["tag"]] += 1
    print(f"score: {len(V)} videos → {len(formulas)} formulas tried ({dict(tags)}) · {len(untried)} untried · proven topics {proven['topics']} · structures {proven['structures']} · layouts {proven['layouts']}")
    for f in formulas[:8]:
        print(f"  {f['tag']:9s} {f['label']:70s} n={f['n']:2d} med={f['median']}x best={f['best']['outlier']}x top10={f['top10']} rank={f['shrunk']}")


if __name__ == "__main__":
    main()
