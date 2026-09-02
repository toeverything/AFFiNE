---
name: affine
description: Create and edit AFFiNE notes (markdown docs) and edgeless diagrams from the command line via the local-first `affine-cli` binary, which emits JSON. Use when the user wants to create, read, update, search, or delete AFFiNE documents/pages, build whiteboard/edgeless diagrams (shapes, text, connectors, node/edge graphs), manage AFFiNE workspaces or blobs, or mentions AFFiNE, affine-cli, or writing notes into their AFFiNE app.
---

# AFFiNE CLI

`affine-cli` writes AFFiNE content directly into the desktop app's **local-first** store; the
app syncs it on open. Every command prints **JSON** (one compact line; add `--pretty` for humans)
and exits non-zero on error with `{"ok":false,"error":...,"message":...}`. Parse stdout as JSON.
Command-line mistakes (unknown subcommand, missing flag) use the same envelope with
`"error":"usage"` and exit code 2; only `--help` / `--version` print plain text.

The binary is installed at `~/.cargo/bin/affine-cli` (on PATH). If it's missing, build it:
`cargo install --path tools/affine-cli` from the AFFiNE fork.

## Quick start

```bash
# 1. Find or create a workspace (capture the id).
affine-cli workspace list                                   # [{id,name,docCount,path}, ...]
WS=$(affine-cli workspace create --name "Research" | jq -r .id)

# 2. Create a note from markdown.
DOC=$(affine-cli doc create --workspace="$WS" --title "Ideas" \
        --content $'# Ideas\n\n- one\n- two' | jq -r .docId)

# 3. Read it back / edit it.
affine-cli doc read   --workspace="$WS" --doc="$DOC" --format md
affine-cli doc update --workspace="$WS" --doc="$DOC" --content $'# Ideas\n\nrevised'
```

## Core workflows

- **Notes:** `doc create|read|update|set-title|delete`. Body is markdown (`--content` inline or
  `--md-file path`). `doc read --format json` returns structured blocks; `--format md` returns text.
- **Math:** write `$x$` in markdown for an inline equation and `$$x$$` (on its own line) for a block
  equation - both round-trip. `$5`-style currency stays literal. `doc add-latex` appends a block
  equation directly (handy when you don't want to round-trip the whole body).
- **Find things:** `doc list --workspace=$WS` (titles + ids); `search --workspace=$WS --query "term"`
  (full-text, BM25 - ranked, not substring).
- **Diagrams (edgeless whiteboard):** build a graph in one shot with `diagram create --spec graph.json`
  (`{nodes,edges}`), or place elements precisely with `diagram add-shape|add-text|add-connector`.
  Diagram commands first flag the doc as edgeless (a separate small write), then write the elements
  as one delta. Connect shapes by their returned `elementId`.
- **Attachments:** `blob put|get|list` (images/files; keyed by SHA-256 of contents by default).

## Critical gotchas

1. **Writes are refused while the workspace is open elsewhere** - `{"ok":false,"error":"locked"}`
   means the pre-flight open-app check found another process (normally the AFFiNE app) holding the
   workspace DB. Close the workspace in the app and retry, or pass `--force` if you accept the risk.
   The check is a one-shot probe, not a lock: it cannot see an app that opens the workspace after
   the check, and on Windows it is not implemented (writes proceed as with `--force` and the output
   carries a `warnings` entry saying so). The app does **not** auto-reload: (re)open the workspace
   there to see CLI-written changes.
2. **The CLI never migrates an existing workspace DB on its own.** `"error":"migration_required"`
   means the DB schema is older than this CLI build expects; open the workspace in the AFFiNE app
   (which migrates it) or pass `--allow-migrate` if the installed app is at least as new as the
   CLI. `"error":"db_newer"` means the DB was written by a newer app than the CLI; rebuild the CLI.
3. **Only one CLI write per workspace at a time** - `{"ok":false,"error":"busy"}` means another
   `affine-cli` process holds the workspace write lease (an advisory lock on the `affine-cli.client`
   file beside `storage.db`, which also stores the single CRDT client id every CLI write reuses).
   The second process already waited about two seconds and wrote nothing, so just retry. Read
   commands are never blocked, and on Windows the lock is not implemented (the output warns
   instead).
4. **Ids can start with `-`.** Always pass them in `=` form - `--workspace=$WS`, `--doc=$DOC` - so the
   CLI doesn't parse the id as a flag.
5. **Default is local-first** (`--peer local`). Cloud workspaces use `--peer <serverId>` and must
   already exist locally (signed-in + opened once in the app); the CLI can't provision a cloud workspace.

## Full reference

Command tree, every flag, the JSON output shape per command, the diagram `--spec` schema, and color
/ geometry formats: see [REFERENCE.md](REFERENCE.md).
