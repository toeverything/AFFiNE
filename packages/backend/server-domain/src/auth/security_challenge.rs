//! Security challenge workflows for email verification, password change/set,
//! and email change with single-transaction `runtime_states` + `mail_deliveries`
//! atomicity and session revocation on credential changes.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use server_db::WorkloadTier;
use server_types::DomainError;
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use super::{
  AuthRequestSource, AuthService, canonical_email, decision_time, hmac_sha256_hex, lock_email, password, token_hash,
};

pub const SECURITY_CHALLENGE_TTL_SECONDS: i64 = 1_800;

const PURPOSE_CHANGE_PASSWORD: &str = "auth_challenge:change_password";
const PURPOSE_CHANGE_EMAIL: &str = "auth_challenge:change_email";
const PURPOSE_VERIFY_CHANGE_EMAIL: &str = "auth_challenge:verify_change_email";
const PURPOSE_VERIFY_EMAIL: &str = "auth_challenge:verify_email";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SecurityChallengeKind {
  ChangePassword,
  SetPassword,
  ChangeEmail,
  VerifyEmail,
}

impl SecurityChallengeKind {
  fn purpose(self) -> &'static str {
    match self {
      Self::ChangePassword | Self::SetPassword => PURPOSE_CHANGE_PASSWORD,
      Self::ChangeEmail => PURPOSE_CHANGE_EMAIL,
      Self::VerifyEmail => PURPOSE_VERIFY_EMAIL,
    }
  }

  fn mail_name(self) -> &'static str {
    match self {
      Self::ChangePassword => "ChangePassword",
      Self::SetPassword => "SetPassword",
      Self::ChangeEmail => "ChangeEmail",
      Self::VerifyEmail => "VerifyEmail",
    }
  }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SecurityState {
  user_id: String,
  auth_epoch: i32,
  email: Option<String>,
}

struct LockedUser {
  auth_epoch: i32,
  disabled: bool,
}

impl AuthService {
  /// Creates a one-time security challenge in `runtime_states` and enqueues the
  /// matching email row in `mail_deliveries` within the same PostgreSQL transaction.
  pub async fn prepare_security_challenge(
    &self,
    kind: SecurityChallengeKind,
    user_id: &str,
    callback_url: &str,
    source: Option<&AuthRequestSource>,
  ) -> Result<bool, DomainError> {
    let mut url = parse_callback_url(callback_url)?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin security challenge: {e}")))?;

    let user = lock_user_for_security(tx.tx_mut(), user_id).await?;
    if user.disabled {
      return Err(DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()));
    }

    let row = sqlx::query("SELECT email, (email_verified IS NOT NULL) AS verified FROM users WHERE id = $1")
      .bind(user_id)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load security challenge user: {e}")))?;
    if matches!(
      kind,
      SecurityChallengeKind::ChangePassword | SecurityChallengeKind::ChangeEmail
    ) && !row.get::<bool, _>("verified")
    {
      return Err(DomainError::Forbidden("email_verification_required".to_owned()));
    }

    let email: String = row.get("email");
    let now = decision_time(tx.tx_mut()).await?;
    let (token, expires_at) = insert_security_state(
      tx.tx_mut(),
      kind.purpose(),
      &SecurityState {
        user_id: user_id.to_owned(),
        auth_epoch: user.auth_epoch,
        email: None,
      },
      now,
    )
    .await?;

    url.query_pairs_mut().append_pair("token", &token);
    if matches!(
      kind,
      SecurityChallengeKind::ChangePassword | SecurityChallengeKind::SetPassword
    ) {
      url.query_pairs_mut().append_pair("userId", user_id);
    }

    self
      .reserve_security_mail_in_tx(
        tx.tx_mut(),
        kind.mail_name(),
        &email,
        Some(user_id),
        serde_json::json!({ "url": url.as_str() }),
        &format!("auth:{}:{}", kind.purpose(), token_hash(&token)),
        expires_at,
        source,
        now,
      )
      .await?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit security challenge: {e}")))?;
    Ok(true)
  }

  /// Consumes the `change_email` token, creates a `verify_change_email` challenge,
  /// and enqueues `VerifyChangeEmail` inside one PostgreSQL transaction.
  pub async fn prepare_verify_change_email(
    &self,
    user_id: &str,
    source_token: &str,
    new_email: &str,
    callback_url: &str,
    source: Option<&AuthRequestSource>,
  ) -> Result<bool, DomainError> {
    let email = canonical_email(new_email)?;
    let mut url = parse_callback_url(callback_url)?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin verify change email: {e}")))?;

    lock_email(tx.tx_mut(), &email).await?;
    let user = lock_user_for_security(tx.tx_mut(), user_id).await?;
    if user.disabled {
      return Err(DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()));
    }
    let now = decision_time(tx.tx_mut()).await?;
    consume_security_state(
      tx.tx_mut(),
      PURPOSE_CHANGE_EMAIL,
      source_token,
      user_id,
      user.auth_epoch,
      None,
      now,
    )
    .await?;

    let current_email: String = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
      .bind(user_id)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("load current security email: {e}")))?;
    if current_email.eq_ignore_ascii_case(&email) {
      return Err(DomainError::Validation("same_email_provided".to_owned()));
    }

    let used: Option<String> = sqlx::query_scalar("SELECT id FROM users WHERE lower(email) = lower($1) FOR UPDATE")
      .bind(&email)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("check security email uniqueness: {e}")))?;
    if used.is_some() {
      return Err(DomainError::Conflict("email_already_used".to_owned()));
    }

    let (token, expires_at) = insert_security_state(
      tx.tx_mut(),
      PURPOSE_VERIFY_CHANGE_EMAIL,
      &SecurityState {
        user_id: user_id.to_owned(),
        auth_epoch: user.auth_epoch,
        email: Some(email.clone()),
      },
      now,
    )
    .await?;

    url
      .query_pairs_mut()
      .append_pair("token", &token)
      .append_pair("email", &email);

    self
      .reserve_security_mail_in_tx(
        tx.tx_mut(),
        "VerifyChangeEmail",
        &email,
        Some(user_id),
        serde_json::json!({ "url": url.as_str() }),
        &format!("auth:verify-change-email:{}", token_hash(&token)),
        expires_at,
        source,
        now,
      )
      .await?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit verify change email: {e}")))?;
    Ok(true)
  }

  /// Atomically consumes a password reset/set challenge, hashes and stores the
  /// new Argon2id password, bumps `auth_epoch`, and revokes all existing sessions.
  pub async fn complete_password_challenge(
    &self,
    user_id: &str,
    token: &str,
    new_password: &str,
  ) -> Result<bool, DomainError> {
    if new_password.is_empty() {
      return Err(DomainError::Validation("password_required".to_owned()));
    }

    let raw_password = new_password.to_owned();
    let password_hash = tokio::task::spawn_blocking(move || password::hash_password(&raw_password))
      .await
      .map_err(|e| DomainError::Internal(format!("password hashing join: {e}")))??;

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin password challenge completion: {e}")))?;

    let user = lock_user_for_security(tx.tx_mut(), user_id).await?;
    if user.disabled {
      return Err(DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()));
    }
    let now = decision_time(tx.tx_mut()).await?;
    consume_security_state(
      tx.tx_mut(),
      PURPOSE_CHANGE_PASSWORD,
      token,
      user_id,
      user.auth_epoch,
      None,
      now,
    )
    .await?;

    apply_credential_change_and_revoke_in_tx(tx.tx_mut(), user_id, "security_action", Some(&password_hash), None, now)
      .await?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit password challenge completion: {e}")))?;
    Ok(true)
  }

  /// Atomically consumes a `verify_change_email` challenge, updates the user's
  /// email, revokes existing sessions, and enqueues `EmailChanged` notification.
  pub async fn complete_email_challenge(
    &self,
    user_id: &str,
    token: &str,
    new_email: &str,
  ) -> Result<bool, DomainError> {
    let email = canonical_email(new_email)?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin email challenge completion: {e}")))?;

    lock_email(tx.tx_mut(), &email).await?;
    let user = lock_user_for_security(tx.tx_mut(), user_id).await?;
    if user.disabled {
      return Err(DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()));
    }
    let now = decision_time(tx.tx_mut()).await?;
    consume_security_state(
      tx.tx_mut(),
      PURPOSE_VERIFY_CHANGE_EMAIL,
      token,
      user_id,
      user.auth_epoch,
      Some(&email),
      now,
    )
    .await?;

    let used: Option<String> =
      sqlx::query_scalar("SELECT id FROM users WHERE lower(email) = lower($1) AND id <> $2 FOR UPDATE")
        .bind(&email)
        .bind(user_id)
        .fetch_optional(&mut **tx.tx_mut())
        .await
        .map_err(|e| DomainError::Internal(format!("check email uniqueness: {e}")))?;
    if used.is_some() {
      return Err(DomainError::Conflict("email_already_used".to_owned()));
    }

    apply_credential_change_and_revoke_in_tx(tx.tx_mut(), user_id, "security_action", None, Some(&email), now).await?;

    self
      .reserve_security_mail_in_tx(
        tx.tx_mut(),
        "EmailChanged",
        &email,
        Some(user_id),
        serde_json::json!({ "to": email }),
        &format!("auth:email-changed:{}:{}", user_id, user.auth_epoch + 1),
        now + Duration::days(1),
        None,
        now,
      )
      .await?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit email challenge completion: {e}")))?;
    Ok(true)
  }

  /// Atomically consumes a `verify_email` challenge and marks `email_verified`.
  pub async fn complete_verify_email_challenge(&self, user_id: &str, token: &str) -> Result<bool, DomainError> {
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin verify email completion: {e}")))?;

    let user = lock_user_for_security(tx.tx_mut(), user_id).await?;
    if user.disabled {
      return Err(DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()));
    }
    let now = decision_time(tx.tx_mut()).await?;
    consume_security_state(
      tx.tx_mut(),
      PURPOSE_VERIFY_EMAIL,
      token,
      user_id,
      user.auth_epoch,
      None,
      now,
    )
    .await?;

    sqlx::query("UPDATE users SET email_verified = COALESCE(email_verified, $2) WHERE id = $1")
      .bind(user_id)
      .bind(now)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|e| DomainError::Internal(format!("verify user email: {e}")))?;

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit verify email completion: {e}")))?;
    Ok(true)
  }

  /// Admin helper to mint a one-time password-reset URL without sending email.
  pub async fn create_security_url(
    &self,
    kind: SecurityChallengeKind,
    user_id: &str,
    callback_url: &str,
  ) -> Result<String, DomainError> {
    let mut url = parse_callback_url(callback_url)?;
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("begin security URL: {e}")))?;

    let user = lock_user_for_security(tx.tx_mut(), user_id).await?;
    if user.disabled {
      return Err(DomainError::Unauthorized("wrong_sign_in_credentials".to_owned()));
    }
    let now = decision_time(tx.tx_mut()).await?;
    let (token, _) = insert_security_state(
      tx.tx_mut(),
      kind.purpose(),
      &SecurityState {
        user_id: user_id.to_owned(),
        auth_epoch: user.auth_epoch,
        email: None,
      },
      now,
    )
    .await?;

    url
      .query_pairs_mut()
      .append_pair("userId", user_id)
      .append_pair("token", &token);

    tx.commit()
      .await
      .map_err(|e| DomainError::Internal(format!("commit security URL: {e}")))?;
    Ok(url.into())
  }

  #[allow(clippy::too_many_arguments)]
  async fn reserve_security_mail_in_tx(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    mail_name: &str,
    recipient_email: &str,
    recipient_user_id: Option<&str>,
    props: serde_json::Value,
    dedupe_key: &str,
    expires_at: DateTime<Utc>,
    source: Option<&AuthRequestSource>,
    now: DateTime<Utc>,
  ) -> Result<(), DomainError> {
    let recipient_email = recipient_email.trim();
    let normalized_email = recipient_email.to_ascii_lowercase();
    let (_, domain) = normalized_email
      .split_once('@')
      .ok_or_else(|| DomainError::Validation("invalid email".to_owned()))?;

    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('auth:mail:' || $1, 0))")
      .bind(dedupe_key)
      .execute(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("lock auth mail dedupe key: {e}")))?;

    let already_queued: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM mail_deliveries WHERE dedupe_key = $1)")
      .bind(dedupe_key)
      .fetch_one(&mut **tx)
      .await
      .map_err(|e| DomainError::Internal(format!("check auth mail dedupe key: {e}")))?;
    if already_queued {
      return Ok(());
    }

    self
      .rate_limit_policy
      .check_auth_mail(tx, mail_name, &normalized_email, recipient_user_id, source, now)
      .await?;

    let recipient_hash = hmac_sha256_hex(&self.config.private_key, &normalized_email)?;
    let mail_payload = serde_json::json!({
      "name": mail_name,
      "to": recipient_email,
      "props": props,
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
    .bind(dedupe_key)
    .bind(recipient_email)
    .bind(&recipient_hash)
    .bind(domain)
    .bind(recipient_user_id)
    .bind(quota_decision)
    .bind(mail_payload)
    .bind(now)
    .bind(expires_at)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("reserve security mail delivery: {e}")))?;
    Ok(())
  }
}

async fn lock_user_for_security(tx: &mut Transaction<'_, Postgres>, user_id: &str) -> Result<LockedUser, DomainError> {
  let row = sqlx::query("SELECT auth_epoch, disabled FROM users WHERE id = $1 FOR UPDATE")
    .bind(user_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock security user: {e}")))?
    .ok_or_else(|| DomainError::NotFound("user_not_found".to_owned()))?;
  Ok(LockedUser {
    auth_epoch: row.get("auth_epoch"),
    disabled: row.get("disabled"),
  })
}

async fn insert_security_state(
  tx: &mut Transaction<'_, Postgres>,
  purpose: &str,
  payload: &SecurityState,
  now: DateTime<Utc>,
) -> Result<(String, DateTime<Utc>), DomainError> {
  let token = Uuid::new_v4().to_string();
  let expires_at = now + Duration::seconds(SECURITY_CHALLENGE_TTL_SECONDS);
  let encoded =
    serde_json::to_value(payload).map_err(|e| DomainError::Internal(format!("encode security state: {e}")))?;
  sqlx::query("INSERT INTO runtime_states (purpose, token_hash, payload, expires_at) VALUES ($1, $2, $3, $4)")
    .bind(purpose)
    .bind(token_hash(&token))
    .bind(encoded)
    .bind(expires_at)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("create security state: {e}")))?;
  Ok((token, expires_at))
}

async fn consume_security_state(
  tx: &mut Transaction<'_, Postgres>,
  purpose: &str,
  token: &str,
  user_id: &str,
  auth_epoch: i32,
  expected_email: Option<&str>,
  now: DateTime<Utc>,
) -> Result<(), DomainError> {
  let hashed = token_hash(token);
  let row = sqlx::query(
    "SELECT payload, consumed_at, expires_at FROM runtime_states WHERE purpose = $1 AND token_hash = $2 FOR UPDATE",
  )
  .bind(purpose)
  .bind(&hashed)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load security state: {e}")))?;

  let valid = row.is_some_and(|row| {
    let consumed_at: Option<DateTime<Utc>> = row.get("consumed_at");
    let expires_at: DateTime<Utc> = row.get("expires_at");
    consumed_at.is_none()
      && expires_at > now
      && serde_json::from_value::<SecurityState>(row.get("payload"))
        .ok()
        .is_some_and(|state| {
          state.user_id == user_id
            && state.auth_epoch == auth_epoch
            && expected_email.is_none_or(|email| state.email.as_deref() == Some(email))
        })
  });
  if !valid {
    return Err(DomainError::Validation("invalid_email_token".to_owned()));
  }

  sqlx::query("UPDATE runtime_states SET consumed_at = $3, updated_at = $3 WHERE purpose = $1 AND token_hash = $2")
    .bind(purpose)
    .bind(&hashed)
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("mark security state consumed: {e}")))?;
  Ok(())
}

async fn apply_credential_change_and_revoke_in_tx(
  tx: &mut Transaction<'_, Postgres>,
  user_id: &str,
  reason: &str,
  password_hash: Option<&str>,
  email: Option<&str>,
  now: DateTime<Utc>,
) -> Result<(), DomainError> {
  sqlx::query("SELECT id FROM user_sessions WHERE user_id = $1 ORDER BY id FOR UPDATE")
    .bind(user_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock user sessions for security action: {e}")))?;

  sqlx::query(
    r#"SELECT a.id
       FROM auth_sessions a
       JOIN user_sessions u ON u.id = a.user_session_id
       WHERE u.user_id = $1
       ORDER BY a.id
       FOR UPDATE OF a"#,
  )
  .bind(user_id)
  .fetch_all(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("lock auth sessions for security action: {e}")))?;

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
  .fetch_all(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("lock refresh tokens for security action: {e}")))?;

  sqlx::query(
    r#"UPDATE users
       SET auth_epoch = auth_epoch + 1,
           password = COALESCE($2, password),
           email = COALESCE($3, email),
           email_verified = CASE WHEN $3::text IS NULL THEN email_verified ELSE $4 END
       WHERE id = $1"#,
  )
  .bind(user_id)
  .bind(password_hash)
  .bind(email)
  .bind(now)
  .execute(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("apply user credential change: {e}")))?;

  sqlx::query(
    r#"UPDATE auth_refresh_tokens r
       SET revoked_at = $2, successor_ciphertext = NULL, successor_expires_at = NULL
       FROM auth_sessions a
       JOIN user_sessions u ON u.id = a.user_session_id
       WHERE r.auth_session_id = a.id AND u.user_id = $1 AND r.revoked_at IS NULL"#,
  )
  .bind(user_id)
  .bind(now)
  .execute(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("revoke refresh tokens for security action: {e}")))?;

  sqlx::query(
    r#"UPDATE auth_sessions a
       SET revoked_at = $2, revoke_reason = $3
       FROM user_sessions u
       WHERE a.user_session_id = u.id AND u.user_id = $1 AND a.revoked_at IS NULL"#,
  )
  .bind(user_id)
  .bind(now)
  .bind(reason)
  .execute(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("revoke auth sessions for security action: {e}")))?;

  sqlx::query("DELETE FROM user_sessions WHERE user_id = $1")
    .bind(user_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("delete cookie sessions for security action: {e}")))?;
  Ok(())
}

fn parse_callback_url(raw: &str) -> Result<url::Url, DomainError> {
  let parsed = url::Url::parse(raw).map_err(|_| DomainError::Validation("invalid security callback URL".to_owned()))?;
  if !matches!(parsed.scheme(), "http" | "https") {
    return Err(DomainError::Validation("invalid security callback URL".to_owned()));
  }
  Ok(parsed)
}
