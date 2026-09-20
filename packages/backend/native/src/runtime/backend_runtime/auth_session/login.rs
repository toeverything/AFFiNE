use affine_core::auth::{
  AuthChallengePurpose, LoginMethodFacts, MAGIC_LINK_TTL_SECONDS, OPEN_APP_TTL_SECONDS, OtpAttemptDecision,
  challenge_identity_matches, login_methods, otp_attempt_decision,
};
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use chrono::{DateTime, Duration, Utc};
use rand::Rng;
use sqlx::{PgPool, Postgres, Row, Transaction};
use subtle::ConstantTimeEq;

use super::{
  RuntimeError, RuntimeResult, issuance, mail, methods,
  session::{LockedUser, decision_time, lock_user},
  types::{LoginResult, SessionIssueInput},
};

pub(super) const MAGIC_PURPOSE: &str = AuthChallengePurpose::MagicLinkOtp.as_str();
const OPEN_APP_PURPOSE: &str = AuthChallengePurpose::OpenAppSignIn.as_str();

pub(super) async fn password(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  email: &str,
  password: &str,
  issue: SessionIssueInput,
) -> RuntimeResult<LoginResult> {
  let email = canonical_email(email)?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin password login", error))?;
  lock_email(&mut tx, &email).await?;
  let rows = sqlx::query(
    "SELECT id,password,disabled,auth_epoch FROM users WHERE lower(email)=lower($1) ORDER BY id FOR UPDATE",
  )
  .bind(&email)
  .fetch_all(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("lock password login user", error))?;
  if rows.len() != 1 || rows[0].get::<bool, _>("disabled") {
    return Err(RuntimeError::invalid_state("wrong_sign_in_credentials"));
  }
  let password_hash: Option<String> = rows[0].get("password");
  let Some(password_hash) = password_hash else {
    return Err(RuntimeError::invalid_state("wrong_sign_in_method"));
  };
  let parsed =
    PasswordHash::new(&password_hash).map_err(|_| RuntimeError::invalid_state("wrong_sign_in_credentials"))?;
  if Argon2::default().verify_password(password.as_bytes(), &parsed).is_err() {
    return Err(RuntimeError::invalid_state("wrong_sign_in_credentials"));
  }
  let user_id: String = rows[0].get("id");
  let user = LockedUser {
    disabled: false,
    auth_epoch: rows[0].get("auth_epoch"),
  };
  let now = decision_time(&mut tx).await?;
  let result = issuance::issue(&mut tx, config, &user_id, &user, issue, now, None).await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit password login", error))?;
  Ok(result)
}

pub(super) async fn prepare_magic_link(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  email: &str,
  callback_url: &str,
  client_nonce: Option<&str>,
  server_name: &str,
  source: Option<&mail::AuthRequestSource>,
) -> RuntimeResult<String> {
  let email = canonical_email(email)?;
  let known_user: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE lower(email)=lower($1))")
    .bind(&email)
    .fetch_one(pool)
    .await
    .map_err(|error| RuntimeError::database("find magic link user", error))?;
  let signup_domain_allowed = if known_user {
    None
  } else {
    Some(!config.auth.require_email_domain_verification || methods::verify_email_domain_records(&email).await?)
  };
  let mut callback =
    url::Url::parse(callback_url).map_err(|_| RuntimeError::invalid_input("invalid magic link callback URL"))?;
  if !matches!(callback.scheme(), "http" | "https") {
    return Err(RuntimeError::invalid_input("invalid magic link callback URL"));
  }
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin magic link preparation", error))?;
  lock_email(&mut tx, &email).await?;
  let users =
    sqlx::query("SELECT id,disabled,auth_epoch FROM users WHERE lower(email)=lower($1) ORDER BY id FOR UPDATE")
      .bind(&email)
      .fetch_all(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("lock magic link user", error))?;
  let email_domain_allowed = !users.is_empty() || signup_domain_allowed == Some(true);
  let magic_link_allowed = login_methods(LoginMethodFacts {
    identity_count: users.len(),
    registered: false,
    disabled: users.first().is_some_and(|row| row.get("disabled")),
    has_password: false,
    allow_signup: config.auth.allow_signup,
    allow_signup_for_oauth: false,
    email_domain_allowed,
    oauth_available: false,
  })
  .magic_link;
  if !magic_link_allowed {
    return Err(RuntimeError::invalid_state(if users.is_empty() {
      "sign_up_forbidden"
    } else {
      "wrong_sign_in_credentials"
    }));
  }
  let otp = format!("{:06}", rand::rng().random_range(0..1_000_000_u32));
  callback
    .query_pairs_mut()
    .append_pair("token", &otp)
    .append_pair("email", &email);
  let now = decision_time(&mut tx).await?;
  let expires_at = now + Duration::seconds(MAGIC_LINK_TTL_SECONDS);
  let payload = serde_json::json!({
    "otpHash": super::super::token_hash(&otp),
    "clientNonce": client_nonce,
    "userId": users.first().map(|row| row.get::<String, _>("id")),
    "authEpoch": users.first().map(|row| row.get::<i32, _>("auth_epoch")),
  });
  sqlx::query(
    r#"INSERT INTO runtime_states(purpose,token_hash,lookup_key,payload,attempts,consumed_at,expires_at)
       VALUES($1,$2,$3,$4,0,NULL,$5)
       ON CONFLICT(purpose,token_hash) DO UPDATE SET lookup_key=EXCLUDED.lookup_key,payload=EXCLUDED.payload,
         attempts=0,consumed_at=NULL,expires_at=EXCLUDED.expires_at,updated_at=$6"#,
  )
  .bind(MAGIC_PURPOSE)
  .bind(email_selector(&email))
  .bind(&email)
  .bind(payload)
  .bind(expires_at)
  .bind(now)
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("store magic link", error))?;
  reserve_magic_mail(
    &mut tx,
    config,
    &email,
    callback.as_str(),
    &otp,
    server_name,
    users.is_empty(),
    expires_at,
    source,
    now,
  )
  .await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit magic link preparation", error))?;
  Ok(email)
}

pub(super) async fn complete_magic_link(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  email: &str,
  otp: &str,
  client_nonce: Option<&str>,
  issue: SessionIssueInput,
) -> RuntimeResult<LoginResult> {
  let email = canonical_email(email)?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin magic link completion", error))?;
  lock_email(&mut tx, &email).await?;
  let users =
    sqlx::query("SELECT id,disabled,auth_epoch FROM users WHERE lower(email)=lower($1) ORDER BY id FOR UPDATE")
      .bind(&email)
      .fetch_all(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("lock magic link completion user", error))?;
  if users.len() > 1 {
    return Err(RuntimeError::invalid_state("invalid_email_token"));
  }
  let now = decision_time(&mut tx).await?;
  let state = sqlx::query(
    "SELECT payload,attempts,expires_at FROM runtime_states WHERE purpose=$1 AND token_hash=$2 AND consumed_at IS \
     NULL FOR UPDATE",
  )
  .bind(MAGIC_PURPOSE)
  .bind(email_selector(&email))
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("lock magic link", error))?;
  let Some(state) = state else {
    return Err(RuntimeError::invalid_state("invalid_email_token"));
  };
  let payload: serde_json::Value = state.get("payload");
  let attempts: i32 = state.get("attempts");
  let expires_at: DateTime<Utc> = state.get("expires_at");
  let stored_hash = payload
    .get("otpHash")
    .and_then(serde_json::Value::as_str)
    .unwrap_or_default();
  let supplied_hash = super::super::token_hash(otp);
  match otp_attempt_decision(
    now,
    expires_at,
    attempts,
    payload.get("clientNonce").and_then(serde_json::Value::as_str),
    client_nonce,
    constant_time_equal(stored_hash, &supplied_hash),
  ) {
    OtpAttemptDecision::Accept => {}
    OtpAttemptDecision::RejectNonce => {
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit magic link nonce mismatch", error))?;
      return Err(RuntimeError::invalid_state("invalid_auth_state"));
    }
    OtpAttemptDecision::RejectExpired => {
      consume_magic(&mut tx, &email, now).await?;
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit expired magic link", error))?;
      return Err(RuntimeError::invalid_state("invalid_email_token"));
    }
    OtpAttemptDecision::RejectProof { next_attempts, consume } => {
      sqlx::query(
        "UPDATE runtime_states SET attempts=$3,consumed_at=CASE WHEN $4 THEN $5 ELSE NULL END,updated_at=$5 WHERE \
         purpose=$1 AND token_hash=$2",
      )
      .bind(MAGIC_PURPOSE)
      .bind(email_selector(&email))
      .bind(next_attempts)
      .bind(consume)
      .bind(now)
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("record magic link failure", error))?;
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit magic link failure", error))?;
      return Err(RuntimeError::invalid_state("invalid_email_token"));
    }
  }
  let email_domain_allowed = !users.is_empty()
    || !config.auth.require_email_domain_verification
    || methods::verify_email_domain_records(&email).await?;
  let magic_link_allowed = login_methods(LoginMethodFacts {
    identity_count: users.len(),
    registered: false,
    disabled: users.first().is_some_and(|row| row.get("disabled")),
    has_password: false,
    allow_signup: config.auth.allow_signup,
    allow_signup_for_oauth: false,
    email_domain_allowed,
    oauth_available: false,
  })
  .magic_link;
  if !magic_link_allowed {
    return Err(RuntimeError::invalid_state(if users.is_empty() {
      "sign_up_forbidden"
    } else {
      "invalid_email_token"
    }));
  }
  let (user_id, user, created) = fulfill_magic_user(&mut tx, &email, &payload, &users, now).await?;
  consume_magic(&mut tx, &email, now).await?;
  let result = issuance::issue(&mut tx, config, &user_id, &user, issue, now, Some(created)).await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit magic link completion", error))?;
  Ok(result)
}

pub(super) async fn create_open_app_code(pool: &PgPool, user_id: &str) -> RuntimeResult<String> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin open app code", error))?;
  let user = lock_user(&mut tx, user_id).await?;
  if user.disabled {
    return Err(RuntimeError::invalid_state("invalid_auth_state"));
  }
  let now = decision_time(&mut tx).await?;
  let code = uuid::Uuid::new_v4().to_string();
  sqlx::query(
    r#"INSERT INTO runtime_states(purpose,token_hash,payload,expires_at)
       VALUES($1,$2,$3,$4)"#,
  )
  .bind(OPEN_APP_PURPOSE)
  .bind(super::super::token_hash(&code))
  .bind(serde_json::json!({ "userId": user_id, "authEpoch": user.auth_epoch }))
  .bind(now + Duration::seconds(OPEN_APP_TTL_SECONDS))
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("create open app code", error))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit open app code", error))?;
  Ok(code)
}

pub(super) async fn complete_open_app(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  code: &str,
  issue: SessionIssueInput,
) -> RuntimeResult<LoginResult> {
  let token_hash = super::super::token_hash(code);
  let preview: Option<serde_json::Value> = sqlx::query_scalar(
    "SELECT payload FROM runtime_states WHERE purpose=$1 AND token_hash=$2 AND consumed_at IS NULL AND \
     expires_at>clock_timestamp()",
  )
  .bind(OPEN_APP_PURPOSE)
  .bind(&token_hash)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load open app code", error))?;
  let user_id = preview
    .as_ref()
    .and_then(|value| value.get("userId"))
    .and_then(serde_json::Value::as_str)
    .ok_or_else(|| RuntimeError::invalid_state("invalid_auth_state"))?
    .to_string();
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin open app completion", error))?;
  let user = lock_user(&mut tx, &user_id).await?;
  let now = decision_time(&mut tx).await?;
  let state: Option<serde_json::Value> = sqlx::query_scalar(
    r#"UPDATE runtime_states SET consumed_at=$3,updated_at=$3
       WHERE purpose=$1 AND token_hash=$2 AND consumed_at IS NULL AND expires_at>$3 RETURNING payload"#,
  )
  .bind(OPEN_APP_PURPOSE)
  .bind(token_hash)
  .bind(now)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("consume open app code", error))?;
  let valid = state.as_ref().is_some_and(|value| {
    value.get("userId").and_then(serde_json::Value::as_str) == Some(user_id.as_str())
      && value.get("authEpoch").and_then(serde_json::Value::as_i64) == Some(i64::from(user.auth_epoch))
  });
  if !valid || user.disabled {
    return Err(RuntimeError::invalid_state("invalid_auth_state"));
  }
  let result = issuance::issue(&mut tx, config, &user_id, &user, issue, now, None).await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit open app completion", error))?;
  Ok(result)
}

async fn fulfill_magic_user(
  tx: &mut Transaction<'_, Postgres>,
  email: &str,
  payload: &serde_json::Value,
  users: &[sqlx::postgres::PgRow],
  now: DateTime<Utc>,
) -> RuntimeResult<(String, LockedUser, bool)> {
  if let Some(row) = users.first() {
    let user_id: String = row.get("id");
    if row.get::<bool, _>("disabled")
      || !challenge_identity_matches(
        payload.get("userId").and_then(serde_json::Value::as_str),
        &user_id,
        payload.get("authEpoch").and_then(serde_json::Value::as_i64),
        row.get("auth_epoch"),
      )
    {
      return Err(RuntimeError::invalid_state("invalid_email_token"));
    }
    sqlx::query("UPDATE users SET registered=true,email_verified=COALESCE(email_verified,$2) WHERE id=$1")
      .bind(&user_id)
      .bind(now)
      .execute(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database("complete magic link user", error))?;
    return Ok((
      user_id,
      LockedUser {
        disabled: false,
        auth_epoch: row.get("auth_epoch"),
      },
      false,
    ));
  }
  let user_id = uuid::Uuid::new_v4().to_string();
  let name = email.split('@').next().unwrap_or(email);
  sqlx::query(
    "INSERT INTO users(id,name,email,email_verified,registered,disabled,auth_epoch,created_at) \
     VALUES($1,$2,$3,$4,true,false,0,$4)",
  )
  .bind(&user_id)
  .bind(name)
  .bind(email)
  .bind(now)
  .execute(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("create magic link user", error))?;
  Ok((
    user_id,
    LockedUser {
      disabled: false,
      auth_epoch: 0,
    },
    true,
  ))
}

async fn consume_magic(tx: &mut Transaction<'_, Postgres>, email: &str, now: DateTime<Utc>) -> RuntimeResult<()> {
  sqlx::query("UPDATE runtime_states SET consumed_at=$3,updated_at=$3 WHERE purpose=$1 AND token_hash=$2")
    .bind(MAGIC_PURPOSE)
    .bind(email_selector(email))
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("consume magic link", error))?;
  Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn reserve_magic_mail(
  tx: &mut Transaction<'_, Postgres>,
  config: &super::super::BackendRuntimeConfig,
  email: &str,
  link: &str,
  otp: &str,
  server_name: &str,
  signup: bool,
  expires_at: DateTime<Utc>,
  source: Option<&mail::AuthRequestSource>,
  now: DateTime<Utc>,
) -> RuntimeResult<()> {
  let mail_name = if signup { "SignUp" } else { "SignIn" };
  mail::reserve(
    tx,
    config,
    mail::AuthMail {
      name: mail_name,
      to: email,
      recipient_user_id: None,
      props: serde_json::json!({ "url": link, "otp": otp, "serverName": server_name }),
      dedupe_key: format!(
        "auth:magic-link:{}:{}",
        email_selector(email),
        super::super::token_hash(otp)
      ),
      expires_at,
      source,
    },
    now,
  )
  .await
}

pub(super) async fn lock_email(tx: &mut Transaction<'_, Postgres>, email: &str) -> RuntimeResult<()> {
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('auth:email:' || lower($1),0))")
    .bind(email)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock auth email", error))?;
  Ok(())
}

pub(super) fn canonical_email(email: &str) -> RuntimeResult<String> {
  let email = email.trim();
  let normalized = email.to_ascii_lowercase();
  let valid = normalized.len() <= 320
    && normalized.split_once('@').is_some_and(|(local, domain)| {
      !local.is_empty() && !domain.is_empty() && !domain.contains('@') && !local.contains(char::is_whitespace)
    });
  if !valid {
    return Err(RuntimeError::invalid_input("invalid email"));
  }
  Ok(email.to_string())
}

fn email_selector(email: &str) -> String {
  super::super::token_hash(&email.trim().to_ascii_lowercase())
}

fn constant_time_equal(left: &str, right: &str) -> bool {
  left.len() == right.len() && left.as_bytes().ct_eq(right.as_bytes()).into()
}
