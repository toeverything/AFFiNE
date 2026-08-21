mod checkpoint;
mod generation;
mod projection;
mod provider;
mod query;
mod runtime;
mod store;
mod types;
mod worker;

pub(super) use runtime::SearchRuntime;
pub(super) use types::{RuntimeAggregateRequest, RuntimeSearchRequest};

pub(super) use super::webpki_tls_config;

const SCHEMA_FINGERPRINT: &str = "search-runtime-v5";

fn exact_token(value: &str) -> String {
  use sha2::{Digest, Sha256};
  Sha256::digest(value.as_bytes())
    .iter()
    .map(|byte| format!("{byte:02x}"))
    .collect()
}

fn provider_payload(payload: &serde_json::Value) -> serde_json::Value {
  let mut payload = payload.clone();
  if let Some(object) = payload.as_object_mut() {
    object.remove("acl_read_user_ids");
  }
  payload
}

#[cfg(test)]
mod tests;
