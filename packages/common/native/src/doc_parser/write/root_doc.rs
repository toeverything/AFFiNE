use y_octo::Array;

use super::*;

const DEFAULT_DOC_TITLE: &str = "Untitled";

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
