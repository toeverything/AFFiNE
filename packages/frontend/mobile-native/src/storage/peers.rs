use super::*;

#[uniffi::export(async_runtime = "tokio")]
impl DocStoragePool {
  pub async fn get_peer_workspace_state(
    &self,
    universal_id: String,
    peer: String,
    root_doc_id: String,
  ) -> Result<String> {
    Ok(serde_json::to_string(
      &self
        .inner
        .get(universal_id)
        .await?
        .get_peer_workspace_state(peer, root_doc_id)
        .await?,
    )?)
  }

  pub async fn invalidate_peer_workspace_state(
    &self,
    universal_id: String,
    peer: String,
    root_doc_id: String,
  ) -> Result<()> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .invalidate_peer_workspace_state(peer, root_doc_id)
        .await?,
    )
  }

  pub async fn install_peer_workspace_state(
    &self,
    universal_id: String,
    peer: String,
    root_doc_id: String,
    cache_token: i64,
    docs: String,
    clocks: String,
  ) -> Result<bool> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .install_peer_workspace_state(
          peer,
          root_doc_id,
          cache_token,
          serde_json::from_str(&docs)?,
          serde_json::from_str(&clocks)?,
        )
        .await?,
    )
  }

  pub async fn confirm_peer_doc_create(&self, universal_id: String, peer: String, doc_id: String) -> Result<()> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .confirm_peer_doc_create(peer, doc_id)
        .await?,
    )
  }

  pub async fn get_peer_remote_clocks(&self, universal_id: String, peer: String) -> Result<Vec<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_peer_remote_clocks(peer)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn get_peer_remote_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
  ) -> Result<Option<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_peer_remote_clock(peer, doc_id)
        .await?
        .map(Into::into),
    )
  }

  pub async fn set_peer_remote_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
    clock: i64,
  ) -> Result<()> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .set_peer_remote_clock(peer, doc_id, millis_to_naive_utc(clock)?)
        .await?,
    )
  }

  pub async fn get_peer_pulled_remote_clocks(&self, universal_id: String, peer: String) -> Result<Vec<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_peer_pulled_remote_clocks(peer)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn get_peer_pulled_remote_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
  ) -> Result<Option<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_peer_pulled_remote_clock(peer, doc_id)
        .await?
        .map(Into::into),
    )
  }

  pub async fn set_peer_pulled_remote_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
    clock: i64,
  ) -> Result<()> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .set_peer_pulled_remote_clock(peer, doc_id, millis_to_naive_utc(clock)?)
        .await?,
    )
  }

  pub async fn get_peer_pushed_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
  ) -> Result<Option<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_peer_pushed_clock(peer, doc_id)
        .await?
        .map(Into::into),
    )
  }

  pub async fn get_peer_pushed_clocks(&self, universal_id: String, peer: String) -> Result<Vec<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_peer_pushed_clocks(peer)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn set_peer_pushed_clock(
    &self,
    universal_id: String,
    peer: String,
    doc_id: String,
    clock: i64,
  ) -> Result<()> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .set_peer_pushed_clock(peer, doc_id, millis_to_naive_utc(clock)?)
        .await?,
    )
  }

  pub async fn clear_clocks(&self, universal_id: String) -> Result<()> {
    Ok(self.inner.get(universal_id).await?.clear_clocks().await?)
  }
}
