# Plan: Experimental Local Workspace Mirror

## Developer Request

Implement a native, one-way mirror from an AFFiNE cloud workspace to a user-specified local project directory. The mirror must make the workspace readable to AI agents through a `.affine` directory, retain AFFiNE's richer content in a loss-preserving representation, and leave a deliberate path toward future bidirectional synchronization. It must not depend on MCP or a CLI. The feature must be opt-in behind AFFiNE's existing Experimental Features settings.

## Developer Supplied Context

- The desired workflow keeps AFFiNE Cloud collaboration and other cloud features while also making workspace pages, folders, and assets visible on disk inside a Git project.
- The expected destination is `<user-selected-project>/.affine/`, analogous to Obsidian's local files but capable of representing AFFiNE-specific content.
- AI-agent visibility is the primary reason for readable Markdown files.
- Future bidirectional synchronization should be possible without replacing the v1 architecture, but v1 itself is strictly one-way.
- The AFFiNE developer response supplied by the developer says MCP is the current solution but still has bugs, while a CLI design was tried and is expected to take longer to ship.
- The developer explicitly does not want MCP or CLI to be part of this design.
- The supplied screenshot shows General Settings -> Experimental Features and confirms that Local Workspace Mirror must appear there as an opt-in switch before its workspace controls or background behavior are available.
- Follow YAGNI: do not implement a filesystem watcher, local-to-cloud importer, merge engine, daemon, or speculative generic synchronization framework in v1.

## Goal

Ship an experimental Electron Desktop feature with the following behavior:

1. A global, device-local, default-off `enable_local_workspace_mirror` experimental flag controls whether the feature exists at runtime.
2. When that flag is enabled, an authorized user can enable a mirror for an individual workspace and select a project directory.
3. AFFiNE owns only the `.affine` child of that selected directory and writes an agent-readable, Git-friendly projection of all accessible workspace content.
4. Cloud/local workspace state remains canonical; local mirror files are never imported in v1.
5. Remote and in-app changes are mirrored incrementally while AFFiNE Desktop is running and the workspace engine is active.
6. Rich AFFiNE content is preserved in snapshot sidecars whenever Markdown is lossy.
7. Existing local modifications are detected and never overwritten or deleted without explicit confirmation.
8. The file contract records stable identities and baselines sufficient for a future three-way bidirectional synchronizer.

Success means the experimental flag, workspace UI, serialization, filesystem boundary, lifecycle, safety behavior, tests, and documentation all work together. Hiding the UI without stopping the runtime does not satisfy the gate.

## Context Gathered

- Research checkout: AFFiNE `canary` at commit `427db3986223d244828ebad4ffffe284e8da42c1` when this plan was created.
- No repository-root `AGENTS.md` exists. The only discovered instruction file is `packages/frontend/apps/ios/AGENTS.md`, which does not apply because this feature is Electron-only and must not touch iOS.
- Experimental feature definitions live in `packages/frontend/core/src/modules/feature-flag/constant.ts` as `AFFINE_FLAGS`.
- `packages/frontend/core/src/desktop/dialogs/setting/general-setting/experimental-features/index.tsx` automatically renders configurable entries from `AFFINE_FLAGS`; a separate navigation item is not needed.
- Flag values are persisted device-locally under `affine-flag:<flag-key>` by `Flags` in `packages/frontend/core/src/modules/feature-flag/entities/flags.ts`.
- Flags expose both synchronous `.value` and reactive `.$` access. Only `enable_ai` currently forces a page reload; the mirror can start and stop reactively without a restart.
- `BUILD_CONFIG.isElectron` is the correct product boundary. The flag should be unavailable in browser and mobile editions and should default to `false` in every build channel.
- Workspace Storage settings are composed in `packages/frontend/core/src/desktop/dialogs/setting/workspace-setting/storage/index.tsx`. Existing export visibility uses `canExport = !isTeam || isOwner`.
- The existing Markdown export in `packages/frontend/core/src/components/hooks/affine/use-export-page.ts` creates a BlockSuite `Transformer`, applies document-link/title/synced-document middleware, and obtains Markdown plus referenced asset IDs.
- `blocksuite/affine/widgets/linked-doc/src/transformers/markdown.ts` contains the same useful conversion but ends by downloading a file or ZIP. Its pure conversion portion must be reusable without a download.
- BlockSuite's `Transformer.docToSnapshot` preserves the block tree as `DocSnapshot`. `blocksuite/affine/widgets/linked-doc/src/transformers/zip.ts` demonstrates snapshot and asset export/import, but its ID-replacement middleware is inappropriate for a mirror because mirror snapshots must preserve source IDs.
- `DocsService.open(docId)` and `Doc.waitForSyncReady()` provide the supported background document-loading path.
- `workspace.engine.doc.storage.subscribeDocUpdate` and document timestamp APIs in `packages/common/nbstore/src/worker/client.ts` provide change signals and reconciliation evidence.
- `WorkspaceDBService.isDBDocId` identifies `db$` and `userdata$` internal documents. Those must trigger metadata projection but must not be emitted as ordinary pages.
- Folder records are stored in `WorkspaceDBService.db.folders`; documents can be linked in more than one place, so a physical folder tree cannot be treated as a canonical document path.
- `WorkspaceLocalState` is already scoped by workspace ID and backed by device-local global state. It is appropriate for the selected absolute path, workspace mirror enabled state, and UI preferences.
- Electron helper handlers are registered in `packages/frontend/apps/electron/src/helper/exposed.ts`; handler metadata and TypeScript API exposure are generated dynamically.
- Existing dialog export code in `packages/frontend/apps/electron/src/helper/dialog/dialog.ts` demonstrates directory selection, realpath normalization, temporary writes, and atomic `fs.move` replacement.
- Electron renderer-specific modules are registered in `packages/frontend/apps/electron-renderer/src/app/effects/modules.ts`; the mirror module must be configured there, not in browser-common module setup.

## Missing Context

- No dedicated GitHub issue or Discord discussion URL was supplied for the experimental item's optional feedback row. This is not blocking; omit `feedbackType` in the first implementation unless maintainers supply a canonical destination during review.
- Maintainers have not supplied a formal maximum workspace size or sync-latency target. The plan therefore requires bounded memory/IPC behavior and records benchmark results rather than inventing an unsupported hard limit.
- The final product copy may be adjusted during review, but the proposed flag and settings behavior are not dependent on exact wording.

## Assumptions

- V1 is supported only by AFFiNE Electron Desktop.
- The experimental flag is global and device-local, matching existing AFFiNE flag behavior.
- Mirror enablement and destination are separate, device-local, per-workspace settings.
- The user selects a project root; AFFiNE creates or adopts only `<project-root>/.affine`.
- Cloud workspaces and local workspaces share the serializer, but the initial product requirement and acceptance focus on cloud workspaces.
- Team workspace access follows the existing export rule. If ownership/export permission is lost, runtime mirroring stops immediately.
- AFFiNE must be running with the workspace loaded to mirror incoming cloud changes. V1 does not install a background operating-system service.
- All accessible document content is projected, including trashed documents, with trash state represented in metadata and the generated index.
- Only referenced assets are exported. Unused historical blobs are not considered workspace content for this feature.
- Markdown is the human/agent editing surface for a future importer; snapshot JSON is an app-owned fidelity sidecar and is not presented as a hand-editing format.
- Disabling the experimental flag stops runtime activity and hides workspace controls but preserves the per-workspace configuration and existing disk mirror. Re-enabling the flag resumes an enabled workspace mirror after normal reconciliation.
- No feature-flag change requires an application restart.

## Decisions Needed

No decision blocks implementation.

- Feedback destination: recommended default is no feedback row until a canonical issue/discussion exists. Adding a URL later is a data-only `AFFINE_FLAGS` change.
- Final labels: recommended flag name is `Local workspace mirror`; recommended description is `Mirror this device's AFFiNE workspaces to local, agent-readable files. Configure each workspace in Storage settings.`
- Trash policy: this plan includes trashed documents for completeness. If product review chooses to exclude them, retain tombstones and metadata so remote deletions remain distinguishable from incomplete exports.

## Scope

### Included in v1

- Experimental feature registration and reactive runtime gate.
- Per-workspace enablement and user-selected destination.
- Initial full reconciliation and incremental one-way updates.
- Markdown, workspace metadata/index, snapshots, and referenced assets.
- Atomic writes, managed-file deletion, hash baselines, and local-edit conflict detection.
- Manual Sync now, Open folder, Replace local changes, Disable mirror, status, and error presentation.
- Permission, path-safety, restart/reconnect, crash recovery, and large-workspace verification.

### Explicitly excluded from v1

- Reading Markdown changes into AFFiNE.
- Filesystem watching.
- Local-to-cloud asset upload.
- Automated merge/conflict resolution.
- MCP, CLI, or a separate daemon.
- Physical duplication of documents into every AFFiNE folder link.
- Symlinks as a folder representation.
- User-selectable serialization formats or extensive mirror filters.
- Mirroring while AFFiNE Desktop is fully terminated.

## Experimental Feature Contract

Add this AFFiNE flag in `packages/frontend/core/src/modules/feature-flag/constant.ts`:

```ts
enable_local_workspace_mirror: {
  category: 'affine',
  displayName:
    'com.affine.settings.workspace.experimental-features.enable-local-workspace-mirror.name',
  description:
    'com.affine.settings.workspace.experimental-features.enable-local-workspace-mirror.description',
  configurable: BUILD_CONFIG.isElectron,
  defaultState: false,
}
```

The implementation must enforce the flag in three places:

1. Experimental Features displays the switch automatically only in Electron.
2. Workspace Storage mounts `DesktopLocalMirrorPanel` only when the flag is true and export permission is present.
3. `LocalMirrorService` independently subscribes to the flag and permission state. When either becomes false it aborts active work, unsubscribes from workspace updates, clears queued jobs, and refuses manual mirror operations.

The third gate is authoritative. A stale mounted component, saved per-workspace `enabled: true`, or direct service call must not continue filesystem writes after the experiment is disabled.

Flag transition behavior:

| Transition               | Required behavior                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| false -> true            | Expose workspace controls; if that workspace was previously enabled, start a normal reconciliation.                    |
| true -> false            | Abort the current generation, stop subscriptions, preserve destination/configuration/files, report `feature-disabled`. |
| app starts false         | Do not inspect or write the target directory and do not subscribe to document updates.                                 |
| app starts true          | Load per-workspace configuration and reconcile only if that workspace mirror is enabled.                               |
| permission true -> false | Same runtime stop as flag disable, but report `permission-denied`.                                                     |

## Mirror File Contract

```text
<selected-project>/
  .affine/
    index.md
    workspace.json
    mirror.json
    docs/
      <stable-doc-id>.md
    snapshots/
      <stable-doc-id>.snapshot.json
    assets/
      <blob-id>.<extension>
```

### `mirror.json`

Versioned ownership and baseline manifest:

```ts
type MirrorManifestV1 = {
  formatVersion: 1;
  workspaceId: string;
  workspaceFlavour: string;
  generation: string;
  lastCompletedAt: string;
  sourceSyncState: 'synced' | 'cached-offline';
  files: Record<
    string,
    {
      kind: 'index' | 'workspace' | 'markdown' | 'snapshot' | 'asset';
      sha256: string;
      docId?: string;
      sourceHash?: string;
    }
  >;
};
```

- `workspaceId` is the ownership marker. Never adopt a non-empty `.affine` owned by another workspace.
- `files` is the exclusive list of paths AFFiNE may replace or delete.
- `sha256` is the last generated file baseline used to detect external edits.
- `sourceHash` records the serialized remote/source version needed by a future three-way comparison.
- Commit `mirror.json` last so it identifies only a completed generation.

### `workspace.json`

Contains stable workspace metadata that Markdown cannot faithfully encode:

- workspace ID, name, and flavour;
- document IDs, titles, timestamps, modes, tags, custom properties, and trash state;
- folder records and document/tag/collection link records, including ordering and parent IDs;
- generated relative paths for each document;
- schema version independent of `mirror.json` format version.

Do not include authentication tokens, server credentials, session data, local absolute paths, email addresses that are not document content, or other operational secrets.

### `index.md`

- Provides the workspace title and generation timestamp.
- Renders the folder/link graph as a navigable Markdown tree.
- Links every appearance of a document to the same `docs/<doc-id>.md` file.
- Includes explicit Unfiled and Trash sections.
- Represents cycles or malformed folder records defensively instead of recursing forever.

### `docs/<doc-id>.md`

Each document starts with stable YAML frontmatter:

```yaml
---
affineFormatVersion: 1
workspaceId: <workspace-id>
docId: <doc-id>
title: <title>
createdAt: <iso-date-or-null>
updatedAt: <iso-date-or-null>
trashed: false
primaryMode: page
tags: []
sourceHash: <hash>
generated: true
---
```

- Use stable IDs for filenames; title changes must not cause file renames.
- Rewrite AFFiNE document links to relative `./<target-doc-id>.md` links.
- Rewrite asset references to `../assets/<blob-id>.<extension>`.
- Preserve meaningful text for unsupported rich blocks and emit an explicit placeholder when Markdown cannot represent the block.
- Use the current synced-document embedding behavior only where it does not make navigation ambiguous; retain the source snapshot in all cases.

### `snapshots/<doc-id>.snapshot.json`

- Generate with `docToSnapshot` while preserving original workspace, document, and block IDs.
- Do not use `replaceIdMiddleware`, which is intended for importing copies.
- Serialize deterministically enough for stable hashing and reviewable Git diffs.
- Treat it as app-owned fidelity data; v1 never reads it back into the workspace.

### `assets/`

- Export only blobs referenced by mirrored documents.
- Deduplicate by blob ID/content address across documents.
- Preserve a safe extension derived from known MIME metadata; never trust a document-provided filename as a path.
- Never load the entire workspace's assets into renderer memory or one IPC payload.

## Architecture Boundaries

### Renderer/core: serialization and coordination

Create `packages/frontend/core/src/modules/local-mirror/` with narrow responsibilities:

- `LocalMirrorService`: feature/permission gate, lifecycle, queue, reconciliation, status, and commands.
- `LocalMirrorSerializer`: one loaded BlockSuite document -> Markdown, snapshot, asset references, metadata, and hashes.
- `LocalMirrorProjection`: workspace/folder metadata -> `workspace.json` and `index.md`.
- Manifest/domain types and typed status/error values.

Register `configureDesktopLocalMirrorModule` only from Electron renderer module setup. Scope `LocalMirrorService` to `WorkspaceScope` and inject `FeatureFlagService`, `WorkspacePermissionService`, `WorkspaceService`, `DocsService`, `WorkspaceDBService`, `WorkspaceLocalState`, and `DesktopApiService` as required.

Do not create unused watcher/importer interfaces in v1. Future synchronization is enabled by the file contract and current component boundaries, not by empty abstractions.

### Electron helper: filesystem capability

Create `packages/frontend/apps/electron/src/helper/mirror/` and expose a `mirror` handler namespace:

- `selectProjectDirectory()`
- `inspectTarget({ projectRoot, workspaceId })`
- `writeBatch({ projectRoot, workspaceId, files })`
- `finalizeGeneration({ projectRoot, workspaceId, manifest, stalePaths })`
- `revealMirror({ projectRoot, workspaceId })`

The renderer supplies relative paths and serialized bytes. The helper owns path normalization, containment checks, symlink defense, atomic temporary writes, current-file hashing, managed deletion, and final manifest commit.

Do not expose arbitrary absolute-path write/delete APIs.

### Local configuration

Store under `WorkspaceLocalState`:

```ts
type LocalMirrorConfig = {
  enabled: boolean;
  projectRoot: string | null;
};
```

Keep operational status in memory. Keep file baselines in `mirror.json`, where they travel with the mirror and remain available for future bidirectional comparison.

## Reconciliation and Update Algorithm

### Initial/startup reconciliation

1. Require Electron, feature flag true, permission true, mirror enabled, and a configured destination.
2. Inspect the target and validate ownership before loading workspace content.
3. If connected, wait for document synchronization with workspace disposal/flag-disable cancellation. If offline, use the current local cache and record `cached-offline` visibly.
4. Snapshot the current document metadata, folders, tags, properties, and trash state.
5. Open one user document at a time through `DocsService`, add temporary priority, wait for sync readiness, serialize, write a bounded batch, and release the document in `finally`.
6. Fetch/write only assets referenced by the current document; skip assets already present with the expected hash.
7. Generate `workspace.json` and `index.md` after document serialization succeeds.
8. Compare previously managed paths with the new generation. Remove only unmodified stale paths.
9. Commit `mirror.json` last.
10. Report success, cached-offline success, conflicts, or a structured error.

### Incremental updates

- Subscribe only while all runtime gates are true.
- Coalesce changes per document for approximately 750 ms and serialize jobs through one queue.
- User-document changes enqueue that document.
- Workspace root changes trigger doc-list and metadata reconciliation.
- `db$` changes regenerate workspace metadata/index but are not exported as pages.
- Document removal/trash/folder/title/tag changes update projection metadata and the affected page.
- A full reconciliation runs on startup, reconnect, workspace resume, and Sync now; do not add a periodic timer in v1.
- If a new update arrives while a document is serializing, enqueue one additional pass after the current pass rather than allowing concurrent writes.

### Local modification and deletion safety

Before replacing or deleting any previously managed path:

1. Hash the current file.
2. Compare it with the last generated `mirror.json` hash.
3. If equal, the operation is safe.
4. If different, leave the file untouched, record a conflict, and omit a successful new manifest baseline for that path.

`Replace local changes` is the only v1 action allowed to override conflicts and requires explicit confirmation. Disabling the mirror or feature flag never deletes files. An explicit future `Remove mirror files` command may be added only if separately approved and must still use managed paths.

## Future Bidirectional Path

V1 must preserve these invariants so a later phase can add local-to-cloud synchronization without MCP or CLI:

- Stable workspace, document, block, and asset identities exist on disk.
- Markdown has machine-readable frontmatter and deterministic relative links.
- The last generated local hash and source hash form the common ancestor for three-way comparison.
- Snapshot sidecars preserve blocks that Markdown cannot round-trip.
- Workspace metadata records folder/link relationships separately from physical paths.
- Serialization and filesystem access are separate from coordination.

A future implementation can then add, in order:

1. A desktop filesystem watcher scoped to the validated `.affine` root.
2. Debounced change classification that ignores AFFiNE-originated writes.
3. Three-way comparison of baseline, current local file, and current remote source.
4. Markdown import for an explicitly supported capability set: text, headings, lists, titles, tags, links, code, and assets first.
5. Blob ingestion through existing workspace blob storage.
6. Workspace-engine transactions tagged with a local-mirror origin to suppress write echoes.
7. Manual conflict resolution when both local and remote changed.
8. Later, feature-specific merging for database/canvas content only after explicit product semantics and tests exist.

Snapshots must not be blindly imported over live documents; they are fidelity evidence, not an automatic last-writer-wins channel.

## Risks

- **Markdown lossiness:** databases, canvases, embeds, and other rich blocks may flatten or disappear. Mitigation: golden tests, explicit placeholders, and a snapshot for every document.
- **Background exporter lacks active editor services:** the current UI hook obtains an adapter through editor scope. Mitigation: extract the pure `MarkdownAdapter` path used by `MarkdownTransformer` so serialization works from a loaded `Store` without an editor DOM.
- **Wrong relative links:** current export middleware targets AFFiNE URLs and asset paths intended for downloaded ZIP roots. Mitigation: mirror-specific document/asset path rewriting with link-resolution tests.
- **Large assets and workspaces:** one workspace-wide IPC payload can exhaust memory. Mitigation: one-document/bounded-file batches, sequential backpressure, asset deduplication, and recorded benchmarks.
- **Incomplete cloud state:** offline or reconnecting workspaces can export cached content. Mitigation: visible source sync state and mandatory reconciliation after reconnect.
- **Data leakage through Git:** a private workspace can be committed to a public repository. Mitigation: prominent first-enable warning and no credentials/operational metadata in the projection.
- **Path traversal or symlink escape:** malicious IDs or a replaced `.affine` path could escape the selected project. Mitigation: helper-owned realpath/containment validation, relative paths only, safe generated names, and symlink tests.
- **Accidental deletion:** a broad stale-file sweep could remove user files. Mitigation: delete only paths in the prior ownership manifest whose hashes still match.
- **Flag only hides UI:** previously enabled mirrors could keep writing after opt-out. Mitigation: the coordinator's reactive gate is authoritative and covered by runtime tests.
- **Permission changes:** a former team owner could continue exporting. Mitigation: subscribe to permission state and abort immediately when export access is lost.
- **Folder graph ambiguity:** multiple links cannot map to one canonical directory. Mitigation: stable flat document files plus exact graph projection in `index.md`/`workspace.json`.
- **Concurrent generations:** overlapping updates can produce stale commits. Mitigation: a single workspace queue, generation tokens, cancellation, and manifest-last semantics.

## Implementation Phases

### Phase 1: File contract and pure serializer

Status: completed

Goal: Produce deterministic, agent-readable Markdown and loss-preserving snapshots from a loaded document without triggering a browser download.

Dependencies: none.

Likely files/areas:

- `packages/frontend/core/src/modules/local-mirror/`
- `packages/frontend/core/src/components/hooks/affine/use-export-page.ts`
- `blocksuite/affine/widgets/linked-doc/src/transformers/markdown.ts`
- BlockSuite adapter/transformer tests

Steps:

1. Add manifest, workspace projection, page frontmatter, status, error, and serialized-file types with runtime validation for disk JSON.
2. Extract a pure Markdown serialization function returning text and referenced asset IDs; retain existing download behavior as a consumer of the same function.
3. Build `LocalMirrorSerializer` around one transformer job that returns Markdown, an ID-preserving snapshot, referenced assets, and a stable source hash.
4. Add mirror-specific relative document-link and asset-link transformation.
5. Add workspace projection functions for folder/link graph, Unfiled, Trash, malformed graph protection, and stable ordering.
6. Add golden fixtures for ordinary page blocks, linked documents, synced documents, images/files, database blocks, edgeless/canvas content, equations, callouts, and unsupported blocks.

Verification:

- Run focused BlockSuite/core Vitest files for serializers and projections.
- Run `yarn lint:prettier -- <changed-files>` or the repository-supported focused equivalent.
- Confirm the same source document serializes byte-identically twice.
- Confirm snapshots retain original document/block IDs and validate against `DocSnapshot` schema.
- Confirm every generated local Markdown/asset link resolves inside the sample mirror tree.

Completion signal: pure serialization needs no active editor DOM, all fixtures retain readable Markdown plus valid snapshots, and format schemas are fixed at version 1.

Implementation evidence (2026-07-15):

- Added a DOM-free `MarkdownTransformer.serializeDoc` primitive and retained manual download export as its consumer.
- Added versioned manifest/workspace schemas, deterministic JSON/frontmatter, stable document/snapshot paths, folder/index projection, Markdown/snapshot/asset serialization, attachment links, and edgeless/canvas fidelity notices.
- Immediate fixes from discovery: asset IDs now include transformer path references, source hashes include document metadata, snapshots and workspace JSON are runtime-validated, malformed/unreachable folder links remain discoverable, synced-doc inlining is not relied on, and IPC-bound bytes use `Uint8Array`.
- Verification: 3 focused Vitest files passed (6 tests); linked-doc plus core TypeScript project build passed; focused Prettier check passed.

Next step: implement the experimental feature definition and gated workspace Storage UI shell.

Plan update required after this phase: yes. Record discovered adapter limitations and any format-contract changes before continuing.

Implementation started on branch `feat/local-workspace-mirror`.

### Phase 2: Experimental feature and workspace UI shell

Status: completed

Goal: Establish the default-off experimental consent gate and per-workspace configuration UI before background writes are possible.

Dependencies: Phase 1 types/status contract.

Likely files/areas:

- `packages/frontend/core/src/modules/feature-flag/constant.ts`
- `packages/frontend/i18n/src/resources/en.json`
- generated i18n output
- `packages/frontend/core/src/desktop/dialogs/setting/workspace-setting/storage/index.tsx`
- new `storage/local-mirror.tsx` and styles/tests

Steps:

1. Add `enable_local_workspace_mirror` with `category: 'affine'`, `configurable: BUILD_CONFIG.isElectron`, and `defaultState: false`.
2. Add localized flag name/description and regenerate typed i18n resources using the package's build script.
3. Add `DesktopLocalMirrorPanel`, mounted only for Electron when the feature flag and export permission are true.
4. Add project-directory selection, resolved `.affine` preview, enable/disable, Sync now, Open folder, status, conflict count, and Replace local changes controls. Commands may remain wired to a test double until the service phase.
5. Show a first-enable warning that the selected workspace content will be written to disk and may be committed or published through Git.
6. Persist only `enabled` and `projectRoot` through `WorkspaceLocalState`.

Verification:

- `yarn workspace @affine/i18n build`
- Focused component/flag tests.
- Flag is absent outside Electron, visible but off by default in Electron, and persists across reload.
- Storage panel is absent when the flag is false or permission is denied.
- Toggling the flag does not require a restart.

Completion signal: an Electron user must explicitly accept Experimental Features, enable Local workspace mirror, and then configure a workspace; other platforms expose no control.

Implementation evidence (2026-07-15):

- Added the default-off, Electron-only `enable_local_workspace_mirror` flag and generated typed English i18n resources.
- Added a Storage settings panel with destination preview, first-enable Git/privacy warning, enable/disable, Sync now, Open folder, status/conflict output, and confirmed Replace local changes.
- The panel uses the same fail-closed local/non-team/team-owner permission rule as the runtime service and is absent while the experiment is off.
- Verification: i18n build, core/Electron/renderer TypeScript project build, focused formatting/lint, and permission/runtime-gate tests passed.

Plan update required after this phase: yes. Record final copy and any UX review decisions.

### Phase 3: Constrained Electron filesystem helper

Status: completed

Goal: Provide a safe, atomic, mirror-specific filesystem capability across the renderer/helper boundary.

Dependencies: Phase 1 file contract.

Likely files/areas:

- `packages/frontend/apps/electron/src/helper/mirror/`
- `packages/frontend/apps/electron/src/helper/exposed.ts`
- `packages/frontend/apps/electron/test/mirror/`
- inferred types in `packages/frontend/electron-api`

Steps:

1. Add directory selection and target inspection handlers.
2. Implement canonical project/mirror path resolution and reject absolute child paths, traversal, symlink escape, filesystem roots, app-data locations, and a foreign workspace marker.
3. Implement bounded atomic file writes using temporary siblings and rename/move in the same directory.
4. Hash the current file before overwrite/delete and return typed conflicts instead of mutating divergent files.
5. Implement finalization that deletes only unchanged paths from the prior manifest and commits the new manifest last.
6. Add reveal/open-folder support without exposing arbitrary write/delete operations.
7. Clean orphaned temporary files from interrupted generations only when their names and parent mirror ownership are validated.

Verification:

- `yarn test packages/frontend/apps/electron/test/mirror`
- Tests for Windows drive/case normalization, POSIX paths, traversal, absolute paths, symlinked project/mirror/child, foreign workspace, unknown files, modified managed files, interrupted writes, stale deletion, and manifest-last commit.
- Confirm unknown files under `.affine` and all files outside it remain untouched.

Completion signal: all filesystem mutations are scoped to a validated, owned mirror and failure cannot convert into broad deletion or partial-file corruption.

Implementation evidence (2026-07-15):

- Added a typed `mirror` helper namespace for selection, inspection, bounded batch writes, manifest-last finalization, and reveal.
- Canonical project/mirror validation rejects filesystem roots, app-data locations, traversal, foreign ownership, and symlinked mirror paths; child paths are constrained to the v1 contract.
- Atomic sibling writes, streamed SHA-256 baselines, exclusive generation leases, app-private transaction records, unchanged-file skipping, managed stale deletion, and explicit conflict replacement preserve unknown and locally modified files.
- Crash recovery verifies backups and live generation hashes before rollback; renderer disconnect, gate loss, or permission loss aborts the owned lease before it can finalize.
- Verification: seven real-temporary-directory Electron helper tests cover writes/finalization, incremental partial staging, exclusive leases, conflicts, traversal, foreign ownership, symlink rejection, and reveal; Electron/core/renderer TypeScript builds passed.

Plan update required after this phase: yes. Record platform-specific path behavior.

### Phase 4: Gated full reconciliation service

Status: completed

Goal: Generate a complete initial mirror through a workspace-scoped service that cannot run when the experiment or permission gate is off.

Dependencies: Phases 1-3.

Likely files/areas:

- `packages/frontend/core/src/modules/local-mirror/index.ts`
- `packages/frontend/core/src/modules/local-mirror/services/local-mirror.ts`
- service tests
- `packages/frontend/apps/electron-renderer/src/app/effects/modules.ts`

Steps:

1. Register a workspace-scoped `LocalMirrorService` only in Electron renderer setup.
2. Implement a central `canRun$` from Electron support, experimental flag, export permission, per-workspace enabled state, valid path, and workspace lifecycle.
3. On `canRun$` false, abort active synchronization, clear queued work, dispose document subscriptions, and reject commands with a typed status.
4. On startup/enable/path change/re-enable, inspect ownership and execute the initial reconciliation algorithm with one-document backpressure and guaranteed document release.
5. Handle online synchronized and cached-offline source states explicitly.
6. Project internal DB metadata without exporting `db$`/`userdata$` documents as pages.
7. Connect UI commands and observable status/error/conflict state.

Verification:

- Service unit tests with mocked feature flags, permission, workspace engine, serializer, and desktop API.
- Stored `enabled: true` plus flag false performs zero target inspection and zero writes.
- Turning the flag or permission off during a blocked document/asset write aborts and prevents manifest finalization.
- Turning the flag back on performs a fresh reconciliation and does not trust an interrupted generation.
- Initial cloud workspace fixture produces all expected docs, snapshots, metadata, index, and referenced assets.

Completion signal: a user can intentionally create a complete, safe one-way mirror and the runtime gate is proven independently of UI visibility.

Implementation evidence (2026-07-15):

- Registered the workspace-scoped module only in Electron renderer setup and made `LocalMirrorSerializer` a framework service.
- Added an authoritative reactive gate over experiment, permission, per-workspace enablement, destination, and workspace lifecycle; gate loss invalidates generations, clears queues, and unsubscribes before any later manifest commit.
- Full reconciliation loads and releases one document at a time, writes bounded single-file IPC batches, projects folders/metadata, records synced versus cached-offline state, and finalizes the manifest last.
- Verification includes stored-enabled/flag-off zero-inspection coverage and a blocked-write test proving mid-generation flag disable prevents finalization.

Plan update required after this phase: yes. Record lifecycle/sync-state edge cases.

### Phase 5: Incremental updates and conflict workflow

Status: completed

Goal: Keep the mirror current while AFFiNE runs without excessive writes or silent local data loss.

Dependencies: Phase 4.

Steps:

1. Subscribe to document-storage updates only while `canRun$` is true.
2. Add per-document debounce/coalescing and a single serialized generation queue.
3. Classify user document, root document, internal DB, metadata-only, trash, and deletion changes.
4. Regenerate only the affected document/assets plus workspace projection when possible.
5. Add generation tokens so stale jobs cannot finalize after disable, path change, workspace disposal, or a newer full reconciliation.
6. Surface local-edit and deletion conflicts in the settings panel.
7. Implement explicitly confirmed Replace local changes and re-run reconciliation afterward.
8. Reconcile on reconnect, resume, startup, and Sync now.

Verification:

- Rapid edits to one document cause one trailing export, not one export per CRDT update.
- Concurrent edits to different documents remain serialized and end with the latest content.
- Rename changes frontmatter/index without moving the stable document path.
- Folder relink updates the graph without duplicating documents.
- Remote delete removes only an unchanged managed file; a locally modified file remains and reports a conflict.
- Disable/path switch during a queue leaves no stale manifest commit.
- Restart and reconnect converge to byte-identical output.

Completion signal: normal cloud/in-app changes converge automatically, and every divergent local file is preserved until explicit user action.

Implementation evidence (2026-07-15):

- Added a single serialized queue with 750 ms coalescing, full reconciliation for root/database/reconnect/manual events, and targeted document reconciliation for ordinary document updates.
- Targeted updates preserve unaffected manifest entries, update the workspace projection, use stable document paths, and remove only unchanged obsolete managed page/snapshot files; a later full reconciliation reclaims conservatively retained historical assets.
- Destination changes and gate loss invalidate active generations. New updates arriving during a run schedule one trailing pass.
- Locally divergent files surface as conflicts and require the explicit Replace local changes confirmation before overwrite or deletion.

Plan update required after this phase: yes. Record event-classification gaps and measured debounce behavior.

### Phase 6: Hardening, review, documentation, and rollout

Status: in_progress

Goal: Prove the experimental feature is safe and understandable across supported desktop platforms before it is proposed upstream.

Dependencies: Phases 1-5.

Steps:

1. Add integration fixtures covering mixed page/edgeless/database/embed content, duplicate folder links, Trash, large binary assets, and malformed metadata.
2. Measure initial and incremental sync for representative small, medium, and large workspaces; record peak renderer/helper memory and IPC batch sizes.
3. Add telemetry only if existing privacy/product conventions provide an approved event path. Never include paths, titles, content, or document IDs.
4. Add user-facing documentation covering experimental enablement, destination ownership, cloud-canonical behavior, app-running limitation, Git privacy warning, conflicts, and disabling behavior.
5. Add developer documentation for format versions and forward-compatible reader rules.
6. Run focused lint/tests first, then repository typecheck and the relevant Electron test suite.
7. Perform manual smoke tests on Windows plus CI/maintainer coverage for macOS and Linux.
8. Conduct data-integrity/security review and an independent plan-vs-diff review before requesting upstream review.

Verification:

- `yarn workspace @affine/i18n build`
- Focused serializer, projection, feature flag, UI, service, and Electron helper Vitest suites.
- `yarn typecheck`
- Relevant lint/prettier checks for all changed files.
- Packaged Electron smoke: flag off, flag on/setup, initial mirror, remote update, offline cached export, reconnect, local conflict, permission loss, flag disable/re-enable, restart, and destination change.
- Inspect the generated `.affine` fixture with an AI/code agent and confirm every page is discoverable from `index.md` or `workspace.json` without AFFiNE access.

Completion signal: all automated and manual acceptance criteria pass, benchmark evidence is recorded, reviews find no unresolved data-loss/security issue, and the plan filename can move to `.completed.md` only after upstream-ready implementation and verification.

Plan update required after this phase: yes. Capture final verification evidence and rename the plan status only when all phases and review gates are complete.

Implementation evidence (2026-07-16):

- Added localized documentation and linked the experimental feature reference from the developer reference index.
- Added Electron `powerMonitor.resume` convergence, root-document readiness, abortable document loading, real tag metadata, general rich-block snapshot-sidecar notices, and runtime-gated folder reveal.
- Replaced live journal writes with a bounded, manifest-CAS transaction protocol using app-private staging, same-directory atomic target replacement, verified backups, mutation-specific rollback, local deletion conflicts, and renderer-port-owned leases.
- Added a mixed-content serializer fixture covering page and edgeless modes, a database, bookmark/embed content, an attachment blob, asset export, and rich-content snapshot notices.
- Added real-filesystem helper coverage for one-file interrupted initial-commit recovery, locally modified stale-file deletion conflicts, explicit replacement, unknown-file preservation, and rejection of files over 128 MiB before staging asset bytes.
- Independent security, lifecycle, and plan-vs-diff reviews report no remaining P0/P1, critical/high, or code-level blockers.
- Verification passed: generated i18n resources; Prettier; focused Oxlint; full root `yarn typecheck`; five focused Vitest files with 21 passing tests and the opt-in benchmark skipped by default; native Windows release build; Electron renderer production assets; packaged Windows x64 app; NSIS installer build.
- Representative streamed filesystem benchmark results on Windows (2026-07-16, Node 22.23.0, one file per direct helper-function call, no brittle latency gates): small/25 documents/55 files/4,172,865 bytes: 533 ms initial and 607 ms incremental 10-document update; medium/250 documents/527 files/36,486,412 bytes: 7,359 ms initial and 2,892 ms incremental; large/1,000 documents/2,102 files/145,947,112 bytes: 23,671 ms initial and 10,069 ms incremental. Maximum submitted payload was 1 MiB in every tier. Large-tier Vitest-worker RSS sampled between writes peaked at 99,164,160 bytes with a 14,950,400-byte measured delta. This exploratory proxy bypasses Electron IPC, does not capture finalization peaks, and does not prove renderer/helper peak memory or real IPC behavior. Invocation: `$env:RUN_LOCAL_MIRROR_BENCH='1'; yarn test packages/frontend/apps/electron/test/mirror/mirror.spec.ts --reporter=verbose`.
- An independent code agent inspected the retained 1,000-document synthetic stress fixture without AFFiNE access: every synthetic metadata document was linked by `index.md`, every referenced Markdown/snapshot file existed, all 2,102 managed files matched the manifest and SHA-256 hashes, and all 100 assets were readable. Its payloads and simplified metadata are intentionally not the production workspace projection schema, so this proves only stress-fixture discovery and filesystem/manifest integrity. Real production-format `.affine` agent inspection remains outstanding; the mixed BlockSuite serializer fixture separately covers rich-content Markdown/snapshot/asset semantics.
- Telemetry was deliberately omitted in v1: no existing approved event path was identified for this feature, and adding a new path without product/privacy review would create avoidable risk around a feature that handles local filesystem destinations. A future event must exclude paths, titles, content, and document IDs.
- Windows installer: `packages/frontend/apps/electron/out/canary/make/nsis.windows/x64/AFFiNE-canary Setup 0.27.0.exe` (163,324,621 bytes, SHA-256 `405F975BAD9400383FE8D2C98AE012A91716EC5F88D6EBEAF8114A05F848B21A`). The local artifact is unsigned.
- A non-invasive packaged smoke could not proceed on this host because the user's stable AFFiNE instance was active and AFFiNE holds an application-wide single-instance lock. The lifecycle review also confirmed that even internal mode registers the separate `affine-internal` Windows protocol. Full installer/cloud-auth parity should therefore run in Windows Sandbox or a disposable Windows account rather than terminating or mutating the user's active stable app.
- Remaining rollout evidence before renaming this plan to `.completed.md`: interactive packaged workflow smoke with a real cloud workspace in an isolated Windows environment; real Electron IPC plus renderer/helper peak-memory measurement including finalization; AI-agent inspection of a production-format generated `.affine`; broader crash recovery for existing generations and manifest-publication boundaries; integration coverage combining duplicate folder links, Trash, malformed metadata, and a real large binary; and macOS/Linux path/build coverage through CI or maintainers.

## Review Plan

- **Format/data fidelity review:** verify Markdown coverage, snapshot validity, stable IDs, deterministic output, relative links, and schema evolution rules.
- **Data-loss review:** trace every overwrite/delete/disable/path-change/crash path against manifest ownership and hash baselines.
- **Security review:** inspect IPC schemas, realpath containment, symlink handling, filename derivation, unknown-file preservation, and secret exclusion.
- **Feature-gate review:** prove flag false prevents all background target inspection/writes, including stored-enabled and mid-generation cases.
- **Concurrency/lifecycle review:** inspect cancellation, workspace disposal, reconnect, generation ordering, resource release, and stale finalization.
- **Performance review:** inspect bounded document/asset loading, IPC batching, asset deduplication, and measured large-workspace behavior.
- **UX/accessibility review:** verify warning copy, keyboard/focus behavior, status/error clarity, destructive confirmation, and platform-consistent directory selection.
- **Plan-vs-diff review:** map every included scope item, risk mitigation, verification item, and acceptance criterion to code and test evidence before marking the plan complete.

## Acceptance Criteria

- Local workspace mirror appears in Experimental Features only on Electron and is off by default.
- No mirror target is inspected or written while the flag is off, even if a workspace was previously enabled.
- Disabling the flag or losing export permission stops current and future writes without deleting configuration or files.
- The workspace Storage panel appears only with flag and permission gates satisfied.
- The user selects a project root and AFFiNE writes only its `.affine` child.
- Initial reconciliation produces all accessible documents, folder/link metadata, trash metadata, ID-preserving snapshots, and referenced assets.
- Agent-readable Markdown and navigation do not require AFFiNE, MCP, CLI, or network access.
- Remote/in-app changes converge incrementally while AFFiNE runs.
- Renames and folder moves do not rename stable document files.
- Unsupported rich blocks remain preserved in snapshot JSON and are not silently omitted from Markdown without a placeholder.
- Locally modified managed files are never silently overwritten or deleted.
- Unknown files and all files outside the owned mirror are never mutated.
- A crash or cancellation cannot commit an incomplete generation as successful.
- Offline cached exports are clearly marked and reconcile after reconnect.
- Memory and IPC usage remain bounded by a document/file batch rather than total workspace size.
- Windows, macOS, and Linux path behavior passes the relevant automated/manual coverage.
- The disk contract contains the stable identities and baselines required for future three-way bidirectional synchronization, while v1 performs no local-to-cloud reads.

## Post-Implementation Findings

Capture non-blocking discoveries here as implementation proceeds. Each entry must include:

- Evidence: file, test, log, screenshot, or benchmark.
- Impact: correctness, data fidelity, security, performance, UX, or maintenance.
- Recommendation: concrete follow-up or accepted limitation.
- Developer decision needed: yes/no and the exact choice if yes.

Do not silently expand v1 to solve findings that belong to bidirectional sync, unsupported rich-block editing, daemon behavior, or new export formats.
