#!/usr/bin/env python3
"""Merge raw Sandcastles tool outputs into one videos.json for the Format Finder.

Usage:
  python3 prepare_input.py --raw-dir raw --screen screen.json --out videos.json

--raw-dir   Folder holding Sandcastles results saved verbatim:
              raw/watchlist/pageN.json     search_my_videos pages ({"videos":[...]})
              raw/details/<uuid>.json      get_video_details payloads ({"video":{...,"analysis":{...}}})
            Any nesting, any filenames. Merged by uuid; the details payload wins.
--screen    JSON written by Claude after the niche screen:
              {"exclude_handles": [...own channel, anything the user excluded...],
               "in_niche_handles": [...],
               "min_outlier": 3.0,
               "brand_deal": {"max_engagement": 0.02, "views_over_median": 3.0}}
            Videos from handles not in in_niche_handles are kept in the file but tagged
            screen="off-niche" so they can still serve as white-space examples.

Output: one object per video with the fields the classifier needs, plus screen tags.
"""
import argparse, glob, json, os, statistics


def load_json_any(path):
    txt = open(path, encoding='utf-8').read().strip()
    if not (txt.startswith('{') or txt.startswith('[')):
        i, j = txt.find('{'), txt.rfind('}')
        if i == -1:
            return None
        txt = txt[i:j + 1]
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        return None


def norm(v):
    ch = v.get('channel') or {}
    a = v.get('analysis') or {}
    ns = a.get('narrative_structure') or {}
    return dict(
        uuid=v.get('uuid'),
        handle=ch.get('handle') or v.get('channel_handle') or '',
        channel_uuid=ch.get('uuid') or '',
        platform=ch.get('platform') or v.get('platform') or '',
        date=(v.get('published_at') or '')[:10],
        url=v.get('platform_url', ''),
        sc_url=v.get('sandcastles_url', ''),
        thumb=v.get('thumbnail', ''),
        views=v.get('view_count') or 0,
        likes=v.get('like_count') or 0,
        comments=v.get('comment_count') or 0,
        engagement=v.get('engagement_rate'),
        outlier=v.get('outlier_score') or 0,
        analyzed=bool(v.get('analyzed')),
        caption=(v.get('title') or v.get('description') or ''),
        # Sandcastles labels (raw, unmapped)
        sc_format_category=a.get('format_category') or v.get('format_category') or '',
        sc_format_type=a.get('format_type') or v.get('format_type') or '',
        sc_format_flavor=a.get('format_flavor') or '',
        sc_layout_category=a.get('visual_layout_category') or '',
        sc_layout_type=a.get('visual_layout_type') or '',
        sc_hook_category=a.get('spoken_hook_category') or v.get('spoken_hook_category') or '',
        spoken_hook=a.get('spoken_hook') or '',
        topic=a.get('topic') or v.get('topic') or '',
        seed=a.get('seed') or v.get('seed') or '',
        sections=[s.get('section_name') or '' for s in (ns.get('structure_sections') or [])],
        structure_summary=ns.get('structure_summary') or '',
        transcript='\n'.join(s2 for s in (ns.get('structure_sections') or []) for s2 in (s.get('transcript_sentences') or [])),
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw-dir', required=True)
    ap.add_argument('--screen', required=True)
    ap.add_argument('--out', default='videos.json')
    a = ap.parse_args()
    screen = json.load(open(a.screen))
    excl = set(h.lower() for h in screen.get('exclude_handles', []))
    inn = set(h.lower() for h in screen.get('in_niche_handles', []))
    min_outlier = float(screen.get('min_outlier', 3.0))
    bd = screen.get('brand_deal', {})
    bd_eng = float(bd.get('max_engagement', 0.02))
    bd_mult = float(bd.get('views_over_median', 3.0))

    vids, details = {}, {}
    for p in sorted(glob.glob(os.path.join(a.raw_dir, '**', '*'), recursive=True)):
        if os.path.isdir(p):
            continue
        d = load_json_any(p)
        if not d:
            continue
        if isinstance(d, dict) and 'videos' in d:
            for v in d['videos']:
                if v.get('uuid'):
                    vids.setdefault(v['uuid'], v)
        elif isinstance(d, dict) and 'video' in d:
            v = d['video']
            details[v['uuid']] = v

    # channel median views over EVERY video pulled (analyzed or not) = the brand-deal baseline
    per_ch = {}
    for v in vids.values():
        per_ch.setdefault((v.get('channel') or {}).get('handle', ''), []).append(v.get('view_count') or 0)
    med = {h: statistics.median(x) for h, x in per_ch.items() if x}

    rows = []
    for uuid, v in vids.items():
        if uuid in details:
            v = {**v, **details[uuid]}
        r = norm(v)
        h = r['handle'].lower()
        if h in excl:
            r['screen'] = 'excluded'
        elif h not in inn:
            r['screen'] = 'off-niche'
        elif not r['analyzed']:
            r['screen'] = 'unanalyzed'
        elif r['outlier'] < min_outlier:
            r['screen'] = 'below-band'
        elif (r['engagement'] is not None and r['engagement'] < bd_eng
              and r['views'] > bd_mult * med.get(r['handle'], 0)):
            r['screen'] = 'brand-deal'
        else:
            r['screen'] = 'in'
        r['channel_median_views'] = med.get(r['handle'], 0)
        r['has_details'] = uuid in details
        rows.append(r)
    for uuid, v in details.items():          # details not present in any list page
        if uuid not in vids:
            r = norm(v); r['screen'] = 'excluded' if r['handle'].lower() in excl else ('in' if r['handle'].lower() in inn else 'off-niche')
            r['channel_median_views'] = med.get(r['handle'], 0); r['has_details'] = True
            rows.append(r)
    rows.sort(key=lambda r: -r['outlier'])
    json.dump(rows, open(a.out, 'w'), indent=1, ensure_ascii=False)
    from collections import Counter
    c = Counter(r['screen'] for r in rows)
    print(f"{len(rows)} videos → {a.out} · " + ' · '.join(f"{k}={n}" for k, n in c.most_common())
          + f" · with details={sum(r['has_details'] for r in rows)}")


if __name__ == '__main__':
    main()
