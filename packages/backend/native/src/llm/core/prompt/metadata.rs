use llm_adapter::core::prompt_template::{collect_template_keys_in_order, parse_template};
use serde_json::Map;

use super::super::contracts::{PromptMessageContract, PromptMetadataResult};

pub(super) fn collect_prompt_metadata(messages: &[PromptMessageContract]) -> Result<PromptMetadataResult, String> {
  let mut param_keys = Vec::new();
  let mut template_params = Map::new();

  for message in messages {
    let tokens = parse_template(&message.content)?;
    collect_template_keys_in_order(&tokens, &mut param_keys);

    if let Some(params) = message.params.as_ref().and_then(|value| value.as_object()) {
      template_params.extend(params.clone());
    }
  }

  Ok(PromptMetadataResult {
    param_keys,
    template_params: serde_json::Value::Object(template_params),
  })
}
