use std::{
  collections::BTreeMap,
  env, fs,
  path::{Path, PathBuf},
  sync::Arc,
};

use llm_adapter::capability::provider_default_capability_upper_bound;
use serde::Deserialize;
use serde_json::Map;
use sqlx::{PgPool, Row};
use zeroize::Zeroizing;

use super::{RuntimeError, RuntimeResult};

pub(crate) struct BackendRuntimeConfig {
  pub(crate) database_url: String,
  pub(crate) invite_quota: InviteQuotaConfig,
  pub(crate) private_key: Arc<Zeroizing<String>>,
  pub(crate) copilot: CopilotRuntimeConfig,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotRuntimeConfig {
  pub(crate) enabled: bool,
  pub(crate) byok: CopilotByokRuntimeConfig,
  pub(crate) providers: CopilotProvidersRuntimeConfig,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotByokRuntimeConfig {
  pub(crate) enabled: bool,
  pub(crate) allow_custom_endpoint: bool,
  pub(crate) allow_private_endpoint: bool,
}

impl Default for CopilotByokRuntimeConfig {
  fn default() -> Self {
    Self {
      enabled: true,
      allow_custom_endpoint: false,
      allow_private_endpoint: false,
    }
  }
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotProvidersRuntimeConfig {
  pub(crate) profiles: Vec<CopilotManagedProfileConfig>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CopilotManagedProfileConfig {
  pub(crate) id: String,
  #[serde(rename = "type")]
  pub(crate) provider: String,
  #[serde(default = "enabled_by_default")]
  pub(crate) enabled: bool,
  #[serde(default)]
  pub(crate) models: Vec<String>,
  pub(crate) config: serde_json::Value,
}

fn enabled_by_default() -> bool {
  true
}

#[derive(Clone, Debug)]
pub(crate) struct InviteQuotaConfig {
  pub(crate) high_risk_target_domains: Vec<String>,
  pub(crate) subject_hash_salt: String,
  pub(crate) mail_class_mapping: BTreeMap<String, String>,
}

impl Default for InviteQuotaConfig {
  fn default() -> Self {
    Self {
      high_risk_target_domains: [
        "qq.com",
        "proton.me",
        "protonmail.com",
        "163.com",
        "126.com",
        "outlook.com",
        "hotmail.com",
      ]
      .into_iter()
      .map(str::to_string)
      .collect(),
      subject_hash_salt: "affine-runtime-invite-quota-v1-local".to_string(),
      mail_class_mapping: default_mail_class_mapping(),
    }
  }
}

impl BackendRuntimeConfig {
  pub(crate) fn from_config_files(private_key: Option<String>) -> RuntimeResult<Self> {
    let app_config = app_config_from_config_files()?;
    let database_url = database_url_from_env()
      .or(app_config.database_url())
      .unwrap_or_else(|| "postgresql://localhost:5432/affine".to_string());
    Self {
      database_url,
      invite_quota: app_config.invite_quota_config(),
      private_key: Arc::new(Zeroizing::new(
        private_key
          .filter(|key| !key.trim().is_empty())
          .or_else(private_key_from_env)
          .or_else(|| app_config.crypto.as_ref().and_then(|crypto| crypto.private_key.clone()))
          .unwrap_or_default(),
      )),
      copilot: app_config.copilot.unwrap_or_default(),
    }
    .validated()
  }

  pub(crate) async fn with_db_overrides(&self, pool: &PgPool) -> RuntimeResult<Self> {
    let app_config_value = app_config_value_from_config_files()?;
    let db_overrides = load_app_config_overrides_from_db(pool).await?;
    self.apply_db_overrides(app_config_value, db_overrides)
  }

  fn apply_db_overrides(
    &self,
    mut app_config_value: serde_json::Value,
    db_overrides: serde_json::Value,
  ) -> RuntimeResult<Self> {
    let db_private_key = db_overrides
      .pointer("/crypto/privateKey")
      .and_then(serde_json::Value::as_str)
      .map(str::to_string)
      .and_then(non_empty_string);
    merge_config_value(&mut app_config_value, db_overrides);
    let app_config = deserialize_app_config(app_config_value)?;
    Self {
      // The DB override is loaded after this connection already exists, so it
      // must not rewrite the active datasource URL.
      database_url: self.database_url.clone(),
      invite_quota: app_config.invite_quota_config(),
      private_key: db_private_key
        .map(|key| Arc::new(Zeroizing::new(key)))
        .unwrap_or_else(|| Arc::clone(&self.private_key)),
      copilot: app_config.copilot.unwrap_or_else(|| self.copilot.clone()),
    }
    .validated()
  }

  fn validated(self) -> RuntimeResult<Self> {
    if self.copilot.enabled && self.copilot.byok.enabled && self.private_key.is_empty() {
      return Err(RuntimeError::invalid_state(
        "stable crypto.privateKey is required when persistent BYOK is enabled",
      ));
    }
    validate_copilot_config(&self.copilot)?;
    Ok(self)
  }
}

fn validate_copilot_config(config: &CopilotRuntimeConfig) -> RuntimeResult<()> {
  let mut profile_ids = std::collections::HashSet::new();
  for profile in &config.providers.profiles {
    if profile.id.trim().is_empty() || !profile_ids.insert(profile.id.as_str()) {
      return Err(RuntimeError::invalid_state(
        "managed copilot profile ids must be non-empty and unique",
      ));
    }
    if profile.provider.trim().is_empty() {
      return Err(RuntimeError::invalid_state(
        "managed copilot profile provider is required",
      ));
    }
    if profile.models.is_empty() {
      return Err(RuntimeError::invalid_state(
        "managed copilot profile models must be non-empty",
      ));
    }
    let mut models = std::collections::HashSet::new();
    for model in &profile.models {
      if model.trim().is_empty() || !models.insert(model.as_str()) {
        return Err(RuntimeError::invalid_state(
          "managed copilot profile models must be non-empty and unique",
        ));
      }
      provider_default_capability_upper_bound(&profile.provider, model)
        .ok_or_else(|| RuntimeError::invalid_state("managed copilot profile model is unsupported"))?;
    }
  }
  Ok(())
}

#[derive(Default, Deserialize)]
struct AppConfigFile {
  db: Option<DbConfigFile>,
  crypto: Option<CryptoConfigFile>,
  copilot: Option<CopilotRuntimeConfig>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CryptoConfigFile {
  private_key: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbConfigFile {
  datasource_url: Option<String>,
}

impl AppConfigFile {
  fn database_url(&self) -> Option<String> {
    self
      .db
      .as_ref()
      .and_then(|db| db.datasource_url.clone())
      .and_then(non_empty_string)
  }

  fn invite_quota_config(&self) -> InviteQuotaConfig {
    InviteQuotaConfig::default()
  }
}

fn database_url_from_env() -> Option<String> {
  env::var("DATABASE_URL").ok().and_then(non_empty_string)
}

fn private_key_from_env() -> Option<String> {
  env::var("AFFINE_PRIVATE_KEY").ok().and_then(non_empty_string)
}

fn non_empty_string(value: String) -> Option<String> {
  if value.trim().is_empty() { None } else { Some(value) }
}

fn app_config_from_config_files() -> RuntimeResult<AppConfigFile> {
  deserialize_app_config(app_config_value_from_config_files()?)
}

fn app_config_value_from_config_files() -> RuntimeResult<serde_json::Value> {
  let mut merged = serde_json::Value::Object(Map::new());
  for path in config_json_paths() {
    if !path.exists() {
      continue;
    }
    let raw = fs::read_to_string(&path).map_err(|err| RuntimeError::io("failed to read config file", err))?;
    let value = serde_json::from_str(&raw).map_err(|err| RuntimeError::json("failed to parse config file", err))?;
    merge_config_value(&mut merged, expand_module_config_paths(value));
  }

  Ok(merged)
}

fn expand_module_config_paths(mut value: serde_json::Value) -> serde_json::Value {
  if let Some(root) = value.as_object_mut() {
    for module in root.values_mut().filter_map(serde_json::Value::as_object_mut) {
      let entries = std::mem::take(module);
      for (path, value) in entries {
        insert_flat_override(module, &path, value);
      }
    }
  }

  value
}

#[cfg(test)]
fn app_config_from_module_json(value: serde_json::Value) -> RuntimeResult<AppConfigFile> {
  deserialize_app_config(expand_module_config_paths(value))
}

fn deserialize_app_config(value: serde_json::Value) -> RuntimeResult<AppConfigFile> {
  serde_json::from_value(value).map_err(|err| RuntimeError::json("failed to parse config file", err))
}

fn merge_config_value(base: &mut serde_json::Value, overrides: serde_json::Value) {
  match (base, overrides) {
    (serde_json::Value::Object(base), serde_json::Value::Object(overrides)) => {
      for (key, value) in overrides {
        if let Some(existing) = base.get_mut(&key) {
          merge_config_value(existing, value);
        } else {
          base.insert(key, value);
        }
      }
    }
    (base, overrides) => *base = overrides,
  }
}

fn default_mail_class_mapping() -> BTreeMap<String, String> {
  [
    ("SignIn", "auth"),
    ("SignUp", "auth"),
    ("SetPassword", "auth"),
    ("ChangePassword", "auth"),
    ("VerifyEmail", "auth"),
    ("ChangeEmail", "auth"),
    ("VerifyChangeEmail", "auth"),
    ("EmailChanged", "auth"),
    ("MemberInvitation", "workspace_invitation"),
    ("Mention", "collaboration_notice"),
    ("Comment", "collaboration_notice"),
    ("CommentMention", "collaboration_notice"),
    ("MemberAccepted", "collaboration_notice"),
    ("LinkInvitationReviewRequest", "collaboration_notice"),
    ("LinkInvitationApprove", "collaboration_notice"),
    ("LinkInvitationDecline", "collaboration_notice"),
    ("MemberLeave", "workspace_lifecycle"),
    ("MemberRemoved", "workspace_lifecycle"),
    ("OwnershipTransferred", "workspace_lifecycle"),
    ("OwnershipReceived", "workspace_lifecycle"),
    ("TeamWorkspaceUpgraded", "workspace_lifecycle"),
    ("TeamBecomeAdmin", "workspace_lifecycle"),
    ("TeamBecomeCollaborator", "workspace_lifecycle"),
    ("TeamDeleteIn24Hours", "workspace_lifecycle"),
    ("TeamDeleteInOneMonth", "workspace_lifecycle"),
    ("TeamWorkspaceDeleted", "workspace_lifecycle"),
    ("TeamWorkspaceExpireSoon", "workspace_lifecycle"),
    ("TeamWorkspaceExpired", "workspace_lifecycle"),
    ("TeamLicense", "billing_license"),
  ]
  .into_iter()
  .map(|(mail_name, class)| (mail_name.to_string(), class.to_string()))
  .collect()
}

async fn load_app_config_overrides_from_db(pool: &PgPool) -> RuntimeResult<serde_json::Value> {
  let rows = match sqlx::query("SELECT id, value FROM app_configs ORDER BY id ASC")
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

#[cfg(test)]
fn app_config_from_flat_overrides<I, S>(rows: I) -> RuntimeResult<AppConfigFile>
where
  I: IntoIterator<Item = (S, serde_json::Value)>,
  S: AsRef<str>,
{
  deserialize_app_config(app_config_value_from_flat_overrides(rows))
}

fn app_config_value_from_flat_overrides<I, S>(rows: I) -> serde_json::Value
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

fn insert_flat_override(root: &mut Map<String, serde_json::Value>, path: &str, value: serde_json::Value) {
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

pub(super) fn config_json_paths() -> Vec<PathBuf> {
  let mut paths = Vec::new();
  if let Ok(exe) = env::current_exe()
    && let Some(dir) = exe.parent()
  {
    paths.push(config_in(dir));
  }
  if let Ok(cwd) = env::current_dir() {
    paths.push(config_in(&cwd));
  }
  dedupe_paths(paths)
}

fn config_in(dir: &Path) -> PathBuf {
  dir.join("config.json")
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
  let mut deduped = Vec::new();
  for path in paths {
    if !deduped.contains(&path) {
      deduped.push(path);
    }
  }
  deduped
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn config_paths_are_limited_to_executable_dir_and_cwd() {
    let paths = config_json_paths();
    assert!(!paths.is_empty());
    assert!(paths.len() <= 2);
    assert!(
      paths
        .iter()
        .all(|path| path.file_name().is_some_and(|name| name == "config.json"))
    );
    assert!(paths.iter().all(|path| !path.to_string_lossy().contains(".affine")));
    assert!(
      paths
        .iter()
        .all(|path| !path.to_string_lossy().contains("packages/backend/server"))
    );
  }

  #[test]
  fn blank_database_urls_are_ignored() {
    assert_eq!(non_empty_string("".to_string()), None);
    assert_eq!(non_empty_string("   ".to_string()), None);
    assert_eq!(
      non_empty_string("postgresql://affine:affine@localhost:5432/affine".to_string()),
      Some("postgresql://affine:affine@localhost:5432/affine".to_string())
    );
  }

  #[test]
  fn ignores_storage_app_config_values() {
    let app_config = app_config_from_flat_overrides([
      (
        "storages.blob.storage",
        serde_json::json!({"provider": "cloudflare-r2"}),
      ),
      ("db.datasourceUrl", serde_json::json!("postgresql://example/runtime")),
    ])
    .unwrap();

    assert_eq!(
      app_config.database_url().as_deref(),
      Some("postgresql://example/runtime")
    );
  }

  #[test]
  fn expands_module_config_paths_from_json_files() {
    let app_config = app_config_from_module_json(serde_json::json!({
      "copilot": {
        "enabled": true,
        "byok.enabled": false,
        "providers.profiles": [{
          "id": "managed-openai",
          "type": "openai",
          "models": ["gpt-5.6-luna"],
          "config": { "apiKey": "test" }
        }]
      }
    }))
    .unwrap();
    let copilot = app_config.copilot.unwrap();

    assert!(copilot.enabled);
    assert!(!copilot.byok.enabled);
    assert_eq!(copilot.providers.profiles.len(), 1);
    assert_eq!(copilot.providers.profiles[0].id, "managed-openai");
  }

  #[test]
  fn partial_database_config_preserves_file_config_siblings() {
    let mut file_config = expand_module_config_paths(serde_json::json!({
      "copilot": {
        "enabled": true,
        "byok": { "enabled": true, "allowCustomEndpoint": true },
        "providers": {
          "profiles": [{
            "id": "managed-openai",
            "type": "openai",
            "models": ["gpt-5.6-luna"],
            "config": { "apiKey": "test" }
          }]
        }
      }
    }));
    let database_config = app_config_value_from_flat_overrides([("copilot.byok.enabled", serde_json::json!(false))]);

    merge_config_value(&mut file_config, database_config);
    let copilot = deserialize_app_config(file_config).unwrap().copilot.unwrap();

    assert!(copilot.enabled);
    assert!(!copilot.byok.enabled);
    assert!(copilot.byok.allow_custom_endpoint);
    assert_eq!(copilot.providers.profiles.len(), 1);
    assert_eq!(copilot.providers.profiles[0].id, "managed-openai");
  }

  #[test]
  fn nested_database_config_overrides_are_order_independent() {
    let app_config = app_config_from_flat_overrides([
      ("copilot.byok.enabled", serde_json::json!(false)),
      (
        "copilot.byok",
        serde_json::json!({ "enabled": true, "allowCustomEndpoint": true }),
      ),
    ])
    .unwrap();
    let byok = app_config.copilot.unwrap().byok;

    assert!(!byok.enabled);
    assert!(byok.allow_custom_endpoint);
  }

  #[test]
  fn database_config_only_replaces_an_active_private_key_explicitly() {
    let active = BackendRuntimeConfig {
      database_url: "postgresql://active".to_string(),
      invite_quota: InviteQuotaConfig::default(),
      private_key: Arc::new(Zeroizing::new("active-private-key".to_string())),
      copilot: CopilotRuntimeConfig::default(),
    };
    let empty = serde_json::Value::Object(Map::new());

    let unchanged = active.apply_db_overrides(empty.clone(), empty.clone()).unwrap();
    assert_eq!(unchanged.private_key.as_str(), "active-private-key");

    let overridden = active
      .apply_db_overrides(
        empty,
        app_config_value_from_flat_overrides([("crypto.privateKey", serde_json::json!("database-private-key"))]),
      )
      .unwrap();
    assert_eq!(overridden.private_key.as_str(), "database-private-key");
  }

  #[test]
  fn invite_quota_policy_is_internal_not_app_configurable() {
    let app_config = app_config_from_flat_overrides([
      ("auth.untrustedPolicyOverride", serde_json::json!("runtime-salt-v2")),
      ("auth.untrustedDomainList", serde_json::json!(["Example.COM."])),
    ])
    .unwrap();

    let config = app_config.invite_quota_config();
    assert!(!config.high_risk_target_domains.contains(&"example.com".to_string()));
    assert_ne!(config.subject_hash_salt, "runtime-salt-v2");
    assert_eq!(
      config.mail_class_mapping.get("MemberInvitation").map(String::as_str),
      Some("workspace_invitation")
    );
  }
}
