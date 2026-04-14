# @affine/server-native

Rust NAPI-RS native addon for `@affine/server`. Compiled to a `.node` binary and loaded at runtime by the NestJS server. Provides performance-critical operations that are impractical or too slow in JavaScript: Yjs doc manipulation, LLM dispatch, tokenization, image processing, hashcash PoW, HTML sanitization, and file-type detection.

## Layout

```
src/
  lib.rs           # Crate root — declares modules, sets mimalloc allocator, exports merge_updates_in_apply_way
  doc.rs           # Yjs/y-octo doc operations: parse, render, create, update, title, root-doc management
  doc_loader.rs    # Document file ingestion (parse PDFs, Office docs, etc. into chunks for indexing)
  llm.rs           # LLM dispatch: streaming + non-streaming via llm_adapter crate (HTTP protocol abstraction)
  tiktoken.rs      # Token counting via tiktoken_rs (wraps OpenAI BPE tokenizer)
  hashcash.rs      # Hashcash proof-of-work: mint and verify challenge responses (async NAPI Tasks)
  html_sanitize.rs # HTML sanitization (strips unsafe tags/attributes)
  image.rs         # Image processing: resize/compress with max-edge constraint, optional EXIF strip
  file_type.rs     # MIME type detection from raw bytes
  utils.rs         # Internal helpers
index.d.ts         # Auto-generated TypeScript type declarations (DO NOT EDIT)
index.js           # ESM wrapper that loads the .node binary
server-native.node # Pre-compiled binary (committed for local dev; CI rebuilds per platform)
Cargo.toml         # Rust crate manifest
build.rs           # Cargo build script
benchmark/         # Node.js benchmark scripts
fixtures/          # Test fixture files (sample docs, images, etc.)
```

## Exposed API (index.d.ts)

### Yjs / Doc Operations (`doc.rs`)
| Function | Purpose |
|---|---|
| `mergeUpdatesInApplyWay(updates)` | Merge multiple Yjs update binaries into one using y-octo |
| `parseDocFromBinary(docBin, docId)` | Extract blocks + title + summary from a Yjs doc binary |
| `parseDocToMarkdown(docBin, docId, aiEditable?, docUrlPrefix?)` | Convert Yjs doc to Markdown |
| `parsePageDoc(docBin, maxSummaryLength?)` | Extract title + summary from a page doc |
| `parseWorkspaceDoc(docBin)` | Extract workspace name and avatar key |
| `createDocWithMarkdown(title, markdown, docId)` | Create a new Yjs doc binary from Markdown |
| `updateDocWithMarkdown(existingBinary, newMarkdown, docId)` | Apply Markdown diff to an existing doc (returns delta) |
| `updateDocTitle(existingBinary, title, docId)` | Update only the title field (returns delta) |
| `updateDocProperties(existingBinary, propertiesDocId, targetDocId, createdBy?, updatedBy?)` | Update docProperties record |
| `addDocToRootDoc(rootDocBin, docId, title?)` | Register a doc in workspace root doc's `meta.pages` |
| `updateRootDocMetaTitle(rootDocBin, docId, title)` | Update a doc's title entry in root doc meta |
| `buildPublicRootDoc(rootDocBin, docMetas)` | Build a public-facing root doc with filtered metadata |
| `readAllDocIdsFromRootDoc(docBin, includeTrash?)` | List all doc IDs from root doc |

### Document File Loading (`doc_loader.rs`)
| Function | Purpose |
|---|---|
| `parseDoc(filePath, doc)` | Parse a file buffer into named chunks for indexer |

### LLM Dispatch (`llm.rs`)
| Function | Purpose |
|---|---|
| `llmDispatch(protocol, backendConfigJson, requestJson)` | Single-shot LLM request → JSON response |
| `llmDispatchStream(protocol, backendConfigJson, requestJson, callback)` | Streaming LLM via threadsafe callback; returns `LlmStreamHandle` |
| `llmEmbeddingDispatch(...)` | Embedding request |
| `llmRerankDispatch(...)` | Rerank request |
| `llmStructuredDispatch(...)` | Structured output request |

### Tokenizer (`tiktoken.rs`)
| Function / Class | Purpose |
|---|---|
| `fromModelName(modelName)` | Create a `Tokenizer` for a given model (e.g. `gpt-4o`, `gpt-5`) |
| `Tokenizer.count(content, allowedSpecial?)` | Count tokens in a string |

### Hashcash (`hashcash.rs`)
| Function | Purpose |
|---|---|
| `mintChallengeResponse(resource, bits?)` | Mint a hashcash stamp (async, runs on thread pool) |
| `verifyChallengeResponse(response, bits, resource)` | Verify a hashcash stamp (async, runs on thread pool) |

### Utilities
| Function | Purpose |
|---|---|
| `processImage(input, maxEdge, keepExif)` | Resize/compress image buffer |
| `getMime(input)` | Detect MIME type from raw bytes |
| `htmlSanitize(input)` | Strip unsafe HTML |

### Constants
| Constant | Purpose |
|---|---|
| `AFFINE_PRO_PUBLIC_KEY` | Injected at compile time from env — used for license verification |
| `AFFINE_PRO_LICENSE_AES_KEY` | Injected at compile time from env — used for license decryption |

## Key Dependencies

| Crate | Purpose |
|---|---|
| `napi` / `napi-derive` | NAPI-RS bindings for Node.js |
| `y-octo` | Rust Yjs-compatible CRDT engine (workspace sibling) |
| `affine_common` | Shared doc parser, hashcash, napi utilities (workspace crate) |
| `llm_adapter` | HTTP LLM backend abstraction with middleware pipeline |
| `tiktoken_rs` | OpenAI BPE tokenizer |
| `mimalloc` | High-performance allocator (non-ARM targets) |

## Build

```bash
# Debug build (leaves .node in place for dev)
yarn build:debug

# Release build (stripped, no debug symbols)
yarn build

# Run Rust unit tests
cargo test

# Run Node.js benchmark
yarn bench

# Run Node.js integration tests
yarn test
```

The `napi build` command (from `@napi-rs/cli`) compiles the crate and generates `index.d.ts` and `index.js` automatically. Do not edit these generated files.

## Cross-Platform Targets

Built for 6 targets in CI:

| Target | Platform |
|---|---|
| `aarch64-apple-darwin` | Apple Silicon macOS |
| `x86_64-apple-darwin` | Intel macOS |
| `aarch64-unknown-linux-gnu` | ARM64 Linux |
| `x86_64-unknown-linux-gnu` | x86_64 Linux |
| `aarch64-pc-windows-msvc` | ARM64 Windows |
| `x86_64-pc-windows-msvc` | x86_64 Windows |

## Conventions

- All public functions exposed to Node.js are annotated with `#[napi]` or `#[napi(object)]`.
- Async CPU-bound work uses `AsyncTask` — never block the Node.js event loop in a sync NAPI call.
- Streaming uses `ThreadsafeFunction` to call back into JS from Rust threads.
- `LlmStreamHandle` exposes an `.abort()` method to cancel in-flight streams.
- Compile-time secrets (`AFFINE_PRO_PUBLIC_KEY`, `AFFINE_PRO_LICENSE_AES_KEY`) are injected via `std::option_env!` — set as env vars during the CI release build.
- The pre-compiled `server-native.node` is committed so local `yarn dev` works without a Rust toolchain. Rebuild only when changing Rust source.
