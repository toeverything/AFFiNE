use std::collections::BTreeSet;

use affine_core::access_control::{DocAction, DomainCommand};
use serde_json::Value;
use sqlx::{Postgres, Row, Transaction, types::Json};

use super::{CommentNotification, authorize_domain};
use crate::runtime::{RuntimeError, RuntimeResult, backend_runtime::permission::PermissionAuthorizer};

pub(super) struct Target {
  pub(super) id: String,
  pub(super) workspace_id: String,
  pub(super) doc_id: String,
  pub(super) user_id: String,
}

pub(super) async fn create_comment(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
  doc_id: String,
  content: Value,
  notification: CommentNotification,
) -> RuntimeResult<Value> {
  let command = DomainCommand::CreateComment { doc_id: doc_id.clone() };
  authorize_domain(
    authorizer,
    transaction,
    &actor_user_id,
    &workspace_id,
    Some(&doc_id),
    &command,
  )
  .await?;
  let row = sqlx::query(
    r#"INSERT INTO comments (id, workspace_id, doc_id, user_id, content)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
       RETURNING jsonb_build_object(
         'sid', sid, 'id', id, 'workspaceId', workspace_id, 'docId', doc_id, 'userId', user_id,
         'content', content, 'resolved', resolved, 'createdAt', created_at, 'updatedAt', updated_at,
         'deletedAt', deleted_at
       ) AS value"#,
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(&actor_user_id)
  .bind(Json(content))
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("create comment", error))?;
  let mut value = value(row, "decode created comment")?;
  let comment_id = value
    .get("id")
    .and_then(Value::as_str)
    .ok_or_else(|| RuntimeError::invalid_state("created comment is missing id"))?;
  let target = Target {
    id: comment_id.to_string(),
    workspace_id,
    doc_id,
    user_id: actor_user_id.clone(),
  };
  let notification_ids =
    create_comment_notifications(authorizer, transaction, &actor_user_id, &target, None, notification).await?;
  value
    .as_object_mut()
    .expect("comment result is an object")
    .insert("notificationIds".into(), serde_json::json!(notification_ids));
  Ok(value)
}

pub(super) async fn create_comment_notifications(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  sender_user_id: &str,
  comment: &Target,
  reply_id: Option<&str>,
  notification: CommentNotification,
) -> RuntimeResult<Vec<String>> {
  let mention_user_ids = notification.mentions.into_iter().collect::<BTreeSet<_>>();
  let mut notify_user_ids = sqlx::query_scalar::<_, String>(
    "SELECT principal_id FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND principal_type='user' AND \
     role='owner'",
  )
  .bind(&comment.workspace_id)
  .bind(&comment.doc_id)
  .fetch_all(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load comment notification owners", error))?
  .into_iter()
  .collect::<BTreeSet<_>>();
  if reply_id.is_some() {
    notify_user_ids.insert(comment.user_id.clone());
    let repliers = sqlx::query_scalar::<_, String>(
      "SELECT DISTINCT user_id FROM replies WHERE comment_id=$1 AND deleted_at IS NULL",
    )
    .bind(&comment.id)
    .fetch_all(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("load comment notification repliers", error))?;
    notify_user_ids.extend(repliers);
  }

  notify_user_ids.extend(mention_user_ids.iter().cloned());
  notify_user_ids.remove(sender_user_id);
  let mut created = Vec::new();
  for user_id in notify_user_ids {
    if !authorizer
      .authorize_doc_action_in(
        transaction,
        &comment.workspace_id,
        Some(&user_id),
        &comment.doc_id,
        DocAction::CommentsRead,
      )
      .await?
      .allowed
    {
      continue;
    }
    let notification_type = if mention_user_ids.contains(&user_id) {
      "CommentMention"
    } else {
      "Comment"
    };
    let body = serde_json::json!({
      "workspaceId": comment.workspace_id,
      "createdByUserId": sender_user_id,
      "commentId": comment.id,
      "replyId": reply_id,
      "doc": { "id": comment.doc_id, "title": notification.doc_title, "mode": notification.doc_mode },
    });
    let id: String = sqlx::query_scalar(
      r#"INSERT INTO notifications(id,user_id,level,type,body)
         VALUES(gen_random_uuid()::text,$1,'Default',$2::"NotificationType",$3)
         RETURNING id"#,
    )
    .bind(user_id)
    .bind(notification_type)
    .bind(Json(body))
    .fetch_one(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("create comment notification", error))?;
    created.push(id);
  }
  Ok(created)
}

pub(super) async fn update_comment(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  id: String,
  content: Value,
) -> RuntimeResult<Value> {
  mutate_comment(authorizer, transaction, actor_user_id, id, Some(content), None, false).await
}

pub(super) async fn resolve_comment(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  id: String,
  resolved: bool,
) -> RuntimeResult<Value> {
  mutate_comment(authorizer, transaction, actor_user_id, id, None, Some(resolved), false).await
}

pub(super) async fn delete_comment(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  id: String,
) -> RuntimeResult<Value> {
  mutate_comment(authorizer, transaction, actor_user_id, id, None, None, true).await
}

async fn mutate_comment(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  id: String,
  content: Option<Value>,
  resolved: Option<bool>,
  delete: bool,
) -> RuntimeResult<Value> {
  let target = load_target(transaction, "comments", &id, false).await?;
  assert_mutation(authorizer, transaction, &actor_user_id, &target, delete).await?;
  let target = lock_target(transaction, "comments", &target).await?;
  let row = sqlx::query(
    r#"UPDATE comments SET
         content=coalesce($2, content), resolved=coalesce($3, resolved),
         deleted_at=CASE WHEN $4 THEN now() ELSE deleted_at END, updated_at=now()
       WHERE id=$1 AND deleted_at IS NULL
       RETURNING jsonb_build_object(
         'sid', sid, 'id', id, 'workspaceId', workspace_id, 'docId', doc_id, 'userId', user_id,
         'content', content, 'resolved', resolved, 'createdAt', created_at, 'updatedAt', updated_at,
         'deletedAt', deleted_at
       ) AS value"#,
  )
  .bind(&target.id)
  .bind(content.map(Json))
  .bind(resolved)
  .bind(delete)
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("mutate comment", error))?;
  value(row, "decode mutated comment")
}

pub(super) async fn load_target(
  transaction: &mut Transaction<'_, Postgres>,
  table: &str,
  id: &str,
  lock: bool,
) -> RuntimeResult<Target> {
  let query = match (table, lock) {
    ("comments", false) => "SELECT id, workspace_id, doc_id, user_id FROM comments WHERE id=$1 AND deleted_at IS NULL",
    ("comments", true) => {
      "SELECT id, workspace_id, doc_id, user_id FROM comments WHERE id=$1 AND deleted_at IS NULL FOR UPDATE"
    }
    ("replies", false) => "SELECT id, workspace_id, doc_id, user_id FROM replies WHERE id=$1 AND deleted_at IS NULL",
    ("replies", true) => {
      "SELECT id, workspace_id, doc_id, user_id FROM replies WHERE id=$1 AND deleted_at IS NULL FOR UPDATE"
    }
    _ => unreachable!(),
  };
  let row = sqlx::query(query)
    .bind(id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("load comment command target", error))?
    .ok_or_else(|| {
      let code = match table {
        "comments" => "comment_not_found",
        "replies" => "reply_not_found",
        _ => unreachable!(),
      };
      RuntimeError::invalid_input(code)
    })?;
  Ok(Target {
    id: row
      .try_get("id")
      .map_err(|error| RuntimeError::database("decode target id", error))?,
    workspace_id: row
      .try_get("workspace_id")
      .map_err(|error| RuntimeError::database("decode target workspace", error))?,
    doc_id: row
      .try_get("doc_id")
      .map_err(|error| RuntimeError::database("decode target doc", error))?,
    user_id: row
      .try_get("user_id")
      .map_err(|error| RuntimeError::database("decode target author", error))?,
  })
}

pub(super) async fn lock_target(
  transaction: &mut Transaction<'_, Postgres>,
  table: &str,
  located: &Target,
) -> RuntimeResult<Target> {
  let locked = load_target(transaction, table, &located.id, true).await?;
  if locked.workspace_id != located.workspace_id || locked.doc_id != located.doc_id || locked.user_id != located.user_id
  {
    return Err(RuntimeError::invalid_input("comment_target_changed"));
  }
  Ok(locked)
}

pub(super) async fn assert_mutation(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: &str,
  target: &Target,
  delete: bool,
) -> RuntimeResult<()> {
  let command = DomainCommand::MutateComment {
    doc_id: target.doc_id.clone(),
    authored_by_actor: target.user_id == actor_user_id,
    delete,
  };
  authorize_domain(
    authorizer,
    transaction,
    actor_user_id,
    &target.workspace_id,
    Some(&target.doc_id),
    &command,
  )
  .await
  .map(|_| ())
}

pub(super) fn value(row: sqlx::postgres::PgRow, context: &'static str) -> RuntimeResult<Value> {
  row
    .try_get("value")
    .map_err(|error| RuntimeError::database(context, error))
}

#[cfg(test)]
mod tests {
  use super::{
    super::replies::{create_reply, delete_reply, update_reply},
    *,
  };
  use crate::runtime::Deployment;

  #[tokio::test]
  async fn author_and_moderation_use_current_doc_capability() {
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let Some((pool, workspace_id, owner_id)) = super::super::test_support::owner_workspace().await else {
      return;
    };
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let member_id = format!("domain-commenter-{suffix}");
    let doc_id = format!("domain-comment-doc-{suffix}");
    sqlx::query(
      "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Domain \
       Commenter',$2,true,now(),false)",
    )
    .bind(&member_id)
    .bind(format!("domain-commenter-{suffix}@example.com"))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role,state) VALUES($1,$2,'member','active')")
      .bind(&workspace_id)
      .bind(&member_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("UPDATE workspace_access_policies SET member_default_doc_role='commenter' WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);
    let mut transaction = pool.begin().await.unwrap();
    let comment = create_comment(
      &authorizer,
      &mut transaction,
      owner_id.clone(),
      workspace_id.clone(),
      doc_id.clone(),
      serde_json::json!({"text":"owner"}),
      CommentNotification {
        doc_title: "Document".into(),
        doc_mode: "page".into(),
        mentions: Vec::new(),
      },
    )
    .await
    .unwrap();
    transaction.commit().await.unwrap();
    let mut transaction = pool.begin().await.unwrap();
    let denied = update_comment(
      &authorizer,
      &mut transaction,
      member_id.clone(),
      comment["id"].as_str().unwrap().to_string(),
      serde_json::json!({"text":"denied"}),
    )
    .await;
    assert!(denied.is_err());
    transaction.rollback().await.unwrap();

    let mut transaction = pool.begin().await.unwrap();
    let own = create_comment(
      &authorizer,
      &mut transaction,
      member_id.clone(),
      workspace_id.clone(),
      doc_id.clone(),
      serde_json::json!({"text":"mine"}),
      CommentNotification {
        doc_title: "Document".into(),
        doc_mode: "page".into(),
        mentions: Vec::new(),
      },
    )
    .await
    .unwrap();
    update_comment(
      &authorizer,
      &mut transaction,
      member_id.clone(),
      own["id"].as_str().unwrap().to_string(),
      serde_json::json!({"text":"allowed"}),
    )
    .await
    .unwrap();
    let reply = create_reply(
      &authorizer,
      &mut transaction,
      member_id.clone(),
      own["id"].as_str().unwrap().to_string(),
      serde_json::json!({"text":"reply"}),
      CommentNotification {
        doc_title: "Document".into(),
        doc_mode: "page".into(),
        mentions: Vec::new(),
      },
    )
    .await
    .unwrap();
    transaction.commit().await.unwrap();
    let own_id = own["id"].as_str().unwrap();
    let reply_id = reply["id"].as_str().unwrap();
    let persisted_comment: serde_json::Value =
      sqlx::query_scalar("SELECT content FROM comments WHERE id=$1 AND deleted_at IS NULL")
        .bind(own_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    let persisted_reply: serde_json::Value =
      sqlx::query_scalar("SELECT content FROM replies WHERE id=$1 AND deleted_at IS NULL")
        .bind(reply_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(persisted_comment, serde_json::json!({"text":"allowed"}));
    assert_eq!(persisted_reply, serde_json::json!({"text":"reply"}));

    for resolved in [true, false] {
      let mut transaction = pool.begin().await.unwrap();
      let result = resolve_comment(
        &authorizer,
        &mut transaction,
        member_id.clone(),
        own_id.to_string(),
        resolved,
      )
      .await
      .unwrap();
      transaction.commit().await.unwrap();
      assert_eq!(result["resolved"], resolved);
    }

    for index in 0..2 {
      let overflow_id = format!("domain-comment-overflow-{index}-{suffix}");
      sqlx::query(
        "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Overflow',$2,true,now(),false)",
      )
      .bind(&overflow_id)
      .bind(format!("{overflow_id}@example.com"))
      .execute(&pool)
      .await
      .unwrap();
      sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role,state) VALUES($1,$2,'member','active')")
        .bind(&workspace_id)
        .bind(&overflow_id)
        .execute(&pool)
        .await
        .unwrap();
    }

    let mut transaction = pool.begin().await.unwrap();
    assert!(
      create_comment(
        &authorizer,
        &mut transaction,
        owner_id.clone(),
        workspace_id.clone(),
        doc_id.clone(),
        serde_json::json!({"text":"readonly"}),
        CommentNotification {
          doc_title: "Document".into(),
          doc_mode: "page".into(),
          mentions: Vec::new()
        },
      )
      .await
      .is_err()
    );
    transaction.rollback().await.unwrap();

    for (id, reply_item) in [
      (own["id"].as_str().unwrap().to_string(), false),
      (reply["id"].as_str().unwrap().to_string(), true),
    ] {
      let mut transaction = pool.begin().await.unwrap();
      let denied = if reply_item {
        update_reply(
          &authorizer,
          &mut transaction,
          member_id.clone(),
          id.clone(),
          serde_json::json!({"text":"readonly"}),
        )
        .await
      } else {
        update_comment(
          &authorizer,
          &mut transaction,
          member_id.clone(),
          id.clone(),
          serde_json::json!({"text":"readonly"}),
        )
        .await
      };
      assert!(denied.is_err());
      transaction.rollback().await.unwrap();

      let mut transaction = pool.begin().await.unwrap();
      let moderated = if reply_item {
        update_reply(
          &authorizer,
          &mut transaction,
          owner_id.clone(),
          id.clone(),
          serde_json::json!({"text":"moderated"}),
        )
        .await
      } else {
        let updated = update_comment(
          &authorizer,
          &mut transaction,
          owner_id.clone(),
          id.clone(),
          serde_json::json!({"text":"moderated"}),
        )
        .await;
        assert!(
          resolve_comment(&authorizer, &mut transaction, owner_id.clone(), id.clone(), true,)
            .await
            .is_err()
        );
        updated
      };
      assert!(moderated.is_err());
      transaction.rollback().await.unwrap();

      let mut transaction = pool.begin().await.unwrap();
      if reply_item {
        delete_reply(&authorizer, &mut transaction, owner_id.clone(), id)
          .await
          .unwrap();
      } else {
        delete_comment(&authorizer, &mut transaction, owner_id.clone(), id)
          .await
          .unwrap();
      }
      transaction.commit().await.unwrap();
    }
    assert!(
      sqlx::query_scalar::<_, bool>("SELECT deleted_at IS NOT NULL FROM comments WHERE id=$1")
        .bind(own_id)
        .fetch_one(&pool)
        .await
        .unwrap()
    );
    assert!(
      sqlx::query_scalar::<_, bool>("SELECT deleted_at IS NOT NULL FROM replies WHERE id=$1")
        .bind(reply_id)
        .fetch_one(&pool)
        .await
        .unwrap()
    );

    let mut transaction = pool.begin().await.unwrap();
    assert!(
      create_reply(
        &authorizer,
        &mut transaction,
        member_id,
        comment["id"].as_str().unwrap().to_string(),
        serde_json::json!({"text":"readonly"}),
        CommentNotification {
          doc_title: "Document".into(),
          doc_mode: "page".into(),
          mentions: Vec::new()
        },
      )
      .await
      .is_err()
    );
    transaction.rollback().await.unwrap();
  }
}
