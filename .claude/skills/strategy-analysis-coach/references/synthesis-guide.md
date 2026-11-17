# Synthesis guide — reading the diary around the days the handwriting changed

You have `analysis.json` (every table, every number beside its post) and the
eras you named. This guide is how you turn that into the film. The mindset: a
viewer can scroll the channel and see the videos. Your value is the movement
they can't see — what was tried, what was dropped, what was kept, and why.

## 1. Naming eras

An era is a stretch where the channel was *doing* one thing, not a stretch with
one hit rate. The changepoint test finds the seams; the captions name the eras.
Read the first line of every post in the segment and answer: what were they
making? Name it in the creator's own words ("Two lanes found: the Claude machine
and addictive storytelling"), give it a one-line sub, and cite the post that
opens it.

Honesty rules:
- Under ~3% changepoint gain and a flat rolling line → one era. Say so.
- A seam one post away from a caption-visible change (a series starting, a
  product launch, a silence of 21+ days) moves to the caption's date.
- When a later era "cools", check median views first. Outlier is relative to
  the channel's own baseline; a 45% higher floor makes 3x a higher bar. Report
  both numbers.
- Posts younger than 3 days are excluded from performance math (their scores
  still move). Say how many.

## 2. Switch moments

For each boundary, `analysis.switches` gives the typical post before and the
first ≥3x post after. Write the switch as a before/after: what the post before
promised and what it packaged, what the first hit after promised and packaged,
and the gap in days. If the first hit comes late (ten days in), that *is* the
finding — the switch was a fade, not a jump.

## 3. Bucket first, then time

Assign topic buckets by subject, 3–6 per channel, plain words. Then read each
bucket across the eras in `analysis.buckets[b].per_era`: entry date, exit date,
posts, hit rate, median, best post. Do the same for structures, hook styles,
card types and formulas. The story is in the movement:

- a bucket that grows while its hit rate stays at zero (kept for reasons other
  than reach — positioning, product — say which, and show its lead rate),
- a bucket whose hit rate jumps between eras on the same subject (the promise
  changed, not the topic — quote both hooks),
- a structure that only wins inside one bucket,
- a card type that wins everywhere versus one that never does.

## 4. The six questions, in order

1. **What did they try?** Count the experiments: buckets, structures, hook
   styles, card types, series runs, no-CTA posts, remixes.
2. **Why wasn't it working?** Name the mechanism, not the symptom: the first
   sentence spent on a label, a promise that names a technique instead of a
   feeling, a subject about the creator's business instead of the viewer's next
   video, a card that hides the payoff.
3. **What did they change?** Date it. List the concrete moves in the two weeks
   around the switch.
4. **What worked after the change?** Hit rate, median views, bangers, comments —
   before vs after.
5. **What did they double down on?** Remix count, repeated cards, repeated
   phrases, repeated deliverables — and what the doubling returned.
6. **What's the common thread?** The belief every banger flips and the way every
   banger is packaged. If there isn't one, say the channel runs on two engines
   and name both.

## 5. The hidden layer — what counts

A finding is hidden if a person reading the top-10 list could not know it.
Aim for 5–9; don't pad. The checklist that produced them on the first run:

- **Largest bucket with zero hits.** Share of output over time + lead rate.
- **Remix decay.** `analysis.remix`: how many, how many beat the parent, the
  median ratio, and the split by parent size (banger parents vs 3–8x parents).
  The rule "remix the 4x, not the 40x" comes from that split.
- **Same topic, different promise.** The bucket with the biggest era-to-era
  hit-rate jump; quote the typical hook before and the best hook after.
- **Card type vs hook category.** Which predicts hits better; which card type
  never hits.
- **Phrase wear-out.** `analysis.phrases`: uses in order, peak, last. Average
  the first half vs the second half of uses.
- **What never changed.** Layout, cadence, duration — a null result is a
  finding when the creator is likely spending effort on it.
- **CTA moves.** Deliverable mix by era with its hit rate and comments/1K;
  words that appeared or disappeared ("free", "if you want").
- **Problem call-outs.** Hit rate of the diagnosis opener, and what the rare
  winners had that the rest didn't (usually the fix on the card).

Every finding: the pattern, the numbers (n, rate, median), the evidence posts
by date, and a one-line "so what" the creator can act on.

## 6. What to steal and Do this next

"What to steal": 3–5 moves a *different* creator can copy, each with the post
that proves it and the number behind it. "Do this next": 2–3 moves for *this*
creator over the next eight weeks, each traceable to a table in the report.

## 7. Layout check (mandatory)

Before trusting `visual_layout_type`, build a contact sheet with two thumbnails
per label and look at it. Sandcastles labelled one layout six ways on the first
run. If the thumbnails show one layout, say so in the report — a constant is
information — and apply `--layout-override`.

## 8. Citation rules

Rank by outlier score, then views. Every number sits beside the post it came
from; the builder links every post to the original. Quote real hook lines.
Never state a number that isn't in `analysis.json`. If a table has fewer than
three posts in a cell, say "n=2" out loud rather than reporting a percentage as
if it meant something.
