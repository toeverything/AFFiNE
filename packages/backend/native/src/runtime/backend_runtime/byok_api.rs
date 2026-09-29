use super::*;

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn list_byok_profiles(&self, workspace_id: String) -> Result<Vec<ByokProfileOutput>> {
    byok::list(&self.pool().await?, &workspace_id)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub fn get_byok_policy(&self) -> Result<ByokPolicyOutput> {
    Ok(self.config()?.byok_policy().project())
  }

  #[napi]
  pub async fn create_byok_profile(&self, input: CreateByokProfileInput) -> Result<ByokProfileOutput> {
    let workspace_id = input.workspace_id.clone();
    let config = self.config()?;
    let policy = config.byok_policy();
    let profile = byok::create(&self.pool().await?, config.private_key.as_bytes(), &policy, input)
      .await
      .map_err(to_napi_error)?;
    self.reconcile_embedding_workspace(&workspace_id).await?;
    Ok(profile)
  }

  #[napi]
  pub async fn replace_byok_profile(&self, input: ReplaceByokProfileInput) -> Result<ByokProfileOutput> {
    let workspace_id = input.workspace_id.clone();
    let config = self.config()?;
    let policy = config.byok_policy();
    let profile = byok::replace(&self.pool().await?, config.private_key.as_bytes(), &policy, input)
      .await
      .map_err(to_napi_error)?;
    self.reconcile_embedding_workspace(&workspace_id).await?;
    Ok(profile)
  }

  #[napi]
  pub async fn rotate_byok_credential(&self, input: RotateByokCredentialInput) -> Result<ByokProfileOutput> {
    let workspace_id = input.workspace_id.clone();
    let config = self.config()?;
    let profile = byok::rotate(&self.pool().await?, config.private_key.as_bytes(), input)
      .await
      .map_err(to_napi_error)?;
    self.reconcile_embedding_workspace(&workspace_id).await?;
    Ok(profile)
  }

  #[napi]
  pub async fn probe_byok_profile(&self, input: ProbeByokProfileInput) -> Result<ByokProbeResultOutput> {
    let config = self.config()?;
    let policy = config.byok_policy();
    byok::probe_profile(&self.pool().await?, config.private_key.as_bytes(), &policy, input)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn probe_byok_draft(&self, input: ProbeByokDraftInput) -> Result<ByokProbeResultOutput> {
    let config = self.config()?;
    let policy = config.byok_policy();
    byok::probe_draft(&self.pool().await?, config.private_key.as_bytes(), &policy, input)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn delete_byok_profile(&self, workspace_id: String, profile_id: String) -> Result<bool> {
    let deleted = byok::delete(&self.pool().await?, &workspace_id, &profile_id)
      .await
      .map_err(to_napi_error)?;
    self.reconcile_embedding_workspace(&workspace_id).await?;
    Ok(deleted)
  }

  #[napi]
  pub async fn reorder_byok_profiles(&self, input: ReorderByokProfilesInput) -> Result<Vec<ByokProfileOutput>> {
    let workspace_id = input.workspace_id.clone();
    let profiles = byok::reorder(&self.pool().await?, input).await.map_err(to_napi_error)?;
    self.reconcile_embedding_workspace(&workspace_id).await?;
    Ok(profiles)
  }

  #[napi]
  pub async fn create_byok_local_lease(&self, input: CreateByokLocalLeaseInput) -> Result<ByokLocalLeaseOutput> {
    let config = self.config()?;
    let policy = config.byok_policy();
    byok::create_local_lease(&self.pool().await?, config.private_key.as_bytes(), &policy, input)
      .await
      .map_err(to_napi_error)
  }
}
