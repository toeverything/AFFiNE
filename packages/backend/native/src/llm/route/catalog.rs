use llm_adapter::capability::{
  AttachmentKind, AttachmentSource, ModelFeature, ModelInput, ModelOutput, ModelRequirements,
};

pub(crate) use crate::llm::prompt_catalog::ManagedTarget;
use crate::llm::{
  prompt_catalog::{built_in_managed_catalog, built_in_managed_target, built_in_managed_targets, managed_model},
  route::CopilotManagedTier,
};

#[derive(Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum RouteOperation {
  Chat,
  Structured,
  Embedding,
  Rerank,
  Image,
  Transcription,
}

impl From<RouteOperation> for llm_adapter::target::BackendOperation {
  fn from(operation: RouteOperation) -> Self {
    match operation {
      RouteOperation::Chat => Self::Chat,
      RouteOperation::Structured | RouteOperation::Transcription => Self::Structured,
      RouteOperation::Embedding => Self::Embedding,
      RouteOperation::Rerank => Self::Rerank,
      RouteOperation::Image => Self::Image,
    }
  }
}

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct CatalogSlot {
  pub(crate) id: &'static str,
  pub(crate) operation: RouteOperation,
  pub(crate) requirements: ModelRequirements,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum QuotaPolicy {
  Metered,
  Internal,
  System,
}

pub(crate) fn quota_policy(slot: &CatalogSlot, built_in_route_id: Option<&str>) -> QuotaPolicy {
  if matches!(slot.id, "index.embedding" | "search.rerank") {
    QuotaPolicy::System
  } else if built_in_route_id == Some("Summary as title") {
    QuotaPolicy::Internal
  } else {
    QuotaPolicy::Metered
  }
}

pub(crate) fn managed_targets(
  slot: &CatalogSlot,
  built_in_route_id: Option<&str>,
  managed_tier: CopilotManagedTier,
) -> Option<Vec<ManagedTarget>> {
  if let Some(route_id) = built_in_route_id {
    return built_in_managed_targets(route_id, managed_tier == CopilotManagedTier::Premium)
      .map(<[ManagedTarget]>::to_vec);
  }
  match slot.id {
    "index.embedding" => Some(vec![managed_model("embedding").unwrap().clone()]),
    "search.rerank" => Some(vec![managed_model("rerank").unwrap().clone()]),
    _ => None,
  }
}

pub(crate) fn managed_catalog() -> Vec<(ManagedTarget, llm_adapter::target::BackendOperation)> {
  let mut targets = built_in_managed_catalog();
  for id in ["index.embedding", "search.rerank"] {
    let system_slot = slot(id).unwrap();
    targets.extend(
      managed_targets(&system_slot, None, CopilotManagedTier::Standard)
        .unwrap()
        .into_iter()
        .map(|target| (target, system_slot.operation.into())),
    );
  }
  let mut unique = Vec::new();
  for target in targets {
    if !unique.contains(&target) {
      unique.push(target);
    }
  }
  unique
}

pub(crate) fn managed_selected_target(
  built_in_route_id: Option<&str>,
  target_id: &str,
  managed_tier: CopilotManagedTier,
) -> Option<ManagedTarget> {
  built_in_managed_target(
    built_in_route_id?,
    target_id,
    managed_tier == CopilotManagedTier::Premium,
  )
  .map(|target| target.target.clone())
}

pub(crate) fn slot(id: &str) -> Option<CatalogSlot> {
  let (canonical, operation, input, output, features, attachment_kinds, attachment_sources) = match id {
    "chat.default" | "prompt.text" => (
      if id == "chat.default" {
        "chat.default"
      } else {
        "prompt.text"
      },
      RouteOperation::Chat,
      vec![ModelInput::Text],
      vec![ModelOutput::Text],
      vec![],
      vec![],
      vec![],
    ),
    "chat.structured" | "prompt.structured" => (
      if id == "chat.structured" {
        "chat.structured"
      } else {
        "prompt.structured"
      },
      RouteOperation::Structured,
      vec![ModelInput::Text],
      vec![ModelOutput::Structured],
      vec![],
      vec![],
      vec![],
    ),
    "action.mindmap.generate" => (
      "action.mindmap.generate",
      RouteOperation::Structured,
      vec![ModelInput::Text],
      vec![ModelOutput::Structured],
      vec![],
      vec![],
      vec![],
    ),
    "action.slides.outline" => (
      "action.slides.outline",
      RouteOperation::Structured,
      vec![ModelInput::Text],
      vec![ModelOutput::Structured],
      vec![],
      vec![],
      vec![],
    ),
    "image.generate"
    | "action.image.filter.sketch"
    | "action.image.filter.clay"
    | "action.image.filter.anime"
    | "action.image.filter.pixel" => (
      match id {
        "image.generate" => "image.generate",
        "action.image.filter.sketch" => "action.image.filter.sketch",
        "action.image.filter.clay" => "action.image.filter.clay",
        "action.image.filter.anime" => "action.image.filter.anime",
        _ => "action.image.filter.pixel",
      },
      RouteOperation::Image,
      vec![ModelInput::Text],
      vec![ModelOutput::Image],
      vec![],
      vec![],
      vec![],
    ),
    "index.embedding" => (
      "index.embedding",
      RouteOperation::Embedding,
      vec![ModelInput::Text],
      vec![ModelOutput::Embedding],
      vec![],
      vec![],
      vec![],
    ),
    "search.rerank" => (
      "search.rerank",
      RouteOperation::Rerank,
      vec![ModelInput::Text],
      vec![ModelOutput::Rerank],
      vec![],
      vec![],
      vec![],
    ),
    "transcript.audio" => (
      "transcript.audio",
      RouteOperation::Transcription,
      vec![ModelInput::Audio],
      vec![ModelOutput::Structured],
      vec![],
      vec![AttachmentKind::Audio],
      vec![
        AttachmentSource::Url,
        AttachmentSource::Data,
        AttachmentSource::Bytes,
        AttachmentSource::FileHandle,
      ],
    ),
    _ => return None,
  };
  Some(CatalogSlot {
    id: canonical,
    operation,
    requirements: ModelRequirements {
      input,
      output,
      features,
      attachment_kinds,
      attachment_sources,
    },
  })
}

pub(crate) fn with_request_requirements(
  mut slot: CatalogSlot,
  needs_tools: bool,
  attachment_kinds: Vec<AttachmentKind>,
  attachment_sources: Vec<AttachmentSource>,
) -> CatalogSlot {
  if needs_tools {
    slot.requirements.features.push(ModelFeature::ToolCalling);
  }
  for kind in attachment_kinds {
    let input = match kind {
      AttachmentKind::Image => ModelInput::Image,
      AttachmentKind::Audio => ModelInput::Audio,
      AttachmentKind::File => ModelInput::File,
    };
    if !slot.requirements.input.contains(&input) {
      slot.requirements.input.push(input);
    }
    if !slot.requirements.attachment_kinds.contains(&kind) {
      slot.requirements.attachment_kinds.push(kind);
    }
  }
  for source in attachment_sources {
    if !slot.requirements.attachment_sources.contains(&source) {
      slot.requirements.attachment_sources.push(source);
    }
  }
  slot
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn inventory_slots_have_one_operation_and_explicit_requirements() {
    let slots = [
      "chat.default",
      "chat.structured",
      "prompt.text",
      "prompt.structured",
      "action.mindmap.generate",
      "action.slides.outline",
      "action.image.filter.sketch",
      "action.image.filter.clay",
      "action.image.filter.anime",
      "action.image.filter.pixel",
      "image.generate",
      "index.embedding",
      "search.rerank",
      "transcript.audio",
    ];
    for id in slots {
      let slot = slot(id).expect("inventory slot must exist");
      assert!(!slot.requirements.input.is_empty());
      assert!(!slot.requirements.output.is_empty());
    }
  }

  #[test]
  fn managed_routes_are_built_in_by_prompt_or_system_slot() {
    let prompt_slot = slot("prompt.text").unwrap();
    assert_eq!(
      managed_targets(&prompt_slot, Some("Summary as title"), CopilotManagedTier::Standard).unwrap(),
      [ManagedTarget {
        api_shapes: vec![
          llm_adapter::backend::ApiShape::Responses,
          llm_adapter::backend::ApiShape::ChatCompletions
        ],
        model_id: "gpt-6-luna".into()
      }]
    );
    assert!(
      managed_targets(
        &prompt_slot,
        Some("workflow:presentation"),
        CopilotManagedTier::Standard
      )
      .is_none()
    );
    assert_eq!(
      managed_targets(
        &prompt_slot,
        Some("Transcript audio structured"),
        CopilotManagedTier::Premium
      )
      .unwrap(),
      [ManagedTarget {
        api_shapes: vec![
          llm_adapter::backend::ApiShape::GeminiApi,
          llm_adapter::backend::ApiShape::GeminiVertex
        ],
        model_id: "gemini-3.8-flash".into()
      }]
    );
    assert_eq!(
      managed_targets(&slot("index.embedding").unwrap(), None, CopilotManagedTier::Standard).unwrap(),
      [ManagedTarget {
        api_shapes: vec![
          llm_adapter::backend::ApiShape::GeminiApi,
          llm_adapter::backend::ApiShape::GeminiVertex
        ],
        model_id: "gemini-embedding-001".into()
      }]
    );
    assert_eq!(
      managed_targets(&slot("search.rerank").unwrap(), None, CopilotManagedTier::Standard).unwrap(),
      [ManagedTarget {
        api_shapes: vec![llm_adapter::backend::ApiShape::ChatCompletions],
        model_id: "gpt-4o-mini".into()
      }]
    );
    let inventory = managed_catalog();
    assert!(
      inventory
        .iter()
        .any(|(target, operation)| target.model_id == "gpt-image-2.6-flare"
          && *operation == llm_adapter::target::BackendOperation::Image)
    );
    assert!(
      !inventory
        .iter()
        .any(|(target, operation)| target.model_id == "gpt-image-2.6-flare"
          && *operation == llm_adapter::target::BackendOperation::Chat)
    );
    assert!(
      inventory
        .iter()
        .any(|(target, operation)| target.model_id == "gemini-3.5-flash-lite"
          && *operation == llm_adapter::target::BackendOperation::Structured)
    );
    assert!(
      !inventory
        .iter()
        .any(|(target, operation)| target.model_id == "gemini-3.5-flash-lite"
          && *operation == llm_adapter::target::BackendOperation::Image)
    );
    assert!(matches!(
      quota_policy(&prompt_slot, Some("Summary as title")),
      QuotaPolicy::Internal
    ));
    assert!(matches!(
      quota_policy(&prompt_slot, Some("Chat With AFFiNE AI")),
      QuotaPolicy::Metered
    ));
    assert!(matches!(
      quota_policy(&slot("index.embedding").unwrap(), None),
      QuotaPolicy::System
    ));
  }
}
