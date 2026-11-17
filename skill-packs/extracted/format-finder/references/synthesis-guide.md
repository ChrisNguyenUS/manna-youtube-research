# Synthesis guide — the judgment calls the scripts can't make

The scripts are deterministic. Four things need a human-grade call, and each one is written to a small JSON
the scripts read, so the run stays reproducible: `screen.json` (who's in the niche), `picks.json` (what to
try first, and the lead sentence), the discovery shortlist (which channels to add), and the credit plan.
Kallaway Marketing (Sep 2026) is the worked example throughout, never an assumption.

## 1. Qualifying the niche (Step 1) — three questions, or a doc

If a positioning doc / Niche Card / Positioning Canvas exists, read it and skip the questions. Otherwise ask,
one at a time, and stop as soon as you can write one line like *"social media growth for business owners"*:

1. "Who is the video for, in one phrase — the person, not the topic?" (business owners doing $10K–$1M/mo)
2. "What do they come to you to get better at?" (growing on Instagram / YouTube)
3. Only if 1 and 2 still fit three different niches: "Which channels do you wish you'd made?" — two or three
   handles pin it faster than any adjective.

Write the niche line into `screen.json` as `niche`. It is the yardstick for every screening decision below.

## 2. The niche screen (`screen.json`) — channel level first, then video level

Read each channel's `topic` and `seed` fields across its analyzed videos (the free list pages carry both).
A channel is **in** when most of its outliers would make sense on the user's feed: same viewer, same job to
be done. Use the bullseye rings as the ruler — ring 1–4 of the user's niche is in, ring 5 (the whole
category, "business", "mindset", "science") is out. Adjacent marketing counts as in (brand/design commentary
for a social-growth niche); lifestyle, science, fitness, dance, finance-lending, skincare do not, however big
the numbers. Write `in_niche_handles` and `off_niche_handles` (with a two-word reason each) — the reasons go
into the report's method section, so a reader can disagree with a specific call.

Own channel and any handle the user excludes go in `exclude_handles`. Nate Gaffney was excluded from the
Sep 2026 run by instruction, not by the screen; say which when it happens.

Video-level: the brand-deal screen is automatic (`brand_deal` block: engagement under 2% AND views over 3x
the channel's median across every pulled video). A 0% engagement reading is usually hidden likes — still
drop it; the rule is the rule, and the count is reported. Do not hand-rescue a video you like.

Off-niche channels are *kept in the file* tagged `off-niche`. They are the free "next door" example pool for
white-space cells, and they cost nothing because they were analyzed already.

## 3. Reading the matrix (what to say, in what order)

- **Lead with the crowded square and the hot square in one breath**, with their numbers: the niche's default
  (most videos) and the square with the best median among cells with 5+ videos. They are usually different
  squares; that gap is the finding.
- Heat = win mass (Σ min(outlier, 50)). Say it in words: "count × size of the wins". Median is the badge.
  Never call a 3-video cell hot in prose, whatever its tier; say "3 videos, all big" instead.
- Channel diversity matters more than count: 46 videos from 14 channels is a niche pattern; 17 videos from
  3 channels is two creators' signature. The cell panel shows channels — read it before you write.
- Rows are Sandcastles Formats one-to-one (Breakdowns / Explainers and Case Studies are separate rows);
  columns are Sandcastles Editing Styles bucketed under their categories. The exact editing-style types
  inside a cell (`office_room_yap` vs `whiteboard`) show in the cell detail, never as extra columns.

## 4. White space — what earns the green, and what to link

Tier A (solid green): both halves proven in the niche (≥8 winners each — `--proven`, the point where a
median stops being luck on axes this fine), the pair empty, and not on the incompatibility list in
`references/taxonomy-map.md`. Ranked by shrunk row-median × column-median so a 9-video column can't outrank
a 50-video one. The report gives cards to the first twelve and chips to the rest. Tier B (dashed): one half unproven here, but the off-niche pool has ≥2 outlier
examples of the exact combo — "proven next door".

For every white-space cell the report links: (a) the exact combo from next door when it exists, and
(b) **each half done well in this niche** — the structure's best specimen and the layout's best specimen.
That pair is the recipe; a beginner can watch the two and put them together.

What NOT to do: don't fish `search_all_videos` for the combo. Its free results carry no layout label and the
matches are caption-semantic (a query for "reaction screen recording" returns family comedy). Unverified
candidates on screen are worse than an honest "no example yet". If the user wants any-niche examples for a
specific cell, that is a credit decision: 2–3 `analyze_video` calls per cell, billed first.

## 5. The "Try these 3 first" picks (`picks.json`)

Two proven, one bet, in that order:

1. **Proven · cheapest to make** — the highest-median cell among those with ≥5 winners from ≥4 channels
   whose editing style a solo owner can shoot on a phone (Office/Room Yap, Car Yap, Vlog, Visual Greenscreen
   with the built-in effect).
2. **Proven · the niche's engine** — the crowded default. Even if its median is modest, it is how the niche
   shows proof; learn it before trying to out-think it.
3. **White-space bet** — the top tier-A cell whose *both* halves have ≥20 winners when one exists, else the
   top tier-A cell that a business owner could plausibly shoot. Never more than one bet in the strip (v1 rule, kept).

Each pick carries: why (with the cell's numbers), a 4-beat skeleton written from the specimens' narrative
sections (`sections` in classified.json — read three, write the common shape), a one-paragraph "shoot it"
recipe from the layout definition plus what the specimens actually do, and 3 model videos by uuid. For the
bet, models = the structure's best specimen + two of the layout's best, and say so in `model_note`.

`wildcard` is optional: the best tier-B cell, one line, when the next-door examples are strong (≥2 at 10x+).

## 6. The lead sentence (`picks.lead`)

One or two sentences, numbers in every clause, no adjectives: the default square (count, median), the hot
square (count, median, channels), and the white-space count. `<b>` is allowed for the two squares. It is the
first thing on the page and the first line of the close in chat.

## 7. Discovery shortlist (Step 3) and the credit plan (Step 4)

Discovery: run `discover_channels` with the niche line, then two or three `search_all_videos` calls on the
niche's core phrases (lookback 90, min outlier 3) and harvest `channel.is_in_watchlist:false` handles. For
each candidate write one line of evidence: subscriber count, one video title + outlier, and why it's in.
Drop off-niche and brand-deal-heavy accounts before showing the list. 10–20 candidates; the user says
which to add. `add_channels_to_watchlist` only after the yes; a `submitted` result means scraping is still
running — say it needs a few minutes and re-pull that channel later.

Credit plan, per channel: sort its free metadata by outlier, walk down from the top, and count only the
unanalyzed ones until the format × editing-style distribution of the analyzed set stops changing — in practice
5–8 videos per channel, fewer when the channel is one-note. Bill = Σ unanalyzed picks. Expect 60–120 at
10–15 channels before subtracting what's analyzed. Show it with `current_org_usage` in one breath and wait.
The zero-credit path (analyzed-only, no discovery) is a legitimate mode — say what it can't see: channels
with no analyzed video, and any cell that only exists below the analyzed set.
