use affine_core::access_control::DomainCommand;
use serde_json::Value;
use sqlx::{Postgres, Transaction, types::Json};

use super::{
  CommentNotification, authorize_domain, comments::create_comment_notifications, load_target, lock_target, value,
};
use crate::runtime::{RuntimeError, RuntimeResult, backend_runtime::permission::PermissionAuthorizer};

pub(super) async fn create_reply(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  comment_id: String,
  content: Value,
  notification: CommentNotification,
) -> RuntimeResult<Value> {
  let comment = load_target(transaction, "comments", &comment_id, false).await?;
  let command = DomainCommand::CreateReply {
    doc_id: comment.doc_id.clone(),
  };
  authorize_domain(
    authorizer,
    transaction,
    &actor_user_id,
    &comment.workspace_id,
    Some(&comment.doc_id),
    &command,
  )
  .await?;
  let comment = lock_target(transaction, "comments", &comment).await?;
  let row = sqlx::query(
    r#"INSERT INTO replies (id, workspace_id, doc_id, comment_id, user_id, content)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)
       RETURNING jsonb_build_object(
         'sid', sid, 'id', id, 'workspaceId', workspace_id, 'docId', doc_id, 'commentId', comment_id,
         'userId', user_id, 'content', content, 'createdAt', created_at, 'updatedAt', updated_at,
         'deletedAt', deleted_at
       ) AS value"#,
  )
  .bind(&comment.workspace_id)
  .bind(&comment.doc_id)
  .bind(&comment.id)
  .bind(&actor_user_id)
  .bind(Json(content))
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("create reply", error))?;
  let mut value = value(row, "decode created reply")?;
  let reply_id = value
    .get("id")
    .and_then(Value::as_str)
    .ok_or_else(|| RuntimeError::invalid_state("created reply is missing id"))?;
  let notification_ids = create_comment_notifications(
    authorizer,
    transaction,
    &actor_user_id,
    &comment,
    Some(reply_id),
    notification,
  )
  .await?;
  value
    .as_object_mut()
    .expect("reply result is an object")
    .insert("notificationIds".into(), serde_json::json!(notification_ids));
  Ok(value)
}

pub(super) async fn update_reply(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  id: String,
  content: Value,
) -> RuntimeResult<Value> {
  mutate_reply(authorizer, transaction, actor_user_id, id, Some(content), false).await
}

pub(super) async fn delete_reply(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  id: String,
) -> RuntimeResult<Value> {
  mutate_reply(authorizer, transaction, actor_user_id, id, None, true).await
}

async fn mutate_reply(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  id: String,
  content: Option<Value>,
  delete: bool,
) -> RuntimeResult<Value> {
  let target = load_target(transaction, "replies", &id, false).await?;
  let command = DomainCommand::MutateReply {
    doc_id: target.doc_id.clone(),
    authored_by_actor: target.user_id == actor_user_id,
    delete,
  };
  authorize_domain(
    authorizer,
    transaction,
    &actor_user_id,
    &target.workspace_id,
    Some(&target.doc_id),
    &command,
  )
  .await?;
  let target = lock_target(transaction, "replies", &target).await?;
  let row = sqlx::query(
    r#"UPDATE replies SET content=coalesce($2, content),
         deleted_at=CASE WHEN $3 THEN now() ELSE deleted_at END, updated_at=now()
       WHERE id=$1 AND deleted_at IS NULL
       RETURNING jsonb_build_object(
         'sid', sid, 'id', id, 'workspaceId', workspace_id, 'docId', doc_id, 'commentId', comment_id,
         'userId', user_id, 'content', content, 'createdAt', created_at, 'updatedAt', updated_at,
         'deletedAt', deleted_at
       ) AS value"#,
  )
  .bind(&target.id)
  .bind(content.map(Json))
  .bind(delete)
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("mutate reply", error))?;
  value(row, "decode mutated reply")
}
