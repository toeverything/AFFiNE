use llm_adapter::{
  core::{CoreRequest, RerankRequest, StructuredRequest},
  middleware::MiddlewareConfig,
};
use serde::{Deserialize, Serialize};

use crate::llm::core::contracts::{LlmRequestContract, LlmRerankRequestContract, LlmStructuredRequestContract};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub(crate) struct LlmMiddlewarePayload {
  pub(crate) request: Vec<String>,
  pub(crate) stream: Vec<String>,
  pub(crate) config: MiddlewareConfig,
}

impl LlmMiddlewarePayload {
  fn is_empty(&self) -> bool {
    self.request.is_empty()
      && self.stream.is_empty()
      && self.config.additional_properties_policy == MiddlewareConfig::default().additional_properties_policy
      && self.config.property_format_policy == MiddlewareConfig::default().property_format_policy
      && self.config.property_min_length_policy == MiddlewareConfig::default().property_min_length_policy
      && self.config.array_min_items_policy == MiddlewareConfig::default().array_min_items_policy
      && self.config.array_max_items_policy == MiddlewareConfig::default().array_max_items_policy
      && self.config.max_tokens_cap.is_none()
  }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(try_from = "LlmRequestContract")]
pub(crate) struct LlmDispatchPayload {
  #[serde(flatten)]
  pub(crate) request: CoreRequest,
  #[serde(default, skip_serializing_if = "LlmMiddlewarePayload::is_empty")]
  pub(crate) middleware: LlmMiddlewarePayload,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(try_from = "LlmStructuredRequestContract")]
pub(crate) struct LlmStructuredDispatchPayload {
  #[serde(flatten)]
  pub(crate) request: StructuredRequest,
  #[serde(default, skip_serializing_if = "LlmMiddlewarePayload::is_empty")]
  pub(crate) middleware: LlmMiddlewarePayload,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(from = "LlmRerankRequestContract")]
pub(crate) struct LlmRerankDispatchPayload {
  #[serde(flatten)]
  pub(crate) request: RerankRequest,
}

impl From<LlmRerankRequestContract> for LlmRerankDispatchPayload {
  fn from(request: LlmRerankRequestContract) -> Self {
    Self {
      request: request.into(),
    }
  }
}
