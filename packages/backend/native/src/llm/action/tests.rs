use napi::Status;
use serde_json::json;

use super::{
  ACTION_ABORTED_ERROR_CODE, ActionEventType, ActionRecipe, ActionRecipeStep, ActionRunStatus, ActionRuntimeControl,
  ActionRuntimeInput, ActionStepKind, load_catalog, run_action_recipe_for_test,
  run_action_recipe_for_test_with_control, run_action_recipe_prepared_with_control, validate_catalog, validate_recipe,
};

#[test]
fn validates_built_in_recipe_catalog() {
  let catalog = load_catalog().unwrap();
  let mindmap = catalog.iter().find(|recipe| recipe.id == "mindmap.generate").unwrap();
  assert!(
    mindmap
      .steps
      .iter()
      .any(|step| step.kind == ActionStepKind::PromptStructured)
  );
  assert!(
    mindmap
      .steps
      .iter()
      .any(|step| step.kind == ActionStepKind::ValidateJson)
  );
  let slides = catalog.iter().find(|recipe| recipe.id == "slides.outline").unwrap();
  assert!(
    slides
      .steps
      .iter()
      .any(|step| step.id == "project-outline" && step.kind == ActionStepKind::Transform)
  );
  assert!(catalog.iter().any(|recipe| recipe.id == "transcript.audio.gemini"));
  assert!(!catalog.iter().any(|recipe| recipe.id == "transcript.audio.local-asr"));
}

#[test]
fn built_in_transcript_action_final_result_is_schema_checked() {
  let output = run_action_recipe_prepared_with_control(
    ActionRuntimeInput {
      recipe_id: "transcript.audio.gemini".to_string(),
      recipe_version: Some("v1".to_string()),
      input: json!({
        "sourceAudio": { "blobId": "blob-1", "mimeType": "audio/opus" },
        "quality": null,
        "infos": [{ "url": "https://example.com/audio.opus", "mimeType": "audio/opus", "index": 0 }],
        "sliceManifest": [{
          "index": 0,
          "fileName": "audio.opus",
          "mimeType": "audio/opus",
          "startSec": 12,
          "durationSec": 30,
          "byteSize": 42
        }],
      }),
    },
    mock_control(json!({
      "transcribe": {
        "normalizedTranscript": "00:00:01 A: Hello",
        "summaryJson": {
          "title": "Sync",
          "durationMinutes": 1,
          "attendees": ["A"],
          "keyPoints": ["Hello"],
          "actionItems": [],
          "decisions": [],
          "openQuestions": [],
          "blockers": []
        },
        "providerMeta": { "provider": "gemini", "model": "gemini-2.5-flash" }
      }
    })),
  )
  .unwrap();

  assert_eq!(output.status, ActionRunStatus::Succeeded);
  assert_eq!(output.result["version"], json!("transcript-result-v1"));
  assert_eq!(output.result["strategy"], json!("gemini"));
  assert_eq!(output.result["normalizedSegments"], json!(null));
  assert_eq!(output.result["sourceAudio"]["blobId"], json!("blob-1"));
  assert_eq!(
    output.result["infos"][0]["url"],
    json!("https://example.com/audio.opus")
  );
  assert_eq!(output.result["sliceManifest"][0]["startSec"], json!(12));
}

#[test]
fn built_in_transcript_action_rejects_malformed_summary() {
  let error = run_action_recipe_prepared_with_control(
    ActionRuntimeInput {
      recipe_id: "transcript.audio.gemini".to_string(),
      recipe_version: Some("v1".to_string()),
      input: json!({}),
    },
    mock_control(json!({
      "transcribe": {
        "normalizedTranscript": "00:00:01 A: Hello",
        "summaryJson": { "title": "Sync" },
        "providerMeta": { "provider": "gemini", "model": "gemini-2.5-flash" }
      }
    })),
  )
  .unwrap_err();

  assert!(error.reason.contains("does not match JSON schema"));
}

#[test]
fn built_in_action_final_result_comes_from_prompt_output_state() {
  let output = run_action_recipe_prepared_with_control(
    ActionRuntimeInput {
      recipe_id: "mindmap.generate".to_string(),
      recipe_version: Some("v1".to_string()),
      input: json!({}),
    },
    mock_control(json!({
      "generate-structured": {
        "result": "- Root"
      }
    })),
  )
  .unwrap();

  assert_eq!(output.status, ActionRunStatus::Succeeded);
  assert_eq!(output.result, json!("- Root"));
  assert_eq!(output.state["generated"], json!("- Root"));
}

#[test]
fn built_in_action_unwraps_structured_text_result() {
  let output = run_action_recipe_prepared_with_control(
    ActionRuntimeInput {
      recipe_id: "mindmap.generate".to_string(),
      recipe_version: Some("v1".to_string()),
      input: json!({}),
    },
    mock_control(json!({
      "generate-structured": {
        "result": "- Root"
      }
    })),
  )
  .unwrap();

  assert_eq!(output.status, ActionRunStatus::Succeeded);
  assert_eq!(output.result, json!("- Root"));
  assert_eq!(output.state["generated"], json!("- Root"));
}

#[test]
fn built_in_slides_outline_projects_final_result_to_markdown() {
  let outline = [
    serde_json::to_string(&json!({
      "page": "Cover",
      "type": "cover",
      "content": {
        "title": "Apple Inc.",
        "description": "Company overview",
        "image_keywords": ["Apple logo", "Apple Park"]
      }
    }))
    .unwrap(),
    serde_json::to_string(&json!({
      "page": 2,
      "type": "content",
      "content": {
        "title": "Products",
        "sections": [{
          "title": "iPhone",
          "keywords": ["smartphone", "iOS"],
          "content": "Flagship product line"
        }]
      }
    }))
    .unwrap(),
    serde_json::to_string(&json!({
      "page": 3,
      "type": "cover",
      "content": "Page Name: Closing; Title: Outlook; Description: Future strategy; Image Keywords: roadmap, devices"
    }))
    .unwrap(),
  ]
  .join("\n");
  let output = run_action_recipe_prepared_with_control(
    ActionRuntimeInput {
      recipe_id: "slides.outline".to_string(),
      recipe_version: Some("v1".to_string()),
      input: json!({}),
    },
    mock_control(json!({
      "generate-structured": {
        "result": outline
      }
    })),
  )
  .unwrap();

  assert_eq!(output.status, ActionRunStatus::Succeeded);
  assert_eq!(
    output.result,
    json!(
      [
        "- Apple Inc.",
        "  - Apple Inc.",
        "    - Apple logo, Apple Park",
        "    - Company overview",
        "- Products",
        "  - iPhone",
        "    - smartphone, iOS",
        "    - Flagship product line",
        "- Outlook",
        "  - Outlook",
        "    - roadmap, devices",
        "    - Future strategy"
      ]
      .join("\n")
    )
  );
  assert_eq!(
    output
      .steps
      .iter()
      .find(|step| step.id == "project-outline")
      .and_then(|step| step.output.as_ref()),
    Some(&output.result)
  );
}

#[test]
fn slides_outline_transform_keeps_legacy_markdown_shape() {
  let outline = [
    serde_json::to_string(&json!({ "page": 1, "type": "name", "content": "Launch deck" })).unwrap(),
    serde_json::to_string(&json!({ "page": 1, "type": "title", "content": "Context" })).unwrap(),
    serde_json::to_string(&json!({ "page": 1, "type": "content", "content": "Problem\nOpportunity" })).unwrap(),
  ]
  .join("\n");
  let recipe = test_recipe(vec![
    ActionRecipeStep {
      id: "project-outline".to_string(),
      kind: ActionStepKind::Transform,
      input: Some(json!({
        "slidesOutlineMarkdown": { "$state": "outline" },
        "outputKey": "outlineMarkdown"
      })),
      state_patch: None,
    },
    ActionRecipeStep {
      id: "final".to_string(),
      kind: ActionStepKind::Final,
      input: Some(json!({ "copy": { "$state": "outlineMarkdown" } })),
      state_patch: None,
    },
  ]);
  let output = run_action_recipe_for_test(
    recipe,
    runtime_input(json!({
      "outline": outline
    })),
  )
  .unwrap();

  assert_eq!(output.status, ActionRunStatus::Succeeded);
  assert_eq!(
    output.result,
    json!(["- Launch deck", "  - Context", "    - Problem", "    - Opportunity"].join("\n"))
  );
}

#[test]
fn slides_outline_transform_rejects_unrecognized_text() {
  let recipe = test_recipe(vec![
    ActionRecipeStep {
      id: "project-outline".to_string(),
      kind: ActionStepKind::Transform,
      input: Some(json!({
        "slidesOutlineMarkdown": { "$state": "outline" },
        "outputKey": "outlineMarkdown"
      })),
      state_patch: None,
    },
    ActionRecipeStep {
      id: "final".to_string(),
      kind: ActionStepKind::Final,
      input: Some(json!({ "copy": { "$state": "outlineMarkdown" } })),
      state_patch: None,
    },
  ]);
  let output = run_action_recipe_for_test(
    recipe,
    runtime_input(json!({
      "outline": "not valid ndjson"
    })),
  )
  .unwrap();

  assert_eq!(output.status, ActionRunStatus::Failed);
  assert_eq!(output.error_code, Some("action_invalid_step".to_string()));
  assert_eq!(
    output.events.last().and_then(|event| event.error_message.as_deref()),
    Some("slidesOutlineMarkdown requires markdown or NDJSON object lines")
  );
}

#[test]
fn slides_outline_transform_accepts_cover_without_image_keywords() {
  let outline = serde_json::to_string(&json!({
    "page": 1,
    "type": "cover",
    "content": {
      "title": "Launch deck",
      "description": "Overview"
    }
  }))
  .unwrap();
  let recipe = test_recipe(vec![
    ActionRecipeStep {
      id: "project-outline".to_string(),
      kind: ActionStepKind::Transform,
      input: Some(json!({
        "slidesOutlineMarkdown": { "$state": "outline" },
        "outputKey": "outlineMarkdown"
      })),
      state_patch: None,
    },
    ActionRecipeStep {
      id: "final".to_string(),
      kind: ActionStepKind::Final,
      input: Some(json!({ "copy": { "$state": "outlineMarkdown" } })),
      state_patch: None,
    },
  ]);
  let output = run_action_recipe_for_test(
    recipe,
    runtime_input(json!({
      "outline": outline
    })),
  )
  .unwrap();

  assert_eq!(
    output.result,
    json!(
      [
        "- Launch deck",
        "  - Launch deck",
        "    - Launch deck",
        "    - Overview"
      ]
      .join("\n")
    )
  );
}

#[test]
fn slides_outline_transform_accepts_page_name_from_item() {
  let outline = serde_json::to_string(&json!({
    "page": 2,
    "type": "content",
    "page_name": "Workspace Benefits",
    "content": {
      "sections": [
        {
          "section": "Unified writing",
          "keywords": ["docs", "canvas"],
          "text": "AFFiNE combines documents and whiteboards."
        }
      ]
    }
  }))
  .unwrap();
  let recipe = test_recipe(vec![
    ActionRecipeStep {
      id: "project-outline".to_string(),
      kind: ActionStepKind::Transform,
      input: Some(json!({
        "slidesOutlineMarkdown": { "$state": "outline" },
        "outputKey": "outlineMarkdown"
      })),
      state_patch: None,
    },
    ActionRecipeStep {
      id: "final".to_string(),
      kind: ActionStepKind::Final,
      input: Some(json!({ "copy": { "$state": "outlineMarkdown" } })),
      state_patch: None,
    },
  ]);
  let output = run_action_recipe_for_test(
    recipe,
    runtime_input(json!({
      "outline": outline
    })),
  )
  .unwrap();

  assert_eq!(output.status, ActionRunStatus::Succeeded);
  assert_eq!(
    output.result,
    json!(
      [
        "- Workspace Benefits",
        "  - Unified writing",
        "    - docs, canvas",
        "    - AFFiNE combines documents and whiteboards."
      ]
      .join("\n")
    )
  );
}

#[test]
fn serializes_action_events_for_server_contract() {
  let output = run_action_recipe_prepared_with_control(
    ActionRuntimeInput {
      recipe_id: "mindmap.generate".to_string(),
      recipe_version: Some("v1".to_string()),
      input: json!({}),
    },
    mock_control(json!({
      "generate-structured": {
        "result": "- Root"
      }
    })),
  )
  .unwrap();
  let first = serde_json::to_value(output.events.first().unwrap()).unwrap();
  let last = serde_json::to_value(output.events.last().unwrap()).unwrap();

  assert_eq!(first["type"], json!("action_start"));
  assert_eq!(last["type"], json!("action_done"));
  assert_eq!(last["status"], json!("succeeded"));
  assert_eq!(last["trace"]["status"], json!("succeeded"));
}

#[test]
fn built_in_action_fails_without_routes_or_mock_output() {
  let output = run_action_recipe_prepared_with_control(
    ActionRuntimeInput {
      recipe_id: "mindmap.generate".to_string(),
      recipe_version: Some("v1".to_string()),
      input: json!({}),
    },
    ActionRuntimeControl::default(),
  )
  .unwrap();

  assert_eq!(output.status, ActionRunStatus::Failed);
  assert!(
    output
      .events
      .last()
      .and_then(|event| event.error_message.as_deref())
      .unwrap_or_default()
      .contains("promptStructured requires")
  );
}

#[test]
fn built_in_image_action_uses_prompt_image_step_output() {
  let output = run_action_recipe_prepared_with_control(
    ActionRuntimeInput {
      recipe_id: "image.filter.sketch".to_string(),
      recipe_version: Some("v1".to_string()),
      input: json!({}),
    },
    mock_control(json!({
      "generate-image": {
        "url": "https://example.com/artifact-1.png"
      }
    })),
  )
  .unwrap();

  assert_eq!(output.status, ActionRunStatus::Succeeded);
  assert_eq!(output.result, json!({ "url": "https://example.com/artifact-1.png" }));
  assert_eq!(
    output.state.pointer("/artifact/url"),
    Some(&json!("https://example.com/artifact-1.png"))
  );
}

#[test]
fn built_in_image_action_accepts_inline_artifact_output() {
  let output = run_action_recipe_prepared_with_control(
    ActionRuntimeInput {
      recipe_id: "image.filter.sketch".to_string(),
      recipe_version: Some("v1".to_string()),
      input: json!({}),
    },
    mock_control(json!({
      "generate-image": {
        "data_base64": "aW1n",
        "media_type": "image/webp"
      }
    })),
  )
  .unwrap();

  assert_eq!(output.status, ActionRunStatus::Succeeded);
  assert_eq!(
    output.result,
    json!({
      "data_base64": "aW1n",
      "media_type": "image/webp"
    })
  );
  assert_eq!(output.state.pointer("/artifact/data_base64"), Some(&json!("aW1n")));
}

#[test]
fn rejects_invalid_recipe_without_final_step() {
  let recipe = ActionRecipe {
    id: "invalid.recipe".to_string(),
    version: "v1".to_string(),
    input_schema: json!({}),
    output_schema: json!({}),
    steps: vec![ActionRecipeStep {
      id: "start".to_string(),
      kind: ActionStepKind::ValidateJson,
      input: None,
      state_patch: None,
    }],
  };

  let error = validate_recipe(&recipe).unwrap_err();
  assert_eq!(error.status, Status::InvalidArg);
  assert!(error.reason.contains("must end with a final step"));
}

#[test]
fn rejects_duplicated_recipe_identity() {
  let recipe = ActionRecipe {
    id: "duplicated.recipe".to_string(),
    version: "v1".to_string(),
    input_schema: json!({}),
    output_schema: json!({}),
    steps: vec![ActionRecipeStep {
      id: "final".to_string(),
      kind: ActionStepKind::Final,
      input: None,
      state_patch: None,
    }],
  };

  let error = validate_catalog(&[recipe.clone(), recipe]).unwrap_err();
  assert_eq!(error.status, Status::InvalidArg);
  assert!(error.reason.contains("Duplicated action recipe"));
}

#[test]
fn rejects_recipe_where_final_step_is_not_last() {
  let recipe = ActionRecipe {
    id: "invalid.recipe".to_string(),
    version: "v1".to_string(),
    input_schema: json!({}),
    output_schema: json!({}),
    steps: vec![
      ActionRecipeStep {
        id: "final".to_string(),
        kind: ActionStepKind::Final,
        input: None,
        state_patch: None,
      },
      ActionRecipeStep {
        id: "after-final".to_string(),
        kind: ActionStepKind::Transform,
        input: None,
        state_patch: None,
      },
    ],
  };

  let error = validate_recipe(&recipe).unwrap_err();
  assert_eq!(error.status, Status::InvalidArg);
  assert!(error.reason.contains("must end with a final step"));
}

#[test]
fn validates_json_and_prompt_projection_steps() {
  let recipe = test_recipe(vec![
    ActionRecipeStep {
      id: "prompt-structured".to_string(),
      kind: ActionStepKind::PromptStructured,
      input: Some(json!({})),
      state_patch: None,
    },
    ActionRecipeStep {
      id: "prompt-image".to_string(),
      kind: ActionStepKind::PromptImage,
      input: Some(json!({})),
      state_patch: None,
    },
    ActionRecipeStep {
      id: "validate-json".to_string(),
      kind: ActionStepKind::ValidateJson,
      input: Some(json!({
        "schema": { "type": "object", "required": ["title"] },
        "value": { "title": "Hello" }
      })),
      state_patch: None,
    },
    ActionRecipeStep {
      id: "final".to_string(),
      kind: ActionStepKind::Final,
      input: Some(json!({ "copy": { "done": true } })),
      state_patch: None,
    },
  ]);

  let output = run_action_recipe_for_test_with_control(
    recipe,
    runtime_input(json!({})),
    mock_control(json!({
      "prompt-structured": { "title": "Hello" },
      "prompt-image": { "url": "https://example.com/artifact-1.png" }
    })),
  )
  .unwrap();

  assert_eq!(
    output
      .events
      .iter()
      .map(|event| event.event_type)
      .filter(|event_type| matches!(event_type, ActionEventType::Attachment))
      .collect::<Vec<_>>(),
    vec![ActionEventType::Attachment]
  );
  assert_eq!(output.steps[2].output, Some(json!(true)));
}

#[test]
fn rejects_prompt_steps_without_prepared_routes_or_explicit_boundary() {
  let recipe = test_recipe(vec![
    ActionRecipeStep {
      id: "prompt".to_string(),
      kind: ActionStepKind::PromptStructured,
      input: Some(json!({})),
      state_patch: None,
    },
    ActionRecipeStep {
      id: "final".to_string(),
      kind: ActionStepKind::Final,
      input: None,
      state_patch: None,
    },
  ]);

  let output = run_action_recipe_for_test(recipe, runtime_input(json!({}))).unwrap();

  assert_eq!(output.status, ActionRunStatus::Failed);
  assert_eq!(output.error_code, Some("action_invalid_step".to_string()));
  assert!(
    output
      .events
      .last()
      .and_then(|event| event.error_message.as_deref())
      .unwrap_or_default()
      .contains("requires")
  );
}

#[test]
fn rejects_prompt_image_without_prepared_routes() {
  let recipe = test_recipe(vec![
    ActionRecipeStep {
      id: "prompt-image".to_string(),
      kind: ActionStepKind::PromptImage,
      input: Some(json!({})),
      state_patch: None,
    },
    ActionRecipeStep {
      id: "final".to_string(),
      kind: ActionStepKind::Final,
      input: None,
      state_patch: None,
    },
  ]);

  let output = run_action_recipe_for_test(recipe, runtime_input(json!({}))).unwrap();

  assert_eq!(output.status, ActionRunStatus::Failed);
  assert!(
    output
      .events
      .last()
      .and_then(|event| event.error_message.as_deref())
      .unwrap_or_default()
      .contains("preparedRoutes")
  );
}

#[test]
fn validate_json_distinguishes_invalid_schema_from_invalid_value() {
  let invalid_value = run_action_recipe_for_test(
    test_recipe(vec![
      ActionRecipeStep {
        id: "validate-json".to_string(),
        kind: ActionStepKind::ValidateJson,
        input: Some(json!({
          "schema": { "type": "object", "required": ["title"] },
          "value": {}
        })),
        state_patch: None,
      },
      ActionRecipeStep {
        id: "final".to_string(),
        kind: ActionStepKind::Final,
        input: Some(json!({ "copy": {} })),
        state_patch: None,
      },
    ]),
    runtime_input(json!({})),
  )
  .unwrap();

  assert_eq!(invalid_value.status, ActionRunStatus::Succeeded);
  assert_eq!(invalid_value.steps[0].output, Some(json!(false)));

  let invalid_schema = run_action_recipe_for_test(
    test_recipe(vec![
      ActionRecipeStep {
        id: "validate-json".to_string(),
        kind: ActionStepKind::ValidateJson,
        input: Some(json!({
          "schema": { "type": 1 },
          "value": {}
        })),
        state_patch: None,
      },
      ActionRecipeStep {
        id: "final".to_string(),
        kind: ActionStepKind::Final,
        input: None,
        state_patch: None,
      },
    ]),
    runtime_input(json!({})),
  )
  .unwrap();

  assert_eq!(invalid_schema.status, ActionRunStatus::Failed);
}

#[test]
fn emits_ordered_action_events_and_final_result() {
  let output = run_action_recipe_for_test(
    test_recipe(vec![ActionRecipeStep {
      id: "final".to_string(),
      kind: ActionStepKind::Final,
      input: Some(json!({ "copy": {} })),
      state_patch: Some(json!({ "finalized": true })),
    }]),
    ActionRuntimeInput {
      recipe_id: "test.recipe".to_string(),
      recipe_version: Some("v1".to_string()),
      input: json!({ "content": "hello" }),
    },
  )
  .unwrap();

  assert_eq!(output.status, ActionRunStatus::Succeeded);
  assert_eq!(output.result, json!({}));
  assert_eq!(output.error_code, None);
  assert_eq!(output.state, json!({ "content": "hello", "finalized": true }));
  assert_eq!(output.steps.len(), 1);
  assert_eq!(output.steps[0].id, "final");
  assert_eq!(output.steps[0].output, Some(json!({})));
  assert_eq!(output.steps[0].state_patch, Some(json!({ "finalized": true })));
  assert_eq!(output.steps[0].error, None);
  assert_eq!(
    output.events.iter().map(|event| event.event_type).collect::<Vec<_>>(),
    vec![
      ActionEventType::ActionStart,
      ActionEventType::StepStart,
      ActionEventType::StepEnd,
      ActionEventType::ActionDone,
    ]
  );
}

fn runtime_input(input: serde_json::Value) -> ActionRuntimeInput {
  ActionRuntimeInput {
    recipe_id: "test.recipe".to_string(),
    recipe_version: Some("v1".to_string()),
    input,
  }
}

fn mock_control(mock_output: serde_json::Value) -> ActionRuntimeControl {
  ActionRuntimeControl {
    abort_signal: None,
    event_sender: None,
    abort_after_events: None,
    mock_output: Some(mock_output),
  }
}

fn test_recipe(steps: Vec<ActionRecipeStep>) -> ActionRecipe {
  ActionRecipe {
    id: "test.recipe".to_string(),
    version: "v1".to_string(),
    input_schema: json!({}),
    output_schema: json!({}),
    steps,
  }
}

#[test]
fn generates_lightweight_trace() {
  let output = run_action_recipe_for_test(
    test_recipe(vec![ActionRecipeStep {
      id: "final".to_string(),
      kind: ActionStepKind::Final,
      input: Some(json!({ "copy": {} })),
      state_patch: None,
    }]),
    ActionRuntimeInput {
      recipe_id: "test.recipe".to_string(),
      recipe_version: Some("v1".to_string()),
      input: json!({}),
    },
  )
  .unwrap();

  assert_eq!(output.trace.status, ActionRunStatus::Succeeded);
  assert!(!output.trace.lightweight.is_empty());
}

#[test]
fn abort_control_stops_runtime() {
  let output = run_action_recipe_prepared_with_control(
    ActionRuntimeInput {
      recipe_id: "image.filter.sketch".to_string(),
      recipe_version: Some("v1".to_string()),
      input: json!({}),
    },
    ActionRuntimeControl {
      abort_signal: None,
      event_sender: None,
      abort_after_events: Some(1),
      mock_output: None,
    },
  )
  .unwrap();

  assert_eq!(output.status, ActionRunStatus::Aborted);
  assert_eq!(output.error_code, Some(ACTION_ABORTED_ERROR_CODE.to_string()));
  assert_eq!(
    output.events.last().map(|event| event.event_type),
    Some(ActionEventType::Error)
  );
}
