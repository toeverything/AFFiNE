use llm_adapter::core::{self as adapter_core, EmbeddingRequest, ImageInput, ImageRequest, RerankRequest};
use napi::Result;
use napi_derive::napi;
use serde::Serialize;

use super::contracts::{
  CanonicalChatRequestContract, CanonicalStructuredRequestContract, LlmEmbeddingRequestContract,
  LlmImageRequestBuildContract, LlmImageRequestContract, LlmRequestContract, LlmRerankRequestContract,
  LlmStructuredRequestContract, ModelConditionsContract, PromptMessageContract,
};
use crate::llm::{LlmDispatchPayload, LlmRerankDispatchPayload, LlmStructuredDispatchPayload, host::invalid_arg};

mod types;

use self::types::{CanonicalChatRequest, CanonicalStructuredRequest, PromptMessageInput};

fn map_builder_error(error: llm_adapter::backend::BackendError) -> napi::Error {
  match error {
    llm_adapter::backend::BackendError::InvalidRequest { message, .. } => invalid_arg(message),
    other => invalid_arg(other.to_string()),
  }
}

fn to_adapter<T, U>(value: &T) -> Result<U>
where
  T: Serialize,
  U: serde::de::DeserializeOwned,
{
  serde_json::to_value(value)
    .and_then(serde_json::from_value)
    .map_err(crate::llm::map_json_error)
}

pub(crate) fn build_canonical_request(request: CanonicalChatRequest) -> Result<LlmDispatchPayload> {
  let middleware = request.middleware.clone();
  let request = adapter_core::build_canonical_chat_request(request.request).map_err(map_builder_error)?;
  Ok(LlmDispatchPayload { request, middleware })
}

pub(crate) fn build_canonical_structured_request(
  request: CanonicalStructuredRequest,
) -> Result<LlmStructuredDispatchPayload> {
  let middleware = request.middleware.clone();
  let request = adapter_core::build_canonical_structured_request(request.request).map_err(map_builder_error)?;
  Ok(LlmStructuredDispatchPayload { request, middleware })
}

pub(crate) fn build_embedding_request(request: EmbeddingRequest) -> Result<EmbeddingRequest> {
  request.validate().map_err(|error| invalid_arg(error.to_string()))?;
  Ok(request)
}

pub(crate) fn build_rerank_request(request: RerankRequest) -> Result<LlmRerankDispatchPayload> {
  request.validate().map_err(|error| invalid_arg(error.to_string()))?;
  Ok(LlmRerankDispatchPayload { request })
}

#[cfg(test)]
pub(crate) fn build_image_request(request: ImageRequest) -> Result<ImageRequest> {
  request.validate().map_err(|error| invalid_arg(error.to_string()))?;
  Ok(request)
}

pub(crate) fn build_image_request_from_messages(request: LlmImageRequestBuildContract) -> Result<ImageRequest> {
  let protocol = request.protocol.clone();
  let mut request =
    adapter_core::build_image_request_from_prompt_messages(to_adapter(&request)?).map_err(map_builder_error)?;
  if protocol == "fal_image" {
    keep_fal_data_uri_inputs_as_urls(&mut request);
  }
  Ok(request)
}

fn keep_fal_data_uri_inputs_as_urls(request: &mut ImageRequest) {
  let ImageRequest::Edit(edit) = request else {
    return;
  };

  for image in &mut edit.images {
    let replacement = match image {
      ImageInput::Data {
        data_base64,
        media_type,
        ..
      } => Some(ImageInput::Url {
        url: format!("data:{media_type};base64,{data_base64}"),
        media_type: Some(media_type.clone()),
      }),
      _ => None,
    };
    if let Some(replacement) = replacement {
      *image = replacement;
    }
  }
}

pub(crate) fn infer_prompt_model_conditions(messages: Vec<PromptMessageInput>) -> Result<ModelConditionsContract> {
  let messages = adapter_core::canonicalize_prompt_messages(to_adapter_prompt_messages(messages)?);
  serde_json::to_value(adapter_core::infer_model_conditions_from_prompt_messages(messages))
    .and_then(serde_json::from_value)
    .map_err(crate::llm::map_json_error)
}

#[napi(catch_unwind)]
pub fn llm_build_canonical_request(request: CanonicalChatRequestContract) -> Result<LlmRequestContract> {
  build_canonical_request(request.try_into()?)?.try_into()
}

#[napi(catch_unwind)]
pub fn llm_build_canonical_structured_request(
  request: CanonicalStructuredRequestContract,
) -> Result<LlmStructuredRequestContract> {
  build_canonical_structured_request(request.try_into()?)?.try_into()
}

#[napi(catch_unwind)]
pub fn llm_build_embedding_request(request: LlmEmbeddingRequestContract) -> Result<LlmEmbeddingRequestContract> {
  Ok(build_embedding_request(request.into())?.into())
}

#[napi(catch_unwind)]
pub fn llm_build_rerank_request(request: LlmRerankRequestContract) -> Result<LlmRerankRequestContract> {
  Ok(build_rerank_request(request.into())?.into())
}

#[napi(catch_unwind)]
pub fn llm_build_image_request_from_messages(request: LlmImageRequestBuildContract) -> Result<LlmImageRequestContract> {
  Ok(build_image_request_from_messages(request)?.into())
}

#[napi(catch_unwind)]
pub fn llm_infer_prompt_model_conditions(messages: Vec<PromptMessageContract>) -> Result<ModelConditionsContract> {
  infer_prompt_model_conditions(to_adapter_prompt_messages(messages)?)
}

fn to_adapter_prompt_messages<T: Serialize>(messages: Vec<T>) -> Result<Vec<adapter_core::PromptMessageInput>> {
  serde_json::to_value(messages)
    .and_then(serde_json::from_value)
    .map_err(crate::llm::map_json_error)
}

#[cfg(test)]
mod tests {
  use llm_adapter::core::{EmbeddingRequest, ImageRequest, RerankCandidate};
  use serde_json::json;

  use super::{
    build_embedding_request, build_image_request, build_rerank_request, llm_build_canonical_request,
    llm_build_canonical_structured_request, llm_build_image_request_from_messages, llm_infer_prompt_model_conditions,
  };
  use crate::llm::core::contracts::{
    CanonicalChatRequestContract, CanonicalStructuredRequestContract, PromptMessageContract,
  };

  #[test]
  fn should_materialize_chat_request_with_system_lift_and_attachments() {
    let response = llm_build_canonical_request(
      serde_json::from_value::<CanonicalChatRequestContract>(json!({
        "model": "gpt-4.1",
        "messages": [
          { "role": "system", "content": "system instruction" },
          {
            "role": "user",
            "content": "hello",
            "attachments": [
              {
                "kind": "url",
                "url": "https://affine.pro/image.png"
              }
            ]
          },
          { "role": "system", "content": "ignored" }
        ],
        "tools": [
          {
            "name": "doc_read",
            "parameters": { "type": "object" }
          }
        ],
        "middleware": {
          "request": ["normalize_messages"]
        }
      }))
      .unwrap(),
    )
    .unwrap();
    let response = serde_json::to_value(response).unwrap();

    assert_eq!(
      response,
      json!({
        "model": "gpt-4.1",
        "messages": [
          {
            "role": "system",
            "content": [{ "type": "text", "text": "system instruction" }]
          },
          {
            "role": "user",
            "content": [
              { "type": "text", "text": "hello" },
              {
                "type": "image",
                "source": {
                  "url": "https://affine.pro/image.png",
                  "media_type": "image/png"
                }
              }
            ]
          }
        ],
        "stream": true,
        "tools": [
          {
            "name": "doc_read",
            "parameters": { "type": "object" }
          }
        ],
        "toolChoice": "auto",
        "middleware": {
          "request": ["normalize_messages"],
          "stream": [],
          "config": {
            "additional_properties_policy": "preserve",
            "array_max_items_policy": "preserve",
            "array_min_items_policy": "preserve",
            "max_tokens_cap": null,
            "property_format_policy": "preserve",
            "property_min_length_policy": "preserve"
          }
        }
      }),
    );
  }

  #[test]
  fn should_materialize_structured_request_with_response_contract() {
    let response = llm_build_canonical_structured_request(
      serde_json::from_value::<CanonicalStructuredRequestContract>(json!({
        "model": "gemini-2.5-flash",
        "messages": [
          { "role": "user", "content": "hello" }
        ],
        "schema": { "type": "object" },
        "strict": true,
        "responseMimeType": "application/json"
      }))
      .unwrap(),
    )
    .unwrap();
    let response = serde_json::to_value(response).unwrap();

    assert_eq!(
      response,
      json!({
        "model": "gemini-2.5-flash",
        "messages": [
          {
            "role": "user",
            "content": [{ "type": "text", "text": "hello" }]
          }
        ],
        "schema": { "type": "object" },
        "strict": true,
        "responseMimeType": "application/json"
      }),
    );
  }

  #[test]
  fn should_require_explicit_response_contract_for_structured_request() {
    let error = llm_build_canonical_structured_request(
      serde_json::from_value::<CanonicalStructuredRequestContract>(json!({
        "model": "gpt-4.1",
        "messages": [
          {
            "role": "system",
            "content": "Return JSON only",
            "responseFormat": {
              "type": "json_schema",
              "responseSchemaJson": { "type": "object", "properties": { "summary": { "type": "string" } } },
              "schemaHash": "summary-v1",
              "strict": false
            }
          },
          { "role": "user", "content": "hello" }
        ],
        "responseMimeType": "application/json"
      }))
      .unwrap(),
    )
    .unwrap_err();

    assert!(error.to_string().contains("Schema is required"));
  }

  #[test]
  fn should_reject_unsupported_attachment_kind() {
    let error = llm_build_canonical_request(
      serde_json::from_value::<CanonicalChatRequestContract>(json!({
        "model": "gpt-4.1",
        "messages": [
          {
            "role": "user",
            "content": "hello",
            "attachments": [
              {
                "kind": "url",
                "url": "https://affine.pro/doc.pdf",
                "mimeType": "application/pdf"
              }
            ]
          }
        ],
        "attachmentCapability": {
          "kinds": ["image"],
          "sourceKinds": ["url"],
          "allowRemoteUrls": true
        }
      }))
      .unwrap(),
    )
    .unwrap_err();

    assert_eq!(error.reason, "Native path does not support file attachments");
  }

  #[test]
  fn should_reject_remote_attachment_when_capability_disallows_it() {
    let error = llm_build_canonical_structured_request(
      serde_json::from_value::<CanonicalStructuredRequestContract>(json!({
        "model": "gpt-4.1",
        "messages": [
          {
            "role": "user",
            "content": "hello",
            "attachments": [
              {
                "kind": "url",
                "url": "https://affine.pro/image.png",
                "mimeType": "image/png"
              }
            ]
          }
        ],
        "schema": { "type": "object" },
        "attachmentCapability": {
          "kinds": ["image"],
          "sourceKinds": ["url"],
          "allowRemoteUrls": false
        }
      }))
      .unwrap(),
    )
    .unwrap_err();

    assert_eq!(error.reason, "Native path does not support remote attachment urls");
  }

  #[test]
  fn should_infer_prompt_model_conditions_from_canonicalized_attachments() {
    let response = llm_infer_prompt_model_conditions(
      serde_json::from_value::<Vec<PromptMessageContract>>(json!([
        {
          "role": "user",
          "content": "hello",
          "attachments": [
            {
              "kind": "url",
              "url": "https://affine.pro/image.png"
            },
            {
              "kind": "file_handle",
              "fileHandle": "file_123",
              "mimeType": "application/pdf"
            }
          ]
        }
      ]))
      .unwrap(),
    )
    .unwrap();
    let response = serde_json::to_value(response).unwrap();

    assert_eq!(
      response,
      json!({
        "inputTypes": ["image", "file"],
        "attachmentKinds": ["image", "file"],
        "attachmentSourceKinds": ["url", "file_handle"],
        "hasRemoteAttachments": true
      }),
    );
  }

  #[test]
  fn should_build_embedding_request_with_validation() {
    let request = build_embedding_request(EmbeddingRequest {
      model: "text-embedding-3-large".to_string(),
      inputs: vec!["hello".to_string()],
      dimensions: Some(256),
      task_type: Some("RETRIEVAL_DOCUMENT".to_string()),
    })
    .unwrap();

    assert_eq!(
      request,
      EmbeddingRequest {
        model: "text-embedding-3-large".to_string(),
        inputs: vec!["hello".to_string()],
        dimensions: Some(256),
        task_type: Some("RETRIEVAL_DOCUMENT".to_string()),
      }
    );
  }

  #[test]
  fn should_build_rerank_request_with_validation() {
    let request = build_rerank_request(llm_adapter::core::RerankRequest {
      model: "gpt-4.1-mini".to_string(),
      query: "hello".to_string(),
      candidates: vec![RerankCandidate {
        id: Some("1".to_string()),
        text: "hello affine".to_string(),
      }],
      top_n: Some(1),
    })
    .unwrap();

    assert_eq!(request.request.top_n, Some(1));
    assert_eq!(request.request.candidates.len(), 1);
  }

  #[test]
  fn should_build_image_request_with_validation() {
    let request = build_image_request(
      serde_json::from_value::<ImageRequest>(json!({
        "model": "gpt-image-1",
        "prompt": "remove background",
        "operation": "edit",
        "images": [{
          "kind": "data",
          "data_base64": "aW1n",
          "media_type": "image/png",
          "file_name": "in.png"
        }],
        "options": {
          "output_format": "webp",
          "output_compression": 80
        },
        "provider_options": {
          "provider": "openai",
          "options": {
            "input_fidelity": "high"
          }
        }
      }))
      .unwrap(),
    )
    .unwrap();

    assert!(request.is_edit());
    assert_eq!(request.images()[0].media_type(), Some("image/png"));
    assert_eq!(
      request
        .provider_options()
        .openai()
        .and_then(|options| options.input_fidelity.as_deref()),
      Some("high")
    );
  }

  #[test]
  fn should_keep_fal_data_uri_image_inputs_as_urls() {
    let response = llm_build_image_request_from_messages(
      serde_json::from_value(json!({
        "model": "lora/image-to-image",
        "protocol": "fal_image",
        "messages": [{
          "role": "user",
          "content": "restyle",
          "attachments": [{
            "kind": "url",
            "url": "data:image/png;base64,aW1n",
            "mimeType": "image/png"
          }]
        }]
      }))
      .unwrap(),
    )
    .unwrap();

    let response = serde_json::to_value(response).unwrap();
    assert_eq!(
      response.pointer("/images/0"),
      Some(&json!({
        "kind": "url",
        "url": "data:image/png;base64,aW1n",
        "media_type": "image/png"
      }))
    );
  }

  #[test]
  fn should_reject_invalid_image_request() {
    let error = build_image_request(
      serde_json::from_value::<ImageRequest>(json!({
        "model": "gpt-image-1",
        "prompt": "edit",
        "operation": "edit",
        "images": []
      }))
      .unwrap(),
    )
    .unwrap_err();

    assert!(error.reason.contains("edit requires at least one image"));
  }
}
