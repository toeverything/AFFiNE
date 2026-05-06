#[cfg(test)]
use llm_adapter::middleware::RequestMiddleware;
#[cfg(test)]
use llm_adapter::middleware::resolve_request_chain as adapter_resolve_request_chain;
use llm_adapter::{
  backend::{BackendError, BackendRequestLayer, ChatProtocol, EmbeddingProtocol, RerankProtocol, StructuredProtocol},
  core::{CoreRequest, StructuredRequest},
  middleware::{
    StreamMiddleware, apply_request_middleware_names, apply_structured_request_middleware_names,
    resolve_stream_middleware_chain,
  },
};
use napi::{Error, Result, Status};

use crate::llm::LlmMiddlewarePayload;

pub(crate) fn apply_request_middlewares(
  request: CoreRequest,
  middleware: &LlmMiddlewarePayload,
  protocol: ChatProtocol,
  request_layer: Option<BackendRequestLayer>,
) -> Result<CoreRequest> {
  apply_request_middleware_names(
    request,
    &middleware.request,
    &middleware.config,
    protocol,
    request_layer,
  )
  .map_err(map_backend_parse_error)
}

pub(crate) fn apply_structured_request_middlewares(
  request: StructuredRequest,
  middleware: &LlmMiddlewarePayload,
  protocol: StructuredProtocol,
  request_layer: Option<BackendRequestLayer>,
) -> Result<StructuredRequest> {
  apply_structured_request_middleware_names(
    request,
    &middleware.request,
    &middleware.config,
    protocol,
    request_layer,
  )
  .map_err(map_backend_parse_error)
}

#[cfg(test)]
pub(crate) fn resolve_request_chain(
  request: &[String],
  protocol: ChatProtocol,
  request_layer: Option<BackendRequestLayer>,
) -> Result<Vec<RequestMiddleware>> {
  adapter_resolve_request_chain(request, protocol, request_layer).map_err(map_backend_parse_error)
}

pub(crate) fn resolve_stream_chain(stream: &[String]) -> Result<Vec<StreamMiddleware>> {
  resolve_stream_middleware_chain(stream).map_err(map_backend_parse_error)
}

pub(crate) fn parse_protocol(protocol: &str) -> Result<ChatProtocol> {
  protocol.parse().map_err(map_backend_parse_error)
}

pub(crate) fn parse_structured_protocol(protocol: &str) -> Result<StructuredProtocol> {
  protocol.parse().map_err(map_backend_parse_error)
}

pub(crate) fn parse_embedding_protocol(protocol: &str) -> Result<EmbeddingProtocol> {
  protocol.parse().map_err(map_backend_parse_error)
}

pub(crate) fn parse_rerank_protocol(protocol: &str) -> Result<RerankProtocol> {
  protocol.parse().map_err(map_backend_parse_error)
}

fn map_backend_parse_error(error: BackendError) -> Error {
  Error::new(Status::InvalidArg, error.to_string())
}

pub(crate) fn backend_transport_error(message: impl Into<String>) -> BackendError {
  BackendError::Transport {
    message: message.into(),
  }
}

pub(crate) fn map_json_error(error: serde_json::Error) -> Error {
  Error::new(Status::InvalidArg, format!("Invalid JSON payload: {error}"))
}

pub(crate) fn map_backend_error(error: BackendError) -> Error {
  match error {
    BackendError::InvalidRequest { message, .. } => Error::new(Status::InvalidArg, message),
    BackendError::Timeout { message } => Error::new(Status::GenericFailure, format!("llm_timeout: {message}")),
    other => Error::new(Status::GenericFailure, other.to_string()),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn should_preserve_backend_timeout_semantics() {
    let error = map_backend_error(BackendError::Timeout {
      message: "request timed out".to_string(),
    });

    assert_eq!(error.status, Status::GenericFailure);
    assert_eq!(error.reason, "llm_timeout: request timed out");
  }
}
