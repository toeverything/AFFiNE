use std::{
  collections::{HashMap, HashSet},
  sync::Arc,
};

use gcp_auth::{CustomServiceAccount, TokenProvider};
use llm_adapter::{
  backend::{BackendError, DefaultHttpClient},
  capability::{AttachmentKind, AttachmentSource},
  core::{CoreContent, ImageInput, ImageRequest},
  router::{ExecutablePreparedRoute, ExecutableProtocol, ExecutableRequest, ExecutableResponse},
  target::{
    BackendCredential, BackendEndpoint, BackendOperation, BackendProtocol, BackendProvider, BackendTargetInput,
    EgressPolicy, compile_backend_target,
  },
};
use llm_runtime::{CompiledPlan, CompiledRoute, RuntimeRouteEvent, RuntimeUsage, dispatch_compiled_plan};
use serde::Serialize;
use uuid::Uuid;
use zeroize::Zeroizing;

use super::{RuntimeError, RuntimeResult, context};
use crate::{
  llm::{
    byok::{ByokEndpoint, CredentialEnvelopeKey},
    route::{
      AuthorizedProfileRef, AuthorizedTargetRef, CatalogSlot, CredentialRef, RouteOperation, with_request_requirements,
    },
  },
  runtime::{BackendRuntimeConfig, CopilotManagedProfileConfig},
};

#[derive(Serialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub(super) enum ProductEvent {
  RouteSelected { route: RouteIdentity },
  RouteFailed { route: RouteIdentity, error_kind: String },
  Usage { route: RouteIdentity, usage: ProductUsage },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RouteIdentity {
  profile_id: String,
  source: &'static str,
  provider: String,
  model: String,
}

#[derive(Serialize)]
#[serde(untagged)]
pub(super) enum ProductUsage {
  Tokens(llm_adapter::core::CoreUsage),
  Image(llm_adapter::core::ImageUsage),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CopilotExecutionResult {
  events: Vec<ProductEvent>,
  result: serde_json::Value,
}

pub(super) struct CompiledExecution {
  pub(super) plan: CompiledPlan,
  identities: HashMap<String, RouteIdentity>,
}

impl CompiledExecution {
  pub(super) fn project(&self, event: RuntimeRouteEvent) -> RuntimeResult<ProductEvent> {
    project_event(event, &self.identities)
  }
}

pub(super) fn request_and_slot(
  slot: CatalogSlot,
  request: serde_json::Value,
) -> RuntimeResult<(CatalogSlot, ExecutableRequest)> {
  let executable = match slot.operation {
    RouteOperation::Chat => ExecutableRequest::Chat(parse_request(request)?),
    RouteOperation::Structured | RouteOperation::Transcription => {
      ExecutableRequest::Structured(parse_request(request)?)
    }
    RouteOperation::Embedding => ExecutableRequest::Embedding(parse_request(request)?),
    RouteOperation::Rerank => ExecutableRequest::Rerank(parse_request(request)?),
    RouteOperation::Image => ExecutableRequest::Image(Box::new(parse_request(request)?)),
  };
  let (needs_tools, attachment_kinds, attachment_sources) = request_requirements(&executable);
  Ok((
    with_request_requirements(slot, needs_tools, attachment_kinds, attachment_sources),
    executable,
  ))
}

pub(super) fn execute(
  config: Arc<BackendRuntimeConfig>,
  slot: CatalogSlot,
  request: ExecutableRequest,
  profiles: Vec<AuthorizedProfileRef>,
  candidates: Vec<AuthorizedTargetRef>,
  managed_credentials: HashMap<String, Zeroizing<String>>,
) -> RuntimeResult<CopilotExecutionResult> {
  let execution = compile_execution(&config, slot, request, &profiles, &candidates, &managed_credentials)?;
  let mut runtime_events = Vec::new();
  let response = dispatch_compiled_plan(&DefaultHttpClient::default(), &execution.plan, |event| {
    runtime_events.push(event)
  })
  .map_err(|error| RuntimeError::invalid_state(error.to_string()))?;
  let events = runtime_events
    .into_iter()
    .map(|event| execution.project(event))
    .collect::<RuntimeResult<Vec<_>>>()?;
  Ok(CopilotExecutionResult {
    events,
    result: response_value(response)?,
  })
}

pub(super) fn compile_execution(
  config: &BackendRuntimeConfig,
  slot: CatalogSlot,
  request: ExecutableRequest,
  profiles: &[AuthorizedProfileRef],
  candidates: &[AuthorizedTargetRef],
  managed_credentials: &HashMap<String, Zeroizing<String>>,
) -> RuntimeResult<CompiledExecution> {
  let key = CredentialEnvelopeKey::derive(config.private_key.as_bytes())
    .map_err(|_| RuntimeError::invalid_state("credential_unavailable"))?;
  let mut identities = HashMap::new();
  let mut routes = Vec::with_capacity(candidates.len());
  for candidate in candidates {
    let profile = profiles
      .get(candidate.profile_index)
      .ok_or_else(|| RuntimeError::invalid_state("invalid authorized route profile"))?;
    let model = profile
      .definition
      .models
      .get(candidate.model_index)
      .ok_or_else(|| RuntimeError::invalid_state("invalid authorized route model"))?;
    let credential = resolve_credential(&key, profile, managed_credentials)?;
    let target = compile_backend_target(BackendTargetInput {
      provider: provider(&profile.provider)?,
      operation: operation(slot.operation),
      endpoint: endpoint(&profile.provider, &profile.definition.endpoint),
      model: model.model_id.clone(),
      credential: BackendCredential::new(credential),
      timeout_ms: None,
      egress_policy: if profile.source != crate::llm::route::ProfileSource::Managed
        && config.copilot.byok.allow_private_endpoint
      {
        EgressPolicy::AllowPrivate
      } else {
        EgressPolicy::PublicOnly
      },
    })
    .map_err(|error| RuntimeError::invalid_state(error.to_string()))?;
    let route_id = Uuid::new_v4().to_string();
    identities.insert(
      route_id.clone(),
      RouteIdentity {
        profile_id: profile.profile_id.clone(),
        source: match profile.source {
          crate::llm::route::ProfileSource::Server => "server",
          crate::llm::route::ProfileSource::Local => "local",
          crate::llm::route::ProfileSource::Managed => "affine_cloud",
        },
        provider: profile.provider.clone(),
        model: target.model.clone(),
      },
    );
    let protocol = protocol(target.protocol);
    let route = ExecutablePreparedRoute::new(protocol, target.model, target.config, request.clone())
      .map_err(|error| RuntimeError::invalid_input(error.to_string()))?;
    routes.push(CompiledRoute::new(route_id, route));
  }
  Ok(CompiledExecution {
    plan: CompiledPlan::new(routes).map_err(|error| RuntimeError::invalid_state(error.to_string()))?,
    identities,
  })
}

fn parse_request<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> RuntimeResult<T> {
  serde_json::from_value(value).map_err(|error| RuntimeError::json("invalid copilot execution request", error))
}

fn request_requirements(request: &ExecutableRequest) -> (bool, Vec<AttachmentKind>, Vec<AttachmentSource>) {
  let mut kinds = HashSet::new();
  let mut sources = HashSet::new();
  let needs_tools = match request {
    ExecutableRequest::Chat(request) => {
      collect_message_attachments(&request.messages, &mut kinds, &mut sources);
      !request.tools.is_empty()
    }
    ExecutableRequest::Structured(request) => {
      collect_message_attachments(&request.messages, &mut kinds, &mut sources);
      false
    }
    ExecutableRequest::Image(request) => {
      if let ImageRequest::Edit(request) = request.as_ref() {
        kinds.insert(AttachmentKind::Image);
        for image in &request.images {
          sources.insert(match image {
            ImageInput::Url { .. } => AttachmentSource::Url,
            ImageInput::Data { .. } => AttachmentSource::Data,
            ImageInput::Bytes { .. } => AttachmentSource::Bytes,
          });
        }
      }
      false
    }
    ExecutableRequest::Embedding(_) | ExecutableRequest::Rerank(_) => false,
  };
  (needs_tools, kinds.into_iter().collect(), sources.into_iter().collect())
}

fn collect_message_attachments(
  messages: &[llm_adapter::core::CoreMessage],
  kinds: &mut HashSet<AttachmentKind>,
  sources: &mut HashSet<AttachmentSource>,
) {
  for content in messages.iter().flat_map(|message| &message.content) {
    let source = match content {
      CoreContent::Image { source } => {
        kinds.insert(AttachmentKind::Image);
        source
      }
      CoreContent::Audio { source } => {
        kinds.insert(AttachmentKind::Audio);
        source
      }
      CoreContent::File { source } => {
        kinds.insert(AttachmentKind::File);
        source
      }
      _ => continue,
    };
    let source_kind = if source.get("url").is_some() {
      AttachmentSource::Url
    } else if source.get("data").is_some() || source.get("data_base64").is_some() {
      AttachmentSource::Data
    } else if source.get("bytes").is_some() {
      AttachmentSource::Bytes
    } else {
      AttachmentSource::FileHandle
    };
    sources.insert(source_kind);
  }
}

fn resolve_credential(
  key: &CredentialEnvelopeKey,
  profile: &AuthorizedProfileRef,
  managed_credentials: &HashMap<String, Zeroizing<String>>,
) -> RuntimeResult<String> {
  match &profile.credential_ref {
    CredentialRef::Envelope { encrypted, aad } => key
      .decrypt(encrypted, aad)
      .map_err(|_| RuntimeError::invalid_state("credential_unavailable"))
      .and_then(|credential| {
        String::from_utf8(credential.expose().to_vec())
          .map_err(|_| RuntimeError::invalid_state("credential_unavailable"))
      }),
    CredentialRef::Managed { profile_id } => managed_credentials
      .get(profile_id)
      .map(|credential| credential.as_str().to_string())
      .ok_or_else(|| RuntimeError::invalid_state("managed copilot credential unavailable")),
  }
}

pub(super) async fn resolve_managed_credentials(
  config: &BackendRuntimeConfig,
  profiles: &[AuthorizedProfileRef],
  candidates: &[AuthorizedTargetRef],
) -> RuntimeResult<HashMap<String, Zeroizing<String>>> {
  let mut credentials = HashMap::new();
  for candidate in candidates {
    let profile = profiles
      .get(candidate.profile_index)
      .ok_or_else(|| RuntimeError::invalid_state("invalid authorized route profile"))?;
    let CredentialRef::Managed { profile_id } = &profile.credential_ref else {
      continue;
    };
    if credentials.contains_key(profile_id) {
      continue;
    }
    let managed = context::managed_profile(&config.copilot, profile_id)?;
    credentials.insert(profile_id.clone(), Zeroizing::new(managed_credential(managed).await?));
  }
  Ok(credentials)
}

async fn managed_credential(profile: &CopilotManagedProfileConfig) -> RuntimeResult<String> {
  if matches!(profile.provider.as_str(), "geminiVertex" | "anthropicVertex") {
    let provider: Arc<dyn TokenProvider> =
      if let Some(credentials) = profile.config.pointer("/googleAuthOptions/credentials") {
        let project = context::required_config_text(profile, "project")?.to_string();
        let mut credentials = credentials.clone();
        let object = credentials
          .as_object_mut()
          .ok_or_else(|| RuntimeError::invalid_state("managed Vertex credentials must be an object"))?;
        object
          .entry("type")
          .or_insert_with(|| serde_json::Value::String("service_account".to_string()));
        object
          .entry("project_id")
          .or_insert_with(|| serde_json::Value::String(project));
        object
          .entry("token_uri")
          .or_insert_with(|| serde_json::Value::String("https://oauth2.googleapis.com/token".to_string()));
        let json = serde_json::to_string(&credentials)
          .map_err(|error| RuntimeError::json("serialize managed Vertex credentials failed", error))?;
        Arc::new(
          CustomServiceAccount::from_json(&json)
            .map_err(|_| RuntimeError::invalid_state("managed Vertex credential unavailable"))?,
        )
      } else {
        gcp_auth::provider()
          .await
          .map_err(|_| RuntimeError::invalid_state("managed Vertex credential unavailable"))?
      };
    return provider
      .token(&["https://www.googleapis.com/auth/cloud-platform"])
      .await
      .map(|token| token.as_str().to_string())
      .map_err(|_| RuntimeError::invalid_state("managed Vertex credential unavailable"));
  }
  let field = if profile.provider == "cloudflareWorkersAi" {
    "apiToken"
  } else {
    "apiKey"
  };
  Ok(context::required_config_text(profile, field)?.to_string())
}

pub(in crate::runtime::backend_runtime) fn provider(value: &str) -> RuntimeResult<BackendProvider> {
  match value {
    "openai" => Ok(BackendProvider::OpenAi),
    "anthropic" => Ok(BackendProvider::Anthropic),
    "anthropicVertex" => Ok(BackendProvider::AnthropicVertex),
    "gemini" => Ok(BackendProvider::Gemini),
    "geminiVertex" => Ok(BackendProvider::GeminiVertex),
    "cloudflareWorkersAi" => Ok(BackendProvider::CloudflareWorkersAi),
    "fal" => Ok(BackendProvider::Fal),
    _ => Err(RuntimeError::invalid_state("unsupported copilot provider")),
  }
}

fn operation(value: RouteOperation) -> BackendOperation {
  match value {
    RouteOperation::Chat => BackendOperation::Chat,
    RouteOperation::Structured | RouteOperation::Transcription => BackendOperation::Structured,
    RouteOperation::Embedding => BackendOperation::Embedding,
    RouteOperation::Rerank => BackendOperation::Rerank,
    RouteOperation::Image => BackendOperation::Image,
  }
}

pub(in crate::runtime::backend_runtime) fn endpoint(provider: &str, value: &ByokEndpoint) -> BackendEndpoint {
  match (provider, value) {
    ("anthropic", ByokEndpoint::ProviderDefault) => BackendEndpoint::Custom("https://api.anthropic.com".to_string()),
    ("openai" | "anthropic", ByokEndpoint::Custom { url }) => {
      BackendEndpoint::Custom(url.strip_suffix("/v1").unwrap_or(url).to_string())
    }
    (_, ByokEndpoint::ProviderDefault) => BackendEndpoint::ProviderDefault,
    (_, ByokEndpoint::Custom { url }) => BackendEndpoint::Custom(url.clone()),
  }
}

pub(in crate::runtime::backend_runtime) fn protocol(value: BackendProtocol) -> ExecutableProtocol {
  match value {
    BackendProtocol::Chat(value) => ExecutableProtocol::Chat(value),
    BackendProtocol::Structured(value) => ExecutableProtocol::Structured(value),
    BackendProtocol::Embedding(value) => ExecutableProtocol::Embedding(value),
    BackendProtocol::Rerank(value) => ExecutableProtocol::Rerank(value),
    BackendProtocol::Image(value) => ExecutableProtocol::Image(value),
  }
}

fn project_event(event: RuntimeRouteEvent, identities: &HashMap<String, RouteIdentity>) -> RuntimeResult<ProductEvent> {
  match event {
    RuntimeRouteEvent::Selected { route_id } => Ok(ProductEvent::RouteSelected {
      route: identity(identities, &route_id)?,
    }),
    RuntimeRouteEvent::Failed { route_id, error_kind } => Ok(ProductEvent::RouteFailed {
      route: identity(identities, &route_id)?,
      error_kind,
    }),
    RuntimeRouteEvent::Usage { route_id, usage } => Ok(ProductEvent::Usage {
      route: identity(identities, &route_id)?,
      usage: match usage {
        RuntimeUsage::Tokens(usage) => ProductUsage::Tokens(usage),
        RuntimeUsage::Image(usage) => ProductUsage::Image(usage),
      },
    }),
  }
}

fn identity(identities: &HashMap<String, RouteIdentity>, route_id: &str) -> RuntimeResult<RouteIdentity> {
  identities
    .get(route_id)
    .cloned()
    .ok_or_else(|| RuntimeError::invalid_state("runtime emitted an unknown route id"))
}

fn response_value(response: ExecutableResponse) -> RuntimeResult<serde_json::Value> {
  match response {
    ExecutableResponse::Chat(response) => serialize_response(response),
    ExecutableResponse::Structured(response) => serialize_response(response),
    ExecutableResponse::Embedding(response) => serialize_response(response),
    ExecutableResponse::Rerank(response) => serialize_response(response),
    ExecutableResponse::Image(response) => serialize_response(response),
  }
}

fn serialize_response(value: impl Serialize) -> RuntimeResult<serde_json::Value> {
  serde_json::to_value(value).map_err(|error| RuntimeError::json("serialize copilot response failed", error))
}

impl From<BackendError> for RuntimeError {
  fn from(error: BackendError) -> Self {
    RuntimeError::invalid_state(error.to_string())
  }
}
