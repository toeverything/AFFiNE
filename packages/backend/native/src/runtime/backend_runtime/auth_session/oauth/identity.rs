use affine_core::auth::{LoginMethodFacts, login_methods};
use chrono::Utc;
use sqlx::{PgPool, Postgres, Row, Transaction};

use super::{
  super::{
    RuntimeError, RuntimeResult, issuance,
    login::{canonical_email, lock_email},
    oauth_http::OAuthAccount,
    session::{decision_time, lock_user},
    types::{LoginResult, SessionIssueInput},
  },
  OAuthState,
};
use crate::runtime::BackendRuntimeConfig;

pub(in super::super) async fn bind_and_issue(
  pool: &PgPool,
  runtime: &BackendRuntimeConfig,
  state: &OAuthState,
  namespace: &str,
  account: OAuthAccount,
  issue: SessionIssueInput,
) -> RuntimeResult<LoginResult> {
  let email = canonical_email(&account.email)?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin OAuth identity binding", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('auth:oauth:' || $1 || ':' || $2,0))")
    .bind(namespace)
    .bind(&account.subject)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("lock OAuth identity", error))?;
  lock_email(&mut tx, &email).await?;
  let existing = find_account(&mut tx, &state.provider, namespace, &account.subject).await?;
  let now = decision_time(&mut tx).await?;
  let (user_id, created) = if let Some((account_id, user_id, legacy)) = existing {
    let user = lock_user(&mut tx, &user_id).await?;
    if user.disabled {
      return Err(RuntimeError::invalid_state("wrong_sign_in_credentials"));
    }
    if legacy {
      sqlx::query("UPDATE user_connected_accounts SET provider_namespace=$2,updated_at=$3 WHERE id=$1")
        .bind(account_id)
        .bind(namespace)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("adopt OAuth account namespace", error))?;
    }
    sqlx::query(
      "UPDATE users SET email_verified=CASE WHEN lower(email)=lower($2) THEN COALESCE(email_verified,$3) ELSE \
       email_verified END WHERE id=$1",
    )
    .bind(&user_id)
    .bind(&email)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("verify OAuth account email", error))?;
    (user_id, false)
  } else {
    let users = sqlx::query(
      "SELECT id,registered,disabled,password IS NOT NULL AS has_password FROM users WHERE lower(email)=lower($1) \
       ORDER BY id FOR UPDATE",
    )
    .bind(&email)
    .fetch_all(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("find OAuth email", error))?;
    let user = users.first();
    let allowed = login_methods(LoginMethodFacts {
      identity_count: users.len(),
      registered: user.is_some_and(|row| row.get("registered")),
      disabled: user.is_some_and(|row| row.get("disabled")),
      has_password: user.is_some_and(|row| row.get("has_password")),
      allow_signup: runtime.auth.allow_signup,
      allow_signup_for_oauth: runtime.auth.allow_signup_for_oauth,
      email_domain_allowed: true,
      oauth_available: true,
    })
    .oauth;
    if !allowed {
      return Err(RuntimeError::invalid_state(if users.is_empty() {
        "sign_up_forbidden"
      } else {
        "wrong_sign_in_credentials"
      }));
    }
    let (user_id, created) = fulfill_user(&mut tx, &email, &account, now, &users).await?;
    sqlx::query(
      r#"INSERT INTO user_connected_accounts(
           id,user_id,provider,provider_namespace,provider_account_id,scope,access_token,refresh_token,expires_at,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,NULL,NULL,NULL,NULL,$6,$6)"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&user_id)
    .bind(&state.provider)
    .bind(namespace)
    .bind(&account.subject)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("bind OAuth account", error))?;
    (user_id, created)
  };
  let user = lock_user(&mut tx, &user_id).await?;
  let result = issuance::issue(&mut tx, runtime, &user_id, &user, issue, now, Some(created)).await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit OAuth identity binding", error))?;
  Ok(result)
}

async fn find_account(
  tx: &mut Transaction<'_, Postgres>,
  provider: &str,
  namespace: &str,
  subject: &str,
) -> RuntimeResult<Option<(String, String, bool)>> {
  let current = sqlx::query(
    "SELECT id,user_id FROM user_connected_accounts WHERE provider_namespace=$1 AND provider_account_id=$2 FOR UPDATE",
  )
  .bind(namespace)
  .bind(subject)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("find OAuth account", error))?;
  if let Some(row) = current {
    return Ok(Some((row.get("id"), row.get("user_id"), false)));
  }
  let legacy = sqlx::query(
    r#"SELECT id,user_id FROM user_connected_accounts
       WHERE provider=$1 AND provider_account_id=$2 AND provider_namespace IS NULL ORDER BY id FOR UPDATE"#,
  )
  .bind(provider)
  .bind(subject)
  .fetch_all(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("find legacy OAuth account", error))?;
  match legacy.as_slice() {
    [] => Ok(None),
    [row] => Ok(Some((row.get("id"), row.get("user_id"), true))),
    _ => Err(RuntimeError::invalid_state("oauth_account_already_connected")),
  }
}

async fn fulfill_user(
  tx: &mut Transaction<'_, Postgres>,
  email: &str,
  account: &OAuthAccount,
  now: chrono::DateTime<Utc>,
  users: &[sqlx::postgres::PgRow],
) -> RuntimeResult<(String, bool)> {
  if users.len() > 1 || users.first().is_some_and(|row| row.get::<bool, _>("disabled")) {
    return Err(RuntimeError::invalid_state("wrong_sign_in_credentials"));
  }
  if let Some(row) = users.first() {
    let user_id: String = row.get("id");
    sqlx::query(
      r#"UPDATE users SET registered=true,email_verified=COALESCE(email_verified,$2),
           name=COALESCE($3,name),avatar_url=COALESCE($4,avatar_url) WHERE id=$1"#,
    )
    .bind(&user_id)
    .bind(now)
    .bind(&account.name)
    .bind(&account.avatar_url)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("fulfill OAuth user", error))?;
    return Ok((user_id, false));
  }
  let user_id = uuid::Uuid::new_v4().to_string();
  let name = account
    .name
    .as_deref()
    .unwrap_or_else(|| email.split('@').next().unwrap_or(email));
  sqlx::query(
    "INSERT INTO users(id,name,email,email_verified,avatar_url,registered,disabled,auth_epoch,created_at) \
     VALUES($1,$2,$3,$4,$5,true,false,0,$4)",
  )
  .bind(&user_id)
  .bind(name)
  .bind(email)
  .bind(now)
  .bind(&account.avatar_url)
  .execute(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("create OAuth user", error))?;
  Ok((user_id, true))
}
