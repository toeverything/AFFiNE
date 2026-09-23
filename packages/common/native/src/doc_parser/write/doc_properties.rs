use y_octo::{Any, DocOptions, Map};

use super::{
  super::{doc_loader::is_empty_doc, value::value_to_string},
  ParseError,
};

pub fn update_doc_properties(
  existing_binary: &[u8],
  properties_doc_id: &str,
  target_doc_id: &str,
  created_by: Option<&str>,
  updated_by: Option<&str>,
) -> Result<Vec<u8>, ParseError> {
  let doc = if is_empty_doc(existing_binary) {
    DocOptions::new().with_guid(properties_doc_id.to_string()).build()
  } else {
    super::load_doc(existing_binary, Some(properties_doc_id))?
  };

  let state_before = doc.get_state_vector();
  let mut record = doc.get_or_create_map(target_doc_id)?;
  let mut changed = false;

  if record.get("id").is_none() {
    record.insert("id".to_string(), Any::String(target_doc_id.to_string()))?;
    changed = true;
  }

  if let Some(created_by) = created_by
    && get_record_string(&record, "createdBy").as_deref() != Some(created_by)
  {
    record.insert("createdBy".to_string(), Any::String(created_by.to_string()))?;
    changed = true;
  }

  if let Some(updated_by) = updated_by
    && get_record_string(&record, "updatedBy").as_deref() != Some(updated_by)
  {
    record.insert("updatedBy".to_string(), Any::String(updated_by.to_string()))?;
    changed = true;
  }

  if !changed {
    return Ok(Vec::new());
  }

  Ok(doc.encode_state_as_update_v1(&state_before)?)
}

fn get_record_string(record: &Map, key: &str) -> Option<String> {
  record.get(key).and_then(|value| value_to_string(&value))
}

#[cfg(test)]
mod tests {
  use y_octo::DocOptions;

  use super::*;

  #[test]
  fn test_update_doc_properties_creates_record() {
    let properties_doc_id = "doc-properties";
    let target_doc_id = "doc-1";
    let update = update_doc_properties(&[], properties_doc_id, target_doc_id, Some("user-1"), Some("user-1"))
      .expect("update properties");

    let mut doc = DocOptions::new().with_guid(properties_doc_id.to_string()).build();
    doc.apply_update_from_binary_v1(&update).expect("apply");

    let record = doc.get_map(target_doc_id).expect("record map");
    assert_eq!(get_record_string(&record, "id").as_deref(), Some(target_doc_id));
    assert_eq!(get_record_string(&record, "createdBy").as_deref(), Some("user-1"));
    assert_eq!(get_record_string(&record, "updatedBy").as_deref(), Some("user-1"));
  }

  #[test]
  fn test_update_doc_properties_no_change() {
    let properties_doc_id = "doc-properties-no-change";
    let target_doc_id = "doc-2";
    let initial = update_doc_properties(&[], properties_doc_id, target_doc_id, Some("user-1"), Some("user-2"))
      .expect("initial update");

    let delta = update_doc_properties(
      &initial,
      properties_doc_id,
      target_doc_id,
      Some("user-1"),
      Some("user-2"),
    )
    .expect("no change update");

    assert!(delta.is_empty());
  }
}
