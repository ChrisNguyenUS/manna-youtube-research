# Taxonomy map — Sandcastles labels → the keys this report uses

Structures are **Sandcastles' own formats**, named exactly as the app's Formats library names them. Layouts
use the seven-workflow master spec's shared layout keys (plus the Format Finder's `greenscreen` addition).
`scripts/classify.py` executes the python block at the bottom, so this markdown *is* the classifier — extend
the tables here, never the script.

Rules that never change:
- Never rename or merge an entry. A Sandcastles `format_type` that is not in the table is printed as
  `UNMAPPED` and gets its own row with the app's name for it. Add a *layout* only when **three or more**
  videos fit none of the entries; name it the four-part way and flag it in the final message.
- Topic buckets are not in this file. They are plain-word buckets (3–6 per channel) assigned by what the video
  is *about*, never by its structure, and they live in `tags.json` (see `synthesis-guide.md` §2).
- Structure comes from `format_type`, one to one. Layout comes from `visual_layout_category/visual_layout_type`;
  one logged exception and one channel-level override sit on top, printed per video as `structure_reason` /
  `layout_reason` so a reader can audit every cell.

## Storytelling structures = Sandcastles formats (how the spoken words are organized)

The structure axis uses **Sandcastles' own format names**, exactly as the app's Formats library spells them,
one key per Sandcastles `format_type`. Nothing is bucketed: Breakdowns / Explainers, Case Studies, Problem
Solution and Q&A are four formats, not one. The master spec's plain-English names are kept as aliases so a
cell here can be reconciled with the Format Finder, which grouped by those aliases.

| key (`format_type`) | Sandcastles name | what it is | master-spec alias |
|---|---|---|---|
| about_me_origin_story | About Me | Who I am and how I got here | story-lesson |
| a_vs_b_comparison | A vs B Comparison | Two options set against each other | a-vs-b |
| breakdown_explainer | Breakdowns / Explainers | Takes one thing apart step by step | breakdown |
| case_study | Case Studies | One real example, what happened and why | breakdown |
| challenge | Challenge | "I tried X for N days" | challenge |
| common_trap_mistake | Common Trap/Mistake | The mistake most people make, then the fix | myth-kill |
| day_in_the_life | Day In The Life | A day, shown as it happens | story-lesson |
| episodic_series | Episodic Series/Social Show | A recurring show with episodes | — |
| heros_journey | Hero's Journey | A struggle, a turn, a transformation | story-lesson |
| interview_clips | Interview Clips | Cut from a longer conversation | — |
| levels | Levels | Beginner → advanced, tier by tier | listicle |
| listicle | Listicle | N things, counted through | listicle |
| personal_learning_epiphany | Personal Learning/Epiphany | The moment something clicked | story-lesson |
| personal_update | Personal Update | Here's what's new with me | — |
| problem_solution | Problem Solution | Name the problem, hand over the fix | breakdown |
| q_and_a | Q&A | A question, answered | breakdown |
| ranking_rating_tier_list | Ranking/Rating/Tier List | Things placed in order or in tiers | listicle |
| reaction | Reaction | Commentary on someone else's thing | reaction |
| scenario_hypothetical | Scenarios | "Imagine you're…" played out | story-lesson |
| skit_humor | Skit/Humor | Acted out for a laugh | skit |
| tutorial | Tutorial | Does the thing on screen | tutorial |
| yap | Yap | Unscripted talking straight to camera | — |

Every Sandcastles `format_type` maps to itself. A value not in the table prints as `UNMAPPED` — add the row
(with its app name) rather than folding it into a neighbour. The Format Finder's myth-kill two-signal
exception (contrarian hook + contrarian section ⇒ Busting a myth) is **not** applied here: "Busting a myth"
is not a Sandcastles format, and the app's own label for those reels is Breakdowns / Explainers. The reels
it would have moved are listed in the final message so the two reports can be reconciled.

## Visual layouts (how it's shot and edited)

| key | plain-English name | what it is | Sandcastles `visual_layout_category/visual_layout_type` values that map here |
|---|---|---|---|
| raw-th | You on camera, nothing else | One face, one take, no cuts to anything else | studio_set/office_room_yap, studio_set/whiteboard, studio_set/skit_solo, */talking_head |
| th-broll | You on camera + clips | Face with cutaways to footage or screenshots | studio_set/full_screen_hybrid, other/full_screen_hybrid |
| split-cinematic | Cinematic split-screen | Face on one side, footage on the other, produced look | */split_screen, */comparison_clone, studio_set/reaction, other/reaction |
| screen-demo | Screen recording + face | Software or phone on screen, face in a corner or intercut | */screen_recording, */screen_demo — plus exception 2 |
| text-driven | Big text on screen | Words carry it; face optional | faceless/faceless_visual_explainer, faceless/faceless_clipping, faceless/faceless_reaction_explainer, */text_on_screen |
| vlog | Out in the world | Handheld, on location, moving | in_world_vlog/*, other/vlog_reflective, in_world_skit/*, faceless/faceless_physical_explainer |
| clip | Podcast or interview clip | Two or more people, cut from a longer recording | studio_set/podcast_clips, */podcast_clips, */interview |
| cinematic | Cinematic produced (no split) | Full-frame produced footage, voiceover or on-camera | */cinematic, */produced_broll |
| greenscreen | You in front of the picture | Your face keyed over a screenshot, article or clip that stays up the whole time — **added by the Format Finder, Sep 2026** (79 of 228 niche videos fit none of the eight) | */visual_greenscreen, */notes_article_greenscreen, greenscreen/* |

**Logged exception 2 — Screen recording + face by two signals.** A talking-head layout (raw-th or th-broll)
whose `format_flavor` says "screen record", "screen-record" or "mobile screen" is a screen-demo. Same rule the
Format Finder logged. It is *not* applied when the channel override below is in force (see why there).

## The channel look check (override, logged per channel)

Sandcastles labels the dominant frame of each video independently, so one produced house look can come back
under several labels. Before trusting the map on the user's own channel, `classify.py --contact-sheet` renders
the three highest-outlier thumbnails per Sandcastles layout label; look at it once. If every label shows the
same physical look, write an override in `overrides.json`:

```json
{"layout_collapse": {"to": "split-cinematic",
  "from": ["studio_set/office_room_yap", "studio_set/full_screen_hybrid", "*/visual_greenscreen",
           "*/notes_article_greenscreen", "*/split_screen", "*/comparison_clone"],
  "evidence": "contact sheet: face bottom half in studio, produced graphic top half, on all 30 thumbnails",
  "keep": ["studio_set/podcast_clips"]}}
```

Every collapsed video keeps its original Sandcastles label as `sc.visual_layout_type`, and the report shows
it as the **top-half substrate** panel (what sits on the graphic half: diagram, document/screenshot, full-screen
cut-ins, light overlays), so the finer signal is not lost — it is just not a layout.

Why exception 2 is off under an override: on a channel where "screen recordings" are cut into the graphic
half of the same split, the flavor text fires on 7 of 127 videos at random ("screen recordings and motion
graphics"), which would invent a layout the viewer cannot see. Software-on-top is a substrate there, not a
layout. Log it in the final message either way.

Worked example (Kallaway Marketing, Sep 2026): 127 of 133 reels collapsed to Cinematic split-screen; 6
podcast clips stayed `clip`. Sandcastles had split the same look across office_room_yap (18),
full_screen_hybrid (33), visual_greenscreen (36), notes_article_greenscreen (28), split_screen (11),
comparison_clone (1).

## Performance bands (Sandcastles outlier score, used as-is)

Flop under 0.5x · Baseline 0.5–1x · Hidden gem 1–3x · Outlier 3–8x · Banger 8x and up.

## Python block (executed by classify.py — keep it valid)

```python
STRUCTURE_MAP = {k: k for k in [
    "about_me_origin_story", "a_vs_b_comparison", "breakdown_explainer", "case_study", "challenge", "common_trap_mistake",
    "day_in_the_life", "episodic_series", "heros_journey", "interview_clips", "levels", "listicle", "personal_learning_epiphany",
    "personal_update", "problem_solution", "q_and_a", "ranking_rating_tier_list", "reaction", "scenario_hypothetical", "skit_humor",
    "tutorial", "yap"]}
STRUCTURE_MAP.update({"episodic_series_social_show": "episodic_series", "hero_journey": "heros_journey", "heros_journey_transformation": "heros_journey",
                      "skit": "skit_humor", "scenario": "scenario_hypothetical", "about_me": "about_me_origin_story", "tier_list": "ranking_rating_tier_list"})
ALIAS = {"about_me_origin_story": "story-lesson", "a_vs_b_comparison": "a-vs-b", "breakdown_explainer": "breakdown", "case_study": "breakdown",
         "challenge": "challenge", "common_trap_mistake": "myth-kill", "day_in_the_life": "story-lesson", "heros_journey": "story-lesson",
         "levels": "listicle", "listicle": "listicle", "personal_learning_epiphany": "story-lesson", "problem_solution": "breakdown", "q_and_a": "breakdown",
         "ranking_rating_tier_list": "listicle", "reaction": "reaction", "scenario_hypothetical": "story-lesson", "skit_humor": "skit", "tutorial": "tutorial"}

# ordered: first pattern that matches wins. "cat/type" with * wildcards.
LAYOUT_MAP = [
    ("studio_set/office_room_yap", "raw-th"), ("studio_set/whiteboard", "raw-th"), ("studio_set/skit_solo", "raw-th"), ("*/talking_head", "raw-th"),
    ("studio_set/full_screen_hybrid", "th-broll"), ("other/full_screen_hybrid", "th-broll"),
    ("*/split_screen", "split-cinematic"), ("*/comparison_clone", "split-cinematic"), ("studio_set/reaction", "split-cinematic"), ("other/reaction", "split-cinematic"),
    ("*/screen_recording", "screen-demo"), ("*/screen_demo", "screen-demo"),
    ("faceless/faceless_visual_explainer", "text-driven"), ("faceless/faceless_clipping", "text-driven"), ("faceless/faceless_reaction_explainer", "text-driven"), ("*/text_on_screen", "text-driven"),
    ("in_world_vlog/*", "vlog"), ("other/vlog_reflective", "vlog"), ("in_world_skit/*", "vlog"), ("faceless/faceless_physical_explainer", "vlog"),
    ("studio_set/podcast_clips", "clip"), ("*/podcast_clips", "clip"), ("*/interview", "clip"),
    ("*/cinematic", "cinematic"), ("*/produced_broll", "cinematic"),
    ("*/visual_greenscreen", "greenscreen"), ("*/notes_article_greenscreen", "greenscreen"), ("greenscreen/*", "greenscreen"),
]
STRUCTURES = list(dict.fromkeys(STRUCTURE_MAP.values()))
LAYOUTS = ["raw-th", "th-broll", "split-cinematic", "screen-demo", "text-driven", "vlog", "clip", "cinematic", "greenscreen"]
NAMES = {
    "about_me_origin_story": ("About Me", "Who I am and how I got here"),
    "a_vs_b_comparison": ("A vs B Comparison", "Two options set against each other"),
    "breakdown_explainer": ("Breakdowns / Explainers", "Takes one thing apart step by step"),
    "case_study": ("Case Studies", "One real example, what happened and why"),
    "challenge": ("Challenge", "\"I tried X for N days\""),
    "common_trap_mistake": ("Common Trap/Mistake", "The mistake most people make, then the fix"),
    "day_in_the_life": ("Day In The Life", "A day, shown as it happens"),
    "episodic_series": ("Episodic Series/Social Show", "A recurring show with episodes"),
    "heros_journey": ("Hero's Journey", "A struggle, a turn, a transformation"),
    "interview_clips": ("Interview Clips", "Cut from a longer conversation"),
    "levels": ("Levels", "Beginner → advanced, tier by tier"),
    "listicle": ("Listicle", "N things, counted through"),
    "personal_learning_epiphany": ("Personal Learning/Epiphany", "The moment something clicked"),
    "personal_update": ("Personal Update", "Here's what's new with me"),
    "problem_solution": ("Problem Solution", "Name the problem, hand over the fix"),
    "q_and_a": ("Q&A", "A question, answered"),
    "ranking_rating_tier_list": ("Ranking/Rating/Tier List", "Things placed in order or in tiers"),
    "reaction": ("Reaction", "Commentary on someone else's thing"),
    "scenario_hypothetical": ("Scenarios", "\"Imagine you're…\" played out"),
    "skit_humor": ("Skit/Humor", "Acted out for a laugh"),
    "tutorial": ("Tutorial", "Does the thing on screen"),
    "yap": ("Yap", "Unscripted talking straight to camera"),
    "raw-th": ("You on camera, nothing else", "One face, one take, no cuts to anything else"),
    "th-broll": ("You on camera + clips", "Face with cutaways to footage or screenshots"),
    "split-cinematic": ("Cinematic split-screen", "Face on one side, footage on the other, produced look"),
    "screen-demo": ("Screen recording + face", "Software or phone on screen, face in a corner or intercut"),
    "text-driven": ("Big text on screen", "Words carry it; face optional"),
    "vlog": ("Out in the world", "Handheld, on location, moving"),
    "clip": ("Podcast or interview clip", "Two or more people, cut from a longer recording"),
    "cinematic": ("Cinematic produced (no split)", "Full-frame produced footage, voiceover or on-camera"),
    "greenscreen": ("You in front of the picture", "Your face keyed over a screenshot, article or clip that stays up the whole time"),
}
ADDED = {"greenscreen": "Format Finder, Sep 2026"}
SUBSTRATE_NAMES = {   # Sandcastles fine labels, shown inside a collapsed layout as "what's on the top half"
    "visual_greenscreen": "Diagram or motion graphic",
    "notes_article_greenscreen": "Document, screenshot or article",
    "full_screen_hybrid": "Graphics that go full-screen",
    "office_room_yap": "Light overlays, mostly face",
    "split_screen": "Hard split, both halves live",
    "comparison_clone": "Two-panel comparison",
    "podcast_clips": "Podcast clip",
}

import re as _re

def _glob(pat, s):
    return _re.fullmatch(_re.escape(pat).replace("\\*", ".*"), s) is not None

def map_structure(sc):
    ft = (sc.get("format_type") or "").lower().strip()
    key = STRUCTURE_MAP.get(ft)
    if key is None:
        return None, f"UNMAPPED format_type={ft}"
    return key, f"format_type={ft}"

def map_layout(sc, overrides=None):
    cat = (sc.get("visual_layout_category") or "").lower(); typ = (sc.get("visual_layout_type") or "").lower()
    label = f"{cat}/{typ}"
    ov = (overrides or {}).get("layout_collapse")
    if ov:
        keep = ov.get("keep", [])
        if not any(_glob(k, label) for k in keep) and any(_glob(f, label) for f in ov.get("from", [])):
            return ov["to"], f"channel override → {ov['to']} ({label})"
    for pat, key in LAYOUT_MAP:
        if _glob(pat, label):
            if key in ("raw-th", "th-broll") and not ov:
                flav = (sc.get("format_flavor") or "").lower()
                if _re.search(r"screen[- ]record|mobile screen", flav):
                    return "screen-demo", f"screen-demo: format_flavor says screen recording ({label})"
            return key, label
    return None, f"UNMAPPED layout={label}"
```
