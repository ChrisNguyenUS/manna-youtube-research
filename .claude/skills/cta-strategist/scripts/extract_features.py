#!/usr/bin/env python3
"""Tag every video's lead-magnet CTA with structural + wording features.

Usage: python3 extract_features.py videos.json rows.json

Input: videos.json from prepare_input.py.
Output: rows.json — one row per video with metrics (leads = comments/2, conv = leads per 1K views)
        and ~25 CTA features. Read the FEATURES table at the bottom of this file for definitions.

Which text is "the script"?
  * transcript (from Sandcastles deep analysis) when present — that's what viewers heard
  * otherwise the caption — some creators paste the full script as the caption
  Caption CTA lines that don't appear in the transcript are appended, because the
  ManyChat keyword often lives only in the caption.
"""
import json, re, sys
from collections import Counter

Q = '“”"\'‘’'
KW_RE = re.compile(r'\bcomment\s*[' + Q + r']\s*([^' + Q + r']+?)\s*[' + Q + r']', re.I)
KW_BARE = re.compile(r'\bcomment\s+(?:the word\s+)?([A-Za-z0-9]{2,15})\b(?=\s+(?:and|for|to|so|below|now|i|if|right)\b)', re.I)
CTA_LINE = re.compile(r'\bcomment\b', re.I)
POWER = ['cracked', 'god tier', 'god-tier', 'killer', 'insane', 'secret', 'private', 'proven', 'viral', 'instantly',
         'level up', 'never', 'free', 'deep dive', 'deeper', 'top', 'best', 'winning', 'entire', 'whole', 'full',
         'exact', 'exactly', 'personal', 'personally', '10x', 'pop off', 'goldmine', 'master', 'everything', 'all',
         'ultimate', 'complete', 'step by step', 'step-by-step', 'cheat sheet', 'blueprint', 'swipe']
TOTALITY = ['entire', 'whole', 'full ', 'everything', ' all ', 'all of', 'complete']
MAGNET_MAP = [
    ('claude_skill', r'skill file|claude skill|plugin|\bclaude\b|\bgpt\b|custom gpt|prompt pack'),
    ('video', r'\bvideo\b|deep dive|deeper dive|deeper breakdown|deep-dive|walkthrough|masterclass|watch it|full breakdown|training|webinar|tutorial'),
    ('database', r'database|library|swipe file|vault'),
    ('doc_guide', r'\bdoc\b|guide|playbook|handbook|\bpdf\b|template|checklist|cheat ?sheet|blueprint|worksheet|ebook|e-book'),
    ('links_setup', r'\blinks?\b|instructions|set.?up|prompt|access|download'),
    ('system', r'system|framework|strategy|method'),
    ('offer_1on1', r'1:1|1 on 1|more info|work with me|book a call|apply'),
]

def clean_lines(t):
    lines = [l.strip() for l in re.split(r'[\n ]+', t or '') if l.strip()]
    out = []
    for l in lines:
        if re.match(r'^#', l) or re.match(r'^follow @', l, re.I) or re.match(r'^(grow faster|subscribe|link in bio)', l, re.I):
            continue
        out.append(l)
    return out

def is_cta(l): return bool(CTA_LINE.search(l) and (KW_RE.search(l) or KW_BARE.search(l)))

def classify_magnet(txt):
    t = txt.lower()
    for name, rx in MAGNET_MAP:
        if re.search(rx, t): return name
    if re.search(r'whole thing|send it|send that|it through|it to you|it over|all of them|them all|send you this', t): return 'unspecified_it'
    return 'other'

def keywords(text):
    return [m.lower().strip() for m in KW_RE.findall(text or '')] + [m.lower() for m in KW_BARE.findall(text or '')]

def build(v):
    cap_lines = clean_lines(v.get('caption', ''))
    tr_lines = clean_lines(v.get('transcript', ''))
    script_visible = bool(tr_lines) or len(cap_lines) >= 8
    body = list(tr_lines) if tr_lines else list(cap_lines)
    cap_cta = [l for l in cap_lines if is_cta(l)]
    if tr_lines:
        tr_txt = ' '.join(tr_lines).lower()
        for l in cap_cta:
            if not any(k in tr_txt for k in keywords(l)):
                body.append(l)  # keyword lives only in the caption
    n = len(body)
    cta_idx = [i for i, l in enumerate(body) if is_cta(l)]
    kws = keywords(v.get('caption', '')) + keywords(v.get('transcript', ''))
    kw = Counter(kws).most_common(1)[0][0] if kws else None
    cap_kw = set(keywords(v.get('caption', ''))); tr_kw = set(keywords(v.get('transcript', '')))
    kw_mismatch = bool(cap_kw and tr_kw and not (cap_kw & tr_kw))
    has_cta = bool(cta_idx)
    block = []
    if has_cta:
        last = cta_idx[-1]; block = [body[last]]; j = last - 1
        while j >= 0 and last - j <= 3 and not is_cta(body[j]) and re.search(
            r'put together|i built|i actually|i made|i created|i just published|to make (this|hooks|it|your life) easier|to help you|to help build|now to (help|enable|make)|feed (it|this) into|best database|so to make', body[j], re.I):
            block.insert(0, body[j]); j -= 1
        if last + 1 < n and not is_cta(body[last + 1]) and re.search(r'pages|examples|template|everything|need|inside', body[last + 1], re.I):
            block.append(body[last + 1])
    block_txt = ' '.join(block); bl = block_txt.lower()
    final_line = body[cta_idx[-1]] if has_cta else ''; fl = final_line.lower()
    if not has_cta: placement = 'none'
    elif not script_visible: placement = 'caption_only'
    else:
        early = cta_idx[0] <= 2; late = cta_idx[-1] >= n - 4
        placement = 'bookend' if (early and late) else 'hook_only' if early else 'end_only' if late else 'mid'
    kw_caps = bool(kw) and any(m.isupper() and len(m) > 1 for m in KW_RE.findall(v.get('caption', '')))
    body_wo = ' '.join(l for i, l in enumerate(body) if i not in cta_idx).lower()
    kw_in_body = bool(kw) and bool(re.search(r'\b' + re.escape(kw.rstrip('s')), body_wo))
    numbers = re.findall(r'\b\d+\b', block_txt)
    send_style = ('through' if 'through' in fl else 'to_you' if re.search(r'send (it )?to you|send you|dm you|message you', fl)
                  else 'over' if 'send it over' in fl else 'get' if re.search(r'\bget\b|access|grab', fl)
                  else 'for' if re.search(r'comment [' + Q + r'][^' + Q + r']+[' + Q + r'] for', fl) else 'share' if 'share' in fl else 'other')
    leads = v['comments'] / 2
    conv = leads / v['views'] * 1000 if v['views'] else 0
    return dict(
        uuid=v['uuid'], date=v['date'], url=v['url'], sc_url=v.get('sc_url', ''), thumb=v.get('thumb', ''),
        views=v['views'], likes=v.get('likes', 0), comments=v['comments'], outlier=v.get('outlier', 0),
        hook_cat=v.get('hook_cat', ''), format_cat=v.get('format_cat', ''), topic=v.get('topic', ''),
        hook_line=body[0] if body else '', leads=leads, conv=round(conv, 2), script_visible=script_visible,
        has_cta=has_cta, cta_block=block_txt, final_line=final_line, all_cta_lines=[body[i] for i in cta_idx],
        script='\n'.join(body), source=v.get('source', 'sandcastles'),
        mentions=len(cta_idx), placement=placement, kw=kw, kw_len=len(kw) if kw else 0, kw_caps=kw_caps,
        kw_in_body=kw_in_body, kw_mismatch=kw_mismatch, kw_is_number=bool(kw) and kw.isdigit(),
        magnet=classify_magnet(block_txt) if has_cta else 'none',
        magnet_named=has_cta and classify_magnet(block_txt) not in ('unspecified_it', 'other'),
        for_free='free' in bl, quantified=bool(numbers),
        tease_remainder=bool(re.search(r'other \d+|the other|last \d+|\d+ more|remaining|the rest', bl)),
        totality=any(w in bl for w in TOTALITY), exact=bool(re.search(r'\bexact', bl)),
        possessive_my=bool(re.search(r'\bmy\b|\bour\b', bl)),
        effort=bool(re.search(r'i (put together|built|made|created|actually built|spent)', bl)),
        benefit=bool(re.search(r'so you|so that you|to help you|make your life|easier for you|never have to|never get', bl)),
        conditional=bool(re.search(r'^(and )?if you', fl)), imperative=fl.startswith('comment'),
        with_examples='example' in bl, ai_feed=bool(re.search(r'feed (this|it) into|any ai|claude|chatgpt|\bgpt\b', bl)),
        send_style=send_style, cta_words=len(block_txt.split()), final_line_words=len(final_line.split()),
        cta_lines=len(block), power_words=[w for w in POWER if w in bl], power_count=sum(1 for w in POWER if w in bl),
        script_words=len(' '.join(body).split()), script_lines=n,
    )

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    vids = json.load(open(src))
    rows = [build(v) for v in vids]
    json.dump(rows, open(dst, 'w'), indent=1, ensure_ascii=False)
    main = [r for r in rows if r['has_cta'] and r['script_visible']]
    print(f'{len(rows)} videos · {sum(r["has_cta"] for r in rows)} with a keyword CTA · {len(main)} analyzable (CTA + visible script) · {sum(1 for r in rows if not r["has_cta"])} no-CTA controls')
    print('placement:', dict(Counter(r['placement'] for r in rows)))
    print('magnet:', dict(Counter(r['magnet'] for r in rows)))

# FEATURES (all measured on the closing CTA block unless noted)
#   mentions        how many lines in the script contain a keyword CTA
#   placement       bookend / end_only / hook_only / mid / caption_only / none
#   kw*             the keyword itself, length, ALL CAPS in caption, also-a-topic-word, caption≠spoken mismatch
#   magnet          what is promised: video, doc_guide, database, claude_skill, links_setup, system, offer_1on1, unspecified_it, other
#   for_free, quantified, tease_remainder ("the other 7"), totality (entire/whole/full/all), exact, possessive_my,
#   effort ("I built"), benefit ("so you can"), conditional ("If you want…"), imperative ("Comment X…"), with_examples, ai_feed
#   send_style      through / to_you / over / get / for / share / other   (the delivery verb on the final line)
#   cta_words, final_line_words, power_words, power_count, script_words, script_lines
