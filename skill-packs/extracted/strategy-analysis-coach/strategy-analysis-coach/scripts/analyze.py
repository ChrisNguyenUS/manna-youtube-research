#!/usr/bin/env python3
"""
analyze.py — bucket first, then time. Turns videos.json + eras.json into analysis.json:
every table the report and the narrative need, with the evidence video (uuid) beside each number.

Usage:
  python3 analyze.py videos.json eras.json analysis.json [--phrases phrases.json] [--min-age-days 3]

phrases.json (optional): {"label": "regex", ...} — signature phrases to track over time
(wear-out curves). If absent, the script auto-detects repeated opening lines.
Posts younger than --min-age-days are kept in counts but excluded from performance math.
"""
import argparse, json, re, statistics as st
from collections import Counter, defaultdict
from datetime import date, timedelta
from itertools import combinations

def med(xs): return round(st.median(xs), 2) if xs else None
def hitp(rs): return round(100 * sum(r["out"] >= 3 for r in rs) / len(rs)) if rs else None
def c1k(rs): return med([1000 * r["comments"] / r["views"] for r in rs if r["views"]]) if rs else None
def slim(r):
    return dict(uuid=r["uuid"], date=r["date"], views=r["views"], out=r["out"], comments=r["comments"], thumb=r["thumb"], url=r["url"],
                surl=r["surl"], hook=r.get("hook") or (r["caption"].split("\n")[0][:120]), bucket=r.get("bucket"), structure=r.get("structure"),
                hook_style=r.get("hook_style"), panel=r.get("panel"), kw=r.get("kw"), text_hook=r.get("text_hook"), duration=r.get("duration"))

STOP = set("the a an is are to of and your you for in on this that it its how here's here so with be if make get can into i my".split())
def toks(s): return set(w for w in re.findall(r"[a-z0-9']+", (s or "").lower()) if w not in STOP and len(w) > 2)
def jac(a, b): return len(a & b) / len(a | b) if a | b else 0

def group_table(V, key, eras):
    out = {}
    for k in sorted({r[key] for r in V if r.get(key)}):
        rs = [r for r in V if r.get(key) == k]
        row = dict(key=k, n=len(rs), median_out=med([r["out"] for r in rs]), hit_rate=hitp(rs), max_out=max(r["out"] for r in rs),
                   comments_per_1k=c1k(rs), best=slim(max(rs, key=lambda r: r["out"])), per_era={})
        for e in eras:
            es = [r for r in rs if r["era"] == e["key"]]
            row["per_era"][e["key"]] = dict(n=len(es), median_out=med([r["out"] for r in es]), hit_rate=hitp(es),
                                            max_out=max([r["out"] for r in es]) if es else None,
                                            best=slim(max(es, key=lambda r: r["out"])) if es else None)
        out[k] = row
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("videos"); ap.add_argument("eras"); ap.add_argument("out")
    ap.add_argument("--phrases"); ap.add_argument("--min-age-days", type=int, default=3)
    ap.add_argument("--text-hooks", help="optional {uuid: title-card text} read off the thumbnails")
    a = ap.parse_args()
    data = json.load(open(a.videos)); ALL = data["videos"]; meta = data["meta"]
    E = json.load(open(a.eras)); eras = E["eras"]
    th = json.load(open(a.text_hooks)) if a.text_hooks else {}
    last = max(r["date"] for r in ALL); cutoff = (date.fromisoformat(last) - timedelta(days=a.min_age_days)).isoformat()
    for r in ALL:
        r["text_hook"] = th.get(r["uuid"], "")
        r["era"] = next((e["key"] for e in eras if e["start"] <= r["date"] <= e["end"]), None)
        r["too_young"] = r["date"] > cutoff
    V = [r for r in ALL if not r["too_young"] and r["era"]]
    A = {"meta": meta, "eras": [], "window": {"first": ALL[0]["date"], "last": last, "n_all": len(ALL), "n_scored": len(V),
                                                "too_young": [slim(r) for r in ALL if r["too_young"]]}}

    # ---- era stats
    for e in eras:
        rs = [r for r in V if r["era"] == e["key"]]
        d0, d1 = date.fromisoformat(e["start"]), date.fromisoformat(e["end"]); days = (d1 - d0).days + 1
        A["eras"].append(dict(e, n=len(rs), days=days, per_week=round(7 * len(rs) / days, 1), median_views=int(med([r["views"] for r in rs]) or 0),
                              median_out=med([r["out"] for r in rs]), hit_rate=hitp(rs), hits=sum(r["out"] >= 3 for r in rs),
                              bangers=sum(r["out"] >= 8 for r in rs), median_eng=med([r["eng"] for r in rs]), median_comments=int(med([r["comments"] for r in rs]) or 0),
                              comments_per_1k=c1k(rs), total_views=sum(r["views"] for r in rs), total_comments=sum(r["comments"] for r in rs),
                              median_duration=med([r["duration"] for r in rs if r["duration"]]),
                              bucket_mix={b: len([r for r in rs if r["bucket"] == b]) for b in sorted({r["bucket"] for r in V if r["bucket"]})},
                              top=[slim(r) for r in sorted(rs, key=lambda r: -r["out"])[:6]],
                              bottom=[slim(r) for r in sorted(rs, key=lambda r: r["out"])[:3]]))

    # ---- switch moments: the last "typical" post before, and the first ≥3x inside the new era
    A["switches"] = []
    for i in range(1, len(eras)):
        prev = [r for r in V if r["era"] == eras[i-1]["key"]]; nxt = [r for r in V if r["era"] == eras[i]["key"]]
        before = sorted(prev[-7:], key=lambda r: abs(r["out"] - st.median([x["out"] for x in prev[-7:]])))[0] if prev else None
        after = next((r for r in nxt[:10] if r["out"] >= 3), nxt[0] if nxt else None)
        A["switches"].append(dict(date=eras[i]["start"], from_era=eras[i-1]["key"], to_era=eras[i]["key"],
                                  before=slim(before) if before else None, after=slim(after) if after else None,
                                  first_ten=[slim(r) for r in nxt[:10]]))

    # ---- bucket-first tables
    A["buckets"] = group_table(V, "bucket", eras)
    A["bucket_names"] = {r["bucket"]: r["bucket_name"] for r in V if r["bucket"]}
    A["structures"] = group_table(V, "structure", eras); A["structure_names"] = {r["structure"]: r["structure_name"] for r in V if r["structure"]}
    A["hook_styles"] = group_table(V, "hook_style", eras); A["hook_style_names"] = {r["hook_style"]: r["hook_style_name"] for r in V if r["hook_style"]}
    A["layouts"] = group_table(V, "layout", eras); A["layout_names"] = {r["layout"]: r["layout_name"] for r in V if r["layout"]}
    A["panels"] = group_table(V, "panel", eras) if any(r.get("panel") for r in V) else {}
    A["deliverables"] = group_table(V, "deliverable", eras)

    # bucket timelines: entry/exit, per-month counts and hits (ribbons)
    months = sorted({r["month"] for r in ALL})
    A["months"] = months
    A["ribbons"] = {b: {"n": [len([r for r in ALL if r["bucket"] == b and r["month"] == m]) for m in months],
                        "hits": [sum(1 for r in ALL if r["bucket"] == b and r["month"] == m and r["out"] >= 3) for m in months],
                        "first": min(r["date"] for r in ALL if r["bucket"] == b), "last": max(r["date"] for r in ALL if r["bucket"] == b)}
                    for b in A["bucket_names"]}
    # two-week bins for a smoother ribbon
    d0 = date.fromisoformat(ALL[0]["date"]); bins = []
    while d0 <= date.fromisoformat(last): bins.append(d0.isoformat()); d0 += timedelta(days=14)
    def bin_of(d):
        k = (date.fromisoformat(d) - date.fromisoformat(bins[0])).days // 14; return min(k, len(bins) - 1)
    A["bins"] = bins
    A["ribbons14"] = {b: [len([r for r in ALL if r["bucket"] == b and bin_of(r["date"]) == i]) for i in range(len(bins))] for b in A["bucket_names"]}
    A["hits14"] = [[slim(r) for r in ALL if bin_of(r["date"]) == i and r["out"] >= 3] for i in range(len(bins))]

    # ---- formulas (bucket · structure · layout)
    F = defaultdict(list)
    for r in V:
        if r["bucket"] and r["structure"] and r["layout"]: F[(r["bucket"], r["structure"], r["layout"])].append(r)
    formulas = []
    for k, rs in F.items():
        h = hitp(rs); m = med([r["out"] for r in rs])
        status = ("working" if h >= 30 and len(rs) >= 3 else "one-hit" if max(r["out"] for r in rs) >= 3 and len(rs) < 3 else
                  "dead" if len(rs) >= 4 and h == 0 and m < 1.0 else "flat" if len(rs) >= 3 else "tried once")
        formulas.append(dict(bucket=k[0], structure=k[1], layout=k[2], label=f"{A['bucket_names'][k[0]]} · {A['structure_names'][k[1]]} · {A['layout_names'][k[2]]}",
                             n=len(rs), median_out=m, hit_rate=h, max_out=max(r["out"] for r in rs), status=status,
                             eras=sorted({r["era"] for r in rs}), best=slim(max(rs, key=lambda r: r["out"])),
                             per_era={e["key"]: len([r for r in rs if r["era"] == e["key"]]) for e in eras},
                             per_era_hits={e["key"]: sum(1 for r in rs if r["era"] == e["key"] and r["out"] >= 3) for e in eras}))
    A["formulas"] = sorted(formulas, key=lambda f: (-f["n"], -(f["median_out"] or 0)))

    # ---- remix detection and decay
    pairs = []
    for i, j in combinations(range(len(V)), 2):
        x, y = V[i], V[j]
        h = jac(toks(x.get("hook")), toks(y.get("hook"))); s = jac(toks((x.get("seed") or "") + " " + (x.get("topic") or "")), toks((y.get("seed") or "") + " " + (y.get("topic") or "")))
        if h >= 0.45 or s >= 0.5 or (h >= 0.3 and s >= 0.3): pairs.append((i, j, h, s))
    children = defaultdict(list)
    for i, j, h, s in pairs: children[j].append(i)
    remixes = []
    for j, ps in children.items():
        p = max(ps, key=lambda i: V[i]["out"])
        remixes.append(dict(child=slim(V[j]), parent=slim(V[p]), ratio=round(V[j]["out"] / V[p]["out"], 2) if V[p]["out"] else None, days_apart=(date.fromisoformat(V[j]["date"]) - date.fromisoformat(V[p]["date"])).days))
    orig = [r for k, r in enumerate(V) if k not in children]; rem = [V[j] for j in children]
    ratios = [x["ratio"] for x in remixes if x["ratio"] is not None]
    big = [x for x in remixes if x["parent"]["out"] >= 8]; mid = [x for x in remixes if 3 <= x["parent"]["out"] < 8]
    A["remix"] = dict(n_remixes=len(rem), n_originals=len(orig), median_ratio=med(ratios), beat_parent=sum(1 for x in ratios if x > 1),
                      hit_rate_remixes=hitp(rem), hit_rate_originals=hitp(orig), median_out_remixes=med([r["out"] for r in rem]), median_out_originals=med([r["out"] for r in orig]),
                      ratio_when_parent_banger=med([x["ratio"] for x in big]), n_banger_parents=len(big), ratio_when_parent_outlier=med([x["ratio"] for x in mid]), n_outlier_parents=len(mid),
                      per_era={e["key"]: len([r for r in rem if r["era"] == e["key"]]) for e in eras},
                      pairs=sorted(remixes, key=lambda x: x["child"]["date"]))

    # ---- signature phrases (wear-out curves)
    if a.phrases: PH = json.load(open(a.phrases))
    else:
        first = Counter(re.sub(r"[^a-z ]", "", (r["caption"].split("\n")[0] or "").lower())[:40] for r in V)
        PH = {k: re.escape(k) for k, c in first.most_common() if c >= 2 and k}
    A["phrases"] = {}
    for label, rx in PH.items():
        rs = [r for r in V if re.search(rx, (r.get("hook") or "") + " " + r["caption"].split("\n")[0], re.I)]
        if len(rs) >= 2: A["phrases"][label] = [slim(r) for r in rs]

    # ---- CTA mechanics by era
    A["cta"] = {}
    for e in eras:
        rs = [r for r in V if r["era"] == e["key"]]
        A["cta"][e["key"]] = dict(n=len(rs), with_keyword=sum(bool(r["kw"]) for r in rs), free=sum(r["cta_free"] for r in rs), if_you_want=sum(r["cta_ifyou"] for r in rs),
                                  median_mentions=med([r["cta_mentions"] for r in rs]), deliverables=Counter(r["deliverable"] or "none" for r in rs),
                                  keywords_reused=[(k, c) for k, c in Counter(r["kw"] for r in rs if r["kw"]).most_common() if c >= 2],
                                  comments_per_1k=c1k(rs))
    A["keyword_reuse_all"] = [(k, c) for k, c in Counter(r["kw"] for r in V if r["kw"]).most_common() if c >= 3]

    # ---- duration
    A["duration"] = dict(hits=med([r["duration"] for r in V if r["out"] >= 3 and r["duration"]]), non_hits=med([r["duration"] for r in V if r["out"] < 3 and r["duration"]]),
                         by_bucket={b: med([r["duration"] for r in V if r["bucket"] == b and r["duration"]]) for b in A["bucket_names"]},
                         by_era={e["key"]: med([r["duration"] for r in V if r["era"] == e["key"] and r["duration"]]) for e in eras})

    # ---- belief flips and script anatomy of the hits (for the model to synthesize)
    hits = sorted([r for r in V if r["out"] >= 3], key=lambda r: -r["out"])
    A["hits"] = [dict(slim(r), belief=r.get("belief"), reality=r.get("reality"), angle=r.get("angle"), madlib=r.get("madlib"),
                      sections=[s[0] for s in r["sections"]], n_sections=len(r["sections"]), deliverable=r.get("deliverable"), era=r["era"]) for r in hits]
    flops = sorted([r for r in V if r["out"] < 0.7], key=lambda r: r["out"])
    A["flops"] = [dict(slim(r), belief=r.get("belief"), reality=r.get("reality"), angle=r.get("angle"), madlib=r.get("madlib"), era=r["era"], deliverable=r.get("deliverable")) for r in flops]
    A["per_video"] = [dict(slim(r), era=r["era"], eng=r["eng"], deliverable=r.get("deliverable"), madlib=r.get("madlib")) for r in ALL]

    json.dump(A, open(a.out, "w"), indent=1, default=str)
    # one-line sanity summary
    print(f"scored {len(V)} of {len(ALL)} posts across {len(eras)} eras · hit rates " + " → ".join(f"{e['hit_rate']}%" for e in A["eras"]) +
          f" · buckets {len(A['buckets'])} · formulas {len(A['formulas'])} · remixes {A['remix']['n_remixes']} (median {A['remix']['median_ratio']} of parent) · phrases tracked {len(A['phrases'])}")
    for b, row in A["buckets"].items():
        print(f"  {b:8} n={row['n']:3} hit {row['hit_rate']:3}% medOut {row['median_out']}  per era: " + "  ".join(f"{k}:{v['n']}/{v['hit_rate']}%" for k, v in row["per_era"].items()))

if __name__ == "__main__":
    main()
