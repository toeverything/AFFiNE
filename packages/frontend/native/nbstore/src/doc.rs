use std::ops::Deref;

use chrono::{DateTime, NaiveDateTime};
use sqlx::{QueryBuilder, Row};
use y_octo::{DocOptions, merge_updates_v1};

use super::{
  DocClock, DocRecord, DocUpdate, ReadonlyDocRecords,
  error::{Error, Result},
  storage::SqliteDocStorage,
};

struct Meta {
  space_id: String,
}

impl SqliteDocStorage {
  pub async fn read_doc_records_readonly(path: &str, doc_id: &str) -> Result<ReadonlyDocRecords> {
    let pool = Self::open_readonly_path(path).await?;
    let mut tx = pool.begin().await?;
    let snapshot = sqlx::query_as!(
      DocRecord,
      "SELECT doc_id, data as bin, updated_at as timestamp FROM snapshots WHERE doc_id = ?",
      doc_id
    )
    .fetch_optional(&mut *tx)
    .await?;
    let updates = sqlx::query_as!(
      DocUpdate,
      "SELECT doc_id, created_at as timestamp, data as bin FROM updates WHERE doc_id = ? ORDER BY created_at",
      doc_id
    )
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    pool.close().await;
    Ok(ReadonlyDocRecords { snapshot, updates })
  }

  pub async fn set_space_id(&self, space_id: String) -> Result<()> {
    // ensure only one record exists in table
    let result = sqlx::query_as!(Meta, "SELECT * FROM meta;")
      .fetch_optional(&self.pool)
      .await?;

    match result {
      Some(meta) => {
        if meta.space_id != space_id {
          sqlx::query("UPDATE meta SET space_id = $1;")
            .bind(&space_id)
            .execute(&self.pool)
            .await?;

          sqlx::query("UPDATE updates SET doc_id = $1 WHERE doc_id = $2;")
            .bind(&space_id)
            .bind(&meta.space_id)
            .execute(&self.pool)
            .await?;

          sqlx::query("UPDATE snapshots SET doc_id = $1 WHERE doc_id = $2;")
            .bind(&space_id)
            .bind(&meta.space_id)
            .execute(&self.pool)
            .await?;

          sqlx::query("UPDATE clocks SET doc_id = $1 WHERE doc_id = $2;")
            .bind(&space_id)
            .bind(&meta.space_id)
            .execute(&self.pool)
            .await?;
          sqlx::query("UPDATE indexer_sync SET doc_id = $1 WHERE doc_id = $2;")
            .bind(&space_id)
            .bind(&meta.space_id)
            .execute(&self.pool)
            .await?;

          sqlx::query("UPDATE peer_clocks SET doc_id = $1 WHERE doc_id = $2;")
            .bind(&space_id)
            .bind(&meta.space_id)
            .execute(&self.pool)
            .await?;
        }
      }
      None => {
        sqlx::query("INSERT INTO meta (space_id) VALUES ($1);")
          .bind(&space_id)
          .execute(&self.pool)
          .await?;
      }
    }

    Ok(())
  }

  pub async fn push_update<Update: AsRef<[u8]>>(&self, doc_id: String, update: Update) -> Result<NaiveDateTime> {
    let mut timestamp = DateTime::from_timestamp_millis(chrono::Utc::now().timestamp_millis())
      .unwrap()
      .naive_utc();

    for attempt in 0..12 {
      match self
        .try_insert_update_with_timestamp(&doc_id, update.as_ref(), timestamp)
        .await
      {
        Ok(true) => return Ok(timestamp),
        Ok(false) => {}
        Err(err) if attempt == 11 => return Err(err.into()),
        Err(_) => {}
      }
      let clock = self.get_doc_clock(doc_id.clone()).await?.map(|clock| clock.timestamp);
      timestamp = (timestamp + chrono::Duration::milliseconds(1)).max(
        clock
          .map(|clock| clock + chrono::Duration::milliseconds(1))
          .unwrap_or(timestamp),
      );
    }
    Err(Error::ConcurrentModification)
  }

  async fn try_insert_update_with_timestamp(
    &self,
    doc_id: &str,
    update: &[u8],
    timestamp: NaiveDateTime,
  ) -> sqlx::Result<bool> {
    let mut tx = self.pool.begin().await?;

    let inserted = sqlx::query(
      "INSERT INTO updates (doc_id, data, created_at) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM clocks WHERE \
       doc_id = $1 AND timestamp >= $3)",
    )
    .bind(doc_id)
    .bind(update)
    .bind(timestamp)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if inserted == 0 {
      return Ok(false);
    }

    sqlx::query(
      r#"
    INSERT INTO clocks (doc_id, timestamp) VALUES ($1, $2)
    ON CONFLICT(doc_id)
    DO UPDATE SET timestamp=MAX(clocks.timestamp, excluded.timestamp);"#,
    )
    .bind(doc_id)
    .bind(timestamp)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(true)
  }

  pub async fn get_doc_snapshot(&self, doc_id: String) -> Result<Option<DocRecord>> {
    let result = sqlx::query_as!(
      DocRecord,
      "SELECT doc_id, data as bin, updated_at as timestamp FROM snapshots WHERE doc_id = ?",
      doc_id
    )
    .fetch_optional(&self.pool)
    .await?;

    Ok(result)
  }

  pub async fn get_doc(&self, doc_id: String) -> Result<Option<DocRecord>> {
    for _ in 0..8 {
      let mut read_tx = self.pool.begin().await?;
      let snapshot = sqlx::query_as!(
        DocRecord,
        "SELECT doc_id, data as bin, updated_at as timestamp FROM snapshots WHERE doc_id = ?",
        doc_id
      )
      .fetch_optional(&mut *read_tx)
      .await?;
      let updates = sqlx::query_as!(
        DocUpdate,
        "SELECT doc_id, created_at as timestamp, data as bin FROM updates WHERE doc_id = ? ORDER BY created_at",
        doc_id
      )
      .fetch_all(&mut *read_tx)
      .await?;
      read_tx.commit().await?;
      if updates.is_empty() {
        return Ok(snapshot);
      }

      let timestamp = updates
        .last()
        .map(|update| update.timestamp)
        .into_iter()
        .chain(snapshot.as_ref().map(|record| record.timestamp))
        .max()
        .expect("updates are not empty");
      let mut segments = Vec::with_capacity(updates.len() + usize::from(snapshot.is_some()));
      if let Some(record) = &snapshot {
        segments.push(record.bin.to_vec());
      }
      segments.extend(updates.iter().map(|update| update.bin.to_vec()));
      let bin = if segments.len() == 1 {
        segments.pop().expect("one segment")
      } else {
        merge_updates_v1(segments)
          .map_err(|_| affine_doc_loader::ParseError::InvalidBinary)?
          .encode_v1()
          .map_err(|_| affine_doc_loader::ParseError::InvalidBinary)?
      };
      let mut doc = DocOptions::new().with_guid(doc_id.clone()).build();
      doc
        .apply_update_from_binary_v1(&bin)
        .map_err(|_| affine_doc_loader::ParseError::InvalidBinary)?;
      if doc.has_pending_updates() {
        return Err(Error::IncompleteDoc);
      }

      let mut tx = self.pool.begin().await?;
      let installed = if let Some(previous) = &snapshot {
        sqlx::query("UPDATE snapshots SET data = ?, updated_at = ? WHERE doc_id = ? AND updated_at = ? AND data = ?")
          .bind(&bin)
          .bind(timestamp)
          .bind(&doc_id)
          .bind(previous.timestamp)
          .bind(previous.bin.deref())
          .execute(&mut *tx)
          .await?
          .rows_affected()
      } else {
        sqlx::query("INSERT INTO snapshots (doc_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
          .bind(&doc_id)
          .bind(&bin)
          .bind(timestamp)
          .execute(&mut *tx)
          .await?
          .rows_affected()
      };
      if installed != 1 {
        continue;
      }

      let current_updates = sqlx::query_as!(
        DocUpdate,
        "SELECT doc_id, created_at as timestamp, data as bin FROM updates WHERE doc_id = ? ORDER BY created_at",
        doc_id
      )
      .fetch_all(&mut *tx)
      .await?;
      if current_updates.len() != updates.len()
        || current_updates
          .iter()
          .zip(&updates)
          .any(|(current, read)| current.timestamp != read.timestamp || current.bin.deref() != read.bin.deref())
      {
        continue;
      }
      sqlx::query("DELETE FROM updates WHERE doc_id = ?")
        .bind(&doc_id)
        .execute(&mut *tx)
        .await?;
      tx.commit().await?;
      let bin = bin.into();
      return Ok(Some(DocRecord { doc_id, bin, timestamp }));
    }
    Err(Error::ConcurrentModification)
  }

  pub async fn set_doc_snapshot(&self, snapshot: DocRecord) -> Result<bool> {
    let result = sqlx::query(
      r#"
    INSERT INTO snapshots (doc_id, data, updated_at)
    VALUES ($1, $2, $3)
    ON CONFLICT(doc_id)
    DO UPDATE SET data=$2, updated_at=$3
    WHERE updated_at <= $3;"#,
    )
    .bind(snapshot.doc_id)
    .bind(snapshot.bin.deref())
    .bind(snapshot.timestamp)
    .execute(&self.pool)
    .await?;

    Ok(result.rows_affected() == 1)
  }

  pub async fn get_doc_updates(&self, doc_id: String) -> Result<Vec<DocUpdate>> {
    let result = sqlx::query_as!(
      DocUpdate,
      "SELECT doc_id, created_at as timestamp, data as bin FROM updates WHERE doc_id = ? ORDER BY created_at",
      doc_id
    )
    .fetch_all(&self.pool)
    .await?;

    Ok(result)
  }

  pub async fn mark_updates_merged(&self, doc_id: String, updates: Vec<NaiveDateTime>) -> Result<u32> {
    let mut qb = QueryBuilder::new("DELETE FROM updates");

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

    sqlx::query("DELETE FROM indexer_sync WHERE doc_id = ?;")
      .bind(&doc_id)
      .execute(&mut *tx)
      .await?;

    tx.commit().await?;

    Ok(())
  }

  pub async fn get_doc_clocks(&self, after: Option<NaiveDateTime>) -> Result<Vec<DocClock>> {
    let query = if let Some(after) = after {
      sqlx::query("SELECT doc_id, timestamp FROM clocks WHERE timestamp > $1").bind(after)
    } else {
      sqlx::query("SELECT doc_id, timestamp FROM clocks")
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

  pub async fn get_doc_clock(&self, doc_id: String) -> Result<Option<DocClock>> {
    let result = sqlx::query_as!(
      DocClock,
      "SELECT doc_id, timestamp FROM clocks WHERE doc_id = ?",
      doc_id
    )
    .fetch_optional(&self.pool)
    .await?;

    Ok(result)
  }
}

#[cfg(test)]
mod tests {
  use chrono::{DateTime, Utc};
  use y_octo::DocOptions;

  use super::*;
  use crate::Data;

  async fn get_storage() -> SqliteDocStorage {
    let storage = SqliteDocStorage::new(":memory:".to_string());
    storage.connect().await.unwrap();

    storage
  }

  fn text_updates() -> (Vec<u8>, Vec<u8>) {
    let doc = DocOptions::new().with_guid("doc".to_string()).build();
    let mut text = doc.get_or_create_text("content").unwrap();
    text.insert(0, "hello").unwrap();
    let first = doc.encode_update_v1().unwrap();
    let state = doc.get_state_vector();
    text.insert(5, " world").unwrap();
    let second = doc.encode_state_as_update_v1(&state).unwrap();
    (first, second)
  }

  #[tokio::test]
  async fn get_doc_compacts_updates_and_preserves_recovery() {
    let storage = get_storage().await;
    assert!(storage.get_doc("doc".to_string()).await.unwrap().is_none());
    let (first, second) = text_updates();
    let first_clock = storage.push_update("doc".to_string(), first).await.unwrap();
    let record = storage.get_doc("doc".to_string()).await.unwrap().unwrap();
    assert_eq!(record.timestamp, first_clock);
    assert!(storage.get_doc_updates("doc".to_string()).await.unwrap().is_empty());

    let second_clock = storage.push_update("doc".to_string(), second).await.unwrap();
    let record = storage.get_doc("doc".to_string()).await.unwrap().unwrap();
    assert!(record.timestamp >= second_clock);
    let mut doc = DocOptions::new().with_guid("doc".to_string()).build();
    doc.apply_update_from_binary_v1(&record.bin).unwrap();
    assert_eq!(doc.get_or_create_text("content").unwrap().to_string(), "hello world");
    assert!(storage.get_doc_updates("doc".to_string()).await.unwrap().is_empty());
  }

  #[tokio::test]
  async fn failed_compaction_rolls_back_snapshot_and_updates() {
    let storage = get_storage().await;
    let (first, second) = text_updates();
    storage.push_update("doc".to_string(), first).await.unwrap();
    sqlx::query("ALTER TABLE updates RENAME TO updates_unavailable")
      .execute(&storage.pool)
      .await
      .unwrap();
    assert!(storage.get_doc("doc".to_string()).await.is_err());
    sqlx::query("ALTER TABLE updates_unavailable RENAME TO updates")
      .execute(&storage.pool)
      .await
      .unwrap();
    assert!(storage.get_doc_snapshot("doc".to_string()).await.unwrap().is_none());
    assert_eq!(storage.get_doc_updates("doc".to_string()).await.unwrap().len(), 1);
    for operation in ["INSERT ON snapshots", "DELETE ON updates"] {
      let create =
        format!("CREATE TRIGGER fail_compaction BEFORE {operation} BEGIN SELECT RAISE(ABORT, 'injected'); END");
      sqlx::query(&create).execute(&storage.pool).await.unwrap();
      assert!(storage.get_doc("doc".to_string()).await.is_err());
      assert!(storage.get_doc_snapshot("doc".to_string()).await.unwrap().is_none());
      assert_eq!(storage.get_doc_updates("doc".to_string()).await.unwrap().len(), 1);
      sqlx::query("DROP TRIGGER fail_compaction")
        .execute(&storage.pool)
        .await
        .unwrap();
    }
    assert!(storage.get_doc("doc".to_string()).await.unwrap().is_some());

    storage.push_update("doc".to_string(), second).await.unwrap();
    sqlx::query("CREATE TRIGGER fail_compaction BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT, 'injected'); END")
      .execute(&storage.pool)
      .await
      .unwrap();
    assert!(storage.get_doc("doc".to_string()).await.is_err());
    assert_eq!(storage.get_doc_updates("doc".to_string()).await.unwrap().len(), 1);
    sqlx::query("DROP TRIGGER fail_compaction")
      .execute(&storage.pool)
      .await
      .unwrap();
    assert!(storage.get_doc("doc".to_string()).await.unwrap().is_some());

    storage.push_update("invalid".to_string(), vec![1]).await.unwrap();
    assert!(storage.get_doc("invalid".to_string()).await.is_err());
    assert!(storage.get_doc_snapshot("invalid".to_string()).await.unwrap().is_none());
    assert_eq!(storage.get_doc_updates("invalid".to_string()).await.unwrap().len(), 1);
  }

  #[tokio::test]
  async fn get_doc_reads_snapshot_and_updates_from_one_view() {
    let path = std::env::temp_dir().join(format!("affine-get-doc-{}.db", uuid::Uuid::new_v4()));
    let storage = SqliteDocStorage::new(path.to_string_lossy().to_string());
    storage.connect().await.unwrap();
    let (first, second) = text_updates();
    storage.push_update("doc".to_string(), first).await.unwrap();
    let first_record = storage.get_doc("doc".to_string()).await.unwrap().unwrap();
    let pushed = storage.push_update("doc".to_string(), second).await.unwrap();

    let mut read_tx = storage.pool.begin().await.unwrap();
    let snapshot = sqlx::query_as!(
      DocRecord,
      "SELECT doc_id, data as bin, updated_at as timestamp FROM snapshots WHERE doc_id = ?",
      "doc"
    )
    .fetch_optional(&mut *read_tx)
    .await
    .unwrap()
    .unwrap();
    assert_eq!(snapshot.bin.deref(), first_record.bin.deref());
    let compacted = storage.get_doc("doc".to_string()).await.unwrap().unwrap();
    assert!(compacted.timestamp >= pushed);
    assert!(storage.get_doc_updates("doc".to_string()).await.unwrap().is_empty());
    let updates = sqlx::query_as!(
      DocUpdate,
      "SELECT doc_id, created_at as timestamp, data as bin FROM updates WHERE doc_id = ? ORDER BY created_at",
      "doc"
    )
    .fetch_all(&mut *read_tx)
    .await
    .unwrap();
    assert_eq!(updates.len(), 1);
    read_tx.commit().await.unwrap();

    let record = storage.get_doc("doc".to_string()).await.unwrap().unwrap();
    assert!(record.timestamp >= pushed);
    let mut doc = DocOptions::new().with_guid("doc".to_string()).build();
    doc.apply_update_from_binary_v1(&record.bin).unwrap();
    assert_eq!(doc.get_or_create_text("content").unwrap().to_string(), "hello world");
    storage.close().await;
    let reopened = SqliteDocStorage::new(path.to_string_lossy().to_string());
    reopened.connect().await.unwrap();
    assert!(reopened.get_doc_updates("doc".to_string()).await.unwrap().is_empty());
    assert_eq!(
      reopened.get_doc("doc".to_string()).await.unwrap().unwrap().timestamp,
      record.timestamp
    );
    reopened.close().await;
    std::fs::remove_file(&path).unwrap();
  }

  #[tokio::test]
  async fn set_space_id() {
    let storage = get_storage().await;

    storage.set_space_id("test".to_string()).await.unwrap();

    let result = sqlx::query!("SELECT space_id FROM meta;")
      .fetch_one(&storage.pool)
      .await
      .unwrap();

    assert_eq!(result.space_id, "test");

    storage.set_space_id("test2".to_string()).await.unwrap();

    let result = sqlx::query!("SELECT space_id FROM meta;")
      .fetch_one(&storage.pool)
      .await
      .unwrap();

    assert_eq!(result.space_id, "test2");
  }

  #[tokio::test]
  async fn set_space_id_with_existing_doc() {
    let storage = get_storage().await;

    storage.set_space_id("test".to_string()).await.unwrap();
    storage.push_update("test".to_string(), vec![0, 0]).await.unwrap();
    storage
      .set_doc_snapshot(DocRecord {
        doc_id: "test".to_string(),
        bin: Into::<Data>::into(vec![0, 0]),
        timestamp: Utc::now().naive_utc(),
      })
      .await
      .unwrap();

    storage
      .set_peer_pulled_remote_clock("remote".to_string(), "test".to_string(), Utc::now().naive_utc())
      .await
      .unwrap();

    storage.set_space_id("new_id".to_string()).await.unwrap();

    let result = sqlx::query!("SELECT space_id FROM meta;")
      .fetch_one(&storage.pool)
      .await
      .unwrap();

    assert_eq!(result.space_id, "new_id");

    let clocks = storage.get_doc_clocks(None).await.unwrap();

    assert_eq!(clocks[0].doc_id, "new_id");

    let clocks = storage
      .get_peer_pulled_remote_clock("remote".to_string(), "new_id".to_string())
      .await
      .unwrap()
      .unwrap();

    assert_eq!(clocks.doc_id, "new_id");

    let updates = storage.get_doc_updates("new_id".to_string()).await.unwrap();

    assert_eq!(updates.len(), 1);

    let snapshot = storage.get_doc_snapshot("new_id".to_string()).await.unwrap();

    assert!(snapshot.is_some());
  }

  #[tokio::test]
  async fn push_updates() {
    let storage = get_storage().await;

    let updates = vec![vec![0, 0], vec![0, 1], vec![1, 0], vec![1, 1]];

    for update in updates.iter() {
      storage.push_update("test".to_string(), update).await.unwrap();
    }

    let result = storage.get_doc_updates("test".to_string()).await.unwrap();

    assert_eq!(result.len(), 4);
    assert_eq!(result.iter().map(|u| u.bin.to_vec()).collect::<Vec<_>>(), updates);
    assert!(result.windows(2).all(|pair| pair[0].timestamp < pair[1].timestamp));

    let future = result.last().unwrap().timestamp + chrono::Duration::seconds(1);
    sqlx::query("UPDATE clocks SET timestamp = ? WHERE doc_id = 'test'")
      .bind(future)
      .execute(&storage.pool)
      .await
      .unwrap();
    let next = storage.push_update("test".to_string(), vec![0, 0]).await.unwrap();
    assert!(next > future);
    assert_eq!(
      storage
        .get_doc_clock("test".to_string())
        .await
        .unwrap()
        .unwrap()
        .timestamp,
      next
    );
  }

  #[tokio::test]
  async fn get_doc_snapshot() {
    let storage = get_storage().await;

    let none = storage.get_doc_snapshot("test".to_string()).await.unwrap();

    assert!(none.is_none());

    let snapshot = DocRecord {
      doc_id: "test".to_string(),
      bin: Into::<Data>::into(vec![0, 0]),
      timestamp: Utc::now().naive_utc(),
    };

    storage.set_doc_snapshot(snapshot).await.unwrap();

    let result = storage.get_doc_snapshot("test".to_string()).await.unwrap();

    assert!(result.is_some());
    assert_eq!(result.unwrap().bin.to_vec(), vec![0, 0]);
  }

  #[tokio::test]
  async fn set_doc_snapshot() {
    let storage = get_storage().await;

    let snapshot = DocRecord {
      doc_id: "test".to_string(),
      bin: Into::<Data>::into(vec![0, 0]),
      timestamp: Utc::now().naive_utc(),
    };

    storage.set_doc_snapshot(snapshot).await.unwrap();

    let result = storage.get_doc_snapshot("test".to_string()).await.unwrap();

    assert!(result.is_some());
    assert_eq!(result.unwrap().bin.to_vec(), vec![0, 0]);

    let snapshot = DocRecord {
      doc_id: "test".to_string(),
      bin: Into::<Data>::into(vec![0, 1]),
      timestamp: DateTime::from_timestamp_millis(Utc::now().timestamp_millis() - 1000)
        .unwrap()
        .naive_utc(),
    };

    // can't update because it's tempstamp is older
    storage.set_doc_snapshot(snapshot).await.unwrap();

    let result = storage.get_doc_snapshot("test".to_string()).await.unwrap();

    assert!(result.is_some());
    assert_eq!(result.unwrap().bin.to_vec(), vec![0, 0]);
  }

  #[tokio::test]
  async fn get_doc_clocks() {
    let storage = get_storage().await;

    let clocks = storage.get_doc_clocks(None).await.unwrap();

    assert_eq!(clocks.len(), 0);

    for i in 1..5u32 {
      storage.push_update(format!("test_{i}"), vec![0, 0]).await.unwrap();
    }

    let clocks = storage.get_doc_clocks(None).await.unwrap();

    assert_eq!(clocks.len(), 4);
    assert_eq!(
      clocks.iter().map(|c| c.doc_id.as_str()).collect::<Vec<_>>(),
      vec!["test_1", "test_2", "test_3", "test_4"]
    );

    let clocks = storage.get_doc_clocks(Some(Utc::now().naive_utc())).await.unwrap();

    assert_eq!(clocks.len(), 0);

    let clock = storage.get_doc_clock("test_1".to_string()).await.unwrap();

    assert!(clock.is_some());
    assert_eq!(clock.unwrap().doc_id, "test_1");
  }

  #[tokio::test]
  async fn mark_updates_merged() {
    let storage = get_storage().await;

    let updates = [vec![0, 0], vec![0, 1], vec![1, 0], vec![1, 1]];

    for update in updates.iter() {
      storage.push_update("test".to_string(), update).await.unwrap();
    }

    let updates = storage.get_doc_updates("test".to_string()).await.unwrap();

    let result = storage
      .mark_updates_merged(
        "test".to_string(),
        updates.iter().skip(1).map(|u| u.timestamp).collect::<Vec<_>>(),
      )
      .await
      .unwrap();

    assert_eq!(result, 3);

    let updates = storage.get_doc_updates("test".to_string()).await.unwrap();

    assert_eq!(updates.len(), 1);
  }
}
