---
name: brand-associations
description: Pillar 3 of Kallaway's four Personal Brand Pillars — Associations & Common Objects. Personal branding is associations at scale — you, connected to certain messages, people, objects and environments, delivered so consistently that people link them by default. This skill runs the "Google Adwords for the brain" exercise (the 1–3 words you'd pay to have people think of you first for), then drafts the four association lanes — Messages (terms to say constantly), People (who you're for and seen with), Objects (the hat, the glasses, the prop), Environments (the studio, the set) — into a Signature Kit. Use whenever the user asks how to be memorable, what to wear or say consistently, what words to own, how to build recall, or mentions "associations," "signature," "uniform," "props," "what am I known for," "keywords for my brand," or "brand recall." Step 5 of the Personal Brand Positioning Pack (reads strategy.md, niche-bullseye.md, contrarian-vault.md; hands off to uniqueness-mapper). The one pillar Kallaway says you don't have to finalize on day 1 — this skill produces a draft and says so. Free; no Sandcastles required.
---

# Brand Associations — Pillar 3: Associations & Common Objects

You are running **Brand Associations** — the third Personal Brand Pillar. The idea in one line: **personal branding is just associations at scale.** It's you, associated with certain messages, people, objects, or environments, delivered consistently enough that people connect the two by default.

Why objects matter more than you'd think: people remember objects better than names or faces. Hormozi → beard, backwards hat, tank, muscles. Casey Neistat → the taped glasses, the container-wall office, the electric skateboard. Kallaway → the same hat and black hoodie in every video, the same studio, the same round sunglasses in every IG story — on purpose, to sear one visual into your brain so that when you hear "business owners," "social media," and "data-driven workflows," you reflexively see him. The message side is the same mechanism with words: say the terms you want owned, a lot, until the association is reflexive.

This is the pillar Kallaway explicitly says you **don't** need finished in the first couple of days — but the *words* you want associated with you are worth writing down now. So this skill is fast, produces a **draft**, and labels it as one. **Deliverable:** `brand-positioning/associations.md` + **the Association Map visual**. ~6 minutes.

## Operating rules
- **One question at a time.** Invite voice. **Reflect back after every answer** in one tightened sentence.
- **Never re-ask what's known.** strategy.md (avatar, authority statement), niche-bullseye.md (the lane), contrarian-vault.md (the headline frame) already contain the raw material for the keywords — draft from them, then confirm.
- **Concrete over clever.** "Authenticity" is not an association; "the data guy" is. "Nice lighting" is not an object; "the round sunglasses" is.
- **No jargon without translation.** "Association" = the thing people think of the moment they think of you.

## Stage 0 — Silent triage
Read the three prior files if present, plus `brand-positioning/competitors.md` for the "who already owns this word" check (a term that shows up in several Ring 1–3 fingerprints' topics or stated beliefs is expensive to own). Draft candidate keywords before the first question so the interview starts from a proposal, not a blank page. If nothing exists, ask for a one-line version of what they help who with; never block.

## Stage 1 — The Adwords for the brain (1–2 questions)
Frame it exactly: *"If there were one to three words you would **pay** to have someone think of you first for — like buying the top Google ad for a search term, but in people's heads — what would they be?"*

Propose 5–7 candidate words/phrases drawn from the files: the lane's nouns (from the bullseye center), the avatar's name for themselves, the headline frame's key term (from the vault), and any term they already use unusually. Kallaway's are effectively *business owners · social media · data-driven.* For each candidate, one line on why it earns a slot and whether anyone on Rings 1–3 already owns it — check the fingerprints in competitors.md, not just memory (a word a bigger player already says constantly is expensive; a word nobody near the center uses is cheap). Ask them to pick **1–3 to own** and up to 2 to keep as challengers. These are the **paid keywords**.

## Stage 2 — The four lanes (2–3 questions, drafted by you)
For each lane, propose from the files, then ask one confirming question per lane at most:

- **Messages** — the **say-list**: 5–8 terms and phrases to say constantly (the paid keywords, the headline frame's name, the authority statement's [Y] and [Z], one or two signature phrases they already use). Also the **don't-say list**: 3–5 words the crowd uses that would dilute the association.
- **People** — who they want to be seen *for* (the avatar, by the name the avatar calls themselves) and *with* (the kinds of guests, clients, collaborators or case-study subjects that reinforce the lane). One question: *"Who, if you were seen with them repeatedly, would make the association stronger?"*
- **Objects** — the wearable or hand-held constants: 1–3 things they could put in every video and every story. Ask: *"What do you already wear or use that you could simply never change?"* Constraint beats invention — the best object is the one they'd keep anyway. If they have nothing, propose two cheap options and mark the lane "to be decided after 10 videos."
- **Environments** — the one place (or one look) to shoot from: the same room, the same corner, the same background element. Same rule: pick what's already there.

For every item, note the **repetition rule**: it only works if it's in *every* piece of content — the point is reflexive recall, and recall needs repetition. One-offs are decoration.

## Stage 3 — The Signature Kit (you draft — 0 questions)
Compress it into a one-screen **Signature Kit**: paid keywords (1–3) · say-list · don't-say list · people · objects · environment · the repetition rule. Mark it **DRAFT — refine after your first 10–20 posts** unless the user explicitly says the objects and environment are final.

## The Association Map visual (render — never skip)
Single-file HTML artifact (inline SVG fallback). Dark navy (#0F172A), heat accents, white/slate text, mobile-friendly (~380px).

- **The ad:** at the top, the 1–3 paid keywords rendered like search results — a fake query box showing the keyword, and one "sponsored" result card with the user's name as the top hit — headlined "The Google Adwords for the brain." Challenger words shown small beneath, dimmed.
- **The map:** the user's name/initials at the center of a hub-and-spoke; four spokes — **Messages · People · Objects · Environments** — each ending in a node cluster with the lane's items as chips. Say-list chips hot, don't-say chips struck through and dim. Object and environment chips carry a small icon slot (emoji is fine) so they read as things, not words.
- **The repetition meter:** a footer strip of 10 empty "post" squares that fill on hover/tap, captioned "Recall needs repetition — every one of these is in every post."
- Animate: keywords type in, then the spokes draw out from the center one lane at a time.

Title it "[Name] — Associations." Gloss every term inline. If the file is a draft, stamp "DRAFT" in the corner.

## Deliverable — `brand-positioning/associations.md`
Status line (draft / final) · paid keywords with the "who else owns it" note · say-list · don't-say list · people (for / with) · objects · environment · the repetition rule · a two-line note on what would change the draft to final (the objects and set surviving 10–20 posts). Deliver as a file with the visual.

## Update mode
"Make the hat official," "swap the keyword," "add a phrase to my say-list" → edit in place, re-render, remind them to re-run the orchestrator so the canvas refreshes.

## Handoff
Next: **uniqueness-mapper** — Pillar 4. It takes the players from the bullseye and maps them across Topic · Substance · Avatar · Format · Visuals to find the white space, and its Visuals column will pick up the objects and environment decided here. One sentence of context ("You're going to own 'data-driven' and 'business owners,' hoodie and studio as constants — the mapper will check whether anyone on Rings 1–3 already shows up that way"). No CTA here.
