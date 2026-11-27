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
  base_url: String,
  private_key: String,
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
      base_url: "http://localhost:3010".to_owned(),
      private_key: String::new(),
    }
  }

  pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
    self.base_url = base_url.into();
    self
  }

  pub fn with_private_key(mut self, private_key: impl Into<String>) -> Self {
    self.private_key = private_key.into();
    self
  }

  pub async fn count_by_user(&self, user_id: &str) -> Result<i64, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("acquire count_by_user: {e}")))?;
    sqlx::query_scalar(
      r#"SELECT COUNT(*)::bigint
         FROM notifications n
         LEFT JOIN users uc ON uc.id = (n.body->>'createdByUserId')
         WHERE n.user_id = $1
           AND n.read = false
           AND COALESCE(uc.disabled, false) = false"#,
    )
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
        r#"SELECT n.id, n.level::text AS level, n.type::text AS ntype, n.read, n.created_at, n.updated_at, n.body
           FROM notifications n
           LEFT JOIN users uc ON uc.id = (n.body->>'createdByUserId')
           WHERE n.user_id = $1
             AND n.read = false
             AND n.created_at < $2
             AND COALESCE(uc.disabled, false) = false
           ORDER BY n.created_at DESC
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
        r#"SELECT n.id, n.level::text AS level, n.type::text AS ntype, n.read, n.created_at, n.updated_at, n.body
           FROM notifications n
           LEFT JOIN users uc ON uc.id = (n.body->>'createdByUserId')
           WHERE n.user_id = $1
             AND n.read = false
             AND COALESCE(uc.disabled, false) = false
           ORDER BY n.created_at DESC
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
    let mut doc_keys: Vec<(String, String)> = Vec::new();
    for r in &rows {
      let body: Value = r.get::<Json<Value>, _>("body").0;
      if let Some(uid) = body.get("createdByUserId").and_then(Value::as_str) {
        creator_ids.insert(uid.to_owned());
      }
      if let Some(wid) = body.get("workspaceId").and_then(Value::as_str) {
        workspace_ids.insert(wid.to_owned());
        if let Some(did) = body
          .get("doc")
          .and_then(|d| d.get("id"))
          .and_then(Value::as_str)
          .filter(|s| !s.is_empty())
        {
          doc_keys.push((wid.to_owned(), did.to_owned()));
        }
      }
    }

    let creator_vec: Vec<String> = creator_ids.into_iter().collect();
    let creators: HashMap<String, (String, Option<String>, bool)> = if creator_vec.is_empty() {
      HashMap::new()
    } else {
      sqlx::query("SELECT id, name, avatar_url, disabled FROM users WHERE id = ANY($1)")
        .bind(&creator_vec)
        .fetch_all(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load notification creators: {e}")))?
        .into_iter()
        .map(|r| (r.get("id"), (r.get("name"), r.get("avatar_url"), r.get("disabled"))))
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

    let mut page_titles: HashMap<(String, String), String> = HashMap::new();
    if !doc_keys.is_empty() {
      let ws_ids: Vec<String> = doc_keys.iter().map(|(w, _)| w.clone()).collect();
      let pg_ids: Vec<String> = doc_keys.iter().map(|(_, d)| d.clone()).collect();
      let title_rows = sqlx::query(
        r#"SELECT workspace_id, page_id, title
           FROM workspace_pages
           WHERE workspace_id = ANY($1) AND page_id = ANY($2) AND title IS NOT NULL"#,
      )
      .bind(&ws_ids)
      .bind(&pg_ids)
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load notification doc titles: {e}")))?;
      for tr in title_rows {
        let wid: String = tr.get("workspace_id");
        let pid: String = tr.get("page_id");
        if let Some(title) = tr.get::<Option<String>, _>("title")
          && !title.is_empty()
        {
          page_titles.insert((wid, pid), title);
        }
      }
    }
    let _ = tx.rollback().await;

    let base = self.base_url.trim_end_matches('/');
    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
      let ntype: String = r.get("ntype");
      let mut body = r.get::<Json<Value>, _>("body").0;
      if let Some(uid) = body.get("createdByUserId").and_then(Value::as_str)
        && creators.get(uid).is_some_and(|(_, _, disabled)| *disabled)
      {
        continue;
      }
      if let Some(obj) = body.as_object_mut() {
        obj.insert("type".to_owned(), Value::String(ntype.clone()));
        if let Some(uid) = obj.get("createdByUserId").and_then(Value::as_str).map(str::to_owned)
          && let Some((name, avatar_url, _)) = creators.get(&uid)
        {
          obj.insert(
            "createdByUser".to_owned(),
            json!({ "id": uid, "name": name, "avatarUrl": avatar_url }),
          );
        }
        if let Some(wid) = obj.get("workspaceId").and_then(Value::as_str).map(str::to_owned) {
          if let Some(ws_name) = workspaces.get(&wid) {
            obj.insert(
              "workspace".to_owned(),
              json!({
                "id": wid,
                "name": ws_name.as_deref().unwrap_or(""),
                "avatarUrl": Value::Null,
                "url": format!("{base}/workspace/{wid}"),
              }),
            );
          }
          if let Some(doc_obj) = obj.get_mut("doc").and_then(Value::as_object_mut)
            && let Some(did) = doc_obj.get("id").and_then(Value::as_str).map(str::to_owned)
            && let Some(latest_title) = page_titles.get(&(wid, did))
          {
            doc_obj.insert("title".to_owned(), Value::String(latest_title.clone()));
          }
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

    let base = self.base_url.trim_end_matches('/');
    let doc_url = format!("{base}/workspace/{workspace_id}/{}", doc.id);
    let actor_email: String = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
      .bind(actor_user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load mention actor email: {e}")))?
      .unwrap_or_default();
    enqueue_notification_mail_in_tx(
      tx.tx_mut(),
      EnqueueNotificationMail {
        private_key: &self.private_key,
        mail_name: "Mention",
        mail_class: "doc_mention",
        recipient_user_id: target_user_id,
        actor_user_id: Some(actor_user_id),
        workspace_id: Some(workspace_id),
        notification_id: Some(&id),
        pref_field: Some("receiveMentionEmail"),
        props: json!({
          "user": { "email": actor_email },
          "doc": { "title": doc.title, "url": doc_url },
        }),
        skip_if_domain_in_workspace_name: None,
      },
    )
    .await?;

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
    let affected =
      sqlx::query("UPDATE notifications SET read = true, updated_at = now() WHERE id = $1 AND user_id = $2")
        .bind(notification_id)
        .bind(user_id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("mark notification read: {e}")))?
        .rows_affected();
    if affected == 0 {
      let _ = tx.rollback().await;
      return Err(DomainError::NotFound("notification_not_found".to_owned()));
    }
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

pub fn compute_recipient_hash(private_key: &str, email: &str) -> String {
  use hmac::{Hmac, Mac as _};
  use sha2::{Digest as _, Sha256};
  let normalized = email.trim().to_ascii_lowercase();
  let key_bytes = if private_key.is_empty() {
    b"affine-default-recipient-hash-key".as_slice()
  } else {
    private_key.as_bytes()
  };
  let hash_key = Sha256::digest(key_bytes);
  let mut mac = Hmac::<Sha256>::new_from_slice(&hash_key).expect("HMAC accepts any key length");
  mac.update(normalized.as_bytes());
  hex::encode(mac.finalize().into_bytes())
}

pub struct EnqueueNotificationMail<'a> {
  pub private_key: &'a str,
  pub mail_name: &'a str,
  pub mail_class: &'a str,
  pub recipient_user_id: &'a str,
  pub actor_user_id: Option<&'a str>,
  pub workspace_id: Option<&'a str>,
  pub notification_id: Option<&'a str>,
  pub pref_field: Option<&'a str>,
  pub props: Value,
  pub skip_if_domain_in_workspace_name: Option<&'a str>,
}

pub async fn enqueue_notification_mail_in_tx(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  params: EnqueueNotificationMail<'_>,
) -> Result<(), DomainError> {
  let row = sqlx::query(
    r#"SELECT u.email, u.disabled, s.payload AS settings
       FROM users u
       LEFT JOIN user_settings s ON s.user_id = u.id
       WHERE u.id = $1"#,
  )
  .bind(params.recipient_user_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load mail recipient settings: {e}")))?;

  let Some(row) = row else {
    return Ok(());
  };
  let recipient_email: String = row.get("email");
  let disabled: bool = row.get("disabled");
  let settings: Option<Value> = row.get::<Option<Json<Value>>, _>("settings").map(|j| j.0);
  let pref_enabled = params.pref_field.is_none_or(|field| {
    settings
      .as_ref()
      .and_then(|s| s.get(field))
      .and_then(Value::as_bool)
      .unwrap_or(true)
  });

  let normalized = recipient_email.trim().to_ascii_lowercase();
  let recipient_hash = compute_recipient_hash(params.private_key, &normalized);
  let recipient_domain = normalized.rsplit_once('@').map(|(_, d)| d).unwrap_or("");
  let dedupe_key = params
    .notification_id
    .map(|nid| format!("notification:{nid}:mail:{}", params.mail_name));

  let skip_reason = if disabled {
    Some("disabled_recipient")
  } else if params
    .skip_if_domain_in_workspace_name
    .is_some_and(crate::content_policy::contains_url_or_domain)
  {
    Some("workspace_name_contains_domain")
  } else if !pref_enabled {
    Some("recipient_notification_disabled")
  } else {
    None
  };

  let (status, retention_state, stored_email, mail_payload) = if skip_reason.is_some() {
    ("skipped", "anonymized", None, None)
  } else {
    (
      "queued",
      "full",
      Some(recipient_email.as_str()),
      Some(json!({ "name": params.mail_name, "to": recipient_email, "props": params.props })),
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
  .bind(params.mail_name)
  .bind(params.mail_class)
  .bind(status)
  .bind(retention_state)
  .bind(dedupe_key.as_deref())
  .bind(stored_email)
  .bind(&recipient_hash)
  .bind(recipient_domain)
  .bind(params.recipient_user_id)
  .bind(params.actor_user_id)
  .bind(params.workspace_id)
  .bind(params.notification_id)
  .bind(mail_payload)
  .bind(skip_reason)
  .execute(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("enqueue notification mail delivery: {e}")))?;

  Ok(())
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
  insert_invitation_notification_with_key_in_tx(
    tx,
    recipient_user_id,
    created_by_user_id,
    workspace_id,
    invite_id,
    notification_type,
    base_url,
    "",
  )
  .await
}

#[allow(clippy::too_many_arguments)]
pub async fn insert_invitation_notification_with_key_in_tx(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  recipient_user_id: &str,
  created_by_user_id: &str,
  workspace_id: &str,
  invite_id: &str,
  notification_type: &str,
  base_url: &str,
  private_key: &str,
) -> Result<String, DomainError> {
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
  let (mail_name, mail_class, url, has_user, pref_field, check_domain) = match notification_type {
    "Invitation" => (
      "MemberInvitation",
      "workspace_invitation",
      Some(format!("{base}/invite/{invite_id}")),
      true,
      Some("receiveInvitationEmail"),
      true,
    ),
    "InvitationAccepted" => (
      "MemberAccepted",
      "workspace_lifecycle",
      Some(format!(
        "{base}/workspace/{workspace_id}/settings?tab=workspace%3Amembers"
      )),
      true,
      Some("receiveInvitationEmail"),
      false,
    ),
    "InvitationReviewRequest" => (
      "LinkInvitationReviewRequest",
      "workspace_invitation",
      Some(format!(
        "{base}/workspace/{workspace_id}/settings?tab=workspace%3Amembers"
      )),
      true,
      Some("receiveInvitationEmail"),
      false,
    ),
    "InvitationReviewApproved" => (
      "LinkInvitationApprove",
      "workspace_invitation",
      Some(format!("{base}/workspace/{workspace_id}")),
      false,
      None,
      true,
    ),
    "InvitationReviewDeclined" => (
      "LinkInvitationDecline",
      "workspace_invitation",
      None,
      false,
      None,
      false,
    ),
    _ => return Ok(notif_id),
  };

  let workspace_name = load_workspace_display_name_in_tx(tx, workspace_id).await?;
  let props = if has_user {
    let actor_email: String = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
      .bind(created_by_user_id)
      .fetch_optional(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("load invitation mail actor email: {e}")))?
      .unwrap_or_default();
    if let Some(ref link) = url {
      json!({ "user": { "email": actor_email }, "workspace": { "name": workspace_name }, "url": link })
    } else {
      json!({ "user": { "email": actor_email }, "workspace": { "name": workspace_name } })
    }
  } else if let Some(ref link) = url {
    json!({ "workspace": { "name": workspace_name }, "url": link })
  } else {
    json!({ "workspace": { "name": workspace_name } })
  };

  enqueue_notification_mail_in_tx(
    tx,
    EnqueueNotificationMail {
      private_key,
      mail_name,
      mail_class,
      recipient_user_id,
      actor_user_id: Some(created_by_user_id),
      workspace_id: Some(workspace_id),
      notification_id: Some(&notif_id),
      pref_field,
      props,
      skip_if_domain_in_workspace_name: check_domain.then_some(workspace_name.as_str()),
    },
  )
  .await?;

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
  let Ok(count) = sqlx::query_scalar::<_, i64>(
    r#"SELECT COUNT(*)::bigint
       FROM notifications n
       LEFT JOIN users uc ON uc.id = (n.body->>'createdByUserId')
       WHERE n.user_id = $1
         AND n.read = false
         AND COALESCE(uc.disabled, false) = false"#,
  )
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

#[cfg(test)]
mod tests {
  use super::compute_recipient_hash;

  #[test]
  fn compute_recipient_hash_matches_auth_hmac_sha256_of_sha256_key() {
    assert_eq!(
      compute_recipient_hash("test-private-key-v1", "  Alice@Example.COM  "),
      "22eecd069d10c8a52b5f07b62d07f995589671dc16d3ecd522abd6069f918363"
    );
    assert_eq!(
      compute_recipient_hash("test-private-key-v1", "alice@example.com"),
      crate::auth::hmac_sha256_hex("test-private-key-v1", "alice@example.com").unwrap()
    );
  }
}
