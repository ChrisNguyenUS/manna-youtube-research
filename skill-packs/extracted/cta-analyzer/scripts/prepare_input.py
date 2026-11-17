#!/usr/bin/env python3
"""Merge raw Sandcastles tool outputs into one videos.json.

Usage:
  python3 prepare_input.py --raw-dir ./raw --out videos.json

--raw-dir   A folder where you saved Sandcastles tool results as .json/.txt files:
            * search_my_videos / channel_recap pages ({"videos":[...]})
            * get_video_details payloads ({"video":{...,"analysis":{...}}})
            Any mix, any filenames. Duplicates are merged by uuid; the details payload
            wins because it carries the transcript.

Output schema (one object per video):
  uuid, date, url, sc_url, thumb, views, likes, comments, outlier, hook_cat,
  format_cat, topic, caption, transcript, source
"""
import argparse, glob, json, os

def load_json_any(path):
    txt = open(path, encoding='utf-8').read().strip()
    # tolerate tool-result wrappers: find the first '{' and last '}'
    if not txt.startswith('{') and not txt.startswith('['):
        i, j = txt.find('{'), txt.rfind('}')
        if i == -1: return None
        txt = txt[i:j+1]
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        return None

def stitch_transcript(analysis):
    try:
        secs = analysis['narrative_structure']['structure_sections']
        return '\n'.join(s for sec in secs for s in sec.get('transcript_sentences', []))
    except Exception:
        return ''

def norm(v, details=None):
    out = dict(
        uuid=v.get('uuid'), date=(v.get('published_at') or '')[:10], url=v.get('platform_url', ''),
        sc_url=v.get('sandcastles_url', ''), thumb=v.get('thumbnail', ''),
        views=v.get('view_count') or 0, likes=v.get('like_count') or 0, comments=v.get('comment_count') or 0,
        outlier=v.get('outlier_score') or 0, hook_cat=v.get('spoken_hook_category') or '',
        format_cat=v.get('format_category') or '', topic=v.get('topic') or '',
        caption=v.get('title') or v.get('description') or '', transcript='', source='sandcastles')
    a = (details or v).get('analysis') if isinstance(details or v, dict) else None
    if a:
        out['transcript'] = stitch_transcript(a)
        out['hook_cat'] = out['hook_cat'] or a.get('spoken_hook_category', '')
        out['format_cat'] = out['format_cat'] or a.get('format_category', '')
        out['topic'] = out['topic'] or a.get('topic', '')
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw-dir', default=None)
    ap.add_argument('--out', default='videos.json')
    args = ap.parse_args()
    videos = {}
    if args.raw_dir:
        for p in sorted(glob.glob(os.path.join(args.raw_dir, '*'))):
            d = load_json_any(p)
            if not d: continue
            if isinstance(d, dict) and 'videos' in d:
                for v in d['videos']:
                    if v.get('uuid') and v['uuid'] not in videos: videos[v['uuid']] = norm(v)
            elif isinstance(d, dict) and 'video' in d:
                v = d['video']; cur = videos.get(v['uuid'], {})
                n = norm(v, v);
                if not n['transcript'] and cur.get('transcript'): n['transcript'] = cur['transcript']
                videos[v['uuid']] = n
            elif isinstance(d, list):
                for v in d:
                    if isinstance(v, dict) and v.get('uuid') and v['uuid'] not in videos: videos[v['uuid']] = norm(v)
    vids = sorted(videos.values(), key=lambda v: v['date'])
    json.dump(vids, open(args.out, 'w'), indent=1, ensure_ascii=False)
    with_t = sum(1 for v in vids if v['transcript'])
    print(f'{len(vids)} videos → {args.out} · {with_t} with transcripts · {len(vids)-with_t} caption-only')

if __name__ == '__main__':
    main()
