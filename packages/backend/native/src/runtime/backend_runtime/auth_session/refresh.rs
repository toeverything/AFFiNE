use affine_core::auth::{
  RefreshState, SessionFacts, SessionState, refresh_state, refreshed_idle_deadline, session_state,
};
use chrono::{DateTime, Duration, Utc};
use sqlx::{PgPool, Row};
use subtle::ConstantTimeEq;

use super::{
  RuntimeError, RuntimeResult, TokenPairSession,
  session::{decision_time, lock_refresh_tokens, lock_user, lock_user_session, token_pair},
  successor::SuccessorKey,
  types::RefreshResult,
};
use crate::auth_session::{create_auth_session_refresh_token, parse_auth_session_refresh_token};

struct RefreshRow {
  id: String,
  auth_session_id: String,
  user_session_id: String,
  user_id: String,
  generation: i32,
  secret_hash: String,
  token_expires_at: DateTime<Utc>,
  used_at: Option<DateTime<Utc>>,
  replaced_by_id: Option<String>,
  grace_used_at: Option<DateTime<Utc>>,
  token_revoked_at: Option<DateTime<Utc>>,
  successor_ciphertext: Option<String>,
  successor_expires_at: Option<DateTime<Utc>>,
  platform: String,
  idle_expires_at: DateTime<Utc>,
  absolute_expires_at: DateTime<Utc>,
  session_revoked_at: Option<DateTime<Utc>>,
  user_session_expires_at: Option<DateTime<Utc>>,
}

pub(super) async fn refresh(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  refresh_token: &str,
  app_version: Option<&str>,
) -> RuntimeResult<RefreshResult> {
  let Some(parsed) = parse_auth_session_refresh_token(refresh_token) else {
    return Ok(invalid());
  };
  let Some(owner) = discover_owner(pool, &parsed.id).await? else {
    return Ok(invalid());
  };
  if !consume_refresh_rate_limit(pool, &parsed.id).await? {
    return Ok(RefreshResult::RateLimited {
      code: "AUTH_REFRESH_RATE_LIMITED",
    });
  }
  let encryption_key = SuccessorKey::derive(config.private_key.as_bytes())?;
  let candidate = create_auth_session_refresh_token();
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin auth refresh", error))?;
  let user = lock_user(&mut tx, &owner.user_id).await?;
  lock_user_session(&mut tx, &owner.user_session_id).await?;
  sqlx::query("SELECT id FROM auth_sessions WHERE id=$1 AND user_session_id=$2 FOR UPDATE")
    .bind(&owner.auth_session_id)
    .bind(&owner.user_session_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("lock auth session for refresh", error))?
    .ok_or_else(|| RuntimeError::invalid_state("auth session disappeared"))?;
  lock_refresh_tokens(&mut tx, &owner.auth_session_id).await?;
  let Some(row) = load_refresh(&mut tx, &parsed.id).await? else {
    return Ok(invalid());
  };
  if row.user_id != owner.user_id
    || row.user_session_id != owner.user_session_id
    || row.auth_session_id != owner.auth_session_id
    || !hashes_equal(&row.secret_hash, &parsed.secret_hash)
  {
    return Ok(invalid());
  }
  let now = decision_time(&mut tx).await?;
  match session_state(&SessionFacts {
    now,
    user_disabled: user.disabled,
    session_revoked: row.session_revoked_at.is_some(),
    token_revoked: row.token_revoked_at.is_some(),
    token_expires_at: row.token_expires_at,
    idle_expires_at: row.idle_expires_at,
    absolute_expires_at: row.absolute_expires_at,
    user_session_expires_at: row.user_session_expires_at,
  }) {
    SessionState::Revoked => {
      if user.disabled && row.session_revoked_at.is_none() {
        revoke_locked(&mut tx, &row.auth_session_id, "user_disabled", now).await?;
        tx.commit()
          .await
          .map_err(|error| RuntimeError::database("commit disabled auth session revoke", error))?;
      }
      return Ok(RefreshResult::Revoked {
        code: "AUTH_SESSION_REVOKED",
      });
    }
    SessionState::Expired => {
      return Ok(RefreshResult::Expired {
        code: "AUTH_SESSION_EXPIRED",
      });
    }
    SessionState::Active => {}
  }
  let replacement = match row.replaced_by_id.as_deref() {
    Some(id) => load_replacement(&mut tx, id).await?,
    None => None,
  };
  let successor_available = row.successor_ciphertext.is_some()
    && row.successor_expires_at.is_some_and(|expires_at| expires_at > now)
    && replacement.as_ref().is_some_and(|replacement| {
      replacement.used_at.is_none() && replacement.revoked_at.is_none() && replacement.expires_at > now
    });
  let state = refresh_state(
    row.used_at,
    row.grace_used_at,
    row.replaced_by_id.is_some(),
    successor_available,
    replacement
      .as_ref()
      .is_some_and(|replacement| replacement.used_at.is_none()),
    now,
    Duration::seconds(config.auth.refresh_grace_seconds),
  );
  match state {
    RefreshState::Rotate => {
      let refresh_expires_at =
        refreshed_idle_deadline(now, config.auth.refresh_idle_ttl_seconds, row.absolute_expires_at);
      let successor_expires_at = now + Duration::seconds(config.auth.refresh_grace_seconds);
      let ciphertext = encryption_key.encrypt(&candidate.token, &row.id, &row.auth_session_id)?;
      sqlx::query(
        r#"INSERT INTO auth_refresh_tokens(
             id,auth_session_id,generation,secret_hash,created_at,expires_at)
           VALUES($1,$2,$3,$4,$5,$6)"#,
      )
      .bind(&candidate.id)
      .bind(&row.auth_session_id)
      .bind(row.generation.saturating_add(1))
      .bind(&candidate.secret_hash)
      .bind(now)
      .bind(refresh_expires_at)
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("create auth refresh successor", error))?;
      sqlx::query(
        r#"UPDATE auth_refresh_tokens
           SET used_at=$2,replaced_by_id=$3,successor_ciphertext=$4,successor_expires_at=$5
           WHERE id=$1 AND used_at IS NULL"#,
      )
      .bind(&row.id)
      .bind(now)
      .bind(&candidate.id)
      .bind(ciphertext)
      .bind(successor_expires_at)
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("rotate auth refresh source", error))?;
      update_session(&mut tx, &row, refresh_expires_at, app_version, now).await?;
      let pair = token_pair(
        &mut tx,
        config,
        &row.user_id,
        candidate,
        refresh_expires_at,
        TokenPairSession {
          id: row.auth_session_id.clone(),
          absolute_expires_at: row.absolute_expires_at,
        },
        now,
      )
      .await?;
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit auth refresh rotation", error))?;
      Ok(RefreshResult::Rotated {
        pair,
        auth_session_id: row.auth_session_id,
        platform: row.platform,
        grace: false,
      })
    }
    RefreshState::Grace => {
      let replacement = replacement.ok_or_else(|| RuntimeError::invalid_state("auth refresh successor is missing"))?;
      let ciphertext = row
        .successor_ciphertext
        .as_deref()
        .ok_or_else(|| RuntimeError::invalid_state("auth refresh successor is missing"))?;
      let token = match encryption_key.decrypt(ciphertext, &row.id, &row.auth_session_id) {
        Ok(token) => token,
        Err(_) => {
          return Ok(RefreshResult::TemporarilyUnavailable {
            code: "AUTH_SESSION_TEMPORARILY_UNAVAILABLE",
          });
        }
      };
      let Some(recovered) = parse_auth_session_refresh_token(&token) else {
        return Ok(RefreshResult::TemporarilyUnavailable {
          code: "AUTH_SESSION_TEMPORARILY_UNAVAILABLE",
        });
      };
      if recovered.id != replacement.id || !hashes_equal(&recovered.secret_hash, &replacement.secret_hash) {
        return Ok(RefreshResult::TemporarilyUnavailable {
          code: "AUTH_SESSION_TEMPORARILY_UNAVAILABLE",
        });
      }
      sqlx::query("UPDATE auth_refresh_tokens SET grace_used_at=$2 WHERE id=$1 AND grace_used_at IS NULL")
        .bind(&row.id)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("claim auth refresh grace", error))?;
      let pair = token_pair(
        &mut tx,
        config,
        &row.user_id,
        crate::auth_session::AuthSessionRefreshToken {
          token,
          id: replacement.id,
          secret_hash: replacement.secret_hash,
        },
        replacement.expires_at,
        TokenPairSession {
          id: row.auth_session_id.clone(),
          absolute_expires_at: row.absolute_expires_at,
        },
        now,
      )
      .await?;
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit auth refresh grace", error))?;
      Ok(RefreshResult::Rotated {
        pair,
        auth_session_id: row.auth_session_id,
        platform: row.platform,
        grace: true,
      })
    }
    RefreshState::Replay => {
      revoke_locked(&mut tx, &row.auth_session_id, "refresh_token_reused", now).await?;
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit auth refresh replay revoke", error))?;
      Ok(RefreshResult::Reused {
        code: "REFRESH_TOKEN_REUSED",
        user_id: row.user_id,
        auth_session_id: row.auth_session_id,
        platform: row.platform,
      })
    }
    RefreshState::Unavailable => Ok(RefreshResult::TemporarilyUnavailable {
      code: "AUTH_SESSION_TEMPORARILY_UNAVAILABLE",
    }),
  }
}

pub(super) async fn consume_refresh_rate_limit(pool: &PgPool, selector: &str) -> RuntimeResult<bool> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin auth refresh rate limit", error))?;
  let now = decision_time(&mut tx).await?;
  let allowed = super::super::rolling_quota::commit_scopes_in_transaction(
    &mut tx,
    &[affine_core::rate_limit::auth_refresh_scope(selector)],
    now,
  )
  .await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit auth refresh rate limit", error))?;
  Ok(allowed)
}

pub(super) async fn revoke_by_token(pool: &PgPool, refresh_token: &str) -> RuntimeResult<bool> {
  let Some(parsed) = parse_auth_session_refresh_token(refresh_token) else {
    return Ok(false);
  };
  let Some(owner) = discover_owner(pool, &parsed.id).await? else {
    return Ok(false);
  };
  let stored_hash: Option<String> = sqlx::query_scalar("SELECT secret_hash FROM auth_refresh_tokens WHERE id=$1")
    .bind(&parsed.id)
    .fetch_optional(pool)
    .await
    .map_err(|error| RuntimeError::database("load auth refresh token", error))?;
  if stored_hash.is_none_or(|stored| !hashes_equal(&stored, &parsed.secret_hash)) {
    return Ok(false);
  }
  super::session::revoke(pool, &owner.auth_session_id, None, "refresh_token_revoke").await
}

struct Owner {
  auth_session_id: String,
  user_session_id: String,
  user_id: String,
}

async fn discover_owner(pool: &PgPool, token_id: &str) -> RuntimeResult<Option<Owner>> {
  let row = sqlx::query(
    r#"SELECT r.auth_session_id,a.user_session_id,u.user_id
       FROM auth_refresh_tokens r JOIN auth_sessions a ON a.id=r.auth_session_id
       JOIN user_sessions u ON u.id=a.user_session_id WHERE r.id=$1"#,
  )
  .bind(token_id)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("discover auth refresh owner", error))?;
  Ok(row.map(|row| Owner {
    auth_session_id: row.get("auth_session_id"),
    user_session_id: row.get("user_session_id"),
    user_id: row.get("user_id"),
  }))
}

async fn load_refresh(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  token_id: &str,
) -> RuntimeResult<Option<RefreshRow>> {
  let row = sqlx::query(
    r#"SELECT r.id,r.auth_session_id,r.generation,r.secret_hash,r.expires_at AS token_expires_at,
              r.used_at,r.replaced_by_id,r.grace_used_at,r.revoked_at AS token_revoked_at,
              r.successor_ciphertext,r.successor_expires_at,a.user_session_id,a.platform,
              a.idle_expires_at,a.absolute_expires_at,a.revoked_at AS session_revoked_at,
              u.user_id,u.expires_at AS user_session_expires_at
       FROM auth_refresh_tokens r JOIN auth_sessions a ON a.id=r.auth_session_id
       JOIN user_sessions u ON u.id=a.user_session_id WHERE r.id=$1"#,
  )
  .bind(token_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("load locked auth refresh", error))?;
  Ok(row.map(|row| RefreshRow {
    id: row.get("id"),
    auth_session_id: row.get("auth_session_id"),
    user_session_id: row.get("user_session_id"),
    user_id: row.get("user_id"),
    generation: row.get("generation"),
    secret_hash: row.get("secret_hash"),
    token_expires_at: row.get("token_expires_at"),
    used_at: row.get("used_at"),
    replaced_by_id: row.get("replaced_by_id"),
    grace_used_at: row.get("grace_used_at"),
    token_revoked_at: row.get("token_revoked_at"),
    successor_ciphertext: row.get("successor_ciphertext"),
    successor_expires_at: row.get("successor_expires_at"),
    platform: row.get("platform"),
    idle_expires_at: row.get("idle_expires_at"),
    absolute_expires_at: row.get("absolute_expires_at"),
    session_revoked_at: row.get("session_revoked_at"),
    user_session_expires_at: row.get("user_session_expires_at"),
  }))
}

struct Replacement {
  id: String,
  secret_hash: String,
  expires_at: DateTime<Utc>,
  used_at: Option<DateTime<Utc>>,
  revoked_at: Option<DateTime<Utc>>,
}

async fn load_replacement(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  token_id: &str,
) -> RuntimeResult<Option<Replacement>> {
  let row = sqlx::query("SELECT id,secret_hash,expires_at,used_at,revoked_at FROM auth_refresh_tokens WHERE id=$1")
    .bind(token_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("load auth refresh successor", error))?;
  Ok(row.map(|row| Replacement {
    id: row.get("id"),
    secret_hash: row.get("secret_hash"),
    expires_at: row.get("expires_at"),
    used_at: row.get("used_at"),
    revoked_at: row.get("revoked_at"),
  }))
}

async fn update_session(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  row: &RefreshRow,
  expires_at: DateTime<Utc>,
  app_version: Option<&str>,
  now: DateTime<Utc>,
) -> RuntimeResult<()> {
  sqlx::query("UPDATE auth_sessions SET last_seen_at=$2,idle_expires_at=$3,app_version=$4 WHERE id=$1")
    .bind(&row.auth_session_id)
    .bind(now)
    .bind(expires_at)
    .bind(app_version)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("refresh auth session", error))?;
  sqlx::query("UPDATE user_sessions SET expires_at=$2,refresh_client_version=$3 WHERE id=$1")
    .bind(&row.user_session_id)
    .bind(expires_at)
    .bind(app_version)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("refresh auth user session", error))?;
  Ok(())
}

async fn revoke_locked(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  auth_session_id: &str,
  reason: &str,
  now: DateTime<Utc>,
) -> RuntimeResult<()> {
  sqlx::query("UPDATE auth_sessions SET revoked_at=$2,revoke_reason=$3 WHERE id=$1 AND revoked_at IS NULL")
    .bind(auth_session_id)
    .bind(now)
    .bind(reason)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("revoke replayed auth session", error))?;
  sqlx::query("UPDATE auth_refresh_tokens SET revoked_at=$2 WHERE auth_session_id=$1 AND revoked_at IS NULL")
    .bind(auth_session_id)
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("revoke replayed auth refresh tokens", error))?;
  Ok(())
}

fn hashes_equal(left: &str, right: &str) -> bool {
  let (Ok(left), Ok(right)) = (hex::decode(left), hex::decode(right)) else {
    return false;
  };
  left.len() == right.len() && bool::from(left.as_slice().ct_eq(right.as_slice()))
}

fn invalid() -> RefreshResult {
  RefreshResult::Invalid {
    code: "REFRESH_TOKEN_INVALID",
  }
}
