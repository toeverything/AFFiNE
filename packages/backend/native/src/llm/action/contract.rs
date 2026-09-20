use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

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
  pub version: String,
}
