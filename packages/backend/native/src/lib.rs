#![deny(clippy::all)]

mod auth_session;
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
use y_octo::{Doc, Update};

#[cfg(not(target_arch = "arm"))]
#[global_allocator]
static ALLOC: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[macro_use]
extern crate napi_derive;

/// Merge updates in form like `Y.applyUpdate(doc, update)` way and return the
/// result binary.
#[napi(catch_unwind)]
pub fn merge_updates_in_apply_way(updates: Vec<Buffer>) -> Result<Buffer> {
  let mut doc = Doc::default();
  for update in updates {
    map_napi_err(doc.apply_update_from_binary_v1(update.as_ref()), Status::GenericFailure)?;
  }

  let buf = map_napi_err(doc.encode_update_v1(), Status::GenericFailure)?;

  Ok(buf.into())
}

/// Check whether a Yjs update binary can be decoded without applying it to a
/// document state.
#[napi(catch_unwind)]
pub async fn validate_doc_update(update: Buffer) -> Result<bool> {
  let update = update.to_vec();
  tokio::task::spawn_blocking(move || Update::decode_v1(update).is_ok())
    .await
    .map_err(|err| napi::Error::from_reason(format!("Doc update validation task failed: {err}")))
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
    let err = match merge_updates_in_apply_way(vec![Buffer::from(vec![0])]) {
      Ok(_) => panic!("expected error"),
      Err(err) => err,
    };
    assert_eq!(err.status, Status::GenericFailure);
  }

  #[test]
  fn y_octo_update_decode_accepts_valid_update_and_rejects_invalid_update() {
    assert!(Update::decode_v1(vec![0, 0]).is_ok());
    assert!(Update::decode_v1(vec![0]).is_err());
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
