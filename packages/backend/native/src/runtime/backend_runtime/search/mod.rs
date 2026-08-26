mod generation;
mod projection;
mod provider;
mod query;
mod query_runtime;
mod result_filter;
mod runtime;
mod types;
mod worker;

use generation::{ActiveGeneration, activate, cleanup_retired_generation, config_hash, ensure, load_active};
use projection::{ProjectionInput, project_document};
use provider::{SearchChange, SearchProvider, projection_external_id};
use query::{compile, compile_aggregate};
use result_filter::{candidates, retain_visible_nodes};
pub(super) use runtime::SearchRuntime;
use types::{AggregateOptions, RuntimeSearchQuery, SearchOptions, SearchTable};
pub(super) use types::{RuntimeAggregateRequest, RuntimeSearchRequest};
use worker::{reconcile_workspace, sweep_generation_orphans};

use super::{
  permission::{AuthorizedSearchScope, DocReadScope, PermissionAuthorizer, SearchActor},
  webpki_tls_config,
};

const SCHEMA_FINGERPRINT: i32 = 1;
const WORKSPACE_RECONCILE_FAILED: &str = "search_workspace_reconcile_failed";

#[cfg(test)]
pub(crate) static SEARCH_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

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
mod tests {
  use super::SCHEMA_FINGERPRINT;

  #[test]
  fn terminal_schema_uses_one_generation_version() {
    assert_eq!(SCHEMA_FINGERPRINT, 1);
  }

  #[test]
  fn external_document_ids_keep_document_and_block_tables_distinct() {
    let cases = [("workspace/doc", false), ("workspace/doc/block", true)];
    for (external_id, block) in cases {
      assert_eq!(external_id.matches('/').count() >= 2, block);
    }
  }
}
