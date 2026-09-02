# Changelog — affine-cli

All notable changes to the `affine-cli` crate (and its skill, compat harness, and CI). Format
loosely follows [Keep a Changelog](https://keepachangelog.com); the crate is unpublished
(`0.0.0`), so entries are grouped by date / branch state rather than versions.

## Unreleased

Fixes for the maintainer review findings on upstream PR #15374.

### Fixed

- **`$` before a digit is now escaped on export.**
  `escape_math_dollars` exempted `$` followed by a digit as "currency", but pulldown-cmark reads `$10-$20` as the inline equation `10-`, so `a $10-$20 range` exported unescaped and re-ingested as math.
  Every `$` followed by non-whitespace now escapes (`\$10`), which the parser reads back as a literal `$`; a `$` before whitespace or end-of-text still stays bare.
- **`doc update` rejects cyclic `sys:children` instead of overflowing the stack.**
  `build_stored_tree` recursed over children with no visited set, so a corrupt doc with a child cycle aborted the CLI.
  It now carries a path-visited set like the four parent-chain walks and returns a `cyclic sys:children at block` error.

## 2026-07-31

Fixes for the CodeRabbit review findings on upstream PR #15374.

### Fixed

- **Table updates are now incremental.**
  Row and column ids are reused by position and only changed keys are written.
  Previously every table write cleared and re-minted all ids, so a one-cell edit produced an O(cells) delta, dropped concurrent app edits to other cells, and invalidated app state keyed on row/column ids.
- **`generate_key_between` no longer panics on malformed fraction digits.**
  An order key with a non-base-62 fraction char (for example a corrupt element `index` read from a foreign doc) now returns an error envelope; `digit_index(...).unwrap()` used to panic.
  The `midpoint` digit lookups and `b_chars[i]` index are fallible/bounded as defense in depth.
- **Parent-chain walks are cycle-safe.**
  `get_list_depth`, `nearest_by_flavour`, `has_skipped_markdown_ancestor`, and `block_level` carry a visited set, so a corrupt doc with a cyclic `sys:children` chain terminates instead of hanging the CLI.
- **`$` escaping sees across delta-op boundaries.**
  A `$` ending one op is now judged against the first character the next op renders (or the close marker of the current style), closing an under-escape where `...is $` followed by a styled run could re-parse as math.
- **Page-stub inserts fail loudly.**
  `insert_page_stub` (and its two former near-copies in `add_doc_to_root_doc` / `update_root_doc_meta_title`, which now call the one shared helper) propagate a failed read-back as an error instead of leaving an id-less page entry in `meta.pages` that every reader silently skips.
- **Unknown `--workspace` ids no longer create workspaces.**
  Every command except `workspace create` opens the store via the new `LocalBackend::open_existing`, which errors (`"error":"config"`) when the database file is absent.
  Previously a typo'd id materialized an empty workspace directory that `workspace list` then reported as real.

### Changed

- CI workflow hardened per zizmor: job-level `permissions: contents: read` and checkout with `persist-credentials: false`.

## 2026-07-27

Rebased onto current upstream/canary as the self-contained `feat/affine-cli` branch.

### Changed

- **Vendored the doc parser** as `src/doc_parser` (formerly `affine_common::doc_parser`).
  Upstream PR #15197 removed the Rust doc_parser from `packages/common/native` in favour of the
  published `affine_doc_loader` crate, whose source is not developed in the public monorepo.
  The vendored copy carries the latex/math port and the round-trip fixes
  (see docs/agent-cli-design.md §13.4); its tests (and fixtures) ride along in this crate, so
  `cargo test -p affine-cli` now runs 129 lib tests.
- `y-octo` now resolves from crates.io (`0.0.3`) per upstream; `clap` is declared crate-local
  (no longer a workspace dependency upstream).
- CI workflow paths trimmed (`packages/common/native` / `packages/common/y-octo` no longer
  exist as trigger paths).

## 2026-07-05

Pre-submission review fixes (code-review findings on the PR branches).

### Fixed

- **`search` now takes the open-workspace write guard** — it was classified read-only but its
  index refresh persists `idx_snapshots` rows into the workspace DB, bypassing the locked-DB
  check every mutating command honors. `--force` still overrides; skill docs updated.
- **`parse_hex` no longer panics on multibyte fill colors** — `--fill '#1é'` (or a spec node
  fill) byte-sliced mid-character and aborted the CLI; non-ASCII bodies now fall back to the
  default text color like any other unparseable fill.
- (Stacked parser branch) standalone `$$…$$` no longer swallows trailing text in the same
  paragraph, and doc→markdown now escapes literal `$` that would re-parse as math — both were
  silent data-loss paths in the latex port.

## 2026-06-10

Hardening pass driven by an adversarial review of the full CLI: real-yjs CI coverage, runtime
guards replacing documentation-only warnings, and fixes for the discovered failure modes.

### Added

- **Real-yjs decode check in CI** — the cross-library encoding seam (y-octo writer ↔ real yjs
  reader) that caused the labelXYWH incident is now guarded automatically:
  - `examples/emit_yjs_fixtures.rs`: emits fixture binaries through the CLI's own library code —
    shape / text / labeled connector, the single-delta `create_diagram` path, markdown with
    inline `$…$` and block `$$…$$` math, an `affine:latex` block, the workspace root doc, and a
    `db$docProperties` doc.
  - `yjs-compat/check.mjs` + `yjs-compat/package.json`: decodes the fixtures with the **real
    yjs library, pinned to 13.6.21** (the version the app resolves at the repo root) and asserts
    the decoded shapes — including `labelXYWH` as a plain `[x,y,w,h]` array (the exact prior
    regression) and a generic sweep that fails if any element field decodes to `undefined`.
  - `.github/workflows/affine-cli-yjs-compat.yml`: runs fixtures → node check →
    `cargo test -p affine-cli` on PRs/pushes touching `tools/affine-cli`,
    `packages/common/native`, `packages/common/y-octo`, or `packages/frontend/native/nbstore`.
- **Open-workspace write guard** (`"error":"locked"`): every mutating command refuses to write
  while another process (normally the running AFFiNE app) has the workspace database open,
  detected via SQLite's WAL dead-man-switch lock (`F_GETLK` probe on byte 128 of
  `storage.db-shm`; `store::db_in_use_elsewhere`). New global `--force` flag overrides.
  Read-only commands (`list`, `read`, `search`, `blob get`) are never blocked. Previously this
  hazard was only a skill-doc gotcha; agents that never read the skill got silent data loss.
- **Reserved doc-id guard**: mutating doc/diagram commands reject `--doc` values naming the
  workspace's root doc (`doc id == workspace id` — deleting it destroyed the page registry) or
  internal database docs (`db$…`, `userdata$…`) with `"error":"config"`.
- **Geometry validation**: `--xywh` is parsed and canonicalized; malformed strings, non-finite
  numbers, and non-positive `w`/`h` are rejected (same for diagram-spec node `w`/`h`). A bad box
  written verbatim would throw inside the app's renderer and poison the whole edgeless surface
  (the malformed-element class from the labelXYWH postmortem).
- **Diagram spec validation**: duplicate node ids and unknown `edge.from`/`edge.to` references
  are rejected before anything is written.
- New `engine::create_diagram` + `engine::DiagramEdgeParams` (single-delta whole-graph builder)
  and a library target (`src/lib.rs`) so examples/CI harnesses can link the exact engine code
  the binary ships.
- Tests: engine unit tests for `create_diagram` (atomic replace, endpoint wiring, out-of-range
  edges) and `rewrap_connector_labels` no-surface skip; e2e tests for reserved-id rejection,
  malformed-xywh rejection, duplicate-node-id rejection, atomic `--replace` re-runs, the
  locked-DB guard (holds a live WAL connection and asserts refusal + `--force` override), and
  `workspace list` surviving a corrupt DB.

### Changed

- **`diagram create` is now atomic**: the whole graph — including the `--replace` clear — is
  computed as ONE delta and pushed with ONE store write. Previously the clear was pushed first
  and each element pushed separately, so a crash mid-command could leave a half-built diagram or
  a wiped surface; it also re-merged the full doc after every element (O(n²)).
- **CLI-private search index**: `search` now indexes under `cli:doc` instead of the app's
  `doc:title`. The app stores ONLY titles in `doc:title`; the CLI stuffs title + body into one
  text, so sharing the index polluted the app's title search and was silently overwritten by
  the app's next crawl. The CLI re-crawls on every `search`, so nothing was lost by separating.
  (Existing CLI-written `doc:title` snapshot entries are simply no longer read.)
- **`workspace list` no longer fails wholesale**: a workspace whose DB can't be opened/read is
  reported as `{ "id", "path", "error" }` and the rest of the listing proceeds.
- **`diagram repair-labels` reports errors honestly**: docs without an edgeless surface are
  skipped via a typed no-surface result, while real decode/store failures are returned in an
  `errors` array (with `"ok":false`) instead of being silently swallowed as "scanned".
- `engine::rewrap_connector_labels` returns `Result<Option<(delta, count)>>` — `None` = no
  surface (skip), `Err` = real corruption.
- `engine::add_shape` / `add_text` / `add_connector` are now thin `with_delta` wrappers over
  in-doc `insert_*` functions (completes the uncommitted `with_delta` refactor; one load →
  snapshot → mutate → encode path everywhere).
- Skill docs (`skills/affine/SKILL.md`, `REFERENCE.md`) rewritten for the new behavior: the
  "don't write while the app is open" gotcha is replaced by the enforced `locked` guard +
  `--force`, and the reference documents the write guard, reserved ids, xywh validation, the
  atomic `--spec` flow (incl. previously-undocumented `--layout` / `--direction` / `--replace`),
  per-workspace `error` entries in `workspace list`, and the private search index. The
  installed copy under `.claude/skills/affine/` was synced.
- `layout::layout` doc comment fixed: explicit per-node coordinates place a node initially, but
  the separation pass may still nudge any node — no-overlap wins over exact placement (the code
  always behaved this way; the docs claimed otherwise).

### Internal

- New error variant `CliError::Locked` (envelope code `"locked"`).
- `libc` added as a dependency (workspace-pinned) for the `F_GETLK` probe; non-unix builds
  compile the probe to "never in use".
- Crate restructured into lib + bin targets; `main.rs` is a thin dispatcher over `affine_cli::*`.
- CI-gate readiness: clippy-clean under `-D warnings` (`create_diagram` now returns a named
  `DiagramDelta` struct instead of a 3-tuple); crate-local `rustfmt.toml` keeping default
  4-space style (rustfmt's nearest-config rule shields the crate from the repo root's 2-space
  config in `cargo +nightly fmt --all -- --check`), whole crate reformatted to be fmt-clean.

### Known gaps (deliberately not addressed)

- No update squashing: the CLI only appends deltas and relies on the app to compact on open.
- No CLI ↔ app version handshake; the CLI writes the schema it was built against.
- The shared `doc_parser` changes (see 2026-06-09 below) ride on this branch; whether they
  should split into their own branch is an open question (handoff doc exists).

## 2026-06-09

- **feat: inline & block math equations in markdown** (`9ca79317b`) — `$x$` → inline latex
  delta, `$$x$$` alone on a line → `affine:latex` block; both round-trip through
  `doc read --format md`. Documents `doc add-latex`. **Note:** implemented in the shared
  `packages/common/native` doc_parser crate, so it also changes markdown parsing for the
  desktop app, mobile, and backend server (enables `ENABLE_MATH`, removes the
  `unsupported_markdown:math` rejection, un-blacklists `affine:latex` on markdown read-back).
- **fix: edgeless render repair — connector `labelXYWH` yjs array encoding** (`cfe498cea`) —
  a bare top-level `Any::Array` stored as a Y.Map value decodes in real yjs to its LAST element,
  throwing in BlockSuite's renderer and poisoning the whole surface. Added `yjs_number_array`
  wrapping, the `diagram repair-labels` command for existing docs, and
  `docs/affine-cli-edgeless-render-postmortem.md`.

## 2026-06-05

- **refactor: move the `affine` skill** out of `.claude/skills` into `tools/affine-cli/skills`
  (`af63a26ad`) — the repo copy is the source of truth; `.claude/skills/affine` is the local
  install location.

## 2026-06-04

- **Phase 4 — `affine` Claude Code skill** wrapping the CLI (`9d4c380f2`).
- **Phase 2 — edgeless diagrams** (`7c6c87f4a`): surface elements (shape / text / connector),
  `diagram create --spec` with grid/tree/radial layout, fractional-index port, theme-aware
  colors, `doc set-mode`.
- **Phase 1 — full local MCP-parity command surface** (`1c981f48c`): workspace list, doc
  list/read/update/set-title/delete, full-text search, blobs.
- **Phase 0 spike** (`6e2c7aa40`): workspace/doc create + markdown round-trip over
  `affine_common` + `affine_nbstore` (napi-free), proving the in-fork crate-linking approach.
