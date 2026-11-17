# Feature glossary

All features are measured on the **closing CTA block** — the last line containing
`comment "KEYWORD"` plus up to three preceding setup lines that introduce the
magnet ("I put together…", "To make this easier…") — unless noted.

## Metrics
| field | meaning |
|---|---|
| `leads` | `comments ÷ 2` — one viewer comment + one auto-reply per lead |
| `conv` | leads per 1,000 views — the number every comparison uses |
| `script_visible` | true when a transcript exists or the caption is 8+ lines (i.e. the caption is the script). Caption-only videos are benchmarked but excluded from feature tests |

## Structure
| feature | meaning | why it's here |
|---|---|---|
| `mentions` | number of script lines containing a keyword CTA | a second ask catches people who forgot the first |
| `placement` | `bookend` (first 3 lines + last 4), `end_only`, `hook_only`, `mid`, `caption_only`, `none` | where the ask lands relative to attention |
| `imperative` | final CTA line starts with "Comment" | an order vs an offer |
| `conditional` | final CTA line starts with "If you…" | gives the viewer an exit |
| `cta_words` / `final_line_words` / `cta_lines` | length of the block / last sentence | tests the "keep it short" folk wisdom |

## The promise
| feature | meaning |
|---|---|
| `magnet` | what is promised: `video` (deep dive, breakdown, training), `doc_guide` (doc, guide, playbook, PDF, template, checklist), `database` (database, library, swipe file, vault), `claude_skill` (skill file, plugin, GPT, prompt pack), `links_setup` (links, instructions, setup, download), `system` (system, framework, strategy, method), `offer_1on1`, `unspecified_it` ("I'll send it through"), `other` |
| `magnet_named` | magnet is a concrete category (not `unspecified_it` / `other`) |
| `quantified` | any number in the block ("47 hooks", "18 pages") |
| `tease_remainder` | "the other 7", "the rest", "N more" — the video covered part, the magnet has the rest |
| `with_examples` | the word "example" appears |
| `ai_feed` | "feed this into AI", mentions Claude/GPT |
| `for_free` | the word "free" |

## Wording
| feature | meaning |
|---|---|
| `send_style` | delivery verb on the final line: `through` ("send it through"), `to_you` ("send you", "send it to you", "DM you"), `over`, `get` ("get access"), `for` ("Comment X for my…"), `share`, `other` |
| `totality` | entire / whole / full / all / everything / complete |
| `exact` | exact / exactly |
| `possessive_my` | my / our |
| `effort` | "I put together / I built / I made / I spent" |
| `benefit` | "so you can", "to help you", "so you never have to" |
| `power_words` / `power_count` | curated list (cracked, killer, insane, secret, proven, viral, instantly, level up, ultimate, blueprint, …) |

## Keyword
| feature | meaning |
|---|---|
| `kw` | the most common keyword across caption + transcript |
| `kw_len`, `kw_short` (≤5 letters), `kw_is_number` | keyword shape |
| `kw_caps` | written in ALL CAPS in the caption |
| `kw_in_body` | keyword is also a word in the script body (a topic word vs an arbitrary token) |
| `kw_mismatch` | caption keyword ≠ spoken keyword — a lead leak; listed in the report's method section |

## Statistics used
- **Lift** = median conv with feature ÷ median conv without.
- **p** = two-sided Mann-Whitney U (rank test; robust to the viral-video outliers).
- **ρ** = Spearman rank correlation for numeric features.
- **Recipe** = up to 4 levers with lift ≥ 1.12, p < 0.2, ≥ 6 videos each side, ranked by p then lift. Score each video 0–k, group → the ladder. Trend p = Spearman(score, conv).
- **Confounds** = each recipe lever re-tested inside videos lacking the strongest lever; the strongest lever re-tested inside the two largest hook-style groups.
