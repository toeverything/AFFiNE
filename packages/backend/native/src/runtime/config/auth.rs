use serde::{Deserialize, Serialize};

use super::{AuthRuntimeConfig, InviteQuotaConfig, RuntimeError, RuntimeResult};

#[derive(Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct AuthConfigFile {
  pub(super) new_account_action_delay: i64,
  pub(super) allow_signup: bool,
  pub(super) allow_signup_for_oauth: bool,
  pub(super) require_email_domain_verification: bool,
  pub(super) session: AuthSessionConfigFile,
  pub(super) token: AuthTokenConfigFile,
}

#[derive(Deserialize, Serialize, schemars::JsonSchema)]
#[serde(default)]
pub(super) struct AuthSessionConfigFile {
  ttl: i64,
  ttr: i64,
}

#[derive(Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct AuthTokenConfigFile {
  access_token_ttl: i64,
  refresh_idle_ttl: i64,
  refresh_absolute_ttl: i64,
  refresh_grace_period: i64,
  refresh_retention: i64,
}

impl Default for AuthConfigFile {
  fn default() -> Self {
    let runtime = AuthRuntimeConfig::default();
    Self {
      new_account_action_delay: InviteQuotaConfig::default().new_account_action_delay_seconds,
      allow_signup: runtime.allow_signup,
      allow_signup_for_oauth: runtime.allow_signup_for_oauth,
      require_email_domain_verification: runtime.require_email_domain_verification,
      session: AuthSessionConfigFile {
        ttl: runtime.session_ttl_seconds,
        ttr: runtime.session_ttr_seconds,
      },
      token: AuthTokenConfigFile {
        access_token_ttl: runtime.access_token_ttl_seconds,
        refresh_idle_ttl: runtime.refresh_idle_ttl_seconds,
        refresh_absolute_ttl: runtime.refresh_absolute_ttl_seconds,
        refresh_grace_period: runtime.refresh_grace_seconds,
        refresh_retention: runtime.refresh_retention_seconds,
      },
    }
  }
}

impl Default for AuthSessionConfigFile {
  fn default() -> Self {
    Self {
      ttl: AuthRuntimeConfig::default().session_ttl_seconds,
      ttr: AuthRuntimeConfig::default().session_ttr_seconds,
    }
  }
}

impl Default for AuthTokenConfigFile {
  fn default() -> Self {
    let runtime = AuthRuntimeConfig::default();
    Self {
      access_token_ttl: runtime.access_token_ttl_seconds,
      refresh_idle_ttl: runtime.refresh_idle_ttl_seconds,
      refresh_absolute_ttl: runtime.refresh_absolute_ttl_seconds,
      refresh_grace_period: runtime.refresh_grace_seconds,
      refresh_retention: runtime.refresh_retention_seconds,
    }
  }
}

pub(super) fn auth_limit(key: &str) -> Option<(i64, i64)> {
  match key {
    "newAccountActionDelay" => Some((0, i64::MAX)),
    "token.accessTokenTtl" => Some((60, 60 * 60)),
    "token.refreshIdleTtl" => Some((60 * 60, 60 * 60 * 24 * 365)),
    "token.refreshAbsoluteTtl" => Some((60 * 60, 60 * 60 * 24 * 730)),
    "token.refreshGracePeriod" => Some((0, 60)),
    "token.refreshRetention" => Some((60 * 60, 60 * 60 * 24 * 365)),
    _ => None,
  }
}

impl AuthConfigFile {
  pub(super) fn validate(&self) -> RuntimeResult<()> {
    for (key, value) in [
      ("newAccountActionDelay", self.new_account_action_delay),
      ("token.accessTokenTtl", self.token.access_token_ttl),
      ("token.refreshIdleTtl", self.token.refresh_idle_ttl),
      ("token.refreshAbsoluteTtl", self.token.refresh_absolute_ttl),
      ("token.refreshGracePeriod", self.token.refresh_grace_period),
      ("token.refreshRetention", self.token.refresh_retention),
    ] {
      let (min, max) = auth_limit(key).expect("auth range must be defined");
      if !(min..=max).contains(&value) {
        return Err(RuntimeError::config(format!("auth.{key} is out of range")));
      }
    }
    Ok(())
  }

  pub(super) fn invite_quota_config(&self) -> InviteQuotaConfig {
    InviteQuotaConfig {
      new_account_action_delay_seconds: self.new_account_action_delay,
    }
  }

  pub(super) fn runtime_config(&self) -> AuthRuntimeConfig {
    AuthRuntimeConfig {
      allow_signup: self.allow_signup,
      allow_signup_for_oauth: self.allow_signup_for_oauth,
      require_email_domain_verification: self.require_email_domain_verification,
      session_ttl_seconds: self.session.ttl,
      session_ttr_seconds: self.session.ttr,
      access_token_ttl_seconds: self.token.access_token_ttl,
      refresh_idle_ttl_seconds: self.token.refresh_idle_ttl,
      refresh_absolute_ttl_seconds: self.token.refresh_absolute_ttl,
      refresh_grace_seconds: self.token.refresh_grace_period,
      refresh_retention_seconds: self.token.refresh_retention,
      oauth: Default::default(),
    }
  }
}
