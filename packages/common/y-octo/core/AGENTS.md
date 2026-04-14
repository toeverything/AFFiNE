# y-octo (core)

Rust CRDT library. Implements the Yjs data model and binary protocol. All public types are `Send + Sync`.

## Layout

```
src/
  lib.rs                   # Public API re-exports
  sync.rs                  # Thread primitives (Arc, RwLock; Loom under cfg(loom))
  codec/                   # Low-level variable-length encoding
    buffer.rs              # Buffer read/write
    integer.rs             # varint (u64, i32, uvar, ivar)
    string.rs              # length-prefixed UTF-8 strings
  protocol/                # High-level sync protocol messages
    sync.rs                # SyncMessage enum
    doc.rs                 # DocMessage variants
    awareness.rs           # AwarenessStates, AwarenessState
    scanner.rs             # Message-type scanner (peek without full decode)
  doc/                     # Core CRDT engine
    document.rs            # Doc — main entry point
    store.rs               # DocStore — internal state (items, types, GC)
    batch.rs               # Batch — transaction grouping
    history.rs             # History / change tracking
    awareness.rs           # Awareness — presence metadata
    hasher.rs              # ClientMap (AHashMap wrapper)
    publisher.rs           # Event publisher (feature: events)
    utils.rs               # Internal helpers
    common/
      state.rs             # StateVector
      somr.rs              # Somr<T> — smart option reference
      range.rs             # Range structs
    types/
      mod.rs               # YType, YTypeRef, YTypeBuilder, Value
      text.rs              # Text
      array.rs             # Array
      map.rs               # Map
      xml.rs               # XMLElement, XMLFragment, XMLText, XMLHook
      value.rs             # Value enum
      list/                # Shared ListType trait (Text + Array share it)
    codec/
      any.rs               # Any enum (all primitive/compound value types)
      id.rs                # Id = (Client, Clock)
      item.rs              # Item — core CRDT operation unit
      content.rs           # Content enum (what an item carries)
      update.rs            # Update — a set of items
      delete_set.rs        # DeleteSet — tombstone records
      io/
        codec_v1.rs        # Yjs v1 codec (encode + decode)
        reader.rs          # RawDecoder
        writer.rs          # RawEncoder
```

---

## `Doc`

The primary entry point.

```rust
use y_octo::Doc;

let doc = Doc::default();               // new document with random client ID
let doc = Doc::with_options(DocOptions { client_id: Some(42), ..Default::default() });

// Create / retrieve collaborative types (by name)
let text  = doc.get_or_create_text("content")?;
let array = doc.get_or_create_array("list")?;
let map   = doc.get_or_create_map("meta")?;

// Apply a remote update
doc.apply_update(update)?;

// Encode full state
let bytes: Vec<u8> = doc.encode_update_v1()?;

// Encode only the diff since a given StateVector
let bytes: Vec<u8> = doc.encode_state_as_update_v1(&state_vector)?;

// Get the current StateVector
let sv: StateVector = doc.get_state_vector();
```

---

## Collaborative types

### `Text`

```rust
let text = doc.get_or_create_text("body")?;

text.insert(0, "Hello")?;
text.insert(5, ", world")?;
text.remove(5, 7)?;

// Attributes (rich text formatting)
let attrs = TextAttributes::from([("bold", Any::True)]);
text.insert_with_attributes(0, "AFFiNE", attrs)?;

// Delta format (Yjs-compatible)
let delta: TextDelta = text.to_delta();        // Vec<TextDeltaOp>
text.apply_delta(delta)?;
```

`TextDeltaOp` variants: `Insert { value, attributes? }`, `Retain { len, attributes? }`, `Delete { len }`.

### `Array`

```rust
let arr = doc.get_or_create_array("items")?;

arr.insert(0, Any::String("first".into()))?;
arr.push(Any::Integer(42))?;
arr.remove(0, 1)?;

// Iterate
for value in arr.iter() { /* Value */ }
println!("{}", arr.len());
```

### `Map`

```rust
let map = doc.get_or_create_map("props")?;

map.insert("key", Any::String("value".into()))?;
let v: Option<Value> = map.get("key");
map.remove("key")?;

for (k, v) in map.iter() { /* &str, Value */ }
map.keys()   // Iterator<Item = &str>
map.values() // Iterator<Item = Value>
```

### XML (partial — 🚧)

`XMLElement`, `XMLFragment`, `XMLText`, `XMLHook` are implemented but not all operations are stable. Use for BlockSuite's XML block types only.

---

## `Value` and `Any`

`Value` is the runtime type for things stored in an Array or Map:

```rust
pub enum Value {
    Any(Any),
    Text(Text),
    Array(Array),
    Map(Map),
    XMLElement(XMLElement),
    XMLFragment(XMLFragment),
    XMLText(XMLText),
}

pub enum Any {
    Undefined, Null, True, False,
    Integer(i64), Float32(f32), Float64(f64), BigInt64(i64),
    String(SmolStr),
    Object(HashMap<String, Any>),
    Array(Vec<Any>),
    Binary(Vec<u8>),
}
```

---

## `StateVector`

Tracks the latest known clock for each client:

```rust
pub type StateVector = ClientMap<Clock>;  // HashMap<Client, Clock>

// Build from existing doc
let sv = doc.get_state_vector();

// Use to request only missing updates from a peer
let diff = peer_doc.encode_state_as_update_v1(&sv)?;
doc.apply_update(Update::decode_v1(&diff)?)?;
```

---

## `Update`

```rust
// Decode an incoming binary update
let update = Update::decode_v1(&bytes)?;

// Apply it
doc.apply_update(update)?;

// Merge multiple updates into one
let merged: Vec<u8> = merge_updates_v1(&[bytes1, bytes2, bytes3])?;
```

---

## Sync protocol

```rust
use y_octo::{SyncMessage, DocMessage, read_sync_message, write_sync_message,
             encode_update_as_message, encode_awareness_as_message};

// Decode an incoming protocol message
let msg: SyncMessage = read_sync_message(&mut reader)?;

match msg {
    SyncMessage::Doc(DocMessage::Update(update)) => { doc.apply_update(update)?; }
    SyncMessage::Awareness(states) => { /* update presence */ }
    SyncMessage::Auth(token) => { /* check permission */ }
    _ => {}
}

// Encode an outgoing update
let bytes = encode_update_as_message(&update_bytes)?;

// Encode awareness state
let bytes = encode_awareness_as_message(&awareness_states)?;
```

`DocMessage` variants: `SyncStep1(StateVector)`, `SyncStep2(Update)`, `Update(Update)`.

---

## Batching

Group multiple operations into a single CRDT transaction (produces one update instead of N):

```rust
use y_octo::batch_commit;

batch_commit(&doc, |doc| {
    let text = doc.get_or_create_text("body")?;
    text.insert(0, "line 1")?;
    text.insert(6, "\nline 2")?;
    Ok(())
})?;
```

---

## Events (feature: `events`)

```rust
// Subscribe to document changes
let _guard = doc.subscribe(|event| {
    // event contains changed items
});
// _guard must be held; dropping it unsubscribes
```

---

## Feature flags

| Feature | Enables |
|---|---|
| `events` | `subscribe()` on Doc |
| `debug` | Debug output + assertions |
| `subscribe` | Subscription infrastructure |
| `bench` | Benchmark helpers |
| `large_refs` | Support for very large reference counts |
| `serde_json` | `Any` ↔ `serde_json::Value` conversion |

---

## Codec internals

The codec layer (`doc/codec/`) implements Yjs v1 binary format:

- **Id** = `(client: u64, clock: u64)` — globally unique operation identifier
- **Item** — one CRDT operation unit (id, content, origin left/right, parent info)
- **Content** — what an item carries: `Any`, `String`, `Binary`, `Type`, `Deleted`, `Doc`, `JSON`, `Format`, `Embed`, `Move`
- **Update** — a sorted collection of items + a `DeleteSet`
- **DeleteSet** — map of `{ client → [(clock_start, len)] }` for tombstoned items

All integers use variable-length encoding (varint). String encoding is length-prefixed UTF-8.

---

## Error type

```rust
pub type JwstCodecResult<T> = Result<T, JwstCodecError>;
```

`JwstCodecError` covers: `IncompleteDocument`, `InvalidData`, `TypeCastError`, `UpdateInvalidParent`, `UpdateOutOfOrder`, and others.

---

## Tests & quality

- Unit tests in every module
- `cfg(loom)` concurrency model tests
- Miri UB detection: `cargo +nightly miri test`
- ASAN: `RUSTFLAGS="-Z sanitizer=address" cargo test`
- Property tests with `proptest`
- Benchmarks: `cargo bench -p y-octo`
