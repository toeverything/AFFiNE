use std::sync::Arc;

use serde::Deserialize;
use zeroize::Zeroizing;

use super::CopilotRuntimeConfig;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Deployment {
  Cloud,
  SelfHosted,
}

pub(crate) struct BackendRuntimeConfig {
  pub(crate) database_url: String,
  pub(crate) auth: AuthRuntimeConfig,
  pub(crate) invite_quota: InviteQuotaConfig,
  pub(crate) private_key: Arc<Zeroizing<String>>,
  pub(crate) deployment: Deployment,
  pub(crate) copilot: CopilotRuntimeConfig,
  pub(crate) search: SearchRuntimeConfig,
  pub(crate) redis: RedisRuntimeConfig,
  pub(crate) payment: PaymentRuntimeConfig,
}

#[derive(Clone)]
pub(crate) struct AuthRuntimeConfig {
  pub(crate) allow_signup: bool,
  pub(crate) allow_signup_for_oauth: bool,
  pub(crate) require_email_domain_verification: bool,
  pub(crate) session_ttl_seconds: i64,
  pub(crate) session_ttr_seconds: i64,
  pub(crate) access_token_ttl_seconds: i64,
  pub(crate) refresh_idle_ttl_seconds: i64,
  pub(crate) refresh_absolute_ttl_seconds: i64,
  pub(crate) refresh_grace_seconds: i64,
  pub(crate) refresh_retention_seconds: i64,
  pub(crate) oauth: OAuthRuntimeConfig,
}

impl Default for AuthRuntimeConfig {
  fn default() -> Self {
    Self {
      allow_signup: true,
      allow_signup_for_oauth: true,
      require_email_domain_verification: false,
      session_ttl_seconds: 15 * 24 * 60 * 60,
      session_ttr_seconds: 7 * 24 * 60 * 60,
      access_token_ttl_seconds: 15 * 60,
      refresh_idle_ttl_seconds: 30 * 24 * 60 * 60,
      refresh_absolute_ttl_seconds: 180 * 24 * 60 * 60,
      refresh_grace_seconds: 30,
      refresh_retention_seconds: 30 * 24 * 60 * 60,
      oauth: OAuthRuntimeConfig::default(),
    }
  }
}

#[derive(Clone, Default)]
pub(crate) struct OAuthRuntimeConfig {
  pub(crate) providers: std::collections::BTreeMap<String, OAuthProviderRuntimeConfig>,
}

#[derive(Clone)]
pub(crate) struct OAuthProviderRuntimeConfig {
  pub(crate) client_id: String,
  pub(crate) client_secret: Arc<Zeroizing<String>>,
  pub(crate) args: std::collections::BTreeMap<String, String>,
  pub(crate) issuer: Option<String>,
  pub(crate) allow_private_network: bool,
  pub(crate) apple_private_key: Option<Arc<Zeroizing<String>>>,
  pub(crate) apple_key_id: Option<String>,
  pub(crate) apple_team_id: Option<String>,
}

#[derive(Clone, Default)]
pub(crate) struct PaymentRuntimeConfig {
  pub(crate) enabled: bool,
  pub(crate) stripe: Option<StripeRuntimeConfig>,
  pub(crate) revenuecat: Option<RevenueCatRuntimeConfig>,
}

#[derive(Clone)]
pub(crate) struct StripeRuntimeConfig {
  pub(crate) api_key: Arc<Zeroizing<String>>,
  pub(crate) webhook_key: Arc<Zeroizing<String>>,
  pub(crate) account_id: String,
  pub(crate) live: bool,
}

#[derive(Clone)]
pub(crate) struct RevenueCatRuntimeConfig {
  pub(crate) api_key: Arc<Zeroizing<String>>,
  pub(crate) webhook_auth: Arc<Zeroizing<String>>,
  pub(crate) project_id: String,
  pub(crate) production: bool,
  pub(crate) product_map: std::collections::BTreeMap<String, PaymentProductConfig>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaymentProductConfig {
  pub(crate) plan: String,
  pub(crate) recurring: String,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct RedisRuntimeConfig {
  pub(crate) url: Option<String>,
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
pub(crate) struct InviteQuotaConfig {
  pub(crate) new_account_action_delay_seconds: i64,
}

impl Default for InviteQuotaConfig {
  fn default() -> Self {
    Self {
      new_account_action_delay_seconds: 24 * 60 * 60,
    }
  }
}
