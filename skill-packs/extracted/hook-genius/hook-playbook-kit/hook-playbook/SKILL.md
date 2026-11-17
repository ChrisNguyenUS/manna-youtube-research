---
name: hook-playbook
description: "Turn a creator's Sandcastles Hook Genius report into a visual, interactive Hook Playbook (a leaderboard of every hook shape by outlier multiple, the winning plays and losing traps with the real hooks and numbers behind each, a rules list where every rule carries its evidence, a pre-flight hook checker, and a topic-to-hook generator that writes new hooks from the channel's own logic). Use this whenever someone mentions a Hook Genius report, a Sandcastles hook report, asks which of their hooks work, what their hooks should look like, wants to build their hook playbook, wants hook rules derived from their own channel's data, or pastes a Sandcastles report execution UUID and asks what to do with it, even if they never say the word Sandcastles. Requires the Sandcastles MCP. Spends zero credits."
---

# Hook Playbook

You are turning one Sandcastles report into a page the creator will open every time they write a hook. The report already knows which hook shapes outperform on their channel. Your job is to (1) verify its numbers against the real videos, (2) find the second-order insights the report doesn't state, and (3) build a page that tells them exactly what to do and can write new hooks for any topic using that logic.

The end product is one self-contained HTML page, published as an artifact when the session can do that, with a generator inside it that asks Claude for hooks on demand.

## What you need before starting

**The Sandcastles MCP connected.** If the `mcp__sandcastles__*` tools aren't in the session, stop and send the person to sandcastles.ai/mcp to connect it, then continue. Nothing below works without it.

**A Hook Genius report that has already run on their own channel.** This is a report type inside the Sandcastles app, not something you can trigger from here. If they don't have one, tell them how to get it, in plain words:

1. In Sandcastles, go to Reports and create a new report of type "Hook Genius".
2. Point it at their own verified channel (it studies their videos, not competitors').
3. Run it. It usually finishes in one to two minutes. It needs the channel's videos to already be analyzed in their workspace; a channel with fewer than roughly 25 analyzed videos gives a thin report.
4. Come back and say "run my hook playbook" or paste the report link.

**Cost:** this whole workflow spends zero Sandcastles credits. Reading reports and reading video details are free. Do not call `analyze_video` during this skill; if a referenced video comes back unanalyzed, use its title and outlier score and move on.

## Step 1: Find the report

If the person gave you an execution UUID (a long id like `0e350cac-1b8b-...`, sometimes inside a Sandcastles URL), use it directly.

Otherwise call `list_reports` with `search: "Hook Genius"`. Entries carry `reference_name` (the report type, "Hook Genius"), `instance_name` (what they named that configured report, e.g. "My Hooks v2"), `status`, `finished`, and `execution_uuid`. Pick the newest run whose status is `succeeded`. If several instances exist, name them and ask which one, unless one is obviously the latest.

Then call `get_report_details` with that `execution_uuid`. A `queued` or `in_progress` status means wait and try again in a minute; `failed` means it won't produce data and `failure_reason` says why. Tell them plainly; don't treat it as your error.

## Step 2: Read the report and summarize it before building anything

The `data` payload has two arrays, `strategies` (the winning shapes) and `pitfalls` (the losing shapes). Each entry has:

- `title`: the shape, named as an instruction ("Promise impossible-to-skip instead of promising the outcome")
- `bullets`: 3 to 4 sentences: the mechanism, the evidence, why it works
- `example_hooks`: 3 hooks in the same shape written for other topics
- `video_uuids`: the videos on the channel that use this shape (a video can appear under more than one shape)
- `median_outlier`: the median outlier multiple across those videos (1.0 = a normal video for this channel)

Read all of it. Then send the person a short summary before you build, so they can redirect you. Format it as short bullets with the number beside each claim, ranked by median, winners then traps, followed by one sentence naming the pattern underneath all of them, then two or three follow-up questions worth discussing. Keep the summary under 250 words. People who run this skill are usually creators who want the answer, not a narration of the JSON.

## Step 3: Pull the real hooks and numbers for every referenced video

The report gives medians and prose. The page needs the actual hook lines and scores, because "the reason your videos don't hold attention is because you're using the wrong story arc, 18.2×" is what makes a rule believable.

Collect every `video_uuid` across all strategies and pitfalls, dedupe them, and call `get_video_details` for each. From each response keep only:

- `video.uuid`, `video.outlier_score`, `video.view_count`, `video.comment_count`, `video.platform_url`, `video.published_at`
- `analysis.spoken_hook` (the verbatim spoken opening line; fall back to the first sentence of `video.title` when the video isn't analyzed)
- `analysis.spoken_hook_madlib` (the fill-in-the-blank version), `analysis.spoken_hook_category`, `analysis.visual_layout_type`

Each response is a few thousand tokens. For more than about ten videos, hand the fetching to two or three subagents in parallel, each writing a compact JSON array of just those fields to a scratch file, then read the files. This keeps the full analysis blobs out of your context.

Keep hook text verbatim. Don't tidy grammar, don't shorten. A hook that says "You got to make your storytelling so good" is data; its awkwardness might be why it did 1.2×.

## Step 4: Recompute the numbers and check the report's claims

Never carry a number from the report's prose onto the page without checking it against the video data. In practice:

- Recompute each shape's median from the real `outlier_score`s. It should match `median_outlier`; if it doesn't, use yours and say so.
- Find the true top videos by raw outlier across the whole set. Report prose sometimes says "the single highest performer in the dataset" about a video that is #3 by score. When that happens, use the real ranking on the page and tell the person in your hand-off. Don't silently repeat the report.
- Pool the winners (unique videos across all strategies) and the traps (unique videos across all pitfalls). Compute each pool's median outlier and average views. The gap between them is the headline number for the page ("winning shapes averaged 143K views per video, trap shapes 19K").
- Note videos that appear under two shapes and say so on the page, so the counts add up for a careful reader.

## Step 5: Mine the second-order insights

This is where the page earns its keep. The report says which shapes win. Your job is to find, inside each shape, what separates the 40× video from the 1× video that used the same shape. Sort each shape's videos by outlier and compare the top against the bottom on:

- **The subject word.** Is the top one about a specific craft (storytelling, hooks, thumbnails, emails) while the bottom one is about a category (content, engagement, growth)?
- **The scope of the destination** in transformation hooks. A whole role ("a social media machine") versus a sub-task ("a text hook machine").
- **The recognizability of the culprit** in diagnosis hooks. Something the viewer was taught and knows they do, versus a culprit they can't picture themselves committing.
- **Exact-line repeats and their dates.** The same hook posted twice usually shows the second run much smaller. That's a rule about shelf life, not about the shape.
- **The opener form.** How-to ("Here's how to") versus command ("You got to") versus question ("Do you want to").
- **Order of promise and name** in named-framework hooks. Does the name come after a sharp promise, or lead with nothing behind it?
- **A tension line** after a series label, or the label alone.
- **A number**, and whether its mechanism sits in the same sentence.
- **The visual** (`visual_layout_type`), when the top videos share one and the bottom ones don't.

Write two or three bullets per shape under "What your numbers add", each with the numbers in the sentence ("Storytelling 36.4×, a hook 17× and 4.8×, content 1.3×"). If a comparison is confounded (two things changed at once), say which two things; don't pretend one caused it.

From these, derive six to ten rules for the page. Each rule is one imperative sentence plus one line of evidence with numbers. A rule without a number next to it doesn't go on the page.

Also write a one-line thesis that covers all shapes at once. On most channels it lands near: winners make a promise that is specific and can't be disproven; losers make one that is vague or can be checked. Test it against the traps; if it doesn't explain them, find a thesis that does.

## Step 6: Build the page

One HTML file, all CSS and JS inline, no images. The only external resources allowed are Google Fonts stylesheets and scripts from cdnjs; everything else is blocked when published as an artifact. Design it as a tool the person will operate, not an essay: summary before detail, numbers big, hooks in a quote face, both light and dark themes from one token set, works at phone width with a 16px gutter and no horizontal scroll.

Load the `artifact-design` and `dataviz` skills if the session lists them, and `artifact-capabilities` for the generator, before writing the file. If `references/example-page.html` is bundled with this skill, read it once before you write: it is a finished page built from a real Hook Genius report and shows the working structure, the leaderboard CSS, the checker, and the generator code. Match its structure and mechanics, never its data; every number and hook on your page comes from the report you pulled. Then build these sections in this order:

**1. Thesis.** The one-line thesis as the headline. Underneath: pooled winners versus pooled traps (count, median, average views). Beside it, a 2×2 grid: specific ↔ vague across, can't-be-disproven ↔ can-be-checked down, with each shape placed in its cell with its median. This is the mental model; everything below is evidence for it.

**2. Stat tiles.** Four numbers: the biggest single video (multiple, views, and its hook), the best shape median, the views-per-video gap between winners and traps, the worst shape median.

**3. Leaderboard.** One row per shape (winners and traps together, sorted by median), one dot per video, horizontal position = outlier multiple on a log scale from about 0.4× to a bit past the top video, a dashed vertical line at 1.0× labeled "normal", a solid tick at each row's median. Winners one color, traps another, legend present. Position dots with CSS `left: <percent>%` inside a relative track so the chart is responsive without re-rendering. Stack identical values vertically. Hover or focus shows the hook, multiple, views, comments, date; click opens the video. Two colors only; run them through the dataviz palette validator for both themes.

**4. Anatomy of the top hook.** The single best hook, broken into its parts with a label under each part (opener / subject / quality / the promise), and one line saying what happened when each part was swapped in a sibling video.

**5. The plays**, one card per winning shape, ranked by median. Each card: rank, name, count, best video, median; the formula as a fill-in-the-blank line with the slots highlighted; "Why it works" (the mechanism in two sentences, from the report bullets); "Do this" (the rule you derived); "What your numbers add" (your Step 5 bullets); a collapsed table of the real videos (verbatim hook, multiple, views, date, watch link); and the report's `example_hooks` shown as "the same shape on other topics".

**6. The traps**, same card structure for each pitfall, worst first, with "Why it fails" and "Stop this". Point out which winning shape each trap is a broken version of; that's usually the most useful sentence on the card.

**7. The rules.** The six to ten rules, each with its evidence line.

**8. Pre-flight checker.** A textarea; as the person types, the page matches the hook against the shapes and flags the traps. No AI, instant, runs in the page. Write the detection as regexes derived from this report's shapes (use the `spoken_hook_madlib` values to see the fixed words each shape shares) and this report's pitfalls, plus these universal flags: a bare number with no mechanism word in the same sentence; a framework name ("it's called the", "I call this", "meet the") before any promise; a yes/no question opener; a hedge ("one of the best"); a category word as subject with no craft word; a command opener; an exclamation mark; over ~26 words. Each flag names the trap and quotes the channel's own number for it. The verdict is "Ships", "Fix first", or "No proven shape". Pre-fill the box with one of the channel's own trap hooks so the first look shows the checker working.

**9. Generator.** A topic field, an optional detail field, a Generate button, a Stop button, a mode badge. On Generate, ask Claude for ten hooks, two per winning shape, written for the topic, and render each as a card: shape chip, the hook in the quote face, one line on why it should work, the checker's verdict for that hook, and a Copy button.

Implement it with the artifact `sample` capability (`const sample = await claude.use("sample")`). Ask for one JSON object per line, no array, and parse lines as they stream in `onText`, adding a card per line so the person sees hooks arrive one at a time instead of waiting 30 seconds for a wall. Use `cache: false` so Regenerate gives new hooks, `modelTier: "default"`, a fresh `AbortController` per call for Stop, and branch on the error code: `cancelled` restores the UI, `not_granted` and its siblings hide the live mode, `rate_limited` tells them to wait a minute, `refused` clears and asks them to reword. When `sample` resolves null (no Claude runtime, for example the file opened locally), fall back to template mode: fill the formulas with the topic and leave the parts a template can't know as highlighted [brackets], and say so. Remember the last run in localStorage (wrapped in try/catch) and restore it on load. At rest, before any run, show ten hand-written example cards for a plausible topic in the person's niche, plainly labeled as an example.

The prompt you send is the page's whole brief compressed. Build it from the report data, not from memory, and include for each winning shape: the key, the median, the formula, the best real hook with its multiple, and the one-line rule from Step 5; for each trap: what it is and its numbers; a voice section (spoken, first person, 10 to 24 words, allowed openers, no hashtags, emojis, exclamation marks, em dashes, or questions, and "every hook must be specific to the topic, never a template with the topic pasted in"); the topic and detail; and the exact output contract: ten lines, one object per line, keys `shape`, `hook`, `why`, in a fixed shape order. A skeleton:

```
You write spoken opening lines (hooks) for short-form videos on [handle], a channel about [niche]. A Sandcastles analysis of [N] of the channel's own videos found [K] hook shapes that outperform and [M] that underperform. Write new hooks for the topic below using ONLY the winning shapes.

THE WINNING SHAPES (median outlier multiple vs the channel's typical video, plus the best real example):
1. [key] - [name] ([median]x). Formula: "[formula]". Best real hook: "[hook]" ([multiple]x). [rule from Step 5].
...
THE TRAPS (never do these):
A. [pitfall and its numbers]
...
VOICE: [as above]
TOPIC: [topic]
EXTRA DETAIL FROM THE CREATOR: [detail or none]
OUTPUT: exactly 10 lines, one JSON object per line, no array, no code fence, no other text. Two per shape in this order: [keys]. Keys: {"shape": "...", "hook": "...", "why": "one sentence, max 18 words, naming the mechanism"}
```

**10. Footer.** The source (report type, execution id, run date, number of videos) and a one-line definition of outlier multiple.

Give the page a `<title>` that is a name, like "[Handle] Hook Playbook", not a description. Before publishing, render it once (a local screenshot at desktop and phone width) and look specifically at the leaderboard: label collisions, dots outside the track, the 1× line in the right place. Fix what that one look shows, then publish.

## Step 7: Publish

In a session with the Artifact tool, publish the file with `capabilities: {sample: {}}` so the generator can ask Claude, an `icon` like "chart", and a one-sentence description. The artifact is private to the person until they share it; if they built it for a team, remind them of that.

Without the Artifact tool, deliver the HTML file itself. Tell them the generator runs in template mode when the file is opened outside the Claude viewer, because the live mode needs the Claude runtime the viewer provides.

## Step 8: Hand off

Two or three sentences: what the page is, and the one or two things they should know before using it. Always include any place where the report's prose and the real numbers disagreed, and the two or three second-order findings with their numbers (those are usually more actionable than the report itself). Say that the first Generate asks them to allow the page to use Claude on their account, after that it's one click. Don't recap every section; they can open the page.

## Things that make this go wrong

- Building before summarizing. The summary is where the person tells you what they actually want emphasized.
- Repeating a report claim ("the top video is X") without checking it against `outlier_score`. The prose can be off by a rank or two.
- Rewriting hook text. Use `spoken_hook` verbatim on the page and in the prompt.
- Rules without numbers. If you can't put a number beside a rule from this channel's data, it's an opinion, and it doesn't go in the rules list.
- Presenting the example generator cards as if the person generated them. Label them.
- Spending credits. Reading is free; analyzing is not; this skill only reads.
- Em-dash-heavy paragraphs in the page copy. Short sentences, numbers beside claims.
- A generic dashboard look. The page is about this channel's spoken lines; set the hooks in a quote face, make the numbers the loudest thing, and let the leaderboard carry the argument.
