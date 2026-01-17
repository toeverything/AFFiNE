use super::{
  builder::{insert_text, text_ops_from_plain},
  root_doc::ensure_pages_array,
  *,
};

pub fn update_doc_title(existing_binary: &[u8], doc_id: &str, title: &str) -> Result<Vec<u8>, ParseError> {
  let doc = load_doc(existing_binary, Some(doc_id))?;

  let state_before = doc.get_state_vector();
  let blocks_map = doc.get_map("blocks")?;
  if blocks_map.is_empty() {
    return Err(ParseError::ParserError("blocks map is empty".into()));
  }

  let mut page_block = find_page_block(&blocks_map)?;
  let current = get_string(&page_block, PROP_TITLE).unwrap_or_default();
  if current != title {
    insert_text(&doc, &mut page_block, PROP_TITLE, &text_ops_from_plain(title))?;
  }

  Ok(doc.encode_state_as_update_v1(&state_before)?)
}

pub fn update_root_doc_meta_title(root_doc_bin: &[u8], doc_id: &str, title: &str) -> Result<Vec<u8>, ParseError> {
  let doc = load_doc_or_new(root_doc_bin)?;

  let state_before = doc.get_state_vector();
  let mut meta = doc.get_or_create_map("meta")?;
  let mut pages = ensure_pages_array(&doc, &mut meta)?;

  let mut found = false;
  for idx in 0..pages.len() {
    let Some(mut page) = pages.get(idx).and_then(|v| v.to_map()) else {
      continue;
    };
    if get_string(&page, "id").as_deref() == Some(doc_id) {
      page.insert("title".to_string(), Any::String(title.to_string()))?;
      found = true;
      break;
    }
  }

  if !found {
    let page_map = doc.create_map()?;

    let idx = pages.len();
    pages.insert(idx, Value::Map(page_map))?;

    if let Some(mut inserted_page) = pages.get(idx).and_then(|v| v.to_map()) {
      inserted_page.insert("id".to_string(), Any::String(doc_id.to_string()))?;
      inserted_page.insert("title".to_string(), Any::String(title.to_string()))?;

      let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
      inserted_page.insert("createDate".to_string(), Any::Float64((timestamp as f64).into()))?;

      let tags = doc.create_array()?;
      inserted_page.insert("tags".to_string(), Value::Array(tags))?;
    }
  }

  Ok(doc.encode_state_as_update_v1(&state_before)?)
}

fn find_page_block(blocks_map: &Map) -> Result<Map, ParseError> {
  let index = build_block_index(blocks_map);
  let page_id = find_block_id_by_flavour(&index.block_pool, PAGE_FLAVOUR)
    .ok_or_else(|| ParseError::ParserError("page block not found".into()))?;
  blocks_map
    .get(&page_id)
    .and_then(|value| value.to_map())
    .ok_or_else(|| ParseError::ParserError("page block not found".into()))
}

#[cfg(test)]
mod tests {
  use y_octo::DocOptions;

  use super::*;
  use crate::doc_parser::{add_doc_to_root_doc, build_full_doc};

  #[test]
  fn test_update_doc_title() {
    let doc_id = "doc-meta-title-test";
    let initial = build_full_doc("Old Title", "Content.", doc_id).expect("create doc");
    let delta = update_doc_title(&initial, doc_id, "New Title").expect("update title");

    let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(&initial).expect("apply initial");
    doc.apply_update_from_binary_v1(&delta).expect("apply delta");

    let blocks_map = doc.get_map("blocks").expect("blocks map");
    let mut title = None;
    for (_, value) in blocks_map.iter() {
      if let Some(block_map) = value.to_map()
        && get_string(&block_map, "sys:flavour").as_deref() == Some(PAGE_FLAVOUR)
      {
        title = get_string(&block_map, "prop:title");
        break;
      }
    }

    assert_eq!(title.as_deref(), Some("New Title"));
  }

  #[test]
  fn test_update_root_doc_meta_title() {
    let doc_id = "root-meta-title-test";
    let root_bin = add_doc_to_root_doc(Vec::new(), doc_id, Some("Old Title")).expect("create root meta");
    let delta = update_root_doc_meta_title(&root_bin, doc_id, "New Title").expect("update meta");

    let mut doc = DocOptions::new().build();
    doc.apply_update_from_binary_v1(&root_bin).expect("apply root");
    doc.apply_update_from_binary_v1(&delta).expect("apply delta");

    let meta = doc.get_map("meta").expect("meta map");
    let pages = meta.get("pages").and_then(|v| v.to_array()).expect("pages array");
    let mut title = None;
    for page in pages.iter() {
      if let Some(page_map) = page.to_map()
        && get_string(&page_map, "id").as_deref() == Some(doc_id)
      {
        title = get_string(&page_map, "title");
        break;
      }
    }
    assert_eq!(title.as_deref(), Some("New Title"));
  }
}
