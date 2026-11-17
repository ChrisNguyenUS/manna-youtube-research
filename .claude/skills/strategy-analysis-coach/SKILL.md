---
name: strategy-analysis-coach
description: >-
  Tell the story of how a social channel got where it is: the eras it went
  through, what it tried, why that wasn't working, what it changed at each
  switch moment, what worked after, what it doubled down on, and the common
  thread that keeps working. Pulls every post in a window (default 12 months,
  offer 6) via the Sandcastles MCP, finds the inflection points from free data
  first, then reads the analyzed videos around the switches and renders a
  house-style HTML report led by an era timeline (eras as bands, switch moments
  with before/after thumbnails, topic buckets as ribbons). Use whenever someone
  asks "how did this creator get here", "what changed on this channel", "what
  did they try before it worked", "walk me through their strategy over time",
  "why did their channel take off / cool down", "what should I steal from their
  journey", or wants a channel's history rather than a snapshot of what's working
  now — even without saying "Sandcastles". Requires the Sandcastles MCP — walks
  them through sandcastles.ai/mcp if it isn't connected. Deep analysis costs 1
  credit per new video: this skill spends nothing until it has shown the eras it
  sees from free data and the exact credit bill, and it only reads the pages of
  the diary around the days the handwriting changed (expect 60–80 credits for
  12 months, 40–50 for 6).
---

# Strategy Analysis Coach

One question, answered with a channel's own history: **how did this person get
here?** Not "what's working now" (that's the channel diagnostic, the snapshot).
This is the film: what they tried, why it wasn't working, what they changed, what
worked after the change, what they doubled down on, and the thread that keeps it
working.

The mental model: a creator's channel is a diary, and every post is a page. You
don't read every page. You find the days the handwriting changed — the switch
moments — and read the pages around them. Everything else you get from the free
metadata: views, outlier score, dates, captions, thumbnails.

Refer to Sandcastles tools by their plain names (`ping`, `list_workspaces`,
`switch_workspace`, `channel_recap`, `search_my_videos`, `add_channels_to_watchlist`,
`analyze_video`, `get_video_details`, `current_org_usage`). The MCP's server prefix
differs per user — never hardcode one.

Read `references/synthesis-guide.md` before writing the film; it has the judgment
calls (naming eras, the six questions, what counts as a hidden finding, the layout
check, the remix rule). `references/taxonomy-map.md` maps Sandcastles' labels onto
the shared taxonomy used by the sibling workflows.

---

## Step 0 — Is Sandcastles connected?

Check for the Sandcastles tools or call `ping`.

**Connected** → note the active workspace and go to Step 1.

**Not connected** → stop and onboard in one message:

> To run this I need Sandcastles connected to Claude — it reads the channel's
> posts, outlier scores, thumbnails and deep analyses, and the timeline only
> works on that data. Setup takes a couple of minutes: go to **sandcastles.ai/mcp**
> and follow the instructions, then come back and say "ready".

No workarounds: no pasted captions, no scraping, no memory. Outlier scores have
to be comparable or the eras aren't real.

**Connected but the channel lives in another workspace** → `list_workspaces`,
confirm, `switch_workspace` (say that it changes their web session too).

---

## Step 1 — Intake and the free pull (costs nothing)

You need a **channel** (handle or URL) and a **window**. Default 12 months; offer
6 if they want a tighter film. Don't re-ask what they already told you.

1. `channel_recap` with the handle — its job here is the **channel UUID** (and
   the title). If it returns several platforms, pick the one they named; ask only
   if they didn't. If the channel isn't in Sandcastles, `add_channels_to_watchlist`;
   a `submitted` result means scraping is in progress — wait a few minutes.
2. `search_my_videos` filtered to that UUID: `lookback_days` = window, `min_views 0`,
   `min_engagement 0`, `min_outlier_score 0`, `limit 100`, `sort published_at`.
   Paginate on `next_cursor` until null. Save every page **verbatim** to
   `raw/pageN.json` (`cp` the harness file, or write it exactly as received).
   Never retype or summarize a page — every dropped post is a lost data point.
3. Check the oldest post. If Sandcastles' history is shorter than the window,
   say so plainly ("Sandcastles has this channel from Jan 29, so the '12 months'
   is really 7.7") and carry on with what exists.
4. Screening, before anything is counted: drop posts with engagement under 2%
   whose views sit far above the channel's median (brand deals, boosts); flag
   anything off-niche and ask if unsure; keep posts younger than 3 days out of
   the performance math. Report the counts.
5. Tell them the shape in two sentences: how many posts, the date range, how many
   already analyzed (free), how many not.

```bash
S=<this skill's folder>/scripts
python3 $S/prepare_input.py --raw-dir raw --details-dir details --out videos.json --since <window start>
```

If the user says to ignore a stretch (a podcast-clip prelude, a dormant year),
set `--since` to where the real channel starts and say you did.

---

## Step 2 — Era detection from FREE data (still costs nothing)

Run the detector and read its table before anything else:

```bash
python3 $S/detect_eras.py videos.json --out eras.json
```

It prints the monthly table (posts, cadence, median views, median outlier, hit
rate ≥3x, bangers ≥8x, comments, caption length), the rolling 12-post hit rate,
the least-squares changepoints on log(outlier score) for 2 and 3 segments, any
silence of 21+ days, numbered-series runs and repeated opening lines.

Then **show the user the eras you see** — dates, posts, hit rate, median views,
one line on what the captions say changed — **before spending anything**. Name
each era after what they were making, not after the numbers ("Two lanes found",
not "the good months"). Rules:

- If the changepoint gain is under ~3% and the rolling line is flat, say the
  window is one era. Don't invent a switch.
- A boundary the captions explain (a series starting, a new product, a silence)
  beats a boundary the math found by one post. Move it and say why.
- Rename the placeholder labels in `eras.json` before running `analyze.py`.

---

## Step 3 — The credit plan, then the bill (the only step that costs)

Free metadata tells you *when* things changed. The analyzed payloads tell you
*what* changed (hook wording, structure, layout, belief flipped, CTA). Select
the smallest set that answers the six questions:

- every post ≥3x in the window (the hits are the plot),
- the top, median and bottom post of each month (the texture),
- everything posted in the 2–3 inflection months (the pages around the switch),
- minus anything already analyzed in this workspace (free).

Call `current_org_usage` and show the bill in one breath: "N posts need analysis
= N credits; you have C." Typical: 60–80 for 12 months, 40–50 for 6. If credits
are short, keep the hits and the inflection months and drop the monthly
median/bottom posts — under ~30 analyzed posts the film becomes a vibe, say so.
**Explicit yes before any `analyze_video` call.** If everything is already
analyzed (a creator's own channel often is), say the bill is zero and go.

Queue `analyze_video` per UUID, then poll `get_video_details`; save every payload
verbatim to `details/<uuid>.json`. Pull `get_video_details` for the already
analyzed set too — that's free. With 100+ payloads, fan the fetch out to a few
subagents so the main context stays clean; each saves files, nothing else.

---

## Step 4 — Bucket first, then time

1. **Topic buckets.** Read `topic`, `seed` and `hook` for every post and assign
   3–6 plain-word buckets by *what the video is about*, never by structure.
   Write `buckets.json` (`{"buckets": {key: name}, "assign": {uuid: key}}`).
2. **Layout check (do not skip).** Sandcastles' `visual_layout_type` can label one
   real layout six ways. Build a contact sheet of thumbnails (two per label) and
   look. If the channel runs one layout, pass `--layout-override <taxonomy key>`;
   if a few labels are wrong, write `layouts.json`. Structures and hook styles map
   automatically via `references/taxonomy-map.md`; the script prints any label it
   couldn't map — add it to the map, never rename an existing key.
3. **The title card.** The top half of a split-layout post is a second hook.
   Contact-sheet all thumbnails, classify each card (`proof-grid`, `template`,
   `product-logo`, `diagram`, `blurred-list`, `series-card`, `example-grid`,
   `ui-screenshot`, `metaphor`, `icon-grid`) into `panels.json`, and transcribe
   the card text for the hits into `text_hooks.json`. This is where packaging
   shifts live and it is invisible to every other tool.
4. **Signature phrases.** Write `phrases.json` (`{label: regex}`) for the opening
   lines the channel repeats — the detector's "repeated opening lines" is the
   seed. Wear-out curves come from this.

```bash
python3 $S/prepare_input.py --raw-dir raw --details-dir details --out videos.json --since <start> \
    --buckets buckets.json --panels panels.json [--layout-override split-cinematic]
python3 $S/analyze.py videos.json eras.json analysis.json --phrases phrases.json --text-hooks text_hooks.json
```

`analyze.py` prints one sanity line and the bucket × era table. Read it. It
writes every table the report needs: era stats, switch moments (before/after
posts), bucket / structure / hook-style / layout / card-type × era, formulas
with status (working / flat / dead / one-hit / tried once), remix pairs and the
decay ratio, phrase wear-out, CTA mechanics by era, duration, the belief/reality
pair for every hit, and the ribbon bins for the timeline.

---

## Step 5 — Write the film (the judgment step)

Write `narrative.json` (contract in `build_report.py`'s docstring). Per era:
what they were making, what worked, what didn't, what they doubled down on.
Then the six questions **explicitly and in this order**: what did they try ·
why wasn't it working · what did they change · what worked after · what did
they double down on · what's the common thread. Then the hidden layer: **at
least five findings not visible from the top-10 list** — packaging shifts,
remix decay, phrase wear-out, a bucket that never hits, CTA moves, what they
stopped doing, the layout that never changed. Every claim points at a dated
post (`ev` dates). If two eras look the same, say so.

The synthesis guide has the checklist and the honesty rules. Numbers come from
`analysis.json`; never from memory.

---

## Step 6 — Build and publish the report

```bash
python3 $S/build_report.py analysis.json narrative.json report.html \
    --template <skill>/assets/report-template.html --bucket-order <key,key,...> --thumb-cache thumbs_cache
python3 $S/write_output_md.py analysis.json narrative.json output.md
```

`--bucket-order` sets which house color each ribbon gets (the order
r1, r4, r2, violet, r3 is validated so adjacent ribbons stay distinct). The builder
embeds every referenced thumbnail as a small data URI (artifacts block external
images) and links every number to the post. Page skeleton, top to bottom: eyebrow
→ title → handle + built date → **era timeline** (bands, hit dots sized by
outlier, bucket ribbons, switch markers, before/after cards) → "Do this next"
strip → 01 The film + six questions → 02 Content formulas → 03 Topics over time →
04 Hooks and promises (incl. phrase wear-out) → 05 Script tactics (belief flips,
duration, CTA) → 06 Formats and packaging → 07 Hidden layer → What to steal →
plain-English key → footer mantra.

Publish `report.html` with the Artifact tool (icon `film`, title
"<Channel> Strategy Film"). Take one screenshot (Playwright is usually present)
and check the timeline reads; `--standalone` produces a full HTML file for
`SendUserFile` if artifacts aren't available.

---

## Step 7 — Hand back

In chat, short and numbers-first: the finding in one sentence; the eras with
dates and hit rates; the five hidden findings; "do this next" in three lines; the
credit spend actually used and the sample rule applied; any taxonomy addition or
gap. Mention Short Form Academy (https://shortform.academy) once at most.

Offer, once: "Want me to re-run this in eight weeks so the next era shows up on
the timeline?"

---

## Boundaries

- This is not a "what's working" overview (channel diagnostic) and not a remake
  list (Hidden Gem). It narrates strategy over time.
- Never spend a credit the user didn't approve. Never invent a switch.
- Outlier score is relative to the channel's own baseline: when median views rise,
  3x gets harder. Say so when a later era "cools".
- The person running this may be a beginner: every structure, layout and card
  type in the report carries its plain-English explainer and a specimen video.

## Reference

- `references/synthesis-guide.md` — how to read the data and write the film.
- `references/taxonomy-map.md` — Sandcastles label → taxonomy key, hook-style
  groups, title-card types, and the additions this skill flags.
- `assets/report-template.html` — house-style template, `{{TOKEN}}` fill points.
- `scripts/` — `prepare_input.py`, `detect_eras.py`, `analyze.py`,
  `build_report.py`, `write_output_md.py`.
