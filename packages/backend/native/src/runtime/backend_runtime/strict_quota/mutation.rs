use affine_core::access_control::{AccessGrant, CommandQuotaFacts, QuotaUsage};
use sqlx::{Postgres, Transaction};

use super::{
  super::{RuntimeError, RuntimeResult},
  chargeable_invitation_statuses, load_decision_time, resolve_quota_charge, storage_usage,
};
use crate::runtime::Deployment;

pub(in crate::runtime::backend_runtime) struct CommandQuotaSnapshot {
  grant: AccessGrant,
  usage: QuotaUsage,
}

impl CommandQuotaSnapshot {
  pub(in crate::runtime::backend_runtime) fn facts(&self) -> CommandQuotaFacts<'_> {
    CommandQuotaFacts {
      grant: &self.grant,
      usage: self.usage,
    }
  }
}

pub(in crate::runtime::backend_runtime) async fn load_command_quota_in(
  tx: &mut Transaction<'_, Postgres>,
  deployment: Deployment,
  workspace_id: &str,
) -> RuntimeResult<Option<CommandQuotaSnapshot>> {
  let Some(owner_id) = sqlx::query_scalar::<_, String>(
    "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
  )
  .bind(workspace_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("locate command quota owner", error))?
  else {
    return Ok(None);
  };
  sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
    .bind(&owner_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock command quota owner", error))?;
  let workspace_exists = sqlx::query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE")
    .bind(workspace_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock command quota workspace", error))?
    .is_some();
  if !workspace_exists {
    return Ok(None);
  }
  let locked_owner_id: String = sqlx::query_scalar(
    "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
  )
  .bind(workspace_id)
  .fetch_one(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("verify mutation quota owner", error))?;
  if locked_owner_id != owner_id {
    return Err(RuntimeError::invalid_input("command_quota_subject_changed"));
  }
  let now = load_decision_time(tx, "load command quota decision clock").await?;
  let subject = resolve_quota_charge(tx, deployment, workspace_id, owner_id, now).await?;
  let used_storage = storage_usage(tx, workspace_id, &subject, deployment, now).await?;
  let chargeable_statuses = chargeable_invitation_statuses();
  let charged_seats: i64 = sqlx::query_scalar(
    r#"SELECT
      (SELECT count(*) FROM workspace_members WHERE workspace_id=$1 AND state='active')
      + (SELECT count(*) FROM workspace_invitations WHERE workspace_id=$1
        AND status::text = ANY($2))"#,
  )
  .bind(workspace_id)
  .bind(chargeable_statuses.as_slice())
  .fetch_one(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("load command seat usage", error))?;
  Ok(Some(CommandQuotaSnapshot {
    grant: subject.grant,
    usage: QuotaUsage {
      storage_bytes: used_storage,
      charged_seats,
    },
  }))
}
