# Synthesis guide — the judgment calls

The scripts do the arithmetic. These are the four places a person (you, Claude) has to decide something,
and how to decide it the same way every time. Kallaway Marketing (Sep 2026, 133 reels) is the worked
example throughout; it is never a default.

## 1. The screen

Before anything is counted: drop reels with engagement under 2% whose views sit far above the channel's
median (brand deals, boosts — `prepare_input.py` does this with 2× the median as the line); drop anything
off-niche (a wedding, a brand deal that slipped the first filter, a repost of someone else's video) by putting
its uuid in `screen.json → off_niche` with a two-word reason. Report the counts in the method section and in
the close. On the worked example nothing was dropped: no reel under 2% engagement, none off-niche.

## 2. Topic buckets (the only tagging that needs a person)

A bucket is what the reel is *about*, in plain words, 3–6 per channel, never named after a format
("listicles" is not a topic). Buckets live at rings 2–4 of the bullseye.

**Reuse before inventing.** If a Positioning Canvas, Formula Lab, Bullseye or positioning doc exists for this
channel, use its bucket names verbatim. Add a bucket only when a clear cluster of reels (roughly 8+) fits none
of them, and flag the addition in the final message. Worked example: the canvas had four (Data-driven growth
workflows · Hooks & storytelling · Views → dollars · AI × content); 11 reels about trust, positioning, moats
and brand identity fit none of them, so **Personal brand** was added as a fifth.

**How to tag.** Print the compact table (`uuid · date · outlier · topic · seed · spoken hook · angle`) and go
reel by reel. Precedence when two buckets fit: the AI bucket wins when the *method* is an AI tool; the money
bucket wins when the core subject is leads, sales, offers, CTAs or buyer quality; then the words bucket
(hooks, retention, story, script, delivery); then brand; else growth. Write `tags.json` with a six-word `why`
per reel. Log the borderline calls in the close — there are always a few, and the reader should know which
cells could move by one.

Sanity check after tagging: every bucket should have at least 5 reels, and no bucket should be over half the
channel. If one is, it is two buckets.

## 2b. Formats are Sandcastles' names, one to one

The structure axis is the Sandcastles format (`format_type`), named exactly as the app's Formats library
names it, and never bucketed: Breakdowns / Explainers, Case Studies, Problem Solution and Q&A are four rows,
not one "breakdown"; Listicle, Ranking/Rating/Tier List and Levels are three rows, not one "countdown list".
The finer cut matters — on the worked example the "working countdown list" in Hooks turned out to be two
Levels reels (5.1x, 6.5x) and one Listicle at 1.0x. When an unseen `format_type` prints as `UNMAPPED`, add it
to the map with the app's name. The master spec's plain-English names stay in the map as aliases so this
report can be read against the Format Finder, which grouped by them.

## 3. The look check (layouts)

Sandcastles labels the dominant frame of each reel on its own, so a channel with one house look can come
back under five labels. Always run `classify.py --contact-sheet` and look at the sheet once before trusting
the layout axis on the user's own channel. Ask one question: *do these labels show different ways of
shooting, or the same look with different things on the graphic half?*

- Different looks → keep the map as is.
- Same look → write `overrides.json` (`layout_collapse`, see `taxonomy-map.md`), keep the podcast/clip and
  any genuinely different label out of the collapse, and let the report show the fine labels as the
  **top-half substrate** panel so the signal is not lost.

Say it plainly in the report and the close: "127 of 133 reels are one layout" is the finding, not a
classification failure. A channel with one layout has never tested layout, which makes every niche-proven
layout an untried square — that is usually the most useful thing the report says.

## 4. Reading the scorecard

The tags are mechanical (`score.py` doc-string). The reading is not:

- **Working with a low n (3–4)** is real but young; say "working, on 3" and give it a repeat slot, not a
  doubling.
- **Promising on 1 reel** (a single 18x) is a lead, not a formula. It earns exactly one deliberate retry in
  the next batch. Two of them and it is working; a flop and it was the topic, not the formula.
- **Flat with a huge n** (27 reels at 1.1x that also hold a 34.8x) is the channel's habit. The banger inside
  it came from the *idea*, not the formula. The move is to change one part (structure or layout) and keep the
  topic, not to stop making the topic.
- **Dead** (median under 0.8x on 3+) is a stop. Flat at exactly 0.8x is one notch from dead; say so.
- **Untried, tier A** (all three parts proven, never combined) is the cheapest test there is. Tier B
  (half-proven) is the next cheapest: a working structure pointed at a topic that has only ever been made
  another way, or a promising structure paired with a proven topic.
- **Leads per 1K** (comments ÷ 2 per 1,000 views, keyword-CTA reels only) breaks ties between formulas with
  similar medians and catches the case where a low-view formula converts well — it is a lead proxy, so read it
  with the CTA Lab, not instead of it.

Shrunk rank (`(n·median + 2)/(n + 2)`) is only for ordering the list. Never quote it as a number; quote the
median and n.

## 5. The niche panel (second, lighter)

Import the Format Finder matrix when one exists (`niche_panel.py --format-finder`); recompute from
already-analyzed watchlist outliers only when it doesn't (free; `--niche-videos`). Take the five channels
with the most outliers. Tag their outliers into the *user's* buckets (same rules as §2; "Other" is allowed
here and is common — one of the five channels in the worked example was 11 of 12 "Other"). Then list what
they run that the user never has.

Two cautions to print every time: the pool is outliers only (3x and up) so its medians are inflated versus
the user's channel-wide medians (compare counts and bests); and the layout labels on other people's channels
have not had a look check, so a niche "greenscreen" may be a produced split in disguise.

## 6. Picking the five to try and the batch of 7

Five candidates, in this order of preference, each written with its numbers and a model reel from the user's
own channel plus one from the niche when it exists:

1. Tier A untried (own proven parts, never combined).
2. Tier B untried that the niche also proves (the strongest kind of bet: own half-proof + niche proof).
3. Tier B untried on its own.
4. A niche-proven *layout* swap on the user's working or volume formula (same topic, same structure).
5. One wild niche formula (a structure or layout the user has never touched) — the chaos slot.

The batch of 7: two repeats of the top working formulas, five bets from the list above, each bet changing
exactly one part of something already proven so a result is readable. State the judging rule in the note
("a bet needs one reel at 3x or two at 1.5x to earn a second run").

## 7. Writing the lead

One sentence with three numbers: what carries the channel (formula, n, median), what the channel makes most
and how it performs, and the single biggest untried thing. No adjectives the numbers don't earn.

## 8. Credits and the sample rule

The free pull carries `analyzed` per reel. Most creators who use Sandcastles have most of their own channel
analyzed already; the bill is usually small. Show it in one breath ("N reels need analysis = N credits; you
have C") and wait for the yes. If C is short: keep every analyzed reel (free) and analyze the most recent
unanalyzed ones first; below ~30 tagged reels the scorecard is a vibe, and below 3 reels in a formula the tag
can only be promising or early. Say which rule you applied in the close and the method section.
