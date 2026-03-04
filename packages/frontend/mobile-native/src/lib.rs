mod error;
mod ffi_types;
mod payload_codec;
mod storage;
#[cfg(test)]
mod tests;

#[cfg(any(target_os = "android", target_os = "ios", test))]
#[cfg_attr(all(test, not(any(target_os = "android", target_os = "ios"))), allow(dead_code))]
pub(crate) mod cache;
use affine_common::hashcash::Stamp;
pub(crate) use error::Result;
pub use error::UniffiError;
pub use ffi_types::{
  Blob, BlockInfo, CrawlResult, DocClock, DocRecord, DocUpdate, ListedBlob, MatchRange, SearchHit, SetBlob,
};
pub use storage::{DocStoragePool, new_doc_storage_pool};

uniffi::setup_scaffolding!("affine_mobile_native");

#[uniffi::export]
pub fn hashcash_mint(resource: String, bits: u32) -> String {
  Stamp::mint(resource, Some(bits)).format()
}
