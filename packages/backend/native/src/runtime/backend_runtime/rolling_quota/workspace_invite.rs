use affine_core::access_control::Deployment as CoreDeployment;
use chrono::{DateTime, Utc};
use napi::Result;
use serde_json::json;
use sqlx::PgPool;

use super::{
  BackendRuntime, InviteAbusePersistencePlan, InviteCommitUsage, InviteInput, InviteOperation, InvitePolicyDecision,
  QuotaViolation, RateLimitDenialReason, RuntimeError, RuntimeInviteAbuseActionRequired, RuntimeResult,
  RuntimeWorkspaceActionDecision, RuntimeWorkspaceInviteQuotaDecision, RuntimeWorkspaceInviteQuotaInput,
  RuntimeWorkspaceInviteQuotaUsage, TargetDomain, commit_reservation, invite_input, invite_policy_config,
  load_active_abuse_subjects, load_actor, load_invite_activity, load_quota, load_workspace, napi_error, plan_invite,
  plan_invite_commit, release_reservation, reserve_scopes,
};
use crate::runtime::Deployment;

async fn record_invite_abuse_action(
  pool: &PgPool,
  input: &RuntimeWorkspaceInviteQuotaInput,
  plan: InviteAbusePersistencePlan,
) -> RuntimeResult<RuntimeInviteAbuseActionRequired> {
  let action = plan.action.as_str();
  let target_domains = json!(
    plan
      .evidence
      .target_domains
      .iter()
      .map(|target| json!({
        "domain": target.domain,
        "count": target.count,
      }))
      .collect::<Vec<_>>()
  );
  let counters = json!({
    "requested": plan.evidence.requested,
  });

  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("failed to start invite abuse transaction", err))?;

  sqlx::query(
    r#"
    INSERT INTO runtime_invite_abuse_subjects (
      subject_key,
      kind,
      user_id,
      actor_email_hash,
      email_domain,
      first_seen_at,
      last_seen_at,
      status,
      action,
      action_reason,
      action_at
    )
    VALUES ($1, $2, $3, $4, $5, now(), now(), $6, $7, $8, now())
    ON CONFLICT (subject_key)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      actor_email_hash = EXCLUDED.actor_email_hash,
      email_domain = EXCLUDED.email_domain,
      last_seen_at = now(),
      status = EXCLUDED.status,
      action = EXCLUDED.action,
      action_reason = EXCLUDED.action_reason,
      action_at = now(),
      updated_at = now()
    "#,
  )
  .bind(&plan.subject.key)
  .bind(plan.subject.kind.as_str())
  .bind(&plan.subject_user_id)
  .bind(&plan.evidence.actor_email_hash)
  .bind(&plan.evidence.actor_domain)
  .bind(plan.subject.status.as_str())
  .bind(action)
  .bind(plan.reason.as_str())
  .execute(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("failed to upsert invite abuse subject", err))?;

  let evidence_id: i64 = sqlx::query_scalar(
    r#"
    INSERT INTO runtime_invite_abuse_evidence (
      subject_key,
      request_id,
      workspace_id,
      user_id,
      actor_email_hash,
      source_prefix_hash,
      source_asn,
      target_domains,
      counters,
      decision,
      reason
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id
    "#,
  )
  .bind(&plan.subject.key)
  .bind(&input.request_id)
  .bind(&input.workspace_id)
  .bind(&input.actor_user_id)
  .bind(&plan.evidence.actor_email_hash)
  .bind(&plan.evidence.source_prefix_hash)
  .bind(plan.evidence.source_asn)
  .bind(target_domains)
  .bind(counters)
  .bind(action)
  .bind(plan.reason.as_str())
  .fetch_one(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("failed to insert invite abuse evidence", err))?;

  let action_id: i64 = sqlx::query_scalar(
    r#"
    INSERT INTO runtime_invite_abuse_actions (
      subject_key,
      evidence_id,
      action,
      status,
      next_attempt_at
    )
    VALUES ($1, $2, $3, 'pending', now())
    RETURNING id
    "#,
  )
  .bind(&plan.subject.key)
  .bind(evidence_id)
  .bind(action)
  .fetch_one(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("failed to insert invite abuse action", err))?;

  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("failed to commit invite abuse transaction", err))?;

  Ok(RuntimeInviteAbuseActionRequired {
    action: action.to_string(),
    subject_key: plan.subject.key,
    evidence_id: evidence_id.to_string(),
    action_id: action_id.to_string(),
  })
}

fn decision_from_violation(
  violation: QuotaViolation,
  reason: affine_core::rate_limit::RateLimitDenialReason,
) -> RuntimeWorkspaceInviteQuotaDecision {
  RuntimeWorkspaceInviteQuotaDecision {
    allowed: false,
    reservation_id: None,
    retry_after_seconds: Some(60),
    reason: Some(reason.as_str().to_string()),
    scope_key: Some(violation.scope_key),
    window_seconds: Some(violation.window_seconds),
    limit: Some(violation.limit),
    current: Some(violation.current),
    requested: Some(violation.requested),
    action_required: None,
  }
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn evaluate_workspace_invite_link_v1(
    &self,
    actor_user_id: String,
    workspace_id: String,
  ) -> Result<RuntimeWorkspaceActionDecision> {
    let runtime_config = self.config()?;
    let pool = self.pool().await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&pool)
      .await
      .map_err(|err| RuntimeError::database("failed to read database clock", err))?;
    let actor = load_actor(&pool, &actor_user_id, &workspace_id, runtime_config.deployment, now).await?;
    let quota = load_quota(&pool, &workspace_id, runtime_config.deployment, now).await?;
    let workspace = load_workspace(&pool, &workspace_id).await?;
    let activity = load_invite_activity(&pool, &actor_user_id, &workspace_id).await?;
    let abuse = load_active_abuse_subjects(&pool).await?;
    let plan = plan_invite(
      match runtime_config.deployment {
        Deployment::Cloud => CoreDeployment::Cloud,
        Deployment::SelfHosted => CoreDeployment::SelfHosted,
      },
      &InviteInput {
        operation: InviteOperation::CreateInviteLink,
        actor_user_id,
        workspace_id,
        target_count: 0,
        target_domains: Vec::new(),
        source: None,
      },
      &actor,
      &workspace,
      quota.as_ref(),
      &activity,
      &abuse,
      &invite_policy_config(&runtime_config.invite_quota, &runtime_config.private_key),
      now,
    )
    .map_err(|error| napi_error(error.to_string()))?;
    match plan.decision {
      InvitePolicyDecision::Allow => Ok(RuntimeWorkspaceActionDecision {
        allowed: true,
        retry_after_seconds: None,
        reason: None,
      }),
      InvitePolicyDecision::Deny {
        reason,
        retry_after_seconds,
        ..
      } => Ok(RuntimeWorkspaceActionDecision {
        allowed: false,
        retry_after_seconds,
        reason: Some(reason.as_str().to_string()),
      }),
      InvitePolicyDecision::Reserve => Ok(RuntimeWorkspaceActionDecision {
        allowed: false,
        retry_after_seconds: None,
        reason: Some(RateLimitDenialReason::PolicyStateInvalid.as_str().to_string()),
      }),
    }
  }

  #[napi]
  pub async fn assert_workspace_invite_quota_v1(
    &self,
    input: RuntimeWorkspaceInviteQuotaInput,
  ) -> Result<RuntimeWorkspaceInviteQuotaDecision> {
    let runtime_config = self.config()?;
    let config = &runtime_config.invite_quota;
    let policy_config = invite_policy_config(config, &runtime_config.private_key);
    let pool = self.pool().await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&pool)
      .await
      .map_err(|err| RuntimeError::database("failed to read database clock", err))?;
    let actor = load_actor(
      &pool,
      &input.actor_user_id,
      &input.workspace_id,
      runtime_config.deployment,
      now,
    )
    .await?;
    let policy_input = invite_input(&input);
    let quota = load_quota(&pool, &input.workspace_id, runtime_config.deployment, now).await?;
    let workspace = load_workspace(&pool, &input.workspace_id).await?;
    let activity = load_invite_activity(&pool, &input.actor_user_id, &input.workspace_id).await?;
    let abuse = load_active_abuse_subjects(&pool).await?;
    let plan = plan_invite(
      match runtime_config.deployment {
        Deployment::Cloud => CoreDeployment::Cloud,
        Deployment::SelfHosted => CoreDeployment::SelfHosted,
      },
      &policy_input,
      &actor,
      &workspace,
      quota.as_ref(),
      &activity,
      &abuse,
      &policy_config,
      now,
    )
    .map_err(|err| napi_error(err.to_string()))?;
    match plan.decision {
      InvitePolicyDecision::Allow => Ok(RuntimeWorkspaceInviteQuotaDecision {
        allowed: false,
        reservation_id: None,
        retry_after_seconds: None,
        reason: Some(RateLimitDenialReason::PolicyStateInvalid.as_str().to_string()),
        scope_key: None,
        window_seconds: None,
        limit: None,
        current: None,
        requested: Some(input.target_count),
        action_required: None,
      }),
      InvitePolicyDecision::Deny {
        reason,
        scope_key,
        retry_after_seconds,
      } => {
        let action_required = match plan.persistence {
          Some(persistence) => Some(record_invite_abuse_action(&pool, &input, persistence).await?),
          None => None,
        };
        Ok(RuntimeWorkspaceInviteQuotaDecision {
          allowed: false,
          reservation_id: None,
          retry_after_seconds,
          reason: Some(reason.as_str().to_string()),
          scope_key,
          window_seconds: None,
          limit: None,
          current: None,
          requested: Some(input.target_count),
          action_required,
        })
      }
      InvitePolicyDecision::Reserve => {
        match reserve_scopes(&pool, plan.purpose, input.request_id.as_deref(), plan.scopes).await? {
          Ok(reservation) => Ok(RuntimeWorkspaceInviteQuotaDecision {
            allowed: true,
            reservation_id: Some(reservation.reservation_id),
            retry_after_seconds: None,
            reason: None,
            scope_key: None,
            window_seconds: None,
            limit: None,
            current: None,
            requested: Some(input.target_count),
            action_required: None,
          }),
          Err(violation) => Ok(decision_from_violation(violation, RateLimitDenialReason::QuotaSubject)),
        }
      }
    }
  }

  #[napi]
  pub async fn commit_workspace_invite_quota_v1(
    &self,
    reservation_id: String,
    usage: RuntimeWorkspaceInviteQuotaUsage,
  ) -> Result<bool> {
    let settle_usage = usage.target_count;
    let pool = self.pool().await?;
    commit_reservation(&pool, &reservation_id, settle_usage, move |scope_keys| {
      plan_invite_commit(
        scope_keys,
        InviteCommitUsage {
          target_count: usage.target_count,
          target_domains: usage
            .target_domains
            .into_iter()
            .map(|target| TargetDomain {
              domain: target.domain,
              count: target.count,
            })
            .collect(),
        },
      )
      .map(|plan| plan.scope_usage)
      .map_err(|error| RuntimeError::invalid_input(error.to_string()))
    })
    .await
    .map_err(Into::into)
  }

  #[napi]
  pub async fn release_workspace_invite_quota_v1(&self, reservation_id: String) -> Result<bool> {
    let pool = self.pool().await?;
    release_reservation(&pool, &reservation_id).await.map_err(Into::into)
  }
}
