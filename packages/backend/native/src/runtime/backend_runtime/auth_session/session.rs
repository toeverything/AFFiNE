use affine_core::auth::{access_token_deadline, challenge_identity_matches, session_deadlines};
use chrono::{DateTime, Utc};
use sqlx::{PgConnection, PgPool, Row};

use super::{RuntimeError, RuntimeResult, keyring, types::*};
use crate::auth_session::{AuthSessionRefreshToken, create_auth_session_refresh_token, sign_auth_session_access_token};

const SESSION_EXCHANGE_PURPOSE: &str = affine_core::auth::AuthChallengePurpose::AuthSessionExchange.as_str();

pub(super) async fn exchange(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  code: &str,
  installation_id: &str,
  platform: &str,
  device_name: Option<&str>,
  app_version: Option<&str>,
) -> RuntimeResult<TokenPair> {
  validate_metadata(code, installation_id, platform)?;
  keyring::initialize(pool, config).await?;
  let challenge_key = super::super::token_hash(code);
  let preview = sqlx::query(
    r#"SELECT payload FROM runtime_states
       WHERE purpose=$1 AND token_hash=$2
         AND consumed_at IS NULL AND expires_at>clock_timestamp()"#,
  )
  .bind(SESSION_EXCHANGE_PURPOSE)
  .bind(&challenge_key)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load auth session exchange", error))?
  .ok_or_else(|| RuntimeError::invalid_state("invalid_auth_state"))?;
  let preview: serde_json::Value = preview.get("payload");
  let user_id = preview
    .get("userId")
    .and_then(serde_json::Value::as_str)
    .filter(|value| !value.is_empty())
    .ok_or_else(|| RuntimeError::invalid_state("invalid_auth_state"))?
    .to_string();
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin auth session exchange", error))?;
  let user = match lock_user(&mut tx, &user_id).await {
    Ok(user) => user,
    Err(RuntimeError::InvalidState(_)) => return Err(RuntimeError::invalid_state("invalid_auth_state")),
    Err(error) => return Err(error),
  };
  if user.disabled {
    return Err(RuntimeError::invalid_state("invalid_auth_state"));
  }
  let challenge = sqlx::query(
    r#"SELECT payload FROM runtime_states
       WHERE purpose=$1 AND token_hash=$2
         AND consumed_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE"#,
  )
  .bind(SESSION_EXCHANGE_PURPOSE)
  .bind(&challenge_key)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("lock auth session exchange", error))?
  .ok_or_else(|| RuntimeError::invalid_state("invalid_auth_state"))?;
  let challenge: serde_json::Value = challenge.get("payload");
  if !challenge_identity_matches(
    challenge.get("userId").and_then(serde_json::Value::as_str),
    &user_id,
    challenge.get("authEpoch").and_then(serde_json::Value::as_i64),
    user.auth_epoch,
  ) {
    return Err(RuntimeError::invalid_state("invalid_auth_state"));
  }
  let now = decision_time(&mut tx).await?;
  let deadlines = session_deadlines(
    now,
    config.auth.access_token_ttl_seconds,
    config.auth.refresh_idle_ttl_seconds,
    config.auth.refresh_absolute_ttl_seconds,
  );
  let absolute_expires_at = deadlines.refresh_absolute_expires_at;
  let idle_expires_at = deadlines.refresh_idle_expires_at;
  let is_new_device: bool = !sqlx::query_scalar(
    r#"SELECT EXISTS(
         SELECT 1 FROM auth_sessions a JOIN user_sessions u ON u.id=a.user_session_id
         WHERE u.user_id=$1 AND a.installation_id=$2)"#,
  )
  .bind(&user_id)
  .bind(installation_id)
  .fetch_one(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("check auth session installation", error))?;
  let session_id = uuid::Uuid::new_v4().to_string();
  let user_session_id = uuid::Uuid::new_v4().to_string();
  let auth_session_id = uuid::Uuid::new_v4().to_string();
  let refresh = create_auth_session_refresh_token();
  sqlx::query("INSERT INTO multiple_users_sessions(id,created_at) VALUES($1,$2)")
    .bind(&session_id)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("create auth cookie session", error))?;
  sqlx::query(
    r#"INSERT INTO user_sessions(
         id,session_id,user_id,expires_at,sign_in_client_version,refresh_client_version,created_at)
       VALUES($1,$2,$3,$4,$5,$5,$6)"#,
  )
  .bind(&user_session_id)
  .bind(&session_id)
  .bind(&user_id)
  .bind(idle_expires_at)
  .bind(app_version.or_else(|| challenge.get("clientVersion").and_then(serde_json::Value::as_str)))
  .bind(now)
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("create auth user session", error))?;
  sqlx::query(
    r#"INSERT INTO auth_sessions(
         id,user_session_id,installation_id,platform,device_name,app_version,
         created_at,last_seen_at,idle_expires_at,absolute_expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9)"#,
  )
  .bind(&auth_session_id)
  .bind(&user_session_id)
  .bind(installation_id)
  .bind(platform)
  .bind(device_name)
  .bind(app_version)
  .bind(now)
  .bind(idle_expires_at)
  .bind(absolute_expires_at)
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("create auth session", error))?;
  sqlx::query(
    r#"INSERT INTO auth_refresh_tokens(
         id,auth_session_id,generation,secret_hash,created_at,expires_at)
       VALUES($1,$2,0,$3,$4,$5)"#,
  )
  .bind(&refresh.id)
  .bind(&auth_session_id)
  .bind(&refresh.secret_hash)
  .bind(now)
  .bind(idle_expires_at)
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("create auth refresh token", error))?;
  sqlx::query("UPDATE runtime_states SET consumed_at=$3,updated_at=$3 WHERE purpose=$1 AND token_hash=$2")
    .bind(SESSION_EXCHANGE_PURPOSE)
    .bind(&challenge_key)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("consume auth session exchange", error))?;
  let mut pair = token_pair(
    &mut tx,
    config,
    &user_id,
    refresh,
    idle_expires_at,
    TokenPairSession {
      id: auth_session_id,
      absolute_expires_at,
    },
    now,
  )
  .await?;
  pair.is_new_device = Some(is_new_device);
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit auth session exchange", error))?;
  Ok(pair)
}

pub(super) async fn token_pair(
  connection: &mut PgConnection,
  config: &super::super::BackendRuntimeConfig,
  user_id: &str,
  refresh: AuthSessionRefreshToken,
  refresh_expires_at: DateTime<Utc>,
  session: TokenPairSession,
  now: DateTime<Utc>,
) -> RuntimeResult<TokenPair> {
  let signing_key = keyring::active(connection, config).await?;
  let expires_at = access_token_deadline(now, config.auth.access_token_ttl_seconds);
  let access_token = sign_auth_session_access_token(
    user_id,
    &session.id,
    &signing_key.id,
    &signing_key.secret,
    now.timestamp(),
    expires_at.timestamp(),
  )
  .map_err(RuntimeError::invalid_state)?;
  Ok(TokenPair {
    user_id: user_id.to_string(),
    token_type: "Bearer",
    access_token,
    expires_in: config.auth.access_token_ttl_seconds,
    refresh_token: refresh.token,
    refresh_expires_at,
    session,
    is_new_device: None,
  })
}

pub(super) async fn revoke(
  pool: &PgPool,
  auth_session_id: &str,
  expected_user_id: Option<&str>,
  reason: &str,
) -> RuntimeResult<bool> {
  let owner = sqlx::query(
    r#"SELECT u.user_id,a.user_session_id FROM auth_sessions a
       JOIN user_sessions u ON u.id=a.user_session_id WHERE a.id=$1"#,
  )
  .bind(auth_session_id)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load auth session owner", error))?;
  let Some(owner) = owner else {
    return Ok(false);
  };
  let user_id: String = owner.get("user_id");
  if expected_user_id.is_some_and(|expected| expected != user_id) {
    return Ok(false);
  }
  let user_session_id: String = owner.get("user_session_id");
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin auth session revoke", error))?;
  lock_user(&mut tx, &user_id).await?;
  lock_user_session(&mut tx, &user_session_id).await?;
  let locked = sqlx::query_scalar::<_, String>("SELECT id FROM auth_sessions WHERE id=$1 FOR UPDATE")
    .bind(auth_session_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("lock auth session", error))?;
  if locked.is_none() {
    return Ok(false);
  }
  lock_refresh_tokens(&mut tx, auth_session_id).await?;
  let now = decision_time(&mut tx).await?;
  let changed =
    sqlx::query("UPDATE auth_sessions SET revoked_at=$2,revoke_reason=$3 WHERE id=$1 AND revoked_at IS NULL")
      .bind(auth_session_id)
      .bind(now)
      .bind(reason)
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("revoke auth session", error))?
      .rows_affected()
      == 1;
  sqlx::query("UPDATE auth_refresh_tokens SET revoked_at=$2 WHERE auth_session_id=$1 AND revoked_at IS NULL")
    .bind(auth_session_id)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("revoke auth refresh tokens", error))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit auth session revoke", error))?;
  Ok(changed)
}

pub(super) async fn list(pool: &PgPool, user_id: &str) -> RuntimeResult<Vec<AuthSessionListItem>> {
  let rows = sqlx::query(
    r#"SELECT a.id,a.installation_id,a.platform,a.device_name,a.app_version,a.created_at,a.last_seen_at,
              a.idle_expires_at,a.absolute_expires_at,a.revoked_at,a.revoke_reason
       FROM auth_sessions a JOIN user_sessions u ON u.id=a.user_session_id
       WHERE u.user_id=$1 AND (u.expires_at IS NULL OR u.expires_at>clock_timestamp())
         AND a.revoked_at IS NULL AND a.idle_expires_at>clock_timestamp() AND a.absolute_expires_at>clock_timestamp()
       ORDER BY a.last_seen_at DESC"#,
  )
  .bind(user_id)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("list auth sessions", error))?;
  Ok(rows.into_iter().map(auth_session_item).collect())
}

pub(super) async fn cleanup(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  limit: i64,
) -> RuntimeResult<i64> {
  if limit <= 0 {
    return Err(RuntimeError::invalid_input("auth cleanup limit must be positive"));
  }
  let cleared = sqlx::query(
    r#"UPDATE auth_refresh_tokens SET successor_ciphertext=NULL,successor_expires_at=NULL
       WHERE id IN (SELECT id FROM auth_refresh_tokens WHERE successor_expires_at<=clock_timestamp() LIMIT $1)"#,
  )
  .bind(limit)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("cleanup auth successor material", error))?
  .rows_affected();
  let deleted_tokens = sqlx::query(
    r#"DELETE FROM auth_refresh_tokens WHERE id IN (
         SELECT r.id FROM auth_refresh_tokens r JOIN auth_sessions a ON a.id=r.auth_session_id
         WHERE r.expires_at<clock_timestamp()-($2*INTERVAL '1 second')
            OR a.revoked_at<clock_timestamp()-($2*INTERVAL '1 second')
         ORDER BY r.expires_at LIMIT $1)"#,
  )
  .bind(limit)
  .bind(config.auth.refresh_retention_seconds as f64)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("cleanup auth refresh tokens", error))?
  .rows_affected();
  let deleted_sessions = sqlx::query(
    r#"DELETE FROM auth_sessions WHERE id IN (
         SELECT id FROM auth_sessions
         WHERE absolute_expires_at<clock_timestamp()-($2*INTERVAL '1 second')
            OR revoked_at<clock_timestamp()-($2*INTERVAL '1 second')
         ORDER BY absolute_expires_at LIMIT $1)"#,
  )
  .bind(limit)
  .bind(config.auth.refresh_retention_seconds as f64)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("cleanup auth sessions", error))?
  .rows_affected();
  Ok(i64::try_from(cleared + deleted_tokens + deleted_sessions).unwrap_or(i64::MAX))
}

pub(super) struct LockedUser {
  pub(super) disabled: bool,
  pub(super) auth_epoch: i32,
}

pub(super) async fn lock_user(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  user_id: &str,
) -> RuntimeResult<LockedUser> {
  let row = sqlx::query("SELECT disabled,auth_epoch FROM users WHERE id=$1 FOR UPDATE")
    .bind(user_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock auth user", error))?
    .ok_or_else(|| RuntimeError::invalid_state("auth user does not exist"))?;
  Ok(LockedUser {
    disabled: row.get("disabled"),
    auth_epoch: row.get("auth_epoch"),
  })
}

pub(super) async fn lock_user_session(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  user_session_id: &str,
) -> RuntimeResult<()> {
  sqlx::query("SELECT id FROM user_sessions WHERE id=$1 FOR UPDATE")
    .bind(user_session_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock auth user session", error))?
    .ok_or_else(|| RuntimeError::invalid_state("auth user session does not exist"))?;
  Ok(())
}

pub(super) async fn lock_refresh_tokens(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  auth_session_id: &str,
) -> RuntimeResult<()> {
  sqlx::query("SELECT id FROM auth_refresh_tokens WHERE auth_session_id=$1 ORDER BY id FOR UPDATE")
    .bind(auth_session_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock auth refresh tokens", error))?;
  Ok(())
}

pub(super) async fn decision_time(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> RuntimeResult<DateTime<Utc>> {
  sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("load auth decision time", error))
}

fn auth_session_item(row: sqlx::postgres::PgRow) -> AuthSessionListItem {
  AuthSessionListItem {
    id: row.get("id"),
    installation_id: row.get("installation_id"),
    platform: row.get("platform"),
    device_name: row.get("device_name"),
    app_version: row.get("app_version"),
    created_at: row.get("created_at"),
    last_seen_at: row.get("last_seen_at"),
    idle_expires_at: row.get("idle_expires_at"),
    absolute_expires_at: row.get("absolute_expires_at"),
    revoked_at: row.get("revoked_at"),
    revoke_reason: row.get("revoke_reason"),
  }
}

fn validate_metadata(code: &str, installation_id: &str, platform: &str) -> RuntimeResult<()> {
  if code.is_empty()
    || installation_id.trim().is_empty()
    || installation_id != installation_id.trim()
    || !matches!(platform, "ios" | "android" | "electron")
  {
    return Err(RuntimeError::invalid_input("invalid auth session exchange input"));
  }
  Ok(())
}
