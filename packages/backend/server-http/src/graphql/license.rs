//! Self-hosted workspace license GraphQL types and resolvers.

use std::io::Read as _;
use std::sync::Arc;

use async_graphql::{Context, Enum, Result, SimpleObject, Upload};
use chrono::{DateTime, Utc};
use server_domain::selfhost_license::{InstalledLicenseView, LicensePreviewView};
use server_types::{DeploymentMode, DomainError};

use super::{require_admin_user, require_authenticated_user};
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;

const MAX_LICENSE_FILE_BYTES: usize = 256 * 1024;

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "SubscriptionPlan")]
pub enum SubscriptionPlan {
  #[graphql(name = "AI")]
  Ai,
  #[graphql(name = "Enterprise")]
  Enterprise,
  #[graphql(name = "Free")]
  Free,
  #[graphql(name = "Pro")]
  Pro,
  #[graphql(name = "SelfHosted")]
  SelfHosted,
  #[graphql(name = "SelfHostedTeam")]
  SelfHostedTeam,
  #[graphql(name = "Team")]
  Team,
}

impl SubscriptionPlan {
  pub(crate) fn parse(s: &str) -> Self {
    match s.to_ascii_lowercase().as_str() {
      "enterprise" => Self::Enterprise,
      "selfhostedteam" | "selfhost_team" => Self::SelfHostedTeam,
      "team" => Self::Team,
      "pro" => Self::Pro,
      "ai" => Self::Ai,
      "free" => Self::Free,
      _ => Self::SelfHosted,
    }
  }

  pub(crate) fn as_str(self) -> &'static str {
    match self {
      Self::Free => "free",
      Self::Pro => "pro",
      Self::Ai => "ai",
      Self::Team => "team",
      Self::Enterprise => "enterprise",
      Self::SelfHosted => "selfhosted",
      Self::SelfHostedTeam => "selfhostedteam",
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "SubscriptionRecurring")]
pub enum SubscriptionRecurring {
  #[graphql(name = "Lifetime")]
  Lifetime,
  #[graphql(name = "Monthly")]
  Monthly,
  #[graphql(name = "Yearly")]
  Yearly,
}

impl SubscriptionRecurring {
  pub(crate) fn parse(s: &str) -> Self {
    if s.eq_ignore_ascii_case("monthly") {
      Self::Monthly
    } else if s.eq_ignore_ascii_case("yearly") {
      Self::Yearly
    } else {
      Self::Lifetime
    }
  }

  pub(crate) fn as_str(self) -> &'static str {
    match self {
      Self::Monthly => "monthly",
      Self::Yearly => "yearly",
      Self::Lifetime => "lifetime",
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "SubscriptionVariant")]
pub enum SubscriptionVariant {
  #[graphql(name = "Onetime")]
  Onetime,
}

impl SubscriptionVariant {
  pub(crate) fn parse(s: &str) -> Option<Self> {
    if s.eq_ignore_ascii_case("onetime") {
      Some(Self::Onetime)
    } else {
      None
    }
  }

  pub(crate) fn as_str(self) -> &'static str {
    match self {
      Self::Onetime => "onetime",
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "License")]
pub struct License {
  pub quantity: i32,
  pub recurring: SubscriptionRecurring,
  pub variant: Option<SubscriptionVariant>,
  pub installed_at: DateTime<Utc>,
  pub validated_at: DateTime<Utc>,
  pub expired_at: Option<DateTime<Utc>>,
}

impl From<InstalledLicenseView> for License {
  fn from(v: InstalledLicenseView) -> Self {
    Self {
      quantity: v.quantity,
      recurring: SubscriptionRecurring::parse(&v.recurring),
      variant: v
        .variant
        .as_deref()
        .filter(|s| s.eq_ignore_ascii_case("onetime"))
        .map(|_| SubscriptionVariant::Onetime),
      installed_at: v.installed_at,
      validated_at: v.validated_at,
      expired_at: v.expired_at,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminLicensePreview")]
pub struct AdminLicensePreview {
  pub id: String,
  pub workspace_id: String,
  pub plan: SubscriptionPlan,
  pub recurring: SubscriptionRecurring,
  pub quantity: i32,
  pub issued_at: DateTime<Utc>,
  pub expires_at: DateTime<Utc>,
  pub end_at: DateTime<Utc>,
  pub entity: String,
  pub issuer: String,
  pub valid: bool,
}

impl From<LicensePreviewView> for AdminLicensePreview {
  fn from(v: LicensePreviewView) -> Self {
    Self {
      id: v.id,
      workspace_id: v.workspace_id,
      plan: SubscriptionPlan::parse(&v.plan),
      recurring: SubscriptionRecurring::parse(&v.recurring),
      quantity: v.quantity,
      issued_at: v.issued_at,
      expires_at: v.expires_at,
      end_at: v.end_at,
      entity: v.entity,
      issuer: v.issuer,
      valid: v.valid,
    }
  }
}

fn require_selfhosted(state: &AppState) -> Result<()> {
  if state.config.load().deployment_mode != DeploymentMode::Selfhosted {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(
      "License management is only available in self-hosted mode".into(),
    )));
  }
  Ok(())
}

pub(crate) async fn resolve_workspace_license(ctx: &Context<'_>, workspace_id: &str) -> Result<Option<License>> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  require_selfhosted(state)?;
  let lic = state
    .licenses
    .get_license(&user.id, workspace_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(lic.map(Into::into))
}

pub(crate) async fn mutate_activate_license(
  ctx: &Context<'_>,
  workspace_id: String,
  license: String,
) -> Result<License> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  require_selfhosted(state)?;
  let installed = state
    .licenses
    .activate_license(&user.id, &workspace_id, &license)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(installed.into())
}

pub(crate) async fn mutate_deactivate_license(ctx: &Context<'_>, workspace_id: String) -> Result<bool> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  require_selfhosted(state)?;
  state
    .licenses
    .deactivate_license(&user.id, &workspace_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))
}

pub(crate) async fn mutate_install_license(
  ctx: &Context<'_>,
  workspace_id: String,
  license: Upload,
) -> Result<License> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  require_selfhosted(state)?;
  let mut val = license
    .value(ctx)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid license upload: {e}"))))?;
  let mut bytes = Vec::new();
  val
    .content
    .by_ref()
    .take((MAX_LICENSE_FILE_BYTES + 1) as u64)
    .read_to_end(&mut bytes)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("failed to read license: {e}"))))?;
  if bytes.is_empty() || bytes.len() > MAX_LICENSE_FILE_BYTES {
    return Err(domain_error_to_graphql(&DomainError::Validation(
      "invalid_license".into(),
    )));
  }
  let installed = state
    .licenses
    .install_license(&user.id, &workspace_id, &bytes)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(installed.into())
}

pub(crate) async fn mutate_preview_license(ctx: &Context<'_>, license: Upload) -> Result<AdminLicensePreview> {
  let _admin = require_admin_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let mut val = license
    .value(ctx)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid license upload: {e}"))))?;
  let mut bytes = Vec::new();
  val
    .content
    .by_ref()
    .take((MAX_LICENSE_FILE_BYTES + 1) as u64)
    .read_to_end(&mut bytes)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("failed to read license: {e}"))))?;
  if bytes.is_empty() || bytes.len() > MAX_LICENSE_FILE_BYTES {
    return Err(domain_error_to_graphql(&DomainError::Validation(
      "invalid_license".into(),
    )));
  }
  let preview = state
    .licenses
    .preview_license(&bytes)
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(preview.into())
}

pub(crate) async fn mutate_create_selfhost_workspace_customer_portal(
  ctx: &Context<'_>,
  workspace_id: String,
) -> Result<String> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  require_selfhosted(state)?;
  state
    .licenses
    .assert_payment_manage(&user.id, &workspace_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  match state
    .extension
    .billing_spi()
    .create_selfhost_customer_portal(&workspace_id)
    .await
  {
    Ok(url) => Ok(url),
    Err(DomainError::Unavailable(_)) if state.extension.edition_name() == "community" => state
      .licenses
      .create_customer_portal(&workspace_id)
      .await
      .map_err(|e| domain_error_to_graphql(&e)),
    Err(err) => Err(domain_error_to_graphql(&err)),
  }
}

#[derive(Default)]
pub struct LicenseMutation;

#[async_graphql::Object]
impl LicenseMutation {
  async fn activate_license(&self, ctx: &Context<'_>, workspace_id: String, license: String) -> Result<License> {
    mutate_activate_license(ctx, workspace_id, license).await
  }

  async fn deactivate_license(&self, ctx: &Context<'_>, workspace_id: String) -> Result<bool> {
    mutate_deactivate_license(ctx, workspace_id).await
  }

  async fn install_license(
    &self,
    ctx: &Context<'_>,
    workspace_id: String,
    license: async_graphql::Upload,
  ) -> Result<License> {
    mutate_install_license(ctx, workspace_id, license).await
  }

  async fn preview_license(&self, ctx: &Context<'_>, license: async_graphql::Upload) -> Result<AdminLicensePreview> {
    mutate_preview_license(ctx, license).await
  }

  async fn create_selfhost_workspace_customer_portal(&self, ctx: &Context<'_>, workspace_id: String) -> Result<String> {
    mutate_create_selfhost_workspace_customer_portal(ctx, workspace_id).await
  }
}
