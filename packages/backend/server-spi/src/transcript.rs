//! Copilot audio transcription SPI and pure domain DTOs for community and
//! commercial server editions.

use server_types::DomainError;

/// Maximum number of audio slices accepted in a single transcription submission.
pub const MAX_TRANSCRIPT_SLICE_COUNT: usize = 64;
/// Maximum byte size of a single uploaded audio slice (25 MiB).
pub const MAX_TRANSCRIPT_SLICE_BYTES: usize = 25 * 1024 * 1024;
/// Maximum combined byte size across all uploaded audio slices (50 MiB).
pub const MAX_TRANSCRIPT_TOTAL_BYTES: usize = 50 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TranscriptJobStatus {
  Pending,
  Running,
  Finished,
  Failed,
  Claimed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AudioSliceUpload {
  pub file_name: String,
  pub mime_type: String,
  pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AudioSliceManifestItemRecord {
  pub index: i32,
  pub file_name: String,
  pub mime_type: String,
  pub start_sec: f64,
  pub duration_sec: f64,
  pub byte_size: Option<i32>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TranscriptSourceAudioInputRecord {
  pub mime_type: Option<String>,
  pub duration_ms: Option<i32>,
  pub sample_rate: Option<i32>,
  pub channels: Option<i32>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TranscriptSourceAudioRecord {
  pub blob_id: Option<String>,
  pub mime_type: Option<String>,
  pub duration_ms: Option<i32>,
  pub sample_rate: Option<i32>,
  pub channels: Option<i32>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TranscriptQualityRecord {
  pub degraded: Option<bool>,
  pub overflow_count: Option<i32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SubmitTranscriptTaskSpiInput {
  pub user_id: String,
  pub workspace_id: String,
  pub blob_id: String,
  pub blobs: Vec<AudioSliceUpload>,
  pub source_audio: Option<TranscriptSourceAudioInputRecord>,
  pub quality: Option<TranscriptQualityRecord>,
  pub slice_manifest: Option<Vec<AudioSliceManifestItemRecord>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TranscriptItemRecord {
  pub speaker: String,
  pub start: String,
  pub end: String,
  pub transcription: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NormalizedTranscriptSegmentRecord {
  pub speaker: String,
  pub start_sec: f64,
  pub end_sec: f64,
  pub start: String,
  pub end: String,
  pub text: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MeetingActionItemRecord {
  pub description: String,
  pub owner: Option<String>,
  pub deadline: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MeetingSummaryV2Record {
  pub title: String,
  pub duration_minutes: f64,
  pub attendees: Vec<String>,
  pub key_points: Vec<String>,
  pub action_items: Vec<MeetingActionItemRecord>,
  pub decisions: Vec<String>,
  pub open_questions: Vec<String>,
  pub blockers: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TranscriptTaskRecord {
  pub id: String,
  pub status: TranscriptJobStatus,
  pub title: Option<String>,
  pub summary: Option<String>,
  pub actions: Option<String>,
  pub transcription: Option<Vec<TranscriptItemRecord>>,
  pub source_audio: Option<TranscriptSourceAudioRecord>,
  pub quality: Option<TranscriptQualityRecord>,
  pub slice_manifest: Option<Vec<AudioSliceManifestItemRecord>>,
  pub normalized_segments: Option<Vec<NormalizedTranscriptSegmentRecord>>,
  pub normalized_transcript: Option<String>,
  pub summary_json: Option<MeetingSummaryV2Record>,
  pub version: Option<String>,
}

#[async_trait::async_trait]
pub trait CopilotTranscriptSpi: Send + Sync + 'static {
  async fn authorize_transcript_submission(&self, user_id: &str, workspace_id: &str) -> Result<(), DomainError>;

  async fn submit_transcript_task(
    &self,
    input: SubmitTranscriptTaskSpiInput,
  ) -> Result<Option<TranscriptTaskRecord>, DomainError>;

  async fn retry_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    task_id: &str,
  ) -> Result<Option<TranscriptTaskRecord>, DomainError>;

  async fn settle_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    task_id: &str,
  ) -> Result<Option<TranscriptTaskRecord>, DomainError>;

  async fn query_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    task_id: Option<&str>,
    blob_id: Option<&str>,
  ) -> Result<Option<TranscriptTaskRecord>, DomainError>;
}

/// Default community transcript SPI returning Copilot disabled.
#[derive(Clone, Copy, Debug, Default)]
pub struct CommunityCopilotTranscriptSpi;

#[async_trait::async_trait]
impl CopilotTranscriptSpi for CommunityCopilotTranscriptSpi {
  async fn authorize_transcript_submission(&self, _user_id: &str, _workspace_id: &str) -> Result<(), DomainError> {
    Err(DomainError::Forbidden("Copilot is disabled.".into()))
  }

  async fn submit_transcript_task(
    &self,
    _input: SubmitTranscriptTaskSpiInput,
  ) -> Result<Option<TranscriptTaskRecord>, DomainError> {
    Err(DomainError::Forbidden("Copilot is disabled.".into()))
  }

  async fn retry_transcript_task(
    &self,
    _user_id: &str,
    _workspace_id: &str,
    _task_id: &str,
  ) -> Result<Option<TranscriptTaskRecord>, DomainError> {
    Err(DomainError::Forbidden("Copilot is disabled.".into()))
  }

  async fn settle_transcript_task(
    &self,
    _user_id: &str,
    _workspace_id: &str,
    _task_id: &str,
  ) -> Result<Option<TranscriptTaskRecord>, DomainError> {
    Err(DomainError::Forbidden("Copilot is disabled.".into()))
  }

  async fn query_transcript_task(
    &self,
    _user_id: &str,
    _workspace_id: &str,
    _task_id: Option<&str>,
    _blob_id: Option<&str>,
  ) -> Result<Option<TranscriptTaskRecord>, DomainError> {
    Err(DomainError::Forbidden("Copilot is disabled.".into()))
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn community_transcript_spi_rejects_all_operations() {
    let spi = CommunityCopilotTranscriptSpi;
    let submit = SubmitTranscriptTaskSpiInput {
      user_id: "u1".into(),
      workspace_id: "ws1".into(),
      blob_id: "b1".into(),
      blobs: Vec::new(),
      source_audio: None,
      quality: None,
      slice_manifest: None,
    };
    assert!(matches!(
      spi.submit_transcript_task(submit).await,
      Err(DomainError::Forbidden(msg)) if msg == "Copilot is disabled."
    ));
    assert!(matches!(
      spi.retry_transcript_task("u1", "ws1", "t1").await,
      Err(DomainError::Forbidden(msg)) if msg == "Copilot is disabled."
    ));
    assert!(matches!(
      spi.settle_transcript_task("u1", "ws1", "t1").await,
      Err(DomainError::Forbidden(msg)) if msg == "Copilot is disabled."
    ));
    assert!(matches!(
      spi.query_transcript_task("u1", "ws1", Some("t1"), None).await,
      Err(DomainError::Forbidden(msg)) if msg == "Copilot is disabled."
    ));
  }
}
