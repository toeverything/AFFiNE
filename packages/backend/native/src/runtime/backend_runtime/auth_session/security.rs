use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};

use super::{
  RuntimeError, RuntimeResult, decision_time, lock_refresh_tokens, lock_user,
  login::{canonical_email, lock_email},
};

pub(super) async fn revoke_user(pool: &PgPool, user_id: &str, reason: &str) -> RuntimeResult<i64> {
  change_credential_and_revoke(pool, user_id, reason, None, None).await
}

pub(super) async fn set_user_email(pool: &PgPool, user_id: &str, email: &str, reason: &str) -> RuntimeResult<i64> {
  let email = canonical_email(email)?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin user email change", error))?;
  lock_email(&mut tx, &email).await?;
  lock_user(&mut tx, user_id).await?;
  let used: Option<String> =
    sqlx::query_scalar("SELECT id FROM users WHERE lower(email)=lower($1) AND id<>$2 FOR UPDATE")
      .bind(&email)
      .bind(user_id)
      .fetch_optional(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("check user email uniqueness", error))?;
  if used.is_some() {
    return Err(RuntimeError::invalid_state("email_already_used"));
  }
  let now = decision_time(&mut tx).await?;
  let count = apply_locked(&mut tx, user_id, reason, None, Some(&email), now).await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit user email change", error))?;
  Ok(count)
}

pub(super) async fn set_user_disabled(
  pool: &PgPool,
  user_id: &str,
  disabled: bool,
  reason: &str,
) -> RuntimeResult<bool> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin user status change", error))?;
  lock_user(&mut tx, user_id).await?;
  let now = decision_time(&mut tx).await?;
  apply_locked(&mut tx, user_id, reason, None, None, now).await?;
  sqlx::query("UPDATE users SET disabled=$2 WHERE id=$1")
    .bind(user_id)
    .bind(disabled)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("set user disabled status", error))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit user status change", error))?;
  Ok(disabled)
}

async fn change_credential_and_revoke(
  pool: &PgPool,
  user_id: &str,
  reason: &str,
  password_hash: Option<&str>,
  email: Option<&str>,
) -> RuntimeResult<i64> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin user auth revoke", error))?;
  lock_user(&mut tx, user_id).await?;
  let now = decision_time(&mut tx).await?;
  let count = apply_locked(&mut tx, user_id, reason, password_hash, email, now).await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit user auth revoke", error))?;
  Ok(count)
}

pub(super) async fn apply_locked(
  tx: &mut Transaction<'_, Postgres>,
  user_id: &str,
  reason: &str,
  password_hash: Option<&str>,
  email: Option<&str>,
  now: DateTime<Utc>,
) -> RuntimeResult<i64> {
  let user_sessions: Vec<String> =
    sqlx::query_scalar("SELECT id FROM user_sessions WHERE user_id=$1 ORDER BY id FOR UPDATE")
      .bind(user_id)
      .fetch_all(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database("lock user sessions", error))?;
  let auth_sessions: Vec<String> =
    sqlx::query_scalar("SELECT id FROM auth_sessions WHERE user_session_id=ANY($1) ORDER BY id FOR UPDATE")
      .bind(&user_sessions)
      .fetch_all(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database("lock user auth sessions", error))?;
  for auth_session_id in &auth_sessions {
    lock_refresh_tokens(&mut *tx, auth_session_id).await?;
  }
  sqlx::query(
    r#"UPDATE users SET auth_epoch=auth_epoch+1,
         password=COALESCE($2,password),email=COALESCE($3,email),
         email_verified=CASE WHEN $3::text IS NULL THEN email_verified ELSE $4 END
       WHERE id=$1"#,
  )
  .bind(user_id)
  .bind(password_hash)
  .bind(email)
  .bind(now)
  .execute(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("apply user credential and auth epoch", error))?;
  if !auth_sessions.is_empty() {
    sqlx::query("UPDATE auth_sessions SET revoked_at=$2,revoke_reason=$3 WHERE id=ANY($1) AND revoked_at IS NULL")
      .bind(&auth_sessions)
      .bind(now)
      .bind(reason)
      .execute(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database("revoke user auth sessions", error))?;
  }
  let cookie_count = sqlx::query("DELETE FROM user_sessions WHERE user_id=$1")
    .bind(user_id)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("delete user cookie sessions", error))?
    .rows_affected();
  Ok(i64::try_from(cookie_count).unwrap_or(i64::MAX) + i64::try_from(auth_sessions.len()).unwrap_or(i64::MAX))
}
