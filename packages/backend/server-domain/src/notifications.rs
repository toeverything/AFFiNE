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

    self.publish_count_changed(target_user_id).await;
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
    self.publish_count_changed(user_id).await;
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
    self.publish_count_changed(user_id).await;
    Ok(())
  }

  async fn publish_count_changed(&self, user_id: &str) {
    let _ = self
      .event_bus
      .publish_event(
        "realtime.topic.changed",
        json!({
          "topic": "notification.count.changed",
          "room": format!("user:{user_id}:notification"),
          "input": {},
          "event": { "changed": true },
        }),
        None,
      )
      .await;
  }
}
