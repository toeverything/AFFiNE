pub(crate) mod client;
pub(crate) mod config;
pub(crate) mod error;
#[cfg(test)]
mod tests;
pub(crate) mod types;

pub(crate) use config::ObjectStorageConfig;
pub(crate) use types::StorageProviderConfig;
