use chrono::NaiveDateTime;

use super::{error::Result, storage::SqliteDocStorage};

impl SqliteDocStorage {
  pub async fn set_blob_uploaded_at(
    &self,
    peer: String,
    blob_id: String,
    uploaded_at: Option<NaiveDateTime>,
  ) -> Result<()> {
    sqlx::query(
      r#"
      INSERT INTO peer_blob_sync (peer, blob_id, uploaded_at)
      VALUES ($1, $2, $3)
      ON CONFLICT(peer, blob_id)
      DO UPDATE SET uploaded_at=$3;"#,
    )
    .bind(peer)
    .bind(blob_id)
    .bind(uploaded_at)
    .execute(&self.pool)
    .await?;

    Ok(())
  }

  pub async fn get_blob_uploaded_at(&self, peer: String, blob_id: String) -> Result<Option<NaiveDateTime>> {
    let result = sqlx::query_scalar!(
      "SELECT uploaded_at FROM peer_blob_sync WHERE peer = ? AND blob_id = ?",
      peer,
      blob_id
    )
    .fetch_optional(&self.pool)
    .await?;

    Ok(result.flatten())
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
  async fn blob_uploaded_at() {
    let storage = get_storage().await;
    let peer = String::from("peer1");
    let blob_id = String::from("blob1");

    let uploaded_at = storage
      .get_blob_uploaded_at(peer.clone(), blob_id.clone())
      .await
      .unwrap();
    assert!(uploaded_at.is_none());

    let now = Utc::now().naive_utc();
    storage
      .set_blob_uploaded_at(peer.clone(), blob_id.clone(), Some(now))
      .await
      .unwrap();
    let uploaded_at = storage
      .get_blob_uploaded_at(peer.clone(), blob_id.clone())
      .await
      .unwrap();
    assert!(uploaded_at.is_some());
    assert_eq!(uploaded_at.unwrap(), now);

    storage
      .set_blob_uploaded_at(peer.clone(), blob_id.clone(), None)
      .await
      .unwrap();
    let uploaded_at = storage
      .get_blob_uploaded_at(peer.clone(), blob_id.clone())
      .await
      .unwrap();
    assert!(uploaded_at.is_none());
  }
}
