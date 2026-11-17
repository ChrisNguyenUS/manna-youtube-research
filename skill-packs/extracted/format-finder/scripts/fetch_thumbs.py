#!/usr/bin/env python3
"""Download every thumbnail the report references and embed them as small data URIs.

Why: an artifact page can only load images from its own origin — external hosts (Sandcastles' thumbnail
bucket included) are blocked by the viewer's content policy, so <img src="https://storage.googleapis.com/…">
renders blank. Embedding ~200px JPEGs keeps every thumbnail visible and the page under ~3 MB.

Usage: python3 fetch_thumbs.py analysis.json thumbs.json [--cache raw/thumbs] [--width 200] [--quality 70]
Then: build_report.py … --thumbs thumbs.json
"""
import argparse, base64, io, json, os, sys, time, urllib.request


def collect(A):
    urls = {}
    def add(v):
        if v and v.get('thumb') and v.get('uuid'):
            urls[v['uuid']] = v['thumb']
    for c in A['matrix'].values():
        add(c.get('specimen'))
        for v in c.get('videos', []): add(v)
    for ch in A.get('channels', []):
        add(ch.get('best'))
        for h in ch.get('heroes', []): add(h.get('best'))
    for w in A.get('white_space', []):
        for v in w.get('examples', []): add(v)
    for ax in ('structures', 'layouts'):
        for e in A['explain'][ax]: add(e.get('specimen'))
    return urls


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('analysis'); ap.add_argument('out')
    ap.add_argument('--cache', default='raw/thumbs'); ap.add_argument('--width', type=int, default=200); ap.add_argument('--quality', type=int, default=70)
    ap.add_argument('--extra', default=None, help='optional JSON list of {uuid, thumb} to include (e.g. pick models outside the matrix slices)')
    a = ap.parse_args()
    try:
        from PIL import Image
    except ImportError:
        sys.exit('pip install pillow --break-system-packages')
    A = json.load(open(a.analysis))
    urls = collect(A)
    if a.extra:
        for v in json.load(open(a.extra)):
            if v.get('thumb') and v.get('uuid'): urls[v['uuid']] = v['thumb']
    os.makedirs(a.cache, exist_ok=True)
    out, failed, total = {}, [], 0
    for i, (uuid, url) in enumerate(sorted(urls.items())):
        path = os.path.join(a.cache, uuid + '.jpg')
        if not os.path.exists(path):
            try:
                with urllib.request.urlopen(url, timeout=20) as r:
                    open(path, 'wb').write(r.read())
                time.sleep(0.05)
            except Exception as e:
                failed.append((uuid, str(e)[:80])); continue
        try:
            im = Image.open(path).convert('RGB')
            w, h = im.size
            if w > a.width:
                im = im.resize((a.width, round(h * a.width / w)), Image.LANCZOS)
            buf = io.BytesIO(); im.save(buf, 'JPEG', quality=a.quality, optimize=True, progressive=True)
            b = buf.getvalue(); total += len(b)
            out[uuid] = 'data:image/jpeg;base64,' + base64.b64encode(b).decode('ascii')
        except Exception as e:
            failed.append((uuid, 'decode: ' + str(e)[:60]))
    json.dump(out, open(a.out, 'w'))
    print(f'{len(out)} thumbnails embedded → {a.out} · {total//1024} KB of JPEG ({len(urls)} referenced, {len(failed)} failed)')
    for f in failed[:10]: print('  failed', *f)


if __name__ == '__main__':
    main()
