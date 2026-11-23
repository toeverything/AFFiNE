use std::sync::atomic::Ordering;

use memory_indexer::{Document, MemoryIndex, TermsAggregation, Value};
use sqlx::Row;

use super::{
  DocIndexedClock, NBSTORE_INDEXER_VERSION, NativeIndexAggregateResult, NativeIndexBucket, NativeIndexDocument,
  NativeIndexQuery, NativeIndexSearchOptions, NativeIndexSearchResult, SqliteDocStorage, error::Result, string_values,
};

impl SqliteDocStorage {
  pub async fn init_index(&self) -> Result<()> {
    let snapshots = sqlx::query("SELECT index_name, data FROM idx_snapshots WHERE index_name IN ('doc', 'block')")
      .fetch_all(&self.pool)
      .await?;
    let mut corrupted = false;
    for row in snapshots {
      let name: String = row.get("index_name");
      let data: Vec<u8> = row.get("data");
      let table = self.indexes.table(&name)?;
      if let Ok(index) = MemoryIndex::from_checkpoint(table.schema.clone(), &data) {
        *table.index.write().await = index;
      } else {
        corrupted = true;
      }
    }
    if corrupted {
      self.indexes.reset().await;
      let mut tx = self.pool.begin().await?;
      sqlx::query("DELETE FROM idx_snapshots").execute(&mut *tx).await?;
      sqlx::query("DELETE FROM indexer_sync").execute(&mut *tx).await?;
      tx.commit().await?;
    }
    sqlx::query("DELETE FROM idx_snapshots WHERE index_name NOT IN ('doc', 'block')")
      .execute(&self.pool)
      .await?;
    Ok(())
  }

  pub async fn flush_index(&self) -> Result<()> {
    let mut checkpoints = Vec::new();
    for (name, table) in self.indexes.tables() {
      let index = table.index.read().await;
      if index.has_unpersisted_changes() {
        checkpoints.push((name, index.checkpoint()?));
      }
    }
    if checkpoints.is_empty() {
      return Ok(());
    }
    let mut tx = self.pool.begin().await?;
    for (name, checkpoint) in &checkpoints {
      sqlx::query("INSERT OR REPLACE INTO idx_snapshots (index_name, data) VALUES (?, ?)")
        .bind(name)
        .bind(&checkpoint.bytes)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    for (name, checkpoint) in checkpoints {
      self
        .indexes
        .table(name)?
        .index
        .write()
        .await
        .mark_checkpoint_persisted(checkpoint.sequence)?;
    }
    Ok(())
  }

  pub async fn commit_indexed_clocks(&self, clocks: &[DocIndexedClock]) -> Result<()> {
    let mut checkpoints = Vec::new();
    for (name, table) in self.indexes.tables() {
      checkpoints.push((name, table.index.read().await.checkpoint()?));
    }
    let mut tx = self.pool.begin().await?;
    for (name, checkpoint) in &checkpoints {
      sqlx::query("INSERT OR REPLACE INTO idx_snapshots (index_name, data) VALUES (?, ?)")
        .bind(name)
        .bind(&checkpoint.bytes)
        .execute(&mut *tx)
        .await?;
    }
    for clock in clocks {
      sqlx::query(
        r#"INSERT INTO indexer_sync (doc_id, indexed_clock, indexer_version)
           VALUES ($1, $2, $3)
           ON CONFLICT(doc_id)
           DO UPDATE SET indexed_clock=$2, indexer_version=$3"#,
      )
      .bind(&clock.doc_id)
      .bind(clock.timestamp)
      .bind(clock.indexer_version)
      .execute(&mut *tx)
      .await?;
    }
    tx.commit().await?;
    for (name, checkpoint) in checkpoints {
      self
        .indexes
        .table(name)?
        .index
        .write()
        .await
        .mark_checkpoint_persisted(checkpoint.sequence)?;
    }
    self.indexes.ready.store(true, Ordering::Release);
    Ok(())
  }

  pub fn index_version() -> u32 {
    NBSTORE_INDEXER_VERSION
  }

  pub async fn index_upsert(&self, table: &str, document: NativeIndexDocument) -> Result<()> {
    let table = self.indexes.table(table)?;
    let mut index_document = Document::new(document.id);
    for field in document.fields {
      let field_id = table.field(&field.field)?;
      index_document.add_values(field_id, field.values.into_iter().map(Value::String));
    }
    table.index.write().await.upsert(index_document)?;
    Ok(())
  }

  pub async fn index_delete(&self, table: &str, id: &str) -> Result<()> {
    self.indexes.table(table)?.index.write().await.delete(id);
    Ok(())
  }

  pub async fn index_search(
    &self,
    table: &str,
    query: NativeIndexQuery,
    options: NativeIndexSearchOptions,
  ) -> Result<NativeIndexSearchResult> {
    self.indexes.ensure_ready()?;
    let table = self.indexes.table(table)?;
    let query = table.compile_query(query)?;
    let result = table
      .index
      .read()
      .await
      .search(&query, table.compile_options(options)?)?;
    Ok(NativeIndexSearchResult {
      total: result.total as u32,
      hits: result.hits.into_iter().map(|hit| table.hit(hit)).collect(),
    })
  }

  pub async fn index_aggregate(
    &self,
    table: &str,
    query: NativeIndexQuery,
    field: &str,
    limit: u32,
    offset: u32,
    hits: Option<NativeIndexSearchOptions>,
  ) -> Result<NativeIndexAggregateResult> {
    self.indexes.ensure_ready()?;
    let table = self.indexes.table(table)?;
    let query = table.compile_query(query)?;
    let result = table.index.read().await.aggregate(
      &query,
      TermsAggregation {
        field: table.field(field)?,
        limit: limit as usize,
        offset: offset as usize,
        top_hits: hits.map(|options| table.compile_options(options)).transpose()?,
      },
    )?;
    Ok(NativeIndexAggregateResult {
      total: result.total as u32,
      buckets: result
        .buckets
        .into_iter()
        .map(|bucket| NativeIndexBucket {
          key: string_values(vec![bucket.key]).pop().unwrap_or_default(),
          count: bucket.count as u32,
          score: bucket.max_score as f64,
          hits: bucket.hits.into_iter().map(|hit| table.hit(hit)).collect(),
        })
        .collect(),
    })
  }

  pub async fn index_delete_by_query(&self, table: &str, query: NativeIndexQuery) -> Result<u32> {
    let table = self.indexes.table(table)?;
    let query = table.compile_query(query)?;
    Ok(table.index.write().await.delete_by_query(&query)? as u32)
  }
}
