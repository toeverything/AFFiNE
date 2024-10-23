use chrono::{DateTime, NaiveDateTime};
use sqlx::{QueryBuilder, Row};

use super::storage::{Result, SqliteDocStorage};
use super::{DocClock, DocRecord, DocUpdate};

impl SqliteDocStorage {
  pub async fn push_updates<Update: AsRef<[u8]>, Updates: AsRef<[Update]>>(
    &self,
    doc_id: String,
    updates: Updates,
  ) -> Result<u32> {
    let mut cnt = 0;

    for chunk in updates.as_ref().chunks(10) {
      self.batch_push_updates(&doc_id, chunk).await?;
      cnt += chunk.len() as u32;
    }

    Ok(cnt)
  }

  pub async fn get_doc_snapshot(&self, doc_id: String) -> Result<Option<DocRecord>> {
    sqlx::query_as!(
      DocRecord,
      "SELECT doc_id, data, updated_at as timestamp FROM v2_snapshots WHERE doc_id = ?",
      doc_id
    )
    .fetch_optional(&self.pool)
    .await
  }

  pub async fn set_doc_snapshot(&self, snapshot: DocRecord) -> Result<bool> {
    let result = sqlx::query(
      r#"
    INSERT INTO v2_snapshots (doc_id, data, updated_at)
    VALUES ($1, $2, $3)
    ON CONFLICT(doc_id)
    DO UPDATE SET data=$2, updated_at=$3
    WHERE updated_at <= $3;"#,
    )
    .bind(snapshot.doc_id)
    .bind(snapshot.data.as_ref())
    .bind(snapshot.timestamp)
    .execute(&self.pool)
    .await?;

    Ok(result.rows_affected() == 1)
  }

  pub async fn get_doc_updates(&self, doc_id: String) -> Result<Vec<DocUpdate>> {
    sqlx::query_as!(
      DocUpdate,
      "SELECT doc_id, created_at, data FROM v2_updates WHERE doc_id = ?",
      doc_id
    )
    .fetch_all(&self.pool)
    .await
  }

  pub async fn mark_updates_merged(
    &self,
    doc_id: String,
    updates: Vec<NaiveDateTime>,
  ) -> Result<u32> {
    let mut qb = QueryBuilder::new("DELETE FROM v2_updates");

    qb.push(" WHERE doc_id = ");
    qb.push_bind(doc_id);
    qb.push(" AND created_at IN (");
    let mut separated = qb.separated(", ");
    updates.iter().for_each(|update| {
      separated.push_bind(update);
    });
    qb.push(");");

    let query = qb.build();

    let result = query.execute(&self.pool).await?;

    Ok(result.rows_affected() as u32)
  }

  async fn batch_push_updates<Update: AsRef<[u8]>>(
    &self,
    doc_id: &str,
    updates: &[Update],
  ) -> Result<()> {
    let mut timestamp = chrono::Utc::now().timestamp_micros();

    let mut qb = QueryBuilder::new("INSERT INTO v2_updates (doc_id, data, created_at) ");
    qb.push_values(updates, |mut b, update| {
      timestamp += 1;
      b.push_bind(doc_id).push_bind(update.as_ref()).push_bind(
        DateTime::from_timestamp_millis(timestamp)
          .unwrap()
          .naive_utc(),
      );
    });

    let query = qb.build();

    let mut tx = self.pool.begin().await?;
    query.execute(&mut *tx).await?;

    sqlx::query(
      r#"
    INSERT INTO v2_clocks (doc_id, timestamp) VALUES ($1, $2)
    ON CONFLICT(doc_id)
    DO UPDATE SET timestamp=$2;"#,
    )
    .bind(doc_id)
    .bind(DateTime::from_timestamp_millis(timestamp).unwrap().to_utc())
    .execute(&mut *tx)
    .await?;

    tx.commit().await
  }

  pub async fn delete_doc(&self, doc_id: String) -> Result<()> {
    let mut tx = self.pool.begin().await?;

    sqlx::query("DELETE FROM updates WHERE doc_id = ?;")
      .bind(&doc_id)
      .execute(&mut *tx)
      .await?;

    sqlx::query("DELETE FROM snapshots WHERE doc_id = ?;")
      .bind(&doc_id)
      .execute(&mut *tx)
      .await?;

    sqlx::query("DELETE FROM clocks WHERE doc_id = ?;")
      .bind(&doc_id)
      .execute(&mut *tx)
      .await?;

    tx.commit().await
  }

  pub async fn get_doc_clocks(&self, after: Option<i64>) -> Result<Vec<DocClock>> {
    let query = if let Some(after) = after {
      sqlx::query("SELECT doc_id, timestamp FROM v2_clocks WHERE timestamp > $1")
        .bind(DateTime::from_timestamp_millis(after).unwrap().naive_utc())
    } else {
      sqlx::query("SELECT doc_id, timestamp FROM v2_clocks")
    };

    let clocks = query.fetch_all(&self.pool).await?;

    Ok(
      clocks
        .iter()
        .map(|row| DocClock {
          doc_id: row.get("doc_id"),
          timestamp: row.get("timestamp"),
        })
        .collect(),
    )
  }
}

#[cfg(test)]
mod tests {
  use chrono::Utc;
  use napi::bindgen_prelude::Buffer;

  use super::*;

  async fn get_storage() -> SqliteDocStorage {
    let storage = SqliteDocStorage::new(":memory:".to_string());
    storage.connect().await.unwrap();
    storage.test_migrate().await.unwrap();

    storage
  }

  #[tokio::test]
  async fn init_tables() {
    let storage = get_storage().await;

    sqlx::query("INSERT INTO v2_snapshots (doc_id, data, updated_at) VALUES ($1, $2, $3);")
      .bind("test")
      .bind(vec![0, 0])
      .bind(Utc::now())
      .execute(&storage.pool)
      .await
      .unwrap();

    sqlx::query_as!(
      DocRecord,
      "SELECT doc_id, data, updated_at as timestamp FROM v2_snapshots WHERE doc_id = 'test';"
    )
    .fetch_one(&storage.pool)
    .await
    .unwrap();
  }

  #[tokio::test]
  async fn push_updates() {
    let storage = get_storage().await;

    let updates = vec![vec![0, 0], vec![0, 1], vec![1, 0], vec![1, 1]];

    storage
      .push_updates("test".to_string(), &updates)
      .await
      .unwrap();

    let result = storage.get_doc_updates("test".to_string()).await.unwrap();

    assert_eq!(result.len(), 4);
    assert_eq!(
      result.iter().map(|u| u.data.as_ref()).collect::<Vec<_>>(),
      updates
    );
  }

  #[tokio::test]
  async fn get_doc_snapshot() {
    let storage = get_storage().await;

    let none = storage.get_doc_snapshot("test".to_string()).await.unwrap();

    assert!(none.is_none());

    let snapshot = DocRecord {
      doc_id: "test".to_string(),
      data: Buffer::from(vec![0, 0]),
      timestamp: Utc::now().naive_utc(),
    };

    storage.set_doc_snapshot(snapshot).await.unwrap();

    let result = storage.get_doc_snapshot("test".to_string()).await.unwrap();

    assert!(result.is_some());
    assert_eq!(result.unwrap().data.as_ref(), vec![0, 0]);
  }

  #[tokio::test]
  async fn set_doc_snapshot() {
    let storage = get_storage().await;

    let snapshot = DocRecord {
      doc_id: "test".to_string(),
      data: Buffer::from(vec![0, 0]),
      timestamp: Utc::now().naive_utc(),
    };

    storage.set_doc_snapshot(snapshot).await.unwrap();

    let result = storage.get_doc_snapshot("test".to_string()).await.unwrap();

    assert!(result.is_some());
    assert_eq!(result.unwrap().data.as_ref(), vec![0, 0]);

    let snapshot = DocRecord {
      doc_id: "test".to_string(),
      data: Buffer::from(vec![0, 1]),
      timestamp: DateTime::from_timestamp_millis(Utc::now().timestamp_millis() - 1000)
        .unwrap()
        .naive_utc(),
    };

    // can't update because it's tempstamp is older
    storage.set_doc_snapshot(snapshot).await.unwrap();

    let result = storage.get_doc_snapshot("test".to_string()).await.unwrap();

    assert!(result.is_some());
    assert_eq!(result.unwrap().data.as_ref(), vec![0, 0]);
  }

  #[tokio::test]
  async fn get_doc_clocks() {
    let storage = get_storage().await;

    let clocks = storage.get_doc_clocks(None).await.unwrap();

    assert_eq!(clocks.len(), 0);

    // where is join_all()?
    for i in 1..5u32 {
      storage
        .push_updates(format!("test_{i}"), vec![vec![0, 0]])
        .await
        .unwrap();
    }

    let clocks = storage.get_doc_clocks(None).await.unwrap();

    assert_eq!(clocks.len(), 4);
    assert_eq!(
      clocks.iter().map(|c| c.doc_id.as_str()).collect::<Vec<_>>(),
      vec!["test_1", "test_2", "test_3", "test_4"]
    );

    let clocks = storage
      .get_doc_clocks(Some(Utc::now().timestamp_millis()))
      .await
      .unwrap();

    assert_eq!(clocks.len(), 0);
  }

  #[tokio::test]
  async fn mark_updates_merged() {
    let storage = get_storage().await;

    storage
      .push_updates(
        "test".to_string(),
        vec![vec![0, 0], vec![0, 1], vec![1, 0], vec![1, 1]],
      )
      .await
      .unwrap();

    let updates = storage.get_doc_updates("test".to_string()).await.unwrap();

    let result = storage
      .mark_updates_merged(
        "test".to_string(),
        updates
          .iter()
          .skip(1)
          .map(|u| u.created_at)
          .collect::<Vec<_>>(),
      )
      .await
      .unwrap();

    assert_eq!(result, 3);

    let updates = storage.get_doc_updates("test".to_string()).await.unwrap();

    assert_eq!(updates.len(), 1);
  }
}
