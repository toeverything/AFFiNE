use napi::Result;
use sqlx::{PgPool, Row};

use super::{
  BackendRuntime, RuntimeError, RuntimeInviteAbuseClaimedAction, RuntimeResult, napi_error, workspace_subject_key,
};

async fn invite_abuse_user_quarantined_or_banned(pool: &PgPool, user_id: &str) -> RuntimeResult<bool> {
  let row: Option<i32> = sqlx::query_scalar(
    r#"
    SELECT 1
    FROM runtime_invite_abuse_subjects
    WHERE user_id = $1
      AND status IN ('quarantined', 'banned')
    LIMIT 1
    "#,
  )
  .bind(user_id)
  .fetch_optional(pool)
  .await
  .map_err(|err| RuntimeError::database("failed to load invite abuse subject by user", err))?;
  Ok(row.is_some())
}

async fn invite_abuse_workspace_quarantined(pool: &PgPool, workspace_id: &str) -> RuntimeResult<bool> {
  let row: Option<i32> = sqlx::query_scalar(
    r#"
    SELECT 1
    FROM runtime_invite_abuse_subjects
    WHERE subject_key = $1
      AND status = 'quarantined'
    LIMIT 1
    "#,
  )
  .bind(workspace_subject_key(workspace_id))
  .fetch_optional(pool)
  .await
  .map_err(|err| RuntimeError::database("failed to load invite abuse workspace subject", err))?;
  Ok(row.is_some())
}

async fn claim_invite_abuse_action(pool: &PgPool, action_id: &str, worker_id: &str) -> RuntimeResult<bool> {
  let result = sqlx::query(
    r#"
    UPDATE runtime_invite_abuse_actions action
    SET status = 'running',
        attempts = attempts + 1,
        locked_by = $2,
        locked_until = now() + interval '5 minutes',
        last_error = NULL,
        updated_at = now()
    WHERE action.id = $1::bigint
      AND action.action IN ('ban_actor', 'quarantine_actor', 'quarantine_workspace', 'quarantine_source_cohort')
      AND (
        (
          action.status IN ('pending', 'retry_wait')
          AND (action.next_attempt_at IS NULL OR action.next_attempt_at <= now())
        )
        OR (
          action.status = 'running'
          AND action.locked_until IS NOT NULL
          AND action.locked_until <= now()
        )
      )
    "#,
  )
  .bind(action_id)
  .bind(worker_id)
  .execute(pool)
  .await
  .map_err(|err| RuntimeError::database("failed to claim invite abuse action", err))?;
  Ok(result.rows_affected() > 0)
}

async fn claim_retryable_invite_abuse_actions(
  pool: &PgPool,
  worker_id: &str,
  limit: i64,
) -> RuntimeResult<Vec<RuntimeInviteAbuseClaimedAction>> {
  let rows = sqlx::query(
    r#"
    WITH candidates AS (
      SELECT action.id
      FROM runtime_invite_abuse_actions action
      JOIN runtime_invite_abuse_evidence evidence
        ON evidence.id = action.evidence_id
      WHERE (
          (
            action.status IN ('pending', 'retry_wait')
            AND (action.next_attempt_at IS NULL OR action.next_attempt_at <= now())
          )
          OR (
            action.status = 'running'
            AND action.locked_until IS NOT NULL
            AND action.locked_until <= now()
          )
        )
        AND evidence.user_id IS NOT NULL
        AND evidence.workspace_id IS NOT NULL
        AND action.action IN ('ban_actor', 'quarantine_actor', 'quarantine_workspace', 'quarantine_source_cohort')
      ORDER BY COALESCE(action.next_attempt_at, action.created_at), action.id
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
      UPDATE runtime_invite_abuse_actions action
      SET status = 'running',
          attempts = attempts + 1,
          locked_by = $1,
          locked_until = now() + interval '5 minutes',
          last_error = NULL,
          updated_at = now()
      FROM candidates
      WHERE action.id = candidates.id
      RETURNING
        action.id,
        action.subject_key,
        action.evidence_id,
        action.action
    )
    SELECT
      claimed.action,
      claimed.subject_key,
      claimed.evidence_id::text AS evidence_id,
      claimed.id::text AS action_id,
      evidence.user_id AS actor_user_id,
      evidence.workspace_id
    FROM claimed
    JOIN runtime_invite_abuse_evidence evidence
      ON evidence.id = claimed.evidence_id
    "#,
  )
  .bind(worker_id)
  .bind(limit)
  .fetch_all(pool)
  .await
  .map_err(|err| RuntimeError::database("failed to claim retryable invite abuse actions", err))?;

  Ok(
    rows
      .into_iter()
      .map(|row| RuntimeInviteAbuseClaimedAction {
        action: row.get("action"),
        subject_key: row.get("subject_key"),
        evidence_id: row.get("evidence_id"),
        action_id: row.get("action_id"),
        actor_user_id: row.get("actor_user_id"),
        workspace_id: row.get("workspace_id"),
      })
      .collect(),
  )
}

async fn mark_invite_abuse_action(
  pool: &PgPool,
  action_id: &str,
  worker_id: &str,
  status: &str,
  error: Option<String>,
) -> RuntimeResult<bool> {
  let result = match status {
    "succeeded" => sqlx::query(
      r#"
        UPDATE runtime_invite_abuse_actions
        SET status = 'succeeded',
            next_attempt_at = NULL,
            locked_by = NULL,
            locked_until = NULL,
            last_error = $3,
            updated_at = now()
        WHERE id = $1::bigint
          AND status = 'running'
          AND locked_by = $2
        "#,
    )
    .bind(action_id)
    .bind(worker_id)
    .bind(error)
    .execute(pool)
    .await
    .map_err(|err| RuntimeError::database("failed to mark invite abuse action succeeded", err))?,
    "failed" => sqlx::query(
      r#"
        UPDATE runtime_invite_abuse_actions
        SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'retry_wait' END,
            next_attempt_at = CASE WHEN attempts >= 5 THEN next_attempt_at ELSE now() + interval '5 minutes' END,
            locked_by = NULL,
            locked_until = NULL,
            last_error = $3,
            updated_at = now()
        WHERE id = $1::bigint
          AND status = 'running'
          AND locked_by = $2
        "#,
    )
    .bind(action_id)
    .bind(worker_id)
    .bind(error)
    .execute(pool)
    .await
    .map_err(|err| RuntimeError::database("failed to mark invite abuse action failed", err))?,
    _ => return Err(RuntimeError::invalid_input("invalid invite abuse action status")),
  };
  Ok(result.rows_affected() > 0)
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn is_invite_abuse_user_quarantined_or_banned(&self, user_id: String) -> Result<bool> {
    let pool = self.pool().await?;
    invite_abuse_user_quarantined_or_banned(&pool, &user_id)
      .await
      .map_err(Into::into)
  }

  #[napi]
  pub async fn is_invite_abuse_workspace_quarantined(&self, workspace_id: String) -> Result<bool> {
    let pool = self.pool().await?;
    invite_abuse_workspace_quarantined(&pool, &workspace_id)
      .await
      .map_err(Into::into)
  }

  #[napi]
  pub async fn claim_invite_abuse_action(&self, action_id: String, worker_id: String) -> Result<bool> {
    let pool = self.pool().await?;
    claim_invite_abuse_action(&pool, &action_id, &worker_id)
      .await
      .map_err(Into::into)
  }

  #[napi]
  pub async fn claim_retryable_invite_abuse_actions(
    &self,
    worker_id: String,
    limit: i64,
  ) -> Result<Vec<RuntimeInviteAbuseClaimedAction>> {
    if limit <= 0 {
      return Err(napi_error("invite abuse action claim limit must be positive"));
    }
    let pool = self.pool().await?;
    claim_retryable_invite_abuse_actions(&pool, &worker_id, limit)
      .await
      .map_err(Into::into)
  }

  #[napi]
  pub async fn mark_invite_abuse_action(
    &self,
    action_id: String,
    worker_id: String,
    status: String,
    error: Option<String>,
  ) -> Result<bool> {
    let pool = self.pool().await?;
    mark_invite_abuse_action(&pool, &action_id, &worker_id, &status, error)
      .await
      .map_err(Into::into)
  }
}
