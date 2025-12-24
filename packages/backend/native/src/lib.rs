#![deny(clippy::all)]

mod utils;

pub mod doc;
pub mod doc_loader;
pub mod file_type;
pub mod hashcash;
pub mod html_sanitize;
pub mod tiktoken;

use std::fmt::{Debug, Display};

use napi::{bindgen_prelude::*, Error, Result, Status};
use y_octo::Doc;

#[cfg(not(target_arch = "arm"))]
#[global_allocator]
static ALLOC: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[macro_use]
extern crate napi_derive;

fn map_err_inner<T, E: Display + Debug>(v: std::result::Result<T, E>, status: Status) -> Result<T> {
  match v {
    Ok(val) => Ok(val),
    Err(e) => {
      dbg!(&e);
      Err(Error::new(status, e.to_string()))
    }
  }
}

macro_rules! map_err {
  ($val: expr) => {
    map_err_inner($val, Status::GenericFailure)
  };
  ($val: expr, $stauts: ident) => {
    map_err_inner($val, $stauts)
  };
}

/// Merge updates in form like `Y.applyUpdate(doc, update)` way and return the
/// result binary.
#[napi(catch_unwind)]
pub fn merge_updates_in_apply_way(updates: Vec<Buffer>) -> Result<Buffer> {
  let mut doc = Doc::default();
  for update in updates {
    map_err!(doc.apply_update_from_binary_v1(update.as_ref()))?;
  }

  let buf = map_err!(doc.encode_update_v1())?;

  Ok(buf.into())
}

#[napi]
pub const AFFINE_PRO_PUBLIC_KEY: Option<&'static str> = std::option_env!("AFFINE_PRO_PUBLIC_KEY");

#[napi]
pub const AFFINE_PRO_LICENSE_AES_KEY: Option<&'static str> =
  std::option_env!("AFFINE_PRO_LICENSE_AES_KEY");
