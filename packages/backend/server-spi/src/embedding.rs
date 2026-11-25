//! Copilot embedding, workspace artifact, and ignored-document SPI boundary.

use chrono::{DateTime, Utc};
use server_types::DomainError;

/// Pagination parameters for offset/limit listing of ignored docs and artifacts.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct EmbeddingPagination {
  pub first: Option<i64>,
  pub offset: Option<i64>,
}

/// RAII handle representing a held workspace artifact upload lock.
#[async_trait::async_trait]
pub trait WorkspaceArtifactLock: Send + Sync {
  /// Explicitly awaits release of the underlying lock before returning to the caller.
  async fn release(&mut self);
}

pub type BoxedWorkspaceArtifactLock = Box<dyn WorkspaceArtifactLock>;

/// Ignored document record joined with document metadata and author info.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkspaceIgnoredDocRecord {
  pub doc_id: String,
  pub created_at: DateTime<Utc>,
  pub doc_created_at: Option<DateTime<Utc>>,
  pub doc_updated_at: Option<DateTime<Utc>>,
  pub title: Option<String>,
  pub created_by: Option<String>,
  pub created_by_avatar: Option<String>,
  pub updated_by: Option<String>,
}

/// Paginated ignored documents result.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct WorkspaceIgnoredDocPage {
  pub items: Vec<WorkspaceIgnoredDocRecord>,
  pub total_count: i64,
}

/// Workspace artifact record with its current embedding status.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkspaceArtifactRecord {
  pub artifact_id: String,
  pub workspace_id: String,
  pub file_name: String,
  pub media_type: String,
  pub size: i64,
  pub content_hash: String,
  pub embedding_status: String,
  pub created_at: DateTime<Utc>,
}

/// Paginated workspace artifacts result.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct WorkspaceArtifactPage {
  pub items: Vec<WorkspaceArtifactRecord>,
  pub total_count: i64,
}

/// Input for uploading and registering a workspace library artifact.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AddWorkspaceArtifactInput {
  pub workspace_id: String,
  pub file_name: String,
  pub mime_type: String,
  pub bytes: Vec<u8>,
}

/// Commercial SPI for workspace embedding config, artifacts, and ignored documents.
#[async_trait::async_trait]
pub trait CopilotEmbeddingSpi: Send + Sync + 'static {
  /// Returns true when the commercial embedding runtime is enabled and ready.
  fn is_enabled(&self) -> bool {
    false
  }

  /// Lists all ignored documents for a workspace in descending `created_at` order.
  async fn list_all_ignored_docs(&self, workspace_id: &str) -> Result<Vec<WorkspaceIgnoredDocRecord>, DomainError>;

  /// Lists ignored documents with pagination and total count.
  async fn list_ignored_docs(
    &self,
    workspace_id: &str,
    pagination: EmbeddingPagination,
  ) -> Result<WorkspaceIgnoredDocPage, DomainError>;

  /// Atomically adds and removes ignored documents for a workspace, returning affected count.
  async fn update_ignored_docs(
    &self,
    workspace_id: &str,
    add: Vec<String>,
    remove: Vec<String>,
  ) -> Result<i32, DomainError>;

  /// Lists library-owned ready workspace artifacts with pagination and total count.
  async fn list_artifacts(
    &self,
    workspace_id: &str,
    pagination: EmbeddingPagination,
  ) -> Result<WorkspaceArtifactPage, DomainError>;

  /// Acquires the workspace-level artifact upload lock (`COPILOT_LOCKER:workspace:{id}`).
  async fn acquire_workspace_artifact_lock(
    &self,
    workspace_id: &str,
  ) -> Result<BoxedWorkspaceArtifactLock, DomainError>;

  /// Uploads and registers a library-owned workspace artifact for embedding.
  async fn add_workspace_artifact(
    &self,
    input: AddWorkspaceArtifactInput,
  ) -> Result<WorkspaceArtifactRecord, DomainError>;

  /// Removes a workspace artifact from the library and tombstones its embedding source.
  async fn remove_workspace_artifact(&self, workspace_id: &str, artifact_id: &str) -> Result<bool, DomainError>;
}

/// Default community implementation that reports Copilot embedding as unavailable.
#[derive(Clone, Copy, Debug, Default)]
pub struct CommunityCopilotEmbeddingSpi;

fn unavailable_error() -> DomainError {
  DomainError::Forbidden("copilot_embedding_unavailable".into())
}

#[async_trait::async_trait]
impl CopilotEmbeddingSpi for CommunityCopilotEmbeddingSpi {
  async fn list_all_ignored_docs(&self, _workspace_id: &str) -> Result<Vec<WorkspaceIgnoredDocRecord>, DomainError> {
    Err(unavailable_error())
  }

  async fn list_ignored_docs(
    &self,
    _workspace_id: &str,
    _pagination: EmbeddingPagination,
  ) -> Result<WorkspaceIgnoredDocPage, DomainError> {
    Err(unavailable_error())
  }

  async fn update_ignored_docs(
    &self,
    _workspace_id: &str,
    _add: Vec<String>,
    _remove: Vec<String>,
  ) -> Result<i32, DomainError> {
    Err(unavailable_error())
  }

  async fn list_artifacts(
    &self,
    _workspace_id: &str,
    _pagination: EmbeddingPagination,
  ) -> Result<WorkspaceArtifactPage, DomainError> {
    Err(unavailable_error())
  }

  async fn acquire_workspace_artifact_lock(
    &self,
    _workspace_id: &str,
  ) -> Result<BoxedWorkspaceArtifactLock, DomainError> {
    Err(unavailable_error())
  }

  async fn add_workspace_artifact(
    &self,
    _input: AddWorkspaceArtifactInput,
  ) -> Result<WorkspaceArtifactRecord, DomainError> {
    Err(unavailable_error())
  }

  async fn remove_workspace_artifact(&self, _workspace_id: &str, _artifact_id: &str) -> Result<bool, DomainError> {
    Err(unavailable_error())
  }
}
