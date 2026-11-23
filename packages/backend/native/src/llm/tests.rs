use llm_adapter::backend::{BackendRequestLayer, ChatProtocol};
use napi::{Status, Task};

use super::AsyncLlmDispatchPreparedTask;
use crate::llm::{map_json_error, parse_protocol, resolve_request_chain, resolve_stream_chain};

#[test]
fn should_parse_supported_protocol_aliases() {
  assert!(parse_protocol("openai_chat").is_ok());
  assert!(parse_protocol("chat-completions").is_ok());
  assert!(parse_protocol("responses").is_ok());
  assert!(parse_protocol("anthropic").is_ok());
  assert!(parse_protocol("gemini").is_ok());
}

#[test]
fn should_reject_unsupported_protocol() {
  let error = parse_protocol("unknown").unwrap_err();
  assert_eq!(error.status, Status::InvalidArg);
  assert!(error.reason.contains("unsupported chat protocol"));
}

#[test]
fn llm_dispatch_prepared_should_reject_invalid_routes_json() {
  let mut task = AsyncLlmDispatchPreparedTask {
    routes_json: "{".to_string(),
  };
  let error = task.compute().unwrap_err();
  assert_eq!(error.status, Status::InvalidArg);
  assert!(error.reason.contains("Invalid JSON payload"));
}

#[test]
fn map_json_error_should_use_invalid_arg_status() {
  let parse_error = serde_json::from_str::<serde_json::Value>("{").unwrap_err();
  let error = map_json_error(parse_error);
  assert_eq!(error.status, Status::InvalidArg);
  assert!(error.reason.contains("Invalid JSON payload"));
}

#[test]
fn resolve_request_chain_should_support_clamp_max_tokens() {
  let chain = resolve_request_chain(
    &["normalize_messages".to_string(), "clamp_max_tokens".to_string()],
    ChatProtocol::OpenaiChatCompletions,
    None,
  )
  .unwrap();
  assert_eq!(chain.len(), 2);
}

#[test]
fn resolve_request_chain_should_support_openai_request_compat() {
  let chain = resolve_request_chain(
    &["openai_request_compat".to_string()],
    ChatProtocol::OpenaiChatCompletions,
    None,
  )
  .unwrap();
  assert_eq!(chain.len(), 1);
}

#[test]
fn resolve_request_chain_should_reject_unknown_middleware() {
  let error = resolve_request_chain(&["unknown".to_string()], ChatProtocol::OpenaiChatCompletions, None).unwrap_err();
  assert_eq!(error.status, Status::InvalidArg);
  assert!(error.reason.contains("unsupported request middleware"));
}

#[test]
fn resolve_request_chain_should_use_request_layer_defaults() {
  let chain = resolve_request_chain(
    &[],
    ChatProtocol::OpenaiChatCompletions,
    Some(BackendRequestLayer::ChatCompletions),
  )
  .unwrap();
  assert_eq!(chain.len(), 2);

  let chain = resolve_request_chain(
    &[],
    ChatProtocol::GeminiGenerateContent,
    Some(BackendRequestLayer::GeminiApi),
  )
  .unwrap();
  assert_eq!(chain.len(), 2);
}

#[test]
fn resolve_stream_chain_should_reject_unknown_middleware() {
  let error = resolve_stream_chain(&["unknown".to_string()]).unwrap_err();
  assert_eq!(error.status, Status::InvalidArg);
  assert!(error.reason.contains("unsupported stream middleware"));
}
