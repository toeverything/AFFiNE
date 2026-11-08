use std::collections::HashMap;

use chrono::Utc;
use y_octo::{Any, Array, Doc, Map, Value};

use super::{
  frontmatter::{parse_bool, parse_tags},
  types::FrontmatterMeta,
  utils::{is_empty_update, load_doc_or_new},
};

pub(crate) fn build_root_meta_update(
  existing_root: &[u8],
  workspace_id: &str,
  doc_id: &str,
  meta: &FrontmatterMeta,
) -> Result<Vec<u8>, String> {
  let doc = load_doc_or_new(existing_root, Some(workspace_id))?;

  let state_before = doc.get_state_vector();
  let mut meta_map = doc
    .get_or_create_map("meta")
    .map_err(|err| format!("failed to open root meta map: {}", err))?;
  let mut pages = ensure_pages_array(&doc, &mut meta_map)?;

  let mut found = false;
  for idx in 0..pages.len() {
    let Some(mut page) = pages.get(idx).and_then(|value| value.to_map()) else {
      continue;
    };

    if get_string_from_map(&page, "id").as_deref() == Some(doc_id) {
      apply_page_meta(&doc, &mut page, doc_id, meta)?;
      found = true;
      break;
    }
  }

  if !found {
    let page_map = doc
      .create_map()
      .map_err(|err| format!("failed to create root page map: {}", err))?;

    let idx = pages.len();
    pages
      .insert(idx, Value::Map(page_map))
      .map_err(|err| format!("failed to insert root page map: {}", err))?;

    if let Some(mut page) = pages.get(idx).and_then(|value| value.to_map()) {
      apply_page_meta(&doc, &mut page, doc_id, meta)?;
    }
  }

  doc
    .encode_state_as_update_v1(&state_before)
    .map_err(|err| format!("failed to encode root meta update: {}", err))
}

pub(crate) fn extract_root_meta_for_doc(root_bin: &[u8], doc_id: &str) -> Result<Option<FrontmatterMeta>, String> {
  let metas = extract_all_root_meta(root_bin)?;
  Ok(metas.get(doc_id).cloned())
}

pub(crate) fn extract_all_root_meta(root_bin: &[u8]) -> Result<HashMap<String, FrontmatterMeta>, String> {
  if is_empty_update(root_bin) {
    return Ok(HashMap::new());
  }

  let doc = load_doc_or_new(root_bin, None)?;
  let meta = match doc.get_map("meta") {
    Ok(meta) => meta,
    Err(_) => return Ok(HashMap::new()),
  };

  let pages_value = meta.get("pages");
  let mut result = HashMap::new();

  if let Some(pages) = pages_value.as_ref().and_then(|value| value.to_array()) {
    for page_value in pages.iter() {
      let Some(page_map) = page_value.to_map() else {
        continue;
      };

      let Some(doc_id) = get_string_from_map(&page_map, "id") else {
        continue;
      };

      result.insert(doc_id.clone(), extract_meta_from_page_map(&page_map, Some(doc_id)));
    }

    return Ok(result);
  }

  if let Some(Any::Array(entries)) = pages_value.and_then(|value| value.to_any()) {
    for entry in entries {
      let Any::Object(values) = entry else {
        continue;
      };

      let Some(Any::String(doc_id)) = values.get("id") else {
        continue;
      };

      let mut meta = FrontmatterMeta {
        id: Some(doc_id.clone()),
        ..Default::default()
      };

      if let Some(Any::String(title)) = values.get("title") {
        meta.title = Some(title.clone());
      }
      if let Some(tags) = values.get("tags") {
        meta.tags = extract_tags_from_any(tags);
      }
      if let Some(value) = values.get("favorite") {
        meta.favorite = any_to_bool(value);
      }
      if let Some(value) = values.get("trash") {
        meta.trash = any_to_bool(value);
      }

      result.insert(doc_id.clone(), meta);
    }
  }

  Ok(result)
}

fn apply_page_meta(doc: &Doc, page: &mut Map, doc_id: &str, meta: &FrontmatterMeta) -> Result<(), String> {
  page
    .insert("id".to_string(), Any::String(doc_id.to_string()))
    .map_err(|err| format!("failed to set root meta id: {}", err))?;

  if let Some(title) = meta.title.as_ref() {
    page
      .insert("title".to_string(), Any::String(title.clone()))
      .map_err(|err| format!("failed to set root meta title: {}", err))?;
  }

  if let Some(tags) = super::frontmatter::normalize_tags(meta.tags.clone()) {
    let mut tags_array = doc
      .create_array()
      .map_err(|err| format!("failed to create tags array: {}", err))?;
    for tag in tags {
      tags_array
        .push(Any::String(tag))
        .map_err(|err| format!("failed to push tag: {}", err))?;
    }

    page
      .insert("tags".to_string(), Value::Array(tags_array))
      .map_err(|err| format!("failed to set tags array: {}", err))?;
  }

  if let Some(favorite) = meta.favorite {
    page
      .insert("favorite".to_string(), if favorite { Any::True } else { Any::False })
      .map_err(|err| format!("failed to set favorite metadata: {}", err))?;
  }

  if let Some(trash) = meta.trash {
    page
      .insert("trash".to_string(), if trash { Any::True } else { Any::False })
      .map_err(|err| format!("failed to set trash metadata: {}", err))?;
  }

  let now_ms = Utc::now().timestamp_millis() as f64;
  if !has_numeric_timestamp(page, "createDate") {
    page
      .insert("createDate".to_string(), Any::Float64(now_ms.into()))
      .map_err(|err| format!("failed to set createDate metadata: {}", err))?;
  }

  page
    .insert("updatedDate".to_string(), Any::Float64(now_ms.into()))
    .map_err(|err| format!("failed to set updatedDate metadata: {}", err))?;

  Ok(())
}

fn ensure_pages_array(doc: &Doc, meta: &mut Map) -> Result<Array, String> {
  let pages_value = meta.get("pages");
  if let Some(pages) = pages_value.as_ref().and_then(|value| value.to_array()) {
    return Ok(pages);
  }

  if let Some(Any::Array(entries)) = pages_value.and_then(|value| value.to_any()) {
    let mut pages = doc
      .create_array()
      .map_err(|err| format!("failed to create pages array: {}", err))?;

    for entry in entries {
      let value = any_to_value(doc, entry)?;
      pages
        .push(value)
        .map_err(|err| format!("failed to migrate page entry: {}", err))?;
    }

    meta
      .insert("pages".to_string(), Value::Array(pages.clone()))
      .map_err(|err| format!("failed to assign pages array: {}", err))?;

    return Ok(pages);
  }

  let pages = doc
    .create_array()
    .map_err(|err| format!("failed to create pages array: {}", err))?;
  meta
    .insert("pages".to_string(), Value::Array(pages.clone()))
    .map_err(|err| format!("failed to assign pages array: {}", err))?;

  Ok(pages)
}

fn any_to_value(doc: &Doc, any: Any) -> Result<Value, String> {
  match any {
    Any::Array(values) => {
      let mut array = doc
        .create_array()
        .map_err(|err| format!("failed to create nested array: {}", err))?;
      for value in values {
        let nested = any_to_value(doc, value)?;
        array
          .push(nested)
          .map_err(|err| format!("failed to push nested array value: {}", err))?;
      }
      Ok(Value::Array(array))
    }
    Any::Object(values) => {
      let mut map = doc
        .create_map()
        .map_err(|err| format!("failed to create nested map: {}", err))?;
      for (key, value) in *values {
        let nested = any_to_value(doc, value)?;
        map
          .insert(key, nested)
          .map_err(|err| format!("failed to insert nested map value: {}", err))?;
      }
      Ok(Value::Map(map))
    }
    _ => Ok(Value::Any(any)),
  }
}

fn extract_meta_from_page_map(page_map: &Map, doc_id: Option<String>) -> FrontmatterMeta {
  let mut meta = FrontmatterMeta {
    id: doc_id.or_else(|| get_string_from_map(page_map, "id")),
    title: get_string_from_map(page_map, "title"),
    ..Default::default()
  };

  if let Some(tags) = page_map.get("tags") {
    meta.tags = extract_tags_from_value(&tags);
  }

  meta.favorite = page_map
    .get("favorite")
    .and_then(|value| value.to_any())
    .and_then(|value| any_to_bool(&value));
  meta.trash = page_map
    .get("trash")
    .and_then(|value| value.to_any())
    .and_then(|value| any_to_bool(&value));

  meta
}

fn extract_tags_from_value(value: &Value) -> Option<Vec<String>> {
  if let Some(array) = value.to_array() {
    let mut tags = Vec::new();
    for item in array.iter() {
      if let Some(any) = item.to_any()
        && let Some(value) = any_to_string(&any)
      {
        tags.push(value);
      }
    }
    return Some(tags);
  }

  value.to_any().and_then(|any| extract_tags_from_any(&any))
}

fn extract_tags_from_any(value: &Any) -> Option<Vec<String>> {
  match value {
    Any::Array(values) => {
      let mut tags = Vec::new();
      for value in values {
        if let Some(tag) = any_to_string(value) {
          tags.push(tag);
        }
      }
      Some(tags)
    }
    Any::String(value) => Some(parse_tags(value)),
    _ => None,
  }
}

fn any_to_bool(value: &Any) -> Option<bool> {
  match value {
    Any::True => Some(true),
    Any::False => Some(false),
    Any::Integer(value) => Some(*value != 0),
    Any::BigInt64(value) => Some(*value != 0),
    Any::Float32(value) => Some(value.0 != 0.0),
    Any::Float64(value) => Some(value.0 != 0.0),
    Any::String(value) => parse_bool(value),
    Any::Null | Any::Undefined => None,
    Any::Array(_) | Any::Object(_) | Any::Binary(_) => Some(true),
  }
}

fn any_to_string(value: &Any) -> Option<String> {
  match value {
    Any::String(value) => Some(value.to_string()),
    Any::Integer(value) => Some(value.to_string()),
    Any::BigInt64(value) => Some(value.to_string()),
    Any::Float32(value) => Some(value.0.to_string()),
    Any::Float64(value) => Some(value.0.to_string()),
    Any::True => Some("true".to_string()),
    Any::False => Some("false".to_string()),
    Any::Null | Any::Undefined => None,
    Any::Array(_) | Any::Object(_) | Any::Binary(_) => None,
  }
}

fn get_string_from_map(map: &Map, key: &str) -> Option<String> {
  map.get(key).and_then(|value| {
    if let Some(text) = value.to_text() {
      return Some(text.to_string());
    }

    value.to_any().and_then(|any| any_to_string(&any))
  })
}

fn has_numeric_timestamp(page: &Map, key: &str) -> bool {
  page
    .get(key)
    .and_then(|value| value.to_any())
    .is_some_and(|value| match value {
      Any::Integer(_) | Any::BigInt64(_) => true,
      Any::Float32(value) => value.0.is_finite(),
      Any::Float64(value) => value.0.is_finite(),
      _ => false,
    })
}
