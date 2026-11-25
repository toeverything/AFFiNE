use std::collections::HashMap;

use chrono::NaiveDateTime;
use sqlx::Row;

use super::{
    DocClock, PeerWorkspaceState, SqliteDocStorage, WorkspaceDocInventory, millis_to_naive_utc,
    naive_utc_to_millis,
};
use crate::error::StoreResult;

fn row_to_doc_clock(row: &sqlx::sqlite::SqliteRow) -> StoreResult<DocClock> {
    Ok(DocClock {
        doc_id: row.try_get("doc_id")?,
        timestamp: row.try_get("timestamp")?,
    })
}

impl SqliteDocStorage {
    pub async fn get_peer_remote_clocks(&self, peer: &str) -> StoreResult<Vec<DocClock>> {
        let rows =
            sqlx::query("SELECT doc_id, remote_clock AS timestamp FROM peer_clocks WHERE peer = ?")
                .bind(peer)
                .fetch_all(&self.pool)
                .await?;
        rows.iter().map(row_to_doc_clock).collect()
    }

    pub async fn get_peer_remote_clock(
        &self,
        peer: &str,
        doc_id: &str,
    ) -> StoreResult<Option<DocClock>> {
        let row = sqlx::query(
            "SELECT doc_id, remote_clock AS timestamp FROM peer_clocks \
             WHERE peer = ? AND doc_id = ?",
        )
        .bind(peer)
        .bind(doc_id)
        .fetch_optional(&self.pool)
        .await?;
        row.as_ref().map(row_to_doc_clock).transpose()
    }

    pub async fn set_peer_remote_clock(
        &self,
        peer: &str,
        doc_id: &str,
        clock: NaiveDateTime,
    ) -> StoreResult<()> {
        sqlx::query(
            "INSERT INTO peer_clocks (peer, doc_id, remote_clock) VALUES ($1, $2, $3) \
             ON CONFLICT(peer, doc_id) DO UPDATE SET remote_clock = $3 WHERE remote_clock < $3;",
        )
        .bind(peer)
        .bind(doc_id)
        .bind(clock)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_peer_pulled_remote_clocks(&self, peer: &str) -> StoreResult<Vec<DocClock>> {
        let rows = sqlx::query(
            "SELECT doc_id, pulled_remote_clock AS timestamp FROM peer_clocks WHERE peer = ?",
        )
        .bind(peer)
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(row_to_doc_clock).collect()
    }

    pub async fn get_peer_pulled_remote_clock(
        &self,
        peer: &str,
        doc_id: &str,
    ) -> StoreResult<Option<DocClock>> {
        let row = sqlx::query(
            "SELECT doc_id, pulled_remote_clock AS timestamp FROM peer_clocks \
             WHERE peer = ? AND doc_id = ?",
        )
        .bind(peer)
        .bind(doc_id)
        .fetch_optional(&self.pool)
        .await?;
        row.as_ref().map(row_to_doc_clock).transpose()
    }

    pub async fn set_peer_pulled_remote_clock(
        &self,
        peer: &str,
        doc_id: &str,
        clock: NaiveDateTime,
    ) -> StoreResult<()> {
        sqlx::query(
            "INSERT INTO peer_clocks (peer, doc_id, pulled_remote_clock) VALUES ($1, $2, $3) \
             ON CONFLICT(peer, doc_id) DO UPDATE SET pulled_remote_clock = $3 \
             WHERE pulled_remote_clock < $3;",
        )
        .bind(peer)
        .bind(doc_id)
        .bind(clock)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_peer_pushed_clocks(&self, peer: &str) -> StoreResult<Vec<DocClock>> {
        let rows =
            sqlx::query("SELECT doc_id, pushed_clock AS timestamp FROM peer_clocks WHERE peer = ?")
                .bind(peer)
                .fetch_all(&self.pool)
                .await?;
        rows.iter().map(row_to_doc_clock).collect()
    }

    pub async fn get_peer_pushed_clock(
        &self,
        peer: &str,
        doc_id: &str,
    ) -> StoreResult<Option<DocClock>> {
        let row = sqlx::query(
            "SELECT doc_id, pushed_clock AS timestamp FROM peer_clocks \
             WHERE peer = ? AND doc_id = ?",
        )
        .bind(peer)
        .bind(doc_id)
        .fetch_optional(&self.pool)
        .await?;
        row.as_ref().map(row_to_doc_clock).transpose()
    }

    pub async fn set_peer_pushed_clock(
        &self,
        peer: &str,
        doc_id: &str,
        clock: NaiveDateTime,
    ) -> StoreResult<()> {
        sqlx::query(
            "INSERT INTO peer_clocks (peer, doc_id, pushed_clock) VALUES ($1, $2, $3) \
             ON CONFLICT(peer, doc_id) DO UPDATE SET pushed_clock = $3 WHERE pushed_clock < $3;",
        )
        .bind(peer)
        .bind(doc_id)
        .bind(clock)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_peer_workspace_state(
        &self,
        peer: &str,
        root_doc_id: &str,
    ) -> StoreResult<PeerWorkspaceState> {
        let mut tx = self.pool.begin().await?;
        let records = sqlx::query(
            "SELECT doc_id, remote_clock, inventory_kind, lifecycle, lifecycle_changed_at, \
             pending_create, inventory_ready, cache_token FROM peer_clocks WHERE peer = ?",
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
            let doc_id: String = record.try_get("doc_id")?;
            if doc_id == root_doc_id {
                state.cache_token = record.try_get("cache_token")?;
                state.ready = record.try_get("inventory_ready")?;
            }
            let kind: Option<String> = record.try_get("inventory_kind")?;
            let pending: bool = record.try_get("pending_create")?;
            let remote_clock: NaiveDateTime = record.try_get("remote_clock")?;
            let timestamp = naive_utc_to_millis(remote_clock);

            if kind.as_deref() == Some("doc") || pending {
                state.docs.push(WorkspaceDocInventory {
                    doc_id,
                    timestamp,
                    lifecycle: record.try_get("lifecycle")?,
                    lifecycle_changed_at: record.try_get("lifecycle_changed_at")?,
                    pending_create: pending,
                });
            } else if kind.as_deref() == Some("reserved") {
                state.clocks.insert(doc_id, timestamp);
            }
        }
        tx.commit().await?;
        Ok(state)
    }

    pub async fn invalidate_peer_workspace_state(
        &self,
        peer: &str,
        root_doc_id: &str,
    ) -> StoreResult<()> {
        sqlx::query(
            "INSERT INTO peer_clocks (peer, doc_id, cache_token) VALUES ($1, $2, 1) \
             ON CONFLICT(peer, doc_id) DO UPDATE SET cache_token = cache_token + 1",
        )
        .bind(peer)
        .bind(root_doc_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn install_peer_workspace_state(
        &self,
        peer: &str,
        root_doc_id: &str,
        cache_token: i64,
        docs: &[WorkspaceDocInventory],
        clocks: &HashMap<String, i64>,
    ) -> StoreResult<bool> {
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "INSERT INTO peer_clocks (peer, doc_id) VALUES ($1, $2) \
             ON CONFLICT(peer, doc_id) DO NOTHING",
        )
        .bind(peer)
        .bind(root_doc_id)
        .execute(&mut *tx)
        .await?;

        let installed = sqlx::query(
            "UPDATE peer_clocks SET cache_token = cache_token + 1, inventory_ready = TRUE \
             WHERE peer = $1 AND doc_id = $2 AND cache_token = $3",
        )
        .bind(peer)
        .bind(root_doc_id)
        .bind(cache_token)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if installed == 0 {
            return Ok(false);
        }

        sqlx::query(
            "UPDATE peer_clocks SET inventory_kind = NULL, lifecycle = NULL, \
             lifecycle_changed_at = NULL WHERE peer = ?",
        )
        .bind(peer)
        .execute(&mut *tx)
        .await?;

        for (doc_id, timestamp) in clocks {
            sqlx::query(
                "INSERT INTO peer_clocks (peer, doc_id, remote_clock, inventory_kind) \
                 VALUES ($1, $2, $3, 'reserved') \
                 ON CONFLICT(peer, doc_id) DO UPDATE SET \
                   remote_clock = MAX(remote_clock, excluded.remote_clock), \
                   inventory_kind = 'reserved'",
            )
            .bind(peer)
            .bind(doc_id)
            .bind(millis_to_naive_utc(*timestamp))
            .execute(&mut *tx)
            .await?;
        }

        for doc in docs {
            sqlx::query(
                "INSERT INTO peer_clocks (\
                   peer, doc_id, remote_clock, inventory_kind, lifecycle, lifecycle_changed_at\
                 ) VALUES ($1, $2, $3, 'doc', $4, $5) \
                 ON CONFLICT(peer, doc_id) DO UPDATE SET \
                   remote_clock = MAX(remote_clock, excluded.remote_clock), \
                   inventory_kind = 'doc', \
                   lifecycle = excluded.lifecycle, \
                   lifecycle_changed_at = excluded.lifecycle_changed_at",
            )
            .bind(peer)
            .bind(&doc.doc_id)
            .bind(millis_to_naive_utc(doc.timestamp))
            .bind(&doc.lifecycle)
            .bind(doc.lifecycle_changed_at)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(true)
    }

    pub async fn confirm_peer_doc_create(&self, peer: &str, doc_id: &str) -> StoreResult<()> {
        let mut tx = self.pool.begin().await?;
        let changed = sqlx::query(
            "UPDATE peer_clocks SET pending_create = FALSE \
             WHERE peer = $1 AND doc_id = $2 AND pending_create = TRUE",
        )
        .bind(peer)
        .bind(doc_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if changed > 0 {
            sqlx::query(
                "INSERT INTO peer_clocks (peer, doc_id, cache_token) \
                 SELECT $1, space_id, 1 FROM meta WHERE TRUE \
                 ON CONFLICT(peer, doc_id) DO UPDATE SET cache_token = cache_token + 1",
            )
            .bind(peer)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn clear_clocks(&self) -> StoreResult<()> {
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "DELETE FROM peer_clocks WHERE inventory_kind IS NULL \
             AND pending_create = FALSE AND inventory_ready = FALSE AND cache_token = 0",
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE peer_clocks SET \
               remote_clock = CASE WHEN inventory_kind IS NULL THEN 0 ELSE remote_clock END, \
               pulled_remote_clock = 0, pushed_clock = 0, cache_token = cache_token + 1",
        )
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }
    /// Persist inbound `SpaceSyncEvent` document updates atomically inside a single
    /// `BEGIN IMMEDIATE` transaction via [`Self::push_updates_batch`], then advance both
    /// `remote_clock` and `pulled_remote_clock` in `peer_clocks` using each event's server
    /// `timestamp` (distinct from `local_now_ms`).
    pub async fn persist_inbound_sync_events(
        &self,
        peer: &str,
        events: &[crate::sync::SpaceSyncEvent],
        local_now_ms: i64,
    ) -> StoreResult<Vec<(String, NaiveDateTime)>> {
        let mut batch = Vec::new();
        let mut remote_clocks: HashMap<String, i64> = HashMap::new();
        for event in events {
            match event {
                crate::sync::SpaceSyncEvent::DocLoaded {
                    doc_id,
                    missing,
                    timestamp,
                    ..
                } => {
                    remote_clocks
                        .entry(doc_id.clone())
                        .and_modify(|ts| *ts = (*ts).max(*timestamp))
                        .or_insert(*timestamp);
                    if !missing.is_empty() && missing.as_slice() != [0, 0] {
                        batch.push(crate::workspace_db::PendingDocUpdate {
                            doc_id: doc_id.clone(),
                            update: missing.clone(),
                        });
                    }
                }
                crate::sync::SpaceSyncEvent::RemoteDocUpdates {
                    doc_id,
                    updates,
                    timestamp,
                    ..
                } => {
                    remote_clocks
                        .entry(doc_id.clone())
                        .and_modify(|ts| *ts = (*ts).max(*timestamp))
                        .or_insert(*timestamp);
                    for update in updates {
                        if !update.is_empty() && update.as_slice() != [0, 0] {
                            batch.push(crate::workspace_db::PendingDocUpdate {
                                doc_id: doc_id.clone(),
                                update: update.clone(),
                            });
                        }
                    }
                }
                _ => {}
            }
        }
        let persisted = self.push_updates_batch(&batch, None, local_now_ms).await?;
        for (doc_id, remote_ms) in remote_clocks {
            let remote_dt = millis_to_naive_utc(remote_ms);
            self.set_peer_remote_clock(peer, &doc_id, remote_dt).await?;
            self.set_peer_pulled_remote_clock(peer, &doc_id, remote_dt)
                .await?;
        }
        Ok(persisted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn peer_clocks_and_workspace_inventory_lifecycle() {
        let storage = SqliteDocStorage::new(":memory:");
        storage.connect().await.unwrap();
        storage.set_space_id("ws-root").await.unwrap();

        storage
            .push_update_with_peer("doc-new", [0u8, 0u8], Some("acct-1"), 10_000)
            .await
            .unwrap();
        let initial = storage
            .get_peer_workspace_state("acct-1", "ws-root")
            .await
            .unwrap();
        assert!(!initial.ready);
        assert_eq!(initial.cache_token, 1);
        assert_eq!(initial.docs.len(), 1);
        assert!(initial.docs[0].pending_create);

        let installed = storage
            .install_peer_workspace_state(
                "acct-1",
                "ws-root",
                initial.cache_token,
                &[WorkspaceDocInventory {
                    doc_id: "doc-remote".into(),
                    timestamp: 20_000,
                    lifecycle: Some("trashed".into()),
                    lifecycle_changed_at: Some(21_000),
                    pending_create: false,
                }],
                &HashMap::from([("db$folders".to_string(), 19_000)]),
            )
            .await
            .unwrap();
        assert!(installed);

        let after = storage
            .get_peer_workspace_state("acct-1", "ws-root")
            .await
            .unwrap();
        assert!(after.ready);
        assert_eq!(after.docs.len(), 2);
        assert_eq!(after.clocks.get("db$folders"), Some(&19_000));

        storage
            .confirm_peer_doc_create("acct-1", "doc-new")
            .await
            .unwrap();
        let confirmed = storage
            .get_peer_workspace_state("acct-1", "ws-root")
            .await
            .unwrap();
        assert_eq!(confirmed.docs.len(), 1);
        assert_eq!(confirmed.docs[0].doc_id, "doc-remote");

        storage.clear_clocks().await.unwrap();
        let cleared = storage
            .get_peer_workspace_state("acct-1", "ws-root")
            .await
            .unwrap();
        assert_eq!(cleared.docs.len(), 1);
    }

    #[tokio::test]
    async fn persist_inbound_sync_events_updates_doc_and_peer_remote_clocks() {
        let storage = SqliteDocStorage::new(":memory:");
        storage.connect().await.unwrap();
        let mut ws = crate::workspace_db::WorkspaceDb::new("ws-sync", "u1", 1);
        let init = ws.initialize_meta().unwrap().unwrap();
        let events = vec![crate::sync::SpaceSyncEvent::DocLoaded {
            doc_id: "ws-sync".into(),
            missing: init.clone(),
            state: vec![],
            timestamp: 42_000,
        }];
        let persisted = storage
            .persist_inbound_sync_events("cloud", &events, 50_000)
            .await
            .unwrap();
        assert_eq!(persisted.len(), 1);
        let remote = storage
            .get_peer_remote_clock("cloud", "ws-sync")
            .await
            .unwrap()
            .unwrap();
        let pulled = storage
            .get_peer_pulled_remote_clock("cloud", "ws-sync")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(naive_utc_to_millis(remote.timestamp), 42_000);
        assert_eq!(naive_utc_to_millis(pulled.timestamp), 42_000);
    }
}
