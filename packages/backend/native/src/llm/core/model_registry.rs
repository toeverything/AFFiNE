use napi::Result;

use crate::llm::core::contracts::{
  ModelRegistryMatchRequest, ModelRegistryMatchResponse, ModelRegistryResolveRequest, ModelRegistryResolveResponse,
  ModelRegistryVariantContract,
};

fn to_contract_variant(variant: &llm_adapter::core::ModelRegistryVariant) -> Result<ModelRegistryVariantContract> {
  serde_json::to_value(variant)
    .and_then(serde_json::from_value)
    .map_err(crate::llm::map_json_error)
}

#[napi(catch_unwind)]
pub fn llm_resolve_model_registry_variant(
  request: ModelRegistryResolveRequest,
) -> Result<ModelRegistryResolveResponse> {
  let variants = llm_adapter::core::default_model_registry_variants();
  let response = match llm_adapter::core::resolve_model_registry_variant(
    &variants,
    request.backend_kind.as_deref(),
    request.model_id.as_str(),
  )
  .map_err(crate::llm::host::invalid_arg)?
  {
    Some((variant, matched_by)) => ModelRegistryResolveResponse {
      variant: Some(to_contract_variant(variant)?),
      matched_by: Some(matched_by.to_string()),
    },
    None => ModelRegistryResolveResponse {
      variant: None,
      matched_by: None,
    },
  };

  Ok(response)
}

#[napi(catch_unwind)]
pub fn llm_match_model_registry(request: ModelRegistryMatchRequest) -> Result<ModelRegistryMatchResponse> {
  let variants = llm_adapter::core::default_model_registry_variants();
  let cond = serde_json::to_value(request.cond)
    .and_then(serde_json::from_value)
    .map_err(crate::llm::map_json_error)?;
  let response = ModelRegistryMatchResponse {
    variant: llm_adapter::core::select_model_registry_variant(&variants, request.backend_kind.as_str(), &cond)
      .map_err(crate::llm::host::invalid_arg)?
      .map(to_contract_variant)
      .transpose()?,
  };

  Ok(response)
}

#[cfg(test)]
mod tests {
  use super::{llm_match_model_registry, llm_resolve_model_registry_variant};
  use crate::llm::core::contracts::{ModelConditionsContract, ModelRegistryMatchRequest, ModelRegistryResolveRequest};

  #[test]
  fn should_resolve_backend_scoped_alias() {
    let response = llm_resolve_model_registry_variant(ModelRegistryResolveRequest {
      backend_kind: Some("anthropic_vertex".to_string()),
      model_id: "claude-sonnet-4.5".to_string(),
    })
    .unwrap();

    assert_eq!(response.matched_by.as_deref(), Some("canonical"));
    assert_eq!(response.variant.unwrap().raw_model_id, "claude-sonnet-4-5@20250929");
  }

  #[test]
  fn should_reject_ambiguous_alias_without_backend() {
    let error = llm_resolve_model_registry_variant(ModelRegistryResolveRequest {
      backend_kind: None,
      model_id: "claude-sonnet-4.5".to_string(),
    })
    .unwrap_err();

    assert!(error.to_string().contains("Ambiguous canonical"));
  }

  #[test]
  fn should_resolve_legacy_alias() {
    let response = llm_resolve_model_registry_variant(ModelRegistryResolveRequest {
      backend_kind: Some("openai_responses".to_string()),
      model_id: "gpt-5-2025-08-07".to_string(),
    })
    .unwrap();

    assert_eq!(response.matched_by.as_deref(), Some("legacy_alias"));
    assert_eq!(response.variant.unwrap().raw_model_id, "gpt-5");
  }

  #[test]
  fn should_match_default_variant_by_backend_and_output() {
    let cond = ModelConditionsContract {
      input_types: Some(vec!["text".to_string()]),
      attachment_kinds: None,
      attachment_source_kinds: None,
      has_remote_attachments: None,
      model_id: None,
      output_type: Some("embedding".to_string()),
    };
    let response = llm_match_model_registry(ModelRegistryMatchRequest {
      backend_kind: "gemini_api".to_string(),
      cond,
    })
    .unwrap();

    assert_eq!(response.variant.unwrap().raw_model_id, "gemini-embedding-001");
  }

  #[test]
  fn should_resolve_gemini_embedding_2() {
    let response = llm_resolve_model_registry_variant(ModelRegistryResolveRequest {
      backend_kind: Some("gemini_api".to_string()),
      model_id: "gemini-embedding-2".to_string(),
    })
    .unwrap();
    let variant = response.variant.unwrap();

    assert_eq!(variant.raw_model_id, "gemini-embedding-2");
    assert_eq!(variant.protocol.as_deref(), Some("gemini"));
    assert_eq!(variant.request_layer.as_deref(), Some("gemini_api"));
    assert_eq!(variant.display_name.as_deref(), Some("Gemini Embedding 2"));
  }

  #[test]
  fn should_keep_same_raw_id_as_two_backend_variants() {
    let api_variant = llm_resolve_model_registry_variant(ModelRegistryResolveRequest {
      backend_kind: Some("gemini_api".to_string()),
      model_id: "gemini-2.5-flash".to_string(),
    })
    .unwrap()
    .variant
    .unwrap();
    let vertex_variant = llm_resolve_model_registry_variant(ModelRegistryResolveRequest {
      backend_kind: Some("gemini_vertex".to_string()),
      model_id: "gemini-2.5-flash".to_string(),
    })
    .unwrap()
    .variant
    .unwrap();

    assert_eq!(api_variant.raw_model_id, vertex_variant.raw_model_id);
    assert_ne!(api_variant.backend_kind, vertex_variant.backend_kind);
  }

  #[test]
  fn should_route_image_models_to_image_protocols() {
    let openai = llm_match_model_registry(ModelRegistryMatchRequest {
      backend_kind: "openai_responses".to_string(),
      cond: ModelConditionsContract {
        input_types: Some(vec!["text".to_string()]),
        attachment_kinds: None,
        attachment_source_kinds: None,
        has_remote_attachments: None,
        model_id: Some("gpt-image-1".to_string()),
        output_type: Some("image".to_string()),
      },
    })
    .unwrap()
    .variant
    .unwrap();
    assert_eq!(openai.protocol.as_deref(), Some("openai_images"));
    assert_eq!(openai.request_layer.as_deref(), Some("openai_images"));

    let fal = llm_match_model_registry(ModelRegistryMatchRequest {
      backend_kind: "fal".to_string(),
      cond: ModelConditionsContract {
        input_types: Some(vec!["text".to_string()]),
        attachment_kinds: None,
        attachment_source_kinds: None,
        has_remote_attachments: None,
        model_id: Some("flux-1/schnell".to_string()),
        output_type: Some("image".to_string()),
      },
    })
    .unwrap()
    .variant
    .unwrap();
    assert_eq!(fal.protocol.as_deref(), Some("fal_image"));
    assert_eq!(fal.request_layer.as_deref(), Some("fal"));

    let gemini = llm_match_model_registry(ModelRegistryMatchRequest {
      backend_kind: "gemini_api".to_string(),
      cond: ModelConditionsContract {
        input_types: Some(vec!["text".to_string()]),
        attachment_kinds: None,
        attachment_source_kinds: None,
        has_remote_attachments: None,
        model_id: Some("gemini-2.5-flash-image".to_string()),
        output_type: Some("image".to_string()),
      },
    })
    .unwrap()
    .variant
    .unwrap();
    assert_eq!(gemini.protocol.as_deref(), Some("gemini"));
    assert_eq!(gemini.request_layer.as_deref(), Some("gemini_api"));

    let generic_gemini_image = llm_match_model_registry(ModelRegistryMatchRequest {
      backend_kind: "gemini_api".to_string(),
      cond: ModelConditionsContract {
        input_types: Some(vec!["text".to_string()]),
        attachment_kinds: None,
        attachment_source_kinds: None,
        has_remote_attachments: None,
        model_id: Some("gemini-2.5-flash".to_string()),
        output_type: Some("image".to_string()),
      },
    })
    .unwrap();
    assert!(generic_gemini_image.variant.is_none());
  }
}
