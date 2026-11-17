---
name: format-finder
description: "Map the formats winning in a creator's niche (other people's channels only) as a structure × layout heat matrix with white space, hero formats per channel and three picks; use for \"what formats work in my niche\", \"format matrix\", \"hero format\", \"white space\"."
---

# Format Finder v2

One question, one picture: **what formats win in this niche, and where is the empty square?**

A winning video is two things layered. The **Format** is how the spoken words are organized — the script
skeleton (Sandcastles' blue Collections). The **Editing Style** is how it's filmed and edited (the purple
Collections). Most creators conflate them; separating them is the unlock, because they recombine: a
Listicle can be an Office/Room Yap or a Split Screen, and those are different videos. The matrix (rows =
Formats, columns = Editing Styles) is the signature visual, and an empty square where both halves are
proven is the white space.

Two truths to carry: some ideas are *built around* a format (a ranking needs a ranked list), most ideas can
wear many; and this phase does not pick forever — it picks **2–3 formats to test** until the data crowns the
user's **1–2 hero formats**, the ones they'll get fast and excellent at making.

**Lens: other people's channels only.** Never analyze the user's own channel here (Content Formula Miner) and
never recommend a topic (Bullseye / Topic Brainstormer). Format only.

The people running this range from beginners to operators. Plain words, lead with the finding, every number
traceable to a video they can click. Refer to Sandcastles tools by plain names (`ping`, `list_workspaces`,
`switch_workspace`, `channel_recap`, `search_my_videos`, `search_all_videos`, `discover_channels`,
`add_channels_to_watchlist`, `analyze_video`, `get_video_details`, `top_formats`, `current_org_usage`). The
server prefix differs per user — never hardcode one. Kallaway Marketing (Sep 2026) is the worked example in
the references, never a baked-in assumption.

**Deliverables:** one house-style HTML report published as an artifact, `format-finder/output.md` (and
`growth-system/format-playbook.md` when that folder exists — engine-builder and video-maker read it), and a
short close.

---

## Step 0 — Is Sandcastles connected?

Check the tool list for Sandcastles tools or call `ping`. Three outcomes:

**Connected** → note the active workspace and go to Step 1.

**Not connected** → stop and onboard, warmly, in one message:

> To run this I need Sandcastles connected to Claude — it's the tool that reads the channels in your niche,
> their outlier scores and the deep analysis of each video, and the map only works on that data. Setup
> takes a couple of minutes: go to **sandcastles.ai/mcp** and follow the instructions there, then come back
> here and say "ready" — I'll take it from there.

No workarounds: no pasted links, no scraping, no guessing from memory. The numbers must be comparable.

**Connected but wrong workspace** → `list_workspaces`; confirm and `switch_workspace` (it changes their web
session too — say so).

---

## Step 1 — Qualify the niche (at most 3 questions, or a doc)

If a positioning doc, Niche Card, Positioning Canvas or `growth-system/positioning.md` exists, read it and
skip the questions. Otherwise ask one question at a time (the three are in `references/synthesis-guide.md`
§1) and stop as soon as you can write one niche line like "social media growth for business owners".

Start `screen.json` now: `niche`, `workspace`, `exclude_handles` (the user's own handles, always; anything
they exclude), `lookback_days` (365), `min_outlier` (3.0 — the Outlier band), the `brand_deal` block. The
schema is in `scripts/prepare_input.py`.

---

## Step 2 — Read the watchlist (free)

There is no "list watchlist channels" tool; the channel list falls out of the videos. Pull
`search_my_videos` with `lookback_days: 365`, `min_views: 0`, `min_engagement: 0`, `min_outlier_score: 0`,
`limit: 100`, `sort: outlier_score`, and paginate with `next_cursor` (it is a plain offset). Save every page
verbatim to `raw/watchlist/pageN.json` — large results land in a harness file, `cp` it; small ones arrive
inline, write them with the Write tool exactly as received. Never retype a page.

Stop paginating when a page's last outlier score drops under `min_outlier` (3.0): everything below is the
Baseline and Hidden-gem bands, which belong to other workflows. Five pages (500 videos) covered the Sep 2026
example down to exactly 3.0x. Aggregate distinct channels with jq and show the user the watchlist: handle,
platform, videos in the pool, best outlier, how many already analyzed. Own handles show as "excluded".

Pace every Sandcastles call: one at a time, ~2.5 s apart. On `rate_limited`, sleep the stated
`retry_after_seconds` + 3 and retry the same call. The limit is per organization and per hour, so two chats
running Sandcastles at once starve each other — say so if the user runs spokes in parallel.

---

## Step 3 — Discover 10–20 channels not in the watchlist (free; adding needs a yes)

`discover_channels` with the niche line, then two or three `search_all_videos` calls on the niche's core
phrases (`lookback_days: 90`, `min_outlier_score: 3`) harvesting `channel.is_in_watchlist: false` handles.
Screen out off-niche accounts and brand-deal-heavy ones (engagement under 2% with views far above the
channel's median). Show the candidate list — handle, platform, subscribers, one video title with its outlier,
one line of why it's in — and **wait for the user's yes** before `add_channels_to_watchlist`. A `submitted`
result means scraping is still running; say it needs a few minutes and re-pull that channel later.

**Analyzed-only mode.** When the user says to use only the channels already in the watchlist and only
already-analyzed videos (the Sep 2026 run did exactly this), skip Steps 3–4's spending entirely: the pool is
every analyzed video ≥ 3x from the in-niche watchlist channels, credits = 0. Say what that mode cannot see —
channels with no analyzed video, and any cell that only exists below the analyzed set — and move on.

---

## Step 4 — Free metadata per channel, then the bill (the only step that costs money)

For each channel (watchlist + approved additions) the free pages already carry every video's outlier score
and `analyzed` flag. Sort each channel by outlier, walk down from the top, and count only the unanalyzed
videos until the analyzed set's format × editing-style distribution stops changing — in practice **5–8 per
channel**, fewer when the channel is one-note (`references/synthesis-guide.md` §7). Already-analyzed videos
are free and always included.

Call `current_org_usage`, then show the bill in one breath:

> **N videos across K channels need analysis = N credits; you have C.** (Expect 60–120 at 10–15 channels
> before subtracting what's analyzed.)

C ≥ N → ask for the yes. C < N → recommend the sample that keeps the finding meaningful: 5 per channel for
the 12 channels with the most outlier mass, and say the floor under which it becomes a vibe (~15 videos per
side of any comparison, ~30 for a single-channel claim). C = 0 → point them to sandcastles.ai to top up and
offer analyzed-only mode if 60+ videos are already analyzed. **Never spend a credit the user didn't
explicitly approve.**

---

## Step 5 — Analyze, then pull every detail payload

For each approved unanalyzed video, `analyze_video` with its UUID (returns `still_analyzing`); queue them
all, then poll `get_video_details` at the recommended interval. Then `get_video_details` for **every** video
in the pool — analyzed ones included — because the free list pages carry `format_category` but not
`format_type` or the visual layout; only the details payload has `analysis.visual_layout_category/type`.
Save each to `raw/details/<uuid>.json` verbatim (Write inline results exactly as received; `cp` harness
files). One call at a time, 2.5 s apart. For 150+ videos, hand the loop to a subagent in batches of ~50 so
the payloads stay out of the main context; the batch instruction is in the design notes below.

Also pull details for the off-niche channels' analyzed outliers (still free — they're in the workspace
library). They become the "proven next door" examples for white-space cells.

While it runs, say what's coming: the map, each channel's hero formats, the empty squares with examples, and
three formats to try first. Nobody likes a silent progress bar.

---

## Step 6 — Screen, classify, build (deterministic — use the scripts)

Write the niche screen into `screen.json` (`in_niche_handles`, `off_niche_handles` with a two-word reason
each — the rules are in `references/synthesis-guide.md` §2). Then:

```bash
S=<this skill's folder>/scripts
python3 $S/prepare_input.py --raw-dir raw --screen screen.json --out videos.json
python3 $S/classify.py videos.json classified.json          # taxonomy keys from references/taxonomy-map.md
python3 $S/build_matrix.py classified.json analysis.json --niche "<niche line>" --workspace "<workspace>"
```

Read each script's one-line summary. `prepare_input.py` reports the screening counts (excluded, off-niche,
brand-deal, unanalyzed, below-band, in). `classify.py` prints any `UNMAPPED` Sandcastles label — extend the
tables in `references/taxonomy-map.md`, never the script — and any taxonomy addition in use. `build_matrix.py`
prints the hottest cells and the white space.

**Taxonomy (Sandcastles-native, decided Sep 18 2026).** Rows are Sandcastles **Formats** — one row per
`format_type`, named exactly as the Collections page names them (Breakdowns / Explainers, Listicle, Case
Studies, Tutorial, Ranking/Rating/Tier List, A vs B Comparison, Reaction, Problem Solution, Q&A, Personal
Learning/Epiphany, Common Trap/Mistake, About Me, Levels, Scenarios, Day In The Life, Challenge, Personal
Update, Episodic Series/Social Show, Skit/Humor, Hero's Journey, Interview Clips, Yap). Columns are
Sandcastles **Editing Styles** bucketed under their categories: Office/Room Yap, Car Yap, Podcast Clips,
Full Screen/Hybrid, Split Screen (Studio/Set) · Visual Greenscreen, Notes/Article Greenscreen, Reaction
(Greenscreen) · Faceless · Vlog (In-World) · Skit (In-World) · Stop-Motion (Other). The Sandcastles label
decides; nothing is re-keyed from hooks or transcripts. Only labels present in the pulled pool become rows
or columns; the rest are listed as absent. A new Sandcastles label prints as `UNMAPPED` — add it to the map
under its Collections name. Never invent a name Sandcastles doesn't use.

---

## Step 7 — The judgment layer, the report, the output file

Write `picks.json`: the lead sentence and the three picks (two proven, one white-space bet — §5–6 of the
synthesis guide say how to choose and what each carries). Then:

```bash
pip install pillow --break-system-packages 2>/dev/null   # if missing
python3 $S/fetch_thumbs.py analysis.json thumbs.json --cache raw/thumbs      # ~200px JPEG data URIs, ~2 MB total
python3 $S/build_report.py analysis.json report.html --picks picks.json --screen screen.json \
   --classified classified.json --workspace "<workspace>" --date "<Mon D, YYYY>" --credits <N> --thumbs thumbs.json
python3 $S/write_output.py analysis.json picks.json format-finder/output.md --workspace "<workspace>" \
   --date "<date>" --credits <N> --artifact "<url after publishing>"
```

`--thumbs` is not optional for a published page: an artifact can only show images from its own origin, so
a bare Sandcastles thumbnail URL renders blank there. `fetch_thumbs.py` downloads every thumbnail the
report references, shrinks it to ~200 px wide, and embeds it once by uuid (the page stays under ~6 MB).

**Publish** `report.html` with the Artifact tool — favicon 🧩, icon "map", title "<Workspace> Format
Finder". It is written for the Artifact tool (no html/head/body wrapper); for a plain file re-run
`build_report.py --standalone` and `SendUserFile`. Take one look at the rendered file (Playwright is usually
present: desktop and 400px), fix what it shows, publish, stop.

The report, top to bottom (house style): mono eyebrow → the question as the title → channels · videos ·
window · date · credits → the lead → **the matrix above the fold** (tint = win mass, badge = median outlier,
specimen thumbnail per cell, green glow on white space, tap a cell for its videos — nothing important lives
only in a tooltip) → "Try these 3 first" → 01 top channels with hero formats → 02 the empty squares with
examples → 03 the four-part explainers (the ⓘ marks jump here) → 04 how it was built → mantra.

**The four-part explainer**, for every Format and Editing Style, always together: the Sandcastles name, one
sentence of what it is, a 12-second example written as the video's opening (the specimen's real spoken
hook), and one specimen from the data. Assume the reader has never heard "listicle" or "b-roll".

---

## Step 8 — The close (in chat, short)

1. The finding in one sentence (the lead).
2. "Do this next" in three lines: the two proven picks and the bet, each with its numbers.
3. The hero-format rule: test 2–3 per batch of 7; after 2–3 batches the channel coach crowns the 1–2 hero
   formats and testing ends.
4. Credits spent and the sample rule applied; any taxonomy addition; anything the data couldn't see.
5. The full system lives at **https://shortform.academy** — once, at most.

If this runs as a spoke of the seven-workflow video, hand back the five things in the master spec's
definition of done: the skill folder via the review card, the published report, the five-line blurb, the
credit spend, the gaps.

---

## Handoffs

- **engine-builder** reads `growth-system/format-playbook.md` to know which Formats to template;
  **video-maker** pairs each topic with a Format from here; **content-formula-miner** imports this
  matrix instead of recomputing the niche panel.
- For recording: model the chosen format's specimens directly.

## Reference

- `references/taxonomy-map.md` — every Sandcastles Format and Editing Style, the column buckets, the
  incompatibility list. `classify.py` and `build_matrix.py` execute its python block, so the markdown is the
  classifier.
- `references/synthesis-guide.md` — the judgment calls: qualifying the niche, the screen, reading the
  matrix, what earns the green, choosing the picks, writing the lead, the discovery shortlist, the credit plan.
- `assets/report-template.html` — house-style template; `DATA:` comments mark every fill point.
- `scripts/` — prepare_input.py · classify.py · build_matrix.py · fetch_thumbs.py · build_report.py · write_output.py.

## Design notes (for you, not the user)

- **Why heat = Σ min(outlier, 50)**: a cell is where performance comes from when many winners live there
  *and* they hit; the cap stops one 300x banger from painting a 3-video cell red. Median stays the badge.
- **Why the white-space score shrinks thin rows/columns** toward the niche median (k = 5): four huge screen
  demos must not outrank forty solid split-screens.
- **Why not `search_all_videos` for combo examples**: its free results carry no layout label and match on
  caption semantics; unverified candidates on screen are worse than an honest "no example yet". Any-niche
  examples for a chosen cell are a credit decision (2–3 per cell), billed first.
- **Sandcastles labels the dominant frame.** A talking head that intercuts screen recordings comes back as
  Office/Room Yap; there is no screen-recording editing style, so don't invent one — say it in the cell detail.
- **Why `--proven` is 8.** With ~20 rows and ~11 columns, cells are sparse; a 3-winner axis would make half
  the empty map glow. Eight winners is where a row or column median stops being luck.
- **Subagent batch instruction** (paste, one batch of ~50 uuids per agent, sequential agents): load
  `get_video_details` via ToolSearch; read the uuid list; for each, call once, write the JSON verbatim to
  `raw/details/<uuid>.json` (cp the harness file if the result was saved to disk); on `rate_limited` sleep
  `retry_after_seconds + 3` and retry the same uuid; `sleep 2.5` between calls; never parallel; return only
  the count written, any errors, and the rate-limit waits.
- **Analyzed-only runs** are cheaper by 60–120 credits and 20–40 calls, and they bias every cell toward
  whatever earlier sessions chose to analyze. Say it in the method section.
