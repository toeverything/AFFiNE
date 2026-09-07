use super::*;

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn embedding_health(&self) -> Result<EmbeddingHealth> {
    self
      .embedding_health
      .read()
      .map(|health| health.clone())
      .map_err(|_| napi_error("embedding health lock poisoned"))
  }

  #[napi]
  pub async fn sync_embedding_state(
    &self,
    input: types::SyncEmbeddingStateInput,
  ) -> Result<types::RuntimeEmbeddingWorkspaceState> {
    let embedding = self
      .embedding
      .lock()
      .await
      .as_ref()
      .cloned()
      .ok_or_else(|| napi_error("embedding_unavailable"))?;
    let target = if input.enabled {
      match self.resolve_background_embedding_target(&input.workspace_id).await {
        Ok(target) => Some(embedding::EmbeddingTarget {
          fingerprint: target.fingerprint,
          route_source: target.route_source.to_string(),
          provider: target.provider,
          model_id: target.model_id,
          endpoint_fingerprint: target.endpoint_fingerprint,
        }),
        Err(RuntimeError::InvalidState(reason) | RuntimeError::InvalidInput(reason))
          if matches!(
            reason.as_str(),
            "embedding_route_unavailable"
              | "no_compatible_target"
              | "managed_preset_unavailable"
              | "byok_disabled"
              | "copilot_disabled"
          ) =>
        {
          None
        }
        Err(error) => return Err(to_napi_error(error)),
      }
    } else {
      None
    };
    let state = embedding
      .sync_workspace(&input.workspace_id, input.enabled, target)
      .await
      .map_err(to_napi_error)?;
    let reconcile_documents = input.reconcile_documents.unwrap_or(false);
    let priority = input.priority.unwrap_or(100);
    if !(0..=1000).contains(&priority) {
      return Err(napi_error("embedding_priority_invalid"));
    }
    if let Some(documents) = input.documents {
      if input.wait_for_ready_ms.is_some() && state.active_index_id.is_none() {
        return Err(napi_error("embedding_selected_sources_unavailable"));
      }
      embedding
        .sync_documents(&input.workspace_id, &documents, reconcile_documents, priority)
        .await
        .map_err(to_napi_error)?;
      if let Some(wait_ms) = input.wait_for_ready_ms {
        if wait_ms == 0 || wait_ms > 120_000 {
          return Err(napi_error("embedding_wait_timeout_invalid"));
        }
        embedding
          .wait_for_documents(
            &input.workspace_id,
            &documents,
            Duration::from_millis(u64::from(wait_ms)),
          )
          .await
          .map_err(to_napi_error)?;
      }
    } else if reconcile_documents {
      embedding
        .reconcile_documents(&input.workspace_id)
        .await
        .map_err(to_napi_error)?;
    }
    Ok(types::RuntimeEmbeddingWorkspaceState {
      workspace_id: state.workspace_id,
      active_index_id: state.active_index_id.map(|id| id.to_string()),
      index_epoch: state.index_epoch,
      runtime_state: state.runtime_state,
      reason_code: state.reason_code,
    })
  }

  #[napi]
  pub async fn embedding_queue_counts(&self) -> Result<types::RuntimeEmbeddingQueueCounts> {
    let embedding = self
      .embedding
      .lock()
      .await
      .as_ref()
      .cloned()
      .ok_or_else(|| napi_error("embedding_unavailable"))?;
    let counts = embedding.health_counts().await.map_err(to_napi_error)?;
    Ok(types::RuntimeEmbeddingQueueCounts {
      pending: counts.pending,
      running: counts.running,
      retry_wait: counts.retry_wait,
      ready: counts.ready,
      failed: counts.failed,
      expired_leases: counts.expired_leases,
      oldest_pending_seconds: counts.oldest_pending_seconds,
      active_vector_rows: counts.active_vector_rows,
      inactive_vector_rows: counts.inactive_vector_rows,
      index_bytes: counts.index_bytes,
      retrying_indexes: counts.retrying_indexes,
      max_index_retry_seconds: counts.max_index_retry_seconds,
    })
  }

  #[napi]
  pub async fn embedding_workspace_progress(&self, workspace_id: String) -> Result<types::RuntimeEmbeddingProgress> {
    let row = sqlx::query(
      r#"SELECT count(*)::bigint total,
        count(*) FILTER (WHERE projection.status='ready')::bigint embedded
      FROM embedding_sources source
      JOIN embedding_workspace_states state ON state.workspace_id=source.workspace_id
      LEFT JOIN embedding_projections projection
        ON projection.source_id=source.id AND projection.index_id=state.active_index_id
      WHERE source.workspace_id=$1 AND source.deleted_at IS NULL"#,
    )
    .bind(workspace_id)
    .fetch_one(&self.pool().await?)
    .await
    .map_err(|error| {
      to_napi_error(RuntimeError::database(
        "load embedding workspace progress failed",
        error,
      ))
    })?;
    Ok(types::RuntimeEmbeddingProgress {
      total: row
        .try_get("total")
        .map_err(|error| to_napi_error(RuntimeError::database("decode embedding source total failed", error)))?,
      embedded: row
        .try_get("embedded")
        .map_err(|error| to_napi_error(RuntimeError::database("decode embedded source total failed", error)))?,
    })
  }

  #[napi]
  pub async fn reconcile_embedding_workspaces(&self) -> Result<i64> {
    self.require_background()?;
    let workspace_ids = sqlx::query_scalar::<_, String>("SELECT id FROM workspaces")
      .fetch_all(&self.pool().await?)
      .await
      .map_err(|error| to_napi_error(RuntimeError::database("load embedding workspaces failed", error)))?;
    for workspace_id in &workspace_ids {
      self.reconcile_embedding_workspace(workspace_id).await?;
    }
    Ok(workspace_ids.len() as i64)
  }

  #[napi]
  pub async fn put_workspace_artifact(
    &self,
    input: types::PutWorkspaceArtifactInput,
    body: Buffer,
  ) -> Result<types::RuntimeWorkspaceArtifact> {
    artifact::ArtifactService::new(self.pool().await?, self.object_storage()?)
      .put(input, body.to_vec())
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn ensure_workspace_blob_artifact(
    &self,
    input: types::EnsureWorkspaceBlobArtifactInput,
  ) -> Result<types::RuntimeWorkspaceArtifact> {
    artifact::ArtifactService::new(self.pool().await?, self.object_storage()?)
      .alias_blob(input)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn cleanup_unreferenced_artifacts(&self, limit: i64) -> Result<i64> {
    self.require_background()?;
    if limit <= 0 {
      return Err(napi_error("artifact cleanup limit must be positive"));
    }
    artifact::ArtifactService::new(self.pool().await?, self.object_storage()?)
      .cleanup(limit)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn set_artifact_library_owned(
    &self,
    workspace_id: String,
    artifact_id: String,
    library_owned: bool,
    display_name: Option<String>,
  ) -> Result<types::RuntimeWorkspaceArtifact> {
    artifact::ArtifactService::new(self.pool().await?, self.object_storage()?)
      .set_library_owned(&workspace_id, &artifact_id, library_owned, display_name)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn compile_turn_scope(&self, input: types::CompileScopeInput) -> Result<types::RuntimeTurnScopeSnapshot> {
    scope_compiler::ScopeCompiler::with_telemetry(
      self.pool().await?,
      self.config()?.deployment,
      self.permission_telemetry.clone(),
    )
    .compile(input)
    .await
    .map_err(to_napi_error)
  }

  #[napi]
  pub async fn read_embedding_source_content(
    &self,
    input: types::ReadEmbeddingSourceContentInput,
  ) -> Result<types::RuntimeEmbeddingSourceContent> {
    self
      .embedding_service()
      .await?
      .read_source_content(&input)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn match_embedding_candidates(
    &self,
    input: types::MatchEmbeddingCandidatesInput,
  ) -> Result<Vec<types::RuntimeEmbeddingCandidate>> {
    self
      .embedding_service()
      .await?
      .match_candidates(&input)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn cancel_embedding_candidate_request(&self, request_id: String) -> Result<()> {
    self
      .embedding_service()
      .await?
      .cancel_candidate_request(&request_id)
      .map_err(to_napi_error)
  }
}
