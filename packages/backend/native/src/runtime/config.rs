use std::{
  collections::BTreeMap,
  env, fs,
  path::{Path, PathBuf},
};

use serde::Deserialize;
use serde_json::Map;
use sqlx::{PgPool, Row};

use super::{RuntimeError, RuntimeResult};

#[derive(Clone, Debug)]
pub(crate) struct BackendRuntimeConfig {
  pub(crate) database_url: String,
  pub(crate) invite_quota: InviteQuotaConfig,
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
  pub(crate) fn from_config_files() -> RuntimeResult<Self> {
    let app_config = app_config_from_config_files()?;
    let database_url = database_url_from_env()
      .or(app_config.database_url())
      .unwrap_or_else(|| "postgresql://localhost:5432/affine".to_string());
    Ok(Self {
      database_url,
      invite_quota: app_config.invite_quota_config(),
    })
  }

  pub(crate) async fn with_db_overrides(&self, pool: &PgPool) -> RuntimeResult<Self> {
    let mut app_config = app_config_from_config_files()?;
    app_config.apply_file_config(load_app_config_overrides_from_db(pool).await?);
    Ok(Self {
      // The DB override is loaded after this connection already exists, so it
      // must not rewrite the active datasource URL.
      database_url: self.database_url.clone(),
      invite_quota: app_config.invite_quota_config(),
    })
  }
}

#[derive(Debug, Default, Deserialize)]
struct AppConfigFile {
  db: Option<DbConfigFile>,
}

#[derive(Debug, Default, Deserialize)]
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

fn non_empty_string(value: String) -> Option<String> {
  if value.trim().is_empty() { None } else { Some(value) }
}

fn app_config_from_config_files() -> RuntimeResult<AppConfigFile> {
  let mut merged = AppConfigFile::default();
  for path in config_json_paths() {
    if !path.exists() {
      continue;
    }
    let raw = fs::read_to_string(&path).map_err(|err| RuntimeError::io("failed to read config file", err))?;
    let config: AppConfigFile =
      serde_json::from_str(&raw).map_err(|err| RuntimeError::json("failed to parse config file", err))?;
    merged.apply_file_config(config);
  }

  Ok(merged)
}

impl AppConfigFile {
  fn apply_file_config(&mut self, config: AppConfigFile) {
    if config.db.is_some() {
      self.db = config.db;
    }
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

async fn load_app_config_overrides_from_db(pool: &PgPool) -> RuntimeResult<AppConfigFile> {
  let rows = match sqlx::query("SELECT id, value FROM app_configs").fetch_all(pool).await {
    Ok(rows) => rows,
    Err(sqlx::Error::Database(err)) if err.code().as_deref() == Some("42P01") => return Ok(AppConfigFile::default()),
    Err(err) => return Err(RuntimeError::database("failed to load app config overrides", err)),
  };

  app_config_from_flat_overrides(rows.into_iter().map(|row| {
    let id: String = row.get("id");
    let value: serde_json::Value = row.get("value");
    (id, value)
  }))
}

fn app_config_from_flat_overrides<I, S>(rows: I) -> RuntimeResult<AppConfigFile>
where
  I: IntoIterator<Item = (S, serde_json::Value)>,
  S: AsRef<str>,
{
  let mut root = Map::new();
  for (path, value) in rows {
    let Some((module, key)) = path.as_ref().split_once('.') else {
      continue;
    };
    root
      .entry(module.to_string())
      .or_insert_with(|| serde_json::Value::Object(Map::new()));
    if let Some(serde_json::Value::Object(module_object)) = root.get_mut(module) {
      module_object.insert(key.to_string(), value);
    }
  }

  serde_json::from_value(serde_json::Value::Object(root))
    .map_err(|err| RuntimeError::json("invalid app config overrides", err))
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
