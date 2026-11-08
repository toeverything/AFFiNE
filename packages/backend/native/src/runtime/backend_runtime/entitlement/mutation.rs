use std::collections::BTreeSet;

use affine_core::{
  access_control::{AccessGrant, EntitlementTransitionEffect, plan_entitlement_transition},
  invalidation::SubjectId,
};
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{Postgres, Transaction};

use super::{
  BackendRuntime, Deployment, InvalidationHintV1, RuntimeError, RuntimeResult, resolve_workspace_entitlement,
};

#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub struct RuntimeEntitlementTarget {
  pub target_type: String,
  pub target_id: String,
}

pub(in crate::runtime::backend_runtime) async fn lock_sources(
  tx: &mut Transaction<'_, Postgres>,
  sources: &[String],
) -> RuntimeResult<()> {
  for source in sources.iter().collect::<BTreeSet<_>>() {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,4817))")
      .bind(source)
      .execute(&mut **tx)
      .await
      .map_err(|e| RuntimeError::database("lock entitlement source", e))?;
  }
  Ok(())
}

pub(in crate::runtime::backend_runtime) async fn lock_targets(
  tx: &mut Transaction<'_, Postgres>,
  targets: &[RuntimeEntitlementTarget],
) -> RuntimeResult<Vec<String>> {
  let workspaces = targets
    .iter()
    .filter(|t| t.target_type == "workspace")
    .map(|t| t.target_id.clone())
    .collect::<BTreeSet<_>>()
    .into_iter()
    .collect::<Vec<_>>();
  let owners: Vec<(String, String)> = sqlx::query_as(
    "SELECT workspace_id,user_id FROM workspace_members WHERE workspace_id=ANY($1) AND role='owner' AND \
     state='active' ORDER BY workspace_id,user_id",
  )
  .bind(&workspaces)
  .fetch_all(&mut **tx)
  .await
  .map_err(|e| RuntimeError::database("read entitlement target owners", e))?;
  let users = targets
    .iter()
    .filter(|t| t.target_type == "user")
    .map(|t| t.target_id.clone())
    .chain(owners.iter().map(|(_, id)| id.clone()))
    .collect::<BTreeSet<_>>()
    .into_iter()
    .collect::<Vec<_>>();
  let locked_users: Vec<String> = sqlx::query_scalar("SELECT id FROM users WHERE id=ANY($1) ORDER BY id FOR UPDATE")
    .bind(&users)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| RuntimeError::database("lock entitlement users", e))?;
  if locked_users != users {
    return Err(RuntimeError::invalid_input("entitlement target user not found"));
  }
  let locked_workspaces: Vec<String> =
    sqlx::query_scalar("SELECT id FROM workspaces WHERE id=ANY($1) ORDER BY id FOR UPDATE")
      .bind(&workspaces)
      .fetch_all(&mut **tx)
      .await
      .map_err(|e| RuntimeError::database("lock entitlement workspaces", e))?;
  if locked_workspaces != workspaces {
    return Err(RuntimeError::invalid_input("entitlement target workspace not found"));
  }
  let locked_owners: Vec<(String, String)> = sqlx::query_as(
    "SELECT workspace_id,user_id FROM workspace_members WHERE workspace_id=ANY($1) AND role='owner' AND \
     state='active' ORDER BY workspace_id,user_id",
  )
  .bind(&workspaces)
  .fetch_all(&mut **tx)
  .await
  .map_err(|e| RuntimeError::database("verify entitlement target owners", e))?;
  if owners != locked_owners {
    return Err(RuntimeError::invalid_input("entitlement_target_changed"));
  }
  let owned_workspaces = owners.iter().map(|(workspace, _)| workspace).collect::<BTreeSet<_>>();
  if owned_workspaces.len() != workspaces.len() {
    return Err(RuntimeError::invalid_input(
      "entitlement target workspace has no active owner",
    ));
  }
  Ok(owners.into_iter().map(|(_, id)| id).collect())
}

pub(in crate::runtime::backend_runtime) async fn transition_before(
  tx: &mut Transaction<'_, Postgres>,
  targets: &[RuntimeEntitlementTarget],
  deployment: Deployment,
  now: DateTime<Utc>,
) -> RuntimeResult<Vec<(String, AccessGrant)>> {
  let mut result = Vec::new();
  for id in targets
    .iter()
    .filter(|t| t.target_type == "workspace")
    .map(|t| &t.target_id)
    .collect::<BTreeSet<_>>()
  {
    result.push((
      id.clone(),
      resolve_workspace_entitlement(tx, deployment, id, now).await?,
    ));
  }
  Ok(result)
}

pub(in crate::runtime::backend_runtime) async fn apply_transitions(
  tx: &mut Transaction<'_, Postgres>,
  before: &[(String, AccessGrant)],
  deployment: Deployment,
  now: DateTime<Utc>,
) -> RuntimeResult<()> {
  for (id, previous) in before {
    let next = resolve_workspace_entitlement(tx, deployment, id, now).await?;
    for effect in plan_entitlement_transition(previous, &next).effects {
      let sql = match effect {
        EntitlementTransitionEffect::RevokePendingInvitations => {
          "DELETE FROM workspace_invitations WHERE workspace_id=$1 AND status IN \
           ('pending','waiting_review','waiting_seat')"
        }
        EntitlementTransitionEffect::DemoteNonOwnerAdmins => {
          "UPDATE workspace_members SET role='member',updated_at=clock_timestamp() WHERE workspace_id=$1 AND \
           role='admin' AND state='active'"
        }
      };
      sqlx::query(sql)
        .bind(id)
        .execute(&mut **tx)
        .await
        .map_err(|e| RuntimeError::database("apply entitlement transition", e))?;
    }
  }
  Ok(())
}

pub(in crate::runtime::backend_runtime) async fn publish_changes(
  runtime: &BackendRuntime,
  targets: &[RuntimeEntitlementTarget],
  owners: &[String],
) {
  for hint in change_invalidations(targets, owners) {
    runtime.publish_invalidation(hint).await;
  }
}

pub(in crate::runtime::backend_runtime) fn change_invalidations(
  targets: &[RuntimeEntitlementTarget],
  owners: &[String],
) -> Vec<InvalidationHintV1> {
  let mut invalidations = Vec::new();
  for target in targets.iter().collect::<BTreeSet<_>>() {
    let subject = if target.target_type == "workspace" {
      SubjectId::Workspace(target.target_id.clone())
    } else {
      SubjectId::User(target.target_id.clone())
    };
    invalidations.push(InvalidationHintV1::QuotaEntitlement { subject });
    if target.target_type == "workspace" {
      invalidations.push(InvalidationHintV1::QuotaSeatUsage {
        workspace_id: target.target_id.clone(),
      });
      invalidations.push(InvalidationHintV1::QuotaStorageUsage {
        subject: SubjectId::Workspace(target.target_id.clone()),
      });
    }
  }
  for owner in owners.iter().collect::<BTreeSet<_>>() {
    invalidations.push(InvalidationHintV1::QuotaStorageUsage {
      subject: SubjectId::User(owner.clone()),
    });
  }
  invalidations
}

pub(in crate::runtime::backend_runtime) struct EntitlementWrite<'a> {
  pub target: &'a RuntimeEntitlementTarget,
  pub source: &'a str,
  pub subject_id: &'a str,
  pub plan: &'a str,
  pub status: &'a str,
  pub quantity: Option<i32>,
  pub payload: Option<&'a [u8]>,
  pub metadata: Value,
  pub starts_at: Option<DateTime<Utc>>,
  pub expires_at: Option<DateTime<Utc>>,
  pub grace_until: Option<DateTime<Utc>>,
}

pub(in crate::runtime::backend_runtime) async fn upsert(
  tx: &mut Transaction<'_, Postgres>,
  data: EntitlementWrite<'_>,
  now: DateTime<Utc>,
) -> RuntimeResult<String> {
  let existing: Option<String> = sqlx::query_scalar(
    "SELECT id FROM entitlements WHERE source=$1 AND subject_id=$2 ORDER BY updated_at DESC LIMIT 1",
  )
  .bind(data.source)
  .bind(data.subject_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|e| RuntimeError::database("find entitlement subject", e))?;
  let id = existing.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
  sqlx::query(
    "INSERT INTO \
     entitlements(id,target_type,target_id,source,subject_id,plan,status,quantity,signed_payload,metadata,starts_at,\
     expires_at,grace_until,validated_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) ON \
     CONFLICT(id) DO UPDATE SET \
     target_type=EXCLUDED.target_type,target_id=EXCLUDED.target_id,plan=EXCLUDED.plan,status=EXCLUDED.status,\
     quantity=EXCLUDED.quantity,signed_payload=EXCLUDED.signed_payload,metadata=EXCLUDED.metadata,starts_at=EXCLUDED.\
     starts_at,expires_at=EXCLUDED.expires_at,grace_until=EXCLUDED.grace_until,validated_at=EXCLUDED.validated_at,\
     updated_at=EXCLUDED.updated_at",
  )
  .bind(&id)
  .bind(&data.target.target_type)
  .bind(&data.target.target_id)
  .bind(data.source)
  .bind(data.subject_id)
  .bind(data.plan)
  .bind(data.status)
  .bind(data.quantity)
  .bind(data.payload)
  .bind(data.metadata)
  .bind(data.starts_at)
  .bind(data.expires_at)
  .bind(data.grace_until)
  .bind(now)
  .execute(&mut **tx)
  .await
  .map_err(|e| RuntimeError::database("upsert entitlement", e))?;
  Ok(id)
}
