use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row, postgres::PgRow};

use super::{
  ActorFacts, ChargeSubject, InviteAbuseFacts, InviteAbuseSubject, InviteActivityFacts, InvitePlan,
  PersistedInviteAbuseError, PersistedInviteAbuseRecord, QuotaFacts, RuntimeError, RuntimeResult, WorkspaceFacts,
  resolve_quota_charge, resolve_user_entitlement, validate_persisted_invite_abuse,
};
use crate::runtime::{Deployment, backend_runtime::strict_quota::chargeable_invitation_statuses};

pub(super) async fn load_actor(
  pool: &PgPool,
  user_id: &str,
  workspace_id: &str,
  deployment: Deployment,
  now: DateTime<Utc>,
) -> RuntimeResult<ActorFacts> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("start invite actor facts", err))?;
  let row = sqlx::query(
    r#"
    SELECT
      users.email,
      users.created_at,
      users.registered,
      users.email_verified IS NOT NULL AS email_verified,
      users.disabled
    FROM users
    WHERE users.id = $1
    "#,
  )
  .bind(user_id)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("failed to load invite actor", err))?
  .ok_or_else(|| RuntimeError::invalid_input("invite actor not found"))?;

  let quota_plan = if deployment == Deployment::Cloud {
    let grant = resolve_user_entitlement(&mut tx, deployment, user_id, workspace_id, now).await?;
    Some(InvitePlan::from(grant.plan))
  } else {
    None
  };
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("commit invite actor facts", err))?;
  Ok(ActorFacts {
    email: row.get("email"),
    created_at: row.get("created_at"),
    registered: row.get("registered"),
    email_verified: row.get("email_verified"),
    disabled: row.get("disabled"),
    quota_plan,
  })
}

pub(super) async fn load_workspace(pool: &PgPool, workspace_id: &str) -> RuntimeResult<WorkspaceFacts> {
  let row = sqlx::query("SELECT created_at FROM workspaces WHERE id = $1")
    .bind(workspace_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| RuntimeError::database("failed to load workspace", err))?
    .ok_or_else(|| RuntimeError::invalid_input("workspace not found"))?;

  Ok(WorkspaceFacts {
    created_at: row.get("created_at"),
  })
}

pub(super) async fn load_invite_activity(
  pool: &PgPool,
  actor_user_id: &str,
  workspace_id: &str,
) -> RuntimeResult<InviteActivityFacts> {
  let chargeable_statuses = chargeable_invitation_statuses();
  let row = sqlx::query(
    r#"
    SELECT
      COUNT(*) FILTER (
        WHERE inviter_user_id = $1 AND created_at >= clock_timestamp() - interval '7 days'
      )::int AS actor_created_7d,
      COUNT(*) FILTER (
        WHERE inviter_user_id = $1 AND accepted_at >= clock_timestamp() - interval '7 days'
      )::int AS actor_accepted_7d,
      COUNT(*) FILTER (
        WHERE workspace_id = $2 AND status::text = ANY($3)
      )::int AS workspace_pending,
      COUNT(*) FILTER (
        WHERE workspace_id = $2 AND created_at >= clock_timestamp() - interval '7 days'
      )::int AS workspace_created_7d,
      COUNT(*) FILTER (
        WHERE workspace_id = $2 AND accepted_at >= clock_timestamp() - interval '7 days'
      )::int AS workspace_accepted_7d
    FROM workspace_invitations
    WHERE inviter_user_id = $1 OR workspace_id = $2
    "#,
  )
  .bind(actor_user_id)
  .bind(workspace_id)
  .bind(chargeable_statuses.as_slice())
  .fetch_one(pool)
  .await
  .map_err(|err| RuntimeError::database("failed to load invite activity facts", err))?;

  Ok(InviteActivityFacts {
    actor_created_7d: row.get("actor_created_7d"),
    actor_accepted_7d: row.get("actor_accepted_7d"),
    workspace_pending: row.get("workspace_pending"),
    workspace_created_7d: row.get("workspace_created_7d"),
    workspace_accepted_7d: row.get("workspace_accepted_7d"),
  })
}

pub(super) async fn load_quota(
  pool: &PgPool,
  workspace_id: &str,
  deployment: Deployment,
  now: DateTime<Utc>,
) -> RuntimeResult<Option<QuotaFacts>> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("start invite quota facts", err))?;
  let owner_id: Option<String> = sqlx::query_scalar(
    "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
  )
  .bind(workspace_id)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("failed to load invite quota owner", err))?;
  let Some(owner_id) = owner_id else {
    return Ok(None);
  };
  let subject: ChargeSubject = resolve_quota_charge(&mut tx, deployment, workspace_id, owner_id, now).await?;
  let chargeable_statuses = chargeable_invitation_statuses();
  let member_count: i64 = sqlx::query_scalar(
    r#"SELECT
      (SELECT count(*) FROM workspace_members WHERE workspace_id=$1 AND state='active')
      + (SELECT count(*) FROM workspace_invitations WHERE workspace_id=$1
        AND status::text = ANY($2))"#,
  )
  .bind(workspace_id)
  .bind(chargeable_statuses.as_slice())
  .fetch_one(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("failed to count invite quota seats", err))?;
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("commit invite quota facts", err))?;

  Ok(Some(QuotaFacts {
    plan: InvitePlan::from(subject.grant.plan),
    owner_user_id: Some(subject.owner_id),
    uses_owner_quota: subject.subject == affine_core::access_control::QuotaSubject::Owner,
    seat_limit: subject.grant.limits.seat_limit,
    member_count: i32::try_from(member_count).unwrap_or(i32::MAX),
    known: true,
    stale: false,
    stale_after: None,
  }))
}

pub(super) fn persisted_abuse_subject(row: &PgRow) -> Result<InviteAbuseSubject, PersistedInviteAbuseError> {
  validate_persisted_invite_abuse(&PersistedInviteAbuseRecord {
    subject_key: row.get("subject_key"),
    subject_kind: row.get("subject_kind"),
    subject_status: row.get("subject_status"),
    subject_action: row.get("subject_action"),
    subject_reason: row.get("subject_reason"),
    subject_user_id: row.get("subject_user_id"),
    subject_actor_email_hash: row.get("subject_actor_email_hash"),
    subject_email_domain: row.get("subject_email_domain"),
    evidence_subject_key: row.get("evidence_subject_key"),
    evidence_workspace_id: row.get("evidence_workspace_id"),
    evidence_user_id: row.get("evidence_user_id"),
    evidence_actor_email_hash: row.get("evidence_actor_email_hash"),
    evidence_source_prefix_hash: row.get("evidence_source_prefix_hash"),
    evidence_source_asn: row.get("evidence_source_asn"),
    evidence_target_domains: row.get("evidence_target_domains"),
    evidence_counters: row.get("evidence_counters"),
    evidence_action: row.get("evidence_action"),
    evidence_reason: row.get("evidence_reason"),
    action_action: row.get("action_action"),
  })
}

pub(super) const PERSISTED_ABUSE_COLUMNS: &str = r#"
  subject.subject_key,
  subject.kind AS subject_kind,
  subject.status AS subject_status,
  subject.action AS subject_action,
  subject.action_reason AS subject_reason,
  subject.user_id AS subject_user_id,
  subject.actor_email_hash AS subject_actor_email_hash,
  subject.email_domain AS subject_email_domain,
  evidence.id AS evidence_id,
  evidence.subject_key AS evidence_subject_key,
  evidence.workspace_id AS evidence_workspace_id,
  evidence.user_id AS evidence_user_id,
  evidence.actor_email_hash AS evidence_actor_email_hash,
  evidence.source_prefix_hash AS evidence_source_prefix_hash,
  evidence.source_asn AS evidence_source_asn,
  evidence.target_domains AS evidence_target_domains,
  evidence.counters AS evidence_counters,
  evidence.decision AS evidence_action,
  evidence.reason AS evidence_reason
"#;

pub(super) async fn load_active_abuse_subjects(pool: &PgPool) -> RuntimeResult<InviteAbuseFacts> {
  let query = format!(
    "SELECT {PERSISTED_ABUSE_COLUMNS}, NULL::text AS action_action FROM runtime_invite_abuse_subjects subject LEFT \
     JOIN LATERAL (SELECT evidence.* FROM runtime_invite_abuse_evidence evidence WHERE evidence.subject_key = \
     subject.subject_key ORDER BY evidence.id DESC LIMIT 1) evidence ON true WHERE subject.status <> 'active' OR \
     subject.kind NOT IN ('actor_email', 'workspace', 'source_prefix_domain') ORDER BY subject.subject_key"
  );
  let rows = sqlx::query(&query)
    .fetch_all(pool)
    .await
    .map_err(|err| RuntimeError::database("failed to load active invite abuse subjects", err))?;
  let mut subjects = BTreeMap::<String, Option<InviteAbuseSubject>>::new();
  for row in rows {
    let key = row.get::<String, _>("subject_key");
    let validated = persisted_abuse_subject(&row).ok();
    subjects
      .entry(key)
      .and_modify(|current| {
        if validated.is_none() {
          *current = None;
        }
      })
      .or_insert(validated);
  }
  let valid = subjects.values().all(Option::is_some);
  Ok(InviteAbuseFacts {
    valid,
    active_subjects: subjects.into_values().flatten().collect(),
  })
}
