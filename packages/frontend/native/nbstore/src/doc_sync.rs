use std::collections::HashMap;

use chrono::NaiveDateTime;
use sqlx::Row;

use super::{DocClock, PeerWorkspaceState, WorkspaceDoc, error::Result, storage::SqliteDocStorage};

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

  pub async fn get_peer_remote_clock(&self, peer: String, doc_id: String) -> Result<Option<DocClock>> {
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

  pub async fn set_peer_remote_clock(&self, peer: String, doc_id: String, clock: NaiveDateTime) -> Result<()> {
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

  pub async fn get_peer_pulled_remote_clock(&self, peer: String, doc_id: String) -> Result<Option<DocClock>> {
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

  pub async fn set_peer_pulled_remote_clock(&self, peer: String, doc_id: String, clock: NaiveDateTime) -> Result<()> {
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

  pub async fn get_peer_pushed_clock(&self, peer: String, doc_id: String) -> Result<Option<DocClock>> {
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

  pub async fn set_peer_pushed_clock(&self, peer: String, doc_id: String, clock: NaiveDateTime) -> Result<()> {
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

  pub async fn get_peer_workspace_state(&self, peer: String, root_doc_id: String) -> Result<PeerWorkspaceState> {
    let mut tx = self.pool.begin().await?;
    let records = sqlx::query(
      "SELECT doc_id, remote_clock, inventory_kind, lifecycle, lifecycle_changed_at, pending_create, inventory_ready, \
       cache_token FROM peer_clocks WHERE peer = ?",
    )
    .bind(peer)
    .fetch_all(&mut *tx)
    .await?;
    let mut state = PeerWorkspaceState {
      cache_token: 0,
      ready: false,
      docs: Vec::new(),
      clocks: HashMap::new(),
    };
    for record in records {
      let doc_id: String = record.get("doc_id");
      if doc_id == root_doc_id {
        state.cache_token = record.get("cache_token");
        state.ready = record.get("inventory_ready");
      }
      let kind: Option<String> = record.get("inventory_kind");
      let pending: bool = record.get("pending_create");
      let timestamp = record
        .get::<NaiveDateTime, _>("remote_clock")
        .and_utc()
        .timestamp_millis();
      if kind.as_deref() == Some("doc") || pending {
        state.docs.push(WorkspaceDoc {
          doc_id,
          timestamp,
          lifecycle: record.get("lifecycle"),
          lifecycle_changed_at: record.get("lifecycle_changed_at"),
          pending_create: pending,
        });
      } else if kind.as_deref() == Some("reserved") {
        state.clocks.insert(doc_id, timestamp);
      }
    }
    tx.commit().await?;
    Ok(state)
  }

  pub async fn invalidate_peer_workspace_state(&self, peer: String, root_doc_id: String) -> Result<()> {
    sqlx::query(
      "INSERT INTO peer_clocks (peer, doc_id, cache_token) VALUES ($1, $2, 1) ON CONFLICT(peer, doc_id) DO UPDATE SET \
       cache_token = cache_token + 1",
    )
    .bind(peer)
    .bind(root_doc_id)
    .execute(&self.pool)
    .await?;
    Ok(())
  }

  pub async fn install_peer_workspace_state(
    &self,
    peer: String,
    root_doc_id: String,
    cache_token: i64,
    docs: Vec<WorkspaceDoc>,
    clocks: HashMap<String, i64>,
  ) -> Result<bool> {
    let mut tx = self.pool.begin().await?;
    sqlx::query("INSERT INTO peer_clocks (peer, doc_id) VALUES ($1, $2) ON CONFLICT(peer,doc_id) DO NOTHING")
      .bind(&peer)
      .bind(&root_doc_id)
      .execute(&mut *tx)
      .await?;
    let installed = sqlx::query(
      "UPDATE peer_clocks SET cache_token = cache_token + 1, inventory_ready = TRUE WHERE peer = $1 AND doc_id = $2 \
       AND cache_token = $3",
    )
    .bind(&peer)
    .bind(&root_doc_id)
    .bind(cache_token)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if installed == 0 {
      return Ok(false);
    }
    sqlx::query(
      "UPDATE peer_clocks SET inventory_kind = NULL, lifecycle = NULL, lifecycle_changed_at = NULL WHERE peer = ?",
    )
    .bind(&peer)
    .execute(&mut *tx)
    .await?;
    for (doc_id, timestamp) in clocks {
      sqlx::query(
        "INSERT INTO peer_clocks (peer,doc_id,remote_clock,inventory_kind) VALUES ($1,$2,$3,'reserved') ON \
         CONFLICT(peer,doc_id) DO UPDATE SET remote_clock = MAX(remote_clock,excluded.remote_clock), inventory_kind = \
         'reserved'",
      )
      .bind(&peer)
      .bind(doc_id)
      .bind(chrono::DateTime::from_timestamp_millis(timestamp).unwrap().naive_utc())
      .execute(&mut *tx)
      .await?;
    }
    for doc in docs {
      sqlx::query(
        "INSERT INTO peer_clocks (peer,doc_id,remote_clock,inventory_kind,lifecycle,lifecycle_changed_at) VALUES \
         ($1,$2,$3,'doc',$4,$5) ON CONFLICT(peer,doc_id) DO UPDATE SET remote_clock = \
         MAX(remote_clock,excluded.remote_clock), inventory_kind = 'doc', lifecycle = excluded.lifecycle, \
         lifecycle_changed_at = excluded.lifecycle_changed_at",
      )
      .bind(&peer)
      .bind(doc.doc_id)
      .bind(
        chrono::DateTime::from_timestamp_millis(doc.timestamp)
          .unwrap()
          .naive_utc(),
      )
      .bind(doc.lifecycle)
      .bind(doc.lifecycle_changed_at)
      .execute(&mut *tx)
      .await?;
    }
    tx.commit().await?;
    Ok(true)
  }

  pub async fn confirm_peer_doc_create(&self, peer: String, doc_id: String) -> Result<()> {
    let mut tx = self.pool.begin().await?;
    let changed = sqlx::query(
      "UPDATE peer_clocks SET pending_create = FALSE WHERE peer = $1 AND doc_id = $2 AND pending_create = TRUE",
    )
    .bind(&peer)
    .bind(doc_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if changed > 0 {
      sqlx::query(
        "INSERT INTO peer_clocks (peer, doc_id, cache_token) SELECT $1, space_id, 1 FROM meta WHERE TRUE ON \
         CONFLICT(peer,doc_id) DO UPDATE SET cache_token = cache_token + 1",
      )
      .bind(peer)
      .execute(&mut *tx)
      .await?;
    }
    tx.commit().await?;
    Ok(())
  }

  pub async fn clear_clocks(&self) -> Result<()> {
    let mut tx = self.pool.begin().await?;
    sqlx::query(
      "DELETE FROM peer_clocks WHERE inventory_kind IS NULL AND pending_create = FALSE AND inventory_ready = FALSE \
       AND cache_token = 0",
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(
      "UPDATE peer_clocks SET remote_clock = CASE WHEN inventory_kind IS NULL THEN 0 ELSE remote_clock END, \
       pulled_remote_clock = 0, pushed_clock = 0, cache_token = cache_token + 1",
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

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
  async fn clear_clocks_preserves_workspace_inventory() {
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

    let peer = "account-a".to_string();
    let root = "workspace".to_string();
    storage.set_space_id(root.clone()).await.unwrap();
    storage
      .push_update_with_peer("pending".into(), [0, 0], Some(peer.clone()))
      .await
      .unwrap();
    let initial = storage
      .get_peer_workspace_state(peer.clone(), root.clone())
      .await
      .unwrap();
    assert!(!initial.ready);
    assert_eq!(initial.cache_token, 1);
    assert_eq!(initial.docs[0].doc_id, "pending");
    assert!(initial.docs[0].pending_create);
    storage
      .invalidate_peer_workspace_state(peer.clone(), root.clone())
      .await
      .unwrap();
    assert!(
      !storage
        .install_peer_workspace_state(peer.clone(), root.clone(), 0, Vec::new(), HashMap::new())
        .await
        .unwrap()
    );
    let entry = |id: &str| WorkspaceDoc {
      doc_id: id.into(),
      timestamp: 1000,
      lifecycle: Some("trashed".into()),
      lifecycle_changed_at: Some(1200),
      pending_create: false,
    };
    let (first, second) = tokio::join!(
      storage.install_peer_workspace_state(
        peer.clone(),
        root.clone(),
        initial.cache_token + 1,
        vec![entry("a")],
        HashMap::new()
      ),
      storage.install_peer_workspace_state(
        peer.clone(),
        root.clone(),
        initial.cache_token + 1,
        vec![entry("b")],
        HashMap::new()
      )
    );
    assert_ne!(first.unwrap(), second.unwrap());
    let installed = storage
      .get_peer_workspace_state(peer.clone(), root.clone())
      .await
      .unwrap();
    assert!(installed.ready);
    assert_eq!(installed.docs.len(), 2);
    let winner = installed
      .docs
      .iter()
      .find(|doc| !doc.pending_create)
      .unwrap()
      .doc_id
      .clone();
    assert_eq!(
      installed
        .docs
        .iter()
        .find(|doc| !doc.pending_create)
        .unwrap()
        .lifecycle
        .as_deref(),
      Some("trashed")
    );
    let ack = Utc::now().naive_utc();
    storage
      .set_peer_pushed_clock(peer.clone(), winner.clone(), ack)
      .await
      .unwrap();
    storage
      .set_peer_pulled_remote_clock(peer.clone(), winner.clone(), ack)
      .await
      .unwrap();
    storage
      .install_peer_workspace_state(
        peer.clone(),
        root.clone(),
        installed.cache_token,
        Vec::new(),
        HashMap::new(),
      )
      .await
      .unwrap();
    assert_eq!(
      storage
        .get_peer_pushed_clock(peer.clone(), winner)
        .await
        .unwrap()
        .unwrap()
        .timestamp,
      ack
    );
    assert_eq!(
      storage
        .get_peer_workspace_state(peer.clone(), root.clone())
        .await
        .unwrap()
        .docs
        .len(),
      1
    );
    assert!(
      storage
        .get_peer_workspace_state("account-b".into(), root.clone())
        .await
        .unwrap()
        .docs
        .is_empty()
    );
    storage.clear_clocks().await.unwrap();
    assert!(
      storage
        .get_peer_workspace_state(peer.clone(), root.clone())
        .await
        .unwrap()
        .docs[0]
        .pending_create
    );
    storage
      .confirm_peer_doc_create(peer.clone(), "pending".into())
      .await
      .unwrap();
    assert!(
      storage
        .get_peer_workspace_state(peer, root)
        .await
        .unwrap()
        .docs
        .is_empty()
    );
    assert!(storage.get_doc("pending".into()).await.unwrap().is_some());

    sqlx::query(
      "CREATE TRIGGER reject_pending BEFORE INSERT ON peer_clocks WHEN NEW.peer = 'rejected' BEGIN SELECT \
       RAISE(ABORT, 'injected failure'); END",
    )
    .execute(&storage.pool)
    .await
    .unwrap();
    assert!(
      storage
        .push_update_with_peer("rolled-back".into(), [0, 0], Some("rejected".into()))
        .await
        .is_err()
    );
    assert!(storage.get_doc("rolled-back".into()).await.unwrap().is_none());
    assert!(storage.get_doc_clock("rolled-back".into()).await.unwrap().is_none());
  }
}
