#!/usr/bin/env python3
"""prepare_input.py — merge the free list pages and the detail payloads into one videos.json,
and run the screen every workflow runs (brand deals / boosts out, off-niche out).

Usage:
  python3 prepare_input.py --raw-dir raw --screen screen.json --out videos.json

raw/page*.json        pages from search_my_videos, saved verbatim
raw/details_<uuid>.json  get_video_details payloads, saved verbatim
screen.json (optional): {"off_niche": ["<uuid>", ...], "notes": {"<uuid>": "why"},
                         "brand_deal": {"max_engagement": 0.02, "views_over_median": 2.0}}

Prints one line of screening counts. Never edits raw/.
"""
import argparse, glob, json, os, re, statistics, sys


def load_json_loose(path):
    """Harness files sometimes wrap the JSON in a line of text; find the first { and parse."""
    txt = open(path, encoding="utf-8").read()
    i = txt.find("{")
    return json.loads(txt[i:])


def first_line(s):
    s = (s or "").strip()
    return s.split("\n")[0][:140]


KW_RE = re.compile(r"comment\s+[\"“”']?([A-Za-z0-9 \-]{2,30})[\"“”']?", re.I)


def keyword_cta(caption, transcript):
    for txt in (caption or "", transcript or ""):
        m = KW_RE.search(txt)
        if m:
            return m.group(1).strip().lower()
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", default="raw")
    ap.add_argument("--screen", default=None)
    ap.add_argument("--out", default="videos.json")
    a = ap.parse_args()

    screen = {"off_niche": [], "notes": {}, "brand_deal": {"max_engagement": 0.02, "views_over_median": 2.0}}
    if a.screen and os.path.exists(a.screen):
        screen.update(json.load(open(a.screen)))
    bd = screen.get("brand_deal", {})
    max_eng = float(bd.get("max_engagement", 0.02))
    over = float(bd.get("views_over_median", 2.0))

    meta = {}
    pages = sorted(glob.glob(os.path.join(a.raw_dir, "page*.json")))
    if not pages:
        sys.exit("no raw/page*.json found")
    for p in pages:
        for v in load_json_loose(p).get("videos", []):
            meta[v["uuid"]] = v
    details = {}
    for p in glob.glob(os.path.join(a.raw_dir, "details_*.json")):
        try:
            d = load_json_loose(p)["video"]
            details[d["uuid"]] = d
        except Exception as e:
            print(f"warn: could not parse {p}: {e}", file=sys.stderr)

    views_all = [int(v.get("view_count") or 0) for v in meta.values()]
    med_views = statistics.median(views_all) if views_all else 0

    out, counts = [], {"pulled": len(meta), "brand_deal": 0, "off_niche": 0, "unanalyzed": 0, "in": 0}
    for uuid, m in meta.items():
        views = int(m.get("view_count") or 0)
        eng = float(m.get("engagement_rate") or 0)
        if eng < max_eng and views > over * med_views and med_views > 0:
            counts["brand_deal"] += 1
            continue
        if uuid in screen.get("off_niche", []):
            counts["off_niche"] += 1
            continue
        d = details.get(uuid)
        an = (d or {}).get("analysis") if d else None
        if not an:
            counts["unanalyzed"] += 1
            continue
        secs = an.get("narrative_structure", {}).get("structure_sections", []) or []
        transcript = " ".join(s for sec in secs for s in (sec.get("transcript_sentences") or []))
        caption = d.get("title") or m.get("title") or ""
        out.append({
            "uuid": uuid,
            "published_at": (d.get("published_at") or m.get("published_at") or "")[:10],
            "outlier": float(d.get("outlier_score") if d.get("outlier_score") is not None else m.get("outlier_score") or 0),
            "views": views,
            "comments": int(d.get("comment_count") or m.get("comment_count") or 0),
            "likes": int(d.get("like_count") or m.get("like_count") or 0),
            "engagement": eng,
            "caption_line": first_line(caption),
            "keyword_cta": keyword_cta(caption, transcript),
            "url": d.get("platform_url") or m.get("platform_url"),
            "sc_url": d.get("sandcastles_url") or m.get("sandcastles_url"),
            "thumb": d.get("thumbnail") or m.get("thumbnail"),
            "channel": (d.get("channel") or m.get("channel") or {}).get("handle"),
            "sc": {
                "format_type": an.get("format_type"),
                "format_category": an.get("format_category"),
                "format_flavor": an.get("format_flavor"),
                "visual_layout_category": an.get("visual_layout_category"),
                "visual_layout_type": an.get("visual_layout_type"),
                "spoken_hook": an.get("spoken_hook"),
                "spoken_hook_category": an.get("spoken_hook_category"),
                "topic": an.get("topic"),
                "seed": an.get("seed"),
                "angle": an.get("angle"),
                "common_belief": an.get("common_belief"),
                "sections": [s.get("section_name") for s in secs],
            },
        })
        counts["in"] += 1
    out.sort(key=lambda v: v["published_at"])
    json.dump({"screen": counts, "median_views": med_views, "videos": out}, open(a.out, "w"), indent=1)
    print(f"prepare_input: pulled {counts['pulled']} · brand-deal/boost out {counts['brand_deal']} · off-niche out {counts['off_niche']} · unanalyzed out {counts['unanalyzed']} · in {counts['in']} (median views {int(med_views):,})")


if __name__ == "__main__":
    main()
