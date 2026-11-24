//! Server configuration, admin app-config, test-email, and admin user GraphQL resolvers.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use async_graphql::{ComplexObject, Context, Enum, InputObject, Result, SimpleObject};
use chrono::{DateTime, Utc};
use server_domain::app_config::AppConfigUpdate;
use server_domain::safe_fetch::{SafeFetchPolicy, SafeFetchRequest, safe_fetch};
use server_mail::{MailSendResult, MailTemplate, SmtpConfig, SmtpMailer, TestMailProps};
use server_types::{DeploymentMode, DomainError};

use super::user::{
  CreateUserInput, ImportUsersInput, ListUserInput, ManageUserInput, UserImportResultType, UserType,
  mutate_admin_ban_user, mutate_admin_create_user, mutate_admin_enable_user, mutate_admin_import_users,
  mutate_admin_update_user, mutate_admin_update_user_features, resolve_admin_user_by_email, resolve_admin_user_by_id,
  resolve_admin_users, resolve_admin_users_count,
};
use super::{JsonObjectScalar, JsonScalar, require_admin_user};
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "ServerDeploymentType")]
pub enum ServerDeploymentType {
  #[graphql(name = "Affine")]
  Affine,
  #[graphql(name = "Selfhosted")]
  Selfhosted,
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "ServerFeature")]
pub enum ServerFeature {
  #[graphql(name = "Captcha")]
  Captcha,
  #[graphql(name = "Comment")]
  Comment,
  #[graphql(name = "Copilot")]
  Copilot,
  #[graphql(name = "CopilotEmbedding")]
  CopilotEmbedding,
  #[graphql(name = "Indexer")]
  Indexer,
  #[graphql(name = "LocalWorkspace")]
  LocalWorkspace,
  #[graphql(name = "OAuth")]
  OAuth,
  #[graphql(name = "Payment")]
  Payment,
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "FeatureType")]
pub enum FeatureType {
  #[graphql(name = "Admin")]
  Admin,
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "CalendarProviderType")]
pub enum CalendarProviderType {
  #[graphql(name = "CalDAV")]
  CalDAV,
  #[graphql(name = "Google")]
  Google,
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "OAuthProviderType")]
pub enum OAuthProviderType {
  #[graphql(name = "Apple")]
  Apple,
  #[graphql(name = "GitHub")]
  GitHub,
  #[graphql(name = "Google")]
  Google,
  #[graphql(name = "OIDC")]
  OIDC,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "ReleaseVersionType")]
pub struct ReleaseVersionType {
  pub version: String,
  pub url: String,
  pub published_at: DateTime<Utc>,
  pub changelog: String,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "PasswordLimitsType")]
pub struct PasswordLimitsType {
  pub min_length: i32,
  pub max_length: i32,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "CredentialsRequirementType")]
pub struct CredentialsRequirementType {
  pub password: PasswordLimitsType,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "ServerConfigType", complex)]
pub struct ServerConfigType {
  pub version: String,
  pub name: String,
  #[graphql(name = "type")]
  pub deployment_type: ServerDeploymentType,
  pub initialized: bool,
  pub base_url: String,
  pub features: Vec<ServerFeature>,
  pub calendar_providers: Vec<CalendarProviderType>,
  pub credentials_requirement: CredentialsRequirementType,
  pub available_user_features: Vec<FeatureType>,
  pub oauth_providers: Vec<OAuthProviderType>,
}

const AVAILABLE_UPGRADE_CACHE_TTL: Duration = Duration::from_secs(300);

type UpgradeCacheMap = HashMap<(String, String), (Instant, Option<ReleaseVersionType>)>;

fn upgrade_cache() -> &'static Mutex<UpgradeCacheMap> {
  static CACHE: OnceLock<Mutex<UpgradeCacheMap>> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[ComplexObject]
impl ServerConfigType {
  async fn available_upgrade(&self, ctx: &Context<'_>) -> Option<ReleaseVersionType> {
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let cfg = state.config.load();
    if cfg.deployment_mode != DeploymentMode::Selfhosted {
      return None;
    }
    let channel = match cfg.channel.trim().to_ascii_lowercase().as_str() {
      "canary" => "canary",
      "beta" => "beta",
      _ => "stable",
    };
    let cache_key = (channel.to_owned(), self.version.clone());
    if let Ok(guard) = upgrade_cache().lock()
      && let Some((ts, cached)) = guard.get(&cache_key)
      && ts.elapsed() < AVAILABLE_UPGRADE_CACHE_TTL
    {
      return cached.clone();
    }
    let url = format!("https://affine.pro/api/worker/releases?channel={channel}");
    let policy = SafeFetchPolicy {
      timeout: Duration::from_secs(5),
      connect_timeout: Duration::from_secs(5),
      max_redirects: 2,
      max_response_bytes: 256 * 1024,
      ..SafeFetchPolicy::default()
    };
    let req = SafeFetchRequest::get(url).with_policy(policy);
    let computed = match safe_fetch(req).await {
      Ok(resp) if resp.status.is_success() => serde_json::from_slice::<Vec<serde_json::Value>>(&resp.body)
        .ok()
        .and_then(|releases| {
          let latest = releases.first()?;
          let latest_name = latest
            .get("name")
            .or_else(|| latest.get("tag_name"))
            .and_then(|v| v.as_str())?
            .trim();
          if latest_name.is_empty() || !crate::rest::version_guard::is_newer_semver(&self.version, latest_name) {
            return None;
          }
          let str_field = |a, b| {
            latest
              .get(a)
              .or_else(|| latest.get(b))
              .and_then(|v| v.as_str())
              .unwrap_or_default()
              .to_owned()
          };
          let published_at = latest
            .get("published_at")
            .or_else(|| latest.get("publishedAt"))
            .and_then(|v| v.as_str())
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);
          Some(ReleaseVersionType {
            version: latest_name.to_owned(),
            url: str_field("url", "html_url"),
            published_at,
            changelog: str_field("body", "changelog"),
          })
        }),
      _ => None,
    };
    if let Ok(mut guard) = upgrade_cache().lock() {
      guard.insert(cache_key, (Instant::now(), computed.clone()));
    }
    computed
  }
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "UpdateAppConfigInput")]
pub struct UpdateAppConfigInput {
  pub module: String,
  pub key: String,
  pub value: Option<JsonScalar>,
  pub clear: Option<bool>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AppConfigValidateResult")]
pub struct AppConfigValidateResult {
  pub module: String,
  pub key: String,
  pub value: Option<JsonScalar>,
  pub valid: bool,
  pub error: Option<String>,
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "TimeBucket")]
pub enum TimeBucket {
  #[graphql(name = "Day")]
  Day,
  #[graphql(name = "Hour")]
  Hour,
  #[graphql(name = "Minute")]
  Minute,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "TimeWindow")]
pub struct TimeWindow {
  pub from: DateTime<Utc>,
  pub to: DateTime<Utc>,
  pub timezone: String,
  pub bucket: TimeBucket,
  pub requested_size: i32,
  pub effective_size: i32,
}

impl From<server_domain::doc_sharing::AdminTimeWindow> for TimeWindow {
  fn from(w: server_domain::doc_sharing::AdminTimeWindow) -> Self {
    Self {
      from: w.from,
      to: w.to,
      timezone: w.timezone,
      bucket: match w.bucket {
        server_domain::doc_sharing::AdminTimeBucket::Day => TimeBucket::Day,
        server_domain::doc_sharing::AdminTimeBucket::Hour => TimeBucket::Hour,
        server_domain::doc_sharing::AdminTimeBucket::Minute => TimeBucket::Minute,
      },
      requested_size: w.requested_size,
      effective_size: w.effective_size,
    }
  }
}

pub(crate) async fn resolve_server_config(ctx: &Context<'_>) -> Result<ServerConfigType> {
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let cfg = state.config.load();
  let initialized = state
    .auth
    .is_server_initialized()
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  let auth_caps = state
    .app_config
    .get_configured_auth_capabilities()
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;

  let deployment_type = match cfg.deployment_mode {
    DeploymentMode::Selfhosted => ServerDeploymentType::Selfhosted,
    DeploymentMode::Cloud => ServerDeploymentType::Affine,
  };

  let mut features = match cfg.deployment_mode {
    DeploymentMode::Selfhosted => vec![
      ServerFeature::Comment,
      ServerFeature::LocalWorkspace,
      ServerFeature::CopilotEmbedding,
    ],
    DeploymentMode::Cloud => vec![
      ServerFeature::Comment,
      ServerFeature::LocalWorkspace,
      ServerFeature::CopilotEmbedding,
      ServerFeature::Payment,
    ],
  };
  if state.search.enabled() {
    features.push(ServerFeature::Indexer);
  }

  let mut oauth_providers = Vec::new();
  for (enabled, p) in [
    (auth_caps.oauth_google, OAuthProviderType::Google),
    (auth_caps.oauth_github, OAuthProviderType::GitHub),
    (auth_caps.oauth_apple, OAuthProviderType::Apple),
    (auth_caps.oauth_oidc, OAuthProviderType::OIDC),
  ] {
    if enabled {
      oauth_providers.push(p);
    }
  }
  if !oauth_providers.is_empty() {
    features.push(ServerFeature::OAuth);
  }
  if auth_caps.captcha_enabled {
    features.push(ServerFeature::Captcha);
  }
  let effective_cfg = state
    .app_config
    .get_effective_app_config()
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  let (default_min, default_max) = (
    i32::try_from(state.auth.config().password_min_length).unwrap_or(8),
    i32::try_from(state.auth.config().password_max_length).unwrap_or(32),
  );
  let read_pw_limit = |ptr: &str, fallback: i32| {
    effective_cfg
      .pointer(ptr)
      .and_then(|v| v.as_i64())
      .and_then(|n| i32::try_from(n).ok())
      .unwrap_or(fallback)
  };
  let (password_min, password_max) = (
    read_pw_limit("/auth/passwordRequirements/min", default_min),
    read_pw_limit("/auth/passwordRequirements/max", default_max),
  );
  Ok(ServerConfigType {
    version: cfg.server_version.clone(),
    name: cfg.server_name.clone(),
    deployment_type,
    initialized,
    base_url: cfg.external_url.clone(),
    features,
    calendar_providers: Vec::new(),
    credentials_requirement: CredentialsRequirementType {
      password: PasswordLimitsType {
        min_length: password_min,
        max_length: password_max,
      },
    },
    available_user_features: vec![FeatureType::Admin],
    oauth_providers,
  })
}

pub(crate) async fn resolve_app_config(ctx: &Context<'_>) -> Result<JsonObjectScalar> {
  let _admin = require_admin_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let cfg = state
    .app_config
    .get_effective_app_config()
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(JsonObjectScalar(cfg))
}

pub(crate) async fn resolve_app_config_metadata(ctx: &Context<'_>) -> Result<JsonObjectScalar> {
  let _admin = require_admin_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let meta = state
    .app_config
    .get_app_config_metadata()
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(JsonObjectScalar(meta))
}

pub(crate) async fn resolve_validate_app_config(
  ctx: &Context<'_>,
  updates: Vec<UpdateAppConfigInput>,
) -> Result<Vec<AppConfigValidateResult>> {
  let _admin = require_admin_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let items: Vec<(String, String, Option<serde_json::Value>, bool)> = updates
    .into_iter()
    .map(|u| (u.module, u.key, u.value.map(|v| v.0), u.clear.unwrap_or(false)))
    .collect();
  Ok(
    state
      .app_config
      .validate_app_config(&items)
      .into_iter()
      .map(|r| AppConfigValidateResult {
        module: r.module,
        key: r.key,
        value: r.value.map(JsonScalar),
        valid: r.valid,
        error: r.error,
      })
      .collect(),
  )
}

pub(crate) async fn mutate_update_app_config(
  ctx: &Context<'_>,
  updates: Vec<UpdateAppConfigInput>,
) -> Result<JsonObjectScalar> {
  let admin = require_admin_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let domain_updates: Vec<AppConfigUpdate> = updates
    .into_iter()
    .map(|u| {
      let full_key = format!("{}.{}", u.module.trim(), u.key.trim());
      let value = if u.clear.unwrap_or(false) {
        None
      } else {
        u.value.map(|j| j.0)
      };
      AppConfigUpdate { key: full_key, value }
    })
    .collect();
  let effective = state
    .app_config
    .update_app_config(Some(&admin.id), &domain_updates)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(JsonObjectScalar(effective))
}

pub(crate) async fn mutate_send_test_email(ctx: &Context<'_>, config: JsonObjectScalar) -> Result<bool> {
  let admin = require_admin_user(ctx).await?;
  let smtp_cfg: SmtpConfig = serde_json::from_value(config.0)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid SMTP config: {e}"))))?;
  let mailer = SmtpMailer::new(&smtp_cfg)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid SMTP config: {e}"))))?;
  let rendered = MailTemplate::TestMail(TestMailProps {}).render();
  match mailer.send(&admin.email, &rendered).await {
    MailSendResult::Accepted { .. } => Ok(true),
    MailSendResult::Rejected {
      provider_response,
      error_code,
    } => Err(domain_error_to_graphql(&DomainError::Validation(format!(
      "test email rejected ({error_code}): {}",
      provider_response.unwrap_or_default()
    )))),
    MailSendResult::Failed { error_code, error, .. } => Err(domain_error_to_graphql(&DomainError::Unavailable(
      format!("test email failed ({error_code}): {error}"),
    ))),
  }
}

#[derive(Default)]
pub struct AdminQuery;

#[async_graphql::Object]
impl AdminQuery {
  async fn server_config(&self, ctx: &Context<'_>) -> Result<ServerConfigType> {
    resolve_server_config(ctx).await
  }

  async fn app_config(&self, ctx: &Context<'_>) -> Result<JsonObjectScalar> {
    resolve_app_config(ctx).await
  }
  async fn app_config_metadata(&self, ctx: &Context<'_>) -> Result<JsonObjectScalar> {
    resolve_app_config_metadata(ctx).await
  }
  async fn validate_app_config(
    &self,
    ctx: &Context<'_>,
    updates: Vec<UpdateAppConfigInput>,
  ) -> Result<Vec<AppConfigValidateResult>> {
    resolve_validate_app_config(ctx, updates).await
  }
  async fn users(&self, ctx: &Context<'_>, filter: ListUserInput) -> Result<Vec<UserType>> {
    resolve_admin_users(ctx, filter).await
  }
  async fn users_count(&self, ctx: &Context<'_>, filter: Option<ListUserInput>) -> Result<i32> {
    resolve_admin_users_count(ctx, filter).await
  }
  async fn user_by_id(&self, ctx: &Context<'_>, id: String) -> Result<UserType> {
    resolve_admin_user_by_id(ctx, id).await
  }
  async fn user_by_email(&self, ctx: &Context<'_>, email: String) -> Result<Option<UserType>> {
    resolve_admin_user_by_email(ctx, email).await
  }
}

#[derive(Default)]
pub struct AdminMutation;

#[async_graphql::Object]
impl AdminMutation {
  async fn update_app_config(&self, ctx: &Context<'_>, updates: Vec<UpdateAppConfigInput>) -> Result<JsonObjectScalar> {
    mutate_update_app_config(ctx, updates).await
  }

  async fn send_test_email(&self, ctx: &Context<'_>, config: JsonObjectScalar) -> Result<bool> {
    mutate_send_test_email(ctx, config).await
  }
  async fn create_user(&self, ctx: &Context<'_>, input: CreateUserInput) -> Result<UserType> {
    mutate_admin_create_user(ctx, input).await
  }
  async fn update_user(&self, ctx: &Context<'_>, id: String, input: ManageUserInput) -> Result<UserType> {
    mutate_admin_update_user(ctx, id, input).await
  }
  async fn ban_user(&self, ctx: &Context<'_>, id: String) -> Result<UserType> {
    mutate_admin_ban_user(ctx, id).await
  }
  async fn enable_user(&self, ctx: &Context<'_>, id: String) -> Result<UserType> {
    mutate_admin_enable_user(ctx, id).await
  }
  async fn update_user_features(
    &self,
    ctx: &Context<'_>,
    features: Vec<FeatureType>,
    id: String,
  ) -> Result<Vec<FeatureType>> {
    mutate_admin_update_user_features(ctx, id, features).await
  }
  async fn import_users(&self, ctx: &Context<'_>, input: ImportUsersInput) -> Result<Vec<UserImportResultType>> {
    mutate_admin_import_users(ctx, input).await
  }
}
