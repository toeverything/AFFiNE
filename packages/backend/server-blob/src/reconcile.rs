//! Storage reservation cleanup and orphan object reconciliation using
//! `storage_reconciliation_checkpoints` lease and cursor tables.

use std::collections::HashSet;

use chrono::{Duration, Utc};
use server_db::{TieredConn, WorkloadTier};
use server_types::DomainError;
use sqlx::Row as _;

use crate::{BlobService, StorageObjectLock, db_error, storage_error};

const RECONCILIATION_LEASE_SECS: f64 = 1800.0;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct ExpiredReservationCleanupReport {
  pub deleted_blobs: usize,
  pub deleted_comment_attachments: usize,
  pub aborted_multiparts: usize,
}
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct StorageOrphanReconcileReport {
  pub leased: bool,
  pub scanned_objects: usize,
  pub deleted_objects: usize,
  pub skipped_unknown_prefix: usize,
  pub skipped_within_grace: usize,
  pub deleted_orphan_rows: usize,
  pub completed: bool,
}

fn object_key_workspace(key: &str) -> Option<&str> {
  if let Some(rest) = key.strip_prefix("comment-attachments/") {
    let mut parts = rest.splitn(3, '/');
    return match (parts.next(), parts.next(), parts.next()) {
      (Some(ws), Some(doc), Some(k)) if !ws.is_empty() && !doc.is_empty() && !k.is_empty() => Some(ws),
      _ => None,
    };
  }
  key.split_once('/').and_then(|(ws, rest)| {
    (!ws.is_empty()
      && !ws.starts_with('.')
      && !rest.is_empty()
      && !matches!(
        ws,
        "avatars" | "assets" | "tmp" | "temp" | "system" | "copilot" | "copilot-attachments" | "artifacts"
      ))
    .then_some(ws)
  })
}

impl BlobService {
  async fn long_conn(&self) -> Result<TieredConn, DomainError> {
    self
      .db
      .acquire_tiered(WorkloadTier::LongQuery)
      .await
      .map_err(|e| DomainError::Unavailable(e.to_string()))
  }
  pub async fn cleanup_expired_reservations(
    &self,
    batch_limit: i64,
    is_cancelled: &(dyn Fn() -> bool + Sync),
  ) -> Result<ExpiredReservationCleanupReport, DomainError> {
    let (limit, mut report) = (batch_limit.clamp(1, 1000), ExpiredReservationCleanupReport::default());
    if is_cancelled() {
      return Ok(report);
    }
    let storage = self.dynamic_storage.current();
    let candidates: Vec<(String, String, Option<String>, String)> = sqlx::query(
      "SELECT 'blob' AS kind, workspace_id, NULL::varchar AS doc_id, key FROM blobs \
       WHERE deleted_at IS NOT NULL OR (status = 'pending' AND reservation_expires_at <= clock_timestamp()) \
       UNION ALL \
       SELECT 'comment_attachment' AS kind, workspace_id, doc_id, key FROM comment_attachments \
       WHERE deleted_at IS NOT NULL OR (status = 'pending' AND reservation_expires_at <= clock_timestamp()) LIMIT $1",
    )
    .bind(limit)
    .fetch_all(self.long_conn().await?.as_conn())
    .await
    .map_err(db_error("list expired storage reservations"))?
    .into_iter()
    .map(|r| (r.get("kind"), r.get("workspace_id"), r.get("doc_id"), r.get("key")))
    .collect();
    for (kind, ws_id, doc_id, key) in candidates {
      if is_cancelled() {
        break;
      }
      let (is_blob, doc_s) = (kind == "blob", doc_id.as_deref().unwrap_or(""));
      let final_key = if is_blob {
        format!("{ws_id}/{key}")
      } else {
        format!("comment-attachments/{ws_id}/{doc_s}/{key}")
      };
      let lock = StorageObjectLock::acquire(&self.db, &self.lock_permits, &ws_id, &final_key).await?;
      let outcome = async {
        let mut conn = self.long_conn().await?;
        let row = if is_blob {
          sqlx::query(
            "UPDATE blobs SET deleted_at = COALESCE(deleted_at, clock_timestamp()) WHERE workspace_id = $1 AND key = $2 \
             AND (deleted_at IS NOT NULL OR (status = 'pending' AND reservation_expires_at <= clock_timestamp())) \
             RETURNING reservation_id::text AS reservation_id, upload_id, status::text AS status",
          ).bind(&ws_id).bind(&key).fetch_optional(conn.as_conn()).await
        } else {
          sqlx::query(
            "UPDATE comment_attachments SET deleted_at = COALESCE(deleted_at, clock_timestamp()) \
             WHERE workspace_id = $1 AND doc_id = $2 AND key = $3 \
             AND (deleted_at IS NOT NULL OR (status = 'pending' AND reservation_expires_at <= clock_timestamp())) \
             RETURNING reservation_id::text AS reservation_id, NULL::text AS upload_id, status::text AS status",
          ).bind(&ws_id).bind(doc_id.as_deref()).bind(&key).fetch_optional(conn.as_conn()).await
        }.map_err(db_error("claim expired reservation"))?;
        drop(conn);
        let Some(r) = row else { return Ok::<_, DomainError>(()) };
        let (res_id, upload_id, status): (Option<String>, Option<String>, String) =
          (r.get("reservation_id"), r.get("upload_id"), r.get("status"));
        let mut objects_ok = true;
        if status == "pending" && let Some(rid) = res_id.as_deref() {
          let temp_key = if is_blob {
            format!("{ws_id}/.reservations/{rid}/{key}")
          } else {
            format!("comment-attachments/{ws_id}/{doc_s}/.reservations/{rid}/{key}")
          };
          if let Some(uid) = upload_id.as_deref() && let Ok(true) = storage.abort_multipart_upload(&temp_key, uid).await {
            report.aborted_multiparts += 1;
          }
          objects_ok &= storage.delete(&temp_key).await.is_ok();
        }
        objects_ok &= storage.delete(&final_key).await.is_ok();
        if objects_ok {
          let mut conn = self.long_conn().await?;
          let deleted = if is_blob {
            sqlx::query(
              "DELETE FROM blobs WHERE workspace_id = $1 AND key = $2 \
               AND reservation_id IS NOT DISTINCT FROM $3::uuid AND deleted_at IS NOT NULL",
            ).bind(&ws_id).bind(&key).bind(res_id.as_deref()).execute(conn.as_conn()).await
          } else {
            sqlx::query(
              "DELETE FROM comment_attachments WHERE workspace_id = $1 AND doc_id = $2 AND key = $3 \
               AND reservation_id IS NOT DISTINCT FROM $4::uuid AND deleted_at IS NOT NULL",
            ).bind(&ws_id).bind(doc_id.as_deref()).bind(&key).bind(res_id.as_deref()).execute(conn.as_conn()).await
          }.map_err(db_error("delete cleaned reservation"))?.rows_affected();
          *(if is_blob { &mut report.deleted_blobs } else { &mut report.deleted_comment_attachments }) +=
            usize::try_from(deleted).unwrap_or(0);
        }
        Ok(())
      }.await;
      lock.release().await;
      outcome?;
    }
    Ok(report)
  }
  pub async fn reconcile_storage_orphans(
    &self,
    batch_limit: usize,
    is_cancelled: &(dyn Fn() -> bool + Sync),
  ) -> Result<StorageOrphanReconcileReport, DomainError> {
    let (limit, claim_id) = (batch_limit.clamp(1, 1000), uuid::Uuid::new_v4().to_string());
    let mut report = StorageOrphanReconcileReport::default();
    let claimed = sqlx::query_scalar::<_, String>(
      "INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, metadata, updated_at) \
       VALUES ('workspace_storage_namespace', 'global', 'running', jsonb_build_object('claimId', $1), clock_timestamp()) \
       ON CONFLICT (kind, scope) DO UPDATE SET status = 'running', metadata = jsonb_build_object('claimId', $1), \
         updated_at = clock_timestamp() \
       WHERE storage_reconciliation_checkpoints.status <> 'running' \
          OR storage_reconciliation_checkpoints.updated_at < clock_timestamp() - make_interval(secs => $2) RETURNING kind",
    )
    .bind(&claim_id).bind(RECONCILIATION_LEASE_SECS)
    .fetch_optional(self.long_conn().await?.as_conn()).await
    .map_err(db_error("claim storage reconciliation lease"))?;
    if claimed.is_none() {
      return Ok(report);
    }
    report.leased = true;
    let sweep_result = async {
      if is_cancelled() { return Ok::<_, DomainError>(()); }
      let object_cursor = sqlx::query_scalar::<_, Option<String>>(
        "SELECT last_key FROM storage_reconciliation_checkpoints WHERE kind = 'workspace_storage_namespace' AND scope = 'global'",
      ).fetch_optional(self.long_conn().await?.as_conn()).await
        .map_err(db_error("load storage namespace cursor"))?.flatten().filter(|s| !s.is_empty());
      let storage = self.dynamic_storage.current();
      let objects = storage.list_prefix("", object_cursor.as_deref(), limit).await.map_err(storage_error)?;
      report.scanned_objects = objects.len();
      let mut objects_completed = false;
      if objects.is_empty() {
        self.save_namespace_cursor(None, true).await?;
        objects_completed = true;
      } else {
        let grace_cutoff = Utc::now() - Duration::hours(24);
        let ws_list: Vec<String> = objects.iter()
          .filter_map(|(k, _)| object_key_workspace(k).map(str::to_owned))
          .collect::<HashSet<_>>().into_iter().collect();
        let live_workspaces: HashSet<String> = if ws_list.is_empty() {
          HashSet::new()
        } else {
          sqlx::query_scalar::<_, String>("SELECT id FROM workspaces WHERE id = ANY($1)")
            .bind(&ws_list).fetch_all(self.long_conn().await?.as_conn()).await
            .map_err(db_error("check live workspaces"))?.into_iter().collect()
        };
        let mut last_scanned: Option<String> = None;
        for (key, last_modified) in &objects {
          if is_cancelled() { break; }
          last_scanned = Some(key.clone());
          let Some(ws_id) = object_key_workspace(key) else { report.skipped_unknown_prefix += 1; continue; };
          if live_workspaces.contains(ws_id) { continue; }
          if last_modified.is_none_or(|ts| ts > grace_cutoff) { report.skipped_within_grace += 1; continue; }
          let lock = StorageObjectLock::acquire(&self.db, &self.lock_permits, ws_id, key).await?;
          let del_res = async {
            let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
              .bind(ws_id).fetch_one(self.long_conn().await?.as_conn()).await
              .map_err(db_error("recheck workspace absence under lock"))?;
            if !exists {
              storage.delete(key).await.map_err(storage_error)?;
              report.deleted_objects += 1;
            }
            Ok::<_, DomainError>(())
          }.await;
          lock.release().await;
          del_res?;
        }
        if objects.len() < limit && !is_cancelled() {
          self.save_namespace_cursor(None, true).await?;
          objects_completed = true;
        } else if let Some(last) = last_scanned {
          self.save_namespace_cursor(Some(&last), false).await?;
        }
      }

      let mut pg_completed = false;
      if !is_cancelled() {
        let pg_cursor = sqlx::query_scalar::<_, Option<String>>(
          "SELECT last_key FROM storage_reconciliation_checkpoints WHERE kind = 'workspace_storage_orphan_rows' AND scope = 'storage'",
        ).fetch_optional(self.long_conn().await?.as_conn()).await
          .map_err(db_error("load orphan row cursor"))?.flatten().unwrap_or_default();
        let ws_limit = i64::try_from(limit).unwrap_or(1000);
        let has_embeddings: bool = sqlx::query_scalar("SELECT to_regclass('embedding_sources') IS NOT NULL")
          .fetch_one(self.long_conn().await?.as_conn())
          .await
          .map_err(db_error("check embedding_sources table"))?;

        let orphan_ws_ids: Vec<String> = if has_embeddings {
          sqlx::query_scalar(
            r#"SELECT DISTINCT ws_id
               FROM (
                 SELECT workspace_id AS ws_id FROM blobs WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM comment_attachments WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM snapshots WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM updates WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM snapshot_histories WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM workspace_pages WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM replies WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM comments WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM embedding_sources WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM embedding_workspace_states WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM embedding_indexes WHERE workspace_id > $1
               ) candidates
               WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = candidates.ws_id)
               ORDER BY ws_id ASC
               LIMIT $2"#,
          )
        } else {
          sqlx::query_scalar(
            r#"SELECT DISTINCT ws_id
               FROM (
                 SELECT workspace_id AS ws_id FROM blobs WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM comment_attachments WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM snapshots WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM updates WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM snapshot_histories WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM workspace_pages WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM replies WHERE workspace_id > $1
                 UNION SELECT workspace_id FROM comments WHERE workspace_id > $1
               ) candidates
               WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = candidates.ws_id)
               ORDER BY ws_id ASC
               LIMIT $2"#,
          )
        }
        .bind(&pg_cursor)
        .bind(ws_limit)
        .fetch_all(self.long_conn().await?.as_conn())
        .await
        .map_err(db_error("find orphan workspace ids"))?;

        let mut total_deleted: u64 = 0;
        if !orphan_ws_ids.is_empty() {
          let mut delete_tables: Vec<&'static str> = vec![
            "DELETE FROM blobs WHERE workspace_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = blobs.workspace_id)",
            "DELETE FROM comment_attachments WHERE workspace_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = comment_attachments.workspace_id)",
            "DELETE FROM snapshots WHERE workspace_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = snapshots.workspace_id)",
            "DELETE FROM updates WHERE workspace_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = updates.workspace_id)",
            "DELETE FROM snapshot_histories WHERE workspace_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = snapshot_histories.workspace_id)",
            "DELETE FROM workspace_pages WHERE workspace_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_pages.workspace_id)",
            "DELETE FROM replies WHERE workspace_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = replies.workspace_id)",
            "DELETE FROM comments WHERE workspace_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = comments.workspace_id)",
          ];
          if has_embeddings {
            delete_tables.extend([
              "DELETE FROM embedding_sources WHERE workspace_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = embedding_sources.workspace_id)",
              "DELETE FROM embedding_workspace_states WHERE workspace_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = embedding_workspace_states.workspace_id)",
              "DELETE FROM embedding_indexes WHERE workspace_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = embedding_indexes.workspace_id)",
            ]);
          }
          for sql in delete_tables {
            let deleted = sqlx::query(sql)
              .bind(&orphan_ws_ids)
              .execute(self.long_conn().await?.as_conn())
              .await
              .map_err(db_error("delete orphan workspace rows"))?
              .rows_affected();
            total_deleted = total_deleted.saturating_add(deleted);
          }
        }
        report.deleted_orphan_rows = usize::try_from(total_deleted).unwrap_or(0);
        if orphan_ws_ids.len() < limit {
          self.save_orphan_cursor(Some(""), true).await?;
          pg_completed = true;
        } else if let Some(last_ws) = orphan_ws_ids.last() {
          self.save_orphan_cursor(Some(last_ws.as_str()), false).await?;
        }
      }
      report.completed = objects_completed && pg_completed;
      Ok(())
    }.await;
    if let Ok(mut conn) = self.long_conn().await {
      let _ = sqlx::query(
        "UPDATE storage_reconciliation_checkpoints SET status = 'idle', updated_at = clock_timestamp() \
         WHERE kind = 'workspace_storage_namespace' AND scope = 'global' AND metadata->>'claimId' = $1",
      )
      .bind(&claim_id)
      .execute(conn.as_conn())
      .await;
    }
    sweep_result?;
    Ok(report)
  }
  async fn save_namespace_cursor(&self, last_key: Option<&str>, completed: bool) -> Result<(), DomainError> {
    sqlx::query(
      "UPDATE storage_reconciliation_checkpoints \
       SET last_key = $1, completed_at = CASE WHEN $2 THEN clock_timestamp() ELSE completed_at END, updated_at = clock_timestamp() \
       WHERE kind = 'workspace_storage_namespace' AND scope = 'global'",
    )
    .bind(last_key)
    .bind(completed)
    .execute(self.long_conn().await?.as_conn())
    .await
    .map_err(db_error("save storage namespace cursor"))?;
    Ok(())
  }
  async fn save_orphan_cursor(&self, last_key: Option<&str>, completed: bool) -> Result<(), DomainError> {
    sqlx::query(
      "INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, last_key, completed_at, updated_at) \
       VALUES ('workspace_storage_orphan_rows', 'storage', $1, $2, CASE WHEN $3 THEN clock_timestamp() ELSE NULL END, clock_timestamp()) \
       ON CONFLICT (kind, scope) DO UPDATE SET status = EXCLUDED.status, last_key = EXCLUDED.last_key, \
         completed_at = COALESCE(EXCLUDED.completed_at, storage_reconciliation_checkpoints.completed_at), updated_at = clock_timestamp()",
    )
    .bind(if completed { "completed" } else { "running" }).bind(last_key).bind(completed)
    .execute(self.long_conn().await?.as_conn()).await
    .map_err(db_error("save storage reconciliation cursor"))?;
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::object_key_workspace;

  #[test]
  fn object_key_workspace_exempts_copilot_and_artifact_prefixes() {
    assert_eq!(object_key_workspace("copilot/transcript/ws/u/t/0"), None);
    assert_eq!(object_key_workspace("copilot/artifacts/ws/a/b"), None);
    assert_eq!(object_key_workspace("copilot-attachments/ws/a/b"), None);
    assert_eq!(object_key_workspace("artifacts/ws/a/b"), None);
    assert_eq!(object_key_workspace("ws-1/blob-key"), Some("ws-1"));
  }
}
