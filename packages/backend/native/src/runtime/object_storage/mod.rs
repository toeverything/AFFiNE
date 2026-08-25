mod assetpack;
mod backend;
pub(crate) mod client;
pub(crate) mod config;
pub(crate) mod error;
mod fs;
mod service;
#[cfg(test)]
mod tests;
pub(crate) mod types;

pub(in crate::runtime) use backend::{FsStorageConfig, StorageBackendConfig};
#[cfg(test)]
pub(in crate::runtime) use config::ObjectStorageConfig;
pub(crate) use service::ObjectStorageService;

pub(super) use super::webpki_tls_config;

pub(in crate::runtime) const MAX_BLOB_SIZE: i64 = i32::MAX as i64;
