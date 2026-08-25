mod candidate;
mod index;
mod read;
mod source;
mod store;
mod types;
mod worker;

use std::{
  collections::HashMap,
  sync::{Arc, Mutex as StdMutex, RwLock},
};

use sqlx::PgPool;
use tokio::sync::Notify;
pub(super) use types::EmbeddingTarget;
use types::*;

use super::{RuntimeError, RuntimeResult, copilot::BackgroundEmbeddingProvider};
use crate::runtime::object_storage::ObjectStorageService;

fn extraction_file_name(mime_type: &str) -> String {
  let extension = match mime_type {
    "application/pdf" => "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => "docx",
    "text/csv" => "csv",
    "text/markdown" => "md",
    "text/plain" => "txt",
    _ => "bin",
  };
  format!("artifact.{extension}")
}

pub(super) struct EmbeddingService {
  pool: PgPool,
  object_storage: RwLock<Arc<ObjectStorageService>>,
  provider: BackgroundEmbeddingProvider,
  wake: Notify,
  candidate_cancellations: StdMutex<HashMap<String, Option<tokio::sync::watch::Sender<bool>>>>,
}

pub(super) struct EmbeddingWorker {
  handle: Option<worker::WorkerHandle>,
}

impl EmbeddingWorker {
  pub(super) fn start(service: Arc<EmbeddingService>) -> Self {
    Self {
      handle: Some(worker::start(service)),
    }
  }

  pub(super) async fn stop(mut self) {
    if let Some(handle) = self.handle.take() {
      handle.stop().await;
    }
  }

  pub(super) fn is_running(&self) -> bool {
    self.handle.is_some()
  }
}

impl EmbeddingService {
  pub(super) fn new(
    pool: PgPool,
    object_storage: Arc<ObjectStorageService>,
    provider: BackgroundEmbeddingProvider,
  ) -> Arc<Self> {
    Arc::new(Self {
      pool,
      object_storage: RwLock::new(object_storage),
      provider,
      wake: Notify::new(),
      candidate_cancellations: StdMutex::new(HashMap::new()),
    })
  }

  fn wake(&self) {
    self.wake.notify_one();
  }

  pub(super) async fn sync_workspace(
    &self,
    workspace_id: &str,
    enabled: bool,
    target: Option<EmbeddingTarget>,
  ) -> RuntimeResult<WorkspaceEmbeddingState> {
    let state = index::sync_workspace(&self.pool, workspace_id, enabled, target).await?;
    self.wake();
    Ok(state)
  }

  pub(super) async fn sync_documents(
    &self,
    workspace_id: &str,
    documents: &[crate::runtime::types::DocumentEmbeddingProjectionInput],
    reconcile: bool,
    priority: i32,
  ) -> RuntimeResult<()> {
    source::sync_documents(&self.pool, workspace_id, documents, reconcile, priority).await?;
    self.wake();
    Ok(())
  }

  pub(super) async fn wait_for_documents(
    &self,
    workspace_id: &str,
    documents: &[crate::runtime::types::DocumentEmbeddingProjectionInput],
    timeout: std::time::Duration,
  ) -> RuntimeResult<()> {
    if documents.is_empty() {
      return Ok(());
    }
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
      let (ready, failed) = source::document_readiness(&self.pool, workspace_id, documents).await?;
      if failed > 0 {
        return Err(RuntimeError::invalid_state("embedding_selected_sources_failed"));
      }
      if ready == documents.len() as i64 {
        return Ok(());
      }
      if tokio::time::Instant::now() >= deadline {
        return Err(RuntimeError::invalid_state("embedding_selected_sources_processing"));
      }
      tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }
  }

  pub(super) async fn reconcile_documents(&self, workspace_id: &str) -> RuntimeResult<()> {
    source::reconcile_documents(&self.pool, workspace_id).await?;
    self.wake();
    Ok(())
  }

  pub(super) async fn health_counts(&self) -> RuntimeResult<EmbeddingQueueCounts> {
    store::queue_counts(&self.pool).await
  }

  fn object_storage(&self) -> RuntimeResult<Arc<ObjectStorageService>> {
    self
      .object_storage
      .read()
      .map(|storage| Arc::clone(&storage))
      .map_err(|_| RuntimeError::invalid_state("embedding object storage lock poisoned"))
  }

  pub(super) fn reload_object_storage(&self, storage: Arc<ObjectStorageService>) -> RuntimeResult<()> {
    *self
      .object_storage
      .write()
      .map_err(|_| RuntimeError::invalid_state("embedding object storage lock poisoned"))? = storage;
    self.wake();
    Ok(())
  }

  pub(super) async fn read_source_content(
    &self,
    input: &crate::runtime::types::ReadEmbeddingSourceContentInput,
  ) -> RuntimeResult<crate::runtime::types::RuntimeEmbeddingSourceContent> {
    read::read_source_content(&self.pool, self.object_storage()?, input).await
  }

  pub(super) async fn match_candidates(
    &self,
    input: &crate::runtime::types::MatchEmbeddingCandidatesInput,
  ) -> RuntimeResult<Vec<crate::runtime::types::RuntimeEmbeddingCandidate>> {
    let Some(request_id) = input.request_id.as_deref() else {
      return candidate::match_candidates(&self.pool, &self.provider, input, None).await;
    };
    if request_id.is_empty() || request_id.len() > 128 {
      return Err(RuntimeError::invalid_input("embedding_candidate_request_id_invalid"));
    }
    let (sender, mut receiver) = tokio::sync::watch::channel(false);
    {
      let mut cancellations = self
        .candidate_cancellations
        .lock()
        .map_err(|_| RuntimeError::invalid_state("embedding_candidate_cancellation_lock_poisoned"))?;
      if cancellations.remove(request_id).is_some() {
        return Err(RuntimeError::invalid_state("embedding_search_aborted"));
      }
      cancellations.insert(request_id.to_string(), Some(sender));
    }
    let result = candidate::match_candidates(&self.pool, &self.provider, input, Some(&mut receiver)).await;
    self
      .candidate_cancellations
      .lock()
      .map_err(|_| RuntimeError::invalid_state("embedding_candidate_cancellation_lock_poisoned"))?
      .remove(request_id);
    result
  }

  pub(super) fn cancel_candidate_request(&self, request_id: &str) -> RuntimeResult<()> {
    let mut cancellations = self
      .candidate_cancellations
      .lock()
      .map_err(|_| RuntimeError::invalid_state("embedding_candidate_cancellation_lock_poisoned"))?;
    if let Some(Some(sender)) = cancellations.remove(request_id) {
      sender.send_replace(true);
    } else {
      cancellations.insert(request_id.to_string(), None);
    }
    Ok(())
  }

  async fn claim(&self, owner: &str) -> RuntimeResult<Option<ProjectionClaim>> {
    store::claim_projection(&self.pool, owner).await
  }

  async fn claim_probe(&self, owner: &str) -> RuntimeResult<Option<IndexProbeClaim>> {
    store::claim_index_probe(&self.pool, owner).await
  }

  async fn complete_probe(&self, claim: &IndexProbeClaim) -> RuntimeResult<()> {
    store::complete_index_probe(&self.pool, claim).await
  }

  async fn fail_probe(&self, claim: &IndexProbeClaim, code: &str) -> RuntimeResult<()> {
    store::fail_index_probe(&self.pool, claim, code).await
  }

  async fn commit(&self, claim: &ProjectionClaim, chunks: &[MaterializedChunk]) -> RuntimeResult<String> {
    store::commit_token(&self.pool, claim, chunks).await
  }

  async fn fail(&self, claim: &ProjectionClaim, failure: EmbeddingFailure) -> RuntimeResult<()> {
    store::fail_projection(&self.pool, claim, failure).await
  }

  async fn gc(&self) -> RuntimeResult<EmbeddingGcResult> {
    source::reconcile_artifacts(&self.pool).await?;
    let result = store::gc(&self.pool).await?;
    Ok(result)
  }
}

pub(in crate::runtime::backend_runtime) async fn register_artifact_source(
  pool: &PgPool,
  artifact: &crate::runtime::types::RuntimeWorkspaceArtifact,
) -> RuntimeResult<()> {
  let schema_ready: bool = sqlx::query_scalar("SELECT to_regclass('embedding_sources') IS NOT NULL")
    .fetch_one(pool)
    .await
    .map_err(|error| RuntimeError::database("Embedding source schema health check failed", error))?;
  if !schema_ready {
    return Ok(());
  }
  uuid::Uuid::parse_str(&artifact.id).map_err(|_| RuntimeError::invalid_input("artifact_id_invalid"))?;
  source::register_artifact(pool, artifact).await
}
