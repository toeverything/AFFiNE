# AFFiNE Agent CLI — Design & Research Notes

> Status: **historical design study**.
> This document is the research gathered before the CLI was written and is kept as the design record.
> The CLI now exists at `tools/affine-cli` (binary `affine-cli`).
> For current behaviour see `tools/affine-cli/CHANGELOG.md` and `tools/affine-cli/skills/affine/REFERENCE.md`; where a section below conflicts with the shipped CLI, the CLI documentation wins.
> Notable drift: latex/math is supported on both the markdown read and write paths (section 13.3), and diagrams are built by the `diagram` commands rather than through markdown.
> Repo: the AFFiNE monorepo checkout (origin `wongkang01/AFFiNE-next`, upstream `toeverything/AFFiNE`, v0.26.3).

## 1. Goal

A Rust CLI (`affine`) that lets **agents** create and edit AFFiNE content — notes, diagrams
(edgeless/whiteboard), and other block types — and that **replaces the existing MCP tools**.
Agents invoke `affine <command>` and parse **structured JSON** output (chosen interface).

Inspiration: `gws`-style ergonomics — config/auto-discovery of workspaces + clear subcommands +
a single static binary.

## 1b. Decisions (locked this session)

- **Crate location:** **in-fork** as a Cargo workspace member at **`tools/affine-cli`** (add to root
  `[workspace].members`). Distinct from the existing `tools/cli` = `@affine-tools/cli` (AFFiNE's JS
  build/dev CLI) — no functional overlap, but that path and the `affine` command name are taken.
  **Not a separate repo:** the CLI links AFFiNE's unpublished, version-locked Rust crates
  (`y-octo`, `affine_common`, `affine_nbstore`) and must emit byte-compatible CRDT for the exact AFFiNE
  version, and the auto-reload fix (§13.1) patches AFFiNE itself — so in-fork keeps schema in lockstep
  and avoids a two-repo split. Extraction to a standalone repo (pinned to an AFFiNE tag) is a possible
  later optimization for distribution, not the starting point.
- **Binary/command name:** **`affine-cli`**.
- **Sync model:** **local-first** — write into a workspace's local nbstore; the desktop app syncs on
  open. Applies to cloud-enabled workspaces (peer = server id), per §4.1.
- **v1 scope:** **docs + diagrams**. Docs default to **page mode**; a diagram doc is switched to
  edgeless explicitly via docProperties (§4.5).
- **Agent interface:** **CLI subcommands, JSON output**.
- **Concurrency/auto-reload:** a **separate branch** (creation left to the handoff agent); chosen
  approach = app-side file watching (§13.1).
- **Shared `doc_parser` changes (latex/math):** a **separate _stacked_ branch**
  `feat/doc-parser-latex-parity` under `feat/agent-cli` — same "give shared code its own labeled
  branch" discipline as auto-reload, but stacked because the CLI _depends_ on it (auto-reload is
  parallel/independent; the CLI's markdown-math features are load-bearing on the parser change). See
  §13.3.
- **After build & test:** use Anthropic's **skill-creator** skill to author Claude Code skills that
  wrap the CLI commands (Phase 4).
- **Branch creation:** deferred to the handoff agent (which will use the Claude Code Workflow feature).

## 2. Key discovery — almost everything we need already exists in Rust

AFFiNE already ships its own Rust crates. The CLI should **depend on them as path crates**, not
reimplement YJS or the block model. No `yrs` needed.

| Crate | Path | Role for the CLI |
|---|---|---|
| **`y-octo`** | `packages/common/y-octo/core` | YJS-compatible CRDT in Rust (`Doc`, `Map`, `Array`, `Text`, `encode_update_v1`, state vectors, `merge_updates_v1`). Wire-compatible with JS yjs (v1 / lib0). |
| **`affine_common`** | `packages/common/native` | **Pure-Rust** doc engine. The napi layer is a thin wrapper; the logic is plain functions (see §5). Markdown↔YDoc, root-doc registration, doc→markdown, doc crawl. |
| **`affine_nbstore`** | `packages/frontend/native/nbstore` | Local SQLite store (the desktop app's storage). Has a `use-as-lib` feature to compile **without** napi → callable directly from the CLI. |
| `affine_server_native` | `packages/backend/native` | The napi wrappers the current MCP write tools call. We do **not** depend on this (it's cdylib/napi); we call `affine_common` directly. |

**Build note (phase-0 spike):** confirm `affine_common` and `affine_nbstore` build as `rlib`
with napi disabled (`affine_common` without its `napi` feature; `affine_nbstore` with
`use-as-lib`). These crates are normally built as cdylib for Node.

## 3. Architecture — local-first now, layered for self-hosted later

Decision (with user): **create content locally and let the AFFiNE app sync it.** The valuable,
hard part — building valid AFFiNE docs & diagrams as y-octo update blobs — is identical no matter
where the data lands. Only the *sink* differs. So:

```
        ┌─────────────────────────────────────────────┐
        │  Content engine (backend-agnostic)           │
        │  - markdown -> YDoc update   (affine_common) │
        │  - diagram spec -> surface elements (y-octo) │
        │  - doc -> markdown/json      (affine_common) │
        │  => produces yjs binary updates              │
        └───────────────┬─────────────────────────────┘
                        │ Vec<u8> updates
              ┌─────────┴──────────┐
              ▼                    ▼
   trait DocBackend          (later)
   ┌───────────────────┐   ┌──────────────────────────┐
   │ LocalBackend      │   │ ServerBackend            │
   │ (BUILD NOW)       │   │ (BUILD WHEN SELF-HOSTING)│
   │ affine_nbstore    │   │ access token + sync API  │
   │ -> SQLite         │   │ socket.io sync client    │
   │ app syncs on open │   │ (no Rust impl exists yet)│
   └───────────────────┘   └──────────────────────────┘
```

`trait DocBackend` (sketch): `load_doc`, `push_update`, `list_docs`, `create_workspace`,
`list_workspaces`, `put_blob`, `get_blob`, `search`.

**Why not direct-to-cloud first:** there is **no Rust sync client** in the repo — AFFiNE's
socket.io sync protocol (`space:join`, `space:load-doc`, `space:push-doc-update`, awareness, base64
yjs updates, protocol version `sync-026`) lives entirely in TypeScript (`packages/backend/server/src/core/sync/gateway.ts`,
`packages/common/nbstore/src/sync/*`). Implementing it in Rust is the bulk of `ServerBackend` and is
deferred until self-hosting.

## 4. Data model recap (what the CLI must produce)

### 4.1 Local storage (validated)
- Path (macOS): `~/Library/Application Support/AFFiNE/workspaces/<peer>/<workspaceId>/storage.db`
  - Base dir from `app.getPath('appData')/AFFiNE` (`packages/frontend/apps/electron/src/main/index.ts`).
  - Path builders: `packages/frontend/apps/electron/src/helper/workspace/meta.ts` (`getSpaceDBPath`).
- `universal_id` string: `@peer(<peer>);@type(<workspace|userspace>);@id(<id>);`
  (`packages/common/nbstore/src/utils/universal-id.ts`).
- **Workspace discovery = filesystem scan**: the app lists subdirs of `workspaces/local/` that
  contain a `storage.db` (`packages/frontend/apps/electron/src/helper/workspace/handlers.ts`
  → `listLocalWorkspaceIds`). No global index file.
- nbstore SQLite schema (`packages/frontend/native/schema/src/lib.rs`): `meta(space_id)`,
  `snapshots(doc_id, data, created_at, updated_at)`, `updates(doc_id, created_at, data)`,
  `clocks(doc_id, timestamp)`, `blobs(key, data, mime, size, ...)`, `peer_clocks(...)`, FTS tables.
- Updates are stored as **opaque yjs binary blobs**; the CLI appends to `updates` via `push_update`.
- **Cloud workspaces:** `<peer>` = the **server id** (`affine-cloud` for affine.pro; `<serverId>` for
  self-hosted), not `local`. Path `.../workspaces/<server.id>/<workspaceId>/storage.db`; universal_id
  `@peer(<server.id>);@type(workspace);@id(<wsid>);`. **Gotcha:** a cloud workspace's local db is
  created by the app only after sign-in + first open. The CLI **writes into an existing** cloud-workspace
  db (the app then syncs it up); it **cannot provision a cloud workspace from scratch** — that requires
  the server GraphQL `createWorkspace` + an initial app sync. (`packages/frontend/core/src/modules/workspace-engine/impls/cloud.ts`.)

### 4.2 Per-doc Y.Doc (the "space doc", guid = docId)
Top-level `blocks` Y.Map of `blockId -> YBlock(Y.Map)`. `build_full_doc` produces:
- `affine:page` (version 2) — `prop:title` (Y.Text); children `[surface_id, note_id]`.
- `affine:surface` (version 5) — `prop:elements` = **Boxed** map (see §4.4).
- `affine:note` (version 1) — `prop:background`, `prop:xywh="[0,0,800,95]"`, `prop:index="a0"`,
  `prop:hidden=false`, `prop:displayMode="both"`; children = content block ids.
- Content blocks under note: `affine:paragraph`, `affine:list`, `affine:code`, headings (paragraph
  `prop:type` = `h1..h6`), `affine:divider`, `affine:image`, `affine:table`, etc.

YBlock fields: `sys:id`, `sys:flavour`, `sys:version`, `sys:children` (Y.Array) + `prop:*`.
Rich text = Y.Text with deltas (`bold/italic/strikethrough/code/link/color/...`).

### 4.3 Root (workspace) Y.Doc (guid = workspaceId)
- `meta` Y.Map with `pages` Y.Array. Each page entry: `id`, `title`, `createDate` (ms float),
  `tags` (Y.Array) — written by `add_doc_to_root_doc`. App-managed extras: `updatedDate`, `trash`,
  `favorite`, `mode`, `headerImage`.
- A doc only appears in the app's sidebar once it's in `meta.pages`.

### 4.4 Diagrams (edgeless) — `affine:surface` `prop:elements` (validated)
"Boxed" wrapper (`blocksuite/framework/store/src/reactive/boxed.ts`):
```
prop:elements = Y.Map {
  "type":  "$blocksuite:internal:native$",
  "value": Y.Map<elementId, Y.Map<field, value>>   // one entry per element
}
```
`build_full_doc` already creates this (empty). Adding a diagram = insert element Y.Maps into `value`.

Per-element fields (from `blocksuite/affine/model/src/elements/*`):
- **base (all):** `type`, `index` (fractional index string, e.g. `a0`...), `seed` (number),
  optional `hidden`, `lockedBySelf`, `comments`.
- **shape:** `xywh="[x,y,w,h]"`, `rotate`, `shapeType` (`rect|ellipse|diamond|triangle`),
  `radius`, `filled`, `fillColor`, `strokeColor`, `strokeWidth`, `strokeStyle` (`solid|dashed|dotted`),
  `shapeStyle` (`General|Scribbled`), `roughness`, optional `text` (Y.Text) + text style fields.
- **connector:** `source` / `target` = `{ id?: string, position?: [x,y] }`, `mode` (0 straight / 1
  orthogonal / 2 curve), `stroke`, `strokeWidth`, `strokeStyle`, `frontEndpointStyle`,
  `rearEndpointStyle` (`None|Arrow|Triangle|Circle|Diamond`), optional `text` label.
  ⚠️ confirm whether `source`/`target` serialize as nested Y.Map vs `Any::Object`.
- **text:** `xywh`, `text` (Y.Text), `color`, `fontFamily`, `fontSize`, `fontStyle`, `fontWeight`,
  `textAlign`, `hasMaxWidth`.
- **group:** `children` (Y.Map<elementId, true>), `title` (Y.Text), `xywh`.
- **brush / highlighter:** `points` (Y.Array of `[x,y]`/`[x,y,pressure]`), `color`, `lineWidth`, `xywh`.

Geometry/format: `xywh` = string `"[x,y,w,h]"`; `rotate` in degrees; colors = hex string,
`"transparent"`, `{normal}`, or `{light,dark}`. Fractional index via the `fractional-indexing`
scheme (`generateKeyBetweenV2`) — needs a small Rust impl or crate.

`affine_common` currently **reads** surface text (for indexing) but does **not write** elements —
this is the net-new Rust work for diagrams. Read path (`packages/common/native/src/doc_parser/read/mod.rs`,
`gather_surface_texts`) is a useful validator/round-trip reference.

### 4.5 Page vs edgeless mode — RESOLVED
A doc's primary mode is persisted in the workspace's **`docProperties`** database doc (an ORM-backed
Y.Doc) — **not** in the page block, root meta, or `doc-mode-service.ts` (that's runtime-only).
Schema: `packages/frontend/core/src/modules/db/schema/schema.ts` → `docProperties.primaryMode`.
Write path: `doc.setPrimaryMode` → `docsStore.setDocPrimaryModeSetting` →
`docPropertiesStore.updateDocProperties(id, { primaryMode })`. Read default = `'page'`.
- **Storage:** Y.Doc guid **`db$docProperties`** (per workspace). Structure: top-level Y.Map keyed by
  `docId` → `{ id: <docId>, primaryMode: "edgeless"|"page", createdBy, updatedBy, ... }`.
- **CLI to set edgeless:** load/create the `db$docProperties` doc, get-or-create the Y.Map at key
  `<docId>`, set `id=<docId>` + `primaryMode="edgeless"`, push the update to that doc's guid.
- **Default:** create docs WITHOUT setting primaryMode → app opens them in page mode. `affine-cli doc
  set-mode --mode edgeless` performs the write above (used for diagram docs).
- ⚠️ **Verify guid** before relying: the frontend DB uses `db$docProperties`; the server-side
  `update_doc_properties` referenced `db$<workspaceId>$docProperties`. Confirm which the desktop app
  reads/syncs.

## 5. Reusable `affine_common` functions (pure Rust)

(`packages/common/native/src/doc_parser/`, called by `packages/backend/native/src/doc.rs` napi wrappers)
- `build_full_doc(title, markdown, doc_id) -> Vec<u8>` — new space-doc as a yjs update.
- `update_doc(existing_bin, new_markdown, doc_id) -> Vec<u8>` — structural diff update (body only).
- `update_doc_title(existing_bin, title, doc_id) -> Vec<u8>`.
- `add_doc_to_root_doc(root_doc_bin, doc_id, title?) -> Vec<u8>` — register in `meta.pages`.
- `update_root_doc_meta_title(root_doc_bin, doc_id, title) -> Vec<u8>`.
- `update_doc_properties(existing_bin, props_doc_id, target_doc_id, created_by?, updated_by?) -> Vec<u8>`.
- `parse_doc_to_markdown(doc_bin, doc_id, ai_editable?, url_prefix?) -> MarkdownResult` (tracks unsupported blocks).
- `parse_doc_from_binary(doc_bin, doc_id) -> CrawlResult` (blocks + metadata).
- `parse_page_doc(doc_bin, max_summary_len?) -> PageDocContent` (title + summary).
Limits: `MAX_MARKDOWN_CHARS = 200_000`, `MAX_BLOCKS = 2_000`.

Markdown write-path supports: headings, paragraph, quote, lists (bulleted/numbered/todo, nested),
code, divider, image (`blob://id`), tables, inline bold/italic/strike/link. **Not** supported:
surface/diagrams, database blocks, callout, latex, attachments, synced/linked-doc embeds.
(Historical: latex/math was ported afterwards, see section 13.3 and the CHANGELOG; the shipped CLI supports it in both directions.)

## 6. `affine_nbstore` API (with `use-as-lib`)

Async (tokio). Pool keyed by `universal_id`; per-workspace SQLite file.
- `connect(universal_id, path)` (runs migrations) / `disconnect` / `checkpoint`.
- `push_update(universal_id, doc_id, update) -> timestamp`.
- `get_doc_snapshot(universal_id, doc_id) -> Option<DocRecord{doc_id,bin,timestamp}>`.
- `get_doc_updates(universal_id, doc_id) -> Vec<DocUpdate>`; `set_doc_snapshot`; `mark_updates_merged`.
- `get_doc_clock(s)`, peer-clock getters/setters (sync metadata).
- `set_blob`, `get_blob`, `list_blobs`, `delete_blob`.
- FTS: `fts_add_document`, `fts_search`, `fts_get_matches`, `fts_flush_index`.
- ⚠️ confirm exact pool type name (`DocStoragePool` vs `SqliteDocStoragePool`).

## 7. The write sequences

### 7.1 Create a doc in an EXISTING (local) workspace
1. `doc_id = nanoid()`.
2. `space_update = build_full_doc(title, markdown, doc_id)` →
   `push_update(uid, doc_id, space_update)`.
3. `root_bin = load workspace root doc` (merge snapshot + updates for guid = workspaceId, via
   `get_doc_snapshot`/`get_doc_updates` + y-octo apply) → `root_update =
   add_doc_to_root_doc(root_bin, doc_id, title)` → `push_update(uid, workspaceId, root_update)`.
4. (optional) `update_doc_properties(...)` for createdBy/updatedBy, and to set mode (see §9) →
   push to the docProperties doc.

### 7.2 Create a brand-new LOCAL workspace
1. `workspaceId = uuid v4`. Make dir `workspaces/local/<workspaceId>/`.
2. `connect(@peer(local);@type(workspace);@id(<id>);, path/storage.db)` (creates + migrates db).
3. Initialize root doc meta (workspace name) and at least one doc (§7.1). The app lists it next launch.

### 7.3 Add a diagram element (net-new code)
1. Load space doc (snapshot+updates → y-octo `Doc`).
2. Navigate `blocks` → surface block → `prop:elements` → `value` map.
3. Insert element Y.Map(s) with fields per §4.4 (generate `index`, `seed`, ids).
4. `encode_state_as_update_v1(state_before)` → `push_update`.
5. (likely) set doc mode to edgeless (§9).

### 7.4 Concurrency / pickup rules (validated)
- The running app does **not** watch the SQLite file; it reads on doc load/open and pushes
  local-newer updates to its remote peer on workspace open (sync engine compares `peer_clocks`).
- **Therefore: write while the target workspace is not open in the app** (or accept that a reopen is
  needed to pick up changes). Use SQLite WAL-safe access; treat "app running on same workspace" as a
  caution. (`packages/common/nbstore/src/frontend/doc.ts`, `.../sync/doc/peer.ts`.)
  The CLI enforces this with a one-shot pre-flight probe of the WAL lock byte (`error:locked`,
  `--force` to skip) - a point-in-time check with a TOCTOU window, not a held lock, and not
  implemented on Windows (writes proceed with a `warnings` entry).
- **nbstore migrates on `connect()`.** The CLI therefore checks `_sqlx_migrations` read-only first
  and refuses behind-schema databases (`error:migration_required`, `--allow-migrate` to opt in) and
  newer-than-CLI databases (`error:db_newer`); only `workspace create` migrates a fresh file.

## 8. Command surface (proposed)

Single binary **`affine-cli`** (crate at `tools/affine-cli`), every command emits JSON (`--json` default for
agents; `--pretty` for humans), including command-line usage errors (`"error":"usage"`, exit 2; only
`--help`/`--version` stay plain text). Examples below abbreviate the binary as `affine`.
Global: `--affine-dir` (override storage root), `--workspace <id>`, `--editor-id <id>`,
`--peer <local|affine-cloud|serverId>`.

```
affine workspace list
affine workspace create   --name "Research"
affine doc list           --workspace <id>
affine doc create         --workspace <id> --title "X" (--content "md" | --md-file f.md) [--mode page|edgeless]
affine doc read           --workspace <id> --doc <id> [--format md|json]
affine doc update         --workspace <id> --doc <id> (--content | --md-file)
affine doc set-title      --workspace <id> --doc <id> --title "X"
affine doc set-mode       --workspace <id> --doc <id> --mode page|edgeless
affine doc delete         --workspace <id> --doc <id>
affine search             --workspace <id> "query"           # local FTS via nbstore
affine blob put|get       --workspace <id> ...

# Diagrams (edgeless)
affine diagram create     --workspace <id> --doc <id> --spec spec.json   # high-level graph -> shapes+connectors (+auto-layout)
affine diagram add-shape  --workspace <id> --doc <id> --shape rect --xywh "[..]" [--text ..] [--fill ..]
affine diagram add-text   ...
affine diagram add-connector --from <elId> --to <elId> [--mode curve] [--label ..]
```

**Diagram input for agents:** prefer a high-level `--spec` (nodes + edges, optional positions) so an
agent describes intent and the CLI handles layout + element construction. Keep low-level `add-*` for
precision. (Repo already depends on `mermaid-rs-renderer` — possible future `--from-mermaid`, though
that renders images, not surface elements; node/edge JSON is the primary path.)

## 9. Open questions / risks

**Resolved this session:**
- ✅ Edgeless mode persistence → `db$docProperties`.`primaryMode` (§4.5).
- ✅ Local-only vs cloud workspace → local-first; cloud peer = server id; write into existing db (§4.1).
- ✅ Auto-reload approach → app-side file watching (§13.1).

**Remaining (resolve during implementation):**
1. **Connector endpoint encoding** — confirm `source`/`target` are nested Y.Map vs `Any::Object` by
   round-tripping a real edgeless doc.
2. **rlib build** — verify `affine_common` (no `napi` feature) + `affine_nbstore` (`use-as-lib`)
   compile/link into a normal binary; resolve feature flags. (Phase 0.)
3. **docProperties guid** — `db$docProperties` vs `db$<wsid>$docProperties`; verify before relying (§4.5).
4. **Fractional index in Rust** — port/replicate `generateKeyBetweenV2` (the `fractional-indexing` scheme).
5. **Concurrency until the auto-reload branch lands** — CLI assumes the target workspace is **not open**
   in the app; document this in `--help`.
6. **Schema versions** — keep `sys:version` per flavour in sync with BlockSuite (`Schema.versions`).

## 10. Implementation plan (phases)

- **Phase 0 — spike:** create the **`tools/affine-cli`** crate (Cargo workspace member; add to root
  `[workspace].members`). Depend on
  `y-octo`, `affine_common` (no `napi` feature), `affine_nbstore` (`use-as-lib`). Prove end-to-end:
  open a real local workspace db → create a markdown doc → see it in the desktop app. Resolve the rlib
  build (risk #2).
- **Phase 1 — docs (MCP parity):** `workspace list/create` (local-only), `doc
  create/read/update/set-title/set-mode/delete`, `search` (FTS), `blob put/get`. JSON output. Binary
  `affine-cli`. Replaces all 6 MCP tools locally.
- **Phase 2 — diagrams:** y-octo surface-element writer (shape/text/connector/group), fractional index
  (#4), `doc set-mode edgeless` via docProperties (§4.5), `diagram create --spec` (node/edge graph +
  auto-layout) + low-level `add-shape/add-text/add-connector`.
- **Phase 3 — more elements:** database blocks, embeds, image polish.
- **Phase 4 — skills:** once complete & **tested**, use Anthropic's **skill-creator** skill to author
  Claude Code skills wrapping the CLI (one per capability area: docs, search, diagrams).
- **Phase 5 — ServerBackend (when self-hosting):** Rust socket.io sync client + access-token auth behind
  `trait DocBackend`; content engine unchanged.
- **Separate branch (parallel) — app auto-reload:** see §13.1. Owner: handoff agent.

## 11. Existing MCP tools being replaced

Served at `POST /api/workspaces/:id/mcp` (JSON-RPC), Bearer access token (`ut_…`). Tools:
`read_document`, `keyword_search`, `semantic_search` (read; always on);
`create_document`, `update_document`, `update_document_meta` (write; dev/canary only). All markdown-only.
Definitions: `packages/backend/server/src/plugins/copilot/mcp/{provider,controller}.ts`.
The CLI covers `read_document`, `create_document`, `update_document`, `update_document_meta`, and
`keyword_search` locally (via nbstore FTS), and adds diagrams/elements the MCP lacks.
**Parity gap:** `semantic_search` (vector embeddings) is a server/cloud feature — not available in
local-first mode. It returns with the ServerBackend (Phase 5) or a future local embedding index.

## 12. Key file references

- Rust doc engine: `packages/common/native/src/doc_parser/{write,read,markdown}/*`, `schema.rs`.
- y-octo: `packages/common/y-octo/core/src/{document.rs, doc/types/*}`.
- nbstore: `packages/frontend/native/nbstore/src/{lib.rs, storage.rs}`; schema `packages/frontend/native/schema/src/lib.rs`.
- Local paths / discovery: `packages/frontend/apps/electron/src/helper/workspace/{meta.ts,handlers.ts}`,
  `packages/common/nbstore/src/utils/universal-id.ts`.
- Sync (TS reference for Phase 4): `packages/backend/server/src/core/sync/gateway.ts`,
  `packages/common/nbstore/src/sync/*`.
- Surface/diagram model: `blocksuite/affine/model/src/elements/*`,
  `blocksuite/affine/blocks/surface/src/surface-model.ts`, `blocksuite/framework/store/src/reactive/boxed.ts`.
- MCP tools: `packages/backend/server/src/plugins/copilot/mcp/*`.
- Doc mode (docProperties): `packages/frontend/core/src/modules/db/schema/schema.ts`,
  `.../modules/doc/stores/{docs.ts,doc-properties.ts}`, `.../modules/doc/entities/{doc.ts,record.ts}`,
  `.../modules/db/services/db.ts`.
- Cloud workspace storage/sync: `packages/frontend/core/src/modules/workspace-engine/impls/cloud.ts`,
  `packages/common/nbstore/src/sync/doc/peer.ts`.

## 13. Auto-reload fix (separate branch) & handoff notes

### 13.1 App auto-reload (suggested branch `feat/nbstore-autoreload`)
Goal: the running app picks up CLI-appended updates **without reopening** the workspace. Today the app
only emits storage `update` events from its own `SqliteDocStorage.pushDocUpdate`; external writes bypass
it, and nothing watches the db file (`packages/common/nbstore/src/{frontend/doc.ts,storage/doc.ts,impls/sqlite/doc.ts}`).
**Chosen approach — app-side file watching:**
1. Rust `notify` watcher (the `notify` crate is already a dep) on `storage.db`/`-wal` in
   `packages/frontend/native/nbstore/src/storage.rs`; on change, query `clocks` for changed docIds.
2. New napi `watch_doc_changes(universal_id, callback)` in `.../nbstore/src/lib.rs` using a
   `ThreadsafeFunction` to call JS from the watcher thread.
3. `packages/common/nbstore/src/impls/sqlite/db.ts` wires the callback → emits an `externalUpdate`.
4. `packages/common/nbstore/src/storage/doc.ts` re-emits it as a normal `update` with a **foreign
   origin**. `DocFrontend` (`frontend/doc.ts`, ~lines 365-373) already schedules an `apply` job for
   non-self origins → Yjs applies → UI updates → sync pushes. **No DocFrontend logic change needed.**
Notes: debounce the watcher; WAL data lands at checkpoint. Fallback: poll the `clocks` table (simpler,
higher latency).

### 13.2 Handoff for the Workflow agent
- Read this whole doc **and** the `affine-cli-project` memory first.
- Two parallelizable tracks:
  - **Track A — `feat/agent-cli`:** Phases 0 → 1 → 2 → 3 → 4 (sequential within track).
  - **Track B — `feat/nbstore-autoreload`:** §13.1 (independent of Track A; can run in parallel).
- Do **not** reuse the `tools/cli` path or the `affine` command name (both taken). Crate =
  `tools/affine-cli` (in-fork Cargo workspace member), binary = `affine-cli`.
- Verify the ⚠️ items in §9 (rlib build, docProperties guid, connector encoding, fractional index)
  before depending on them.
- This is research-only so far — no code or branches were created this session.
  (Historical: superseded, the CLI ships at `tools/affine-cli`; see the status header.)

### 13.3 Shared `doc_parser` latex/math change — split to a stacked branch (done)

**Context.** The math feature was first built bundled in one commit (`9ca79317b`, titled
`feat(affine-cli): …`) that mixed CLI code with changes to **shared production code** —
`packages/common/native/src/doc_parser/*` (`affine_common`), a dependency of desktop native,
mobile-native, **the backend server**, and the CLI. A bundled shared-crate change is (a) invisible to
the right reviewers under a CLI title, (b) a recurring rebase-conflict surface against upstream, and
(c) impossible to upstream cleanly.

**Bug-vs-design finding (the key reframe).** The Rust `doc_parser` is a **port** of BlockSuite's
canonical TypeScript markdown adapter, which **already supports latex in both directions** — inline
(`blocksuite/affine/inlines/latex/src/adapters/markdown/`, `inlineMath` → `{ insert: ' ', attributes:
{ latex } }`) and block (`blocksuite/affine/blocks/latex/src/adapters/markdown/markdown.ts`, `math`
mdast ⇄ `affine:latex`), via `remark-math`, even with a currency-escaping preprocessor. So the Rust
side's lack of latex was **an incomplete port, not an intentional design choice** — `affine:latex`
sat in `KNOWN_UNSUPPORTED_MARKDOWN_FLAVOURS` (a tracked-TODO list). This makes the change *parity
work* (align the Rust port with AFFiNE's own behavior), **not** an opinionated fork dialect — which is
why "descope to `add-latex` only" was rejected (it would make the CLI a worse importer than the app)
and why it's a legitimate single **upstream** PR candidate.

**Decision.** Split into two **stacked** branches (not feature-gate, not re-scope):
- **`feat/doc-parser-latex-parity`** (base `canary`) — only the 10 `doc_parser` files. Honest title:
  `feat(native): port latex markdown adapter to Rust doc_parser`. Reviewable on its own; one upstream
  PR candidate.
- **`feat/agent-cli`** (base = the port branch) — CLI-only. The old feature commit became an honest
  `docs(affine-cli): …` commit (its only CLI-side content was skill docs).

**Topology nuance vs auto-reload (§13.1):** both follow "shared code gets its own labeled branch,"
but auto-reload is **parallel/independent** (CLI works without it) whereas doc-parser-math is
**stacked/dependency** (CLI math features are load-bearing on it) — so the CLI branch *bases on* the
port branch rather than running beside it. Dependency ⇒ ordering (stack), **not** bundling.

**Scope of the port (increment 1):** core `$`/`$$` delimiters only. The TS adapter's preprocessor
extras (`\[…\]`/`\(…\)` alternate delimiters, mhchem, explicit currency escaping) are **not yet
ported** — a deliberate follow-up. **Upstream gate:** making the port faithful to the TS adapter
(close that preprocessor gap) before offering it to `toeverything/AFFiNE`. The upstream-or-fork-local
decision is **deferred**; read-back and input are one feature, decided as a unit.

**PR targets (don't conflate):** the port branch *may* become a PR to **upstream**; the CLI branch is
always a PR **within the fork**. If the port is upstreamed, the CLI branch stops carrying the port
commits and simply depends on the merged-upstream code.

### 13.4 Vendoring the doc_parser into the CLI (2026-07-27)

§13.3's stacked-branch plan died upstream: PR #15197 (merged 2026-07-06) **removed the Rust
doc_parser from `packages/common/native`** entirely. The parser now ships as the published
crates.io crate `affine_doc_loader` (0.1.3, by DarkSky), whose source is not developed in the
public monorepo — its crates.io metadata points at toeverything/AFFiNE, but the code is not in
the tree. y-octo likewise moved to a crates.io dependency (`y-octo = "0.0.3"`).

Consequences and the new topology:

- `feat/doc-parser-latex-parity` cannot be a PR against upstream anymore (its target files are
  deleted there). It remains a fork-history branch.
- The CLI now **vendors** the doc_parser (with the latex/math port and the round-trip fixes) as
  `tools/affine-cli/src/doc_parser`, making `feat/affine-cli` a single self-contained branch off
  upstream/canary that touches only `tools/`, the root workspace `members` list, `Cargo.lock`,
  `docs/`, and one workflow file.
- The published `affine_doc_loader` 0.1.3 still rejects `$…$`/`$$…$$` (`unsupported_markdown:math`)
  and still blacklists `affine:latex` on read-back — the latex work remains a live contribution,
  offered to upstream for adoption into that crate (tracked in the upstream issue).
