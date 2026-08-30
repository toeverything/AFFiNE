# iOS Share Rich Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a YouTube-rich iOS Share Extension card and import the same bounded preview into AFFiNE as a rich bookmark, metadata, and optional transcript.

**Architecture:** The Share Extension fetches the official AFFiNE preview once, renders it, and persists a validated snapshot in Share Inbox schema v3. The main App consumes that snapshot without a second request and projects it into existing BlockSuite flavours using deterministic IDs and current transactional retry semantics.

**Tech Stack:** Swift, SwiftUI, URLSession, Capacitor, TypeScript, React, BlockSuite, XCTest/Xcodebuild, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-30-ios-share-rich-preview-design.md`](../specs/2026-08-30-ios-share-rich-preview-design.md)

## Global Constraints

- Use `https://app.affine.pro/api/worker/link-preview` in every workspace mode.
- Preview/image failure never prevents saving the source item.
- Persisted compact preview JSON is inclusively at most `256 * 1024` UTF-8 bytes and contains bounded UTF-8 strings, finite numbers, and approved URLs only.
- Newly encoded items use schema v3; only v1 generates an attempt ID, while v2/v3 preserve it exactly and future versions remain untouched.
- Media loads only through HTTPS `app.affine.pro/api/worker/image-proxy`, at most 8 MiB and 16 megapixels.
- Rich import uses existing bookmark, paragraph, and callout flavours only.
- Gate C remains closed; production import does not write `sharePreviewSourceId`.
- Stable IDs, validate-only-if-present recovery, manifest-last publication, and receipts remain.
- Start each production behavior with a failing test; complete a P0/P1/P2 review per task.

---

### Task 1: Bounded Native Preview Contract

**Files:**

- Create: `packages/frontend/apps/ios/App/Shared/ShareInbox/ShareLinkPreview.swift`
- Modify: `packages/frontend/apps/ios/App/App.xcodeproj/project.pbxproj`
- Test: `packages/frontend/apps/ios/App/AppTests/ShareInboxSafetyTests.swift`

**Interfaces:**

- Produces `ShareLinkPreview: Codable, Equatable` with metadata, author, duration, and transcript.
- Produces `persistable() -> ShareLinkPreview?`, `Transcript.previewText`, and `formattedDuration`.
- Produces `ShareLinkPreviewClient.fetch(url:)` and `fetchImageIfPresent(url:)`.

- [x] Write failing tests that decode the rich fixture, reject non-official media URLs, enforce every UTF-8/count/number limit with shared emoji/CJK fixtures, bound complete JSON at the exact 256 KiB boundary, format `214` as `3:34`, and cap normalized transcript text at 240 characters.
- [x] Run focused XCTest; expect failure because the preview contract is absent.
- [x] Implement minimal Codable types, URL/text/number bounds, and deterministic transcript-tail truncation.
- [x] Write failing `URLProtocol` tests for POST, `{url,include:["transcript"]}`, AFFiNE headers, status, cancellation, proxy-only media, MIME, final URL, 16 MP, and dimensions. Stream chunked JSON/media with absent, false-small, exact, and over-limit `Content-Length`; assert cancellation occurs on the first byte above 512 KiB/8 MiB.
- [x] Implement the cookie/cache/credential-free 4/6-second URLSession client with incremental byte accumulation and immediate overflow cancellation, plus the official image-proxy loader with ImageIO preflight. Do not use `data(for:)` for bounded remote bodies.
- [x] Run focused XCTest to green.
- [x] Request Task 1 review, verify and fix every valid P0/P1/P2 finding, rerun XCTest.
- [x] Commit `feat(ios-share): restore bounded rich preview client`.

```bash
xcodebuild test -workspace packages/frontend/apps/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.4' -only-testing:AFFiNETests/ShareInboxSafetyTests
```

### Task 2: Extension UI and Inbox v3

**Files:**

- Modify: `packages/frontend/apps/ios/App/ShareExtension/ShareViewModel.swift`
- Modify: `packages/frontend/apps/ios/App/ShareExtension/ShareExtensionView.swift`
- Modify: `packages/frontend/apps/ios/App/Shared/ShareInbox/ShareInboxModels.swift`
- Modify: `packages/frontend/apps/ios/App/Shared/ShareInbox/ShareInboxStore.swift`
- Modify: `packages/frontend/apps/ios/App/App.xcodeproj/project.pbxproj`
- Test: `packages/frontend/apps/ios/App/AppTests/ShareInboxSafetyTests.swift`

**Interfaces:**

- Adds `ShareInboxItem.preview: ShareLinkPreview?` and schema version 3.
- Adds cancellable `linkPreviewState`, `remoteMediaImage`, and `remoteFaviconImage` to the view model.
- Keeps persisted title independent from a remote title unless explicitly edited.

- [x] Write failing tests proving v1 alone generates an ID, v2 target/receipt identity survives v3 migration byte-for-byte, v3 round trip, malformed/oversized preview discard, and future-version preservation.
- [x] Run focused XCTest; expect schema/property failures.
- [x] Implement v3 encoding/decoding and defensive preview discard.
- [x] Write failing view-model tests for loaded/failed/loading-save/stale/discard states, save linearization, image-failure metadata persistence, completion cancellation, deinit release, and title priority.
- [x] Implement cancellable preview/media loading and bounded snapshot persistence; `save()` captures state then cancels all enrichment work.
- [x] Implement skeleton, 16:9 media, favicon/site, title, description, author/duration, transcript excerpt, and compact fallback in SwiftUI.
- [x] Run XCTest and simulator builds for App and ShareExtension.
- [x] Request Task 2 review, fix valid P0/P1/P2 findings, rerun tests/builds.
- [x] Commit `feat(ios-share): persist and render rich previews`.

```bash
xcodebuild build -workspace packages/frontend/apps/ios/App/App.xcworkspace -scheme App -destination 'generic/platform=iOS Simulator'
xcodebuild build -workspace packages/frontend/apps/ios/App/App.xcworkspace -scheme ShareExtension -destination 'generic/platform=iOS Simulator'
```

### Task 3: Bridge and Main-App Preview

**Files:**

- Modify: `packages/frontend/apps/ios/App/App/Plugins/ShareInbox/ShareInboxPlugin.swift`
- Modify: `packages/frontend/apps/ios/src/plugins/share-inbox/definitions.ts`
- Modify: `packages/frontend/apps/ios/src/plugins/share-inbox/index.ts`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/types.ts`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/preview-route-owner.ts`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/index.tsx`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/link-preview.tsx`
- Test: `packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx`

**Interfaces:**

- Adds optional `preview: ShareLinkPreview` to native/TypeScript pending items.
- Produces defensive `parseShareLinkPreview(value)` with Swift-equivalent limits.
- `previewForImport` prefers valid persisted data and routes only legacy items.

- [x] Write failing parser tests using the shared UTF-8 fixtures for every field/count/number/URL/aggregate limit and discard-with-item-preserved.
- [x] Run focused Vitest; expect missing preview contract failures.
- [x] Implement native serialization and defensive TypeScript parsing.
- [x] Write failing precedence tests proving immediate rendering and import with zero route calls; prove v1/v2 rewritten as v3 with `preview=nil` still use workspace routing.
- [x] Implement snapshot precedence without weakening legacy item/workspace/generation checks.
- [x] Write failing UI tests for image, favicon/site, title, description, author, duration, transcript, skeleton, and fallback.
- [x] Implement rich React card rendering and run Vitest/type checks.
- [x] Request Task 3 review, fix valid P0/P1/P2 findings, rerun.
- [x] Commit `feat(ios-share): bridge persisted rich previews`.

```bash
yarn vitest --run packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx
```

### Task 4: Stable Rich Document Projection

**Files:**

- Modify: `packages/frontend/core/src/modules/import-clipper/services/share-block-plan.ts`
- Modify: `packages/frontend/core/src/modules/import-clipper/services/import.ts`
- Modify: `packages/frontend/core/src/modules/import-clipper/services/share-import-blocks.spec.ts`
- Modify: `packages/frontend/core/src/modules/import-clipper/services/share-import-receipt.spec.ts`
- Modify: `packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx`

**Interfaces:**

- Extends `shareImportBlockIds()` using the exact metadata/transcript/heading/original-index ID formulas from the spec.
- Keeps transcript in `createCompatibilityShareBlockPlan()`.
- Continues to omit structured-detail Blob references.

- [x] Write failing tests for a rich bookmark, `YouTube · Author · 3:34` metadata, selected quote, and collapsed timestamped transcript.
- [x] Add failing tests for absent metadata/transcript, Unicode-whitespace duplicate text, equal-time chapter tie-breaks, undefined/fractional segment times, empty segments, 500-segment limit, and every new ID formula/collision.
- [x] Add receipt-path failures after callout, heading, chapter, and segment writes; verify missing-block repair, edited retry preservation, parent/flavour conflicts, and committed replay that only completes Inbox.
- [x] Run block/controller Vitest; expect failures because transcript is stripped.
- [x] Implement deterministic metadata/transcript projection while preserving create-if-missing and validate-only-if-present behavior.
- [x] Remove only the compatibility projection's deliberate transcript deletion; keep Gate C off.
- [x] Run targeted Vitest to green.
- [x] Request Task 4 review, verify transaction/recovery findings, fix valid P0/P1/P2 issues, rerun.
- [x] Commit `feat(ios-share): import rich preview content`.

```bash
yarn vitest --run packages/frontend/core/src/modules/import-clipper/services/share-import-blocks.spec.ts packages/frontend/core/src/modules/import-clipper/services/share-import-receipt.spec.ts packages/frontend/core/src/mobile/components/share-import-controller/share-link-preview.spec.tsx
```

### Task 5: End-to-End Verification and PR Update

**Files:**

- Modify: `docs/ios-share-extension-feasibility.md`
- Modify: `docs/superpowers/plans/2026-08-29-ios-share-extension-implementation.md`
- Modify: `docs/superpowers/plans/2026-08-30-ios-share-rich-preview.md`
- Modify: `docs/superpowers/specs/2026-08-30-ios-share-rich-preview-design.md`

**Interfaces:**

- Records official pre-workspace preview approval and keeps Gate C closed.

- [x] Run all targeted Swift, Vitest, and server regression suites.
- [x] Build canary frontend, sync Capacitor/CocoaPods, and build App/ShareExtension for simulator and connected device.
- [x] Install and launch on the iPhone; share the supplied Chinese steak video. The live provider returned a transcript, contrary to the original no-transcript assumption.
- [x] Import the Chinese steak video; verify bookmark image/title/description, `YouTube · Author · 5:50` metadata, timestamped transcript, and source URL from the supplied device screenshots.
- [ ] Share and import Rick Astley, then verify retry behavior and the no-transcript fallback with a provider response that actually omits transcript.
- [x] Request final P0/P1/P2/P3 review against the design and full PR diff; repeat until no new P0/P1/P2 findings.
- [x] Update document status and verification evidence.
- [x] Commit docs, push `codex/ios-share-extension`, update PR #15547, and inspect available checks.

```bash
BUILD_TYPE=canary PUBLIC_PATH="/" yarn affine @affine/ios build
yarn workspace @affine/ios sync
git push origin codex/ios-share-extension
gh pr checks 15547
```
