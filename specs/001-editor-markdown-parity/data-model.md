# Data Model: Editor Markdown & Rich Text Parity

**Feature**: `001-editor-markdown-parity`
**Date**: 2026-03-07

All persistent state uses y-octo / yjs CRDT structures via BlockSuite's existing store (Constitution Principle III).

---

## 1. Inline Text Attribute Extensions

**Existing type**: `AffineTextAttributes` in `blocksuite/affine/shared/src/types/index.ts`

### New attribute: `highlight`

```typescript
// Addition to AffineTextAttributes
highlight?: string | null;  // CSS colour value or token, e.g. 'var(--affine-highlight-yellow)'
```

**Notes**:

- The existing `background` attribute is used by the colour picker for arbitrary colours; `highlight` is the canonical Obsidian `==text==` attribute with a fixed default colour (`var(--affine-highlight-yellow)`)
- Stored as a string token; renderer maps token → CSS value
- `null` or absent = not highlighted
- CRDT merge behaviour: last-write-wins (LWW), same as all other string inline attributes in `AffineTextAttributes` (e.g. `color`, `background`)

### New attribute: `comment`

```typescript
// Addition to AffineTextAttributes
comment?: true | null;  // Obsidian %% comment %%
```

**Notes**:

- Comment text is preserved in the CRDT tree; only hidden in live preview rendering
- No colour or additional metadata; purely a visibility flag
- `null` or absent = normal (visible) text
- CRDT merge behaviour: last-write-wins (LWW), same as all other boolean-ish inline attributes in `AffineTextAttributes` (e.g. `bold`, `italic`)

---

## 2. Wikilink Inline Node

Wikilinks reuse the existing **reference inline** (`blocksuite/affine/inlines/reference/`) rather than introducing a new schema type.

**Existing reference delta schema** (no change required):

```typescript
{
  insert: string;           // display text (page title or alias)
  attributes: {
    reference: {
      type: 'LinkedPage';
      pageId: string;       // resolved workspace page ID (empty string = unresolved)
      title?: string;       // original wikilink target title, used for resolution
      params?: {
        mode?: 'page' | 'edgeless';
        blockIds?: string[];
        elementIds?: string[];
      };
    }
  }
}
```

**Wikilink resolution lifecycle**:

```
Input: [[Page Name]]
  → Parser creates reference delta with { title: 'Page Name', pageId: '' }
  → Resolution service queries workspace index by title
  → If found: updates pageId, marks as resolved
  → If not found: renders in unresolved style
  → On click (unresolved): creates new page with title, updates pageId
```

**Wikilink variants handled**:

| Syntax                    | Title       | Alias   | Block ref        |
| ------------------------- | ----------- | ------- | ---------------- |
| `[[Page Name]]`           | `Page Name` | —       | —                |
| `[[Page Name\|Alias]]`    | `Page Name` | `Alias` | —                |
| `[[Page Name#Heading]]`   | `Page Name` | —       | heading anchor   |
| `[[Page Name#^block-id]]` | `Page Name` | —       | block `block-id` |

---

## 3. Callout Block Schema Extension

**Existing schema**: `blocksuite/affine/model/src/blocks/callout/callout-model.ts`

**Addition**: `calloutType` property

```typescript
export type CalloutProps = {
  icon?: IconData;
  text: Text;
  backgroundColorName?: string;
  calloutType?: CalloutType; // NEW
  foldable?: boolean; // NEW
  folded?: boolean; // NEW
  'meta:createdAt': number | undefined;
  'meta:updatedAt': number | undefined;
  'meta:createdBy': string | undefined;
  'meta:updatedBy': string | undefined;
};

export type CalloutType = 'note' | 'info' | 'todo' | 'tip' | 'hint' | 'important' | 'success' | 'check' | 'done' | 'question' | 'help' | 'faq' | 'warning' | 'caution' | 'attention' | 'failure' | 'fail' | 'missing' | 'danger' | 'error' | 'bug' | 'example' | 'quote' | 'cite' | 'abstract' | 'summary' | 'tldr';
```

**Default values for existing blocks** (backwards compatibility):

- `calloutType`: `null` (absent) → renderer uses "note" config (existing appearance preserved)
- `foldable`: `false` (absent) → callout is not foldable (existing appearance preserved)
- `folded`: `false` (absent) → callout is expanded (existing appearance preserved)
- No schema migration required; the block model reads missing props with the above defaults.

**State transitions for foldable callouts**:

```
folded: false (default when foldable: true, suffix '+')
folded: true  (default when foldable: true, suffix '-')

User click on header → toggle folded value (CRDT merge = last-write-wins / LWW-register)
```

**Callout type → preset mapping** (stored in a config, not in schema):

| Type aliases                      | Icon           | Colour token          |
| --------------------------------- | -------------- | --------------------- |
| `note`                            | info circle    | `--affine-tag-blue`   |
| `info`, `todo`                    | info circle    | `--affine-tag-blue`   |
| `tip`, `hint`, `important`        | lightbulb      | `--affine-tag-green`  |
| `success`, `check`, `done`        | check circle   | `--affine-tag-green`  |
| `question`, `help`, `faq`         | help circle    | `--affine-tag-yellow` |
| `warning`, `caution`, `attention` | alert triangle | `--affine-tag-orange` |
| `failure`, `fail`, `missing`      | x circle       | `--affine-tag-red`    |
| `danger`, `error`                 | alert octagon  | `--affine-tag-red`    |
| `bug`                             | bug            | `--affine-tag-red`    |
| `example`                         | list           | `--affine-tag-purple` |
| `quote`, `cite`                   | quote          | `--affine-tag-grey`   |
| `abstract`, `summary`, `tldr`     | file text      | `--affine-tag-grey`   |

---

## 4. Tag Inline Node

**New schema type**: `AffineTagDelta`

```typescript
// New inline delta for Obsidian-style tags
{
  insert: '#tag-name'; // raw tag text including # prefix (canonical lowercased form)
  attributes: {
    tag: {
      name: string; // canonical tag name without #, lowercased, e.g. 'inbox/to-read'
    }
  }
}
```

**Tag format rules** (validation on input):

- Characters: `[a-zA-Z0-9_\-/]`
- Must contain at least one non-digit character
- No spaces; forward slash (`/`) for nested tags
- Stored as canonical lowercase; displayed with original casing

**Tag entity** (in-memory, not persisted separately):

```typescript
interface TagIndex {
  name: string; // canonical lowercase name
  documentIds: string[]; // docs containing this tag (derived from search, not stored)
}
```

No separate tag index is stored — tags are discovered via workspace search.

---

## 5. Obsidian Comment Inline

See section 1 (`comment` attribute in `AffineTextAttributes`). No separate schema entity required.

---

## 6. Source Mode State

Source mode is a **UI-only state** — not persisted in the CRDT document.

```typescript
// Local React state (Jotai atom)
interface EditorModeState {
  mode: 'live-preview' | 'source';
}
```

On switching source → live-preview: the raw markdown string is parsed and used to update the block tree via the existing markdown import adapter. This is a CRDT-compatible operation (individual block mutations, not a full replace).

---

## 7. Entity Relationships

```
Document (affine:doc)
  └── Block tree (CRDT)
       ├── affine:paragraph     — text with AffineTextAttributes deltas
       │    ├── bold, italic, strike, underline, code, highlight [NEW], comment [NEW]
       │    └── inline nodes: reference, footnote, tag [NEW], latex
       ├── affine:callout       — +calloutType, +foldable, +folded [NEW fields]
       │    └── children: affine:paragraph, affine:list (nested callouts via children)
       ├── affine:code          — Shiki highlighting; mermaid/latex preview extensions
       ├── affine:latex         — KaTeX display math
       ├── affine:list          — task type with checked state
       └── affine:table         — GFM table rendering
```
