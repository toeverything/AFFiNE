use std::collections::HashSet;

use y_octo::Array;

use super::*;

const DEFAULT_DOC_TITLE: &str = "Untitled";
const SIMPLE_PAGE_META_KEYS: &[&str] = &[
  "id",
  "title",
  "createDate",
  "updatedDate",
  "trash",
  "trashDate",
  "headerImage",
];

fn any_to_value(doc: &Doc, any: Any) -> Result<Value, ParseError> {
  match any {
    Any::Array(values) => {
      let mut array = doc.create_array()?;
      for value in values {
        let item = any_to_value(doc, value)?;
        array.push(item)?;
      }
      Ok(Value::Array(array))
    }
    Any::Object(values) => {
      let mut map = doc.create_map()?;
      for (key, value) in values {
        let item = any_to_value(doc, value)?;
        map.insert(key, item)?;
      }
      Ok(Value::Map(map))
    }
    _ => Ok(Value::Any(any)),
  }
}

pub(super) fn ensure_pages_array(doc: &Doc, meta: &mut Map) -> Result<Array, ParseError> {
  let pages_value = meta.get("pages");
  if let Some(pages) = pages_value.as_ref().and_then(|value| value.to_array()) {
    return Ok(pages);
  }

  if let Some(Any::Array(entries)) = pages_value.and_then(|value| value.to_any()) {
    let mut pages = doc.create_array()?;
    for entry in entries {
      let value = any_to_value(doc, entry)?;
      pages.push(value)?;
    }
    meta.insert("pages".to_string(), Value::Array(pages.clone()))?;
    return Ok(pages);
  }

  let pages = doc.create_array()?;
  meta.insert("pages".to_string(), Value::Array(pages.clone()))?;
  Ok(pages)
}

/// Adds a document ID to the root doc's meta.pages array.
/// Returns a binary update that can be applied to the root doc.
///
/// # Arguments
/// * `root_doc_bin` - The current root doc binary
/// * `doc_id` - The document ID to add
/// * `title` - Optional title for the document
///
/// # Returns
/// A Vec<u8> containing the y-octo update binary to add the doc
pub fn add_doc_to_root_doc(root_doc_bin: Vec<u8>, doc_id: &str, title: Option<&str>) -> Result<Vec<u8>, ParseError> {
  // Handle empty or minimal root doc - create a new one
  let doc = load_doc_or_new(&root_doc_bin)?;

  // Capture state before modifications to encode only the delta
  let state_before = doc.get_state_vector();

  // Get or create the meta map
  let mut meta = doc.get_or_create_map("meta")?;

  let mut pages = ensure_pages_array(&doc, &mut meta)?;

  // Check if doc already exists
  let doc_exists = pages.iter().any(|page_val| {
    page_val
      .to_map()
      .and_then(|page| get_string(&page, "id"))
      .map(|id| id == doc_id)
      .unwrap_or(false)
  });

  if !doc_exists {
    let page_map = doc.create_map()?;

    let idx = pages.len();
    pages.insert(idx, Value::Map(page_map))?;

    if let Some(mut inserted_page) = pages.get(idx).and_then(|v| v.to_map()) {
      inserted_page.insert("id".to_string(), Any::String(doc_id.to_string()))?;

      let page_title = title.unwrap_or(DEFAULT_DOC_TITLE);
      inserted_page.insert("title".to_string(), Any::String(page_title.to_string()))?;

      let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
      inserted_page.insert("createDate".to_string(), Any::Float64((timestamp as f64).into()))?;

      let tags = doc.create_array()?;
      inserted_page.insert("tags".to_string(), Value::Array(tags))?;
    }
  }

  // Encode only the changes (delta) since state_before
  Ok(doc.encode_state_as_update_v1(&state_before)?)
}

fn insert_page_stub(doc: &Doc, pages: &mut Array, doc_id: &str, title: Option<&str>) -> Result<(), ParseError> {
  let page_map = doc.create_map()?;
  let idx = pages.len();
  pages.insert(idx, Value::Map(page_map))?;

  if let Some(mut inserted_page) = pages.get(idx).and_then(|v| v.to_map()) {
    inserted_page.insert("id".to_string(), Any::String(doc_id.to_string()))?;
    inserted_page.insert(
      "title".to_string(),
      Any::String(title.unwrap_or(DEFAULT_DOC_TITLE).to_string()),
    )?;

    let timestamp = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_millis() as i64)
      .unwrap_or(0);
    inserted_page.insert("createDate".to_string(), Any::Float64((timestamp as f64).into()))?;

    let tags = doc.create_array()?;
    inserted_page.insert("tags".to_string(), Value::Array(tags))?;
  }

  Ok(())
}

fn insert_simple_array(doc: &Doc, values: &[Any]) -> Result<Value, ParseError> {
  let mut array = doc.create_array()?;
  for value in values {
    match value {
      Any::Array(_) | Any::Object(_) => continue,
      _ => array.push(Value::Any(value.clone()))?,
    }
  }
  Ok(Value::Array(array))
}

fn insert_page_from_any(doc: &Doc, pages: &mut Array, page: Any) -> Result<Option<String>, ParseError> {
  let Any::Object(page) = page else {
    return Ok(None);
  };

  let Some(page_id) = page.get("id").and_then(|value| match value {
    Any::String(value) => Some(value.clone()),
    _ => None,
  }) else {
    return Ok(None);
  };

  let page_map = doc.create_map()?;
  let idx = pages.len();
  pages.insert(idx, Value::Map(page_map))?;

  let Some(mut inserted_page) = pages.get(idx).and_then(|v| v.to_map()) else {
    return Ok(None);
  };

  for key in SIMPLE_PAGE_META_KEYS {
    let Some(value) = page.get(*key) else {
      continue;
    };
    match value {
      Any::Array(values) => {
        inserted_page.insert((*key).to_string(), insert_simple_array(doc, values)?)?;
      }
      Any::Object(_) => continue,
      _ => {
        inserted_page.insert((*key).to_string(), Value::Any(value.clone()))?;
      }
    }
  }

  if let Some(Any::Array(tags)) = page.get("tags") {
    inserted_page.insert("tags".to_string(), insert_simple_array(doc, tags)?)?;
  }

  Ok(Some(page_id))
}

pub fn build_public_root_doc(root_doc_bin: &[u8], doc_metas: &[(&str, Option<&str>)]) -> Result<Vec<u8>, ParseError> {
  let source = load_doc_or_new(root_doc_bin)?;
  let public_doc_ids = doc_metas
    .iter()
    .map(|(doc_id, _title)| (*doc_id).to_string())
    .collect::<HashSet<_>>();

  let doc = Doc::default();
  let mut meta = doc.get_or_create_map("meta")?;
  let mut pages = ensure_pages_array(&doc, &mut meta)?;
  let mut copied = HashSet::new();

  if let Ok(source_meta) = source.get_map("meta") {
    let source_pages_value = source_meta.get("pages");

    if let Some(source_pages) = source_pages_value.as_ref().and_then(|value| value.to_array()) {
      for page_val in source_pages.iter() {
        let Some(page) = page_val.to_map() else {
          continue;
        };
        let Some(page_id) = get_string(&page, "id") else {
          continue;
        };
        if !public_doc_ids.contains(&page_id) {
          continue;
        }

        let page_object = Any::Object(
          page
            .iter()
            .filter_map(|(key, value)| value.to_any().map(|any| (key.to_string(), any)))
            .collect(),
        );
        if let Some(inserted_page_id) = insert_page_from_any(&doc, &mut pages, page_object)? {
          copied.insert(inserted_page_id);
        }
      }
    } else if let Some(Any::Array(entries)) = source_pages_value.and_then(|value| value.to_any()) {
      for entry in entries {
        let Any::Object(page) = entry.clone() else {
          continue;
        };
        let Some(Any::String(page_id)) = page.get("id") else {
          continue;
        };
        if !public_doc_ids.contains(page_id) {
          continue;
        }

        if let Some(inserted_page_id) = insert_page_from_any(&doc, &mut pages, entry)? {
          copied.insert(inserted_page_id);
        }
      }
    }
  }

  for (doc_id, title) in doc_metas {
    if copied.contains(*doc_id) {
      continue;
    }
    insert_page_stub(&doc, &mut pages, doc_id, *title)?;
  }

  Ok(doc.encode_update_v1()?)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::doc_parser::get_doc_ids_from_binary;

  #[test]
  fn test_build_public_root_doc_filters_private_pages() {
    let root = add_doc_to_root_doc(Vec::new(), "public-doc", Some("Public")).expect("create public entry");
    let update = add_doc_to_root_doc(root.clone(), "private-doc", Some("Private")).expect("create private entry");

    let mut merged = load_doc_or_new(&root).expect("load root");
    merged
      .apply_update_from_binary_v1(&update)
      .expect("apply second update");
    let merged_bin = merged.encode_update_v1().expect("encode merged");

    let public_root = build_public_root_doc(
      &merged_bin,
      &[("public-doc", Some("Public")), ("missing-public-doc", Some("Fallback"))],
    )
    .expect("build public root");

    let doc_ids = get_doc_ids_from_binary(public_root, false).expect("read public root doc ids");
    assert_eq!(
      doc_ids,
      vec!["public-doc".to_string(), "missing-public-doc".to_string()]
    );
  }
}
