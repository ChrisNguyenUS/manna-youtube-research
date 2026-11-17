# Hook Playbook kit

Turn your Sandcastles Hook Genius report into a page that tells you exactly which hook shapes work on your channel, why, and writes new hooks for any topic using that logic.

## What's in this folder

- `hook-playbook.skill`: the skill, packaged. Drop this into Claude and click Save skill.
- `hook-playbook/SKILL.md`: the same skill as a plain folder, for Claude Code or a Cowork skills directory.
- `hook-playbook/references/example-page.html`: a finished playbook built from a real channel's report, so you can see what you'll get. Open it in any browser. (The generator inside it runs in template mode outside Claude; the live version asks Claude for hooks.)
- `prompt.txt`: the one message to send Claude once everything is set up.

## Setup, once

1. **Connect Sandcastles to Claude.** Go to sandcastles.ai/mcp and follow the steps. When it's done, Claude can read your reports and videos. Reading costs no credits.
2. **Install the skill.** In Claude (web, desktop, or Cowork), add `hook-playbook.skill` from this folder and save it. In Claude Code, copy the `hook-playbook` folder into your skills directory instead.
3. **Run a Hook Genius report in Sandcastles.** Open Sandcastles, go to Reports, create a report of type "Hook Genius", point it at your own channel, and run it. It takes one to two minutes. It needs your channel's videos analyzed in your workspace; under about 25 analyzed videos gives a thin report, so analyze more first if you're below that.

## Every time you want a playbook

Open a new Claude conversation and paste the contents of `prompt.txt` (or just say "run my hook playbook"). Claude will:

1. find your newest Hook Genius report and read it,
2. send you a short summary with the numbers and two or three questions (answer them or say "go"),
3. pull the real hook line and outlier score for every video the report references,
4. recompute the numbers, check the report's claims against them, and dig out what separates your 40x hook from your 1x hook inside the same shape,
5. build and publish the page: leaderboard, plays, traps, rules with numbers, a pre-flight checker, and the generator.

Total time is usually five to ten minutes. Zero Sandcastles credits.

## Using the page

- **Leaderboard**: hover a dot for the hook, click it to watch the video.
- **Check a hook**: paste a hook before you record it. Instant, no AI, flags the trap patterns your own channel proved.
- **Generate hooks**: type a topic, hit Generate. The first time, Claude asks you to allow the page to use Claude on your account. After that it's one click and 10 to 40 seconds. Regenerate gives a fresh set. Copy puts a hook on your clipboard.

Re-run the whole thing whenever you've posted another 20 or 30 videos; the shapes that win drift as your channel and audience change.
