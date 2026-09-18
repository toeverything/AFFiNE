# macOS Markdown File Association and Live Sync PRD

## Summary

AFFiNE Desktop should open local `.md` and `.markdown` files from macOS Finder's "Open With" flow, create or focus a linked AFFiNE Doc, keep that Doc in sync with external file saves, and write AFFiNE-side edits back to the source Markdown file.

This feature is scoped to the Electron desktop app. It keeps bindings in memory for the current app session and intentionally does not change AFFiNE's workspace persistence model.

## Goals

- Register macOS document support for `.md` and `.markdown`.
- Support cold-start and warm-app file opens.
- Create one linked Doc per opened file path during the current app session.
- Reopening the same file focuses the existing linked Doc instead of creating duplicates.
- Use AFFiNE's existing Markdown import pipeline for ordinary Markdown files.
- Reflect external file saves in AFFiNE with a short debounce.
- Write ordinary linked Doc edits back to the source Markdown file automatically.
- Provide a compatibility path for large or complex Markdown that would otherwise make the editor unresponsive.
- Preserve existing AFFiNE protocol and import behavior.

## Non-Goals

- Windows and Linux file association support.
- Persistent file-to-Doc bindings across app restarts.
- Perfect Markdown round-trip fidelity.
- Rich merge UI for ordinary native AFFiNE Docs.
- Full native block editing for oversized or structurally complex Markdown files.

## Repository Constraints

- Target `canary`.
- Keep the feature in one PR with ordered review checkpoints.
- Use a Conventional Commit PR title, for example `feat(electron): add markdown file sync`.
- Do not modify `node_modules`.
- Keep all filesystem APIs Markdown-specific; do not expose a generic file read/write bridge.

## Implementation

### Packaging

`packages/frontend/apps/electron/forge.config.mjs` adds a macOS `CFBundleDocumentTypes` entry for Markdown documents:

- extensions: `md`, `markdown`
- role: `Editor`
- UTI: `net.daringfireball.markdown`
- handler rank: `Alternate`

The existing app URL protocol configuration remains unchanged.

The packaging step also keeps `@affine/native` available at runtime for packaged macOS apps while leaving other main-process dependencies bundled into `dist/main.js`.

### Main Process

`packages/frontend/apps/electron/src/main/markdown-file/index.ts` owns the native file bridge:

- Validates absolute `.md` and `.markdown` paths.
- Handles macOS `app.on('open-file')`.
- Handles command-line/second-instance Markdown file arguments as a fallback.
- Maintains a pending open-request queue with request claiming.
- Maintains an in-memory `filePath -> { workspaceId, docId }` binding registry.
- Reads and writes UTF-8 Markdown content.
- Watches opened files with `chokidar`, `awaitWriteFinish`, and per-path debounce.
- Emits Markdown-specific IPC events for open requests, content changes, and unavailable files.
- Provides virtualized line reads for compatibility-mode previews.

The open-file handler only calls `preventDefault()` for validated Markdown files, so non-Markdown behavior remains available to the rest of the app.

### Renderer

`packages/frontend/core/src/modules/markdown-file-sync` registers a workspace-scoped sync service in the Electron renderer.

The service:

- Processes pending open requests only from the active tab/workspace.
- Imports ordinary Markdown with `MarkdownTransformer.importMarkdownToDoc`.
- Replaces existing linked Doc content in place on external saves to avoid docId churn.
- Tracks content hashes to avoid write/watch loops.
- Navigates to same-workspace Docs through `WorkbenchService`.
- Routes cross-workspace bindings through a lightweight route bridge.
- Writes ordinary linked Doc edits back to the source file with a debounce.

### Large and Complex Markdown

Markdown that exceeds complexity thresholds uses a compatibility viewer instead of native block import. This prevents large files from freezing AFFiNE while still making the file readable and editable.

Compatibility mode:

- Creates a linked AFFiNE Doc for routing and binding.
- Shows a virtualized Markdown preview using line-window reads.
- Provides `Edit source` for direct Markdown editing.
- Saves source edits back to the file.
- Detects external changes during source editing and prompts the user to `Reload`, `Keep mine`, or `Merge`.
- Disables saving for read-only files and surfaces the file permission state before write attempts.

Ordinary Markdown continues to use the native AFFiNE Markdown import path.

## Data Model

Session binding:

```ts
type MarkdownFileBinding = {
  filePath: string;
  workspaceId: string;
  docId: string;
  title: string;
  lastContentHash: string;
};
```

Bindings are session-only. They are stored in the Electron main process and are updated by renderer acknowledgements after import, replacement, or writeback.

## Sync Policy

- External saves are the source of truth for watched file-change events.
- Ordinary linked Docs write local AFFiNE edits back to disk automatically.
- Content hashes suppress loops between AFFiNE writes and file watcher events.
- Compatibility-mode source editing preserves the editor buffer if an external save arrives and asks the user to choose how to continue.
- Rename/delete is treated as unavailable and pauses sync for that binding.

## Acceptance Criteria

- Finder "Open With AFFiNE" for `.md` and `.markdown` launches or focuses AFFiNE.
- AFFiNE creates or focuses exactly one linked Doc per opened file path in the current session.
- Ordinary Markdown content is imported through the existing AFFiNE Markdown pipeline.
- Large or complex Markdown opens without freezing the app.
- External saves update the corresponding Doc without creating duplicate Docs.
- AFFiNE-side edits to ordinary linked Docs write back to the source Markdown file automatically.
- Compatibility-mode `Edit source` can save back to the file and handles external-change conflicts without silently discarding the edit buffer.
- Fast repeated saves settle on the final content.
- Existing AFFiNE URL scheme handling and existing Markdown import modal behavior remain intact.

## Verification Plan

Recommended follow-up automated coverage:

- Markdown path validation.
- Pending open-request claim/complete/fail lifecycle.
- Binding lookup by file path and docId.
- UTF-8 read/write and inode-preserving write behavior.
- Virtualized line reads and read-only detection.
- Ordinary Markdown duplicate-open and external-change handling.
- In-place replacement without docId churn.
- Compatibility-mode large Markdown binding updates.
- Writeback loop suppression and overlapping external replacement handling.

Build and verification:

```sh
yarn tsc -b packages/frontend/core/tsconfig.json packages/frontend/apps/electron-renderer/tsconfig.json packages/frontend/apps/electron/tsconfig.json
BUILD_TYPE=canary NODE_ENV=production yarn affine @affine/electron-renderer build
BUILD_TYPE=canary NODE_ENV=production yarn affine @affine/electron build
```

Manual macOS:

- Package the canary app.
- Open a small `.md` file from Finder with AFFiNE closed.
- Open another `.md` file while AFFiNE is already running.
- Reopen the same file and verify the existing Doc is focused.
- Edit the file in TextEdit and VS Code and verify AFFiNE updates while unfocused.
- Edit an ordinary linked Doc in AFFiNE and verify the Markdown file changes on disk.
- Open a multi-megabyte Markdown file and verify AFFiNE remains responsive.
- In compatibility mode, edit source content, trigger an external save, and verify conflict actions are shown.

## Known Limitations

- Bindings are not restored after app restart.
- Ordinary linked Docs do not provide a rich merge UI if an external editor and AFFiNE edit the same content at the same time.
- Markdown syntax unsupported by the existing Blocksuite import/export pipeline may be simplified or lost.
- Compatibility-mode preview is intentionally lightweight and does not fully render every Markdown extension.
- Rename is treated as delete/unavailable rather than rebinding to the new path.
