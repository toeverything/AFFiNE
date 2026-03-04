use std::sync::{
  Arc,
  atomic::{AtomicBool, Ordering},
};

use llm_adapter::{
  backend::{
    BackendConfig, BackendError, BackendProtocol, ReqwestHttpClient, dispatch_request, dispatch_stream_events_with,
  },
  core::{CoreRequest, StreamEvent},
  middleware::{
    MiddlewareConfig, PipelineContext, RequestMiddleware, StreamMiddleware, citation_indexing, clamp_max_tokens,
    normalize_messages, run_request_middleware_chain, run_stream_middleware_chain, stream_event_normalize,
    tool_schema_rewrite,
  },
};
use napi::{
  Error, Result, Status,
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use serde::Deserialize;

pub const STREAM_END_MARKER: &str = "__AFFINE_LLM_STREAM_END__";
const STREAM_ABORTED_REASON: &str = "__AFFINE_LLM_STREAM_ABORTED__";
const STREAM_CALLBACK_DISPATCH_FAILED_REASON: &str = "__AFFINE_LLM_STREAM_CALLBACK_DISPATCH_FAILED__";

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct LlmMiddlewarePayload {
  request: Vec<String>,
  stream: Vec<String>,
  config: MiddlewareConfig,
}

#[derive(Debug, Clone, Deserialize)]
struct LlmDispatchPayload {
  #[serde(flatten)]
  request: CoreRequest,
  #[serde(default)]
  middleware: LlmMiddlewarePayload,
}

#[napi]
pub struct LlmStreamHandle {
  aborted: Arc<AtomicBool>,
}

#[napi]
impl LlmStreamHandle {
  #[napi]
  pub fn abort(&self) {
    self.aborted.store(true, Ordering::SeqCst);
  }
}

#[napi(catch_unwind)]
pub fn llm_dispatch(protocol: String, backend_config_json: String, request_json: String) -> Result<String> {
  let protocol = parse_protocol(&protocol)?;
  let config: BackendConfig = serde_json::from_str(&backend_config_json).map_err(map_json_error)?;
  let payload: LlmDispatchPayload = serde_json::from_str(&request_json).map_err(map_json_error)?;
  let request = apply_request_middlewares(payload.request, &payload.middleware)?;

  let response =
    dispatch_request(&ReqwestHttpClient::default(), &config, protocol, &request).map_err(map_backend_error)?;

  serde_json::to_string(&response).map_err(map_json_error)
}

#[napi(catch_unwind)]
pub fn llm_dispatch_stream(
  protocol: String,
  backend_config_json: String,
  request_json: String,
  callback: ThreadsafeFunction<String, ()>,
) -> Result<LlmStreamHandle> {
  let protocol = parse_protocol(&protocol)?;
  let config: BackendConfig = serde_json::from_str(&backend_config_json).map_err(map_json_error)?;
  let payload: LlmDispatchPayload = serde_json::from_str(&request_json).map_err(map_json_error)?;
  let request = apply_request_middlewares(payload.request, &payload.middleware)?;
  let middleware = payload.middleware.clone();

  let aborted = Arc::new(AtomicBool::new(false));
  let aborted_in_worker = aborted.clone();

  std::thread::spawn(move || {
    let chain = match resolve_stream_chain(&middleware.stream) {
      Ok(chain) => chain,
      Err(error) => {
        emit_error_event(&callback, error.reason.clone(), "middleware_error");
        let _ = callback.call(
          Ok(STREAM_END_MARKER.to_string()),
          ThreadsafeFunctionCallMode::NonBlocking,
        );
        return;
      }
    };
    let mut pipeline = StreamPipeline::new(chain, middleware.config.clone());
    let mut aborted_by_user = false;
    let mut callback_dispatch_failed = false;

    let result = dispatch_stream_events_with(&ReqwestHttpClient::default(), &config, protocol, &request, |event| {
      if aborted_in_worker.load(Ordering::Relaxed) {
        aborted_by_user = true;
        return Err(BackendError::Http(STREAM_ABORTED_REASON.to_string()));
      }

      for event in pipeline.process(event) {
        let status = emit_stream_event(&callback, &event);
        if status != Status::Ok {
          callback_dispatch_failed = true;
          return Err(BackendError::Http(format!(
            "{STREAM_CALLBACK_DISPATCH_FAILED_REASON}:{status}"
          )));
        }
      }

      Ok(())
    });

    if !aborted_by_user {
      for event in pipeline.finish() {
        if aborted_in_worker.load(Ordering::Relaxed) {
          aborted_by_user = true;
          break;
        }
        if emit_stream_event(&callback, &event) != Status::Ok {
          callback_dispatch_failed = true;
          break;
        }
      }
    }

    if let Err(error) = result
      && !aborted_by_user
      && !callback_dispatch_failed
      && !is_abort_error(&error)
      && !is_callback_dispatch_failed_error(&error)
    {
      emit_error_event(&callback, error.to_string(), "dispatch_error");
    }

    if !callback_dispatch_failed {
      let _ = callback.call(
        Ok(STREAM_END_MARKER.to_string()),
        ThreadsafeFunctionCallMode::NonBlocking,
      );
    }
  });

  Ok(LlmStreamHandle { aborted })
}

fn apply_request_middlewares(request: CoreRequest, middleware: &LlmMiddlewarePayload) -> Result<CoreRequest> {
  let chain = resolve_request_chain(&middleware.request)?;
  Ok(run_request_middleware_chain(request, &middleware.config, &chain))
}

#[derive(Clone)]
struct StreamPipeline {
  chain: Vec<StreamMiddleware>,
  config: MiddlewareConfig,
  context: PipelineContext,
}

impl StreamPipeline {
  fn new(chain: Vec<StreamMiddleware>, config: MiddlewareConfig) -> Self {
    Self {
      chain,
      config,
      context: PipelineContext::default(),
    }
  }

  fn process(&mut self, event: StreamEvent) -> Vec<StreamEvent> {
    run_stream_middleware_chain(event, &mut self.context, &self.config, &self.chain)
  }

  fn finish(&mut self) -> Vec<StreamEvent> {
    self.context.flush_pending_deltas();
    self.context.drain_queued_events()
  }
}

fn emit_stream_event(callback: &ThreadsafeFunction<String, ()>, event: &StreamEvent) -> Status {
  let value = serde_json::to_string(event).unwrap_or_else(|error| {
    serde_json::json!({
      "type": "error",
      "message": format!("failed to serialize stream event: {error}"),
    })
    .to_string()
  });

  callback.call(Ok(value), ThreadsafeFunctionCallMode::NonBlocking)
}

fn emit_error_event(callback: &ThreadsafeFunction<String, ()>, message: String, code: &str) {
  let error_event = serde_json::to_string(&StreamEvent::Error {
    message: message.clone(),
    code: Some(code.to_string()),
  })
  .unwrap_or_else(|_| {
    serde_json::json!({
      "type": "error",
      "message": message,
      "code": code,
    })
    .to_string()
  });

  let _ = callback.call(Ok(error_event), ThreadsafeFunctionCallMode::NonBlocking);
}

fn is_abort_error(error: &BackendError) -> bool {
  matches!(
    error,
    BackendError::Http(reason) if reason == STREAM_ABORTED_REASON
  )
}

fn is_callback_dispatch_failed_error(error: &BackendError) -> bool {
  matches!(
    error,
    BackendError::Http(reason) if reason.starts_with(STREAM_CALLBACK_DISPATCH_FAILED_REASON)
  )
}

fn resolve_request_chain(request: &[String]) -> Result<Vec<RequestMiddleware>> {
  if request.is_empty() {
    return Ok(vec![normalize_messages, tool_schema_rewrite]);
  }

  request
    .iter()
    .map(|name| match name.as_str() {
      "normalize_messages" => Ok(normalize_messages as RequestMiddleware),
      "clamp_max_tokens" => Ok(clamp_max_tokens as RequestMiddleware),
      "tool_schema_rewrite" => Ok(tool_schema_rewrite as RequestMiddleware),
      _ => Err(Error::new(
        Status::InvalidArg,
        format!("Unsupported request middleware: {name}"),
      )),
    })
    .collect()
}

fn resolve_stream_chain(stream: &[String]) -> Result<Vec<StreamMiddleware>> {
  if stream.is_empty() {
    return Ok(vec![stream_event_normalize, citation_indexing]);
  }

  stream
    .iter()
    .map(|name| match name.as_str() {
      "stream_event_normalize" => Ok(stream_event_normalize as StreamMiddleware),
      "citation_indexing" => Ok(citation_indexing as StreamMiddleware),
      _ => Err(Error::new(
        Status::InvalidArg,
        format!("Unsupported stream middleware: {name}"),
      )),
    })
    .collect()
}

fn parse_protocol(protocol: &str) -> Result<BackendProtocol> {
  match protocol {
    "openai_chat" | "openai-chat" | "openai_chat_completions" | "chat-completions" | "chat_completions" => {
      Ok(BackendProtocol::OpenaiChatCompletions)
    }
    "openai_responses" | "openai-responses" | "responses" => Ok(BackendProtocol::OpenaiResponses),
    "anthropic" | "anthropic_messages" | "anthropic-messages" => Ok(BackendProtocol::AnthropicMessages),
    other => Err(Error::new(
      Status::InvalidArg,
      format!("Unsupported llm backend protocol: {other}"),
    )),
  }
}

fn map_json_error(error: serde_json::Error) -> Error {
  Error::new(Status::InvalidArg, format!("Invalid JSON payload: {error}"))
}

fn map_backend_error(error: BackendError) -> Error {
  Error::new(Status::GenericFailure, error.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn should_parse_supported_protocol_aliases() {
    assert!(parse_protocol("openai_chat").is_ok());
    assert!(parse_protocol("chat-completions").is_ok());
    assert!(parse_protocol("responses").is_ok());
    assert!(parse_protocol("anthropic").is_ok());
  }

  #[test]
  fn should_reject_unsupported_protocol() {
    let error = parse_protocol("unknown").unwrap_err();
    assert_eq!(error.status, Status::InvalidArg);
    assert!(error.reason.contains("Unsupported llm backend protocol"));
  }

  #[test]
  fn llm_dispatch_should_reject_invalid_backend_json() {
    let error = llm_dispatch("openai_chat".to_string(), "{".to_string(), "{}".to_string()).unwrap_err();
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
    let chain = resolve_request_chain(&["normalize_messages".to_string(), "clamp_max_tokens".to_string()]).unwrap();
    assert_eq!(chain.len(), 2);
  }

  #[test]
  fn resolve_request_chain_should_reject_unknown_middleware() {
    let error = resolve_request_chain(&["unknown".to_string()]).unwrap_err();
    assert_eq!(error.status, Status::InvalidArg);
    assert!(error.reason.contains("Unsupported request middleware"));
  }

  #[test]
  fn resolve_stream_chain_should_reject_unknown_middleware() {
    let error = resolve_stream_chain(&["unknown".to_string()]).unwrap_err();
    assert_eq!(error.status, Status::InvalidArg);
    assert!(error.reason.contains("Unsupported stream middleware"));
  }
}
