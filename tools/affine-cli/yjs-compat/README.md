# affine-cli yjs compat harness

affine-cli writes CRDT updates with y-octo (Rust) and the AFFiNE app reads them with the real yjs library (TypeScript).
y-octo's own reader normalizes encodings that real yjs decodes differently, so no Rust-only test can prove a CLI-written update is safe for the app.
This harness closes that seam: the crate's own library code emits fixtures, and `check.mjs` decodes them with the exact yjs version the app pins.

## Running it

```sh
export CARGO_TARGET_DIR=/path/to/shared/target   # optional
cargo run -p affine-cli --example emit_yjs_fixtures -- /tmp/yjs-fixtures
cd tools/affine-cli/yjs-compat
npm ci --no-audit --no-fund
node check.mjs /tmp/yjs-fixtures
```

CI runs the same three steps in `.github/workflows/affine-cli-yjs-compat.yml`.
`yjs` is pinned in `package.json` to the version the repo root resolves (`13.6.21` at the time of writing); bump both together.

## What is covered

### Full-state fixtures

`page_doc.bin`, `diagram_doc.bin`, `root_doc.bin`, `props_doc.bin` are merged full states applied to a fresh `Y.Doc`.
They carry the shape-level assertions from the labelXYWH postmortem (`docs/affine-cli-edgeless-render-postmortem.md`): connector `labelXYWH` decodes as a plain `[x,y,w,h]` array, `prop:elements` is the Boxed wrapper, theme colors are `{light,dark}` objects, latex blocks and math deltas decode, root `meta.pages` and the `db$docProperties` row decode.

### Per-row delta sequences

The app never applies a merged full state.
It reads the `updates` rows from the workspace database and applies them to a `Y.Doc` one by one, so what real yjs must decode are the raw deltas each CLI command pushes through nbstore `push_update`.
Every deletion-bearing path produces a delta carrying a delete set, and delete-set encoding is the historic y-octo to yjs divergence area.

`emit_yjs_fixtures.rs` therefore records, per scenario, the exact bytes of every pushed row under `seq/<name>/<i>.bin`, plus `<i>.expected.json`: a generic projection of the document as y-octo reads it after that row (`roots`), and what the CLI's own reader prints for it (`reader`: the crawl result and markdown for page docs, `meta.name` and the page list for root docs).

| Sequence | Rows | Deletion exercised |
| --- | --- | --- |
| `create_doc` | `doc create` | none (baseline) |
| `update_structural` | create, `doc update` removing a block, moving one, dropping a list item | block maps removed, `sys:children` spliced in place |
| `update_text` | create, `doc update` editing one paragraph | a text delta over the existing `prop:text` Y.Text |
| `update_chain` | create, structural update, text update, re-insert | delete sets referencing items created by earlier deltas |
| `diagram_replace` | create, `diagram create`, `diagram create --replace` | every surface element key removed and a new graph added in one update |
| `root_remove` | `workspace create`, two `doc create` root rows, `doc set-title`, `doc delete` | in-place `meta.pages` array removal, page entry title overwrite |
| `table_remove_row` | create with a 3-row table, `doc update` to 2 rows | stale `prop:rows.*` / `prop:cells.*` keys removed |
| `set_title` | create, `doc set-title` | a text delta over the page block's `prop:title` |
| `props_mode_flip` | `doc set-mode edgeless`, `doc set-mode page` | scalar key overwrite in `db$docProperties` |

For every row `check.mjs` asserts: `Y.applyUpdate` does not throw, the doc has no pending structs or pending delete sets (a missing dependency would leave the row parked instead of applied), the set of root types matches, and the yjs projection equals the y-octo projection exactly (blocks map, children order, text content, surface elements, every scalar prop).
After the last row it re-encodes the doc with `Y.encodeStateAsUpdate`, applies that to a fresh doc, and asserts the state is unchanged, then ties the CLI reader's block ids and flavours (or page ids) back to the yjs view.

### Interleaving with concurrent app edits

Each case builds the doc from the rows before a CLI delta, makes an app-style edit with real yjs, then applies the CLI delta that was computed without knowledge of that edit.

| Case | App edit (real yjs) | CLI delta | Result |
| --- | --- | --- | --- |
| A | append a paragraph to the note | `doc update` text edit in another paragraph | both survive |
| B | append a paragraph to the note | `doc update` structural diff | both survive |
| C | type inside a paragraph | `doc update` editing that same paragraph | both survive |
| D | push a page entry into `meta.pages` | `doc delete` of another page | both survive |
| E | add a surface element | `diagram create --replace` | both survive |

B and C used to fail, and not because of an encoding divergence: real yjs decoded the delta exactly as y-octo wrote it.
`doc update` replaced the whole `sys:children` Y.Array and the whole `prop:text` Y.Text, so anything the app put inside the replaced container after the CLI read the doc was discarded.
Both containers are now edited in place (`src/doc_parser/write/inplace.rs`), and the CLI only creates a container for a block that does not have one yet.

`KNOWN_GAPS` in `check.mjs` is the mechanism for recording a writer defect the harness has found but that is not fixed yet; it is currently empty.
An entry is reported as `xfail`, and if it starts passing the run fails with `XPASS` so the entry is removed together with the writer fix.
Do not add entries to `KNOWN_GAPS` to silence a new failure.

## Schema drift guard

The compat workflow also triggers on the BlockSuite and app sources the CLI hardcodes conventions from (see the comment at the top of the workflow file for the list and the reason for each path).
`tests/schema_drift.rs` additionally scans the BlockSuite schema definitions in the checkout and fails when the set of declared block flavours or their versions changes, or when a flavour the CLI writes disagrees with upstream.
