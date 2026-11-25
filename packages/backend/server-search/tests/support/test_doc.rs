//! BlockSuite page binaries for search tests. The unit tests in
//! `src/doc_extract.rs` and the integration tests share this file.
#![allow(dead_code)]

use std::collections::HashMap;

use y_octo::{Any, Doc, TextAttributes, TextDeltaOp, TextInsert, Value};

/// Builds a minimal page binary with a title and one paragraph.
pub fn build_test_doc(title: &str, body: &str, page_id: &str) -> Vec<u8> {
  let mut doc = TestDoc::new(page_id, title);
  doc.block(
    &format!("para-{page_id}"),
    "affine:paragraph",
    None,
    vec![("prop:text", TestValue::text(body))],
  );
  doc.encode()
}

/// A block property value for [`TestDoc`].
pub enum TestValue {
  Any(Any),
  /// A `Y.Text` built from `(text, attributes)` segments.
  RichText(Vec<(String, TextAttributes)>),
  /// A `Y.Text` built by applying each delta in turn.
  Deltas(Vec<Vec<TextDeltaOp>>),
  Map(Vec<(String, TestValue)>),
  Array(Vec<TestValue>),
}

impl TestValue {
  pub fn text(text: &str) -> Self {
    Self::RichText(vec![(text.to_owned(), TextAttributes::new())])
  }

  /// Builds a `Y.Text` from `(text, inline reference)` segments.
  pub fn rich(segments: &[(&str, Option<Any>)]) -> Self {
    Self::RichText(
      segments
        .iter()
        .map(|(text, reference)| {
          let attributes = reference
            .iter()
            .map(|reference| ("reference".to_owned(), reference.clone()))
            .collect();
          ((*text).to_owned(), attributes)
        })
        .collect(),
    )
  }

  pub fn string(value: &str) -> Self {
    Self::Any(Any::String(value.to_owned()))
  }

  pub fn map(entries: Vec<(&str, TestValue)>) -> Self {
    Self::Map(
      entries
        .into_iter()
        .map(|(key, value)| (key.to_owned(), value))
        .collect(),
    )
  }

  /// Builds an inline `reference` attribute value: `{pageId, params?}`.
  pub fn reference(page_id: &str, params: Vec<(&str, Any)>) -> Any {
    let mut reference = vec![("pageId".to_owned(), Any::String(page_id.to_owned()))];
    if !params.is_empty() {
      reference.push(("params".to_owned(), object(params)));
    }
    reference.into_iter().collect()
  }

  fn materialize(self, doc: &Doc) -> Value {
    match self {
      Self::Any(any) => Value::Any(any),
      Self::RichText(segments) => {
        let mut text = doc.create_text().expect("create test text");
        let delta = segments
          .into_iter()
          .map(|(insert, attributes)| TextDeltaOp::Insert {
            insert: TextInsert::Text(insert),
            format: (!attributes.is_empty()).then_some(attributes),
          })
          .collect::<Vec<_>>();
        text.apply_delta(&delta).expect("fill test text");
        Value::Text(text)
      }
      Self::Deltas(deltas) => {
        let mut text = doc.create_text().expect("create test text");
        for delta in deltas {
          text.apply_delta(&delta).expect("apply test delta");
        }
        Value::Text(text)
      }
      Self::Map(entries) => {
        let mut map = doc.create_map().expect("create test map");
        for (key, value) in entries {
          map.insert(key, value.materialize(doc)).expect("fill test map");
        }
        Value::Map(map)
      }
      Self::Array(values) => {
        let mut array = doc.create_array().expect("create test array");
        for value in values {
          array.push(value.materialize(doc)).expect("fill test array");
        }
        Value::Array(array)
      }
    }
  }
}

/// Builds a plain `Any` object.
pub fn object(entries: Vec<(&str, Any)>) -> Any {
  entries
    .into_iter()
    .map(|(key, value)| (key.to_owned(), value))
    .collect()
}

struct TestBlock {
  id: String,
  flavour: String,
  props: Vec<(String, TestValue)>,
}

/// Builds page binaries: an `affine:page` with one `affine:note`, and blocks
/// under the note or under other blocks.
pub struct TestDoc {
  blocks: Vec<TestBlock>,
  children: HashMap<String, Vec<String>>,
  note_id: String,
}

impl TestDoc {
  pub fn new(page_id: &str, title: &str) -> Self {
    let note_id = format!("note-{page_id}");
    let mut doc = Self {
      blocks: Vec::new(),
      children: HashMap::new(),
      note_id: note_id.clone(),
    };
    doc.blocks.push(TestBlock {
      id: page_id.to_owned(),
      flavour: "affine:page".to_owned(),
      props: vec![("prop:title".to_owned(), TestValue::text(title))],
    });
    doc.children.insert(page_id.to_owned(), vec![note_id.clone()]);
    doc.blocks.push(TestBlock {
      id: note_id,
      flavour: "affine:note".to_owned(),
      props: Vec::new(),
    });
    doc
  }

  /// Adds a block under `parent`, or under the note when `parent` is `None`.
  pub fn block(&mut self, id: &str, flavour: &str, parent: Option<&str>, props: Vec<(&str, TestValue)>) -> &mut Self {
    let parent = parent.unwrap_or(&self.note_id).to_owned();
    self.children.entry(parent).or_default().push(id.to_owned());
    self.blocks.push(TestBlock {
      id: id.to_owned(),
      flavour: flavour.to_owned(),
      props: props.into_iter().map(|(key, value)| (key.to_owned(), value)).collect(),
    });
    self
  }

  /// Adds a block that no block lists as a child. Other blocks can list it
  /// through their own `sys:children` prop.
  pub fn detached(&mut self, id: &str, flavour: &str, props: Vec<(&str, TestValue)>) -> &mut Self {
    self.blocks.push(TestBlock {
      id: id.to_owned(),
      flavour: flavour.to_owned(),
      props: props.into_iter().map(|(key, value)| (key.to_owned(), value)).collect(),
    });
    self
  }

  pub fn encode(mut self) -> Vec<u8> {
    let doc = Doc::new();
    let mut blocks = doc.get_or_create_map("blocks").expect("blocks map");
    for TestBlock { id, flavour, props } in std::mem::take(&mut self.blocks) {
      let mut entries = vec![
        ("sys:id".to_owned(), TestValue::Any(Any::String(id.clone()))),
        ("sys:flavour".to_owned(), TestValue::Any(Any::String(flavour))),
      ];
      if let Some(children) = self.children.remove(&id) {
        entries.push((
          "sys:children".to_owned(),
          TestValue::Array(
            children
              .into_iter()
              .map(|child| TestValue::Any(Any::String(child)))
              .collect(),
          ),
        ));
      }
      entries.extend(props);
      blocks
        .insert(id, TestValue::Map(entries).materialize(&doc))
        .expect("insert test block");
    }
    doc.encode_update_v1().expect("encode yjs update")
  }
}
