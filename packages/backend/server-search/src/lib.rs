//! Pure-Rust search indexing, projection, and query runtime (`server-search`).

pub mod acl;
pub mod config;
pub mod doc_extract;
pub mod embedded;
pub mod error;
pub mod generation;
pub mod lease;
pub mod projection;
pub mod provider;
pub mod query;
pub mod result_filter;
pub mod runtime;
pub mod types;
pub mod worker;

pub use config::SearchConfig;
pub use embedded::EmbeddedSearchIndex;
pub use error::{SearchError, SearchResult};
pub use lease::{
  LOCKLESS_V2_CHECKPOINT_KIND, LOCKLESS_V2_CHECKPOINT_SCOPE, LOCKLESS_V2_LEASE_TTL_SECONDS, LOCKLESS_V2_RENEW_INTERVAL,
  expire_lockless_v2_lease, is_lockless_v2_active, renew_lockless_v2_lease, renew_lockless_v2_lease_for,
};
pub use runtime::SearchRuntime;
pub use types::{
  AggregateHitsOptions, AggregateOptions, AggregateRequest, SearchHighlight, SearchOptions, SearchPagination,
  SearchQuery, SearchRequest, SearchTable,
};
pub use worker::OrphanGcFence;

use server_domain::acl::{ReservedDocClass, classify_reserved_doc};
use sha2::{Digest, Sha256};
use sqlx::PgConnection;

/// The search projection schema. Raise it when extraction changes indexed
/// fields, so that startup builds a new generation and reprojects every doc.
pub const SCHEMA_FINGERPRINT: i32 = 1;
pub(crate) const WORKSPACE_RECONCILE_FAILED: &str = "search_workspace_reconcile_failed";
pub(crate) const DOCUMENT_PROJECTION_FAILED: &str = "search_document_projection_failed";
pub(crate) const EMBEDDED_GENERATION_LOST: &str = "search_embedded_generation_lost";

pub(crate) fn exact_token(value: &str) -> String {
  Sha256::digest(value.as_bytes())
    .iter()
    .map(|byte| format!("{byte:02x}"))
    .collect()
}

pub(crate) fn provider_payload(payload: &serde_json::Value) -> serde_json::Value {
  let mut payload = payload.clone();
  if let Some(object) = payload.as_object_mut() {
    object.remove("acl_read_user_ids");
  }
  payload
}

pub fn is_ordinary_workspace_doc(workspace_id: &str, doc_id: &str) -> bool {
  matches!(classify_reserved_doc(workspace_id, doc_id), ReservedDocClass::Ordinary)
}

pub(crate) async fn workspace_lifecycle_active_in(connection: &mut PgConnection) -> SearchResult<bool> {
  sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints WHERE kind = 'workspace_doc_lifecycle_activation' AND scope = 'global' AND status = 'active')",
  )
  .fetch_one(connection)
  .await
  .map_err(|error| SearchError::database("check workspace lifecycle activation", error))
}

pub(crate) async fn workspace_lifecycle_completed(
  connection: &mut PgConnection,
  workspace_id: &str,
) -> SearchResult<bool> {
  sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints WHERE kind = 'workspace_doc_lifecycle' AND scope = $1 AND status = 'completed')",
  )
  .bind(workspace_id)
  .fetch_one(connection)
  .await
  .map_err(|error| SearchError::database("check workspace lifecycle completion", error))
}
