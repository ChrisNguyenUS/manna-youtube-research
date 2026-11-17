#!/usr/bin/env python3
"""classify.py — give every video its structure key, layout key and topic bucket.

Usage:
  python3 classify.py videos.json tags.json classified.json \
      [--taxonomy ../references/taxonomy-map.md] [--overrides overrides.json] \
      [--contact-sheet contact.jpg --thumbs thumbs/]

tags.json: {"buckets": [{"key","name","what"}...], "tags": {"<uuid>": {"bucket": "<name>", "why": "..."}}}
The python block inside taxonomy-map.md is executed — the markdown is the classifier.
Prints UNMAPPED labels (extend the map, not this script) and the structure / layout / bucket distribution.
"""
import argparse, json, os, re, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))


def load_taxonomy(path):
    txt = open(path, encoding="utf-8").read()
    m = re.search(r"```python\n(.*?)```", txt, re.S)
    if not m:
        sys.exit("taxonomy-map.md has no ```python block")
    ns = {}
    exec(m.group(1), ns)
    return ns


def contact_sheet(videos, thumbs_dir, out, per=3):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("contact sheet skipped: pip install pillow --break-system-packages", file=sys.stderr); return
    groups = {}
    for v in videos:
        groups.setdefault(f"{v['sc']['visual_layout_category']}/{v['sc']['visual_layout_type']}", []).append(v)
    picks = []
    for k, vs in groups.items():
        picks += [(k, v) for v in sorted(vs, key=lambda x: -x["outlier"])[:per]]
    W, H, cols = 150, 266, 6
    rows = (len(picks) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * W, rows * (H + 22)), "black"); d = ImageDraw.Draw(sheet)
    for i, (k, v) in enumerate(picks):
        p = os.path.join(thumbs_dir, v["uuid"] + ".jpg")
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert("RGB").resize((W, H))
        x, y = (i % cols) * W, (i // cols) * (H + 22)
        sheet.paste(im, (x, y + 22)); d.text((x + 2, y + 4), f"{k[:26]} {v['outlier']}x", fill="yellow")
    sheet.save(out, quality=80); print(f"contact sheet → {out} ({len(picks)} thumbnails, {len(groups)} Sandcastles labels)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("videos"); ap.add_argument("tags"); ap.add_argument("out")
    ap.add_argument("--taxonomy", default=os.path.join(HERE, "..", "references", "taxonomy-map.md"))
    ap.add_argument("--overrides", default=None)
    ap.add_argument("--contact-sheet", default=None); ap.add_argument("--thumbs", default="thumbs")
    a = ap.parse_args()

    T = load_taxonomy(a.taxonomy)
    data = json.load(open(a.videos)); videos = data["videos"]
    if a.contact_sheet:
        contact_sheet(videos, a.thumbs, a.contact_sheet)
    overrides = json.load(open(a.overrides)) if a.overrides and os.path.exists(a.overrides) else {}
    tags = json.load(open(a.tags)) if os.path.exists(a.tags) else {"buckets": [], "tags": {}}
    bucket_names = [b["name"] for b in tags.get("buckets", [])]

    unmapped, untagged = Counter(), []
    for v in videos:
        s, sr = T["map_structure"](v["sc"]); l, lr = T["map_layout"](v["sc"], overrides)
        if s is None: unmapped[sr] += 1
        if l is None: unmapped[lr] += 1
        v["structure"], v["structure_reason"] = s, sr
        v["layout"], v["layout_reason"] = l, lr
        v["substrate"] = T["SUBSTRATE_NAMES"].get((v["sc"].get("visual_layout_type") or ""), v["sc"].get("visual_layout_type"))
        t = tags["tags"].get(v["uuid"])
        v["bucket"] = t["bucket"] if t else None
        if not t: untagged.append(v["uuid"])
        if t and bucket_names and t["bucket"] not in bucket_names:
            print(f"warn: bucket '{t['bucket']}' for {v['uuid'][:8]} not in tags.buckets", file=sys.stderr)

    out = {"screen": data.get("screen"), "median_views": data.get("median_views"), "buckets": tags.get("buckets", []),
           "overrides": overrides, "structures": T["STRUCTURES"], "layouts": T["LAYOUTS"], "names": T["NAMES"], "added": T["ADDED"],
           "videos": videos}
    json.dump(out, open(a.out, "w"), indent=1)

    for k, n in unmapped.items(): print(f"UNMAPPED ×{n}: {k}  ← add to references/taxonomy-map.md")
    if untagged: print(f"UNTAGGED {len(untagged)} videos have no topic bucket in tags.json: {', '.join(u[:8] for u in untagged[:8])}…")
    print("structures:", dict(Counter(v["structure"] for v in videos).most_common()))
    print("layouts:", dict(Counter(v["layout"] for v in videos).most_common()))
    print("buckets:", dict(Counter(v["bucket"] for v in videos).most_common()))
    ex = sum(1 for v in videos if v["layout_reason"].startswith("screen-demo:"))
    ov = sum(1 for v in videos if v["layout_reason"].startswith("channel override"))
    print(f"exceptions: screen-demo two-signal ×{ex} · channel layout override ×{ov}")


if __name__ == "__main__":
    main()
