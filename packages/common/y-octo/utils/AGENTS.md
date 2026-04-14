# y-octo-utils

Development utilities for the `y-octo` CRDT library: binary compatibility tests, operation generators for fuzzing/property testing, CLI tools for merging Yjs update binaries, and LibFuzzer fuzz targets.

## Layout

```
src/
  lib.rs                         # Module exports (doc, codec)
  doc.rs                         # yrs ↔ y-octo binary compatibility tests
  codec.rs                       # Encoding/decoding round-trip tests
  doc_operation/                 # Operation type system for fuzzing
    mod.rs                       # OpsRegistry + generators
    types.rs                     # OpType, NestDataOpType, CRDTNestType, etc.
    yrs_op/                      # yrs-backed operation generators
      mod.rs                     # OpsRegistry, random generators
      array.rs                   # Array insert/delete/clear ops
      map.rs                     # Map insert/delete/clear ops
      text.rs                    # Text insert/delete/clear ops
      xml_element.rs             # XMLElement ops
      xml_fragment.rs            # XMLFragment ops
      xml_text.rs                # XMLText ops
bin/
  doc_merger.rs                  # CLI: merge Yjs update binaries
  bench_result_render.rs         # CLI: format Criterion benchmark output
  memory_leak_test.rs            # Memory leak detection harness
fuzz/
  Cargo.toml
  fuzz_targets/
    decode_bytes.rs
    codec_doc_any.rs
    codec_doc_any_struct.rs
    sync_message.rs
    apply_update.rs
    ins_del_text.rs
    i32_encode.rs  / i32_decode.rs
    u64_encode.rs  / u64_decode.rs
```

---

## Feature flags

| Feature | Default | Enables |
|---|---|---|
| `merger` | yes | `doc_merger` binary (depends on `clap`, enables `y-octo/large_refs`) |
| `fuzz` | no | LibFuzzer fuzz targets (`arbitrary`, `phf`) |
| `bench` | no | Benchmark helpers (`regex`) |

---

## `doc_operation/` — Operation type system

Used to generate random sequences of CRDT operations for property-based and fuzz testing.

### Types (`types.rs`)

```rust
// Top-level operation categories
enum OpType {
    HandleCurrent,         // operate on an existing CRDT type
    CreateCRDTNestType,    // create a new nested CRDT type
}

// Operations on a CRDT container
enum NestDataOpType {
    Insert,
    Delete,
    Clear,
}

// Which CRDT type to create/operate on
enum CRDTNestType {
    Array, Map, Text,
    XMLElement, XMLFragment, XMLText,
}

// Where to find the target type
enum ManipulateSource {
    NewNestTypeFromYDocRoot,   // create under doc root
    CurrentNestType,           // use an existing type
    NewNestTypeFromCurrent,    // nest inside current type
}

// Insert position
enum InsertPos { BEGIN, MID, END }
```

### `OpsRegistry` and generators (`yrs_op/mod.rs`)

```rust
// Registry maps CRDT type variants to their available operations
let registry = OpsRegistry::new();

// Generate a new CRDT type from the doc root (using yrs for reference impl)
let nest_type: YrsNestType = yrs_create_nest_type_from_root(&mut txn, &doc, ctype)?;

// Generate random position (0 = begin, 1 = mid, 2 = end)
let pos = random_pick_num(len);
```

Each file under `yrs_op/` (`array.rs`, `map.rs`, `text.rs`, etc.) implements insert/delete/clear operations on the corresponding yrs type. These are used to construct randomized operation sequences that are then replayed on y-octo to verify equivalence.

---

## Binary compatibility tests (`doc.rs`, `codec.rs`)

```rust
// Encode a document with yrs, decode with y-octo, re-encode and compare
#[test]
fn test_basic_yrs_binary_compatibility() {
    // 1. Build a doc in yrs (Rust Yjs impl)
    // 2. Encode as Yjs v1 binary
    // 3. Decode with y-octo's Update::decode_v1()
    // 4. Apply to a y-octo Doc
    // 5. Re-encode and assert bit-for-bit equality
}
```

---

## `doc_merger` binary

CLI tool for merging and inspecting Yjs update binaries. Useful for debugging production docs, compacting stored updates, and verifying codec consistency.

```bash
# Merge all .ybinary files in a directory into one optimized document
cargo run --bin doc_merger -- --path ./updates/

# Or merge a single file
cargo run --bin doc_merger -- --path ./doc.ybinary
```

Internally:
1. `load_path(path)` — reads a file or all files in a directory
2. Applies each update to a `Doc` sequentially
3. Calls `doc.history().parse_store()` to inspect the final state
4. Calls `doc.gc()` to garbage-collect deleted items
5. Re-encodes and verifies the result is stable (encode → decode → encode produces identical output)

---

## Fuzz targets (`fuzz/`)

LibFuzzer targets cover the full codec pipeline:

| Target | Tests |
|---|---|
| `decode_bytes` | Raw byte decoding doesn't panic or corrupt memory |
| `codec_doc_any` | `Any` encode/decode round-trip |
| `codec_doc_any_struct` | Structured `Any` round-trip |
| `sync_message` | `SyncMessage` decode doesn't panic on arbitrary input |
| `apply_update` | `doc.apply_update()` with arbitrary bytes |
| `ins_del_text` | Text insert + delete sequences |
| `i32_encode/decode` | varint i32 round-trip |
| `u64_encode/decode` | varint u64 round-trip |

```bash
# Run a specific fuzz target (requires nightly)
cargo +nightly fuzz run apply_update
```

---

## `memory_leak_test` binary

Allocates and frees large numbers of CRDT documents while monitoring resident memory. Used in CI to catch reference-counting bugs.

```bash
cargo run --bin memory_leak_test
```

---

## Run all utils tests

```bash
cargo test -p y-octo-utils --all-features
```
