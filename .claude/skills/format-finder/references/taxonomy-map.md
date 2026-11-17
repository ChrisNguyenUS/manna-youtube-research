# Taxonomy — Sandcastles' own formats and editing styles

The report speaks Sandcastles' language. Rows are Sandcastles **Formats** (the blue Collections:
`analysis.format_type`, one row per label, named exactly as the Collections page names them). Columns are
Sandcastles **Editing Styles** (the purple Collections: `analysis.visual_layout_category/type`), bucketed
where the styles are too granular to be columns, always under Sandcastles' own names and category labels.

`scripts/classify.py` executes the python block at the bottom, so this file is the classifier. Nothing is
re-keyed by hooks or narrative text: the Sandcastles label decides. An unknown label is printed as `UNMAPPED`
and falls to `other` — extend the tables here, never the script.

## Formats (rows) — `format_type` → Collection name

| `format_type` | Collection name | What it is (one line for the explainer) |
|---|---|---|
| `about_me_origin_story` | About Me | Who I am and how I got here |
| `a_vs_b_comparison` | A vs B Comparison | Two options set against each other |
| `breakdown_explainer` | Breakdowns / Explainers | Takes one thing apart step by step |
| `case_study` | Case Studies | One real example, and why it worked |
| `challenge` | Challenge | "I tried X for N days" |
| `common_trap_mistake` | Common Trap/Mistake | Most people do this wrong; here's the fix |
| `day_in_the_life` | Day In The Life | A day, start to finish |
| `episodic_series_social_show` | Episodic Series/Social Show | One episode of a running show |
| `heros_journey` | Hero's Journey | A struggle, a turn, a win |
| `interview_clips` | Interview Clips | Someone else answering, cut from a longer talk |
| `levels` | Levels | Level 1 to level N, each one better than the last |
| `listicle` | Listicle | N things, counted through |
| `personal_learning_epiphany` | Personal Learning/Epiphany | The moment I realized something |
| `personal_update` | Personal Update | Here's what just happened to me |
| `problem_solution` | Problem Solution | Here's the problem, here's the fix |
| `q_and_a` | Q&A | One question, answered |
| `ranking_rating_tier_list` | Ranking/Rating/Tier List | Things ranked best to worst |
| `reaction` | Reaction | Watching something and responding to it |
| `scenario_hypothetical` | Scenarios | "Imagine this situation" |
| `skit_humor` | Skit/Humor | Acted out for a laugh |
| `tutorial` | Tutorial | Does the thing on screen, step by step |
| `yap` | Yap | One take, talking it out, no script |

Rows appear in the matrix only when at least one video in the pulled pool (in-niche or next door) carries
the label; the rest are listed in the explainer section as "in Sandcastles' taxonomy, none in this pool".

## Editing styles (columns) — `visual_layout_type` → bucket, under Sandcastles' category

Match on the type first (that is how the Collections page is organized — one card per type, category as
the subtitle), then on the category alone.

| Bucket (column) | Category | Sandcastles types folded in | What it is |
|---|---|---|---|
| Office/Room Yap | Studio/Set | `office_room_yap`, `whiteboard`, `other/other` | One face talking in a room; a whiteboard counts |
| Car Yap | Studio/Set | `car_yap` | Talking to camera from the driver's seat |
| Podcast Clips | Studio/Set | `podcast_clips` | Cut from a longer recorded conversation |
| Full Screen/Hybrid | Studio/Set | `full_screen_hybrid` | Face, then full-screen cutaways to footage or screens |
| Split Screen | Studio/Set | `split_screen`, `comparison_clone` | Face on one side, the thing on the other; the clone effect too |
| Visual Greenscreen | Greenscreen | `visual_greenscreen` | Face keyed over a clip or screenshot that stays up |
| Notes/Article Greenscreen | Greenscreen | `notes_article_greenscreen` | Face keyed over a doc, notes app or article |
| Reaction | Greenscreen | `reaction` (any category) | Face beside or over the clip being reacted to |
| Faceless | Faceless | `faceless_visual_explainer`, `faceless_clipping`, `faceless_animation`, `faceless_reaction_explainer`, `faceless_physical_explainer`, `faceless_text_conversation`, `faceless_gameplay_narration` | No face: footage, text, animation or clips with voiceover |
| Vlog | In-World (Vlog) | `vlog_hybrid`, `vlog_interactive`, `vlog_reflective`, `vlog_pov`, `vlog_music`, `vlog_timelapse`, `man_on_street_single`, `man_on_street_multiple` | Out in the world, on location |
| Skit | In-World (Skit) | `skit_solo`, `skit_group`, `skit_lip_sync`, `skit_transformation` | Acted on location |
| Stop-Motion | Other | `stop_motion` | Frame-by-frame |

Why these buckets: Sandcastles' 30 editing styles are one card each; a 30-column matrix is unreadable and
most cards would be empty in any one niche. The buckets keep every Sandcastles card name visible (the cell
detail lists the exact types inside a cell) while the columns stay at the level a creator actually chooses
between: room, car, podcast, cutaways, split, greenscreen (three kinds), faceless, out in the world, skit.

Car Yap sits under Studio/Set on the Collections page even though the analysis payload categorizes it as
`in_world_vlog`; the column follows the Collections page.

<!-- MACHINE-READABLE — classify.py and build_matrix.py import this block. Keep the tables and this block in sync. -->
```python
FORMATS = [  # (format_type, Collection name, one-line what-it-is)
    ('breakdown_explainer', 'Breakdowns / Explainers', 'Takes one thing apart step by step'),
    ('listicle', 'Listicle', 'N things, counted through'),
    ('case_study', 'Case Studies', 'One real example, and why it worked'),
    ('tutorial', 'Tutorial', 'Does the thing on screen, step by step'),
    ('ranking_rating_tier_list', 'Ranking/Rating/Tier List', 'Things ranked best to worst'),
    ('a_vs_b_comparison', 'A vs B Comparison', 'Two options set against each other'),
    ('reaction', 'Reaction', 'Watching something and responding to it'),
    ('problem_solution', 'Problem Solution', "Here's the problem, here's the fix"),
    ('q_and_a', 'Q&A', 'One question, answered'),
    ('personal_learning_epiphany', 'Personal Learning/Epiphany', 'The moment I realized something'),
    ('common_trap_mistake', 'Common Trap/Mistake', "Most people do this wrong; here's the fix"),
    ('about_me_origin_story', 'About Me', 'Who I am and how I got here'),
    ('levels', 'Levels', 'Level 1 to level N, each one better than the last'),
    ('scenario_hypothetical', 'Scenarios', '"Imagine this situation"'),
    ('day_in_the_life', 'Day In The Life', 'A day, start to finish'),
    ('challenge', 'Challenge', '"I tried X for N days"'),
    ('personal_update', 'Personal Update', "Here's what just happened to me"),
    ('episodic_series_social_show', 'Episodic Series/Social Show', 'One episode of a running show'),
    ('skit_humor', 'Skit/Humor', 'Acted out for a laugh'),
    ('heros_journey', "Hero's Journey", 'A struggle, a turn, a win'),
    ('interview_clips', 'Interview Clips', 'Someone else answering, cut from a longer talk'),
    ('yap', 'Yap', 'One take, talking it out, no script'),
]
LAYOUTS = [  # (bucket key, column name, Sandcastles category, one-line what-it-is)
    ('office_room_yap', 'Office/Room Yap', 'Studio/Set', 'One face talking in a room; a whiteboard counts'),
    ('car_yap', 'Car Yap', 'Studio/Set', 'Talking to camera from the driver\'s seat'),
    ('podcast_clips', 'Podcast Clips', 'Studio/Set', 'Cut from a longer recorded conversation'),
    ('full_screen_hybrid', 'Full Screen/Hybrid', 'Studio/Set', 'Face, then full-screen cutaways to footage or screens'),
    ('split_screen', 'Split Screen', 'Studio/Set', 'Face on one side, the thing on the other; the clone effect too'),
    ('visual_greenscreen', 'Visual Greenscreen', 'Greenscreen', 'Face keyed over a clip or screenshot that stays up'),
    ('notes_article_greenscreen', 'Notes/Article Greenscreen', 'Greenscreen', 'Face keyed over a doc, notes app or article'),
    ('reaction', 'Reaction', 'Greenscreen', 'Face beside or over the clip being reacted to'),
    ('faceless', 'Faceless', 'Faceless', 'No face: footage, text, animation or clips with voiceover'),
    ('vlog', 'Vlog', 'In-World (Vlog)', 'Out in the world, on location'),
    ('skit', 'Skit', 'In-World (Skit)', 'Acted on location'),
    ('stop_motion', 'Stop-Motion', 'Other', 'Frame-by-frame'),
]
# visual_layout_type → bucket (type first)
LAYOUT_BY_TYPE = {
    'office_room_yap': 'office_room_yap', 'whiteboard': 'office_room_yap', 'other': 'office_room_yap',
    'car_yap': 'car_yap', 'podcast_clips': 'podcast_clips', 'full_screen_hybrid': 'full_screen_hybrid',
    'split_screen': 'split_screen', 'comparison_clone': 'split_screen',
    'visual_greenscreen': 'visual_greenscreen', 'notes_article_greenscreen': 'notes_article_greenscreen',
    'reaction': 'reaction',
    'faceless_visual_explainer': 'faceless', 'faceless_clipping': 'faceless', 'faceless_animation': 'faceless',
    'faceless_reaction_explainer': 'faceless', 'faceless_physical_explainer': 'faceless',
    'faceless_text_conversation': 'faceless', 'faceless_gameplay_narration': 'faceless',
    'vlog_hybrid': 'vlog', 'vlog_interactive': 'vlog', 'vlog_reflective': 'vlog', 'vlog_pov': 'vlog',
    'vlog_music': 'vlog', 'vlog_timelapse': 'vlog', 'man_on_street_single': 'vlog', 'man_on_street_multiple': 'vlog', 'man_on_street': 'vlog',
    'skit_solo': 'skit', 'skit_group': 'skit', 'skit_lip_sync': 'skit', 'skit_transformation': 'skit',
    'stop_motion': 'stop_motion',
}
# visual_layout_category → bucket (fallback when the type is unknown)
LAYOUT_BY_CATEGORY = {'studio_set': 'office_room_yap', 'greenscreen': 'visual_greenscreen', 'faceless': 'faceless',
                      'in_world_vlog': 'vlog', 'in_world_skit': 'skit', 'other': 'office_room_yap'}
# combos that cannot physically exist — never white space
INCOMPATIBLE = {
    ('reaction', 'office_room_yap'), ('reaction', 'car_yap'), ('reaction', 'vlog'), ('reaction', 'skit'),
    ('tutorial', 'podcast_clips'), ('tutorial', 'skit'),
    ('skit_humor', 'podcast_clips'), ('skit_humor', 'faceless'), ('skit_humor', 'visual_greenscreen'), ('skit_humor', 'notes_article_greenscreen'), ('skit_humor', 'reaction'),
    ('challenge', 'podcast_clips'), ('challenge', 'notes_article_greenscreen'), ('challenge', 'reaction'),
    ('day_in_the_life', 'podcast_clips'), ('day_in_the_life', 'split_screen'), ('day_in_the_life', 'visual_greenscreen'), ('day_in_the_life', 'notes_article_greenscreen'), ('day_in_the_life', 'reaction'),
    ('interview_clips', 'car_yap'), ('interview_clips', 'skit'), ('interview_clips', 'faceless'),
    ('yap', 'podcast_clips'), ('yap', 'faceless'), ('yap', 'reaction'),
}
```
