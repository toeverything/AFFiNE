pub mod anti_entropy;
mod document;
mod inventory;
mod workspace;
mod workspace_state;

use sqlx::PgPool;

pub use anti_entropy::{OrphanGcFence, capture_orphan_gc_high_water, sweep_generation_orphans};
pub use workspace::reconcile_workspace;

use crate::embedded::EmbeddedSearchIndex;
use crate::generation::ActiveGeneration;
use crate::provider::SearchProvider;

const RECONCILE_BATCH: i64 = 100;
const LEASE_SECONDS: i64 = 120;
const DOCUMENT_LEASE_SECONDS: i64 = 120;

struct WorkspaceReconcileContext<'a> {
  pub pool: &'a PgPool,
  pub embedded: &'a EmbeddedSearchIndex,
  pub remote: Option<&'a SearchProvider>,
  pub generation: &'a ActiveGeneration,
  pub workspace_id: &'a str,
  pub fence: i64,
}

enum WorkspaceStep {
  Continue(workspace_state::WorkspacePhase),
  Quiet(workspace_state::WorkspacePhase),
  Complete,
}
