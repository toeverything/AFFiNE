//! Copilot audio transcription GraphQL types, mutations, and deprecated
//! `Copilot.transcriptTask` query resolver aligned with `v0.27.5` `schema.gql`.

use std::sync::Arc;

use async_graphql::{Context, Enum, ID, InputObject, Object, Result, SimpleObject, Upload};
use server_spi::{
  AudioSliceManifestItemRecord, AudioSliceUpload, MAX_TRANSCRIPT_SLICE_COUNT, MeetingActionItemRecord,
  MeetingSummaryV2Record, NormalizedTranscriptSegmentRecord, SubmitTranscriptTaskSpiInput, TranscriptItemRecord,
  TranscriptJobStatus, TranscriptQualityRecord, TranscriptSourceAudioInputRecord, TranscriptSourceAudioRecord,
  TranscriptTaskRecord,
};
use server_types::DomainError;

use super::require_authenticated_user;
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;

const MAX_WORKSPACE_ID_BYTES: usize = 128;
const MAX_BLOB_ID_BYTES: usize = 256;
const MAX_FILE_NAME_BYTES: usize = 512;
const MAX_MIME_TYPE_BYTES: usize = 128;
const MAX_AUDIO_SECONDS: f64 = 86_400.0;
const MAX_AUDIO_DURATION_MS: i32 = 86_400_000;
const MAX_AUDIO_SAMPLE_RATE: i32 = 384_000;
const MAX_AUDIO_CHANNELS: i32 = 32;
const MAX_QUALITY_OVERFLOW_COUNT: i32 = 1_000_000;

#[derive(Enum, Copy, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AiJobStatus")]
pub enum AiJobStatus {
  #[graphql(name = "claimed")]
  Claimed,
  #[graphql(name = "failed")]
  Failed,
  #[graphql(name = "finished")]
  Finished,
  #[graphql(name = "pending")]
  Pending,
  #[graphql(name = "running")]
  Running,
}

impl From<TranscriptJobStatus> for AiJobStatus {
  fn from(status: TranscriptJobStatus) -> Self {
    match status {
      TranscriptJobStatus::Pending => Self::Pending,
      TranscriptJobStatus::Running => Self::Running,
      TranscriptJobStatus::Finished => Self::Finished,
      TranscriptJobStatus::Failed => Self::Failed,
      TranscriptJobStatus::Claimed => Self::Claimed,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "TranscriptionItemType")]
pub struct TranscriptionItemType {
  pub end: String,
  pub speaker: String,
  pub start: String,
  pub transcription: String,
}

impl From<TranscriptItemRecord> for TranscriptionItemType {
  fn from(item: TranscriptItemRecord) -> Self {
    Self {
      end: item.end,
      speaker: item.speaker,
      start: item.start,
      transcription: item.transcription,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, PartialEq)]
#[graphql(name = "AudioSliceManifestItemType")]
pub struct AudioSliceManifestItemType {
  pub byte_size: Option<i32>,
  pub duration_sec: f64,
  pub file_name: String,
  pub index: i32,
  pub mime_type: String,
  pub start_sec: f64,
}

impl From<AudioSliceManifestItemRecord> for AudioSliceManifestItemType {
  fn from(item: AudioSliceManifestItemRecord) -> Self {
    Self {
      byte_size: item.byte_size,
      duration_sec: item.duration_sec,
      file_name: item.file_name,
      index: item.index,
      mime_type: item.mime_type,
      start_sec: item.start_sec,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, PartialEq)]
#[graphql(name = "NormalizedTranscriptSegmentType")]
pub struct NormalizedTranscriptSegmentType {
  pub end: String,
  pub end_sec: f64,
  pub speaker: String,
  pub start: String,
  pub start_sec: f64,
  pub text: String,
}

impl From<NormalizedTranscriptSegmentRecord> for NormalizedTranscriptSegmentType {
  fn from(seg: NormalizedTranscriptSegmentRecord) -> Self {
    Self {
      end: seg.end,
      end_sec: seg.end_sec,
      speaker: seg.speaker,
      start: seg.start,
      start_sec: seg.start_sec,
      text: seg.text,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "MeetingActionItemType")]
pub struct MeetingActionItemType {
  pub deadline: Option<String>,
  pub description: String,
  pub owner: Option<String>,
}

impl From<MeetingActionItemRecord> for MeetingActionItemType {
  fn from(item: MeetingActionItemRecord) -> Self {
    Self {
      deadline: item.deadline,
      description: item.description,
      owner: item.owner,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, PartialEq)]
#[graphql(name = "MeetingSummaryV2Type")]
pub struct MeetingSummaryV2Type {
  pub action_items: Vec<MeetingActionItemType>,
  pub attendees: Vec<String>,
  pub blockers: Vec<String>,
  pub decisions: Vec<String>,
  pub duration_minutes: f64,
  pub key_points: Vec<String>,
  pub open_questions: Vec<String>,
  pub title: String,
}

impl From<MeetingSummaryV2Record> for MeetingSummaryV2Type {
  fn from(summary: MeetingSummaryV2Record) -> Self {
    Self {
      action_items: summary.action_items.into_iter().map(Into::into).collect(),
      attendees: summary.attendees,
      blockers: summary.blockers,
      decisions: summary.decisions,
      duration_minutes: summary.duration_minutes,
      key_points: summary.key_points,
      open_questions: summary.open_questions,
      title: summary.title,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "TranscriptionSourceAudioType")]
pub struct TranscriptionSourceAudioType {
  pub blob_id: Option<String>,
  pub channels: Option<i32>,
  pub duration_ms: Option<i32>,
  pub mime_type: Option<String>,
  pub sample_rate: Option<i32>,
}

impl From<TranscriptSourceAudioRecord> for TranscriptionSourceAudioType {
  fn from(audio: TranscriptSourceAudioRecord) -> Self {
    Self {
      blob_id: audio.blob_id,
      channels: audio.channels,
      duration_ms: audio.duration_ms,
      mime_type: audio.mime_type,
      sample_rate: audio.sample_rate,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "TranscriptionQualityType")]
pub struct TranscriptionQualityType {
  pub degraded: Option<bool>,
  pub overflow_count: Option<i32>,
}

impl From<TranscriptQualityRecord> for TranscriptionQualityType {
  fn from(quality: TranscriptQualityRecord) -> Self {
    Self {
      degraded: quality.degraded,
      overflow_count: quality.overflow_count,
    }
  }
}

#[derive(InputObject, Clone, Debug, PartialEq)]
#[graphql(name = "AudioSliceManifestItemInput")]
pub struct AudioSliceManifestItemInput {
  pub byte_size: Option<i32>,
  pub duration_sec: f64,
  pub file_name: String,
  pub index: i32,
  pub mime_type: String,
  pub start_sec: f64,
}

impl From<AudioSliceManifestItemInput> for AudioSliceManifestItemRecord {
  fn from(item: AudioSliceManifestItemInput) -> Self {
    Self {
      index: item.index,
      file_name: item.file_name,
      mime_type: item.mime_type,
      start_sec: item.start_sec,
      duration_sec: item.duration_sec,
      byte_size: item.byte_size,
    }
  }
}

#[derive(InputObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "TranscriptionSourceAudioInput")]
pub struct TranscriptionSourceAudioInput {
  pub channels: Option<i32>,
  pub duration_ms: Option<i32>,
  pub mime_type: Option<String>,
  pub sample_rate: Option<i32>,
}

impl From<TranscriptionSourceAudioInput> for TranscriptSourceAudioInputRecord {
  fn from(audio: TranscriptionSourceAudioInput) -> Self {
    Self {
      mime_type: audio.mime_type,
      duration_ms: audio.duration_ms,
      sample_rate: audio.sample_rate,
      channels: audio.channels,
    }
  }
}

#[derive(InputObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "TranscriptionQualityInput")]
pub struct TranscriptionQualityInput {
  pub degraded: Option<bool>,
  pub overflow_count: Option<i32>,
}

impl From<TranscriptionQualityInput> for TranscriptQualityRecord {
  fn from(quality: TranscriptionQualityInput) -> Self {
    Self {
      degraded: quality.degraded,
      overflow_count: quality.overflow_count,
    }
  }
}

#[derive(InputObject, Clone, Debug, PartialEq)]
#[graphql(name = "SubmitAudioTranscriptionInput")]
pub struct SubmitAudioTranscriptionInput {
  pub quality: Option<TranscriptionQualityInput>,
  pub slice_manifest: Option<Vec<AudioSliceManifestItemInput>>,
  pub source_audio: Option<TranscriptionSourceAudioInput>,
}

#[derive(SimpleObject, Clone, Debug, PartialEq)]
#[graphql(name = "TranscriptionResultType")]
pub struct TranscriptionResultType {
  pub actions: Option<String>,
  pub id: ID,
  pub normalized_segments: Option<Vec<NormalizedTranscriptSegmentType>>,
  pub normalized_transcript: Option<String>,
  pub quality: Option<TranscriptionQualityType>,
  pub slice_manifest: Option<Vec<AudioSliceManifestItemType>>,
  pub source_audio: Option<TranscriptionSourceAudioType>,
  pub status: AiJobStatus,
  pub summary: Option<String>,
  pub summary_json: Option<MeetingSummaryV2Type>,
  pub title: Option<String>,
  pub transcription: Option<Vec<TranscriptionItemType>>,
  pub version: Option<String>,
}

impl From<TranscriptTaskRecord> for TranscriptionResultType {
  fn from(record: TranscriptTaskRecord) -> Self {
    let status: AiJobStatus = record.status.into();
    let is_finished = matches!(status, AiJobStatus::Finished | AiJobStatus::Claimed);
    if !is_finished {
      return Self {
        id: ID(record.id),
        status,
        actions: None,
        normalized_segments: None,
        normalized_transcript: None,
        quality: None,
        slice_manifest: None,
        source_audio: None,
        summary: None,
        summary_json: None,
        title: None,
        transcription: None,
        version: None,
      };
    }
    Self {
      actions: record.actions,
      id: ID(record.id),
      normalized_segments: record
        .normalized_segments
        .map(|items| items.into_iter().map(Into::into).collect()),
      normalized_transcript: record.normalized_transcript,
      quality: record.quality.map(Into::into),
      slice_manifest: record
        .slice_manifest
        .map(|items| items.into_iter().map(Into::into).collect()),
      source_audio: record.source_audio.map(Into::into),
      status,
      summary: record.summary,
      summary_json: record.summary_json.map(Into::into),
      title: record.title,
      transcription: record
        .transcription
        .map(|items| items.into_iter().map(Into::into).collect()),
      version: record.version,
    }
  }
}

fn gql_err(e: DomainError) -> async_graphql::Error {
  domain_error_to_graphql(&e)
}

async fn enforce_copilot_enabled(state: &AppState) -> std::result::Result<(), DomainError> {
  let cfg = state.app_config.get_effective_app_config().await?;
  let cfg_enabled = cfg
    .pointer("/copilot/enabled")
    .and_then(serde_json::Value::as_bool)
    .unwrap_or(true);
  if !cfg_enabled {
    return Err(DomainError::Forbidden("copilot_disabled".to_owned()));
  }
  state
    .extension
    .copilot_runtime()
    .assert_enabled(cfg_enabled)
    .await
    .map_err(|_| DomainError::Forbidden("copilot_disabled".to_owned()))
}

/// Keeps the upload in its multipart temporary file. The transcript runtime
/// checks the per-slice limit after its duplicate-task preflight.
fn upload_slice(ctx: &Context<'_>, upload: Upload) -> std::result::Result<AudioSliceUpload, DomainError> {
  let value = upload
    .value(ctx)
    .map_err(|e| DomainError::Validation(format!("invalid transcript audio upload: {e}")))?;
  let mime_type = value
    .content_type
    .as_deref()
    .filter(|s| !s.trim().is_empty())
    .unwrap_or("application/octet-stream")
    .to_owned();
  Ok(AudioSliceUpload::from_file(value.filename, mime_type, value.content))
}

fn normalize_optional_id(raw: Option<String>) -> Option<String> {
  raw.filter(|s| !s.is_empty())
}

fn validate_safe_identifier(name: &str, value: &str, max_bytes: usize) -> std::result::Result<(), DomainError> {
  if value.is_empty() || value.len() > max_bytes {
    return Err(DomainError::Validation(format!(
      "{name} must be between 1 and {max_bytes} bytes"
    )));
  }
  if value.contains('/') || value.contains("..") || value.chars().any(char::is_control) {
    return Err(DomainError::Validation(format!("{name} contains invalid characters")));
  }
  Ok(())
}

fn validate_manifest(items: &[AudioSliceManifestItemInput]) -> std::result::Result<(), DomainError> {
  if items.len() > MAX_TRANSCRIPT_SLICE_COUNT {
    return Err(DomainError::Validation(format!(
      "sliceManifest exceeds maximum of {MAX_TRANSCRIPT_SLICE_COUNT} items"
    )));
  }
  for item in items {
    if item.file_name.len() > MAX_FILE_NAME_BYTES || item.file_name.chars().any(char::is_control) {
      return Err(DomainError::Validation("invalid sliceManifest fileName".into()));
    }
    if item.mime_type.len() > MAX_MIME_TYPE_BYTES || item.mime_type.chars().any(char::is_control) {
      return Err(DomainError::Validation("invalid sliceManifest mimeType".into()));
    }
    if !item.start_sec.is_finite() || !(0.0..=MAX_AUDIO_SECONDS).contains(&item.start_sec) {
      return Err(DomainError::Validation("invalid sliceManifest startSec".into()));
    }
    if !item.duration_sec.is_finite() || !(0.0..=MAX_AUDIO_SECONDS).contains(&item.duration_sec) {
      return Err(DomainError::Validation("invalid sliceManifest durationSec".into()));
    }
  }
  Ok(())
}

fn validate_source_audio(sa: &TranscriptionSourceAudioInput) -> std::result::Result<(), DomainError> {
  if let Some(ref mime) = sa.mime_type
    && (mime.is_empty() || mime.len() > MAX_MIME_TYPE_BYTES || mime.chars().any(char::is_control))
  {
    return Err(DomainError::Validation("invalid sourceAudio mimeType".into()));
  }
  if let Some(d) = sa.duration_ms
    && !(0..=MAX_AUDIO_DURATION_MS).contains(&d)
  {
    return Err(DomainError::Validation("invalid sourceAudio durationMs".into()));
  }
  if let Some(sr) = sa.sample_rate
    && !(0..=MAX_AUDIO_SAMPLE_RATE).contains(&sr)
  {
    return Err(DomainError::Validation("invalid sourceAudio sampleRate".into()));
  }
  if let Some(ch) = sa.channels
    && !(0..=MAX_AUDIO_CHANNELS).contains(&ch)
  {
    return Err(DomainError::Validation("invalid sourceAudio channels".into()));
  }
  Ok(())
}

fn validate_quality(q: &TranscriptionQualityInput) -> std::result::Result<(), DomainError> {
  if let Some(ov) = q.overflow_count
    && !(0..=MAX_QUALITY_OVERFLOW_COUNT).contains(&ov)
  {
    return Err(DomainError::Validation("invalid quality overflowCount".into()));
  }
  Ok(())
}

/// Shared resolver for `Copilot.transcriptTask(blobId, taskId)`.
pub async fn resolve_copilot_transcript_task(
  ctx: &Context<'_>,
  workspace_id: Option<&str>,
  blob_id: Option<String>,
  task_id: Option<String>,
) -> Result<Option<TranscriptionResultType>> {
  let user = require_authenticated_user(ctx).await?;
  let state = Arc::clone(ctx.data_unchecked::<Arc<AppState>>());
  enforce_copilot_enabled(&state).await.map_err(gql_err)?;
  let Some(workspace_id) = workspace_id.filter(|id| !id.is_empty()) else {
    return Ok(None);
  };
  let task_id = normalize_optional_id(task_id);
  let blob_id = normalize_optional_id(blob_id);
  if task_id.is_none() && blob_id.is_none() {
    return Ok(None);
  }
  validate_safe_identifier("workspaceId", workspace_id, MAX_WORKSPACE_ID_BYTES).map_err(gql_err)?;
  if let Some(ref tid) = task_id {
    validate_safe_identifier("taskId", tid, MAX_BLOB_ID_BYTES).map_err(gql_err)?;
  }
  if let Some(ref bid) = blob_id {
    validate_safe_identifier("blobId", bid, MAX_BLOB_ID_BYTES).map_err(gql_err)?;
  }
  let task = state
    .extension
    .copilot_transcript_spi()
    .query_transcript_task(&user.id, workspace_id, task_id.as_deref(), blob_id.as_deref())
    .await
    .map_err(gql_err)?;
  Ok(task.map(Into::into))
}

/// Standalone Copilot transcript view exposing the deprecated `transcriptTask`
/// field for composition into `type Copilot`.
#[derive(Clone, Debug, Default)]
pub struct TranscriptCopilotView {
  pub workspace_id: Option<String>,
}

#[Object]
impl TranscriptCopilotView {
  #[graphql(deprecation = "Use realtime subscription `copilot.transcript.task.changed` instead.")]
  async fn transcript_task(
    &self,
    ctx: &Context<'_>,
    blob_id: Option<String>,
    task_id: Option<String>,
  ) -> Result<Option<TranscriptionResultType>> {
    resolve_copilot_transcript_task(ctx, self.workspace_id.as_deref(), blob_id, task_id).await
  }
}

#[derive(Default)]
pub struct TranscriptMutation;

#[Object]
impl TranscriptMutation {
  async fn submit_transcript_task(
    &self,
    ctx: &Context<'_>,
    blob: Option<Upload>,
    blob_id: String,
    blobs: Option<Vec<Upload>>,
    input: Option<SubmitAudioTranscriptionInput>,
    workspace_id: String,
  ) -> Result<Option<TranscriptionResultType>> {
    let user = require_authenticated_user(ctx).await?;
    let state = Arc::clone(ctx.data_unchecked::<Arc<AppState>>());
    enforce_copilot_enabled(&state).await.map_err(gql_err)?;

    let mut uploads = Vec::new();
    if let Some(single) = blob {
      uploads.push(single);
    }
    if let Some(list) = blobs {
      uploads.extend(list);
    }
    if uploads.is_empty() {
      return Err(gql_err(DomainError::Validation(
        "copilot_transcription_audio_not_provided".to_owned(),
      )));
    }

    validate_safe_identifier("workspaceId", &workspace_id, MAX_WORKSPACE_ID_BYTES).map_err(gql_err)?;
    state
      .extension
      .copilot_transcript_spi()
      .authorize_transcript_submission(&user.id, &workspace_id)
      .await
      .map_err(gql_err)?;

    if uploads.len() > MAX_TRANSCRIPT_SLICE_COUNT {
      return Err(gql_err(DomainError::Validation(format!(
        "transcript audio slice count exceeds maximum of {MAX_TRANSCRIPT_SLICE_COUNT}"
      ))));
    }

    validate_safe_identifier("blobId", &blob_id, MAX_BLOB_ID_BYTES).map_err(gql_err)?;
    if let Some(sa) = input.as_ref().and_then(|v| v.source_audio.as_ref()) {
      validate_source_audio(sa).map_err(gql_err)?;
    }
    if let Some(q) = input.as_ref().and_then(|v| v.quality.as_ref()) {
      validate_quality(q).map_err(gql_err)?;
    }
    if let Some(manifest) = input.as_ref().and_then(|v| v.slice_manifest.as_deref()) {
      validate_manifest(manifest).map_err(gql_err)?;
    }

    let slices = uploads
      .into_iter()
      .map(|upload| upload_slice(ctx, upload))
      .collect::<std::result::Result<Vec<_>, _>>()
      .map_err(gql_err)?;

    let (source_audio, quality, slice_manifest) = match input {
      Some(v) => (
        v.source_audio.map(Into::into),
        v.quality.map(Into::into),
        v.slice_manifest.map(|list| list.into_iter().map(Into::into).collect()),
      ),
      None => (None, None, None),
    };

    let task = state
      .extension
      .copilot_transcript_spi()
      .submit_transcript_task(SubmitTranscriptTaskSpiInput {
        user_id: user.id,
        workspace_id,
        blob_id,
        blobs: slices,
        source_audio,
        quality,
        slice_manifest,
      })
      .await
      .map_err(gql_err)?;
    Ok(task.map(Into::into))
  }

  async fn retry_transcript_task(
    &self,
    ctx: &Context<'_>,
    task_id: String,
    workspace_id: String,
  ) -> Result<Option<TranscriptionResultType>> {
    let user = require_authenticated_user(ctx).await?;
    let state = Arc::clone(ctx.data_unchecked::<Arc<AppState>>());
    enforce_copilot_enabled(&state).await.map_err(gql_err)?;
    validate_safe_identifier("workspaceId", &workspace_id, MAX_WORKSPACE_ID_BYTES).map_err(gql_err)?;
    validate_safe_identifier("taskId", &task_id, MAX_BLOB_ID_BYTES).map_err(gql_err)?;
    let task = state
      .extension
      .copilot_transcript_spi()
      .retry_transcript_task(&user.id, &workspace_id, &task_id)
      .await
      .map_err(gql_err)?;
    Ok(task.map(Into::into))
  }

  async fn settle_transcript_task(
    &self,
    ctx: &Context<'_>,
    task_id: String,
    workspace_id: String,
  ) -> Result<Option<TranscriptionResultType>> {
    let user = require_authenticated_user(ctx).await?;
    let state = Arc::clone(ctx.data_unchecked::<Arc<AppState>>());
    enforce_copilot_enabled(&state).await.map_err(gql_err)?;
    validate_safe_identifier("workspaceId", &workspace_id, MAX_WORKSPACE_ID_BYTES).map_err(gql_err)?;
    validate_safe_identifier("taskId", &task_id, MAX_BLOB_ID_BYTES).map_err(gql_err)?;
    let task = state
      .extension
      .copilot_transcript_spi()
      .settle_transcript_task(&user.id, &workspace_id, &task_id)
      .await
      .map_err(gql_err)?;
    Ok(task.map(Into::into))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use async_graphql::{EmptySubscription, Schema};

  #[test]
  fn unfinished_transcript_record_strips_result_payload() {
    let pending = TranscriptTaskRecord {
      id: "task-1".into(),
      status: TranscriptJobStatus::Pending,
      title: Some("secret".into()),
      summary: Some("secret".into()),
      actions: Some("secret".into()),
      transcription: Some(vec![TranscriptItemRecord {
        speaker: "A".into(),
        start: "00:00:00".into(),
        end: "00:00:05".into(),
        transcription: "hello".into(),
      }]),
      source_audio: None,
      quality: None,
      slice_manifest: None,
      normalized_segments: None,
      normalized_transcript: Some("00:00:00 A: hello".into()),
      summary_json: None,
      version: Some("transcript-result-v1".into()),
    };
    let gql: TranscriptionResultType = pending.into();
    assert_eq!(gql.id, ID("task-1".into()));
    assert_eq!(gql.status, AiJobStatus::Pending);
    assert!(gql.title.is_none());
    assert!(gql.summary.is_none());
    assert!(gql.transcription.is_none());
    assert!(gql.normalized_transcript.is_none());
  }

  #[test]
  fn transcript_copilot_view_sdl_contains_deprecated_transcript_task() {
    let schema = Schema::build(TranscriptCopilotView::default(), TranscriptMutation, EmptySubscription).finish();
    let sdl = schema.sdl();
    assert!(
      sdl.contains("transcriptTask(blobId: String, taskId: String): TranscriptionResultType")
        && sdl.contains("@deprecated(reason:")
        && sdl.contains("copilot.transcript.task.changed"),
      "unexpected SDL:\n{sdl}"
    );
    assert!(sdl.contains("enum AiJobStatus"));
    assert!(sdl.contains("submitTranscriptTask("));
    assert!(sdl.contains("retryTranscriptTask("));
    assert!(sdl.contains("settleTranscriptTask("));
  }

  #[test]
  fn transcript_error_codes_match_v0275_bad_request_envelopes() {
    use async_graphql::Value;

    let cases = [
      (
        "copilot_transcription_audio_not_provided",
        "COPILOT_TRANSCRIPTION_AUDIO_NOT_PROVIDED",
      ),
      ("copilot_transcription_job_exists", "COPILOT_TRANSCRIPTION_JOB_EXISTS"),
      (
        "copilot_transcription_job_not_found",
        "COPILOT_TRANSCRIPTION_JOB_NOT_FOUND",
      ),
    ];
    for (raw, expected_name) in cases {
      let err = gql_err(DomainError::Validation(raw.to_owned()));
      let ext = err.extensions.as_ref().expect("extensions present");
      assert_eq!(ext.get("status"), Some(&Value::from(400)), "raw={raw}");
      assert_eq!(ext.get("type"), Some(&Value::String("BAD_REQUEST".into())), "raw={raw}");
      assert_eq!(ext.get("name"), Some(&Value::String(expected_name.into())), "raw={raw}");
    }
  }

  #[tokio::test]
  async fn anonymous_transcript_mutations_return_401_past_throttle_limit_and_validate_inputs() {
    use async_graphql::{Request, Value};

    let schema = Schema::build(TranscriptCopilotView::default(), TranscriptMutation, EmptySubscription).finish();
    for i in 0..130 {
      let resp = schema
        .execute(Request::new(
          r#"mutation { submitTranscriptTask(blobId: "b1", workspaceId: "ws1") { id } }"#,
        ))
        .await;
      assert_eq!(resp.errors.len(), 1, "iter {i}");
      let ext = resp.errors[0].extensions.as_ref().expect("error extensions");
      assert_eq!(
        ext.get("status"),
        Some(&Value::from(401)),
        "iter {i} must be 401 not 429"
      );
      assert_eq!(
        ext.get("name"),
        Some(&Value::String("AUTHENTICATION_REQUIRED".into())),
        "iter {i}"
      );
    }

    assert_eq!(normalize_optional_id(Some("".into())), None);
    assert_eq!(normalize_optional_id(Some("  ".into())), Some("  ".into()));
    assert_eq!(normalize_optional_id(Some(" task-1 ".into())), Some(" task-1 ".into()));

    assert!(validate_safe_identifier("workspaceId", "", MAX_WORKSPACE_ID_BYTES).is_err());
    assert!(validate_safe_identifier("workspaceId", "a/b", MAX_WORKSPACE_ID_BYTES).is_err());
    assert!(validate_safe_identifier("blobId", "..", MAX_BLOB_ID_BYTES).is_err());
    assert!(validate_safe_identifier("blobId", "ok\x00bad", MAX_BLOB_ID_BYTES).is_err());
    assert!(validate_safe_identifier("blobId", &"a".repeat(257), MAX_BLOB_ID_BYTES).is_err());
    assert!(validate_safe_identifier("workspaceId", &"a".repeat(129), MAX_WORKSPACE_ID_BYTES).is_err());

    let bad_manifest = vec![AudioSliceManifestItemInput {
      index: 0,
      file_name: "a.ogg".into(),
      mime_type: "audio/ogg".into(),
      start_sec: f64::NAN,
      duration_sec: 1.0,
      byte_size: Some(10),
    }];
    assert!(validate_manifest(&bad_manifest).is_err());
    let oversized_manifest: Vec<_> = (0..65)
      .map(|i| AudioSliceManifestItemInput {
        index: i,
        file_name: "a.ogg".into(),
        mime_type: "audio/ogg".into(),
        start_sec: 0.0,
        duration_sec: 1.0,
        byte_size: Some(10),
      })
      .collect();
    assert!(validate_manifest(&oversized_manifest).is_err());

    assert!(
      validate_source_audio(&TranscriptionSourceAudioInput {
        mime_type: Some("a".repeat(1024)),
        duration_ms: Some(1000),
        sample_rate: Some(16_000),
        channels: Some(1),
      })
      .is_err()
    );
    assert!(
      validate_source_audio(&TranscriptionSourceAudioInput {
        mime_type: Some("audio/ogg\x00".into()),
        duration_ms: None,
        sample_rate: None,
        channels: None,
      })
      .is_err()
    );
    assert!(
      validate_source_audio(&TranscriptionSourceAudioInput {
        mime_type: Some("audio/ogg".into()),
        duration_ms: Some(-1),
        sample_rate: None,
        channels: None,
      })
      .is_err()
    );
    assert!(
      validate_quality(&TranscriptionQualityInput {
        degraded: Some(false),
        overflow_count: Some(-5),
      })
      .is_err()
    );
  }

  #[tokio::test]
  async fn enforce_copilot_enabled_fails_closed_and_missing_audio_precedes_id_validation() {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use async_graphql::{Request, Value};
    use server_db::{DbConfig, ServerDb};
    use server_domain::users::CurrentUserView;
    use server_spi::{CopilotTranscriptSpi, ServerExtension};

    struct CountingTranscriptSpi(Arc<AtomicUsize>);
    #[async_trait::async_trait]
    impl CopilotTranscriptSpi for CountingTranscriptSpi {
      async fn authorize_transcript_submission(
        &self,
        _user_id: &str,
        _workspace_id: &str,
      ) -> std::result::Result<(), DomainError> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Err(DomainError::Forbidden("workspace copilot permission denied".into()))
      }
      async fn submit_transcript_task(
        &self,
        _input: SubmitTranscriptTaskSpiInput,
      ) -> std::result::Result<Option<TranscriptTaskRecord>, DomainError> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Ok(None)
      }
      async fn retry_transcript_task(
        &self,
        _u: &str,
        _w: &str,
        _t: &str,
      ) -> std::result::Result<Option<TranscriptTaskRecord>, DomainError> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Ok(None)
      }
      async fn settle_transcript_task(
        &self,
        _u: &str,
        _w: &str,
        _t: &str,
      ) -> std::result::Result<Option<TranscriptTaskRecord>, DomainError> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Ok(None)
      }
      async fn query_transcript_task(
        &self,
        _u: &str,
        _w: &str,
        _t: Option<&str>,
        _b: Option<&str>,
      ) -> std::result::Result<Option<TranscriptTaskRecord>, DomainError> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Ok(None)
      }
    }

    struct EnabledCopilotRuntime;
    #[async_trait::async_trait]
    impl server_spi::CopilotRuntimeSpi for EnabledCopilotRuntime {
      async fn assert_enabled(&self, cfg_enabled: bool) -> std::result::Result<(), DomainError> {
        if cfg_enabled {
          Ok(())
        } else {
          Err(DomainError::Forbidden("copilot_disabled".to_owned()))
        }
      }
    }

    struct CountingExt(Arc<AtomicUsize>, server_spi::CommunityExtension);
    impl ServerExtension for CountingExt {
      fn edition_name(&self) -> &'static str {
        self.1.edition_name()
      }
      fn quota_gate(&self) -> Arc<dyn server_spi::QuotaGate> {
        self.1.quota_gate()
      }
      fn session_policy(&self) -> Arc<dyn server_spi::SessionPolicyHook> {
        self.1.session_policy()
      }
      fn copilot_policy(&self) -> Arc<dyn server_spi::CopilotPolicySpi> {
        self.1.copilot_policy()
      }
      fn copilot_runtime(&self) -> Arc<dyn server_spi::CopilotRuntimeSpi> {
        Arc::new(EnabledCopilotRuntime)
      }
      fn copilot_transcript_spi(&self) -> Arc<dyn CopilotTranscriptSpi> {
        Arc::new(CountingTranscriptSpi(Arc::clone(&self.0)))
      }
    }

    struct LeaseGuard(Option<(test_db_harness::pg::PgCluster, test_db_harness::pg::DbLease)>);
    impl Drop for LeaseGuard {
      fn drop(&mut self) {
        if let Some(pair) = self.0.take() {
          let _ = std::thread::spawn(move || drop(pair)).join();
        }
      }
    }

    let (cluster, lease) = tokio::task::spawn_blocking(|| {
      let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("PG16 test cluster");
      let migrations = test_db_harness::migrations::MigrationSet::from_migrations(Vec::new());
      let template = cluster.ensure_template(&migrations).expect("template");
      let lease = cluster
        .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
        .expect("lease");
      (cluster, lease)
    })
    .await
    .unwrap();
    let lease_url = lease.url().to_string();
    let _lease_guard = LeaseGuard(Some((cluster, lease)));
    let db = ServerDb::connect(DbConfig::new(lease_url)).await.unwrap();
    sqlx::query("DROP TABLE IF EXISTS \"_prisma_migrations\"")
      .execute(db.pool())
      .await
      .unwrap();
    db.ensure_schema_ready().await.unwrap();

    let spi_calls = Arc::new(AtomicUsize::new(0));
    let mut cfg = crate::RuntimeConfig::default();
    cfg.app_config_baseline.file_json = serde_json::json!({ "copilot": { "enabled": true } });
    let state = AppState::new(
      db.clone(),
      None,
      cfg,
      Arc::new(CountingExt(
        Arc::clone(&spi_calls),
        server_spi::CommunityExtension::default(),
      )),
    );
    let authed = crate::graphql::AuthenticatedUser {
      user_id: "u1".into(),
      user: Some(CurrentUserView {
        id: "u1".into(),
        name: "U1".into(),
        email: "u1@example.test".into(),
        avatar_url: None,
        disabled: false,
        has_password: true,
        email_verified: true,
        features: Vec::new(),
      }),
    };
    let schema = Schema::build(
      TranscriptCopilotView {
        workspace_id: Some("ws1".into()),
      },
      TranscriptMutation,
      EmptySubscription,
    )
    .data(Arc::clone(&state))
    .finish();

    // 1. Missing audio check precedes empty workspaceId validation -> COPILOT_TRANSCRIPTION_AUDIO_NOT_PROVIDED.
    let no_audio = schema
      .execute(
        Request::new(r#"mutation { submitTranscriptTask(workspaceId: "", blobId: "b") { id } }"#).data(authed.clone()),
      )
      .await;
    assert_eq!(no_audio.errors.len(), 1);
    assert_eq!(
      no_audio.errors[0].extensions.as_ref().and_then(|e| e.get("name")),
      Some(&Value::String("COPILOT_TRANSCRIPTION_AUDIO_NOT_PROVIDED".into()))
    );
    assert_eq!(spi_calls.load(Ordering::SeqCst), 0);

    // 2. Dynamic copilot.enabled = false -> 403 Forbidden and 0 SPI calls.
    sqlx::query(
      "INSERT INTO app_configs (id, value, created_at, updated_at) VALUES ('copilot.enabled', 'false'::jsonb, NOW(), NOW())",
    )
    .execute(db.pool())
    .await
    .unwrap();
    state.app_config.invalidate_cache();
    let disabled = schema
      .execute(
        Request::new(r#"mutation { settleTranscriptTask(workspaceId: "ws1", taskId: "t1") { id } }"#)
          .data(authed.clone()),
      )
      .await;
    assert_eq!(disabled.errors.len(), 1);
    assert_eq!(
      disabled.errors[0].extensions.as_ref().and_then(|e| e.get("status")),
      Some(&Value::from(403))
    );
    assert_eq!(spi_calls.load(Ordering::SeqCst), 0);

    // 3. app_config read failure (closed DB pool + cleared cache) -> fail-closed on all 4 entrypoints with 0 SPI calls.
    db.pool().close().await;
    state.app_config.invalidate_cache();
    for q in [
      r#"{ transcriptTask(taskId: "t1") { id } }"#,
      r#"mutation { submitTranscriptTask(workspaceId: "ws1", blobId: "b") { id } }"#,
      r#"mutation { retryTranscriptTask(workspaceId: "ws1", taskId: "t1") { id } }"#,
      r#"mutation { settleTranscriptTask(workspaceId: "ws1", taskId: "t1") { id } }"#,
    ] {
      let resp = schema.execute(Request::new(q).data(authed.clone())).await;
      assert_eq!(resp.errors.len(), 1, "expected fail-closed error for {q}");
    }
    assert_eq!(spi_calls.load(Ordering::SeqCst), 0);
  }

  #[tokio::test]
  async fn transcript_uploads_forward_file_backed_slices_and_cap_the_count_at_32() {
    use std::sync::Mutex;

    use async_graphql::{Request, UploadValue, Value};
    use server_db::{DbConfig, ServerDb};
    use server_domain::users::CurrentUserView;
    use server_spi::{CopilotTranscriptSpi, ServerExtension};

    const MIB: usize = 1024 * 1024;

    /// Records the byte length of every submitted slice.
    #[derive(Default)]
    struct RecordingTranscriptSpi(Mutex<Vec<Vec<usize>>>);
    #[async_trait::async_trait]
    impl CopilotTranscriptSpi for RecordingTranscriptSpi {
      async fn authorize_transcript_submission(&self, _u: &str, _w: &str) -> std::result::Result<(), DomainError> {
        Ok(())
      }
      async fn submit_transcript_task(
        &self,
        input: SubmitTranscriptTaskSpiInput,
      ) -> std::result::Result<Option<TranscriptTaskRecord>, DomainError> {
        let lens = input
          .blobs
          .iter()
          .map(AudioSliceUpload::byte_len)
          .collect::<std::result::Result<Vec<_>, _>>()?;
        self.0.lock().unwrap().push(lens);
        Ok(None)
      }
      async fn retry_transcript_task(
        &self,
        _u: &str,
        _w: &str,
        _t: &str,
      ) -> std::result::Result<Option<TranscriptTaskRecord>, DomainError> {
        Ok(None)
      }
      async fn settle_transcript_task(
        &self,
        _u: &str,
        _w: &str,
        _t: &str,
      ) -> std::result::Result<Option<TranscriptTaskRecord>, DomainError> {
        Ok(None)
      }
      async fn query_transcript_task(
        &self,
        _u: &str,
        _w: &str,
        _t: Option<&str>,
        _b: Option<&str>,
      ) -> std::result::Result<Option<TranscriptTaskRecord>, DomainError> {
        Ok(None)
      }
    }

    struct EnabledCopilotRuntime;
    #[async_trait::async_trait]
    impl server_spi::CopilotRuntimeSpi for EnabledCopilotRuntime {
      async fn assert_enabled(&self, cfg_enabled: bool) -> std::result::Result<(), DomainError> {
        if cfg_enabled {
          Ok(())
        } else {
          Err(DomainError::Forbidden("copilot_disabled".to_owned()))
        }
      }
    }

    struct RecordingExt(Arc<RecordingTranscriptSpi>, server_spi::CommunityExtension);
    impl ServerExtension for RecordingExt {
      fn edition_name(&self) -> &'static str {
        self.1.edition_name()
      }
      fn quota_gate(&self) -> Arc<dyn server_spi::QuotaGate> {
        self.1.quota_gate()
      }
      fn session_policy(&self) -> Arc<dyn server_spi::SessionPolicyHook> {
        self.1.session_policy()
      }
      fn copilot_policy(&self) -> Arc<dyn server_spi::CopilotPolicySpi> {
        self.1.copilot_policy()
      }
      fn copilot_runtime(&self) -> Arc<dyn server_spi::CopilotRuntimeSpi> {
        Arc::new(EnabledCopilotRuntime)
      }
      fn copilot_transcript_spi(&self) -> Arc<dyn CopilotTranscriptSpi> {
        Arc::clone(&self.0) as Arc<dyn CopilotTranscriptSpi>
      }
    }

    struct LeaseGuard(Option<(test_db_harness::pg::PgCluster, test_db_harness::pg::DbLease)>);
    impl Drop for LeaseGuard {
      fn drop(&mut self) {
        if let Some(pair) = self.0.take() {
          let _ = std::thread::spawn(move || drop(pair)).join();
        }
      }
    }

    let (cluster, lease) = tokio::task::spawn_blocking(|| {
      let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("PG16 test cluster");
      let migrations = test_db_harness::migrations::MigrationSet::from_migrations(Vec::new());
      let template = cluster.ensure_template(&migrations).expect("template");
      let lease = cluster
        .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
        .expect("lease");
      (cluster, lease)
    })
    .await
    .unwrap();
    let lease_url = lease.url().to_string();
    let _lease_guard = LeaseGuard(Some((cluster, lease)));
    let db = ServerDb::connect(DbConfig::new(lease_url)).await.unwrap();
    sqlx::query("DROP TABLE IF EXISTS \"_prisma_migrations\"")
      .execute(db.pool())
      .await
      .unwrap();
    db.ensure_schema_ready().await.unwrap();

    let spi = Arc::new(RecordingTranscriptSpi::default());
    let mut cfg = crate::RuntimeConfig::default();
    cfg.app_config_baseline.file_json = serde_json::json!({ "copilot": { "enabled": true } });
    let state = AppState::new(
      db,
      None,
      cfg,
      Arc::new(RecordingExt(
        Arc::clone(&spi),
        server_spi::CommunityExtension::default(),
      )),
    );
    let authed = crate::graphql::AuthenticatedUser {
      user_id: "u1".into(),
      user: Some(CurrentUserView {
        id: "u1".into(),
        name: "U1".into(),
        email: "u1@example.test".into(),
        avatar_url: None,
        disabled: false,
        has_password: true,
        email_verified: true,
        features: Vec::new(),
      }),
    };
    let schema = Schema::build(TranscriptCopilotView::default(), TranscriptMutation, EmptySubscription)
      .data(Arc::clone(&state))
      .finish();
    let dir = std::env::temp_dir().join(format!("transcript-upload-limits-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();

    for (name, sizes, rejected) in [
      ("26 MiB", vec![26 * MIB], None),
      ("50 MiB", vec![50 * MIB], None),
      // The transcript runtime rejects it after its duplicate-task preflight.
      ("50 MiB + 1 B", vec![50 * MIB + 1], None),
      ("3 x 40 MiB", vec![40 * MIB; 3], None),
      ("32 slices", vec![1024; 32], None),
      ("33 slices", vec![1024; 33], Some((400, "INVALID_INPUT"))),
    ] {
      let mut request = Request::new(
        r#"mutation($blobs: [Upload!]) { submitTranscriptTask(workspaceId: "ws1", blobId: "b1", blobs: $blobs) { id } }"#,
      )
      .variables(async_graphql::Variables::from_json(serde_json::json!({
        "blobs": vec![serde_json::Value::Null; sizes.len()],
      })))
      .data(authed.clone());
      for (idx, size) in sizes.iter().enumerate() {
        // Sparse files keep the test fast and its memory flat.
        let path = dir.join(format!("{}-{idx}.ogg", name.replace(' ', "_")));
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(*size as u64).unwrap();
        request.set_upload(
          &format!("variables.blobs.{idx}"),
          UploadValue {
            filename: format!("slice-{idx}.ogg"),
            content_type: Some("audio/ogg".into()),
            content: std::fs::File::open(&path).unwrap(),
          },
        );
      }
      let resp = schema.execute(request).await;
      let submitted = spi.0.lock().unwrap().pop();
      match rejected {
        None => {
          assert!(resp.errors.is_empty(), "{name}: {:?}", resp.errors);
          assert_eq!(submitted, Some(sizes.clone()), "{name}");
        }
        Some((status, error_name)) => {
          assert_eq!(resp.errors.len(), 1, "{name}");
          let ext = resp.errors[0].extensions.as_ref().expect("error extensions");
          assert_eq!(ext.get("status"), Some(&Value::from(status)), "{name}");
          assert_eq!(ext.get("type"), Some(&Value::String(error_name.into())), "{name}");
          assert_eq!(submitted, None, "{name}: nothing is submitted");
        }
      }
    }
    let _ = std::fs::remove_dir_all(&dir);
  }
}
