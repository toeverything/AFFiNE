use super::*;

#[uniffi::export(async_runtime = "tokio")]
impl DocStoragePool {
  pub async fn crawl_doc_data(&self, universal_id: String, doc_id: String) -> Result<CrawlResult> {
    let result = self
      .inner
      .get(universal_id.clone())
      .await?
      .crawl_doc_data(&doc_id)
      .await?;
    Ok(result.into())
  }

  pub async fn fts_add_document(
    &self,
    universal_id: String,
    index_name: String,
    doc_id: String,
    text: String,
    index: bool,
  ) -> Result<()> {
    self
      .inner
      .get(universal_id)
      .await?
      .fts_add(&index_name, &doc_id, &text, index)
      .await?;
    Ok(())
  }

  pub async fn fts_delete_document(&self, universal_id: String, index_name: String, doc_id: String) -> Result<()> {
    self
      .inner
      .get(universal_id)
      .await?
      .fts_delete(&index_name, &doc_id)
      .await?;
    Ok(())
  }

  pub async fn fts_get_document(
    &self,
    universal_id: String,
    index_name: String,
    doc_id: String,
  ) -> Result<Option<String>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .fts_get(&index_name, &doc_id)
        .await?,
    )
  }

  pub async fn fts_search(&self, universal_id: String, index_name: String, query: String) -> Result<Vec<SearchHit>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .fts_search(&index_name, &query)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn fts_get_matches(
    &self,
    universal_id: String,
    index_name: String,
    doc_id: String,
    query: String,
  ) -> Result<Vec<MatchRange>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .fts_get_matches(&index_name, &doc_id, &query)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn fts_flush_index(&self, universal_id: String) -> Result<()> {
    self.inner.get(universal_id).await?.flush_index().await?;
    Ok(())
  }

  pub async fn fts_index_version(&self) -> Result<u32> {
    Ok(SqliteDocStorage::index_version())
  }
}
