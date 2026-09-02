# Changelog — affine-cli

All notable changes to the `affine-cli` crate (and its skill, compat harness, and CI). Format
loosely follows [Keep a Changelog](https://keepachangelog.com); the crate is unpublished
(`0.0.0`), so entries are grouped by date / branch state rather than versions.

## Unreleased

Fixes for the maintainer review findings and the second CodeRabbit pass on upstream PR #15374.
Where the documented contract was stronger than the mechanism, the mechanism is fixed where feasible and the docs now describe what the code does.

### Fixed

- **The CLI reuses one y-octo client id per workspace instead of minting a new one per invocation.**
  Every `DocOptions::new()` took y-octo's default random client id, and every peer that writes to a
  doc stays in its state vector forever, so an agent editing a doc N times left N dead clients
  behind in every copy of that doc and in every sync message carrying it.
  The id is now generated once and persisted in `affine-cli.client` next to `storage.db`, and
  `lease::doc_options()` is the factory every write path builds its `Doc` from.
  Because reusing an id is only safe for a single writer, that file doubles as the write lock:
  mutating commands hold an exclusive advisory `flock` on it for their whole run, and a second CLI
  process retries for about two seconds and then fails with the new `"error":"busy"` rather than
  minting colliding `(client, clock)` item ids.
  Read-only commands never take the lease.
  On Windows the lock is not implemented and the output carries a `warnings` entry instead; a
  missing or malformed id file is regenerated with a warning.

- **`doc update` edits `sys:children` and `prop:text` in place, so concurrent app edits survive.**
  The writer replaced a container's `sys:children` with a NEW `Y.Array` and a changed paragraph's `prop:text` with a NEW `Y.Text`, which makes the CLI's update authoritative for the whole container: a paragraph the app appended, or characters the app typed, between the CLI's read and its write were still in the doc but no longer reachable, because the map key pointed at a different type (harness interleaving cases B and C).
  `write_children` now splices the EXISTING array with the minimal insert/remove operations derived from an LCS of the old and the new child order, and `write_text` applies a retain/insert/delete delta, computed from a character-level LCS of the old and the new content, to the EXISTING `Y.Text`.
  A block that does not have the container yet still gets a fresh one, so `doc create` is unchanged.
  Retained characters whose attributes changed are re-formatted with `Retain { format }` (an attribute the new content drops is set to `Any::Null`) instead of being deleted and reinserted, so a formatting-only edit no longer rewrites the text.
  Above a 1,000,000-cell diff matrix the text delta degrades to a delete-all plus insert, which is still applied to the existing `Y.Text`, so concurrently inserted characters survive that path too.
  `doc set-title` writes `prop:title` through the same helper.
  Both entries are gone from `KNOWN_GAPS` in `check.mjs`, and `test_update_ydoc_keeps_concurrently_appended_child` / `test_update_ydoc_keeps_concurrently_typed_characters` apply a concurrent y-octo edit between the CLI's read and its write and assert it survives the merge.
- **`$` before a digit is now escaped on export.**
  `escape_math_dollars` exempted `$` followed by a digit as "currency", but pulldown-cmark reads `$10-$20` as the inline equation `10-`, so `a $10-$20 range` exported unescaped and re-ingested as math.
  Every `$` followed by non-whitespace now escapes (`\$10`), which the parser reads back as a literal `$`; a `$` before whitespace or end-of-text still stays bare.
- **`doc update` rejects cyclic `sys:children` instead of overflowing the stack.**
  `build_stored_tree` recursed over children with no visited set, so a corrupt doc with a child cycle aborted the CLI.
  It now carries a path-visited set like the four parent-chain walks and returns a `cyclic sys:children at block` error.
- **Table updates keep app-authored row and column props.**
  The stale-key sweep in `apply_table_block_props` now keys on the id segment of each `prop:rows.<id>.*`, `prop:columns.<id>.*`, and `prop:cells.<rowId>:<columnId>.*` key and only removes keys whose row/column id was dropped.
  Previously it whitelisted the exact keys the CLI writes (`.rowId`/`.columnId`/`.order`/`.text`), so a one-cell edit deleted `prop:columns.<id>.width`, `prop:rows.<id>.backgroundColor`, and any other prop the app had set on rows/columns that were retained.
- **Malformed table keys no longer panic the writer.**
  `existing_table_ids` extracts the id with `strip_prefix`/`strip_suffix` and skips an empty id, so a hostile `prop:rows.order` key (prefix and suffix with no id between them) is ignored instead of slicing out of range.
  The same key class is swept by the update as garbage rather than kept.
- **`diagram add-*` no longer fails on docs with grouped canvas elements.**
  Grouped elements carry a compound `index` (`a1-a0V`); the raw value won the string-max in `next_index` and then failed fractional-key validation on the `-`, so every add errored on any doc where the user had ever grouped elements.
  The group suffix is now stripped first, matching the app's `ungroupIndex` (`blocksuite/framework/std/src/utils/layer.ts`).
- **`rewrap_connector_labels` guards the empty-doc binary** before applying it in its pre-flight load, like every other engine entry point.
- Doc comments cite the yjs version the compat harness actually pins (13.6.21), not 13.6.31.
- **Raw HTML emitted by the markdown adapter is entity-escaped.**
  Image captions inside `<img alt="...">` and database option `<span>` attributes/text now escape `& < > " '`, and `parse_html_attrs` decodes them on read-back, so a quote in a caption no longer produces malformed HTML or a lossy round trip.
- **Rendered tables escape `|` in cell text**, so a literal pipe stays inside its cell when the markdown is parsed again.
- **Code fences are sized to the content.**
  A code block containing a triple-backtick run is emitted with a longer fence instead of being terminated early.
- **`MAX_MARKDOWN_CHARS` is enforced as a character count** rather than a byte length, so non-ASCII documents are no longer rejected below the advertised budget.
- **Default data directory matches the Electron app on Linux.**
  `base_dir` now uses `dirs::config_dir()` (Electron's `appData`), which is `~/.config/AFFiNE` on Linux; macOS and Windows resolve to the same paths as before.
- **Usage errors emit the JSON envelope.**
  `main` uses `Cli::try_parse()`; unknown subcommands and missing/conflicting flags now print
  `{"ok":false,"error":"usage","message":...}` on stdout and exit 2 (clap's code).
  Previously clap wrote plain text to stderr with empty stdout, breaking the "parse stdout as JSON" contract.
  `--help` / `--version` still print plain text and exit 0.
  `--pretty` is honored on this path by scanning argv.
- **Diagram commands write the mode flag before the elements.**
  `diagram create|add-shape|add-text|add-connector` used to push the surface element delta and then
  `ensure_edgeless` (`db$docProperties`); a failure in the second write left the element persisted
  behind an `ok:false`.
  The order is now flag first, element delta second, so a failed run leaves at most a harmless
  edgeless flag.
  Docs no longer call the whole command atomic: the element write is one delta; the mode flag is a separate prior write.
- **The CLI no longer migrates an existing workspace database implicitly.**
  nbstore's `connect()` runs sqlx migrations unconditionally, so every command (even `doc read`)
  could upgrade `_sqlx_migrations` in place and leave an older installed app unable to open its own DB.
  `LocalBackend::open_existing` now reads `_sqlx_migrations` read-only (`store::check_schema`)
  and compares it with `affine_schema::get_migrator()`: a behind-schema DB is refused with
  `"error":"migration_required"` unless the new global `--allow-migrate` flag is passed (the
  output then carries a `warnings` entry); a DB with migrations the CLI does not know is refused
  with `"error":"db_newer"`. Nothing is written before the check passes.
  `workspace create` (fresh file) migrates as before; `workspace list` reports a refused DB as a per-entry `error`.
  New deps: `affine_schema` (path) and `sqlx` (read-only probe).

### Added

- **Per-row delta sequences in the yjs compat harness.**
  `examples/emit_yjs_fixtures.rs` now records, per scenario, the exact bytes each CLI command pushes through nbstore `push_update` (`seq/<name>/<i>.bin`) together with y-octo's projection of the doc after every row and the CLI reader's output (`<i>.expected.json`).
  Scenarios: `doc create`, `doc update` structural diff (block removal and reorder), `doc update` text edit, a three-update chain, `diagram create` then `--replace`, root doc lifecycle ending in `remove_doc_from_root`, a table edit removing a row, `doc set-title`, and a `db$docProperties` mode flip.
- **`check.mjs` applies each sequence one row at a time to a real `Y.Doc`** and asserts no throw, no pending structs or delete sets, an exact match between the yjs view and the y-octo view, and that `Y.encodeStateAsUpdate` of the result re-applies to a fresh doc unchanged.
  This is the deletion coverage the harness lacked: every deletion-bearing path (`doc update` structural diff, `diagram create --replace`, `remove_doc_from_root`, table row removal) now has its delete set decoded by real yjs in CI.
- **Interleaving cases**: an app-style edit made with real yjs (append paragraph, type in a paragraph, push a `meta.pages` entry, add a surface element) followed by the CLI delta computed without that edit; both must survive.
- **Schema drift test** (`tests/schema_drift.rs`): scans the BlockSuite schema definitions in the checkout and fails when the declared block flavours or versions change, or when a flavour the CLI writes disagrees with upstream.
  `doc_parser::written_block_schemas()` and `BlockFlavour::ALL` expose the CLI's hardcoded list for it.

### Changed

- The table id stability test now compares `prop:cells.` keys as well as `prop:rows.`/`prop:columns.`, covering the full `<rowId>:<columnId>` id contract.
- **Connector endpoints must exist.**
  `diagram add-connector` (and the connectors `diagram create` builds) verify every id-anchored `--from`/`--to` against the loaded surface and refuse with the new structured `"error":"unknown_element"` instead of persisting a dangling connector.
  Position-only endpoints are still allowed.
- **`diagram create --spec` is capped at 500 nodes / 2000 edges** (`"error":"config"` past that, before any layout or store work).
  The layout's overlap-separation pass now reports non-convergence (a `warning:` line on stderr after its 200-pass bound) instead of silently returning a possibly overlapping layout.
- `diagram add-connector --mode` and the `--spec` edge `mode` document (and the parser error lists) `orthogonal` as an alias of `elbow`.
- `add_shape_sets_doc_edgeless` (diagram e2e) asserts `primaryMode == "edgeless"` from `db$docProperties` instead of only checking that a surface element exists.
- **"Write lock" is now documented as a pre-flight open-app check.**
  `store::db_in_use_elsewhere` returns `InUseProbe::{InUse, Free, Unsupported}` instead of a bool.
  The docs state that it is a one-shot `F_GETLK` probe with a TOCTOU window, not a held lock, and
  that on Windows it is not implemented: writes proceed as if `--force` were given and the JSON
  output carries a `warnings` entry saying so.
  The unix `error:locked` contract is unchanged.
- **`warnings` field.**
  `output::warn` collects non-fatal notices; `main` attaches them to object outputs (success or error) as `"warnings":[...]`.
- Tests: `unknown_subcommand_emits_json_usage_error_with_exit_2`,
  `missing_required_flag_emits_json_usage_error_with_exit_2`,
  `help_and_version_keep_plain_text_and_exit_0`,
  `doc_read_on_current_schema_succeeds_without_warnings`,
  `doc_read_refuses_db_behind_schema_unless_allow_migrate`,
  `doc_read_refuses_db_newer_than_cli` in `tests/commands_e2e.rs`.

- **Compat workflow trigger paths** now include the sources the CLI hardcodes conventions from: `blocksuite/affine/model/**`, `blocksuite/affine/blocks/surface/**`, `blocksuite/framework/store/**`, `blocksuite/framework/std/src/utils/**`, the app's `db` and `doc` modules, the electron workspace helper, `Cargo.toml` / `Cargo.lock` (y-octo bumps) and the root `package.json` / yjs patch (reader pin).
  A BlockSuite schema change used to leave the compat check unrun.

### Docs

- `skills/affine/REFERENCE.md` documents `diagram repair-labels` (syntax, JSON output, locking, idempotence); the postmortem points at it.
- `skills/README.md` pins the `skills` installer version and uses a commit-SHA source path.
- `docs/agent-cli-design.md` carries a status header marking it as the historical design study, drops the personal absolute path, annotates the stale "no latex" and "no code yet" notes, and loses a stray code fence.
- `cli.rs` module doc no longer claims most subcommands return `not_implemented`; `yjs-compat/check.mjs` describes its presence sweep honestly.
- `yjs-compat/README.md` documents the harness: how to run it, every fixture and delta sequence it covers, the interleaving cases, and the `KNOWN_GAPS` mechanism.

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
