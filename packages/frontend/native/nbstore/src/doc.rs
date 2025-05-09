use std::ops::Deref;

use chrono::{DateTime, NaiveDateTime};
use sqlx::{QueryBuilder, Row};

use super::{error::Result, storage::SqliteDocStorage, DocClock, DocRecord, DocUpdate};

struct Meta {
  space_id: String,
}

impl SqliteDocStorage {
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

  pub async fn push_update<Update: AsRef<[u8]>>(
    &self,
    doc_id: String,
    update: Update,
  ) -> Result<NaiveDateTime> {
    let mut timestamp = DateTime::from_timestamp_millis(chrono::Utc::now().timestamp_millis())
      .unwrap()
      .naive_utc();

    let mut tried = 0;

    // Keep trying with incremented timestamps until success
    loop {
      match self
        .try_insert_update_with_timestamp(&doc_id, update.as_ref(), timestamp)
        .await
      {
        Ok(()) => break,
        Err(e) => {
          if tried > 10 {
            return Err(e.into());
          }

          // Increment timestamp by 1ms and retry
          timestamp += chrono::Duration::milliseconds(1);
          tried += 1;
        }
      }
    }

    Ok(timestamp)
  }

  async fn try_insert_update_with_timestamp(
    &self,
    doc_id: &str,
    update: &[u8],
    timestamp: NaiveDateTime,
  ) -> sqlx::Result<()> {
    let mut tx = self.pool.begin().await?;

    sqlx::query(r#"INSERT INTO updates (doc_id, data, created_at) VALUES ($1, $2, $3);"#)
      .bind(doc_id)
      .bind(update.as_ref())
      .bind(timestamp)
      .execute(&mut *tx)
      .await?;

    sqlx::query(
      r#"
    INSERT INTO clocks (doc_id, timestamp) VALUES ($1, $2)
    ON CONFLICT(doc_id)
    DO UPDATE SET timestamp=$2;"#,
    )
    .bind(doc_id)
    .bind(timestamp)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(())
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
      "SELECT doc_id, created_at as timestamp, data as bin FROM updates WHERE doc_id = ?",
      doc_id
    )
    .fetch_all(&self.pool)
    .await?;

    Ok(result)
  }

  pub async fn mark_updates_merged(
    &self,
    doc_id: String,
    updates: Vec<NaiveDateTime>,
  ) -> Result<u32> {
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

  use super::*;

  async fn get_storage() -> SqliteDocStorage {
    let storage = SqliteDocStorage::new(":memory:".to_string());
    storage.connect().await.unwrap();

    storage
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
    storage
      .push_update("test".to_string(), vec![0, 0])
      .await
      .unwrap();
    storage
      .set_doc_snapshot(DocRecord {
        doc_id: "test".to_string(),
        bin: vec![0, 0],
        timestamp: Utc::now().naive_utc(),
      })
      .await
      .unwrap();

    storage
      .set_peer_pulled_remote_clock(
        "remote".to_string(),
        "test".to_string(),
        Utc::now().naive_utc(),
      )
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

    let snapshot = storage
      .get_doc_snapshot("new_id".to_string())
      .await
      .unwrap();

    assert!(snapshot.is_some());
  }

  #[tokio::test]
  async fn push_updates() {
    let storage = get_storage().await;

    let updates = vec![vec![0, 0], vec![0, 1], vec![1, 0], vec![1, 1]];

    for update in updates.iter() {
      storage
        .push_update("test".to_string(), update)
        .await
        .unwrap();
    }

    let result = storage.get_doc_updates("test".to_string()).await.unwrap();

    assert_eq!(result.len(), 4);
    assert_eq!(
      result.iter().map(|u| u.bin.as_ref()).collect::<Vec<_>>(),
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
      bin: vec![0, 0],
      timestamp: Utc::now().naive_utc(),
    };

    storage.set_doc_snapshot(snapshot).await.unwrap();

    let result = storage.get_doc_snapshot("test".to_string()).await.unwrap();

    assert!(result.is_some());
    assert_eq!(result.unwrap().bin.as_ref(), vec![0, 0]);
  }

  #[tokio::test]
  async fn set_doc_snapshot() {
    let storage = get_storage().await;

    let snapshot = DocRecord {
      doc_id: "test".to_string(),
      bin: vec![0, 0],
      timestamp: Utc::now().naive_utc(),
    };

    storage.set_doc_snapshot(snapshot).await.unwrap();

    let result = storage.get_doc_snapshot("test".to_string()).await.unwrap();

    assert!(result.is_some());
    assert_eq!(result.unwrap().bin.as_ref(), vec![0, 0]);

    let snapshot = DocRecord {
      doc_id: "test".to_string(),
      bin: vec![0, 1],
      timestamp: DateTime::from_timestamp_millis(Utc::now().timestamp_millis() - 1000)
        .unwrap()
        .naive_utc(),
    };

    // can't update because it's tempstamp is older
    storage.set_doc_snapshot(snapshot).await.unwrap();

    let result = storage.get_doc_snapshot("test".to_string()).await.unwrap();

    assert!(result.is_some());
    assert_eq!(result.unwrap().bin.as_ref(), vec![0, 0]);
  }

  #[tokio::test]
  async fn get_doc_clocks() {
    let storage = get_storage().await;

    let clocks = storage.get_doc_clocks(None).await.unwrap();

    assert_eq!(clocks.len(), 0);

    for i in 1..5u32 {
      storage
        .push_update(format!("test_{i}"), vec![0, 0])
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
      .get_doc_clocks(Some(Utc::now().naive_utc()))
      .await
      .unwrap();

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
      storage
        .push_update("test".to_string(), update)
        .await
        .unwrap();
    }

    let updates = storage.get_doc_updates("test".to_string()).await.unwrap();

    let result = storage
      .mark_updates_merged(
        "test".to_string(),
        updates
          .iter()
          .skip(1)
          .map(|u| u.timestamp)
          .collect::<Vec<_>>(),
      )
      .await
      .unwrap();

    assert_eq!(result, 3);

    let updates = storage.get_doc_updates("test".to_string()).await.unwrap();

    assert_eq!(updates.len(), 1);
  }
}
