mod comments;
mod execute;
mod history;
mod lifecycle;
mod members;
mod publish;
mod replies;
mod roles;

use affine_core::access_control::{CommandAuthorizationDecision, DomainCommand};
use chrono::{DateTime, Utc};
use comments::{load_target, lock_target, value};
pub(super) use execute::execute;
pub(super) use lifecycle::workspace_root_contains_active_doc;
use serde::Deserialize;
use serde_json::Value;
use sqlx::{Postgres, Transaction};

use super::{InvalidationHintV1, SourceIdentity, load_command_quota_in, permission::PermissionAuthorizer};
use crate::runtime::{RuntimeError, RuntimeResult};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CommentNotification {
  doc_title: String,
  doc_mode: String,
  #[serde(default)]
  mentions: Vec<String>,
}

#[derive(Deserialize)]
#[serde(tag = "command", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub(super) enum DomainCommandInputV1 {
  CreateComment {
    actor_user_id: String,
    workspace_id: String,
    doc_id: String,
    content: Value,
    #[serde(flatten)]
    notification: CommentNotification,
  },
  UpdateComment {
    actor_user_id: String,
    id: String,
    content: Value,
  },
  ResolveComment {
    actor_user_id: String,
    id: String,
    resolved: bool,
  },
  DeleteComment {
    actor_user_id: String,
    id: String,
  },
  CreateReply {
    actor_user_id: String,
    comment_id: String,
    content: Value,
    #[serde(flatten)]
    notification: CommentNotification,
  },
  UpdateReply {
    actor_user_id: String,
    id: String,
    content: Value,
  },
  DeleteReply {
    actor_user_id: String,
    id: String,
  },
  PublishDoc {
    actor_user_id: String,
    workspace_id: String,
    doc_id: String,
    mode: i16,
  },
  UnpublishDoc {
    actor_user_id: String,
    workspace_id: String,
    doc_id: String,
  },
  ApplyDocLifecycle {
    actor_user_id: String,
    workspace_id: String,
    doc_id: String,
    lifecycle: DocLifecycle,
  },
  AppendRootUpdate {
    actor_user_id: String,
    workspace_id: String,
    update: String,
    assert_permission: bool,
    expected_permission_generation: Option<i64>,
  },
  RecoverDoc {
    actor_user_id: String,
    workspace_id: String,
    doc_id: String,
    timestamp: chrono::DateTime<chrono::Utc>,
  },
  TransitionWorkspaceRole {
    actor_user_id: String,
    workspace_id: String,
    target_user_id: String,
    new_role: String,
  },
  TransitionDocRole {
    actor_user_id: String,
    workspace_id: String,
    doc_id: String,
    target_user_id: String,
    new_role: Option<String>,
  },
  GrantDocRoles {
    actor_user_id: String,
    workspace_id: String,
    doc_id: String,
    target_user_ids: Vec<String>,
    new_role: String,
  },
  SetDocDefaultRole {
    actor_user_id: String,
    workspace_id: String,
    doc_id: String,
    new_role: String,
  },
  RevokeWorkspaceMember {
    actor_user_id: String,
    workspace_id: String,
    target_user_id: String,
  },
  LeaveWorkspace {
    actor_user_id: String,
    workspace_id: String,
  },
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum DocLifecycle {
  Trash,
  Restore,
  Delete,
}

pub(super) async fn authorize_domain(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: &str,
  workspace_id: &str,
  doc_id: Option<&str>,
  command: &DomainCommand,
) -> RuntimeResult<CommandAuthorizationDecision> {
  lock_workspace(transaction, workspace_id).await?;
  let quota = if command.effect().requires_quota_guard() {
    load_command_quota_in(transaction, authorizer.deployment, workspace_id).await?
  } else {
    None
  };
  lock_permission_facts(transaction, actor_user_id, workspace_id, doc_id).await?;
  authorizer
    .authorize_command_in(
      transaction,
      actor_user_id,
      workspace_id,
      doc_id,
      command,
      quota.as_ref().map(|quota| quota.facts()),
    )
    .await
}

pub(super) async fn lock_workspace(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
) -> RuntimeResult<()> {
  lock_workspace_storage_shared(transaction, workspace_id).await?;
  let key = format!("domain:workspace:{workspace_id}");
  loop {
    let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))")
      .bind(&key)
      .fetch_one(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database("lock domain workspace", error))?;
    if locked {
      return Ok(());
    }
    tokio::time::sleep(std::time::Duration::from_millis(25)).await;
  }
}

pub(super) async fn lock_workspace_storage_shared(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
) -> RuntimeResult<()> {
  super::super::lock_workspace_storage_shared_transaction(transaction, workspace_id).await
}

pub(super) async fn invalidate_doc_blob_projection(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  embedding_schema_ready: bool,
) -> RuntimeResult<()> {
  sqlx::query(
    "UPDATE doc_blob_ref_projections SET status='pending', indexed_at=NULL, error_code=NULL, error_summary=NULL, \
     updated_at=clock_timestamp() WHERE workspace_id=$1 AND doc_id=$2",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .execute(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("invalidate document blob projection", error))?;
  if embedding_schema_ready {
    sqlx::query(
      "UPDATE embedding_sources SET deleted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=$1 \
       AND source_kind='document' AND source_key=$2",
    )
    .bind(workspace_id)
    .bind(doc_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("invalidate document embedding source", error))?;
  }
  if workspace_id == doc_id {
    sqlx::query("UPDATE workspaces SET last_check_embeddings='1970-01-01T00:00:00Z' WHERE id=$1")
      .bind(workspace_id)
      .execute(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database("invalidate workspace embedding reconciliation", error))?;
  }
  Ok(())
}

pub(super) async fn lock_workspace_doc_update(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<()> {
  let key = format!("workspace-doc-update:{workspace_id}/{doc_id}");
  loop {
    let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0))")
      .bind(&key)
      .fetch_one(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database("lock workspace document update", error))?;
    if locked {
      return Ok(());
    }
    tokio::time::sleep(std::time::Duration::from_millis(25)).await;
  }
}

pub(super) async fn next_workspace_doc_update_timestamp(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<DateTime<Utc>> {
  sqlx::query_scalar(
    "SELECT GREATEST(date_trunc('milliseconds',clock_timestamp()),COALESCE(max(created_at)+interval '1 \
     millisecond','epoch')) FROM updates WHERE workspace_id=$1 AND guid=$2",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load workspace document update clock", error))
}

async fn lock_permission_facts(
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: &str,
  workspace_id: &str,
  doc_id: Option<&str>,
) -> RuntimeResult<()> {
  sqlx::query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE")
    .bind(workspace_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("lock permission workspace", error))?;
  sqlx::query("SELECT workspace_id FROM workspace_access_policies WHERE workspace_id=$1 FOR UPDATE")
    .bind(workspace_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("lock workspace access policy", error))?;
  sqlx::query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE")
    .bind(workspace_id)
    .bind(actor_user_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("lock actor workspace membership", error))?;
  if let Some(doc_id) = doc_id {
    sqlx::query("SELECT doc_id FROM doc_access_policies WHERE workspace_id=$1 AND doc_id=$2 FOR UPDATE")
      .bind(workspace_id)
      .bind(doc_id)
      .execute(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database("lock doc access policy", error))?;
    sqlx::query(
      "SELECT principal_id FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND principal_type='user' AND \
       principal_id=$3 FOR UPDATE",
    )
    .bind(workspace_id)
    .bind(doc_id)
    .bind(actor_user_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("lock actor doc grant", error))?;
  }
  Ok(())
}

#[cfg(test)]
mod test_support {
  use sqlx::PgPool;

  pub(super) async fn owner_workspace() -> Option<(PgPool, String, String)> {
    let pool = PgPool::connect(&std::env::var("DATABASE_URL").ok()?).await.unwrap();
    assert!(
      crate::runtime::migrations::migrate_embedding_tables(&pool)
        .await
        .enabled
    );
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let user_id = format!("domain-owner-{suffix}");
    let workspace_id = format!("domain-workspace-{suffix}");
    sqlx::query(
      "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Domain \
       Owner',$2,true,now(),false)",
    )
    .bind(&user_id)
    .bind(format!("domain-owner-{suffix}@example.com"))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspace_access_policies(workspace_id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role,state) VALUES($1,$2,'owner','active')")
      .bind(&workspace_id)
      .bind(&user_id)
      .execute(&pool)
      .await
      .unwrap();
    Some((pool, workspace_id, user_id))
  }
}

#[cfg(test)]
mod tests {
  use affine_core::access_control::DomainCommand;
  use sqlx::Executor;

  use super::*;
  use crate::runtime::{Deployment, backend_runtime::permission::PermissionAuthorizer};

  #[tokio::test]
  async fn quota_commands_wait_for_the_workspace_prefix_before_row_locks() {
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let Some((pool, workspace_id, actor_user_id)) = test_support::owner_workspace().await else {
      return;
    };
    let mut holder = pool.begin().await.unwrap();
    lock_workspace(&mut holder, &workspace_id).await.unwrap();

    let command = {
      let pool = pool.clone();
      let workspace_id = workspace_id.clone();
      tokio::spawn(async move {
        let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);
        let mut transaction = pool.begin().await.unwrap();
        let result = authorize_domain(
          &authorizer,
          &mut transaction,
          &actor_user_id,
          &workspace_id,
          None,
          &DomainCommand::CreateDoc,
        )
        .await;
        transaction.rollback().await.unwrap();
        result
      })
    };
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    assert!(!command.is_finished());

    let mut probe = pool.begin().await.unwrap();
    probe.execute("SET LOCAL lock_timeout='100ms'").await.unwrap();
    sqlx::query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE")
      .bind(&workspace_id)
      .execute(&mut *probe)
      .await
      .unwrap();
    probe.rollback().await.unwrap();
    holder.commit().await.unwrap();
    assert!(command.await.unwrap().is_ok());
  }
}
