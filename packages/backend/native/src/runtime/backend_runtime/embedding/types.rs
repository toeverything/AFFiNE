use chrono::{DateTime, Utc};
use sqlx::FromRow;

#[derive(Clone, Debug)]
pub(in crate::runtime::backend_runtime) struct EmbeddingTarget {
  pub(in crate::runtime::backend_runtime) fingerprint: String,
  pub(in crate::runtime::backend_runtime) route_source: String,
  pub(in crate::runtime::backend_runtime) provider: String,
  pub(in crate::runtime::backend_runtime) model_id: String,
  pub(in crate::runtime::backend_runtime) endpoint_fingerprint: String,
}

#[derive(Clone, Debug, FromRow)]
pub(in crate::runtime::backend_runtime) struct WorkspaceEmbeddingState {
  pub(in crate::runtime::backend_runtime) workspace_id: String,
  pub(in crate::runtime::backend_runtime) active_index_id: Option<uuid::Uuid>,
  pub(in crate::runtime::backend_runtime) index_epoch: i64,
  pub(in crate::runtime::backend_runtime) runtime_state: String,
  pub(in crate::runtime::backend_runtime) reason_code: Option<String>,
}

#[derive(Clone, Debug, FromRow)]
pub(super) struct ProjectionClaim {
  pub(super) source_id: uuid::Uuid,
  pub(super) index_id: uuid::Uuid,
  pub(super) workspace_id: String,
  pub(super) index_epoch: i64,
  pub(super) source_kind: String,
  pub(super) source_key: String,
  pub(super) content_revision: String,
  pub(super) descriptor_revision: String,
  pub(super) recipe_revision: String,
  pub(super) storage_scope: Option<String>,
  pub(super) storage_key: Option<String>,
  pub(super) file_name: Option<String>,
  pub(super) mime_type: Option<String>,
  pub(super) document_projection: Option<String>,
  pub(super) lease_token: i64,
  pub(super) lease_until: DateTime<Utc>,
  pub(super) index_fingerprint: String,
}

#[derive(Clone, Debug, FromRow)]
pub(super) struct IndexProbeClaim {
  pub(super) id: uuid::Uuid,
  pub(super) workspace_id: String,
  pub(super) fingerprint: String,
  pub(super) probe_lease_owner: String,
}

#[derive(Clone, Debug)]
pub(super) enum ChunkLocator {
  Document {
    doc_id: String,
    unit_id: String,
    visibility: String,
    block_id: Option<String>,
    element_id: Option<String>,
    frame_id: Option<String>,
  },
  Artifact {
    artifact_id: uuid::Uuid,
  },
}

#[derive(Clone, Debug)]
pub(super) struct MaterializedChunk {
  pub(super) index: i32,
  pub(super) content: String,
  pub(super) embedding: Vec<f32>,
  pub(super) locator: ChunkLocator,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum FailureClass {
  RetryableProjection,
  RetryableIndex,
  Terminal,
}

#[derive(Clone, Debug)]
pub(super) struct EmbeddingFailure {
  pub(super) code: &'static str,
  pub(super) detail: Option<String>,
  pub(super) class: FailureClass,
}

#[derive(Clone, Debug, FromRow)]
pub(in crate::runtime::backend_runtime) struct EmbeddingQueueCounts {
  pub(in crate::runtime::backend_runtime) pending: i64,
  pub(in crate::runtime::backend_runtime) running: i64,
  pub(in crate::runtime::backend_runtime) retry_wait: i64,
  pub(in crate::runtime::backend_runtime) ready: i64,
  pub(in crate::runtime::backend_runtime) failed: i64,
  pub(in crate::runtime::backend_runtime) expired_leases: i64,
  pub(in crate::runtime::backend_runtime) oldest_pending_seconds: i64,
  pub(in crate::runtime::backend_runtime) active_vector_rows: i64,
  pub(in crate::runtime::backend_runtime) inactive_vector_rows: i64,
  pub(in crate::runtime::backend_runtime) index_bytes: i64,
  pub(in crate::runtime::backend_runtime) retrying_indexes: i64,
  pub(in crate::runtime::backend_runtime) max_index_retry_seconds: i64,
}

#[derive(Clone, Debug, Default)]
pub(super) struct EmbeddingGcResult {
  pub(super) indexes: u64,
  pub(super) chunks: u64,
}

pub(super) fn validate_vectors(chunks: &[MaterializedChunk]) -> bool {
  chunks
    .iter()
    .all(|chunk| chunk.embedding.len() == 1024 && chunk.embedding.iter().all(|value| value.is_finite()))
}

pub(super) fn failure_class(code: &str) -> FailureClass {
  match code {
    "provider_unavailable" | "provider_unauthorized" | "provider_rate_limited" => FailureClass::RetryableIndex,
    "object_not_found" | "object_changed" | "storage_unavailable" | "commit_failed" => {
      FailureClass::RetryableProjection
    }
    _ => FailureClass::Terminal,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn vectors_require_exact_finite_dimension() {
    let chunk = |embedding| MaterializedChunk {
      index: 0,
      content: "content".to_string(),
      embedding,
      locator: ChunkLocator::Artifact {
        artifact_id: uuid::Uuid::nil(),
      },
    };
    assert!(validate_vectors(&[chunk(vec![0.0; 1024])]));
    assert!(!validate_vectors(&[chunk(vec![0.0; 1023])]));
    let mut invalid = vec![0.0; 1024];
    invalid[3] = f32::NAN;
    assert!(!validate_vectors(&[chunk(invalid)]));
  }

  #[test]
  fn errors_have_one_retry_owner() {
    assert_eq!(failure_class("provider_unavailable"), FailureClass::RetryableIndex);
    assert_eq!(failure_class("object_changed"), FailureClass::RetryableProjection);
    assert_eq!(failure_class("unsupported_format"), FailureClass::Terminal);
  }
}
