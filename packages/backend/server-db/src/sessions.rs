//! Canonical session persistence traits and DTOs shared between domain
//! services and storage implementations.

use chrono::{DateTime, Utc};
use sqlx::{Postgres, Transaction};

use crate::DbError;

/// Default cookie session TTL: 15 days (`1_296_000` seconds).
pub const DEFAULT_COOKIE_SESSION_TTL_SECONDS: i64 = 1_296_000;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IssuedCookieSession {
  pub user_session_id: String,
  pub session_id: String,
  pub user_id: String,
  pub expires_at: DateTime<Utc>,
  pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedCookieSession {
  pub user_session_id: String,
  pub session_id: String,
  pub user_id: String,
  pub expires_at: Option<DateTime<Utc>>,
  pub refreshed_expires_at: Option<DateTime<Utc>>,
  pub sign_in_client_version: Option<String>,
  pub refresh_client_version: Option<String>,
  pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NewAuthSessionInput {
  pub user_id: String,
  pub installation_id: String,
  pub platform: String,
  pub device_name: Option<String>,
  pub app_version: Option<String>,
  pub refresh_token_id: String,
  pub refresh_secret_hash: String,
  pub idle_expires_at: DateTime<Utc>,
  pub absolute_expires_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IssuedAuthSession {
  pub session_id: String,
  pub user_session_id: String,
  pub auth_session_id: String,
  pub refresh_token_id: String,
  pub is_new_device: bool,
  pub idle_expires_at: DateTime<Utc>,
  pub absolute_expires_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthSessionRecord {
  pub id: String,
  pub user_session_id: String,
  pub user_id: String,
  pub installation_id: String,
  pub platform: String,
  pub device_name: Option<String>,
  pub app_version: Option<String>,
  pub created_at: DateTime<Utc>,
  pub last_seen_at: DateTime<Utc>,
  pub idle_expires_at: DateTime<Utc>,
  pub absolute_expires_at: DateTime<Utc>,
  pub revoked_at: Option<DateTime<Utc>>,
  pub revoke_reason: Option<String>,
}

/// Canonical repository abstraction for persisting cookie and native/bearer
/// sessions inside a caller-controlled PostgreSQL transaction.
#[async_trait::async_trait]
pub trait SessionRepository: Send + Sync + 'static {
  #[allow(clippy::too_many_arguments)]
  async fn issue_cookie_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    existing_session_id: Option<&str>,
    client_version: Option<&str>,
    ttl_seconds: i64,
    now: DateTime<Utc>,
  ) -> Result<IssuedCookieSession, DbError>;

  #[allow(clippy::too_many_arguments)]
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
  ) -> Result<Option<ResolvedCookieSession>, DbError>;

  async fn revoke_cookie_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
    user_id: Option<&str>,
  ) -> Result<u64, DbError>;

  async fn issue_auth_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    input: NewAuthSessionInput,
    now: DateTime<Utc>,
  ) -> Result<IssuedAuthSession, DbError>;

  async fn find_auth_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    auth_session_id: &str,
  ) -> Result<Option<AuthSessionRecord>, DbError>;

  async fn revoke_auth_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    auth_session_id: &str,
    expected_user_id: Option<&str>,
    reason: &str,
    now: DateTime<Utc>,
  ) -> Result<bool, DbError>;

  async fn list_active_auth_sessions(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    now: DateTime<Utc>,
  ) -> Result<Vec<AuthSessionRecord>, DbError>;
}
