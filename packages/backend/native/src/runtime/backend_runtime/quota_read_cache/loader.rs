use affine_core::{
  access_control::{QuotaSubject, QuotaUsage, ReadonlyReason, evaluate_workspace_quota, resolve_quota_subject},
  invalidation::{QuotaCacheKey, SubjectId},
};
use chrono::Utc;
use sqlx::{Postgres, Row, Transaction};

use super::{QuotaReadCache, resolve_user_entitlement, resolve_workspace_entitlement};
use crate::runtime::{
  RuntimeError, RuntimeResult,
  backend_runtime::strict_quota::chargeable_invitation_statuses,
  types::{RuntimeUserQuotaState, RuntimeWorkspaceQuotaState},
};

#[derive(Clone)]
pub(super) struct EntitlementValue {
  grant: affine_core::access_control::AccessGrant,
}

#[derive(Clone)]
pub(super) struct SeatUsage {
  member_count: i32,
}

async fn user_entitlement(cache: &QuotaReadCache, user_id: &str) -> RuntimeResult<EntitlementValue> {
  let key = QuotaCacheKey::Entitlement(SubjectId::User(user_id.to_string()));
  cache
    .entitlements
    .get_or_load(key, 128, || async {
      let mut tx = cache
        .pool
        .begin()
        .await
        .map_err(|error| RuntimeError::database("begin user quota read", error))?;
      let grant = resolve_user_entitlement(&mut tx, cache.deployment, user_id, "", Utc::now()).await?;
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit user quota read", error))?;
      Ok(EntitlementValue { grant })
    })
    .await
}

async fn workspace_entitlement(cache: &QuotaReadCache, workspace_id: &str) -> RuntimeResult<EntitlementValue> {
  let key = QuotaCacheKey::Entitlement(SubjectId::Workspace(workspace_id.to_string()));
  cache
    .entitlements
    .get_or_load(key, 128, || async {
      let mut tx = cache
        .pool
        .begin()
        .await
        .map_err(|error| RuntimeError::database("begin workspace entitlement read", error))?;
      let grant = resolve_workspace_entitlement(&mut tx, cache.deployment, workspace_id, Utc::now()).await?;
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit workspace entitlement read", error))?;
      Ok(EntitlementValue { grant })
    })
    .await
}

async fn owner(cache: &QuotaReadCache, workspace_id: &str) -> RuntimeResult<String> {
  cache
    .owners
    .get_or_load(QuotaCacheKey::OwnerMapping(workspace_id.to_string()), 80, || async {
      sqlx::query_scalar::<_, String>(
        "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active'",
      )
      .bind(workspace_id)
      .fetch_one(&cache.pool)
      .await
      .map_err(|error| RuntimeError::database("load workspace quota owner", error))
    })
    .await
}

async fn workspace_storage_in(tx: &mut Transaction<'_, Postgres>, workspace_id: &str) -> RuntimeResult<i64> {
  sqlx::query_scalar(
    r#"SELECT
      COALESCE((SELECT SUM(size)::bigint FROM blobs WHERE workspace_id=$1 AND deleted_at IS NULL
        AND (status='completed' OR (status='pending' AND reservation_expires_at > clock_timestamp()))),0)
      + COALESCE((SELECT SUM(size)::bigint FROM comment_attachments WHERE workspace_id=$1 AND deleted_at IS NULL
        AND (status='completed' OR (status='pending' AND reservation_expires_at > clock_timestamp()))),0)"#,
  )
  .bind(workspace_id)
  .fetch_one(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("load workspace storage quota usage", error))
}

async fn workspace_storage(cache: &QuotaReadCache, workspace_id: &str) -> RuntimeResult<i64> {
  let key = QuotaCacheKey::StorageUsage(SubjectId::Workspace(workspace_id.to_string()));
  cache
    .storage
    .get_or_load(key, 32, || async {
      let mut tx = cache
        .pool
        .begin()
        .await
        .map_err(|error| RuntimeError::database("begin storage quota read", error))?;
      let used = workspace_storage_in(&mut tx, workspace_id).await?;
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit storage quota read", error))?;
      Ok(used)
    })
    .await
}

async fn user_storage(
  cache: &QuotaReadCache,
  user_id: &str,
  owner_grant: &affine_core::access_control::AccessGrant,
) -> RuntimeResult<i64> {
  let key = QuotaCacheKey::StorageUsage(SubjectId::User(user_id.to_string()));
  cache
    .storage
    .get_or_load(key, 32, || async {
      let mut tx = cache
        .pool
        .begin()
        .await
        .map_err(|error| RuntimeError::database("begin owner storage read", error))?;
      let workspace_ids = sqlx::query_scalar::<_, String>(
        "SELECT workspace_id FROM workspace_members WHERE user_id=$1 AND role='owner' AND state='active' ORDER BY \
         workspace_id",
      )
      .bind(user_id)
      .fetch_all(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("load owned workspaces for quota", error))?;
      let mut used = 0;
      for workspace_id in workspace_ids {
        let workspace_grant =
          resolve_workspace_entitlement(&mut tx, cache.deployment, &workspace_id, Utc::now()).await?;
        if resolve_quota_subject(&workspace_grant, owner_grant).subject == QuotaSubject::Owner {
          used += workspace_storage_in(&mut tx, &workspace_id).await?;
        }
      }
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit owner storage read", error))?;
      Ok(used)
    })
    .await
}

async fn seat_usage(cache: &QuotaReadCache, workspace_id: &str) -> RuntimeResult<SeatUsage> {
  cache
    .seats
    .get_or_load(QuotaCacheKey::SeatUsage(workspace_id.to_string()), 32, || async {
      let chargeable_statuses = chargeable_invitation_statuses();
      let row = sqlx::query(
        r#"SELECT
          (SELECT COUNT(*)::int FROM workspace_members WHERE workspace_id=$1 AND state='active')
          + (SELECT COUNT(*)::int FROM workspace_invitations WHERE workspace_id=$1
              AND status::text = ANY($2)) AS member_count"#,
      )
      .bind(workspace_id)
      .bind(chargeable_statuses.as_slice())
      .fetch_one(&cache.pool)
      .await
      .map_err(|error| RuntimeError::database("load workspace seat quota usage", error))?;
      Ok(SeatUsage {
        member_count: row.get("member_count"),
      })
    })
    .await
}

pub(super) async fn user_state(cache: &QuotaReadCache, user_id: &str) -> RuntimeResult<RuntimeUserQuotaState> {
  let entitlement = user_entitlement(cache, user_id).await?;
  let used_storage_quota = user_storage(cache, user_id, &entitlement.grant).await?;
  Ok(RuntimeUserQuotaState {
    plan: entitlement.grant.plan.as_str().to_string(),
    seat_limit: entitlement.grant.limits.seat_limit,
    blob_limit: entitlement.grant.limits.blob_limit,
    storage_quota: entitlement.grant.limits.storage_quota,
    used_storage_quota,
    history_period_seconds: entitlement.grant.limits.history_period,
    copilot_action_limit: entitlement.grant.limits.copilot_action_limit,
    unlimited_copilot: entitlement.grant.rights.unlimited_copilot,
  })
}

pub(super) async fn workspace_state(
  cache: &QuotaReadCache,
  workspace_id: &str,
) -> RuntimeResult<RuntimeWorkspaceQuotaState> {
  let owner_user_id = owner(cache, workspace_id).await?;
  let workspace_entitlement = workspace_entitlement(cache, workspace_id).await?;
  let owner_entitlement = user_entitlement(cache, &owner_user_id).await?;
  let decision = resolve_quota_subject(&workspace_entitlement.grant, &owner_entitlement.grant);
  let (used_storage_quota, uses_owner_quota) = match decision.subject {
    QuotaSubject::Workspace => (workspace_storage(cache, workspace_id).await?, false),
    QuotaSubject::Owner => (
      user_storage(cache, &owner_user_id, &owner_entitlement.grant).await?,
      true,
    ),
  };
  let entitlement = EntitlementValue { grant: decision.grant };
  let seats = seat_usage(cache, workspace_id).await?;
  let quota_state = evaluate_workspace_quota(
    &entitlement.grant,
    QuotaUsage {
      storage_bytes: used_storage_quota,
      charged_seats: i64::from(seats.member_count),
    },
  );
  let readonly_reasons = quota_state
    .readonly_reasons
    .iter()
    .map(|reason| match reason {
      ReadonlyReason::MemberOverflow => "member_overflow".to_string(),
      ReadonlyReason::StorageOverflow => "storage_overflow".to_string(),
    })
    .collect::<Vec<_>>();
  Ok(RuntimeWorkspaceQuotaState {
    plan: entitlement.grant.plan.as_str().to_string(),
    owner_user_id,
    uses_owner_quota,
    seat_limit: entitlement.grant.limits.seat_limit,
    member_count: seats.member_count,
    overcapacity_member_count: quota_state.overcapacity_member_count as i32,
    blob_limit: entitlement.grant.limits.blob_limit,
    storage_quota: entitlement.grant.limits.storage_quota,
    used_storage_quota,
    history_period_seconds: entitlement.grant.limits.history_period,
    readonly: !readonly_reasons.is_empty(),
    readonly_reasons,
    unlimited_copilot: entitlement.grant.rights.unlimited_copilot,
  })
}
