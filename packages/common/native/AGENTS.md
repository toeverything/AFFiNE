# affine_common (packages/common/native)

Pure Rust library crate (`affine_common`) that provides the performance-critical logic shared by both the **server-side NAPI addon** (`@affine/server-native`) and the **desktop NAPI addon** (`@affine/native`). It is never compiled to JavaScript directly — it is always consumed as a Rust dependency by the NAPI crates.

## Layout

```
src/
  lib.rs           # Crate root — declares feature-gated modules
  doc_parser/      # Read + write Yjs/BlockSuite documents (feature: ydoc-loader)
    mod.rs         # Public re-exports: parse_*, add_doc_*, update_*, build_*
    read/          # Parsing: doc binary → BlockInfo / Markdown / title+summary
      mod.rs
      database.rs  # Database block rendering (table markdown)
    write/         # Mutation: produce Yjs update binaries
      builder.rs
      create.rs    # build_full_doc — create a doc from scratch
      update.rs    # update_doc — apply markdown diff
      doc_meta.rs  # update_doc_title, update_root_doc_meta_title
      doc_properties.rs # update_doc_properties
      root_doc.rs  # add_doc_to_root_doc, build_public_root_doc
    block_spec.rs  # BlockFlavour, BlockSpec, ImageSpec type definitions
    blocksuite.rs  # Low-level Yjs map traversal helpers
    doc_loader.rs  # load_doc / load_doc_or_new — deserialise Yjs binary
    markdown/      # Delta-to-Markdown renderer
    schema.rs      # NOTE_FLAVOUR, PAGE_FLAVOUR, PROP_TITLE constants
    table.rs       # Table rendering helpers
    value.rs       # any_as_string, any_truthy, value_to_string helpers
    error.rs       # ParseError
    roundtrip_tests.rs # Integration tests (read → write → read)
  doc_loader/      # File ingestion: parse external files into indexable chunks (feature: doc-loader)
    mod.rs         # Public re-exports: Doc, Chunk, LoaderError, LoaderResult
    document.rs    # Doc + Chunk types
    types.rs       # Internal Document type
    error.rs       # LoaderError, LoaderResult
    loader/        # Per-format loaders
      mod.rs       # Loader trait, get_language_by_filename
      docx.rs      # DocxLoader
      html.rs      # HtmlLoader (readability-based)
      pdf.rs       # PdfExtractLoader
      text.rs      # TextLoader
      source/      # SourceCodeLoader (tree-sitter, 10+ languages)
        mod.rs
        parser.rs
    splitter/      # Text chunking for indexing
      MarkdownSplitter, TextSplitter, TokenSplitter (tiktoken-rs)
  hashcash.rs      # Stamp — hashcash PoW mint + verify (feature: hashcash)
  napi_utils.rs    # map_napi_err, to_napi_error NAPI helpers (feature: napi)
benches/
  hashcash.rs      # Criterion benchmark for hashcash
fixtures/          # Test data: demo.docx, demo.ydoc, sample.pdf, sample.c, etc.
```

---

## Feature flags

All modules are feature-gated. Downstream NAPI crates enable the features they need:

| Feature | Enables | Used by |
|---|---|---|
| `ydoc-loader` | `doc_parser` module | `@affine/server-native`, `@affine/native` |
| `doc-loader` | `doc_loader` module | `@affine/server-native` (indexer) |
| `hashcash` | `hashcash` module | `@affine/server-native` |
| `napi` | `napi_utils` module | Both NAPI crates |
| `tree-sitter` | Source code parsing (sub-feature of `doc-loader`) | `@affine/server-native` |

---

## `doc_parser` — Yjs document read/write

Operates on y-octo (`yjs`-compatible) document binaries. All public functions accept `&[u8]` binary blobs and return either parsed data or a new Yjs update binary.

### Read functions

| Function | Input | Output | Description |
|---|---|---|---|
| `parse_doc_from_binary(bin, doc_id)` | doc binary | `CrawlResult` | Extract all blocks, title, summary |
| `parse_doc_to_markdown(bin, doc_id, ai_editable?, url_prefix?)` | doc binary | `MarkdownResult` | Convert doc to Markdown |
| `parse_page_doc(bin, max_summary_len?)` | doc binary | `Option<PageDocContent>` | Title + summary for a page doc |
| `parse_workspace_doc(bin)` | doc binary | `Option<WorkspaceDocContent>` | Workspace name + avatar key |
| `get_doc_ids_from_binary(bin, include_trash?)` | root doc binary | `Vec<String>` | All doc IDs in the workspace |

**Return types:**
- `CrawlResult { blocks: Vec<BlockInfo>, title: String, summary: String }`
- `BlockInfo { block_id, flavour, content?, blob?, ref_doc_id?, ref_info?, parent_flavour?, parent_block_id?, additional? }`
- `MarkdownResult { title, markdown, known_unsupported_blocks, unknown_blocks }`
- `PageDocContent { title, summary }`
- `WorkspaceDocContent { name, avatar_key }`

### Write functions (return Yjs update binaries)

| Function | Description |
|---|---|
| `build_full_doc(title, markdown, doc_id)` | Create a brand-new doc binary from Markdown |
| `update_doc(existing_bin, new_markdown, doc_id)` | Apply a Markdown diff (structural block-level replace) → delta binary |
| `update_doc_title(existing_bin, title, doc_id)` | Update title only → delta binary |
| `update_doc_properties(existing_bin, properties_doc_id, target_doc_id, created_by?, updated_by?)` | Update docProperties record → delta binary |
| `add_doc_to_root_doc(root_doc_bin, doc_id, title?)` | Register a doc in `meta.pages` → delta binary |
| `update_root_doc_meta_title(root_doc_bin, doc_id, title)` | Update title entry in root doc meta → delta binary |
| `build_public_root_doc(root_doc_bin, doc_metas)` | Build a filtered public root doc → full binary |

All "delta" functions return only the changed Yjs update, not the full document — callers apply the update with `Y.applyUpdate`.

### Key internal types

- `BlockFlavour` — enum of known BlockSuite block types (`affine:paragraph`, `affine:image`, `affine:database`, etc.)
- `BlockSpec` — a parsed block's structure
- `ParseError` — error enum for parse failures

---

## `doc_loader` — File ingestion for indexing

Parses external files into `Chunk`s suitable for vector/full-text indexing. Used by the server's `IndexerModule`.

### Public types

```rust
pub struct Doc {
  pub name: String,
  pub chunks: Vec<Chunk>,
}

pub struct Chunk {
  pub index: usize,
  pub content: String,
}
```

### Loaders

| Loader | File types | Splitting |
|---|---|---|
| `PdfExtractLoader` | `.pdf` | `TextSplitter` / `TokenSplitter` |
| `DocxLoader` | `.docx` | `MarkdownSplitter` |
| `HtmlLoader` | `.html`, `.htm` | `TextSplitter` (readability extraction) |
| `TextLoader` | `.txt`, `.md`, plain text | `TextSplitter` / `MarkdownSplitter` |
| `SourceCodeLoader` | `.rs`, `.ts`, `.js`, `.py`, `.go`, `.java`, `.c`, `.cpp`, `.cs`, `.kt`, `.scala` | `TokenSplitter` (tree-sitter AST-aware) |

The loader is selected automatically by file extension via `get_language_by_filename`.

### Splitters

| Splitter | Strategy |
|---|---|
| `MarkdownSplitter` | Splits on Markdown headings and paragraphs |
| `TextSplitter` | Splits on sentence/paragraph boundaries |
| `TokenSplitter` | Splits by token count using `tiktoken-rs` |

---

## `hashcash` — Proof-of-Work

Implements the [Hashcash v1](https://en.wikipedia.org/wiki/Hashcash) stamp format using SHA3-256.

```rust
use affine_common::hashcash::Stamp;

// Mint a stamp (expensive — spends CPU)
let stamp = Stamp::mint("user@example.com".to_string(), Some(20)); // 20 bits
let token = stamp.format(); // "1:20:20240101120000:user@example.com::abc123:000001"

// Verify (fast — single hash check)
let verified = Stamp::try_from(token.as_str())
  .map(|s| s.check(20, "user@example.com"))
  .unwrap_or(false);
```

Stamps expire after **5 minutes** (checked in `check_expiration`).

---

## `napi_utils` — NAPI error helpers

Utilities for converting Rust errors into NAPI-RS `Error` types:

```rust
use affine_common::napi_utils::{map_napi_err, to_napi_error};
use napi::Status;

// Convert a Result<T, E: Display> into a napi::Result<T>
let value = map_napi_err(some_result, Status::GenericFailure)?;

// Convert an error value directly
let napi_err = to_napi_error("something failed", Status::InvalidArg);
```

---

## Build

This crate is never built standalone. It is always pulled in as a Cargo workspace dependency by the NAPI crates:

```toml
# In packages/backend/native/Cargo.toml or packages/frontend/native/Cargo.toml
[dependencies]
affine_common = { path = "../../common/native", features = ["ydoc-loader", "hashcash", "napi"] }
```

Run benchmarks:

```bash
cargo bench -p affine_common
```

Run tests (from the workspace root or this directory):

```bash
cargo test -p affine_common --all-features
```

Fixtures in `fixtures/` are used by integration tests in `roundtrip_tests.rs` and the doc_loader tests.
