#!/usr/bin/env python3
"""niche_panel.py — the second, lighter lens: what formulas the top watchlist channels win with, and which
of them the user has never run.

Usage (import mode — a Format Finder report exists):
  python3 niche_panel.py analysis.json niche.json --format-finder niche/format_finder_data.json \
      --niche-tags niche/niche_tags.json [--top 5]

Usage (compute mode — no Format Finder; free, analyzed videos only):
  python3 niche_panel.py analysis.json niche.json --niche-videos niche/classified_niche.json \
      --niche-tags niche/niche_tags.json [--top 5]
  where classified_niche.json is the output of prepare_input.py + classify.py run on raw/niche/ pages
  (search_my_videos, lookback 365, min_outlier_score 3, own handles excluded) — no overrides.json there.

niche_tags.json: {"<uuid>": {"bucket": "<one of the user's buckets, or Other>", "why": "..."}}
Outlier volume = number of ≥3x videos a channel has in the pool. The pool is outliers only, so its medians
are inflated relative to the user's channel-wide medians — the report says so and compares counts and bests.
"""
import argparse, json, os, re, statistics
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))


def load_taxonomy(path):
    txt = open(path, encoding="utf-8").read()
    m = re.search(r"```python\n(.*?)```", txt, re.S)
    ns = {}; exec(m.group(1), ns); return ns


def med(xs):
    return round(statistics.median(xs), 1) if xs else None


def vid_card(v):
    return {"uuid": v["uuid"], "handle": v.get("handle"), "outlier": float(v.get("outlier") or 0), "views": int(v.get("views") or 0),
            "url": v.get("url"), "sc_url": v.get("sc_url"), "thumb": v.get("thumb"), "hook": v.get("spoken_hook") or v.get("hook"),
            "topic": v.get("topic"), "caption": (v.get("caption") or v.get("caption_line") or "")[:160], "date": v.get("date") or v.get("published_at")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("analysis"); ap.add_argument("out")
    ap.add_argument("--format-finder", default=None); ap.add_argument("--niche-videos", default=None)
    ap.add_argument("--niche-tags", required=True); ap.add_argument("--top", type=int, default=5)
    ap.add_argument("--taxonomy", default=os.path.join(HERE, "..", "references", "taxonomy-map.md"))
    a = ap.parse_args()
    A = json.load(open(a.analysis)); names = A["names"]; T = load_taxonomy(a.taxonomy)
    tags = json.load(open(a.niche_tags))
    own = {(f["bucket"], f["structure"], f["layout"]): f for f in A["formulas"]}
    own_sl = defaultdict(int)
    for f in A["formulas"]: own_sl[(f["structure"], f["layout"])] += f["n"]
    own_structures = {f["structure"] for f in A["formulas"]}; own_layouts = {f["layout"] for f in A["formulas"]}

    pool, channels_meta, ff_cells, thumbs64, source = {}, {}, {}, {}, None
    if a.format_finder:
        FF = json.load(open(a.format_finder)); source = {"kind": "format-finder", "date": FF["meta"].get("date"), "niche": FF["meta"].get("niche"),
                                                        "pool": FF["analysis"]["meta"] if isinstance(FF["analysis"].get("meta"), dict) else None}
        ff_n = {c["handle"]: c["n"] for c in FF["analysis"]["channels"]}
        unmapped = defaultdict(int)
        for key, cell in FF["analysis"]["matrix"].items():
            _, l = key.split("|")
            for v in cell.get("videos", []):
                if v["uuid"] in pool: continue
                sk, reason = T["map_structure"]({"format_type": v.get("sc_format_type")})
                if sk is None: unmapped[v.get("sc_format_type")] += 1; continue
                pool[v["uuid"]] = dict(v, structure=sk, layout=l, structure_reason=reason)
        for h, n in ff_n.items():
            vs = [v for v in pool.values() if v.get("handle") == h]
            if not vs: continue
            xs = [float(v["outlier"]) for v in vs]; b = max(vs, key=lambda v: float(v["outlier"]))
            cells = defaultdict(list)
            for v in vs: cells[(v["structure"], v["layout"])].append(v)
            heroes = []
            for (s_, l_), cv in sorted(cells.items(), key=lambda kv: (-len(kv[1]), -max(float(x["outlier"]) for x in kv[1]))):
                hb = max(cv, key=lambda v: float(v["outlier"]))
                heroes.append({"structure": s_, "layout": l_, "count": len(cv), "median": med([float(x["outlier"]) for x in cv]), "share": round(100 * len(cv) / len(vs)), "best": vid_card(hb)})
            channels_meta[h] = {"handle": h, "n": n, "embedded": len(vs), "median": med(xs), "best": vid_card(b), "heroes": heroes}
        cells = defaultdict(list)
        for v in pool.values(): cells[(v["structure"], v["layout"])].append(v)
        for k, vs in cells.items():
            b = max(vs, key=lambda v: float(v["outlier"]))
            ff_cells[k] = {"count": len(vs), "median": med([float(v["outlier"]) for v in vs]), "best": float(b["outlier"]), "channels": sorted({v["handle"] for v in vs}), "specimen": vid_card(b)}
        thumbs64 = FF.get("thumbs", {}) or {}
        source["coverage"] = f"{len(pool)} of {sum(ff_n.values())} pool videos are embedded in the Format Finder page (its cells list up to 15 each); counts here are from those"
        if unmapped: print("UNMAPPED niche format_type:", dict(unmapped))
    elif a.niche_videos:
        N = json.load(open(a.niche_videos)); source = {"kind": "computed", "screen": N.get("screen")}
        by_ch = defaultdict(list)
        for v in N["videos"]:
            if v.get("structure") and v.get("layout"):
                pool[v["uuid"]] = dict(v, handle=v.get("channel"), spoken_hook=v["sc"].get("spoken_hook"), topic=v["sc"].get("topic"), caption=v.get("caption_line"))
                by_ch[v.get("channel")].append(v)
        for h, vs in by_ch.items():
            xs = [v["outlier"] for v in vs]; b = max(vs, key=lambda v: v["outlier"])
            channels_meta[h] = {"handle": h, "n": len(vs), "median": med(xs), "best": vid_card(dict(b, handle=h, spoken_hook=b["sc"].get("spoken_hook"), topic=b["sc"].get("topic"))), "heroes": []}
        for (s, l), vs in [((v["structure"], v["layout"]), None) for v in pool.values()]:
            pass
        cells = defaultdict(list)
        for v in pool.values(): cells[(v["structure"], v["layout"])].append(v)
        for k, vs in cells.items():
            b = max(vs, key=lambda v: v["outlier"])
            ff_cells[k] = {"count": len(vs), "median": med([v["outlier"] for v in vs]), "best": b["outlier"], "channels": [], "specimen": vid_card(b)}
    else:
        raise SystemExit("pass --format-finder or --niche-videos")

    top = sorted(channels_meta.values(), key=lambda c: -c["n"])[: a.top]
    top_handles = {c["handle"] for c in top}

    # formulas per top channel and across the panel
    panel = defaultdict(list); per_channel = defaultdict(lambda: defaultdict(list)); untagged = 0
    for v in pool.values():
        if v.get("handle") not in top_handles: continue
        t = tags.get(v["uuid"])
        if not t: untagged += 1; continue
        if t["bucket"] == "Other": continue
        key = (t["bucket"], v["structure"], v["layout"])
        panel[key].append(v); per_channel[v["handle"]][key].append(v)

    def agg(vs):
        xs = [float(v["outlier"]) for v in vs]; b = max(vs, key=lambda v: float(v["outlier"]))
        return {"n": len(vs), "median": med(xs), "best": vid_card(b), "channels": sorted({v["handle"] for v in vs})}

    for c in top:
        c["formulas"] = sorted([dict(agg(vs), bucket=k[0], structure=k[1], layout=k[2], label=f"{k[0]} · {names[k[1]][0]} · {names[k[2]][0]}",
                                     you_n=own.get(k, {}).get("n", 0), you_median=own.get(k, {}).get("median")) for k, vs in per_channel[c["handle"]].items()],
                               key=lambda f: (-f["n"], -f["best"]["outlier"]))
        c["tagged"] = sum(len(v) for v in per_channel[c["handle"]].values())

    niche_formulas = sorted([dict(agg(vs), bucket=k[0], structure=k[1], layout=k[2], label=f"{k[0]} · {names[k[1]][0]} · {names[k[2]][0]}",
                                  you_n=own.get(k, {}).get("n", 0), you_median=own.get(k, {}).get("median"), you_tag=own.get(k, {}).get("tag"),
                                  never_run=(k not in own)) for k, vs in panel.items()],
                            key=lambda f: (-f["n"], -f["best"]["outlier"]))

    # structure × layout white space for this user, from the whole niche pool
    sl_cells = []
    for (s, l), c in ff_cells.items():
        if c["count"] >= 3:
            sl_cells.append({"structure": s, "layout": l, "label": f"{names[s][0]} · {names[l][0]}", "count": c["count"], "median": c["median"], "best": c["best"],
                             "channels": c["channels"][:5], "specimen": c["specimen"], "you_n": own_sl.get((s, l), 0),
                             "new_structure": s not in own_structures, "new_layout": l not in own_layouts})
    sl_cells.sort(key=lambda c: (-c["count"], -(c["median"] or 0)))

    # candidates the user has never run, ranked by niche weight (count first, then best)
    never = [f for f in niche_formulas if f["never_run"] and f["n"] >= 2]
    sl_never = [c for c in sl_cells if c["you_n"] == 0 and c["count"] >= 5]
    used = {u for u in thumbs64} if thumbs64 else set()
    keep_thumbs = {}
    for f in niche_formulas[:12] + never[:8]:
        u = f["best"]["uuid"]
        if u in thumbs64: keep_thumbs[u] = thumbs64[u]
    for c in top:
        for h in c["heroes"][:2]:
            if h["best"] and h["best"]["uuid"] in thumbs64: keep_thumbs[h["best"]["uuid"]] = thumbs64[h["best"]["uuid"]]
        if c["best"] and c["best"]["uuid"] in thumbs64: keep_thumbs[c["best"]["uuid"]] = thumbs64[c["best"]["uuid"]]
    for c in sl_never[:8]:
        if c["specimen"] and c["specimen"]["uuid"] in thumbs64: keep_thumbs[c["specimen"]["uuid"]] = thumbs64[c["specimen"]["uuid"]]

    out = {"source": source, "top_channels": top, "niche_formulas": niche_formulas, "never_run": never, "sl_cells": sl_cells, "sl_never_run": sl_never,
           "untagged": untagged, "pool_size": len(pool), "panel_size": sum(len(v) for v in panel.values()), "thumbs": keep_thumbs,
           "note": "Niche pool is outliers only (3x and up), so its medians are inflated versus your channel-wide medians; compare counts and bests, not medians. Structures are re-derived from each video's Sandcastles format_type so they match this report's keys."}
    json.dump(out, open(a.out, "w"), indent=1)
    print(f"niche_panel: source={source['kind']} · top {len(top)} channels {[c['handle'] for c in top]} · {out['panel_size']} tagged outliers → {len(niche_formulas)} niche formulas · {len(never)} never run by you (n≥2) · {len(sl_never)} structure×layout cells never run (n≥5)")
    for f in niche_formulas[:10]:
        print(f"  n={f['n']:2d} best={f['best']['outlier']:>6}x you={f['you_n']:2d} {f['label']}")


if __name__ == "__main__":
    main()
