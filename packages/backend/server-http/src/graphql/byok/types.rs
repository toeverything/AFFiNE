//! Copilot BYOK GraphQL enums, objects, inputs, and DTO conversions.

use std::fmt;

use async_graphql::{Enum, ID, InputObject, MaybeUndefined, SimpleObject};
use chrono::{DateTime, Utc};
use server_types::DomainError;

use crate::legacy_compat::quota::SafeInt;

macro_rules! byok_enum {
  ($name:ident, $gql:literal, [ $( $variant:ident => $str_val:literal ),+ $(,)? ]) => {
    #[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
    #[graphql(name = $gql)]
    pub enum $name {
      $( #[graphql(name = $str_val)] $variant, )+
    }
    impl $name {
      #[allow(dead_code)]
      pub(super) fn as_str(self) -> &'static str {
        match self { $( Self::$variant => $str_val, )+ }
      }
      pub(super) fn parse(s: &str) -> Result<Self, DomainError> {
        match s {
          $( $str_val => Ok(Self::$variant), )+
          _ => Err(DomainError::Internal(format!("unknown {}: {s}", $gql))),
        }
      }
    }
  };
}

byok_enum!(ByokProvider, "ByokProvider", [Anthropic => "anthropic", Fal => "fal", Gemini => "gemini", Openai => "openai"]);
byok_enum!(ByokEndpointKind, "ByokEndpointKind", [OpenaiCompatible => "openai_compatible", ProviderDefault => "provider_default"]);
byok_enum!(ByokOpenAiDialect, "ByokOpenAiDialect", [ChatCompletions => "chat_completions", Responses => "responses"]);
byok_enum!(ByokModelInput, "ByokModelInput", [Audio => "audio", File => "file", Image => "image", Text => "text"]);
byok_enum!(ByokModelOutput, "ByokModelOutput", [Embedding => "embedding", Image => "image", Object => "object", Rerank => "rerank", Structured => "structured", Text => "text"]);
byok_enum!(ByokModelFeature, "ByokModelFeature", [Reasoning => "reasoning", ToolCalling => "tool_calling", WebSearch => "web_search"]);
byok_enum!(ByokAttachmentKind, "ByokAttachmentKind", [Audio => "audio", File => "file", Image => "image"]);
byok_enum!(ByokAttachmentSource, "ByokAttachmentSource", [Bytes => "bytes", Data => "data", FileHandle => "file_handle", Url => "url"]);
byok_enum!(ByokProbeOperation, "ByokProbeOperation", [Chat => "chat", Embedding => "embedding", Image => "image", Rerank => "rerank", Structured => "structured", ToolCalling => "tool_calling", Transcript => "transcript", Vision => "vision"]);
byok_enum!(ByokProbeStatusKind, "ByokProbeStatusKind", [Failed => "failed", NotTested => "not_tested", Verified => "verified"]);
byok_enum!(ByokCustomEndpointMode, "ByokCustomEndpointMode", [Disabled => "disabled", Enabled => "enabled", Unavailable => "unavailable"]);

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokCapabilityType")]
pub struct WorkspaceByokCapabilityType {
  pub input: Vec<ByokModelInput>,
  pub output: Vec<ByokModelOutput>,
  pub features: Vec<ByokModelFeature>,
  pub attachment_kinds: Vec<ByokAttachmentKind>,
  pub attachment_sources: Vec<ByokAttachmentSource>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokModelDeclarationType")]
pub struct WorkspaceByokModelDeclarationType {
  pub model_id: String,
  pub enabled: bool,
  pub capabilities: Vec<WorkspaceByokCapabilityType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokEndpointType")]
pub struct WorkspaceByokEndpointType {
  pub kind: ByokEndpointKind,
  pub url: Option<String>,
  pub dialect: Option<ByokOpenAiDialect>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokProfileDefinitionType")]
pub struct WorkspaceByokProfileDefinitionType {
  pub endpoint: WorkspaceByokEndpointType,
  pub models: Vec<WorkspaceByokModelDeclarationType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokProbeStatusType")]
pub struct WorkspaceByokProbeStatusType {
  pub kind: ByokProbeStatusKind,
  pub tested_at: Option<DateTime<Utc>>,
  pub error_kind: Option<String>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokModelProbeCheckType")]
pub struct WorkspaceByokModelProbeCheckType {
  pub operation: ByokProbeOperation,
  pub status: WorkspaceByokProbeStatusType,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokModelProbeType")]
pub struct WorkspaceByokModelProbeType {
  pub model_id: String,
  pub checks: Vec<WorkspaceByokModelProbeCheckType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokValidationType")]
pub struct WorkspaceByokValidationType {
  pub definition_fingerprint: String,
  pub credential_generation: SafeInt,
  pub connection: WorkspaceByokProbeStatusType,
  pub models: Vec<WorkspaceByokModelProbeType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokProbeResultType")]
pub struct WorkspaceByokProbeResultType {
  pub definition_fingerprint: String,
  pub stale: bool,
  pub connection: WorkspaceByokProbeStatusType,
  pub models: Vec<WorkspaceByokModelProbeType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokProfileType")]
pub struct WorkspaceByokProfileType {
  pub profile_id: ID,
  pub workspace_id: String,
  pub provider: ByokProvider,
  pub name: String,
  pub description: Option<String>,
  pub definition: WorkspaceByokProfileDefinitionType,
  pub enabled: bool,
  pub sort_order: SafeInt,
  pub revision: SafeInt,
  pub validation: Option<WorkspaceByokValidationType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokCatalogModelType")]
pub struct WorkspaceByokCatalogModelType {
  pub model_id: String,
  pub display_name: String,
  pub recommended: bool,
  pub capabilities: Vec<WorkspaceByokCapabilityType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokCatalogProviderType")]
pub struct WorkspaceByokCatalogProviderType {
  pub provider: ByokProvider,
  pub models: Vec<WorkspaceByokCatalogModelType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokCatalogType")]
pub struct WorkspaceByokCatalogType {
  pub version: String,
  pub providers: Vec<WorkspaceByokCatalogProviderType>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokPolicyType")]
pub struct WorkspaceByokPolicyType {
  pub enabled: bool,
  pub allowed_providers: Vec<ByokProvider>,
  pub custom_endpoint_mode: ByokCustomEndpointMode,
  pub private_endpoint_supported: bool,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokSettingsType")]
pub struct WorkspaceByokSettingsType {
  pub workspace_id: String,
  pub entitled: bool,
  pub server_entitled: bool,
  pub local_entitled: bool,
  pub profiles: Vec<WorkspaceByokProfileType>,
  pub policy: WorkspaceByokPolicyType,
  pub catalog: WorkspaceByokCatalogType,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokUsagePointType")]
pub struct WorkspaceByokUsagePointType {
  pub date: DateTime<Utc>,
  pub feature_kind: String,
  pub total_tokens: SafeInt,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "CreateWorkspaceByokLocalLeaseResultType")]
pub struct CreateWorkspaceByokLocalLeaseResultType {
  pub lease_id: String,
  pub expires_at: DateTime<Utc>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokCapabilityInput")]
pub struct WorkspaceByokCapabilityInput {
  pub input: Vec<ByokModelInput>,
  pub output: Vec<ByokModelOutput>,
  pub features: Vec<ByokModelFeature>,
  pub attachment_kinds: Vec<ByokAttachmentKind>,
  pub attachment_sources: Vec<ByokAttachmentSource>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokModelDeclarationInput")]
pub struct WorkspaceByokModelDeclarationInput {
  pub model_id: String,
  pub enabled: bool,
  pub capabilities: Vec<WorkspaceByokCapabilityInput>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokEndpointInput")]
pub struct WorkspaceByokEndpointInput {
  pub kind: ByokEndpointKind,
  pub url: Option<String>,
  pub dialect: Option<ByokOpenAiDialect>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokProfileDefinitionInput")]
pub struct WorkspaceByokProfileDefinitionInput {
  pub endpoint: WorkspaceByokEndpointInput,
  pub models: Vec<WorkspaceByokModelDeclarationInput>,
}

#[derive(InputObject, Clone)]
#[graphql(name = "CreateWorkspaceByokProfileInput")]
pub struct CreateWorkspaceByokProfileInput {
  pub workspace_id: String,
  pub provider: ByokProvider,
  pub name: String,
  pub description: MaybeUndefined<String>,
  pub credential: String,
  pub definition: WorkspaceByokProfileDefinitionInput,
  pub enabled: bool,
}

impl fmt::Debug for CreateWorkspaceByokProfileInput {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("CreateWorkspaceByokProfileInput")
      .field("workspace_id", &self.workspace_id)
      .field("provider", &self.provider)
      .field("name", &self.name)
      .field("description", &self.description)
      .field("credential", &"[REDACTED]")
      .field("definition", &self.definition)
      .field("enabled", &self.enabled)
      .finish()
  }
}

#[derive(InputObject, Clone)]
#[graphql(name = "ReplaceWorkspaceByokProfileInput")]
pub struct ReplaceWorkspaceByokProfileInput {
  pub workspace_id: String,
  pub profile_id: ID,
  pub expected_revision: SafeInt,
  pub name: String,
  pub description: MaybeUndefined<String>,
  pub definition: WorkspaceByokProfileDefinitionInput,
  pub credential: Option<String>,
  pub enabled: bool,
}

impl fmt::Debug for ReplaceWorkspaceByokProfileInput {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("ReplaceWorkspaceByokProfileInput")
      .field("workspace_id", &self.workspace_id)
      .field("profile_id", &self.profile_id)
      .field("expected_revision", &self.expected_revision)
      .field("name", &self.name)
      .field("description", &self.description)
      .field("definition", &self.definition)
      .field("credential", &self.credential.as_ref().map(|_| "[REDACTED]"))
      .field("enabled", &self.enabled)
      .finish()
  }
}

#[derive(InputObject, Clone)]
#[graphql(name = "RotateWorkspaceByokCredentialInput")]
pub struct RotateWorkspaceByokCredentialInput {
  pub workspace_id: String,
  pub profile_id: ID,
  pub expected_revision: SafeInt,
  pub credential: String,
}

impl fmt::Debug for RotateWorkspaceByokCredentialInput {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("RotateWorkspaceByokCredentialInput")
      .field("workspace_id", &self.workspace_id)
      .field("profile_id", &self.profile_id)
      .field("expected_revision", &self.expected_revision)
      .field("credential", &"[REDACTED]")
      .finish()
  }
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokProbeCheckInput")]
pub struct WorkspaceByokProbeCheckInput {
  pub model_id: String,
  pub operation: ByokProbeOperation,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "ProbeWorkspaceByokProfileInput")]
pub struct ProbeWorkspaceByokProfileInput {
  pub workspace_id: String,
  pub profile_id: ID,
  pub checks: Vec<WorkspaceByokProbeCheckInput>,
}

#[derive(InputObject, Clone)]
#[graphql(name = "ProbeWorkspaceByokDraftInput")]
pub struct ProbeWorkspaceByokDraftInput {
  pub workspace_id: String,
  pub provider: ByokProvider,
  pub credential: Option<String>,
  pub profile_id: Option<ID>,
  pub expected_revision: Option<SafeInt>,
  pub definition: WorkspaceByokProfileDefinitionInput,
  pub checks: Vec<WorkspaceByokProbeCheckInput>,
}

impl fmt::Debug for ProbeWorkspaceByokDraftInput {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("ProbeWorkspaceByokDraftInput")
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

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "WorkspaceByokProfileOrderInput")]
pub struct WorkspaceByokProfileOrderInput {
  pub profile_id: ID,
  pub expected_revision: SafeInt,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "ReorderWorkspaceByokProfilesInput")]
pub struct ReorderWorkspaceByokProfilesInput {
  pub workspace_id: String,
  pub profiles: Vec<WorkspaceByokProfileOrderInput>,
}

#[derive(InputObject, Clone)]
#[graphql(name = "CreateWorkspaceByokLocalLeaseProviderInput")]
pub struct CreateWorkspaceByokLocalLeaseProviderInput {
  pub provider: ByokProvider,
  pub name: String,
  pub description: MaybeUndefined<String>,
  pub credential: String,
  pub definition: WorkspaceByokProfileDefinitionInput,
  pub enabled: bool,
}

impl fmt::Debug for CreateWorkspaceByokLocalLeaseProviderInput {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("CreateWorkspaceByokLocalLeaseProviderInput")
      .field("provider", &self.provider)
      .field("name", &self.name)
      .field("description", &self.description)
      .field("credential", &"[REDACTED]")
      .field("definition", &self.definition)
      .field("enabled", &self.enabled)
      .finish()
  }
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "CreateWorkspaceByokLocalLeaseInput")]
pub struct CreateWorkspaceByokLocalLeaseInput {
  pub workspace_id: String,
  pub providers: Vec<CreateWorkspaceByokLocalLeaseProviderInput>,
}
