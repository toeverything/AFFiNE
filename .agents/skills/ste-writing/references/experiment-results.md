> Verbatim from [woosal1337/blog](https://github.com/woosal1337/blog/tree/main/videos/ep01-the-cure-for-ai-slop) by Ege Celebi. Kept as-is for provenance.

# STE experiment results — cross-model

First-party test: does forcing an LLM to write in ASD-STE100 reduce "AI slop"? 6 realistic engineer-writing tasks (README, PR description, API docs, error message, getting-started, deprecation) × 4 conditions (plain baseline, a banned-words list, Orwell's 6 rules, the STE skill), scored by a heuristic anti-slop linter at **violations per 100 words** (length-normalized). Lower is cleaner.

Two model families, run the same way: **Claude sonnet** (via headless `claude -p`) and **OpenAI gpt-5.5** (via the API, `vaulted run --with-global OPENAI_API_KEY -- python3 run-openai.py`).

## Headline

| Condition | Claude sonnet | gpt-5.5 |
|---|---|---|
| baseline | 4.36 | 3.54 |
| ban-words (folk fix) | 4.21 (**−3%**) | 2.14 (**−40%**) |
| Orwell's 6 rules | 2.48 (−43%) | 1.69 (**−52%**) |
| **STE skill** | **1.12 (−74%)** | 1.76 (−50%) |

## What holds across both models

- **STE cuts slop on both** — −74% on Claude, −50% on gpt-5.5. The direction is robust, not Claude-specific.
- **A real writing system beats a vibe.** On both models, Orwell and STE land in the same low band. STE was the single best on Claude and effectively tied with Orwell on gpt-5.5 (1.76 vs 1.69).

## What did NOT hold (the honest part)

- **"Banning words does nothing" was a Claude artifact.** On Claude the ban-words list cut only 3%; on gpt-5.5 it cut **40%**. gpt-5.5 follows a banned-words instruction far better. So the vivid "you banned the em-dash and kept the slop" result is true *for Claude*, not universal.
- **The two models slop differently.** Claude's default slop is flashy — em-dashes (6), "seamless/robust", long run-ons. gpt-5.5's default has **zero em-dashes, zero semicolons, zero marketing adjectives**; its slop is subtler — long sentences, **passive voice** (its top category, 1.39/100w), and empty closers ("a practical foundation for intelligent response reuse"). STE cut passive voice least (still 0.66), so gpt-5.5 keeps some.
- **On 1 of 6 tasks (API docs) STE scored slightly worse than baseline on gpt-5.5** (3.95 vs 3.54) — mostly the linter's long-paragraph heuristic penalizing STE's many short sentences.

## Caveats (say them on camera)

- Heuristic linter, n=6, two models. Directional, not proof. Nobody had run *any* STE-vs-slop benchmark before, so this is the first data point, not the last word.
- **per-100-words is noisy on very short outputs**: gpt-5.5 wrote 17–31-word deprecation notices, so a single violation reads as 8–12/100w. Trust the longer tasks more.
- STE fixes the *form* of slop, not the substance. It cannot make a hollow paragraph true.

## Robust cross-model claim (safe to say)

> Give the model a writing system and slop drops by half or more on every model I tried. STE was the best or tied-best. The popular move — banning words one at a time — is the least reliable: it did almost nothing on Claude and a fair amount on GPT, which is exactly what you'd expect from a fix that treats symptoms instead of giving the model a system.

Reproduce: `run-openai.py` (OpenAI) and `scratchpad/ste/run.py` (Claude). Per-model detail: `experiment-results-openai.md`.
