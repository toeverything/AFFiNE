//! Storage reservation cleanup and orphan object reconciliation using
//! `storage_reconciliation_checkpoints` lease and cursor tables.

use std::collections::HashSet;

use chrono::{Duration, Utc};
use serde_json::json;
use server_db::{TieredConn, WorkloadTier};
use server_domain::events::InvalidationHintV1;
use server_types::DomainError;
use sqlx::Row as _;

use crate::{BlobService, StorageObjectLock, db_error, storage_error};

const RECONCILIATION_LEASE_SECS: f64 = 1800.0;
const WORKSPACE_CHECKPOINT_KINDS: &[&str] = &[
  "doc_blob_refs",
  "document_cleanup",
  "blob_cleanup",
  "blob_cleanup_plan",
  "blob_metadata_backfill",
  "workspace_root_source",
];

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
  pub deleted_ownerless_workspaces: usize,
  pub completed: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ObjectKeyOwner<'a> {
  Exempt,
  Workspace(&'a str),
  /// Shared-bucket 3-segment key `{seg1}/{seg2}/{seg3}` where `seg2 != ".reservations"`:
  /// could be a normal multi-segment workspace blob (`seg1 = ws_id`) or a Copilot chat
  /// attachment (`seg1 = user_id`, `seg2 = ws_id`).
  WorkspaceOrCopilotChat {
    first: &'a str,
    second: &'a str,
  },
  CommentAttachment {
    workspace_id: &'a str,
    doc_id: &'a str,
    key: &'a str,
    reservation_id: Option<&'a str>,
  },
}

fn classify_object_key(key: &str) -> ObjectKeyOwner<'_> {
  if key.is_empty() || key.starts_with('.') {
    return ObjectKeyOwner::Exempt;
  }
  let segments: Vec<&str> = key.split('/').collect();
  if segments.len() < 2 || segments.iter().any(|s| s.is_empty()) {
    return ObjectKeyOwner::Exempt;
  }
  match segments.as_slice() {
    [
      "avatars" | "assets" | "tmp" | "temp" | "system" | "copilot" | "copilot-attachments",
      ..,
    ] => ObjectKeyOwner::Exempt,
    ["workspace-files" | "context-files" | "artifacts", ws_id, ..] if !ws_id.starts_with('.') => {
      ObjectKeyOwner::Workspace(ws_id)
    }
    ["workspace-files" | "context-files" | "artifacts", ..] => ObjectKeyOwner::Exempt,
    ["comment-attachments", ws_id, doc_id, attachment_key]
      if !ws_id.starts_with('.') && !doc_id.starts_with('.') && !attachment_key.starts_with('.') =>
    {
      ObjectKeyOwner::CommentAttachment {
        workspace_id: ws_id,
        doc_id,
        key: attachment_key,
        reservation_id: None,
      }
    }
    [
      "comment-attachments",
      ws_id,
      doc_id,
      ".reservations",
      reservation_id,
      attachment_key,
    ] if !ws_id.starts_with('.')
      && !doc_id.starts_with('.')
      && !reservation_id.starts_with('.')
      && !attachment_key.starts_with('.') =>
    {
      ObjectKeyOwner::CommentAttachment {
        workspace_id: ws_id,
        doc_id,
        key: attachment_key,
        reservation_id: Some(reservation_id),
      }
    }
    ["comment-attachments", ..] => ObjectKeyOwner::Exempt,
    [first, second, _] if !first.starts_with('.') && *second != ".reservations" && !second.starts_with('.') => {
      ObjectKeyOwner::WorkspaceOrCopilotChat { first, second }
    }
    [ws_id, ..] if !ws_id.starts_with('.') => ObjectKeyOwner::Workspace(ws_id),
    _ => ObjectKeyOwner::Exempt,
  }
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
    let mut invalidated_workspaces = HashSet::new();
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
          )
          .bind(&ws_id)
          .bind(&key)
          .fetch_optional(conn.as_conn())
          .await
        } else {
          sqlx::query(
            "UPDATE comment_attachments SET deleted_at = COALESCE(deleted_at, clock_timestamp()) \
             WHERE workspace_id = $1 AND doc_id = $2 AND key = $3 \
             AND (deleted_at IS NOT NULL OR (status = 'pending' AND reservation_expires_at <= clock_timestamp())) \
             RETURNING reservation_id::text AS reservation_id, NULL::text AS upload_id, status::text AS status",
          )
          .bind(&ws_id)
          .bind(doc_id.as_deref())
          .bind(&key)
          .fetch_optional(conn.as_conn())
          .await
        }
        .map_err(db_error("claim expired reservation"))?;
        drop(conn);
        let Some(r) = row else {
          return Ok::<_, DomainError>(false);
        };
        let (res_id, upload_id, status): (Option<String>, Option<String>, String) =
          (r.get("reservation_id"), r.get("upload_id"), r.get("status"));
        let mut objects_ok = true;
        if status == "pending" && let Some(rid) = res_id.as_deref() {
          let temp_key = if is_blob {
            format!("{ws_id}/.reservations/{rid}/{key}")
          } else {
            format!("comment-attachments/{ws_id}/{doc_s}/.reservations/{rid}/{key}")
          };
          if let Some(uid) = upload_id.as_deref() {
            match storage.abort_multipart_upload(&temp_key, uid).await {
              Ok(true) => report.aborted_multiparts += 1,
              Ok(false) => {}
              Err(err) => {
                tracing::warn!(workspace_id = %ws_id, key = %key, error = %err, "abort_multipart_upload failed during expired reservation cleanup");
                objects_ok = false;
              }
            }
          }
          objects_ok &= storage.delete(&temp_key).await.is_ok();
        }
        objects_ok &= storage.delete(&final_key).await.is_ok();
        let mut row_deleted = false;
        if objects_ok {
          let mut conn = self.long_conn().await?;
          let deleted = if is_blob {
            sqlx::query(
              "DELETE FROM blobs WHERE workspace_id = $1 AND key = $2 \
               AND reservation_id IS NOT DISTINCT FROM $3::uuid AND deleted_at IS NOT NULL",
            )
            .bind(&ws_id)
            .bind(&key)
            .bind(res_id.as_deref())
            .execute(conn.as_conn())
            .await
          } else {
            sqlx::query(
              "DELETE FROM comment_attachments WHERE workspace_id = $1 AND doc_id = $2 AND key = $3 \
               AND reservation_id IS NOT DISTINCT FROM $4::uuid AND deleted_at IS NOT NULL",
            )
            .bind(&ws_id)
            .bind(doc_id.as_deref())
            .bind(&key)
            .bind(res_id.as_deref())
            .execute(conn.as_conn())
            .await
          }
          .map_err(db_error("delete cleaned reservation"))?
          .rows_affected();
          if deleted > 0 {
            row_deleted = true;
          }
          *(if is_blob {
            &mut report.deleted_blobs
          } else {
            &mut report.deleted_comment_attachments
          }) += usize::try_from(deleted).unwrap_or(0);
        }
        Ok(row_deleted)
      }
      .await;
      lock.release().await;
      if outcome? {
        invalidated_workspaces.insert(ws_id);
      }
    }
    if let Some(invalidation) = &self.invalidation {
      for ws_id in invalidated_workspaces {
        let _ = invalidation
          .publish_invalidation(&InvalidationHintV1::QuotaStorageUsage {
            subject: format!("workspace:{ws_id}"),
          })
          .await;
      }
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
    .bind(&claim_id)
    .bind(RECONCILIATION_LEASE_SECS)
    .fetch_optional(self.long_conn().await?.as_conn())
    .await
    .map_err(db_error("claim storage reconciliation lease"))?;
    if claimed.is_none() {
      return Ok(report);
    }
    report.leased = true;
    let sweep_result = async {
      if is_cancelled() {
        return Ok::<_, DomainError>(());
      }
      let object_cursor = self.load_namespace_cursor().await?;
      let storage = self.dynamic_storage.current();
      let objects = storage
        .list_prefix("", object_cursor.as_deref(), limit)
        .await
        .map_err(storage_error)?;
      report.scanned_objects = objects.len();
      let mut objects_completed = false;
      if objects.is_empty() {
        self.save_namespace_cursor(None, true).await?;
        objects_completed = true;
      } else {
        let grace_cutoff = Utc::now() - Duration::hours(24);
        let mut candidate_ws_ids = HashSet::new();
        let mut candidate_user_ids = HashSet::new();
        for (key, _) in &objects {
          match classify_object_key(key) {
            ObjectKeyOwner::Exempt => {}
            ObjectKeyOwner::Workspace(ws) => {
              candidate_ws_ids.insert(ws.to_owned());
            }
            ObjectKeyOwner::WorkspaceOrCopilotChat { first, second } => {
              candidate_ws_ids.insert(first.to_owned());
              candidate_ws_ids.insert(second.to_owned());
              candidate_user_ids.insert(first.to_owned());
            }
            ObjectKeyOwner::CommentAttachment { workspace_id, .. } => {
              candidate_ws_ids.insert(workspace_id.to_owned());
            }
          }
        }
        let ws_list: Vec<String> = candidate_ws_ids.into_iter().collect();
        let live_workspaces: HashSet<String> = if ws_list.is_empty() {
          HashSet::new()
        } else {
          sqlx::query_scalar::<_, String>("SELECT id FROM workspaces WHERE id = ANY($1)")
            .bind(&ws_list)
            .fetch_all(self.long_conn().await?.as_conn())
            .await
            .map_err(db_error("check live workspaces"))?
            .into_iter()
            .collect()
        };
        let user_list: Vec<String> = candidate_user_ids.into_iter().collect();
        let live_users: HashSet<String> = if user_list.is_empty() {
          HashSet::new()
        } else {
          sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE id = ANY($1)")
            .bind(&user_list)
            .fetch_all(self.long_conn().await?.as_conn())
            .await
            .map_err(db_error("check live users"))?
            .into_iter()
            .collect()
        };

        let mut last_scanned: Option<String> = None;
        for (key, last_modified) in &objects {
          if is_cancelled() {
            break;
          }
          last_scanned = Some(key.clone());
          match classify_object_key(key) {
            ObjectKeyOwner::Exempt => {
              report.skipped_unknown_prefix += 1;
            }
            ObjectKeyOwner::Workspace(ws_id) => {
              if live_workspaces.contains(ws_id) {
                continue;
              }
              if last_modified.is_none_or(|ts| ts > grace_cutoff) {
                report.skipped_within_grace += 1;
                continue;
              }
              let lock = StorageObjectLock::acquire(&self.db, &self.lock_permits, ws_id, key).await?;
              let del_res = async {
                let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
                  .bind(ws_id)
                  .fetch_one(self.long_conn().await?.as_conn())
                  .await
                  .map_err(db_error("recheck workspace absence under lock"))?;
                if !exists {
                  storage.delete(key).await.map_err(storage_error)?;
                  report.deleted_objects += 1;
                }
                Ok::<_, DomainError>(())
              }
              .await;
              lock.release().await;
              del_res?;
            }
            ObjectKeyOwner::WorkspaceOrCopilotChat { first, second } => {
              if live_workspaces.contains(first)
                || (live_workspaces.contains(second) && live_users.contains(first))
              {
                continue;
              }
              if last_modified.is_none_or(|ts| ts > grace_cutoff) {
                report.skipped_within_grace += 1;
                continue;
              }
              let lock = StorageObjectLock::acquire(&self.db, &self.lock_permits, second, key).await?;
              let del_res = async {
                let mut conn = self.long_conn().await?;
                let first_is_ws: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
                  .bind(first)
                  .fetch_one(conn.as_conn())
                  .await
                  .map_err(db_error("recheck first segment workspace"))?;
                if first_is_ws {
                  return Ok::<_, DomainError>(());
                }
                let second_is_ws: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
                  .bind(second)
                  .fetch_one(conn.as_conn())
                  .await
                  .map_err(db_error("recheck second segment workspace"))?;
                let first_is_user: bool = if second_is_ws {
                  sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
                    .bind(first)
                    .fetch_one(conn.as_conn())
                    .await
                    .map_err(db_error("recheck copilot user"))?
                } else {
                  false
                };
                if !(second_is_ws && first_is_user) {
                  storage.delete(key).await.map_err(storage_error)?;
                  report.deleted_objects += 1;
                }
                Ok::<_, DomainError>(())
              }
              .await;
              lock.release().await;
              del_res?;
            }
            ObjectKeyOwner::CommentAttachment {
              workspace_id,
              doc_id,
              key: att_key,
              reservation_id,
            } => {
              if last_modified.is_none_or(|ts| ts > grace_cutoff) {
                report.skipped_within_grace += 1;
                continue;
              }
              let lock = StorageObjectLock::acquire(&self.db, &self.lock_permits, workspace_id, key).await?;
              let del_res = async {
                let mut conn = self.long_conn().await?;
                let ws_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
                  .bind(workspace_id)
                  .fetch_one(conn.as_conn())
                  .await
                  .map_err(db_error("recheck comment workspace"))?;
                let referenced = if !ws_exists {
                  false
                } else if let Some(rid) = reservation_id {
                  sqlx::query_scalar::<_, bool>(
                    "SELECT EXISTS(SELECT 1 FROM comment_attachments WHERE workspace_id = $1 AND doc_id = $2 \
                     AND key = $3 AND reservation_id::text = $4 AND status = 'pending' AND deleted_at IS NULL)",
                  )
                  .bind(workspace_id)
                  .bind(doc_id)
                  .bind(att_key)
                  .bind(rid)
                  .fetch_one(conn.as_conn())
                  .await
                  .map_err(db_error("recheck pending comment attachment"))?
                } else {
                  sqlx::query_scalar::<_, bool>(
                    "SELECT EXISTS(SELECT 1 FROM comment_attachments WHERE workspace_id = $1 AND doc_id = $2 \
                     AND key = $3 AND status = 'completed' AND deleted_at IS NULL)",
                  )
                  .bind(workspace_id)
                  .bind(doc_id)
                  .bind(att_key)
                  .fetch_one(conn.as_conn())
                  .await
                  .map_err(db_error("recheck completed comment attachment"))?
                };
                if !referenced {
                  storage.delete(key).await.map_err(storage_error)?;
                  report.deleted_objects += 1;
                }
                Ok::<_, DomainError>(())
              }
              .await;
              lock.release().await;
              del_res?;
            }
          }
        }
        if objects.len() < limit && !is_cancelled() {
          self.save_namespace_cursor(None, true).await?;
          objects_completed = true;
        } else if let Some(last) = last_scanned {
          self.save_namespace_cursor(Some(&last), false).await?;
        }
      }

      let has_embeddings: bool = sqlx::query_scalar("SELECT to_regclass('embedding_sources') IS NOT NULL")
        .fetch_one(self.long_conn().await?.as_conn())
        .await
        .map_err(db_error("check embedding_sources table"))?;
      let has_runtime_doc_creators: bool =
        sqlx::query_scalar("SELECT to_regclass('runtime_doc_creators') IS NOT NULL")
          .fetch_one(self.long_conn().await?.as_conn())
          .await
          .map_err(db_error("check runtime_doc_creators table"))?;

      let mut ownerless_completed = false;
      if !is_cancelled() {
        let last_sid = self.load_ownerless_cursor().await?;
        let ws_limit = i64::try_from(limit).unwrap_or(1000);
        let ownerless_rows: Vec<(i32, String)> = sqlx::query_as(
          r#"SELECT w.sid, w.id
             FROM workspaces w
             WHERE w.sid > $1
               AND w.created_at < clock_timestamp() - interval '24 hours'
               AND NOT EXISTS (
                 SELECT 1 FROM workspace_members m
                 WHERE m.workspace_id = w.id AND m.role = 'owner' AND m.state = 'active'
               )
             ORDER BY w.sid ASC
             LIMIT $2"#,
        )
        .bind(last_sid)
        .bind(ws_limit)
        .fetch_all(self.long_conn().await?.as_conn())
        .await
        .map_err(db_error("list ownerless workspaces"))?;

        let mut ownerless_had_error = false;
        let mut last_ok_sid = last_sid;
        for (sid, ws_id) in &ownerless_rows {
          if is_cancelled() {
            break;
          }
          let lock = match crate::StorageWorkspaceLock::acquire(&self.db, &self.lock_permits, ws_id).await {
            Ok(lock) => lock,
            Err(err) => {
              tracing::warn!(workspace_id = %ws_id, error = %err, "ownerless workspace cleanup skipped: failed to acquire workspace lock");
              ownerless_had_error = true;
              continue;
            }
          };
          let outcome = async {
            let deleted: Option<String> = sqlx::query_scalar(
              r#"DELETE FROM workspaces w
                 WHERE w.id = $1
                   AND w.created_at < clock_timestamp() - interval '24 hours'
                   AND NOT EXISTS (
                     SELECT 1 FROM workspace_members m
                     WHERE m.workspace_id = w.id AND m.role = 'owner' AND m.state = 'active'
                   )
                 RETURNING w.id"#,
            )
            .bind(ws_id)
            .fetch_optional(self.long_conn().await?.as_conn())
            .await
            .map_err(db_error("delete ownerless workspace"))?;
            if deleted.is_some() {
              report.deleted_ownerless_workspaces += 1;
              let rows = self
                .delete_orphan_rows_for_workspace(ws_id, has_embeddings, has_runtime_doc_creators)
                .await?;
              report.deleted_orphan_rows += usize::try_from(rows).unwrap_or(0);
            }
            Ok::<_, DomainError>(())
          }
          .await;
          lock.release().await;
          if let Err(err) = outcome {
            tracing::warn!(workspace_id = %ws_id, error = %err, "ownerless workspace cleanup failed");
            ownerless_had_error = true;
          } else if !ownerless_had_error {
            last_ok_sid = *sid;
          }
        }
        ownerless_completed = ownerless_rows.len() < limit && !is_cancelled() && !ownerless_had_error;
        self
          .save_ownerless_cursor(if ownerless_completed { 0 } else { last_ok_sid }, ownerless_completed)
          .await?;
      }

      let mut pg_completed = false;
      if !is_cancelled() {
        let pg_cursor = self.load_orphan_cursor().await?;
        let ws_limit = i64::try_from(limit).unwrap_or(1000);
        let mut union_parts = vec![
          "SELECT workspace_id AS ws_id FROM blobs WHERE workspace_id > $1",
          "SELECT workspace_id FROM comment_attachments WHERE workspace_id > $1",
          "SELECT workspace_id FROM snapshots WHERE workspace_id > $1",
          "SELECT workspace_id FROM updates WHERE workspace_id > $1",
          "SELECT workspace_id FROM snapshot_histories WHERE workspace_id > $1",
          "SELECT workspace_id FROM workspace_pages WHERE workspace_id > $1",
          "SELECT workspace_id FROM replies WHERE workspace_id > $1",
          "SELECT workspace_id FROM comments WHERE workspace_id > $1",
          "SELECT workspace_id FROM doc_blob_refs WHERE workspace_id > $1",
          "SELECT workspace_id FROM doc_blob_ref_projections WHERE workspace_id > $1",
          "SELECT workspace_id FROM document_cleanup_candidates WHERE workspace_id > $1",
          "SELECT workspace_id FROM blob_cleanup_candidates WHERE workspace_id > $1",
          "SELECT workspace_id FROM storage_reconciliation_runs WHERE workspace_id > $1 AND workspace_id IS NOT NULL",
          "SELECT scope AS ws_id FROM storage_reconciliation_checkpoints WHERE kind = ANY($3) AND scope <> '__all__' AND scope > $1",
        ];
        if has_embeddings {
          union_parts.extend([
            "SELECT workspace_id FROM embedding_sources WHERE workspace_id > $1",
            "SELECT workspace_id FROM embedding_workspace_states WHERE workspace_id > $1",
            "SELECT workspace_id FROM embedding_indexes WHERE workspace_id > $1",
          ]);
        }
        if has_runtime_doc_creators {
          union_parts.push("SELECT workspace_id FROM runtime_doc_creators WHERE workspace_id > $1");
        }
        let find_sql = format!(
          "SELECT DISTINCT ws_id FROM ({}) candidates \
           WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = candidates.ws_id) \
           ORDER BY ws_id ASC LIMIT $2",
          union_parts.join(" UNION ")
        );
        let orphan_ws_ids: Vec<String> = sqlx::query_scalar(&find_sql)
          .bind(&pg_cursor)
          .bind(ws_limit)
          .bind(WORKSPACE_CHECKPOINT_KINDS)
          .fetch_all(self.long_conn().await?.as_conn())
          .await
          .map_err(db_error("find orphan workspace ids"))?;

        let mut total_deleted: u64 = 0;
        let mut pg_had_error = false;
        let mut last_ok_ws: Option<&str> = None;
        for ws_id in &orphan_ws_ids {
          if is_cancelled() {
            break;
          }
          let lock = match crate::StorageWorkspaceLock::acquire(&self.db, &self.lock_permits, ws_id).await {
            Ok(lock) => lock,
            Err(err) => {
              tracing::warn!(workspace_id = %ws_id, error = %err, "orphan row cleanup skipped: failed to acquire workspace lock");
              pg_had_error = true;
              continue;
            }
          };
          let outcome = async {
            let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
              .bind(ws_id)
              .fetch_one(self.long_conn().await?.as_conn())
              .await
              .map_err(db_error("recheck workspace absence for orphan rows"))?;
            if !exists {
              let deleted = self
                .delete_orphan_rows_for_workspace(ws_id, has_embeddings, has_runtime_doc_creators)
                .await?;
              total_deleted = total_deleted.saturating_add(deleted);
            }
            Ok::<_, DomainError>(())
          }
          .await;
          lock.release().await;
          if let Err(err) = outcome {
            tracing::warn!(workspace_id = %ws_id, error = %err, "orphan row cleanup failed");
            pg_had_error = true;
          } else if !pg_had_error {
            last_ok_ws = Some(ws_id.as_str());
          }
        }
        report.deleted_orphan_rows += usize::try_from(total_deleted).unwrap_or(0);
        if orphan_ws_ids.len() < limit && !is_cancelled() && !pg_had_error {
          self.save_orphan_cursor(Some(""), true).await?;
          pg_completed = true;
        } else if let Some(last_ws) = last_ok_ws {
          self.save_orphan_cursor(Some(last_ws), false).await?;
        }
      }
      report.completed = objects_completed && ownerless_completed && pg_completed;
      Ok(())
    }
    .await;
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

  async fn delete_orphan_rows_for_workspace(
    &self,
    ws_id: &str,
    has_embeddings: bool,
    has_runtime_doc_creators: bool,
  ) -> Result<u64, DomainError> {
    let mut total: u64 = 0;
    let mut delete_tables: Vec<&'static str> = vec![
      "DELETE FROM blobs WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = blobs.workspace_id)",
      "DELETE FROM comment_attachments WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = comment_attachments.workspace_id)",
      "DELETE FROM snapshots WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = snapshots.workspace_id)",
      "DELETE FROM updates WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = updates.workspace_id)",
      "DELETE FROM snapshot_histories WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = snapshot_histories.workspace_id)",
      "DELETE FROM workspace_pages WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_pages.workspace_id)",
      "DELETE FROM replies WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = replies.workspace_id)",
      "DELETE FROM comments WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = comments.workspace_id)",
      "DELETE FROM doc_blob_refs WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = doc_blob_refs.workspace_id)",
      "DELETE FROM doc_blob_ref_projections WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = doc_blob_ref_projections.workspace_id)",
      "DELETE FROM document_cleanup_candidates WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = document_cleanup_candidates.workspace_id)",
      "DELETE FROM blob_cleanup_candidates WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = blob_cleanup_candidates.workspace_id)",
      "DELETE FROM storage_reconciliation_runs WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = storage_reconciliation_runs.workspace_id)",
    ];
    if has_embeddings {
      delete_tables.extend([
        "DELETE FROM embedding_sources WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = embedding_sources.workspace_id)",
        "DELETE FROM embedding_workspace_states WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = embedding_workspace_states.workspace_id)",
        "DELETE FROM embedding_indexes WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = embedding_indexes.workspace_id)",
      ]);
    }
    if has_runtime_doc_creators {
      delete_tables.push(
        "DELETE FROM runtime_doc_creators WHERE workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = runtime_doc_creators.workspace_id)",
      );
    }
    for sql in delete_tables {
      let deleted = sqlx::query(sql)
        .bind(ws_id)
        .execute(self.long_conn().await?.as_conn())
        .await
        .map_err(db_error("delete orphan workspace rows"))?
        .rows_affected();
      total = total.saturating_add(deleted);
    }
    let cp_deleted = sqlx::query(
      "DELETE FROM storage_reconciliation_checkpoints WHERE scope = $1 AND kind = ANY($2) AND scope <> '__all__' \
       AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = storage_reconciliation_checkpoints.scope)",
    )
    .bind(ws_id)
    .bind(WORKSPACE_CHECKPOINT_KINDS)
    .execute(self.long_conn().await?.as_conn())
    .await
    .map_err(db_error("delete orphan storage checkpoints"))?
    .rows_affected();
    total = total.saturating_add(cp_deleted);
    Ok(total)
  }

  async fn load_namespace_cursor(&self) -> Result<Option<String>, DomainError> {
    let row = sqlx::query(
      "SELECT cursor, last_key FROM storage_reconciliation_checkpoints \
       WHERE kind = 'workspace_storage_namespace' AND scope = 'global'",
    )
    .fetch_optional(self.long_conn().await?.as_conn())
    .await
    .map_err(db_error("load storage namespace cursor"))?;
    let Some(row) = row else {
      return Ok(None);
    };
    let from_json = row
      .try_get::<Option<serde_json::Value>, _>("cursor")
      .ok()
      .flatten()
      .and_then(|c| {
        c.get("continuationToken")
          .and_then(serde_json::Value::as_str)
          .map(str::to_owned)
      })
      .filter(|s| !s.is_empty());
    if from_json.is_some() {
      return Ok(from_json);
    }
    Ok(
      row
        .try_get::<Option<String>, _>("last_key")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty()),
    )
  }

  async fn save_namespace_cursor(&self, last_key: Option<&str>, completed: bool) -> Result<(), DomainError> {
    sqlx::query(
      "UPDATE storage_reconciliation_checkpoints \
       SET last_key = $1, cursor = $2, completed_at = CASE WHEN $3 THEN clock_timestamp() ELSE completed_at END, updated_at = clock_timestamp() \
       WHERE kind = 'workspace_storage_namespace' AND scope = 'global'",
    )
    .bind(last_key)
    .bind(json!({ "continuationToken": last_key }))
    .bind(completed)
    .execute(self.long_conn().await?.as_conn())
    .await
    .map_err(db_error("save storage namespace cursor"))?;
    Ok(())
  }

  async fn load_orphan_cursor(&self) -> Result<String, DomainError> {
    let row = sqlx::query(
      "SELECT status, cursor, last_key FROM storage_reconciliation_checkpoints \
       WHERE kind = 'workspace_storage_orphan_rows' AND scope = 'storage'",
    )
    .fetch_optional(self.long_conn().await?.as_conn())
    .await
    .map_err(db_error("load orphan row cursor"))?;
    let Some(row) = row else {
      return Ok(String::new());
    };
    if row.try_get::<String, _>("status").unwrap_or_default() == "completed" {
      return Ok(String::new());
    }
    if let Some(ws_id) = row
      .try_get::<Option<serde_json::Value>, _>("cursor")
      .ok()
      .flatten()
      .and_then(|c| {
        c.get("lastWorkspaceId")
          .and_then(serde_json::Value::as_str)
          .map(str::to_owned)
      })
    {
      return Ok(ws_id);
    }
    Ok(
      row
        .try_get::<Option<String>, _>("last_key")
        .ok()
        .flatten()
        .unwrap_or_default(),
    )
  }

  async fn save_orphan_cursor(&self, last_key: Option<&str>, completed: bool) -> Result<(), DomainError> {
    sqlx::query(
      "INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, last_key, cursor, completed_at, updated_at) \
       VALUES ('workspace_storage_orphan_rows', 'storage', $1, $2, $3, CASE WHEN $4 THEN clock_timestamp() ELSE NULL END, clock_timestamp()) \
       ON CONFLICT (kind, scope) DO UPDATE SET status = EXCLUDED.status, last_key = EXCLUDED.last_key, cursor = EXCLUDED.cursor, \
         completed_at = COALESCE(EXCLUDED.completed_at, storage_reconciliation_checkpoints.completed_at), updated_at = clock_timestamp()",
    )
    .bind(if completed { "completed" } else { "running" })
    .bind(last_key)
    .bind(json!({ "lastWorkspaceId": last_key.unwrap_or("") }))
    .bind(completed)
    .execute(self.long_conn().await?.as_conn())
    .await
    .map_err(db_error("save storage reconciliation cursor"))?;
    Ok(())
  }

  async fn load_ownerless_cursor(&self) -> Result<i32, DomainError> {
    let row = sqlx::query(
      "SELECT status, cursor FROM storage_reconciliation_checkpoints \
       WHERE kind = 'workspace_storage_ownerless' AND scope = 'workspaces'",
    )
    .fetch_optional(self.long_conn().await?.as_conn())
    .await
    .map_err(db_error("load ownerless cursor"))?;
    let Some(row) = row else {
      return Ok(0);
    };
    if row.try_get::<String, _>("status").unwrap_or_default() == "completed" {
      return Ok(0);
    }
    Ok(
      row
        .try_get::<Option<serde_json::Value>, _>("cursor")
        .ok()
        .flatten()
        .and_then(|c| c.get("lastSid").and_then(serde_json::Value::as_i64))
        .and_then(|sid| i32::try_from(sid).ok())
        .unwrap_or(0),
    )
  }

  async fn save_ownerless_cursor(&self, last_sid: i32, completed: bool) -> Result<(), DomainError> {
    sqlx::query(
      "INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, cursor, completed_at, updated_at) \
       VALUES ('workspace_storage_ownerless', 'workspaces', $1, $2, CASE WHEN $3 THEN clock_timestamp() ELSE NULL END, clock_timestamp()) \
       ON CONFLICT (kind, scope) DO UPDATE SET status = EXCLUDED.status, cursor = EXCLUDED.cursor, \
         completed_at = COALESCE(EXCLUDED.completed_at, storage_reconciliation_checkpoints.completed_at), updated_at = clock_timestamp()",
    )
    .bind(if completed { "completed" } else { "running" })
    .bind(json!({ "lastSid": last_sid }))
    .bind(completed)
    .execute(self.long_conn().await?.as_conn())
    .await
    .map_err(db_error("save ownerless cursor"))?;
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::{ObjectKeyOwner, classify_object_key};

  #[test]
  fn classify_object_key_aligns_with_v0275_namespaces() {
    assert_eq!(
      classify_object_key("copilot/transcript/ws/u/t/0"),
      ObjectKeyOwner::Exempt
    );
    assert_eq!(classify_object_key("copilot/artifacts/ws/a/b"), ObjectKeyOwner::Exempt);
    assert_eq!(
      classify_object_key("copilot-attachments/ws/a/b"),
      ObjectKeyOwner::Exempt
    );
    assert_eq!(classify_object_key("avatars/u1-avatar-123"), ObjectKeyOwner::Exempt);
    assert_eq!(
      classify_object_key("workspace-files/ws-1/file-a"),
      ObjectKeyOwner::Workspace("ws-1")
    );
    assert_eq!(
      classify_object_key("context-files/ws-2/file-b"),
      ObjectKeyOwner::Workspace("ws-2")
    );
    assert_eq!(
      classify_object_key("artifacts/ws-3/art-c"),
      ObjectKeyOwner::Workspace("ws-3")
    );
    assert_eq!(
      classify_object_key("user-1/ws-1/att-key"),
      ObjectKeyOwner::WorkspaceOrCopilotChat {
        first: "user-1",
        second: "ws-1",
      }
    );
    assert_eq!(classify_object_key("ws-1/blob-key"), ObjectKeyOwner::Workspace("ws-1"));
    assert_eq!(
      classify_object_key("ws-1/.reservations/res-1/blob-key"),
      ObjectKeyOwner::Workspace("ws-1")
    );
    assert_eq!(
      classify_object_key("comment-attachments/ws-1/doc-1/att-1"),
      ObjectKeyOwner::CommentAttachment {
        workspace_id: "ws-1",
        doc_id: "doc-1",
        key: "att-1",
        reservation_id: None,
      }
    );
    assert_eq!(
      classify_object_key("comment-attachments/ws-1/doc-1/.reservations/res-1/att-1"),
      ObjectKeyOwner::CommentAttachment {
        workspace_id: "ws-1",
        doc_id: "doc-1",
        key: "att-1",
        reservation_id: Some("res-1"),
      }
    );
  }
}
