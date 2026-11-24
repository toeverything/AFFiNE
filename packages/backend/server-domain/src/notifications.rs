//! User notifications: listing, unread counts, user mentions, and read-state updates.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use server_db::{ServerDb, WorkloadTier};
use server_spi::QuotaGate;
use server_types::DomainError;
use sqlx::{Row, types::Json};

use crate::acl::load_workspace_docs_access_in;
use crate::doc_sharing::DocSharingService;
use crate::events::EventBusPublisher;

#[derive(Clone, Debug)]
pub struct NotificationRecord {
  pub id: String,
  pub level: String,
  pub notification_type: String,
  pub read: bool,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub body: Value,
}

#[derive(Clone, Debug)]
pub struct MentionDocInput {
  pub id: String,
  pub title: String,
  pub mode: String,
  pub block_id: Option<String>,
  pub element_id: Option<String>,
}

#[derive(Clone)]
pub struct NotificationService {
  db: ServerDb,
  quota_gate: Arc<dyn QuotaGate>,
  doc_sharing: DocSharingService,
  event_bus: Arc<dyn EventBusPublisher>,
}

impl NotificationService {
  pub fn new(
    db: ServerDb,
    quota_gate: Arc<dyn QuotaGate>,
    doc_sharing: DocSharingService,
    event_bus: Arc<dyn EventBusPublisher>,
  ) -> Self {
    Self {
      db,
      quota_gate,
      doc_sharing,
      event_bus,
    }
  }

  pub async fn count_by_user(&self, user_id: &str) -> Result<i64, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire count_by_user: {e}")))?;
    sqlx::query_scalar("SELECT COUNT(*)::bigint FROM notifications WHERE user_id = $1")
      .bind(user_id)
      .fetch_one(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("count notifications: {e}")))
  }

  pub async fn list_by_user(
    &self,
    user_id: &str,
    first: i64,
    offset: i64,
    after: Option<DateTime<Utc>>,
  ) -> Result<Vec<NotificationRecord>, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin list_by_user: {e}")))?;

    let limit = first.clamp(1, 100);
    let rows = if let Some(after_ts) = after {
      sqlx::query(
        r#"SELECT id, level::text AS level, type::text AS ntype, read, created_at, updated_at, body
           FROM notifications
           WHERE user_id = $1 AND created_at < $2
           ORDER BY created_at DESC
           OFFSET $3 LIMIT $4"#,
      )
      .bind(user_id)
      .bind(after_ts)
      .bind(offset.max(0))
      .bind(limit)
      .fetch_all(&mut **tx.tx_mut())
      .await
    } else {
      sqlx::query(
        r#"SELECT id, level::text AS level, type::text AS ntype, read, created_at, updated_at, body
           FROM notifications
           WHERE user_id = $1
           ORDER BY created_at DESC
           OFFSET $2 LIMIT $3"#,
      )
      .bind(user_id)
      .bind(offset.max(0))
      .bind(limit)
      .fetch_all(&mut **tx.tx_mut())
      .await
    }
    .map_err(|e| DomainError::Internal(format!("list notifications: {e}")))?;

    let mut creator_ids = HashSet::new();
    let mut workspace_ids = HashSet::new();
    for r in &rows {
      let body: Value = r.get::<Json<Value>, _>("body").0;
      if let Some(uid) = body.get("createdByUserId").and_then(Value::as_str) {
        creator_ids.insert(uid.to_owned());
      }
      if let Some(wid) = body.get("workspaceId").and_then(Value::as_str) {
        workspace_ids.insert(wid.to_owned());
      }
    }

    let creator_vec: Vec<String> = creator_ids.into_iter().collect();
    let creators: HashMap<String, (String, Option<String>)> = if creator_vec.is_empty() {
      HashMap::new()
    } else {
      sqlx::query("SELECT id, name, avatar_url FROM users WHERE id = ANY($1)")
        .bind(&creator_vec)
        .fetch_all(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load notification creators: {e}")))?
        .into_iter()
        .map(|r| (r.get("id"), (r.get("name"), r.get("avatar_url"))))
        .collect()
    };

    let ws_vec: Vec<String> = workspace_ids.into_iter().collect();
    let workspaces: HashMap<String, Option<String>> = if ws_vec.is_empty() {
      HashMap::new()
    } else {
      sqlx::query("SELECT id, name FROM workspaces WHERE id = ANY($1)")
        .bind(&ws_vec)
        .fetch_all(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load notification workspaces: {e}")))?
        .into_iter()
        .map(|r| (r.get("id"), r.get("name")))
        .collect()
    };
    let _ = tx.rollback().await;

    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
      let ntype: String = r.get("ntype");
      let mut body = r.get::<Json<Value>, _>("body").0;
      if let Some(obj) = body.as_object_mut() {
        obj.insert("type".to_owned(), Value::String(ntype.clone()));
        if let Some(uid) = obj.get("createdByUserId").and_then(Value::as_str).map(str::to_owned)
          && let Some((name, avatar_url)) = creators.get(&uid)
        {
          obj.insert(
            "createdByUser".to_owned(),
            json!({ "id": uid, "name": name, "avatarUrl": avatar_url }),
          );
        }
        if let Some(wid) = obj.get("workspaceId").and_then(Value::as_str).map(str::to_owned)
          && let Some(ws_name) = workspaces.get(&wid)
        {
          obj.insert(
            "workspace".to_owned(),
            json!({ "id": wid, "name": ws_name.as_deref().unwrap_or(""), "avatarUrl": Value::Null }),
          );
        }
      }
      out.push(NotificationRecord {
        id: r.get("id"),
        level: r.get("level"),
        notification_type: ntype,
        read: r.get("read"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
        body,
      });
    }
    Ok(out)
  }

  pub async fn mention_user(
    &self,
    actor_user_id: &str,
    target_user_id: &str,
    workspace_id: &str,
    doc: MentionDocInput,
  ) -> Result<String, DomainError> {
    if actor_user_id == target_user_id {
      return Err(DomainError::Validation("mention_user_oneself_denied".to_owned()));
    }
    let storage_doc_id = self.doc_sharing.resolve_storage_doc_id(workspace_id, &doc.id).await?;

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin mention_user: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("mention_user clock: {e}")))?;

    let actor_access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&storage_doc_id),
      now,
    )
    .await?;
    if !actor_access
      .docs
      .get(&storage_doc_id)
      .is_some_and(|e| e.permissions.doc_update)
    {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{}:Doc.Update",
        doc.id
      )));
    }

    let target_access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(target_user_id),
      std::slice::from_ref(&storage_doc_id),
      now,
    )
    .await?;
    if !target_access
      .docs
      .get(&storage_doc_id)
      .is_some_and(|e| e.permissions.doc_read)
    {
      return Err(DomainError::Forbidden(format!(
        "mention_user_doc_access_denied:{}",
        doc.id
      )));
    }

    let body = json!({
      "workspaceId": workspace_id,
      "createdByUserId": actor_user_id,
      "doc": {
        "id": doc.id,
        "title": doc.title,
        "mode": doc.mode,
        "blockId": doc.block_id,
        "elementId": doc.element_id,
      },
    });
    let id: String = sqlx::query_scalar(
      r#"INSERT INTO notifications (id, user_id, level, type, body)
         VALUES (gen_random_uuid()::text, $1, 'Default', 'Mention'::"NotificationType", $2)
         RETURNING id"#,
    )
    .bind(target_user_id)
    .bind(Json(body))
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert mention notification: {e}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit mention_user: {e}")))?;

    self.publish_count_changed(target_user_id, "created").await;
    Ok(id)
  }

  pub async fn mark_as_read(&self, user_id: &str, notification_id: &str) -> Result<(), DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin mark_as_read: {e}")))?;
    sqlx::query("UPDATE notifications SET read = true, updated_at = now() WHERE id = $1 AND user_id = $2")
      .bind(notification_id)
      .bind(user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("mark notification read: {e}")))?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit mark_as_read: {e}")))?;
    self.publish_count_changed(user_id, "read").await;
    Ok(())
  }

  pub async fn mark_all_as_read(&self, user_id: &str) -> Result<(), DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin mark_all_as_read: {e}")))?;
    sqlx::query("UPDATE notifications SET read = true, updated_at = now() WHERE user_id = $1 AND read = false")
      .bind(user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("mark all notifications read: {e}")))?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit mark_all_as_read: {e}")))?;
    self.publish_count_changed(user_id, "read-all").await;
    Ok(())
  }

  async fn publish_count_changed(&self, user_id: &str, reason: &str) {
    publish_notification_count_changed(&self.db, self.event_bus.as_ref(), user_id, reason).await;
  }
}

async fn load_workspace_display_name_in_tx(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  workspace_id: &str,
) -> Result<String, DomainError> {
  let db_name: Option<String> = sqlx::query_scalar("SELECT NULLIF(trim(name), '') FROM workspaces WHERE id = $1")
    .bind(workspace_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load invitation mail workspace name: {e}")))?
    .flatten();
  if let Some(name) = db_name {
    return Ok(name);
  }
  let mut parts: Vec<Vec<u8>> = Vec::new();
  if let Some(snap) =
    sqlx::query_scalar::<_, Vec<u8>>("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $1")
      .bind(workspace_id)
      .fetch_optional(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("load workspace root snapshot for name: {e}")))?
    && !snap.is_empty()
  {
    parts.push(snap);
  }
  let updates: Vec<Vec<u8>> =
    sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $1 ORDER BY created_at ASC")
      .bind(workspace_id)
      .fetch_all(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("load workspace root updates for name: {e}")))?;
  parts.extend(updates.into_iter().filter(|b| !b.is_empty()));
  if !parts.is_empty() {
    let merged = if parts.len() == 1 {
      Some(parts.remove(0))
    } else {
      y_octo::merge_updates_v1(&parts).and_then(|u| u.encode_v1()).ok()
    };
    if let Some(bin) = merged
      && let Ok(doc) = y_octo::Doc::try_from_binary_v1(&bin)
      && let Ok(meta) = doc.get_or_create_map("meta")
      && let Some(y_octo::Value::Any(y_octo::Any::String(raw))) = meta.get("name")
    {
      let trimmed = raw.trim();
      if !trimmed.is_empty() {
        return Ok(trimmed.to_owned());
      }
    }
  }
  Ok("Untitled".to_owned())
}

#[allow(clippy::too_many_arguments)]
pub async fn insert_invitation_notification_in_tx(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  recipient_user_id: &str,
  created_by_user_id: &str,
  workspace_id: &str,
  invite_id: &str,
  notification_type: &str,
  base_url: &str,
) -> Result<String, DomainError> {
  use sha2::{Digest as _, Sha256};

  let body = json!({
    "workspaceId": workspace_id,
    "createdByUserId": created_by_user_id,
    "inviteId": invite_id,
  });
  let notif_id: String = sqlx::query_scalar(
    r#"INSERT INTO notifications (id, user_id, level, type, body)
       VALUES (gen_random_uuid()::text, $1, 'Default', $2::"NotificationType", $3)
       RETURNING id"#,
  )
  .bind(recipient_user_id)
  .bind(notification_type)
  .bind(Json(body))
  .fetch_one(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("insert invitation notification: {e}")))?;

  let base = base_url.trim_end_matches('/');
  let (mail_name, mail_class, url, has_user, respects_pref) = match notification_type {
    "Invitation" => (
      "MemberInvitation",
      "workspace_invitation",
      format!("{base}/invite/{invite_id}"),
      true,
      true,
    ),
    "InvitationAccepted" => (
      "MemberAccepted",
      "workspace_lifecycle",
      format!("{base}/workspace/{workspace_id}/settings?tab=workspace%3Amembers"),
      true,
      true,
    ),
    "InvitationReviewApproved" => (
      "LinkInvitationApprove",
      "workspace_invitation",
      format!("{base}/workspace/{workspace_id}"),
      false,
      false,
    ),
    _ => return Ok(notif_id),
  };

  let recipient_row = sqlx::query(
    r#"SELECT u.email, COALESCE((s.payload->>'receiveInvitationEmail')::boolean, true) AS receive_invitation_email
       FROM users u
       LEFT JOIN user_settings s ON s.user_id = u.id
       WHERE u.id = $1"#,
  )
  .bind(recipient_user_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load invitation mail recipient settings: {e}")))?;

  if let Some(row) = recipient_row {
    let recipient_email: String = row.get("email");
    let receive_invitation_email: bool = row.get("receive_invitation_email");
    let workspace_name = load_workspace_display_name_in_tx(tx, workspace_id).await?;
    let normalized = recipient_email.trim().to_ascii_lowercase();
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    let recipient_hash = format!("{:x}", hasher.finalize());
    let recipient_domain = normalized.rsplit_once('@').map(|(_, d)| d).unwrap_or("");
    let dedupe_key = format!("notification:{notif_id}:mail:{mail_name}");
    let skip_reason = if matches!(mail_name, "MemberInvitation" | "LinkInvitationApprove")
      && crate::content_policy::contains_url_or_domain(&workspace_name)
    {
      Some("workspace_name_contains_domain")
    } else if respects_pref && !receive_invitation_email {
      Some("recipient_notification_disabled")
    } else {
      None
    };

    let (status, retention_state, stored_email, mail_payload) = if skip_reason.is_some() {
      ("skipped", "anonymized", None, None)
    } else {
      let props = if has_user {
        let actor_email: String = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
          .bind(created_by_user_id)
          .fetch_optional(&mut **tx)
          .await
          .map_err(|e| DomainError::Internal(format!("load invitation mail actor email: {e}")))?
          .unwrap_or_default();
        json!({ "user": { "email": actor_email }, "workspace": { "name": workspace_name }, "url": url })
      } else {
        json!({ "workspace": { "name": workspace_name }, "url": url })
      };
      (
        "queued",
        "full",
        Some(recipient_email.as_str()),
        Some(json!({ "name": mail_name, "to": recipient_email, "props": props })),
      )
    };
    sqlx::query(
      r#"INSERT INTO mail_deliveries
           (mail_name, mail_class, priority, status, retention_state, dedupe_key, recipient_email,
            recipient_hash, recipient_domain, recipient_user_id, actor_user_id,
            workspace_id, notification_id, payload, send_after, expires_at,
            settled_at, anonymized_at, max_attempts, last_error_code)
         VALUES ($1, $2, 'normal', $3, $4, $5, $6,
                 $7, $8, $9, $10,
                 $11, $12, $13, clock_timestamp(), clock_timestamp() + interval '24 hours',
                 CASE WHEN $3 = 'skipped' THEN clock_timestamp() ELSE NULL END,
                 CASE WHEN $3 = 'skipped' THEN clock_timestamp() ELSE NULL END, 3, $14)
         ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING"#,
    )
    .bind(mail_name)
    .bind(mail_class)
    .bind(status)
    .bind(retention_state)
    .bind(&dedupe_key)
    .bind(stored_email)
    .bind(&recipient_hash)
    .bind(recipient_domain)
    .bind(recipient_user_id)
    .bind(created_by_user_id)
    .bind(workspace_id)
    .bind(&notif_id)
    .bind(mail_payload)
    .bind(skip_reason)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("enqueue invitation mail delivery: {e}")))?;
  }

  Ok(notif_id)
}

pub async fn publish_notification_count_changed(
  db: &ServerDb,
  event_bus: &dyn EventBusPublisher,
  user_id: &str,
  reason: &str,
) {
  let Ok(mut conn) = db.acquire_tiered(WorkloadTier::InteractiveRead).await else {
    return;
  };
  let Ok(count) =
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*)::bigint FROM notifications WHERE user_id = $1 AND read = false")
      .bind(user_id)
      .fetch_one(&mut *conn)
      .await
  else {
    return;
  };
  let _ = event_bus
    .publish_event(
      "realtime.topic.changed",
      json!({
        "topic": "notification.count.changed",
        "room": format!("user:{user_id}:notification"),
        "input": {},
        "event": { "count": count, "reason": reason },
      }),
      None,
    )
    .await;
}
