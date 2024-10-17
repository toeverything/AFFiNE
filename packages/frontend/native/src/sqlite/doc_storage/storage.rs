use chrono::{DateTime, NaiveDateTime};
use sqlx::{
  migrate::{MigrateDatabase, Migrator},
  sqlite::{Sqlite, SqliteConnectOptions, SqlitePoolOptions},
  ConnectOptions, Pool, QueryBuilder, Row,
};

use super::{Blob, DocClock, DocRecord, DocUpdate, ListedBlob};

type Result<T> = std::result::Result<T, sqlx::Error>;

pub struct SqliteDocStorage {
  pool: Pool<Sqlite>,
  path: String,
}

impl SqliteDocStorage {
  pub fn new(path: String) -> Self {
    let sqlite_options = SqliteConnectOptions::new()
      .filename(&path)
      .foreign_keys(false)
      .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
      .log_statements(log::LevelFilter::Trace);

    let mut pool_options = SqlitePoolOptions::new();

    if cfg!(test) && path == ":memory:" {
      pool_options = pool_options
        .min_connections(1)
        .max_connections(1)
        .idle_timeout(None)
        .max_lifetime(None);
    } else {
      pool_options = pool_options.max_connections(4);
    }

    Self {
      pool: pool_options.connect_lazy_with(sqlite_options),
      path,
    }
  }

  pub async fn connect(&self) -> Result<()> {
    if !Sqlite::database_exists(&self.path).await.unwrap_or(false) {
      Sqlite::create_database(&self.path).await?;
    };

    let migrations = std::env::current_dir().unwrap().join("migrations");
    let migrator = Migrator::new(migrations).await?;
    migrator.run(&self.pool).await?;

    Ok(())
  }

  pub async fn close(&self) {
    self.pool.close().await
  }

  pub fn is_closed(&self) -> bool {
    self.pool.is_closed()
  }

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

  pub async fn get_blob(&self, key: String) -> Result<Option<Blob>> {
    sqlx::query_as!(
      Blob,
      "SELECT key, data, mime FROM v2_blobs WHERE key = ? AND deleted_at IS NULL",
      key
    )
    .fetch_optional(&self.pool)
    .await
  }

  pub async fn set_blob(&self, blob: Blob) -> Result<()> {
    sqlx::query(
      r#"
      INSERT INTO v2_blobs (key, data, mime, size)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(key)
      DO UPDATE SET data=$2, mime=$3, size=$4, deleted_at=NULL;"#,
    )
    .bind(blob.key)
    .bind(blob.data.as_ref())
    .bind(blob.mime)
    .bind(blob.data.len() as i64)
    .execute(&self.pool)
    .await?;

    Ok(())
  }

  pub async fn delete_blob(&self, key: String, permanently: bool) -> Result<()> {
    if permanently {
      sqlx::query("DELETE FROM v2_blobs WHERE key = ?")
        .bind(&key)
        .execute(&self.pool)
        .await?;
    } else {
      sqlx::query("UPDATE v2_blobs SET deleted_at = CURRENT_TIMESTAMP WHERE key = ?")
        .bind(&key)
        .execute(&self.pool)
        .await?;
    }

    Ok(())
  }

  pub async fn release_blobs(&self) -> Result<()> {
    sqlx::query("DELETE FROM v2_blobs WHERE deleted_at IS NOT NULL;")
      .execute(&self.pool)
      .await?;

    Ok(())
  }

  pub async fn list_blobs(&self) -> Result<Vec<ListedBlob>> {
    sqlx::query_as!(
      ListedBlob,
      "SELECT key, size FROM v2_blobs WHERE deleted_at IS NULL ORDER BY created_at DESC;"
    )
    .fetch_all(&self.pool)
    .await
  }

  /**
   * Flush the WAL file to the database file.
   * See https://www.sqlite.org/pragma.html#pragma_wal_checkpoint:~:text=PRAGMA%20schema.wal_checkpoint%3B
   */

  pub async fn checkpoint(&self) -> Result<()> {
    sqlx::query("PRAGMA wal_checkpoint(FULL);")
      .execute(&self.pool)
      .await?;

    Ok(())
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

  #[tokio::test]
  async fn set_blob() {
    let storage = get_storage().await;

    let blob = Blob {
      key: "test".to_string(),
      data: Buffer::from(vec![0, 0]),
      mime: "text/plain".to_string(),
    };

    storage.set_blob(blob).await.unwrap();

    let result = storage.get_blob("test".to_string()).await.unwrap();

    assert!(result.is_some());
    assert_eq!(result.unwrap().data.as_ref(), vec![0, 0]);
  }

  #[tokio::test]
  async fn delete_blob() {
    let storage = get_storage().await;

    for i in 1..5u32 {
      storage
        .set_blob(Blob {
          key: format!("test_{}", i),
          data: Buffer::from(vec![0, 0]),
          mime: "text/plain".to_string(),
        })
        .await
        .unwrap();
    }

    let result = storage.get_blob("test_1".to_string()).await.unwrap();

    assert!(result.is_some());

    storage
      .delete_blob("test_".to_string(), false)
      .await
      .unwrap();

    let result = storage.get_blob("test".to_string()).await.unwrap();
    assert!(result.is_none());

    storage
      .delete_blob("test_2".to_string(), true)
      .await
      .unwrap();

    let result = storage.get_blob("test".to_string()).await.unwrap();
    assert!(result.is_none());
  }

  #[tokio::test]
  async fn list_blobs() {
    let storage = get_storage().await;

    let blobs = storage.list_blobs().await.unwrap();

    assert_eq!(blobs.len(), 0);

    for i in 1..5u32 {
      storage
        .set_blob(Blob {
          key: format!("test_{}", i),
          data: Buffer::from(vec![0, 0]),
          mime: "text/plain".to_string(),
        })
        .await
        .unwrap();
    }

    let blobs = storage.list_blobs().await.unwrap();

    assert_eq!(blobs.len(), 4);
    assert_eq!(
      blobs.iter().map(|b| b.key.as_str()).collect::<Vec<_>>(),
      vec!["test_1", "test_2", "test_3", "test_4"]
    );

    storage
      .delete_blob("test_2".to_string(), false)
      .await
      .unwrap();

    storage
      .delete_blob("test_3".to_string(), true)
      .await
      .unwrap();

    let query = sqlx::query("SELECT COUNT(*) as len FROM v2_blobs;")
      .fetch_one(&storage.pool)
      .await
      .unwrap();

    assert_eq!(query.get::<i64, &str>("len"), 3);

    let blobs = storage.list_blobs().await.unwrap();
    assert_eq!(blobs.len(), 2);
    assert_eq!(
      blobs.iter().map(|b| b.key.as_str()).collect::<Vec<_>>(),
      vec!["test_1", "test_4"]
    );
  }

  #[tokio::test]
  async fn release_blobs() {
    let storage = get_storage().await;

    for i in 1..5u32 {
      storage
        .set_blob(Blob {
          key: format!("test_{}", i),
          data: Buffer::from(vec![0, 0]),
          mime: "text/plain".to_string(),
        })
        .await
        .unwrap();
    }

    storage
      .delete_blob("test_2".to_string(), false)
      .await
      .unwrap();
    storage.release_blobs().await.unwrap();

    let query = sqlx::query("SELECT COUNT(*) as len FROM v2_blobs;")
      .fetch_one(&storage.pool)
      .await
      .unwrap();

    assert_eq!(query.get::<i64, &str>("len"), 3);
  }
}
