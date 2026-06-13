use napi::Result;

use crate::llm::core::contracts::{
  CapabilityMatchRequest, CapabilityMatchResponse, RequestedModelMatchRequest, RequestedModelMatchResponse,
};

#[napi(catch_unwind)]
pub fn llm_match_model_capabilities(payload: CapabilityMatchRequest) -> Result<CapabilityMatchResponse> {
  let models = serde_json::to_value(payload.models)
    .and_then(serde_json::from_value::<Vec<llm_adapter::core::CandidateModel>>)
    .map_err(crate::llm::map_json_error)?;
  let cond = serde_json::to_value(payload.cond)
    .and_then(serde_json::from_value::<llm_adapter::core::ModelConditions>)
    .map_err(crate::llm::map_json_error)?;

  Ok(CapabilityMatchResponse {
    model_id: llm_adapter::core::select_model_id(&models, &cond).map_err(crate::llm::host::invalid_arg)?,
  })
}

#[napi(catch_unwind)]
pub fn llm_resolve_requested_model_match(payload: RequestedModelMatchRequest) -> Result<RequestedModelMatchResponse> {
  let matched_optional_model = llm_adapter::core::matches_requested_model_list(
    &payload.provider_ids,
    &payload.optional_models,
    payload.requested_model_id.as_deref(),
  );

  Ok(RequestedModelMatchResponse {
    selected_model: if matched_optional_model {
      payload.requested_model_id
    } else {
      payload.default_model
    },
    matched_optional_model,
  })
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::llm_match_model_capabilities;
  use crate::llm::core::contracts::CapabilityMatchRequest;

  #[test]
  fn should_select_default_model_for_output_type() {
    let response = llm_match_model_capabilities(
      serde_json::from_value::<CapabilityMatchRequest>(json!({
        "models": [
          {
            "id": "text-default",
            "capabilities": [{ "input": ["text"], "output": ["text"], "defaultForOutputType": true }]
          },
          {
            "id": "text-secondary",
            "capabilities": [{ "input": ["text"], "output": ["text"], "defaultForOutputType": false }]
          }
        ],
        "cond": { "inputTypes": ["text"], "outputType": "text" }
      }))
      .unwrap(),
    )
    .unwrap();

    assert_eq!(response.model_id.as_deref(), Some("text-default"));
  }

  #[test]
  fn should_reject_remote_attachments_when_capability_disallows_them() {
    let response = llm_match_model_capabilities(
      serde_json::from_value::<CapabilityMatchRequest>(json!({
        "models": [{
          "id": "image-only",
          "capabilities": [{
            "input": ["text", "image"],
            "output": ["text"],
            "attachments": {
              "kinds": ["image"],
              "sourceKinds": ["url"],
              "allowRemoteUrls": false
            },
            "defaultForOutputType": true
          }]
        }],
        "cond": {
          "inputTypes": ["text", "image"],
          "attachmentKinds": ["image"],
          "attachmentSourceKinds": ["url"],
          "hasRemoteAttachments": true,
          "modelId": "image-only",
          "outputType": "text"
        }
      }))
      .unwrap(),
    )
    .unwrap();

    assert_eq!(response.model_id, None);
  }
}
