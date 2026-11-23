//! Server configuration, admin app-config, and test-email GraphQL resolvers.

use std::sync::Arc;

use async_graphql::{Context, Enum, InputObject, Result, SimpleObject};
use server_domain::app_config::AppConfigUpdate;
use server_mail::{MailSendResult, MailTemplate, SmtpConfig, SmtpMailer, TestMailProps};
use server_types::{DeploymentMode, DomainError};

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
#[graphql(name = "ServerConfigType")]
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
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "UpdateAppConfigInput")]
pub struct UpdateAppConfigInput {
  pub module: String,
  pub key: String,
  pub value: Option<JsonScalar>,
  pub clear: Option<bool>,
}

pub(crate) async fn resolve_server_config(ctx: &Context<'_>) -> Result<ServerConfigType> {
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let cfg = state.config.load();
  let initialized = state
    .auth
    .is_server_initialized()
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;

  let deployment_type = match cfg.deployment_mode {
    DeploymentMode::Selfhosted => ServerDeploymentType::Selfhosted,
    DeploymentMode::Cloud => ServerDeploymentType::Affine,
  };

  let features = match cfg.deployment_mode {
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
      ServerFeature::OAuth,
    ],
  };

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
        min_length: i32::try_from(state.auth.config().password_min_length).unwrap_or(8),
        max_length: i32::try_from(state.auth.config().password_max_length).unwrap_or(32),
      },
    },
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
