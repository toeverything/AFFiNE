use std::collections::HashSet;

use llm_adapter::{
  capability::{
    AttachmentKind, AttachmentSource, DeclaredModelCapability, ModelFeature, ModelInput, ModelOutput,
    provider_default_capability_upper_bound, validate_capability_upper_bound, validate_declared_capability,
  },
  target::{OpenAiDialect, canonicalize_endpoint},
};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ByokCapabilityInput {
  pub input: Vec<String>,
  pub output: Vec<String>,
  pub features: Vec<String>,
  pub attachment_kinds: Vec<String>,
  pub attachment_sources: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ByokModelDeclarationInput {
  pub model_id: String,
  pub enabled: bool,
  pub capabilities: Vec<ByokCapabilityInput>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ByokEndpointInput {
  pub kind: String,
  pub url: Option<String>,
  pub dialect: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ByokProfileDefinitionInput {
  pub endpoint: ByokEndpointInput,
  pub models: Vec<ByokModelDeclarationInput>,
}

#[derive(Clone)]
#[napi_derive::napi(object)]
pub struct CreateByokProfileInput {
  pub workspace_id: String,
  pub provider: String,
  pub name: String,
  pub description: Option<String>,
  pub credential: String,
  pub definition: ByokProfileDefinitionInput,
  pub enabled: bool,
  pub actor_user_id: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ReplaceByokProfileInput {
  pub workspace_id: String,
  pub profile_id: String,
  pub expected_revision: i32,
  pub name: String,
  pub description: Option<String>,
  pub definition: ByokProfileDefinitionInput,
  pub credential: Option<String>,
  pub enabled: bool,
  pub actor_user_id: String,
}

#[derive(Clone)]
#[napi_derive::napi(object)]
pub struct RotateByokCredentialInput {
  pub workspace_id: String,
  pub profile_id: String,
  pub expected_revision: i32,
  pub credential: String,
  pub actor_user_id: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ByokProfileOrderInput {
  pub profile_id: String,
  pub expected_revision: i32,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ReorderByokProfilesInput {
  pub workspace_id: String,
  pub profiles: Vec<ByokProfileOrderInput>,
  pub actor_user_id: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ProbeByokProfileInput {
  pub workspace_id: String,
  pub profile_id: String,
  pub checks: Vec<ByokProbeCheckInput>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ProbeByokDraftInput {
  pub workspace_id: String,
  pub provider: String,
  pub credential: Option<String>,
  pub profile_id: Option<String>,
  pub expected_revision: Option<i32>,
  pub definition: ByokProfileDefinitionInput,
  pub checks: Vec<ByokProbeCheckInput>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ByokProbeCheckInput {
  pub model_id: String,
  pub operation: String,
}

#[derive(Clone)]
#[napi_derive::napi(object)]
pub struct CreateByokLocalLeaseProviderInput {
  pub provider: String,
  pub name: String,
  pub description: Option<String>,
  pub credential: String,
  pub definition: ByokProfileDefinitionInput,
  pub enabled: bool,
}

#[derive(Clone)]
#[napi_derive::napi(object)]
pub struct CreateByokLocalLeaseInput {
  pub workspace_id: String,
  pub user_id: String,
  pub providers: Vec<CreateByokLocalLeaseProviderInput>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ByokLocalLeaseOutput {
  pub lease_id: String,
  pub expires_at_ms: i64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ByokProfileOutput {
  pub profile_id: String,
  pub workspace_id: String,
  pub provider: String,
  pub name: String,
  pub description: Option<String>,
  pub definition: ByokProfileDefinitionInput,
  pub enabled: bool,
  pub sort_order: i32,
  pub revision: i32,
  pub validation: Option<ByokValidationOutput>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ByokProbeStatusOutput {
  pub kind: String,
  pub tested_at_ms: Option<i64>,
  pub error_kind: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ByokModelProbeOutput {
  pub model_id: String,
  pub checks: Vec<ByokModelProbeCheckOutput>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ByokModelProbeCheckOutput {
  pub operation: String,
  pub status: ByokProbeStatusOutput,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ByokValidationOutput {
  pub definition_fingerprint: String,
  pub credential_generation: i32,
  pub connection: ByokProbeStatusOutput,
  pub models: Vec<ByokModelProbeOutput>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[napi_derive::napi(object)]
pub struct ByokProbeResultOutput {
  pub definition_fingerprint: String,
  pub stale: bool,
  pub connection: ByokProbeStatusOutput,
  pub models: Vec<ByokModelProbeOutput>,
}

#[derive(Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum ByokEndpoint {
  ProviderDefault,
  OpenAiCompatible { url: String, dialect: OpenAiDialect },
}

#[derive(Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ByokModelDeclaration {
  pub(crate) model_id: String,
  pub(crate) enabled: bool,
  pub(crate) capabilities: Vec<DeclaredModelCapability>,
}

#[derive(Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ByokProfileDefinition {
  pub(crate) endpoint: ByokEndpoint,
  pub(crate) models: Vec<ByokModelDeclaration>,
}

#[derive(Debug, Error)]
pub(crate) enum ByokContractError {
  #[error("unsupported BYOK provider")]
  Provider,
  #[error("{0} is required")]
  Required(&'static str),
  #[error("duplicate {0}")]
  Duplicate(&'static str),
  #[error("invalid BYOK endpoint")]
  Endpoint,
  #[error("invalid model capability: {0}")]
  Capability(String),
  #[error("declared capability exceeds provider or model upper bound")]
  CapabilityUpperBound,
}

impl ByokProfileDefinition {
  pub(crate) fn endpoint_identity(&self) -> &str {
    match &self.endpoint {
      ByokEndpoint::ProviderDefault => "default",
      ByokEndpoint::OpenAiCompatible { url, .. } => url,
    }
  }
}

pub(crate) fn validate_definition(
  provider: &str,
  input: ByokProfileDefinitionInput,
) -> Result<ByokProfileDefinition, ByokContractError> {
  if !matches!(provider, "openai" | "anthropic" | "gemini" | "fal") {
    return Err(ByokContractError::Provider);
  }
  let endpoint = match (
    input.endpoint.kind.as_str(),
    input.endpoint.url,
    input.endpoint.dialect.as_deref(),
  ) {
    ("provider_default", None, None) => ByokEndpoint::ProviderDefault,
    ("openai_compatible", Some(url), Some(dialect)) if provider == "openai" && !url.trim().is_empty() => {
      ByokEndpoint::OpenAiCompatible {
        url: canonicalize_endpoint(&url).map_err(|_| ByokContractError::Endpoint)?,
        dialect: match dialect {
          "responses" => OpenAiDialect::Responses,
          "chat_completions" => OpenAiDialect::ChatCompletions,
          _ => return Err(ByokContractError::Endpoint),
        },
      }
    }
    _ => return Err(ByokContractError::Endpoint),
  };
  if input.models.is_empty() {
    return Err(ByokContractError::Required("models"));
  }

  let mut ids = HashSet::new();
  let mut models = Vec::with_capacity(input.models.len());
  for model in input.models {
    let model_id = model.model_id.trim().to_string();
    if model_id.is_empty() || model_id.len() > 512 {
      return Err(ByokContractError::Required("modelId"));
    }
    if !ids.insert(model_id.clone()) {
      return Err(ByokContractError::Duplicate("modelId"));
    }
    if model.capabilities.is_empty() {
      return Err(ByokContractError::Required("capabilities"));
    }
    let capabilities = model
      .capabilities
      .into_iter()
      .map(parse_capability)
      .collect::<Result<Vec<_>, _>>()?;
    validate_upper_bound(provider, &endpoint, &model_id, &capabilities)?;
    models.push(ByokModelDeclaration {
      model_id,
      enabled: model.enabled,
      capabilities,
    });
  }

  Ok(ByokProfileDefinition { endpoint, models })
}

fn parse_capability(input: ByokCapabilityInput) -> Result<DeclaredModelCapability, ByokContractError> {
  let capability = DeclaredModelCapability {
    input: parse_values(input.input, |value| match value {
      "text" => Some(ModelInput::Text),
      "image" => Some(ModelInput::Image),
      "audio" => Some(ModelInput::Audio),
      "file" => Some(ModelInput::File),
      _ => None,
    })?,
    output: parse_values(input.output, |value| match value {
      "text" => Some(ModelOutput::Text),
      "object" => Some(ModelOutput::Object),
      "structured" => Some(ModelOutput::Structured),
      "embedding" => Some(ModelOutput::Embedding),
      "rerank" => Some(ModelOutput::Rerank),
      "image" => Some(ModelOutput::Image),
      _ => None,
    })?,
    features: parse_values(input.features, |value| match value {
      "tool_calling" => Some(ModelFeature::ToolCalling),
      "reasoning" => Some(ModelFeature::Reasoning),
      "web_search" => Some(ModelFeature::WebSearch),
      _ => None,
    })?,
    attachment_kinds: parse_values(input.attachment_kinds, |value| match value {
      "image" => Some(AttachmentKind::Image),
      "audio" => Some(AttachmentKind::Audio),
      "file" => Some(AttachmentKind::File),
      _ => None,
    })?,
    attachment_sources: parse_values(input.attachment_sources, |value| match value {
      "url" => Some(AttachmentSource::Url),
      "data" => Some(AttachmentSource::Data),
      "bytes" => Some(AttachmentSource::Bytes),
      "file_handle" => Some(AttachmentSource::FileHandle),
      _ => None,
    })?,
  };
  validate_declared_capability(&capability).map_err(|error| ByokContractError::Capability(error.to_string()))?;
  Ok(capability)
}

fn parse_values<T>(values: Vec<String>, parse: impl Fn(&str) -> Option<T>) -> Result<Vec<T>, ByokContractError> {
  values
    .into_iter()
    .map(|value| parse(&value).ok_or_else(|| ByokContractError::Capability(format!("unknown enum {value}"))))
    .collect()
}

fn validate_upper_bound(
  provider: &str,
  endpoint: &ByokEndpoint,
  model_id: &str,
  capabilities: &[DeclaredModelCapability],
) -> Result<(), ByokContractError> {
  if provider == "fal"
    && capabilities.iter().any(|capability| {
      capability.output.iter().any(|output| *output != ModelOutput::Image)
        || capability
          .input
          .iter()
          .any(|input| !matches!(input, ModelInput::Text | ModelInput::Image))
    })
  {
    return Err(ByokContractError::CapabilityUpperBound);
  }
  if matches!(endpoint, ByokEndpoint::OpenAiCompatible { .. }) {
    return Ok(());
  }

  let upper_bound =
    provider_default_capability_upper_bound(provider, model_id).ok_or(ByokContractError::CapabilityUpperBound)?;
  for capability in capabilities {
    validate_capability_upper_bound(capability, &upper_bound).map_err(|_| ByokContractError::CapabilityUpperBound)?;
  }
  Ok(())
}

fn input_name(value: &ModelInput) -> &'static str {
  match value {
    ModelInput::Text => "text",
    ModelInput::Image => "image",
    ModelInput::Audio => "audio",
    ModelInput::File => "file",
  }
}

fn output_name(value: &ModelOutput) -> &'static str {
  match value {
    ModelOutput::Text => "text",
    ModelOutput::Object => "object",
    ModelOutput::Structured => "structured",
    ModelOutput::Embedding => "embedding",
    ModelOutput::Rerank => "rerank",
    ModelOutput::Image => "image",
  }
}

fn attachment_kind_name(value: &AttachmentKind) -> &'static str {
  match value {
    AttachmentKind::Image => "image",
    AttachmentKind::Audio => "audio",
    AttachmentKind::File => "file",
  }
}

fn attachment_source_name(value: &AttachmentSource) -> &'static str {
  match value {
    AttachmentSource::Url => "url",
    AttachmentSource::Data => "data",
    AttachmentSource::Bytes => "bytes",
    AttachmentSource::FileHandle => "file_handle",
  }
}

impl From<ByokProfileDefinition> for ByokProfileDefinitionInput {
  fn from(definition: ByokProfileDefinition) -> Self {
    Self {
      endpoint: match definition.endpoint {
        ByokEndpoint::ProviderDefault => ByokEndpointInput {
          kind: "provider_default".to_string(),
          url: None,
          dialect: None,
        },
        ByokEndpoint::OpenAiCompatible { url, dialect } => ByokEndpointInput {
          kind: "openai_compatible".to_string(),
          url: Some(url),
          dialect: Some(
            match dialect {
              OpenAiDialect::Responses => "responses",
              OpenAiDialect::ChatCompletions => "chat_completions",
            }
            .to_string(),
          ),
        },
      },
      models: definition
        .models
        .into_iter()
        .map(|model| ByokModelDeclarationInput {
          model_id: model.model_id,
          enabled: model.enabled,
          capabilities: model.capabilities.into_iter().map(capability_input).collect(),
        })
        .collect(),
    }
  }
}

pub(super) fn capability_input(capability: DeclaredModelCapability) -> ByokCapabilityInput {
  ByokCapabilityInput {
    input: capability.input.iter().map(input_name).map(str::to_string).collect(),
    output: capability.output.iter().map(output_name).map(str::to_string).collect(),
    features: capability
      .features
      .iter()
      .map(|value| match value {
        ModelFeature::ToolCalling => "tool_calling",
        ModelFeature::Reasoning => "reasoning",
        ModelFeature::WebSearch => "web_search",
      })
      .map(str::to_string)
      .collect(),
    attachment_kinds: capability
      .attachment_kinds
      .iter()
      .map(attachment_kind_name)
      .map(str::to_string)
      .collect(),
    attachment_sources: capability
      .attachment_sources
      .iter()
      .map(attachment_source_name)
      .map(str::to_string)
      .collect(),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn definition(model_id: &str, capabilities: Vec<ByokCapabilityInput>) -> ByokProfileDefinitionInput {
    ByokProfileDefinitionInput {
      endpoint: ByokEndpointInput {
        kind: "openai_compatible".to_string(),
        url: Some("https://example.com/v1/".to_string()),
        dialect: Some("responses".to_string()),
      },
      models: vec![ByokModelDeclarationInput {
        model_id: model_id.to_string(),
        enabled: true,
        capabilities,
      }],
    }
  }

  fn text_capability() -> ByokCapabilityInput {
    ByokCapabilityInput {
      input: vec!["text".to_string()],
      output: vec!["text".to_string()],
      features: vec![],
      attachment_kinds: vec![],
      attachment_sources: vec![],
    }
  }

  #[test]
  fn keeps_opaque_model_id_and_explicit_empty_features() {
    let validated =
      validate_definition("openai", definition(" vendor/model:latest ", vec![text_capability()])).unwrap();
    assert_eq!(validated.models[0].model_id, "vendor/model:latest");
    assert!(validated.models[0].capabilities[0].features.is_empty());
    assert_eq!(validated.endpoint_identity(), "https://example.com/v1");
  }

  #[test]
  fn rejects_invalid_shapes_table() {
    let mut cases = Vec::new();
    cases.push(ByokProfileDefinitionInput {
      models: vec![],
      ..definition("model", vec![text_capability()])
    });
    cases.push(definition("", vec![text_capability()]));
    cases.push(definition("model", vec![]));
    let mut empty_input = text_capability();
    empty_input.input.clear();
    cases.push(definition("model", vec![empty_input]));
    let mut duplicate = text_capability();
    duplicate.output.push("text".to_string());
    cases.push(definition("model", vec![duplicate]));
    assert!(
      cases
        .into_iter()
        .all(|case| validate_definition("openai", case).is_err())
    );
  }

  #[test]
  fn rejects_endpoint_tag_mismatches() {
    for endpoint in [
      ByokEndpointInput {
        kind: "provider_default".to_string(),
        url: Some("https://example.com".to_string()),
        dialect: None,
      },
      ByokEndpointInput {
        kind: "openai_compatible".to_string(),
        url: None,
        dialect: Some("responses".to_string()),
      },
      ByokEndpointInput {
        kind: "openai_compatible".to_string(),
        url: Some(" ".to_string()),
        dialect: Some("responses".to_string()),
      },
    ] {
      let mut input = definition("model", vec![text_capability()]);
      input.endpoint = endpoint;
      assert!(validate_definition("openai", input).is_err());
    }
  }
}
