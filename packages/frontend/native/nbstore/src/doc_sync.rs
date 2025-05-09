use chrono::NaiveDateTime;

use super::{error::Result, storage::SqliteDocStorage, DocClock};

impl SqliteDocStorage {
  pub async fn get_peer_remote_clocks(&self, peer: String) -> Result<Vec<DocClock>> {
    let result = sqlx::query_as!(
      DocClock,
      "SELECT doc_id, remote_clock as timestamp FROM peer_clocks WHERE peer = ?",
      peer
    )
    .fetch_all(&self.pool)
    .await?;

    Ok(result)
  }

  pub async fn get_peer_remote_clock(
    &self,
    peer: String,
    doc_id: String,
  ) -> Result<Option<DocClock>> {
    let result = sqlx::query_as!(
      DocClock,
      "SELECT doc_id, remote_clock as timestamp FROM peer_clocks WHERE peer = ? AND doc_id = ?",
      peer,
      doc_id
    )
    .fetch_optional(&self.pool)
    .await?;

    Ok(result)
  }

  pub async fn set_peer_remote_clock(
    &self,
    peer: String,
    doc_id: String,
    clock: NaiveDateTime,
  ) -> Result<()> {
    sqlx::query(
      r#"
      INSERT INTO peer_clocks (peer, doc_id, remote_clock)
      VALUES ($1, $2, $3)
      ON CONFLICT(peer, doc_id)
      DO UPDATE SET remote_clock=$3 WHERE remote_clock < $3;"#,
    )
    .bind(peer)
    .bind(doc_id)
    .bind(clock)
    .execute(&self.pool)
    .await?;

    Ok(())
  }

  pub async fn get_peer_pulled_remote_clocks(&self, peer: String) -> Result<Vec<DocClock>> {
    let result = sqlx::query_as!(
      DocClock,
      "SELECT doc_id, pulled_remote_clock as timestamp FROM peer_clocks WHERE peer = ?",
      peer
    )
    .fetch_all(&self.pool)
    .await?;

    Ok(result)
  }

  pub async fn get_peer_pulled_remote_clock(
    &self,
    peer: String,
    doc_id: String,
  ) -> Result<Option<DocClock>> {
    let result = sqlx::query_as!(
      DocClock,
      r#"SELECT doc_id, pulled_remote_clock as timestamp FROM peer_clocks WHERE peer = ? AND doc_id = ?"#,
      peer,
      doc_id
    )
    .fetch_optional(&self.pool)
    .await?;

    Ok(result)
  }

  pub async fn set_peer_pulled_remote_clock(
    &self,
    peer: String,
    doc_id: String,
    clock: NaiveDateTime,
  ) -> Result<()> {
    sqlx::query(
      r#"
      INSERT INTO peer_clocks (peer, doc_id, pulled_remote_clock)
      VALUES ($1, $2, $3)
      ON CONFLICT(peer, doc_id)
      DO UPDATE SET pulled_remote_clock=$3 WHERE pulled_remote_clock < $3;"#,
    )
    .bind(peer)
    .bind(doc_id)
    .bind(clock)
    .execute(&self.pool)
    .await?;

    Ok(())
  }

  pub async fn get_peer_pushed_clocks(&self, peer: String) -> Result<Vec<DocClock>> {
    let result = sqlx::query_as!(
      DocClock,
      "SELECT doc_id, pushed_clock as timestamp FROM peer_clocks WHERE peer = ?",
      peer
    )
    .fetch_all(&self.pool)
    .await?;

    Ok(result)
  }

  pub async fn get_peer_pushed_clock(
    &self,
    peer: String,
    doc_id: String,
  ) -> Result<Option<DocClock>> {
    let result = sqlx::query_as!(
      DocClock,
      "SELECT doc_id, pushed_clock as timestamp FROM peer_clocks WHERE peer = ? AND doc_id = ?",
      peer,
      doc_id
    )
    .fetch_optional(&self.pool)
    .await?;

    Ok(result)
  }

  pub async fn set_peer_pushed_clock(
    &self,
    peer: String,
    doc_id: String,
    clock: NaiveDateTime,
  ) -> Result<()> {
    sqlx::query(
      r#"
      INSERT INTO peer_clocks (peer, doc_id, pushed_clock)
      VALUES ($1, $2, $3)
      ON CONFLICT(peer, doc_id)
      DO UPDATE SET pushed_clock=$3 WHERE pushed_clock < $3;"#,
    )
    .bind(peer)
    .bind(doc_id)
    .bind(clock)
    .execute(&self.pool)
    .await?;

    Ok(())
  }

  pub async fn clear_clocks(&self) -> Result<()> {
    sqlx::query("DELETE FROM peer_clocks;")
      .execute(&self.pool)
      .await?;

    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use chrono::{DateTime, Utc};
  use sqlx::Row;

  use super::*;

  async fn get_storage() -> SqliteDocStorage {
    let storage = SqliteDocStorage::new(":memory:".to_string());
    storage.connect().await.unwrap();

    storage
  }

  #[tokio::test]
  async fn set_peer_clock() {
    let storage = get_storage().await;
    let peer = String::from("peer1");

    let clocks = storage.get_peer_remote_clocks(peer.clone()).await.unwrap();

    assert!(clocks.is_empty());

    let clock = Utc::now().naive_utc();
    storage
      .set_peer_remote_clock(peer.clone(), "doc1".to_string(), clock)
      .await
      .unwrap();

    let clocks = storage.get_peer_remote_clocks(peer.clone()).await.unwrap();

    assert_eq!(clocks.len(), 1);
    assert_eq!(clocks.first().unwrap().doc_id, "doc1");
    assert_eq!(clocks.first().unwrap().timestamp, clock);
  }

  #[tokio::test]
  async fn set_peer_pushed_clock() {
    let storage = get_storage().await;
    let peer = String::from("peer1");

    let clocks = storage.get_peer_pushed_clocks(peer.clone()).await.unwrap();

    assert!(clocks.is_empty());

    let clock = Utc::now().naive_utc();
    storage
      .set_peer_pushed_clock(peer.clone(), "doc1".to_string(), clock)
      .await
      .unwrap();

    let clocks = storage.get_peer_pushed_clocks(peer.clone()).await.unwrap();

    assert_eq!(clocks.len(), 1);
    assert_eq!(clocks.first().unwrap().doc_id, "doc1");
    assert_eq!(clocks.first().unwrap().timestamp, clock);
  }

  #[tokio::test]
  async fn default_clocks() {
    let storage = get_storage().await;
    let peer = String::from("peer1");

    storage
      .set_peer_remote_clock(peer.clone(), "doc1".to_string(), Utc::now().naive_utc())
      .await
      .unwrap();
    storage
      .set_peer_pushed_clock(peer.clone(), "doc2".to_string(), Utc::now().naive_utc())
      .await
      .unwrap();
    storage
      .set_peer_pulled_remote_clock(peer.clone(), "doc3".to_string(), Utc::now().naive_utc())
      .await
      .unwrap();

    let record = sqlx::query("SELECT * FROM peer_clocks WHERE peer = ? AND doc_id = ?")
      .bind(peer.clone())
      .bind("doc1")
      .fetch_one(&storage.pool)
      .await
      .unwrap();

    assert_eq!(
      record.get::<NaiveDateTime, &str>("pushed_clock"),
      DateTime::from_timestamp(0, 0).unwrap().naive_utc()
    );

    let record = sqlx::query("SELECT * FROM peer_clocks WHERE peer = ? AND doc_id = ?")
      .bind(peer.clone())
      .bind("doc2")
      .fetch_one(&storage.pool)
      .await
      .unwrap();
    assert_eq!(
      record.get::<NaiveDateTime, &str>("remote_clock"),
      DateTime::from_timestamp(0, 0).unwrap().naive_utc()
    );

    let record = sqlx::query("SELECT * FROM peer_clocks WHERE peer = ? AND doc_id = ?")
      .bind(peer.clone())
      .bind("doc3")
      .fetch_one(&storage.pool)
      .await
      .unwrap();

    assert_eq!(
      record.get::<NaiveDateTime, &str>("remote_clock"),
      DateTime::from_timestamp(0, 0).unwrap().naive_utc()
    );
  }

  #[tokio::test]
  async fn clear_clocks() {
    let storage = get_storage().await;
    let peer = String::from("peer1");

    storage
      .set_peer_remote_clock(peer.clone(), "doc1".to_string(), Utc::now().naive_utc())
      .await
      .unwrap();
    storage
      .set_peer_pushed_clock(peer.clone(), "doc2".to_string(), Utc::now().naive_utc())
      .await
      .unwrap();

    let clocks = storage.get_peer_remote_clocks(peer.clone()).await.unwrap();
    assert_eq!(clocks.len(), 2);

    let clocks = storage.get_peer_pushed_clocks(peer.clone()).await.unwrap();
    assert_eq!(clocks.len(), 2);

    storage.clear_clocks().await.unwrap();

    let clocks = storage.get_peer_remote_clocks(peer.clone()).await.unwrap();
    assert!(clocks.is_empty());

    let clocks = storage.get_peer_pushed_clocks(peer.clone()).await.unwrap();
    assert!(clocks.is_empty());
  }
}
