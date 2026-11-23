use jsonschema::Draft;
use napi::{Error, Result, Status};
use schemars::{JsonSchema, generate::SchemaSettings};
use serde_json::Value;

use super::{
  action::{TranscriptGeneratedResult, TranscriptInputContract, TranscriptResult},
  core::contracts::{
    CapabilityMatchRequest, CapabilityMatchResponse, ModelConditionsContract, ModelRegistryMatchRequest,
    ModelRegistryMatchResponse, ModelRegistryResolveRequest, ModelRegistryResolveResponse, ProviderDriverSpec,
  },
};

// Schema owner map:
// - adapter-owned: prepared routes and LLM request/response transport payloads.
// - runtime-owned: execution plan and tool-loop event contracts.
// - AFFiNE-native-owned: model-registry projection and transcript/action
//   product contracts.

fn invalid_contract(message: impl Into<String>) -> Error {
  Error::new(Status::InvalidArg, message.into())
}

pub(crate) fn generated_schema_for<T: JsonSchema>() -> Value {
  let schema = SchemaSettings::draft07().into_generator().into_root_schema_for::<T>();
  serde_json::to_value(schema).expect("schema should serialize")
}

fn mark_schema_nullable(schema: &mut Value) {
  if let Some(type_value) = schema.get_mut("type") {
    match type_value {
      Value::String(name) if name != "null" => {
        *type_value = Value::Array(vec![Value::String(name.clone()), Value::String("null".to_string())]);
        return;
      }
      Value::Array(types) => {
        if !types.iter().any(|value| value == "null") {
          types.push(Value::String("null".to_string()));
        }
        return;
      }
      _ => {}
    }
  }

  let original = schema.clone();
  *schema = serde_json::json!({
    "anyOf": [original, { "type": "null" }]
  });
}

fn mark_property_nullable(schema: &mut Value, property: &str) {
  if let Some(property_schema) = schema
    .get_mut("properties")
    .and_then(Value::as_object_mut)
    .and_then(|properties| properties.get_mut(property))
  {
    mark_schema_nullable(property_schema);
  }
}

fn mark_definition_property_nullable(schema: &mut Value, definition: &str, property: &str) {
  for definitions_key in ["definitions", "$defs"] {
    if let Some(property_schema) = schema
      .get_mut(definitions_key)
      .and_then(Value::as_object_mut)
      .and_then(|definitions| definitions.get_mut(definition))
      .and_then(|schema| schema.get_mut("properties"))
      .and_then(Value::as_object_mut)
      .and_then(|properties| properties.get_mut(property))
    {
      mark_schema_nullable(property_schema);
      return;
    }
  }
}

pub(crate) fn transcript_input_schema() -> Value {
  let mut schema = generated_schema_for::<TranscriptInputContract>();
  for property in ["sourceAudio", "quality", "infos", "sliceManifest"] {
    mark_property_nullable(&mut schema, property);
  }
  mark_definition_property_nullable(&mut schema, "TranscriptAudioInfo", "index");
  mark_definition_property_nullable(&mut schema, "TranscriptSliceManifestItem", "byteSize");
  schema
}

pub(crate) fn transcript_generated_result_schema() -> Value {
  let mut schema = generated_schema_for::<TranscriptGeneratedResult>();
  for property in ["normalizedSegments", "summaryJson"] {
    mark_property_nullable(&mut schema, property);
  }
  mark_definition_property_nullable(&mut schema, "MeetingSummaryActionItem", "owner");
  mark_definition_property_nullable(&mut schema, "MeetingSummaryActionItem", "deadline");
  schema
}

pub(crate) fn transcript_result_schema() -> Value {
  let mut schema = generated_schema_for::<TranscriptResult>();
  for property in [
    "sourceAudio",
    "quality",
    "infos",
    "sliceManifest",
    "normalizedSegments",
    "summaryJson",
  ] {
    mark_property_nullable(&mut schema, property);
  }
  mark_definition_property_nullable(&mut schema, "TranscriptAudioInfo", "index");
  mark_definition_property_nullable(&mut schema, "TranscriptSliceManifestItem", "byteSize");
  mark_definition_property_nullable(&mut schema, "MeetingSummaryActionItem", "owner");
  mark_definition_property_nullable(&mut schema, "MeetingSummaryActionItem", "deadline");
  schema
}

fn schema_by_name(name: &str) -> Option<Value> {
  match name {
    // AFFiNE-native-owned N-API projection over adapter model registry/matcher
    "capabilityMatchRequest" => Some(generated_schema_for::<CapabilityMatchRequest>()),
    "capabilityMatchResponse" => Some(generated_schema_for::<CapabilityMatchResponse>()),
    "modelConditions" => Some(generated_schema_for::<ModelConditionsContract>()),
    "modelRegistryMatchRequest" => Some(generated_schema_for::<ModelRegistryMatchRequest>()),
    "modelRegistryMatchResponse" => Some(generated_schema_for::<ModelRegistryMatchResponse>()),
    "modelRegistryResolveRequest" => Some(generated_schema_for::<ModelRegistryResolveRequest>()),
    "modelRegistryResolveResponse" => Some(generated_schema_for::<ModelRegistryResolveResponse>()),
    "providerDriverSpec" => Some(generated_schema_for::<ProviderDriverSpec>()),
    // runtime-owned
    "toolCallbackRequest" => Some(generated_schema_for::<llm_runtime::ToolCallbackRequest>()),
    "toolCallbackResponse" => Some(generated_schema_for::<llm_runtime::ToolCallbackResponse>()),
    "toolLoopEvent" => Some(generated_schema_for::<llm_runtime::ToolLoopEvent>()),
    // AFFiNE-native-owned product transcript contracts
    "transcriptInput" => Some(transcript_input_schema()),
    "transcriptGeneratedResult" => Some(transcript_generated_result_schema()),
    "transcriptResult" => Some(transcript_result_schema()),
    _ => None,
  }
}

#[napi(catch_unwind)]
pub fn llm_get_contract_schema(name: String) -> Result<Value> {
  schema_by_name(&name).ok_or_else(|| invalid_contract(format!("Unknown LLM contract schema: {name}")))
}

#[napi(catch_unwind)]
pub fn llm_validate_contract(name: String, value: Value) -> Result<Value> {
  let schema = llm_get_contract_schema(name)?;
  let compiled = jsonschema::options()
    .with_draft(Draft::Draft7)
    .build(&schema)
    .map_err(|error| invalid_contract(format!("Failed to compile contract schema: {error}")))?;
  let details = compiled
    .iter_errors(&value)
    .map(|error| error.to_string())
    .collect::<Vec<_>>();
  if details.is_empty() {
    return Ok(value);
  }

  Err(invalid_contract(format!(
    "LLM contract value does not match schema: {}",
    details.join("; ")
  )))
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::{llm_get_contract_schema, llm_validate_contract};

  #[test]
  fn returns_draft7_transcript_result_schema() {
    let schema = llm_get_contract_schema("transcriptResult".to_string()).unwrap();
    assert_eq!(schema["$schema"], json!("http://json-schema.org/draft-07/schema#"));
    assert_eq!(schema["additionalProperties"], json!(false));
  }

  #[test]
  fn validates_contract_with_generated_schema() {
    let value = json!({
      "normalizedSegments": null,
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
      }
    });
    assert!(llm_validate_contract("transcriptGeneratedResult".to_string(), value).is_ok());
  }

  #[test]
  fn rejects_unknown_contract_fields() {
    let error = llm_validate_contract(
      "transcriptGeneratedResult".to_string(),
      json!({
        "normalizedSegments": null,
        "normalizedTranscript": "",
        "summaryJson": null,
        "extra": true
      }),
    )
    .unwrap_err();
    assert!(error.reason.contains("does not match schema"));
  }

  #[test]
  fn validates_runtime_tool_callback_contracts() {
    assert!(
      llm_validate_contract(
        "toolCallbackRequest".to_string(),
        json!({
          "callId": "call_1",
          "name": "doc_read",
          "args": { "docId": "doc-1" },
          "rawArgumentsText": "{\"docId\":\"doc-1\"}"
        }),
      )
      .is_ok()
    );

    let error = llm_validate_contract(
      "toolCallbackResponse".to_string(),
      json!({
        "callId": "call_1",
        "name": "doc_read",
        "args": {},
        "output": {},
        "extra": true
      }),
    )
    .unwrap_err();
    assert!(error.reason.contains("does not match schema"));
  }
}
