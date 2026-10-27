use affine_core::blob_access::SourceIdentity;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::runtime::{RuntimeError, RuntimeResult};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct BlobSourceInputV1 {
  #[serde(rename = "type")]
  pub(super) source_type: String,
  pub(super) workspace_id: String,
  pub(super) doc_id: String,
  pub(super) timestamp_ms: Option<i64>,
}

impl TryFrom<BlobSourceInputV1> for SourceIdentity {
  type Error = RuntimeError;

  fn try_from(input: BlobSourceInputV1) -> RuntimeResult<Self> {
    if input.workspace_id.is_empty() || input.doc_id.is_empty() {
      return Err(RuntimeError::invalid_input("blob_source_invalid"));
    }
    match input.source_type.as_str() {
      "currentDoc" => Ok(Self::CurrentDoc {
        workspace_id: input.workspace_id,
        doc_id: input.doc_id,
      }),
      "history" => {
        let timestamp_ms = input
          .timestamp_ms
          .filter(|timestamp| DateTime::<Utc>::from_timestamp_millis(*timestamp).is_some())
          .ok_or_else(|| RuntimeError::invalid_input("blob_history_timestamp_invalid"))?;
        Ok(Self::History {
          workspace_id: input.workspace_id,
          doc_id: input.doc_id,
          timestamp_ms,
        })
      }
      _ => Err(RuntimeError::invalid_input("blob_source_type_invalid")),
    }
  }
}

#[derive(Clone, Debug)]
pub(super) struct LoadedSource {
  pub(super) identity: SourceIdentity,
  pub(super) stamp: String,
  pub(super) blob: Vec<u8>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ManifestEntry {
  pub(super) key: String,
  pub(super) mime: String,
  pub(super) size: i64,
  pub(super) source: SourceIdentity,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DocManifestRequestV1 {
  pub(super) actor_user_id: Option<String>,
  pub(super) source: BlobSourceInputV1,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct BlobReadRequestV1 {
  pub(super) actor_user_id: Option<String>,
  pub(super) source: BlobSourceInputV1,
  pub(super) key: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WorkspaceManifestRequestV1 {
  pub(super) actor_user_id: String,
  pub(super) workspace_id: String,
  pub(super) cursor: Option<String>,
  pub(super) limit: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DocManifestOutputV1 {
  pub(super) version: u32,
  pub(super) entries: Vec<ManifestEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WorkspaceManifestOutputV1 {
  pub(super) version: u32,
  pub(super) entries: Vec<ManifestEntry>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub(super) next_cursor: Option<String>,
}
