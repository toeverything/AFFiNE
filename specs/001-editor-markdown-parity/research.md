# Research: Editor Markdown & Rich Text Parity

**Feature**: `001-editor-markdown-parity`
**Date**: 2026-03-07

---

## 1. Existing BlockSuite Capabilities (What Already Works)

### Decision: Leverage existing BlockSuite infrastructure wherever possible

**Rationale**: BlockSuite (the AFFiNE editor engine, located in `blocksuite/`) already implements the majority of the required features. The plan focuses on gaps, configuration, and Obsidian-specific extensions rather than building from scratch.

| Feature                    | Status                                                                                                   | Location                                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bold `**...**`             | Exists                                                                                                   | `blocksuite/affine/inlines/preset/src/markdown.ts` → `BoldMarkdown`                                                                                                |
| Italic `*...*`             | Exists                                                                                                   | `blocksuite/affine/inlines/preset/src/markdown.ts` → `ItalicExtension`                                                                                             |
| Bold+Italic `***...***`    | Exists                                                                                                   | `blocksuite/affine/inlines/preset/src/markdown.ts` → `BoldItalicMarkdown`                                                                                          |
| Strikethrough `~~...~~`    | Exists                                                                                                   | `blocksuite/affine/inlines/preset/src/markdown.ts` → `StrikethroughExtension`                                                                                      |
| Underline                  | Exists                                                                                                   | `blocksuite/affine/inlines/preset/src/markdown.ts` → `UnderthroughExtension`                                                                                       |
| Inline code `` ` ``        | Exists                                                                                                   | `blocksuite/affine/inlines/preset/src/markdown.ts` → `CodeExtension`                                                                                               |
| Inline LaTeX `$...$`       | Exists                                                                                                   | `blocksuite/affine/inlines/latex/`                                                                                                                                 |
| Highlight `==...==`        | **MISSING** — `background` attribute exists in `AffineTextAttributes` but no `==` markdown shortcut rule |
| Fenced code blocks         | Exists                                                                                                   | `blocksuite/affine/blocks/code/` using **Shiki** for highlighting                                                                                                  |
| Syntax highlighting        | Exists                                                                                                   | Shiki (`shiki` package, WASM engine) — loads languages on demand                                                                                                   |
| Mermaid diagrams           | Exists (partial)                                                                                         | `packages/frontend/core/src/blocksuite/view-extensions/code-block-preview/mermaid-preview.ts` using `mermaid ^11.12.2` — already registered for `mermaid` language |
| Display math `$$...$$`     | Exists                                                                                                   | `blocksuite/affine/blocks/latex/` using **KaTeX**                                                                                                                  |
| GFM tables                 | Exists (adapter)                                                                                         | `blocksuite/affine/shared/src/adapters/markdown/gfm.ts` — `gfmTable` parser; table block at `blocksuite/affine/blocks/table/`                                      |
| GFM task lists             | Exists (adapter)                                                                                         | `gfmTaskListItem` in GFM adapter; `affine:list` block with task type                                                                                               |
| GFM footnotes              | Exists                                                                                                   | `blocksuite/affine/inlines/footnote/` — block-level inline                                                                                                         |
| GFM strikethrough          | Exists                                                                                                   | via GFM adapter                                                                                                                                                    |
| GFM autolinks              | Exists                                                                                                   | `gfmAutolinkLiteral` in GFM adapter                                                                                                                                |
| Block quotes `> ...`       | Exists                                                                                                   | paragraph/quote block                                                                                                                                              |
| Horizontal rules `---`     | Exists                                                                                                   | `blocksuite/affine/blocks/divider/`                                                                                                                                |
| Unordered/ordered lists    | Exists                                                                                                   | `blocksuite/affine/blocks/list/`                                                                                                                                   |
| H1–H6 headings             | Exists                                                                                                   | paragraph block with heading type                                                                                                                                  |
| Callout block              | Exists (partial)                                                                                         | `blocksuite/affine/blocks/callout/` — has free-form icon+colour, but **NOT** Obsidian-typed callouts (`[!NOTE]`, `[!WARNING]` etc.)                                |
| Callout remark plugin      | Exists (emoji variant)                                                                                   | `remark-callout.ts` — parses `[!emoji]` not `[!TYPE]`                                                                                                              |
| Internal page links        | Exists                                                                                                   | `blocksuite/affine/inlines/reference/` — resolves against workspace                                                                                                |
| Wikilink `[[...]]` parsing | **MISSING** — no `[[...]]` markdown shortcut; reference inline exists but wikilink syntax not wired      |
| Comments `%% ... %%`       | **MISSING** — no Obsidian comment syntax support                                                         |
| Obsidian tags `#tag`       | **MISSING** — no inline tag element                                                                      |
| Source mode (raw markdown) | Exists (partial)                                                                                         | Code block has source mode; no global document source mode                                                                                                         |
| WCAG AA contrast           | **NEEDS VERIFICATION** — callout colours defined, not audited                                            |

**Alternatives considered**: Replacing BlockSuite with a different editor (ProseMirror, CodeMirror, Slate). Rejected — AFFiNE's CRDT model and block architecture are tightly integrated with BlockSuite; replacement is out of scope.

---

## 2. Highlight `==...==` Markdown Shortcut

### Decision: Add `HighlightMarkdown` extension to `InlineMarkdownExtension` registry

**Rationale**: The `background` attribute already exists in `AffineTextAttributes` (line 45 of `shared/src/types/index.ts`). The pattern for adding a new inline markdown rule is established by the other extensions in `preset/src/markdown.ts`. This is a small, targeted addition.

**Implementation**: Add `HighlightMarkdown` following `StrikethroughExtension` pattern:

- Pattern: `/.*==([^\s=][^=]*[^\s=])==\s$|.*==([^\s=])==\s$/`
- Action: `inlineEditor.formatText({ bold: false }, { background: 'var(--affine-text-highlight-color)' })`
- Register in `MarkdownExtensions` array

**Alternatives considered**: Using a separate `highlight` boolean attribute. Rejected — `background` already exists and is what the colour picker uses. Using a custom attribute would create a parallel system.

---

## 3. Wikilink `[[Page Name]]` Support

### Decision: Add a new `WikilinkInlineExtension` + markdown input rule

**Rationale**: The existing `reference` inline (`blocksuite/affine/inlines/reference/`) already resolves against workspace pages. Wikilinks are Obsidian's syntax for the same concept. The implementation path is:

1. Add a bracket-pair input rule that detects `[[` and triggers wikilink completion (similar to how `[[` already triggers reference in the `bracket.ts` keymap at `blocksuite/affine/inlines/preset/src/keymap/bracket.ts`)
2. On closing `]]`, convert the text to an inline reference node with the title as the page target
3. On paste, run a wikilink-to-reference transformer in the markdown adapter

**Key files**:

- `blocksuite/affine/inlines/preset/src/keymap/bracket.ts` — existing `[[` handling
- `blocksuite/affine/shared/src/adapters/markdown/markdown.ts` — paste adapter
- `blocksuite/affine/inlines/reference/src/` — reference inline to reuse

**Alternatives considered**: A completely new inline type for wikilinks. Rejected — the reference inline already handles page resolution, unresolved states, and workspace navigation. Duplicating it would violate YAGNI.

---

## 4. Obsidian-Typed Callouts `> [!NOTE]`

### Decision: Extend the existing callout block with a `calloutType` property and update `remark-callout.ts`

**Rationale**: The callout block (`blocksuite/affine/blocks/callout/`) already exists with colour and icon support. The `remark-callout.ts` plugin parses `[!emoji]` syntax but not `[!TYPE]` (note, warning, etc.). Changes needed:

1. Add `calloutType?: string` to `CalloutBlockSchema` (optional, defaults to generic)
2. Update `remark-callout.ts` to recognise Obsidian callout type identifiers (`[!NOTE]`, `[!WARNING]`, etc.) and map them to preset icons and colours
3. Add foldable (`+`/`-`) suffix parsing to the remark plugin
4. Add nested callout rendering (already supported by block children model)

**Callout type → preset mapping** (to be implemented in a config file):

- `note` → info icon, blue-grey
- `info`, `todo` → info icon, blue
- `tip`, `hint`, `important` → lightbulb, green
- `success`, `check`, `done` → check icon, green
- `question`, `help`, `faq` → question icon, yellow
- `warning`, `caution`, `attention` → warning icon, orange
- `failure`, `fail`, `missing` → X icon, red
- `danger`, `error` → alert icon, red
- `bug` → bug icon, red
- `example` → list icon, purple
- `quote`, `cite` → quote icon, grey

**Alternatives considered**: A separate `ObsidianCalloutBlock` type. Rejected — the existing callout block already has the required visual and structural capabilities; adding a type property is simpler and maintains a single block type.

---

## 5. Obsidian Comments `%% ... %%`

### Decision: Add a `%% ... %%` remark plugin + inline spec for source-visible, render-hidden comments

**Rationale**: No equivalent exists in BlockSuite. Two viable approaches:

- **Approach A (inline decoration)**: Treat comments as a special inline text attribute that renders as nothing in live preview but shows in source mode
- **Approach B (remark plugin)**: Strip `%% ... %%` during markdown parsing

**Decision**: Approach A — inline decoration. This allows source mode to show the raw comment text while live preview hides it, matching Obsidian's behaviour precisely. Consistent with how the inline spec system works (similar pattern to `latex` inline).

**Implementation**:

1. Add `comment: true` to `AffineTextAttributes`
2. Add `%%` markdown shortcut (similar to code inline but strips delimiters and applies `comment` attribute)
3. In the inline renderer, return an empty span for `comment: true` in live preview mode; show styled text in source mode

**Alternatives considered**: Removing comments entirely on paste. Rejected — losing content on paste violates the round-trip fidelity requirement (SC-008).

---

## 6. Obsidian Tags `#tag-name`

### Decision: Add a `TagInlineExtension` as a new inline spec

**Rationale**: No equivalent exists. Tags are not links (they don't navigate to a page) — they trigger a search. Pattern:

1. New inline spec: detects `#tag-name` (with valid tag character rules) as a typed inline node
2. On click: invokes the AFFiNE workspace search interface with the tag as the query filter
3. Visual: rendered as a styled pill/badge using Vanilla Extract CSS

**Key constraint**: Must not conflict with H1 heading (`# Heading` at line start). The inline spec must only match `#` when not at the very start of a block's text content.

**Tag format rules** (from Obsidian docs):

- Letters, numbers, hyphens (`-`), underscores (`_`), forward slashes for nesting (`/`)
- Must contain at least one non-numeric character
- Case-insensitive (store canonical form)
- No spaces allowed

**Alternatives considered**: Using a remark plugin to convert tags during paste only. Rejected — tags typed live in the editor also need to render as tag elements (live preview requirement).

---

## 7. Source Mode (Global Document)

### Decision: Wire an existing or minimal document-level source view using the code block infrastructure

**Rationale**: Individual code blocks already have a source/preview toggle. A global document source mode would show the entire document as raw markdown. BlockSuite's markdown adapter (`markdown.ts`) already serialises the document; the source mode view would be a read-write code editor over that serialisation.

**Implementation approach**:

1. Add a document-level mode toggle (live preview ↔ source) to the editor toolbar
2. In source mode: serialise the document to markdown using the existing adapter, display in a plain text / code editor view
3. On exiting source mode: parse the modified markdown back through the adapter and update the block tree
4. CRDT compatibility: source mode edits are applied as block-level operations on save, not character-by-character — consistent with CRDT model

**Scope note**: The spec requires source mode exists; it does not require real-time CRDT sync within source mode itself. The switch-in/switch-out boundary is the sync point.

**Alternatives considered**: Live CRDT sync inside source mode (character-level). Rejected — prohibitively complex for this feature iteration; the boundary-sync approach is consistent with how other editors (Obsidian, Notion) handle this.

---

## 8. WCAG 2.1 AA Accessibility

### Decision: Audit and fix callout + highlight colour tokens against AA contrast ratios

**Rationale**: The existing callout colour palette (`default`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `grey`) needs contrast verification for both light and dark themes. Vanilla Extract CSS tokens in `blocksuite/affine/shared/src/theme/css-variables.ts` are the canonical colour source.

**Action items** (Phase 1):

1. Run automated contrast checks against all callout background + text combinations in light and dark themes
2. Adjust any failing token values in `css-variables.ts`
3. Ensure callout types distinguish by icon + label, not colour alone (already partially true via emoji/icon system)
4. Keyboard navigation: verify all new interactive elements (tags, wikilinks, checkboxes, footnote back-links) are reachable via Tab and operable via Enter/Space

---

## 9. Technology Decisions Summary

| Concern             | Decision                                              | Rationale                                                      |
| ------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| Syntax highlighting | **Shiki** (already integrated)                        | Singleton WASM highlighter, lazy language loading, theme-aware |
| Math rendering      | **KaTeX** (already integrated via latex block)        | Already used; fast client-side rendering                       |
| Diagram rendering   | **Mermaid ^11.12.2** (already integrated)             | Already wired in code-block-preview extension                  |
| Markdown parsing    | **unified / remark / micromark** (already integrated) | GFM adapter already uses this stack                            |
| Inline editing      | **BlockSuite InlineMarkdownExtension**                | Established pattern for live-preview markdown shortcuts        |
| Styling             | **Vanilla Extract** + **@toeverything/theme/v2**      | Project standard; CSS-in-JS with token system                  |
| Testing             | **Vitest** (unit) + **Playwright** (E2E)              | Constitution requirement; existing test patterns               |
