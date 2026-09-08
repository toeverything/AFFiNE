use super::*;

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn get_user_quota_state_v1(&self, user_id: String) -> Result<types::RuntimeUserQuotaState> {
    let cache = self
      .quota_read_cache
      .lock()
      .await
      .clone()
      .ok_or_else(|| napi_error("quota read cache is unavailable"))?;
    cache.user_state(&user_id).await.map_err(to_napi_error)
  }

  #[napi]
  pub async fn get_workspace_quota_state_v1(&self, workspace_id: String) -> Result<types::RuntimeWorkspaceQuotaState> {
    let cache = self
      .quota_read_cache
      .lock()
      .await
      .clone()
      .ok_or_else(|| napi_error("quota read cache is unavailable"))?;
    cache.workspace_state(&workspace_id).await.map_err(to_napi_error)
  }

  #[napi]
  pub async fn get_sync_permission_generation_v1(&self, workspace_id: String) -> Result<i64> {
    let pool = self.pool().await?;
    sqlx::query(
      "INSERT INTO workspace_sync_permission_generations(workspace_id,generation) VALUES($1,0) ON CONFLICT DO NOTHING",
    )
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .map_err(|error| napi_error(format!("initialize sync permission generation: {error}")))?;
    sqlx::query_scalar("SELECT generation FROM workspace_sync_permission_generations WHERE workspace_id=$1")
      .bind(workspace_id)
      .fetch_one(&pool)
      .await
      .map_err(|error| napi_error(format!("load sync permission generation: {error}")))
  }

  #[napi]
  pub async fn quota_seat_usage_transition_v1(&self, workspace_ids: Vec<String>) -> Result<()> {
    for workspace_id in workspace_ids {
      self
        .publish_invalidation(InvalidationHintV1::QuotaSeatUsage { workspace_id })
        .await;
    }
    Ok(())
  }

  #[napi]
  pub async fn run_migrations(&self) -> Result<()> {
    let pool = self.pool().await?;
    let embedding_health = migrate_all_tables(&pool).await.map_err(to_napi_error)?;
    self
      .apply_embedding_health(pool, embedding_health)
      .await
      .map_err(to_napi_error)?;
    Ok(())
  }

  #[napi]
  pub async fn search_authorized(
    &self,
    actor_user_id: String,
    workspace_id: String,
    request: RuntimeSearchRequest,
  ) -> Result<SearchOperationOutput> {
    let result = self
      .search_runtime()
      .await?
      .search_authorized(&actor_user_id, &workspace_id, request)
      .await;
    Ok(search_operation_output(result))
  }

  #[napi]
  pub async fn aggregate_authorized(
    &self,
    actor_user_id: String,
    workspace_id: String,
    request: RuntimeAggregateRequest,
  ) -> Result<SearchOperationOutput> {
    let result = self
      .search_runtime()
      .await?
      .aggregate_authorized(&actor_user_id, &workspace_id, request)
      .await;
    Ok(search_operation_output(result))
  }

  #[napi]
  pub async fn reconcile_search_projection(&self, limit: Option<i32>) -> Result<i32> {
    self.require_background()?;
    self
      .search_runtime()
      .await?
      .reconcile_pending(limit.unwrap_or(100))
      .await
      .map(|count| count as i32)
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn authorize_permission_v1(&self, input: serde_json::Value) -> Result<serde_json::Value> {
    let request = serde_json::from_value(input).map_err(|error| napi_error(error.to_string()))?;
    let authorizer = permission::PermissionAuthorizer::with_telemetry(
      self.pool().await?,
      self.config()?.deployment,
      self.permission_telemetry.clone(),
    );
    let output = authorizer.authorize(request).await.map_err(to_napi_error)?;
    serde_json::to_value(output).map_err(|error| napi_error(error.to_string()))
  }

  #[napi]
  pub async fn execute_domain_command_v1(&self, input: serde_json::Value) -> Result<serde_json::Value> {
    let input = serde_json::from_value(input).map_err(|error| napi_error(error.to_string()))?;
    let outcome = domain_command::execute(
      self.pool().await?,
      self.config()?.deployment,
      self.permission_telemetry.clone(),
      self.embedding_schema_ready().map_err(to_napi_error)?,
      input,
    )
    .await
    .map_err(to_napi_error)?;
    for hint in outcome.invalidations {
      self.publish_invalidation(hint).await;
    }
    Ok(outcome.value)
  }

  #[napi]
  pub async fn search_status(&self) -> Result<serde_json::Value> {
    self.search_runtime().await?.status().await.map_err(to_napi_error)
  }
}
