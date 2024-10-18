use chrono::NaiveDateTime;

use super::storage::{Result, SqliteDocStorage};
use super::DocClock;

impl SqliteDocStorage {
  pub async fn get_peer_clocks(&self, peer: String) -> Result<Vec<DocClock>> {
    sqlx::query_as!(
      DocClock,
      "SELECT doc_id, clock as timestamp FROM v2_peer_clocks WHERE peer = ?",
      peer
    )
    .fetch_all(&self.pool)
    .await
  }

  pub async fn set_peer_clock(
    &self,
    peer: String,
    doc_id: String,
    clock: NaiveDateTime,
  ) -> Result<()> {
    sqlx::query(
      r#"
      INSERT INTO v2_peer_clocks (peer, doc_id, clock, pushed_clock)
      VALUES ($1, $2, $3, 0)
      ON CONFLICT(peer, doc_id)
      DO UPDATE SET clock=$3 WHERE clock < $3;"#,
    )
    .bind(peer)
    .bind(doc_id)
    .bind(clock)
    .execute(&self.pool)
    .await?;

    Ok(())
  }

  pub async fn get_peer_pushed_clocks(&self, peer: String) -> Result<Vec<DocClock>> {
    sqlx::query_as!(
      DocClock,
      "SELECT doc_id, pushed_clock as timestamp FROM v2_peer_clocks WHERE peer = ?",
      peer
    )
    .fetch_all(&self.pool)
    .await
  }

  pub async fn set_peer_pushed_clock(
    &self,
    peer: String,
    doc_id: String,
    clock: NaiveDateTime,
  ) -> Result<()> {
    sqlx::query(
      r#"
      INSERT INTO v2_peer_clocks (peer, doc_id, clock, pushed_clock)
      VALUES ($1, $2, 0, $3)
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
}

#[cfg(test)]
mod tests {
  use chrono::{DateTime, Utc};
  use sqlx::Row;

  use super::*;

  async fn get_storage() -> SqliteDocStorage {
    let storage = SqliteDocStorage::new(":memory:".to_string());
    storage.connect().await.unwrap();
    storage.test_migrate().await.unwrap();

    storage
  }

  #[tokio::test]
  async fn set_peer_clock() {
    let storage = get_storage().await;
    let peer = String::from("peer1");

    let clocks = storage.get_peer_clocks(peer.clone()).await.unwrap();

    assert!(clocks.is_empty());

    let clock = Utc::now().naive_utc();
    storage
      .set_peer_clock(peer.clone(), "doc1".to_string(), clock)
      .await
      .unwrap();

    let clocks = storage.get_peer_clocks(peer.clone()).await.unwrap();

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
      .set_peer_clock(peer.clone(), "doc1".to_string(), Utc::now().naive_utc())
      .await
      .unwrap();
    storage
      .set_peer_pushed_clock(peer.clone(), "doc2".to_string(), Utc::now().naive_utc())
      .await
      .unwrap();

    let record = sqlx::query("SELECT * FROM v2_peer_clocks WHERE peer = ? AND doc_id = ?")
      .bind(peer.clone())
      .bind("doc1")
      .fetch_one(&storage.pool)
      .await
      .unwrap();

    assert_eq!(
      record.get::<NaiveDateTime, &str>("pushed_clock"),
      DateTime::from_timestamp(0, 0).unwrap().naive_utc()
    );

    let record = sqlx::query("SELECT * FROM v2_peer_clocks WHERE peer = ? AND doc_id = ?")
      .bind(peer.clone())
      .bind("doc2")
      .fetch_one(&storage.pool)
      .await
      .unwrap();
    assert_eq!(
      record.get::<NaiveDateTime, &str>("clock"),
      DateTime::from_timestamp(0, 0).unwrap().naive_utc()
    );
  }
}
