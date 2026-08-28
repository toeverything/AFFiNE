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
use crate::llm::{Deployment, byok::ByokPolicy};

pub(crate) struct BackendRuntimeConfig {
  pub(crate) database_url: String,
  pub(crate) invite_quota: InviteQuotaConfig,
  pub(crate) private_key: Arc<Zeroizing<String>>,
  pub(crate) deployment: Deployment,
  pub(crate) copilot: CopilotRuntimeConfig,
  pub(crate) search: SearchRuntimeConfig,
}

#[derive(Clone, Debug)]
pub(crate) struct SearchRuntimeConfig {
  pub(crate) enabled: bool,
  pub(crate) provider: String,
  pub(crate) endpoint: String,
  pub(crate) api_key: String,
  pub(crate) username: String,
  pub(crate) password: String,
}

impl Default for SearchRuntimeConfig {
  fn default() -> Self {
    Self {
      enabled: false,
      provider: "embedded".to_string(),
      endpoint: String::new(),
      api_key: String::new(),
      username: String::new(),
      password: String::new(),
    }
  }
}

#[derive(Clone, Debug)]
pub(crate) struct ConfigSource {
  exact_paths: Option<Vec<PathBuf>>,
  override_path: Option<PathBuf>,
}

impl Default for ConfigSource {
  fn default() -> Self {
    Self::new(None)
  }
}

impl ConfigSource {
  pub(crate) fn new(exact_paths: Option<Vec<String>>) -> Self {
    let override_path = exact_paths
      .is_none()
      .then(|| env::var("AFFINE_BACKEND_RUNTIME_CONFIG_PATH").ok())
      .flatten()
      .and_then(non_empty_string)
      .map(PathBuf::from);
    Self {
      exact_paths: exact_paths.map(|paths| {
        dedupe_paths(
          paths
            .into_iter()
            .filter(|path| !path.trim().is_empty())
            .map(PathBuf::from)
            .collect(),
        )
      }),
      override_path,
    }
  }

  pub(crate) fn paths(&self) -> Vec<PathBuf> {
    if let Some(paths) = &self.exact_paths {
      return paths.clone();
    }
    let mut paths = config_json_paths();
    if let Some(path) = &self.override_path {
      paths.push(path.clone());
    }
    dedupe_paths(paths)
  }

  pub(crate) fn exact(&self) -> bool {
    self.exact_paths.is_some()
  }

  pub(crate) fn required(&self, path: &Path) -> bool {
    self.exact() || self.override_path.as_deref() == Some(path)
  }
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotRuntimeConfig {
  pub(crate) enabled: bool,
  pub(crate) byok: CopilotByokRuntimeConfig,
  pub(crate) providers: CopilotProvidersRuntimeConfig,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotByokRuntimeConfig {
  pub(crate) enabled: bool,
  #[serde(default = "default_allowed_providers")]
  pub(crate) allowed_providers: Vec<String>,
  pub(crate) allow_custom_endpoint: bool,
  pub(crate) allow_private_endpoint: bool,
}

impl Default for CopilotByokRuntimeConfig {
  fn default() -> Self {
    Self {
      enabled: true,
      allowed_providers: default_allowed_providers(),
      allow_custom_endpoint: false,
      allow_private_endpoint: false,
    }
  }
}

pub(super) const SUPPORTED_BYOK_PROVIDERS: [&str; 4] = ["openai", "anthropic", "gemini", "fal"];

fn default_allowed_providers() -> Vec<String> {
  SUPPORTED_BYOK_PROVIDERS.into_iter().map(str::to_string).collect()
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

#[derive(Clone, Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotRuntimeConfigFile {
  pub(super) enabled: bool,
  pub(super) byok: CopilotByokRuntimeConfig,
  pub(super) providers: CopilotProvidersRuntimeConfigFile,
}

#[derive(Clone, Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct CopilotProvidersRuntimeConfigFile {
  pub(super) profiles: Vec<CopilotManagedProfileConfigFile>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CopilotManagedProfileConfigFile {
  id: String,
  #[serde(rename = "type")]
  provider: CopilotManagedProvider,
  display_name: Option<String>,
  priority: Option<f64>,
  #[serde(default = "enabled_by_default")]
  enabled: bool,
  models: Vec<String>,
  middleware: Option<CopilotProviderMiddlewareConfigFile>,
  config: Map<String, serde_json::Value>,
}

#[derive(Clone, Copy, Deserialize, serde::Serialize, schemars::JsonSchema)]
enum CopilotManagedProvider {
  #[serde(rename = "anthropic")]
  Anthropic,
  #[serde(rename = "anthropicVertex")]
  AnthropicVertex,
  #[serde(rename = "cloudflareWorkersAi")]
  CloudflareWorkersAi,
  #[serde(rename = "fal")]
  Fal,
  #[serde(rename = "gemini")]
  Gemini,
  #[serde(rename = "geminiVertex")]
  GeminiVertex,
  #[serde(rename = "openai")]
  OpenAi,
}

impl CopilotManagedProvider {
  fn as_str(self) -> &'static str {
    match self {
      Self::Anthropic => "anthropic",
      Self::AnthropicVertex => "anthropicVertex",
      Self::CloudflareWorkersAi => "cloudflareWorkersAi",
      Self::Fal => "fal",
      Self::Gemini => "gemini",
      Self::GeminiVertex => "geminiVertex",
      Self::OpenAi => "openai",
    }
  }
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
struct CopilotProviderMiddlewareConfigFile {
  rust: Option<CopilotRustMiddlewareConfigFile>,
  node: Option<CopilotNodeMiddlewareConfigFile>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
struct CopilotRustMiddlewareConfigFile {
  request: Option<Vec<CopilotRustRequestMiddleware>>,
  stream: Option<Vec<CopilotRustStreamMiddleware>>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
struct CopilotNodeMiddlewareConfigFile {
  text: Option<Vec<CopilotNodeTextMiddleware>>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
enum CopilotRustRequestMiddleware {
  NormalizeMessages,
  ClampMaxTokens,
  ToolSchemaRewrite,
  OpenaiRequestCompat,
  OmitToolChoice,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
enum CopilotRustStreamMiddleware {
  StreamEventNormalize,
  CitationIndexing,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
enum CopilotNodeTextMiddleware {
  CitationFootnote,
  Callout,
  ThinkingFormat,
}

impl TryFrom<CopilotRuntimeConfigFile> for CopilotRuntimeConfig {
  type Error = RuntimeError;

  fn try_from(value: CopilotRuntimeConfigFile) -> Result<Self, Self::Error> {
    Ok(Self {
      enabled: value.enabled,
      byok: value.byok,
      providers: CopilotProvidersRuntimeConfig {
        profiles: value
          .providers
          .profiles
          .into_iter()
          .map(TryInto::try_into)
          .collect::<RuntimeResult<_>>()?,
      },
    })
  }
}

impl TryFrom<CopilotManagedProfileConfigFile> for CopilotManagedProfileConfig {
  type Error = RuntimeError;

  fn try_from(value: CopilotManagedProfileConfigFile) -> Result<Self, Self::Error> {
    if value.id.is_empty()
      || !value
        .id
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
      return Err(RuntimeError::invalid_state(
        "managed copilot profile id must contain only letters, numbers, hyphens, and underscores",
      ));
    }
    Ok(Self {
      id: value.id,
      provider: value.provider.as_str().to_string(),
      enabled: value.enabled,
      models: value.models,
      config: serde_json::Value::Object(value.config),
    })
  }
}

#[derive(Clone, Debug)]
pub(crate) struct InviteQuotaConfig {
  pub(crate) new_account_action_delay_seconds: i64,
  pub(crate) high_risk_target_domains: Vec<String>,
  pub(crate) subject_hash_salt: String,
  pub(crate) mail_class_mapping: BTreeMap<String, String>,
}

impl Default for InviteQuotaConfig {
  fn default() -> Self {
    Self {
      new_account_action_delay_seconds: 24 * 60 * 60,
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
  pub(crate) fn byok_policy(&self) -> ByokPolicy {
    ByokPolicy::from(self.deployment, &self.copilot.byok)
  }

  pub(crate) fn from_config_source(private_key: Option<String>, source: &ConfigSource) -> RuntimeResult<Self> {
    let mut app_config = app_config_from_config_source(source)?;
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
      deployment: deployment_from_env(),
      copilot: app_config
        .copilot
        .take()
        .map(TryInto::try_into)
        .transpose()?
        .unwrap_or_default(),
      search: app_config.indexer.map(Into::into).unwrap_or_default(),
    }
    .validated()
  }

  pub(crate) async fn with_db_overrides(&self, pool: &PgPool, source: &ConfigSource) -> RuntimeResult<Self> {
    let app_config_value = app_config_value_from_config_source(source)?;
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
    let mut app_config = deserialize_app_config(app_config_value)?;
    Self {
      // The DB override is loaded after this connection already exists, so it
      // must not rewrite the active datasource URL.
      database_url: self.database_url.clone(),
      invite_quota: app_config.invite_quota_config(),
      private_key: db_private_key
        .map(|key| Arc::new(Zeroizing::new(key)))
        .unwrap_or_else(|| Arc::clone(&self.private_key)),
      deployment: self.deployment,
      copilot: app_config
        .copilot
        .take()
        .map(TryInto::try_into)
        .transpose()?
        .unwrap_or_else(|| self.copilot.clone()),
      search: app_config
        .indexer
        .map(Into::into)
        .unwrap_or_else(|| self.search.clone()),
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

pub(super) fn validate_copilot_config(config: &CopilotRuntimeConfig) -> RuntimeResult<()> {
  let mut allowed_providers = std::collections::HashSet::new();
  for provider in &config.byok.allowed_providers {
    if !SUPPORTED_BYOK_PROVIDERS.contains(&provider.as_str()) || !allowed_providers.insert(provider.as_str()) {
      return Err(RuntimeError::invalid_state(
        "copilot BYOK allowed providers must be supported and unique",
      ));
    }
  }
  let mut profile_ids = std::collections::HashSet::new();
  let mut managed_models = std::collections::HashMap::new();
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
      if profile.enabled
        && let Some(existing_profile) = managed_models.insert(model.as_str(), profile.id.as_str())
      {
        return Err(RuntimeError::invalid_state(format!(
          "managed copilot model {model} is assigned to both {existing_profile} and {}",
          profile.id
        )));
      }
    }
  }
  Ok(())
}

fn deployment_from_env() -> Deployment {
  if env::var("DEPLOYMENT_TYPE").as_deref() == Ok("selfhosted") {
    Deployment::SelfHosted
  } else {
    Deployment::Cloud
  }
}

#[derive(Default, Deserialize)]
struct AppConfigFile {
  auth: Option<AuthConfigFile>,
  db: Option<DbConfigFile>,
  crypto: Option<CryptoConfigFile>,
  copilot: Option<CopilotRuntimeConfigFile>,
  indexer: Option<SearchRuntimeConfigFile>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthConfigFile {
  new_account_action_delay: Option<i64>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct SearchRuntimeConfigFile {
  enabled: bool,
  provider: SearchProviderConfigFile,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct SearchProviderConfigFile {
  #[serde(rename = "type")]
  provider: String,
  endpoint: String,
  api_key: String,
  username: String,
  password: String,
}

impl From<SearchRuntimeConfigFile> for SearchRuntimeConfig {
  fn from(value: SearchRuntimeConfigFile) -> Self {
    Self {
      enabled: value.enabled,
      provider: if value.provider.provider.is_empty() {
        "embedded".to_string()
      } else {
        value.provider.provider
      },
      endpoint: value.provider.endpoint,
      api_key: value.provider.api_key,
      username: value.provider.username,
      password: value.provider.password,
    }
  }
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
    let mut config = InviteQuotaConfig::default();
    if let Some(delay) = self.auth.as_ref().and_then(|auth| auth.new_account_action_delay) {
      config.new_account_action_delay_seconds = delay.max(0);
    }
    config
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

fn app_config_from_config_source(source: &ConfigSource) -> RuntimeResult<AppConfigFile> {
  deserialize_app_config(app_config_value_from_config_source(source)?)
}

fn app_config_value_from_config_source(source: &ConfigSource) -> RuntimeResult<serde_json::Value> {
  let mut merged = serde_json::Value::Object(Map::new());
  for path in source.paths() {
    if !path.exists() {
      if source.required(&path) {
        return Err(RuntimeError::config(format!(
          "config file does not exist: {}",
          path.display()
        )));
      }
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

pub(in crate::runtime) fn config_json_paths() -> Vec<PathBuf> {
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
    let exact_empty = ConfigSource::new(Some(Vec::new()));
    assert!(exact_empty.exact());
    assert!(exact_empty.paths().is_empty());
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
    let copilot: CopilotRuntimeConfig = app_config.copilot.unwrap().try_into().unwrap();

    assert!(copilot.enabled);
    assert!(!copilot.byok.enabled);
    assert_eq!(copilot.providers.profiles.len(), 1);
    assert_eq!(copilot.providers.profiles[0].id, "managed-openai");

    let missing_models = app_config_from_flat_overrides([(
      "copilot.providers.profiles",
      serde_json::json!([{
        "id": "managed-openai",
        "type": "openai",
        "config": {}
      }]),
    )]);
    assert!(missing_models.is_err());

    let app_config = app_config_from_flat_overrides([(
      "copilot.providers.profiles",
      serde_json::json!([{
        "id": "managed-openai",
        "type": "openai",
        "models": [],
        "config": {}
      }]),
    )])
    .unwrap();
    let copilot: CopilotRuntimeConfig = app_config.copilot.unwrap().try_into().unwrap();
    assert!(validate_copilot_config(&copilot).is_err());

    let app_config = app_config_from_flat_overrides([(
      "copilot.providers.profiles",
      serde_json::json!([
        {
          "id": "anthropic-direct",
          "type": "anthropic",
          "models": ["claude-sonnet-4-6"],
          "config": {}
        },
        {
          "id": "anthropic-vertex",
          "type": "anthropicVertex",
          "models": ["claude-sonnet-4-6"],
          "config": {}
        }
      ]),
    )])
    .unwrap();
    let copilot: CopilotRuntimeConfig = app_config.copilot.unwrap().try_into().unwrap();
    assert!(validate_copilot_config(&copilot).is_err());

    let directory = tempfile::tempdir().unwrap();
    let base_path = directory.path().join("base.json");
    let override_path = directory.path().join("override.json");
    fs::write(
      &base_path,
      r#"{"copilot":{"enabled":true,"byok.enabled":true,"byok.allowCustomEndpoint":true}}"#,
    )
    .unwrap();
    fs::write(&override_path, r#"{"copilot":{"byok.enabled":false}}"#).unwrap();
    let source = ConfigSource::new(Some(vec![
      base_path.to_string_lossy().into_owned(),
      override_path.to_string_lossy().into_owned(),
    ]));
    let copilot: CopilotRuntimeConfig = app_config_from_config_source(&source)
      .unwrap()
      .copilot
      .unwrap()
      .try_into()
      .unwrap();
    assert!(!copilot.byok.enabled);
    assert!(copilot.byok.allow_custom_endpoint);
  }

  #[test]
  fn search_config_keeps_disabled_state_separate_from_embedded_provider() {
    let disabled = app_config_from_flat_overrides([
      ("indexer.enabled", serde_json::json!(false)),
      ("indexer.provider.type", serde_json::json!("embedded")),
    ])
    .unwrap();
    let disabled: SearchRuntimeConfig = disabled.indexer.unwrap().into();
    assert!(!disabled.enabled);
    assert_eq!(disabled.provider, "embedded");

    let enabled = app_config_from_flat_overrides([
      ("indexer.enabled", serde_json::json!(true)),
      ("indexer.provider.type", serde_json::json!("elasticsearch")),
    ])
    .unwrap();
    let enabled: SearchRuntimeConfig = enabled.indexer.unwrap().into();
    assert!(enabled.enabled);
    assert_eq!(enabled.provider, "elasticsearch");

    let enabled_without_provider = app_config_from_module_json(serde_json::json!({
      "indexer": { "enabled": true }
    }))
    .unwrap();
    let enabled_without_provider: SearchRuntimeConfig = enabled_without_provider.indexer.unwrap().into();
    assert!(enabled_without_provider.enabled);
    assert_eq!(enabled_without_provider.provider, "embedded");

    let manticore = app_config_from_flat_overrides([
      ("indexer.enabled", serde_json::json!(true)),
      ("indexer.provider.type", serde_json::json!("manticoresearch")),
      ("indexer.provider.endpoint", serde_json::json!("http://localhost:9308")),
    ])
    .unwrap();
    let manticore: SearchRuntimeConfig = manticore.indexer.unwrap().into();
    assert!(manticore.enabled);
    assert_eq!(manticore.provider, "manticoresearch");
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
    let copilot: CopilotRuntimeConfig = deserialize_app_config(file_config)
      .unwrap()
      .copilot
      .unwrap()
      .try_into()
      .unwrap();

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
    let byok = CopilotRuntimeConfig::try_from(app_config.copilot.unwrap())
      .unwrap()
      .byok;

    assert!(!byok.enabled);
    assert!(byok.allow_custom_endpoint);
  }

  #[test]
  fn database_config_only_replaces_an_active_private_key_explicitly() {
    let active = BackendRuntimeConfig {
      database_url: "postgresql://active".to_string(),
      invite_quota: InviteQuotaConfig::default(),
      private_key: Arc::new(Zeroizing::new("active-private-key".to_string())),
      deployment: Deployment::Cloud,
      copilot: CopilotRuntimeConfig::default(),
      search: SearchRuntimeConfig::default(),
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
  fn invite_abuse_policy_is_internal_while_action_delay_is_configurable() {
    let app_config = app_config_from_flat_overrides([
      ("auth.newAccountActionDelay", serde_json::json!(123)),
      ("auth.untrustedPolicyOverride", serde_json::json!("runtime-salt-v2")),
      ("auth.untrustedDomainList", serde_json::json!(["Example.COM."])),
    ])
    .unwrap();

    let config = app_config.invite_quota_config();
    assert_eq!(config.new_account_action_delay_seconds, 123);
    assert!(!config.high_risk_target_domains.contains(&"example.com".to_string()));
    assert_ne!(config.subject_hash_salt, "runtime-salt-v2");
    assert_eq!(
      config.mail_class_mapping.get("MemberInvitation").map(String::as_str),
      Some("workspace_invitation")
    );
  }
}
