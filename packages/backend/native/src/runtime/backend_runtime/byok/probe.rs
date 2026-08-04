use std::collections::{HashMap, HashSet};

use llm_adapter::{
  backend::{BackendError, DefaultHttpClient},
  capability::{
    AttachmentKind, AttachmentSource, ModelFeature, ModelInput, ModelOutput, ModelRequirements, declared_model_matches,
  },
  core::{
    CoreContent, CoreMessage, CoreRequest, CoreRole, CoreToolDefinition, EmbeddingRequest, ImageOptions,
    ImageProviderOptions, ImageRequest, RerankCandidate, RerankRequest, StructuredRequest,
  },
  router::{ExecutablePreparedRoute, ExecutableRequest, dispatch_prepared_route},
  target::{BackendCredential, BackendOperation, BackendTargetInput, EgressPolicy, compile_backend_target},
};
use serde_json::json;

use super::{RuntimeError, RuntimeResult, backend_provider, byok_endpoint, executable_protocol};
use crate::{
  llm::{
    ByokModelProbeCheckOutput, ByokModelProbeOutput, ByokProbeCheckInput, ByokProbeResultOutput, ByokProbeStatusOutput,
    byok::{ByokEndpoint, ByokProfileDefinition, SensitiveCredential, definition_fingerprint},
  },
  runtime::config::CopilotByokRuntimeConfig,
};

pub(super) async fn execute_probe(
  provider: &str,
  definition: &ByokProfileDefinition,
  credential: SensitiveCredential,
  policy: &CopilotByokRuntimeConfig,
  checks: Vec<ByokProbeCheckInput>,
) -> RuntimeResult<ByokProbeResultOutput> {
  let tested_at_ms = chrono::Utc::now().timestamp_millis();
  let connection_error = connection_probe(provider, &definition.endpoint, &credential, policy).await;
  let connection = status(tested_at_ms, connection_error.as_deref());
  let mut requested = HashSet::new();
  for check in checks {
    if !requested.insert((check.model_id.clone(), check.operation.clone())) {
      return Err(RuntimeError::invalid_input("duplicate BYOK probe check"));
    }
    if !matches!(
      check.operation.as_str(),
      "chat" | "structured" | "tools" | "vision" | "embedding" | "rerank" | "image" | "transcript"
    ) {
      return Err(RuntimeError::invalid_input("unknown BYOK probe operation"));
    }
  }

  let mut models = Vec::new();
  for model in &definition.models {
    let model_checks = requested
      .iter()
      .filter(|(model_id, _)| model_id == &model.model_id)
      .map(|(_, operation)| operation.clone())
      .collect::<Vec<_>>();
    if model_checks.is_empty() {
      continue;
    }
    let mut outputs = Vec::with_capacity(model_checks.len());
    for operation in model_checks {
      let probe_status = if connection_error.is_some() {
        not_tested()
      } else if !model.enabled {
        failed(tested_at_ms, "model_disabled")
      } else if !declared_model_matches(&model.capabilities, &requirements(&operation)) {
        failed(tested_at_ms, "capability_not_declared")
      } else if matches!(operation.as_str(), "vision" | "transcript") {
        not_tested()
      } else {
        let provider = provider.to_string();
        let endpoint = definition.endpoint.clone();
        let model_id = model.model_id.clone();
        let credential = String::from_utf8(credential.expose().to_vec())
          .map_err(|_| RuntimeError::invalid_state("credential_unavailable"))?;
        let operation_for_task = operation.clone();
        let allow_private = policy.allow_custom_endpoint && policy.allow_private_endpoint;
        tokio::task::spawn_blocking(move || {
          dispatch_check(
            &provider,
            &endpoint,
            &model_id,
            credential,
            &operation_for_task,
            allow_private,
          )
        })
        .await
        .map_err(|error| RuntimeError::invalid_state(format!("BYOK model probe task failed: {error}")))?
      };
      outputs.push(ByokModelProbeCheckOutput {
        operation,
        status: probe_status,
      });
    }
    models.push(ByokModelProbeOutput {
      model_id: model.model_id.clone(),
      checks: outputs,
    });
  }
  if requested
    .iter()
    .any(|(model_id, _)| !definition.models.iter().any(|model| &model.model_id == model_id))
  {
    return Err(RuntimeError::invalid_input("BYOK probe model not found"));
  }

  Ok(ByokProbeResultOutput {
    definition_fingerprint: definition_fingerprint(definition),
    stale: false,
    connection,
    models,
  })
}

async fn connection_probe(
  provider: &str,
  endpoint: &ByokEndpoint,
  credential: &SensitiveCredential,
  policy: &CopilotByokRuntimeConfig,
) -> Option<String> {
  let credential = match std::str::from_utf8(credential.expose()) {
    Ok(value) => value.to_string(),
    Err(_) => return Some("credential_unavailable".to_string()),
  };
  let (url, headers) = probe_request(provider, endpoint, credential);
  let allow_private = policy.allow_custom_endpoint && policy.allow_private_endpoint;
  let result = tokio::task::spawn_blocking(move || {
    safefetch::safe_fetch(&safefetch::SafeFetchRequest {
      url,
      method: Some(safefetch::SafeFetchMethod::Get),
      headers: Some(headers.clone()),
      body: None,
      timeout_ms: Some(10_000),
      max_redirects: Some(0),
      max_bytes: Some(1024 * 1024),
      allowed_headers: Some(headers.keys().cloned().collect()),
      allowed_hosts: None,
      allow_http: Some(allow_private),
      allow_private_target_origin: Some(allow_private),
      ech_config_list: None,
    })
  })
  .await;
  match result {
    Ok(Ok(response))
      if (200..300).contains(&response.status) && valid_connection_response(provider, &response.body) =>
    {
      None
    }
    Ok(Ok(response)) => Some(http_error_kind(response.status).to_string()),
    _ => Some("transport".to_string()),
  }
}

fn dispatch_check(
  provider: &str,
  endpoint: &ByokEndpoint,
  model_id: &str,
  credential: String,
  operation: &str,
  allow_private: bool,
) -> ByokProbeStatusOutput {
  let checked_at = chrono::Utc::now().timestamp_millis();
  let operation_kind = match operation {
    "chat" | "tools" => BackendOperation::Chat,
    "structured" => BackendOperation::Structured,
    "embedding" => BackendOperation::Embedding,
    "rerank" => BackendOperation::Rerank,
    "image" => BackendOperation::Image,
    _ => return not_tested(),
  };
  let target = compile_backend_target(BackendTargetInput {
    provider: match backend_provider(provider) {
      Ok(provider) => provider,
      Err(_) => return failed(checked_at, "unsupported_provider"),
    },
    operation: operation_kind,
    endpoint: byok_endpoint(provider, endpoint),
    model: model_id.to_string(),
    credential: BackendCredential::new(credential),
    timeout_ms: Some(15_000),
    egress_policy: if allow_private {
      EgressPolicy::AllowPrivate
    } else {
      EgressPolicy::PublicOnly
    },
  });
  let target = match target {
    Ok(target) => target,
    Err(_) => return failed(checked_at, "unsupported_operation"),
  };
  let route = ExecutablePreparedRoute::new(
    executable_protocol(target.protocol),
    target.model,
    target.config,
    probe_request_for_operation(operation),
  );
  let route = match route {
    Ok(route) => route,
    Err(_) => return failed(checked_at, "invalid_probe_request"),
  };
  match dispatch_prepared_route(&DefaultHttpClient::default(), &route) {
    Ok(_) => verified(checked_at),
    Err(error) => failed(checked_at, backend_error_kind(&error)),
  }
}

fn probe_request_for_operation(operation: &str) -> ExecutableRequest {
  let message = CoreMessage {
    role: CoreRole::User,
    content: vec![CoreContent::Text {
      text: "Reply with OK.".to_string(),
    }],
  };
  match operation {
    "chat" | "tools" => ExecutableRequest::Chat(CoreRequest {
      model: String::new(),
      messages: vec![message],
      stream: false,
      max_tokens: Some(8),
      temperature: Some(0.0),
      tools: if operation == "tools" {
        vec![CoreToolDefinition {
          name: "byok_probe".to_string(),
          description: Some("Probe tool compatibility".to_string()),
          parameters: json!({ "type": "object", "properties": {} }),
        }]
      } else {
        vec![]
      },
      tool_choice: None,
      include: None,
      reasoning: None,
      response_schema: None,
    }),
    "structured" => ExecutableRequest::Structured(StructuredRequest {
      model: String::new(),
      messages: vec![message],
      schema: json!({
        "type": "object",
        "properties": { "ok": { "type": "boolean" } },
        "required": ["ok"],
        "additionalProperties": false
      }),
      max_tokens: Some(16),
      temperature: Some(0.0),
      reasoning: None,
      strict: Some(true),
      response_mime_type: Some("application/json".to_string()),
    }),
    "embedding" => ExecutableRequest::Embedding(EmbeddingRequest {
      model: String::new(),
      inputs: vec!["BYOK probe".to_string()],
      dimensions: None,
      task_type: None,
    }),
    "rerank" => ExecutableRequest::Rerank(RerankRequest {
      model: String::new(),
      query: "probe".to_string(),
      candidates: vec![RerankCandidate {
        id: None,
        text: "probe".to_string(),
      }],
      top_n: Some(1),
    }),
    "image" => ExecutableRequest::Image(Box::new(ImageRequest::generate(
      String::new(),
      "A single black pixel".to_string(),
      ImageOptions::default(),
      ImageProviderOptions::default(),
    ))),
    _ => unreachable!("validated probe operation"),
  }
}

fn requirements(operation: &str) -> ModelRequirements {
  let (input, output, features, attachment_kinds, attachment_sources) = match operation {
    "chat" => (vec![ModelInput::Text], vec![ModelOutput::Text], vec![], vec![], vec![]),
    "structured" => (
      vec![ModelInput::Text],
      vec![ModelOutput::Structured],
      vec![],
      vec![],
      vec![],
    ),
    "tools" => (
      vec![ModelInput::Text],
      vec![ModelOutput::Text],
      vec![ModelFeature::ToolCalling],
      vec![],
      vec![],
    ),
    "vision" => (
      vec![ModelInput::Text, ModelInput::Image],
      vec![ModelOutput::Text],
      vec![],
      vec![AttachmentKind::Image],
      vec![AttachmentSource::Data],
    ),
    "embedding" => (
      vec![ModelInput::Text],
      vec![ModelOutput::Embedding],
      vec![],
      vec![],
      vec![],
    ),
    "rerank" => (
      vec![ModelInput::Text],
      vec![ModelOutput::Rerank],
      vec![],
      vec![],
      vec![],
    ),
    "image" => (vec![ModelInput::Text], vec![ModelOutput::Image], vec![], vec![], vec![]),
    "transcript" => (
      vec![ModelInput::Audio],
      vec![ModelOutput::Structured],
      vec![],
      vec![AttachmentKind::Audio],
      vec![AttachmentSource::Data],
    ),
    _ => unreachable!("validated probe operation"),
  };
  ModelRequirements {
    input,
    output,
    features,
    attachment_kinds,
    attachment_sources,
  }
}

fn probe_request(provider: &str, endpoint: &ByokEndpoint, credential: String) -> (String, HashMap<String, String>) {
  let base = match endpoint {
    ByokEndpoint::Custom { url } => url.as_str(),
    ByokEndpoint::ProviderDefault => match provider {
      "openai" => "https://api.openai.com/v1",
      "anthropic" => "https://api.anthropic.com/v1",
      "gemini" => "https://generativelanguage.googleapis.com/v1beta",
      "fal" => "https://api.fal.ai/v1",
      _ => unreachable!("validated provider"),
    },
  };
  let mut headers = HashMap::new();
  match provider {
    "openai" => {
      headers.insert("authorization".to_string(), format!("Bearer {credential}"));
    }
    "anthropic" => {
      headers.insert("x-api-key".to_string(), credential);
      headers.insert("anthropic-version".to_string(), "2023-06-01".to_string());
    }
    "gemini" => {
      headers.insert("x-goog-api-key".to_string(), credential);
    }
    "fal" => {
      headers.insert("authorization".to_string(), format!("Key {credential}"));
    }
    _ => unreachable!("validated provider"),
  }
  let suffix = if provider == "fal" { "models?limit=10" } else { "models" };
  (format!("{}/{suffix}", base.trim_end_matches('/')), headers)
}

fn valid_connection_response(provider: &str, body: &[u8]) -> bool {
  let Ok(body) = serde_json::from_slice::<serde_json::Value>(body) else {
    return false;
  };
  match provider {
    "openai" | "anthropic" => body.get("data").is_some_and(serde_json::Value::is_array),
    "gemini" => body.get("models").is_some_and(serde_json::Value::is_array),
    "fal" => body.get("error").is_none(),
    _ => false,
  }
}

fn status(tested_at_ms: i64, error: Option<&str>) -> ByokProbeStatusOutput {
  match error {
    Some(error) => failed(tested_at_ms, error),
    None => verified(tested_at_ms),
  }
}

fn verified(tested_at_ms: i64) -> ByokProbeStatusOutput {
  ByokProbeStatusOutput {
    kind: "verified".to_string(),
    tested_at_ms: Some(tested_at_ms),
    error_kind: None,
  }
}

fn failed(tested_at_ms: i64, error: &str) -> ByokProbeStatusOutput {
  ByokProbeStatusOutput {
    kind: "failed".to_string(),
    tested_at_ms: Some(tested_at_ms),
    error_kind: Some(error.to_string()),
  }
}

fn not_tested() -> ByokProbeStatusOutput {
  ByokProbeStatusOutput {
    kind: "not_tested".to_string(),
    tested_at_ms: None,
    error_kind: None,
  }
}

fn http_error_kind(status: u16) -> &'static str {
  match status {
    401 => "authentication",
    403 => "permission",
    404 => "not_found",
    429 => "rate_limited",
    500..=599 => "unavailable",
    _ => "rejected",
  }
}

fn backend_error_kind(error: &BackendError) -> &'static str {
  match error {
    BackendError::UpstreamStatus { status, .. } => http_error_kind(*status),
    BackendError::Transport { .. } => "transport",
    BackendError::Timeout { .. } => "timeout",
    BackendError::InvalidConfig { .. } | BackendError::InvalidRequest { .. } => "unsupported_operation",
    BackendError::InvalidResponse { .. }
    | BackendError::InvalidStructuredOutput { .. }
    | BackendError::Json(_)
    | BackendError::Stream(_) => "invalid_response",
    BackendError::NoBackendAvailable => "unavailable",
  }
}

#[cfg(test)]
mod tests {
  use llm_adapter::target::BackendEndpoint;

  use super::*;

  #[test]
  fn connection_probe_errors_are_low_information() {
    let (url, headers) = probe_request("openai", &ByokEndpoint::ProviderDefault, "secret".to_string());
    assert_eq!(url, "https://api.openai.com/v1/models");
    assert_eq!(headers.get("authorization").map(String::as_str), Some("Bearer secret"));
    assert_eq!(http_error_kind(401), "authentication");
    assert_eq!(http_error_kind(403), "permission");
    assert_eq!(http_error_kind(429), "rate_limited");
    assert_eq!(http_error_kind(503), "unavailable");

    let custom = ByokEndpoint::Custom {
      url: "http://127.0.0.1:1234/v1".to_string(),
    };
    assert_eq!(
      probe_request("openai", &custom, "secret".to_string()).0,
      "http://127.0.0.1:1234/v1/models"
    );
    assert_eq!(
      byok_endpoint("openai", &custom),
      BackendEndpoint::Custom("http://127.0.0.1:1234".to_string())
    );
    assert!(valid_connection_response("openai", br#"{"data":[]}"#));
    assert!(!valid_connection_response(
      "openai",
      br#"{"error":"Unexpected endpoint"}"#
    ));
  }
}
