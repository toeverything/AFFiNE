use std::collections::HashSet;

use llm_adapter::{
  backend::{BackendError, DefaultHttpClient},
  capability::{
    AttachmentKind, AttachmentSource, ModelFeature, ModelInput, ModelOutput, ModelRequirements, declared_model_matches,
  },
  core::{
    CoreContent, CoreMessage, CoreRequest, CoreRole, CoreToolChoice, CoreToolDefinition, EmbeddingRequest,
    ImageOptions, ImageProviderOptions, ImageRequest, RerankCandidate, RerankRequest, StructuredRequest,
  },
  router::{ExecutablePreparedRoute, ExecutableRequest, ExecutableResponse, dispatch_prepared_route},
  target::{
    BackendCredential, BackendEndpoint, BackendOperation, BackendTargetInput, EgressPolicy, compile_backend_target,
  },
};
use serde_json::json;

use super::{RuntimeError, RuntimeResult, backend_provider, executable_protocol};
use crate::llm::{
  ByokModelProbeCheckOutput, ByokModelProbeOutput, ByokProbeCheckInput, ByokProbeResultOutput, ByokProbeStatusOutput,
  byok::{ByokEndpoint, ByokPolicy, ByokProfileDefinition, SensitiveCredential, definition_fingerprint},
};

pub(super) async fn execute_probe(
  provider: &str,
  definition: &ByokProfileDefinition,
  credential: SensitiveCredential,
  policy: &ByokPolicy,
  checks: Vec<ByokProbeCheckInput>,
) -> RuntimeResult<ByokProbeResultOutput> {
  let tested_at_ms = chrono::Utc::now().timestamp_millis();
  let mut requested = Vec::new();
  let mut requested_set = HashSet::new();
  for check in checks {
    let key = (check.model_id.clone(), check.operation.clone());
    if !requested_set.insert(key.clone()) {
      return Err(RuntimeError::invalid_input("duplicate BYOK probe check"));
    }
    if !matches!(
      check.operation.as_str(),
      "chat" | "structured" | "tool_calling" | "vision" | "embedding" | "rerank" | "image" | "transcript"
    ) {
      return Err(RuntimeError::invalid_input("unknown BYOK probe operation"));
    }
    requested.push(key);
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
      let probe_status = if !model.enabled {
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
        let egress_policy = policy.egress_policy(&endpoint);
        tokio::task::spawn_blocking(move || {
          dispatch_check(
            &provider,
            &endpoint,
            &model_id,
            credential,
            &operation_for_task,
            egress_policy,
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

  let connection = connection_status(tested_at_ms, &models);

  Ok(ByokProbeResultOutput {
    definition_fingerprint: definition_fingerprint(definition),
    stale: false,
    connection,
    models,
  })
}

fn dispatch_check(
  provider: &str,
  endpoint: &ByokEndpoint,
  model_id: &str,
  credential: String,
  operation: &str,
  egress_policy: EgressPolicy,
) -> ByokProbeStatusOutput {
  let checked_at = chrono::Utc::now().timestamp_millis();
  let operation_kind = match operation {
    "chat" | "tool_calling" => BackendOperation::Chat,
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
    endpoint: match endpoint {
      ByokEndpoint::ProviderDefault => BackendEndpoint::ProviderDefault,
      ByokEndpoint::OpenAiCompatible { url, .. } => BackendEndpoint::Custom(url.clone()),
    },
    openai_dialect: match endpoint {
      ByokEndpoint::ProviderDefault => None,
      ByokEndpoint::OpenAiCompatible { dialect, .. } => Some(*dialect),
    },
    model: model_id.to_string(),
    credential: BackendCredential::new(credential),
    timeout_ms: Some(15_000),
    egress_policy,
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
    Ok(ExecutableResponse::Chat(response)) => {
      let valid = if operation == "tool_calling" {
        response
          .message
          .content
          .iter()
          .any(|content| matches!(content, CoreContent::ToolCall { name, .. } if name == "byok_probe"))
      } else {
        response
          .message
          .content
          .iter()
          .any(|content| matches!(content, CoreContent::Text { text } if !text.trim().is_empty()))
      };
      if valid {
        verified(checked_at)
      } else {
        failed(checked_at, "invalid_response")
      }
    }
    Ok(ExecutableResponse::Structured(response)) => {
      let valid = response.output_json.as_ref().is_some_and(|output| {
        let ExecutableRequest::Structured(request) = &route.request else {
          return false;
        };
        llm_adapter::schema::validate_json_schema(&request.schema, output).is_ok()
      });
      if valid {
        verified(checked_at)
      } else {
        failed(checked_at, "invalid_response")
      }
    }
    Ok(ExecutableResponse::Embedding(response)) if operation == "embedding" && !response.embeddings.is_empty() => {
      verified(checked_at)
    }
    Ok(ExecutableResponse::Rerank(response)) if operation == "rerank" && !response.scores.is_empty() => {
      verified(checked_at)
    }
    Ok(ExecutableResponse::Image(response)) if operation == "image" && !response.images.is_empty() => {
      verified(checked_at)
    }
    Ok(_) => failed(checked_at, "invalid_response"),
    Err(error) => failed(checked_at, backend_error_kind(&error)),
  }
}

fn probe_request_for_operation(operation: &str) -> ExecutableRequest {
  let message = CoreMessage {
    role: CoreRole::User,
    content: vec![CoreContent::Text {
      text: match operation {
        "tool_calling" => "Call the byok_probe tool.".to_string(),
        "structured" => "Return exactly {\"ok\":true}.".to_string(),
        _ => "Reply with OK.".to_string(),
      },
    }],
  };
  match operation {
    "chat" | "tool_calling" => ExecutableRequest::Chat(CoreRequest {
      model: String::new(),
      messages: vec![message],
      stream: false,
      max_tokens: Some(64),
      temperature: None,
      tools: if operation == "tool_calling" {
        vec![CoreToolDefinition {
          name: "byok_probe".to_string(),
          description: Some("Probe tool compatibility".to_string()),
          parameters: json!({ "type": "object", "properties": {} }),
        }]
      } else {
        vec![]
      },
      tool_choice: (operation == "tool_calling").then_some(CoreToolChoice::Specific {
        name: "byok_probe".to_string(),
      }),
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
      max_tokens: Some(128),
      temperature: None,
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
    "tool_calling" => (
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

fn connection_status(tested_at_ms: i64, models: &[ByokModelProbeOutput]) -> ByokProbeStatusOutput {
  let statuses = models
    .iter()
    .flat_map(|model| model.checks.iter().map(|check| &check.status));
  if statuses.clone().any(|status| status.kind == "verified") {
    return verified(tested_at_ms);
  }
  if let Some(error) = statuses
    .filter(|status| status.kind == "failed")
    .filter_map(|status| status.error_kind.as_deref())
    .find(|error| is_connection_error(error))
  {
    return failed(tested_at_ms, error);
  }
  not_tested()
}

fn is_connection_error(error: &str) -> bool {
  matches!(
    error,
    "authentication"
      | "permission"
      | "not_found"
      | "rate_limited"
      | "unavailable"
      | "rejected"
      | "transport"
      | "timeout"
      | "invalid_response"
  )
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
  use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::mpsc,
    thread,
  };

  use llm_adapter::target::OpenAiDialect;

  use super::*;

  fn read_request(stream: &mut TcpStream) -> String {
    let mut request = Vec::new();
    let mut content_length = None;
    let mut header_length = None;
    loop {
      let mut chunk = [0; 4096];
      let count = stream.read(&mut chunk).unwrap();
      if count == 0 {
        break;
      }
      request.extend_from_slice(&chunk[..count]);
      if header_length.is_none()
        && let Some(index) = request.windows(4).position(|window| window == b"\r\n\r\n")
      {
        let end = index + 4;
        let headers = String::from_utf8_lossy(&request[..end]);
        content_length = headers.lines().find_map(|line| {
          line
            .strip_prefix("content-length: ")
            .or_else(|| line.strip_prefix("Content-Length: "))
            .and_then(|value| value.parse::<usize>().ok())
        });
        header_length = Some(end);
      }
      if let Some(header_length) = header_length
        && request.len() >= header_length + content_length.unwrap_or_default()
      {
        break;
      }
    }
    String::from_utf8(request).unwrap()
  }

  fn serve_openai_compatible(request_count: usize) -> (String, mpsc::Receiver<String>, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let endpoint = format!("http://{}/v1", listener.local_addr().unwrap());
    let (sender, receiver) = mpsc::channel();
    let handle = thread::spawn(move || {
      for stream in listener.incoming().take(request_count) {
        let mut stream = stream.unwrap();
        let request = read_request(&mut stream);
        let responses = request.starts_with("POST /v1/responses ");
        let embedding = request.starts_with("POST /v1/embeddings ");
        let image = request.starts_with("POST /v1/images/generations ");
        let rerank = request.contains("\"logprobs\":true");
        let tool_calling = request.contains("byok_probe");
        let body = if embedding {
          json!({
            "model": "smoke-model",
            "data": [{ "embedding": [0.1], "index": 0 }],
            "usage": { "prompt_tokens": 1, "total_tokens": 1 }
          })
        } else if image {
          json!({
            "created": 0,
            "data": [{ "url": "https://example.com/smoke.png" }]
          })
        } else if rerank {
          json!({
            "model": "smoke-model",
            "choices": [{
              "logprobs": { "content": [{
                "top_logprobs": [
                  { "token": "Yes", "logprob": 0.0 },
                  { "token": "No", "logprob": -1.0 }
                ]
              }] }
            }]
          })
        } else if responses && tool_calling {
          json!({
            "id": "resp_smoke",
            "model": "smoke-model",
            "status": "completed",
            "output": [{
              "type": "function_call",
              "id": "fc_smoke",
              "call_id": "call_smoke",
              "name": "byok_probe",
              "arguments": "{}"
            }],
            "usage": { "input_tokens": 1, "output_tokens": 1, "total_tokens": 2 }
          })
        } else if responses {
          json!({
            "id": "resp_smoke",
            "model": "smoke-model",
            "status": "completed",
            "output": [{
              "type": "message",
              "id": "msg_smoke",
              "role": "assistant",
              "content": [{ "type": "output_text", "text": "{\"ok\":true}" }]
            }],
            "usage": { "input_tokens": 1, "output_tokens": 1, "total_tokens": 2 }
          })
        } else if tool_calling {
          json!({
            "id": "chat_smoke",
            "model": "smoke-model",
            "choices": [{
              "index": 0,
              "message": {
                "role": "assistant",
                "content": null,
                "tool_calls": [{
                  "id": "call_smoke",
                  "type": "function",
                  "function": { "name": "byok_probe", "arguments": "{}" }
                }]
              },
              "finish_reason": "tool_calls"
            }],
            "usage": { "prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2 }
          })
        } else {
          json!({
            "id": "chat_smoke",
            "model": "smoke-model",
            "choices": [{
              "index": 0,
              "message": { "role": "assistant", "content": "{\"ok\":true}" },
              "finish_reason": "stop"
            }],
            "usage": { "prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2 }
          })
        }
        .to_string();
        write!(
          stream,
          "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
          body.len(),
          body
        )
        .unwrap();
        sender.send(request).unwrap();
      }
    });
    (endpoint, receiver, handle)
  }

  #[test]
  fn connection_evidence_is_aggregated_from_operation_checks() {
    assert_eq!(http_error_kind(401), "authentication");
    assert_eq!(http_error_kind(403), "permission");
    assert_eq!(http_error_kind(429), "rate_limited");
    assert_eq!(http_error_kind(503), "unavailable");

    let output = |status| ByokModelProbeOutput {
      model_id: "model".to_string(),
      checks: vec![ByokModelProbeCheckOutput {
        operation: "chat".to_string(),
        status,
      }],
    };
    assert_eq!(connection_status(1, &[output(verified(1))]).kind, "verified");
    assert_eq!(connection_status(1, &[output(failed(1, "transport"))]).kind, "failed");
    assert_eq!(
      connection_status(1, &[output(failed(1, "model_disabled"))]).kind,
      "not_tested"
    );
  }

  #[test]
  fn openai_compatible_probe_smoke_uses_the_selected_dialect() {
    let operations = ["chat", "structured", "tool_calling", "embedding", "rerank", "image"];
    let (endpoint, requests, server) = serve_openai_compatible(operations.len() * 2);

    for dialect in [OpenAiDialect::Responses, OpenAiDialect::ChatCompletions] {
      let endpoint = ByokEndpoint::OpenAiCompatible {
        url: endpoint.clone(),
        dialect,
      };
      for operation in operations {
        assert_eq!(
          dispatch_check(
            "openai",
            &endpoint,
            "smoke-model",
            "smoke-key".to_string(),
            operation,
            EgressPolicy::AllowPrivate,
          )
          .kind,
          "verified"
        );
      }
    }

    server.join().unwrap();
    let requests = requests.into_iter().collect::<Vec<_>>();
    assert_eq!(
      requests
        .iter()
        .filter(|request| request.starts_with("POST /v1/responses "))
        .count(),
      3
    );
    assert_eq!(
      requests
        .iter()
        .filter(|request| request.starts_with("POST /v1/chat/completions "))
        .count(),
      5
    );
    assert_eq!(
      requests
        .iter()
        .filter(|request| request.starts_with("POST /v1/embeddings "))
        .count(),
      2
    );
    assert_eq!(
      requests
        .iter()
        .filter(|request| request.starts_with("POST /v1/images/generations "))
        .count(),
      2
    );
    assert!(requests.iter().all(|request| !request.contains("/models")));
    assert_eq!(
      requests.iter().filter(|request| request.contains("byok_probe")).count(),
      2
    );
    assert!(
      requests
        .iter()
        .filter(|request| !request.contains("\"logprobs\":true"))
        .all(|request| !request.contains("\"temperature\""))
    );
  }
}
