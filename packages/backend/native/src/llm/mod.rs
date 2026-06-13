mod action;
mod contract_schema;
mod core;
mod ffi;
mod host;
mod prompt_catalog;

#[cfg(test)]
mod tests;

pub use core::{
  capability::{llm_match_model_capabilities, llm_resolve_requested_model_match},
  model_registry::{llm_match_model_registry, llm_resolve_model_registry_variant},
  prompt::{
    llm_collect_prompt_metadata, llm_count_prompt_tokens, llm_get_built_in_prompt_spec, llm_list_built_in_prompt_specs,
    llm_render_built_in_prompt, llm_render_built_in_session_prompt, llm_render_prompt, llm_render_session_prompt,
  },
  request_builder::{
    llm_build_canonical_request, llm_build_canonical_structured_request, llm_build_embedding_request,
    llm_build_image_request_from_messages, llm_build_rerank_request, llm_infer_prompt_model_conditions,
  },
  structured_output::{llm_canonical_json_schema_hash, llm_validate_json_schema},
};

pub use action::run_native_action_recipe_prepared_stream;
pub use contract_schema::{
  llm_compile_execution_plan, llm_get_contract_schema, llm_normalize_prepared_routes, llm_validate_contract,
};
#[cfg(test)]
pub(crate) use ffi::{AsyncLlmDispatchPreparedTask, resolve_request_chain};
pub(crate) use ffi::{
  LlmDispatchPayload, LlmEmbeddingDispatchPayload, LlmMiddlewarePayload, LlmPreparedImageDispatchRoutePayload,
  LlmRerankDispatchPayload, LlmRoutedBackendPayload, LlmStructuredDispatchPayload, StreamPipeline,
  apply_request_middlewares, apply_structured_request_middlewares, backend_transport_error,
  dispatch_prepared_image_route_payloads, dispatch_prepared_structured_routes, map_backend_error, map_json_error,
  parse_embedding_protocol, parse_prepared_chat_routes_with_middleware, parse_prepared_chat_routes_without_middleware,
  parse_protocol, parse_rerank_protocol, parse_structured_protocol, resolve_stream_chain,
};
pub use ffi::{
  llm_dispatch_prepared, llm_embedding_dispatch, llm_embedding_dispatch_prepared, llm_image_dispatch_prepared,
  llm_plan_attachment_reference, llm_rerank_dispatch, llm_rerank_dispatch_prepared, llm_resolve_request_intent,
  llm_structured_dispatch, llm_structured_dispatch_prepared,
};
pub(crate) use host::{
  LlmStreamHandle, STREAM_ABORTED_REASON, STREAM_CALLBACK_DISPATCH_FAILED_REASON, STREAM_END_MARKER, emit_error_event,
};
pub use host::{
  llm_dispatch_prepared_stream, llm_dispatch_tool_loop_stream, llm_dispatch_tool_loop_stream_prepared,
  llm_dispatch_tool_loop_stream_routed,
};
