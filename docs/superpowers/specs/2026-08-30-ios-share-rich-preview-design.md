# iOS Share Rich Preview Design

## Goal

When an HTTP(S) URL is shared to AFFiNE on iOS, show a media-first rich preview in the Share
Extension and preserve the same useful information in the imported AFFiNE document. YouTube
is the acceptance provider. The behavior works for cloud, local, and self-hosted destinations
and degrades to the existing compact URL card without blocking save.

## Confirmed Product Decisions

- Rich data remains available after import, not only in the Share Extension.
- The Share Extension may send the shared URL to the official AFFiNE preview endpoint for all
  workspace modes, including local and self-hosted destinations.
- The official production endpoint is the enrichment authority before workspace selection.
  A native-equivalent request was verified on 2026-08-30 to return HTTP 200 without browser
  `Origin`/`Referer`, including YouTube provider metadata and optional transcript. The client
  consumes this deployed edge contract; the repository's generic Worker fallback remains a
  narrower OpenGraph implementation and is not changed by this PR.
- A missing transcript is valid; render Transcript only for non-empty segments.

## User Experience

For a loaded rich preview, the Share Extension renders one card containing a stable 16:9
image or a stable placeholder, favicon and site, editable title, three-line description, author and formatted duration,
and a whitespace-normalized transcript excerpt capped at 240 characters. It renders a skeleton
while loading. Metadata remains a rich card when its image is missing or fails to load; only
preview fetch/decode failure falls back to the compact source card. Enrichment never controls
whether the item can be saved, and image state never controls snapshot persistence.

The imported document contains one horizontal `affine:bookmark` with URL/title/description/
favicon/image, one metadata paragraph when provider/author/duration exists, the existing
selected-text quote, and one collapsed transcript callout when segments exist.

## Extension Preview Client

`ShareLinkPreview.swift` owns the Codable response contract, persistence bounds, official
endpoint client, image loading, transcript excerpt, and duration formatting. It uses an
ephemeral `URLSession`, 4/6 second request/resource timeouts, no URL cache, and sends:

```json
{ "url": "https://example.com/resource", "include": ["transcript"] }
```

It sends existing AFFiNE version headers. Source URLs use `ShareInboxSafety.normalizedWebURL`,
which accepts HTTP(S), rejects userinfo, and preserves explicit ports. The response must be
status 200 and no more than 512 KiB before decoding. JSON and media bodies are accumulated
incrementally. A declared `Content-Length` above the limit is rejected before body consumption;
absent, false, or smaller declarations do not grant trust. The client counts received bytes,
cancels immediately on the first byte above the limit, and never calls `data(for:)` for these
bounded requests.

Media requests accept only HTTPS URLs on `app.affine.pro` whose path is
`/api/worker/image-proxy`; arbitrary response hosts and non-proxy paths are ignored. The
ephemeral session has no cookies, credential store, or cache. A media response must finish on
the same origin/path, have an `image/*` MIME, contain at most 8 MiB, and describe at most
16 megapixels with neither dimension above 8,192 before `UIImage` decoding.

`ShareViewModel` starts enrichment after URL payload extraction. It owns cancellable preview
and image tasks. Replacing or discarding a draft cancels outstanding work. Remote titles affect
display but never silently become an explicit user edit.

## Inbox v3 Snapshot

`ShareInboxItem.currentSchemaVersion` becomes 3 and gains optional `preview`. Only v1 records
generate and atomically persist a new `importAttemptId`. v2 and v3 must decode and preserve
their existing non-empty `importAttemptId` byte-for-byte; v1/v2 migrate with `preview == nil`.
Unknown future versions remain preserved. Tests include a v2 item with destination state and a
matching preparing/committed receipt identity.

All string limits are UTF-8 byte counts after whitespace normalization where specified. Source,
image, favicon, and avatar URLs are at most 8,192 bytes; URL arrays contain at most eight items.
Title/chapter title are at most 4,096 bytes; description 32,768; provider 256; site name,
author name/handle 512; published time 128; transcript language 128; segment text 16,384; and
speaker 512. Transcript contains at most 500 segments and 100 chapters. Numeric timestamps and
durations are finite, non-negative, and at most seven days. The complete compact JSON produced
by Swift's sorted-key encoder must be `<= 256 * 1024` UTF-8 bytes; the TypeScript parser also
requires its compact `JSON.stringify` encoding to meet the same inclusive bound. Shared
emoji/CJK, credential URL, NaN/Infinity, negative, over-duration, exact-boundary, and
over-boundary fixtures exercise both implementations.

If aggregate data exceeds the limit, transcript segments are removed from the end until it
fits and `transcript.truncated` is true. Chapters after the final retained segment are removed.
If metadata alone does not fit, no preview is persisted.
The snapshot contains remote URLs and text only; images do not enter attachment lifecycle.

## Native Bridge and Main App

The Capacitor bridge exposes optional preview JSON. TypeScript parses it defensively. A valid
persisted snapshot is the first preview source used by controller and importer. Here, a legacy
preview path means any item with no valid persisted preview, regardless of schema version; this
includes v1/v2 items rewritten as v3 with `preview == nil`. Such items continue using the
selected workspace route. A v3 rich item requires no second request, which keeps the Extension
and imported result consistent and allows later offline import.

## Document Projection

`createShareBlockPlan` projects the snapshot into existing schemas. Every generated node has a
deterministic ID derived from `importAttemptId`. Existing create-if-missing and validate-only-if-
present semantics remain, so retries never overwrite user-edited props.

Let `prefix = share-${importAttemptId}`. IDs are `${prefix}-metadata`, `${prefix}-transcript`,
`${prefix}-transcript-heading`, `${prefix}-transcript-chapter-${originalIndex}`, and
`${prefix}-transcript-segment-${originalIndex}`. Segments retain response order after empty
entries are filtered, so IDs use the original response index. Chapters sort by
`(startSeconds, originalIndex)` and are inserted before the first retained segment whose finite
`startSeconds >= chapter.startSeconds`; unmatched chapters follow the final segment.

Deduplication normalizes text by splitting Unicode whitespace, joining with one ASCII space,
trimming, and lowercasing. A segment equal to the normalized selected text or description is
removed. If the normalized concatenation of all retained segment text equals either value, the
whole transcript is omitted. Timestamps use floor-to-whole-seconds formatting. Chapter titles,
speaker labels, and segment text are ordinary paragraph text; only the deterministic heading uses
`{type:'h6', text:'Transcript', collapsed:true}` inside one grey callout.

Gate C remains closed. The importer does not attach `sharePreviewSourceId`, so local and older
self-hosted workspaces do not depend on Blob-reference projection support.

## Title Priority

The Extension displays `explicit user edit > preview title > original title > host`. The
manifest title remains original or explicitly edited. During import, a non-generic manifest
title wins; preview title may replace only the generic `Shared` fallback. Recovery preserves
existing non-empty document and page titles.

## Failure and Lifecycle Semantics

- Preview fetch/decode/image failures are non-fatal. Successful metadata is persisted even when
  media loading fails, and both Extension and main App render a placeholder for that snapshot.
- Generation identity plus cancellation prevents stale responses from replacing a new draft.
- The controller owns the initial payload-load task. Cancel, successful completion, and teardown
  cancel it; provider continuations resume once, propagate `Progress.cancel()` where available,
  and discard any binary staging result delivered after cancellation.
- The start of `save()` is the linearization point. It captures loaded preview or fixes
  `preview == nil` when still loading, then immediately cancels preview/media tasks. Successful
  save, discard, draft replacement, deinit, and Extension completion permit no later state write
  and no task may retain the view model.
- Manifest-last publication, staged attachments, receipts, conflict checks, and cleanup remain.
- A malformed or oversized v3 preview is discarded while the URL item remains importable.
- Imported remote images continue through the existing BlockSuite image-proxy path.

## Test Strategy

Swift covers decoding, bounds, truncation, URL rejection, request contract, cancellation,
fallback, title priority, v2-to-v3 migration, and v3 round trip. `URLProtocol` fixtures avoid
production networking. Vitest covers defensive parsing, snapshot precedence, zero duplicate
requests, rich rendering, deterministic projection, transcript deduplication, retry stability,
and ordinary URL fallback.

Final verification includes targeted Swift/Vitest suites, canary bundle, Capacitor sync,
simulator App/ShareExtension builds, physical-device installation, and manual YouTube shares
for one video with transcript and one without.
