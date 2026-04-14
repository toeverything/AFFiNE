# @affine/reader

Reads AFFiNE Yjs documents and extracts structured metadata (title, summary, block list) and Markdown. Used by the server's indexer pipeline and the AI copilot.

## Layout

```
src/
  reader.ts          # Main public functions: readAllBlocksFromDoc, readAllDocsFromRootDoc, readAllDocIdsFromRootDoc
  bs-store.ts        # BlockSuite store management (constructs YDoc store context)
  index.ts           # Re-exports
  doc-parser/        # Block-level parsing utilities
    types.ts         # All type definitions: Flavour, ParsedBlock variants, ParserContext
    parser.ts        # parseBlock(), parseBlockToMd(), parsePageDoc()
    delta-to-md/     # Delta (Yjs text) → Markdown conversion
      index.ts
      delta-to-md.ts
      delta-converters.ts
      utils/
        node.ts
        url.ts
```

---

## Public API

### `readAllBlocksFromDoc(options)`

Traverses a Yjs document and returns all blocks with content, references, and a generated summary.

```typescript
async function readAllBlocksFromDoc(options: {
  ydoc: YDoc
  rootYDoc?: YDoc
  spaceId: string
  maxSummaryLength?: number
}): Promise<
  | {
      blocks: BlockDocumentInfo[]
      title: string
      summary: string
    }
  | undefined
>
```

Returns `undefined` if the doc has no root structure (not a page doc).

### `readAllDocsFromRootDoc(rootDoc, options?)`

Lists all docs in a workspace's root doc (the `meta.pages` Yjs map).

```typescript
function readAllDocsFromRootDoc(
  rootDoc: YDoc,
  options?: { includeTrash?: boolean }
): Map<string, { title: string | undefined }>
// key = docId, value = { title }
```

### `readAllDocIdsFromRootDoc(rootDoc, options?)`

```typescript
function readAllDocIdsFromRootDoc(
  rootDoc: YDoc,
  options?: { includeTrash?: boolean }
): string[]
```

---

## `BlockDocumentInfo`

The primary output type. One entry per block in the document.

```typescript
interface BlockDocumentInfo {
  docId: string
  blockId: string
  content?: string | string[]       // text content (paragraph, heading, etc.)
  flavour: string                   // e.g. 'affine:paragraph', 'affine:image'
  blob?: string[]                   // blob IDs referenced by this block
  refDocId?: string[]               // linked doc IDs
  ref?: string[]                    // other references
  parentFlavour?: string
  parentBlockId?: string
  additional?: {
    databaseName?: string
    displayMode?: string
    noteBlockId?: string
  }
  yblock: YMap<any>                 // raw Yjs block map (for advanced consumers)
  markdownPreview?: string          // trimmed markdown preview of referenced doc
}
```

---

## `doc-parser` — Block-level parsing

### Block flavours

The parser handles 14+ BlockSuite flavours:

```typescript
type Flavour = BaseFlavour<
  | 'page' | 'frame' | 'paragraph' | 'code' | 'note' | 'list'
  | 'divider' | 'embed' | 'image' | 'surface' | 'database' | 'table'
  | 'attachment' | 'bookmark' | 'embed-youtube'
  | 'embed-linked-doc' | 'embed-synced-doc'
>
```

### Parsed block types

Each flavour maps to a typed struct:

| Type | Flavour | Extra fields |
|---|---|---|
| `ParagraphBlock` | `affine:paragraph` | `type: 'h1'…'h6' \| 'quote'` |
| `ListBlock` | `affine:list` | `type: 'bulleted' \| 'numbered'` |
| `CodeBlock` | `affine:code` | `language: string` |
| `ImageBlock` | `affine:image` | `sourceId`, `blobUrl`, `width`, `height`, `caption` |
| `AttachmentBlock` | `affine:attachment` | `type`, `sourceId` |
| `DatabaseBlock` | `affine:database` | `title`, `rows: Record<string, string>[]` |
| `TableBlock` | `affine:table` | `rows: string[][]`, `columns: string[]` |

### `ParserContext`

Required when parsing with URL resolution:

```typescript
interface ParserContext {
  workspaceId: string
  doc: YDoc
  buildBlobUrl: (blobId: string) => string
  buildDocUrl: (docId: string) => string
  renderDocTitle?: (docId: string) => string
  aiEditable?: boolean
}
```

### Parser functions

```typescript
// Parse a single Yjs block into a typed ParsedBlock
function parseBlock(
  context: ParserContext,
  yBlock: YBlock | undefined,
  yBlocks: YBlocks,
  aiEditable?: boolean,
  blockLevel?: number
): ParsedBlock | null

// Render a ParsedBlock to Markdown string
function parseBlockToMd(block: BaseParsedBlock, padding?: string): string

// Parse an entire page doc into title + markdown
function parsePageDoc(/* context + doc */): ParsedDoc
```

---

## Delta → Markdown conversion

`delta-to-md/` converts Yjs `YText` deltas (inline formatting ops) to Markdown strings.

- Handles bold, italic, underline, strikethrough, code, links
- Handles inline references to other docs
- Used by `parseBlock` for text-bearing blocks

---

## Dependencies

- `@blocksuite/store` — peer dep for `YDoc`, `YMap`, `YText` types and BlockSuite store context
- `@blocksuite/affine-model` — block schema types

This package has a compiled dist bundle (`dist/`). Run `yarn build` from the monorepo root to rebuild it.

---

## Usage in the server indexer

```typescript
import { readAllBlocksFromDoc, readAllDocIdsFromRootDoc } from '@affine/reader'

// 1. Get all doc IDs from workspace root doc
const docIds = readAllDocIdsFromRootDoc(rootYDoc)

// 2. For each doc, extract blocks for indexing
const result = await readAllBlocksFromDoc({
  ydoc: docYDoc,
  rootYDoc,
  spaceId: workspaceId,
  maxSummaryLength: 500,
})

if (result) {
  const { blocks, title, summary } = result
  // Feed blocks to the indexer
}
```
