//! Pure canonical domain types and self-hosted license verification for the
//! AFFiNE server workspace.
//!
//! This crate contains no transport frameworks (`axum`, `async-graphql`) and no
//! legacy compatibility aliases.

pub mod license;

use std::{fmt, str::FromStr};

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeploymentMode {
  Selfhosted,
  Cloud,
}

impl DeploymentMode {
  pub const fn as_str(self) -> &'static str {
    match self {
      Self::Selfhosted => "selfhosted",
      Self::Cloud => "cloud",
    }
  }
}

impl fmt::Display for DeploymentMode {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.write_str(self.as_str())
  }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerRole {
  Front,
  Graphql,
  Worker,
  Script,
  Allinone,
}

impl ServerRole {
  pub const fn as_str(self) -> &'static str {
    match self {
      Self::Front => "front",
      Self::Graphql => "graphql",
      Self::Worker => "worker",
      Self::Script => "script",
      Self::Allinone => "allinone",
    }
  }
}

impl fmt::Display for ServerRole {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.write_str(self.as_str())
  }
}

impl FromStr for ServerRole {
  type Err = DomainError;

  fn from_str(s: &str) -> Result<Self, Self::Err> {
    match s.to_ascii_lowercase().as_str() {
      "front" => Ok(Self::Front),
      "graphql" => Ok(Self::Graphql),
      "worker" => Ok(Self::Worker),
      "script" => Ok(Self::Script),
      "allinone" => Ok(Self::Allinone),
      other => Err(DomainError::Validation(format!("unknown server role: {other}"))),
    }
  }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LicenseTier {
  CloudFree,
  CloudAi,
  CloudPro,
  #[serde(rename = "cloud_lifetime_pro")]
  CloudLifetimePro,
  CloudTeam,
  SelfhostDefault,
  SelfhostTeam,
  SelfhostEnterprise,
}

impl LicenseTier {
  pub const fn as_str(self) -> &'static str {
    match self {
      Self::CloudFree => "cloud_free",
      Self::CloudAi => "cloud_ai",
      Self::CloudPro => "cloud_pro",
      Self::CloudLifetimePro => "cloud_lifetime_pro",
      Self::CloudTeam => "cloud_team",
      Self::SelfhostDefault => "selfhost_default",
      Self::SelfhostTeam => "selfhost_team",
      Self::SelfhostEnterprise => "selfhost_enterprise",
    }
  }
}

impl fmt::Display for LicenseTier {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.write_str(self.as_str())
  }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
  pub blob_limit_bytes: i64,
  pub storage_quota_bytes: i64,
  pub seat_limit: i32,
  pub seat_quota_bytes: Option<i64>,
  pub history_period_seconds: i64,
  pub copilot_action_limit: Option<i32>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rights {
  pub commercial: bool,
  pub copilot_byok: bool,
  pub unlimited_copilot: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessGrant {
  pub tier: LicenseTier,
  pub seat_quantity: Option<i32>,
  pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
  pub limits: Limits,
  pub rights: Rights,
  pub diagnostics: Vec<String>,
}

#[derive(Clone, Debug, thiserror::Error)]
pub enum DomainError {
  #[error("unauthorized: {0}")]
  Unauthorized(String),
  #[error("forbidden: {0}")]
  Forbidden(String),
  #[error("not found: {0}")]
  NotFound(String),
  #[error("conflict: {0}")]
  Conflict(String),
  #[error("quota exceeded ({kind}): {message}")]
  QuotaExceeded { kind: &'static str, message: String },
  #[error("validation failed: {0}")]
  Validation(String),
  #[error("precondition failed: {0}")]
  PreconditionFailed(String),
  #[error("rate limited: {0}")]
  RateLimited(String),
  #[error("unavailable: {0}")]
  Unavailable(String),
  #[error("internal error: {0}")]
  Internal(String),
}
