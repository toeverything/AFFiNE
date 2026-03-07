# Contract: Inline Extension Interfaces

**Feature**: `001-editor-markdown-parity`
**Date**: 2026-03-07

This document defines the public contracts for the new inline extensions added by this feature. All extensions follow the existing `InlineMarkdownExtension` and `InlineSpec` patterns from BlockSuite.

---

## 1. HighlightMarkdown Extension

**Location**: `blocksuite/affine/inlines/preset/src/markdown.ts`

```typescript
// Contract: InlineMarkdownExtension for == == highlight
export const HighlightMarkdown: ExtensionType;

// Trigger: ==word== followed by SPACE (not Enter; consistent with all other InlineMarkdownExtension rules)
// Pattern: /.*==([^\s=][^=]*[^\s=])==\s$|.*==([^\s=])==\s$/
// Effect: applies { highlight: DEFAULT_HIGHLIGHT_COLOR } to matched text, removes delimiters
// Nested/adjacent == sequences (e.g. ==a==b==) are NOT supported — treated as ==a== + literal b==
// Exported from: MarkdownExtensions array
```

**Attribute contract** (`AffineTextAttributes`):

```typescript
highlight?: string | null;
// null | undefined = not highlighted
// string = CSS colour value or design token, e.g. 'var(--affine-highlight-yellow)'
// Default when applied via shortcut: 'var(--affine-highlight-yellow)'
```

---

## 2. CommentMarkdown Extension

**Location**: `blocksuite/affine/inlines/preset/src/markdown.ts` (new entry)

```typescript
// Contract: InlineMarkdownExtension for %% %% comments
export const CommentMarkdown: ExtensionType;

// Trigger: %%text%% inline form OR multi-line %% ... %% block form
// Both forms apply { comment: true } to the enclosed text and remove delimiters from live preview
// In live preview: renders as empty span (zero width, invisible)
// In source mode: renders as styled grey/muted text WITH %% delimiters VISIBLY rendered on both sides
//   (e.g. "%%", grey comment text, "%%" — so user can identify and edit the boundary)
```

**Attribute contract** (`AffineTextAttributes`):

```typescript
comment?: true | null;
// null | undefined = normal text
// true = Obsidian comment — hidden in live preview, visible in source mode
```

---

## 3. WikilinkInputRule

**Location**: `blocksuite/affine/inlines/preset/src/keymap/bracket.ts` (extension)

```typescript
// Contract: input rule triggered by [[ ... ]]
// Responsible function: markdown adapter paste handler in blocksuite/affine/shared/src/adapters/markdown/markdown.ts
//   Paste-time wikilink → reference conversion is handled by the markdown import adapter's
//   rehype/remark pipeline, specifically the wikilink token visitor that calls WikilinkResolver.
// On ]] typed: if preceded by [[title]], convert span to reference inline delta
// Conversion fires on ]] typed — NOT character-by-character
// Alias syntax [[title|display]] → sets display text to 'display', target to 'title'
// Heading link [[title#Heading]] → reference with anchor
// Block link [[title#^id]] → reference with blockId param

interface WikilinkInputRuleResult {
  targetTitle: string; // page title to resolve
  displayText: string; // text shown to user (defaults to targetTitle)
  anchor?: string; // heading or ^block-id anchor
}
```

**Resolution contract**:

```typescript
// WikilinkResolver — consults workspace page index
interface WikilinkResolver {
  // Title matching is case-insensitive; first match wins on duplicates
  resolve(title: string): Promise<{ pageId: string } | null>;
  // On click of unresolved link: re-resolve first; only create if still unresolved
  createPage(title: string): Promise<{ pageId: string }>;
}
// Unresolved: pageId = '' in stored delta; visual indicator = CSS class 'affine-reference--unresolved' (dashed underline)
// On click (unresolved): re-resolves first (handles race condition); creates only if still unresolved; updates delta pageId; navigates
```

---

## 4. TagInlineSpec

**Location**: `blocksuite/affine/inlines/tag/src/` (new package)

```typescript
// Contract: inline spec for #tag-name tokens
interface TagDeltaAttributes {
  tag: {
    name: string; // canonical lowercase tag name without #, e.g. 'inbox/reading'
  };
}

// Render contract (live preview):
// <span class="affine-tag" role="link" tabindex="0" aria-label="Tag: {name}">
//   #{originalCasing}
// </span>

// Interaction contract:
// Click / Enter / Space → opens workspace search filtered by tag name
// Search query format: 'tag:{name}'  (uses existing AFFiNE search infrastructure)

// Validation rules (applied on input):
// - Must match /^[a-zA-Z0-9_\-\/]+$/ with at least one non-digit
// - No spaces
// - Forward slash for nested tags: #inbox/to-read
// - Canonical form: lowercased, stored in tag.name

// Tag vs heading disambiguation:
// # at column 0 followed by a SPACE = heading → NOT a tag
// # at column 0 followed immediately by a non-space character = tag candidate
// # after any non-whitespace or after whitespace mid-line = tag candidate

// Display casing: rendered with original casing as typed (e.g. #Tag renders with capital T)
// Canonical form for matching/search: lowercased (tag.name is always lowercase)
// Search query on click: 'tag:<canonical-name>' (e.g. #Inbox/Reading → 'tag:inbox/reading')
```

---

## 5. CalloutType Config Contract

**Location**: `blocksuite/affine/blocks/callout/src/configs/callout-types.ts` (new file)

```typescript
export interface CalloutTypeConfig {
  aliases: string[]; // all type identifiers that map to this config (lowercase)
  icon: string; // icon name from @blocksuite/icons
  colorToken: string; // CSS variable name, e.g. '--affine-tag-blue'
  label: string; // Human-readable label for accessibility
}

export const CALLOUT_TYPE_CONFIGS: CalloutTypeConfig[];

// Canonical alias map (case-insensitive):
// note: ['note']
// info: ['info']
// tip: ['tip', 'hint', 'important']
// success: ['success', 'check', 'done']
// question: ['question', 'help', 'faq']
// warning: ['warning', 'caution', 'attention']
// failure: ['failure', 'fail', 'missing']
// danger: ['danger', 'error']
// bug: ['bug']
// example: ['example']
// quote: ['quote', 'cite']

// Contract: remark-callout.ts uses this map to:
// 1. Recognise [!TYPE] syntax (case-insensitive match against all aliases)
// 2. Set calloutType on the block model
// 3. Set preset icon and backgroundColorName from config
// 4. Recognise foldable suffix: [!TYPE]- (collapsed by default), [!TYPE]+ (expanded by default, collapsible)
// 5. Unknown type → defaults to 'note' config (per Obsidian spec)
// 6. Existing callout blocks with calloutType=null/undefined render with note defaults (no migration needed)
```

---

## 6. Source Mode Toggle Contract

**Location**: `packages/frontend/core/src/blocksuite/block-suite-mode-switch/` (extend existing)

```typescript
// EditorMode enum extension (if not already present)
type EditorDisplayMode = 'page' | 'edgeless' | 'source';

// Source mode transition contract:
// live-preview → source:
//   1. Serialise document to markdown string (existing markdown adapter)
//   2. Display in read-write code editor (existing CodeBlock infrastructure or plain textarea)
//   3. No CRDT sync during source edit

// source → live-preview:
//   1. Parse markdown string via existing markdown import adapter
//   2. Diff against current block tree, apply mutations
//   3. Failed parse: show error, do not exit source mode

// Round-trip guarantee: all formatting types in spec MUST survive a live-preview → source → live-preview cycle
```

---

## 7. Markdown Adapter Export Contract

**Location**: `blocksuite/affine/shared/src/adapters/markdown/markdown.ts`

New serialisation rules added to the adapter:

| Block / Attribute     | Serialised As                             |
| --------------------- | ----------------------------------------- |
| `highlight` attribute | `==text==`                                |
| `comment` attribute   | `%%text%%`                                |
| Wikilink reference    | `[[Page Name]]` or `[[Page Name\|Alias]]` |
| Tag inline            | `#tag-name` (plain text)                  |
| `calloutType` callout | `> [!TYPE]\n> content`                    |
| Foldable callout `-`  | `> [!TYPE]-\n> content`                   |
| Foldable callout `+`  | `> [!TYPE]+\n> content`                   |
