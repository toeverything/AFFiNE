use napi_derive::napi;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ActionRecipe {
  pub id: String,
  pub version: String,
  pub input_schema: Value,
  pub output_schema: Value,
  pub steps: Vec<ActionRecipeStep>,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ActionRecipeStep {
  pub id: String,
  pub kind: ActionStepKind,
  #[serde(default)]
  pub input: Option<Value>,
  #[serde(default)]
  pub state_patch: Option<Value>,
}

#[derive(Clone, Copy, Debug, Deserialize, JsonSchema, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionStepKind {
  PromptStructured,
  PromptImage,
  ValidateJson,
  Transform,
  Final,
}

#[napi(string_enum = "snake_case")]
#[derive(Clone, Copy, Debug, Deserialize, JsonSchema, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionEventType {
  ActionStart,
  StepStart,
  Attachment,
  StepEnd,
  ActionDone,
  Error,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ActionEvent {
  #[serde(rename = "type")]
  #[napi(js_name = "type")]
  pub event_type: ActionEventType,
  pub action_id: String,
  pub action_version: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub step_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub status: Option<ActionRunStatus>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub attachment: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub result: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error_code: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error_message: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub trace: Option<ActionTrace>,
}

#[napi(string_enum = "snake_case")]
#[derive(Clone, Copy, Debug, Deserialize, JsonSchema, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionRunStatus {
  Created,
  Running,
  Succeeded,
  Failed,
  Aborted,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ActionRuntimeInput {
  pub recipe_id: String,
  #[serde(default)]
  pub recipe_version: Option<String>,
  #[serde(default)]
  pub input: Value,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ActionRuntimeOutput {
  pub result: Value,
  pub status: ActionRunStatus,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error_code: Option<String>,
  pub state: Value,
  pub steps: Vec<ActionStepRuntimeState>,
  pub trace: ActionTrace,
  pub events: Vec<ActionEvent>,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ActionStepRuntimeState {
  pub id: String,
  pub input: Value,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub output: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub state_patch: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<ActionStepError>,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ActionStepError {
  pub code: String,
  pub message: String,
}

#[napi(object)]
#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ActionTrace {
  pub action_id: String,
  pub action_version: String,
  pub status: ActionRunStatus,
  #[serde(default)]
  pub lightweight: Vec<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error_code: Option<String>,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct TranscriptInputContract {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub source_audio: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub quality: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub infos: Option<Vec<TranscriptAudioInfo>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub slice_manifest: Option<Vec<TranscriptSliceManifestItem>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub prepared_routes: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct TranscriptAudioInfo {
  pub url: String,
  pub mime_type: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub index: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct TranscriptSliceManifestItem {
  pub index: i64,
  pub file_name: String,
  pub mime_type: String,
  pub start_sec: f64,
  pub duration_sec: f64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub byte_size: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct NormalizedTranscriptSegment {
  pub speaker: String,
  pub start_sec: f64,
  pub end_sec: f64,
  pub start: String,
  pub end: String,
  pub text: String,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct MeetingSummary {
  pub title: String,
  pub duration_minutes: f64,
  pub attendees: Vec<String>,
  pub key_points: Vec<String>,
  pub action_items: Vec<MeetingSummaryActionItem>,
  pub decisions: Vec<String>,
  pub open_questions: Vec<String>,
  pub blockers: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct MeetingSummaryActionItem {
  pub description: String,
  #[schemars(required)]
  pub owner: Option<String>,
  #[schemars(required)]
  pub deadline: Option<String>,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct TranscriptGeneratedResult {
  #[schemars(required)]
  pub normalized_segments: Option<Vec<NormalizedTranscriptSegment>>,
  pub normalized_transcript: String,
  #[schemars(required)]
  pub summary_json: Option<MeetingSummary>,
  #[schemars(required)]
  pub provider_meta: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, JsonSchema, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct TranscriptResult {
  #[schemars(required)]
  pub source_audio: Option<Value>,
  #[schemars(required)]
  pub quality: Option<Value>,
  #[schemars(required)]
  pub infos: Option<Vec<TranscriptAudioInfo>>,
  #[schemars(required)]
  pub slice_manifest: Option<Vec<TranscriptSliceManifestItem>>,
  #[schemars(required)]
  pub normalized_segments: Option<Vec<NormalizedTranscriptSegment>>,
  pub normalized_transcript: String,
  #[schemars(required)]
  pub summary_json: Option<MeetingSummary>,
  #[schemars(required)]
  pub provider_meta: Option<Value>,
  pub version: String,
  pub strategy: String,
}
