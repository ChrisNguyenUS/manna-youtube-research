#!/usr/bin/env python3
"""Merge the raw Sandcastles pages into one clean list of the channel's last N videos.

Usage:
  python3 prepare_input.py raw/ videos.json --last 50 [--embed-thumbs] [--fresh-hours 48]

Input : raw/page*.json — each exactly as search_my_videos returned it (wrapper text tolerated).
Output: videos.json — newest first, deduplicated by uuid, screened, with dot-ready fields.

Screening (the master-spec rule, applied before anything is counted):
  * boost / brand deal  = engagement under 2% AND views above 3x the channel median  -> dropped, counted
  * fresh               = posted under --fresh-hours ago -> kept, flagged (outlier score not settled)
  * off-niche is a judgment call the SKILL.md makes by reading titles; mark those uuids in
    a file called drop.txt (one uuid per line) next to raw/ and they are dropped and counted.

--embed-thumbs downloads every thumbnail and inlines it as a small JPEG data URI, so the
published report never depends on an external image host. Falls back to the remote URL on
any fetch error, so the build never breaks on a bad network.
"""
import argparse, base64, glob, io, json, os, re, statistics, sys, urllib.request
from datetime import datetime, timezone

ap = argparse.ArgumentParser()
ap.add_argument('raw_dir'); ap.add_argument('out')
ap.add_argument('--last', type=int, default=50)
ap.add_argument('--embed-thumbs', action='store_true')
ap.add_argument('--fresh-hours', type=float, default=48)
ap.add_argument('--thumb-width', type=int, default=144)
a = ap.parse_args()

def load_page(path):
    txt = open(path, encoding='utf-8').read()
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        m = re.search(r'\{.*\}', txt, re.S)  # tolerate harness wrapper text
        return json.loads(m.group(0))

videos = {}
for p in sorted(glob.glob(os.path.join(a.raw_dir, 'page*.json'))):
    for v in load_page(p).get('videos', []):
        videos[v['uuid']] = v
vids = sorted(videos.values(), key=lambda v: v['published_at'], reverse=True)
print(f'{len(vids)} unique videos across raw pages', file=sys.stderr)

drop_path = os.path.join(os.path.dirname(os.path.abspath(a.raw_dir.rstrip('/'))), 'drop.txt')
off_niche = set(l.strip() for l in open(drop_path)) if os.path.exists(drop_path) else set()

med = statistics.median([v['view_count'] for v in vids]) if vids else 0
now = datetime.now(timezone.utc)
kept, dropped = [], []
for v in vids:
    eng = v.get('engagement_rate') or 0
    views = v.get('view_count') or 0
    if v['uuid'] in off_niche:
        dropped.append({'uuid': v['uuid'], 'why': 'off-niche', 'title': v['title'].split('\n')[0][:90]}); continue
    if eng < 0.02 and views > 3 * med:
        dropped.append({'uuid': v['uuid'], 'why': 'boost or brand deal (engagement under 2%, views far above median)', 'title': v['title'].split('\n')[0][:90]}); continue
    kept.append(v)
kept = kept[:a.last]

def embed(url):
    try:
        from PIL import Image
        data = urllib.request.urlopen(url, timeout=20).read()
        im = Image.open(io.BytesIO(data)).convert('RGB')
        w = a.thumb_width; h = round(im.height * w / im.width)
        im = im.resize((w, h), Image.LANCZOS)
        buf = io.BytesIO(); im.save(buf, 'JPEG', quality=72, optimize=True)
        return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
    except Exception as e:  # noqa
        print(f'  thumb fallback ({e.__class__.__name__}) for {url}', file=sys.stderr)
        return url

out = []
for i, v in enumerate(kept, 1):
    pub = datetime.fromisoformat(v['published_at']).replace(tzinfo=timezone.utc)
    age_h = (now - pub).total_seconds() / 3600
    hook_line = v['title'].split('\n')[0].strip()
    out.append({
        'n': i, 'uuid': v['uuid'], 'hook_line': hook_line,
        'caption': v['title'],
        'url': v['platform_url'], 'sandcastles_url': v['sandcastles_url'],
        'thumb': embed(v['thumbnail']) if a.embed_thumbs else v['thumbnail'],
        'views': v['view_count'], 'likes': v['like_count'], 'comments': v['comment_count'],
        'outlier': v['outlier_score'], 'engagement': v['engagement_rate'],
        'date': v['published_at'][:10], 'published_at': v['published_at'], 'analyzed': bool(v.get('analyzed')),
        'topic': v.get('topic'), 'hook_category': v.get('spoken_hook_category'), 'format_category': v.get('format_category'),
        'fresh': age_h < a.fresh_hours,
    })

json.dump({
    'channel': kept[0]['channel'] if kept else None,
    'pulled_at': now.isoformat(timespec='seconds'),
    'median_views_all': med,
    'requested': a.last, 'kept': len(out), 'dropped': dropped,
    'unanalyzed': [v['uuid'] for v in out if not v['analyzed']],
    'fresh': [v['uuid'] for v in out if v['fresh']],
    'videos': out,
}, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'kept {len(out)} · dropped {len(dropped)} · unanalyzed {sum(1 for v in out if not v["analyzed"])} · fresh {sum(1 for v in out if v["fresh"])} → {a.out}', file=sys.stderr)
