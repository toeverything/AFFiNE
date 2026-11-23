use std::borrow::Cow;

use napi::{Status, bindgen_prelude::Uint8Array};
use napi_derive::napi;
use y_octo::{
  Any, DocOptions, DocSession, ReadDoc, ReadError, ReadLimits, ReadValue, SessionConfig, SessionReadValue,
  SessionUndoConfig, TypeIdentity, TypeTarget,
};

#[napi(object)]
#[derive(Debug, Default, PartialEq, Eq)]
pub struct WorkspaceRootDocMeta {
  pub name: Option<String>,
  pub avatar: Option<String>,
  pub page_count: Option<u32>,
}

fn generic_err(err: impl std::fmt::Display) -> napi::Error {
  napi::Error::new(Status::GenericFailure, err.to_string())
}

fn is_empty_update(update: &[u8]) -> bool {
  update.is_empty() || update == [0, 0]
}

fn merge_non_empty_updates<'a>(updates: &[&'a [u8]]) -> napi::Result<Option<Cow<'a, [u8]>>> {
  let non_empty: Vec<&[u8]> = updates.iter().copied().filter(|u| !is_empty_update(u)).collect();
  match non_empty.as_slice() {
    [] => Ok(None),
    [single] => Ok(Some(Cow::Borrowed(*single))),
    many => {
      let merged = y_octo::merge_updates_v1(many).map_err(generic_err)?;
      let encoded = merged.encode_v1().map_err(generic_err)?;
      Ok(Some(Cow::Owned(encoded)))
    }
  }
}

fn is_ambiguous_json_string(s: &str) -> bool {
  let trimmed = s.trim();
  trimmed.starts_with('"')
    || trimmed.starts_with('[')
    || trimmed.starts_with('{')
    || matches!(trimmed, "null" | "true" | "false")
    || trimmed
      .as_bytes()
      .first()
      .is_some_and(|b| *b == b'-' || b.is_ascii_digit())
}

enum FastField<T> {
  Resolved(Option<T>),
  Ambiguous,
}

fn read_fast_string(value: Option<ReadValue<'_>>) -> FastField<String> {
  match value {
    None => FastField::Resolved(None),
    Some(ReadValue::Any(any)) => {
      if let Some(s) = any.as_str() {
        if is_ambiguous_json_string(s) {
          FastField::Ambiguous
        } else {
          FastField::Resolved(Some(s.to_owned()))
        }
      } else if any.array().is_some() {
        FastField::Ambiguous
      } else {
        FastField::Resolved(None)
      }
    }
    Some(_) => FastField::Resolved(None),
  }
}

fn read_fast_page_count(value: Option<ReadValue<'_>>) -> FastField<u32> {
  match value {
    None => FastField::Resolved(None),
    Some(ReadValue::Array(arr)) => FastField::Resolved(Some(u32::try_from(arr.len()).unwrap_or(u32::MAX))),
    Some(ReadValue::Any(any)) => {
      if let Some(iter) = any.array() {
        let mut count: usize = 0;
        for item in iter {
          if item.as_str().is_some_and(is_ambiguous_json_string) {
            return FastField::Ambiguous;
          }
          count += 1;
        }
        FastField::Resolved(Some(u32::try_from(count).unwrap_or(u32::MAX)))
      } else {
        FastField::Ambiguous
      }
    }
    Some(_) => FastField::Resolved(None),
  }
}

fn read_meta_via_session(bytes: &[u8]) -> napi::Result<WorkspaceRootDocMeta> {
  let session = DocSession::<()>::from_update_v1(
    bytes,
    DocOptions::from_identity(1, "meta".into()),
    SessionConfig {
      undo: SessionUndoConfig::Disabled,
    },
  )
  .map_err(generic_err)?;

  let meta_id = TypeIdentity::Root("meta".into());
  if !session.type_status(&meta_id).alive {
    return Ok(WorkspaceRootDocMeta::default());
  }

  let meta_target = TypeTarget::Identity(meta_id);
  let name = match session.get_map_value(&meta_target, "name").map_err(generic_err)? {
    Some(SessionReadValue::Any(Any::String(s))) => Some(s),
    _ => None,
  };
  let avatar = match session.get_map_value(&meta_target, "avatar").map_err(generic_err)? {
    Some(SessionReadValue::Any(Any::String(s))) => Some(s),
    _ => None,
  };
  let page_count = match session.get_map_value(&meta_target, "pages").map_err(generic_err)? {
    Some(SessionReadValue::Array(id)) => {
      let len = session.read_array(&id.into()).map_err(generic_err)?.len();
      Some(u32::try_from(len).unwrap_or(u32::MAX))
    }
    Some(SessionReadValue::Any(Any::Array(arr))) => Some(u32::try_from(arr.len()).unwrap_or(u32::MAX)),
    _ => None,
  };

  Ok(WorkspaceRootDocMeta {
    name,
    avatar,
    page_count,
  })
}

fn parse_workspace_root_doc_meta_slices(updates: &[&[u8]]) -> napi::Result<WorkspaceRootDocMeta> {
  let Some(merged) = merge_non_empty_updates(updates)? else {
    return Ok(WorkspaceRootDocMeta::default());
  };

  match ReadDoc::from_full_update_v1_with_limits(merged.as_ref(), ReadLimits::default()) {
    Ok(read_doc) => {
      let Some(meta) = read_doc.map("meta") else {
        return Ok(WorkspaceRootDocMeta::default());
      };

      let name = match read_fast_string(meta.get("name")) {
        FastField::Resolved(v) => v,
        FastField::Ambiguous => return read_meta_via_session(merged.as_ref()),
      };
      let avatar = match read_fast_string(meta.get("avatar")) {
        FastField::Resolved(v) => v,
        FastField::Ambiguous => return read_meta_via_session(merged.as_ref()),
      };
      let page_count = match read_fast_page_count(meta.get("pages")) {
        FastField::Resolved(v) => v,
        FastField::Ambiguous => return read_meta_via_session(merged.as_ref()),
      };

      Ok(WorkspaceRootDocMeta {
        name,
        avatar,
        page_count,
      })
    }
    Err(ReadError::IncompleteSnapshot(_)) => read_meta_via_session(merged.as_ref()),
    Err(err) => Err(generic_err(err)),
  }
}

fn compact_doc_updates_v1_with_limits(updates: &[&[u8]], limits: ReadLimits) -> napi::Result<Vec<u8>> {
  let non_empty: Vec<&[u8]> = updates.iter().copied().filter(|u| !is_empty_update(u)).collect();
  let merged: Cow<'_, [u8]> = match non_empty.as_slice() {
    [] => return Ok(vec![0, 0]),
    [single] => {
      y_octo::validate_update_v1(single).map_err(generic_err)?;
      Cow::Borrowed(*single)
    }
    many => {
      let merged = y_octo::merge_updates_v1(many).map_err(generic_err)?;
      Cow::Owned(merged.encode_v1().map_err(generic_err)?)
    }
  };

  match ReadDoc::from_full_update_v1_with_limits(merged.as_ref(), limits) {
    Ok(_) => {
      let mut doc = DocOptions::new().build();
      doc.apply_update_from_binary_v1(merged.as_ref()).map_err(generic_err)?;
      doc.gc().map_err(generic_err)?;
      doc.encode_update_v1().map_err(generic_err)
    }
    Err(ReadError::IncompleteSnapshot(_) | ReadError::ResourceLimit(_)) => Ok(merged.into_owned()),
    Err(ReadError::InvalidUpdate(err)) => Err(generic_err(err)),
  }
}

fn compact_doc_updates_v1_slices(updates: &[&[u8]]) -> napi::Result<Vec<u8>> {
  compact_doc_updates_v1_with_limits(updates, ReadLimits::default())
}

#[napi(catch_unwind)]
pub fn parse_workspace_root_doc_meta(updates: Vec<Uint8Array>) -> napi::Result<WorkspaceRootDocMeta> {
  let slices: Vec<&[u8]> = updates.iter().map(|u| u.as_ref()).collect();
  parse_workspace_root_doc_meta_slices(&slices)
}

#[napi(catch_unwind)]
pub fn compact_doc_updates_v1(updates: Vec<Uint8Array>) -> napi::Result<Uint8Array> {
  let slices: Vec<&[u8]> = updates.iter().map(|u| u.as_ref()).collect();
  Ok(Uint8Array::new(compact_doc_updates_v1_slices(&slices)?))
}

#[cfg(test)]
mod tests {
  use y_octo::{AHashMap, CrdtWriter, RawEncoder, StateVector, Value};

  use super::*;

  fn page_entry(id: &str) -> Any {
    Any::Object(Box::new(AHashMap::from_iter([(
      "id".to_string(),
      Any::String(id.to_string()),
    )])))
  }

  fn encode_legacy_content_json_meta(entries: &[(&str, &str)]) -> Vec<u8> {
    let mut enc = RawEncoder::default();
    // 1 client
    enc.write_var_u64(1).unwrap();
    // N structs for client 1 starting at clock 0
    enc.write_var_u64(entries.len() as u64).unwrap();
    enc.write_var_u64(1).unwrap();
    enc.write_var_u64(0).unwrap();

    for (key, json_elem) in entries {
      // info = ITEM_HAS_PARENT_SUB (0x20) | Content::Json (2)
      enc.write_u8(0x20 | 2).unwrap();
      // named root
      enc.write_u8(1).unwrap();
      enc.write_var_string("meta").unwrap();
      enc.write_var_string(key).unwrap();
      enc.write_var_u64(1).unwrap();
      enc.write_var_string(json_elem).unwrap();
    }

    // Empty delete set
    enc.write_var_u64(0).unwrap();
    enc.into_inner()
  }

  #[test]
  fn parses_y_array_pages_and_avatar() {
    let doc = DocOptions::new().with_client_id(1).build();
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta.insert("name".to_string(), "My Workspace").unwrap();
    meta.insert("avatar".to_string(), "avatar-key").unwrap();

    let mut pages = doc.create_array().unwrap();
    pages.push(page_entry("page-1")).unwrap();
    pages.push(page_entry("page-2")).unwrap();
    meta.insert("pages".to_string(), pages).unwrap();

    let update = doc.encode_update_v1().unwrap();
    let parsed = parse_workspace_root_doc_meta_slices(&[&update]).unwrap();
    assert_eq!(
      parsed,
      WorkspaceRootDocMeta {
        name: Some("My Workspace".to_string()),
        avatar: Some("avatar-key".to_string()),
        page_count: Some(2),
      }
    );
  }

  #[test]
  fn parses_any_array_pages_and_incremental_name_override() {
    let doc = DocOptions::new().with_client_id(1).build();
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta.insert("name".to_string(), "Before").unwrap();
    // Yjs `meta.set('pages', [{ id: 'page-a' }])` writes a 1-element ContentAny
    // whose single item is Any::Array.
    meta
      .insert(
        "pages".to_string(),
        Any::Array(vec![Any::Array(vec![page_entry("page-a")])]),
      )
      .unwrap();
    let first = doc.encode_update_v1().unwrap();
    let sv = doc.get_state_vector();

    meta.insert("name".to_string(), "After").unwrap();
    let second = doc.encode_state_as_update_v1(&sv).unwrap();

    let parsed = parse_workspace_root_doc_meta_slices(&[&[], &first, &second]).unwrap();
    assert_eq!(
      parsed,
      WorkspaceRootDocMeta {
        name: Some("After".to_string()),
        avatar: None,
        page_count: Some(1),
      }
    );
  }

  #[test]
  fn parses_legacy_content_json_root_meta() {
    let bytes = encode_legacy_content_json_meta(&[
      ("name", "\"Test\""),
      ("avatar", "\"img\""),
      ("pages", "[{\"id\":\"1\"},{\"id\":\"2\"}]"),
    ]);

    let parsed = parse_workspace_root_doc_meta_slices(&[&bytes]).unwrap();
    assert_eq!(
      parsed,
      WorkspaceRootDocMeta {
        name: Some("Test".to_string()),
        avatar: Some("img".to_string()),
        page_count: Some(2),
      }
    );

    // Legacy Content::Json numeric literal ("123") decodes as integer, so
    // `name` / `avatar` must be None.
    let numeric_json = encode_legacy_content_json_meta(&[("name", "123"), ("avatar", "-42")]);
    assert_eq!(
      parse_workspace_root_doc_meta_slices(&[&numeric_json]).unwrap(),
      WorkspaceRootDocMeta::default()
    );
  }

  #[test]
  fn preserves_quoted_modern_any_string_name() {
    let doc = DocOptions::new().with_client_id(1).build();
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta.insert("name".to_string(), "\"Quoted\"").unwrap();
    meta.insert("avatar".to_string(), "123").unwrap();
    let mut pages = doc.create_array().unwrap();
    pages.push(page_entry("page-1")).unwrap();
    meta.insert("pages".to_string(), pages).unwrap();

    let update = doc.encode_update_v1().unwrap();
    let parsed = parse_workspace_root_doc_meta_slices(&[&update]).unwrap();
    assert_eq!(
      parsed,
      WorkspaceRootDocMeta {
        name: Some("\"Quoted\"".to_string()),
        avatar: Some("123".to_string()),
        page_count: Some(1),
      }
    );
  }

  #[test]
  fn falls_back_to_session_on_incomplete_snapshot() {
    let doc = DocOptions::new().with_client_id(1).build();
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta.insert("name".to_string(), "Arrived").unwrap();
    let mut pages = doc.create_array().unwrap();
    pages.push(page_entry("page-1")).unwrap();
    meta.insert("pages".to_string(), pages).unwrap();
    let arrived_meta = doc.encode_update_v1().unwrap();

    // Create a second client with a clock gap so ReadDoc returns
    // IncompleteSnapshot.
    let peer = DocOptions::new().with_client_id(2).build();
    let mut text = peer.get_or_create_text("notes").unwrap();
    text.insert(0, "first").unwrap();
    let sv_after_first = peer.get_state_vector();
    text.insert(5, "second").unwrap();
    let pending_tail = peer.encode_state_as_update_v1(&sv_after_first).unwrap();

    let parsed = parse_workspace_root_doc_meta_slices(&[&arrived_meta, &pending_tail]).unwrap();
    assert_eq!(
      parsed,
      WorkspaceRootDocMeta {
        name: Some("Arrived".to_string()),
        avatar: None,
        page_count: Some(1),
      }
    );
  }

  #[test]
  fn missing_pages_or_meta_returns_none() {
    let doc = DocOptions::new().with_client_id(1).build();
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta.insert("name".to_string(), "No Pages").unwrap();
    let update = doc.encode_update_v1().unwrap();

    let parsed = parse_workspace_root_doc_meta_slices(&[&update]).unwrap();
    assert_eq!(
      parsed,
      WorkspaceRootDocMeta {
        name: Some("No Pages".to_string()),
        avatar: None,
        page_count: None,
      }
    );

    let empty = parse_workspace_root_doc_meta_slices(&[]).unwrap();
    assert_eq!(empty, WorkspaceRootDocMeta::default());
  }

  #[test]
  fn corrupt_update_returns_generic_failure() {
    let err = parse_workspace_root_doc_meta_slices(&[&[0u8]]).unwrap_err();
    assert_eq!(err.status, Status::GenericFailure);

    let compact_err = compact_doc_updates_v1_slices(&[&[0u8]]).unwrap_err();
    assert_eq!(compact_err.status, Status::GenericFailure);
  }

  #[test]
  fn compact_doc_updates_v1_reclaims_deleted_payloads() {
    let doc = DocOptions::new().with_client_id(17).build();
    let mut text = doc.get_or_create_text("body").unwrap();
    let payload = "x".repeat(64 * 1024);
    let mut updates = Vec::new();
    let mut sv = StateVector::default();

    for _ in 0..4 {
      text.insert(0, &payload).unwrap();
      let ins = doc.encode_state_as_update_v1(&sv).unwrap();
      sv = doc.get_state_vector();
      updates.push(ins);

      text.remove(0, payload.len() as u64).unwrap();
      let del = doc.encode_state_as_update_v1(&sv).unwrap();
      sv = doc.get_state_vector();
      updates.push(del);
    }

    let slices: Vec<&[u8]> = updates.iter().map(Vec::as_slice).collect();
    let compacted = compact_doc_updates_v1_slices(&slices).unwrap();
    assert!(
      compacted.len() < 64,
      "expected compacted bytes < 64, got {}",
      compacted.len()
    );

    let mut reopened = DocOptions::new().with_client_id(99).build();
    reopened.apply_update_from_binary_v1(&compacted).unwrap();
    assert_eq!(reopened.get_or_create_text("body").unwrap().to_string(), "");
  }

  #[test]
  fn compact_doc_updates_v1_preserves_pending_updates_until_complete() {
    let author = DocOptions::new().with_client_id(21).build();
    let mut text = author.get_or_create_text("body").unwrap();
    text.insert(0, "hello").unwrap();
    let u1 = author.encode_update_v1().unwrap();
    let sv1 = author.get_state_vector();

    text.insert(5, " world").unwrap();
    let u2 = author.encode_state_as_update_v1(&sv1).unwrap();
    let sv2 = author.get_state_vector();

    let big = "z".repeat(16 * 1024);
    text.insert(11, &big).unwrap();
    let u3 = author.encode_state_as_update_v1(&sv2).unwrap();
    let sv3 = author.get_state_vector();

    text.remove(11, big.len() as u64).unwrap();
    let u4 = author.encode_state_as_update_v1(&sv3).unwrap();

    // Compact out-of-order updates (missing u1): must keep pending structs
    // intact.
    let pending_compacted = compact_doc_updates_v1_slices(&[&u2, &u3, &u4]).unwrap();

    // Once u1 arrives, compact again: full text converges and deleted 16 KiB is
    // reclaimed.
    let final_compacted = compact_doc_updates_v1_slices(&[&pending_compacted, &u1]).unwrap();
    assert!(
      final_compacted.len() < 128,
      "expected final compacted bytes < 128, got {}",
      final_compacted.len()
    );

    let mut reopened = DocOptions::new().with_client_id(99).build();
    reopened.apply_update_from_binary_v1(&final_compacted).unwrap();
    assert_eq!(reopened.get_or_create_text("body").unwrap().to_string(), "hello world");
  }

  #[test]
  fn compact_doc_updates_v1_skips_gc_on_resource_limit_without_losing_data() {
    let doc1 = DocOptions::new().with_client_id(1).build();
    doc1
      .get_or_create_map("data")
      .unwrap()
      .insert("v".to_string(), 1i64)
      .unwrap();
    let u1 = doc1.encode_update_v1().unwrap();

    let mut doc2 = DocOptions::new().with_client_id(2).build();
    doc2.apply_update_from_binary_v1(&u1).unwrap();
    doc2
      .get_or_create_map("data")
      .unwrap()
      .insert("v".to_string(), 2i64)
      .unwrap();
    let snapshot = doc2.encode_update_v1().unwrap();

    let mut doc3 = DocOptions::new().with_client_id(3).build();
    doc3.apply_update_from_binary_v1(&snapshot).unwrap();
    let sv2 = doc3.get_state_vector();
    doc3
      .get_or_create_map("data")
      .unwrap()
      .insert("v".to_string(), 3i64)
      .unwrap();
    let update = doc3.encode_state_as_update_v1(&sv2).unwrap();
    let expected_sv = doc3.get_state_vector();

    let limits = ReadLimits {
      max_clients: 2,
      ..ReadLimits::default()
    };
    let compacted = compact_doc_updates_v1_with_limits(&[&snapshot, &update], limits.clone()).unwrap();

    let mut reopened = DocOptions::new().with_client_id(99).build();
    reopened.apply_update_from_binary_v1(&compacted).unwrap();
    assert_eq!(
      reopened.get_map("data").unwrap().get("v"),
      Some(Value::Any(Any::from(3i64)))
    );
    assert_eq!(reopened.get_state_vector(), expected_sv);

    let err = compact_doc_updates_v1_with_limits(&[&[0u8]], limits).unwrap_err();
    assert_eq!(err.status, Status::GenericFailure);
  }
}
