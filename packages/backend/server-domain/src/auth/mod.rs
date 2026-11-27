//! Canonical authentication and session domain service.

pub mod access_token;
pub mod captcha;
pub mod keyring;
pub mod oauth;
pub mod oauth_crypto;
mod oauth_http;
pub mod password;
pub mod security_challenge;

use std::{fmt, fmt::Write as _, sync::Arc, time::Duration as StdDuration};

use chrono::{DateTime, Duration, Utc};
use hickory_resolver::{TokioResolver, net::NetError};
use hmac::{Hmac, Mac as _};
use rand::Rng as _;
use serde_json::Value;
use server_db::{ServerDb, WorkloadTier};
use server_spi::{CommunityRateLimitPolicy, RateLimitPolicy, SessionPolicyHook};
use server_types::DomainError;
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};
use subtle::ConstantTimeEq as _;
use uuid::Uuid;

pub use server_db::sessions::{
  AuthSessionRecord, DEFAULT_COOKIE_SESSION_TTL_SECONDS, IssuedAuthSession, IssuedCookieSession, NewAuthSessionInput,
  ResolvedCookieSession, SessionRepository,
};

use crate::users::{ADMIN_FEATURE_NAME, CurrentUserView, load_current_user_in_tx};

pub const DEFAULT_COOKIE_SESSION_TTR_SECONDS: i64 = 604_800;
pub const DEFAULT_ACCESS_TOKEN_TTL_SECS: i64 = 900;
pub const MIN_ACCESS_TOKEN_TTL_SECS: i64 = 60;
pub const MAX_ACCESS_TOKEN_TTL_SECS: i64 = 3_600;
pub const DEFAULT_REFRESH_IDLE_TTL_SECS: i64 = 30 * 86_400;
pub const MIN_REFRESH_IDLE_TTL_SECS: i64 = 3_600;
pub const MAX_REFRESH_IDLE_TTL_SECS: i64 = 365 * 86_400;
pub const DEFAULT_REFRESH_ABSOLUTE_TTL_SECS: i64 = 180 * 86_400;
pub const MIN_REFRESH_ABSOLUTE_TTL_SECS: i64 = 3_600;
pub const MAX_REFRESH_ABSOLUTE_TTL_SECS: i64 = 730 * 86_400;
pub const DEFAULT_REFRESH_RETENTION_SECS: i64 = 30 * 86_400;
pub const MIN_REFRESH_RETENTION_SECS: i64 = 3_600;
pub const MAX_REFRESH_RETENTION_SECS: i64 = 365 * 86_400;
pub const DEFAULT_REFRESH_GRACE_SECS: i64 = 30;
pub const MIN_REFRESH_GRACE_SECS: i64 = 0;
pub const MAX_REFRESH_GRACE_SECS: i64 = 60;
pub const REFRESH_RATE_LIMIT_WINDOW_SECS: i32 = 60;
pub const REFRESH_RATE_LIMIT_BUCKET_SECS: i64 = 10;
pub const REFRESH_RATE_LIMIT_MAX_REQUESTS: i64 = 30;
pub const REFRESH_TOKEN_PREFIX: &str = "aff_rt_v1";
const REFRESH_TOKEN_ID_BYTES: usize = 18;
const REFRESH_TOKEN_SECRET_BYTES: usize = 32;
pub const AUTH_SESSION_EXCHANGE_PURPOSE: &str = "auth_challenge:auth_session_exchange";
pub const AUTH_SESSION_EXCHANGE_TTL_SECONDS: i64 = 60;
pub const OPEN_APP_PURPOSE: &str = "auth_challenge:open_app_sign_in";
pub const OPEN_APP_TTL_SECONDS: i64 = 300;

#[derive(Clone, Copy, Debug)]
pub enum OpenAppIssueTarget<'a> {
  Cookie {
    existing_session_id: Option<&'a str>,
    client_version: Option<&'a str>,
  },
  Native {
    client_version: Option<&'a str>,
  },
}

#[derive(Clone, Debug)]
pub enum OpenAppSignInResult {
  Cookie(CookieSignInResult),
  Native {
    user: CurrentUserView,
    exchange_code: String,
  },
}
pub const MAGIC_LINK_PURPOSE: &str = "magic_link_otp";
pub const MAGIC_LINK_TTL_SECONDS: i64 = 1_800;
pub const MAGIC_LINK_MAX_ATTEMPTS: i32 = 5;

pub use server_spi::RequestSource as AuthRequestSource;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EmailDomainVerification {
  Allowed,
  Missing,
  Unavailable,
}

/// Verifies signup email domains (MX + SPF + DMARC records) matching `v0.27.5`
/// `auth_session/methods.rs:verify_email_domain_records`.
#[async_trait::async_trait]
pub trait EmailDomainVerifier: Send + Sync + 'static {
  async fn verify_email_domain(&self, email: &str) -> EmailDomainVerification;
}

/// Production DNS verifier using `hickory-resolver` (`MX` + `v=spf1` + `_dmarc`
/// `v=DMARC1`, 2 s timeout).
#[derive(Clone, Copy, Debug, Default)]
pub struct DnsEmailDomainVerifier;

#[derive(Clone, Copy)]
enum DnsRecordStatus {
  Present,
  Missing,
  Unavailable,
}

fn classify_dns_error(error: &NetError) -> DnsRecordStatus {
  if error.is_nx_domain() || error.is_no_records_found() {
    DnsRecordStatus::Missing
  } else {
    DnsRecordStatus::Unavailable
  }
}

#[async_trait::async_trait]
impl EmailDomainVerifier for DnsEmailDomainVerifier {
  async fn verify_email_domain(&self, email: &str) -> EmailDomainVerification {
    let Some((local, raw_domain)) = email.split_once('@') else {
      return EmailDomainVerification::Missing;
    };
    if local.contains('+') || raw_domain.contains('@') {
      return EmailDomainVerification::Missing;
    }
    let domain = raw_domain.to_ascii_lowercase();
    let Ok(resolver) = TokioResolver::builder_tokio().and_then(|builder| builder.build()) else {
      return EmailDomainVerification::Unavailable;
    };
    let timeout = StdDuration::from_secs(2);
    let (mx, spf, dmarc) = tokio::join!(
      tokio::time::timeout(timeout, resolver.mx_lookup(domain.as_str())),
      tokio::time::timeout(timeout, resolver.txt_lookup(domain.as_str())),
      tokio::time::timeout(timeout, resolver.txt_lookup(format!("_dmarc.{domain}"))),
    );
    let mx_status = match mx {
      Ok(Ok(records)) if !records.answers().is_empty() => DnsRecordStatus::Present,
      Ok(Ok(_)) => DnsRecordStatus::Missing,
      Ok(Err(error)) => classify_dns_error(&error),
      Err(_) => DnsRecordStatus::Unavailable,
    };
    let spf_status = match spf {
      Ok(Ok(records)) if records.answers().iter().any(|r| r.to_string().contains("v=spf1")) => DnsRecordStatus::Present,
      Ok(Ok(_)) => DnsRecordStatus::Missing,
      Ok(Err(error)) => classify_dns_error(&error),
      Err(_) => DnsRecordStatus::Unavailable,
    };
    let dmarc_status = match dmarc {
      Ok(Ok(records)) if records.answers().iter().any(|r| r.to_string().contains("v=DMARC1")) => {
        DnsRecordStatus::Present
      }
      Ok(Ok(_)) => DnsRecordStatus::Missing,
      Ok(Err(error)) => classify_dns_error(&error),
      Err(_) => DnsRecordStatus::Unavailable,
    };

    if matches!(mx_status, DnsRecordStatus::Unavailable)
      || matches!(spf_status, DnsRecordStatus::Unavailable)
      || matches!(dmarc_status, DnsRecordStatus::Unavailable)
    {
      EmailDomainVerification::Unavailable
    } else if matches!(mx_status, DnsRecordStatus::Present)
      && matches!(spf_status, DnsRecordStatus::Present)
      && matches!(dmarc_status, DnsRecordStatus::Present)
    {
      EmailDomainVerification::Allowed
    } else {
      EmailDomainVerification::Missing
    }
  }
}

#[derive(Clone)]
pub struct AuthConfig {
  pub allow_signup: bool,
  pub allow_signup_for_oauth: bool,
  pub require_email_domain_verification: bool,
  pub private_key: String,
  pub server_name: String,
  pub password_min_length: usize,
  pub password_max_length: usize,
  pub session_ttl_seconds: i64,
  pub session_ttr_seconds: i64,
  pub oauth_providers: std::collections::HashMap<String, oauth::OAuthProviderConfig>,
}

impl fmt::Debug for AuthConfig {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("AuthConfig")
      .field("allow_signup", &self.allow_signup)
      .field("allow_signup_for_oauth", &self.allow_signup_for_oauth)
      .field(
        "require_email_domain_verification",
        &self.require_email_domain_verification,
      )
      .field("private_key", &"[REDACTED]")
      .field("server_name", &self.server_name)
      .field("password_min_length", &self.password_min_length)
      .field("password_max_length", &self.password_max_length)
      .field("session_ttl_seconds", &self.session_ttl_seconds)
      .field("session_ttr_seconds", &self.session_ttr_seconds)
      .field("oauth_providers", &self.oauth_providers.keys().collect::<Vec<_>>())
      .finish()
  }
}

impl Default for AuthConfig {
  fn default() -> Self {
    Self {
      allow_signup: true,
      allow_signup_for_oauth: true,
      require_email_domain_verification: false,
      private_key: String::new(),
      server_name: "AFFiNE".to_owned(),
      password_min_length: 8,
      password_max_length: 32,
      session_ttl_seconds: DEFAULT_COOKIE_SESSION_TTL_SECONDS,
      session_ttr_seconds: DEFAULT_COOKIE_SESSION_TTR_SECONDS,
      oauth_providers: std::collections::HashMap::new(),
    }
  }
}

#[derive(Clone, Debug)]
pub struct CreateAdminUserInput {
  pub name: Option<String>,
  pub email: String,
  pub password: String,
  pub client_version: Option<String>,
}

#[derive(Clone, Debug)]
pub struct PasswordSignInInput {
  pub email: String,
  pub password: String,
  pub existing_session_id: Option<String>,
  pub client_version: Option<String>,
}

#[derive(Clone, Debug)]
pub struct CookieSignInResult {
  pub user: CurrentUserView,
  pub session_id: String,
  pub user_session_id: String,
  pub expires_at: DateTime<Utc>,
  pub created_user: bool,
}

#[derive(Clone, Debug)]
pub struct CookiePrincipal {
  pub user: CurrentUserView,
  pub session_id: String,
  pub user_session_id: String,
  pub expires_at: Option<DateTime<Utc>>,
  pub refreshed_expires_at: Option<DateTime<Utc>>,
  pub sign_in_client_version: Option<String>,
  pub refresh_client_version: Option<String>,
}

#[derive(Clone, Debug)]
pub struct PrepareMagicLinkInput {
  pub email: String,
  pub callback_url: String,
  pub client_nonce: Option<String>,
  pub source: Option<AuthRequestSource>,
}

#[derive(Clone, Debug)]
pub struct PreparedMagicLink {
  pub email: String,
  pub otp: String,
  pub callback_url: String,
  pub is_signup: bool,
  pub expires_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct CompleteMagicLinkInput {
  pub email: String,
  pub otp: String,
  pub client_nonce: Option<String>,
  pub existing_session_id: Option<String>,
  pub client_version: Option<String>,
}

#[derive(Clone)]
pub struct AuthService {
  db: ServerDb,
  sessions: Arc<dyn SessionRepository>,
  session_policy: Arc<dyn SessionPolicyHook>,
  rate_limit_policy: Arc<dyn RateLimitPolicy>,
  domain_verifier: Arc<dyn EmailDomainVerifier>,
  app_config: Option<crate::app_config::AppConfigService>,
  config: AuthConfig,
}

impl AuthService {
  pub fn new(
    db: ServerDb,
    sessions: Arc<dyn SessionRepository>,
    session_policy: Arc<dyn SessionPolicyHook>,
    config: AuthConfig,
  ) -> Self {
    Self {
      db,
      sessions,
      session_policy,
      rate_limit_policy: Arc::new(CommunityRateLimitPolicy),
      domain_verifier: Arc::new(DnsEmailDomainVerifier),
      app_config: None,
      config,
    }
  }

  pub fn with_app_config(mut self, app_config: crate::app_config::AppConfigService) -> Self {
    self.app_config = Some(app_config);
    self
  }

  pub fn with_rate_limit_policy(mut self, rate_limit_policy: Arc<dyn RateLimitPolicy>) -> Self {
    self.rate_limit_policy = rate_limit_policy;
    self
  }

  pub fn with_email_domain_verifier(mut self, domain_verifier: Arc<dyn EmailDomainVerifier>) -> Self {
    self.domain_verifier = domain_verifier;
    self
  }

  async fn verify_signup_domain(&self, email: &str) -> Result<(), DomainError> {
    if !self.config.require_email_domain_verification {
      return Ok(());
    }
    let normalized = email.trim().to_ascii_lowercase();
    let Some((local, domain)) = normalized.split_once('@') else {
      return Err(DomainError::Forbidden("sign_up_forbidden".to_owned()));
    };
    if local.contains('+') || domain.contains('@') {
      return Err(DomainError::Forbidden("sign_up_forbidden".to_owned()));
    }
    match self.domain_verifier.verify_email_domain(&normalized).await {
      EmailDomainVerification::Allowed => Ok(()),
      EmailDomainVerification::Missing => Err(DomainError::Forbidden("sign_up_forbidden".to_owned())),
      EmailDomainVerification::Unavailable => Err(DomainError::Unavailable(
        "email_domain_verification_unavailable".to_owned(),
      )),
    }
  }

  pub fn config(&self) -> &AuthConfig {
    &self.config
  }

  pub async fn session_ttr_seconds(&self) -> i64 {
    self.load_dynamic_auth_runtime().await.session_ttr_seconds
  }

  /// Idempotently initializes `auth.session.signingKeys` in `public.app_configs`.
  pub async fn ensure_signing_keys(&self) -> Result<Vec<keyring::StoredSigningKey>, DomainError> {
    keyring::ensure_signing_keys(&self.db).await
  }

  /// Lists public metadata for all signing keys (with raw secrets stripped).
  pub async fn list_signing_keys(&self) -> Result<Vec<keyring::SigningKeyMetadata>, DomainError> {
    keyring::list_signing_key_metadata(&self.db).await
  }

  /// Rotates the active session signing key with CAS on `expected_active_key_id`.
  pub async fn rotate_signing_key(
    &self,
    actor_id: &str,
    expected_active_key_id: &str,
  ) -> Result<Vec<keyring::SigningKeyMetadata>, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire auth token policy conn: {e}")))?;
    let rows = sqlx::query(
      "SELECT id, value
       FROM app_configs
       WHERE id IN ('auth', 'auth.token', 'auth.token.accessTokenTtl')
       ORDER BY id ASC",
    )
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("load auth token policy: {e}")))?;
    drop(conn);
    let policy = parse_auth_token_policy(rows);
    keyring::rotate_signing_key(&self.db, actor_id, expected_active_key_id, policy.access_token_ttl_secs).await
  }

  /// Deletes an expired retiring session signing key.
  pub async fn delete_signing_key(
    &self,
    actor_id: &str,
    key_id: &str,
  ) -> Result<Vec<keyring::SigningKeyMetadata>, DomainError> {
    keyring::delete_signing_key(&self.db, actor_id, key_id).await
  }

  /// Issues a compatibility cookie session directly for `user_id` (`UserType.token`).
  pub async fn issue_cookie_session_for_user(&self, user_id: &str) -> Result<CookieSignInResult, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin issue_cookie_session_for_user: {e}")))?;
    let disabled: Option<bool> = sqlx::query_scalar("SELECT disabled FROM users WHERE id = $1 FOR UPDATE")
      .bind(user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock user for cookie session: {e}")))?;
    if disabled != Some(false) {
      return Err(DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()));
    }
    let now = decision_time(tx.tx_mut()).await?;
    let issued = self
      .sessions
      .issue_cookie_session(tx.tx_mut(), user_id, None, None, self.config.session_ttl_seconds, now)
      .await
      .map_err(|e| DomainError::Internal(format!("issue user cookie session: {e}")))?;
    self
      .session_policy
      .on_session_created(tx.tx_mut(), user_id, &issued.session_id, now)
      .await?;
    let user = load_current_user_in_tx(tx.tx_mut(), user_id)
      .await?
      .ok_or_else(|| DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()))?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit issue_cookie_session_for_user: {e}")))?;
    Ok(CookieSignInResult {
      user,
      session_id: issued.session_id,
      user_session_id: issued.user_session_id,
      expires_at: issued.expires_at,
      created_user: false,
    })
  }

  /// Returns `true` when at least one registered user or active administrator
  /// exists in the database.
  pub async fn is_server_initialized(&self) -> Result<bool, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire is_server_initialized: {e}")))?;
    let initialized: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM users WHERE registered = true)
              OR EXISTS(SELECT 1 FROM user_features WHERE name = $1 AND activated = true)",
    )
    .bind(ADMIN_FEATURE_NAME)
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("check server initialized: {e}")))?;
    Ok(initialized)
  }

  pub(crate) async fn load_dynamic_auth_runtime(&self) -> DynamicAuthRuntime {
    let mut rt = DynamicAuthRuntime {
      allow_signup: self.config.allow_signup,
      allow_signup_for_oauth: self.config.allow_signup_for_oauth,
      require_email_domain_verification: self.config.require_email_domain_verification,
      password_min_length: self.config.password_min_length,
      password_max_length: self.config.password_max_length,
      session_ttl_seconds: self.config.session_ttl_seconds,
      session_ttr_seconds: self.config.session_ttr_seconds,
    };
    if let Some(ref cfg_svc) = self.app_config
      && let Ok(eff) = cfg_svc.get_effective_app_config_arc().await
    {
      if let Some(b) = eff.pointer("/auth/allowSignup").and_then(Value::as_bool) {
        rt.allow_signup = b;
      }
      if let Some(b) = eff.pointer("/auth/allowSignupForOauth").and_then(Value::as_bool) {
        rt.allow_signup_for_oauth = b;
      }
      if let Some(b) = eff
        .pointer("/auth/requireEmailDomainVerification")
        .and_then(Value::as_bool)
      {
        rt.require_email_domain_verification = b;
      }
      if let Some(min) = eff.pointer("/auth/passwordRequirements/min").and_then(Value::as_u64) {
        rt.password_min_length = min as usize;
      }
      if let Some(max) = eff.pointer("/auth/passwordRequirements/max").and_then(Value::as_u64) {
        rt.password_max_length = max as usize;
      }
      if let Some(ttl) = eff
        .pointer("/auth/session/ttl")
        .and_then(Value::as_i64)
        .filter(|&v| v > 0)
      {
        rt.session_ttl_seconds = ttl;
      }
      if let Some(ttr) = eff
        .pointer("/auth/session/ttr")
        .and_then(Value::as_i64)
        .filter(|&v| v >= 0)
      {
        rt.session_ttr_seconds = ttr;
      }
      return rt;
    }
    let Ok(mut conn) = self.db.acquire_tiered(WorkloadTier::InteractiveRead).await else {
      return rt;
    };
    let rows = sqlx::query("SELECT id, value FROM app_configs WHERE id = ANY($1)")
      .bind(
        &[
          "auth.allowSignup",
          "auth.allowSignupForOauth",
          "auth.requireEmailDomainVerification",
          "auth.passwordRequirements",
          "auth.passwordRequirements.min",
          "auth.passwordRequirements.max",
          "auth.session.ttl",
          "auth.session.ttr",
          "auth.session",
        ][..],
      )
      .fetch_all(&mut *conn)
      .await;
    if let Ok(rows) = rows {
      for row in rows {
        let id: String = row.get("id");
        let val: Value = row.get("value");
        match id.as_str() {
          "auth.allowSignup" => {
            if let Some(b) = val.as_bool() {
              rt.allow_signup = b;
            }
          }
          "auth.allowSignupForOauth" => {
            if let Some(b) = val.as_bool() {
              rt.allow_signup_for_oauth = b;
            }
          }
          "auth.requireEmailDomainVerification" => {
            if let Some(b) = val.as_bool() {
              rt.require_email_domain_verification = b;
            }
          }
          "auth.passwordRequirements" => {
            if let Some(min) = val.get("min").and_then(Value::as_u64) {
              rt.password_min_length = min as usize;
            }
            if let Some(max) = val.get("max").and_then(Value::as_u64) {
              rt.password_max_length = max as usize;
            }
          }
          "auth.passwordRequirements.min" => {
            if let Some(min) = val.as_u64() {
              rt.password_min_length = min as usize;
            }
          }
          "auth.passwordRequirements.max" => {
            if let Some(max) = val.as_u64() {
              rt.password_max_length = max as usize;
            }
          }
          "auth.session.ttl" => {
            if let Some(ttl) = val.as_i64().filter(|&v| v > 0) {
              rt.session_ttl_seconds = ttl;
            }
          }
          "auth.session.ttr" => {
            if let Some(ttr) = val.as_i64().filter(|&v| v >= 0) {
              rt.session_ttr_seconds = ttr;
            }
          }
          "auth.session" => {
            if let Some(ttl) = val.get("ttl").and_then(Value::as_i64).filter(|&v| v > 0) {
              rt.session_ttl_seconds = ttl;
            }
            if let Some(ttr) = val.get("ttr").and_then(Value::as_i64).filter(|&v| v >= 0) {
              rt.session_ttr_seconds = ttr;
            }
          }
          _ => {}
        }
      }
    }
    rt
  }

  /// Atomically creates the initial self-hosted administrator account, grants
  /// the `administrator` user feature, issues a cookie session via
  /// [`SessionRepository`], and invokes [`SessionPolicyHook::on_session_created`]
  /// inside the same transaction (rolling back everything if the hook fails).
  pub async fn create_first_admin_user(&self, input: CreateAdminUserInput) -> Result<CookieSignInResult, DomainError> {
    let email = canonical_email(&input.email)?;
    let rt = self.load_dynamic_auth_runtime().await;
    password::validate_password_requirements(&input.password, rt.password_min_length, rt.password_max_length)?;
    let password_hash = password::hash_password(&input.password)?;

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin create_first_admin_user: {e}")))?;

    // Serialize concurrent setup attempts and email sign-ins.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('auth:setup:first-admin', 0))")
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock setup advisory lock: {e}")))?;
    lock_email(tx.tx_mut(), &email).await?;

    let already_initialized: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM users WHERE registered = true)
              OR EXISTS(SELECT 1 FROM user_features WHERE name = $1 AND activated = true)",
    )
    .bind(ADMIN_FEATURE_NAME)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("recheck server initialized: {e}")))?;
    if already_initialized {
      return Err(DomainError::Forbidden("First user already created".to_owned()));
    }

    let now = decision_time(tx.tx_mut()).await?;
    let user_id = Uuid::new_v4().to_string();
    let display_name = input
      .name
      .as_deref()
      .map(str::trim)
      .filter(|s| !s.is_empty())
      .unwrap_or_else(|| email.split('@').next().unwrap_or(&email));

    sqlx::query(
      r#"INSERT INTO users
           (id, name, email, password, registered, disabled, auth_epoch, avatar_url, email_verified, created_at)
         VALUES ($1, $2, $3, $4, true, false, 0, NULL, NULL, $5)"#,
    )
    .bind(&user_id)
    .bind(display_name)
    .bind(&email)
    .bind(&password_hash)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert admin user: {e}")))?;

    sqlx::query(
      r#"INSERT INTO user_features (user_id, name, type, reason, created_at, expired_at, activated)
         VALUES ($1, $2, 0, 'selfhost setup', $3, NULL, true)"#,
    )
    .bind(&user_id)
    .bind(ADMIN_FEATURE_NAME)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert admin user feature: {e}")))?;

    let issued = self
      .sessions
      .issue_cookie_session(
        tx.tx_mut(),
        &user_id,
        None,
        input.client_version.as_deref(),
        self.config.session_ttl_seconds,
        now,
      )
      .await
      .map_err(|e| DomainError::Internal(format!("issue admin cookie session: {e}")))?;

    // Mandatory SPI hook inside the same transaction: any Err rolls back user + feature + session.
    self
      .session_policy
      .on_session_created(tx.tx_mut(), &user_id, &issued.session_id, now)
      .await?;

    let user = load_current_user_in_tx(tx.tx_mut(), &user_id)
      .await?
      .ok_or_else(|| DomainError::Internal("newly created admin user missing".to_owned()))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit create_first_admin_user: {e}")))?;

    Ok(CookieSignInResult {
      user,
      session_id: issued.session_id,
      user_session_id: issued.user_session_id,
      expires_at: issued.expires_at,
      created_user: true,
    })
  }

  /// Authenticates an existing user by email + Argon2id password for a native
  /// client, issuing ONLY a one-time `exchangeCode` (`runtime_states`) without
  /// writing `user_sessions` or `multiple_users_sessions`.
  pub async fn sign_in_with_password_native(
    &self,
    email: &str,
    password: &str,
    client_version: Option<&str>,
  ) -> Result<(CurrentUserView, String), DomainError> {
    let email = canonical_email(email)?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin native password sign in: {e}")))?;

    lock_email(tx.tx_mut(), &email).await?;

    let rows =
      sqlx::query("SELECT id, password, disabled FROM users WHERE lower(email) = lower($1) ORDER BY id FOR UPDATE")
        .bind(&email)
        .fetch_all(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load native password login user: {e}")))?;

    if rows.len() != 1 || rows[0].get::<bool, _>("disabled") {
      return Err(DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()));
    }
    let password_hash: Option<String> = rows[0].get("password");
    let Some(password_hash) = password_hash else {
      return Err(DomainError::Unauthorized("wrong_sign_in_method".to_owned()));
    };
    if !password::verify_password(password, &password_hash)? {
      return Err(DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()));
    }

    let user_id: String = rows[0].get("id");
    let user = load_current_user_in_tx(tx.tx_mut(), &user_id)
      .await?
      .ok_or_else(|| DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit native password sign in: {e}")))?;

    let exchange_code = self.issue_exchange_code(&user.id, client_version).await?;
    Ok((user, exchange_code))
  }

  /// Authenticates an existing user by email + Argon2id password and issues a
  /// cookie session, invoking [`SessionPolicyHook::on_session_created`] inside
  /// the same transaction.
  pub async fn sign_in_with_password(&self, input: PasswordSignInInput) -> Result<CookieSignInResult, DomainError> {
    let rt = self.load_dynamic_auth_runtime().await;
    let email = canonical_email(&input.email)?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin password sign in: {e}")))?;

    lock_email(tx.tx_mut(), &email).await?;

    let rows =
      sqlx::query("SELECT id, password, disabled FROM users WHERE lower(email) = lower($1) ORDER BY id FOR UPDATE")
        .bind(&email)
        .fetch_all(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("load password login user: {e}")))?;

    if rows.len() != 1 || rows[0].get::<bool, _>("disabled") {
      return Err(DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()));
    }
    let password_hash: Option<String> = rows[0].get("password");
    let Some(password_hash) = password_hash else {
      return Err(DomainError::Unauthorized("wrong_sign_in_method".to_owned()));
    };
    if !password::verify_password(&input.password, &password_hash)? {
      return Err(DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()));
    }

    let user_id: String = rows[0].get("id");
    let now = decision_time(tx.tx_mut()).await?;

    let issued = self
      .sessions
      .issue_cookie_session(
        tx.tx_mut(),
        &user_id,
        input.existing_session_id.as_deref(),
        input.client_version.as_deref(),
        rt.session_ttl_seconds,
        now,
      )
      .await
      .map_err(|e| DomainError::Internal(format!("issue password cookie session: {e}")))?;

    self
      .session_policy
      .on_session_created(tx.tx_mut(), &user_id, &issued.session_id, now)
      .await?;

    let user = load_current_user_in_tx(tx.tx_mut(), &user_id)
      .await?
      .ok_or_else(|| DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit password sign in: {e}")))?;

    Ok(CookieSignInResult {
      user,
      session_id: issued.session_id,
      user_session_id: issued.user_session_id,
      expires_at: issued.expires_at,
      created_user: false,
    })
  }

  /// Resolves a cookie session (`affine_session` + optional `affine_user_id`),
  /// validating `expires_at > now` and `!users.disabled`, optionally refreshing
  /// the session TTL when within TTR.
  pub async fn resolve_cookie_principal(
    &self,
    session_id: &str,
    requested_user_id: Option<&str>,
    refresh_client_version: Option<&str>,
    refresh: bool,
  ) -> Result<Option<CookiePrincipal>, DomainError> {
    if session_id.trim().is_empty() {
      return Ok(None);
    }
    let rt = self.load_dynamic_auth_runtime().await;
    let tier = if refresh {
      WorkloadTier::InteractiveWrite
    } else {
      WorkloadTier::InteractiveRead
    };
    let mut tx = self
      .db
      .begin_tiered(tier)
      .await
      .map_err(|e| DomainError::Internal(format!("begin resolve_cookie_principal: {e}")))?;
    let now = decision_time(tx.tx_mut()).await?;

    let resolved = self
      .sessions
      .resolve_cookie_session(
        tx.tx_mut(),
        session_id,
        requested_user_id,
        refresh_client_version,
        refresh,
        rt.session_ttl_seconds,
        rt.session_ttr_seconds,
        now,
      )
      .await
      .map_err(|e| DomainError::Internal(format!("resolve cookie session: {e}")))?;

    let Some(resolved) = resolved else {
      tx.commit()
        .await
        .map_err(|e| DomainError::Internal(format!("commit empty cookie principal: {e}")))?;
      return Ok(None);
    };

    let Some(user) = load_current_user_in_tx(tx.tx_mut(), &resolved.user_id).await? else {
      return Ok(None);
    };
    if user.disabled {
      return Ok(None);
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit resolve_cookie_principal: {e}")))?;

    Ok(Some(CookiePrincipal {
      user,
      session_id: resolved.session_id,
      user_session_id: resolved.user_session_id,
      expires_at: resolved.expires_at,
      refreshed_expires_at: resolved.refreshed_expires_at,
      sign_in_client_version: resolved.sign_in_client_version,
      refresh_client_version: resolved.refresh_client_version,
    }))
  }

  /// Signs out a single user from a cookie session (when `user_id` is `Some`)
  /// or deletes the entire `multiple_users_sessions` row (when `user_id` is `None`).
  pub async fn sign_out_cookie(&self, session_id: &str, user_id: Option<&str>) -> Result<u64, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin sign_out_cookie: {e}")))?;
    let affected = self
      .sessions
      .revoke_cookie_session(tx.tx_mut(), session_id, user_id)
      .await
      .map_err(|e| DomainError::Internal(format!("revoke cookie session: {e}")))?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit sign_out_cookie: {e}")))?;
    Ok(affected)
  }

  /// Lists active, non-expired, non-disabled user IDs remaining in a cookie
  /// session ordered by `created_at ASC` (mirrors `v0.27.5` `cookie_users`).
  pub async fn list_cookie_session_users(&self, session_id: &str) -> Result<Vec<String>, DomainError> {
    if session_id.trim().is_empty() {
      return Ok(Vec::new());
    }
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire list_cookie_session_users: {e}")))?;
    let rows = sqlx::query(
      r#"SELECT s.user_id,
                a.id AS auth_session_id,
                a.revoked_at AS auth_revoked_at,
                (a.idle_expires_at > clock_timestamp()) AS auth_idle_ok,
                (a.absolute_expires_at > clock_timestamp()) AS auth_abs_ok
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN auth_sessions a ON a.user_session_id = s.id
         WHERE s.session_id = $1
           AND u.disabled = false
           AND (s.expires_at IS NULL OR s.expires_at > clock_timestamp())
         ORDER BY s.created_at ASC"#,
    )
    .bind(session_id)
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("list cookie session users: {e}")))?;

    let mut users = Vec::with_capacity(rows.len());
    for row in rows {
      let auth_id: Option<String> = row.get("auth_session_id");
      let auth_revoked_at: Option<DateTime<Utc>> = row.get("auth_revoked_at");
      let auth_idle_ok: Option<bool> = row.get("auth_idle_ok");
      let auth_abs_ok: Option<bool> = row.get("auth_abs_ok");
      let auth_valid =
        auth_id.is_none() || (auth_revoked_at.is_none() && auth_idle_ok == Some(true) && auth_abs_ok == Some(true));
      if auth_valid {
        users.push(row.get::<String, _>("user_id"));
      }
    }
    Ok(users)
  }

  /// Prepares a 6-digit Magic-Link OTP stored in `public.runtime_states` and
  /// atomically queues a `public.mail_deliveries` row matching `v0.27.5`.
  pub async fn prepare_magic_link(&self, input: PrepareMagicLinkInput) -> Result<PreparedMagicLink, DomainError> {
    let rt = self.load_dynamic_auth_runtime().await;
    let email = canonical_email(&input.email)?;
    let email_lower = email.to_ascii_lowercase();
    let mut callback = url::Url::parse(&input.callback_url)
      .map_err(|_| DomainError::Validation("invalid magic link callback URL".to_owned()))?;
    if !matches!(callback.scheme(), "http" | "https") {
      return Err(DomainError::Validation(
        "invalid magic link callback URL scheme".to_owned(),
      ));
    }

    // Perform DNS email-domain verification outside the write transaction / row locks.
    let domain_precheck_ok = if rt.require_email_domain_verification {
      let mut read_conn = self
        .db
        .acquire_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|e| DomainError::Internal(format!("acquire magic link domain precheck: {e}")))?;
      let known_user: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE lower(email) = lower($1))")
        .bind(&email)
        .fetch_one(&mut *read_conn)
        .await
        .map_err(|e| DomainError::Internal(format!("check magic link known user: {e}")))?;
      drop(read_conn);
      if known_user {
        false
      } else {
        self.verify_signup_domain(&email).await?;
        true
      }
    } else {
      false
    };

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin prepare_magic_link: {e}")))?;
    lock_email(tx.tx_mut(), &email).await?;

    let users =
      sqlx::query("SELECT id, disabled, auth_epoch FROM users WHERE lower(email) = lower($1) ORDER BY id FOR UPDATE")
        .bind(&email)
        .fetch_all(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("lock magic link user: {e}")))?;

    if users.is_empty() {
      if !rt.allow_signup {
        return Err(DomainError::Forbidden("sign_up_forbidden".to_owned()));
      }
      if rt.require_email_domain_verification && !domain_precheck_ok {
        self.verify_signup_domain(&email).await?;
      }
    }
    if users.len() > 1 || users.first().is_some_and(|r| r.get::<bool, _>("disabled")) {
      return Err(DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()));
    }

    let otp = format!("{:06}", rand::rng().random_range(0..1_000_000_u32));
    callback
      .query_pairs_mut()
      .append_pair("token", &otp)
      .append_pair("email", &email);

    let now = decision_time(tx.tx_mut()).await?;
    let expires_at = now + Duration::seconds(MAGIC_LINK_TTL_SECONDS);
    let existing_user_id = users.first().map(|r| r.get::<String, _>("id"));
    let payload = serde_json::json!({
      "otpHash": token_hash(&otp),
      "clientNonce": input.client_nonce,
      "userId": existing_user_id,
      "authEpoch": users.first().map(|r| r.get::<i32, _>("auth_epoch")),
    });

    sqlx::query(
      r#"INSERT INTO runtime_states (purpose, token_hash, lookup_key, payload, attempts, consumed_at, expires_at)
         VALUES ($1, $2, $3, $4, 0, NULL, $5)
         ON CONFLICT (purpose, token_hash) DO UPDATE SET
           lookup_key = EXCLUDED.lookup_key,
           payload = EXCLUDED.payload,
           attempts = 0,
           consumed_at = NULL,
           expires_at = EXCLUDED.expires_at,
           updated_at = $6"#,
    )
    .bind(MAGIC_LINK_PURPOSE)
    .bind(email_selector(&email))
    .bind(&email)
    .bind(payload)
    .bind(expires_at)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("store magic link state: {e}")))?;

    let is_signup = users.is_empty();
    let mail_name = if is_signup { "SignUp" } else { "SignIn" };
    let dedupe_key = format!("auth:magic-link:{}:{}", email_selector(&email), token_hash(&otp));

    // Align with `auth_session/mail.rs`: lock dedupe key, short-circuit if already
    // queued, invoke in-transaction quota policy, then insert with HMAC-SHA256
    // recipient_hash and `recipient_user_id = NULL`.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('auth:mail:' || $1, 0))")
      .bind(&dedupe_key)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock auth mail dedupe key: {e}")))?;
    let already_queued: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM mail_deliveries WHERE dedupe_key = $1)")
      .bind(&dedupe_key)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("check auth mail dedupe key: {e}")))?;

    if !already_queued {
      self
        .rate_limit_policy
        .check_auth_mail(tx.tx_mut(), mail_name, &email_lower, None, input.source.as_ref(), now)
        .await?;

      let recipient_domain = email_lower.split_once('@').map(|(_, d)| d).unwrap_or_default();
      let recipient_hash = hmac_sha256_hex(&self.config.private_key, &email_lower)?;
      let mail_payload = serde_json::json!({
        "name": mail_name,
        "to": email,
        "props": {
          "url": callback.as_str(),
          "otp": otp,
          "serverName": self.config.server_name,
        },
      });
      let quota_decision = serde_json::json!({
        "allowed": true,
        "mailClass": "auth",
        "requested": 1,
      });
      sqlx::query(
        r#"INSERT INTO mail_deliveries
             (mail_name, mail_class, priority, status, dedupe_key, recipient_email,
              recipient_hash, recipient_domain, recipient_user_id, quota_decision,
              payload, send_after, expires_at, max_attempts)
           VALUES ($1, 'auth', 'critical', 'queued', $2, $3, $4, $5, $6, $7, $8, $9, $10, 3)
           ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING"#,
      )
      .bind(mail_name)
      .bind(&dedupe_key)
      .bind(&email)
      .bind(&recipient_hash)
      .bind(recipient_domain)
      .bind(None::<&str>)
      .bind(quota_decision)
      .bind(mail_payload)
      .bind(now)
      .bind(expires_at)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("reserve magic link mail delivery: {e}")))?;
    }

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit prepare_magic_link: {e}")))?;

    Ok(PreparedMagicLink {
      email,
      otp,
      callback_url: callback.to_string(),
      is_signup,
      expires_at,
    })
  }

  /// Shared Magic-Link OTP/nonce verification and user upsert transaction helper
  /// used by both [`Self::complete_magic_link`] and [`Self::complete_magic_link_native`].
  async fn verify_and_upsert_magic_link_user(
    &self,
    input: &CompleteMagicLinkInput,
    rt: &DynamicAuthRuntime,
  ) -> Result<(server_db::TieredTx<'_>, String, DateTime<Utc>, bool), DomainError> {
    let email = canonical_email(&input.email)?;
    let domain_precheck_ok = if rt.require_email_domain_verification {
      let mut read_conn = self
        .db
        .acquire_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|e| DomainError::Internal(format!("acquire magic link complete domain precheck: {e}")))?;
      let known_user: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE lower(email) = lower($1))")
        .bind(&email)
        .fetch_one(&mut *read_conn)
        .await
        .map_err(|e| DomainError::Internal(format!("check magic link complete known user: {e}")))?;
      let valid_signup_challenge = if known_user {
        false
      } else {
        let state_row = sqlx::query(
          "SELECT payload, expires_at, clock_timestamp() AS now
           FROM runtime_states
           WHERE purpose = $1 AND token_hash = $2 AND consumed_at IS NULL",
        )
        .bind(MAGIC_LINK_PURPOSE)
        .bind(email_selector(&email))
        .fetch_optional(&mut *read_conn)
        .await
        .map_err(|e| DomainError::Internal(format!("precheck magic link state: {e}")))?;
        if let Some(row) = state_row {
          let payload: Value = row.get("payload");
          let expires_at: DateTime<Utc> = row.get("expires_at");
          let precheck_now: DateTime<Utc> = row.get("now");
          let expected_nonce = payload
            .get("clientNonce")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty());
          let supplied_nonce = input.client_nonce.as_deref().filter(|s| !s.is_empty());
          let stored_hash = payload.get("otpHash").and_then(Value::as_str).unwrap_or_default();
          let supplied_hash = token_hash(&input.otp);
          let is_signup_challenge = payload.get("userId").and_then(Value::as_str).is_none()
            && payload.get("authEpoch").and_then(Value::as_i64).is_none();
          precheck_now < expires_at
            && is_signup_challenge
            && expected_nonce == supplied_nonce
            && constant_time_equal(stored_hash, &supplied_hash)
        } else {
          false
        }
      };
      drop(read_conn);
      if !known_user && valid_signup_challenge && rt.allow_signup {
        self.verify_signup_domain(&email).await?;
        true
      } else {
        false
      }
    } else {
      false
    };

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin complete_magic_link: {e}")))?;
    lock_email(tx.tx_mut(), &email).await?;

    let users =
      sqlx::query("SELECT id, disabled, auth_epoch FROM users WHERE lower(email) = lower($1) ORDER BY id FOR UPDATE")
        .bind(&email)
        .fetch_all(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("lock magic link completion user: {e}")))?;
    if users.len() > 1 {
      return Err(DomainError::Unauthorized("invalid_email_token".to_owned()));
    }

    let now = decision_time(tx.tx_mut()).await?;
    let state = sqlx::query(
      "SELECT payload, attempts, expires_at
       FROM runtime_states
       WHERE purpose = $1 AND token_hash = $2 AND consumed_at IS NULL
       FOR UPDATE",
    )
    .bind(MAGIC_LINK_PURPOSE)
    .bind(email_selector(&email))
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lock magic link state: {e}")))?;

    let Some(state) = state else {
      return Err(DomainError::Unauthorized("invalid_email_token".to_owned()));
    };

    let payload: Value = state.get("payload");
    let attempts: i32 = state.get("attempts");
    let expires_at: DateTime<Utc> = state.get("expires_at");

    if now >= expires_at {
      consume_magic_state(tx.tx_mut(), &email, now).await?;
      tx.commit()
        .await
        .map_err(|e| DomainError::Internal(format!("commit expired magic link: {e}")))?;
      return Err(DomainError::Unauthorized("invalid_email_token".to_owned()));
    }

    let expected_nonce = payload
      .get("clientNonce")
      .and_then(Value::as_str)
      .filter(|s| !s.is_empty());
    let supplied_nonce = input.client_nonce.as_deref().filter(|s| !s.is_empty());
    if expected_nonce != supplied_nonce {
      return Err(DomainError::Unauthorized("invalid_auth_state".to_owned()));
    }

    let stored_hash = payload.get("otpHash").and_then(Value::as_str).unwrap_or_default();
    let supplied_hash = token_hash(&input.otp);
    if !constant_time_equal(stored_hash, &supplied_hash) {
      let next_attempts = attempts.saturating_add(1);
      let consume = next_attempts >= MAGIC_LINK_MAX_ATTEMPTS;
      sqlx::query(
        "UPDATE runtime_states
         SET attempts = $3,
             consumed_at = CASE WHEN $4 THEN $5 ELSE NULL END,
             updated_at = $5
         WHERE purpose = $1 AND token_hash = $2",
      )
      .bind(MAGIC_LINK_PURPOSE)
      .bind(email_selector(&email))
      .bind(next_attempts)
      .bind(consume)
      .bind(now)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("record magic link attempt: {e}")))?;
      tx.commit()
        .await
        .map_err(|e| DomainError::Internal(format!("commit magic link attempt: {e}")))?;
      return Err(DomainError::Unauthorized("invalid_email_token".to_owned()));
    }

    let challenge_uid = payload.get("userId").and_then(Value::as_str);
    let challenge_epoch = payload.get("authEpoch").and_then(Value::as_i64);

    let (user_id, created_user) = if let Some(row) = users.first() {
      let uid: String = row.get("id");
      let disabled: bool = row.get("disabled");
      let auth_epoch: i32 = row.get("auth_epoch");
      if disabled || challenge_uid != Some(uid.as_str()) || challenge_epoch != Some(i64::from(auth_epoch)) {
        return Err(DomainError::Unauthorized("invalid_email_token".to_owned()));
      }
      sqlx::query("UPDATE users SET registered = true, email_verified = COALESCE(email_verified, $2) WHERE id = $1")
        .bind(&uid)
        .bind(now)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("verify magic link user: {e}")))?;
      (uid, false)
    } else {
      if challenge_uid.is_some() || challenge_epoch.is_some() {
        return Err(DomainError::Unauthorized("invalid_email_token".to_owned()));
      }
      if !rt.allow_signup {
        return Err(DomainError::Forbidden("sign_up_forbidden".to_owned()));
      }
      if rt.require_email_domain_verification && !domain_precheck_ok {
        self.verify_signup_domain(&email).await?;
      }
      let uid = Uuid::new_v4().to_string();
      let name = email.split('@').next().unwrap_or(&email);
      sqlx::query(
        r#"INSERT INTO users (id, name, email, email_verified, registered, disabled, auth_epoch, created_at)
           VALUES ($1, $2, $3, $4, true, false, 0, $4)"#,
      )
      .bind(&uid)
      .bind(name)
      .bind(&email)
      .bind(now)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("create magic link user: {e}")))?;
      (uid, true)
    };

    consume_magic_state(tx.tx_mut(), &email, now).await?;
    Ok((tx, user_id, now, created_user))
  }

  /// Completes a Magic-Link OTP challenge for a native client, creating or
  /// verifying the user and issuing ONLY an `exchangeCode` (`runtime_states`)
  /// without writing `user_sessions` or `multiple_users_sessions`.
  pub async fn complete_magic_link_native(
    &self,
    input: CompleteMagicLinkInput,
  ) -> Result<(CurrentUserView, String), DomainError> {
    let rt = self.load_dynamic_auth_runtime().await;
    let (mut tx, user_id, _now, _created_user) = self.verify_and_upsert_magic_link_user(&input, &rt).await?;
    let user = load_current_user_in_tx(tx.tx_mut(), &user_id)
      .await?
      .ok_or_else(|| DomainError::Internal("magic link user missing after upsert".to_owned()))?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit complete_magic_link_native: {e}")))?;

    let exchange_code = self
      .issue_exchange_code(&user.id, input.client_version.as_deref())
      .await?;
    Ok((user, exchange_code))
  }

  /// Completes a Magic-Link OTP challenge from `public.runtime_states`,
  /// creating or verifying the user, issuing a cookie session, and invoking
  /// [`SessionPolicyHook::on_session_created`] atomically.
  pub async fn complete_magic_link(&self, input: CompleteMagicLinkInput) -> Result<CookieSignInResult, DomainError> {
    let rt = self.load_dynamic_auth_runtime().await;
    let (mut tx, user_id, now, created_user) = self.verify_and_upsert_magic_link_user(&input, &rt).await?;

    let issued = self
      .sessions
      .issue_cookie_session(
        tx.tx_mut(),
        &user_id,
        input.existing_session_id.as_deref(),
        input.client_version.as_deref(),
        rt.session_ttl_seconds,
        now,
      )
      .await
      .map_err(|e| DomainError::Internal(format!("issue magic link cookie session: {e}")))?;

    self
      .session_policy
      .on_session_created(tx.tx_mut(), &user_id, &issued.session_id, now)
      .await?;

    let user = load_current_user_in_tx(tx.tx_mut(), &user_id)
      .await?
      .ok_or_else(|| DomainError::Internal("magic link user missing after upsert".to_owned()))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit complete_magic_link: {e}")))?;

    Ok(CookieSignInResult {
      user,
      session_id: issued.session_id,
      user_session_id: issued.user_session_id,
      expires_at: issued.expires_at,
      created_user,
    })
  }

  /// Issues a one-time Open-App sign-in code stored in `public.runtime_states`.
  pub async fn create_open_app_code(&self, user_id: &str) -> Result<String, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin create_open_app_code: {e}")))?;
    let row = sqlx::query("SELECT disabled, auth_epoch FROM users WHERE id = $1 FOR UPDATE")
      .bind(user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock open-app user: {e}")))?
      .ok_or_else(|| DomainError::Unauthorized("invalid_auth_state".to_owned()))?;
    if row.get::<bool, _>("disabled") {
      return Err(DomainError::Unauthorized("invalid_auth_state".to_owned()));
    }
    let auth_epoch: i32 = row.get("auth_epoch");
    let now = decision_time(tx.tx_mut()).await?;
    let code = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO runtime_states (purpose, token_hash, payload, expires_at) VALUES ($1, $2, $3, $4)")
      .bind(OPEN_APP_PURPOSE)
      .bind(token_hash(&code))
      .bind(serde_json::json!({ "userId": user_id, "authEpoch": auth_epoch }))
      .bind(now + Duration::seconds(OPEN_APP_TTL_SECONDS))
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("store open-app code: {e}")))?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit create_open_app_code: {e}")))?;
    Ok(code)
  }

  /// Atomically consumes a one-time Open-App sign-in code and either issues a
  /// cookie session (`OpenAppIssueTarget::Cookie`) or inserts a native
  /// `auth_challenge:auth_session_exchange` code in the exact same transaction
  /// without creating any cookie session (`OpenAppIssueTarget::Native`).
  pub async fn complete_open_app(
    &self,
    code: &str,
    target: OpenAppIssueTarget<'_>,
  ) -> Result<OpenAppSignInResult, DomainError> {
    let trimmed = code.trim();
    if trimmed.is_empty() {
      return Err(DomainError::Unauthorized("invalid_auth_state".to_owned()));
    }
    let hashed = token_hash(trimmed);
    let preview: Option<Value> = {
      let mut conn = self
        .db
        .acquire_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|e| DomainError::Internal(format!("acquire open-app code read: {e}")))?;
      let row = sqlx::query_scalar(
        "SELECT payload FROM runtime_states WHERE purpose = $1 AND token_hash = $2 AND consumed_at IS NULL AND expires_at > clock_timestamp()",
      )
      .bind(OPEN_APP_PURPOSE)
      .bind(&hashed)
      .fetch_optional(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("load open-app code: {e}")))?;
      drop(conn);
      row
    };
    let user_id = preview
      .as_ref()
      .and_then(|v| v.get("userId"))
      .and_then(Value::as_str)
      .ok_or_else(|| DomainError::Unauthorized("invalid_auth_state".to_owned()))?
      .to_owned();

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin complete_open_app: {e}")))?;
    let user_row = sqlx::query("SELECT disabled, auth_epoch FROM users WHERE id = $1 FOR UPDATE")
      .bind(&user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock open-app completion user: {e}")))?
      .ok_or_else(|| DomainError::Unauthorized("invalid_auth_state".to_owned()))?;
    let disabled: bool = user_row.get("disabled");
    let auth_epoch: i32 = user_row.get("auth_epoch");
    let now = decision_time(tx.tx_mut()).await?;

    let consumed: Option<Value> = sqlx::query_scalar(
      r#"UPDATE runtime_states SET consumed_at = $3, updated_at = $3
         WHERE purpose = $1 AND token_hash = $2 AND consumed_at IS NULL AND expires_at > $3
         RETURNING payload"#,
    )
    .bind(OPEN_APP_PURPOSE)
    .bind(&hashed)
    .bind(now)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("consume open-app code: {e}")))?;
    let valid = consumed.as_ref().is_some_and(|v| {
      v.get("userId").and_then(Value::as_str) == Some(user_id.as_str())
        && v.get("authEpoch").and_then(Value::as_i64) == Some(i64::from(auth_epoch))
    });
    if !valid || disabled {
      return Err(DomainError::Unauthorized("invalid_auth_state".to_owned()));
    }

    let user = load_current_user_in_tx(tx.tx_mut(), &user_id)
      .await?
      .ok_or_else(|| DomainError::Internal("open-app user missing".to_owned()))?;

    match target {
      OpenAppIssueTarget::Native { client_version } => {
        let exchange_code = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let challenge_key = token_hash(&exchange_code);
        let expires_at = now + Duration::seconds(AUTH_SESSION_EXCHANGE_TTL_SECONDS);
        let payload = serde_json::json!({
          "userId": user_id,
          "authEpoch": auth_epoch,
          "clientVersion": client_version,
        });
        sqlx::query(
          r#"INSERT INTO runtime_states (purpose, token_hash, payload, created_at, updated_at, expires_at)
             VALUES ($1, $2, $3, $4, $4, $5)"#,
        )
        .bind(AUTH_SESSION_EXCHANGE_PURPOSE)
        .bind(&challenge_key)
        .bind(&payload)
        .bind(now)
        .bind(expires_at)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("insert native open-app exchange code: {e}")))?;

        tx.commit()
          .await
          .map_err(|e| DomainError::Internal(format!("commit complete_open_app native: {e}")))?;
        Ok(OpenAppSignInResult::Native { user, exchange_code })
      }
      OpenAppIssueTarget::Cookie {
        existing_session_id,
        client_version,
      } => {
        let issued = self
          .sessions
          .issue_cookie_session(
            tx.tx_mut(),
            &user_id,
            existing_session_id,
            client_version,
            self.config.session_ttl_seconds,
            now,
          )
          .await
          .map_err(|e| DomainError::Internal(format!("issue open-app cookie session: {e}")))?;

        self
          .session_policy
          .on_session_created(tx.tx_mut(), &user_id, &issued.session_id, now)
          .await?;

        tx.commit()
          .await
          .map_err(|e| DomainError::Internal(format!("commit complete_open_app cookie: {e}")))?;

        Ok(OpenAppSignInResult::Cookie(CookieSignInResult {
          user,
          session_id: issued.session_id,
          user_session_id: issued.user_session_id,
          expires_at: issued.expires_at,
          created_user: false,
        }))
      }
    }
  }

  /// Resolves an `Authorization: Bearer <jwt>` access token against
  /// `auth.session.signingKeys`, `auth_sessions`, `user_sessions`, and `users`,
  /// matching `v0.27.5` `auth_session/principal.rs` 1:1.
  ///
  /// Database/connectivity errors return [`BearerResolutionError::Domain`]
  /// (500/503) rather than masking outages as `ACCESS_TOKEN_INVALID`.
  pub async fn resolve_bearer_principal(
    &self,
    token: &str,
  ) -> Result<access_token::BearerPrincipal, BearerResolutionError> {
    use access_token::{AccessTokenErrorCode, AccessTokenVerification};
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};

    let Some(key_id) = access_token::access_token_key_id(token) else {
      return Err(BearerResolutionError::Token(AccessTokenErrorCode::AccessTokenInvalid));
    };

    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| BearerResolutionError::Domain(DomainError::Unavailable(e.to_string())))?;

    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut *conn)
      .await
      .map_err(|e| BearerResolutionError::Domain(DomainError::Internal(format!("bearer clock: {e}"))))?;

    let keys_val: Option<Value> = sqlx::query_scalar("SELECT value FROM app_configs WHERE id = $1")
      .bind(keyring::SIGNING_KEYS_CONFIG_ID)
      .fetch_optional(&mut *conn)
      .await
      .map_err(|e| BearerResolutionError::Domain(DomainError::Internal(format!("bearer signing keys: {e}"))))?;

    let keys: Vec<keyring::StoredSigningKey> = keys_val
      .and_then(|v| serde_json::from_value(v).ok())
      .unwrap_or_default();

    let key = keys
      .iter()
      .find(|k| {
        k.id == key_id
          && (k.status == "active" || (k.status == "retiring" && k.verify_until.is_some_and(|until| until >= now)))
      })
      .ok_or(BearerResolutionError::Token(AccessTokenErrorCode::AccessTokenInvalid))?;

    let secret = URL_SAFE_NO_PAD
      .decode(&key.secret)
      .map_err(|_| BearerResolutionError::Domain(DomainError::Internal("invalid signing key encoding".into())))?;

    let (user_id, auth_session_id) = match access_token::verify_access_token(token, &key.id, &secret, now.timestamp()) {
      AccessTokenVerification::Valid {
        user_id,
        auth_session_id,
      } => (user_id, auth_session_id),
      AccessTokenVerification::Expired => {
        return Err(BearerResolutionError::Token(AccessTokenErrorCode::AccessTokenExpired));
      }
      AccessTokenVerification::Invalid => {
        return Err(BearerResolutionError::Token(AccessTokenErrorCode::AccessTokenInvalid));
      }
    };

    drop(conn);

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| BearerResolutionError::Domain(DomainError::Unavailable(e.to_string())))?;

    let row = sqlx::query(
      r#"SELECT s.id AS user_session_id,
                s.session_id,
                s.user_id,
                s.expires_at,
                s.sign_in_client_version,
                s.refresh_client_version,
                a.id AS auth_session_id,
                a.created_at AS auth_created_at,
                a.idle_expires_at,
                a.absolute_expires_at,
                a.revoked_at,
                u.disabled
         FROM auth_sessions a
         JOIN user_sessions s ON s.id = a.user_session_id
         JOIN users u ON u.id = s.user_id
         WHERE a.id = $1"#,
    )
    .bind(&auth_session_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| BearerResolutionError::Domain(DomainError::Internal(format!("load bearer auth_session: {e}"))))?
    .ok_or(BearerResolutionError::Token(AccessTokenErrorCode::AccessTokenInvalid))?;

    let row_user_id: String = row.get("user_id");
    if row_user_id != user_id {
      return Err(BearerResolutionError::Token(AccessTokenErrorCode::AccessTokenInvalid));
    }

    let check_now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| BearerResolutionError::Domain(DomainError::Internal(format!("bearer check clock: {e}"))))?;

    let disabled: bool = row.get("disabled");
    let revoked_at: Option<DateTime<Utc>> = row.get("revoked_at");
    if disabled || revoked_at.is_some() {
      return Err(BearerResolutionError::Token(AccessTokenErrorCode::AuthSessionRevoked));
    }

    let idle_expires_at: DateTime<Utc> = row.get("idle_expires_at");
    let absolute_expires_at: DateTime<Utc> = row.get("absolute_expires_at");
    let user_session_expires_at: Option<DateTime<Utc>> = row.get("expires_at");
    if idle_expires_at <= check_now
      || absolute_expires_at <= check_now
      || user_session_expires_at.is_some_and(|exp| exp <= check_now)
    {
      return Err(BearerResolutionError::Token(AccessTokenErrorCode::AuthSessionExpired));
    }

    let user = load_current_user_in_tx(tx.tx_mut(), &user_id)
      .await
      .map_err(BearerResolutionError::Domain)?
      .ok_or(BearerResolutionError::Token(AccessTokenErrorCode::AccessTokenInvalid))?;

    let session_id: String = row.get("session_id");
    let user_session_id: String = row.get("user_session_id");
    let authenticated_at: DateTime<Utc> = row.get("auth_created_at");
    let sign_in_client_version: Option<String> = row.get("sign_in_client_version");
    let refresh_client_version: Option<String> = row.get("refresh_client_version");

    let _ = tx.commit().await;

    Ok(access_token::BearerPrincipal {
      user,
      session_id,
      user_session_id,
      auth_session_id,
      authenticated_at,
      expires_at: user_session_expires_at,
      sign_in_client_version,
      refresh_client_version,
    })
  }

  /// Issues a one-time native auth-session exchange code stored in `runtime_states`.
  pub async fn issue_exchange_code(&self, user_id: &str, client_version: Option<&str>) -> Result<String, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin issue_exchange_code: {e}")))?;
    let now = decision_time(tx.tx_mut()).await?;
    let row = sqlx::query("SELECT disabled, auth_epoch FROM users WHERE id = $1")
      .bind(user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load user for exchange code: {e}")))?
      .ok_or_else(|| DomainError::Unauthorized("invalid_auth_state".to_owned()))?;
    let disabled: bool = row.get("disabled");
    if disabled {
      return Err(DomainError::Unauthorized("invalid_auth_state".to_owned()));
    }
    let auth_epoch: i32 = row.get("auth_epoch");
    let code = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let challenge_key = token_hash(&code);
    let expires_at = now + Duration::seconds(AUTH_SESSION_EXCHANGE_TTL_SECONDS);
    let payload = serde_json::json!({
      "userId": user_id,
      "authEpoch": auth_epoch,
      "clientVersion": client_version,
    });
    sqlx::query(
      r#"INSERT INTO runtime_states (purpose, token_hash, payload, created_at, updated_at, expires_at)
         VALUES ($1, $2, $3, $4, $4, $5)"#,
    )
    .bind(AUTH_SESSION_EXCHANGE_PURPOSE)
    .bind(&challenge_key)
    .bind(&payload)
    .bind(now)
    .bind(expires_at)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("insert auth exchange code: {e}")))?;
    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit issue_exchange_code: {e}")))?;
    Ok(code)
  }

  /// Exchanges a one-time `exchangeCode` for a native Bearer access token +
  /// rotating refresh token (`POST /api/auth/session/exchange`).
  pub async fn exchange_auth_session(
    &self,
    code: &str,
    installation_id: &str,
    platform: &str,
    device_name: Option<&str>,
    app_version: Option<&str>,
  ) -> Result<AuthTokenPair, DomainError> {
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};

    if code.trim().is_empty() || installation_id.trim().is_empty() || platform.trim().is_empty() {
      return Err(DomainError::Validation(
        "invalid exchange session parameters".to_owned(),
      ));
    }

    let keys = self.ensure_signing_keys().await?;
    let active_key = keys
      .iter()
      .find(|k| k.status == "active")
      .ok_or_else(|| DomainError::Internal("no active auth signing key".to_owned()))?;
    let secret = URL_SAFE_NO_PAD
      .decode(&active_key.secret)
      .map_err(|_| DomainError::Internal("invalid active signing key encoding".to_owned()))?;

    let challenge_key = token_hash(code);
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin exchange_auth_session: {e}")))?;

    let preview: Option<Value> = sqlx::query_scalar(
      r#"SELECT payload FROM runtime_states
         WHERE purpose = $1 AND token_hash = $2
           AND consumed_at IS NULL AND expires_at > clock_timestamp()"#,
    )
    .bind(AUTH_SESSION_EXCHANGE_PURPOSE)
    .bind(&challenge_key)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load exchange code preview: {e}")))?;
    let Some(preview) = preview else {
      return Err(DomainError::Unauthorized("invalid_auth_state".to_owned()));
    };
    let user_id = preview
      .get("userId")
      .and_then(Value::as_str)
      .filter(|s| !s.is_empty())
      .ok_or_else(|| DomainError::Unauthorized("invalid_auth_state".to_owned()))?
      .to_owned();

    let user_row = sqlx::query("SELECT disabled, auth_epoch FROM users WHERE id = $1 FOR UPDATE")
      .bind(&user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock user for exchange: {e}")))?
      .ok_or_else(|| DomainError::Unauthorized("invalid_auth_state".to_owned()))?;
    let disabled: bool = user_row.get("disabled");
    let auth_epoch: i32 = user_row.get("auth_epoch");
    if disabled {
      return Err(DomainError::Unauthorized("invalid_auth_state".to_owned()));
    }

    let locked_challenge: Option<Value> = sqlx::query_scalar(
      r#"SELECT payload FROM runtime_states
         WHERE purpose = $1 AND token_hash = $2
           AND consumed_at IS NULL AND expires_at > clock_timestamp()
         FOR UPDATE"#,
    )
    .bind(AUTH_SESSION_EXCHANGE_PURPOSE)
    .bind(&challenge_key)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lock exchange code: {e}")))?;
    let Some(challenge) = locked_challenge else {
      return Err(DomainError::Unauthorized("invalid_auth_state".to_owned()));
    };
    let challenge_epoch = challenge.get("authEpoch").and_then(Value::as_i64);
    if challenge.get("userId").and_then(Value::as_str) != Some(user_id.as_str())
      || challenge_epoch != Some(i64::from(auth_epoch))
    {
      return Err(DomainError::Unauthorized("invalid_auth_state".to_owned()));
    }

    let token_policy = load_auth_token_policy_in_tx(tx.tx_mut()).await?;
    let now = decision_time(tx.tx_mut()).await?;
    let absolute_expires_at = now + Duration::seconds(token_policy.refresh_absolute_ttl_secs);
    let idle_expires_at = (now + Duration::seconds(token_policy.refresh_idle_ttl_secs)).min(absolute_expires_at);
    let is_new_device: bool = !sqlx::query_scalar::<_, bool>(
      r#"SELECT EXISTS(
           SELECT 1 FROM auth_sessions a JOIN user_sessions u ON u.id = a.user_session_id
           WHERE u.user_id = $1 AND a.installation_id = $2
         )"#,
    )
    .bind(&user_id)
    .bind(installation_id)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("check new device: {e}")))?;

    let (refresh_id, refresh_raw, refresh_secret_hash) = generate_refresh_token();
    let issued = self
      .sessions
      .issue_auth_session(
        tx.tx_mut(),
        NewAuthSessionInput {
          user_id: user_id.clone(),
          installation_id: installation_id.to_owned(),
          platform: platform.to_owned(),
          device_name: device_name.map(str::to_owned),
          app_version: app_version
            .or_else(|| challenge.get("clientVersion").and_then(Value::as_str))
            .map(str::to_owned),
          refresh_token_id: refresh_id,
          refresh_secret_hash,
          idle_expires_at,
          absolute_expires_at,
        },
        now,
      )
      .await
      .map_err(|e| DomainError::Internal(format!("issue exchanged auth session: {e}")))?;

    sqlx::query("UPDATE runtime_states SET consumed_at = $3, updated_at = $3 WHERE purpose = $1 AND token_hash = $2")
      .bind(AUTH_SESSION_EXCHANGE_PURPOSE)
      .bind(&challenge_key)
      .bind(now)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("consume exchange code: {e}")))?;

    self
      .session_policy
      .on_session_created(tx.tx_mut(), &user_id, &issued.session_id, now)
      .await?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit exchange_auth_session: {e}")))?;

    let ttl = token_policy.access_token_ttl_secs;
    let jwt = access_token::sign_access_token(
      &user_id,
      &issued.auth_session_id,
      &active_key.id,
      &secret,
      now.timestamp(),
      (now + Duration::seconds(ttl)).timestamp(),
    )?;

    Ok(AuthTokenPair {
      user_id,
      token_type: "Bearer",
      access_token: jwt,
      expires_in: ttl,
      refresh_token: refresh_raw,
      refresh_expires_at: idle_expires_at,
      session: AuthTokenPairSession {
        id: issued.auth_session_id,
        absolute_expires_at,
      },
      is_new_device: Some(is_new_device),
    })
  }

  /// Consumes 1 unit of per-token rolling refresh rate limit
  /// (`auth:session_refresh:<token_id>`, 30 requests / 60s window, 10s buckets)
  /// in an independent transaction, matching `v0.27.5` `refresh.rs:285-301`
  /// and `rolling_quota/reservation.rs:148-210`.
  async fn consume_refresh_rate_limit(&self, token_id: &str) -> Result<(), DomainError> {
    let scope_key = format!("auth:session_refresh:{token_id}");
    let digest = Sha256::digest(scope_key.as_bytes());
    let lock_key = i64::from_be_bytes([
      digest[0], digest[1], digest[2], digest[3], digest[4], digest[5], digest[6], digest[7],
    ]);

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin refresh rate limit: {e}")))?;

    sqlx::query("SELECT pg_advisory_xact_lock($1)")
      .bind(lock_key)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock refresh rate limit: {e}")))?;

    let now = decision_time(tx.tx_mut()).await?;
    let bucket_ts = (now.timestamp() / REFRESH_RATE_LIMIT_BUCKET_SECS) * REFRESH_RATE_LIMIT_BUCKET_SECS;
    let bucket_start = DateTime::from_timestamp(bucket_ts, 0).unwrap_or(now);
    let window_start = now - Duration::seconds(i64::from(REFRESH_RATE_LIMIT_WINDOW_SECS));

    let counter_sum: i64 = sqlx::query_scalar(
      "SELECT COALESCE(SUM(count), 0)::bigint
       FROM runtime_rolling_quota_counters
       WHERE scope_key = $1 AND window_seconds = $2 AND bucket_start >= $3",
    )
    .bind(&scope_key)
    .bind(REFRESH_RATE_LIMIT_WINDOW_SECS)
    .bind(window_start)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("read refresh rate limit counters: {e}")))?;

    let reserved_sum: i64 = sqlx::query_scalar(
      "SELECT COALESCE(SUM(count), 0)::bigint
       FROM runtime_rolling_quota_reservations
       WHERE scope_key = $1 AND window_seconds = $2 AND bucket_start >= $3
         AND status = 'reserved' AND expires_at > $4",
    )
    .bind(&scope_key)
    .bind(REFRESH_RATE_LIMIT_WINDOW_SECS)
    .bind(window_start)
    .bind(now)
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("read refresh rate limit reservations: {e}")))?;

    if counter_sum.saturating_add(reserved_sum).saturating_add(1) > REFRESH_RATE_LIMIT_MAX_REQUESTS {
      return Err(DomainError::RateLimited("Too many requests.".into()));
    }

    let expires_at = now + Duration::seconds(120);
    sqlx::query(
      r#"INSERT INTO runtime_rolling_quota_counters
           (scope_key, window_seconds, bucket_start, count, expires_at, updated_at)
         VALUES ($1, $2, $3, 1, $4, $5)
         ON CONFLICT (scope_key, window_seconds, bucket_start) DO UPDATE SET
           count = runtime_rolling_quota_counters.count + EXCLUDED.count,
           expires_at = GREATEST(runtime_rolling_quota_counters.expires_at, EXCLUDED.expires_at),
           updated_at = EXCLUDED.updated_at"#,
    )
    .bind(&scope_key)
    .bind(REFRESH_RATE_LIMIT_WINDOW_SECS)
    .bind(bucket_start)
    .bind(expires_at)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("commit refresh rate limit counter: {e}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit refresh rate limit: {e}")))?;
    Ok(())
  }

  /// Rotates, recovers, or grace-replays a native refresh token and returns a
  /// fresh access/refresh token pair (`POST /api/auth/session/refresh`),
  /// matching `v0.27.5` `auth_session/refresh.rs` 1:1.
  pub async fn refresh_auth_session(
    &self,
    refresh_token: &str,
    app_version: Option<&str>,
    attempt_id: Option<&str>,
  ) -> Result<AuthTokenPair, DomainError> {
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};

    let Some((token_id, secret_hash)) = parse_refresh_token(refresh_token) else {
      return Err(DomainError::Unauthorized("invalid_refresh_token".to_owned()));
    };

    // Discover owner first so unknown token IDs return REFRESH_TOKEN_INVALID without consuming quota.
    let owner = {
      let mut conn = self
        .db
        .acquire_tiered(WorkloadTier::InteractiveRead)
        .await
        .map_err(|e| DomainError::Internal(format!("acquire refresh owner read: {e}")))?;
      sqlx::query(
        r#"SELECT r.auth_session_id, a.user_session_id, u.user_id
           FROM auth_refresh_tokens r
           JOIN auth_sessions a ON a.id = r.auth_session_id
           JOIN user_sessions u ON u.id = a.user_session_id
           WHERE r.id = $1"#,
      )
      .bind(&token_id)
      .fetch_optional(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("discover refresh token owner: {e}")))?
      .ok_or_else(|| DomainError::Unauthorized("invalid_refresh_token".to_owned()))?
    };

    let auth_session_id: String = owner.get("auth_session_id");
    let user_session_id: String = owner.get("user_session_id");
    let user_id: String = owner.get("user_id");

    // Independent per-token rolling refresh rate limit before locking session rows.
    self.consume_refresh_rate_limit(&token_id).await?;

    let encryption_key = SuccessorKey::derive(self.config.private_key.as_bytes())?;
    let attempt_hash = attempt_id.map(token_hash);

    let keys = self.ensure_signing_keys().await?;
    let active_key = keys
      .iter()
      .find(|k| k.status == "active")
      .ok_or_else(|| DomainError::Internal("no active auth signing key".to_owned()))?;
    let signing_secret = URL_SAFE_NO_PAD
      .decode(&active_key.secret)
      .map_err(|_| DomainError::Internal("invalid active signing key encoding".to_owned()))?;

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin refresh_auth_session: {e}")))?;

    let token_policy = load_auth_token_policy_in_tx(tx.tx_mut()).await?;

    // Deadlock-free lock order: users -> user_sessions -> auth_sessions -> auth_refresh_tokens (ORDER BY id).
    let disabled: bool = sqlx::query_scalar("SELECT disabled FROM users WHERE id = $1 FOR UPDATE")
      .bind(&user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock refresh user: {e}")))?
      .ok_or_else(|| DomainError::Unauthorized("invalid_refresh_token".to_owned()))?;

    let user_session_expires_at: Option<DateTime<Utc>> =
      sqlx::query_scalar("SELECT expires_at FROM user_sessions WHERE id = $1 FOR UPDATE")
        .bind(&user_session_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("lock refresh user_session: {e}")))?
        .ok_or_else(|| DomainError::Unauthorized("invalid_refresh_token".to_owned()))?;

    let session_row = sqlx::query(
      "SELECT idle_expires_at, absolute_expires_at, revoked_at FROM auth_sessions WHERE id = $1 AND user_session_id = $2 FOR UPDATE",
    )
    .bind(&auth_session_id)
    .bind(&user_session_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lock refresh auth_session: {e}")))?
    .ok_or_else(|| DomainError::Unauthorized("invalid_refresh_token".to_owned()))?;

    sqlx::query("SELECT id FROM auth_refresh_tokens WHERE auth_session_id = $1 ORDER BY id FOR UPDATE")
      .bind(&auth_session_id)
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock auth refresh tokens: {e}")))?;

    let token_row = sqlx::query(
      r#"SELECT id, generation, secret_hash, expires_at, used_at, replaced_by_id,
                grace_used_at, revoked_at, successor_ciphertext, successor_expires_at,
                refresh_attempt_hash
         FROM auth_refresh_tokens
         WHERE id = $1 AND auth_session_id = $2"#,
    )
    .bind(&token_id)
    .bind(&auth_session_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load locked refresh token row: {e}")))?
    .ok_or_else(|| DomainError::Unauthorized("invalid_refresh_token".to_owned()))?;

    let stored_hash: String = token_row.get("secret_hash");
    if !constant_time_equal(&stored_hash, &secret_hash) {
      return Err(DomainError::Unauthorized("invalid_refresh_token".to_owned()));
    }

    let now = decision_time(tx.tx_mut()).await?;
    let session_revoked_at: Option<DateTime<Utc>> = session_row.get("revoked_at");
    let token_revoked_at: Option<DateTime<Utc>> = token_row.get("revoked_at");
    if disabled || session_revoked_at.is_some() || token_revoked_at.is_some() {
      if disabled && session_revoked_at.is_none() {
        revoke_auth_session_locked(tx.tx_mut(), &auth_session_id, "user_disabled", now).await?;
        tx.commit()
          .await
          .map_err(|e| DomainError::Internal(format!("commit disabled auth session revoke: {e}")))?;
      }
      return Err(DomainError::Unauthorized("auth_session_revoked".to_owned()));
    }

    let idle_expires_at: DateTime<Utc> = session_row.get("idle_expires_at");
    let absolute_expires_at: DateTime<Utc> = session_row.get("absolute_expires_at");
    let token_expires_at: DateTime<Utc> = token_row.get("expires_at");
    if token_expires_at <= now
      || idle_expires_at <= now
      || absolute_expires_at <= now
      || user_session_expires_at.is_some_and(|exp| exp <= now)
    {
      return Err(DomainError::Unauthorized("auth_session_expired".to_owned()));
    }

    let used_at: Option<DateTime<Utc>> = token_row.get("used_at");
    let replaced_by_id: Option<String> = token_row.get("replaced_by_id");
    let grace_used_at: Option<DateTime<Utc>> = token_row.get("grace_used_at");
    let successor_ciphertext: Option<String> = token_row.get("successor_ciphertext");
    let successor_expires_at: Option<DateTime<Utc>> = token_row.get("successor_expires_at");
    let stored_attempt_hash: Option<String> = token_row.get("refresh_attempt_hash");

    if used_at.is_none() {
      // RefreshState::Rotate
      let generation: i32 = token_row.get("generation");
      let next_idle = (now + Duration::seconds(token_policy.refresh_idle_ttl_secs)).min(absolute_expires_at);
      let next_successor_expires_at = if attempt_hash.is_some() {
        token_expires_at.min(next_idle)
      } else {
        now + Duration::seconds(token_policy.refresh_grace_secs)
      };
      let (next_id, next_raw, next_hash) = generate_refresh_token();
      let ciphertext = encryption_key.encrypt(&next_raw, &token_id, &auth_session_id)?;

      sqlx::query(
        r#"INSERT INTO auth_refresh_tokens (id, auth_session_id, generation, secret_hash, created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6)"#,
      )
      .bind(&next_id)
      .bind(&auth_session_id)
      .bind(generation.saturating_add(1))
      .bind(&next_hash)
      .bind(now)
      .bind(next_idle)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("insert rotated refresh token: {e}")))?;

      sqlx::query(
        r#"UPDATE auth_refresh_tokens
           SET used_at = $2,
               replaced_by_id = $3,
               successor_ciphertext = $4,
               successor_expires_at = $5,
               refresh_attempt_hash = $6
           WHERE id = $1 AND used_at IS NULL"#,
      )
      .bind(&token_id)
      .bind(now)
      .bind(&next_id)
      .bind(&ciphertext)
      .bind(next_successor_expires_at)
      .bind(&attempt_hash)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("mark refresh token used: {e}")))?;

      sqlx::query(
        r#"UPDATE auth_refresh_tokens
           SET successor_ciphertext = NULL, successor_expires_at = NULL
           WHERE auth_session_id = $1 AND replaced_by_id = $2"#,
      )
      .bind(&auth_session_id)
      .bind(&token_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("clear previous successor ciphertext: {e}")))?;

      sqlx::query(
        "UPDATE auth_sessions SET last_seen_at = $2, idle_expires_at = $3, app_version = COALESCE($4, app_version) WHERE id = $1",
      )
      .bind(&auth_session_id)
      .bind(now)
      .bind(next_idle)
      .bind(app_version)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("update auth_session on refresh: {e}")))?;

      sqlx::query(
        "UPDATE user_sessions SET expires_at = $2, refresh_client_version = COALESCE($3, refresh_client_version) WHERE id = $1",
      )
      .bind(&user_session_id)
      .bind(next_idle)
      .bind(app_version)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("update user_session on refresh: {e}")))?;

      tx.commit()
        .await
        .map_err(|e| DomainError::Internal(format!("commit refresh_auth_session: {e}")))?;

      let ttl = token_policy.access_token_ttl_secs;
      let jwt = access_token::sign_access_token(
        &user_id,
        &auth_session_id,
        &active_key.id,
        &signing_secret,
        now.timestamp(),
        (now + Duration::seconds(ttl)).timestamp(),
      )?;

      return Ok(AuthTokenPair {
        user_id,
        token_type: "Bearer",
        access_token: jwt,
        expires_in: ttl,
        refresh_token: next_raw,
        refresh_expires_at: next_idle,
        session: AuthTokenPairSession {
          id: auth_session_id,
          absolute_expires_at,
        },
        is_new_device: None,
      });
    }

    // Token already used: classify Recover / Grace / Unavailable / Replay.
    let replacement = match replaced_by_id.as_deref() {
      Some(rep_id) => {
        sqlx::query("SELECT id, secret_hash, expires_at, used_at, revoked_at FROM auth_refresh_tokens WHERE id = $1")
          .bind(rep_id)
          .fetch_optional(&mut **tx.tx_mut())
          .await
          .map_err(|e| DomainError::Internal(format!("load replacement refresh token: {e}")))?
      }
      None => None,
    };

    let replacement_unused = replacement
      .as_ref()
      .is_some_and(|r| r.get::<Option<DateTime<Utc>>, _>("used_at").is_none());
    let successor_available = successor_ciphertext.is_some()
      && successor_expires_at.is_some_and(|exp| exp > now)
      && replacement.as_ref().is_some_and(|r| {
        r.get::<Option<DateTime<Utc>>, _>("used_at").is_none()
          && r.get::<Option<DateTime<Utc>>, _>("revoked_at").is_none()
          && r.get::<DateTime<Utc>, _>("expires_at") > now
      });
    let attempt_matches = stored_attempt_hash.as_deref().map(|stored| {
      attempt_hash
        .as_deref()
        .is_some_and(|provided| constant_time_equal(stored, provided))
    });

    #[derive(Clone, Copy, Eq, PartialEq)]
    enum UsedDisposition {
      Recover,
      Grace,
      Unavailable,
      Replay,
    }

    let used_at_ts = used_at.expect("checked is_some above");
    let disposition = match attempt_matches {
      Some(true) => {
        if successor_available {
          UsedDisposition::Recover
        } else if replaced_by_id.is_some() && replacement_unused {
          UsedDisposition::Unavailable
        } else {
          UsedDisposition::Replay
        }
      }
      Some(false) => UsedDisposition::Replay,
      None => {
        let within_grace =
          grace_used_at.is_none() && (now - used_at_ts) <= Duration::seconds(token_policy.refresh_grace_secs);
        if within_grace && successor_available {
          UsedDisposition::Grace
        } else if within_grace && replaced_by_id.is_some() && replacement_unused {
          UsedDisposition::Unavailable
        } else {
          UsedDisposition::Replay
        }
      }
    };

    match disposition {
      UsedDisposition::Recover | UsedDisposition::Grace => {
        let Some(rep_row) = replacement else {
          return Err(DomainError::Unavailable(
            "auth_session_temporarily_unavailable".to_owned(),
          ));
        };
        let Some(ct) = successor_ciphertext.as_deref() else {
          return Err(DomainError::Unavailable(
            "auth_session_temporarily_unavailable".to_owned(),
          ));
        };
        let Ok(recovered_raw) = encryption_key.decrypt(ct, &token_id, &auth_session_id) else {
          return Err(DomainError::Unavailable(
            "auth_session_temporarily_unavailable".to_owned(),
          ));
        };
        let Some((recovered_id, recovered_hash)) = parse_refresh_token(&recovered_raw) else {
          return Err(DomainError::Unavailable(
            "auth_session_temporarily_unavailable".to_owned(),
          ));
        };
        let rep_id: String = rep_row.get("id");
        let rep_hash: String = rep_row.get("secret_hash");
        let rep_expires_at: DateTime<Utc> = rep_row.get("expires_at");
        if recovered_id != rep_id || !constant_time_equal(&recovered_hash, &rep_hash) {
          return Err(DomainError::Unavailable(
            "auth_session_temporarily_unavailable".to_owned(),
          ));
        }
        if disposition == UsedDisposition::Grace {
          sqlx::query("UPDATE auth_refresh_tokens SET grace_used_at = $2 WHERE id = $1 AND grace_used_at IS NULL")
            .bind(&token_id)
            .bind(now)
            .execute(&mut **tx.tx_mut())
            .await
            .map_err(|e| DomainError::Internal(format!("claim auth refresh grace: {e}")))?;
        }
        tx.commit()
          .await
          .map_err(|e| DomainError::Internal(format!("commit auth refresh recovery: {e}")))?;

        let ttl = token_policy.access_token_ttl_secs;
        let jwt = access_token::sign_access_token(
          &user_id,
          &auth_session_id,
          &active_key.id,
          &signing_secret,
          now.timestamp(),
          (now + Duration::seconds(ttl)).timestamp(),
        )?;

        Ok(AuthTokenPair {
          user_id,
          token_type: "Bearer",
          access_token: jwt,
          expires_in: ttl,
          refresh_token: recovered_raw,
          refresh_expires_at: rep_expires_at,
          session: AuthTokenPairSession {
            id: auth_session_id,
            absolute_expires_at,
          },
          is_new_device: None,
        })
      }
      UsedDisposition::Unavailable => Err(DomainError::Unavailable(
        "auth_session_temporarily_unavailable".to_owned(),
      )),
      UsedDisposition::Replay => {
        revoke_auth_session_locked(tx.tx_mut(), &auth_session_id, "refresh_token_reused", now).await?;
        tx.commit()
          .await
          .map_err(|e| DomainError::Internal(format!("commit reuse revocation: {e}")))?;
        Err(DomainError::Unauthorized("refresh_token_reused".to_owned()))
      }
    }
  }

  /// Revokes an `auth_session` and all its `auth_refresh_tokens` inside one transaction.
  pub async fn revoke_auth_session(
    &self,
    auth_session_id: &str,
    expected_user_id: Option<&str>,
    reason: &str,
  ) -> Result<bool, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin revoke_auth_session: {e}")))?;

    let owner = sqlx::query(
      r#"SELECT u.user_id, a.user_session_id
         FROM auth_sessions a
         JOIN user_sessions u ON u.id = a.user_session_id
         WHERE a.id = $1"#,
    )
    .bind(auth_session_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load auth_session owner: {e}")))?;
    let Some(owner) = owner else {
      return Ok(false);
    };
    let user_id: String = owner.get("user_id");
    if expected_user_id.is_some_and(|exp| exp != user_id) {
      return Ok(false);
    }
    let user_session_id: String = owner.get("user_session_id");

    sqlx::query("SELECT id FROM users WHERE id = $1 FOR UPDATE")
      .bind(&user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock user for revoke: {e}")))?;
    sqlx::query("SELECT id FROM user_sessions WHERE id = $1 FOR UPDATE")
      .bind(&user_session_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock user_session for revoke: {e}")))?;
    sqlx::query("SELECT id FROM auth_sessions WHERE id = $1 FOR UPDATE")
      .bind(auth_session_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock auth_session for revoke: {e}")))?;
    sqlx::query("SELECT id FROM auth_refresh_tokens WHERE auth_session_id = $1 FOR UPDATE")
      .bind(auth_session_id)
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock auth_refresh_tokens for revoke: {e}")))?;

    let now = decision_time(tx.tx_mut()).await?;
    let changed =
      sqlx::query("UPDATE auth_sessions SET revoked_at = $2, revoke_reason = $3 WHERE id = $1 AND revoked_at IS NULL")
        .bind(auth_session_id)
        .bind(now)
        .bind(reason)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("revoke auth_session: {e}")))?
        .rows_affected()
        == 1;
    sqlx::query("UPDATE auth_refresh_tokens SET revoked_at = $2 WHERE auth_session_id = $1 AND revoked_at IS NULL")
      .bind(auth_session_id)
      .bind(now)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("revoke auth_refresh_tokens: {e}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit revoke_auth_session: {e}")))?;
    Ok(changed)
  }

  /// Revokes the auth session owning `refresh_token` (`POST /api/auth/session/revoke`).
  pub async fn revoke_auth_session_by_refresh_token(
    &self,
    refresh_token: &str,
    reason: &str,
  ) -> Result<bool, DomainError> {
    let Some((token_id, secret_hash)) = parse_refresh_token(refresh_token) else {
      return Ok(false);
    };
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire revoke_by_refresh: {e}")))?;
    let row = sqlx::query("SELECT auth_session_id, secret_hash FROM auth_refresh_tokens WHERE id = $1")
      .bind(&token_id)
      .fetch_optional(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("load refresh token for revoke: {e}")))?;
    drop(conn);
    let Some(row) = row else {
      return Ok(false);
    };
    let stored_hash: String = row.get("secret_hash");
    if !constant_time_equal(&stored_hash, &secret_hash) {
      return Ok(false);
    }
    let auth_session_id: String = row.get("auth_session_id");
    self.revoke_auth_session(&auth_session_id, None, reason).await
  }

  /// Lists active native `auth_sessions` for `user_id` (`GET /api/auth/sessions`).
  pub async fn list_auth_sessions(&self, user_id: &str) -> Result<Vec<AuthSessionSummary>, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire list_auth_sessions: {e}")))?;
    let rows = sqlx::query(
      r#"SELECT a.id, a.installation_id, a.platform, a.device_name, a.app_version,
                a.created_at, a.last_seen_at, a.idle_expires_at, a.absolute_expires_at,
                a.revoke_reason
         FROM auth_sessions a
         JOIN user_sessions u ON u.id = a.user_session_id
         WHERE u.user_id = $1
           AND (u.expires_at IS NULL OR u.expires_at > clock_timestamp())
           AND a.revoked_at IS NULL
           AND a.idle_expires_at > clock_timestamp()
           AND a.absolute_expires_at > clock_timestamp()
         ORDER BY a.last_seen_at DESC"#,
    )
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("list auth_sessions: {e}")))?;

    Ok(
      rows
        .into_iter()
        .map(|row| AuthSessionSummary {
          id: row.get("id"),
          installation_id: row.get("installation_id"),
          platform: row.get("platform"),
          device_name: row.get("device_name"),
          app_version: row.get("app_version"),
          created_at: row.get("created_at"),
          last_seen_at: row.get("last_seen_at"),
          idle_expires_at: row.get("idle_expires_at"),
          absolute_expires_at: row.get("absolute_expires_at"),
          revoke_reason: row.get("revoke_reason"),
        })
        .collect(),
    )
  }

  /// Revokes all cookie and native auth sessions for `user_id` (`POST /api/auth/sessions/revoke-all`).
  ///
  /// Acquires row locks strictly in `users -> user_sessions -> auth_sessions -> auth_refresh_tokens`
  /// (`ORDER BY id`) order to remain deadlock-free with `refresh_auth_session` and `revoke_auth_session`.
  pub async fn revoke_all_user_sessions(&self, user_id: &str, reason: &str) -> Result<(), DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin revoke_all_user_sessions: {e}")))?;

    sqlx::query("SELECT id FROM users WHERE id = $1 FOR UPDATE")
      .bind(user_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock user for revoke_all: {e}")))?;

    sqlx::query("SELECT id FROM user_sessions WHERE user_id = $1 ORDER BY id FOR UPDATE")
      .bind(user_id)
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("lock user_sessions for revoke_all: {e}")))?;

    sqlx::query(
      r#"SELECT a.id
         FROM auth_sessions a
         JOIN user_sessions u ON u.id = a.user_session_id
         WHERE u.user_id = $1
         ORDER BY a.id
         FOR UPDATE OF a"#,
    )
    .bind(user_id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lock auth_sessions for revoke_all: {e}")))?;

    sqlx::query(
      r#"SELECT r.id
         FROM auth_refresh_tokens r
         JOIN auth_sessions a ON a.id = r.auth_session_id
         JOIN user_sessions u ON u.id = a.user_session_id
         WHERE u.user_id = $1
         ORDER BY r.id
         FOR UPDATE OF r"#,
    )
    .bind(user_id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("lock auth_refresh_tokens for revoke_all: {e}")))?;

    let now = decision_time(tx.tx_mut()).await?;

    sqlx::query("UPDATE users SET auth_epoch = auth_epoch + 1 WHERE id = $1")
      .bind(user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("bump auth_epoch: {e}")))?;

    sqlx::query(
      r#"UPDATE auth_refresh_tokens r
         SET revoked_at = $2, successor_ciphertext = NULL, successor_expires_at = NULL
         FROM auth_sessions a
         JOIN user_sessions u ON u.id = a.user_session_id
         WHERE r.auth_session_id = a.id AND u.user_id = $1 AND r.revoked_at IS NULL"#,
    )
    .bind(user_id)
    .bind(now)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("revoke all refresh tokens: {e}")))?;

    sqlx::query(
      r#"UPDATE auth_sessions a
         SET revoked_at = $2, revoke_reason = $3
         FROM user_sessions u
         WHERE a.user_session_id = u.id AND u.user_id = $1 AND a.revoked_at IS NULL"#,
    )
    .bind(user_id)
    .bind(now)
    .bind(reason)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("revoke all auth sessions: {e}")))?;

    sqlx::query("DELETE FROM user_sessions WHERE user_id = $1")
      .bind(user_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("delete all user_sessions: {e}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit revoke_all_user_sessions: {e}")))?;
    Ok(())
  }

  /// Evaluates available login methods for `email` (`POST /api/auth/preflight`),
  /// matching `v0.27.5` `auth_session/methods.rs:login_preflight`.
  pub async fn login_preflight(&self, email: &str) -> Result<LoginPreflight, DomainError> {
    let email = canonical_email(email)?;
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire login_preflight: {e}")))?;

    let rows = sqlx::query(
      "SELECT registered, disabled, (password IS NOT NULL) AS has_password
       FROM users
       WHERE lower(email) = lower($1)
       ORDER BY id",
    )
    .bind(&email)
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("load login preflight user: {e}")))?;
    drop(conn);

    let (allow_signup, allow_signup_for_oauth) =
      oauth::load_signup_flags(&self.db, self.config.allow_signup, self.config.allow_signup_for_oauth).await?;
    let oauth_providers = self.available_oauth_providers().await?;

    let (registered, password_available, magic_link_available, oauth_available) = match rows.as_slice() {
      [] => {
        let domain_ok = if self.config.require_email_domain_verification {
          match self.domain_verifier.verify_email_domain(&email).await {
            EmailDomainVerification::Allowed => true,
            EmailDomainVerification::Missing => false,
            EmailDomainVerification::Unavailable => {
              return Err(DomainError::Unavailable(
                "email_domain_verification_unavailable".to_owned(),
              ));
            }
          }
        } else {
          true
        };
        let can_signup = allow_signup && domain_ok;
        (
          false,
          false,
          can_signup,
          !oauth_providers.is_empty() && allow_signup_for_oauth,
        )
      }
      [row] => {
        let reg: bool = row.get("registered");
        let disabled: bool = row.get("disabled");
        let has_password: bool = row.get("has_password");
        if disabled {
          (false, false, false, false)
        } else {
          (reg, has_password, true, !oauth_providers.is_empty())
        }
      }
      _ => (false, false, false, false),
    };

    Ok(LoginPreflight {
      registered,
      methods: LoginMethods {
        password: MethodAvailability {
          available: password_available,
        },
        magic_link: MethodAvailability {
          available: magic_link_available,
        },
        oauth: OAuthAvailability {
          available: oauth_available,
          providers: oauth_providers,
        },
        passkey: PasskeyAvailability {
          available: false,
          discoverable: false,
        },
      },
    })
  }

  /// Returns bound authentication methods for `user_id` (`GET /api/auth/methods`).
  pub async fn bound_methods(&self, user_id: &str) -> Result<BoundMethods, DomainError> {
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire bound_methods: {e}")))?;
    let has_password: bool =
      sqlx::query_scalar("SELECT (password IS NOT NULL) FROM users WHERE id = $1 AND disabled = false")
        .bind(user_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| DomainError::Internal(format!("load bound password: {e}")))?
        .unwrap_or(false);
    let providers: Vec<String> =
      sqlx::query_scalar("SELECT DISTINCT provider FROM user_connected_accounts WHERE user_id = $1 ORDER BY provider")
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| DomainError::Internal(format!("load bound oauth providers: {e}")))?;

    Ok(BoundMethods {
      password: BoundMethod { bound: has_password },
      oauth: BoundOAuth {
        bound: !providers.is_empty(),
        providers,
      },
      passkey: BoundPasskey { bound: false, count: 0 },
    })
  }

  /// Cleans up expired `user_sessions` and expired/revoked `auth_sessions` /
  /// `auth_refresh_tokens` in bounded batches, matching `v0.27.5`
  /// `core/auth/job.ts` and `auth_session/session.rs`.
  pub async fn cleanup_expired_sessions(
    &self,
    batch_size: i64,
    max_batches: usize,
    refresh_retention_secs: i64,
  ) -> Result<SessionCleanupSummary, DomainError> {
    self
      .cleanup_expired_sessions_cancellable(batch_size, max_batches, refresh_retention_secs, || false)
      .await
  }

  /// Like [`Self::cleanup_expired_sessions`], stopping before the next batch
  /// whenever `should_stop()` returns `true` (e.g. on distributed lock lease loss).
  pub async fn cleanup_expired_sessions_cancellable<F>(
    &self,
    batch_size: i64,
    max_batches: usize,
    refresh_retention_secs: i64,
    should_stop: F,
  ) -> Result<SessionCleanupSummary, DomainError>
  where
    F: Fn() -> bool,
  {
    if batch_size <= 0 {
      return Err(DomainError::Validation("batch_size must be positive".to_owned()));
    }
    let mut summary = SessionCleanupSummary::default();

    for _ in 0..max_batches {
      if should_stop() {
        return Ok(summary);
      }
      let mut conn = self
        .db
        .acquire_tiered(WorkloadTier::LongQuery)
        .await
        .map_err(|e| DomainError::Internal(format!("acquire session cleanup conn: {e}")))?;
      let deleted = sqlx::query(
        r#"DELETE FROM user_sessions
           WHERE id IN (
             SELECT id FROM user_sessions
             WHERE expires_at <= clock_timestamp()
             ORDER BY expires_at ASC
             LIMIT $1
           )"#,
      )
      .bind(batch_size)
      .execute(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("cleanup expired user_sessions: {e}")))?
      .rows_affected();
      summary.deleted_user_sessions += deleted;
      if (deleted as i64) < batch_size {
        break;
      }
    }

    let retention = refresh_retention_secs.clamp(MIN_REFRESH_RETENTION_SECS, MAX_REFRESH_RETENTION_SECS) as f64;
    for _ in 0..max_batches {
      if should_stop() {
        return Ok(summary);
      }
      let mut conn = self
        .db
        .acquire_tiered(WorkloadTier::LongQuery)
        .await
        .map_err(|e| DomainError::Internal(format!("acquire auth session cleanup conn: {e}")))?;
      let cleared = sqlx::query(
        r#"UPDATE auth_refresh_tokens
           SET successor_ciphertext = NULL, successor_expires_at = NULL
           WHERE id IN (
             SELECT id FROM auth_refresh_tokens
             WHERE successor_expires_at <= clock_timestamp()
             LIMIT $1
           )"#,
      )
      .bind(batch_size)
      .execute(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("cleanup auth refresh successor: {e}")))?
      .rows_affected();

      let deleted_tokens = sqlx::query(
        r#"DELETE FROM auth_refresh_tokens
           WHERE id IN (
             SELECT r.id FROM auth_refresh_tokens r
             JOIN auth_sessions a ON a.id = r.auth_session_id
             WHERE r.expires_at < clock_timestamp() - ($2 * INTERVAL '1 second')
                OR a.revoked_at < clock_timestamp() - ($2 * INTERVAL '1 second')
             ORDER BY r.expires_at
             LIMIT $1
           )"#,
      )
      .bind(batch_size)
      .bind(retention)
      .execute(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("cleanup auth_refresh_tokens: {e}")))?
      .rows_affected();

      let deleted_auth = sqlx::query(
        r#"DELETE FROM auth_sessions
           WHERE id IN (
             SELECT id FROM auth_sessions
             WHERE absolute_expires_at < clock_timestamp() - ($2 * INTERVAL '1 second')
                OR revoked_at < clock_timestamp() - ($2 * INTERVAL '1 second')
             ORDER BY absolute_expires_at
             LIMIT $1
           )"#,
      )
      .bind(batch_size)
      .bind(retention)
      .execute(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("cleanup auth_sessions: {e}")))?
      .rows_affected();

      let batch_total = cleared + deleted_tokens + deleted_auth;
      summary.deleted_auth_records += batch_total;
      if (batch_total as i64) < batch_size {
        break;
      }
    }

    Ok(summary)
  }
}

#[derive(Debug)]
pub enum BearerResolutionError {
  Token(access_token::AccessTokenErrorCode),
  Domain(DomainError),
}

fn parse_auth_token_policy(rows: Vec<sqlx::postgres::PgRow>) -> AuthTokenPolicy {
  let mut policy = AuthTokenPolicy::default();
  let apply_token_obj = |policy: &mut AuthTokenPolicy, obj: &serde_json::Map<String, Value>| {
    if let Some(v) = obj.get("accessTokenTtl") {
      policy.access_token_ttl_secs = parse_duration_secs_clamped(
        Some(v),
        policy.access_token_ttl_secs,
        MIN_ACCESS_TOKEN_TTL_SECS,
        MAX_ACCESS_TOKEN_TTL_SECS,
      );
    }
    if let Some(v) = obj.get("refreshIdleTtl") {
      policy.refresh_idle_ttl_secs = parse_duration_secs_clamped(
        Some(v),
        policy.refresh_idle_ttl_secs,
        MIN_REFRESH_IDLE_TTL_SECS,
        MAX_REFRESH_IDLE_TTL_SECS,
      );
    }
    if let Some(v) = obj.get("refreshAbsoluteTtl") {
      policy.refresh_absolute_ttl_secs = parse_duration_secs_clamped(
        Some(v),
        policy.refresh_absolute_ttl_secs,
        MIN_REFRESH_ABSOLUTE_TTL_SECS,
        MAX_REFRESH_ABSOLUTE_TTL_SECS,
      );
    }
    if let Some(v) = obj.get("refreshGracePeriod") {
      policy.refresh_grace_secs = parse_duration_secs_clamped(
        Some(v),
        policy.refresh_grace_secs,
        MIN_REFRESH_GRACE_SECS,
        MAX_REFRESH_GRACE_SECS,
      );
    }
  };

  for row in rows {
    let id: String = row.get("id");
    let value: Value = row.get("value");
    match id.as_str() {
      "auth" => {
        if let Some(obj) = value.pointer("/token").and_then(Value::as_object) {
          apply_token_obj(&mut policy, obj);
        }
      }
      "auth.token" => {
        if let Some(obj) = value.as_object() {
          apply_token_obj(&mut policy, obj);
        }
      }
      "auth.token.accessTokenTtl" => {
        policy.access_token_ttl_secs = parse_duration_secs_clamped(
          Some(&value),
          policy.access_token_ttl_secs,
          MIN_ACCESS_TOKEN_TTL_SECS,
          MAX_ACCESS_TOKEN_TTL_SECS,
        );
      }
      "auth.token.refreshIdleTtl" => {
        policy.refresh_idle_ttl_secs = parse_duration_secs_clamped(
          Some(&value),
          policy.refresh_idle_ttl_secs,
          MIN_REFRESH_IDLE_TTL_SECS,
          MAX_REFRESH_IDLE_TTL_SECS,
        );
      }
      "auth.token.refreshAbsoluteTtl" => {
        policy.refresh_absolute_ttl_secs = parse_duration_secs_clamped(
          Some(&value),
          policy.refresh_absolute_ttl_secs,
          MIN_REFRESH_ABSOLUTE_TTL_SECS,
          MAX_REFRESH_ABSOLUTE_TTL_SECS,
        );
      }
      "auth.token.refreshGracePeriod" => {
        policy.refresh_grace_secs = parse_duration_secs_clamped(
          Some(&value),
          policy.refresh_grace_secs,
          MIN_REFRESH_GRACE_SECS,
          MAX_REFRESH_GRACE_SECS,
        );
      }
      _ => {}
    }
  }
  policy
}

async fn load_auth_token_policy_in_tx(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
) -> Result<AuthTokenPolicy, DomainError> {
  let rows = sqlx::query(
    "SELECT id, value FROM app_configs
     WHERE id = 'auth' OR id = 'auth.token' OR id LIKE 'auth.token.%'
     ORDER BY id ASC",
  )
  .fetch_all(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load auth token policy: {e}")))?;
  Ok(parse_auth_token_policy(rows))
}

fn serialize_rfc3339_millis<S: serde::Serializer>(dt: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error> {
  serializer.serialize_str(&dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthTokenPairSession {
  pub id: String,
  #[serde(serialize_with = "serialize_rfc3339_millis")]
  pub absolute_expires_at: DateTime<Utc>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthTokenPair {
  #[serde(skip_serializing)]
  pub user_id: String,
  pub token_type: &'static str,
  pub access_token: String,
  pub expires_in: i64,
  pub refresh_token: String,
  #[serde(serialize_with = "serialize_rfc3339_millis")]
  pub refresh_expires_at: DateTime<Utc>,
  pub session: AuthTokenPairSession,
  #[serde(skip_serializing)]
  pub is_new_device: Option<bool>,
}

pub(crate) struct DynamicAuthRuntime {
  pub(crate) allow_signup: bool,
  pub(crate) allow_signup_for_oauth: bool,
  pub(crate) require_email_domain_verification: bool,
  pub(crate) password_min_length: usize,
  pub(crate) password_max_length: usize,
  pub(crate) session_ttl_seconds: i64,
  pub(crate) session_ttr_seconds: i64,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionSummary {
  pub id: String,
  pub installation_id: String,
  pub platform: String,
  pub device_name: Option<String>,
  pub app_version: Option<String>,
  #[serde(serialize_with = "serialize_rfc3339_millis")]
  pub created_at: DateTime<Utc>,
  #[serde(serialize_with = "serialize_rfc3339_millis")]
  pub last_seen_at: DateTime<Utc>,
  #[serde(serialize_with = "serialize_rfc3339_millis")]
  pub idle_expires_at: DateTime<Utc>,
  #[serde(serialize_with = "serialize_rfc3339_millis")]
  pub absolute_expires_at: DateTime<Utc>,
  pub revoke_reason: Option<String>,
}

/// Generates a `v0.27.5`-compatible 3-segment refresh token
/// (`aff_rt_v1.<18B base64url id>.<32B base64url secret>`) and returns
/// `(id, raw_token, sha256_hex_of_raw_secret_bytes)`.
pub fn generate_refresh_token() -> (String, String, String) {
  use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
  use rand::RngCore as _;
  let mut id_bytes = [0u8; REFRESH_TOKEN_ID_BYTES];
  let mut secret_bytes = [0u8; REFRESH_TOKEN_SECRET_BYTES];
  rand::rng().fill_bytes(&mut id_bytes);
  rand::rng().fill_bytes(&mut secret_bytes);
  let id = URL_SAFE_NO_PAD.encode(id_bytes);
  let secret = URL_SAFE_NO_PAD.encode(secret_bytes);
  let raw = format!("{REFRESH_TOKEN_PREFIX}.{id}.{secret}");
  let secret_hash = hex::encode(Sha256::digest(secret_bytes));
  (id, raw, secret_hash)
}

/// Parses a `v0.27.5`-compatible 3-segment `aff_rt_v1.<id>.<secret>` token and
/// returns `(id, sha256_hex_of_raw_32_byte_secret)`.
pub fn parse_refresh_token(raw: &str) -> Option<(String, String)> {
  use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
  let mut parts = raw.split('.');
  if parts.next()? != REFRESH_TOKEN_PREFIX {
    return None;
  }
  let id = parts.next()?;
  let secret = parts.next()?;
  if parts.next().is_some() {
    return None;
  }
  let id_bytes = URL_SAFE_NO_PAD.decode(id).ok()?;
  let secret_bytes = URL_SAFE_NO_PAD.decode(secret).ok()?;
  if id_bytes.len() != REFRESH_TOKEN_ID_BYTES || secret_bytes.len() != REFRESH_TOKEN_SECRET_BYTES {
    return None;
  }
  Some((id.to_owned(), hex::encode(Sha256::digest(secret_bytes))))
}

/// HKDF-SHA256 + AES-256-GCM envelope for refresh-token successor recovery,
/// wire-identical to `v0.27.5` `auth_session/successor.rs`.
struct SuccessorKey([u8; 32]);

impl Drop for SuccessorKey {
  fn drop(&mut self) {
    use zeroize::Zeroize as _;
    self.0.zeroize();
  }
}

impl SuccessorKey {
  const PREFIX: &'static str = "auth-successor:v1:";
  const INFO: &'static [u8] = b"AFFiNE/Auth/RefreshSuccessor/v1";
  const AAD_PREFIX: &'static str = "auth-refresh-successor";
  const NONCE_LEN: usize = 12;

  fn derive(private_key: &[u8]) -> Result<Self, DomainError> {
    if private_key.is_empty() {
      return Err(DomainError::Internal("auth private_key must not be empty".to_owned()));
    }
    let hk = hkdf::Hkdf::<Sha256>::new(None, private_key);
    let mut key = [0u8; 32];
    hk.expand(Self::INFO, &mut key)
      .map_err(|_| DomainError::Internal("derive refresh successor key".to_owned()))?;
    Ok(Self(key))
  }

  fn aad(source_id: &str, auth_session_id: &str) -> String {
    format!("{}\0{source_id}\0{auth_session_id}", Self::AAD_PREFIX)
  }

  fn encrypt(&self, plaintext: &str, source_id: &str, auth_session_id: &str) -> Result<String, DomainError> {
    use aes_gcm::{
      Aes256Gcm, KeyInit as _, Nonce,
      aead::{Aead as _, Payload},
    };
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
    use rand::RngCore as _;

    let cipher = Aes256Gcm::new_from_slice(&self.0)
      .map_err(|_| DomainError::Internal("init refresh successor cipher".to_owned()))?;
    let mut nonce_bytes = [0u8; Self::NONCE_LEN];
    rand::rng().fill_bytes(&mut nonce_bytes);
    let aad = Self::aad(source_id, auth_session_id);
    let ciphertext = cipher
      .encrypt(
        &Nonce::from(nonce_bytes),
        Payload {
          msg: plaintext.as_bytes(),
          aad: aad.as_bytes(),
        },
      )
      .map_err(|_| DomainError::Internal("encrypt refresh successor".to_owned()))?;
    let mut envelope = Vec::with_capacity(Self::NONCE_LEN + ciphertext.len());
    envelope.extend_from_slice(&nonce_bytes);
    envelope.extend_from_slice(&ciphertext);
    Ok(format!("{}{}", Self::PREFIX, URL_SAFE_NO_PAD.encode(envelope)))
  }

  fn decrypt(&self, encoded: &str, source_id: &str, auth_session_id: &str) -> Result<String, DomainError> {
    use aes_gcm::{
      Aes256Gcm, KeyInit as _, Nonce,
      aead::{Aead as _, Payload},
    };
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};

    let payload = encoded
      .strip_prefix(Self::PREFIX)
      .ok_or_else(|| DomainError::Internal("invalid refresh successor prefix".to_owned()))?;
    let envelope = URL_SAFE_NO_PAD
      .decode(payload)
      .map_err(|_| DomainError::Internal("invalid refresh successor encoding".to_owned()))?;
    if envelope.len() <= Self::NONCE_LEN {
      return Err(DomainError::Internal("truncated refresh successor envelope".to_owned()));
    }
    let (nonce_slice, ciphertext) = envelope.split_at(Self::NONCE_LEN);
    let nonce_bytes: [u8; Self::NONCE_LEN] = nonce_slice
      .try_into()
      .map_err(|_| DomainError::Internal("invalid refresh successor nonce".to_owned()))?;
    let cipher = Aes256Gcm::new_from_slice(&self.0)
      .map_err(|_| DomainError::Internal("init refresh successor cipher".to_owned()))?;
    let aad = Self::aad(source_id, auth_session_id);
    let plaintext = cipher
      .decrypt(
        &Nonce::from(nonce_bytes),
        Payload {
          msg: ciphertext,
          aad: aad.as_bytes(),
        },
      )
      .map_err(|_| DomainError::Internal("decrypt refresh successor failed".to_owned()))?;
    String::from_utf8(plaintext).map_err(|_| DomainError::Internal("invalid utf-8 refresh successor".to_owned()))
  }
}

async fn revoke_auth_session_locked(
  tx: &mut Transaction<'_, Postgres>,
  auth_session_id: &str,
  reason: &str,
  now: DateTime<Utc>,
) -> Result<(), DomainError> {
  sqlx::query("UPDATE auth_sessions SET revoked_at = $2, revoke_reason = $3 WHERE id = $1 AND revoked_at IS NULL")
    .bind(auth_session_id)
    .bind(now)
    .bind(reason)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("revoke locked auth_session: {e}")))?;
  sqlx::query(
    r#"UPDATE auth_refresh_tokens
       SET revoked_at = $2, successor_ciphertext = NULL, successor_expires_at = NULL
       WHERE auth_session_id = $1 AND revoked_at IS NULL"#,
  )
  .bind(auth_session_id)
  .bind(now)
  .execute(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("revoke locked auth_refresh_tokens: {e}")))?;
  Ok(())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AuthTokenPolicy {
  pub access_token_ttl_secs: i64,
  pub refresh_idle_ttl_secs: i64,
  pub refresh_absolute_ttl_secs: i64,
  pub refresh_grace_secs: i64,
}

impl Default for AuthTokenPolicy {
  fn default() -> Self {
    Self {
      access_token_ttl_secs: DEFAULT_ACCESS_TOKEN_TTL_SECS,
      refresh_idle_ttl_secs: DEFAULT_REFRESH_IDLE_TTL_SECS,
      refresh_absolute_ttl_secs: DEFAULT_REFRESH_ABSOLUTE_TTL_SECS,
      refresh_grace_secs: DEFAULT_REFRESH_GRACE_SECS,
    }
  }
}

/// Parses a duration in seconds (number or string like `"30d"`, `"15m"`, `"30s"`)
/// and clamps it to `min..=max`.
pub fn parse_duration_secs_clamped(value: Option<&Value>, fallback: i64, min: i64, max: i64) -> i64 {
  let clamped_fallback = fallback.clamp(min, max);
  let Some(val) = value else {
    return clamped_fallback;
  };
  let parsed = match val {
    Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)),
    Value::String(s) => {
      let trimmed = s.trim();
      if trimmed.is_empty() {
        None
      } else if let Ok(secs) = trimmed.parse::<i64>() {
        Some(secs)
      } else {
        let lower = trimmed.to_ascii_lowercase();
        let (num_str, mult) = if let Some(n) = lower.strip_suffix('d') {
          (n, 86_400_i64)
        } else if let Some(n) = lower.strip_suffix('h') {
          (n, 3_600_i64)
        } else if let Some(n) = lower.strip_suffix('m') {
          (n, 60_i64)
        } else if let Some(n) = lower.strip_suffix('s') {
          (n, 1_i64)
        } else {
          ("", 0)
        };
        if mult > 0 {
          num_str.trim().parse::<i64>().ok().and_then(|n| n.checked_mul(mult))
        } else {
          None
        }
      }
    }
    _ => None,
  };
  parsed.unwrap_or(clamped_fallback).clamp(min, max)
}

/// Parses `auth.token.refreshRetention` from `app_configs` (seconds number or
/// duration string like `"30d"`, `"720h"`, `"60m"`, `"3600s"`), clamped to
/// [`MIN_REFRESH_RETENTION_SECS`]..=[`MAX_REFRESH_RETENTION_SECS`].
pub fn parse_refresh_retention_secs(value: Option<&Value>, fallback: i64) -> i64 {
  parse_duration_secs_clamped(value, fallback, MIN_REFRESH_RETENTION_SECS, MAX_REFRESH_RETENTION_SECS)
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct SessionCleanupSummary {
  pub deleted_user_sessions: u64,
  pub deleted_auth_records: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginPreflight {
  pub registered: bool,
  pub methods: LoginMethods,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct LoginMethods {
  pub password: MethodAvailability,
  #[serde(rename = "magicLink")]
  pub magic_link: MethodAvailability,
  pub oauth: OAuthAvailability,
  pub passkey: PasskeyAvailability,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct MethodAvailability {
  pub available: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct OAuthAvailability {
  pub available: bool,
  pub providers: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct PasskeyAvailability {
  pub available: bool,
  pub discoverable: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct BoundMethods {
  pub password: BoundMethod,
  pub oauth: BoundOAuth,
  pub passkey: BoundPasskey,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct BoundMethod {
  pub bound: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct BoundOAuth {
  pub bound: bool,
  pub providers: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct BoundPasskey {
  pub bound: bool,
  pub count: u32,
}

pub fn canonical_email(email: &str) -> Result<String, DomainError> {
  let trimmed = email.trim();
  let valid = trimmed.len() <= 320
    && trimmed.split_once('@').is_some_and(|(local, domain)| {
      if local.is_empty()
        || local.len() > 64
        || local.contains(char::is_whitespace)
        || domain.is_empty()
        || domain.len() > 255
        || domain.contains('@')
        || domain.contains(char::is_whitespace)
      {
        return false;
      }
      let labels: Vec<&str> = domain.split('.').collect();
      if labels.len() < 2 {
        return false;
      }
      let tld = labels.last().copied().unwrap_or("");
      if tld.len() < 2 || !tld.chars().all(|c| c.is_ascii_alphabetic()) {
        return false;
      }
      labels.iter().all(|label| {
        !label.is_empty()
          && label.len() <= 63
          && !label.starts_with('-')
          && !label.ends_with('-')
          && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
      })
    });
  if !valid {
    return Err(DomainError::Validation("invalid email".to_owned()));
  }
  Ok(trimmed.to_owned())
}

async fn lock_email(tx: &mut Transaction<'_, Postgres>, email: &str) -> Result<(), DomainError> {
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('auth:email:' || lower($1), 0))")
    .bind(email)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock auth email: {e}")))?;
  Ok(())
}

async fn decision_time(tx: &mut Transaction<'_, Postgres>) -> Result<DateTime<Utc>, DomainError> {
  sqlx::query_scalar("SELECT date_trunc('milliseconds', clock_timestamp())")
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load auth decision time: {e}")))
}

async fn consume_magic_state(
  tx: &mut Transaction<'_, Postgres>,
  email: &str,
  now: DateTime<Utc>,
) -> Result<(), DomainError> {
  sqlx::query("UPDATE runtime_states SET consumed_at = $3, updated_at = $3 WHERE purpose = $1 AND token_hash = $2")
    .bind(MAGIC_LINK_PURPOSE)
    .bind(email_selector(email))
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("consume magic link state: {e}")))?;
  Ok(())
}

fn email_selector(email: &str) -> String {
  token_hash(&email.trim().to_ascii_lowercase())
}

pub fn token_hash(raw: &str) -> String {
  let digest = Sha256::digest(raw.as_bytes());
  let mut out = String::with_capacity(digest.len() * 2);
  for b in digest {
    let _ = write!(out, "{b:02x}");
  }
  out
}

/// Computes `hex(HMAC-SHA256(SHA256(private_key), lower(email)))`, matching
/// `packages/backend/native/src/runtime/backend_runtime/auth_session/mail.rs:68-91` 1:1.
pub fn hmac_sha256_hex(private_key: &str, email: &str) -> Result<String, DomainError> {
  if private_key.trim().is_empty() {
    return Err(DomainError::Internal("auth private_key must not be empty".to_owned()));
  }
  let normalized = email.trim().to_ascii_lowercase();
  let hash_key = Sha256::digest(private_key.as_bytes());
  let mut mac = Hmac::<Sha256>::new_from_slice(&hash_key)
    .map_err(|_| DomainError::Internal("invalid auth mail hash key".into()))?;
  mac.update(normalized.as_bytes());
  let bytes = mac.finalize().into_bytes();
  let mut out = String::with_capacity(bytes.len() * 2);
  for b in bytes {
    let _ = write!(out, "{b:02x}");
  }
  Ok(out)
}

fn constant_time_equal(left: &str, right: &str) -> bool {
  left.len() == right.len() && bool::from(left.as_bytes().ct_eq(right.as_bytes()))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn hmac_sha256_hex_matches_independent_vector_and_rejects_blank_key() {
    // Independent Python vector:
    // hmac.new(hashlib.sha256(b"test-private-key-v1").digest(), b"alice@example.com", hashlib.sha256).hexdigest()
    assert_eq!(
      hmac_sha256_hex("test-private-key-v1", "  Alice@Example.COM  ").unwrap(),
      "22eecd069d10c8a52b5f07b62d07f995589671dc16d3ecd522abd6069f918363"
    );
    assert!(matches!(
      hmac_sha256_hex("", "Alice@Example.COM"),
      Err(DomainError::Internal(_))
    ));
    assert!(matches!(
      hmac_sha256_hex("   ", "Alice@Example.COM"),
      Err(DomainError::Internal(_))
    ));
  }

  #[test]
  fn canonical_email_trims_and_preserves_original_case() {
    assert_eq!(canonical_email("  Alice@Example.COM  ").unwrap(), "Alice@Example.COM");
    assert!(matches!(
      canonical_email("not-an-email"),
      Err(DomainError::Validation(_))
    ));
  }

  #[test]
  fn refresh_token_matches_v0275_golden_vector_and_rejects_malformed() {
    // Golden vector from packages/backend/native/src/auth_session.rs:240-260
    let golden = "aff_rt_v1.AAECAwQFBgcICQoLDA0ODxAR.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
    let (id, hash) = parse_refresh_token(golden).expect("parse v0.27.5 golden token");
    assert_eq!(id, "AAECAwQFBgcICQoLDA0ODxAR");
    let raw_secret: Vec<u8> = (0u8..32).collect();
    assert_eq!(hash, hex::encode(Sha256::digest(&raw_secret)));

    // Generated tokens round-trip cleanly through parser.
    let (gen_id, gen_raw, gen_hash) = generate_refresh_token();
    assert!(gen_raw.starts_with("aff_rt_v1."));
    let (parsed_id, parsed_hash) = parse_refresh_token(&gen_raw).expect("parse generated token");
    assert_eq!(parsed_id, gen_id);
    assert_eq!(parsed_hash, gen_hash);

    // Reject legacy 2-segment or wrong-prefix/length tokens.
    assert!(parse_refresh_token("rt_abc.def").is_none());
    assert!(
      parse_refresh_token("aff_rt_v2.AAECAwQFBgcICQoLDA0ODxAR.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8").is_none()
    );
    assert!(parse_refresh_token("aff_rt_v1.short.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8").is_none());
  }

  #[test]
  fn successor_key_roundtrips_and_rejects_aad_tamper() {
    let key = SuccessorKey::derive(b"test-private-key-material").expect("derive key");
    let (_, raw_token, _) = generate_refresh_token();
    let ct = key.encrypt(&raw_token, "src-id", "sess-id").expect("encrypt");
    assert!(ct.starts_with("auth-successor:v1:"));
    assert_eq!(key.decrypt(&ct, "src-id", "sess-id").expect("decrypt"), raw_token);
    assert!(key.decrypt(&ct, "other-src", "sess-id").is_err());
    assert!(key.decrypt(&ct, "src-id", "other-sess").is_err());
  }

  #[test]
  fn parse_refresh_retention_secs_parses_units_and_clamps() {
    assert_eq!(
      parse_refresh_retention_secs(Some(&serde_json::json!("30d")), DEFAULT_REFRESH_RETENTION_SECS),
      30 * 86_400
    );
    assert_eq!(
      parse_refresh_retention_secs(Some(&serde_json::json!("12h")), DEFAULT_REFRESH_RETENTION_SECS),
      12 * 3_600
    );
    assert_eq!(
      parse_refresh_retention_secs(Some(&serde_json::json!(10)), DEFAULT_REFRESH_RETENTION_SECS),
      MIN_REFRESH_RETENTION_SECS
    );
    assert_eq!(
      parse_refresh_retention_secs(Some(&serde_json::json!("999d")), DEFAULT_REFRESH_RETENTION_SECS),
      MAX_REFRESH_RETENTION_SECS
    );
    assert_eq!(parse_refresh_retention_secs(None, 7200), 7200);
  }

  #[test]
  fn decision_time_is_aligned_to_milliseconds_for_timestamptz3_parity() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("pg cluster");
    let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test db");
    let db_url = lease.url().to_owned();
    let rt = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .build()
      .expect("runtime");
    rt.block_on(async move {
      let db = ServerDb::connect(server_db::DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: server_types::ServerRole::Allinone,
        selfhosted: true,
        max_connections: 4,
        statement_timeout_ms: 5_000,
        tier_permits: [8, 4, 2, 2],
      })
      .await
      .expect("connect db");
      let mut tx = db.begin_tiered(WorkloadTier::InteractiveRead).await.expect("begin tx");
      for _ in 0..8 {
        let ts = decision_time(tx.tx_mut()).await.expect("decision_time");
        assert_eq!(
          ts.timestamp_subsec_nanos() % 1_000_000,
          0,
          "decision_time must be truncated to exact milliseconds, got {ts:?}"
        );
      }
      let _ = tx.rollback().await;
    });
    drop(lease);
  }
}
