mod byok;
mod license;
mod license_client;
mod license_offline;
mod license_worker;
mod mutation;
mod subscription;

use affine_core::access_control::{
  AccessContext, AccessGrant, Deployment as CoreDeployment, EntitlementFact, QuotaSubject, TargetType,
  resolve_entitlements, resolve_quota_subject,
};
use chrono::{DateTime, Utc};
use license::{
  RuntimeInstalledLicense, RuntimeLicenseInstallInput, RuntimeLicenseRefreshInput, installed, lock_license, verify,
};
use license_client::RuntimeLicenseChange;
pub(super) use license_worker::LicenseHealthWorker;
pub(super) use mutation::{
  EntitlementWrite, RuntimeEntitlementTarget, apply_transitions, change_invalidations, lock_sources, lock_targets,
  publish_changes, transition_before, upsert,
};
use sqlx::{Postgres, Row, Transaction};

use super::{
  BackendRuntime, InvalidationHintV1, RuntimeError, RuntimeResult, entitlement_input_error, parse_quantity,
  parse_target_type,
};
use crate::{AFFINE_PRO_PUBLIC_KEY, license_import::normalize_license, runtime::Deployment};

pub(super) async fn load_decision_time(
  tx: &mut Transaction<'_, Postgres>,
  context: &'static str,
) -> RuntimeResult<DateTime<Utc>> {
  sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database(context, error))
}

pub(super) struct ChargeSubject {
  pub(super) owner_id: String,
  pub(super) subject: QuotaSubject,
  pub(super) grant: AccessGrant,
}

struct EntitlementRow {
  source: String,
  status: String,
  plan: String,
  quantity: Option<i32>,
  starts_at: Option<DateTime<Utc>>,
  expires_at: Option<DateTime<Utc>>,
  grace_until: Option<DateTime<Utc>>,
  signed_payload: Option<Vec<u8>>,
}

async fn entitlement_rows(
  tx: &mut Transaction<'_, Postgres>,
  target_type: &str,
  target_id: &str,
) -> RuntimeResult<Vec<EntitlementRow>> {
  let rows = sqlx::query(
    r#"SELECT source, status, plan, quantity, starts_at, expires_at, grace_until, signed_payload FROM entitlements
       WHERE target_type=$1 AND target_id=$2
       ORDER BY updated_at DESC"#,
  )
  .bind(target_type)
  .bind(target_id)
  .fetch_all(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("load strict quota entitlement", error))?;
  Ok(
    rows
      .into_iter()
      .map(|row| EntitlementRow {
        source: row.get("source"),
        status: row.get("status"),
        plan: row.get("plan"),
        quantity: row.get("quantity"),
        starts_at: row.get("starts_at"),
        expires_at: row.get("expires_at"),
        grace_until: row.get("grace_until"),
        signed_payload: row.get("signed_payload"),
      })
      .collect(),
  )
}

fn resolve_grant(
  deployment: Deployment,
  workspace_id: &str,
  rows: &[EntitlementRow],
  now: DateTime<Utc>,
  target_type: TargetType,
) -> AccessGrant {
  let facts = rows
    .iter()
    .map(|row| EntitlementFact {
      source: &row.source,
      status: &row.status,
      plan: &row.plan,
      quantity: row.quantity,
      starts_at: row.starts_at,
      expires_at: row.expires_at,
      grace_until: row.grace_until,
      signed_payload: row.signed_payload.as_deref(),
    })
    .collect::<Vec<_>>();
  resolve_entitlements(
    &AccessContext {
      deployment: match deployment {
        Deployment::Cloud => CoreDeployment::Cloud,
        Deployment::SelfHosted => CoreDeployment::SelfHosted,
      },
      target_type,
      workspace_id: Some(workspace_id),
      now,
      license_public_key: AFFINE_PRO_PUBLIC_KEY,
    },
    &facts,
  )
}

pub(super) async fn resolve_workspace_entitlement(
  tx: &mut Transaction<'_, Postgres>,
  deployment: Deployment,
  workspace_id: &str,
  now: DateTime<Utc>,
) -> RuntimeResult<AccessGrant> {
  let rows = entitlement_rows(tx, "workspace", workspace_id).await?;
  Ok(resolve_grant(
    deployment,
    workspace_id,
    &rows,
    now,
    TargetType::Workspace,
  ))
}

pub(super) async fn resolve_user_entitlement(
  tx: &mut Transaction<'_, Postgres>,
  deployment: Deployment,
  user_id: &str,
  workspace_id: &str,
  now: DateTime<Utc>,
) -> RuntimeResult<AccessGrant> {
  let rows = entitlement_rows(tx, "user", user_id).await?;
  Ok(resolve_grant(deployment, workspace_id, &rows, now, TargetType::User))
}

pub(super) async fn resolve_quota_charge(
  tx: &mut Transaction<'_, Postgres>,
  deployment: Deployment,
  workspace_id: &str,
  owner_id: String,
  now: DateTime<Utc>,
) -> RuntimeResult<ChargeSubject> {
  let workspace_grant = resolve_workspace_entitlement(tx, deployment, workspace_id, now).await?;
  let owner_grant = resolve_user_entitlement(tx, deployment, &owner_id, workspace_id, now).await?;
  let decision = resolve_quota_subject(&workspace_grant, &owner_grant);
  Ok(ChargeSubject {
    owner_id,
    subject: decision.subject,
    grant: decision.grant,
  })
}

#[cfg(test)]
mod tests;

#[cfg(test)]
pub(super) use subscription::RuntimeAdminGrantInput;
