//! Doc references of a block, serialized as the `v0.27.5` reader does:
//! `ref_doc_id` holds `pageId`, and `ref` holds
//! `JSON.stringify({ docId: pageId, ...params })`.

use std::collections::HashSet;
use std::io;

use sha2::{Digest, Sha256};
use y_octo::{ReadAny, ReadText, ReadTextRun, ReadValue};

/// The largest `params` part of one serialized reference. A reference with
/// larger params keeps only its `docId`.
const MAX_REF_PARAMS_BYTES: usize = 256 * 1024;
/// The bytes of all `refs` entries of one block. A reference that does not
/// fit in the bytes left keeps only its `docId`, and a reference whose
/// `docId` entry does not fit is dropped.
pub(super) const MAX_BLOCK_REFS_BYTES: usize = 16 * 1024 * 1024;
/// The most references of one block that keep only their `docId`.
const MAX_FALLBACK_REFS: usize = 4_096;
/// The most JSON bytes hashed to identify one reference that does not fit.
const MAX_IDENTITY_BYTES: usize = 4 * 1024 * 1024;
/// The most nodes and string bytes that the structural identity reads, for
/// params that are too large to hash as JSON.
const MAX_STRUCTURE_NODES: usize = 65_536;
const MAX_STRUCTURE_BYTES: usize = 16 * 1024 * 1024;
/// The deepest nesting that the structural identity reads. It matches the
/// `y-octo` decode limit, so it reads every decoded value to its leaves.
const MAX_STRUCTURE_DEPTH: usize = 128;
const MAX_PARAMS_DEPTH: usize = 16;
/// The most entries of one params object or spread. A spread with more
/// entries stops before they are collected.
const MAX_SPREAD_ENTRIES: usize = 4_096;
/// The most items of one params array.
const MAX_ARRAY_ITEMS: usize = 8_192;
const BOXED_TEXT_MARKER: &str = "$blocksuite:internal:text$";

/// The SHA-256 of a serialized reference.
type Identity = [u8; 32];

/// References in first-seen order, and `doc_ids[i]` is the doc id of
/// `refs[i]`.
///
/// The duplicate check uses the identity of the full serialized reference.
/// A reference that does not fit keeps only its `docId`, but it is still
/// checked by its full identity, so it does not merge with other
/// references to the same doc. The bytes of `refs` and `bytes_left` always
/// add up to `MAX_BLOCK_REFS_BYTES`.
pub(super) struct References {
  pub(super) doc_ids: Vec<String>,
  pub(super) refs: Vec<String>,
  seen: HashSet<Identity>,
  bytes_left: usize,
  fallbacks: usize,
}

impl Default for References {
  fn default() -> Self {
    Self {
      doc_ids: Vec::new(),
      refs: Vec::new(),
      seen: HashSet::new(),
      bytes_left: MAX_BLOCK_REFS_BYTES,
      fallbacks: 0,
    }
  }
}

impl References {
  pub(super) fn push(&mut self, doc_id: &str, params: Option<ReadValue<'_>>) {
    let serialized = serialize_reference(doc_id, params, self.entry_limit(doc_id));
    self.push_serialized(doc_id.to_owned(), serialized);
  }

  /// The longest serialized reference to `doc_id` that can be kept now.
  fn entry_limit(&self, doc_id: &str) -> usize {
    doc_id
      .len()
      .saturating_add(16)
      .saturating_add(MAX_REF_PARAMS_BYTES)
      .min(self.bytes_left)
  }

  fn push_serialized(&mut self, doc_id: String, serialized: Result<String, Oversize>) {
    match serialized {
      Ok(serialized) => {
        if self.seen.insert(Sha256::digest(serialized.as_bytes()).into()) {
          self.bytes_left = self.bytes_left.saturating_sub(serialized.len());
          self.doc_ids.push(doc_id);
          self.refs.push(serialized);
        }
      }
      Err(Oversize(identity)) => {
        let fallback = doc_id_only(&doc_id);
        if self.fallbacks < MAX_FALLBACK_REFS && fallback.len() <= self.bytes_left && self.seen.insert(identity) {
          self.bytes_left -= fallback.len();
          self.fallbacks += 1;
          self.doc_ids.push(doc_id);
          self.refs.push(fallback);
        }
      }
    }
  }

  /// Starts the references of one database cell. The cell has its own
  /// duplicate check and shares the block budget.
  fn scope(&self) -> Self {
    Self {
      bytes_left: self.bytes_left,
      fallbacks: self.fallbacks,
      ..Self::default()
    }
  }

  /// Appends the references of a cell without a shared duplicate check, as
  /// the reader concatenates database cells.
  fn append(&mut self, other: References) {
    self.doc_ids.extend(other.doc_ids);
    self.refs.extend(other.refs);
    self.bytes_left = other.bytes_left;
    self.fallbacks = other.fallbacks;
  }
}

/// Collects the `reference` attribute of each visible run, as
/// `collectInlineReferences(text.toDelta())` does. Each `reference` format
/// is parsed once, and later runs under the same format cost O(1).
pub(super) fn collect_text_references(text: ReadText<'_>, references: &mut References) {
  let mut pending: Option<(String, Result<String, Oversize>)> = None;
  for run in text.runs() {
    match run {
      ReadTextRun::Format {
        key: "reference",
        value,
      } => pending = inline_reference(ReadValue::Any(value), references),
      ReadTextRun::Format { .. } | ReadTextRun::Text("") => {}
      ReadTextRun::Text(_) | ReadTextRun::Embed(_) => {
        if let Some((doc_id, serialized)) = pending.take() {
          references.push_serialized(doc_id, serialized);
        }
      }
    }
  }
}

/// Collects references from each database cell. Each cell has its own
/// duplicate check, as `reader.ts` does.
pub(super) fn collect_cell_references<'a>(cells: impl Iterator<Item = ReadValue<'a>>, references: &mut References) {
  for value in cells {
    let mut cell = references.scope();
    collect_rich_text_references(value, &mut cell);
    references.append(cell);
  }
}

/// Reads a cell value as `getTextDeltasFromCellValue` does: a `Y.Text`, a
/// `Y.Map` boxed text with a truthy marker, or a plain object that has the
/// marker key.
fn collect_rich_text_references(value: ReadValue<'_>, references: &mut References) {
  let delta = match value {
    ReadValue::Text(text) => return collect_text_references(text, references),
    ReadValue::Map(map) if map.get(BOXED_TEXT_MARKER).is_some_and(is_truthy) => map.get("delta"),
    ReadValue::Any(any) if any.get(BOXED_TEXT_MARKER).is_some() => any.get("delta").map(ReadValue::Any),
    _ => return,
  };
  let ops: Vec<ReadValue<'_>> = match delta {
    Some(ReadValue::Array(array)) => array.iter().collect(),
    Some(ReadValue::Any(any)) => any
      .array()
      .map(|ops| ops.map(ReadValue::Any).collect())
      .unwrap_or_default(),
    _ => return,
  };
  for op in ops {
    let reference = child(op, "attributes").and_then(|attributes| child(attributes, "reference"));
    if let Some((doc_id, serialized)) = reference.and_then(|reference| inline_reference(reference, references)) {
      references.push_serialized(doc_id, serialized);
    }
  }
}

/// Parses a `{pageId, params?}` reference. The reader skips a falsy `pageId`.
fn inline_reference(reference: ReadValue<'_>, references: &References) -> Option<(String, Result<String, Oversize>)> {
  let page_id = child(reference, "pageId")?.as_any()?.as_str()?;
  if page_id.is_empty() {
    return None;
  }
  Some((
    page_id.to_owned(),
    serialize_reference(page_id, child(reference, "params"), references.entry_limit(page_id)),
  ))
}

fn child<'a>(value: ReadValue<'a>, key: &str) -> Option<ReadValue<'a>> {
  match value {
    ReadValue::Map(map) => map.get(key),
    ReadValue::Any(any) => any.get(key).map(ReadValue::Any),
    _ => None,
  }
}

/// JavaScript truthiness of a stored value.
fn is_truthy(value: ReadValue<'_>) -> bool {
  let ReadValue::Any(any) = value else {
    return true;
  };
  if any.is_undefined() || any.is_null() {
    false
  } else if let Some(value) = any.as_bool() {
    value
  } else if let Some(value) = any.as_i64() {
    value != 0
  } else if let Some(value) = any.as_f64() {
    value != 0.0 && !value.is_nan()
  } else if let Some(value) = any.as_str() {
    !value.is_empty()
  } else {
    true
  }
}

/// Serializes `JSON.stringify({ docId, ...params })` in at most `limit`
/// bytes.
///
/// The spread follows JavaScript: an object gives its own keys, a string or
/// an array gives its indices, and other values give no keys. Array index
/// keys come first in ascending order, then `docId`, then the other keys.
/// Stored objects do not keep their insertion order, so the other keys come
/// in sorted order. A reference that does not fit returns `Oversize` with
/// its identity.
fn serialize_reference(doc_id: &str, params: Option<ReadValue<'_>>, limit: usize) -> Result<String, Oversize> {
  let Ok(entries) = reference_entries(doc_id, params) else {
    return Err(Oversize(structure_identity(doc_id, params)));
  };
  let mut text = JsonWriter::new(Sink::Text(Vec::new()), limit);
  if text.spread(&entries).is_ok() {
    return Ok(text.into_string());
  }
  let mut hash = JsonWriter::new(Sink::Hash(Sha256::new()), MAX_IDENTITY_BYTES);
  let identity = match hash.spread(&entries) {
    Ok(()) => hash.into_identity(),
    Err(Limit) => structure_identity(doc_id, params),
  };
  Err(Oversize(identity))
}

/// The entries of `{ docId, ...params }` in output order.
fn reference_entries<'a>(doc_id: &str, params: Option<ReadValue<'a>>) -> Result<Vec<(String, Spread<'a>)>, Limit> {
  let mut entries = params.map_or(Ok(Vec::new()), spread_entries)?;
  entries.sort_by(|(left, _), (right, _)| js_key_order(left, right));
  // A `docId` param replaces the value but keeps the first string key slot.
  let doc_id_entry = match entries.iter().position(|(key, _)| key == "docId") {
    Some(position) => entries.remove(position),
    None => ("docId".to_owned(), Spread::String(doc_id.to_owned())),
  };
  let position = entries.partition_point(|(key, _)| array_index(key).is_some());
  entries.insert(position, doc_id_entry);
  Ok(entries)
}

fn doc_id_only(doc_id: &str) -> String {
  let mut writer = JsonWriter::new(Sink::Text(Vec::new()), usize::MAX);
  let _ = writer.spread(&[("docId".to_owned(), Spread::String(doc_id.to_owned()))]);
  writer.into_string()
}

/// One spread value: a stored value, a string, or one UTF-16 unit of a
/// spread string.
enum Spread<'a> {
  Value(ReadValue<'a>),
  String(String),
  Unit(u16),
}

/// Lists the keys that `{ ...params }` gives. It stops with `Limit` once
/// there are more than `MAX_SPREAD_ENTRIES` entries.
fn spread_entries(params: ReadValue<'_>) -> Result<Vec<(String, Spread<'_>)>, Limit> {
  match params {
    ReadValue::Map(map) => bounded(map.iter(), MAX_SPREAD_ENTRIES).map(|entries| {
      entries
        .into_iter()
        .map(|(key, value)| (key.to_owned(), Spread::Value(value)))
        .collect()
    }),
    ReadValue::Array(array) => indexed(array.iter().map(Spread::Value)),
    ReadValue::Any(any) => {
      if let Some(entries) = any.object() {
        bounded(entries, MAX_SPREAD_ENTRIES).map(|entries| {
          entries
            .into_iter()
            .map(|(key, value)| (key.to_owned(), Spread::Value(ReadValue::Any(value))))
            .collect()
        })
      } else if let Some(values) = any.array() {
        indexed(values.map(|value| Spread::Value(ReadValue::Any(value))))
      } else if let Some(value) = any.as_str() {
        indexed(value.encode_utf16().map(Spread::Unit))
      } else {
        Ok(Vec::new())
      }
    }
    _ => Ok(Vec::new()),
  }
}

fn indexed<'a>(values: impl Iterator<Item = Spread<'a>>) -> Result<Vec<(String, Spread<'a>)>, Limit> {
  bounded(values, MAX_SPREAD_ENTRIES).map(|values| {
    values
      .into_iter()
      .enumerate()
      .map(|(index, value)| (index.to_string(), value))
      .collect()
  })
}

/// Collects at most `limit` items, or returns `Limit` when there are more.
fn bounded<T>(items: impl Iterator<Item = T>, limit: usize) -> Result<Vec<T>, Limit> {
  let items: Vec<T> = items.take(limit + 1).collect();
  if items.len() > limit { Err(Limit) } else { Ok(items) }
}

/// Returns the index of a canonical array index key such as `"0"` or `"12"`.
fn array_index(key: &str) -> Option<u32> {
  if key.is_empty() || (key.len() > 1 && key.starts_with('0')) || !key.bytes().all(|byte| byte.is_ascii_digit()) {
    return None;
  }
  key.parse::<u32>().ok().filter(|index| *index != u32::MAX)
}

fn js_key_order(left: &str, right: &str) -> std::cmp::Ordering {
  match (array_index(left), array_index(right)) {
    (Some(left), Some(right)) => left.cmp(&right),
    (Some(_), None) => std::cmp::Ordering::Less,
    (None, Some(_)) => std::cmp::Ordering::Greater,
    (None, None) => left.cmp(right),
  }
}

/// A reference that does not fit, with its identity.
struct Oversize(Identity);

/// A serialization that passed a size, entry or depth limit.
struct Limit;

/// Returns `true` for a value that `JSON.stringify` leaves out of an object.
fn is_omitted(value: ReadValue<'_>) -> bool {
  match value {
    ReadValue::Any(any) => any.is_undefined() || any.as_binary().is_some(),
    ReadValue::Xml { .. } | ReadValue::Doc { .. } => true,
    ReadValue::Text(_) | ReadValue::Map(_) | ReadValue::Array(_) => false,
  }
}

/// Where `JsonWriter` sends its output: a buffer, or a hash that keeps no
/// output.
enum Sink {
  Text(Vec<u8>),
  Hash(Sha256),
}

/// Writes `JSON.stringify` output and stops at `limit` bytes or at
/// `MAX_PARAMS_DEPTH` levels.
struct JsonWriter {
  sink: Sink,
  len: usize,
  limit: usize,
}

impl io::Write for JsonWriter {
  fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
    self
      .bytes(bytes)
      .map_err(|Limit| io::Error::other("search reference is too large"))?;
    Ok(bytes.len())
  }

  fn flush(&mut self) -> io::Result<()> {
    Ok(())
  }
}

impl JsonWriter {
  fn new(sink: Sink, limit: usize) -> Self {
    Self { sink, len: 0, limit }
  }

  fn into_string(self) -> String {
    match self.sink {
      Sink::Text(bytes) => String::from_utf8(bytes).unwrap_or_default(),
      Sink::Hash(_) => String::new(),
    }
  }

  fn into_identity(self) -> Identity {
    match self.sink {
      Sink::Text(bytes) => Sha256::digest(&bytes).into(),
      Sink::Hash(hash) => hash.finalize().into(),
    }
  }

  fn bytes(&mut self, bytes: &[u8]) -> Result<(), Limit> {
    if self.len.saturating_add(bytes.len()) > self.limit {
      return Err(Limit);
    }
    self.len += bytes.len();
    match &mut self.sink {
      Sink::Text(out) => out.extend_from_slice(bytes),
      Sink::Hash(hash) => hash.update(bytes),
    }
    Ok(())
  }

  fn push(&mut self, value: &str) -> Result<(), Limit> {
    self.bytes(value.as_bytes())
  }

  fn string(&mut self, value: &str) -> Result<(), Limit> {
    if self.len.saturating_add(value.len()) > self.limit {
      return Err(Limit);
    }
    serde_json::to_writer(&mut *self, value).map_err(|_| Limit)
  }

  /// Writes a top-level spread object from entries in output order.
  fn spread(&mut self, entries: &[(String, Spread<'_>)]) -> Result<(), Limit> {
    self.push("{")?;
    let mut first = true;
    for (key, value) in entries {
      if let Spread::Value(value) = value
        && is_omitted(*value)
      {
        continue;
      }
      if !first {
        self.push(",")?;
      }
      first = false;
      self.string(key)?;
      self.push(":")?;
      match value {
        Spread::Value(value) => self.value(*value, 1)?,
        Spread::String(value) => self.string(value)?,
        Spread::Unit(unit) => self.unit(*unit)?,
      }
    }
    self.push("}")
  }

  /// Writes one UTF-16 unit as a string. A lone surrogate becomes an escape,
  /// as in well-formed `JSON.stringify`.
  fn unit(&mut self, unit: u16) -> Result<(), Limit> {
    match char::from_u32(u32::from(unit)) {
      Some(character) => self.string(character.encode_utf8(&mut [0; 4])),
      None => self.push(&format!("\"\\u{unit:04x}\"")),
    }
  }

  /// Writes a value that `is_omitted` keeps.
  fn value(&mut self, value: ReadValue<'_>, depth: usize) -> Result<(), Limit> {
    if depth > MAX_PARAMS_DEPTH {
      return Err(Limit);
    }
    match value {
      ReadValue::Any(any) => self.any(any, depth),
      ReadValue::Text(text) => {
        if usize::try_from(text.len()).unwrap_or(usize::MAX) > self.limit {
          return Err(Limit);
        }
        self.string(&text.to_string())
      }
      ReadValue::Map(map) => {
        let mut entries = bounded(map.iter(), MAX_SPREAD_ENTRIES)?;
        entries.sort_by(|(left, _), (right, _)| js_key_order(left, right));
        self.object(entries.into_iter(), depth)
      }
      ReadValue::Array(array) => {
        if array.len() > MAX_ARRAY_ITEMS as u64 {
          return Err(Limit);
        }
        self.array(array.iter(), depth)
      }
      ReadValue::Xml { .. } | ReadValue::Doc { .. } => self.push("null"),
    }
  }

  fn any(&mut self, any: ReadAny<'_>, depth: usize) -> Result<(), Limit> {
    if any.is_null() || any.is_undefined() || any.as_binary().is_some() {
      self.push("null")
    } else if let Some(value) = any.as_bool() {
      self.push(if value { "true" } else { "false" })
    } else if let Some(value) = any.as_i64() {
      self.push(&value.to_string())
    } else if let Some(value) = any.as_f64() {
      self.push(&js_number(value))
    } else if let Some(value) = any.as_str() {
      self.string(value)
    } else if let Some(values) = any.array() {
      self.array(values.map(ReadValue::Any), depth)
    } else if let Some(entries) = any.object() {
      let mut entries = bounded(entries, MAX_SPREAD_ENTRIES)?;
      entries.sort_by(|(left, _), (right, _)| js_key_order(left, right));
      self.object(
        entries.into_iter().map(|(key, value)| (key, ReadValue::Any(value))),
        depth,
      )
    } else {
      self.push("null")
    }
  }

  fn object<'a>(&mut self, entries: impl Iterator<Item = (&'a str, ReadValue<'a>)>, depth: usize) -> Result<(), Limit> {
    self.push("{")?;
    let mut first = true;
    for (key, value) in entries {
      if is_omitted(value) {
        continue;
      }
      if !first {
        self.push(",")?;
      }
      first = false;
      self.string(key)?;
      self.push(":")?;
      self.value(value, depth + 1)?;
    }
    self.push("}")
  }

  /// Writes an array. `JSON.stringify` writes `null` for a value that it
  /// leaves out of an object.
  fn array<'a>(&mut self, values: impl Iterator<Item = ReadValue<'a>>, depth: usize) -> Result<(), Limit> {
    self.push("[")?;
    for (index, value) in values.enumerate() {
      if index > 0 {
        self.push(",")?;
      }
      if is_omitted(value) {
        self.push("null")?;
      } else {
        self.value(value, depth + 1)?;
      }
    }
    self.push("]")
  }
}

/// Identifies params that are too large to hash as JSON. It hashes a type
/// tag for each node and the string bytes, up to `MAX_STRUCTURE_NODES`
/// nodes and `MAX_STRUCTURE_BYTES` string bytes, so it reads a bounded part
/// of the params and keeps no copy of them. Object entries add up into an
/// order-independent digest, because stored objects have no stable key
/// order.
fn structure_identity(doc_id: &str, params: Option<ReadValue<'_>>) -> Identity {
  let mut hasher = StructureHasher {
    hash: Sha256::new(),
    nodes: 0,
    bytes: 0,
  };
  hasher.hash.update(b"affine-search-reference-structure\0");
  hasher.string(doc_id);
  if let Some(params) = params {
    hasher.value(params, 0);
  }
  hasher.hash.finalize().into()
}

struct StructureHasher {
  hash: Sha256,
  nodes: usize,
  bytes: usize,
}

impl StructureHasher {
  /// Hashes a node tag, or returns `false` once the node budget is spent.
  fn node(&mut self, tag: u8) -> bool {
    if self.nodes >= MAX_STRUCTURE_NODES {
      return false;
    }
    self.nodes += 1;
    self.hash.update([tag]);
    true
  }

  fn string(&mut self, value: &str) {
    self.hash.update((value.len() as u64).to_le_bytes());
    let take = value.len().min(MAX_STRUCTURE_BYTES.saturating_sub(self.bytes));
    self.bytes += take;
    self.hash.update(&value.as_bytes()[..take]);
  }

  /// Hashes one value. Every container and cut ends with its own marker,
  /// so no two shapes give the same bytes.
  fn value(&mut self, value: ReadValue<'_>, depth: usize) {
    if depth > MAX_STRUCTURE_DEPTH {
      let _ = self.node(b'!');
      return;
    }
    match value {
      ReadValue::Any(any) => self.any(any, depth),
      ReadValue::Text(text) => {
        if self.node(b's') {
          for run in text.runs() {
            if let ReadTextRun::Text(value) = run {
              self.string(value);
            }
          }
          self.hash.update(b"]");
        }
      }
      ReadValue::Map(map) => {
        if self.node(b'{') {
          self.entries(map.iter(), depth);
        }
      }
      ReadValue::Array(array) => {
        if self.node(b'[') {
          self.hash.update(array.len().to_le_bytes());
          for value in array.iter() {
            if self.nodes >= MAX_STRUCTURE_NODES {
              break;
            }
            self.value(value, depth + 1);
          }
          self.hash.update(b"]");
        }
      }
      ReadValue::Xml { .. } | ReadValue::Doc { .. } => {
        self.node(b'x');
      }
    }
  }

  fn any(&mut self, any: ReadAny<'_>, depth: usize) {
    if depth > MAX_STRUCTURE_DEPTH {
      let _ = self.node(b'!');
    } else if any.is_undefined() {
      self.node(b'u');
    } else if any.is_null() {
      self.node(b'n');
    } else if let Some(value) = any.as_bool() {
      self.node(if value { b't' } else { b'f' });
    } else if let Some(value) = any.as_i64() {
      if self.node(b'i') {
        self.hash.update(value.to_le_bytes());
      }
    } else if let Some(value) = any.as_f64() {
      if self.node(b'd') {
        self.hash.update(value.to_bits().to_le_bytes());
      }
    } else if let Some(value) = any.as_str() {
      if self.node(b's') {
        self.string(value);
      }
    } else if let Some(binary) = any.as_binary() {
      if self.node(b'b') {
        self.hash.update((binary.len() as u64).to_le_bytes());
      }
    } else if let Some(values) = any.array() {
      if self.node(b'[') {
        let mut count = 0_u64;
        for value in values {
          if self.nodes >= MAX_STRUCTURE_NODES {
            break;
          }
          self.any(value, depth + 1);
          count += 1;
        }
        self.hash.update(count.to_le_bytes());
        self.hash.update(b"]");
      }
    } else if let Some(entries) = any.object()
      && self.node(b'{')
    {
      self.entries(entries.map(|(key, value)| (key, ReadValue::Any(value))), depth);
    }
  }

  /// Hashes object entries in any order: each entry gets its own digest,
  /// and the digests add up lane by lane, so the key order does not matter.
  fn entries<'a>(&mut self, entries: impl Iterator<Item = (&'a str, ReadValue<'a>)>, depth: usize) {
    let mut sum = [0_u64; 4];
    let mut count = 0_u64;
    for (key, value) in entries {
      if self.nodes >= MAX_STRUCTURE_NODES {
        break;
      }
      self.nodes += 1;
      let parent = std::mem::replace(&mut self.hash, Sha256::new());
      self.string(key);
      self.value(value, depth + 1);
      let digest: Identity = std::mem::replace(&mut self.hash, parent).finalize().into();
      for (index, lane) in sum.iter_mut().enumerate() {
        let mut word = [0_u8; 8];
        word.copy_from_slice(&digest[index * 8..index * 8 + 8]);
        *lane = lane.wrapping_add(u64::from_le_bytes(word));
      }
      count += 1;
    }
    self.hash.update(count.to_le_bytes());
    for lane in sum {
      self.hash.update(lane.to_le_bytes());
    }
  }
}

/// Formats a number as ECMAScript `Number::toString` does: the shortest
/// round-trip digits, in plain notation for decimal exponents from -7 to 20
/// and in `1e+21` form otherwise.
fn js_number(value: f64) -> String {
  if !value.is_finite() {
    return "null".to_owned();
  }
  if value == 0.0 {
    return "0".to_owned();
  }
  // `{:e}` gives the shortest round-trip digits, such as `-1.5e-7`.
  let scientific = format!("{:e}", value.abs());
  let (mantissa, exponent) = scientific.split_once('e').unwrap_or((&scientific, "0"));
  let digits: String = mantissa.chars().filter(char::is_ascii_digit).collect();
  let k = digits.len() as i64;
  let n = exponent.parse::<i64>().unwrap_or(0) + 1;
  let sign = if value < 0.0 { "-" } else { "" };
  let body = if k <= n && n <= 21 {
    format!("{digits}{}", "0".repeat((n - k) as usize))
  } else if 0 < n && n <= 21 {
    format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
  } else if -6 < n && n <= 0 {
    format!("0.{}{digits}", "0".repeat((-n) as usize))
  } else {
    let exponent = n - 1;
    let exponent_sign = if exponent < 0 { "-" } else { "+" };
    let (first, rest) = digits.split_at(1);
    let fraction = if rest.is_empty() {
      String::new()
    } else {
      format!(".{rest}")
    };
    format!("{first}{fraction}e{exponent_sign}{}", exponent.abs())
  };
  format!("{sign}{body}")
}
