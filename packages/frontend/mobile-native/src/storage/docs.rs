use super::*;

#[uniffi::export(async_runtime = "tokio")]
impl DocStoragePool {
  pub async fn get_doc(&self, universal_id: String, doc_id: String) -> Result<Option<DocRecord>> {
    let Some(record) = self.inner.get(universal_id.clone()).await?.get_doc(doc_id).await? else {
      return Ok(None);
    };
    let timestamp = record.timestamp.and_utc().timestamp_millis();
    let bin = self
      .encode_doc_data(&universal_id, &record.doc_id, timestamp, &record.bin)
      .await?;
    Ok(Some(DocRecord {
      doc_id: record.doc_id,
      bin,
      timestamp,
    }))
  }

  pub async fn delete_doc(&self, universal_id: String, doc_id: String) -> Result<()> {
    Ok(self.inner.get(universal_id).await?.delete_doc(doc_id).await?)
  }

  pub async fn get_doc_clocks(&self, universal_id: String, after: Option<i64>) -> Result<Vec<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_doc_clocks(after.map(millis_to_naive_utc).transpose()?)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn get_doc_clock(&self, universal_id: String, doc_id: String) -> Result<Option<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_doc_clock(doc_id)
        .await?
        .map(Into::into),
    )
  }
}
