mod anti_entropy;
mod document;
mod workspace;
mod workspace_state;

pub(super) const DOCUMENT_LEASE_SECONDS: i64 = 300;
pub(super) const LEASE_SECONDS: i64 = 300;
pub(super) const RECONCILE_BATCH: i64 = 100;

struct WorkspaceReconcileContext<'a> {
  pool: &'a sqlx::PgPool,
  embedded: &'a crate::search_index::EmbeddedSearchIndex,
  remote: Option<&'a SearchProvider>,
  generation: &'a ActiveGeneration,
  workspace_id: &'a str,
  fence: i64,
}

enum WorkspaceStep {
  Continue(WorkspacePhase),
  Quiet(WorkspacePhase),
  Complete,
  Failed,
}

pub(super) use anti_entropy::sweep_generation_orphans;
use anti_entropy::{
  CANONICAL_SNAPSHOT_BATCH_SQL, ProjectionExpectation, provider_projection_matches, reconcile_source_documents,
  reconcile_stale_provider_rows, sweep_deleted_workspace,
};
use document::upsert_document;
pub(super) use workspace::reconcile_workspace;
use workspace_state::{
  WorkspacePhase, checkpoint_workspace, checkpoint_workspace_after, claim_workspace, complete_workspace,
  delete_workspace_state, mark_workspace_failed, renew_workspace_lease,
};

use super::{
  ActiveGeneration, ProjectionInput, SearchChange, SearchProvider, SearchTable, WORKSPACE_RECONCILE_FAILED,
  project_document, projection_external_id, provider_payload,
};
