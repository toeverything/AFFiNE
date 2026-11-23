---
name: ste-writing
description: Rewrite prose (docs, READMEs, PR descriptions, error messages, release notes, comments, commit messages, changelogs - never code) into ASD-STE100 Simplified Technical English to remove "AI slop". Use when asked to make writing not sound like AI, make docs clear or plain, remove slop or fluff from text, enforce a controlled writing style, or write technical documentation that reads human. Two modes - strict (procedures, safety, error messages) and STE-flavored (general prose).
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# ste-writing

Write prose in ASD-STE100 Simplified Technical English. This applies to documentation, READMEs, pull-request text, error messages, release notes, changelogs, and comments. It does not apply to code, identifiers, or command syntax. It is not for marketing copy, essays, or anything that needs a voice. STE strips voice on purpose.

## Rules

WORDS
- Use one name for one thing. Do not call the same item by two different names.
- Use the short common word: start (not begin/commence/initiate), use (not utilize/leverage), help (not facilitate), make sure (not ensure), before (not prior to), after (not subsequent to), about (not regarding/concerning), get (not obtain/acquire), show (not demonstrate), also (not additionally/furthermore/moreover).
- Give each word one meaning. "fall" means to move down, not to decrease.
- No marketing adjectives: seamless, robust, powerful, cutting-edge, effortless, world-class, next-generation, revolutionary.
- American spelling.

VERBS
- Active voice. "the parser reads the file", not "the file is read by the parser".
- Use a verb for an action. "analyze the log", not "perform an analysis of the log".
- No stacked auxiliaries. Not "it is important to note that this may help to improve". Write "this improves X".
- No "-ing" main verb where a simple tense works.

SENTENCES
- One instruction per sentence. Max 20 words (instruction), max 25 (descriptive).
- No contractions. Use articles: a, an, the, this, these.

PUNCTUATION
- No semicolons. Write two sentences.
- No em dash and no en dash. Use a period, a comma, or a colon. STE itself does not ban the em dash. This install bans it because it is a reliable AI tell.

STRUCTURE
- One topic per paragraph, max six sentences. For steps, use a numbered vertical list, one action per item, imperative form. Put a condition before its command.

Write only the requested text. No preamble, no summary, no closing remarks.

## Modes

- **strict** - procedures, runbooks, safety text, error messages: apply every rule and both length caps.
- **STE-flavored** - general prose (READMEs, PR descriptions, docs): apply the sentence, paragraph, active-voice, and no-phrasal-verb discipline. Relax the ~900-word dictionary lockdown so the text keeps enough range to read naturally.

Default to STE-flavored. Use strict when the text tells a person what to do, or when a mistake costs something.

## Self-lint (run before returning text)

1. Any sentence over 20 words? Split it.
2. Any semicolon? Replace with a period.
3. Any em dash or en dash? Replace it.
4. Any contraction? Expand it.
5. Any passive voice with a known actor? Make it active.
6. Any "-ing" main verb, nominalization ("perform an analysis"), or phrasal verb ("spin up")? Replace with a plain verb.
7. Same thing named two ways? Pick one name.

## The linter

`scripts/ste-lint.py` checks the machine-checkable subset. It is deterministic. The score is violations per 100 words, and lower is cleaner.

Lint a file:

```
python3 .agents/skills/ste-writing/scripts/ste-lint.py your-draft.md
```

Lint from a pipe:

```
cat draft.md | python3 .agents/skills/ste-writing/scripts/ste-lint.py
```

Piped input prints full JSON: per-check counts, per-100-word rates, the longest sentence, and sample hits. File arguments print one summary line per file and accept globs.

Use it like this:

1. Lint the draft. Record the score.
2. Rewrite the text with the rules above.
3. Lint again. The delta between the two scores is the signal.

Do not chase a score of zero. A quoted error string or a proper noun can trip a check and still be correct.

## Scope limits

The mechanical rules are lintable, and they are what removes slop. Full STE also needs human judgment: the right technical noun, and whether a sentence makes good sense. A checker cannot certify that, and slop is not about that. This skill fixes the FORM of slop. It cannot make a hollow paragraph true.

## References

- `references/before-after-samples.md` - real baseline output next to STE output.
- `references/experiment-results.md` - the cross-model test, 6 tasks x 4 conditions.

Free official standard (do not paste it in full, it is copyrighted): https://asd-ste100.org

Source: github.com/woosal1337/blog, `videos/ep01-the-cure-for-ai-slop`.
