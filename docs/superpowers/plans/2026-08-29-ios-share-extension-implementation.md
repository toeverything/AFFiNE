# iOS Share Extension Stable Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a directly implementable iOS share-import MVP that never previews from the Extension, respects the selected workspace, imports local PDFs as attachments, and recovers without deleting user content.

**Architecture:** The Share Extension writes a versioned, file-backed App Group manifest. The main App selects the workspace, obtains generic preview data from that workspace's server, and imports explicit BlockSuite blocks guarded by a synced document-property receipt. Structured details reuse optional `affine:bookmark` props and a content-addressed JSON Blob; no new block flavour is introduced.

**Tech Stack:** Swift/SwiftUI, PDFKit, Capacitor, TypeScript/React, BlockSuite, Vitest, XCTest/Xcodebuild.

**Spec:** [`docs/ios-share-extension-feasibility.md`](../../ios-share-extension-feasibility.md)

**Implementation status (2026-08-30):** Tasks 1-9 are implemented and covered by automated tests. The approved pre-workspace enrichment amendment is implemented by the [rich preview follow-up plan](2026-08-30-ios-share-rich-preview.md). The current canary app, including ShareExtension, has been signed, built, and installed on `demo_ace_iPhone`; launch and share-sheet acceptance remain pending while the device is locked. Gate C remains closed.

## Global Constraints

- The Extension performs no Worker, provider, or media-preview network request.
- Local workspaces never send a shared URL to the official AFFiNE server.
- Manifest v2 accepts v1 records, atomically persists one generated `importAttemptId`, and preserves unknown future versions.
- Share import never clears an existing document. A receipt or stable block conflict returns `import-conflict` before destructive mutation.
- Write and locally persist `preparing` by `documentId` before `DocsService.createDoc`; a crash before document creation must resume from that receipt.
- Online imports wait for remote `waitForSynced`; confirmed offline imports wait for local `waitForUpdated` on properties, root, and content docs and leave remote upload to the sync engine.
- Local PDF limit is 64 MiB; validate `%PDF-`, declared MIME/UTType, and actual file size.
- Do not convert PDF or image attachments to Base64/Data URLs.
- `BlobEngine.delete()` is not compensation: use content-addressed Blob IDs, preflight block conflicts, stable block IDs, and the existing unused-blob collector.
- Worker link-preview must accept the existing global mobile origins, including `capacitor://localhost`, without per-deployment configuration.
- Share-imported URLs always create `affine:bookmark`, including YouTube and X; provider embed flavours are outside this MVP.
- Every share bookmark has a non-empty routed/manifest/hostname title so mounting it cannot trigger the editor's empty-preview refresh path.
- A preview is usable only when its item ID, workspace key, and request generation match the current import target.
- Every Blob referenced by `sharePreviewSourceId` must be indexed in the block index `blob` field.
- Cloud/self-hosted writers require a successful strict `Server.fetchFreshConfig(signal)` response from the selected server to advertise `ServerFeature.SharePreviewBlobRefs`; cached, failed, or unavailable config fails closed to an ordinary bookmark.
- Production link-preview requests send `{ url }` only and do not request transcript until the enrichment ADR gate is approved.
- Every task commit must build and preserve all previously supported inputs. Do not activate PDF sharing before the complete Swift-to-BlockSuite import path is available.

---

## Task 1: Version the Inbox Manifest and Remove Persisted Routing Authority

**Files:**

- Modify: `packages/frontend/apps/ios/App/Shared/ShareInbox/ShareInboxModels.swift`
- Modify: `packages/frontend/apps/ios/App/Shared/ShareInbox/ShareInboxStore.swift`
- Modify: `packages/frontend/apps/ios/App/Shared/ShareInbox/ShareInboxSafety.swift`
- Modify: `packages/frontend/apps/ios/App/App.xcodeproj/project.pbxproj`
- Modify: `packages/frontend/apps/ios/App/App/Plugins/ShareInbox/ShareInboxPlugin.swift`
- Modify: `packages/frontend/apps/ios/src/plugins/share-inbox/definitions.ts`
- Modify: `packages/frontend/apps/ios/src/plugins/share-inbox/index.ts`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/types.ts`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/index.tsx`
- Test: `packages/frontend/apps/ios/App/AppTests/ShareInboxSafetyTests.swift`
- Test: `packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx`

- [x] Add failing Swift tests for v1 decode, one-time `importAttemptId` backfill, atomic v2 rewrite, and unknown future-version preservation.
- [x] Add `ShareInboxStore.swift` to the `AFFiNETests` Sources phase and make `ShareInboxStore` accept an injected temporary container URL/FileManager while `.shared` continues to use the App Group container.
- [x] Add failing TypeScript tests proving legacy `previewRoute: 'official'` is accepted but cannot override the selected workspace.
- [x] Add `schemaVersion: 2` and required `importAttemptId` to newly encoded manifests.
- [x] Introduce a `ready | unsupported-version` list-entry result across Store, native Plugin, TypeScript provider, and controller UI.
- [x] Implement custom decoding: decode v1, generate one UUID, persist it before returning the item; emit `unsupported-version` for newer schemas without quarantining or deleting them, and render an upgrade-required state that leaves the item intact.
- [x] Keep `previewRoute` decode-only for v1 compatibility and remove it from new manifests and the TypeScript authoritative state.
- [x] Run the Swift and Vitest targets; confirm the migration and routing tests pass.
- [x] Commit: `refactor(ios-share): version share inbox manifests`

Run from `packages/frontend/apps/ios/App`:

```bash
xcodebuild test -workspace App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.4' -only-testing:AFFiNETests/ShareInboxSafetyTests | xcbeautify
```

Run from the repository root:

```bash
yarn vitest --run packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx
```

## Task 2: Make Preview Routing Workspace-First and Delete Extension Networking

**Files:**

- Modify: `packages/frontend/apps/ios/App/ShareExtension/ShareViewModel.swift`
- Modify: `packages/frontend/apps/ios/App/ShareExtension/ShareExtensionView.swift`
- Delete: `packages/frontend/apps/ios/App/Shared/ShareInbox/ShareLinkPreview.swift`
- Modify: `packages/frontend/apps/ios/App/App.xcodeproj/project.pbxproj`
- Modify: `packages/backend/server/src/plugins/worker/service.ts`
- Create: `packages/backend/server/src/plugins/worker/__tests__/service.spec.ts`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/preview-route-owner.ts`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/index.tsx`
- Test: `packages/frontend/apps/ios/App/AppTests/ShareInboxSafetyTests.swift`
- Test: `packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx`

- [x] Add failing route-owner/controller tests for official cloud, self-hosted, local, abort, offline, stale responses, a request body exactly equal to `{ url }`, and “A loaded, switch to B, save before B returns” rejecting A's preview.
- [x] Add a failing Worker service test proving `capacitor://localhost`, `https://localhost`, and configured HTTP origins are accepted while an unrelated origin is rejected.
- [x] Remove `ShareLinkPreviewClient`, `ShareLinkPreviewState`, remote image state, and preview-response persistence from `ShareViewModel`; `displayTitle` uses only the original title or explicit user edit.
- [x] Replace `ShareExtensionView`'s remote preview/transcript card with a local-only fallback showing title, URL host, selected text, and an owned local attachment thumbnail. Remove obsolete `ShareLinkPreview` assertions from `ShareInboxSafetyTests`.
- [x] Resolve the selected workspace first. For local workspaces set no endpoint and abort the active request.
- [x] Make `WorkerService.allowedOrigins` include `buildCorsAllowedOrigins(this.url)` plus normalized `worker.allowedOrigin` entries, so the controller's custom gate matches global mobile CORS behavior.
- [x] For cloud/self-hosted workspaces call that workspace's `Server.fetch` with a relative `/api/worker/link-preview` path, body `{ url }`, `credentials: 'omit'`, and the active abort signal; remove the deleted Swift source from the App, ShareExtension, and `AFFiNETests` file references/build phases.
- [x] Ignore responses whose request generation no longer matches the selected workspace.
- [x] Store parent preview state as `{ itemId, workspaceKey, generation, value }`. Invalidate it synchronously when the selected workspace key changes, and make `previewForImport` accept it only when all identity fields match the target; otherwise load/fallback for the target workspace.
- [x] Run the targeted AVA/Vitest suites and both Xcode targets; confirm the Extension no longer links `ShareLinkPreview.swift` and local-workspace assertions observe zero calls to any official endpoint.
- [x] Commit: `refactor(ios-share): route previews through selected workspace`

```bash
NODE_OPTIONS="--import=file://$PWD/tools/cli/tsx-register.js" \
  yarn workspace @affine/server ava --serial --no-worker-threads \
  "src/plugins/worker/__tests__/service.spec.ts"
yarn vitest --run packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx
```

## Task 3: Stage Existing Image Attachments as Files

**Files:**

- Modify: `packages/frontend/apps/ios/App/Shared/ShareInbox/ShareInboxModels.swift`
- Modify: `packages/frontend/apps/ios/App/Shared/ShareInbox/ShareInboxStore.swift`
- Modify: `packages/frontend/apps/ios/App/Shared/ShareInbox/SharePayloadBuilder.swift`
- Modify: `packages/frontend/apps/ios/App/Shared/ShareInbox/ShareInboxConstants.swift`
- Modify: `packages/frontend/apps/ios/App/ShareExtension/ShareViewModel.swift`
- Modify: `packages/frontend/apps/ios/App/ShareExtension/ShareViewController.swift`
- Modify: `packages/frontend/apps/ios/App/App.xcodeproj/project.pbxproj`
- Test: `packages/frontend/apps/ios/App/AppTests/ShareInboxSafetyTests.swift`

**Interfaces:**

- Produces `SharePayloadFile(ownedStagingURL:name:mimeType:size:thumbnailData:)`; the URL belongs to the draft and remains valid after the provider callback until explicit cleanup.
- Produces injectable `ShareInboxStore(fileManager:containerURL:)`; `.shared` continues to resolve the App Group container.
- `ShareViewModel` accepts an internal `buildPayload: ([NSExtensionItem]) async -> SharePayloadDraft` closure defaulting to `SharePayloadBuilder.build`, allowing lifecycle tests without a real extension context.
- Produces idempotent draft cleanup used by `ShareViewModel.discard()`, successful save, draft replacement, and deinitialization.
- Does not add `.pdf` to `ShareInboxContentKind` or the Extension activation rule.

- [x] Add `SharePayloadBuilder.swift`, `ShareInboxStore.swift`, and `ShareViewModel.swift` to the `AFFiNETests` Sources phase; `ShareInboxModels.swift`, `ShareInboxConstants.swift`, and `ShareInboxSafety.swift` are already present. Add failing tests for successful copy, interrupted copy, traversal rejection, manifest-last visibility, delayed user save after the provider callback, and cleanup after cancel/success/draft replacement.
- [x] During the `NSItemProvider` callback, copy provider file URLs into `FileManager.default.temporaryDirectory/affine-share-inbox-staging/<UUID>` before returning. Data/UIImage providers write their validated bytes into the same owned directory; keep only bounded thumbnail bytes in memory.
- [x] Refactor `SharePayloadFile` to expose only the owned staging URL and validated metadata. Never retain or return the provider-owned URL.
- [x] Implement coordinated chunked copy into a per-item temporary directory, fsync the copied file, atomically rename the directory, and write the manifest last; remove the temporary directory on every error.
- [x] Make cleanup idempotent. `ShareViewModel` cleans the owned staging file after successful enqueue, before replacing a draft, on `discard()`, and on deinit; `ShareViewController.cancel()` calls `discard()` first. Keep the source only while an enqueue failure is retryable, and remove stale staging directories older than 24 hours when a new build starts.
- [x] Preserve current one-image behavior and manifest compatibility. Confirm this commit neither accepts PDF nor changes the TypeScript bridge contract.
- [ ] Run `AFFiNETests/ShareInboxSafetyTests`, build the App and ShareExtension targets, and manually confirm an image share still reaches the existing importer. Automated tests and both targets pass; physical-device confirmation remains open.
- [x] Commit: `refactor(ios-share): stage inbox attachments as files`

## Task 4: Make Existing Imports Transactional and File-Backed

**Files:**

- Modify: `packages/frontend/apps/ios/App/App/Plugins/ShareInbox/ShareInboxPlugin.swift`
- Modify: `packages/frontend/apps/ios/src/plugins/share-inbox/definitions.ts`
- Modify: `packages/frontend/apps/ios/src/plugins/share-inbox/index.ts`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/types.ts`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/index.tsx`
- Modify: `packages/frontend/core/src/modules/doc/entities/record.ts`
- Modify: `packages/frontend/core/src/modules/doc/services/docs.ts`
- Modify: `packages/frontend/core/src/modules/import-clipper/services/import.ts`
- Modify: `packages/frontend/core/src/modules/import-clipper/services/share-block-plan.ts`
- Create: `packages/frontend/core/src/modules/import-clipper/services/share-import-receipt.ts`
- Create: `packages/frontend/core/src/modules/import-clipper/services/share-import-receipt.spec.ts`
- Create: `packages/frontend/core/src/modules/import-clipper/services/share-import-blocks.spec.ts`
- Test: `packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx`

**Interfaces:**

- Native `resolveAttachment` returns `{ itemId, fileUrl, relativePath, name, mimeType, size }` after UUID, containment, existence, and metadata validation.
- `ShareInboxProvider.resolveAttachment(itemId): Promise<File | undefined>` converts the Capacitor URL to a `File`; `ShareImportInput.attachment?: File` carries it to the importer.
- `DocsService.getCustomPropertyById(docId, propertyId)` and `setCustomPropertyById(docId, propertyId, value)` operate before a `DocRecord` exists and automatically map `propertyId` to `custom:${propertyId}`; `DocRecord.setCustomProperty` returns the underlying synchronous ORM write result.
- `ShareImportResult` distinguishes `imported`, `committed-replay`, and `import-conflict`.

- [x] Add failing bridge/controller tests for traversal, mismatched item identity, missing files, MIME/size mismatch, `File` delivery, object-URL revocation, and absence of `FileReader.readAsDataURL`/`data:` output.
- [x] Add failing receipt tests for no document/no receipt, local persistence before document creation, crash after receipt but before `createDoc`, root record persisted with an empty content Y.Doc, crash after skeleton but before leaves, same-attempt resume, committed replay, malformed/future receipt, a different-attempt conflict, and confirmed offline import that never waits for a remote peer.
- [x] Add failing block/metadata tests for stable semantic IDs, existing no-receipt documents, parent/flavour collisions, added user blocks, repeated image import, YouTube/X bookmarks, user-edited tags/collections, and title states `(root empty, page empty)`, `(root set, page empty)`, `(root empty, page set)`, and `(root != page)` during `preparing` recovery.
- [x] Add failing replay tests that edit generated bookmark URL/title, selected-text paragraph, and image props before retry; assert those props remain byte-for-byte unchanged. Add a local-workspace mount test asserting `LinkPreviewService.query` is never called.
- [x] Add priority for `db$docProperties` and await `waitForDocLoaded('db$docProperties')` before reading it. Online-confirmed imports also await its initial `waitForSynced`; confirmed offline imports read the locally loaded state without waiting for a remote peer. Implement strict parsing under `custom:affine:share-import-receipt-v1`.
- [x] When no document exists, write `preparing` through `DocsService.setCustomPropertyById(documentId, 'affine:share-import-receipt-v1', json)`, await `waitForUpdated('db$docProperties')` and, when online, `waitForSynced('db$docProperties')`, then call `createDoc`; resume a matching orphan receipt by creating the document.
- [x] Call `createDoc({ id: documentId, primaryMode: 'page', skipInit: true })`. Derive stable page, surface, and note IDs from `importAttemptId`; on matching `preparing`, create missing skeleton nodes in parent order and validate-only-if-present. Any nonmatching existing root/skeleton returns `import-conflict`.
- [x] Await `waitForUpdated(documentId)` after skeleton creation before reconciling leaves. Add a root-only recovery test proving an empty content Y.Doc receives one stable skeleton and one copy of each planned leaf.
- [x] Return `import-conflict` for an existing document without a matching receipt. Preflight every stable block ID before Blob writes; never delete existing page children. Reconcile with create-if-missing and validate-only-if-present: an existing stable block checks only ID, flavour, and parent and never receives a props update.
- [x] Replace share-path Markdown import with explicit stable nodes for bookmark, selected text, source link, and image. Store the image `File` with `blobSync.set` and create `affine:image` using the content-hash source ID.
- [x] Make every shared URL use `affine:bookmark`, ignoring `EmbedOptionProvider` for this importer. Set `title` to the first trimmed non-empty value among `preview?.title`, `input.title`, and the URL hostname; keep ordinary editor paste/embed behavior unchanged.
- [x] Reconcile root meta title and the stable page block title without calling unconditional `changeDocTitle`: if both are empty, set both to the import title; if exactly one is empty, copy the non-empty value to the empty side; if both are non-empty, leave both unchanged even when they differ.
- [x] Apply remaining destination metadata monotonically: add requested tags without removing existing tags, and add the requested collection without removing the document from any other collection. A committed replay performs no metadata writes.
- [x] Use `URL.createObjectURL(file)` only for controller preview and revoke it on item change, replacement, and unmount; pass the original `File` to the importer.
- [x] For online-confirmed imports, await `waitForUpdated` and `waitForSynced` for properties/root/content before and after `committed`. For confirmed offline imports, await only `waitForUpdated` for all three Y.Doc IDs; never block on an unavailable remote. A matching committed receipt returns `committed-replay` without opening or rewriting the document.
- [x] Run the receipt, block, controller, iOS build, and existing share regression suites. Do not commit bridge `File` types separately from their controller/importer consumers.
- [x] Commit: `fix(ios-share): make file imports transactional`

```bash
yarn vitest --run packages/frontend/core/src/modules/import-clipper/services/share-import-receipt.spec.ts packages/frontend/core/src/modules/import-clipper/services/share-import-blocks.spec.ts packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx
BUILD_TYPE=canary PUBLIC_PATH="/" yarn affine @affine/ios build
```

## Task 5: Enable Local PDF End to End

**Files:**

- Modify: `packages/frontend/apps/ios/App/ShareExtension/Info.plist`
- Modify: `packages/frontend/apps/ios/App/Shared/ShareInbox/ShareInboxModels.swift`
- Modify: `packages/frontend/apps/ios/App/Shared/ShareInbox/SharePayloadBuilder.swift`
- Modify: `packages/frontend/apps/ios/App/Shared/ShareInbox/ShareInboxConstants.swift`
- Modify: `packages/frontend/apps/ios/App/ShareExtension/ShareExtensionView.swift`
- Modify: `packages/frontend/apps/ios/App/ShareExtension/ShareViewModel.swift`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/types.ts`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/index.tsx`
- Modify: `packages/frontend/core/src/modules/import-clipper/services/import.ts`
- Modify: `packages/frontend/core/src/modules/import-clipper/services/share-block-plan.ts`
- Test: `packages/frontend/apps/ios/App/AppTests/ShareInboxSafetyTests.swift`
- Test: `packages/frontend/core/src/modules/import-clipper/services/share-import-blocks.spec.ts`
- Test: `packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx`

**Interfaces:**

- Adds `ShareInboxContentKind.pdf` and TypeScript `content.kind: 'pdf'` only in this task.
- Reuses Task 4's `File` contract and creates `affine:attachment` with `{ name, type, size, sourceId, embed: false }`.

- [x] Add failing Swift tests for one valid local PDF, MIME spoofing, invalid `%PDF-` magic, empty input, 64 MiB overflow, multiple binary attachments, thumbnail failure, and a remote `.pdf` URL that remains `.url`.
- [x] Add failing TypeScript tests proving a missing PDF `File` returns `attachment-missing`, creates no document, and never calls native `complete`; verify a valid PDF creates exactly one attachment block.
- [x] Define `maxShareAttachmentBytes = 64 * 1024 * 1024`. Load local PDFs with `NSItemProvider.loadFileRepresentation`, validate UTType/MIME, magic, and actual size inside the callback, and copy through Task 3's file-backed store.
- [x] Render only a bounded first-page PDFKit thumbnail for the Extension UI. Do not store extracted PDF text and do not reject a valid PDF when thumbnail generation fails.
- [x] Reject multiple binary attachments before enqueue and show an explicit Extension error. Treat HTTP(S) `.pdf` values as URL shares without downloading them in the Extension.
- [x] In the same code change, add PDF activation, both Swift/TypeScript discriminants, controller `File` resolution, 64 MiB plus `FileSizeLimitProvider` checks, stable attachment preflight, `blobSync.set`, and the attachment block.
- [x] Verify retry reuses the content-hash source ID and stable attachment block ID. Preserve the Inbox item for validation, Blob, block, sync, or `complete` failures.
- [ ] Run Swift, frontend, iOS bundle, Xcode build, and simulator Files/Safari share-sheet checks before committing. Automated suites, bundle, and Xcode build pass; interactive Files/Safari share-sheet confirmation remains open. There must be no commit in which PDF activation can reach an empty-success importer.
- [x] Commit: `feat(ios-share): import shared pdfs as attachment blocks`

## Task 6: Ship Read-Only Structured-Detail Compatibility

**Files:**

- Modify: `blocksuite/affine/model/src/blocks/bookmark/bookmark-model.ts`
- Create: `blocksuite/affine/model/src/blocks/bookmark/bookmark-transformer.ts`
- Create: `blocksuite/affine/model/src/blocks/bookmark/share-preview-record.ts`
- Modify: `blocksuite/affine/model/src/blocks/bookmark/index.ts`
- Modify: `blocksuite/affine/blocks/bookmark/src/bookmark-block.ts`
- Modify: `blocksuite/affine/blocks/bookmark/src/components/bookmark-card.ts`
- Modify: `packages/common/reader/src/reader.ts`
- Modify: `packages/backend/native/src/runtime/storage_runtime/doc_blob_refs.rs`
- Modify: `packages/backend/native/src/runtime/storage_runtime/blob_cleanup.rs`
- Modify: `packages/backend/native/src/runtime/storage_runtime/document_cleanup.rs`
- Modify: `packages/backend/server/src/core/config/config.ts`
- Modify: `packages/backend/server/src/core/config/types.ts`
- Modify: `packages/backend/server/src/core/config/service.ts`
- Modify: `packages/backend/server/src/core/config/__tests__/service.spec.ts`
- Modify: `packages/backend/server/src/__tests__/e2e/config/resolver.spec.ts`
- Modify (generated): `packages/backend/server/src/schema.gql`
- Modify (generated): `packages/common/graphql/src/schema.ts`
- Create: `blocksuite/affine/blocks/bookmark/src/__tests__/share-preview-record.unit.spec.ts`
- Test: `packages/common/reader/__tests__/reader.spec.ts`
- Test: `packages/frontend/core/src/modules/blob-management/entity/unused-blobs.spec.ts`
- Test: `packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx`

**Interfaces:**

- Adds optional bookmark props `sharePreviewSourceId?: string` and `sharePreviewVersion?: number`; no new block flavour is introduced.
- Reader block documents include `sharePreviewSourceId` in `blob: string[]`, so existing unused-blob aggregation treats it as referenced.
- `BookmarkBlockTransformer` adds the details source ID to snapshot assets in `toSnapshot` and restores it with `assets.writeToBlob` in `fromSnapshot`.
- The server's local projection uses the existing direct `y-octo` dependency to add bookmark `prop:sharePreviewSourceId` beside the refs returned by `affine_doc_loader`; native `doc_blob_refs::PARSER_VERSION` becomes 2 without an external crate release.
- Parser-v2 servers expose `ServerFeature.SharePreviewBlobRefs` through the existing `serverConfig.features` query only while the default-false deployment rollout flag is enabled. Old or not-yet-enabled servers omit it without a version heuristic.
- This task does not modify the share importer and does not write `sharePreviewSourceId` in production.

- [x] Add failing schema/view tests for record v1, malformed segments, unsupported versions, over-limit/missing Blob, and a normal bookmark with no structured details.
- [x] Add failing reader/unused-blob tests proving a referenced details Blob is not listed as unused and becomes unused only after its bookmark reference is deleted and indexing completes.
- [x] Add a failing snapshot round-trip test proving the bookmark source/version props and JSON Blob survive export/import; missing optional details must not affect ordinary bookmarks.
- [x] Add a local `y-octo::ReadDoc` projection that reads bookmark `prop:sharePreviewSourceId` with flavour `affine:bookmark`, merges it with existing `affine_doc_loader` image/attachment refs, rejects malformed snapshots, and deduplicates identical tuples. Keep `affine_doc_loader = 0.1.7` unchanged for its other repository call sites.
- [x] Raise `doc_blob_refs::PARSER_VERSION` from 1 to 2. Add native projection fixtures for the new bookmark reference, duplicate/malformed values, and legacy image/attachment references, and update hard-coded parser-version fixtures.
- [x] Add a `share_preview_blob_cleanup_*` native storage regression group that runs the real plan/execute cleanup path: a referenced details object survives after parser-v2 reprojection; after deleting the bookmark reference and completing reprojection, the same object becomes eligible after the grace-period fixture. Verify stale, pending, or failed v1 projections remain fail-closed in both plan and execute.
- [x] Add default-false `flags.sharePreviewBlobRefs` and `ServerFeature.SharePreviewBlobRefs = 'share_preview_blob_refs'`; have `ServerService.onFlagsChanged` expose the capability only when the rollout flag is true. Add service tests for false/true/toggle, regenerate checked-in GraphQL schema/types, and add server-config e2e coverage. Operations may enable the flag only after every object-cleanup worker in that deployment contains parser v2, must keep it disabled throughout a mixed-version rollout, and must disable it before rollback. Existing reconciliation still rebuilds every workspace before cleanup, and cleanup remains blocked while any projection is stale.
- [x] Lazy-load and validate the Blob only when details expand; bound loading/error/unavailable states must not blank the bookmark.
- [x] Remove the collapsed transcript callout/body path. Selected text remains an explicit paragraph; transcript/chapter rendering remains dormant unless a future approved response contains valid fields.
- [x] Add an importer regression assertion that this compatibility release still creates ordinary bookmarks without `sharePreviewSourceId`.
- [x] Run reader, blob-management, BlockSuite tests and both BlockSuite builds.
- [x] Commit: `feat(bookmark): read and retain structured share details`

```bash
yarn vitest --run blocksuite/affine/blocks/bookmark/src/__tests__/share-preview-record.unit.spec.ts packages/common/reader/__tests__/reader.spec.ts packages/frontend/core/src/modules/blob-management/entity/unused-blobs.spec.ts packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx
yarn workspace @blocksuite/affine-model build
yarn workspace @blocksuite/affine-block-bookmark build
cargo test -p affine_server_native doc_blob_refs
cargo test -p affine_server_native share_preview_blob_cleanup -- --ignored
yarn workspace @affine/graphql build
yarn workspace @affine/server test src/core/config/__tests__/service.spec.ts src/core/storage/__tests__/blob-job.spec.ts
yarn workspace @affine/server e2e src/__tests__/e2e/config/resolver.spec.ts
```

## Compatibility Gate C: Enable the Structured-Detail Writer

Task 7 may implement and test the writer behind an injected gate while this gate is blocked, but the production Gate C constant must remain `false`. Do not enable the production writer until release/compatibility owners confirm that every supported client version contains Task 6's bookmark schema, reader blob indexing, and snapshot transformer. For cloud and self-hosted workspaces, a strict config response from the selected server must also expose `ServerFeature.SharePreviewBlobRefs`; official deployment and supported self-host matrix owners must confirm parser-v2 rollout and rollout-flag activation. If either client minimum or server capability cannot be enforced, leave the writer disabled and create an ordinary bookmark. Rendering on an old client is insufficient because its unused-blob cleanup can delete the details Blob, and a new client cannot protect an object from an old server's cleanup projection.

## Task 7: Implement the Fail-Closed Structured-Detail Writer

**Files:**

- Modify: `packages/frontend/core/src/modules/import-clipper/services/import.ts`
- Modify: `packages/frontend/core/src/modules/import-clipper/services/share-block-plan.ts`
- Modify: `packages/frontend/core/src/modules/cloud/entities/server.ts`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/preview-route-owner.ts`
- Test: `packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx`

**Interfaces:**

- Consumes Task 6's optional bookmark props, lazy reader, block index projection, and snapshot transformer.
- Produces a bounded `SharePreviewRecord` Blob and places its content-hash ID/version on the stable bookmark.
- Local workspaces use the release-level client Gate C. Cloud/self-hosted workspaces additionally require a successful strict fetch from the currently selected server to include `ServerFeature.SharePreviewBlobRefs` at write time; persisted `Server.config$` is never write authority.

- [ ] Keep the production Gate C constant `false` until the release issue records approval, the enforced minimum client version, official server rollout, and supported self-host server matrix. The constant is currently `false`; this rollout gate remains open. Tests may inject approval; implementation completion does not imply rollout approval.
- [x] Add failing tests proving ordinary pages, YouTube, and X create bookmarks with a content-hash details reference after Gate C when a strict config fetch from the target server advertises the capability. Capability missing, config unavailable, or switching to an unsupported server must create an ordinary titled bookmark without a details Blob; add explicit fixtures where cached `config$` contains the capability but the strict fetch fails or returns no capability. Local/no-preview imports remain ordinary bookmarks because there is no routed details record.
- [x] Serialize the routed `SharePreviewRecord` to a bounded JSON Blob with `blobSync.set`, then place source/version props on a newly created stable bookmark. Replay of an existing bookmark remains validate-only and never changes its props.
- [x] Add `Server.fetchFreshConfig(signal)`, implemented as one `ServerConfigStore.fetchServerConfig(this.baseUrl, signal)` call that returns the fetched config and propagates network/abort/schema errors. Do not implement it through `revalidateConfig` or `waitForConfigRevalidation`, which retries or swallows errors and leaves cached state observable.
- [x] Immediately before Blob creation, call `fetchFreshConfig` and then re-read the current item/workspace/server generation. Use only that returned config; an error, missing capability, or generation mismatch aborts details creation and continues with the ordinary bookmark. Add a mixed-version regression fixture proving the minimum supported reader indexes the new reference and does not list it as unused.
- [x] Run the Task 6 suites, importer/controller tests, and BlockSuite builds.
- [x] Commit: `feat(ios-share): write structured bookmark details`

## Task 8: Complete Recovery Only After Committed Import

**Files:**

- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/index.tsx`
- Modify: `packages/frontend/apps/ios/App/App/Plugins/ShareInbox/ShareInboxPlugin.swift`
- Test: `packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx`
- Test: `packages/frontend/apps/ios/App/AppTests/ShareInboxSafetyTests.swift`

- [x] Add failing tests for both pre-document crash points, crash after document sync, crash after committed receipt, native `complete` failure, cold-start replay, and user edits between attempts.
- [x] Call native `complete` only for `imported` or `committed-replay`; never complete `attachment-missing`, unsupported-version, or conflict results.
- [x] On `complete` failure keep the item recoverable; on next launch observe the committed receipt and retry only completion.
- [x] Return one actionable conflict/error state without a retry loop or repeated modal.
- [x] Ensure native cleanup removes only the matching item directory after atomically recording completion.
- [x] Run Swift and frontend recovery tests.
- [x] Commit: `fix(ios-share): recover committed imports safely`

## Task 9: Run Release Verification

**Files:**

- Modify: `docs/ios-share-extension-feasibility.md` only if verification reveals a factual mismatch.

- [x] Run all targeted Worker, frontend, reader, BlockSuite, and Swift tests from Tasks 1-8. Task 6 compatibility, Task 7 injected-gate writer, and Task 7 production fail-closed assertions are always required; only a production-enabled writer acceptance check depends on Gate C passing.
- [x] Run `yarn workspace @blocksuite/affine-model build` and `yarn workspace @blocksuite/affine-block-bookmark build`.
- [x] Run `BUILD_TYPE=canary PUBLIC_PATH="/" yarn affine @affine/ios build`.
- [x] Run `yarn workspace @affine/ios sync`.
- [x] Run the `AFFiNETests/ShareInboxSafetyTests` command and the Xcode build below from `packages/frontend/apps/ios/App`.
- [ ] On a real device, verify YouTube URL, X URL, ordinary webpage, image, local PDF, and remote PDF URL for cloud, self-hosted, and local workspaces.
- [ ] Confirm Worker accepts the Capacitor WebView origin for official and self-hosted servers, while Extension network capture contains no preview request and local-workspace capture contains no official request.
- [x] Confirm every URL input creates a bookmark. Using Task 6 fixtures, verify referenced details Blobs survive unused-blob scanning, become eligible only after reference removal, and survive snapshot export/import.
- [x] If Gate C passed, confirm production imports write the same reference; otherwise confirm production imports do not write `sharePreviewSourceId`.
- [x] Confirm both first-import crash points and post-commit recovery produce one document, no repeated modal, and no user-content deletion.
- [x] Commit: `test(ios-share): verify stable share import workflows`

```bash
xcodebuild test -workspace App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.4' -only-testing:AFFiNETests/ShareInboxSafetyTests | xcbeautify
xcodebuild -workspace App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.4' build | xcbeautify
```

## Deferred Enrichment Gate

Do not implement production transcript requests in this plan. Before a follow-up plan is written, an approved ADR must name the provider adapter and legal source, secret configuration, official/self-hosted support matrix, entitlement and quota mapping, cost owner, response limits, cache scope, failure semantics, and the exact workspace-scoped authenticated route. The follow-up client must use the selected workspace's `Server.fetch` with `credentials: 'include'`; fixtures alone do not satisfy this gate.
