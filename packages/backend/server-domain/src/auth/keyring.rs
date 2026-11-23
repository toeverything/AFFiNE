//! Idempotent initialization and validation of `auth.session.signingKeys` in
//! `public.app_configs`, matching `v0.27.5` `auth_session/keyring.rs` 1:1.

use std::{collections::BTreeSet, fmt};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use rand::RngCore as _;
use serde::{Deserialize, Serialize};
use server_db::{ServerDb, WorkloadTier};
use server_types::DomainError;

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
