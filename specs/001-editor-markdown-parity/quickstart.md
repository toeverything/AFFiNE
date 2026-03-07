# Developer Quickstart: Editor Markdown & Rich Text Parity

**Branch**: `001-editor-markdown-parity`
**Date**: 2026-03-07

---

## Prerequisites

- Node.js 20+
- Yarn 4 (managed via corepack — do NOT use npm or pnpm)
- Rust toolchain (for native bindings — `rustup` recommended)

```bash
corepack enable
yarn install
```

---

## Key Directories

| Path                                                                              | What it is                                                                                               |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `blocksuite/affine/inlines/preset/src/markdown.ts`                                | Inline markdown shortcut rules (bold, italic, etc.) — add `HighlightMarkdown` and `CommentMarkdown` here |
| `blocksuite/affine/inlines/preset/src/keymap/bracket.ts`                          | `[[` bracket input handling — extend for wikilink `[[ ]]`                                                |
| `blocksuite/affine/shared/src/types/index.ts`                                     | `AffineTextAttributes` — add `highlight` and `comment` fields                                            |
| `blocksuite/affine/blocks/callout/src/`                                           | Callout block implementation                                                                             |
| `blocksuite/affine/model/src/blocks/callout/callout-model.ts`                     | Callout schema — add `calloutType`, `foldable`, `folded`                                                 |
| `blocksuite/affine/shared/src/adapters/markdown/remark-plugins/remark-callout.ts` | Callout markdown parser — extend for Obsidian `[!TYPE]` syntax                                           |
| `blocksuite/affine/shared/src/adapters/markdown/markdown.ts`                      | Markdown adapter — add serialisers for new types                                                         |
| `blocksuite/affine/shared/src/adapters/markdown/gfm.ts`                           | GFM extensions already wired                                                                             |
| `packages/frontend/core/src/blocksuite/view-extensions/code-block-preview/`       | Mermaid preview (already exists)                                                                         |
| `packages/frontend/core/src/blocksuite/block-suite-mode-switch/`                  | Editor mode toggle — extend for source mode                                                              |
| `blocksuite/affine/shared/src/theme/css-variables.ts`                             | Design tokens — audit for WCAG AA                                                                        |

---

## Running the Dev Server

```bash
yarn dev
# Web app: http://localhost:8080
```

## Running Tests

```bash
# Unit tests (Vitest)
yarn vitest

# Specific package unit tests
yarn workspace @blocksuite/affine-inline-preset vitest

# E2E tests (Playwright)
yarn e2e

# Run a specific Playwright test
yarn playwright test --grep "markdown"
```

## Lint and Typecheck (required before PR)

```bash
yarn lint
yarn typecheck
```

---

## Implementation Sequence (follow tasks.md for full detail)

### Phase A — Inline Formatting (P1 stories, unblocked)

1. Add `highlight` and `comment` to `AffineTextAttributes`
2. Add `HighlightMarkdown` extension in `preset/src/markdown.ts`
3. Register in `MarkdownExtensions[]`
4. Add `CommentMarkdown` extension
5. Add inline rendering logic (hide comment in live preview; show in source)
6. Write unit tests for both shortcuts

### Phase B — Wikilinks (P1 stories, unblocked)

1. Extend `bracket.ts` keymap to handle `[[ ]]` completion → reference delta
2. Add paste-time wikilink → reference converter in markdown adapter
3. Add alias parsing `[[title|alias]]`
4. Add heading/block anchor parsing `[[title#heading]]`, `[[title#^id]]`
5. Wire unresolved link click → page creation
6. Write Playwright E2E test for wikilink creation and resolution

### Phase C — Callout Types (P2, requires callout block exists ✓)

1. Add `calloutType`, `foldable`, `folded` to `CalloutBlockSchema`
2. Create `callout-types.ts` config with full type → icon/colour mapping
3. Update `remark-callout.ts` to parse `> [!TYPE]` and `> [!TYPE]±` syntax
4. Update callout block renderer to apply preset icon/colour from `calloutType`
5. Add fold/expand toggle interaction
6. Update markdown serialiser for callout type export
7. Verify WCAG AA contrast for all callout colour tokens in both themes

### Phase D — Tags (P3)

1. Create `blocksuite/affine/inlines/tag/` package
2. Implement `TagInlineSpec` with input rule and renderer
3. Wire click handler → workspace search with tag filter
4. Add tag serialisation to markdown adapter (as plain `#tag-name` text)
5. Write unit + E2E tests

### Phase E — Source Mode (P1/clarification-driven)

1. Extend `EditorDisplayMode` type with `'source'`
2. Add mode toggle button to editor toolbar
3. Implement source view: serialise doc → display in editable code view
4. Implement source → live-preview: parse → apply block mutations
5. Write E2E test for round-trip (live → source → live)

### Phase F — Comments (P3)

1. Add `comment: true | null` to `AffineTextAttributes`
2. Add `%%...%%` inline markdown shortcut
3. Add renderer: empty span in live preview, styled text in source mode
4. Add `%%...%%` serialisation to markdown adapter
5. Write unit tests

---

## Adding a New Inline Markdown Extension

Follow the pattern in `blocksuite/affine/inlines/preset/src/markdown.ts`:

```typescript
export const MyExtension = InlineMarkdownExtension<AffineTextAttributes>({
  name: 'my-extension',
  pattern: /pattern-to-match/,
  action: ({ inlineEditor, prefixText, inlineRange, pattern, undoManager }) => {
    const match = prefixText.match(pattern);
    if (!match) return;
    // 1. Find text range
    // 2. undoManager.stopCapturing()
    // 3. inlineEditor.formatText(range, attributes)
    // 4. Delete delimiter characters
    // 5. inlineEditor.setInlineRange(newRange)
  },
});

// Register in MarkdownExtensions[]:
export const MarkdownExtensions: ExtensionType[] = [
  ...,
  MyExtension,
];
```

---

## Callout Type Config Pattern

New file: `blocksuite/affine/blocks/callout/src/configs/callout-types.ts`

```typescript
import type { CalloutTypeConfig } from '../types.js';

export const CALLOUT_TYPE_CONFIGS: CalloutTypeConfig[] = [
  {
    aliases: ['note'],
    icon: 'InfoIcon',
    colorToken: '--affine-tag-blue',
    label: 'Note',
  },
  {
    aliases: ['warning', 'caution', 'attention'],
    icon: 'WarningIcon',
    colorToken: '--affine-tag-orange',
    label: 'Warning',
  },
  // ... etc
];

export function getCalloutTypeConfig(type: string): CalloutTypeConfig {
  const lower = type.toLowerCase();
  return (
    CALLOUT_TYPE_CONFIGS.find(c => c.aliases.includes(lower)) ?? CALLOUT_TYPE_CONFIGS[0] // default: note
  );
}
```
