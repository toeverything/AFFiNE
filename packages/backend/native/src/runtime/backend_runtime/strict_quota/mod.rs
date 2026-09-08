use super::StorageOperation;
mod cleanup;
mod management;
mod mutation;
mod promotion;
mod reservation_finalize;
mod reservation_mutation;
mod seat;
mod storage;

use affine_core::{access_control::QuotaSubject, invalidation::SubjectId};
pub(super) use mutation::load_command_quota_in;
pub(super) use reservation_finalize::finalize_reservation;
use sqlx::{Postgres, Transaction};

use super::{
  BackendRuntime, ChargeSubject, RuntimeError, RuntimeResult, invalidation::InvalidationHintV1, load_decision_time,
  resolve_quota_charge, resolve_workspace_entitlement,
};

pub(super) fn chargeable_invitation_statuses() -> [&'static str; 3] {
  affine_core::access_control::InvitationStatus::CHARGEABLE.map(affine_core::access_control::InvitationStatus::as_str)
}

async fn publish_hint(runtime: &BackendRuntime, hint: InvalidationHintV1) {
  runtime.publish_invalidation(hint).await;
}

pub(super) async fn invalidate_seat_usage(runtime: &BackendRuntime, workspace_id: &str) {
  publish_hint(
    runtime,
    InvalidationHintV1::QuotaSeatUsage {
      workspace_id: workspace_id.to_string(),
    },
  )
  .await;
}

pub(super) async fn invalidate_storage_usage(runtime: &BackendRuntime, workspace_id: &str, owner_id: Option<&str>) {
  let mut subjects = vec![SubjectId::Workspace(workspace_id.to_string())];
  if let Some(owner_id) = owner_id {
    subjects.push(SubjectId::User(owner_id.to_string()));
  }
  for subject in subjects {
    publish_hint(runtime, InvalidationHintV1::QuotaStorageUsage { subject }).await;
  }
}

pub(super) async fn storage_usage(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  subject: &ChargeSubject,
  deployment: crate::runtime::Deployment,
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<i64> {
  let workspaces = if subject.subject == QuotaSubject::Workspace {
    vec![workspace_id.to_string()]
  } else {
    let owned: Vec<String> = sqlx::query_scalar(
      "SELECT workspace_id FROM workspace_members WHERE user_id=$1 AND role='owner' AND state='active' ORDER BY \
       workspace_id",
    )
    .bind(&subject.owner_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| RuntimeError::database("load owner charge workspaces", e))?;
    let mut charged = Vec::new();
    for id in owned {
      let grant = resolve_workspace_entitlement(tx, deployment, &id, now).await?;
      if affine_core::access_control::resolve_quota_subject(&grant, &subject.grant).subject == QuotaSubject::Owner {
        charged.push(id);
      }
    }
    charged
  };
  sqlx::query_scalar(
    r#"SELECT
      COALESCE((SELECT SUM(size)::bigint FROM blobs WHERE workspace_id=ANY($1) AND deleted_at IS NULL
        AND (status='completed' OR (status='pending' AND reservation_expires_at > $2))),0)
      + COALESCE((SELECT SUM(size)::bigint FROM comment_attachments WHERE workspace_id=ANY($1) AND deleted_at IS NULL
        AND (status='completed' OR (status='pending' AND reservation_expires_at > $2))),0)"#,
  )
  .bind(workspaces)
  .bind(now)
  .fetch_one(&mut **tx)
  .await
  .map_err(|e| RuntimeError::database("load strict storage usage", e))
}
