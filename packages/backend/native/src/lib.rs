#![deny(clippy::all)]

mod audio_slice;
mod auth_session;
mod blocking;
pub mod content_policy;
pub mod doc;
pub mod doc_loader;
pub mod entitlement;
pub mod file_type;
pub mod hashcash;
pub mod html_sanitize;
pub mod image;
pub mod license;
mod license_import;
pub mod license_v2;
pub mod llm;
pub mod permission;
pub mod runtime;
pub mod safe_fetch;
pub(crate) mod search_index;
pub mod tiktoken;
pub mod url_policy;
mod utils;

use affine_common::napi_utils::map_napi_err;
use napi::{Result, Status, bindgen_prelude::*};

#[cfg(not(target_arch = "arm"))]
#[global_allocator]
static ALLOC: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[macro_use]
extern crate napi_derive;

#[napi(catch_unwind)]
pub fn merge_updates(updates: Vec<Buffer>) -> Result<Buffer> {
  let merged = map_napi_err(y_octo::merge_updates_v1(&updates), Status::GenericFailure)?;
  Ok(map_napi_err(merged.encode_v1(), Status::GenericFailure)?.into())
}

#[napi(catch_unwind)]
pub fn diff_doc_update_v1(update: Buffer, state_vector: Buffer) -> Result<Buffer> {
  Ok(map_napi_err(y_octo::diff_update_v1(&update, &state_vector), Status::GenericFailure)?.into())
}

#[napi(catch_unwind)]
pub fn encode_state_vector_from_update_v1(update: Buffer) -> Result<Buffer> {
  Ok(
    map_napi_err(
      y_octo::encode_state_vector_from_update_v1(&update),
      Status::GenericFailure,
    )?
    .into(),
  )
}

#[napi(catch_unwind)]
pub fn revert_doc_update_v1(current_snapshot: Buffer, target_snapshot: Buffer) -> Result<Buffer> {
  Ok(
    map_napi_err(
      y_octo::revert_update_v1(&current_snapshot, &target_snapshot),
      Status::GenericFailure,
    )?
    .into(),
  )
}

/// Check whether a Yjs update binary can be decoded without applying it to a
/// document state.
#[napi(catch_unwind)]
pub async fn validate_doc_update(update: Buffer) -> Result<bool> {
  let permit = doc::try_validation_slot().map_err(|_| napi::Error::from_reason("doc_validation_unavailable"))?;
  let update = update.to_vec();
  blocking::spawn(permit, move || y_octo::validate_update_v1(&update).is_ok())
    .await
    .map_err(|_| napi::Error::from_reason("doc_validation_unavailable"))
}

#[napi(catch_unwind)]
pub fn authorize_reserved_doc_subject(user_id: String, workspace_id: String, doc_id: String) -> bool {
  !matches!(
    affine_core::access_control::authorize_reserved_document(
      &user_id,
      affine_core::access_control::classify_reserved_document(&workspace_id, &doc_id),
    ),
    affine_core::access_control::ReservedDocumentAccessDecision::Denied
  )
}

#[cfg(any(test, debug_assertions))]
const DEBUG_AFFINE_PRO_PUBLIC_KEY: Option<&str> = Some(
  "-----BEGIN PUBLIC \
   KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEObwJiTmbui7rkWfPJ7Lozvuy2Rcl\notcrb0V6dlS2ijKEShm7ZttTwQn08xzesdjX/\
   AxpoR5X9yfoHkauIBuuMQ==\n-----END PUBLIC KEY-----",
);
#[cfg(not(any(test, debug_assertions)))]
const DEBUG_AFFINE_PRO_PUBLIC_KEY: Option<&str> = None;

#[napi]
pub const AFFINE_PRO_PUBLIC_KEY: Option<&'static str> = match std::option_env!("AFFINE_PRO_PUBLIC_KEY") {
  Some(key) => Some(key),
  None => DEBUG_AFFINE_PRO_PUBLIC_KEY,
};

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn merge_updates_reports_generic_failure() {
    let err = match merge_updates(vec![Buffer::from(vec![0])]) {
      Ok(_) => panic!("expected error"),
      Err(err) => err,
    };
    assert_eq!(err.status, Status::GenericFailure);
  }

  #[test]
  fn y_octo_validate_update_v1_accepts_valid_and_rejects_invalid() {
    assert!(y_octo::validate_update_v1(&[0, 0]).is_ok());
    assert!(y_octo::validate_update_v1(&[0]).is_err());
  }

  #[test]
  fn diff_and_state_vector_v1_roundtrip() {
    let doc = y_octo::DocOptions::new().with_client_id(1).build();
    let mut text = doc.get_or_create_text("content").unwrap();
    text.insert(0, "hello").unwrap();
    let update1 = doc.encode_update_v1().unwrap();
    let sv1 = encode_state_vector_from_update_v1(Buffer::from(update1)).unwrap();

    text.insert(5, " world").unwrap();
    let update2 = doc.encode_update_v1().unwrap();
    let diff = diff_doc_update_v1(Buffer::from(update2), sv1).unwrap();
    assert!(y_octo::validate_update_v1(&diff).is_ok());
    assert_ne!(diff.as_ref(), &[0, 0]);
  }

  #[test]
  fn revert_doc_update_v1_roundtrip_and_errors() {
    let doc = y_octo::DocOptions::new().with_client_id(1).build();
    let mut text = doc.get_or_create_text("content").unwrap();
    text.insert(0, "hello").unwrap();
    let target_snapshot = doc.encode_update_v1().unwrap();

    text.insert(5, " world").unwrap();
    let current_snapshot = doc.encode_update_v1().unwrap();

    let revert = revert_doc_update_v1(
      Buffer::from(current_snapshot.clone()),
      Buffer::from(target_snapshot.clone()),
    )
    .unwrap();

    let mut applied = y_octo::DocOptions::new().with_client_id(2).build();
    applied.apply_update_from_binary_v1(&current_snapshot).unwrap();
    applied.apply_update_from_binary_v1(revert.as_ref()).unwrap();
    let applied_text = applied.get_or_create_text("content").unwrap();
    assert_eq!(applied_text.to_string(), "hello");

    let err_corrupt = match revert_doc_update_v1(Buffer::from(vec![0]), Buffer::from(target_snapshot)) {
      Ok(_) => panic!("expected error for corrupt snapshot"),
      Err(err) => err,
    };
    assert_eq!(err_corrupt.status, Status::GenericFailure);

    let unrelated = y_octo::DocOptions::new().with_client_id(9).build();
    let mut unrelated_text = unrelated.get_or_create_text("content").unwrap();
    unrelated_text.insert(0, "divergent").unwrap();
    let unrelated_snapshot = unrelated.encode_update_v1().unwrap();
    let err_non_ancestor = match revert_doc_update_v1(Buffer::from(current_snapshot), Buffer::from(unrelated_snapshot))
    {
      Ok(_) => panic!("expected error for non-ancestor snapshot"),
      Err(err) => err,
    };
    assert_eq!(err_non_ancestor.status, Status::GenericFailure);
  }

  #[test]
  fn streaming_validate_32mib_update_under_budget() {
    let doc = y_octo::DocOptions::new().with_client_id(7).build();
    let mut text = doc.get_or_create_text("payload").unwrap();
    let chunk = "a".repeat(32 * 1024 * 1024 - 128);
    text.insert(0, &chunk).unwrap();
    let valid_update = doc.encode_update_v1().unwrap();
    assert!(valid_update.len() >= 31 * 1024 * 1024);

    let start = std::time::Instant::now();
    assert!(y_octo::validate_update_v1(&valid_update).is_ok());
    let valid_elapsed = start.elapsed();

    let mut invalid_update = valid_update;
    invalid_update.truncate(invalid_update.len() - 1);
    let start_invalid = std::time::Instant::now();
    assert!(y_octo::validate_update_v1(&invalid_update).is_err());
    let invalid_elapsed = start_invalid.elapsed();

    eprintln!(
      "32 MiB validate_update_v1: valid={:.2}ms, invalid={:.2}ms",
      valid_elapsed.as_secs_f64() * 1000.0,
      invalid_elapsed.as_secs_f64() * 1000.0
    );
    #[cfg(not(debug_assertions))]
    {
      assert!(valid_elapsed < std::time::Duration::from_secs(1));
      assert!(invalid_elapsed < std::time::Duration::from_secs(1));
    }
  }

  #[test]
  fn userdata_subject_is_owner_only_and_closed() {
    let cases = [
      ("user-a", "workspace-a", "ordinary-doc", true),
      ("user-a", "workspace-a", "db$workspace-a$docProperties", true),
      ("user-a", "workspace-a", "userdata$user-a$workspace-a$favorite", true),
      ("user-b", "workspace-a", "userdata$user-a$workspace-a$favorite", false),
      ("user-a", "workspace-b", "userdata$user-a$workspace-a$favorite", false),
      (
        "user-a",
        "workspace-a",
        "userdata$__local__$workspace-a$favorite",
        false,
      ),
      ("user-a", "workspace-a", "userdata$user-a$workspace-a$unknown", false),
      ("user-a", "workspace-a", "db$workspace-a$unknown", false),
    ];
    for (user_id, workspace_id, doc_id, expected) in cases {
      assert_eq!(
        authorize_reserved_doc_subject(user_id.to_string(), workspace_id.to_string(), doc_id.to_string()),
        expected
      );
    }
  }
}
