# ste-writing

An installable Claude Code skill that rewrites prose into ASD-STE100 Simplified Technical English.

The aerospace industry published a controlled language in 1986 to make maintenance manuals clear to every reader.
The method is a fixed dictionary, one meaning for each word, active voice, and a maximum sentence length.
This skill packages the mechanical part of that standard for an agent to apply.
It also includes a linter, so you can measure the result.

Use it for documentation, READMEs, pull-request text, error messages, release notes, changelogs, and comments.
Do not use it for code, identifiers, or command syntax.
Do not use it for marketing copy or essays.
STE removes voice on purpose.

## Install

To install the skill for every project, clone it into your skills directory:

```
git clone https://github.com/1fc0nfig/ste-writing.git ~/.claude/skills/ste-writing
```

To keep the source somewhere else, clone it there and make a symbolic link:

```
git clone https://github.com/1fc0nfig/ste-writing.git ~/dev/ste-writing
ln -s ~/dev/ste-writing ~/.claude/skills/ste-writing
```

To install the skill for one project only, clone it into `.claude/skills/ste-writing` in that repository.

The skill loads at the start of the next session.
The linter needs Python 3.
There are no other dependencies.

## Use

Call the skill by name, or write a request that matches its description:

```
/ste-writing rewrite CONTRIBUTING.md
make this README sound less like AI
remove the slop from this pull-request description
```

## Modes

| Mode | For | Behavior |
|---|---|---|
| strict | procedures, runbooks, safety text, error messages | every rule, both length limits |
| STE-flavored | READMEs, pull-request descriptions, docs | sentence, paragraph, and voice rules, no dictionary limit |

STE-flavored is the default.
Use strict when the text tells a person what to do.

## The linter

`scripts/ste-lint.py` checks the part of the standard that a machine can check.
It gives the same result for the same text every time.
The score is violations for each 100 words.
A lower score is cleaner.

```
python3 scripts/ste-lint.py your-draft.md
cat draft.md | python3 scripts/ste-lint.py
```

A file argument prints one summary line for each file.
It also accepts globs.
Piped input prints full JSON:

- the count for each check
- the rate for each 100 words
- the longest sentence
- example matches

To measure a rewrite, do these steps:

1. Lint the draft and record the score.
2. Rewrite the text with the skill.
3. Lint the text again.

The difference between the two scores shows the improvement.

Do not try to reach a score of zero.
A quoted error string or a proper noun can cause a false violation.
The text is still correct.

The linter checks these items:

- Structure: sentences over 20 words, and paragraphs over 6 sentences.
- Punctuation: semicolons, em dashes, and en dashes.
- Verbs: passive voice, "-ing" main verbs, nominalizations, and phrasal verbs.
- Words: contractions, banned words, marketing adjectives, and hedges.

## Results

The upstream experiment ran 6 writing tasks in 4 conditions.
The unit is violations for each 100 words.

| Condition | Claude Sonnet | gpt-5.5 |
|---|---|---|
| baseline | 4.36 | 3.54 |
| banned-words list | 4.21 (-3%) | 2.14 (-40%) |
| Orwell's 6 rules | 2.48 (-43%) | 1.69 (-52%) |
| STE skill | 1.12 (-74%) | 1.76 (-50%) |

A writing system reduced slop by half or more on each model in the test.
A banned-words list is the least reliable method.
For the full run, read `references/experiment-results.md`.
For real output, read `references/before-after-samples.md`.

## Changes from upstream

This repository packages the upstream skill file as an installable skill.
The rules are the original work.
These are the changes:

1. Repository layout: `SKILL.md` at the root, the linter in `scripts/`, and the test data in
   `references/`.
2. Frontmatter: this version adds `allowed-tools`. It also makes the description wider, so more
   requests start the skill.
3. Punctuation: this version bans the em dash and the en dash. The upstream file records that STE
   permits them and leaves the decision to the reader. This version makes the decision, because
   the em dash is a common marker of AI text.
4. Documentation: this version describes the linter in `SKILL.md`. Upstream describes the linter
   in the README only. An agent that reads the skill file alone does not learn that the linter
   exists.
5. Modes: this version states a default mode.

## Scope limits

A machine can check the mechanical rules, and those rules remove the slop.
Full STE also needs human judgment: the correct technical noun, and whether a sentence makes good sense.
The linter cannot certify those.
This skill corrects the FORM of slop.
It cannot make an empty paragraph true.

This is not a certified ASD-STE100 checker.

## Credits

Ege Çelebi ([@woosal1337](https://github.com/woosal1337)) wrote the rules, the linter, and the experiment data.

- Source: [woosal1337/blog, `videos/ep01-the-cure-for-ai-slop`](https://github.com/woosal1337/blog/tree/main/videos/ep01-the-cure-for-ai-slop)
- Video: [The cure for AI slop is a 1986 aircraft manual](https://www.youtube.com/watch?v=uJblcC4lKYw)
- Standard: [ASD-STE100](https://asd-ste100.org), free to download

## License

MIT.
Read `LICENSE`.
This version keeps the upstream copyright and adds a second notice for the changes.