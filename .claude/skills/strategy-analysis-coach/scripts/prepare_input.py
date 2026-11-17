#!/usr/bin/env python3
"""
prepare_input.py — merge the free search pages and the analyzed payloads into one
clean videos.json, apply the window and the screening rule, and map Sandcastles'
labels onto the shared taxonomy.

Usage:
  python3 prepare_input.py --raw-dir raw --details-dir details --out videos.json \
      [--since 2026-04-20] [--until 2026-09-18] [--buckets buckets.json] [--panels panels.json]

Inputs
  raw/page*.json        pages from search_my_videos, saved verbatim
  details/<uuid>.json   get_video_details payloads, saved verbatim (optional per video)
  buckets.json          {"buckets": {"key": "Plain name", ...}, "assign": {"<uuid>": "key", ...}}
                        — written by the model after reading topic/seed/hook for every video
  panels.json           {"<uuid>": "proof-grid" | "template" | ...} — title-card packaging
                        types, written by the model after reading the thumbnails (optional)

Output: videos.json — one row per kept video, sorted by date, plus a "meta" block with
the screening counts. Nothing is retyped by hand: every field comes from the files.
"""
import argparse, glob, json, os, re, statistics as st
from collections import Counter

# ---- shared taxonomy (see references/taxonomy-map.md) -------------------------
STRUCTURE_MAP = {
    "breakdown_explainer": "breakdown", "problem_solution": "breakdown", "case_study": "breakdown",
    "framework": "breakdown", "analysis": "breakdown", "explainer": "breakdown",
    "tutorial": "tutorial", "how_to": "tutorial", "demo": "tutorial", "walkthrough": "tutorial",
    "listicle": "listicle", "ranking_rating_tier_list": "listicle", "levels": "listicle", "top_n": "listicle", "tips": "listicle",
    "common_trap_mistake": "myth-kill", "hot_take": "myth-kill", "contrarian": "myth-kill", "rant": "myth-kill",
    "a_vs_b_comparison": "a-vs-b", "comparison": "a-vs-b", "before_after": "a-vs-b",
    "story": "story-lesson", "monologue": "story-lesson", "personal_story": "story-lesson",
    "clone": "clone", "template": "clone", "remix": "clone",
    "challenge": "challenge", "experiment": "challenge", "test": "challenge",
    "reaction": "reaction", "commentary": "reaction", "review": "reaction", "critique": "reaction",
    "skit": "skit", "pov": "skit", "roleplay": "skit",
}
STRUCTURE_NAME = {
    "listicle": "Countdown list", "breakdown": "Structured breakdown", "a-vs-b": "This vs. that",
    "myth-kill": "Busting a myth", "tutorial": "Show-me-how", "story-lesson": "Story with a lesson",
    "clone": "Copy this", "challenge": "Experiment", "reaction": "Reacting to", "skit": "Acting it out",
}
# Sandcastles visual_layout_type → taxonomy layout. Verify against thumbnails: on some
# channels every label is the same real layout (see synthesis-guide.md, "layout check").
LAYOUT_MAP = {
    "split_screen": "split-cinematic", "visual_greenscreen": "split-cinematic",
    "notes_article_greenscreen": "split-cinematic", "full_screen_hybrid": "th-broll",
    "office_room_yap": "raw-th", "comparison_clone": "split-cinematic", "screen_recording": "screen-demo",
    "text_overlay": "text-driven", "vlog": "vlog", "podcast_clip": "clip", "cinematic": "cinematic",
}
LAYOUT_NAME = {
    "raw-th": "You on camera, nothing else", "th-broll": "You on camera + clips",
    "split-cinematic": "Cinematic split-screen", "screen-demo": "Screen recording + face",
    "text-driven": "Big text on screen", "vlog": "Out in the world", "clip": "Podcast or interview clip",
    "cinematic": "Cinematic produced (no split)",
}
HOOK_MAP = {
    "secret_reveal_breakdown": "reveal", "tutorial": "how-to", "authority": "authority", "case_study": "authority",
    "personal_experience": "authority", "problem": "problem", "trap_mistake": "problem", "contrarian": "contrarian",
    "list": "list", "ranking_rating": "list", "question": "question",
}
HOOK_NAME = {
    "reveal": "Secret reveal", "how-to": "How-to promise", "authority": "Authority claim",
    "problem": "Problem call-out", "contrarian": "Contrarian flip", "list": "Counted list", "question": "Question",
}

def kw_of(caption):
    m = re.search(r'[Cc]omment\s+[“"\'‘]([^”"\'’\n]{1,40})[”"\'’]', caption or "")
    if m: return m.group(1).strip().upper()
    m = re.search(r'[Cc]omment\s+([A-Z][A-Za-z0-9\-]{1,20})\b', caption or "")
    return m.group(1).upper() if m else None

def cta_fields(caption):
    c = caption or ""
    lines = [l for l in c.split("\n") if re.search(r"[Cc]omment", l)]
    txt = " ".join(lines)
    d = None
    if re.search(r"skill|plugin|prompt|mcp", txt, re.I): d = "skills/prompts"
    elif re.search(r"video|breakdown|tutorial|walkthrough", txt, re.I): d = "video"
    elif re.search(r"doc|guide|template|pdf|system|framework|handbook|playbook|cheat|list|collection|database|swipe|library|blueprint", txt, re.I): d = "doc/guide"
    elif kw_of(c): d = "unspecified"
    return dict(kw=kw_of(c), deliverable=d, cta_free=bool(re.search(r"\bfree\b", txt, re.I)),
                cta_ifyou=bool(re.search(r"if you want", txt, re.I)),
                cta_mentions=len(re.findall(r"[Cc]omment\s+[“\"'‘]", c)), cta_text=txt[:200])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", default="raw"); ap.add_argument("--details-dir", default="details")
    ap.add_argument("--out", default="videos.json"); ap.add_argument("--since"); ap.add_argument("--until")
    ap.add_argument("--buckets"); ap.add_argument("--panels")
    ap.add_argument("--layout-override", help="taxonomy layout key to apply to EVERY video, e.g. split-cinematic — use only after the "
                    "thumbnail check (synthesis-guide.md) shows the channel runs one layout and Sandcastles' labels are noise")
    ap.add_argument("--layouts", help="optional {uuid: layout key} file for per-video corrections from the thumbnail check")
    a = ap.parse_args()
    layout_fix = json.load(open(a.layouts)) if a.layouts and os.path.exists(a.layouts) else {}

    vids = {}
    for f in sorted(glob.glob(os.path.join(a.raw_dir, "page*.json"))):
        txt = open(f).read()
        try: d = json.loads(txt)
        except json.JSONDecodeError:
            d = json.loads(txt[txt.index("{"): txt.rindex("}") + 1])  # tolerate harness wrapper text
        for v in d.get("videos", []): vids[v["uuid"]] = v
    total = len(vids)

    details = {}
    for f in glob.glob(os.path.join(a.details_dir, "*.json")):
        if f.endswith(".ERROR.json"): continue
        try: d = json.load(open(f))
        except Exception: continue
        v = d.get("video") or d
        if v.get("uuid"): details[v["uuid"]] = v

    buckets = json.load(open(a.buckets)) if a.buckets and os.path.exists(a.buckets) else {"buckets": {}, "assign": {}}
    panels = json.load(open(a.panels)) if a.panels and os.path.exists(a.panels) else {}

    rows = []
    for u, v in vids.items():
        d = v["published_at"][:10]
        if a.since and d < a.since: continue
        if a.until and d > a.until: continue
        det = details.get(u, {}); an = det.get("analysis") or {}
        ns = an.get("narrative_structure") or {}
        secs = [(s.get("section_name"), s.get("start_second"), s.get("end_second"), " ".join(s.get("transcript_sentences", [])))
                for s in ns.get("structure_sections", [])]
        ft = an.get("format_type"); lt = an.get("visual_layout_type"); hc = an.get("spoken_hook_category") or v.get("spoken_hook_category")
        r = dict(uuid=u, date=d, month=d[:7], views=v["view_count"], likes=v["like_count"], comments=v["comment_count"],
                 out=v["outlier_score"] or 0, eng=v["engagement_rate"], caption=v["title"], thumb=v["thumbnail"],
                 url=v["platform_url"], surl=v["sandcastles_url"], analyzed=bool(an),
                 topic=an.get("topic") or v.get("topic"), seed=an.get("seed") or v.get("seed"),
                 format_type=ft, format_flavor=an.get("format_flavor"), hook=an.get("spoken_hook"), madlib=an.get("spoken_hook_madlib"),
                 hook_cat=hc, hook_alignment=an.get("hook_alignment"), layout_type=lt, layout_cat=an.get("visual_layout_category"),
                 sections=secs, structure_summary=ns.get("structure_summary"), angle=an.get("angle"), summary=an.get("summary"),
                 belief=an.get("common_belief"), reality=an.get("contrarian_reality"), evidence=an.get("supporting_evidence"),
                 duration=(secs[-1][2] if secs and secs[-1][2] else None))
        r["structure"] = STRUCTURE_MAP.get(ft or "", None); r["structure_name"] = STRUCTURE_NAME.get(r["structure"], None)
        r["layout_sandcastles"] = lt
        r["layout"] = a.layout_override or layout_fix.get(u) or LAYOUT_MAP.get(lt or "", None); r["layout_name"] = LAYOUT_NAME.get(r["layout"], None)
        r["hook_style"] = HOOK_MAP.get(hc or "", None); r["hook_style_name"] = HOOK_NAME.get(r["hook_style"], None)
        b = buckets["assign"].get(u); r["bucket"] = b; r["bucket_name"] = buckets["buckets"].get(b) if b else None
        r["panel"] = panels.get(u)
        r.update(cta_fields(v["title"]))
        rows.append(r)
    rows.sort(key=lambda r: r["date"])

    # screening: brand deals / boosts (eng < 2% and views >= 2x channel median); off-niche is a judgment call → flag only
    med = st.median([r["views"] for r in rows]) if rows else 0
    kept, dropped = [], []
    for r in rows:
        if r["eng"] < 0.02 and r["views"] >= 2 * med: dropped.append((r["date"], r["views"], r["eng"], "low engagement, views far above median (boost/brand deal)"))
        else: kept.append(r)
    meta = dict(total_in_pages=total, in_window=len(rows), kept=len(kept), dropped=dropped, analyzed=sum(r["analyzed"] for r in kept),
                median_views=med, first=kept[0]["date"] if kept else None, last=kept[-1]["date"] if kept else None,
                unmapped_structures=sorted({r["format_type"] for r in kept if r["format_type"] and not r["structure"]}),
                unmapped_layouts=sorted({r["layout_type"] for r in kept if r["layout_type"] and not r["layout"]}),
                unmapped_hooks=sorted({r["hook_cat"] for r in kept if r["hook_cat"] and not r["hook_style"]}),
                unbucketed=sum(1 for r in kept if not r["bucket"]))
    json.dump({"meta": meta, "videos": kept}, open(a.out, "w"), indent=1)
    print(f"pages: {total} videos · window: {len(rows)} · kept: {len(kept)} · dropped: {len(dropped)} · analyzed: {meta['analyzed']} · "
          f"range {meta['first']} → {meta['last']} · median views {int(med):,}")
    for d in dropped: print("  dropped:", d)
    if meta["unmapped_structures"]: print("  UNMAPPED structures (add to taxonomy-map.md):", meta["unmapped_structures"])
    if meta["unmapped_layouts"]: print("  UNMAPPED layouts:", meta["unmapped_layouts"])
    if meta["unbucketed"]: print(f"  {meta['unbucketed']} videos have no topic bucket yet — write buckets.json and re-run")

if __name__ == "__main__":
    main()
