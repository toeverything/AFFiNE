use affine_nbstore::indexer::{NativeIndexDocument, NativeIndexQuery, NativeIndexSearchOptions};

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

  pub async fn index_upsert(&self, universal_id: String, table: String, document: String) -> Result<()> {
    let document: NativeIndexDocument = serde_json::from_str(&document)?;
    self
      .inner
      .get(universal_id)
      .await?
      .index_upsert(&table, document)
      .await?;
    Ok(())
  }

  pub async fn index_delete(&self, universal_id: String, table: String, doc_id: String) -> Result<()> {
    self
      .inner
      .get(universal_id)
      .await?
      .index_delete(&table, &doc_id)
      .await?;
    Ok(())
  }

  pub async fn index_search(
    &self,
    universal_id: String,
    table: String,
    query: String,
    options: String,
  ) -> Result<IndexSearchResult> {
    let query: NativeIndexQuery = serde_json::from_str(&query)?;
    let options: NativeIndexSearchOptions = serde_json::from_str(&options)?;
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .index_search(&table, query, options)
        .await?
        .into(),
    )
  }

  #[allow(clippy::too_many_arguments)]
  pub async fn index_aggregate(
    &self,
    universal_id: String,
    table: String,
    query: String,
    field: String,
    limit: u32,
    offset: u32,
    hits: Option<String>,
  ) -> Result<IndexAggregateResult> {
    let query: NativeIndexQuery = serde_json::from_str(&query)?;
    let hits = hits
      .map(|value| serde_json::from_str::<NativeIndexSearchOptions>(&value))
      .transpose()?;
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .index_aggregate(&table, query, &field, limit, offset, hits)
        .await?
        .into(),
    )
  }

  pub async fn index_delete_by_query(&self, universal_id: String, table: String, query: String) -> Result<u32> {
    let query: NativeIndexQuery = serde_json::from_str(&query)?;
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .index_delete_by_query(&table, query)
        .await?,
    )
  }

  pub async fn index_flush(&self, universal_id: String) -> Result<()> {
    self.inner.get(universal_id).await?.flush_index().await?;
    Ok(())
  }

  pub async fn index_version(&self) -> Result<u32> {
    Ok(SqliteDocStorage::index_version())
  }

  pub async fn set_doc_indexed_clocks(&self, universal_id: String, clocks: Vec<DocIndexedClock>) -> Result<()> {
    let clocks = clocks.into_iter().map(TryInto::try_into).collect::<Result<Vec<_>>>()?;
    self
      .inner
      .get(universal_id)
      .await?
      .commit_indexed_clocks(&clocks)
      .await?;
    Ok(())
  }

  pub async fn get_doc_indexed_clock(&self, universal_id: String, doc_id: String) -> Result<Option<DocIndexedClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_doc_indexed_clock(doc_id)
        .await?
        .map(Into::into),
    )
  }

  pub async fn set_doc_indexed_clock(&self, universal_id: String, clock: DocIndexedClock) -> Result<()> {
    let clock = clock.try_into()?;
    self
      .inner
      .get(universal_id)
      .await?
      .commit_indexed_clocks(&[clock])
      .await?;
    Ok(())
  }

  pub async fn clear_doc_indexed_clock(&self, universal_id: String, doc_id: String) -> Result<()> {
    self
      .inner
      .get(universal_id)
      .await?
      .clear_doc_indexed_clock(doc_id)
      .await?;
    Ok(())
  }
}
