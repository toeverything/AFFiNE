use std::{
  collections::{HashMap, HashSet},
  sync::Arc,
};

use gcp_auth::{CustomServiceAccount, TokenProvider};
use llm_adapter::{
  backend::{BackendError, CredentialPlan, DefaultHttpClient},
  capability::{AttachmentKind, AttachmentSource},
  core::{CoreContent, ImageInput, ImageRequest},
  router::{ExecutableRequest, ExecutableResponse},
  target::{BackendCredential, prepare_backend_target},
};
use llm_runtime::{CompiledPlan, CompiledRoute, RuntimeRouteEvent, RuntimeUsage, dispatch_compiled_plan};
use serde::Serialize;
use uuid::Uuid;
use zeroize::Zeroizing;

use super::{COPILOT_REQUEST_TIMEOUT, RuntimeError, RuntimeResult};
use crate::{
  llm::{
    LlmImageRequestContract,
    byok::{ByokEndpoint, CredentialEnvelopeKey},
    route::{
      AuthorizedProviderProfile, AuthorizedRouteTargets, CatalogSlot, CredentialRef, RouteOperation,
      with_request_requirements,
    },
  },
  runtime::BackendRuntimeConfig,
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
    RouteOperation::Image => {
      let request = parse_request::<LlmImageRequestContract>(request)?;
      ExecutableRequest::Image(Box::new(
        request
          .try_into()
          .map_err(|error: napi::Error| RuntimeError::invalid_input(error.reason.clone()))?,
      ))
    }
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
  profiles: Vec<AuthorizedProviderProfile>,
  targets: AuthorizedRouteTargets,
  managed_credential: Option<Zeroizing<String>>,
) -> RuntimeResult<CopilotExecutionResult> {
  let execution = compile_execution(&config, slot, request, &profiles, &targets, managed_credential.as_ref())?;
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

pub(super) fn execute_embeddings(
  config: Arc<BackendRuntimeConfig>,
  slot: CatalogSlot,
  request: ExecutableRequest,
  profiles: Vec<AuthorizedProviderProfile>,
  targets: AuthorizedRouteTargets,
  managed_credential: Option<Zeroizing<String>>,
) -> RuntimeResult<Vec<Vec<f32>>> {
  let output = execute(config, slot, request, profiles, targets, managed_credential)?;
  let response: llm_adapter::core::EmbeddingResponse = serde_json::from_value(output.result)
    .map_err(|error| RuntimeError::json("decode embedding response failed", error))?;
  response
    .embeddings
    .into_iter()
    .map(|vector| {
      if vector.len() != 1024 || vector.iter().any(|value| !value.is_finite()) {
        return Err(RuntimeError::invalid_state("invalid_embedding_vector"));
      }
      Ok(vector.into_iter().map(|value| value as f32).collect())
    })
    .collect()
}

pub(super) fn compile_execution(
  config: &BackendRuntimeConfig,
  slot: CatalogSlot,
  request: ExecutableRequest,
  profiles: &[AuthorizedProviderProfile],
  targets: &AuthorizedRouteTargets,
  managed_credential: Option<&Zeroizing<String>>,
) -> RuntimeResult<CompiledExecution> {
  let compiled = match targets {
    AuthorizedRouteTargets::Managed(managed) => {
      let credential =
        managed_credential.ok_or_else(|| RuntimeError::invalid_state("managed copilot credential unavailable"))?;
      let route = managed
        .target
        .bind(BackendCredential::new(credential.as_str().to_string()), request.clone())
        .map_err(|error| RuntimeError::invalid_input(error.to_string()))?;
      vec![(
        RouteIdentity {
          profile_id: managed.profile_id.clone(),
          source: "affine_cloud",
          provider: managed.provider.as_str().to_string(),
          model: managed.target.wire_model().to_string(),
        },
        route,
      )]
    }
    AuthorizedRouteTargets::Byok(candidates) => {
      let key = CredentialEnvelopeKey::derive(config.private_key.as_bytes())
        .map_err(|_| RuntimeError::invalid_state("credential_unavailable"))?;
      candidates
        .iter()
        .map(|candidate| {
          let profile = profiles
            .get(candidate.profile_index)
            .ok_or_else(|| RuntimeError::invalid_state("invalid authorized route profile"))?;
          let model = profile
            .models
            .get(candidate.model_index)
            .ok_or_else(|| RuntimeError::invalid_state("invalid authorized route model"))?;
          let provider = profile.provider.parse::<llm_adapter::backend::BackendProvider>()?;
          let (endpoint, dialect) = match &profile.endpoint {
            ByokEndpoint::ProviderDefault => (provider.endpoint(&serde_json::json!({}))?, None),
            ByokEndpoint::OpenAiCompatible { url, dialect } => (url.clone(), Some(*dialect)),
          };
          let layer = provider.default_request_layer(slot.operation.into(), dialect)?;
          let target = prepare_backend_target(
            layer,
            slot.operation.into(),
            model.model_id.clone(),
            &endpoint,
            Some(COPILOT_REQUEST_TIMEOUT.as_millis() as u64),
            profile.egress_policy,
          )?;
          let route = target
            .bind(
              BackendCredential::new(resolve_credential(&key, profile)?),
              request.clone(),
            )
            .map_err(|error| RuntimeError::invalid_input(error.to_string()))?;
          Ok((
            RouteIdentity {
              profile_id: profile.profile_id.clone(),
              source: match profile.source {
                crate::llm::route::ProfileSource::Server => "server",
                crate::llm::route::ProfileSource::Local => "local",
              },
              provider: profile.provider.clone(),
              model: target.wire_model().to_string(),
            },
            route,
          ))
        })
        .collect::<RuntimeResult<Vec<_>>>()?
    }
  };
  let mut identities = HashMap::new();
  let mut routes = Vec::with_capacity(compiled.len());
  for (identity, route) in compiled {
    let route_id = Uuid::new_v4().to_string();
    identities.insert(route_id.clone(), identity);
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

fn resolve_credential(key: &CredentialEnvelopeKey, profile: &AuthorizedProviderProfile) -> RuntimeResult<String> {
  let CredentialRef { encrypted, aad } = &profile.credential_ref;
  key
    .decrypt(encrypted, aad)
    .map_err(|_| RuntimeError::invalid_state("credential_unavailable"))
    .and_then(|credential| {
      String::from_utf8(credential.expose().to_vec()).map_err(|_| RuntimeError::invalid_state("credential_unavailable"))
    })
}

pub(super) async fn managed_credential(
  plan: &CredentialPlan,
  config: &serde_json::Value,
  token_provider: Option<Arc<dyn TokenProvider>>,
) -> RuntimeResult<String> {
  match plan {
    CredentialPlan::GoogleOAuth { scopes, .. } => {
      let scopes = scopes.iter().map(String::as_str).collect::<Vec<_>>();
      token_provider
        .ok_or_else(|| RuntimeError::invalid_state("managed Google credential unavailable"))?
        .token(&scopes)
        .await
        .map(|token| token.as_str().to_string())
        .map_err(|_| RuntimeError::invalid_state("managed Google credential unavailable"))
    }
    CredentialPlan::Field { field } => config
      .get(field)
      .and_then(serde_json::Value::as_str)
      .map(str::to_string)
      .ok_or_else(|| RuntimeError::invalid_state("managed copilot credential unavailable")),
  }
}

pub(super) async fn create_google_token_provider(plan: &CredentialPlan) -> RuntimeResult<Arc<dyn TokenProvider>> {
  let CredentialPlan::GoogleOAuth {
    project, credentials, ..
  } = plan
  else {
    return Err(RuntimeError::invalid_state("managed Google credential unavailable"));
  };
  if let Some(credentials) = credentials {
    let mut credentials = credentials.clone();
    let object = credentials
      .as_object_mut()
      .ok_or_else(|| RuntimeError::invalid_state("managed Google credentials must be an object"))?;
    object
      .entry("type")
      .or_insert_with(|| serde_json::json!("service_account"));
    object.entry("project_id").or_insert_with(|| serde_json::json!(project));
    object
      .entry("token_uri")
      .or_insert_with(|| serde_json::json!("https://oauth2.googleapis.com/token"));
    let json = serde_json::to_string(&credentials)
      .map_err(|error| RuntimeError::json("serialize managed Google credentials failed", error))?;
    return CustomServiceAccount::from_json(&json)
      .map(|provider| Arc::new(provider) as Arc<dyn TokenProvider>)
      .map_err(|_| RuntimeError::invalid_state("managed Google credential unavailable"));
  }
  gcp_auth::provider()
    .await
    .map_err(|_| RuntimeError::invalid_state("managed Google credential unavailable"))
}

fn project_event(event: RuntimeRouteEvent, identities: &HashMap<String, RouteIdentity>) -> RuntimeResult<ProductEvent> {
  match event {
    RuntimeRouteEvent::Selected { route_id, .. } => Ok(ProductEvent::RouteSelected {
      route: identity(identities, &route_id)?,
    }),
    RuntimeRouteEvent::Failed {
      route_id, error_kind, ..
    } => Ok(ProductEvent::RouteFailed {
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

impl From<llm_adapter::target::TargetCompileError> for RuntimeError {
  fn from(error: llm_adapter::target::TargetCompileError) -> Self {
    RuntimeError::invalid_state(error.to_string())
  }
}

#[cfg(test)]
mod tests {
  use std::sync::atomic::{AtomicUsize, Ordering};

  use futures_util::future::BoxFuture;
  use serde_json::json;

  use super::*;
  use crate::llm::route::slot;

  #[tokio::test]
  async fn dispatch_keeps_managed_and_byok_targets_and_credentials_bound() {
    let (_, request) = request_and_slot(
      slot("action.image.filter.pixel").unwrap(),
      json!({
        "model": "gpt-image-1",
        "prompt": "apply pixel filter",
        "operation": "edit",
        "images": [{
          "kind": "data",
          "dataBase64": "aW1n",
          "mediaType": "image/png",
          "fileName": "in.png"
        }],
        "options": {
          "outputFormat": "webp",
          "outputCompression": 80
        },
        "providerOptions": {
          "provider": "openai",
          "options": {
            "input_fidelity": "high"
          }
        }
      }),
    )
    .unwrap();

    let ExecutableRequest::Image(request) = request else {
      panic!("image slot produced a non-image request");
    };
    assert!(request.is_edit());
    assert_eq!(request.images()[0].media_type(), Some("image/png"));

    struct FailedClient {
      attempts: std::cell::Cell<usize>,
      status: u16,
      expected_url: &'static str,
    }
    impl llm_adapter::backend::BackendHttpClient for FailedClient {
      fn post_json(
        &self,
        request: llm_adapter::backend::HttpRequest,
      ) -> Result<llm_adapter::backend::HttpResponse, BackendError> {
        self.attempts.set(self.attempts.get() + 1);
        assert_eq!(request.url, self.expected_url);
        if self.status == 0 {
          Err(BackendError::Timeout {
            message: "fixture".into(),
            context: None,
          })
        } else {
          Ok(llm_adapter::backend::HttpResponse {
            status: self.status,
            body: json!({"error":"fixture"}),
          })
        }
      }
      fn post_sse(
        &self,
        _: llm_adapter::backend::HttpRequest,
        _: &mut dyn FnMut(&str) -> Result<(), BackendError>,
      ) -> Result<(), BackendError> {
        unreachable!("non-streaming fixture");
      }
    }
    let mut copilot: crate::runtime::CopilotRuntimeConfig = serde_json::from_value(json!({
      "providers":{"profiles":[
        {"id":"first","type":"openai","config":{"apiKey":"old-key"}},
        {"id":"second","type":"openai","config":{"apiKey":"another-key"}}
      ]}
    }))
    .unwrap();
    copilot.initialize_managed_routes().unwrap();
    let target = copilot
      .managed_routes
      .iter()
      .find(|binding| {
        binding.target.model_id == "gpt-6-luna" && binding.operation == llm_adapter::target::BackendOperation::Chat
      })
      .unwrap()
      .resolved
      .clone();
    copilot.providers.profiles.clear();
    let mut config = BackendRuntimeConfig {
      database_url: "postgresql://unused".into(),
      auth: Default::default(),
      invite_quota: Default::default(),
      private_key: Arc::new(Zeroizing::new(String::new())),
      deployment: crate::runtime::Deployment::Cloud,
      copilot,
      search: Default::default(),
      redis: Default::default(),
      payment: Default::default(),
    };
    let (slot, request) = request_and_slot(
      slot("chat.default").unwrap(),
      json!({
        "model":"ignored", "messages":[{"role":"user","content":[{"type":"text","text":"hello"}]}]
      }),
    )
    .unwrap();
    let targets = AuthorizedRouteTargets::Managed(target);
    let credential =
      super::super::resolve_managed_credential(&targets, &super::super::ManagedTokenProviderCache::default())
        .await
        .unwrap();
    assert_eq!(credential.as_ref().unwrap().as_str(), "old-key");
    let execution = compile_execution(&config, slot, request, &[], &targets, credential.as_ref()).unwrap();
    assert_eq!(execution.plan.route_ids().count(), 1);
    struct RefreshingTokenProvider(AtomicUsize);
    impl TokenProvider for RefreshingTokenProvider {
      fn token<'a, 'b, 'c, 'future>(
        &'a self,
        scopes: &'b [&'c str],
      ) -> BoxFuture<'future, Result<Arc<gcp_auth::Token>, gcp_auth::Error>>
      where
        'a: 'future,
        'b: 'future,
        'c: 'future,
        Self: 'future,
      {
        Box::pin(async move {
          assert_eq!(scopes, ["https://www.googleapis.com/auth/cloud-platform"]);
          let sequence = self.0.fetch_add(1, Ordering::Relaxed);
          Ok(Arc::new(
            serde_json::from_value(json!({
              "access_token": format!("token-{sequence}"),
              "expires_in": 0
            }))
            .unwrap(),
          ))
        })
      }

      fn project_id<'a, 'future>(&'a self) -> BoxFuture<'future, Result<Arc<str>, gcp_auth::Error>>
      where
        'a: 'future,
        Self: 'future,
      {
        Box::pin(async { Ok(Arc::from("fixture-project")) })
      }
    }
    let provider: Arc<dyn TokenProvider> = Arc::new(RefreshingTokenProvider(AtomicUsize::new(0)));
    let plan = CredentialPlan::GoogleOAuth {
      scopes: vec!["https://www.googleapis.com/auth/cloud-platform".into()],
      project: "fixture-project".into(),
      credentials: None,
    };
    for expected in ["token-0", "token-1"] {
      assert_eq!(
        managed_credential(&plan, &json!({}), Some(Arc::clone(&provider)))
          .await
          .unwrap(),
        expected
      );
    }
    for status in [401, 429, 404, 0] {
      let client = FailedClient {
        attempts: std::cell::Cell::new(0),
        status,
        expected_url: "https://api.openai.com/v1/responses",
      };
      assert!(dispatch_compiled_plan(&client, &execution.plan, |_| {}).is_err());
      assert_eq!(client.attempts.get(), 1);
    }
    use crate::llm::{
      byok::{ByokModelDeclaration, SensitiveCredential},
      route::{self, ProfileSource},
    };
    config.private_key = Arc::new(Zeroizing::new("fixture-root-key".into()));
    let key = CredentialEnvelopeKey::derive(config.private_key.as_bytes()).unwrap();
    let credential_ref = CredentialRef {
      encrypted: key
        .encrypt(&SensitiveCredential::new("byok-key".as_bytes()), b"fixture")
        .unwrap(),
      aad: b"fixture".to_vec(),
    };
    for (provider, slot_id, request, expected_url) in [
      (
        "openai",
        "chat.default",
        json!({"model":"ignored", "messages":[]}),
        "https://api.openai.com/v1/responses",
      ),
      (
        "anthropic",
        "chat.default",
        json!({"model":"ignored", "messages":[]}),
        "https://api.anthropic.com/v1/messages",
      ),
      (
        "gemini",
        "chat.default",
        json!({"model":"ignored", "messages":[]}),
        "https://generativelanguage.googleapis.com/v1beta/models/opaque-model:generateContent",
      ),
      (
        "fal",
        "image.generate",
        json!({"model":"ignored", "operation":"generate", "prompt":"fixture"}),
        "https://fal.run/fal-ai/opaque-model",
      ),
    ] {
      let (slot, request) = request_and_slot(route::slot(slot_id).unwrap(), request).unwrap();
      let profile = AuthorizedProviderProfile {
        profile_id: "fixture-profile".into(),
        source: ProfileSource::Server,
        provider: provider.into(),
        endpoint: ByokEndpoint::ProviderDefault,
        egress_policy: llm_adapter::target::EgressPolicy::PublicOnly,
        models: vec![ByokModelDeclaration {
          model_id: "opaque-model".into(),
          enabled: true,
          capabilities: vec![llm_adapter::capability::DeclaredModelCapability {
            input: slot.requirements.input.clone(),
            output: slot.requirements.output.clone(),
            features: vec![],
            attachment_kinds: vec![],
            attachment_sources: vec![],
          }],
        }],
        sort_order: 0,
        credential_ref: credential_ref.clone(),
      };
      let profiles = [profile];
      let route::RouteDecision::Ready(targets) = route::decide(route::RoutePolicyInput {
        slot: &slot,
        deployment: config.deployment,
        byok_enabled: true,
        access_available: true,
        profiles: &profiles,
        managed_target: None,
        target_override: None,
        target_override_managed: false,
      }) else {
        panic!("default-endpoint BYOK route should resolve");
      };
      let execution = compile_execution(&config, slot, request, &profiles, &targets, None).unwrap();
      let client = FailedClient {
        attempts: std::cell::Cell::new(0),
        status: 0,
        expected_url,
      };
      assert!(dispatch_compiled_plan(&client, &execution.plan, |_| {}).is_err());
      assert_eq!(client.attempts.get(), 1);
      assert_eq!(execution.identities.values().next().unwrap().model, "opaque-model");
    }
  }
}
