# Synthesis guide — how to read the data and write the judgment layer

The scripts do the math. This file is the judgment: how to place a video on a ring, how to place a
bucket, how to read the three metrics and the hypothesis tests, how to read the walk-forward batches,
and what goes in `narrative.json`.

## 1. Placing a video on a ring (Stage 4d)

One test, applied to the script (the caption when the creator posts the script as the caption;
otherwise the transcript from `get_video_details`): **whose problem does this video serve?**

| If the person who would stop for it is… | Ring |
|---|---|
| only the exact ideal viewer (the center statement) | 1 |
| anyone in the ring-2 audience (the center with one constraint relaxed) | 2 |
| anyone in the ring-3 audience | 3 |
| anyone in the ring-4 audience | 4 |
| literally anyone scrolling | 5 |

Rules that keep the calls honest:

- **Judge the hook and the promise, not the examples.** A storytelling framework that opens
  "even if you talk about boring topics" is craft anyone stops for (Ring 3), even if the payoff
  names business owners. The wrapper is the aim; the examples are decoration.
- **Money or the buyer named in the hook pulls a video inward.** "Leads", "sales", "conversions",
  "revenue", "as a business owner" in the first two lines → the ring where that person lives.
- **Never classify on performance.** A viral video can be Ring 5 — that is the whole point.
- **When torn, take the broader ring.** The diagnosis should catch drift, not hide it.
- **Write one line per video** saying what audience signal decided it. That line is shown on the dot
  card and in the ring-by-ring list, so a reader can disagree with a specific call.
- **Tag the bucket too.** Use the creator's own bucket names. A video that fits none gets an `other`
  key (name it "Other / off-bucket") — never force it into a bucket, and never invent a new bucket
  without telling the creator.

Save the calls as `classification.json` (see SKILL.md for the shape). `analyze.py` does the rest.

## 1b. The aim ladder — when to re-cut the rings

A ring ladder drawn for positioning (competitors on rings) is the wrong instrument for the
creator's own catalog when every video lands in its first two or three rings: the outer rings read
"empty" and the inner rings average together audiences that behave differently. Test for it: if
Stage 4's first pass leaves two rings with zero videos and one ring holding more than 40%, re-cut.

The cut that held on the worked example (a social-growth channel for business owners):

| Aim ring | Who stops for the hook's promise | What it looked like there |
|---|---|---|
| 1 | the buyer, money named | leads, sales, customers, "as a business owner" |
| 2 | the same person, one step less committed | personal brand, trust, positioning, monetizing attention |
| 3 | anyone with the same goal on the same platform | algorithm, followers, going viral, formats, Claude on channel data |
| 4 | anyone doing the same craft, any platform | hooks, scripts, story arcs, retention, planning systems, Claude on craft |
| 5 | the principle behind the craft, no tools needed | persuasion psychology, marketing of any kind |

The vocabulary does not decide the ring — 77% of Ring 4 reels on the worked example say "social
media" somewhere, 8% in the hook. The audience that would stop for the promise decides it. Keep the
canvas's rings for competitors; put the page on the aim ladder and say so in the method card.

## 2. Screening (before anything is counted)

- Drop engagement under 2% with views far above the channel median → boost or brand deal.
  `prepare_input.py` applies this automatically (3× median).
- Drop off-niche videos by uuid in `drop.txt` (a personal vlog on a business account, say).
- Videos posted under 48 hours before the pull are **kept and flagged** `fresh` — their outlier
  score is still moving. They render dashed. Say so in the method card.
- Report the counts: "N kept, M dropped (why), K flagged fresh."

## 3. The three metrics

- **Reach = views.** Compare cells on the **median** views per video; a mean is one banger's number.
- **Conversion = comments ÷ 2 = emails.** On a comment-keyword CTA every lead produces one viewer
  comment plus one auto-reply, so half the comments ≈ people who asked for the magnet. Videos with no
  keyword CTA (`has_cta: false`) still get the number but their comments are organic — say how many
  such videos there are and don't rest a conclusion on them.
- **Efficiency = emails ÷ views.** Shown as a % and as the **pooled** rate (total emails ÷ total
  views) per ring and per cell, so a cell with one viral video isn't dragged by that video's rate.
- **Bang for buck** ranks bucket × ring cells by **median emails per video**, ties broken by pooled
  rate, and only cells with n ≥ 3 are ranked. Reach rank and rate rank sit beside it so the reader
  sees what each cell trades away. The top cell is the answer to "which bucket, which ring."

## 4. The two hypotheses, stated so they can fail

**Aim** (from the method):
1. *Biggest dots sit toward Rings 3–4.* `analyze.py` says `confirmed` when ≥6 of the top 10 by
   outlier score sit in Rings 3–4, `confirmed at ring 3 and 2` when ≥8 of the top 10 sit in Rings 2–4
   with at most one in Ring 1, else `not confirmed`. Say whether Ring 4 had any dots.
2. *Ring 5 is empty or underperforms.* `confirmed` when no top-10 dot is in Ring 5 and Ring 5's mean
   outlier is below the channel median (or Ring 5 is empty).
3. *Viral Trap check.* Any top-5 dot in Ring 5 → name the video(s) and add the callout.

**Money** (from the three metrics, rings with n ≥ 3 only):
1. *Reach rises outward* — median views by ring is non-decreasing across the tested rings.
2. *Efficiency rises inward* — pooled rate by ring is non-increasing outward.
3. *Absolute conversions peak mid-ring* — the ring with the highest median emails is Ring 2 or 3.

Report each as ✓ / ✗ / untested with the peak ring, and say plainly when the channel contradicts the
theory — a channel where Ring 3 wins on reach **and** rate is a real finding (lead magnets attached
to craft videos convert broad viewers), not an error to explain away.

## 5. Placing buckets on rings (Stage 3, for a channel with history)

`analyze.py` places each bucket on the ring where most of its videos landed (tie → broader) and
reports the split by ring, reach, conversion, efficiency, and the best video by emails.

- A bucket that lands on **Ring 1** is flagged: the method says Ring 1 is the person you speak to,
  not a lane. The fix is a hook one ring out with the same payoff — find the creator's own video
  that already did this and name it.
- A bucket that lands on **Ring 5** is flagged as the Viral Trap.
- A bucket that **splits** across rings is usually a *treatment* (an angle applied to other
  buckets — "AI ×", "for beginners", "in 60 seconds") rather than an aim point. Say so; keep it as a
  treatment on some of the slots rather than a fourth bucket.
- With four named buckets and three slots, assign roles by the data: the two conversion buckets
  are the ones sitting at Rings 2–3 closest to the center; the reach bucket is the outermost
  (the method wants Ring 4; if the channel's outermost bucket is Ring 3 and it already holds the
  biggest dots, say "one ring inside the template — don't move it").
- The 3-2-1 slots go to the **top-ranked cells**, not to the buckets in the abstract: "Hooks &
  storytelling · Ring 3" is a slot; "Hooks & storytelling" alone is not.

## 6. One bullseye per bucket — the aim ring

For each bucket, `analyze.py` picks the **aim ring**: the ring where that bucket collects the most
emails per video (n ≥ 3; n ≥ 2 as a fallback, flagged `aim_basis`), ties broken by pooled rate. It
also reports where the bucket's reach peaks and where its rate peaks. Write `aim_why` per bucket:
the winning ring's numbers, the runner-up's, and the one video that proves it. A bucket that has
only ever tried one ring gets that ring by default — say so; the recommendation then is to try the
neighbour ring once, not to assume the default is right.

## 6b. The recipe — scoring an idea before it exists

`analyze.py` reads five attributes off each caption and scores three of them:

- **Ring fit (0–2).** 2 for the ring with the most emails per video, 1 for rings that clear the
  channel's pooled rate, 0 for rings below it. On the worked example: Ring 4 = 2, Rings 1 and 3 = 1,
  Rings 2 and 5 = 0. Set the points from the channel's own per-ring numbers, never from the template.
- **The magnet is a thing (+1).** The CTA hands over an artifact — database, template, skill, doc,
  library, collection, playbook, system, link, PDF, instructions, leaderboard, dashboard. "I'll send
  you a video" is 0. Worked example: 331 emails~ at 1.72% with, 215 at 0.88% without.
- **"Turn Claude into ___" (+1).** The verb, not the tool: "use Claude to" and "with Claude" score 0.
  Worked example: nine reels at 1,323 emails~ and 7.9x mean; "use Claude to" at 312 and 1.2x.

Two attributes people assume would predict were tested and dropped: naming the framework ("it's
called…", 0.95% vs 1.81% without) and numbered steps (0.83% vs 1.74%). A third — the CTA inside the
first three lines — helps (2.12% vs 1.36%) but belongs to the CTA Strategist, so it is reported and
not scored. Report all three under "tested, not scored" so the reader sees what was checked.

`analyze.py` derives the points (2 = most emails per video; 1 = within 80% of the channel on both
median emails and pooled rate; 0 = the rest) and the threshold (the lowest score at which median
emails at least double the scores below it; floor 2). On the worked example that gives 1·0·1·2·0 and
a threshold of 3 (1,052 emails~ at 1.92% for 3–4; 229 at 1.03% for 0–2). Read them from
`analysis.recipe.ring_fit_points` and `.threshold`; never assume the worked example's. Write the checklist in the creator's words —
three questions, one per attribute, with the ring-fit question spelling out which promises land where
for *their* rings. The one allowed exception to the threshold is the money reel (Ring 1, one slot a
batch), which scores 2 by construction.

## 7. Batches — the walk-forward test (in the file, off the page)

Batches run from the **oldest** video in groups of `--batch` (10 by default). For each batch the
script computes the batch's own stats, then the **cumulative best cell through that batch** — what the
data at that moment said to lean on next — and then checks the next batch: how many videos went to
that cell, and the median emails / views of those versus the rest of the batch.

Read it as a backtest, not as thirteen stories:

- The scorecard's four numbers are the finding: checkpoints; how often the next batch touched the
  recommended cell; how often that cell out-converted the rest when touched; how often the
  recommended ring out-converted the other rings.
- Ten videos is a small sample. Never narrate a single batch's median as a trend. Write a
  `batches.notes[k]` line only where something happened that the creator would recognise — a
  bucket appearing for the first time, a switch, a banger that dragged the cumulative pick.
- **Forward mode** is the same calculation once more: the last `--batch` posted, and the top three
  cells from the whole history as the recommendation for the next `--batch`. Turn the top cells into
  the 3-2-1 slots (2 per top conversion cell, 2 for the reach cell, +1 chaos in an untested ring).

## 8. What goes in narrative.json

Every number in the narrative must exist in `analysis.json`. Fill: `lead` (the finding in two
sentences with the ring numbers), `verdict` (headline + four aim cards), `ring_notes` (one line per
ring), `short` (a 2–3 word short name per bucket key for chart labels), `trade_read` (2–4 short
paragraphs reading the tradeoff scatter), `buckets` (role, target_ring, note per bucket),
`mix` (intro, order of bucket cards, arcs for the mix wheel, optional treatment ring, chaos dart,
7 slots with example topics, chaos note, calibration line), `do_next` (2–3 cards, each one action),
`traps` (3 Ring 5 ideas personalized to the niche), `glossary` (outlier score, ring, on-strategy %,
reach, conversion, efficiency, bang for buck, 3-2-1, chaos agent, Viral Trap, walk-forward — plain
name, one sentence, an example from the data), `method` (bill, screening, judging, metrics, sizing,
sample rule), `bybucket` (intro, forward_title, forward_body, forward_plan), `aim_why` inside each
bucket entry, `money_read` (one ✓/✗ line per chart when the computed flags don't tell the story — a
dip-then-peak curve, say), `recipe` (desc, ring_q, thing_q, claude_q, check_title, checklist,
threshold_line, tested_labels), `traps_desc`, `mix.wheelnote`, `summary` (aim_why per bucket — one
plain reason; takeaways — 8–10 bullets, each a bold claim, a plain sentence, and the numbers in
brackets at the end), and `ringkey` (title; rows per ring with who, tell — bracket the literal hook
words —, example n, go = more / some / stop, do; five — lead, five hooks for one topic with a sig
per ring, foot).

Write the summary and the ring key last, after everything else is known, and write them for someone
who will read nothing else: no em-dash paragraphs, one claim per bullet, the number beside it.

Voice: lead with the finding, plain words, every claim anchored to a numbered video.
