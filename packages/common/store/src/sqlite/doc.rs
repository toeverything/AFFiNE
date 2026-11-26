use chrono::NaiveDateTime;
use sqlx::{QueryBuilder, Row};
use y_octo::{
    diff_update_v1, encode_state_vector_from_update_v1, merge_updates_v1, validate_update_v1,
};

use super::{DocClock, DocDiff, DocRecord, DocUpdate, SqliteDocStorage, millis_to_naive_utc};
use crate::error::{StoreError, StoreResult};

fn is_empty_update(bin: &[u8]) -> bool {
    bin.is_empty() || bin == [0, 0]
}

/// Merge a slice of encoded v1 CRDT updates into a single v1 update.
pub fn merge_updates(updates: &[&[u8]]) -> StoreResult<Vec<u8>> {
    let non_empty: Vec<&[u8]> = updates
        .iter()
        .copied()
        .filter(|u| !is_empty_update(u))
        .collect();
    match non_empty.as_slice() {
        [] => Ok(vec![0, 0]),
        [single] => {
            validate_update_v1(single).map_err(|err| StoreError::InvalidBinary(err.to_string()))?;
            Ok((*single).to_vec())
        }
        many => merge_updates_v1(many.iter().copied())
            .and_then(|merged| merged.encode_v1())
            .map_err(|err| StoreError::InvalidBinary(err.to_string())),
    }
}

fn row_to_doc_record(row: &sqlx::sqlite::SqliteRow) -> StoreResult<DocRecord> {
    Ok(DocRecord {
        doc_id: row.try_get("doc_id")?,
        bin: row.try_get("bin")?,
        timestamp: row.try_get("timestamp")?,
    })
}

fn row_to_doc_update(row: &sqlx::sqlite::SqliteRow) -> StoreResult<DocUpdate> {
    Ok(DocUpdate {
        doc_id: row.try_get("doc_id")?,
        timestamp: row.try_get("timestamp")?,
        bin: row.try_get("bin")?,
    })
}

impl SqliteDocStorage {
    /// Set or rename the workspace `space_id` in `meta`, migrating root doc rows if renamed.
    pub async fn set_space_id(&self, space_id: &str) -> StoreResult<()> {
        let existing = sqlx::query("SELECT space_id FROM meta LIMIT 1;")
            .fetch_optional(&self.pool)
            .await?;

        match existing {
            Some(row) => {
                let current_id: String = row.try_get("space_id")?;
                if current_id != space_id {
                    let mut tx = self.pool.begin().await?;
                    sqlx::query("UPDATE meta SET space_id = $1;")
                        .bind(space_id)
                        .execute(&mut *tx)
                        .await?;
                    for table in [
                        "updates",
                        "snapshots",
                        "clocks",
                        "indexer_sync",
                        "peer_clocks",
                    ] {
                        let sql = format!("UPDATE {table} SET doc_id = $1 WHERE doc_id = $2;");
                        sqlx::query(&sql)
                            .bind(space_id)
                            .bind(&current_id)
                            .execute(&mut *tx)
                            .await?;
                    }
                    tx.commit().await?;
                }
            }
            None => {
                sqlx::query("INSERT INTO meta (space_id) VALUES ($1);")
                    .bind(space_id)
                    .execute(&self.pool)
                    .await?;
            }
        }
        Ok(())
    }

    /// Push a document update using an explicit deterministic timestamp in milliseconds.
    pub async fn push_update<U: AsRef<[u8]>>(
        &self,
        doc_id: &str,
        update: U,
        now_ms: i64,
    ) -> StoreResult<NaiveDateTime> {
        self.push_update_with_peer(doc_id, update, None, now_ms)
            .await
    }

    /// Push a document update, optionally marking `pending_create` for `create_for_peer`.
    ///
    /// Preserves single-row empty-update (`[0, 0]`) registration in `updates`/`clocks`/`peer_clocks`.
    pub async fn push_update_with_peer<U: AsRef<[u8]>>(
        &self,
        doc_id: &str,
        update: U,
        create_for_peer: Option<&str>,
        now_ms: i64,
    ) -> StoreResult<NaiveDateTime> {
        let committed = self
            .push_updates_in_immediate_tx(&[(doc_id, update.as_ref())], create_for_peer, now_ms)
            .await?;
        Ok(committed[0].1)
    }

    /// Atomically persist a batch of [`crate::workspace_db::PendingDocUpdate`] entries inside a
    /// single `BEGIN IMMEDIATE` SQLite transaction.
    ///
    /// Guarantees multi-document logical mutations (such as root `meta.pages` + `db$docProperties`
    /// during Edgeless document creation) commit all-or-nothing on disk without WAL read-to-write
    /// snapshot upgrade failures (`SQLITE_BUSY_SNAPSHOT`). Pass `create_for_peer = None` when
    /// persisting root/`db$` metadata updates for an already-created workspace; `Some(peer)` marks
    /// every document in `updates` with `pending_create = TRUE` for `peer`.
    pub async fn push_updates_batch(
        &self,
        updates: &[crate::workspace_db::PendingDocUpdate],
        create_for_peer: Option<&str>,
        now_ms: i64,
    ) -> StoreResult<Vec<(String, NaiveDateTime)>> {
        let non_empty: Vec<(&str, &[u8])> = updates
            .iter()
            .filter(|u| !is_empty_update(&u.update))
            .map(|u| (u.doc_id.as_str(), u.update.as_slice()))
            .collect();
        if non_empty.is_empty() {
            return Ok(Vec::new());
        }
        self.push_updates_in_immediate_tx(&non_empty, create_for_peer, now_ms)
            .await
    }

    async fn push_updates_in_immediate_tx(
        &self,
        items: &[(&str, &[u8])],
        create_for_peer: Option<&str>,
        now_ms: i64,
    ) -> StoreResult<Vec<(String, NaiveDateTime)>> {
        let base_ts = millis_to_naive_utc(now_ms);
        let mut tx = self.pool.begin_with("BEGIN IMMEDIATE").await?;
        let mut committed = Vec::with_capacity(items.len());

        for &(doc_id, update) in items {
            let existing_clock: Option<NaiveDateTime> =
                sqlx::query("SELECT timestamp FROM clocks WHERE doc_id = $1")
                    .bind(doc_id)
                    .fetch_optional(&mut *tx)
                    .await?
                    .map(|row| row.try_get("timestamp"))
                    .transpose()?;
            let effective_ts = match existing_clock {
                Some(clock_ts) if clock_ts >= base_ts => {
                    clock_ts + chrono::Duration::milliseconds(1)
                }
                _ => base_ts,
            };

            sqlx::query("INSERT INTO updates (doc_id, data, created_at) VALUES ($1, $2, $3)")
                .bind(doc_id)
                .bind(update)
                .bind(effective_ts)
                .execute(&mut *tx)
                .await?;

            sqlx::query(
                "INSERT INTO clocks (doc_id, timestamp) VALUES ($1, $2) \
                 ON CONFLICT(doc_id) DO UPDATE SET timestamp = MAX(clocks.timestamp, excluded.timestamp);",
            )
            .bind(doc_id)
            .bind(effective_ts)
            .execute(&mut *tx)
            .await?;

            if let Some(peer) = create_for_peer {
                sqlx::query(
                    "INSERT INTO peer_clocks (peer, doc_id, pending_create) VALUES ($1, $2, TRUE) \
                     ON CONFLICT(peer, doc_id) DO UPDATE SET pending_create = TRUE",
                )
                .bind(peer)
                .bind(doc_id)
                .execute(&mut *tx)
                .await?;
                sqlx::query(
                    "INSERT INTO peer_clocks (peer, doc_id, cache_token) \
                     SELECT $1, space_id, 1 FROM meta WHERE TRUE \
                     ON CONFLICT(peer, doc_id) DO UPDATE SET cache_token = cache_token + 1",
                )
                .bind(peer)
                .execute(&mut *tx)
                .await?;
            }

            committed.push((doc_id.to_string(), effective_ts));
        }

        tx.commit().await?;
        Ok(committed)
    }

    /// Read the stored snapshot row for `doc_id` without compacting pending updates.
    pub async fn get_doc_snapshot(&self, doc_id: &str) -> StoreResult<Option<DocRecord>> {
        let row = sqlx::query(
            "SELECT doc_id, data AS bin, updated_at AS timestamp FROM snapshots WHERE doc_id = ?",
        )
        .bind(doc_id)
        .fetch_optional(&self.pool)
        .await?;

        row.as_ref().map(row_to_doc_record).transpose()
    }

    /// Read and atomically compact `snapshots` + `updates` for `doc_id`.
    pub async fn get_doc(&self, doc_id: &str) -> StoreResult<Option<DocRecord>> {
        for _ in 0..8 {
            let mut read_tx = self.pool.begin().await?;
            let snapshot_row = sqlx::query(
                "SELECT doc_id, data AS bin, updated_at AS timestamp FROM snapshots WHERE doc_id = ?",
            )
            .bind(doc_id)
            .fetch_optional(&mut *read_tx)
            .await?;
            let snapshot = snapshot_row.as_ref().map(row_to_doc_record).transpose()?;

            let update_rows = sqlx::query(
                "SELECT doc_id, created_at AS timestamp, data AS bin \
                 FROM updates WHERE doc_id = ? ORDER BY created_at",
            )
            .bind(doc_id)
            .fetch_all(&mut *read_tx)
            .await?;
            let updates: Vec<DocUpdate> = update_rows
                .iter()
                .map(row_to_doc_update)
                .collect::<StoreResult<_>>()?;
            read_tx.commit().await?;

            if updates.is_empty() {
                return Ok(snapshot);
            }

            let timestamp = updates
                .last()
                .map(|u| u.timestamp)
                .into_iter()
                .chain(snapshot.as_ref().map(|r| r.timestamp))
                .max()
                .ok_or(StoreError::ConcurrentModification)?;

            let mut segments = Vec::with_capacity(updates.len() + usize::from(snapshot.is_some()));
            if let Some(record) = &snapshot {
                segments.push(record.bin.as_slice());
            }
            for update in &updates {
                segments.push(update.bin.as_slice());
            }
            let bin = merge_updates(&segments)?;

            let mut tx = self.pool.begin().await?;
            let installed = if let Some(previous) = &snapshot {
                sqlx::query(
                    "UPDATE snapshots SET data = ?, updated_at = ? \
                     WHERE doc_id = ? AND updated_at = ? AND data = ?",
                )
                .bind(&bin)
                .bind(timestamp)
                .bind(doc_id)
                .bind(previous.timestamp)
                .bind(&previous.bin)
                .execute(&mut *tx)
                .await?
                .rows_affected()
            } else {
                sqlx::query(
                    "INSERT INTO snapshots (doc_id, data, updated_at) VALUES (?, ?, ?) \
                     ON CONFLICT DO NOTHING",
                )
                .bind(doc_id)
                .bind(&bin)
                .bind(timestamp)
                .execute(&mut *tx)
                .await?
                .rows_affected()
            };
            if installed != 1 {
                continue;
            }

            let current_rows = sqlx::query(
                "SELECT doc_id, created_at AS timestamp, data AS bin \
                 FROM updates WHERE doc_id = ? ORDER BY created_at",
            )
            .bind(doc_id)
            .fetch_all(&mut *tx)
            .await?;
            let current_updates: Vec<DocUpdate> = current_rows
                .iter()
                .map(row_to_doc_update)
                .collect::<StoreResult<_>>()?;

            if current_updates != updates {
                continue;
            }

            sqlx::query("DELETE FROM updates WHERE doc_id = ?")
                .bind(doc_id)
                .execute(&mut *tx)
                .await?;
            tx.commit().await?;

            return Ok(Some(DocRecord {
                doc_id: doc_id.to_string(),
                bin,
                timestamp,
            }));
        }

        Err(StoreError::ConcurrentModification)
    }

    /// Compute the merged diff and state vector against an optional `remote_state_vector`.
    pub async fn get_doc_diff(
        &self,
        doc_id: &str,
        remote_state_vector: Option<&[u8]>,
    ) -> StoreResult<Option<DocDiff>> {
        let mut read_tx = self.pool.begin().await?;
        let snapshot_row = sqlx::query(
            "SELECT doc_id, data AS bin, updated_at AS timestamp FROM snapshots WHERE doc_id = ?",
        )
        .bind(doc_id)
        .fetch_optional(&mut *read_tx)
        .await?;
        let snapshot = snapshot_row.as_ref().map(row_to_doc_record).transpose()?;

        let update_rows = sqlx::query(
            "SELECT doc_id, created_at AS timestamp, data AS bin \
             FROM updates WHERE doc_id = ? ORDER BY created_at",
        )
        .bind(doc_id)
        .fetch_all(&mut *read_tx)
        .await?;
        let updates: Vec<DocUpdate> = update_rows
            .iter()
            .map(row_to_doc_update)
            .collect::<StoreResult<_>>()?;
        read_tx.commit().await?;

        if snapshot.is_none() && updates.is_empty() {
            return Ok(None);
        }

        let timestamp = updates
            .last()
            .map(|u| u.timestamp)
            .into_iter()
            .chain(snapshot.as_ref().map(|r| r.timestamp))
            .max()
            .ok_or(StoreError::ConcurrentModification)?;

        let merged_bin = if updates.is_empty() {
            snapshot.map(|s| s.bin).unwrap_or_default()
        } else {
            let mut segments = Vec::with_capacity(updates.len() + usize::from(snapshot.is_some()));
            if let Some(record) = &snapshot {
                segments.push(record.bin.as_slice());
            }
            for update in &updates {
                segments.push(update.bin.as_slice());
            }
            merge_updates(&segments)?
        };

        let state = encode_state_vector_from_update_v1(&merged_bin)
            .map_err(|err| StoreError::InvalidBinary(err.to_string()))?;
        let missing = match remote_state_vector {
            Some(sv) if !sv.is_empty() => diff_update_v1(&merged_bin, sv)
                .map_err(|err| StoreError::InvalidBinary(err.to_string()))?,
            _ => merged_bin,
        };

        Ok(Some(DocDiff {
            doc_id: doc_id.to_string(),
            missing,
            state,
            timestamp,
        }))
    }

    /// Upsert a document snapshot if its timestamp is at least as new as the stored row.
    pub async fn set_doc_snapshot(&self, snapshot: &DocRecord) -> StoreResult<bool> {
        let result = sqlx::query(
            "INSERT INTO snapshots (doc_id, data, updated_at) VALUES ($1, $2, $3) \
             ON CONFLICT(doc_id) DO UPDATE SET data = $2, updated_at = $3 \
             WHERE updated_at <= $3;",
        )
        .bind(&snapshot.doc_id)
        .bind(&snapshot.bin)
        .bind(snapshot.timestamp)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() == 1)
    }

    /// Fetch all pending updates for `doc_id` ordered by `created_at`.
    pub async fn get_doc_updates(&self, doc_id: &str) -> StoreResult<Vec<DocUpdate>> {
        let rows = sqlx::query(
            "SELECT doc_id, created_at AS timestamp, data AS bin \
             FROM updates WHERE doc_id = ? ORDER BY created_at",
        )
        .bind(doc_id)
        .fetch_all(&self.pool)
        .await?;

        rows.iter().map(row_to_doc_update).collect()
    }

    /// Delete updates whose `created_at` timestamps have been merged into a snapshot.
    pub async fn mark_updates_merged(
        &self,
        doc_id: &str,
        timestamps: &[NaiveDateTime],
    ) -> StoreResult<u32> {
        if timestamps.is_empty() {
            return Ok(0);
        }
        let mut qb = QueryBuilder::new("DELETE FROM updates WHERE doc_id = ");
        qb.push_bind(doc_id);
        qb.push(" AND created_at IN (");
        let mut separated = qb.separated(", ");
        for ts in timestamps {
            separated.push_bind(*ts);
        }
        qb.push(");");

        let result = qb.build().execute(&self.pool).await?;
        Ok(result.rows_affected() as u32)
    }

    /// Delete a document across `updates`, `snapshots`, `clocks`, `indexer_sync`,
    /// and clear any `pending_create` flags in `peer_clocks`.
    pub async fn delete_doc(&self, doc_id: &str) -> StoreResult<()> {
        let mut tx = self.pool.begin().await?;
        for table in ["updates", "snapshots", "clocks", "indexer_sync"] {
            let sql = format!("DELETE FROM {table} WHERE doc_id = ?;");
            sqlx::query(&sql).bind(doc_id).execute(&mut *tx).await?;
        }
        sqlx::query(
            "INSERT INTO peer_clocks (peer, doc_id, cache_token) \
             SELECT peer, meta.space_id, 1 FROM peer_clocks CROSS JOIN meta \
             WHERE doc_id = $1 AND pending_create = TRUE \
             ON CONFLICT(peer, doc_id) DO UPDATE SET cache_token = cache_token + 1",
        )
        .bind(doc_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE peer_clocks SET pending_create = FALSE \
             WHERE doc_id = $1 AND pending_create = TRUE",
        )
        .bind(doc_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Fetch all document clocks, optionally filtered to those strictly after `after`.
    pub async fn get_doc_clocks(&self, after: Option<NaiveDateTime>) -> StoreResult<Vec<DocClock>> {
        let rows = if let Some(after_ts) = after {
            sqlx::query("SELECT doc_id, timestamp FROM clocks WHERE timestamp > $1")
                .bind(after_ts)
                .fetch_all(&self.pool)
                .await?
        } else {
            sqlx::query("SELECT doc_id, timestamp FROM clocks")
                .fetch_all(&self.pool)
                .await?
        };

        rows.iter()
            .map(|row| {
                Ok(DocClock {
                    doc_id: row.try_get("doc_id")?,
                    timestamp: row.try_get("timestamp")?,
                })
            })
            .collect()
    }

    /// Fetch the clock row for a single document.
    pub async fn get_doc_clock(&self, doc_id: &str) -> StoreResult<Option<DocClock>> {
        let row = sqlx::query("SELECT doc_id, timestamp FROM clocks WHERE doc_id = ?")
            .bind(doc_id)
            .fetch_optional(&self.pool)
            .await?;

        row.map(|r| {
            Ok(DocClock {
                doc_id: r.try_get("doc_id")?,
                timestamp: r.try_get("timestamp")?,
            })
        })
        .transpose()
    }
}

#[cfg(test)]
mod tests {
    use y_octo::DocOptions;

    use super::*;

    async fn open_memory() -> SqliteDocStorage {
        let storage = SqliteDocStorage::new(":memory:");
        storage.connect().await.unwrap();
        storage
    }

    fn make_text_updates() -> (Vec<u8>, Vec<u8>) {
        let doc = DocOptions::from_identity(1, "doc".into()).build();
        let mut text = doc.get_or_create_text("content").unwrap();
        text.insert(0, "hello").unwrap();
        let first = doc.encode_update_v1().unwrap();
        let sv = doc.get_state_vector();
        text.insert(5, " world").unwrap();
        let second = doc.encode_state_as_update_v1(&sv).unwrap();
        (first, second)
    }

    #[tokio::test]
    async fn doc_lifecycle_compaction_diff_and_delete() {
        let storage = open_memory().await;
        storage.set_space_id("ws-1").await.unwrap();

        let (first, second) = make_text_updates();
        let t1 = storage.push_update("doc-1", &first, 10_000).await.unwrap();
        let t2 = storage.push_update("doc-1", &second, 10_000).await.unwrap();
        assert!(t2 > t1);

        let updates = storage.get_doc_updates("doc-1").await.unwrap();
        assert_eq!(updates.len(), 2);

        let diff = storage.get_doc_diff("doc-1", None).await.unwrap().unwrap();
        assert!(!diff.state.is_empty());

        let compacted = storage.get_doc("doc-1").await.unwrap().unwrap();
        assert_eq!(compacted.timestamp, t2);
        assert!(storage.get_doc_updates("doc-1").await.unwrap().is_empty());

        let mut verify = DocOptions::from_identity(2, "doc-1".into()).build();
        verify.apply_update_from_binary_v1(&compacted.bin).unwrap();
        assert_eq!(
            verify.get_or_create_text("content").unwrap().to_string(),
            "hello world"
        );

        let t3 = storage
            .push_update("doc-1", [0u8, 0u8], 20_000)
            .await
            .unwrap();
        let removed = storage.mark_updates_merged("doc-1", &[t3]).await.unwrap();
        assert_eq!(removed, 1);

        storage.delete_doc("doc-1").await.unwrap();
        assert!(storage.get_doc("doc-1").await.unwrap().is_none());
        assert!(storage.get_doc_clock("doc-1").await.unwrap().is_none());
    }
}
