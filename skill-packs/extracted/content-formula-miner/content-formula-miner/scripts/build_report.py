#!/usr/bin/env python3
"""build_report.py — fill the house-style template with the analysis, the niche panel and the picks.

Usage:
  python3 build_report.py analysis.json niche.json picks.json report.html \
      --thumbs thumbs/ --workspace "Kallaway Marketing" --handle @kallawaymarketing --channel-title Kallaway \
      --date "Sep 18, 2026" --credits 1 [--title "Kallaway Marketing Formula Miner"] [--standalone]

Thumbnails are embedded as data URIs (the Artifact sandbox blocks external images): own thumbs from --thumbs
(<uuid>.jpg, resized to 120px wide), niche thumbs from niche.json (already base64 when imported from the
Format Finder). Short uuid prefixes in picks.json are resolved against the analysis; an ambiguous or unknown
prefix stops the build.
"""
import argparse, base64, io, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def thumb64(path, width=120):
    try:
        from PIL import Image
        im = Image.open(path).convert("RGB")
        w, h = im.size
        im = im.resize((width, int(h * width / w)))
        buf = io.BytesIO(); im.save(buf, "JPEG", quality=68, optimize=True)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        return "data:image/jpeg;base64," + base64.b64encode(open(path, "rb").read()).decode()


def resolve(prefix, videos):
    if not prefix: return prefix
    if prefix in videos: return prefix
    hits = [u for u in videos if u.startswith(prefix)]
    if len(hits) == 1: return hits[0]
    if not hits: return prefix  # may be a niche uuid
    sys.exit(f"ambiguous uuid prefix {prefix}: {hits}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("analysis"); ap.add_argument("niche"); ap.add_argument("picks"); ap.add_argument("out")
    ap.add_argument("--template", default=os.path.join(HERE, "..", "assets", "report-template.html"))
    ap.add_argument("--thumbs", default="thumbs"); ap.add_argument("--workspace", default=""); ap.add_argument("--handle", default="")
    ap.add_argument("--channel-title", default=""); ap.add_argument("--date", default=""); ap.add_argument("--credits", default="0")
    ap.add_argument("--title", default=None); ap.add_argument("--standalone", action="store_true")
    a = ap.parse_args()

    A = json.load(open(a.analysis)); N = json.load(open(a.niche)); P = json.load(open(a.picks))
    V = A["videos"]
    for lst in (P.get("try_next", []), P.get("batch", [])):
        for t in lst:
            t["model_own"] = resolve(t.get("model_own"), V); t["model_niche"] = resolve(t.get("model_niche"), V)
            if t["model_own"] and t["model_own"] not in V: sys.exit(f"unknown own model uuid {t['model_own']} in picks.json")

    thumbs = {}
    missing = 0
    for u in V:
        p = os.path.join(a.thumbs, u + ".jpg")
        if os.path.exists(p): thumbs[u] = thumb64(p)
        else: missing += 1
    for u, b64 in (N.get("thumbs") or {}).items():
        thumbs[u] = b64 if b64.startswith("data:") else "data:image/jpeg;base64," + b64

    sc = A.get("screen") or {}
    ov = (A.get("overrides") or {}).get("layout_collapse")
    rules = A["rules"]
    method = [
        {"label": "Pulled, free", "big": str(sc.get("pulled", A["channel"]["n"])), "text": f"reels from {a.handle} over 730 days via search_my_videos, saved verbatim; every one already deep-analyzed except what the bill below covers."},
        {"label": "Screened out", "items": [f"<b>{sc.get('brand_deal', 0)}</b> brand-deal or boosted (engagement under 2% with views over 2× the channel median of {int(A.get('median_views') or 0):,})",
                                            f"<b>{sc.get('off_niche', 0)}</b> off-niche", f"<b>{sc.get('unanalyzed', 0)}</b> not analyzed"]},
        {"label": "Credits", "big": str(a.credits), "text": "spent on this run. Sample rule: every reel on the channel, no sampling."},
        {"label": "Tagging", "items": [f"<b>{len(A['buckets'])}</b> topic buckets, assigned by what each reel is about (a judgment call, logged per reel in tags.json)",
                                       "Format = Sandcastles <span class='mono'>format_type</span>, named as the app names it, one to one; layout = <span class='mono'>visual_layout_category/type</span> mapped to the shared layout keys; the map is in references/taxonomy-map.md"] + ([f"Channel look check: {ov['from'].__len__()} Sandcastles labels collapsed to <b>{A['names'][ov['to']][0]}</b> — {ov.get('evidence', '')}"] if ov else [])},
        {"label": "Tags", "items": [f"<b>working</b> {rules['working']}", f"<b>promising</b> {rules['promising']}", f"<b>flat</b> {rules['flat']}", f"<b>dead</b> {rules['dead']}", f"<b>early</b> {rules['early']}", f"<b>untried</b> {rules['untried']}; half-proven = a working structure never pointed at a topic you make, or a promising structure never paired with a proven topic"]},
        {"label": "Ranking", "items": [f"Rank = {rules['rank']}: a thin formula is pulled toward the channel's 1.0x until it earns its place", f"Heat = {rules['heat']}", "Leads per 1K = comments ÷ 2 per 1,000 views, on reels with a keyword CTA", "Top 10 = the channel's ten highest outlier scores"]},
    ]
    if P.get("caveats"):
        method.append({"label": "Read it right", "items": P["caveats"]})
    meta = {"workspace": a.workspace, "handle": a.handle, "channel_title": a.channel_title, "date": a.date, "credits": a.credits,
            "window": f"{A['channel']['first']} → {A['channel']['last']}", "method": method}
    data = {"analysis": A, "niche": N, "picks": P, "thumbs": thumbs, "meta": meta}
    # drop bulky duplicates the page doesn't read
    data["niche"] = {k: v for k, v in N.items() if k != "thumbs"}

    tpl = open(a.template, encoding="utf-8").read()
    title = a.title or f"{a.workspace} Formula Miner".strip()
    tpl = tpl.replace("<title>Formula Miner</title>", f"<title>{title}</title>", 1)
    js = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    html = tpl.replace("/*DATA*/null/*DATA*/", js, 1)
    if a.standalone:
        html = f"<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head><body style='margin:0'>{html}</body></html>"
    open(a.out, "w", encoding="utf-8").write(html)
    print(f"build_report: {a.out} · {len(html)/1e6:.2f} MB · {len(thumbs)} thumbnails embedded ({missing} own thumbs missing) · {len(A['formulas'])} formulas · title “{title}”")


if __name__ == "__main__":
    main()
