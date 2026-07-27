# affine-cli — Agent Skills

Portable **Agent Skills** that teach an AI coding agent how to drive `affine-cli` to create and edit
AFFiNE notes and edgeless diagrams. These ship **with the tool** (versioned alongside the crate) and are
**model- and harness-agnostic**: a skill is just a directory with a `SKILL.md` (Markdown + YAML
frontmatter), which is the open "Agent Skills" convention understood by Claude Code, Cursor, Codex,
Windsurf, and the [skills.sh](https://skills.sh) ecosystem. Nothing here depends on a specific agent — the
skill only instructs the agent to run the `affine-cli` binary.

```
tools/affine-cli/skills/
└── affine/
    ├── SKILL.md       # name + description (the agent reads this to decide when to load) + quick start
    └── REFERENCE.md   # full command/flag/JSON reference + diagram --spec schema
```

## Prerequisite

The skill calls the `affine-cli` binary, so it must be on `PATH`. From the repo root:

```bash
cargo install --path tools/affine-cli      # installs affine-cli to ~/.cargo/bin
```

## Install into your agent (pick one)

These skills are the **source of truth**; install (copy or symlink) them into whatever directory your
agent loads skills from. Symlinking keeps a single canonical copy that updates with the repo.

**Manual — works with any harness:**

```bash
# Claude Code, project-scoped (loads only in this repo):
mkdir -p .claude/skills && ln -s "$(pwd)/tools/affine-cli/skills/affine" .claude/skills/affine

# Claude Code, global (loads in every session):
mkdir -p ~/.claude/skills && ln -s "$(pwd)/tools/affine-cli/skills/affine" ~/.claude/skills/affine

# Any other agent: copy or symlink tools/affine-cli/skills/affine into that agent's skills directory.
```

**Automated — via the skills.sh CLI (multi-harness):**

```bash
# Installs the skill into the chosen agent's convention. Pulls from the published repo.
npx -y skills add wongkang01/AFFiNE-next@affine -y -g --agent claude-code   # or: cursor | codex | windsurf
```

## Why it's portable

- `SKILL.md` frontmatter (`name`, `description`) is the only thing an agent needs to discover the skill and
  decide when to load it — no harness-specific manifest.
- The body and `REFERENCE.md` are plain Markdown.
- The skill's instructions are "run `affine-cli <subcommand>` and parse the JSON" — no agent/runtime APIs,
  so the same skill works regardless of model or harness.

If `affine-cli` is ever extracted to its own repo (see `docs/agent-cli-design.md`), `skills/` sits at that
repo's root and travels with it unchanged.
