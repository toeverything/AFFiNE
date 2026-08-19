mod action;
pub(crate) mod byok;
mod contract_schema;
mod core;
mod ffi;
mod prompt_catalog;
pub(crate) mod route;

pub use action::copilot_action_recipe;
pub use byok::{
  ByokCapabilityInput, ByokCatalogModelOutput, ByokCatalogOutput, ByokCatalogProviderOutput, ByokEndpointInput,
  ByokLocalLeaseOutput, ByokModelDeclarationInput, ByokModelProbeCheckOutput, ByokModelProbeOutput, ByokPolicyOutput,
  ByokProbeCheckInput, ByokProbeResultOutput, ByokProbeStatusOutput, ByokProfileDefinitionInput, ByokProfileOutput,
  ByokValidationOutput, CreateByokLocalLeaseInput, CreateByokLocalLeaseProviderInput, CreateByokProfileInput,
  ProbeByokDraftInput, ProbeByokProfileInput, ReorderByokProfilesInput, ReplaceByokProfileInput,
  RotateByokCredentialInput, byok_catalog,
};

pub use self::core::{
  capability::llm_match_model_capabilities,
  model_registry::{llm_match_model_registry, llm_resolve_model_registry_variant},
  prompt::{
    llm_get_built_in_prompt_spec, llm_list_built_in_prompt_specs, llm_render_built_in_prompt,
    llm_render_built_in_session_prompt,
  },
  request_builder::{
    llm_build_canonical_request, llm_build_canonical_structured_request, llm_build_embedding_request,
    llm_build_image_request_from_messages, llm_build_rerank_request, llm_infer_prompt_model_conditions,
  },
  structured_output::{llm_canonical_json_schema_hash, llm_validate_json_schema},
};

#[napi_derive::napi(catch_unwind)]
pub fn llm_get_byok_catalog() -> ByokCatalogOutput {
  byok_catalog()
}
pub(crate) use byok::{ByokProfileDefinition, validate_definition};
pub use contract_schema::{llm_get_contract_schema, llm_validate_contract};
pub(crate) use ffi::{
  LlmDispatchPayload, LlmMiddlewarePayload, LlmRerankDispatchPayload, LlmStructuredDispatchPayload,
};
pub use prompt_catalog::llm_get_built_in_route_options;
pub(crate) use route::Deployment;
pub use route::{
  CopilotAccessProjection, CopilotExecuteInput, CopilotManagedTier, CopilotRouteCheckInput, CopilotTargetOverrideInput,
};

pub(crate) use self::core::contracts::LlmImageRequestContract;

pub(crate) fn invalid_arg(message: impl Into<String>) -> napi::Error {
  napi::Error::new(napi::Status::InvalidArg, message.into())
}

pub(crate) fn map_json_error(error: serde_json::Error) -> napi::Error {
  invalid_arg(error.to_string())
}
