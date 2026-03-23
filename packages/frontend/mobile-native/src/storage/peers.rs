use super::*;

#[uniffi::export(async_runtime = "tokio")]
impl DocStoragePool {
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
