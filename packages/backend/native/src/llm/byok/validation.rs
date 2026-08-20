use sha2::{Digest, Sha256};

use super::{ByokProfileDefinition, ByokValidationOutput};

pub(crate) fn definition_fingerprint(definition: &ByokProfileDefinition) -> String {
  let encoded = serde_json::to_vec(definition).expect("validated BYOK definition must serialize");
  Sha256::digest(encoded)
    .iter()
    .map(|byte| format!("{byte:02x}"))
    .collect()
}

pub(crate) fn reconcile_validation(
  validation: Option<ByokValidationOutput>,
  old_definition: &ByokProfileDefinition,
  definition: &ByokProfileDefinition,
  credential_generation: i32,
  credential_changed: bool,
) -> Option<ByokValidationOutput> {
  let mut validation = validation?;
  if credential_changed || old_definition.endpoint != definition.endpoint {
    return None;
  }
  validation.models.retain(|evidence| {
    let old = old_definition
      .models
      .iter()
      .find(|model| model.model_id == evidence.model_id);
    let new = definition
      .models
      .iter()
      .find(|model| model.model_id == evidence.model_id);
    old.is_some() && old == new
  });
  validation.definition_fingerprint = definition_fingerprint(definition);
  validation.credential_generation = credential_generation;
  Some(validation)
}

#[cfg(test)]
mod tests {
  use llm_adapter::capability::{DeclaredModelCapability, ModelInput, ModelOutput};

  use super::*;
  use crate::llm::byok::{ByokEndpoint, ByokModelDeclaration, ByokModelProbeOutput, ByokProbeStatusOutput};

  fn definition(models: &[&str]) -> ByokProfileDefinition {
    ByokProfileDefinition {
      endpoint: ByokEndpoint::ProviderDefault,
      models: models
        .iter()
        .map(|model| ByokModelDeclaration {
          model_id: (*model).to_string(),
          enabled: true,
          capabilities: vec![DeclaredModelCapability {
            input: vec![ModelInput::Text],
            output: vec![ModelOutput::Text],
            features: vec![],
            attachment_kinds: vec![],
            attachment_sources: vec![],
          }],
        })
        .collect(),
    }
  }

  #[test]
  fn keeps_only_unchanged_model_evidence() {
    let old = definition(&["a", "b"]);
    let new = definition(&["b", "c"]);
    let validation = ByokValidationOutput {
      definition_fingerprint: definition_fingerprint(&old),
      credential_generation: 1,
      connection: ByokProbeStatusOutput {
        kind: "verified".to_string(),
        tested_at_ms: Some(1),
        error_kind: None,
      },
      models: ["a", "b"]
        .into_iter()
        .map(|model_id| ByokModelProbeOutput {
          model_id: model_id.to_string(),
          checks: vec![],
        })
        .collect(),
    };
    let next = reconcile_validation(Some(validation), &old, &new, 1, false).unwrap();
    assert_eq!(next.models.len(), 1);
    assert_eq!(next.models[0].model_id, "b");
    assert_eq!(next.definition_fingerprint, definition_fingerprint(&new));
  }
}
