use jsonschema::Draft;
use napi::{Error, Result, Status};
use schemars::{JsonSchema, r#gen::SchemaSettings};
use serde_json::Value;

use super::{
  action::{TranscriptGeneratedResult, TranscriptInputContract, TranscriptResult},
  core::contracts::{
    CapabilityMatchRequest, CapabilityMatchResponse, ModelConditionsContract, ModelRegistryMatchRequest,
    ModelRegistryMatchResponse, ModelRegistryResolveRequest, ModelRegistryResolveResponse, PromptRenderContract,
    PromptSessionContract, ProviderDriverSpec, RequestedModelMatchRequest, RequestedModelMatchResponse,
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
  if let Some(property_schema) = schema
    .get_mut("definitions")
    .and_then(Value::as_object_mut)
    .and_then(|definitions| definitions.get_mut(definition))
    .and_then(|schema| schema.get_mut("properties"))
    .and_then(Value::as_object_mut)
    .and_then(|properties| properties.get_mut(property))
  {
    mark_schema_nullable(property_schema);
  }
}

pub(crate) fn transcript_input_schema() -> Value {
  let mut schema = generated_schema_for::<TranscriptInputContract>();
  for property in ["sourceAudio", "quality", "infos", "sliceManifest", "preparedRoutes"] {
    mark_property_nullable(&mut schema, property);
  }
  mark_definition_property_nullable(&mut schema, "TranscriptAudioInfo", "index");
  mark_definition_property_nullable(&mut schema, "TranscriptSliceManifestItem", "byteSize");
  schema
}

pub(crate) fn transcript_generated_result_schema() -> Value {
  let mut schema = generated_schema_for::<TranscriptGeneratedResult>();
  for property in ["normalizedSegments", "summaryJson", "providerMeta"] {
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
    "providerMeta",
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
    // runtime-owned temporary native facade
    "executionPlan" => Some(generated_schema_for::<llm_runtime::SerializableExecutionPlan>()),
    // adapter-owned temporary native facade
    "preparedRoutes" => Some(generated_schema_for::<
      Vec<llm_adapter::router::SerializablePreparedRoute>,
    >()),
    // AFFiNE-native-owned N-API projection over adapter model registry/matcher
    "capabilityMatchRequest" => Some(generated_schema_for::<CapabilityMatchRequest>()),
    "capabilityMatchResponse" => Some(generated_schema_for::<CapabilityMatchResponse>()),
    "modelConditions" => Some(generated_schema_for::<ModelConditionsContract>()),
    "modelRegistryMatchRequest" => Some(generated_schema_for::<ModelRegistryMatchRequest>()),
    "modelRegistryMatchResponse" => Some(generated_schema_for::<ModelRegistryMatchResponse>()),
    "modelRegistryResolveRequest" => Some(generated_schema_for::<ModelRegistryResolveRequest>()),
    "modelRegistryResolveResponse" => Some(generated_schema_for::<ModelRegistryResolveResponse>()),
    "providerDriverSpec" => Some(generated_schema_for::<ProviderDriverSpec>()),
    // AFFiNE-native-owned prompt facade over adapter prompt DTOs/catalog
    "promptRenderContract" => Some(generated_schema_for::<PromptRenderContract>()),
    "promptSessionContract" => Some(generated_schema_for::<PromptSessionContract>()),
    "requestedModelMatchRequest" => Some(generated_schema_for::<RequestedModelMatchRequest>()),
    "requestedModelMatchResponse" => Some(generated_schema_for::<RequestedModelMatchResponse>()),
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

#[napi(catch_unwind)]
pub fn llm_compile_execution_plan(value: Value) -> Result<Value> {
  let value = llm_validate_contract("executionPlan".to_string(), value)?;
  llm_runtime::compile_execution_plan_value(value.clone()).map_err(|error| invalid_contract(error.to_string()))?;
  Ok(value)
}

#[napi(catch_unwind)]
pub fn llm_normalize_prepared_routes(value: Value) -> Result<Value> {
  let value = llm_adapter::router::normalize_prepared_routes(value).map_err(|error| {
    invalid_contract(format!(
      "LLM prepared routes value does not match adapter contract: {error}"
    ))
  })?;
  llm_validate_contract("preparedRoutes".to_string(), value)
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
      },
      "providerMeta": { "provider": "gemini" }
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
        "providerMeta": null,
        "extra": true
      }),
    )
    .unwrap_err();
    assert!(error.reason.contains("does not match schema"));
  }

  #[test]
  fn compiles_execution_plan_contract() {
    let value = json!({
      "routes": [{
        "providerId": "openai-main",
        "protocol": "openai_chat",
        "model": "gpt-5-mini",
        "backendConfig": { "base_url": "https://api.openai.com/v1", "auth_token": "token" }
      }],
      "request": { "kind": "text", "cond": { "modelId": "gpt-5-mini" }, "messages": [] },
      "routePolicy": { "fallbackOrder": ["openai-main"] },
      "runtimePolicy": {},
      "attachmentPolicy": { "materializeRemoteAttachments": true },
      "responsePostprocess": { "mode": "text" }
    });
    assert!(super::llm_compile_execution_plan(value).is_ok());
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

  #[test]
  fn validates_prompt_contracts_from_native_types() {
    assert!(
      llm_validate_contract(
        "promptRenderContract".to_string(),
        json!({
          "messages": [{ "role": "user", "content": "hello" }],
          "templateParams": {},
          "renderParams": {}
        }),
      )
      .is_ok()
    );
    assert!(
      llm_validate_contract(
        "promptSessionContract".to_string(),
        json!({
          "prompt": {
            "promptTokens": 1,
            "templateParams": {},
            "messages": [{ "role": "system", "content": "hello" }]
          },
          "turns": [],
          "renderParams": {},
          "maxTokenSize": 1000
        }),
      )
      .is_ok()
    );
  }

  #[test]
  fn validates_adapter_prepared_route_contract() {
    assert!(
      super::llm_normalize_prepared_routes(json!([
        {
          "provider_id": "openai-main",
          "protocol": "openai_chat",
          "model": "gpt-5-mini",
          "config": {
            "base_url": "https://api.openai.com/v1",
            "auth_token": "token"
          },
          "request": {
            "model": "gpt-5-mini",
            "messages": []
          }
        }
      ]))
      .is_ok()
    );

    let error = super::llm_normalize_prepared_routes(json!([
      {
        "provider_id": "openai-main",
        "protocol": "openai_chat",
        "model": "gpt-5-mini",
        "config": { "base_url": "https://api.openai.com/v1" },
        "request": {}
      }
    ]))
    .unwrap_err();
    assert!(error.reason.contains("adapter contract"));
  }

  #[test]
  fn execution_plan_rejects_host_only_state() {
    let value = json!({
      "routes": [],
      "request": {
        "kind": "text",
        "cond": { "modelId": "gpt-5-mini" },
        "messages": [],
        "options": { "signal": {} }
      },
      "routePolicy": { "fallbackOrder": [] },
      "runtimePolicy": {},
      "attachmentPolicy": { "materializeRemoteAttachments": true },
      "responsePostprocess": { "mode": "text" }
    });
    let error = super::llm_compile_execution_plan(value).unwrap_err();
    assert!(error.reason.contains("request.options.signal"));

    let value = json!({
      "routes": [],
      "request": { "kind": "text", "cond": { "modelId": "gpt-5-mini" }, "messages": [] },
      "routePolicy": { "fallbackOrder": [] },
      "runtimePolicy": {},
      "attachmentPolicy": { "materializeRemoteAttachments": true },
      "responsePostprocess": { "mode": "text" },
      "hostContext": { "signal": {} }
    });
    let error = super::llm_compile_execution_plan(value).unwrap_err();
    assert!(error.reason.contains("does not match schema"));
  }
}
