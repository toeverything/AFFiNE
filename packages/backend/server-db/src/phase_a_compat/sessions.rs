//! Dual-table session repository (`multiple_users_sessions`,
//! `user_sessions`, `auth_sessions`, `auth_refresh_tokens`) compatible
//! with `v0.27.5` rolling co-existence.

use chrono::{DateTime, Duration, Utc};
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use crate::{
  DbError,
  sessions::{
    AuthSessionRecord, IssuedAuthSession, IssuedCookieSession, NewAuthSessionInput, ResolvedCookieSession,
    SessionRepository,
  },
};

/// Co-existence implementation of [`SessionRepository`].
#[derive(Clone, Copy, Debug, Default)]
pub struct PhaseASessionRepository;

#[async_trait::async_trait]
impl SessionRepository for PhaseASessionRepository {
  async fn issue_cookie_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    existing_session_id: Option<&str>,
    client_version: Option<&str>,
    ttl_seconds: i64,
    now: DateTime<Utc>,
  ) -> Result<IssuedCookieSession, DbError> {
    let existing = if let Some(sid) = existing_session_id.filter(|id| !id.is_empty()) {
      sqlx::query_scalar::<_, String>("SELECT id FROM multiple_users_sessions WHERE id = $1 FOR UPDATE")
        .bind(sid)
        .fetch_optional(&mut **tx)
        .await?
    } else {
      None
    };

    let session_id = match existing {
      Some(id) => id,
      None => {
        let new_id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO multiple_users_sessions (id, created_at) VALUES ($1, $2)")
          .bind(&new_id)
          .bind(now)
          .execute(&mut **tx)
          .await?;
        new_id
      }
    };

    let expires_at = now + Duration::seconds(ttl_seconds);
    let candidate_user_session_id = Uuid::new_v4().to_string();
    let user_session_id: String = sqlx::query_scalar(
      r#"INSERT INTO user_sessions
           (id, session_id, user_id, expires_at, sign_in_client_version, refresh_client_version, created_at)
         VALUES ($1, $2, $3, $4, $5, NULL, $6)
         ON CONFLICT (session_id, user_id) DO UPDATE SET
           expires_at = EXCLUDED.expires_at,
           sign_in_client_version = COALESCE(EXCLUDED.sign_in_client_version, user_sessions.sign_in_client_version)
         RETURNING id"#,
    )
    .bind(&candidate_user_session_id)
    .bind(&session_id)
    .bind(user_id)
    .bind(expires_at)
    .bind(client_version)
    .bind(now)
    .fetch_one(&mut **tx)
    .await?;

    Ok(IssuedCookieSession {
      user_session_id,
      session_id,
      user_id: user_id.to_owned(),
      expires_at,
      created_at: now,
    })
  }

  async fn resolve_cookie_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
    requested_user_id: Option<&str>,
    refresh_client_version: Option<&str>,
    refresh: bool,
    ttl_seconds: i64,
    ttr_seconds: i64,
    now: DateTime<Utc>,
  ) -> Result<Option<ResolvedCookieSession>, DbError> {
    if !refresh {
      // Lock-free read-only path: never acquire FOR UPDATE row locks on concurrent read requests.
      // Select the target row by `requested_user_id` BEFORE checking `users.disabled` or
      // `auth_sessions` revocation/expiry so an explicitly requested disabled/revoked account
      // returns `Ok(None)` and never silently falls back to another user in the same session.
      let rows = sqlx::query(
        r#"SELECT s.id, s.session_id, s.user_id, s.expires_at,
                  s.sign_in_client_version, s.refresh_client_version, s.created_at,
                  u.disabled AS user_disabled,
                  a.id AS auth_session_id,
                  a.revoked_at AS auth_revoked_at,
                  (a.idle_expires_at > clock_timestamp()) AS auth_idle_ok,
                  (a.absolute_expires_at > clock_timestamp()) AS auth_abs_ok
           FROM user_sessions s
           JOIN users u ON u.id = s.user_id
           LEFT JOIN auth_sessions a ON a.user_session_id = s.id
           WHERE s.session_id = $1
             AND (s.expires_at IS NULL OR s.expires_at > clock_timestamp())
           ORDER BY s.created_at ASC"#,
      )
      .bind(session_id)
      .fetch_all(&mut **tx)
      .await?;

      let selected = requested_user_id
        .and_then(|req| rows.iter().find(|row| row.get::<String, _>("user_id") == req))
        .or_else(|| rows.last());
      let Some(row) = selected else {
        return Ok(None);
      };
      let disabled: bool = row.get("user_disabled");
      let auth_id: Option<String> = row.get("auth_session_id");
      let auth_revoked_at: Option<DateTime<Utc>> = row.get("auth_revoked_at");
      let auth_idle_ok: Option<bool> = row.get("auth_idle_ok");
      let auth_abs_ok: Option<bool> = row.get("auth_abs_ok");
      let auth_valid =
        auth_id.is_none() || (auth_revoked_at.is_none() && auth_idle_ok == Some(true) && auth_abs_ok == Some(true));
      if disabled || !auth_valid {
        return Ok(None);
      }
      return Ok(Some(ResolvedCookieSession {
        user_session_id: row.get("id"),
        session_id: row.get("session_id"),
        user_id: row.get("user_id"),
        expires_at: row.get("expires_at"),
        refreshed_expires_at: None,
        sign_in_client_version: row.get("sign_in_client_version"),
        refresh_client_version: row.get("refresh_client_version"),
        created_at: row.get("created_at"),
      }));
    }

    let candidates = sqlx::query(
      r#"SELECT id, user_id
         FROM user_sessions
         WHERE session_id = $1 AND (expires_at IS NULL OR expires_at > $2)
         ORDER BY created_at ASC"#,
    )
    .bind(session_id)
    .bind(now)
    .fetch_all(&mut **tx)
    .await?;

    let selected = requested_user_id
      .and_then(|req| candidates.iter().find(|row| row.get::<String, _>("user_id") == req))
      .or_else(|| candidates.last());

    let Some(selected) = selected else {
      return Ok(None);
    };

    let user_session_id: String = selected.get("id");
    let user_id: String = selected.get("user_id");

    // Lock order: users -> user_sessions (matches v0.27.5 auth_session/principal.rs).
    let disabled: Option<bool> = sqlx::query_scalar("SELECT disabled FROM users WHERE id = $1 FOR UPDATE")
      .bind(&user_id)
      .fetch_optional(&mut **tx)
      .await?;
    if disabled != Some(false) {
      return Ok(None);
    }

    let row = sqlx::query(
      r#"SELECT s.id, s.session_id, s.user_id, s.expires_at,
                s.sign_in_client_version, s.refresh_client_version, s.created_at,
                a.id AS auth_session_id, a.revoked_at AS auth_revoked_at,
                a.idle_expires_at AS auth_idle_expires_at,
                a.absolute_expires_at AS auth_absolute_expires_at
         FROM user_sessions s
         LEFT JOIN auth_sessions a ON a.user_session_id = s.id
         WHERE s.id = $1
         FOR UPDATE OF s"#,
    )
    .bind(&user_session_id)
    .fetch_optional(&mut **tx)
    .await?;
    let Some(row) = row else {
      return Ok(None);
    };

    // Re-read authoritative clock inside row locks so a session that expired
    // while waiting for locks is never extended.
    let locked_now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx)
      .await?;

    let row_session_id: String = row.get("session_id");
    let row_user_id: String = row.get("user_id");
    let mut expires_at: Option<DateTime<Utc>> = row.get("expires_at");
    let auth_session_id: Option<String> = row.get("auth_session_id");
    let auth_revoked_at: Option<DateTime<Utc>> = row.get("auth_revoked_at");
    let auth_idle_expires_at: Option<DateTime<Utc>> = row.get("auth_idle_expires_at");
    let auth_absolute_expires_at: Option<DateTime<Utc>> = row.get("auth_absolute_expires_at");
    let auth_session_invalid = auth_session_id.is_some()
      && (auth_revoked_at.is_some()
        || auth_idle_expires_at.is_some_and(|exp| exp <= locked_now)
        || auth_absolute_expires_at.is_some_and(|exp| exp <= locked_now));
    if row_session_id != session_id
      || row_user_id != user_id
      || expires_at.is_some_and(|exp| exp <= locked_now)
      || auth_session_invalid
    {
      return Ok(None);
    }

    let mut refresh_client_ver: Option<String> = row.get("refresh_client_version");
    let refreshed_expires_at = if expires_at.is_none_or(|exp| exp - locked_now <= Duration::seconds(ttr_seconds)) {
      let next_expires = locked_now + Duration::seconds(ttl_seconds);
      sqlx::query("UPDATE user_sessions SET expires_at = $2, refresh_client_version = $3 WHERE id = $1")
        .bind(&user_session_id)
        .bind(next_expires)
        .bind(refresh_client_version)
        .execute(&mut **tx)
        .await?;
      expires_at = Some(next_expires);
      refresh_client_ver = refresh_client_version.map(str::to_owned);
      Some(next_expires)
    } else {
      None
    };

    Ok(Some(ResolvedCookieSession {
      user_session_id: row.get("id"),
      session_id: row_session_id,
      user_id: row_user_id,
      expires_at,
      refreshed_expires_at,
      sign_in_client_version: row.get("sign_in_client_version"),
      refresh_client_version: refresh_client_ver,
      created_at: row.get("created_at"),
    }))
  }

  async fn revoke_cookie_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
    user_id: Option<&str>,
  ) -> Result<u64, DbError> {
    let mut user_ids: Vec<String> = if let Some(uid) = user_id {
      vec![uid.to_owned()]
    } else {
      sqlx::query_scalar("SELECT user_id FROM user_sessions WHERE session_id = $1 ORDER BY user_id")
        .bind(session_id)
        .fetch_all(&mut **tx)
        .await?
    };
    user_ids.sort();
    user_ids.dedup();

    if !user_ids.is_empty() {
      sqlx::query("SELECT id FROM users WHERE id = ANY($1) ORDER BY id FOR UPDATE")
        .bind(&user_ids)
        .fetch_all(&mut **tx)
        .await?;
    }
    sqlx::query("SELECT id FROM user_sessions WHERE session_id = $1 ORDER BY id FOR UPDATE")
      .bind(session_id)
      .fetch_all(&mut **tx)
      .await?;

    let affected = if let Some(uid) = user_id {
      sqlx::query("DELETE FROM user_sessions WHERE session_id = $1 AND user_id = $2")
        .bind(session_id)
        .bind(uid)
        .execute(&mut **tx)
        .await?
        .rows_affected()
    } else {
      sqlx::query("DELETE FROM multiple_users_sessions WHERE id = $1")
        .bind(session_id)
        .execute(&mut **tx)
        .await?
        .rows_affected()
    };

    Ok(affected)
  }

  async fn issue_auth_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    input: NewAuthSessionInput,
    now: DateTime<Utc>,
  ) -> Result<IssuedAuthSession, DbError> {
    let is_new_device: bool = !sqlx::query_scalar::<_, bool>(
      r#"SELECT EXISTS(
           SELECT 1
           FROM auth_sessions a
           JOIN user_sessions u ON u.id = a.user_session_id
           WHERE u.user_id = $1 AND a.installation_id = $2
         )"#,
    )
    .bind(&input.user_id)
    .bind(&input.installation_id)
    .fetch_one(&mut **tx)
    .await?;

    let session_id = Uuid::new_v4().to_string();
    let user_session_id = Uuid::new_v4().to_string();
    let auth_session_id = Uuid::new_v4().to_string();

    sqlx::query("INSERT INTO multiple_users_sessions (id, created_at) VALUES ($1, $2)")
      .bind(&session_id)
      .bind(now)
      .execute(&mut **tx)
      .await?;

    sqlx::query(
      r#"INSERT INTO user_sessions
           (id, session_id, user_id, expires_at, sign_in_client_version, refresh_client_version, created_at)
         VALUES ($1, $2, $3, $4, $5, $5, $6)"#,
    )
    .bind(&user_session_id)
    .bind(&session_id)
    .bind(&input.user_id)
    .bind(input.idle_expires_at)
    .bind(input.app_version.as_deref())
    .bind(now)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
      r#"INSERT INTO auth_sessions
           (id, user_session_id, installation_id, platform, device_name, app_version,
            created_at, last_seen_at, idle_expires_at, absolute_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9)"#,
    )
    .bind(&auth_session_id)
    .bind(&user_session_id)
    .bind(&input.installation_id)
    .bind(&input.platform)
    .bind(input.device_name.as_deref())
    .bind(input.app_version.as_deref())
    .bind(now)
    .bind(input.idle_expires_at)
    .bind(input.absolute_expires_at)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
      r#"INSERT INTO auth_refresh_tokens
           (id, auth_session_id, generation, secret_hash, created_at, expires_at)
         VALUES ($1, $2, 0, $3, $4, $5)"#,
    )
    .bind(&input.refresh_token_id)
    .bind(&auth_session_id)
    .bind(&input.refresh_secret_hash)
    .bind(now)
    .bind(input.idle_expires_at)
    .execute(&mut **tx)
    .await?;

    Ok(IssuedAuthSession {
      session_id,
      user_session_id,
      auth_session_id,
      refresh_token_id: input.refresh_token_id,
      is_new_device,
      idle_expires_at: input.idle_expires_at,
      absolute_expires_at: input.absolute_expires_at,
    })
  }

  async fn find_auth_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    auth_session_id: &str,
  ) -> Result<Option<AuthSessionRecord>, DbError> {
    let row = sqlx::query(
      r#"SELECT a.id, a.user_session_id, u.user_id, a.installation_id, a.platform,
                a.device_name, a.app_version, a.created_at, a.last_seen_at,
                a.idle_expires_at, a.absolute_expires_at, a.revoked_at, a.revoke_reason
         FROM auth_sessions a
         JOIN user_sessions u ON u.id = a.user_session_id
         WHERE a.id = $1"#,
    )
    .bind(auth_session_id)
    .fetch_optional(&mut **tx)
    .await?;

    Ok(row.map(row_to_auth_session))
  }

  async fn revoke_auth_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    auth_session_id: &str,
    expected_user_id: Option<&str>,
    reason: &str,
    now: DateTime<Utc>,
  ) -> Result<bool, DbError> {
    let owner = sqlx::query(
      r#"SELECT u.user_id, a.user_session_id
         FROM auth_sessions a
         JOIN user_sessions u ON u.id = a.user_session_id
         WHERE a.id = $1"#,
    )
    .bind(auth_session_id)
    .fetch_optional(&mut **tx)
    .await?;
    let Some(owner) = owner else {
      return Ok(false);
    };
    let user_id: String = owner.get("user_id");
    if expected_user_id.is_some_and(|expected| expected != user_id) {
      return Ok(false);
    }
    let user_session_id: String = owner.get("user_session_id");

    // Lock order: users -> user_sessions -> auth_sessions -> auth_refresh_tokens.
    sqlx::query("SELECT id FROM users WHERE id = $1 FOR UPDATE")
      .bind(&user_id)
      .fetch_optional(&mut **tx)
      .await?;
    sqlx::query("SELECT id FROM user_sessions WHERE id = $1 FOR UPDATE")
      .bind(&user_session_id)
      .fetch_optional(&mut **tx)
      .await?;
    let locked: Option<String> = sqlx::query_scalar("SELECT id FROM auth_sessions WHERE id = $1 FOR UPDATE")
      .bind(auth_session_id)
      .fetch_optional(&mut **tx)
      .await?;
    if locked.is_none() {
      return Ok(false);
    }
    sqlx::query("SELECT id FROM auth_refresh_tokens WHERE auth_session_id = $1 ORDER BY id FOR UPDATE")
      .bind(auth_session_id)
      .fetch_all(&mut **tx)
      .await?;

    let changed =
      sqlx::query("UPDATE auth_sessions SET revoked_at = $2, revoke_reason = $3 WHERE id = $1 AND revoked_at IS NULL")
        .bind(auth_session_id)
        .bind(now)
        .bind(reason)
        .execute(&mut **tx)
        .await?
        .rows_affected()
        == 1;

    sqlx::query("UPDATE auth_refresh_tokens SET revoked_at = $2 WHERE auth_session_id = $1 AND revoked_at IS NULL")
      .bind(auth_session_id)
      .bind(now)
      .execute(&mut **tx)
      .await?;

    Ok(changed)
  }

  async fn list_active_auth_sessions(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    now: DateTime<Utc>,
  ) -> Result<Vec<AuthSessionRecord>, DbError> {
    let rows = sqlx::query(
      r#"SELECT a.id, a.user_session_id, u.user_id, a.installation_id, a.platform,
                a.device_name, a.app_version, a.created_at, a.last_seen_at,
                a.idle_expires_at, a.absolute_expires_at, a.revoked_at, a.revoke_reason
         FROM auth_sessions a
         JOIN user_sessions u ON u.id = a.user_session_id
         WHERE u.user_id = $1
           AND (u.expires_at IS NULL OR u.expires_at > $2)
           AND a.revoked_at IS NULL
           AND a.idle_expires_at > $2
           AND a.absolute_expires_at > $2
         ORDER BY a.last_seen_at DESC"#,
    )
    .bind(user_id)
    .bind(now)
    .fetch_all(&mut **tx)
    .await?;

    Ok(rows.into_iter().map(row_to_auth_session).collect())
  }
}

fn row_to_auth_session(row: sqlx::postgres::PgRow) -> AuthSessionRecord {
  AuthSessionRecord {
    id: row.get("id"),
    user_session_id: row.get("user_session_id"),
    user_id: row.get("user_id"),
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
