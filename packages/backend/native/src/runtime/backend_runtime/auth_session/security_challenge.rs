use affine_core::auth::{
  AuthChallengePurpose, SECURITY_CHALLENGE_TTL_SECONDS, challenge_active, challenge_identity_matches,
};
use argon2::{
  Argon2, PasswordHasher,
  password_hash::{SaltString, rand_core::OsRng},
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Postgres, Row, Transaction};

use super::{
  RuntimeError, RuntimeResult,
  login::{canonical_email, lock_email},
  mail, security,
  session::{decision_time, lock_user},
};

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum SecurityChallengeKind {
  ChangePassword,
  SetPassword,
  ChangeEmail,
  VerifyEmail,
}

impl SecurityChallengeKind {
  fn purpose(self) -> &'static str {
    match self {
      Self::ChangePassword | Self::SetPassword => AuthChallengePurpose::ChangePassword.as_str(),
      Self::ChangeEmail => AuthChallengePurpose::ChangeEmail.as_str(),
      Self::VerifyEmail => AuthChallengePurpose::VerifyEmail.as_str(),
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

pub(super) async fn prepare(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  kind: SecurityChallengeKind,
  user_id: &str,
  callback_url: &str,
  source: Option<&mail::AuthRequestSource>,
) -> RuntimeResult<bool> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin security challenge", error))?;
  let user = lock_user(&mut tx, user_id).await?;
  if user.disabled {
    return Err(RuntimeError::invalid_state("wrong_sign_in_credentials"));
  }
  let row = sqlx::query("SELECT email,email_verified IS NOT NULL AS verified FROM users WHERE id=$1")
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("load security challenge user", error))?;
  if matches!(
    kind,
    SecurityChallengeKind::ChangePassword | SecurityChallengeKind::ChangeEmail
  ) && !row.get::<bool, _>("verified")
  {
    return Err(RuntimeError::invalid_state("email_verification_required"));
  }
  let email: String = row.get("email");
  let now = decision_time(&mut tx).await?;
  let (token, expires_at) = create_state(
    &mut tx,
    kind.purpose(),
    SecurityState {
      user_id: user_id.to_string(),
      auth_epoch: user.auth_epoch,
      email: None,
    },
    now,
  )
  .await?;
  let mut url = callback(callback_url)?;
  url.query_pairs_mut().append_pair("token", &token);
  if matches!(
    kind,
    SecurityChallengeKind::ChangePassword | SecurityChallengeKind::SetPassword
  ) {
    url.query_pairs_mut().append_pair("userId", user_id);
  }
  mail::reserve(
    &mut tx,
    config,
    mail::AuthMail {
      name: kind.mail_name(),
      to: &email,
      recipient_user_id: Some(user_id),
      props: serde_json::json!({ "url": url.as_str() }),
      dedupe_key: format!("auth:{}:{}", kind.purpose(), super::super::token_hash(&token)),
      expires_at,
      source,
    },
    now,
  )
  .await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit security challenge", error))?;
  Ok(true)
}

pub(super) async fn prepare_verify_change_email(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  user_id: &str,
  source_token: &str,
  email: &str,
  callback_url: &str,
  source: Option<&mail::AuthRequestSource>,
) -> RuntimeResult<bool> {
  let email = canonical_email(email)?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin verify change email", error))?;
  lock_email(&mut tx, &email).await?;
  let user = lock_user(&mut tx, user_id).await?;
  let current_email: String = sqlx::query_scalar("SELECT email FROM users WHERE id=$1")
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("load current security email", error))?;
  if current_email.eq_ignore_ascii_case(&email) {
    return Err(RuntimeError::invalid_state("same_email_provided"));
  }
  let used: Option<String> = sqlx::query_scalar("SELECT id FROM users WHERE lower(email)=lower($1) FOR UPDATE")
    .bind(&email)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("check security email uniqueness", error))?;
  if used.is_some() {
    return Err(RuntimeError::invalid_state("email_already_used"));
  }
  let now = decision_time(&mut tx).await?;
  consume_state(
    &mut tx,
    SecurityChallengeKind::ChangeEmail.purpose(),
    source_token,
    user_id,
    user.auth_epoch,
    None,
    now,
  )
  .await?;
  let (token, expires_at) = create_state(
    &mut tx,
    AuthChallengePurpose::VerifyChangeEmail.as_str(),
    SecurityState {
      user_id: user_id.to_string(),
      auth_epoch: user.auth_epoch,
      email: Some(email.clone()),
    },
    now,
  )
  .await?;
  let mut url = callback(callback_url)?;
  url
    .query_pairs_mut()
    .append_pair("token", &token)
    .append_pair("email", &email);
  mail::reserve(
    &mut tx,
    config,
    mail::AuthMail {
      name: "VerifyChangeEmail",
      to: &email,
      recipient_user_id: Some(user_id),
      props: serde_json::json!({ "url": url.as_str() }),
      dedupe_key: format!("auth:verify-change-email:{}", super::super::token_hash(&token)),
      expires_at,
      source,
    },
    now,
  )
  .await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit verify change email", error))?;
  Ok(true)
}

pub(super) async fn complete_password(
  pool: &PgPool,
  user_id: &str,
  token: &str,
  password: &str,
) -> RuntimeResult<bool> {
  if password.is_empty() {
    return Err(RuntimeError::invalid_input("password is required"));
  }
  let password = password.to_string();
  let password_hash = tokio::task::spawn_blocking(move || {
    Argon2::default()
      .hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
      .map(|hash| hash.to_string())
  })
  .await
  .map_err(|_| RuntimeError::invalid_state("password hashing failed"))?
  .map_err(|_| RuntimeError::invalid_state("password hashing failed"))?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin password challenge completion", error))?;
  let user = lock_user(&mut tx, user_id).await?;
  let now = decision_time(&mut tx).await?;
  consume_state(
    &mut tx,
    SecurityChallengeKind::ChangePassword.purpose(),
    token,
    user_id,
    user.auth_epoch,
    None,
    now,
  )
  .await?;
  security::apply_locked(&mut tx, user_id, "security_action", Some(&password_hash), None, now).await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit password challenge completion", error))?;
  Ok(true)
}

pub(super) async fn complete_email(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  user_id: &str,
  token: &str,
  email: &str,
) -> RuntimeResult<bool> {
  let email = canonical_email(email)?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin email challenge completion", error))?;
  lock_email(&mut tx, &email).await?;
  let user = lock_user(&mut tx, user_id).await?;
  let now = decision_time(&mut tx).await?;
  consume_state(
    &mut tx,
    AuthChallengePurpose::VerifyChangeEmail.as_str(),
    token,
    user_id,
    user.auth_epoch,
    Some(&email),
    now,
  )
  .await?;
  security::apply_locked(&mut tx, user_id, "security_action", None, Some(&email), now).await?;
  mail::reserve(
    &mut tx,
    config,
    mail::AuthMail {
      name: "EmailChanged",
      to: &email,
      recipient_user_id: Some(user_id),
      props: serde_json::json!({ "to": email }),
      dedupe_key: format!("auth:email-changed:{}:{}", user_id, user.auth_epoch + 1),
      expires_at: now + Duration::days(1),
      source: None,
    },
    now,
  )
  .await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit email challenge completion", error))?;
  Ok(true)
}

pub(super) async fn complete_verify_email(pool: &PgPool, user_id: &str, token: &str) -> RuntimeResult<bool> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin verify email completion", error))?;
  let user = lock_user(&mut tx, user_id).await?;
  let now = decision_time(&mut tx).await?;
  consume_state(
    &mut tx,
    SecurityChallengeKind::VerifyEmail.purpose(),
    token,
    user_id,
    user.auth_epoch,
    None,
    now,
  )
  .await?;
  sqlx::query("UPDATE users SET email_verified=COALESCE(email_verified,$2) WHERE id=$1")
    .bind(user_id)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("verify user email", error))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit verify email completion", error))?;
  Ok(true)
}

pub(super) async fn create_url(
  pool: &PgPool,
  kind: SecurityChallengeKind,
  user_id: &str,
  callback_url: &str,
) -> RuntimeResult<String> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin security URL", error))?;
  let user = lock_user(&mut tx, user_id).await?;
  let now = decision_time(&mut tx).await?;
  let (token, _) = create_state(
    &mut tx,
    kind.purpose(),
    SecurityState {
      user_id: user_id.to_string(),
      auth_epoch: user.auth_epoch,
      email: None,
    },
    now,
  )
  .await?;
  let mut url = callback(callback_url)?;
  url
    .query_pairs_mut()
    .append_pair("userId", user_id)
    .append_pair("token", &token);
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit security URL", error))?;
  Ok(url.into())
}

async fn create_state(
  tx: &mut Transaction<'_, Postgres>,
  purpose: &str,
  payload: SecurityState,
  now: DateTime<Utc>,
) -> RuntimeResult<(String, DateTime<Utc>)> {
  let token = uuid::Uuid::new_v4().to_string();
  let expires_at = now + Duration::seconds(SECURITY_CHALLENGE_TTL_SECONDS);
  sqlx::query("INSERT INTO runtime_states(purpose,token_hash,payload,expires_at) VALUES($1,$2,$3,$4)")
    .bind(purpose)
    .bind(super::super::token_hash(&token))
    .bind(serde_json::to_value(payload).map_err(|error| RuntimeError::json("encode security state", error))?)
    .bind(expires_at)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("create security state", error))?;
  Ok((token, expires_at))
}

#[allow(clippy::too_many_arguments)]
async fn consume_state(
  tx: &mut Transaction<'_, Postgres>,
  purpose: &str,
  token: &str,
  user_id: &str,
  auth_epoch: i32,
  email: Option<&str>,
  now: DateTime<Utc>,
) -> RuntimeResult<()> {
  let row = sqlx::query(
    "SELECT payload,consumed_at,expires_at FROM runtime_states WHERE purpose=$1 AND token_hash=$2 FOR UPDATE",
  )
  .bind(purpose)
  .bind(super::super::token_hash(token))
  .fetch_optional(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("consume security state", error))?;
  let valid = row.is_some_and(|row| {
    challenge_active(row.get("consumed_at"), row.get("expires_at"), now)
      && serde_json::from_value::<SecurityState>(row.get("payload"))
        .ok()
        .is_some_and(|state| {
          challenge_identity_matches(
            Some(&state.user_id),
            user_id,
            Some(i64::from(state.auth_epoch)),
            auth_epoch,
          ) && email.is_none_or(|email| state.email.as_deref() == Some(email))
        })
  });
  if !valid {
    return Err(RuntimeError::invalid_state("invalid_email_token"));
  }
  sqlx::query("UPDATE runtime_states SET consumed_at=$3,updated_at=$3 WHERE purpose=$1 AND token_hash=$2")
    .bind(purpose)
    .bind(super::super::token_hash(token))
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("mark security state consumed", error))?;
  Ok(())
}

fn callback(value: &str) -> RuntimeResult<url::Url> {
  let url = url::Url::parse(value).map_err(|_| RuntimeError::invalid_input("invalid security callback URL"))?;
  if !matches!(url.scheme(), "http" | "https") {
    return Err(RuntimeError::invalid_input("invalid security callback URL"));
  }
  Ok(url)
}
