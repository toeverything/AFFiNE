//! Canonical authentication and session domain service.

pub mod keyring;
pub mod password;

use std::{fmt, fmt::Write as _, sync::Arc, time::Duration as StdDuration};

use chrono::{DateTime, Duration, Utc};
use hickory_resolver::{TokioResolver, net::NetError};
use hmac::{Hmac, Mac as _};
use rand::Rng as _;
use serde_json::Value;
use server_db::{ServerDb, WorkloadTier};
use server_spi::SessionPolicyHook;
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
pub const MAGIC_LINK_PURPOSE: &str = "magic_link_otp";
pub const MAGIC_LINK_TTL_SECONDS: i64 = 1_800;
pub const MAGIC_LINK_MAX_ATTEMPTS: i32 = 5;

/// Request network source metadata passed to [`AuthMailQuotaPolicy`] for
/// optional rolling-window rate limiting by extensions.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct AuthRequestSource {
  pub trusted: bool,
  pub ip: Option<String>,
  pub asn: Option<u32>,
}

/// In-transaction auth-mail quota policy invoked atomically before queuing a
/// `public.mail_deliveries` row (returns `Err` to roll back both OTP state and
/// mail delivery).
#[async_trait::async_trait]
pub trait AuthMailQuotaPolicy: Send + Sync + 'static {
  async fn reserve_auth_mail(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    mail_name: &str,
    normalized_email: &str,
    recipient_user_id: Option<&str>,
    source: Option<&AuthRequestSource>,
    now: DateTime<Utc>,
  ) -> Result<(), DomainError>;
}

/// Default community auth-mail quota policy (allows all auth mails).
#[derive(Clone, Copy, Debug, Default)]
pub struct CommunityAuthMailQuotaPolicy;

#[async_trait::async_trait]
impl AuthMailQuotaPolicy for CommunityAuthMailQuotaPolicy {
  async fn reserve_auth_mail(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _mail_name: &str,
    _normalized_email: &str,
    _recipient_user_id: Option<&str>,
    _source: Option<&AuthRequestSource>,
    _now: DateTime<Utc>,
  ) -> Result<(), DomainError> {
    Ok(())
  }
}

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
  pub require_email_domain_verification: bool,
  pub private_key: String,
  pub server_name: String,
  pub password_min_length: usize,
  pub password_max_length: usize,
  pub session_ttl_seconds: i64,
  pub session_ttr_seconds: i64,
}

impl fmt::Debug for AuthConfig {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("AuthConfig")
      .field("allow_signup", &self.allow_signup)
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
      .finish()
  }
}

impl Default for AuthConfig {
  fn default() -> Self {
    Self {
      allow_signup: true,
      require_email_domain_verification: false,
      private_key: String::new(),
      server_name: "AFFiNE".to_owned(),
      password_min_length: 8,
      password_max_length: 32,
      session_ttl_seconds: DEFAULT_COOKIE_SESSION_TTL_SECONDS,
      session_ttr_seconds: DEFAULT_COOKIE_SESSION_TTR_SECONDS,
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
  mail_quota: Arc<dyn AuthMailQuotaPolicy>,
  domain_verifier: Arc<dyn EmailDomainVerifier>,
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
      mail_quota: Arc::new(CommunityAuthMailQuotaPolicy),
      domain_verifier: Arc::new(DnsEmailDomainVerifier),
      config,
    }
  }

  pub fn with_mail_quota_policy(mut self, mail_quota: Arc<dyn AuthMailQuotaPolicy>) -> Self {
    self.mail_quota = mail_quota;
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

  /// Idempotently initializes `auth.session.signingKeys` in `public.app_configs`.
  pub async fn ensure_signing_keys(&self) -> Result<Vec<keyring::StoredSigningKey>, DomainError> {
    keyring::ensure_signing_keys(&self.db).await
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

  /// Atomically creates the initial self-hosted administrator account, grants
  /// the `administrator` user feature, issues a cookie session via
  /// [`SessionRepository`], and invokes [`SessionPolicyHook::on_session_created`]
  /// inside the same transaction (rolling back everything if the hook fails).
  pub async fn create_first_admin_user(&self, input: CreateAdminUserInput) -> Result<CookieSignInResult, DomainError> {
    let email = canonical_email(&input.email)?;
    password::validate_password_requirements(
      &input.password,
      self.config.password_min_length,
      self.config.password_max_length,
    )?;
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

  /// Authenticates an existing user by email + Argon2id password and issues a
  /// cookie session, invoking [`SessionPolicyHook::on_session_created`] inside
  /// the same transaction.
  pub async fn sign_in_with_password(&self, input: PasswordSignInInput) -> Result<CookieSignInResult, DomainError> {
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
        self.config.session_ttl_seconds,
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
        self.config.session_ttl_seconds,
        self.config.session_ttr_seconds,
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
    let domain_precheck_ok = if self.config.require_email_domain_verification {
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
      if !self.config.allow_signup {
        return Err(DomainError::Forbidden("sign_up_forbidden".to_owned()));
      }
      if self.config.require_email_domain_verification && !domain_precheck_ok {
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
        .mail_quota
        .reserve_auth_mail(tx.tx_mut(), mail_name, &email_lower, None, input.source.as_ref(), now)
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

  /// Completes a Magic-Link OTP challenge from `public.runtime_states`,
  /// creating or verifying the user, issuing a cookie session, and invoking
  /// [`SessionPolicyHook::on_session_created`] atomically.
  pub async fn complete_magic_link(&self, input: CompleteMagicLinkInput) -> Result<CookieSignInResult, DomainError> {
    let email = canonical_email(&input.email)?;
    let domain_precheck_ok = if self.config.require_email_domain_verification {
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
      if !known_user && valid_signup_challenge {
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
      if !self.config.allow_signup {
        return Err(DomainError::Forbidden("sign_up_forbidden".to_owned()));
      }
      if self.config.require_email_domain_verification && !domain_precheck_ok {
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

    let issued = self
      .sessions
      .issue_cookie_session(
        tx.tx_mut(),
        &user_id,
        input.existing_session_id.as_deref(),
        input.client_version.as_deref(),
        self.config.session_ttl_seconds,
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
}

pub fn canonical_email(email: &str) -> Result<String, DomainError> {
  let trimmed = email.trim();
  let valid = trimmed.len() <= 320
    && trimmed.split_once('@').is_some_and(|(local, domain)| {
      !local.is_empty() && !domain.is_empty() && !domain.contains('@') && !local.contains(char::is_whitespace)
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
  sqlx::query_scalar("SELECT clock_timestamp()")
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

fn token_hash(raw: &str) -> String {
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
}
