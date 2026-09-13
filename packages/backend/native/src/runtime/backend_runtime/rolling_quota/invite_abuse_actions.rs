use napi::Result;
use sqlx::{PgPool, Row};

use super::{
  BackendRuntime, PERSISTED_ABUSE_COLUMNS, RuntimeError, RuntimeInviteAbuseClaimedAction, RuntimeResult,
  load_active_abuse_subjects, napi_error, persisted_abuse_subject,
};

pub(super) async fn invite_abuse_user_quarantined_or_banned(pool: &PgPool, user_id: &str) -> RuntimeResult<bool> {
  if !load_active_abuse_subjects(pool).await?.valid {
    return Ok(true);
  }
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

pub(super) async fn invite_abuse_workspace_quarantined(pool: &PgPool, workspace_id: &str) -> RuntimeResult<bool> {
  if !load_active_abuse_subjects(pool).await?.valid {
    return Ok(true);
  }
  let row: Option<i32> = sqlx::query_scalar(
    r#"
    SELECT 1
    FROM runtime_invite_abuse_subjects subject
    JOIN runtime_invite_abuse_evidence evidence ON evidence.subject_key = subject.subject_key
    WHERE evidence.workspace_id = $1
      AND subject.kind = 'workspace'
      AND subject.status = 'quarantined'
    LIMIT 1
    "#,
  )
  .bind(workspace_id)
  .fetch_optional(pool)
  .await
  .map_err(|err| RuntimeError::database("failed to load invite abuse workspace subject", err))?;
  Ok(row.is_some())
}

async fn claim_invite_abuse_action(pool: &PgPool, action_id: &str, worker_id: &str) -> RuntimeResult<bool> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("failed to start invite abuse action claim", err))?;
  let candidate_query = format!(
    r#"SELECT {PERSISTED_ABUSE_COLUMNS}, action.action AS action_action
       FROM runtime_invite_abuse_actions action
       JOIN runtime_invite_abuse_subjects subject ON subject.subject_key = action.subject_key
       JOIN runtime_invite_abuse_evidence evidence ON evidence.id = action.evidence_id
       WHERE action.id = $1::bigint
       FOR UPDATE OF action"#
  );
  let candidate = sqlx::query(&candidate_query)
    .bind(action_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("failed to load invite abuse action claim", err))?;
  if candidate
    .as_ref()
    .and_then(|row| persisted_abuse_subject(row).ok())
    .is_none()
  {
    tx.rollback()
      .await
      .map_err(|err| RuntimeError::database("failed to rollback invalid invite abuse action claim", err))?;
    return Ok(false);
  }
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
  .execute(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("failed to claim invite abuse action", err))?;
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("failed to commit invite abuse action claim", err))?;
  Ok(result.rows_affected() > 0)
}

async fn claim_retryable_invite_abuse_actions(
  pool: &PgPool,
  worker_id: &str,
  limit: i64,
) -> RuntimeResult<Vec<RuntimeInviteAbuseClaimedAction>> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|err| RuntimeError::database("failed to start retryable invite abuse action claim", err))?;
  let query = format!(
    r#"SELECT {PERSISTED_ABUSE_COLUMNS}, action.action AS action_action,
              action.id::text AS action_id
       FROM runtime_invite_abuse_actions action
       JOIN runtime_invite_abuse_subjects subject ON subject.subject_key = action.subject_key
       JOIN runtime_invite_abuse_evidence evidence ON evidence.id = action.evidence_id
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
      ORDER BY COALESCE(action.next_attempt_at, action.created_at), action.id
      LIMIT $1
      FOR UPDATE OF action SKIP LOCKED"#
  );
  let candidates = sqlx::query(&query)
    .bind(limit.saturating_mul(4))
    .fetch_all(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("failed to claim retryable invite abuse actions", err))?;
  let mut claimed = Vec::new();
  for row in candidates {
    if claimed.len() >= limit as usize {
      break;
    }
    let action_id = row.get::<String, _>("action_id");
    if let Err(error) = persisted_abuse_subject(&row) {
      sqlx::query(
        r#"UPDATE runtime_invite_abuse_actions
            SET status = 'failed', last_error = $2, locked_by = NULL,
                locked_until = NULL, next_attempt_at = NULL, updated_at = now()
            WHERE id = $1::bigint"#,
      )
      .bind(&action_id)
      .bind(error.to_string())
      .execute(&mut *tx)
      .await
      .map_err(|err| RuntimeError::database("failed to reject invalid invite abuse action", err))?;
      continue;
    }
    let result = sqlx::query(
      r#"UPDATE runtime_invite_abuse_actions
          SET status = 'running', attempts = attempts + 1, locked_by = $2,
              locked_until = now() + interval '5 minutes', last_error = NULL, updated_at = now()
          WHERE id = $1::bigint"#,
    )
    .bind(&action_id)
    .bind(worker_id)
    .execute(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("failed to claim retryable invite abuse action", err))?;
    if result.rows_affected() == 1 {
      claimed.push(RuntimeInviteAbuseClaimedAction {
        action: row.get("action_action"),
        subject_key: row.get("subject_key"),
        evidence_id: row.get::<i64, _>("evidence_id").to_string(),
        action_id,
        actor_user_id: row.get("evidence_user_id"),
        workspace_id: row.get("evidence_workspace_id"),
      });
    }
  }
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("failed to commit retryable invite abuse action claims", err))?;
  Ok(claimed)
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
