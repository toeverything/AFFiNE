use chrono::{DateTime, Utc};
use napi::Result;
use serde_json::json;
use sqlx::{PgPool, Row};

use super::{
  ActorFacts, BackendRuntime, InviteAbuseDecision, InviteActivityFacts, InviteQuotaConfig, QuotaFacts, QuotaViolation,
  RuntimeError, RuntimeInviteAbuseActionRequired, RuntimeResult, RuntimeWorkspaceInviteQuotaDecision,
  RuntimeWorkspaceInviteQuotaInput, RuntimeWorkspaceInviteQuotaUsage, WorkspaceFacts, build_invite_scopes,
  commit_reservation, evaluate_projection, high_confidence_invite_abuse, invite_commit_usage_for_scope, napi_error,
  normalize_domain, release_reservation, reserve_scopes, short_hash, source_cohort_subject_key, source_prefix,
  subject_hash, sum_domains, workspace_subject_key,
};

async fn load_actor(pool: &PgPool, user_id: &str) -> RuntimeResult<ActorFacts> {
  let row = sqlx::query(
    r#"
    SELECT email, created_at, registered, email_verified IS NOT NULL AS email_verified, disabled
    FROM users
    WHERE id = $1
    "#,
  )
  .bind(user_id)
  .fetch_optional(pool)
  .await
  .map_err(|err| RuntimeError::database("failed to load invite actor", err))?
  .ok_or_else(|| RuntimeError::invalid_input("invite actor not found"))?;

  Ok(ActorFacts {
    email: row.get("email"),
    created_at: row.get("created_at"),
    registered: row.get("registered"),
    email_verified: row.get("email_verified"),
    disabled: row.get("disabled"),
  })
}

async fn load_workspace(pool: &PgPool, workspace_id: &str) -> RuntimeResult<WorkspaceFacts> {
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

async fn load_invite_activity(
  pool: &PgPool,
  actor_user_id: &str,
  workspace_id: &str,
) -> RuntimeResult<InviteActivityFacts> {
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
        WHERE workspace_id = $2 AND status IN ('pending', 'waiting_review', 'waiting_seat')
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

async fn load_quota(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Option<QuotaFacts>> {
  let row = sqlx::query(
    r#"
    SELECT plan, owner_user_id, uses_owner_quota, seat_limit, member_count, known, stale, stale_after
    FROM effective_workspace_quota_states
    WHERE workspace_id = $1
    "#,
  )
  .bind(workspace_id)
  .fetch_optional(pool)
  .await
  .map_err(|err| RuntimeError::database("failed to load workspace quota state", err))?;

  Ok(row.map(|row| QuotaFacts {
    plan: row.get("plan"),
    owner_user_id: row.get("owner_user_id"),
    uses_owner_quota: row.get("uses_owner_quota"),
    seat_limit: row.get("seat_limit"),
    member_count: row.get("member_count"),
    known: row.get("known"),
    stale: row.get("stale"),
    stale_after: row.get("stale_after"),
  }))
}

async fn active_subject_status(pool: &PgPool, subject_key: &str) -> RuntimeResult<Option<String>> {
  let row = sqlx::query("SELECT status FROM runtime_invite_abuse_subjects WHERE subject_key = $1")
    .bind(subject_key)
    .fetch_optional(pool)
    .await
    .map_err(|err| RuntimeError::database("failed to load invite abuse subject", err))?;
  Ok(row.map(|row| row.get("status")))
}

async fn record_invite_abuse_action(
  pool: &PgPool,
  input: &RuntimeWorkspaceInviteQuotaInput,
  actor: &ActorFacts,
  decision: InviteAbuseDecision,
  config: &InviteQuotaConfig,
) -> RuntimeResult<RuntimeInviteAbuseActionRequired> {
  let action = decision.action;
  let status = if action == "ban_actor" { "banned" } else { "quarantined" };
  let source_prefix_hash = source_prefix(input.source.as_ref()).map(|prefix| short_hash(&prefix));
  let target_domains = json!(
    input
      .target_domains
      .iter()
      .map(|target| json!({
        "domain": normalize_domain(&target.domain),
        "count": target.count,
      }))
      .collect::<Vec<_>>()
  );
  let counters = json!({
    "requested": input.target_count,
  });
  let actor_email_hash = subject_hash(&actor.email, config);
  let actor_domain = actor.email.split('@').next_back().map(normalize_domain);
  let source_asn = input.source.as_ref().and_then(|source| source.asn).map(i64::from);
  let subject_user_id = if decision.subject_kind == "actor_email" {
    Some(input.actor_user_id.as_str())
  } else {
    None
  };

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
  .bind(&decision.subject_key)
  .bind(decision.subject_kind)
  .bind(subject_user_id)
  .bind(actor_email_hash)
  .bind(actor_domain)
  .bind(status)
  .bind(action)
  .bind(decision.reason)
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
  .bind(&decision.subject_key)
  .bind(&input.request_id)
  .bind(&input.workspace_id)
  .bind(&input.actor_user_id)
  .bind(subject_hash(&actor.email, config))
  .bind(source_prefix_hash)
  .bind(source_asn)
  .bind(target_domains)
  .bind(counters)
  .bind(action)
  .bind(decision.reason)
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
  .bind(&decision.subject_key)
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
    subject_key: decision.subject_key,
    evidence_id: evidence_id.to_string(),
    action_id: action_id.to_string(),
  })
}

fn decision_from_violation(violation: QuotaViolation, reason: &str) -> RuntimeWorkspaceInviteQuotaDecision {
  RuntimeWorkspaceInviteQuotaDecision {
    allowed: false,
    reservation_id: None,
    retry_after_seconds: Some(60),
    reason: Some(reason.to_string()),
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
  pub async fn assert_workspace_invite_quota_v1(
    &self,
    input: RuntimeWorkspaceInviteQuotaInput,
  ) -> Result<RuntimeWorkspaceInviteQuotaDecision> {
    if input.target_count <= 0 {
      return Err(napi_error("target_count must be positive"));
    }
    let config = self.config()?.invite_quota;
    let pool = self.pool().await?;
    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&pool)
      .await
      .map_err(|err| RuntimeError::database("failed to read database clock", err))?;
    let actor = load_actor(&pool, &input.actor_user_id).await?;
    let actor_subject = subject_hash(&actor.email, &config);
    if let Some(status) = active_subject_status(&pool, &actor_subject).await?
      && matches!(status.as_str(), "banned" | "quarantined")
    {
      return Ok(RuntimeWorkspaceInviteQuotaDecision {
        allowed: false,
        reservation_id: None,
        retry_after_seconds: None,
        reason: Some("abuse_subject".to_string()),
        scope_key: Some(format!("invite:actor_subject:{actor_subject}")),
        window_seconds: None,
        limit: None,
        current: None,
        requested: Some(input.target_count),
        action_required: None,
      });
    }
    let workspace_subject = workspace_subject_key(&input.workspace_id);
    if let Some(status) = active_subject_status(&pool, &workspace_subject).await?
      && status == "quarantined"
    {
      return Ok(RuntimeWorkspaceInviteQuotaDecision {
        allowed: false,
        reservation_id: None,
        retry_after_seconds: None,
        reason: Some("abuse_workspace".to_string()),
        scope_key: Some(format!("invite:workspace_subject:{workspace_subject}")),
        window_seconds: None,
        limit: None,
        current: None,
        requested: Some(input.target_count),
        action_required: None,
      });
    }
    if let Some(prefix) = source_prefix(input.source.as_ref()) {
      for target in &input.target_domains {
        let source_subject = source_cohort_subject_key(&prefix, &target.domain);
        if let Some(status) = active_subject_status(&pool, &source_subject).await?
          && status == "quarantined"
        {
          return Ok(RuntimeWorkspaceInviteQuotaDecision {
            allowed: false,
            reservation_id: None,
            retry_after_seconds: None,
            reason: Some("abuse_source_cohort".to_string()),
            scope_key: Some(format!("invite:source_cohort_subject:{source_subject}")),
            window_seconds: None,
            limit: None,
            current: None,
            requested: Some(input.target_count),
            action_required: None,
          });
        }
      }
    }

    let quota = match load_quota(&pool, &input.workspace_id).await? {
      Some(quota) => quota,
      None => {
        return Ok(RuntimeWorkspaceInviteQuotaDecision {
          allowed: false,
          reservation_id: None,
          retry_after_seconds: None,
          reason: Some("quota_state_unavailable".to_string()),
          scope_key: None,
          window_seconds: None,
          limit: None,
          current: None,
          requested: Some(input.target_count),
          action_required: None,
        });
      }
    };
    if let Some(reason) = evaluate_projection(&quota, now) {
      return Ok(RuntimeWorkspaceInviteQuotaDecision {
        allowed: false,
        reservation_id: None,
        retry_after_seconds: None,
        reason: Some(reason.to_string()),
        scope_key: None,
        window_seconds: None,
        limit: None,
        current: None,
        requested: Some(input.target_count),
        action_required: None,
      });
    }
    if let Some(abuse_decision) = high_confidence_invite_abuse(&input, &actor, &config) {
      let reason = abuse_decision.reason;
      let scope_key = match abuse_decision.subject_kind {
        "workspace" => format!("invite:workspace_subject:{}", abuse_decision.subject_key),
        "source_prefix_domain" => format!("invite:source_cohort_subject:{}", abuse_decision.subject_key),
        _ => format!("invite:actor_subject:{}", abuse_decision.subject_key),
      };
      let action_required = record_invite_abuse_action(&pool, &input, &actor, abuse_decision, &config).await?;
      return Ok(RuntimeWorkspaceInviteQuotaDecision {
        allowed: false,
        reservation_id: None,
        retry_after_seconds: None,
        reason: Some(reason.to_string()),
        scope_key: Some(scope_key),
        window_seconds: None,
        limit: None,
        current: None,
        requested: Some(input.target_count),
        action_required: Some(action_required),
      });
    }

    let workspace = load_workspace(&pool, &input.workspace_id).await?;
    let activity = load_invite_activity(&pool, &input.actor_user_id, &input.workspace_id).await?;
    let scopes = build_invite_scopes(&input, &actor, &workspace, &quota, &activity, &config, now)?;
    match reserve_scopes(&pool, "workspace_invite", input.request_id.as_deref(), scopes).await? {
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
      Err(violation) => Ok(decision_from_violation(violation, "quota_subject")),
    }
  }

  #[napi]
  pub async fn commit_workspace_invite_quota_v1(
    &self,
    reservation_id: String,
    usage: RuntimeWorkspaceInviteQuotaUsage,
  ) -> Result<bool> {
    let domain_usage = sum_domains(&usage.target_domains);
    let pool = self.pool().await?;
    commit_reservation(&pool, &reservation_id, usage.target_count, |scope_key, _| {
      invite_commit_usage_for_scope(scope_key, usage.target_count, &domain_usage)
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
