use affine_core::auth::{
  SigningKeyState, signing_key_can_delete, signing_key_can_verify, signing_key_minimum_verify_seconds,
  signing_key_verify_until, signing_key_window_valid,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sqlx::{PgConnection, PgPool};

use super::{RuntimeError, RuntimeResult};

const STORE_ID: &str = "auth.session.signingKeys";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredKey {
  id: String,
  secret: String,
  status: String,
  created_at: Option<DateTime<Utc>>,
  source: String,
  retired_at: Option<DateTime<Utc>>,
  verify_until: Option<DateTime<Utc>>,
}

pub(super) struct SigningKey {
  pub(super) id: String,
  pub(super) secret: Vec<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SigningKeyMetadata {
  id: String,
  status: String,
  created_at: Option<DateTime<Utc>>,
  source: String,
  retired_at: Option<DateTime<Utc>>,
  verify_until: Option<DateTime<Utc>>,
  can_delete: bool,
}

pub(super) async fn initialize(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
) -> RuntimeResult<Vec<SigningKeyMetadata>> {
  insert_if_missing(pool).await?;
  load_metadata(pool, config).await
}

async fn insert_if_missing(pool: &PgPool) -> RuntimeResult<()> {
  let initial = serde_json::to_value(vec![generate("auto")])
    .map_err(|error| RuntimeError::json("encode initial auth signing key", error))?;
  sqlx::query(
    "INSERT INTO app_configs(id,value,created_at,updated_at) VALUES($1,$2,clock_timestamp(),clock_timestamp()) ON \
     CONFLICT DO NOTHING",
  )
  .bind(STORE_ID)
  .bind(initial)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("initialize auth signing keyring", error))?;
  Ok(())
}

pub(super) async fn metadata(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
) -> RuntimeResult<Vec<SigningKeyMetadata>> {
  insert_if_missing(pool).await?;
  load_metadata(pool, config).await
}

async fn load_metadata(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
) -> RuntimeResult<Vec<SigningKeyMetadata>> {
  let value: serde_json::Value = sqlx::query_scalar("SELECT value FROM app_configs WHERE id=$1")
    .bind(STORE_ID)
    .fetch_one(pool)
    .await
    .map_err(|error| RuntimeError::database("load auth signing keyring", error))?;
  metadata_from_keys(parse(value, minimum_verify_seconds(config))?, Utc::now(), config)
}

pub(super) async fn active(
  connection: &mut PgConnection,
  config: &super::super::BackendRuntimeConfig,
) -> RuntimeResult<SigningKey> {
  let keys = load(connection, config).await?;
  let key = keys
    .into_iter()
    .find(|key| key.status == "active")
    .ok_or_else(|| RuntimeError::invalid_state("auth signing keyring has no active key"))?;
  decode_key(key)
}

pub(super) async fn verify(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  id: &str,
  now: DateTime<Utc>,
) -> RuntimeResult<Option<SigningKey>> {
  initialize_if_missing(pool).await?;
  let value: serde_json::Value = sqlx::query_scalar("SELECT value FROM app_configs WHERE id=$1")
    .bind(STORE_ID)
    .fetch_one(pool)
    .await
    .map_err(|error| RuntimeError::database("load auth signing keyring", error))?;
  parse(value, minimum_verify_seconds(config))?
    .into_iter()
    .find(|key| {
      key.id == id && key_state(&key.status).is_some_and(|state| signing_key_can_verify(state, key.verify_until, now))
    })
    .map(decode_key)
    .transpose()
}

pub(super) async fn rotate(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  actor_id: &str,
  expected_active_key_id: &str,
) -> RuntimeResult<Vec<SigningKeyMetadata>> {
  initialize_if_missing(pool).await?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin auth signing key rotation", error))?;
  lock_actor(&mut tx, actor_id).await?;
  let mut keys = lock_keys(&mut tx, config).await?;
  let now = decision_time(&mut tx).await?;
  let active = keys
    .iter_mut()
    .find(|key| key.status == "active")
    .ok_or_else(|| RuntimeError::invalid_state("auth signing keyring has no active key"))?;
  if active.id != expected_active_key_id {
    return Err(RuntimeError::invalid_state("auth signing key changed"));
  }
  active.status = "retiring".to_string();
  active.retired_at = Some(now);
  active.verify_until = Some(signing_key_verify_until(now, config.auth.access_token_ttl_seconds));
  keys.push(generate("admin"));
  validate(&keys, minimum_verify_seconds(config))?;
  save(&mut tx, actor_id, &keys).await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit auth signing key rotation", error))?;
  metadata_from_keys(keys, now, config)
}

pub(super) async fn delete(
  pool: &PgPool,
  config: &super::super::BackendRuntimeConfig,
  actor_id: &str,
  key_id: &str,
) -> RuntimeResult<Vec<SigningKeyMetadata>> {
  initialize_if_missing(pool).await?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin auth signing key deletion", error))?;
  lock_actor(&mut tx, actor_id).await?;
  let mut keys = lock_keys(&mut tx, config).await?;
  let now = decision_time(&mut tx).await?;
  let key = keys
    .iter()
    .find(|key| key.id == key_id)
    .ok_or_else(|| RuntimeError::invalid_state("auth signing key does not exist"))?;
  if !key_state(&key.status).is_some_and(|state| signing_key_can_delete(state, key.verify_until, now)) {
    return Err(RuntimeError::invalid_state("auth signing key cannot be deleted"));
  }
  keys.retain(|key| key.id != key_id);
  validate(&keys, minimum_verify_seconds(config))?;
  save(&mut tx, actor_id, &keys).await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit auth signing key deletion", error))?;
  metadata_from_keys(keys, now, config)
}

async fn initialize_if_missing(pool: &PgPool) -> RuntimeResult<()> {
  let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM app_configs WHERE id=$1)")
    .bind(STORE_ID)
    .fetch_one(pool)
    .await
    .map_err(|error| RuntimeError::database("check auth signing keyring", error))?;
  if !exists {
    insert_if_missing(pool).await?;
  }
  Ok(())
}

async fn load(
  connection: &mut PgConnection,
  config: &super::super::BackendRuntimeConfig,
) -> RuntimeResult<Vec<StoredKey>> {
  let value: serde_json::Value = sqlx::query_scalar("SELECT value FROM app_configs WHERE id=$1")
    .bind(STORE_ID)
    .fetch_one(connection)
    .await
    .map_err(|error| RuntimeError::database("load auth signing keyring", error))?;
  parse(value, minimum_verify_seconds(config))
}

async fn lock_keys(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  config: &super::super::BackendRuntimeConfig,
) -> RuntimeResult<Vec<StoredKey>> {
  let value: serde_json::Value = sqlx::query_scalar("SELECT value FROM app_configs WHERE id=$1 FOR UPDATE")
    .bind(STORE_ID)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock auth signing keyring", error))?;
  parse(value, minimum_verify_seconds(config))
}

async fn lock_actor(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>, actor_id: &str) -> RuntimeResult<()> {
  let actor = sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE id=$1 FOR UPDATE")
    .bind(actor_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock auth signing key actor", error))?;
  if actor.is_none() {
    return Err(RuntimeError::invalid_state("auth signing key actor does not exist"));
  }
  Ok(())
}

async fn decision_time(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> RuntimeResult<DateTime<Utc>> {
  sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("load auth signing key decision time", error))
}

async fn save(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>, actor_id: &str, keys: &[StoredKey]) -> RuntimeResult<()> {
  let value = serde_json::to_value(keys).map_err(|error| RuntimeError::json("encode auth signing keyring", error))?;
  sqlx::query("UPDATE app_configs SET value=$2,last_updated_by=$3,updated_at=clock_timestamp() WHERE id=$1")
    .bind(STORE_ID)
    .bind(value)
    .bind(actor_id)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("save auth signing keyring", error))?;
  Ok(())
}

fn parse(value: serde_json::Value, minimum_verify_seconds: i64) -> RuntimeResult<Vec<StoredKey>> {
  let keys: Vec<StoredKey> =
    serde_json::from_value(value).map_err(|error| RuntimeError::json("decode auth signing keyring", error))?;
  validate(&keys, minimum_verify_seconds)?;
  Ok(keys)
}

fn validate(keys: &[StoredKey], minimum_verify_seconds: i64) -> RuntimeResult<()> {
  let mut ids = std::collections::BTreeSet::new();
  if keys.iter().filter(|key| key.status == "active").count() != 1 {
    return Err(RuntimeError::invalid_state(
      "auth signing keyring requires exactly one active key",
    ));
  }
  for key in keys {
    if key.id.is_empty()
      || key.id.len() > 128
      || !key
        .id
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
      || !ids.insert(key.id.as_str())
      || !matches!(key.source.as_str(), "auto" | "admin")
      || key_state(&key.status).is_none()
    {
      return Err(RuntimeError::invalid_state("auth signing keyring is invalid"));
    }
    let secret = URL_SAFE_NO_PAD
      .decode(&key.secret)
      .map_err(|_| RuntimeError::invalid_state("auth signing key secret is invalid"))?;
    if secret.len() < 32 || URL_SAFE_NO_PAD.encode(&secret) != key.secret {
      return Err(RuntimeError::invalid_state("auth signing key secret is invalid"));
    }
    if !signing_key_window_valid(
      key_state(&key.status).expect("status was validated"),
      key.retired_at,
      key.verify_until,
      minimum_verify_seconds,
    ) {
      return Err(RuntimeError::invalid_state("auth signing key lifecycle is invalid"));
    }
  }
  Ok(())
}

fn decode_key(key: StoredKey) -> RuntimeResult<SigningKey> {
  let secret = URL_SAFE_NO_PAD
    .decode(key.secret)
    .map_err(|_| RuntimeError::invalid_state("auth signing key secret is invalid"))?;
  Ok(SigningKey { id: key.id, secret })
}

fn metadata_from_keys(
  keys: Vec<StoredKey>,
  now: DateTime<Utc>,
  config: &super::super::BackendRuntimeConfig,
) -> RuntimeResult<Vec<SigningKeyMetadata>> {
  validate(&keys, minimum_verify_seconds(config))?;
  Ok(
    keys
      .into_iter()
      .map(|key| SigningKeyMetadata {
        id: key.id,
        status: key.status.clone(),
        created_at: key.created_at,
        source: key.source,
        retired_at: key.retired_at,
        verify_until: key.verify_until,
        can_delete: key_state(&key.status).is_some_and(|state| signing_key_can_delete(state, key.verify_until, now)),
      })
      .collect(),
  )
}

fn minimum_verify_seconds(config: &super::super::BackendRuntimeConfig) -> i64 {
  signing_key_minimum_verify_seconds(config.auth.access_token_ttl_seconds)
}

fn key_state(status: &str) -> Option<SigningKeyState> {
  match status {
    "active" => Some(SigningKeyState::Active),
    "retiring" => Some(SigningKeyState::Retiring),
    _ => None,
  }
}

fn generate(source: &str) -> StoredKey {
  let mut suffix = [0_u8; 6];
  let mut secret = [0_u8; 32];
  rand::rng().fill_bytes(&mut suffix);
  rand::rng().fill_bytes(&mut secret);
  StoredKey {
    id: format!(
      "auth-{}-{}",
      Utc::now().timestamp_millis(),
      URL_SAFE_NO_PAD.encode(suffix)
    ),
    secret: URL_SAFE_NO_PAD.encode(secret),
    status: "active".to_string(),
    created_at: Some(Utc::now()),
    source: source.to_string(),
    retired_at: None,
    verify_until: None,
  }
}
