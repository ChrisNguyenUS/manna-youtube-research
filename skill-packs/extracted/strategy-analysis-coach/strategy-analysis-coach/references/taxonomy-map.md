# Taxonomy map — Sandcastles labels → the shared taxonomy

The seven workflows classify videos with the same names so a cell in one report
means the same thing in another. This file is the mapping this skill applies
(`scripts/prepare_input.py` carries it as dictionaries; edit both together).
Never rename or merge an existing key. Add a key only when three or more videos
in the dataset fit none of the existing ones, and flag the addition in the final
message.

## Storytelling structures (`format_type` → key)

| Sandcastles `format_type` | Key | Plain-English name |
|---|---|---|
| breakdown_explainer, problem_solution, case_study, framework, analysis, explainer | `breakdown` | Structured breakdown |
| tutorial, how_to, demo, walkthrough | `tutorial` | Show-me-how |
| listicle, ranking_rating_tier_list, levels, top_n, tips | `listicle` | Countdown list |
| common_trap_mistake, hot_take, contrarian, rant | `myth-kill` | Busting a myth |
| a_vs_b_comparison, comparison, before_after | `a-vs-b` | This vs. that |
| story, monologue, personal_story | `story-lesson` | Story with a lesson |
| clone, template, remix | `clone` | Copy this |
| challenge, experiment, test | `challenge` | Experiment |
| reaction, commentary, review, critique | `reaction` | Reacting to |
| skit, pov, roleplay | `skit` | Acting it out |

Notes from the first run (@kallawaymarketing, Sep 2026):
`problem_solution` ("the reason your videos… here's the fix") maps to
`breakdown`, not `myth-kill` — it explains a mechanism rather than flipping a
belief. `levels` ("6 levels of storytelling") is a counted list → `listicle`.

## Visual layouts (`visual_layout_type` → key)

| Sandcastles `visual_layout_type` | Key | Plain-English name |
|---|---|---|
| split_screen, visual_greenscreen, notes_article_greenscreen, comparison_clone | `split-cinematic` | Cinematic split-screen |
| full_screen_hybrid | `th-broll` | You on camera + clips |
| office_room_yap | `raw-th` | You on camera, nothing else |
| screen_recording | `screen-demo` | Screen recording + face |
| text_overlay | `text-driven` | Big text on screen |
| vlog | `vlog` | Out in the world |
| podcast_clip | `clip` | Podcast or interview clip |
| cinematic | `cinematic` | Cinematic produced (no split) |

**The layout check overrides this table.** On the first run, Sandcastles gave
six different layout labels to 127 posts that were, on the thumbnails, one
layout (title card on top, creator on camera below → `split-cinematic`). Always
contact-sheet two thumbnails per label before trusting the labels; use
`--layout-override <key>` when the channel runs one layout, or `layouts.json`
for per-video corrections.

## Hook styles (`spoken_hook_category` → group)

Not part of the shared taxonomy's structures/layouts; this skill groups
Sandcastles' hook categories so they can be tracked over time.

| Sandcastles `spoken_hook_category` | Group | Plain-English name | Example shape |
|---|---|---|---|
| secret_reveal_breakdown | `reveal` | Secret reveal | "This is the X hack called…" |
| tutorial | `how-to` | How-to promise | "Here's how to…" |
| authority, case_study, personal_experience | `authority` | Authority claim | "X is outperforming everything" / "I studied thousands…" |
| problem, trap_mistake | `problem` | Problem call-out | "The reason your videos…" |
| contrarian | `contrarian` | Contrarian flip | "Stop trying to go viral" |
| list, ranking_rating | `list` | Counted list | "These are the 5…" |
| question | `question` | Question | "Do you want…?" |

## Title-card packaging types (addition — a new axis, not a structure or layout)

Read off the thumbnails by the model (`panels.json`). On split-layout channels
the card is a second hook and predicted hits better than the spoken-hook
category on the first run.

| Key | Plain-English name | What it is |
|---|---|---|
| `proof-grid` | Proof grid | Other creators' thumbnails with their view counts |
| `example-grid` | Example grid | Thumbnails, no numbers |
| `template` | Template card | The finished artifact: script template, calendar, grid |
| `diagram` | Diagram or chart | Ladder, funnel, curve, bullseye |
| `product-logo` | Product logo | A tool's mark leads the card |
| `ui-screenshot` | App screenshot | Profile, dashboard, database |
| `blurred-list` | Blurred tease | A list or term with the answer blurred |
| `series-card` | Series card | Recurring title + episode number |
| `metaphor` | Metaphor illustration | Pipes, bricks, a brain, a movie still |
| `icon-grid` | Icon grid | Tool icons |

## Performance bands (outlier score, used as-is)

Flop < 0.5x · Baseline 0.5–1x · Hidden gem 1–3x · **Outlier 3–8x** (hit rate) ·
**Banger ≥8x** (switch-moment candidates). "Hit rate" in this skill = share of
posts ≥3x.

## Formula

Topic bucket · structure · layout, always in that order, plain-English names:
"Hooks · Structured breakdown · Cinematic split-screen".
