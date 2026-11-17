# Taxonomy map — what this skill classifies, and how Sandcastles fields are used

This skill classifies videos by **ring** (audience distance from the ideal viewer), not by
storytelling structure or visual layout. It does not rename, merge or add to the shared
taxonomy of structures and layouts; it does not use those labels on the page.

## Performance bands (Sandcastles outlier score, used as-is)

| Band | Outlier score | How this skill uses it |
|---|---|---|
| Flop | under 0.5x | plotted, small dot |
| Baseline | 0.5x–1x | plotted |
| Hidden gem | 1x–3x | plotted; badge in muted amber |
| Outlier | 3x–8x | plotted; badge in amber; labeled on the wheel if top 5 |
| Banger | 8x and up | plotted at the capped size; solid amber badge |

Dot area follows `sqrt(min(outlier, 8) / 8)`; the cap keeps one banger from swallowing the wheel.

## Sandcastles fields → what the skill does with them

| Field (from `search_my_videos`) | Used for |
|---|---|
| `title` | the script when the creator posts the script as the caption; first line = hook line on cards |
| `outlier_score` | dot size, bands, all per-ring math |
| `view_count` | reach — compared on the median per ring and per bucket × ring cell |
| `comment_count` | conversion — emails = comments ÷ 2 (one comment + one auto-reply per lead on a keyword CTA); efficiency = emails ÷ views |
| `engagement_rate` | shown on cards; engagement + views drive the boost/brand-deal screen |
| `published_at` | order (newest first), the fresh flag, the date range in the header |
| `thumbnail` | embedded as a small data URI so the published page needs no external host |
| `platform_url`, `sandcastles_url` | every thumbnail and outlier badge links to the reel; "analysis" links to Sandcastles |
| `analyzed`, `topic`, `spoken_hook_category`, `format_category` | `analyzed` decides the bill; the three labels are hints only — the ring call is made from the script |

When captions are short, the script comes from `get_video_details` → `analysis.narrative_structure`
(stitched transcript), which exists only for analyzed videos — that is what the credit buys.

## Recipe attributes (read from the caption by pattern)

| Attribute | Pattern | Scored |
|---|---|---|
| `thing_magnet` | database, template, skill, doc, library, collection, playbook, system, link, pdf, instructions, leaderboard, dashboard | +1 |
| `claude_verb` | `turn (Claude/ChatGPT/AI) into` → turn_into · `use Claude to` / `with Claude` → use_to · any other mention → other | turn_into = +1 |
| `named_framework` | "is called", "I call this", "the X Method/Framework/Effect/Rule/Ladder/Loop…" | tested, not scored |
| `numbered_steps` | Step 1, Number 1, Level 1, a line starting "1." | tested, not scored |
| `cta_early` | "comment" inside the first three lines | tested, not scored (CTA Strategist's lever) |

## Ring names

Ring labels come from the creator's own bullseye (Stage 2, or a positioning canvas they already
have). The skill never substitutes its own ring names. Colors are fixed by ring number:
`--r1` red · `--r2` orange · `--r3` amber · `--r4` sky · `--r5` navy (house style).
