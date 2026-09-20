use affine_core::auth::{SessionFacts, SessionState, cookie_session_deadline, session_state};
use chrono::{Duration, Utc};
use sqlx::{PgPool, Row};

use super::{
  RuntimeError, RuntimeResult, keyring,
  session::{decision_time, lock_user, lock_user_session},
  types::{CurrentUser, Principal, PrincipalInput, PrincipalResult},
};
use crate::auth_session::{auth_session_access_token_key_id, verify_auth_session_access_token};

pub(super) async fn resolve(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  input: PrincipalInput,
) -> RuntimeResult<PrincipalResult> {
  match input {
    PrincipalInput::AccessToken { token } => access_token(pool, config, &token).await,
    PrincipalInput::Cookie {
      session_id,
      user_id,
      refresh_client_version,
      refresh,
    } => {
      cookie(
        pool,
        config,
        &session_id,
        user_id.as_deref(),
        refresh_client_version.as_deref(),
        refresh,
      )
      .await
    }
  }
}

async fn access_token(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  token: &str,
) -> RuntimeResult<PrincipalResult> {
  let Some(key_id) = auth_session_access_token_key_id(token) else {
    return Ok(PrincipalResult::Invalid);
  };
  let now: chrono::DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(pool)
    .await
    .map_err(|error| RuntimeError::database("load access token decision time", error))?;
  let Some(key) = keyring::verify(pool, config, &key_id, now).await? else {
    return Ok(PrincipalResult::Invalid);
  };
  let verified = verify_auth_session_access_token(token, &key.id, &key.secret, now.timestamp());
  if verified.status == "expired" {
    return Ok(PrincipalResult::AccessTokenExpired);
  }
  if verified.status != "valid" {
    return Ok(PrincipalResult::Invalid);
  }
  let (Some(user_id), Some(auth_session_id)) = (verified.user_id, verified.auth_session_id) else {
    return Ok(PrincipalResult::Invalid);
  };
  let user_session_id: Option<String> = sqlx::query_scalar("SELECT user_session_id FROM auth_sessions WHERE id=$1")
    .bind(&auth_session_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| RuntimeError::database("discover access token session", error))?;
  let Some(user_session_id) = user_session_id else {
    return Ok(PrincipalResult::Invalid);
  };
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin access token principal", error))?;
  let user = match lock_user(&mut tx, &user_id).await {
    Ok(user) => user,
    Err(_) => return Ok(PrincipalResult::Invalid),
  };
  if lock_user_session(&mut tx, &user_session_id).await.is_err() {
    return Ok(PrincipalResult::Invalid);
  }
  sqlx::query("SELECT id FROM auth_sessions WHERE id=$1 AND user_session_id=$2 FOR UPDATE")
    .bind(&auth_session_id)
    .bind(&user_session_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("lock access token session", error))?
    .ok_or_else(|| RuntimeError::invalid_state("access token auth session disappeared"))?;
  let now = decision_time(&mut tx).await?;
  let row = load_principal(&mut tx, &user_session_id, Some(&auth_session_id)).await?;
  if row.user_id != user_id {
    return Ok(PrincipalResult::Invalid);
  }
  let (Some(idle_expires_at), Some(absolute_expires_at)) = (row.idle_expires_at, row.absolute_expires_at) else {
    return Ok(PrincipalResult::Invalid);
  };
  match session_state(&SessionFacts {
    now,
    user_disabled: user.disabled,
    session_revoked: row.auth_revoked_at.is_some(),
    token_revoked: false,
    token_expires_at: absolute_expires_at,
    idle_expires_at,
    absolute_expires_at,
    user_session_expires_at: row.expires_at,
  }) {
    SessionState::Active => Ok(PrincipalResult::Valid {
      principal: Box::new(row.into_principal(Some(auth_session_id))),
      refreshed_expires_at: None,
    }),
    SessionState::Expired => Ok(PrincipalResult::AuthSessionExpired),
    SessionState::Revoked => Ok(PrincipalResult::AuthSessionRevoked),
  }
}

async fn cookie(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  session_id: &str,
  requested_user_id: Option<&str>,
  refresh_client_version: Option<&str>,
  refresh: bool,
) -> RuntimeResult<PrincipalResult> {
  let candidates = sqlx::query(
    r#"SELECT id,user_id FROM user_sessions
       WHERE session_id=$1 AND (expires_at IS NULL OR expires_at>clock_timestamp())
       ORDER BY created_at ASC"#,
  )
  .bind(session_id)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("load cookie session candidates", error))?;
  let selected = requested_user_id
    .and_then(|requested| {
      candidates
        .iter()
        .find(|row| row.get::<String, _>("user_id") == requested)
    })
    .or_else(|| candidates.last());
  let Some(selected) = selected else {
    return Ok(PrincipalResult::Invalid);
  };
  let user_session_id: String = selected.get("id");
  let user_id: String = selected.get("user_id");
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin cookie principal", error))?;
  let user = match lock_user(&mut tx, &user_id).await {
    Ok(user) => user,
    Err(_) => return Ok(PrincipalResult::Invalid),
  };
  if user.disabled || lock_user_session(&mut tx, &user_session_id).await.is_err() {
    return Ok(PrincipalResult::Invalid);
  }
  let now = decision_time(&mut tx).await?;
  let mut row = load_principal(&mut tx, &user_session_id, None).await?;
  if row.session_id != session_id
    || row.user_id != user_id
    || row.expires_at.is_some_and(|expires_at| expires_at <= now)
  {
    return Ok(PrincipalResult::Invalid);
  }
  let refreshed_expires_at = if refresh
    && row
      .expires_at
      .is_none_or(|expires_at| expires_at - now <= Duration::seconds(config.auth.session_ttr_seconds))
  {
    let expires_at = cookie_session_deadline(now, config.auth.session_ttl_seconds);
    sqlx::query("UPDATE user_sessions SET expires_at=$2,refresh_client_version=$3 WHERE id=$1")
      .bind(&user_session_id)
      .bind(expires_at)
      .bind(refresh_client_version)
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("refresh cookie user session", error))?;
    row.expires_at = Some(expires_at);
    row.refresh_client_version = refresh_client_version.map(str::to_string);
    Some(expires_at)
  } else {
    None
  };
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit cookie principal", error))?;
  Ok(PrincipalResult::Valid {
    principal: Box::new(row.into_principal(None)),
    refreshed_expires_at,
  })
}

struct PrincipalRow {
  id: String,
  session_id: String,
  user_id: String,
  expires_at: Option<chrono::DateTime<Utc>>,
  sign_in_client_version: Option<String>,
  refresh_client_version: Option<String>,
  created_at: chrono::DateTime<Utc>,
  email: String,
  avatar_url: Option<String>,
  name: String,
  disabled: bool,
  has_password: bool,
  email_verified: bool,
  auth_created_at: Option<chrono::DateTime<Utc>>,
  idle_expires_at: Option<chrono::DateTime<Utc>>,
  absolute_expires_at: Option<chrono::DateTime<Utc>>,
  auth_revoked_at: Option<chrono::DateTime<Utc>>,
}

impl PrincipalRow {
  fn into_principal(self, auth_session_id: Option<String>) -> Principal {
    Principal {
      id: self.id,
      session_id: self.session_id,
      user_id: self.user_id.clone(),
      expires_at: self.expires_at,
      sign_in_client_version: self.sign_in_client_version,
      refresh_client_version: self.refresh_client_version,
      created_at: self.created_at,
      auth_session_id,
      authenticated_at: self.auth_created_at,
      user: CurrentUser {
        id: self.user_id,
        email: self.email,
        avatar_url: self.avatar_url,
        name: self.name,
        disabled: self.disabled,
        has_password: self.has_password,
        email_verified: self.email_verified,
      },
    }
  }
}

async fn load_principal(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  user_session_id: &str,
  auth_session_id: Option<&str>,
) -> RuntimeResult<PrincipalRow> {
  let row = sqlx::query(
    r#"SELECT s.id,s.session_id,s.user_id,s.expires_at,s.sign_in_client_version,s.refresh_client_version,s.created_at,
              u.email,u.avatar_url,u.name,u.disabled,(u.password IS NOT NULL) AS has_password,
              (u.email_verified IS NOT NULL) AS email_verified,
              a.created_at AS auth_created_at,a.idle_expires_at,a.absolute_expires_at,a.revoked_at AS auth_revoked_at
       FROM user_sessions s JOIN users u ON u.id=s.user_id
       LEFT JOIN auth_sessions a ON a.user_session_id=s.id AND ($2::text IS NULL OR a.id=$2)
       WHERE s.id=$1"#,
  )
  .bind(user_session_id)
  .bind(auth_session_id)
  .fetch_one(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("load auth principal", error))?;
  Ok(PrincipalRow {
    id: row.get("id"),
    session_id: row.get("session_id"),
    user_id: row.get("user_id"),
    expires_at: row.get("expires_at"),
    sign_in_client_version: row.get("sign_in_client_version"),
    refresh_client_version: row.get("refresh_client_version"),
    created_at: row.get("created_at"),
    email: row.get("email"),
    avatar_url: row.get("avatar_url"),
    name: row.get("name"),
    disabled: row.get("disabled"),
    has_password: row.get("has_password"),
    email_verified: row.get("email_verified"),
    auth_created_at: row.get("auth_created_at"),
    idle_expires_at: row.get("idle_expires_at"),
    absolute_expires_at: row.get("absolute_expires_at"),
    auth_revoked_at: row.get("auth_revoked_at"),
  })
}
