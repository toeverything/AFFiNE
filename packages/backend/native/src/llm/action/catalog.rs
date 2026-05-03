use std::collections::HashSet;

use jsonschema::Draft;
use napi::{Error, Result, Status};
use serde_json::{Value, json};

use super::{
  super::contract_schema::{transcript_input_schema, transcript_result_schema},
  ActionRecipe, ActionRecipeStep, ActionStepKind,
};

fn invalid_recipe(message: impl Into<String>) -> Error {
  Error::new(Status::InvalidArg, message.into())
}

pub fn built_in_recipes() -> Vec<ActionRecipe> {
  vec![
    action_recipe("mindmap.generate", "v1"),
    action_recipe("slides.outline", "v1"),
    action_recipe("image.filter.sketch", "v1"),
    action_recipe("image.filter.clay", "v1"),
    action_recipe("image.filter.anime", "v1"),
    action_recipe("image.filter.pixel", "v1"),
    transcript_recipe("transcript.audio.gemini", "v1"),
  ]
}

pub fn find_recipe(id: &str, version: Option<&str>) -> Result<ActionRecipe> {
  let catalog = load_catalog()?;
  catalog
    .into_iter()
    .find(|recipe| recipe.id == id && version.is_none_or(|version| recipe.version == version))
    .ok_or_else(|| {
      invalid_recipe(format!(
        "Action recipe not found: {}{}",
        id,
        version.map(|version| format!("@{version}")).unwrap_or_default()
      ))
    })
}

pub fn load_catalog() -> Result<Vec<ActionRecipe>> {
  let recipes = built_in_recipes();
  validate_catalog(&recipes)?;
  Ok(recipes)
}

pub fn validate_catalog(recipes: &[ActionRecipe]) -> Result<()> {
  let mut keys = HashSet::new();
  for recipe in recipes {
    validate_recipe(recipe)?;
    let key = format!("{}@{}", recipe.id, recipe.version);
    if !keys.insert(key.clone()) {
      return Err(invalid_recipe(format!("Duplicated action recipe: {key}")));
    }
  }
  Ok(())
}

pub fn validate_recipe(recipe: &ActionRecipe) -> Result<()> {
  if recipe.id.trim().is_empty() {
    return Err(invalid_recipe("Action recipe id is required"));
  }
  if recipe.version.trim().is_empty() {
    return Err(invalid_recipe("Action recipe version is required"));
  }
  if recipe.steps.is_empty() {
    return Err(invalid_recipe(format!(
      "Action recipe {}@{} must declare at least one step",
      recipe.id, recipe.version
    )));
  }
  compile_schema("inputSchema", &recipe.input_schema)?;
  compile_schema("outputSchema", &recipe.output_schema)?;

  let mut step_ids = HashSet::new();
  let mut has_final = false;
  for step in &recipe.steps {
    if step.id.trim().is_empty() {
      return Err(invalid_recipe(format!(
        "Action recipe {}@{} contains a step without id",
        recipe.id, recipe.version
      )));
    }
    if !step_ids.insert(step.id.clone()) {
      return Err(invalid_recipe(format!(
        "Action recipe {}@{} contains duplicated step id {}",
        recipe.id, recipe.version, step.id
      )));
    }
    if step.kind == ActionStepKind::Final {
      has_final = true;
    }
  }
  if !has_final {
    return Err(invalid_recipe(format!(
      "Action recipe {}@{} must end with a final step",
      recipe.id, recipe.version
    )));
  }
  if recipe
    .steps
    .last()
    .is_some_and(|step| step.kind != ActionStepKind::Final)
  {
    return Err(invalid_recipe(format!(
      "Action recipe {}@{} must end with a final step",
      recipe.id, recipe.version
    )));
  }

  Ok(())
}

fn compile_schema(label: &str, schema: &Value) -> Result<()> {
  jsonschema::options()
    .with_draft(Draft::Draft7)
    .build(schema)
    .map(|_| ())
    .map_err(|error| invalid_recipe(format!("Invalid action recipe {label}: {error}")))
}

fn action_recipe(id: &str, version: &str) -> ActionRecipe {
  let steps = if id.starts_with("image.filter.") {
    vec![
      ActionRecipeStep {
        id: "generate-image".to_string(),
        kind: ActionStepKind::PromptImage,
        input: Some(json!({
          "preparedRoutes": { "$state": "preparedRoutes.generate-image" },
          "outputKey": "artifact"
        })),
        state_patch: Some(json!({ "imageGenerated": true })),
      },
      ActionRecipeStep {
        id: "final".to_string(),
        kind: ActionStepKind::Final,
        input: Some(json!({
          "copy": { "$state": "artifact" }
        })),
        state_patch: Some(json!({ "finalized": true })),
      },
    ]
  } else if id == "slides.outline" {
    vec![
      ActionRecipeStep {
        id: "generate-structured".to_string(),
        kind: ActionStepKind::PromptStructured,
        input: Some(json!({
          "preparedRoutes": { "$state": "preparedRoutes.generate" },
          "unwrapKey": "result",
          "outputKey": "generated"
        })),
        state_patch: Some(json!({ "generatedAt": "promptStructured" })),
      },
      ActionRecipeStep {
        id: "validate-json".to_string(),
        kind: ActionStepKind::ValidateJson,
        input: Some(json!({
          "value": { "$state": "generated" },
          "schema": text_action_output_schema()
        })),
        state_patch: None,
      },
      ActionRecipeStep {
        id: "project-outline".to_string(),
        kind: ActionStepKind::Transform,
        input: Some(json!({
          "slidesOutlineMarkdown": { "$state": "generated" },
          "outputKey": "outlineMarkdown"
        })),
        state_patch: Some(json!({ "projectedAt": "slidesOutlineMarkdown" })),
      },
      ActionRecipeStep {
        id: "final".to_string(),
        kind: ActionStepKind::Final,
        input: Some(json!({
          "copy": { "$state": "outlineMarkdown" }
        })),
        state_patch: Some(json!({ "finalized": true })),
      },
    ]
  } else {
    vec![
      ActionRecipeStep {
        id: "generate-structured".to_string(),
        kind: ActionStepKind::PromptStructured,
        input: Some(json!({
          "preparedRoutes": { "$state": "preparedRoutes.generate" },
          "unwrapKey": "result",
          "outputKey": "generated"
        })),
        state_patch: Some(json!({ "generatedAt": "promptStructured" })),
      },
      ActionRecipeStep {
        id: "validate-json".to_string(),
        kind: ActionStepKind::ValidateJson,
        input: Some(json!({
          "value": { "$state": "generated" },
          "schema": text_action_output_schema()
        })),
        state_patch: None,
      },
      ActionRecipeStep {
        id: "final".to_string(),
        kind: ActionStepKind::Final,
        input: Some(json!({
          "copy": { "$state": "generated" }
        })),
        state_patch: Some(json!({ "finalized": true })),
      },
    ]
  };

  recipe(id, version, action_output_schema(id), steps)
}

fn transcript_recipe(id: &str, version: &str) -> ActionRecipe {
  let mut recipe = recipe(
    id,
    version,
    transcript_result_schema(),
    vec![
      ActionRecipeStep {
        id: "transcribe".to_string(),
        kind: ActionStepKind::PromptStructured,
        input: Some(json!({
          "preparedRoutes": { "$state": "preparedRoutes.transcribe" },
          "outputKey": "transcriptResult"
        })),
        state_patch: Some(json!({ "transcribedAt": "promptStructured" })),
      },
      ActionRecipeStep {
        id: "final".to_string(),
        kind: ActionStepKind::Final,
        input: Some(json!({
          "sourceAudio": { "$state": "sourceAudio" },
          "quality": { "$state": "quality" },
          "infos": { "$state": "infos" },
          "sliceManifest": { "$state": "sliceManifest" },
          "normalizedSegments": { "$state": "transcriptResult.normalizedSegments" },
          "normalizedTranscript": { "$state": "transcriptResult.normalizedTranscript" },
          "summaryJson": { "$state": "transcriptResult.summaryJson" },
          "providerMeta": { "$state": "transcriptResult.providerMeta" },
          "version": "transcript-result-v1",
          "strategy": id.strip_prefix("transcript.audio.").unwrap_or(id)
        })),
        state_patch: Some(json!({ "finalized": true })),
      },
    ],
  );
  recipe.input_schema = transcript_input_schema();
  recipe
}

fn action_output_schema(id: &str) -> Value {
  if id.starts_with("image.filter.") {
    json!({
      "type": "object",
      "properties": {
        "url": { "type": "string" },
        "data_base64": { "type": "string" },
        "media_type": { "type": "string" }
      },
      "anyOf": [
        { "required": ["url"] },
        { "required": ["data_base64", "media_type"] }
      ],
      "additionalProperties": true
    })
  } else {
    text_action_output_schema()
  }
}

fn text_action_output_schema() -> Value {
  json!({
    "type": "string",
    "minLength": 1
  })
}

fn recipe(id: &str, version: &str, output_schema: Value, steps: Vec<ActionRecipeStep>) -> ActionRecipe {
  ActionRecipe {
    id: id.to_string(),
    version: version.to_string(),
    input_schema: json!({}),
    output_schema,
    steps,
  }
}
