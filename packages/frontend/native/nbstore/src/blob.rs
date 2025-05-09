use std::ops::Deref;

use super::{error::Result, storage::SqliteDocStorage, Blob, ListedBlob, SetBlob};

impl SqliteDocStorage {
  pub async fn get_blob(&self, key: String) -> Result<Option<Blob>> {
    let result = sqlx::query_as!(
      Blob,
      "SELECT key, data, size, mime, created_at FROM blobs WHERE key = ? AND deleted_at IS NULL",
      key
    )
    .fetch_optional(&self.pool)
    .await?;

    Ok(result)
  }

  pub async fn set_blob(&self, blob: SetBlob) -> Result<()> {
    sqlx::query(
      r#"
      INSERT INTO blobs (key, data, mime, size)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(key)
      DO UPDATE SET data=$2, mime=$3, size=$4, deleted_at=NULL;"#,
    )
    .bind(blob.key)
    .bind(blob.data.deref())
    .bind(blob.mime)
    .bind(blob.data.len() as i64)
    .execute(&self.pool)
    .await?;

    Ok(())
  }

  pub async fn delete_blob(&self, key: String, permanently: bool) -> Result<()> {
    if permanently {
      sqlx::query("DELETE FROM blobs WHERE key = ?")
        .bind(&key)
        .execute(&self.pool)
        .await?;
    } else {
      sqlx::query("UPDATE blobs SET deleted_at = CURRENT_TIMESTAMP WHERE key = ?")
        .bind(&key)
        .execute(&self.pool)
        .await?;
    }

    Ok(())
  }

  pub async fn release_blobs(&self) -> Result<()> {
    sqlx::query("DELETE FROM blobs WHERE deleted_at IS NOT NULL;")
      .execute(&self.pool)
      .await?;

    Ok(())
  }

  pub async fn list_blobs(&self) -> Result<Vec<ListedBlob>> {
    let result = sqlx::query_as!(
      ListedBlob,
      "SELECT key, size, mime, created_at FROM blobs WHERE deleted_at IS NULL ORDER BY created_at \
       DESC;"
    )
    .fetch_all(&self.pool)
    .await?;

    Ok(result)
  }
}

#[cfg(test)]
mod tests {
  use sqlx::Row;

  use super::*;

  async fn get_storage() -> SqliteDocStorage {
    let storage = SqliteDocStorage::new(":memory:".to_string());
    storage.connect().await.unwrap();

    storage
  }

  #[tokio::test]
  async fn delete_blob() {
    let storage = get_storage().await;

    for i in 1..5u32 {
      storage
        .set_blob(SetBlob {
          key: format!("test_{}", i),
          data: vec![0, 0],
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
        .set_blob(SetBlob {
          key: format!("test_{}", i),
          data: vec![0, 0],
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

    let query = sqlx::query("SELECT COUNT(*) as len FROM blobs;")
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
        .set_blob(SetBlob {
          key: format!("test_{}", i),
          data: vec![0, 0],
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

    let query = sqlx::query("SELECT COUNT(*) as len FROM blobs;")
      .fetch_one(&storage.pool)
      .await
      .unwrap();

    assert_eq!(query.get::<i64, &str>("len"), 3);
  }
}
