use std::collections::{BTreeMap, BTreeSet};

use serde_json::{Map, Value};
use sqlx::{PgPool, Row};

#[cfg(test)]
use super::{AppConfigFile, deserialize_app_config};
use super::{BackendRuntimeConfig, RuntimeError, RuntimeResult, ServerConfig, merge_config_value};
use crate::runtime::object_storage::{ObjectStorageService, backends_from_flat_overrides};

pub(crate) struct AppConfigChange {
  pub(crate) key: String,
  pub(crate) value: Option<Value>,
  pub(crate) native: bool,
}

pub(super) const NATIVE_APP_CONFIG_KEYS: &[&str] = &[
  "auth.allowSignup",
  "auth.allowSignupForOauth",
  "auth.newAccountActionDelay",
  "auth.requireEmailDomainVerification",
  "auth.session.ttl",
  "auth.session.ttr",
  "auth.token.accessTokenTtl",
  "auth.token.refreshAbsoluteTtl",
  "auth.token.refreshGracePeriod",
  "auth.token.refreshIdleTtl",
  "auth.token.refreshRetention",
  "copilot.byok.allowCustomEndpoint",
  "copilot.byok.allowedProviders",
  "copilot.byok.allowPrivateEndpoint",
  "copilot.byok.enabled",
  "copilot.enabled",
  "copilot.providers.profiles",
  "copilot.storage",
  "crypto.privateKey",
  // TODO(0.27.5): Remove legacy DB override loading after old instances exit and existing rows are cleared.
  "db.datasourceUrl",
  "indexer.enabled",
  "indexer.provider.apiKey",
  "indexer.provider.endpoint",
  "indexer.provider.password",
  "indexer.provider.type",
  "indexer.provider.username",
  "oauth.providers.apple",
  "oauth.providers.github",
  "oauth.providers.google",
  "oauth.providers.oidc",
  "payment.enabled",
  "payment.revenuecat",
  "payment.stripe",
  // TODO(0.27.5): Remove legacy Redis DB override loading after old instances exit and existing rows are cleared.
  "redis.db",
  "redis.host",
  "redis.ioredis",
  "redis.password",
  "redis.port",
  "redis.username",
  "storages.avatar.storage",
  "storages.blob.storage",
];

pub(super) fn is_secret_native_app_config_key(key: &str) -> bool {
  matches!(
    key,
    "copilot.providers.profiles"
      | "copilot.storage"
      | "crypto.privateKey"
      | "db.datasourceUrl"
      | "indexer.provider.apiKey"
      | "indexer.provider.password"
      | "oauth.providers.apple"
      | "oauth.providers.github"
      | "oauth.providers.google"
      | "oauth.providers.oidc"
      | "payment.revenuecat"
      | "payment.stripe"
      | "redis.ioredis"
      | "redis.password"
      | "storages.avatar.storage"
      | "storages.blob.storage"
  )
}

pub(super) fn is_static_app_config_key(key: &str) -> bool {
  key == "db.datasourceUrl" || key.starts_with("redis.")
}

pub(super) async fn load_app_config_overrides_from_db(pool: &PgPool) -> RuntimeResult<serde_json::Value> {
  let rows = match sqlx::query("SELECT id, value FROM app_configs WHERE id = ANY($1) ORDER BY id ASC")
    .bind(NATIVE_APP_CONFIG_KEYS)
    .fetch_all(pool)
    .await
  {
    Ok(rows) => rows,
    Err(sqlx::Error::Database(err)) if err.code().as_deref() == Some("42P01") => {
      return Ok(serde_json::Value::Object(Map::new()));
    }
    Err(err) => return Err(RuntimeError::database("failed to load app config overrides", err)),
  };

  Ok(app_config_value_from_flat_overrides(rows.into_iter().map(|row| {
    let id: String = row.get("id");
    let value: serde_json::Value = row.get("value");
    (id, value)
  })))
}

pub(crate) async fn save_app_config_changes(
  pool: &PgPool,
  config: &ServerConfig,
  bootstrap_private_key: Option<String>,
  actor: Option<&str>,
  changes: &[AppConfigChange],
) -> RuntimeResult<Vec<String>> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin app config update", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('app-config-paths', 0))")
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("lock app config paths", error))?;
  let rows = sqlx::query("SELECT id, value FROM app_configs ORDER BY id")
    .fetch_all(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("load app config paths", error))?;
  let mut prospective = rows
    .into_iter()
    .map(|row| (row.get::<String, _>("id"), row.get::<Value, _>("value")))
    .collect::<BTreeMap<_, _>>();
  let mut changed = BTreeSet::new();
  for change in changes {
    if is_static_app_config_key(&change.key) && change.value.is_some() {
      return Err(RuntimeError::config(
        "database and Redis connection settings are bootstrap values and cannot be changed through app_configs",
      ));
    }
    if !changed.insert(change.key.clone()) {
      return Err(RuntimeError::config(format!(
        "duplicate app config path: {}",
        change.key
      )));
    }
    if NATIVE_APP_CONFIG_KEYS.contains(&change.key.as_str()) != change.native
      || change.key == "auth.session.signingKeys"
    {
      return Err(RuntimeError::config(format!(
        "invalid app config owner: {}",
        change.key
      )));
    }
    match &change.value {
      Some(value) => {
        prospective.insert(change.key.clone(), value.clone());
      }
      None => {
        prospective.remove(&change.key);
      }
    }
  }
  let keys = prospective.keys().collect::<Vec<_>>();
  for (index, key) in keys.iter().enumerate() {
    if let Some(overlap) = keys[index + 1..]
      .iter()
      .find(|candidate| candidate.starts_with(&format!("{key}.")))
    {
      return Err(RuntimeError::config(format!(
        "app config paths must not overlap: {key} and {overlap}"
      )));
    }
  }
  let mut native = config.baseline().clone();
  merge_config_value(
    &mut native,
    app_config_value_from_flat_overrides(
      prospective
        .iter()
        .filter(|(key, _)| NATIVE_APP_CONFIG_KEYS.contains(&key.as_str()))
        .map(|(key, value)| (key.as_str(), value.clone())),
    ),
  );
  BackendRuntimeConfig::from_value(bootstrap_private_key, native.clone(), config.deployment())?;
  ObjectStorageService::from_config_value(&native)?;
  backends_from_flat_overrides(
    prospective
      .iter()
      .filter(|(key, _)| matches!(key.as_str(), "storages.blob.storage" | "storages.avatar.storage"))
      .map(|(key, value)| (key.as_str(), value.clone())),
  )?;
  for change in changes {
    match &change.value {
      Some(value) => {
        sqlx::query(
          "INSERT INTO app_configs(id,value,last_updated_by,created_at,updated_at) \
           VALUES($1,$2,$3,clock_timestamp(),clock_timestamp()) ON CONFLICT(id) DO UPDATE SET \
           value=$2,last_updated_by=$3,updated_at=clock_timestamp()",
        )
        .bind(&change.key)
        .bind(value)
        .bind(actor)
        .execute(&mut *transaction)
        .await
        .map_err(|error| RuntimeError::database("write app config", error))?;
      }
      None => {
        sqlx::query("DELETE FROM app_configs WHERE id=$1")
          .bind(&change.key)
          .execute(&mut *transaction)
          .await
          .map_err(|error| RuntimeError::database("clear app config", error))?;
      }
    }
  }
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit app config update", error))?;
  Ok(changed.into_iter().collect())
}

#[cfg(test)]
pub(super) fn app_config_from_flat_overrides<I, S>(rows: I) -> RuntimeResult<AppConfigFile>
where
  I: IntoIterator<Item = (S, serde_json::Value)>,
  S: AsRef<str>,
{
  deserialize_app_config(app_config_value_from_flat_overrides(rows))
}

pub(super) fn app_config_value_from_flat_overrides<I, S>(rows: I) -> serde_json::Value
where
  I: IntoIterator<Item = (S, serde_json::Value)>,
  S: AsRef<str>,
{
  let mut root = Map::new();
  let mut rows = rows.into_iter().collect::<Vec<_>>();
  rows.sort_by(|(left, _), (right, _)| left.as_ref().cmp(right.as_ref()));
  for (path, value) in rows {
    insert_flat_override(&mut root, path.as_ref(), value);
  }

  serde_json::Value::Object(root)
}

pub(in crate::runtime) fn insert_flat_override(
  root: &mut Map<String, serde_json::Value>,
  path: &str,
  value: serde_json::Value,
) {
  let mut parts = path.split('.').peekable();
  let mut current = root;
  while let Some(part) = parts.next() {
    if parts.peek().is_none() {
      current.insert(part.to_string(), value);
      return;
    }
    let entry = current
      .entry(part.to_string())
      .or_insert_with(|| serde_json::Value::Object(Map::new()));
    if !entry.is_object() {
      *entry = serde_json::Value::Object(Map::new());
    }
    current = entry.as_object_mut().expect("override node must be an object");
  }
}

#[cfg(test)]
mod tests {
  use sqlx::postgres::PgPoolOptions;

  use super::{AppConfigChange, ServerConfig, load_app_config_overrides_from_db, save_app_config_changes};

  #[tokio::test]
  async fn reads_only_native_app_config_keys() {
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPoolOptions::new()
      .max_connections(1)
      .connect(&database_url)
      .await
      .unwrap();
    sqlx::query("CREATE TEMP TABLE app_configs (id text PRIMARY KEY, value jsonb NOT NULL)")
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("INSERT INTO app_configs (id, value) VALUES ($1, $2), ($3, $4)")
      .bind("copilot.enabled")
      .bind(serde_json::json!(false))
      .bind("server.name")
      .bind(serde_json::json!("node-only"))
      .execute(&pool)
      .await
      .unwrap();

    let overrides = load_app_config_overrides_from_db(&pool).await.unwrap();
    assert_eq!(overrides, serde_json::json!({ "copilot": { "enabled": false } }));
  }

  #[tokio::test]
  async fn app_config_set_clear_and_failed_batch_are_atomic() {
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPoolOptions::new()
      .max_connections(1)
      .connect(&database_url)
      .await
      .unwrap();
    sqlx::query(
      "CREATE TEMP TABLE app_configs (id text PRIMARY KEY, value jsonb NOT NULL, last_updated_by text, created_at \
       timestamptz DEFAULT clock_timestamp(), updated_at timestamptz DEFAULT clock_timestamp(), CONSTRAINT \
       fail_second CHECK (id <> 'server.second'))",
    )
    .execute(&pool)
    .await
    .unwrap();
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("config.json");
    std::fs::write(&path, r#"{"deployment":{"type":"cloud"},"copilot":{"enabled":false}}"#).unwrap();
    let config = ServerConfig::open(&path, None).unwrap();
    let node = |key: &str, value| AppConfigChange {
      key: key.to_string(),
      value,
      native: false,
    };
    let native = |key: &str, value| AppConfigChange {
      key: key.to_string(),
      value,
      native: true,
    };
    save_app_config_changes(
      &pool,
      &config,
      None,
      None,
      &[
        node("server.name", Some(serde_json::json!("configured"))),
        native("copilot.enabled", Some(serde_json::json!(false))),
      ],
    )
    .await
    .unwrap();
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT count(*) FROM app_configs")
        .fetch_one(&pool)
        .await
        .unwrap(),
      2
    );
    save_app_config_changes(
      &pool,
      &config,
      None,
      None,
      &[node("server.name", None), native("copilot.enabled", None)],
    )
    .await
    .unwrap();
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT count(*) FROM app_configs")
        .fetch_one(&pool)
        .await
        .unwrap(),
      0
    );
    assert!(
      save_app_config_changes(
        &pool,
        &config,
        None,
        None,
        &[
          node("server.first", Some(serde_json::json!(true))),
          node("server.second", Some(serde_json::json!(true))),
        ],
      )
      .await
      .is_err()
    );
    assert!(
      save_app_config_changes(
        &pool,
        &config,
        None,
        None,
        &[native("redis.host", Some(serde_json::json!("redis.example")))],
      )
      .await
      .is_err()
    );
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT count(*) FROM app_configs")
        .fetch_one(&pool)
        .await
        .unwrap(),
      0
    );
    assert!(
      save_app_config_changes(&pool, &config, None, None, &[node("copilot.enabled", None)])
        .await
        .is_err()
    );
    assert!(
      save_app_config_changes(
        &pool,
        &config,
        None,
        None,
        &[native(
          "db.datasourceUrl",
          Some(serde_json::json!("postgresql://unreachable"))
        )],
      )
      .await
      .is_err()
    );
    assert!(
      save_app_config_changes(
        &pool,
        &config,
        None,
        None,
        &[native(
          "storages.blob.storage",
          Some(serde_json::json!({"provider":"invalid","bucket":"blobs","config":{}}))
        )],
      )
      .await
      .is_err()
    );
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT count(*) FROM app_configs")
        .fetch_one(&pool)
        .await
        .unwrap(),
      0
    );
  }
}
