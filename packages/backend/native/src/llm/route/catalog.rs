use llm_adapter::capability::{
  AttachmentKind, AttachmentSource, ModelFeature, ModelInput, ModelOutput, ModelRequirements,
};

use crate::llm::{
  prompt_catalog::{built_in_managed_target, built_in_managed_targets},
  route::CopilotManagedTier,
};

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum RouteOperation {
  Chat,
  Structured,
  Embedding,
  Rerank,
  Image,
  Transcription,
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
) -> Option<Vec<String>> {
  if let Some(route_id) = built_in_route_id {
    return built_in_managed_targets(route_id, managed_tier == CopilotManagedTier::Premium).map(<[String]>::to_vec);
  }
  match slot.id {
    "index.embedding" => Some(vec!["gemini-embedding-001".to_string()]),
    "search.rerank" => Some(vec!["gpt-4o-mini".to_string()]),
    _ => None,
  }
}

pub(crate) fn managed_selected_target(
  built_in_route_id: Option<&str>,
  target_id: &str,
  managed_tier: CopilotManagedTier,
) -> Option<String> {
  built_in_managed_target(
    built_in_route_id?,
    target_id,
    managed_tier == CopilotManagedTier::Premium,
  )
  .map(|target| target.model_id.clone())
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
      ["gpt-5.6-luna"]
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
      ["gemini-3.7-flash"]
    );
    assert_eq!(
      managed_targets(&slot("index.embedding").unwrap(), None, CopilotManagedTier::Standard).unwrap(),
      ["gemini-embedding-001"]
    );
    assert_eq!(
      managed_targets(&slot("search.rerank").unwrap(), None, CopilotManagedTier::Standard).unwrap(),
      ["gpt-4o-mini"]
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
