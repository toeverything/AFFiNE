mod cache;
mod store;
mod stream;
mod types;

use std::{
  collections::{HashMap, HashSet},
  future::Future,
  pin::Pin,
  sync::Arc,
};

use affine_core::access_control::{DocAction, WorkspaceAction};
pub(super) use affine_core::blob_access::SourceIdentity;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction};
use stream::BlobStream;
pub(super) use stream::{RuntimeAuthorizedBlobV1, RuntimeBlobChunkV1};
use tokio::sync::Mutex;
use uuid::Uuid;

use self::{
  cache::BlobRefCache,
  store::BlobAccessStore,
  types::{
    BlobReadRequestV1, DocManifestOutputV1, DocManifestRequestV1, LoadedSource, ManifestEntry,
    WorkspaceManifestOutputV1, WorkspaceManifestRequestV1,
  },
};
use super::{
  BackendRuntime,
  invalidation::{InvalidationHintV1, InvalidationTarget},
  permission::{PermissionAuthorizer, PermissionTelemetry},
};
use crate::runtime::{Deployment, RuntimeError, RuntimeResult, napi_error, object_storage::ObjectStorageService};

const MANIFEST_VERSION: u32 = 1;
const DEFAULT_PAGE_LIMIT: u32 = 25;
const MAX_PAGE_LIMIT: u32 = 100;
const SOURCE_PAGE_LIMIT: i64 = 32;
const KEY_BATCH_LIMIT: usize = 256;
const STREAM_CHUNK_BYTES: usize = 256 * 1024;
const MAX_ACTIVE_STREAMS: usize = 512;

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestCursor {
  doc_id: String,
  key: String,
}

fn decode_manifest_cursor(cursor: Option<&str>) -> RuntimeResult<Option<ManifestCursor>> {
  cursor
    .map(|cursor| {
      let bytes = URL_SAFE_NO_PAD
        .decode(cursor)
        .map_err(|_| RuntimeError::invalid_input("blob_manifest_cursor_invalid"))?;
      serde_json::from_slice(&bytes).map_err(|_| RuntimeError::invalid_input("blob_manifest_cursor_invalid"))
    })
    .transpose()
}

fn encode_manifest_cursor(entry: &ManifestEntry) -> String {
  URL_SAFE_NO_PAD.encode(
    serde_json::to_vec(&ManifestCursor {
      doc_id: entry.source.doc_id().to_string(),
      key: entry.key.clone(),
    })
    .expect("manifest cursor is serializable"),
  )
}
pub(super) struct BlobAccessService {
  store: BlobAccessStore,
  authorizer: PermissionAuthorizer,
  cache: BlobRefCache,
  storage: Arc<ObjectStorageService>,
  streams: Mutex<HashMap<Uuid, Arc<Mutex<BlobStream>>>>,
}

impl BlobAccessService {
  pub(super) fn new(
    pool: PgPool,
    storage: Arc<ObjectStorageService>,
    deployment: Deployment,
    telemetry: PermissionTelemetry,
  ) -> Self {
    Self {
      store: BlobAccessStore::new(pool.clone()),
      authorizer: PermissionAuthorizer::with_telemetry(pool, deployment, telemetry.clone()),
      cache: BlobRefCache::new(telemetry),
      storage,
      streams: Mutex::new(HashMap::new()),
    }
  }

  async fn manifest(&self, actor_user_id: Option<&str>, source: SourceIdentity) -> RuntimeResult<DocManifestOutputV1> {
    let loaded = self.authorize_and_load(actor_user_id, source).await?;
    let refs = self
      .cache
      .refs(loaded.clone(), || {
        self.confirm_source(actor_user_id, &loaded.identity, &loaded.stamp)
      })
      .await?;
    let entries = self
      .verify_and_metadata(actor_user_id, &loaded.identity, &loaded.stamp, &refs, None, None)
      .await?;
    Ok(DocManifestOutputV1 {
      version: MANIFEST_VERSION,
      entries,
    })
  }

  async fn workspace_manifest(&self, request: WorkspaceManifestRequestV1) -> RuntimeResult<WorkspaceManifestOutputV1> {
    let limit = request.limit.unwrap_or(DEFAULT_PAGE_LIMIT).clamp(1, MAX_PAGE_LIMIT);
    let cursor = decode_manifest_cursor(request.cursor.as_deref())?;
    let mut entries = Vec::new();
    let mut source_cursor = cursor.as_ref().map(|cursor| cursor.doc_id.clone());
    let mut include_source_cursor = true;
    'pages: loop {
      let mut transaction = self.store.begin_snapshot().await?;
      let workspace = self
        .authorizer
        .authorize_workspace_action_in(
          &mut transaction,
          &request.workspace_id,
          Some(&request.actor_user_id),
          WorkspaceAction::Sync,
        )
        .await?;
      if !workspace.allowed {
        return Err(RuntimeError::invalid_input("blob_workspace_member_required"));
      }
      let doc_ids = BlobAccessStore::page_doc_ids(
        &mut transaction,
        &request.workspace_id,
        source_cursor.as_deref(),
        include_source_cursor,
        SOURCE_PAGE_LIMIT,
      )
      .await?;
      if doc_ids.is_empty() {
        transaction
          .commit()
          .await
          .map_err(|error| RuntimeError::database("commit workspace blob source snapshot", error))?;
        break;
      }
      let next_source_cursor = doc_ids.last().cloned();
      let readable_docs = self
        .authorizer
        .authorize_doc_action_batch_in(
          &mut transaction,
          &request.workspace_id,
          Some(&request.actor_user_id),
          &doc_ids
            .iter()
            .filter(|doc_id| doc_id.as_str() != request.workspace_id.as_str())
            .cloned()
            .collect::<Vec<_>>(),
          DocAction::Read,
        )
        .await?
        .into_iter()
        .filter(|(_, decision)| decision.allowed)
        .map(|(doc_id, _)| doc_id)
        .collect::<HashSet<_>>();
      let readable_source_ids = doc_ids
        .into_iter()
        .filter(|doc_id| doc_id == &request.workspace_id || readable_docs.contains(doc_id))
        .collect::<Vec<_>>();
      transaction
        .commit()
        .await
        .map_err(|error| RuntimeError::database("commit workspace blob source snapshot", error))?;

      for doc_id in readable_source_ids {
        let source = self
          .authorize_and_load(
            Some(&request.actor_user_id),
            SourceIdentity::CurrentDoc {
              workspace_id: request.workspace_id.clone(),
              doc_id,
            },
          )
          .await?;
        let refs = self
          .cache
          .refs(source.clone(), || {
            self.confirm_source(Some(&request.actor_user_id), &source.identity, &source.stamp)
          })
          .await?;
        let remaining = usize::try_from(limit).expect("manifest limit fits usize") + 1 - entries.len();
        let after_key = cursor
          .as_ref()
          .filter(|cursor| cursor.doc_id == source.identity.doc_id())
          .map(|cursor| cursor.key.as_str());
        let source_entries = self
          .verify_and_metadata(
            Some(&request.actor_user_id),
            &source.identity,
            &source.stamp,
            &refs,
            after_key,
            Some(i64::try_from(remaining).expect("manifest page size fits i64")),
          )
          .await?;
        entries.extend(source_entries);
        if entries.len() > limit as usize {
          break 'pages;
        }
      }
      source_cursor = next_source_cursor;
      include_source_cursor = false;
    }
    let has_more = entries.len() > limit as usize;
    entries.truncate(limit as usize);
    let next_cursor = has_more.then(|| encode_manifest_cursor(entries.last().expect("non-empty capped manifest")));
    Ok(WorkspaceManifestOutputV1 {
      version: MANIFEST_VERSION,
      entries,
      next_cursor,
    })
  }

  async fn authorize_and_load(
    &self,
    actor_user_id: Option<&str>,
    source: SourceIdentity,
  ) -> RuntimeResult<LoadedSource> {
    let mut transaction = self.store.begin_snapshot().await?;
    self.authorize_source(&mut transaction, actor_user_id, &source).await?;
    let loaded = BlobAccessStore::load_source(&mut transaction, &source).await?;
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit blob source snapshot", error))?;
    Ok(loaded)
  }

  async fn verify_and_metadata(
    &self,
    actor_user_id: Option<&str>,
    source: &SourceIdentity,
    expected_stamp: &str,
    keys: &[Box<str>],
    after_key: Option<&str>,
    limit: Option<i64>,
  ) -> RuntimeResult<Vec<ManifestEntry>> {
    let mut transaction = self.store.begin_snapshot().await?;
    self.authorize_source(&mut transaction, actor_user_id, source).await?;
    let stamp = BlobAccessStore::load_stamp(&mut transaction, source).await?;
    if stamp != expected_stamp {
      self.cache.invalidate(source).await;
      return Err(RuntimeError::invalid_state("blob_source_changed"));
    }
    let mut metadata = Vec::new();
    for keys in keys.chunks(KEY_BATCH_LIMIT) {
      let remaining = limit.map(|limit| limit.saturating_sub(i64::try_from(metadata.len()).unwrap_or(limit)));
      if remaining == Some(0) {
        break;
      }
      let keys = keys.iter().map(ToString::to_string).collect::<Vec<_>>();
      metadata.extend(BlobAccessStore::live_metadata(&mut transaction, source, &keys, after_key, remaining).await?);
    }
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit blob authorization verification", error))?;
    Ok(metadata)
  }

  async fn confirm_source(
    &self,
    actor_user_id: Option<&str>,
    source: &SourceIdentity,
    expected_stamp: &str,
  ) -> RuntimeResult<()> {
    let mut transaction = self.store.begin_snapshot().await?;
    self.authorize_source(&mut transaction, actor_user_id, source).await?;
    if BlobAccessStore::load_stamp(&mut transaction, source).await? != expected_stamp {
      self.cache.invalidate(source).await;
      return Err(RuntimeError::invalid_state("blob_source_changed"));
    }
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit blob source confirmation", error))?;
    Ok(())
  }

  async fn authorize_source(
    &self,
    transaction: &mut Transaction<'_, Postgres>,
    actor_user_id: Option<&str>,
    source: &SourceIdentity,
  ) -> RuntimeResult<()> {
    if source.is_workspace_root() {
      let decision = self
        .authorizer
        .authorize_workspace_action_in(transaction, source.workspace_id(), actor_user_id, WorkspaceAction::Read)
        .await?;
      if decision.allowed {
        return Ok(());
      }
      return Err(RuntimeError::invalid_input("blob_source_access_denied"));
    }
    let decision = self
      .authorizer
      .authorize_doc_action_in(
        transaction,
        source.workspace_id(),
        actor_user_id,
        source.doc_id(),
        match source {
          SourceIdentity::CurrentDoc { .. } => DocAction::Read,
          SourceIdentity::History { .. } => DocAction::HistoryRead,
        },
      )
      .await?;
    if !decision.allowed {
      return Err(RuntimeError::invalid_input("blob_source_access_denied"));
    }
    Ok(())
  }
}

impl InvalidationTarget for BlobAccessService {
  fn invalidate<'a>(&'a self, hint: &'a InvalidationHintV1) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
    Box::pin(async move {
      if let InvalidationHintV1::BlobSource { source } = hint {
        self.cache.invalidate(source).await;
      }
    })
  }
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn get_doc_blob_manifest_v1(&self, input: Value) -> napi::Result<Value> {
    let request: DocManifestRequestV1 = match serde_json::from_value(input) {
      Ok(request) => request,
      Err(error) => {
        self.permission_telemetry.blob_access("manifest", "deny", "protocol");
        return Err(napi_error(error.to_string()));
      }
    };
    let source_result: RuntimeResult<SourceIdentity> = request.source.try_into();
    let source = match source_result {
      Ok(source) => source,
      Err(error) => {
        self.permission_telemetry.blob_access("manifest", "deny", "protocol");
        return Err(napi_error(error.to_string()));
      }
    };
    let result = self
      .blob_access_service()
      .await?
      .manifest(request.actor_user_id.as_deref(), source)
      .await;
    self.record_blob_access("manifest", &result);
    let output = result.map_err(|error| napi_error(error.to_string()))?;
    serde_json::to_value(output).map_err(|error| napi_error(error.to_string()))
  }

  #[napi]
  pub async fn get_readable_workspace_blob_manifest_v1(&self, input: Value) -> napi::Result<Value> {
    let request = match serde_json::from_value(input) {
      Ok(request) => request,
      Err(error) => {
        self
          .permission_telemetry
          .blob_access("workspace_manifest", "deny", "protocol");
        return Err(napi_error(error.to_string()));
      }
    };
    let result = self.blob_access_service().await?.workspace_manifest(request).await;
    self.record_blob_access("workspace_manifest", &result);
    let output = result.map_err(|error| napi_error(error.to_string()))?;
    serde_json::to_value(output).map_err(|error| napi_error(error.to_string()))
  }

  #[napi]
  pub async fn get_blob_v1(&self, input: Value) -> napi::Result<RuntimeAuthorizedBlobV1> {
    let request: BlobReadRequestV1 = match serde_json::from_value(input) {
      Ok(request) => request,
      Err(error) => {
        self.permission_telemetry.blob_access("open", "deny", "protocol");
        return Err(napi_error(error.to_string()));
      }
    };
    let source_result: RuntimeResult<SourceIdentity> = request.source.try_into();
    let source = match source_result {
      Ok(source) => source,
      Err(error) => {
        self.permission_telemetry.blob_access("open", "deny", "protocol");
        return Err(napi_error(error.to_string()));
      }
    };
    let result = self
      .blob_access_service()
      .await?
      .open_read(request.actor_user_id.as_deref(), source, request.key)
      .await;
    self.record_blob_access("open", &result);
    result.map_err(|error| napi_error(error.to_string()))
  }

  #[napi]
  pub async fn read_blob_stream_chunk_v1(&self, stream_id: String) -> napi::Result<RuntimeBlobChunkV1> {
    let stream_id = match Uuid::parse_str(&stream_id) {
      Ok(stream_id) => stream_id,
      Err(_) => {
        self.permission_telemetry.blob_access("chunk", "deny", "protocol");
        return Err(napi_error("blob_stream_id_invalid"));
      }
    };
    let result = self.blob_access_service().await?.read_chunk(stream_id).await;
    self.record_blob_access("chunk", &result);
    result.map_err(|error| napi_error(error.to_string()))
  }

  #[napi]
  pub async fn close_blob_stream_v1(&self, stream_id: String) -> napi::Result<()> {
    let stream_id = match Uuid::parse_str(&stream_id) {
      Ok(stream_id) => stream_id,
      Err(_) => {
        self.permission_telemetry.blob_access("chunk", "deny", "protocol");
        return Err(napi_error("blob_stream_id_invalid"));
      }
    };
    self
      .blob_access_service()
      .await?
      .streams
      .lock()
      .await
      .remove(&stream_id);
    Ok(())
  }
}

impl BackendRuntime {
  fn record_blob_access<T>(&self, operation: &'static str, result: &RuntimeResult<T>) {
    let (result_name, reason) = match result {
      Ok(_) => ("allow", "authorized"),
      Err(error) => ("deny", blob_error_reason(error)),
    };
    self.permission_telemetry.blob_access(operation, result_name, reason);
  }

  async fn blob_access_service(&self) -> napi::Result<Arc<BlobAccessService>> {
    self
      .blob_access
      .lock()
      .await
      .as_ref()
      .cloned()
      .ok_or_else(|| napi_error("blob_access_unavailable"))
  }
}

fn blob_error_reason(error: &RuntimeError) -> &'static str {
  let message = match error {
    RuntimeError::InvalidInput(message) | RuntimeError::InvalidState(message) => message.as_str(),
    RuntimeError::ObjectStorage(_) | RuntimeError::Io { .. } => return "storage",
    RuntimeError::Json { .. } => return "protocol",
    _ => return "internal",
  };
  if message.contains("access_denied") || message.contains("member_required") {
    "authorization"
  } else if message.contains("cursor") || message.contains("stream") || message.contains("source_invalid") {
    "protocol"
  } else if message.contains("not_referenced") {
    "reference"
  } else if message.contains("not_completed") || message.contains("object_") {
    "ledger"
  } else if message.contains("parse") || message.contains("overloaded") {
    "parse"
  } else if message.contains("changed") || message.contains("stamp") {
    "stale"
  } else {
    "internal"
  }
}

#[cfg(test)]
mod tests;
