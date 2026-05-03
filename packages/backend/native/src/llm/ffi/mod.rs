mod dispatch;
mod middleware;
mod payload;

#[cfg(test)]
pub(crate) use dispatch::AsyncLlmDispatchPreparedTask;
pub(crate) use dispatch::{
  dispatch_prepared_image_route_payloads, dispatch_prepared_structured_routes,
  parse_prepared_chat_routes_with_middleware, parse_prepared_chat_routes_without_middleware,
};
pub use dispatch::{
  llm_dispatch_prepared, llm_embedding_dispatch, llm_embedding_dispatch_prepared, llm_image_dispatch_prepared,
  llm_plan_attachment_reference, llm_rerank_dispatch, llm_rerank_dispatch_prepared, llm_resolve_request_intent,
  llm_structured_dispatch, llm_structured_dispatch_prepared,
};
pub(crate) use llm_adapter::middleware::StreamPipeline;
#[cfg(test)]
pub(crate) use middleware::resolve_request_chain;
pub(crate) use middleware::{
  apply_request_middlewares, apply_structured_request_middlewares, backend_transport_error, map_backend_error,
  map_json_error, parse_embedding_protocol, parse_protocol, parse_rerank_protocol, parse_structured_protocol,
  resolve_stream_chain,
};
pub(crate) use payload::{
  LlmDispatchPayload, LlmEmbeddingDispatchPayload, LlmMiddlewarePayload, LlmPreparedImageDispatchRoutePayload,
  LlmRerankDispatchPayload, LlmRoutedBackendPayload, LlmStructuredDispatchPayload,
};
