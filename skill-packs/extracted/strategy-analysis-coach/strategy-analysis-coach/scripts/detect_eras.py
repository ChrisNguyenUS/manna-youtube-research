#!/usr/bin/env python3
"""
detect_eras.py — find the eras in a channel's history from FREE data only (views, outlier
score, dates, captions). Run this BEFORE spending any credit, show the user the table, and
let them confirm or move the boundaries.

Usage:
  python3 detect_eras.py videos.json [--out eras.json] [--min-seg 15] [--max-eras 4]

What it does
  1. Monthly table: posts, cadence, median views, median outlier, hit rate (>=3x), bangers (>=8x),
     median comments, caption length, share of captions that are full scripts.
  2. Rolling 12-post hit rate and median outlier (the "handwriting" line).
  3. Changepoints: least-squares segmentation of log(outlier score) into 2 and 3 segments
     (min segment length --min-seg). The 3-segment split is the default era proposal when it
     beats the 2-segment split by a meaningful margin; otherwise 2 eras are proposed.
  4. Gaps: any silence of 21+ days is reported as a hard boundary candidate.
  5. Numbered-series and repeated-hook detection from captions (things that were tried).

Writes eras.json: {"eras":[{"key":"E1","start":..., "end":..., "label": "..."}...], "switches":[...]}
The model names the eras after reading the table; the file ships with placeholder labels.
"""
import argparse, json, math, re, statistics as st
from collections import Counter, defaultdict
from datetime import date

def med(xs): return st.median(xs) if xs else float("nan")

def sse(seg):
    if not seg: return 0.0
    m = sum(seg) / len(seg); return sum((x - m) ** 2 for x in seg)

def best_split(lo, k, min_seg):
    n = len(lo)
    if k == 1: return (sse(lo), [])
    if k == 2:
        best = None
        for a in range(min_seg, n - min_seg + 1):
            c = sse(lo[:a]) + sse(lo[a:])
            if best is None or c < best[0]: best = (c, [a])
        return best
    best = None
    for a in range(min_seg, n - 2 * min_seg + 1):
        for b in range(a + min_seg, n - min_seg + 1):
            c = sse(lo[:a]) + sse(lo[a:b]) + sse(lo[b:])
            if best is None or c < best[0]: best = (c, [a, b])
    return best

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("videos"); ap.add_argument("--out", default="eras.json")
    ap.add_argument("--min-seg", type=int, default=15); ap.add_argument("--max-eras", type=int, default=3)
    a = ap.parse_args()
    V = json.load(open(a.videos))["videos"]
    V = [v for v in V if v["out"] is not None]
    n = len(V)
    if n < 2 * a.min_seg:
        print(f"only {n} posts — too few for era detection (need {2*a.min_seg}+). Treat as one era.");
        json.dump({"eras": [{"key": "E1", "start": V[0]["date"], "end": V[-1]["date"], "label": "One era"}], "switches": []}, open(a.out, "w"), indent=1)
        return

    # 1. monthly table
    bym = defaultdict(list)
    for v in V: bym[v["month"]].append(v)
    print("MONTHLY (free data)")
    print(f"{'month':8}{'n':>4}{'/wk':>5}{'medViews':>9}{'medOut':>7}{'hit%':>6}{'≥8x':>4}{'medCom':>7}{'capLines':>9}{'script%':>8}")
    for m in sorted(bym):
        R = bym[m]; d0 = date.fromisoformat(R[0]["date"]); d1 = date.fromisoformat(R[-1]["date"]); days = max(1, (d1 - d0).days + 1)
        lines = [len([l for l in r["caption"].split("\n") if l.strip()]) for r in R]
        print(f"{m:8}{len(R):4}{7*len(R)/days:5.1f}{int(med([r['views'] for r in R])):9,}{med([r['out'] for r in R]):7.2f}"
              f"{100*sum(r['out']>=3 for r in R)/len(R):5.0f}%{sum(r['out']>=8 for r in R):4}{int(med([r['comments'] for r in R])):7}"
              f"{med(lines):9.0f}{100*sum(l>=8 for l in lines)/len(R):7.0f}%")

    # 2. rolling
    print("\nROLLING 12-post hit rate / median outlier")
    hits = [1 if v["out"] >= 3 else 0 for v in V]
    for i in range(0, n - 11, max(1, n // 20)):
        print(f"  {V[i]['date']} → {V[i+11]['date']}  {100*sum(hits[i:i+12])/12:4.0f}%   {med([v['out'] for v in V[i:i+12]]):.2f}")

    # 3. changepoints on log(outlier)
    lo = [math.log(max(v["out"], 0.05)) for v in V]
    c1, _ = best_split(lo, 1, a.min_seg)
    c2, s2 = best_split(lo, 2, a.min_seg)
    c3, s3 = best_split(lo, 3, a.min_seg) if a.max_eras >= 3 and n >= 3 * a.min_seg else (None, None)
    gain2 = 1 - c2 / c1; gain3 = (1 - c3 / c2) if c3 else 0
    print(f"\nCHANGEPOINTS  2-seg gain {gain2:.1%} at {V[s2[0]]['date']}", end="")
    if s3: print(f" · 3-seg extra gain {gain3:.1%} at {V[s3[0]]['date']} / {V[s3[1]]['date']}")
    else: print()
    cuts = s3 if (s3 and gain3 >= 0.04) else s2
    if gain2 < 0.03 and gain3 < 0.03:
        print("  No boundary explains the variance: the whole window looks like ONE era. Say so — don't invent a switch.")
        cuts = []
    # 4. gaps
    gaps = []
    for i in range(1, n):
        g = (date.fromisoformat(V[i]["date"]) - date.fromisoformat(V[i-1]["date"])).days
        if g >= 21: gaps.append((V[i-1]["date"], V[i]["date"], g))
    if gaps: print("  Silences ≥21 days (hard boundaries):", gaps)

    eras = []; bounds = [0] + cuts + [n]
    for k in range(len(bounds) - 1):
        seg = V[bounds[k]:bounds[k+1]]
        eras.append(dict(key=f"E{k+1}", start=seg[0]["date"], end=seg[-1]["date"], n=len(seg),
                         hit_rate=round(100 * sum(v["out"] >= 3 for v in seg) / len(seg)),
                         median_out=round(med([v["out"] for v in seg]), 2), median_views=int(med([v["views"] for v in seg])),
                         bangers=sum(v["out"] >= 8 for v in seg), label=f"Era {k+1} (name me)"))
    print("\nPROPOSED ERAS")
    for e in eras: print(f"  {e['key']} {e['start']} → {e['end']}  n={e['n']}  hit {e['hit_rate']}%  medOut {e['median_out']}  medViews {e['median_views']:,}  bangers {e['bangers']}")
    switches = [dict(date=V[c]["date"], before=V[c-1]["uuid"], after=V[c]["uuid"]) for c in cuts]

    # 5. things that were tried: numbered series, repeated first lines
    series = [v for v in V if re.search(r"\bep(isode)?\.? ?0?\d|episode \d", v["caption"], re.I)]
    if series:
        print(f"\nNUMBERED SERIES: {len(series)} posts, median {med([v['out'] for v in series]):.2f}x, {sum(v['out']>=3 for v in series)} hits — "
              f"{series[0]['date']} → {series[-1]['date']}")
    first = Counter(re.sub(r"[^a-z ]", "", (v["caption"].split("\n")[0] or "").lower())[:40] for v in V)
    rep = [(k, c) for k, c in first.most_common() if c >= 2 and k]
    if rep: print("REPEATED OPENING LINES:", rep[:8])

    json.dump({"eras": eras, "switches": switches, "gaps": gaps, "changepoint_gain": {"two": gain2, "three": gain3}}, open(a.out, "w"), indent=1)
    print(f"\nwrote {a.out} — rename the eras, move a boundary if the captions say so, then run analyze.py")

if __name__ == "__main__":
    main()
