# Personal Brand Positioning Pack

Kallaway's "first 2–3 days" positioning & strategy work — the three questions and the four Personal Brand Pillars — as eight Claude skills that produce a one-page visual canvas. Requires the Sandcastles MCP: one step finds 10–15 competitors and deep-analyzes 2 relevant videos each, and three of the four pillars are built from what those videos actually say.

## The flow

| Step | Skill | What the user gets |
|---|---|---|
| 0 | `brand-positioning` | Orchestrator — reads the `brand-positioning/` folder, routes, and at the end renders the **Personal Brand Positioning Canvas** (`assets/canvas-template.html` is the layout reference, filled with Kallaway's own positioning as the worked example) |
| 1 | `brand-game-interviewer` | Opens by asking for an existing channel (free Sandcastles read of what they've posted), then Q1 + Q2 — which game (Mass Reach vs Efficient Conversion), the ideal viewer, a ranked pain-point bank, the Avatar Filter, the Target Authority Statement → `strategy.md` + Game Board visual |
| 2 | `competitor-scout` | The data pull (the only step that spends credits) — asks for any competitor URLs the user already knows (user-validated, never screened), fills the rest of the 10–15 with Sandcastles discovery, one confirmation to add them to the watchlist, picks the 2 most relevant top videos per channel (skips brand deals — engagement far below the channel's own normal — and off-niche videos), one credit bill, deep-analyzes them → `competitors.md` (one fingerprint per channel: breadth, topics, substance, avatar, formats, visuals, stated beliefs, specimens) |
| 3 | `niche-bullseye` | Pillar 1 — five rings of category scope, every scouted competitor placed on a ring from its fingerprint, "you today" vs "you target" if they have a channel, the "one notch narrower" push, expansion path → `niche-bullseye.md` + Bullseye visual |
| 4 | `contrarian-vault` | Pillar 2 — the niche's common beliefs (from what competitors say on camera), the user's disagreements, 3–5 macro contrarian frames, a living vault with "vault this" mode → `contrarian-vault.md` + Frame Tree visual |
| 5 | `brand-associations` | Pillar 3 — the 1–3 "Adwords for the brain" keywords, say-list, people/objects/environment → `associations.md` (draft) + Association Map visual |
| 6 | `uniqueness-mapper` | Pillar 4 — the scouted competitors × Topic / Substance / Avatar / Format / Visuals scored from the fingerprints, white space, the user's stake → `uniqueness-map.md` + Whitespace Grid visual |
| 7 | `formula-lab` | Phase 1 — content formula = topic + format + visual layout. Tags the user's own existing videos as the baseline row first (if they have a channel), then mines the niche's formulas from the analyzed pool (free) with a recommended, gated deepen of the Ring 1–2 competitors (5 more relevant videos each, ~15–25 credits) so their real recurring formulas show; drafts the test palette (3–4 topics × 1–3 formats × 1–2 layouts), a two-batch plan that covers it in ~12–14 videos, and the four-judge scorecard (performance · viewer fit · enjoyment · visual pride) with an ongoing scoring mode that auto-fills performance from the user's verified channel → `formulas.md` + `formula-scorecard.md` + Formula Map visual |

Every skill: one question at a time, reflect-back after every answer, voice-first, beginner glosses. Credits are spent in two places, each once, after a visible bill and an explicit yes — the Competitor Scout (~2 per competitor, ~20–30 for the set) and the Formula Lab's deepen of direct competitors (~15–25). Already-analyzed videos are free, and no skill re-bills for them. One CTA for the whole pack, delivered by the orchestrator at the close.

## What changed in v1.1 (2026-09-17, after the Marcus Reyes cold run)

Three skills patched; five untouched (`niche-bullseye`, `contrarian-vault`, `brand-associations`, `uniqueness-mapper`, `formula-lab`). Each patched SKILL.md carries a one-line version note under its title.

- `brand-game-interviewer` — the unfair-advantage question is now Block 4, before the Target Authority Statement (Block 5), so the [Z way] slot is drafted from the user's actual mechanism instead of guessed from pain points.
- `competitor-scout` — brand-deal screen is relative to the channel's own engagement (half its median as the floor), not an absolute 2%; the one credit bill can carry the Formula Lab's deepen as a second line so a user pays once; it names the Sandcastles workspace before adding channels and offers to switch; discovery calls run one at a time and the user is told not to run other Sandcastles chats while the queue drains (rate limits are per account); an analysis that lands off-niche is "counted, not used."
- `brand-positioning` — the requirements check names the workspace; the one-chat guidance matches reality (own chat per skill is best, one sitting works with no concurrent Sandcastles chats and canvas-only mode); **canvas-only mode** skips the six per-step visuals when the orchestrator drives the whole flow; the canvas spec now requires "built <date>," a "Do this next" strip, embedded Sandcastles thumbnails with outlier badges linking to the original post, a hollow "YOU (today)" marker even when the channel isn't in Sandcastles, the four-part explainer on every structure/layout label, and no "worked example" badge on a real run.

Known, not fixed (see the cold-run fix list): no cadence question anywhere in the pack, so the Lab's batch plan assumes one; the Vault's board can't show beliefs nobody in the pool argues; the `reveal` structure (a finished space, one spoken line) fit 13 of 52 videos and is not in the shared taxonomy yet.

## Worked example

`brand-positioning/assets/example-run/` is a complete real run on @kallawaymarketing (Sep 2026): every step file, `competitors.md` (17 channels, 118 analyzed videos), `formula-map-data.md` (167 tagged videos), and `canvas.html`. Skills read it as the quality bar.

## Install

Drop each folder into your skills directory (same layout as the Growth Starter Pack). The orchestrator's `assets/` folder must travel with it.
