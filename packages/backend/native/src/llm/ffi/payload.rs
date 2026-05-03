use llm_adapter::{
  backend::BackendConfig,
  core::{CoreRequest, EmbeddingRequest, RerankRequest, StructuredRequest},
  middleware::MiddlewareConfig,
  router::SerializablePreparedRoute,
};
use serde::{Deserialize, Serialize};

use crate::llm::core::contracts::{
  LlmEmbeddingRequestContract, LlmImageRequestContract, LlmRequestContract, LlmRerankRequestContract,
  LlmStructuredRequestContract,
};

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
pub(crate) struct LlmRoutedBackendPayload {
  pub(crate) provider_id: String,
  pub(crate) protocol: String,
  pub(crate) model: String,
  #[serde(alias = "backendConfig")]
  pub(crate) config: BackendConfig,
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
#[serde(from = "LlmEmbeddingRequestContract")]
pub(crate) struct LlmEmbeddingDispatchPayload {
  pub(crate) request: EmbeddingRequest,
}

impl From<LlmEmbeddingRequestContract> for LlmEmbeddingDispatchPayload {
  fn from(request: LlmEmbeddingRequestContract) -> Self {
    Self {
      request: request.into(),
    }
  }
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

pub(crate) type LlmPreparedImageDispatchRoutePayload = SerializablePreparedRoute<LlmImageRequestContract>;

#[cfg(test)]
mod tests {
  use llm_adapter::router::SerializablePreparedRoute;

  use super::{
    LlmDispatchPayload, LlmPreparedImageDispatchRoutePayload, LlmRerankDispatchPayload, LlmStructuredDispatchPayload,
  };

  #[test]
  fn prepared_chat_route_payload_deserializes_nested_request() {
    let payload = serde_json::from_value::<Vec<SerializablePreparedRoute<LlmDispatchPayload>>>(serde_json::json!([
      {
        "provider_id": "openai-primary",
        "protocol": "openai_chat",
        "model": "gpt-5-mini",
        "config": {
          "base_url": "https://api.openai.com",
          "auth_token": "test-key"
        },
        "request": {
          "model": "gpt-5-mini",
          "messages": [
            {
              "role": "user",
              "content": [{ "type": "text", "text": "hello" }]
            }
          ]
        }
      }
    ]))
    .expect("prepared chat route payload should deserialize");

    assert_eq!(payload[0].model, "gpt-5-mini");
    assert_eq!(payload[0].request.request.model, "gpt-5-mini");
  }

  #[test]
  fn prepared_structured_route_payload_deserializes_nested_request() {
    let payload =
      serde_json::from_value::<Vec<SerializablePreparedRoute<LlmStructuredDispatchPayload>>>(serde_json::json!([
        {
          "provider_id": "openai-primary",
          "protocol": "openai_responses",
          "model": "gpt-5-mini",
          "config": {
            "base_url": "https://api.openai.com",
            "auth_token": "test-key"
          },
          "request": {
            "model": "gpt-5-mini",
            "messages": [
              {
                "role": "user",
                "content": [{ "type": "text", "text": "hello" }]
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "summary": { "type": "string" }
              },
              "required": ["summary"]
            }
          }
        }
      ]))
      .expect("prepared structured route payload should deserialize");

    assert_eq!(payload[0].model, "gpt-5-mini");
    assert_eq!(payload[0].request.request.model, "gpt-5-mini");
  }

  #[test]
  fn prepared_rerank_route_payload_deserializes_nested_request() {
    let payload =
      serde_json::from_value::<Vec<SerializablePreparedRoute<LlmRerankDispatchPayload>>>(serde_json::json!([
        {
          "provider_id": "openai-primary",
          "protocol": "openai_chat",
          "model": "gpt-5-mini",
          "config": {
            "base_url": "https://api.openai.com",
            "auth_token": "test-key"
          },
          "request": {
            "model": "gpt-5-mini",
            "query": "hello",
            "candidates": [{ "text": "world" }]
          }
        }
      ]))
      .expect("prepared rerank route payload should deserialize");

    assert_eq!(payload[0].model, "gpt-5-mini");
    assert_eq!(payload[0].request.request.model, "gpt-5-mini");
  }

  #[test]
  fn prepared_image_route_payload_deserializes_nested_request() {
    let payload = serde_json::from_value::<Vec<LlmPreparedImageDispatchRoutePayload>>(serde_json::json!([
      {
        "provider_id": "openai-primary",
        "protocol": "openai_images",
        "model": "gpt-image-1",
        "config": {
          "base_url": "https://api.openai.com",
          "auth_token": "test-key",
          "request_layer": "openai_images"
        },
        "request": {
          "model": "gpt-image-1",
          "prompt": "draw",
          "operation": "generate"
        }
      }
    ]))
    .expect("prepared image route payload should deserialize");

    assert_eq!(payload[0].model, "gpt-image-1");
    assert_eq!(payload[0].request.prompt, "draw");
  }
}
