#!/usr/bin/env python3
"""Render analysis.json + narrative.json into the house-style HTML report.

Usage: python3 build_report.py analysis.json narrative.json report.html [--standalone]

The output has NO <html>/<head>/<body> wrapper — it is written for the Artifact tool, which adds the
page skeleton. Pass --standalone to wrap it for a local screenshot or a plain file.
"""
import argparse, json, os
ap = argparse.ArgumentParser()
ap.add_argument('analysis'); ap.add_argument('narrative'); ap.add_argument('out')
ap.add_argument('--standalone', action='store_true')
a = ap.parse_args()
A = json.load(open(a.analysis, encoding='utf-8')); N = json.load(open(a.narrative, encoding='utf-8'))
tpl = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'report-template.html')
html = open(tpl, encoding='utf-8').read()
data = json.dumps({'analysis': A, 'narrative': N}, ensure_ascii=False).replace('</', '<\\/')
html = html.replace('__DATA__', data).replace('__TITLE__', N['title'])
if a.standalone:
    html = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            + html.split('</style>', 1)[0] + '</style></head><body>' + html.split('</style>', 1)[1] + '</body></html>')
open(a.out, 'w', encoding='utf-8').write(html)
print(f'wrote {a.out} ({len(html)//1024} KB) · title "{N["title"]}"')
