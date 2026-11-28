//! Unified host media and file ingestion pipeline.
//!
//! Computes deterministic SHA-256 base64url content-addressed blob keys, parses image dimensions
//! in memory, tracks upload queue metadata, and atomically inserts `affine:image` or
//! `affine:attachment` blocks into a [`PageDocSession`] in a single undoable transaction.

use affine_store::blob_api::{compute_blob_key, detect_image_dimensions};
use blocksuite_playground_doc::{schema::BlockSpec, session::PageDocSession};
use serde::{Deserialize, Serialize};

use crate::{ClientError, ClientResult};

/// Default fallback image dimensions when neither the host picker nor binary headers specify them.
const DEFAULT_IMAGE_WIDTH: u32 = 640;
const DEFAULT_IMAGE_HEIGHT: u32 = 400;

/// Kind of picked local media or file being ingested into a document.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PickedMediaKind {
    Image,
    Attachment,
}

/// Host picker payload handed to the client ingestion pipeline.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PickedMediaInput {
    pub filename: String,
    pub mime_type: String,
    pub bytes: Vec<u8>,
    pub dimensions: Option<(u32, u32)>,
    pub caption: String,
}

impl PickedMediaInput {
    /// Classify whether this picked file should be inserted as `affine:image` or `affine:attachment`.
    pub fn kind(&self) -> PickedMediaKind {
        let lower = self.mime_type.trim().to_ascii_lowercase();
        if lower.starts_with("image/") && lower != "image/svg+xml" {
            PickedMediaKind::Image
        } else {
            PickedMediaKind::Attachment
        }
    }
}

/// Local-to-cloud upload queue state for a content-addressed blob.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BlobUploadState {
    Queued,
    Uploading,
    Uploaded,
    Failed,
}

/// Metadata stored alongside a local `blobs` table row and upload queue entry.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestedBlobRecord {
    pub key: String,
    pub filename: String,
    pub mime_type: String,
    pub byte_size: usize,
    pub dimensions: Option<(u32, u32)>,
    pub kind: PickedMediaKind,
    pub upload_state: BlobUploadState,
    pub created_at_ms: i64,
}

/// Result of atomically inserting a media or attachment block into a [`PageDocSession`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsertedMediaBlock {
    pub block_id: String,
    pub parent_id: String,
    pub blob: IngestedBlobRecord,
    /// Incremental v1 CRDT update produced by the atomic insertion transaction.
    pub update_v1: Vec<u8>,
}

/// Build the content-addressed [`IngestedBlobRecord`] for a picked host file.
pub fn prepare_ingested_blob(
    input: &PickedMediaInput,
    now_ms: i64,
) -> ClientResult<IngestedBlobRecord> {
    if input.bytes.is_empty() {
        return Err(ClientError::Store("picked media payload is empty".into()));
    }
    let key = compute_blob_key(&input.bytes);
    let kind = input.kind();
    let dimensions = match kind {
        PickedMediaKind::Image => Some(
            input
                .dimensions
                .or_else(|| detect_image_dimensions(&input.bytes))
                .unwrap_or((DEFAULT_IMAGE_WIDTH, DEFAULT_IMAGE_HEIGHT)),
        ),
        PickedMediaKind::Attachment => None,
    };
    let filename = if input.filename.trim().is_empty() {
        match kind {
            PickedMediaKind::Image => format!("{}.bin", &key[..key.len().min(8)]),
            PickedMediaKind::Attachment => "attachment.bin".to_string(),
        }
    } else {
        input.filename.trim().to_string()
    };
    let mime_type = if input.mime_type.trim().is_empty() {
        "application/octet-stream".to_string()
    } else {
        input.mime_type.trim().to_string()
    };

    Ok(IngestedBlobRecord {
        key,
        filename,
        mime_type,
        byte_size: input.bytes.len(),
        dimensions,
        kind,
        upload_state: BlobUploadState::Queued,
        created_at_ms: now_ms,
    })
}

/// Atomically insert an `affine:image` or `affine:attachment` block into `session` at
/// `(parent_id, insert_index)` inside a single undoable [`PageDocSession::structural_edit`].
///
/// Calling `session.undo(now_ms)` once immediately removes the inserted block.
pub fn ingest_media_into_doc_session(
    session: &mut PageDocSession,
    input: &PickedMediaInput,
    parent_id: &str,
    insert_index: Option<u64>,
    block_id: &str,
    now_ms: i64,
) -> ClientResult<InsertedMediaBlock> {
    let record = prepare_ingested_blob(input, now_ms)?;
    let spec = match record.kind {
        PickedMediaKind::Image => {
            let (w, h) = record
                .dimensions
                .unwrap_or((DEFAULT_IMAGE_WIDTH, DEFAULT_IMAGE_HEIGHT));
            BlockSpec::Image {
                source_id: record.key.clone(),
                caption: input.caption.clone(),
                width: f64::from(w),
                height: f64::from(h),
                xywh: None,
            }
        }
        PickedMediaKind::Attachment => BlockSpec::Attachment {
            name: record.filename.clone(),
            size: record.byte_size as i64,
            mime_type: record.mime_type.clone(),
            source_id: record.key.clone(),
            caption: input.caption.clone(),
            embed: false,
        },
    };

    let parent_owned = parent_id.to_string();
    let block_owned = block_id.to_string();
    let ts_u64 = now_ms.max(0) as u64;
    let commit = session
        .structural_edit(ts_u64, move |page| {
            page.add_block(
                &block_owned,
                spec.clone(),
                Some(&parent_owned),
                insert_index,
                ts_u64,
            )?;
            Ok(())
        })
        .map_err(|err| ClientError::Store(format!("inserting media block failed: {err}")))?;

    let update_v1 = commit
        .map(|c| c.update)
        .unwrap_or_else(|| session.encode_update_v1().unwrap_or_default());

    Ok(InsertedMediaBlock {
        block_id: block_id.to_string(),
        parent_id: parent_id.to_string(),
        blob: record,
        update_v1,
    })
}
