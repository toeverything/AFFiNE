//! Neutral BYOK SPI contract for community and commercial server editions.
//!
//! Defines pure data transfer objects and async service boundaries with zero
//! database queries, entitlement logic, or cryptographic implementation.

use std::fmt;

use chrono::{DateTime, Utc};
use server_types::DomainError;

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ByokCapabilityDto {
  pub input: Vec<String>,
  pub output: Vec<String>,
  pub features: Vec<String>,
  pub attachment_kinds: Vec<String>,
  pub attachment_sources: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokEndpointDto {
  pub kind: String,
  pub url: Option<String>,
  pub dialect: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokModelDeclarationDto {
  pub model_id: String,
  pub enabled: bool,
  pub capabilities: Vec<ByokCapabilityDto>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokProfileDefinitionDto {
  pub endpoint: ByokEndpointDto,
  pub models: Vec<ByokModelDeclarationDto>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokProbeStatusDto {
  pub kind: String,
  pub tested_at_ms: Option<i64>,
  pub error_kind: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokModelProbeCheckDto {
  pub operation: String,
  pub status: ByokProbeStatusDto,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokModelProbeDto {
  pub model_id: String,
  pub checks: Vec<ByokModelProbeCheckDto>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokValidationDto {
  pub definition_fingerprint: String,
  pub credential_generation: i64,
  pub connection: ByokProbeStatusDto,
  pub models: Vec<ByokModelProbeDto>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokProbeResultDto {
  pub definition_fingerprint: String,
  pub stale: bool,
  pub connection: ByokProbeStatusDto,
  pub models: Vec<ByokModelProbeDto>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokProfileDto {
  pub profile_id: String,
  pub workspace_id: String,
  pub provider: String,
  pub name: String,
  pub description: Option<String>,
  pub definition: ByokProfileDefinitionDto,
  pub enabled: bool,
  pub sort_order: i64,
  pub revision: i64,
  pub validation: Option<ByokValidationDto>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokCatalogModelDto {
  pub model_id: String,
  pub display_name: String,
  pub recommended: bool,
  pub capabilities: Vec<ByokCapabilityDto>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokCatalogProviderDto {
  pub provider: String,
  pub models: Vec<ByokCatalogModelDto>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokCatalogDto {
  pub version: String,
  pub providers: Vec<ByokCatalogProviderDto>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokPolicyDto {
  pub enabled: bool,
  pub allowed_providers: Vec<String>,
  pub custom_endpoint_mode: String,
  pub private_endpoint_supported: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokSettingsDto {
  pub workspace_id: String,
  pub entitled: bool,
  pub server_entitled: bool,
  pub local_entitled: bool,
  pub profiles: Vec<ByokProfileDto>,
  pub policy: ByokPolicyDto,
  pub catalog: ByokCatalogDto,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokUsagePointDto {
  pub date: DateTime<Utc>,
  pub feature_kind: String,
  pub total_tokens: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokLocalLeaseDto {
  pub lease_id: String,
  pub expires_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct CreateByokProfileSpiInput {
  pub workspace_id: String,
  pub provider: String,
  pub name: String,
  pub description: Option<String>,
  pub description_omitted: bool,
  pub credential: String,
  pub definition: ByokProfileDefinitionDto,
  pub enabled: bool,
  pub actor_user_id: String,
}

impl fmt::Debug for CreateByokProfileSpiInput {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("CreateByokProfileSpiInput")
      .field("workspace_id", &self.workspace_id)
      .field("provider", &self.provider)
      .field("name", &self.name)
      .field("description", &self.description)
      .field("description_omitted", &self.description_omitted)
      .field("credential", &"[REDACTED]")
      .field("definition", &self.definition)
      .field("enabled", &self.enabled)
      .field("actor_user_id", &self.actor_user_id)
      .finish()
  }
}

#[derive(Clone)]
pub struct ReplaceByokProfileSpiInput {
  pub workspace_id: String,
  pub profile_id: String,
  pub expected_revision: i64,
  pub name: String,
  pub description: Option<String>,
  pub description_omitted: bool,
  pub definition: ByokProfileDefinitionDto,
  pub credential: Option<String>,
  pub enabled: bool,
  pub actor_user_id: String,
}

impl fmt::Debug for ReplaceByokProfileSpiInput {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("ReplaceByokProfileSpiInput")
      .field("workspace_id", &self.workspace_id)
      .field("profile_id", &self.profile_id)
      .field("expected_revision", &self.expected_revision)
      .field("name", &self.name)
      .field("description", &self.description)
      .field("description_omitted", &self.description_omitted)
      .field("definition", &self.definition)
      .field("credential", &self.credential.as_ref().map(|_| "[REDACTED]"))
      .field("enabled", &self.enabled)
      .field("actor_user_id", &self.actor_user_id)
      .finish()
  }
}

#[derive(Clone)]
pub struct RotateByokCredentialSpiInput {
  pub workspace_id: String,
  pub profile_id: String,
  pub expected_revision: i64,
  pub credential: String,
  pub actor_user_id: String,
}

impl fmt::Debug for RotateByokCredentialSpiInput {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("RotateByokCredentialSpiInput")
      .field("workspace_id", &self.workspace_id)
      .field("profile_id", &self.profile_id)
      .field("expected_revision", &self.expected_revision)
      .field("credential", &"[REDACTED]")
      .field("actor_user_id", &self.actor_user_id)
      .finish()
  }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokProfileOrderSpiInput {
  pub profile_id: String,
  pub expected_revision: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReorderByokProfilesSpiInput {
  pub workspace_id: String,
  pub profiles: Vec<ByokProfileOrderSpiInput>,
  pub actor_user_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ByokProbeCheckSpiInput {
  pub model_id: String,
  pub operation: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProbeByokProfileSpiInput {
  pub workspace_id: String,
  pub profile_id: String,
  pub checks: Vec<ByokProbeCheckSpiInput>,
}

#[derive(Clone)]
pub struct ProbeByokDraftSpiInput {
  pub workspace_id: String,
  pub provider: String,
  pub credential: Option<String>,
  pub profile_id: Option<String>,
  pub expected_revision: Option<i64>,
  pub definition: ByokProfileDefinitionDto,
  pub checks: Vec<ByokProbeCheckSpiInput>,
}

impl fmt::Debug for ProbeByokDraftSpiInput {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("ProbeByokDraftSpiInput")
      .field("workspace_id", &self.workspace_id)
      .field("provider", &self.provider)
      .field("credential", &self.credential.as_ref().map(|_| "[REDACTED]"))
      .field("profile_id", &self.profile_id)
      .field("expected_revision", &self.expected_revision)
      .field("definition", &self.definition)
      .field("checks", &self.checks)
      .finish()
  }
}

#[derive(Clone)]
pub struct CreateByokLocalLeaseProviderSpiInput {
  pub provider: String,
  pub name: String,
  pub description: Option<String>,
  pub description_omitted: bool,
  pub credential: String,
  pub definition: ByokProfileDefinitionDto,
  pub enabled: bool,
}

impl fmt::Debug for CreateByokLocalLeaseProviderSpiInput {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("CreateByokLocalLeaseProviderSpiInput")
      .field("provider", &self.provider)
      .field("name", &self.name)
      .field("description", &self.description)
      .field("description_omitted", &self.description_omitted)
      .field("credential", &"[REDACTED]")
      .field("definition", &self.definition)
      .field("enabled", &self.enabled)
      .finish()
  }
}

#[derive(Clone, Debug)]
pub struct CreateByokLocalLeaseSpiInput {
  pub workspace_id: String,
  pub user_id: String,
  pub providers: Vec<CreateByokLocalLeaseProviderSpiInput>,
}

#[async_trait::async_trait]
pub trait ByokSpi: Send + Sync + 'static {
  fn is_enabled(&self) -> bool {
    false
  }

  async fn get_settings(&self, actor_user_id: &str, workspace_id: &str) -> Result<ByokSettingsDto, DomainError>;

  async fn get_usage(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
  ) -> Result<Vec<ByokUsagePointDto>, DomainError>;

  async fn create_profile(&self, input: CreateByokProfileSpiInput) -> Result<ByokProfileDto, DomainError>;

  async fn replace_profile(&self, input: ReplaceByokProfileSpiInput) -> Result<ByokProfileDto, DomainError>;

  async fn rotate_credential(&self, input: RotateByokCredentialSpiInput) -> Result<ByokProfileDto, DomainError>;

  async fn delete_profile(
    &self,
    actor_user_id: &str,
    workspace_id: &str,
    profile_id: &str,
  ) -> Result<bool, DomainError>;

  async fn reorder_profiles(&self, input: ReorderByokProfilesSpiInput) -> Result<Vec<ByokProfileDto>, DomainError>;

  async fn probe_profile(
    &self,
    actor_user_id: &str,
    input: ProbeByokProfileSpiInput,
  ) -> Result<ByokProbeResultDto, DomainError>;

  async fn probe_draft(
    &self,
    actor_user_id: &str,
    input: ProbeByokDraftSpiInput,
  ) -> Result<ByokProbeResultDto, DomainError>;

  async fn create_local_lease(&self, input: CreateByokLocalLeaseSpiInput) -> Result<ByokLocalLeaseDto, DomainError>;
}

/// Fail-closed community BYOK SPI returning `Copilot is disabled.`.
#[derive(Clone, Copy, Debug, Default)]
pub struct CommunityByokSpi;

fn copilot_disabled() -> DomainError {
  DomainError::Forbidden("Copilot is disabled.".into())
}

#[async_trait::async_trait]
impl ByokSpi for CommunityByokSpi {
  async fn get_settings(&self, _actor_user_id: &str, _workspace_id: &str) -> Result<ByokSettingsDto, DomainError> {
    Err(copilot_disabled())
  }

  async fn get_usage(
    &self,
    _actor_user_id: &str,
    _workspace_id: &str,
    _from: DateTime<Utc>,
    _to: DateTime<Utc>,
  ) -> Result<Vec<ByokUsagePointDto>, DomainError> {
    Err(copilot_disabled())
  }

  async fn create_profile(&self, _input: CreateByokProfileSpiInput) -> Result<ByokProfileDto, DomainError> {
    Err(copilot_disabled())
  }

  async fn replace_profile(&self, _input: ReplaceByokProfileSpiInput) -> Result<ByokProfileDto, DomainError> {
    Err(copilot_disabled())
  }

  async fn rotate_credential(&self, _input: RotateByokCredentialSpiInput) -> Result<ByokProfileDto, DomainError> {
    Err(copilot_disabled())
  }

  async fn delete_profile(
    &self,
    _actor_user_id: &str,
    _workspace_id: &str,
    _profile_id: &str,
  ) -> Result<bool, DomainError> {
    Err(copilot_disabled())
  }

  async fn reorder_profiles(&self, _input: ReorderByokProfilesSpiInput) -> Result<Vec<ByokProfileDto>, DomainError> {
    Err(copilot_disabled())
  }

  async fn probe_profile(
    &self,
    _actor_user_id: &str,
    _input: ProbeByokProfileSpiInput,
  ) -> Result<ByokProbeResultDto, DomainError> {
    Err(copilot_disabled())
  }

  async fn probe_draft(
    &self,
    _actor_user_id: &str,
    _input: ProbeByokDraftSpiInput,
  ) -> Result<ByokProbeResultDto, DomainError> {
    Err(copilot_disabled())
  }

  async fn create_local_lease(&self, _input: CreateByokLocalLeaseSpiInput) -> Result<ByokLocalLeaseDto, DomainError> {
    Err(copilot_disabled())
  }
}
