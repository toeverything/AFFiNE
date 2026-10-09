mod observe;
pub use observe::{ObservedValue, observe};
mod text;
mod tree;
pub use text::{TextMerge, TextPlan, merge_text};
pub use tree::{NodeId, ProjectedNode, TreePlan, merge_properties, merge_tree};
use y_octo::{Any, Id, Text, TextAttributes, TextDeltaOp, TextIdentityRun, TextInsert, TypeIdentity, Value};

#[derive(Debug, thiserror::Error, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum MergeError {
  #[error("ambiguous_identity")]
  AmbiguousIdentity,
  #[error("concurrent_edit")]
  ConcurrentEdit,
  #[error("unsupported_metadata_effect: {0}")]
  UnsupportedMetadataEffect(String),
  #[error("insufficient_evidence")]
  InsufficientEvidence,
  #[error("work_budget_exceeded")]
  BudgetExceeded,
  #[error("invalid_projection")]
  InvalidProjection,
}

impl From<y_octo::JwstCodecError> for MergeError {
  fn from(_: y_octo::JwstCodecError) -> Self {
    Self::InsufficientEvidence
  }
}

/// Shared across all ambiguous regions of one merge request.
#[derive(Debug)]
pub struct WorkBudget {
  remaining: usize,
}
impl Default for WorkBudget {
  fn default() -> Self {
    Self { remaining: 4_000_000 }
  }
}
impl WorkBudget {
  pub fn new(work: usize) -> Self {
    Self { remaining: work }
  }
  pub(crate) fn spend(&mut self, work: usize) -> Result<(), MergeError> {
    self.remaining = self.remaining.checked_sub(work).ok_or(MergeError::BudgetExceeded)?;
    Ok(())
  }
}
