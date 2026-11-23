//! Decoupled Socket.IO handshake authentication trait and default PostgreSQL
//! cookie session authenticator (`affine_session` + optional `affine_user_id`).

use async_trait::async_trait;
use http::HeaderMap;
use server_db::{ServerDb, WorkloadTier};

use crate::error::SyncError;

pub const SESSION_COOKIE_NAME: &str = "affine_session";
pub const USER_ID_COOKIE_NAME: &str = "affine_user_id";

/// Authenticated principal attached to a Socket.IO connection.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SyncUser {
  pub id: String,
  pub email: String,
  pub name: String,
  pub session_id: String,
}

/// Decoupled handshake authenticator so `affine-server` (or tests) can plug in
/// either PostgreSQL cookie sessions or custom session resolution.
#[async_trait]
pub trait SyncSessionAuthenticator: Send + Sync + 'static {
  async fn authenticate(&self, headers: &HeaderMap) -> Result<SyncUser, SyncError>;
}

/// Default `v0.27.5`-compatible PostgreSQL cookie authenticator.
///
/// Parses `affine_session` (and optional `affine_user_id`) from the handshake
/// `Cookie` header and validates against `public.user_sessions JOIN public.users`.
#[derive(Clone)]
pub struct PgCookieSessionAuthenticator {
  db: ServerDb,
}

impl PgCookieSessionAuthenticator {
  pub fn new(db: ServerDb) -> Self {
    Self { db }
  }
}

#[async_trait]
impl SyncSessionAuthenticator for PgCookieSessionAuthenticator {
  async fn authenticate(&self, headers: &HeaderMap) -> Result<SyncUser, SyncError> {
    let cookies = parse_cookies(headers);
    let session_id = cookies
      .iter()
      .find(|(k, _)| k == SESSION_COOKIE_NAME)
      .map(|(_, v)| v.as_str())
      .filter(|v| !v.is_empty())
      .ok_or_else(|| SyncError::AuthenticationRequired("missing affine_session cookie".into()))?;

    let preferred_user_id = cookies
      .iter()
      .find(|(k, _)| k == USER_ID_COOKIE_NAME)
      .map(|(_, v)| v.as_str())
      .filter(|v| !v.is_empty());

    let mut conn = self.db.acquire_tiered(WorkloadTier::InteractiveRead).await?;
    let row: Option<(String, String, String)> = if let Some(user_id) = preferred_user_id {
      sqlx::query_as(
        r#"
        SELECT u.id, u.email, u.name
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.session_id = $1
          AND s.user_id = $2
          AND (s.expires_at IS NULL OR s.expires_at > clock_timestamp())
          AND u.disabled = false
        LIMIT 1
        "#,
      )
      .bind(session_id)
      .bind(user_id)
      .fetch_optional(&mut *conn)
      .await?
    } else {
      sqlx::query_as(
        r#"
        SELECT u.id, u.email, u.name
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.session_id = $1
          AND (s.expires_at IS NULL OR s.expires_at > clock_timestamp())
          AND u.disabled = false
        ORDER BY s.created_at DESC
        LIMIT 1
        "#,
      )
      .bind(session_id)
      .fetch_optional(&mut *conn)
      .await?
    };

    let (id, email, name) =
      row.ok_or_else(|| SyncError::AuthenticationRequired("invalid or expired session".into()))?;

    Ok(SyncUser {
      id,
      email,
      name,
      session_id: session_id.to_owned(),
    })
  }
}

pub fn parse_cookies(headers: &HeaderMap) -> Vec<(String, String)> {
  let mut out = Vec::new();
  for val in headers.get_all(http::header::COOKIE) {
    let Ok(s) = val.to_str() else {
      continue;
    };
    for part in s.split(';') {
      let part = part.trim();
      if part.is_empty() {
        continue;
      }
      if let Some((k, v)) = part.split_once('=') {
        out.push((k.trim().to_owned(), v.trim().to_owned()));
      }
    }
  }
  out
}
