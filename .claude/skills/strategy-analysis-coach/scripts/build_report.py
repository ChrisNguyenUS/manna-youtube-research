#!/usr/bin/env python3
"""
build_report.py — render the house-style report from analysis.json + narrative.json.

Usage:
  python3 build_report.py analysis.json narrative.json report.html \
      [--template ../assets/report-template.html] [--bucket-order story,hooks,ai,formats,growth] \
      [--thumb-cache thumbs_cache] [--standalone]

narrative.json is written by the model (see SKILL.md step 6): eras{E1..}{name,sub,making,worked,didnt,doubled,ev[]},
switches{date:{title,text}}, six[{q,a,ev[]}], hidden[{h,b,so,ev[]}], steal[{move,why,ev,ev2}], next[{t,b}], mantra,
headline, one_sentence, channel{handle,title,platform,followers,workspace}. Evidence is referenced by post DATE
(YYYY-MM-DD); the builder resolves dates to posts, embeds their thumbnails as small data URIs and links to the post.
Every number in the page is next to the video it came from.
"""
import argparse, base64, html, io, json, math, os, subprocess, sys
from datetime import date, datetime

HOUSE = ["#EF4444", "#38BDF8", "#F97316", "#A78BFA", "#F59E0B"]  # r1, r4, r2, violet, r3 — validated order for adjacent ribbons

STRUCT_KEY = {  # plain-English name · what it is · 12-second opening
    "listicle": ("Countdown list", "N things, counted through.", "“These are the 6 places I find every viral idea. Number one…”"),
    "breakdown": ("Structured breakdown", "Takes one thing apart step by step.", "“This is the storytelling hack top creators use. It works in three parts. First…”"),
    "a-vs-b": ("This vs. that", "Two options set against each other.", "“The story arc you learned in school vs. the one that holds attention on short-form…”"),
    "myth-kill": ("Busting a myth", "Common belief, then the flip.", "“Everyone says post more. Here’s why that’s the worst advice you’ll get…”"),
    "tutorial": ("Show-me-how", "Does the thing on screen.", "“Here’s how to plan 30 days of content in 30 minutes. Open a grid…”"),
    "story-lesson": ("Story with a lesson", "A narrative that lands on a takeaway.", "“Last month I posted a video I was sure would flop. It did ten times my average. Here’s what I learned…”"),
    "clone": ("Copy this", "Here’s a winner, here’s how to replicate it.", "“This video did 8M views. Here’s the exact template so you can make yours…”"),
    "challenge": ("Experiment", "“I tried X for N days.”", "“I posted every day for 30 days using one format. Here’s what happened…”"),
    "reaction": ("Reacting to", "Commentary on someone else’s thing.", "“This creator just gave away the whole playbook. Watch this part…”"),
    "skit": ("Acting it out", "POV or sketch.", "“POV: your editor asks what the hook is and you don’t have one…”"),
}
LAYOUT_KEY = {
    "raw-th": ("You on camera, nothing else", "One face, one take, no cuts to anything else."),
    "th-broll": ("You on camera + clips", "Face with cutaways to footage or screenshots."),
    "split-cinematic": ("Cinematic split-screen", "Face on one side, footage or a title card on the other, produced look."),
    "screen-demo": ("Screen recording + face", "Software or phone on screen, face in a corner or intercut."),
    "text-driven": ("Big text on screen", "Words carry it; face optional."),
    "vlog": ("Out in the world", "Handheld, on location, moving."),
    "clip": ("Podcast or interview clip", "Two or more people, cut from a longer recording."),
    "cinematic": ("Cinematic produced (no split)", "Full-frame produced footage, voiceover or on-camera."),
}
PANEL_KEY = {
    "proof-grid": ("Proof grid", "Other creators’ thumbnails with their view counts on the card."),
    "example-grid": ("Example grid", "A grid of example thumbnails, no numbers."),
    "series-card": ("Series card", "A recurring series title with an episode number."),
    "template": ("Template card", "The finished artifact itself: a script template, a calendar, a grid."),
    "diagram": ("Diagram or chart", "A framework drawn as a shape: ladder, funnel, curve, bullseye."),
    "blurred-list": ("Blurred tease", "A list or term with the answer blurred out."),
    "product-logo": ("Product logo", "A tool’s mark (Claude, ChatGPT) leads the card."),
    "ui-screenshot": ("App screenshot", "A real screen: profile, dashboard, database."),
    "metaphor": ("Metaphor illustration", "A picture that stands for the idea: pipes, bricks, a brain, a movie still."),
    "icon-grid": ("Icon grid", "A grid of tool icons."),
}
HOOK_KEY = {"reveal": "Secret reveal", "how-to": "How-to promise", "authority": "Authority claim", "problem": "Problem call-out",
            "contrarian": "Contrarian flip", "list": "Counted list", "question": "Question"}

def esc(s): return html.escape(str(s if s is not None else ""), quote=True)
def fmt_views(v): return f"{v/1e6:.1f}M" if v >= 1e6 else (f"{v/1e3:.0f}K" if v >= 1000 else str(v))
def dshort(d): return datetime.strptime(d, "%Y-%m-%d").strftime("%b %-d")
def outx(o): return f"{o:g}x"

class Thumbs:
    def __init__(self, cache): self.cache = cache; os.makedirs(cache, exist_ok=True)
    def data_uri(self, v, width=160):
        p = os.path.join(self.cache, f"{v['uuid']}_{width}.b64")
        if os.path.exists(p): return open(p).read()
        try:
            from PIL import Image
            raw = os.path.join(self.cache, f"{v['uuid']}.jpg")
            if not os.path.exists(raw): subprocess.run(["curl", "-sL", "-o", raw, v["thumb"]], check=False, timeout=30)
            im = Image.open(raw).convert("RGB"); im = im.resize((width, int(width * im.height / im.width)))
            buf = io.BytesIO(); im.save(buf, "JPEG", quality=60, optimize=True)
            uri = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        except Exception:
            uri = ("data:image/svg+xml;utf8," + f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{int(width*16/9)}'>"
                   f"<rect width='100%' height='100%' fill='%231A2540'/></svg>")
        open(p, "w").write(uri); return uri

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("analysis"); ap.add_argument("narrative"); ap.add_argument("out")
    ap.add_argument("--template", default=os.path.join(os.path.dirname(__file__), "..", "assets", "report-template.html"))
    ap.add_argument("--bucket-order"); ap.add_argument("--thumb-cache", default="thumbs_cache"); ap.add_argument("--standalone", action="store_true")
    a = ap.parse_args()
    A = json.load(open(a.analysis)); N = json.load(open(a.narrative)); T = open(a.template).read()
    if T.lstrip().startswith("<!--"): T = T.split("-->", 1)[1].lstrip()  # drop the template's instruction comment
    TH = Thumbs(a.thumb_cache)
    V = A["per_video"]; by_date = {}; by_uuid = {}
    for v in V: by_date.setdefault(v["date"], v); by_uuid[v["uuid"]] = v
    def vid(ref):
        if not ref: return None
        return by_uuid.get(ref) or by_date.get(ref)
    buckets = list(A["bucket_names"].keys())
    order = a.bucket_order.split(",") if a.bucket_order else sorted(buckets, key=lambda b: -A["buckets"][b]["n"])
    order = [b for b in order if b in buckets] + [b for b in buckets if b not in order]
    COL = {b: HOUSE[i % len(HOUSE)] for i, b in enumerate(order)}
    BN = A["bucket_names"]; SN = A["structure_names"]; LN = A["layout_names"]; HN = A.get("hook_style_names", {})
    eras = A["eras"]; ch = N["channel"]

    # ---------- video card ----------
    def card(v, cap=True, width=160, small=False):
        if not v: return ""
        badge = "bang" if v["out"] >= 8 else ("hit" if v["out"] >= 3 else "")
        c = f"<div class='cap'><b>{esc(dshort(v['date']))} · {fmt_views(v['views'])} views</b><span>{esc((v.get('hook') or '')[:110])}</span></div>" if cap else ""
        return (f"<a class='vid' href='{esc(v['url'])}' target='_blank' rel='noopener' title='{esc(v.get('hook') or '')}'>"
                f"<img src='{TH.data_uri(v, width)}' alt=''><span class='badge {badge}'>{outx(v['out'])}</span>{c}</a>")
    def thumb_td(v):
        return f"<span class='t'><a href='{esc(v['url'])}' target='_blank' rel='noopener'><img src='{TH.data_uri(v, 80)}' alt=''></a></span>" if v else ""
    def link_num(v, text=None):
        if not v: return ""
        return f"<a class='num' href='{esc(v['url'])}' target='_blank' rel='noopener'>{esc(text or (dshort(v['date']) + ' ' + outx(v['out'])))}</a>"

    # ---------- header ----------
    first, last = A["window"]["first"], A["window"]["last"]
    built = date.today().strftime("%b %-d, %Y")
    T = T.replace("{{TITLE}}", esc(f"{ch['title']} Strategy Film"))
    T = T.replace("{{EYEBROW}}", esc(f"Strategy Analysis Coach · {ch.get('workspace') or ch['title']}"))
    T = T.replace("{{H1}}", esc(f"How {ch['handle']} got here"))
    meta = [ch["handle"], ch["platform"], f"{ch['followers']} followers", f"built {built}", f"{dshort(first)} – {dshort(last)}, {last[:4]}",
            f"{A['window']['n_all']} posts · {A['window']['n_scored']} scored", f"{len(eras)} eras"]
    T = T.replace("{{META_LINE}}", "".join(f"<span>{esc(m)}</span>" for m in meta))
    T = T.replace("{{HEADLINE}}", esc(N["headline"]))

    # ---------- signature visual: SVG timeline ----------
    W, H = 1080, 600; L, R = 44, 1036
    d0 = date.fromisoformat(first); d1 = date.fromisoformat(last); span = max(1, (d1 - d0).days)
    def x(d): return L + (R - L) * (date.fromisoformat(d) - d0).days / span
    s = [f"<svg viewBox='0 0 {W} {H}' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' role='img' aria-label='Era timeline: eras as bands, outlier posts as dots, topic buckets as ribbons'>",
         "<style>text{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace}</style>"]
    # era bands + labels
    for i, e in enumerate(eras):
        x0 = x(e["start"]); x1 = x(e["end"]) + (R - L) / span
        s.append(f"<rect x='{x0:.1f}' y='0' width='{x1-x0:.1f}' height='{H}' fill='{'#FFFFFF' if i%2 else '#000000'}' opacity='{0.035 if i%2 else 0.12}'/>")
        nm = N["eras"].get(e["key"], {}).get("name", e["label"])
        s.append(f"<clipPath id='clip{i}'><rect x='{x0:.1f}' y='0' width='{x1-x0-4:.1f}' height='90'/></clipPath>")
        s.append(f"<g clip-path='url(#clip{i})'><text x='{x0+10:.1f}' y='22' font-size='13' font-weight='600' fill='#E6EBF5'>{esc(e['key'])} · {esc(nm)}</text>"
                 f"<text x='{x0+10:.1f}' y='38' font-size='10.5' fill='#94A3B8'>{esc(dshort(e['start']))} – {esc(dshort(e['end']))} · {e['n']} posts · {e['per_week']}/wk</text>"
                 f"<text x='{x0+10:.1f}' y='52' font-size='10.5' fill='#94A3B8'>{e['hit_rate']}% ≥3x · {e['bangers']} ≥8x · median {fmt_views(e['median_views'])} views</text></g>")
    # lanes
    DOT_TOP, DOT_BOT = 96, 268; RIB_TOP, RIB_BOT = 300, 520; AX = 548
    s.append(f"<text x='{L}' y='{DOT_TOP-14}' font-size='10' fill='#64748B' letter-spacing='1.5'>POSTS ≥3x · DOT SIZE = OUTLIER SCORE · COLOR = TOPIC BUCKET</text>")
    s.append(f"<text x='{L}' y='{RIB_TOP-12}' font-size='10' fill='#64748B' letter-spacing='1.5'>POSTS PER TWO WEEKS, BY TOPIC BUCKET</text>")
    for yy, lab in [(3, "3x"), (8, "8x"), (20, "20x"), (45, "45x")]:
        y = DOT_BOT - (DOT_BOT - DOT_TOP) * (math.log(yy) - math.log(3)) / (math.log(50) - math.log(3))
        s.append(f"<line x1='{L}' x2='{R}' y1='{y:.1f}' y2='{y:.1f}' stroke='#26324D' stroke-width='1' stroke-dasharray='2 4'/>")
        s.append(f"<text x='{R+4}' y='{y+3:.1f}' font-size='9' fill='#64748B'>{lab}</text>")
    # ribbons (streamgraph, centered)
    bins = A["bins"]; nb = len(bins); rib = A["ribbons14"]
    tot = [sum(rib[b][i] for b in order) for i in range(nb)]; mx = max(tot) or 1
    sc = (RIB_BOT - RIB_TOP) / mx; mid = (RIB_TOP + RIB_BOT) / 2
    bx = []
    for i, bd in enumerate(bins):
        nxt = date.fromisoformat(bins[i+1]) if i + 1 < nb else d1
        c = date.fromisoformat(bd) + (nxt - date.fromisoformat(bd)) / 2
        bx.append(L + (R - L) * min(max((c - d0).days, 0), span) / span)
    # pad the stream to both edges by repeating the first and last bin
    bx = [L] + bx + [R]; nb += 2
    rib = {b: [rib[b][0]] + rib[b] + [rib[b][-1]] for b in order}
    tot = [sum(rib[b][i] for b in order) for i in range(nb)]
    def smooth(pts):
        if len(pts) < 2: return ""
        d = f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i+1]; cx = (x0 + x1) / 2
            d += f" C{cx:.1f},{y0:.1f} {cx:.1f},{y1:.1f} {x1:.1f},{y1:.1f}"
        return d
    base = [mid - tot[i] * sc / 2 for i in range(nb)]
    lower = base[:]
    for b in order:
        upper = [lower[i] + rib[b][i] * sc for i in range(nb)]
        top = list(zip(bx, upper)); bot = list(zip(bx, lower))[::-1]
        path = smooth(top) + " L" + smooth(bot)[1:] + " Z"
        s.append(f"<path d='{path}' fill='{COL[b]}' opacity='0.78' stroke='#0F172A' stroke-width='1.5'><title>{esc(BN[b])}: {sum(rib[b])} posts</title></path>")
        # direct label at the widest bin
        wi = max(range(1, nb - 1), key=lambda i: rib[b][i]); ly = (lower[wi] + upper[wi]) / 2
        lx = min(max(bx[wi], L + 90), R - 90)
        if rib[b][wi] * sc >= 14:
            s.append(f"<text x='{lx:.1f}' y='{ly+4:.1f}' font-size='10.5' font-weight='600' fill='#0F172A' text-anchor='middle'>{esc(BN[b])}</text>")
        lower = upper
    # hit dots
    for v in sorted([v for v in V if v["out"] >= 3], key=lambda v: -v["out"]):
        y = DOT_BOT - (DOT_BOT - DOT_TOP) * (math.log(v["out"]) - math.log(3)) / (math.log(50) - math.log(3)); y = max(DOT_TOP + 6, min(DOT_BOT - 4, y))
        r = min(22, 4 + 2.4 * math.sqrt(v["out"])); col = COL.get(v["bucket"], "#94A3B8")
        stroke = "stroke='#FFFFFF' stroke-width='2'" if v["out"] >= 8 else "stroke='#0F172A' stroke-width='1'"
        s.append(f"<a xlink:href='{esc(v['url'])}' href='{esc(v['url'])}' target='_blank'><circle cx='{x(v['date']):.1f}' cy='{y:.1f}' r='{r:.1f}' fill='{col}' {stroke} opacity='0.92'>"
                 f"<title>{esc(dshort(v['date']))} · {outx(v['out'])} · {fmt_views(v['views'])} views · {esc(v.get('hook') or '')}</title></circle></a>")
        if v["out"] >= 8:
            s.append(f"<text x='{x(v['date']):.1f}' y='{y-r-6:.1f}' font-size='11' font-weight='600' fill='#E6EBF5' text-anchor='middle'>{outx(v['out'])}</text>")
    # switch markers
    for sw in A["switches"]:
        xs = x(sw["date"])
        s.append(f"<line x1='{xs:.1f}' x2='{xs:.1f}' y1='62' y2='{AX}' stroke='#F59E0B' stroke-width='1.5' stroke-dasharray='5 4'/>")
        s.append(f"<rect x='{xs-56:.1f}' y='60' width='112' height='18' rx='4' fill='#F59E0B'/>")
        s.append(f"<text x='{xs:.1f}' y='73' font-size='10' font-weight='600' fill='#0F172A' text-anchor='middle' letter-spacing='.5'>SWITCH · {esc(dshort(sw['date']).upper())}</text>")
    # axis
    s.append(f"<line x1='{L}' x2='{R}' y1='{AX}' y2='{AX}' stroke='#33405E'/>")
    m = date(d0.year, d0.month, 1)
    while m <= d1:
        if m >= d0:
            s.append(f"<line x1='{x(m.isoformat()):.1f}' x2='{x(m.isoformat()):.1f}' y1='{AX}' y2='{AX+6}' stroke='#33405E'/>")
            s.append(f"<text x='{x(m.isoformat())+4:.1f}' y='{AX+22}' font-size='11' fill='#94A3B8'>{m.strftime('%b %Y')}</text>")
        m = date(m.year + (m.month // 12), m.month % 12 + 1, 1)
    s.append(f"<text x='{L}' y='{AX+22}' font-size='11' fill='#94A3B8'>{esc(dshort(first))}</text>")
    s.append(f"<text x='{R}' y='{AX+22}' font-size='11' fill='#94A3B8' text-anchor='end'>{esc(dshort(last))}</text>")
    s.append("</svg>")
    T = T.replace("{{TIMELINE_SVG}}", "".join(s))
    T = T.replace("{{LEGEND}}", "".join(f"<span><i style='background:{COL[b]}'></i>{esc(BN[b])}</span>" for b in order) +
                  "<span><i class='dot'></i>dot = post ≥3x, white ring = ≥8x</span><span><i style='background:#F59E0B'></i>dashed = switch moment</span>")

    # ---------- era cards ----------
    ec = []
    for i, e in enumerate(eras):
        prev = eras[i-1] if i else None
        def cls(k, higher_is_better=True):
            if not prev or prev[k] is None or e[k] is None: return ""
            return ("up" if e[k] > prev[k] else "down") if higher_is_better else ("up" if e[k] < prev[k] else "down")
        nm = N["eras"].get(e["key"], {});
        ec.append(f"<div class='era' style='border-top-color:{HOUSE[(i*2)%5]}'><div class='eyebrow'>{esc(e['key'])} · {esc(dshort(e['start']))} – {esc(dshort(e['end']))} · {e['days']} days</div>"
                  f"<h3>{esc(nm.get('name', e['label']))}</h3><p class='small muted' style='margin:-4px 0 10px'>{esc(nm.get('sub',''))}</p><div class='stats'>"
                  f"<div class='stat'><div class='v'>{e['n']}</div><div class='l'>posts</div></div>"
                  f"<div class='stat'><div class='v'>{e['per_week']}</div><div class='l'>per week</div></div>"
                  f"<div class='stat'><div class='v {cls('median_views')}'>{fmt_views(e['median_views'])}</div><div class='l'>median views</div></div>"
                  f"<div class='stat'><div class='v {cls('hit_rate')}'>{e['hit_rate']}%</div><div class='l'>posts ≥3x</div></div>"
                  f"<div class='stat'><div class='v'>{e['bangers']}</div><div class='l'>≥8x</div></div>"
                  f"<div class='stat'><div class='v'>{e['median_out']}x</div><div class='l'>median outlier</div></div>"
                  f"<div class='stat'><div class='v'>{e['comments_per_1k']:.0f}</div><div class='l'>comments /1K</div></div>"
                  f"<div class='stat'><div class='v'>{fmt_views(e['total_comments'])}</div><div class='l'>comments</div></div></div></div>")
    T = T.replace("{{ERA_CARDS}}", "".join(ec))

    sc_ = []
    for sw in A["switches"]:
        nn = N["switches"].get(sw["date"], {}); b = vid(sw["before"]["uuid"]) if sw["before"] else None; af = vid(sw["after"]["uuid"]) if sw["after"] else None
        sc_.append(f"<div class='switch'><div class='eyebrow'>Switch · {esc(dshort(sw['date']))} · {esc(sw['from_era'])} → {esc(sw['to_era'])}</div><h3>{esc(nn.get('title','Switch'))}</h3>"
                   f"<div class='ba'><div><div class='tag'>before</div>{card(b)}</div><div class='arrow'>→</div><div><div class='tag'>after</div>{card(af)}</div></div>"
                   f"<p class='small'>{esc(nn.get('text',''))}</p></div>")
    T = T.replace("{{SWITCH_CARDS}}", "".join(sc_))

    # ---------- do this next ----------
    T = T.replace("{{NEXT_CARDS}}", "".join(f"<div class='card next'><div class='eyebrow'>Next · {i+1}</div><h3>{esc(n['t'])}</h3><p class='small'>{esc(n['b'])}</p></div>" for i, n in enumerate(N["next"])))

    # ---------- the film ----------
    reels = []
    for e in eras:
        nn = N["eras"].get(e["key"], {})
        beats = [("What they were making", "", nn.get("making")), ("What worked", "", nn.get("worked")), ("What didn't", "bad", nn.get("didnt")), ("What they doubled down on", "dd", nn.get("doubled"))]
        bh = "".join(f"<div class='beat'><div class='k {c}'>{esc(k)}</div><p>{esc(t)}</p></div>" for k, c, t in beats if t)
        ev = "".join(card(vid(d)) for d in nn.get("ev", [])[:4])
        reels.append(f"<div class='reel'><div class='head'><h3>{esc(e['key'])} · {esc(nn.get('name', e['label']))}</h3><span class='dates'>{esc(dshort(e['start']))} – {esc(dshort(e['end']))}</span>"
                     f"<div class='chips'><span class='chip'>{e['n']} posts</span><span class='chip'>{e['per_week']}/wk</span><span class='chip'>median {fmt_views(e['median_views'])}</span>"
                     f"<span class='chip {'up' if e['hit_rate']>=25 else 'down'}'>{e['hit_rate']}% ≥3x</span><span class='chip'>{e['bangers']} ≥8x</span></div></div>"
                     f"<div class='beats'>{bh}</div><div class='strip small'>{ev}</div></div>")
    T = T.replace("{{FILM}}", "".join(reels))
    T = T.replace("{{SIX}}", "".join(f"<div class='q'><div><h4>{i+1}. {esc(q['q'])}</h4><p>{esc(q['a'])}</p></div><div class='strip'>{''.join(card(vid(d), cap=False, width=80) for d in q.get('ev', [])[:3])}</div></div>" for i, q in enumerate(N["six"])))

    # ---------- formulas ----------
    rows = []
    for f in A["formulas"]:
        st_ = f["status"]; cls_ = "dead" if st_ == "dead" else ""
        dots = "".join(f"<b class='{'hot' if f['per_era_hits'].get(e['key']) else ('on' if f['per_era'].get(e['key']) else '')}' title='{esc(e['key'])}: {f['per_era'].get(e['key'],0)} posts'></b>" for e in eras)
        rows.append(f"<tr class='{cls_}'><td><span class='swatch' style='display:inline-block;width:10px;height:10px;border-radius:2px;background:{COL.get(f['bucket'],'#94A3B8')};margin-right:8px;vertical-align:-1px'></span>{esc(f['label'])}</td>"
                    f"<td class='num'>{f['n']}</td><td class='num'>{f['median_out']}x</td><td class='num'>{f['hit_rate']}%</td><td class='num'>{f['max_out']}x</td>"
                    f"<td class='best'>{thumb_td(vid(f['best']['uuid']))}{link_num(vid(f['best']['uuid']))}</td><td><span class='erad'>{dots}</span></td><td><span class='ws {st_.replace(' ','-') if st_!='tried once' else 'tried'}'>{esc(st_)}</span></td></tr>")
    T = T.replace("{{FORMULAS}}", "<div class='tw'><table><thead><tr><th>Formula (topic · structure · layout)</th><th class='num'>Posts</th><th class='num'>Median</th><th class='num'>≥3x</th><th class='num'>Best</th><th>Best video</th><th>Eras</th><th>Status</th></tr></thead><tbody>" + "".join(rows) + "</tbody></table></div>"
                  "<p class='small muted' style='margin-top:10px'>Working = 3+ posts and ≥30% above 3x · Flat = 3+ posts, some above 3x but under 30% · Dead = 4+ posts, none above 3x, median under 1x · One-hit = under 3 posts, one above 3x. Era squares: grey = ran, green = at least one post ≥3x.</p>")

    # ---------- topics ----------
    tc = []
    for b in order:
        row = A["buckets"][b]; rb = A["ribbons"][b]
        mx_n = max(x_["n"] for x_ in row["per_era"].values()) or 1
        cols = "".join(f"<div class='col'><div class='bars'><i style='height:{max(2, 36*(pe['n']-sum(1 for _ in []))/mx_n):.0f}px' title='{pe['n']} posts'></i><i class='hit' style='height:{max(0, 36*(round(pe['n']*(pe['hit_rate'] or 0)/100))/mx_n):.0f}px' title='posts ≥3x'></i></div><span>{esc(e['key'])} · {pe['n']} · {pe['hit_rate'] if pe['hit_rate'] is not None else '–'}%</span></div>"
                       for e in eras for pe in [row["per_era"][e["key"]]])
        still = rb["last"] >= (date.fromisoformat(last) - __import__('datetime').timedelta(days=21)).isoformat()
        flow = f"First post {dshort(rb['first'])} · " + (f"still running (last {dshort(rb['last'])})" if still else f"last post {dshort(rb['last'])} — exited")
        tc.append(f"<div class='topic'><div><h3><span class='swatch' style='background:{COL[b]}'></span>{esc(BN[b])}</h3>"
                  f"<div class='row'><div><div class='v'>{row['n']}</div><div class='l'>posts</div></div><div><div class='v' style='color:{'var(--open)' if (row['hit_rate'] or 0)>=25 else 'var(--text)'}'>{row['hit_rate']}%</div><div class='l'>≥3x</div></div><div><div class='v'>{row['median_out']}x</div><div class='l'>median</div></div></div>"
                  f"<div class='mini'>{cols}</div><p class='flow'>{esc(flow)} · {row['comments_per_1k']:.0f} comments per 1K views</p></div>"
                  f"<div>{card(vid(row['best']['uuid']), cap=False)}<p class='small muted' style='margin-top:6px;font-size:11px'>best: {link_num(vid(row['best']['uuid']))}</p></div></div>")
    T = T.replace("{{TOPICS}}", "".join(tc))

    # ---------- hooks ----------
    hk = ["<div class='tw'><table><thead><tr><th>Opening move</th>" + "".join(f"<th>{esc(e['key'])} posts · ≥3x · median</th>" for e in eras) + "<th>Best</th></tr></thead><tbody>"]
    for k, row in sorted(A["hook_styles"].items(), key=lambda kv: -kv[1]["n"]):
        cells = "".join(f"<td class='num'>{pe['n']} · {pe['hit_rate'] if pe['hit_rate'] is not None else '–'}% · {pe['median_out'] if pe['median_out'] is not None else '–'}x</td>" for e in eras for pe in [row["per_era"][e["key"]]])
        hk.append(f"<tr><td>{esc(HN.get(k, HOOK_KEY.get(k, k)))}<span class='small muted'> · {row['n']} posts</span></td>{cells}<td class='best'>{thumb_td(vid(row['best']['uuid']))}{link_num(vid(row['best']['uuid']))}</td></tr>")
    hk.append("</tbody></table></div>")
    # same topic, different promise: bucket with biggest era-to-era hit-rate jump
    best_jump = None
    for b in order:
        pe = A["buckets"][b]["per_era"]; ks = [e["key"] for e in eras]
        for i in range(1, len(ks)):
            p0, p1 = pe[ks[i-1]], pe[ks[i]]
            if p0["n"] >= 3 and p1["n"] >= 3 and p0["hit_rate"] is not None and p1["hit_rate"] is not None:
                j = p1["hit_rate"] - p0["hit_rate"]
                if best_jump is None or j > best_jump[0]: best_jump = (j, b, ks[i-1], ks[i])
    if best_jump and best_jump[0] >= 25:
        j, b, k0, k1 = best_jump
        lo = sorted([v for v in V if v["bucket"] == b and v["era"] == k0], key=lambda v: v["out"])[len([v for v in V if v["bucket"] == b and v["era"] == k0]) // 2]
        hi = A["buckets"][b]["per_era"][k1]["best"]; hiv = vid(hi["uuid"])
        hk.append(f"<h3 style='margin-top:22px'>Same topic, different promise: {esc(BN[b])}</h3><p class='small muted'>{esc(k0)} → {esc(k1)}: hit rate {A['buckets'][b]['per_era'][k0]['hit_rate']}% → {A['buckets'][b]['per_era'][k1]['hit_rate']}%, median {A['buckets'][b]['per_era'][k0]['median_out']}x → {A['buckets'][b]['per_era'][k1]['median_out']}x. The subject did not change; the opening line did.</p>"
                  f"<div class='pair'><div class='side'>{card(lo, cap=False, width=80)}<div><div class='eyebrow'>{esc(k0)} · typical · {outx(lo['out'])}</div><blockquote>“{esc(lo.get('hook') or '')}”</blockquote></div></div>"
                  f"<div class='side win'>{card(hiv, cap=False, width=80)}<div><div class='eyebrow'>{esc(k1)} · best · {outx(hiv['out'])}</div><blockquote>“{esc(hiv.get('hook') or '')}”</blockquote></div></div></div>")
    # phrase wear-out sparklines
    sp = []
    for label, posts in A["phrases"].items():
        if len(posts) < 3: continue
        w, h = 240, 70; pad = 8; n = len(posts)
        xs = [pad + (w - 2 * pad) * i / max(1, n - 1) for i in range(n)]
        def yy(o): return h - pad - (h - 2 * pad) * (math.log(max(o, 0.3)) - math.log(0.3)) / (math.log(50) - math.log(0.3))
        pts = " ".join(f"{xs[i]:.1f},{yy(p['out']):.1f}" for i, p in enumerate(posts))
        y3 = yy(3)
        dots = "".join(f"<a href='{esc(p['url'])}' target='_blank'><circle cx='{xs[i]:.1f}' cy='{yy(p['out']):.1f}' r='4' fill='{'#34D399' if p['out']>=3 else '#94A3B8'}' stroke='#0F172A'><title>{esc(dshort(p['date']))} · {outx(p['out'])} · {esc(p['hook'][:80])}</title></circle></a>" for i, p in enumerate(posts))
        peak = max(posts, key=lambda p: p["out"]); lastp = posts[-1]
        sp.append(f"<div class='spark'><div class='eyebrow'>{esc(label)}</div><svg viewBox='0 0 {w} {h}' xmlns='http://www.w3.org/2000/svg'><line x1='{pad}' x2='{w-pad}' y1='{y3:.1f}' y2='{y3:.1f}' stroke='#26324D' stroke-dasharray='2 3'/><text x='{w-pad}' y='{y3-3:.1f}' font-size='8' fill='#64748B' text-anchor='end' font-family='JetBrains Mono,monospace'>3x</text><polyline points='{pts}' fill='none' stroke='#94A3B8' stroke-width='1.5'/>{dots}</svg>"
                  f"<p class='small muted' style='margin-top:6px'>{n} uses · {esc(dshort(posts[0]['date']))} → {esc(dshort(lastp['date']))} · peak {outx(peak['out'])} on {esc(dshort(peak['date']))} · last {outx(lastp['out'])}</p></div>")
    if sp: hk.append("<h3 style='margin-top:22px'>How long a signature phrase lasts</h3><p class='small muted'>Each dot is one use, in order; the dashed line is 3x. Green dots cleared it.</p><div class='sparks'>" + "".join(sp) + "</div>")
    T = T.replace("{{HOOKS}}", "".join(hk))

    # ---------- script tactics ----------
    sc2 = ["<h3>The belief every big post flips</h3><p class='small muted' style='margin-bottom:10px'>Common belief (struck through) → the reality the video sells, for every post ≥8x.</p><div class='flips'>"]
    for hct in [h for h in A["hits"] if h["out"] >= 8]:
        v = vid(hct["uuid"])
        sc2.append(f"<div class='flip'><a href='{esc(v['url'])}' target='_blank' rel='noopener'><img src='{TH.data_uri(v, 80)}' alt=''></a><div><div class='who'>{esc(dshort(v['date']))} · {outx(v['out'])} · {fmt_views(v['views'])} views</div><div class='they'>{esc(hct.get('belief') or '')}</div><div class='you'>{esc(hct.get('reality') or '')}</div></div></div>")
    sc2.append("</div>")
    du = A["duration"]
    sc2.append(f"<h3 style='margin-top:22px'>Length is not the lever</h3><p class='small' style='max-width:72ch'>Posts ≥3x run a median of {du['hits']:.0f} seconds; the rest {du['non_hits']:.0f}. By bucket: " +
               ", ".join(f"{esc(BN[b])} {du['by_bucket'][b]:.0f}s" for b in order if du["by_bucket"].get(b)) + ". By era: " + ", ".join(f"{esc(e['key'])} {du['by_era'][e['key']]:.0f}s" for e in eras if du["by_era"].get(e["key"])) + ".</p>")
    # CTA table
    sc2.append("<h3 style='margin-top:22px'>How the call to action moved</h3><div class='tw'><table><thead><tr><th>Era</th><th class='num'>Posts</th><th class='num'>With keyword</th><th class='num'>Says “free”</th><th class='num'>“If you want…”</th><th class='num'>Comments /1K</th><th>Deliverable mix (posts · ≥3x)</th></tr></thead><tbody>")
    for e in eras:
        c = A["cta"][e["key"]]; dl = A["deliverables"]
        mix = " · ".join(f"{esc(k)} {dl[k]['per_era'][e['key']]['n']}/{dl[k]['per_era'][e['key']]['hit_rate']}%" for k in sorted(dl, key=lambda k: -dl[k]["n"]) if dl[k]["per_era"][e["key"]]["n"])
        sc2.append(f"<tr><td>{esc(e['key'])}</td><td class='num'>{c['n']}</td><td class='num'>{c['with_keyword']}</td><td class='num'>{c['free']}</td><td class='num'>{c['if_you_want']}</td><td class='num'>{c['comments_per_1k']:.1f}</td><td class='small'>{mix}</td></tr>")
    sc2.append("</tbody></table></div>")
    if A.get("keyword_reuse_all"): sc2.append("<p class='small muted' style='margin-top:8px'>Comment keywords reused 3+ times: " + ", ".join(f"{esc(k)} ×{c}" for k, c in A["keyword_reuse_all"]) + ". Comments ÷ 2 ≈ leads on a keyword CTA.</p>")
    T = T.replace("{{SCRIPT}}", "".join(sc2))

    # ---------- formats & packaging ----------
    fm = ["<h3>Structures by era</h3><div class='tw'><table><thead><tr><th>Structure</th>" + "".join(f"<th>{esc(e['key'])} posts · ≥3x · median</th>" for e in eras) + "<th>Best</th></tr></thead><tbody>"]
    for k, row in sorted(A["structures"].items(), key=lambda kv: -kv[1]["n"]):
        cells = "".join(f"<td class='num'>{pe['n']} · {pe['hit_rate'] if pe['hit_rate'] is not None else '–'}% · {pe['median_out'] if pe['median_out'] is not None else '–'}x</td>" for e in eras for pe in [row["per_era"][e["key"]]])
        fm.append(f"<tr><td>{esc(SN.get(k,k))}<a class='info' href='#key-{esc(k)}' title='plain-English explainer'>i</a><span class='small muted'> · {row['n']} posts</span></td>{cells}<td class='best'>{thumb_td(vid(row['best']['uuid']))}{link_num(vid(row['best']['uuid']))}</td></tr>")
    fm.append("</tbody></table></div>")
    lay = ", ".join(f"{esc(LN.get(k,k))} ({row['n']} posts)" for k, row in A["layouts"].items())
    fm.append(f"<p class='small muted' style='margin-top:10px'>Layout: {lay}. " + ("One layout for every post — it was never a variable on this channel." if len(A["layouts"]) == 1 else "") + "</p>")
    if A.get("panels"):
        fm.append("<h3 style='margin-top:22px'>The title card, by type</h3><p class='small muted' style='margin-bottom:10px'>The top half of every post is a second hook. Read off the thumbnails.</p><div class='tw'><table><thead><tr><th>Card type</th><th class='num'>Posts</th><th class='num'>≥3x</th><th class='num'>Median</th>" + "".join(f"<th>{esc(e['key'])}</th>" for e in eras) + "<th>Best example</th></tr></thead><tbody>")
        for k, row in sorted(A["panels"].items(), key=lambda kv: -(kv[1]["hit_rate"] or 0)):
            cells = "".join(f"<td class='num'>{pe['n']} · {pe['hit_rate'] if pe['hit_rate'] is not None else '–'}%</td>" for e in eras for pe in [row["per_era"][e["key"]]])
            nm, what = PANEL_KEY.get(k, (k, ""))
            cls_ = "dead" if row["n"] >= 6 and row["hit_rate"] == 0 else ""
            fm.append(f"<tr class='{cls_}'><td>{esc(nm)}<a class='info' href='#key-{esc(k)}'>i</a><br><span class='small muted'>{esc(what)}</span></td><td class='num'>{row['n']}</td><td class='num'>{row['hit_rate']}%</td><td class='num'>{row['median_out']}x</td>{cells}<td class='best'>{thumb_td(vid(row['best']['uuid']))}{link_num(vid(row['best']['uuid']))}</td></tr>")
        fm.append("</tbody></table></div>")
    T = T.replace("{{FORMATS}}", "".join(fm))

    # ---------- hidden layer ----------
    T = T.replace("{{HIDDEN}}", "".join(f"<div class='hid'><div><div class='eyebrow' style='color:var(--violet)'>Finding {i+1}</div><h4>{esc(h['h'])}</h4><p class='b'>{esc(h['b'])}</p><p class='so'><b>So what</b>{esc(h['so'])}</p></div>"
                                        f"<div class='strip'>{''.join(card(vid(d), cap=False, width=80) for d in h.get('ev', [])[:4])}</div></div>" for i, h in enumerate(N["hidden"])))
    # ---------- steal ----------
    T = T.replace("{{STEAL}}", "".join(f"<div class='card steal'><div class='eyebrow'>Steal · {i+1}</div><h3>{esc(s_['move'])}</h3><p class='small'>{esc(s_['why'])}</p><div class='strip small'>{card(vid(s_['ev']))}{card(vid(s_.get('ev2')))}</div></div>" for i, s_ in enumerate(N["steal"])))

    # ---------- taxonomy key ----------
    keys = []
    for k, row in A["structures"].items():
        nm, what, ex = STRUCT_KEY.get(k, (SN.get(k, k), "", "")); v = vid(row["best"]["uuid"])
        keys.append(f"<div class='key' id='key-{esc(k)}'><div><div class='k'>structure</div><h4>{esc(nm)}</h4><div>{esc(what)}</div><div class='ex'>{esc(ex)}</div><div class='small muted' style='margin-top:4px'>Specimen: {link_num(v, dshort(v['date']) + ' · ' + outx(v['out']))}</div></div><a href='{esc(v['url'])}' target='_blank'><img src='{TH.data_uri(v, 80)}' alt=''></a></div>")
    for k, row in A["layouts"].items():
        nm, what = LAYOUT_KEY.get(k, (LN.get(k, k), "")); v = vid(row["best"]["uuid"])
        keys.append(f"<div class='key' id='key-{esc(k)}'><div><div class='k'>layout</div><h4>{esc(nm)}</h4><div>{esc(what)}</div><div class='ex'>Opens on the face and the card at once; the card carries the promise in five words.</div><div class='small muted' style='margin-top:4px'>Specimen: {link_num(v, dshort(v['date']) + ' · ' + outx(v['out']))}</div></div><a href='{esc(v['url'])}' target='_blank'><img src='{TH.data_uri(v, 80)}' alt=''></a></div>")
    for k, row in A.get("panels", {}).items():
        nm, what = PANEL_KEY.get(k, (k, "")); v = vid(row["best"]["uuid"])
        keys.append(f"<div class='key' id='key-{esc(k)}'><div><div class='k'>title card</div><h4>{esc(nm)}</h4><div>{esc(what)}</div><div class='small muted' style='margin-top:4px'>Specimen: {link_num(v, dshort(v['date']) + ' · ' + outx(v['out']))}</div></div><a href='{esc(v['url'])}' target='_blank'><img src='{TH.data_uri(v, 80)}' alt=''></a></div>")
    T = T.replace("{{TAXONOMY}}", "".join(keys))

    parts = [p.strip() for p in N["mantra"].split(". ") if p.strip()]
    mantra = " ".join(("<em>" + esc(p.rstrip(".")) + ".</em>") if i == 1 else esc(p.rstrip(".")) + "." for i, p in enumerate(parts))
    T = T.replace("{{MANTRA}}", mantra)
    T = T.replace("{{BUILT}}", esc(f"Strategy Analysis Coach · {ch['handle']} · built {built} · {A['window']['n_scored']} posts scored, {len(A['window']['too_young'])} too young to score · every number links to the post it came from"))

    if a.standalone:
        T = "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" + T.split("<style>", 1)[0] + "<style>" + T.split("<style>", 1)[1].replace("</style>", "</style></head><body>", 1) + "</body></html>"
    open(a.out, "w").write(T)
    size = os.path.getsize(a.out)
    print(f"wrote {a.out} · {size/1024:.0f} KB · {len(eras)} eras · {len(N['hidden'])} hidden findings · {len(N['steal'])} steals · thumbnails embedded from {a.thumb_cache}")

if __name__ == "__main__":
    main()
