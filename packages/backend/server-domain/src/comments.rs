//! Document comments, replies, cursor-paginated comment changes,
//! comment notifications, and comment attachment metadata.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use server_db::{ServerDb, WorkloadTier};
use server_spi::QuotaGate;
use server_types::DomainError;
use sqlx::{Postgres, Row, Transaction, types::Json};

use crate::acl::load_workspace_docs_access_in;
use crate::doc_sharing::DocSharingService;
use crate::events::{EventBusPublisher, InvalidationHintV1, InvalidationPublisher, NoopEventPublisher};
use crate::users::PublicUserView;

pub const MAX_COMMENT_ATTACHMENT_BYTES: usize = 10 * 1024 * 1024;
const COMMENT_ATTACHMENT_RESERVATION_MINUTES: i32 = 5;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommentAttachmentReservation {
  pub storage_doc_id: String,
  pub reservation_id: String,
}

#[derive(Clone, Debug)]
pub struct CommentRecord {
  pub sid: i32,
  pub id: String,
  pub workspace_id: String,
  pub doc_id: String,
  pub user_id: String,
  pub content: Value,
  pub resolved: bool,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub deleted_at: Option<DateTime<Utc>>,
  pub user: PublicUserView,
  pub replies: Vec<ReplyRecord>,
}

#[derive(Clone, Debug)]
pub struct ReplyRecord {
  pub sid: i32,
  pub id: String,
  pub workspace_id: String,
  pub doc_id: String,
  pub comment_id: String,
  pub user_id: String,
  pub content: Value,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub deleted_at: Option<DateTime<Utc>>,
  pub user: PublicUserView,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CommentChangeAction {
  Update,
  Delete,
}

#[derive(Clone, Debug)]
pub struct CommentChangeRecord {
  pub action: CommentChangeAction,
  pub id: String,
  pub comment_id: Option<String>,
  pub updated_at: DateTime<Utc>,
  pub item: Value,
}

#[derive(Clone, Debug)]
pub struct CommentNotificationContext {
  pub doc_title: String,
  pub doc_mode: String,
  pub mentions: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct CommentAttachmentRecord {
  pub workspace_id: String,
  pub doc_id: String,
  pub key: String,
  pub size: i32,
  pub mime: String,
  pub name: String,
  pub created_at: DateTime<Utc>,
}

struct TargetRow {
  id: String,
  workspace_id: String,
  doc_id: String,
  user_id: String,
}

#[derive(Clone, Copy, Debug)]
pub struct ReserveCommentAttachmentInput<'a> {
  pub actor_user_id: &'a str,
  pub workspace_id: &'a str,
  pub raw_doc_id: &'a str,
  pub key: &'a str,
  pub filename: &'a str,
  pub mime: &'a str,
  pub size: usize,
}

#[derive(Clone)]
pub struct CommentService {
  db: ServerDb,
  quota_gate: Arc<dyn QuotaGate>,
  doc_sharing: DocSharingService,
  event_bus: Arc<dyn EventBusPublisher>,
  invalidation: Arc<dyn InvalidationPublisher>,
  base_url: String,
  private_key: String,
}

impl CommentService {
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
      invalidation: Arc::new(NoopEventPublisher::default()),
      base_url: "http://localhost:3010".to_owned(),
      private_key: String::new(),
    }
  }

  pub fn with_invalidation(mut self, invalidation: Arc<dyn InvalidationPublisher>) -> Self {
    self.invalidation = invalidation;
    self
  }

  pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
    self.base_url = base_url.into();
    self
  }

  pub fn with_private_key(mut self, private_key: impl Into<String>) -> Self {
    self.private_key = private_key.into();
    self
  }

  pub async fn create_comment(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    raw_doc_id: &str,
    content: Value,
    notification: CommentNotificationContext,
  ) -> Result<CommentRecord, DomainError> {
    let doc_id = self
      .doc_sharing
      .resolve_storage_doc_id(workspace_id, raw_doc_id)
      .await?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin create_comment: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("create_comment clock: {e}")))?;

    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    let allowed = access
      .docs
      .get(&doc_id)
      .is_some_and(|e| e.permissions.doc_comments_create);
    if !allowed
      || DocSharingService::is_workspace_readonly_in(tx.tx_mut(), self.quota_gate.as_ref(), workspace_id, now).await?
    {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Comments.Create"
      )));
    }

    let row = sqlx::query(
      r#"INSERT INTO comments (id, workspace_id, doc_id, user_id, content)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
         RETURNING sid, id, workspace_id, doc_id, user_id, content, resolved, created_at, updated_at, deleted_at"#,
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .bind(actor_user_id)
    .bind(Json(content))
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert comment: {e}")))?;

    let comment_id: String = row.get("id");
    let target = TargetRow {
      id: comment_id.clone(),
      workspace_id: workspace_id.to_owned(),
      doc_id: doc_id.clone(),
      user_id: actor_user_id.to_owned(),
    };
    let notified_users = create_comment_notifications_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      actor_user_id,
      &target,
      None,
      notification,
      &self.base_url,
      &self.private_key,
      now,
    )
    .await?;
    let user = load_public_user_in(tx.tx_mut(), actor_user_id).await?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit create_comment: {e}")))?;

    self.publish_comment_changed(workspace_id, &doc_id).await;
    self.publish_notification_counts(&notified_users).await;

    Ok(CommentRecord {
      sid: row.get("sid"),
      id: comment_id,
      workspace_id: row.get("workspace_id"),
      doc_id: row.get("doc_id"),
      user_id: row.get("user_id"),
      content: row.get::<Json<Value>, _>("content").0,
      resolved: row.get("resolved"),
      created_at: row.get("created_at"),
      updated_at: row.get("updated_at"),
      deleted_at: row.get("deleted_at"),
      user,
      replies: Vec::new(),
    })
  }

  pub async fn update_comment(&self, actor_user_id: &str, id: &str, content: Value) -> Result<(), DomainError> {
    self.mutate_comment(actor_user_id, id, Some(content), None, false).await
  }

  pub async fn resolve_comment(&self, actor_user_id: &str, id: &str, resolved: bool) -> Result<(), DomainError> {
    self
      .mutate_comment(actor_user_id, id, None, Some(resolved), false)
      .await
  }

  pub async fn delete_comment(&self, actor_user_id: &str, id: &str) -> Result<(), DomainError> {
    self.mutate_comment(actor_user_id, id, None, None, true).await
  }

  async fn mutate_comment(
    &self,
    actor_user_id: &str,
    id: &str,
    content: Option<Value>,
    resolved: Option<bool>,
    delete: bool,
  ) -> Result<(), DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin mutate_comment: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("mutate_comment clock: {e}")))?;

    let target = load_target_in(tx.tx_mut(), "comments", id, false).await?;
    assert_comment_mutation_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      actor_user_id,
      &target,
      delete,
      now,
    )
    .await?;
    let locked = lock_target_in(tx.tx_mut(), "comments", &target).await?;

    sqlx::query(
      r#"UPDATE comments SET
           content = COALESCE($2, content),
           resolved = COALESCE($3, resolved),
           deleted_at = CASE WHEN $4 THEN now() ELSE deleted_at END,
           updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL"#,
    )
    .bind(&locked.id)
    .bind(content.map(Json))
    .bind(resolved)
    .bind(delete)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("mutate comment: {e}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit mutate_comment: {e}")))?;

    self.publish_comment_changed(&locked.workspace_id, &locked.doc_id).await;
    Ok(())
  }

  pub async fn create_reply(
    &self,
    actor_user_id: &str,
    comment_id: &str,
    content: Value,
    notification: CommentNotificationContext,
  ) -> Result<ReplyRecord, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin create_reply: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("create_reply clock: {e}")))?;

    let comment = load_target_in(tx.tx_mut(), "comments", comment_id, false).await?;
    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      &comment.workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&comment.doc_id),
      now,
    )
    .await?;
    let allowed = access
      .docs
      .get(&comment.doc_id)
      .is_some_and(|e| e.permissions.doc_comments_create);
    if !allowed
      || DocSharingService::is_workspace_readonly_in(tx.tx_mut(), self.quota_gate.as_ref(), &comment.workspace_id, now)
        .await?
    {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{}:{}:Doc.Comments.Create",
        comment.workspace_id, comment.doc_id
      )));
    }
    let comment = lock_target_in(tx.tx_mut(), "comments", &comment).await?;

    let row = sqlx::query(
      r#"INSERT INTO replies (id, workspace_id, doc_id, comment_id, user_id, content)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)
         RETURNING sid, id, workspace_id, doc_id, comment_id, user_id, content, created_at, updated_at, deleted_at"#,
    )
    .bind(&comment.workspace_id)
    .bind(&comment.doc_id)
    .bind(&comment.id)
    .bind(actor_user_id)
    .bind(Json(content))
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert reply: {e}")))?;

    let reply_id: String = row.get("id");
    let notified_users = create_comment_notifications_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      actor_user_id,
      &comment,
      Some(&reply_id),
      notification,
      &self.base_url,
      &self.private_key,
      now,
    )
    .await?;
    let user = load_public_user_in(tx.tx_mut(), actor_user_id).await?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit create_reply: {e}")))?;

    self
      .publish_comment_changed(&comment.workspace_id, &comment.doc_id)
      .await;
    self.publish_notification_counts(&notified_users).await;

    Ok(ReplyRecord {
      sid: row.get("sid"),
      id: reply_id,
      workspace_id: row.get("workspace_id"),
      doc_id: row.get("doc_id"),
      comment_id: row.get("comment_id"),
      user_id: row.get("user_id"),
      content: row.get::<Json<Value>, _>("content").0,
      created_at: row.get("created_at"),
      updated_at: row.get("updated_at"),
      deleted_at: row.get("deleted_at"),
      user,
    })
  }

  pub async fn update_reply(&self, actor_user_id: &str, id: &str, content: Value) -> Result<(), DomainError> {
    self.mutate_reply(actor_user_id, id, Some(content), false).await
  }

  pub async fn delete_reply(&self, actor_user_id: &str, id: &str) -> Result<(), DomainError> {
    self.mutate_reply(actor_user_id, id, None, true).await
  }

  async fn mutate_reply(
    &self,
    actor_user_id: &str,
    id: &str,
    content: Option<Value>,
    delete: bool,
  ) -> Result<(), DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin mutate_reply: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("mutate_reply clock: {e}")))?;

    let target = load_target_in(tx.tx_mut(), "replies", id, false).await?;
    assert_comment_mutation_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      actor_user_id,
      &target,
      delete,
      now,
    )
    .await?;
    let locked = lock_target_in(tx.tx_mut(), "replies", &target).await?;

    sqlx::query(
      r#"UPDATE replies SET
           content = COALESCE($2, content),
           deleted_at = CASE WHEN $3 THEN now() ELSE deleted_at END,
           updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL"#,
    )
    .bind(&locked.id)
    .bind(content.map(Json))
    .bind(delete)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("mutate reply: {e}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit mutate_reply: {e}")))?;

    self.publish_comment_changed(&locked.workspace_id, &locked.doc_id).await;
    Ok(())
  }

  pub async fn list_comments(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    raw_doc_id: &str,
    after_sid: Option<i32>,
    take: i64,
  ) -> Result<(i64, Vec<CommentRecord>), DomainError> {
    let doc_id = self
      .doc_sharing
      .resolve_storage_doc_id(workspace_id, raw_doc_id)
      .await?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin list_comments: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("list_comments clock: {e}")))?;

    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    if !access
      .docs
      .get(&doc_id)
      .is_some_and(|e| e.permissions.doc_comments_read)
    {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Comments.Read"
      )));
    }

    let total_count: i64 = sqlx::query_scalar(
      "SELECT COUNT(*)::bigint FROM comments WHERE workspace_id = $1 AND doc_id = $2 AND deleted_at IS NULL",
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("count comments: {e}")))?;

    let comment_rows = if let Some(sid) = after_sid {
      sqlx::query(
        r#"SELECT sid, id, workspace_id, doc_id, user_id, content, resolved, created_at, updated_at, deleted_at
           FROM comments
           WHERE workspace_id = $1 AND doc_id = $2 AND deleted_at IS NULL AND sid < $3
           ORDER BY sid DESC
           LIMIT $4"#,
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .bind(sid)
      .bind(take.clamp(1, 1000))
      .fetch_all(&mut **tx.tx_mut())
      .await
    } else {
      sqlx::query(
        r#"SELECT sid, id, workspace_id, doc_id, user_id, content, resolved, created_at, updated_at, deleted_at
           FROM comments
           WHERE workspace_id = $1 AND doc_id = $2 AND deleted_at IS NULL
           ORDER BY sid DESC
           LIMIT $3"#,
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .bind(take.clamp(1, 1000))
      .fetch_all(&mut **tx.tx_mut())
      .await
    }
    .map_err(|e| DomainError::Internal(format!("list comments: {e}")))?;

    let comment_ids: Vec<String> = comment_rows.iter().map(|r| r.get("id")).collect();
    let reply_rows = if comment_ids.is_empty() {
      Vec::new()
    } else {
      sqlx::query(
        r#"SELECT sid, id, workspace_id, doc_id, comment_id, user_id, content, created_at, updated_at, deleted_at
           FROM replies
           WHERE comment_id = ANY($1) AND deleted_at IS NULL
           ORDER BY sid ASC"#,
      )
      .bind(&comment_ids)
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("list comment replies: {e}")))?
    };

    let mut user_ids: HashSet<String> = HashSet::new();
    for r in &comment_rows {
      user_ids.insert(r.get("user_id"));
    }
    for r in &reply_rows {
      user_ids.insert(r.get("user_id"));
    }
    let user_map = load_public_users_map_in(tx.tx_mut(), &user_ids.into_iter().collect::<Vec<_>>()).await?;
    let _ = tx.rollback().await;

    let mut replies_by_comment: HashMap<String, Vec<ReplyRecord>> = HashMap::new();
    for r in reply_rows {
      let uid: String = r.get("user_id");
      let user = user_map.get(&uid).cloned().unwrap_or_else(|| PublicUserView {
        id: uid.clone(),
        name: String::new(),
        avatar_url: None,
      });
      let cid: String = r.get("comment_id");
      replies_by_comment.entry(cid.clone()).or_default().push(ReplyRecord {
        sid: r.get("sid"),
        id: r.get("id"),
        workspace_id: r.get("workspace_id"),
        doc_id: r.get("doc_id"),
        comment_id: cid,
        user_id: uid,
        content: r.get::<Json<Value>, _>("content").0,
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
        deleted_at: r.get("deleted_at"),
        user,
      });
    }

    let comments = comment_rows
      .into_iter()
      .map(|r| {
        let uid: String = r.get("user_id");
        let user = user_map.get(&uid).cloned().unwrap_or_else(|| PublicUserView {
          id: uid.clone(),
          name: String::new(),
          avatar_url: None,
        });
        let id: String = r.get("id");
        let replies = replies_by_comment.remove(&id).unwrap_or_default();
        CommentRecord {
          sid: r.get("sid"),
          id,
          workspace_id: r.get("workspace_id"),
          doc_id: r.get("doc_id"),
          user_id: uid,
          content: r.get::<Json<Value>, _>("content").0,
          resolved: r.get("resolved"),
          created_at: r.get("created_at"),
          updated_at: r.get("updated_at"),
          deleted_at: r.get("deleted_at"),
          user,
          replies,
        }
      })
      .collect();

    Ok((total_count, comments))
  }

  pub async fn list_comment_changes(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    raw_doc_id: &str,
    comment_updated_at: Option<DateTime<Utc>>,
    reply_updated_at: Option<DateTime<Utc>>,
    take: i64,
  ) -> Result<Vec<CommentChangeRecord>, DomainError> {
    let doc_id = self
      .doc_sharing
      .resolve_storage_doc_id(workspace_id, raw_doc_id)
      .await?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin list_comment_changes: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("list_comment_changes clock: {e}")))?;

    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    if !access
      .docs
      .get(&doc_id)
      .is_some_and(|e| e.permissions.doc_comments_read)
    {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Comments.Read"
      )));
    }

    let limit = take.clamp(1, 10_000);
    let comment_rows = if let Some(ts) = comment_updated_at {
      sqlx::query(
        r#"SELECT sid, id, workspace_id, doc_id, user_id, content, resolved, created_at, updated_at, deleted_at
           FROM comments
           WHERE workspace_id = $1 AND doc_id = $2 AND updated_at > $3
           ORDER BY updated_at ASC
           LIMIT $4"#,
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .bind(ts)
      .bind(limit)
      .fetch_all(&mut **tx.tx_mut())
      .await
    } else {
      sqlx::query(
        r#"SELECT sid, id, workspace_id, doc_id, user_id, content, resolved, created_at, updated_at, deleted_at
           FROM comments
           WHERE workspace_id = $1 AND doc_id = $2
           ORDER BY updated_at ASC
           LIMIT $3"#,
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .bind(limit)
      .fetch_all(&mut **tx.tx_mut())
      .await
    }
    .map_err(|e| DomainError::Internal(format!("list comment changes: {e}")))?;

    let reply_rows = if let Some(ts) = reply_updated_at {
      sqlx::query(
        r#"SELECT sid, id, workspace_id, doc_id, comment_id, user_id, content, created_at, updated_at, deleted_at
           FROM replies
           WHERE workspace_id = $1 AND doc_id = $2 AND updated_at > $3
           ORDER BY updated_at ASC
           LIMIT $4"#,
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .bind(ts)
      .bind(limit)
      .fetch_all(&mut **tx.tx_mut())
      .await
    } else {
      sqlx::query(
        r#"SELECT sid, id, workspace_id, doc_id, comment_id, user_id, content, created_at, updated_at, deleted_at
           FROM replies
           WHERE workspace_id = $1 AND doc_id = $2
           ORDER BY updated_at ASC
           LIMIT $3"#,
      )
      .bind(workspace_id)
      .bind(&doc_id)
      .bind(limit)
      .fetch_all(&mut **tx.tx_mut())
      .await
    }
    .map_err(|e| DomainError::Internal(format!("list reply changes: {e}")))?;

    let mut user_ids: HashSet<String> = HashSet::new();
    for r in &comment_rows {
      user_ids.insert(r.get("user_id"));
    }
    for r in &reply_rows {
      user_ids.insert(r.get("user_id"));
    }
    let user_map = load_public_users_map_in(tx.tx_mut(), &user_ids.into_iter().collect::<Vec<_>>()).await?;
    let _ = tx.rollback().await;

    let mut changes = Vec::with_capacity(comment_rows.len() + reply_rows.len());
    for r in comment_rows {
      let id: String = r.get("id");
      let updated_at: DateTime<Utc> = r.get("updated_at");
      let deleted_at: Option<DateTime<Utc>> = r.get("deleted_at");
      if let Some(del) = deleted_at {
        changes.push(CommentChangeRecord {
          action: CommentChangeAction::Delete,
          id,
          comment_id: None,
          updated_at,
          item: json!({
            "deletedAt": del.to_rfc3339(),
            "updatedAt": updated_at.to_rfc3339(),
          }),
        });
      } else {
        let uid: String = r.get("user_id");
        let user = user_map.get(&uid);
        let created_at: DateTime<Utc> = r.get("created_at");
        changes.push(CommentChangeRecord {
          action: CommentChangeAction::Update,
          id: id.clone(),
          comment_id: None,
          updated_at,
          item: json!({
            "id": id,
            "content": r.get::<Json<Value>, _>("content").0,
            "resolved": r.get::<bool, _>("resolved"),
            "createdAt": created_at.to_rfc3339(),
            "updatedAt": updated_at.to_rfc3339(),
            "user": {
              "id": uid,
              "name": user.map(|u| u.name.as_str()).unwrap_or(""),
              "avatarUrl": user.and_then(|u| u.avatar_url.as_deref()),
            },
          }),
        });
      }
    }

    for r in reply_rows {
      let id: String = r.get("id");
      let comment_id: String = r.get("comment_id");
      let updated_at: DateTime<Utc> = r.get("updated_at");
      let deleted_at: Option<DateTime<Utc>> = r.get("deleted_at");
      if let Some(del) = deleted_at {
        changes.push(CommentChangeRecord {
          action: CommentChangeAction::Delete,
          id,
          comment_id: Some(comment_id),
          updated_at,
          item: json!({
            "deletedAt": del.to_rfc3339(),
            "updatedAt": updated_at.to_rfc3339(),
          }),
        });
      } else {
        let uid: String = r.get("user_id");
        let user = user_map.get(&uid);
        let created_at: DateTime<Utc> = r.get("created_at");
        changes.push(CommentChangeRecord {
          action: CommentChangeAction::Update,
          id: id.clone(),
          comment_id: Some(comment_id.clone()),
          updated_at,
          item: json!({
            "id": id,
            "commentId": comment_id,
            "content": r.get::<Json<Value>, _>("content").0,
            "createdAt": created_at.to_rfc3339(),
            "updatedAt": updated_at.to_rfc3339(),
            "user": {
              "id": uid,
              "name": user.map(|u| u.name.as_str()).unwrap_or(""),
              "avatarUrl": user.and_then(|u| u.avatar_url.as_deref()),
            },
          }),
        });
      }
    }

    Ok(changes)
  }

  /// Phase 1 of comment attachment upload: locks the workspace row, verifies
  /// `Doc.Comments.Create`, non-readonly state, 10 MiB per-file limit, and
  /// workspace `storage_quota_bytes` across `blobs` + `comment_attachments`,
  /// then inserts a `pending` reservation with a 5-minute TTL.
  pub async fn reserve_comment_attachment(
    &self,
    input: ReserveCommentAttachmentInput<'_>,
  ) -> Result<CommentAttachmentReservation, DomainError> {
    let ReserveCommentAttachmentInput {
      actor_user_id,
      workspace_id,
      raw_doc_id,
      key,
      filename,
      mime,
      size,
    } = input;
    if size > MAX_COMMENT_ATTACHMENT_BYTES {
      return Err(DomainError::QuotaExceeded {
        kind: "comment_attachment_quota_exceeded",
        message: "Comment attachment size exceeds 10 MB limit".to_owned(),
      });
    }
    let size_i64 = i64::try_from(size).map_err(|_| DomainError::Validation("attachment size overflow".to_owned()))?;
    let size_i32 =
      i32::try_from(size).map_err(|_| DomainError::Validation("attachment size exceeds database range".to_owned()))?;
    let doc_id = self
      .doc_sharing
      .resolve_storage_doc_id(workspace_id, raw_doc_id)
      .await?;

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin reserve_comment_attachment: {e}")))?;

    let ws_exists: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
      .bind(workspace_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock workspace for comment attachment: {e}")))?;
    if ws_exists.is_none() {
      return Err(DomainError::NotFound("workspace_not_found".to_owned()));
    }

    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("reserve_comment_attachment clock: {e}")))?;

    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    let allowed = access
      .docs
      .get(&doc_id)
      .is_some_and(|e| e.permissions.doc_comments_create);
    if !allowed
      || DocSharingService::is_workspace_readonly_in(tx.tx_mut(), self.quota_gate.as_ref(), workspace_id, now).await?
    {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Comments.Create"
      )));
    }

    let grant = self
      .quota_gate
      .resolve_workspace_grant(tx.tx_mut(), workspace_id, now)
      .await?;
    if grant.billing_subject == server_types::BillingSubject::Owner {
      let owner_id: Option<String> = sqlx::query_scalar(
        "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'owner' AND state = 'active' LIMIT 1",
      )
      .bind(workspace_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load owner for comment attachment quota lock: {e}")))?;
      if let Some(ref oid) = owner_id {
        let lock_key = format!("owner-storage-quota:{oid}");
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
          .bind(&lock_key)
          .execute(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("lock owner user for comment attachment quota: {e}")))?;
      }
    }
    let used = crate::workspaces::load_effective_storage_usage_in_tx(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      &grant,
      now,
    )
    .await?;
    if used
      .checked_add(size_i64)
      .is_none_or(|projected| projected > grant.limits.storage_quota_bytes)
    {
      return Err(DomainError::QuotaExceeded {
        kind: "storage_quota",
        message: format!(
          "workspace storage quota exceeded: {used} + {size_i64} > {}",
          grant.limits.storage_quota_bytes
        ),
      });
    }

    let reservation_id = uuid::Uuid::new_v4();
    sqlx::query(
      r#"INSERT INTO comment_attachments
           (workspace_id, doc_id, key, size, mime, name, status, reservation_id, reservation_expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, clock_timestamp() + make_interval(mins => $8), $9)"#,
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .bind(key)
    .bind(size_i32)
    .bind(mime)
    .bind(filename)
    .bind(reservation_id)
    .bind(COMMENT_ATTACHMENT_RESERVATION_MINUTES)
    .bind(actor_user_id)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("reserve comment_attachment: {e}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit reserve_comment_attachment: {e}")))?;
    Ok(CommentAttachmentReservation {
      storage_doc_id: doc_id,
      reservation_id: reservation_id.to_string(),
    })
  }

  /// Phase 3 (success): promotes a reserved `pending` comment attachment row
  /// to `completed` and emits `QuotaStorageUsage` invalidation.
  pub async fn finalize_comment_attachment(
    &self,
    workspace_id: &str,
    doc_id: &str,
    key: &str,
    reservation_id: &str,
  ) -> Result<(), DomainError> {
    let res_uuid = uuid::Uuid::parse_str(reservation_id)
      .map_err(|_| DomainError::Validation("invalid_reservation_id".to_owned()))?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin finalize_comment_attachment: {e}")))?;
    let updated = sqlx::query(
      r#"UPDATE comment_attachments
         SET status = 'completed', reservation_expires_at = NULL
         WHERE workspace_id = $1 AND doc_id = $2 AND key = $3
           AND reservation_id = $4 AND status = 'pending'"#,
    )
    .bind(workspace_id)
    .bind(doc_id)
    .bind(key)
    .bind(res_uuid)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("finalize comment_attachment: {e}")))?
    .rows_affected();
    if updated == 0 {
      return Err(DomainError::Conflict("comment_attachment_reservation_lost".to_owned()));
    }
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit finalize_comment_attachment: {e}")))?;

    let _ = self
      .invalidation
      .publish_invalidation(&InvalidationHintV1::QuotaStorageUsage {
        subject: format!("workspace:{workspace_id}"),
      })
      .await;
    Ok(())
  }

  /// Phase 3 (rollback): deletes the `pending` reservation row when object
  /// storage upload fails so billed bytes and completed count stay unchanged.
  pub async fn abort_comment_attachment(&self, workspace_id: &str, doc_id: &str, key: &str, reservation_id: &str) {
    let Ok(res_uuid) = uuid::Uuid::parse_str(reservation_id) else {
      return;
    };
    let Ok(mut conn) = self.db.acquire_tiered(WorkloadTier::InteractiveWrite).await else {
      return;
    };
    let _ = sqlx::query(
      r#"DELETE FROM comment_attachments
         WHERE workspace_id = $1 AND doc_id = $2 AND key = $3
           AND reservation_id = $4 AND status = 'pending'"#,
    )
    .bind(workspace_id)
    .bind(doc_id)
    .bind(key)
    .bind(res_uuid)
    .execute(&mut *conn)
    .await;
  }

  /// Authorizes `Doc.Read` and loads `comment_attachments` metadata.
  pub async fn get_comment_attachment_meta(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    raw_doc_id: &str,
    key: &str,
  ) -> Result<Option<CommentAttachmentRecord>, DomainError> {
    let doc_id = self
      .doc_sharing
      .resolve_storage_doc_id(workspace_id, raw_doc_id)
      .await?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Unavailable(format!("begin get_comment_attachment_meta: {e}")))?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("get_comment_attachment_meta clock: {e}")))?;

    let access = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      std::slice::from_ref(&doc_id),
      now,
    )
    .await?;
    if !access.docs.get(&doc_id).is_some_and(|e| e.permissions.doc_read) {
      return Err(DomainError::Forbidden(format!(
        "doc_action_denied:{workspace_id}:{doc_id}:Doc.Read"
      )));
    }

    let row = sqlx::query(
      r#"SELECT workspace_id, doc_id, key, size, mime, name, created_at
         FROM comment_attachments
         WHERE workspace_id = $1 AND doc_id = $2 AND key = $3
           AND status = 'completed' AND deleted_at IS NULL"#,
    )
    .bind(workspace_id)
    .bind(&doc_id)
    .bind(key)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load comment_attachment: {e}")))?;
    let _ = tx.rollback().await;

    Ok(row.map(|r| CommentAttachmentRecord {
      workspace_id: r.get("workspace_id"),
      doc_id: r.get("doc_id"),
      key: r.get("key"),
      size: r.get("size"),
      mime: r.get("mime"),
      name: r.get("name"),
      created_at: r.get("created_at"),
    }))
  }

  async fn publish_comment_changed(&self, workspace_id: &str, doc_id: &str) {
    let mut ids = HashSet::from([doc_id.to_owned()]);
    if let Ok(aliases) = self.doc_sharing.get_doc_id_aliases(workspace_id).await {
      for (logical, physical) in aliases {
        if physical == doc_id {
          ids.insert(logical);
        }
      }
    }
    for id in ids {
      let _ = self
        .event_bus
        .publish_event(
          "realtime.topic.changed",
          json!({
            "topic": "comment.changed",
            "room": format!("workspace:{workspace_id}:doc:{id}:comment"),
            "input": { "workspaceId": workspace_id, "docId": id },
            "event": { "changed": true },
          }),
          None,
        )
        .await;
    }
  }

  async fn publish_notification_counts(&self, user_ids: &[String]) {
    for uid in user_ids {
      crate::notifications::publish_notification_count_changed(&self.db, self.event_bus.as_ref(), uid, "created").await;
    }
  }
}

async fn load_target_in(
  tx: &mut Transaction<'_, Postgres>,
  table: &str,
  id: &str,
  lock: bool,
) -> Result<TargetRow, DomainError> {
  let query = match (table, lock) {
    ("comments", false) => {
      "SELECT id, workspace_id, doc_id, user_id FROM comments WHERE id = $1 AND deleted_at IS NULL"
    }
    ("comments", true) => {
      "SELECT id, workspace_id, doc_id, user_id FROM comments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE"
    }
    ("replies", false) => "SELECT id, workspace_id, doc_id, user_id FROM replies WHERE id = $1 AND deleted_at IS NULL",
    ("replies", true) => {
      "SELECT id, workspace_id, doc_id, user_id FROM replies WHERE id = $1 AND deleted_at IS NULL FOR UPDATE"
    }
    _ => unreachable!(),
  };
  let row = sqlx::query(query)
    .bind(id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load {table} target: {e}")))?
    .ok_or_else(|| {
      DomainError::NotFound(if table == "comments" {
        "comment_not_found".to_owned()
      } else {
        "reply_not_found".to_owned()
      })
    })?;
  Ok(TargetRow {
    id: row.get("id"),
    workspace_id: row.get("workspace_id"),
    doc_id: row.get("doc_id"),
    user_id: row.get("user_id"),
  })
}

async fn lock_target_in(
  tx: &mut Transaction<'_, Postgres>,
  table: &str,
  located: &TargetRow,
) -> Result<TargetRow, DomainError> {
  let locked = load_target_in(tx, table, &located.id, true).await?;
  if locked.workspace_id != located.workspace_id || locked.doc_id != located.doc_id || locked.user_id != located.user_id
  {
    return Err(DomainError::Conflict("comment_target_changed".to_owned()));
  }
  Ok(locked)
}

async fn assert_comment_mutation_in(
  tx: &mut Transaction<'_, Postgres>,
  quota_gate: &dyn QuotaGate,
  actor_user_id: &str,
  target: &TargetRow,
  delete: bool,
  now: DateTime<Utc>,
) -> Result<(), DomainError> {
  let access = load_workspace_docs_access_in(
    tx,
    quota_gate,
    &target.workspace_id,
    Some(actor_user_id),
    std::slice::from_ref(&target.doc_id),
    now,
  )
  .await?;
  let Some(entry) = access.docs.get(&target.doc_id) else {
    return Err(DomainError::Forbidden(format!(
      "doc_action_denied:{}:{}:Doc.Comments.Moderate",
      target.workspace_id, target.doc_id
    )));
  };
  let is_author = target.user_id == actor_user_id;
  let allowed = if is_author {
    entry.permissions.doc_comments_create || entry.permissions.doc_comments_moderate
  } else {
    entry.permissions.doc_comments_moderate
  };
  if !allowed {
    return Err(DomainError::Forbidden(format!(
      "doc_action_denied:{}:{}:Doc.Comments.Moderate",
      target.workspace_id, target.doc_id
    )));
  }
  // Readonly workspaces deny editing/resolving but allow deleting.
  if !delete && DocSharingService::is_workspace_readonly_in(tx, quota_gate, &target.workspace_id, now).await? {
    return Err(DomainError::Forbidden(format!(
      "doc_action_denied:{}:{}:Doc.Comments.Moderate",
      target.workspace_id, target.doc_id
    )));
  }
  Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn create_comment_notifications_in(
  tx: &mut Transaction<'_, Postgres>,
  quota_gate: &dyn QuotaGate,
  sender_user_id: &str,
  comment: &TargetRow,
  reply_id: Option<&str>,
  notification: CommentNotificationContext,
  base_url: &str,
  private_key: &str,
  now: DateTime<Utc>,
) -> Result<Vec<String>, DomainError> {
  let mention_user_ids: BTreeSet<String> = notification.mentions.into_iter().collect();
  let mut notify_user_ids: BTreeSet<String> = sqlx::query_scalar::<_, String>(
    "SELECT principal_id FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_type = 'user' AND role = 'owner'",
  )
  .bind(&comment.workspace_id)
  .bind(&comment.doc_id)
  .fetch_all(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load doc owners for comment notification: {e}")))?
  .into_iter()
  .collect();

  if reply_id.is_some() {
    notify_user_ids.insert(comment.user_id.clone());
    let repliers: Vec<String> =
      sqlx::query_scalar("SELECT DISTINCT user_id FROM replies WHERE comment_id = $1 AND deleted_at IS NULL")
        .bind(&comment.id)
        .fetch_all(&mut **tx)
        .await
        .map_err(|e| DomainError::Internal(format!("load repliers for comment notification: {e}")))?;
    notify_user_ids.extend(repliers);
  }
  notify_user_ids.extend(mention_user_ids.iter().cloned());
  notify_user_ids.remove(sender_user_id);

  let actor_email: String = if notify_user_ids.is_empty() {
    String::new()
  } else {
    sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
      .bind(sender_user_id)
      .fetch_optional(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("load comment actor email: {e}")))?
      .unwrap_or_default()
  };
  let base = base_url.trim_end_matches('/');
  let doc_url = format!(
    "{base}/workspace/{}/{}?commentId={}",
    comment.workspace_id, comment.doc_id, comment.id
  );

  let mut notified = Vec::new();
  for user_id in notify_user_ids {
    let access = load_workspace_docs_access_in(
      tx,
      quota_gate,
      &comment.workspace_id,
      Some(&user_id),
      std::slice::from_ref(&comment.doc_id),
      now,
    )
    .await?;
    if !access
      .docs
      .get(&comment.doc_id)
      .is_some_and(|e| e.permissions.doc_comments_read)
    {
      continue;
    }
    let is_mention = mention_user_ids.contains(&user_id);
    let notification_type = if is_mention { "CommentMention" } else { "Comment" };
    let body = json!({
      "workspaceId": comment.workspace_id,
      "createdByUserId": sender_user_id,
      "commentId": comment.id,
      "replyId": reply_id,
      "doc": {
        "id": comment.doc_id,
        "title": notification.doc_title,
        "mode": notification.doc_mode,
      },
    });
    let notif_id: String = sqlx::query_scalar(
      r#"INSERT INTO notifications (id, user_id, level, type, body)
         VALUES (gen_random_uuid()::text, $1, 'Default', $2::"NotificationType", $3)
         RETURNING id"#,
    )
    .bind(&user_id)
    .bind(notification_type)
    .bind(Json(body))
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("insert comment notification: {e}")))?;

    let (mail_class, pref_field) = if is_mention {
      ("comment_mention", "receiveMentionEmail")
    } else {
      ("comment", "receiveCommentEmail")
    };
    crate::notifications::enqueue_notification_mail_in_tx(
      tx,
      crate::notifications::EnqueueNotificationMail {
        private_key,
        mail_name: notification_type,
        mail_class,
        recipient_user_id: &user_id,
        actor_user_id: Some(sender_user_id),
        workspace_id: Some(&comment.workspace_id),
        notification_id: Some(&notif_id),
        pref_field: Some(pref_field),
        props: json!({
          "user": { "email": actor_email },
          "doc": { "title": notification.doc_title, "url": doc_url },
        }),
        skip_if_domain_in_workspace_name: None,
      },
    )
    .await?;

    notified.push(user_id);
  }
  Ok(notified)
}

async fn load_public_user_in(tx: &mut Transaction<'_, Postgres>, user_id: &str) -> Result<PublicUserView, DomainError> {
  let row = sqlx::query("SELECT id, name, avatar_url FROM users WHERE id = $1")
    .bind(user_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load public user: {e}")))?;
  Ok(match row {
    Some(r) => PublicUserView {
      id: r.get("id"),
      name: r.get("name"),
      avatar_url: r.get("avatar_url"),
    },
    None => PublicUserView {
      id: user_id.to_owned(),
      name: String::new(),
      avatar_url: None,
    },
  })
}

async fn load_public_users_map_in(
  tx: &mut Transaction<'_, Postgres>,
  user_ids: &[String],
) -> Result<HashMap<String, PublicUserView>, DomainError> {
  if user_ids.is_empty() {
    return Ok(HashMap::new());
  }
  let rows = sqlx::query("SELECT id, name, avatar_url FROM users WHERE id = ANY($1)")
    .bind(user_ids)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load public users map: {e}")))?;
  Ok(
    rows
      .into_iter()
      .map(|r| {
        let id: String = r.get("id");
        (
          id.clone(),
          PublicUserView {
            id,
            name: r.get("name"),
            avatar_url: r.get("avatar_url"),
          },
        )
      })
      .collect(),
  )
}
