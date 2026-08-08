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
use tokio::sync::{Mutex, Notify};
pub(super) use types::EmbeddingTarget;
use types::*;

use super::{RuntimeError, RuntimeResult, copilot::BackgroundEmbeddingProvider};
use crate::runtime::object_storage::ObjectStorageService;

pub(super) struct EmbeddingService {
  pool: PgPool,
  object_storage: RwLock<Arc<ObjectStorageService>>,
  provider: BackgroundEmbeddingProvider,
  wake: Notify,
  worker: Mutex<Option<worker::WorkerHandle>>,
  candidate_cancellations: StdMutex<HashMap<String, Option<tokio::sync::watch::Sender<bool>>>>,
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
      worker: Mutex::new(None),
      candidate_cancellations: StdMutex::new(HashMap::new()),
    })
  }

  pub(super) async fn start(self: &Arc<Self>) {
    let mut worker = self.worker.lock().await;
    if worker.is_none() {
      *worker = Some(worker::start(Arc::clone(self)));
    }
  }

  pub(super) async fn stop(&self) {
    if let Some(worker) = self.worker.lock().await.take() {
      worker.stop().await;
    }
  }

  pub(super) async fn is_running(&self) -> bool {
    self.worker.lock().await.is_some()
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
  ) -> RuntimeResult<()> {
    source::sync_documents(&self.pool, workspace_id, documents, reconcile).await?;
    self.wake();
    Ok(())
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
  uuid::Uuid::parse_str(&artifact.id).map_err(|_| RuntimeError::invalid_input("artifact_id_invalid"))?;
  source::register_artifact(pool, artifact).await
}
