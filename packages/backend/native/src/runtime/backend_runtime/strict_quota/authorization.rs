use affine_core::access_control::{DocAction, StorageAuthorizationFacts, StorageResource, WorkspaceAction};
use chrono::{DateTime, Utc};
use sqlx::{Postgres, Transaction};

use super::{
  ChargeSubject, PermissionAuthorizer, RuntimeError, RuntimeResult, load_decision_time, resolve_quota_charge,
};
use crate::runtime::Deployment;

async fn storage_authorization_in(
  tx: &mut Transaction<'_, Postgres>,
  authorizer: &PermissionAuthorizer,
  workspace_id: &str,
  actor_user_id: &str,
  resource: StorageResource,
  doc_id: Option<&str>,
) -> RuntimeResult<StorageAuthorizationFacts> {
  match resource {
    StorageResource::Blob => Ok(StorageAuthorizationFacts {
      workspace_upload: authorizer
        .authorize_workspace_action_in(tx, workspace_id, Some(actor_user_id), WorkspaceAction::BlobsUpload)
        .await?
        .allowed,
      doc_read: false,
      doc_comment_create: false,
    }),
    StorageResource::CommentAttachment => {
      let doc_id =
        doc_id.ok_or_else(|| RuntimeError::invalid_input("comment attachment reservation requires docId"))?;
      let decisions = authorizer
        .authorize_doc_actions_in(
          tx,
          workspace_id,
          Some(actor_user_id),
          doc_id,
          &[DocAction::Read, DocAction::CommentsCreate],
        )
        .await?;
      Ok(StorageAuthorizationFacts {
        workspace_upload: false,
        doc_read: decisions
          .iter()
          .find(|(action, _)| *action == DocAction::Read)
          .is_some_and(|(_, decision)| decision.allowed),
        doc_comment_create: decisions
          .iter()
          .find(|(action, _)| *action == DocAction::CommentsCreate)
          .is_some_and(|(_, decision)| decision.allowed),
      })
    }
  }
}

pub(super) async fn lock_subject(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  actor_user_id: &str,
  resource: StorageResource,
  doc_id: Option<&str>,
  deployment: Deployment,
  authorizer: &PermissionAuthorizer,
) -> RuntimeResult<(ChargeSubject, DateTime<Utc>, StorageAuthorizationFacts)> {
  let owner_id: String = sqlx::query_scalar(
    "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
  )
  .bind(workspace_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("load workspace quota owner", error))?
  .ok_or_else(|| RuntimeError::invalid_input("workspace owner not found"))?;
  sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
    .bind(&owner_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock quota owner", error))?;
  sqlx::query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE")
    .bind(workspace_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock quota workspace", error))?;
  let locked_owner_id: String = sqlx::query_scalar(
    "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
  )
  .bind(workspace_id)
  .fetch_one(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("verify storage quota owner", error))?;
  if locked_owner_id != owner_id {
    return Err(RuntimeError::invalid_input("storage_quota_subject_changed"));
  }
  let authorization = storage_authorization_in(tx, authorizer, workspace_id, actor_user_id, resource, doc_id).await?;
  let now = load_decision_time(tx, "load strict storage decision clock").await?;
  let subject = resolve_quota_charge(tx, deployment, workspace_id, owner_id, now).await?;
  Ok((subject, now, authorization))
}
