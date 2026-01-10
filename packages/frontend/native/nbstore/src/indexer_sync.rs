use chrono::NaiveDateTime;

use super::{DocIndexedClock, error::Result, storage::SqliteDocStorage};

impl SqliteDocStorage {
  pub async fn get_doc_indexed_clock(&self, doc_id: String) -> Result<Option<DocIndexedClock>> {
    let record = sqlx::query!(
      r#"SELECT doc_id, indexed_clock as "indexed_clock: NaiveDateTime", indexer_version
        FROM indexer_sync WHERE doc_id = ?"#,
      doc_id
    )
    .fetch_optional(&self.pool)
    .await?;

    Ok(record.map(|rec| DocIndexedClock {
      doc_id: rec.doc_id,
      timestamp: rec.indexed_clock,
      indexer_version: rec.indexer_version,
    }))
  }

  pub async fn set_doc_indexed_clock(
    &self,
    doc_id: String,
    indexed_clock: NaiveDateTime,
    indexer_version: i64,
  ) -> Result<()> {
    sqlx::query(
      r#"
      INSERT INTO indexer_sync (doc_id, indexed_clock, indexer_version)
      VALUES ($1, $2, $3)
      ON CONFLICT(doc_id)
      DO UPDATE SET indexed_clock=$2, indexer_version=$3;
    "#,
    )
    .bind(doc_id)
    .bind(indexed_clock)
    .bind(indexer_version)
    .execute(&self.pool)
    .await?;

    Ok(())
  }

  pub async fn clear_doc_indexed_clock(&self, doc_id: String) -> Result<()> {
    sqlx::query("DELETE FROM indexer_sync WHERE doc_id = ?;")
      .bind(doc_id)
      .execute(&self.pool)
      .await?;

    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use chrono::Utc;

  use super::*;

  async fn get_storage() -> SqliteDocStorage {
    let storage = SqliteDocStorage::new(":memory:".to_string());
    storage.connect().await.unwrap();

    storage
  }

  #[tokio::test]
  async fn set_and_get_indexed_clock() {
    let storage = get_storage().await;
    let ts = Utc::now().naive_utc();

    storage.set_doc_indexed_clock("doc1".to_string(), ts, 1).await.unwrap();

    let clock = storage
      .get_doc_indexed_clock("doc1".to_string())
      .await
      .unwrap()
      .unwrap();

    assert_eq!(clock.doc_id, "doc1");
    assert_eq!(clock.timestamp, ts);
    assert_eq!(clock.indexer_version, 1);
  }

  #[tokio::test]
  async fn clear_indexed_clock() {
    let storage = get_storage().await;
    let ts = Utc::now().naive_utc();

    storage.set_doc_indexed_clock("doc1".to_string(), ts, 1).await.unwrap();

    storage.clear_doc_indexed_clock("doc1".to_string()).await.unwrap();

    let clock = storage.get_doc_indexed_clock("doc1".to_string()).await.unwrap();

    assert!(clock.is_none());
  }
}
