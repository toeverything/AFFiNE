//! Copilot audio transcription SPI and pure domain DTOs for community and
//! commercial server editions.

use std::sync::Arc;

use server_types::DomainError;

// compat(client): transcript-upload-slice-limits -- matches v0.27.5 50 MiB per-slice cap and 32-file multipart limit
/// Maximum number of audio slices accepted in a single transcription submission.
pub const MAX_TRANSCRIPT_SLICE_COUNT: usize = 32;
/// Maximum byte size of a single uploaded audio slice (50 MiB).
pub const MAX_TRANSCRIPT_SLICE_BYTES: usize = 50 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TranscriptJobStatus {
  Pending,
  Running,
  Finished,
  Failed,
  Claimed,
}

/// Body of one uploaded audio slice: in memory, or in the temporary file of a
/// multipart upload so that only one slice at a time is read into memory.
#[derive(Clone, Debug)]
pub enum AudioSlicePayload {
  Bytes(Vec<u8>),
  File(Arc<std::fs::File>),
}

#[derive(Clone, Debug)]
pub struct AudioSliceUpload {
  pub file_name: String,
  pub mime_type: String,
  pub payload: AudioSlicePayload,
}

fn slice_io_error(err: std::io::Error) -> DomainError {
  DomainError::Validation(format!("failed to read transcript audio upload: {err}"))
}

impl AudioSliceUpload {
  pub fn from_bytes(file_name: impl Into<String>, mime_type: impl Into<String>, bytes: Vec<u8>) -> Self {
    Self {
      file_name: file_name.into(),
      mime_type: mime_type.into(),
      payload: AudioSlicePayload::Bytes(bytes),
    }
  }

  pub fn from_file(file_name: impl Into<String>, mime_type: impl Into<String>, file: std::fs::File) -> Self {
    Self {
      file_name: file_name.into(),
      mime_type: mime_type.into(),
      payload: AudioSlicePayload::File(Arc::new(file)),
    }
  }

  pub fn byte_len(&self) -> Result<usize, DomainError> {
    match &self.payload {
      AudioSlicePayload::Bytes(bytes) => Ok(bytes.len()),
      AudioSlicePayload::File(file) => {
        let len = file.metadata().map_err(slice_io_error)?.len();
        usize::try_from(len).map_err(|_| DomainError::Validation("transcript audio slice is too large".into()))
      }
    }
  }

  /// Reads at most the first `max` bytes, for example to sniff the container.
  pub fn read_prefix(&self, max: usize) -> Result<Vec<u8>, DomainError> {
    match &self.payload {
      AudioSlicePayload::Bytes(bytes) => Ok(bytes[..bytes.len().min(max)].to_vec()),
      AudioSlicePayload::File(file) => read_file(file, Some(max)),
    }
  }

  pub fn into_bytes(self) -> Result<Vec<u8>, DomainError> {
    match self.payload {
      AudioSlicePayload::Bytes(bytes) => Ok(bytes),
      AudioSlicePayload::File(file) => read_file(&file, None),
    }
  }
}

fn read_file(file: &std::fs::File, max: Option<usize>) -> Result<Vec<u8>, DomainError> {
  use std::io::{Read as _, Seek as _, SeekFrom};
  let mut reader = file;
  reader.seek(SeekFrom::Start(0)).map_err(slice_io_error)?;
  let mut out = Vec::new();
  match max {
    Some(max) => reader.take(max as u64).read_to_end(&mut out),
    None => reader.read_to_end(&mut out),
  }
  .map_err(slice_io_error)?;
  Ok(out)
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

#[derive(Clone, Debug)]
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

  #[test]
  fn file_backed_slices_read_their_length_prefix_and_body_from_the_file() {
    use std::io::Write as _;
    let path = std::env::temp_dir().join(format!("transcript-slice-{}", std::process::id()));
    std::fs::File::create(&path)
      .unwrap()
      .write_all(b"OggS-file-backed-slice")
      .unwrap();
    let file_backed = AudioSliceUpload::from_file("a.ogg", "audio/ogg", std::fs::File::open(&path).unwrap());
    let in_memory = AudioSliceUpload::from_bytes("a.ogg", "audio/ogg", b"OggS-file-backed-slice".to_vec());
    for slice in [file_backed, in_memory] {
      assert_eq!(slice.byte_len().unwrap(), 22);
      assert_eq!(slice.read_prefix(4).unwrap(), b"OggS");
      assert_eq!(slice.read_prefix(64).unwrap().len(), 22);
      assert_eq!(slice.into_bytes().unwrap(), b"OggS-file-backed-slice");
    }
    let _ = std::fs::remove_file(&path);
  }

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
