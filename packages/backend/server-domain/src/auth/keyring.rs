//! Management and validation of `auth.session.signingKeys` in `public.app_configs`.

use std::{collections::BTreeSet, fmt};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Duration, Utc};
use rand::RngCore as _;
use serde::{Deserialize, Serialize};
use server_db::{ServerDb, WorkloadTier};
use server_types::DomainError;

use super::access_token::CLOCK_TOLERANCE_SECONDS;

pub const SIGNING_KEYS_CONFIG_ID: &str = "auth.session.signingKeys";

#[derive(Clone, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSigningKey {
  pub id: String,
  pub secret: String,
  pub status: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub created_at: Option<DateTime<Utc>>,
  pub source: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub retired_at: Option<DateTime<Utc>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub verify_until: Option<DateTime<Utc>>,
}

impl fmt::Debug for StoredSigningKey {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("StoredSigningKey")
      .field("id", &self.id)
      .field("secret", &"[REDACTED]")
      .field("status", &self.status)
      .field("created_at", &self.created_at)
      .field("source", &self.source)
      .field("retired_at", &self.retired_at)
      .field("verify_until", &self.verify_until)
      .finish()
  }
}

/// Public signing key metadata with the raw secret stripped.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SigningKeyMetadata {
  pub id: String,
  pub status: String,
  pub source: String,
  pub created_at: Option<DateTime<Utc>>,
  pub retired_at: Option<DateTime<Utc>>,
  pub verify_until: Option<DateTime<Utc>>,
  pub can_delete: bool,
}

pub fn signing_key_minimum_verify_seconds(access_token_ttl_seconds: i64) -> i64 {
  access_token_ttl_seconds.max(1) + CLOCK_TOLERANCE_SECONDS
}

pub fn signing_key_verify_until(now: DateTime<Utc>, access_token_ttl_seconds: i64) -> DateTime<Utc> {
  now + Duration::seconds(signing_key_minimum_verify_seconds(access_token_ttl_seconds))
}

pub fn signing_key_can_verify(status: &str, verify_until: Option<DateTime<Utc>>, now: DateTime<Utc>) -> bool {
  match status {
    "active" => true,
    "retiring" => verify_until.is_some_and(|until| until >= now),
    _ => false,
  }
}

pub fn signing_key_can_delete(status: &str, verify_until: Option<DateTime<Utc>>, now: DateTime<Utc>) -> bool {
  status == "retiring" && verify_until.is_some_and(|until| until < now)
}

pub fn signing_key_window_valid(
  status: &str,
  retired_at: Option<DateTime<Utc>>,
  verify_until: Option<DateTime<Utc>>,
  minimum_verify_seconds: i64,
) -> bool {
  match status {
    "active" => retired_at.is_none() && verify_until.is_none(),
    "retiring" => match (retired_at, verify_until) {
      (Some(retired), Some(until)) => until > retired && (until - retired).num_seconds() >= minimum_verify_seconds,
      _ => false,
    },
    _ => false,
  }
}

/// Ensures `public.app_configs` contains `id = 'auth.session.signingKeys'` with
/// a valid active signing key, inserting an auto-generated key if absent.
pub async fn ensure_signing_keys(db: &ServerDb) -> Result<Vec<StoredSigningKey>, DomainError> {
  let initial = serde_json::to_value(vec![generate_signing_key("auto")])
    .map_err(|e| DomainError::Internal(format!("encode initial signing key: {e}")))?;

  let mut conn = db
    .acquire_tiered(WorkloadTier::InteractiveWrite)
    .await
    .map_err(|e| DomainError::Internal(format!("acquire signing key conn: {e}")))?;

  sqlx::query(
    r#"INSERT INTO app_configs (id, value, last_updated_by, created_at, updated_at)
       VALUES ($1, $2, NULL, clock_timestamp(), clock_timestamp())
       ON CONFLICT (id) DO NOTHING"#,
  )
  .bind(SIGNING_KEYS_CONFIG_ID)
  .bind(initial)
  .execute(&mut *conn)
  .await
  .map_err(|e| DomainError::Internal(format!("initialize auth signing keys: {e}")))?;

  let value: serde_json::Value = sqlx::query_scalar("SELECT value FROM app_configs WHERE id = $1")
    .bind(SIGNING_KEYS_CONFIG_ID)
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("load auth signing keys: {e}")))?;

  let keys: Vec<StoredSigningKey> =
    serde_json::from_value(value).map_err(|e| DomainError::Internal(format!("decode auth signing keys: {e}")))?;
  validate_signing_keys(&keys)?;
  Ok(keys)
}

/// Lists signing key metadata with all secret material stripped.
pub async fn list_signing_key_metadata(db: &ServerDb) -> Result<Vec<SigningKeyMetadata>, DomainError> {
  let keys = ensure_signing_keys(db).await?;
  let mut conn = db
    .acquire_tiered(WorkloadTier::InteractiveRead)
    .await
    .map_err(|e| DomainError::Internal(format!("acquire signing key clock conn: {e}")))?;
  let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("load signing key clock: {e}")))?;
  metadata_from_keys(keys, now)
}

/// Rotates the active signing key using strict lock ordering:
/// lock actor -> lock keyring config row -> read PostgreSQL `clock_timestamp()`.
pub async fn rotate_signing_key(
  db: &ServerDb,
  actor_id: &str,
  expected_active_key_id: &str,
  access_token_ttl_seconds: i64,
) -> Result<Vec<SigningKeyMetadata>, DomainError> {
  let _ = ensure_signing_keys(db).await?;

  let mut tx = db
    .begin_tiered(WorkloadTier::InteractiveWrite)
    .await
    .map_err(|e| DomainError::Internal(format!("begin signing key rotation: {e}")))?;

  lock_actor(tx.tx_mut(), actor_id).await?;
  let mut keys = lock_keys(tx.tx_mut()).await?;
  let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load signing key rotation clock: {e}")))?;

  let active = keys
    .iter_mut()
    .find(|k| k.status == "active")
    .ok_or_else(|| DomainError::Internal("auth signing keyring has no active key".to_owned()))?;
  if active.id != expected_active_key_id {
    return Err(DomainError::Validation("auth_signing_key_changed".to_owned()));
  }
  active.status = "retiring".to_owned();
  active.retired_at = Some(now);
  active.verify_until = Some(signing_key_verify_until(now, access_token_ttl_seconds));

  let mut next = generate_signing_key("admin");
  next.created_at = Some(now);
  keys.push(next);
  validate_signing_keys(&keys)?;
  save_keys(tx.tx_mut(), actor_id, &keys).await?;

  tx.commit()
    .await
    .map_err(|e| DomainError::Internal(format!("commit signing key rotation: {e}")))?;

  metadata_from_keys(keys, now)
}

/// Deletes an expired retiring signing key using strict lock ordering:
/// lock actor -> lock keyring config row -> read PostgreSQL `clock_timestamp()`.
pub async fn delete_signing_key(
  db: &ServerDb,
  actor_id: &str,
  key_id: &str,
) -> Result<Vec<SigningKeyMetadata>, DomainError> {
  let _ = ensure_signing_keys(db).await?;

  let mut tx = db
    .begin_tiered(WorkloadTier::InteractiveWrite)
    .await
    .map_err(|e| DomainError::Internal(format!("begin signing key deletion: {e}")))?;

  lock_actor(tx.tx_mut(), actor_id).await?;
  let mut keys = lock_keys(tx.tx_mut()).await?;
  let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(&mut **tx.tx_mut())
    .await
    .map_err(|e| DomainError::Internal(format!("load signing key deletion clock: {e}")))?;

  let key = keys
    .iter()
    .find(|k| k.id == key_id)
    .ok_or_else(|| DomainError::Validation("auth_signing_key_not_found".to_owned()))?;
  if !signing_key_can_delete(&key.status, key.verify_until, now) {
    return Err(DomainError::Forbidden("auth_signing_key_cannot_be_deleted".to_owned()));
  }

  keys.retain(|k| k.id != key_id);
  validate_signing_keys(&keys)?;
  save_keys(tx.tx_mut(), actor_id, &keys).await?;

  tx.commit()
    .await
    .map_err(|e| DomainError::Internal(format!("commit signing key deletion: {e}")))?;

  metadata_from_keys(keys, now)
}

async fn lock_actor(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>, actor_id: &str) -> Result<(), DomainError> {
  use sqlx::Row as _;
  let row = sqlx::query(
    r#"SELECT u.disabled,
              EXISTS(
                SELECT 1 FROM user_features f
                WHERE f.user_id = u.id AND f.name = 'administrator' AND f.activated = true
              ) AS is_admin
       FROM users u
       WHERE u.id = $1
       FOR UPDATE"#,
  )
  .bind(actor_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("lock signing key actor: {e}")))?;
  let Some(row) = row else {
    return Err(DomainError::Forbidden(
      "auth signing key actor does not exist".to_owned(),
    ));
  };
  let disabled: bool = row.get("disabled");
  let is_admin: bool = row.get("is_admin");
  if disabled || !is_admin {
    return Err(DomainError::Forbidden(
      "You are not allowed to perform this action.".to_owned(),
    ));
  }
  Ok(())
}

async fn lock_keys(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<Vec<StoredSigningKey>, DomainError> {
  let value: serde_json::Value = sqlx::query_scalar("SELECT value FROM app_configs WHERE id = $1 FOR UPDATE")
    .bind(SIGNING_KEYS_CONFIG_ID)
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock auth signing keyring: {e}")))?;
  let keys: Vec<StoredSigningKey> =
    serde_json::from_value(value).map_err(|e| DomainError::Internal(format!("decode auth signing keyring: {e}")))?;
  validate_signing_keys(&keys)?;
  Ok(keys)
}

async fn save_keys(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  actor_id: &str,
  keys: &[StoredSigningKey],
) -> Result<(), DomainError> {
  let value =
    serde_json::to_value(keys).map_err(|e| DomainError::Internal(format!("encode auth signing keyring: {e}")))?;
  sqlx::query("UPDATE app_configs SET value = $2, last_updated_by = $3, updated_at = clock_timestamp() WHERE id = $1")
    .bind(SIGNING_KEYS_CONFIG_ID)
    .bind(value)
    .bind(actor_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("save auth signing keyring: {e}")))?;
  Ok(())
}

fn metadata_from_keys(keys: Vec<StoredSigningKey>, now: DateTime<Utc>) -> Result<Vec<SigningKeyMetadata>, DomainError> {
  validate_signing_keys(&keys)?;
  Ok(
    keys
      .into_iter()
      .map(|key| SigningKeyMetadata {
        can_delete: signing_key_can_delete(&key.status, key.verify_until, now),
        id: key.id,
        status: key.status,
        source: key.source,
        created_at: key.created_at,
        retired_at: key.retired_at,
        verify_until: key.verify_until,
      })
      .collect(),
  )
}

pub fn generate_signing_key(source: &str) -> StoredSigningKey {
  let mut suffix = [0_u8; 6];
  let mut secret = [0_u8; 32];
  rand::rng().fill_bytes(&mut suffix);
  rand::rng().fill_bytes(&mut secret);
  let now = Utc::now();
  StoredSigningKey {
    id: format!("auth-{}-{}", now.timestamp_millis(), URL_SAFE_NO_PAD.encode(suffix)),
    secret: URL_SAFE_NO_PAD.encode(secret),
    status: "active".to_owned(),
    created_at: Some(now),
    source: source.to_owned(),
    retired_at: None,
    verify_until: None,
  }
}

pub fn validate_signing_keys(keys: &[StoredSigningKey]) -> Result<(), DomainError> {
  validate_signing_keys_with_window(keys, 0)
}

pub fn validate_signing_keys_with_window(
  keys: &[StoredSigningKey],
  minimum_verify_seconds: i64,
) -> Result<(), DomainError> {
  if keys.iter().filter(|k| k.status == "active").count() != 1 {
    return Err(DomainError::Internal(
      "auth signing keyring requires exactly one active key".to_owned(),
    ));
  }
  let mut ids = BTreeSet::new();
  for key in keys {
    if key.id.is_empty()
      || key.id.len() > 128
      || !key
        .id
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
      || !ids.insert(key.id.as_str())
      || !matches!(key.source.as_str(), "auto" | "admin")
      || !matches!(key.status.as_str(), "active" | "retiring")
    {
      return Err(DomainError::Internal(
        "auth signing keyring entry is invalid".to_owned(),
      ));
    }
    let decoded = URL_SAFE_NO_PAD
      .decode(&key.secret)
      .map_err(|_| DomainError::Internal("auth signing key secret is not valid base64url".to_owned()))?;
    if decoded.len() < 32 || URL_SAFE_NO_PAD.encode(&decoded) != key.secret {
      return Err(DomainError::Internal(
        "auth signing key secret length/encoding is invalid".to_owned(),
      ));
    }
    if !signing_key_window_valid(&key.status, key.retired_at, key.verify_until, minimum_verify_seconds) {
      return Err(DomainError::Internal(
        "auth signing key lifecycle is invalid".to_owned(),
      ));
    }
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn generated_signing_key_matches_v0275_shape() {
    let key = generate_signing_key("auto");
    assert!(key.id.starts_with("auth-"));
    assert_eq!(key.secret.len(), 43);
    assert_eq!(key.source, "auto");
    assert_eq!(key.status, "active");
    assert!(key.created_at.is_some());
    assert!(key.retired_at.is_none());
    assert!(key.verify_until.is_none());
    let debug_str = format!("{key:?}");
    assert!(debug_str.contains("[REDACTED]"));
    assert!(!debug_str.contains(&key.secret));
    validate_signing_keys(&[key]).unwrap();
  }
}
