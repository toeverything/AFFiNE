use affine_core::auth::{AuthChallengePurpose, SESSION_EXCHANGE_TTL_SECONDS, cookie_session_deadline};
use chrono::{DateTime, Utc};
use sqlx::{Postgres, Row, Transaction};

use super::{RuntimeError, RuntimeResult, session::LockedUser, types::*};

pub(super) async fn issue_existing(
  pool: &sqlx::PgPool,
  config: &super::super::BackendRuntimeConfig,
  user_id: &str,
  input: SessionIssueInput,
) -> RuntimeResult<LoginResult> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin existing user issuance", error))?;
  let user = super::session::lock_user(&mut tx, user_id).await?;
  if user.disabled {
    return Err(RuntimeError::invalid_state("wrong_sign_in_credentials"));
  }
  let now = super::session::decision_time(&mut tx).await?;
  let result = issue(&mut tx, config, user_id, &user, input, now, None).await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit existing user issuance", error))?;
  Ok(result)
}

pub(super) async fn issue(
  tx: &mut Transaction<'_, Postgres>,
  config: &super::super::BackendRuntimeConfig,
  user_id: &str,
  user: &LockedUser,
  input: SessionIssueInput,
  now: DateTime<Utc>,
  created: Option<bool>,
) -> RuntimeResult<LoginResult> {
  let (session_id, session_expires_at, exchange_code) = match input {
    SessionIssueInput::Native { client_version } => {
      let code = uuid::Uuid::new_v4().to_string();
      let payload = serde_json::json!({
        "userId": user_id,
        "clientVersion": client_version,
        "authEpoch": user.auth_epoch,
      });
      sqlx::query(
        r#"INSERT INTO runtime_states(purpose,token_hash,lookup_key,payload,expires_at)
           VALUES($1,$2,NULL,$3,$4+make_interval(secs=>$5))"#,
      )
      .bind(AuthChallengePurpose::AuthSessionExchange.as_str())
      .bind(super::super::token_hash(&code))
      .bind(payload)
      .bind(now)
      .bind(SESSION_EXCHANGE_TTL_SECONDS)
      .execute(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database("create login session exchange", error))?;
      (None, None, Some(code))
    }
    SessionIssueInput::Cookie {
      session_id,
      client_version,
    } => {
      let existing = if let Some(session_id) = session_id.filter(|id| !id.is_empty()) {
        sqlx::query_scalar::<_, String>("SELECT id FROM multiple_users_sessions WHERE id=$1 FOR UPDATE")
          .bind(session_id)
          .fetch_optional(&mut **tx)
          .await
          .map_err(|error| RuntimeError::database("lock login cookie session", error))?
      } else {
        None
      };
      let create_session = existing.is_none();
      let session_id = existing.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
      if create_session {
        sqlx::query("INSERT INTO multiple_users_sessions(id,created_at) VALUES($1,$2)")
          .bind(&session_id)
          .bind(now)
          .execute(&mut **tx)
          .await
          .map_err(|error| RuntimeError::database("create login cookie session", error))?;
      }
      let expires_at = cookie_session_deadline(now, config.auth.session_ttl_seconds);
      sqlx::query(
        r#"INSERT INTO user_sessions(id,session_id,user_id,expires_at,sign_in_client_version,created_at)
           VALUES($1,$2,$3,$4,$5,$6)
           ON CONFLICT(session_id,user_id) DO UPDATE SET
             expires_at=EXCLUDED.expires_at,
             sign_in_client_version=COALESCE(EXCLUDED.sign_in_client_version,user_sessions.sign_in_client_version)"#,
      )
      .bind(uuid::Uuid::new_v4().to_string())
      .bind(&session_id)
      .bind(user_id)
      .bind(expires_at)
      .bind(client_version)
      .bind(now)
      .execute(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database("create login user session", error))?;
      (Some(session_id), Some(expires_at), None)
    }
  };
  Ok(LoginResult {
    user: load_current_user(tx, user_id).await?,
    session_id,
    session_expires_at,
    exchange_code,
    created,
  })
}

pub(super) async fn load_current_user(tx: &mut Transaction<'_, Postgres>, user_id: &str) -> RuntimeResult<CurrentUser> {
  let row = sqlx::query(
    r#"SELECT id,email,avatar_url,name,disabled,(password IS NOT NULL) AS has_password,
              (email_verified IS NOT NULL) AS email_verified
       FROM users WHERE id=$1"#,
  )
  .bind(user_id)
  .fetch_one(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("load login user", error))?;
  Ok(CurrentUser {
    id: row.get("id"),
    email: row.get("email"),
    avatar_url: row.get("avatar_url"),
    name: row.get("name"),
    disabled: row.get("disabled"),
    has_password: row.get("has_password"),
    email_verified: row.get("email_verified"),
  })
}
