use std::{collections::BTreeMap, fmt::Display};

use super::{AsInner, list::ListType};
use crate::{
  Any, Content, JwstCodecError, JwstCodecResult,
  doc::{DocStore, ItemRef, Node, Parent, Somr, YType, YTypeRef},
  impl_type,
};

impl_type!(Text);

impl ListType for Text {}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(untagged)]
pub enum TextInsert {
  Text(String),
  Embed(Vec<Any>),
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(untagged)]
pub enum TextDeltaOp {
  Insert {
    insert: TextInsert,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<TextAttributes>,
  },
  Retain {
    retain: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<TextAttributes>,
  },
  Delete {
    delete: u64,
  },
}

pub type TextDelta = Vec<TextDeltaOp>;
pub type TextAttributes = BTreeMap<String, Any>;

impl Text {
  #[inline]
  pub fn len(&self) -> u64 {
    self.content_len()
  }

  #[inline]
  pub fn is_empty(&self) -> bool {
    self.len() == 0
  }

  #[inline]
  pub fn insert<T: ToString>(&mut self, char_index: u64, str: T) -> JwstCodecResult {
    self.insert_at(char_index, Content::String(str.to_string()))
  }

  #[inline]
  pub fn remove(&mut self, char_index: u64, len: u64) -> JwstCodecResult {
    self.remove_at(char_index, len)
  }

  pub fn to_delta(&self) -> TextDelta {
    let mut ops = Vec::new();
    let mut attrs = TextAttributes::new();

    for item_ref in self.iter_item() {
      if let Some(item) = item_ref.get() {
        match &item.content {
          Content::Format { key, value } => {
            if is_nullish(value) {
              attrs.remove(key.as_str());
            } else {
              attrs.insert(key.to_string(), value.clone());
            }
          }
          Content::String(text) => {
            push_insert(&mut ops, TextInsert::Text(text.clone()), &attrs);
          }
          Content::Embed(embed) => {
            push_insert(&mut ops, TextInsert::Embed(vec![embed.clone()]), &attrs);
          }
          Content::Any(any) => {
            push_insert(&mut ops, TextInsert::Embed(any.clone()), &attrs);
          }
          Content::Json(values) => {
            let converted = values
              .iter()
              .map(|value| value.as_ref().map(|s| Any::String(s.clone())).unwrap_or(Any::Undefined))
              .collect::<Vec<_>>();
            push_insert(&mut ops, TextInsert::Embed(converted), &attrs);
          }
          Content::Binary(value) => {
            push_insert(&mut ops, TextInsert::Embed(vec![Any::Binary(value.clone())]), &attrs);
          }
          _ => {}
        }
      }
    }

    ops
  }

  pub fn apply_delta(&mut self, delta: &[TextDeltaOp]) -> JwstCodecResult {
    let (mut store, mut ty) = self.as_inner().write().ok_or(JwstCodecError::DocReleased)?;
    let parent = self.as_inner().clone();

    let mut pos = TextPosition::new(parent, ty.start.clone());

    for op in delta {
      match op {
        TextDeltaOp::Insert { insert, format } => {
          let attrs = format.clone().unwrap_or_default();
          match insert {
            TextInsert::Text(text) => {
              insert_text_content(&mut store, &mut ty, &mut pos, Content::String(text.clone()), attrs)?;
            }
            TextInsert::Embed(values) => {
              for value in values {
                insert_text_content(
                  &mut store,
                  &mut ty,
                  &mut pos,
                  Content::Embed(value.clone()),
                  attrs.clone(),
                )?;
              }
            }
          }
        }
        TextDeltaOp::Retain { retain, format } => {
          let attrs = format.clone().unwrap_or_default();
          if attrs.is_empty() {
            advance_text_position(&mut store, &mut pos, *retain)?;
          } else {
            format_text(&mut store, &mut ty, &mut pos, *retain, attrs)?;
          }
        }
        TextDeltaOp::Delete { delete } => {
          delete_text(&mut store, &mut ty, &mut pos, *delete)?;
        }
      }
    }

    Ok(())
  }
}

impl Display for Text {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    self.iter_item().try_for_each(|item| {
      if let Content::String(str) = &item.get().unwrap().content {
        write!(f, "{str}")
      } else {
        Ok(())
      }
    })
  }
}

impl serde::Serialize for Text {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    serializer.serialize_str(&self.to_string())
  }
}

struct TextPosition {
  parent: YTypeRef,
  left: ItemRef,
  right: ItemRef,
  index: u64,
  attrs: TextAttributes,
}

impl TextPosition {
  fn new(parent: YTypeRef, right: ItemRef) -> Self {
    Self {
      parent,
      left: Somr::none(),
      right,
      index: 0,
      attrs: TextAttributes::new(),
    }
  }

  fn forward(&mut self) {
    if let Some(right) = self.right.get() {
      if !right.deleted() {
        if let Content::Format { key, value } = &right.content {
          if is_nullish(value) {
            self.attrs.remove(key.as_str());
          } else {
            self.attrs.insert(key.to_string(), value.clone());
          }
        } else if right.countable() {
          self.index += right.len();
        }
      }

      self.left = self.right.clone();
      self.right = right.right.clone();
    }
  }
}

fn is_nullish(value: &Any) -> bool {
  matches!(value, Any::Null | Any::Undefined)
}

fn push_insert(ops: &mut Vec<TextDeltaOp>, insert: TextInsert, attrs: &TextAttributes) {
  let format = if attrs.is_empty() { None } else { Some(attrs.clone()) };

  if let Some(TextDeltaOp::Insert {
    insert: TextInsert::Text(prev),
    format: prev_format,
  }) = ops.last_mut()
    && let TextInsert::Text(text) = insert
  {
    if prev_format.as_ref() == format.as_ref() {
      prev.push_str(&text);
      return;
    }
    ops.push(TextDeltaOp::Insert {
      insert: TextInsert::Text(text),
      format,
    });
    return;
  }

  ops.push(TextDeltaOp::Insert { insert, format });
}

fn advance_text_position(store: &mut DocStore, pos: &mut TextPosition, mut remaining: u64) -> JwstCodecResult {
  while remaining > 0 {
    let Some(item) = pos.right.get() else {
      return Err(JwstCodecError::IndexOutOfBound(pos.index + remaining));
    };

    if item.deleted() {
      pos.forward();
      continue;
    }

    if matches!(item.content, Content::Format { .. }) {
      pos.forward();
      continue;
    }

    let item_len = item.len();
    if remaining < item_len {
      let (left, right) = store.split_node(item.id, remaining)?;
      pos.left = left.as_item();
      pos.right = right.as_item();
      pos.index += remaining;
      break;
    }

    remaining -= item_len;
    pos.forward();
  }

  Ok(())
}

fn minimize_attribute_changes(pos: &mut TextPosition, attrs: &TextAttributes) {
  loop {
    let Some(item) = pos.right.get() else {
      break;
    };

    if item.deleted() {
      pos.forward();
      continue;
    }

    if let Content::Format { key, value } = &item.content {
      let attr = attrs.get(key.as_str()).cloned().unwrap_or(Any::Null);
      if attr == *value {
        pos.forward();
        continue;
      }
    }

    break;
  }
}

fn insert_item(store: &mut DocStore, ty: &mut YType, pos: &mut TextPosition, content: Content) -> JwstCodecResult {
  if let Some(markers) = &ty.markers
    && content.countable()
  {
    markers.update_marker_changes(pos.index, content.clock_len() as i64);
  }

  let item = store.create_item(
    content,
    pos.left.clone(),
    pos.right.clone(),
    Some(Parent::Type(pos.parent.clone())),
    None,
  );
  let item_ref = item.clone();
  store.integrate(Node::Item(item), 0, Some(ty))?;
  pos.right = item_ref;
  pos.forward();

  Ok(())
}

fn insert_attributes(
  store: &mut DocStore,
  ty: &mut YType,
  pos: &mut TextPosition,
  attrs: &TextAttributes,
) -> JwstCodecResult<TextAttributes> {
  let mut negated = TextAttributes::new();

  for (key, value) in attrs {
    let current = pos.attrs.get(key.as_str()).cloned().unwrap_or(Any::Null);
    if current == *value {
      continue;
    }

    negated.insert(key.to_string(), current);
    insert_item(
      store,
      ty,
      pos,
      Content::Format {
        key: key.to_string(),
        value: value.clone(),
      },
    )?;
  }

  Ok(negated)
}

fn insert_negated_attributes(
  store: &mut DocStore,
  ty: &mut YType,
  pos: &mut TextPosition,
  mut negated: TextAttributes,
) -> JwstCodecResult {
  loop {
    let Some(item) = pos.right.get() else {
      break;
    };

    if item.deleted() {
      pos.forward();
      continue;
    }

    if let Content::Format { key, value } = &item.content
      && let Some(negated_value) = negated.get(key.as_str())
      && negated_value == value
    {
      negated.remove(key.as_str());
      pos.forward();
      continue;
    }

    break;
  }

  for (key, value) in negated {
    insert_item(
      store,
      ty,
      pos,
      Content::Format {
        key: key.to_string(),
        value,
      },
    )?;
  }

  Ok(())
}

fn insert_text_content(
  store: &mut DocStore,
  ty: &mut YType,
  pos: &mut TextPosition,
  content: Content,
  mut attrs: TextAttributes,
) -> JwstCodecResult {
  for key in pos.attrs.keys() {
    if !attrs.contains_key(key.as_str()) {
      attrs.insert(key.to_string(), Any::Null);
    }
  }

  minimize_attribute_changes(pos, &attrs);
  let negated = insert_attributes(store, ty, pos, &attrs)?;
  insert_item(store, ty, pos, content)?;
  insert_negated_attributes(store, ty, pos, negated)?;

  Ok(())
}

fn format_text(
  store: &mut DocStore,
  ty: &mut YType,
  pos: &mut TextPosition,
  mut remaining: u64,
  attrs: TextAttributes,
) -> JwstCodecResult {
  if remaining == 0 {
    return Ok(());
  }

  minimize_attribute_changes(pos, &attrs);
  let mut negated = insert_attributes(store, ty, pos, &attrs)?;

  while remaining > 0 {
    let Some(item) = pos.right.get() else {
      break;
    };

    if item.deleted() {
      pos.forward();
      continue;
    }

    match &item.content {
      Content::Format { key, value } => {
        if let Some(attr) = attrs.get(key.as_str()) {
          if attr == value {
            negated.remove(key.as_str());
          } else {
            negated.insert(key.to_string(), value.clone());
          }
          store.delete_item(item, Some(ty));
          pos.forward();
        } else {
          pos.forward();
        }
      }
      _ => {
        let item_len = item.len();
        if remaining < item_len {
          store.split_node(item.id, remaining)?;
          remaining = 0;
        } else {
          remaining -= item_len;
        }
        pos.forward();
      }
    }
  }

  insert_negated_attributes(store, ty, pos, negated)?;

  Ok(())
}

fn delete_text(store: &mut DocStore, ty: &mut YType, pos: &mut TextPosition, mut remaining: u64) -> JwstCodecResult {
  if remaining == 0 {
    return Ok(());
  }

  let start = remaining;

  while remaining > 0 {
    let item_ref = pos.right.clone();
    let Some((indexable, item_len, item_id)) = item_ref.get().map(|item| (item.indexable(), item.len(), item.id))
    else {
      break;
    };

    if indexable {
      if remaining < item_len {
        store.split_node(item_id, remaining)?;
        remaining = 0;
      } else {
        remaining -= item_len;
      }

      if let Some(item) = item_ref.get() {
        store.delete_item(item, Some(ty));
      }
    }

    pos.forward();
  }

  if let Some(markers) = &ty.markers {
    markers.update_marker_changes(pos.index, -((start - remaining) as i64));
  }

  Ok(())
}

#[cfg(test)]
mod tests {
  use rand::{Rng, SeedableRng};
  use rand_chacha::ChaCha20Rng;
  use yrs::{Options, Text, Transact};

  use super::{TextAttributes, TextDeltaOp, TextInsert};
  #[cfg(not(loom))]
  use crate::sync::{Arc, AtomicUsize, Ordering};
  use crate::{Any, Doc, loom_model, sync::thread};

  #[test]
  fn test_manipulate_text() {
    loom_model!({
      let doc = Doc::new();
      let mut text = doc.create_text().unwrap();

      text.insert(0, "llo").unwrap();
      text.insert(0, "he").unwrap();
      text.insert(5, " world").unwrap();
      text.insert(6, "great ").unwrap();
      text.insert(17, '!').unwrap();

      assert_eq!(text.to_string(), "hello great world!");
      assert_eq!(text.len(), 18);

      text.remove(4, 4).unwrap();
      assert_eq!(text.to_string(), "helleat world!");
      assert_eq!(text.len(), 14);
    });
  }

  #[test]
  #[cfg(not(loom))]
  fn test_parallel_insert_text() {
    let seed = rand::rng().random();
    let rand = ChaCha20Rng::seed_from_u64(seed);
    let mut handles = Vec::new();

    let doc = Doc::with_client(1);
    let mut text = doc.get_or_create_text("test").unwrap();
    text.insert(0, "This is a string with length 32.").unwrap();

    let added_len = Arc::new(AtomicUsize::new(32));

    // parallel editing text
    {
      for i in 0..2 {
        let mut text = text.clone();
        let mut rand = rand.clone();
        let len = added_len.clone();

        handles.push(thread::spawn(move || {
          for j in 0..10 {
            let pos = rand.random_range(0..text.len());
            let string = format!("hello {}", i * j);

            text.insert(pos, &string).unwrap();

            len.fetch_add(string.len(), Ordering::SeqCst);
          }
        }));
      }
    }

    // parallel editing doc
    {
      for i in 0..2 {
        let doc = doc.clone();
        let mut rand = rand.clone();
        let len = added_len.clone();

        handles.push(thread::spawn(move || {
          let mut text = doc.get_or_create_text("test").unwrap();
          for j in 0..10 {
            let pos = rand.random_range(0..text.len());
            let string = format!("hello doc{}", i * j);

            text.insert(pos, &string).unwrap();

            len.fetch_add(string.len(), Ordering::SeqCst);
          }
        }));
      }
    }

    for handle in handles {
      handle.join().unwrap();
    }

    assert_eq!(text.to_string().len(), added_len.load(Ordering::SeqCst));
    assert_eq!(text.len(), added_len.load(Ordering::SeqCst) as u64);
  }

  #[cfg(not(loom))]
  fn parallel_ins_del_text(seed: u64, thread: i32, iteration: i32) {
    let doc = Doc::with_client(1);
    let rand = ChaCha20Rng::seed_from_u64(seed);
    let mut text = doc.get_or_create_text("test").unwrap();
    text.insert(0, "This is a string with length 32.").unwrap();

    let mut handles = Vec::new();
    let len = Arc::new(AtomicUsize::new(32));

    for i in 0..thread {
      let len = len.clone();
      let mut rand = rand.clone();
      let text = text.clone();
      handles.push(thread::spawn(move || {
        for j in 0..iteration {
          let len = len.clone();
          let mut text = text.clone();
          let ins = i % 2 == 0;
          let pos = rand.random_range(0..16);

          if ins {
            let str = format!("hello {}", i * j);
            text.insert(pos, &str).unwrap();

            len.fetch_add(str.len(), Ordering::SeqCst);
          } else {
            text.remove(pos, 6).unwrap();

            len.fetch_sub(6, Ordering::SeqCst);
          }
        }
      }));
    }

    for handle in handles {
      handle.join().unwrap();
    }

    assert_eq!(text.to_string().len(), len.load(Ordering::SeqCst));
    assert_eq!(text.len(), len.load(Ordering::SeqCst) as u64);
  }

  #[test]
  #[cfg(not(loom))]
  fn test_parallel_ins_del_text() {
    // cases that ever broken
    // wrong left/right ref
    parallel_ins_del_text(973078538, 2, 2);
    parallel_ins_del_text(18414938500869652479, 2, 2);
  }

  #[test]
  fn loom_parallel_ins_del_text() {
    let seed = rand::rng().random();
    let mut rand = ChaCha20Rng::seed_from_u64(seed);
    let ranges = (0..20).map(|_| rand.random_range(0..16)).collect::<Vec<_>>();

    loom_model!({
      let doc = Doc::new();
      let mut text = doc.get_or_create_text("test").unwrap();
      text.insert(0, "This is a string with length 32.").unwrap();

      // enough for loom
      let handles = (0..2)
        .map(|i| {
          let text = text.clone();
          let ranges = ranges.clone();
          thread::spawn(move || {
            let mut text = text.clone();
            let ins = i % 2 == 0;
            let pos = ranges[i];

            if ins {
              let str = format!("hello {}", i);
              text.insert(pos, &str).unwrap();
            } else {
              text.remove(pos, 6).unwrap();
            }
          })
        })
        .collect::<Vec<_>>();

      for handle in handles {
        handle.join().unwrap();
      }
    });
  }

  #[test]
  #[cfg_attr(miri, ignore)]
  fn test_recover_from_yjs_encoder() {
    let yrs_options = Options {
      client_id: rand::random(),
      guid: nanoid::nanoid!().into(),
      ..Default::default()
    };

    loom_model!({
      let binary = {
        let doc = yrs::Doc::with_options(yrs_options.clone());
        let text = doc.get_or_insert_text("greating");
        let mut trx = doc.transact_mut();
        text.insert(&mut trx, 0, "hello");
        text.insert(&mut trx, 5, " world!");
        text.remove_range(&mut trx, 11, 1);

        trx.encode_update_v1()
      };
      // in loom loop
      #[allow(clippy::needless_borrow)]
      let doc = Doc::try_from_binary_v1(&binary).unwrap();
      let mut text = doc.get_or_create_text("greating").unwrap();

      assert_eq!(text.to_string(), "hello world");

      text.insert(6, "great ").unwrap();
      text.insert(17, '!').unwrap();
      assert_eq!(text.to_string(), "hello great world!");
    });
  }

  #[test]
  fn test_recover_from_octobase_encoder() {
    loom_model!({
      let binary = {
        let doc = Doc::new();
        let mut text = doc.get_or_create_text("greating").unwrap();
        text.insert(0, "hello").unwrap();
        text.insert(5, " world!").unwrap();
        text.remove(11, 1).unwrap();

        doc.encode_update_v1().unwrap()
      };

      let doc = Doc::try_from_binary_v1(binary).unwrap();
      let mut text = doc.get_or_create_text("greating").unwrap();

      assert_eq!(text.to_string(), "hello world");

      text.insert(6, "great ").unwrap();
      text.insert(17, '!').unwrap();
      assert_eq!(text.to_string(), "hello great world!");
    });
  }

  #[test]
  fn test_text_delta_insert_format() {
    loom_model!({
      let doc = Doc::new();
      let mut text = doc.get_or_create_text("text").unwrap();

      let mut attrs = TextAttributes::new();
      attrs.insert("bold".to_string(), Any::True);

      text
        .apply_delta(&[TextDeltaOp::Insert {
          insert: TextInsert::Text("abc".to_string()),
          format: Some(attrs.clone()),
        }])
        .unwrap();

      assert_eq!(text.to_string(), "abc");
      assert_eq!(
        text.to_delta(),
        vec![TextDeltaOp::Insert {
          insert: TextInsert::Text("abc".to_string()),
          format: Some(attrs),
        }]
      );
    });
  }

  #[test]
  fn test_text_delta_retain_format() {
    loom_model!({
      let doc = Doc::new();
      let mut text = doc.get_or_create_text("text").unwrap();

      text
        .apply_delta(&[TextDeltaOp::Insert {
          insert: TextInsert::Text("abc".to_string()),
          format: None,
        }])
        .unwrap();

      let mut attrs = TextAttributes::new();
      attrs.insert("bold".to_string(), Any::True);

      text
        .apply_delta(&[TextDeltaOp::Retain {
          retain: 1,
          format: Some(attrs.clone()),
        }])
        .unwrap();

      assert_eq!(
        text.to_delta(),
        vec![
          TextDeltaOp::Insert {
            insert: TextInsert::Text("a".to_string()),
            format: Some(attrs),
          },
          TextDeltaOp::Insert {
            insert: TextInsert::Text("bc".to_string()),
            format: None,
          }
        ]
      );
    });
  }

  #[test]
  fn test_text_delta_utf16_retain() {
    loom_model!({
      let doc = Doc::new();
      let mut text = doc.get_or_create_text("text").unwrap();

      text
        .apply_delta(&[TextDeltaOp::Insert {
          insert: TextInsert::Text("😀".to_string()),
          format: None,
        }])
        .unwrap();

      let mut attrs = TextAttributes::new();
      attrs.insert("bold".to_string(), Any::True);

      text
        .apply_delta(&[TextDeltaOp::Retain {
          retain: 2,
          format: Some(attrs.clone()),
        }])
        .unwrap();

      assert_eq!(
        text.to_delta(),
        vec![TextDeltaOp::Insert {
          insert: TextInsert::Text("😀".to_string()),
          format: Some(attrs),
        }]
      );
    });
  }
}
