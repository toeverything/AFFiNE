#![deny(clippy::all)]

mod utils;

pub mod content_policy;
pub mod doc;
pub mod doc_loader;
pub mod entitlement;
pub mod file_type;
pub mod hashcash;
pub mod html_sanitize;
pub mod image;
pub mod license;
pub mod llm;
pub mod permission;
pub mod runtime;
pub mod safe_fetch;
pub mod tiktoken;

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

#[napi]
pub const AFFINE_PRO_PUBLIC_KEY: Option<&'static str> = std::option_env!("AFFINE_PRO_PUBLIC_KEY");

#[napi]
pub const AFFINE_PRO_LICENSE_AES_KEY: Option<&'static str> = std::option_env!("AFFINE_PRO_LICENSE_AES_KEY");

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
}
