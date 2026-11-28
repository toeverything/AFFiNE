//! Pure `y_octo 0.4` source-scoped blob reference extraction, consistent
//! `REPEATABLE READ READ ONLY` loading, bounded LRU caching, and manifest
//! pagination aligned with `v0.27.5` `blob_access` and `affine_doc_loader`.

use std::collections::{BTreeSet, HashSet, VecDeque};
use std::num::NonZeroUsize;

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::{DateTime, Utc};
use lru::LruCache;
use serde::{Deserialize, Serialize};
use server_db::WorkloadTier;
use server_domain::acl::{authorize_reserved_doc, load_workspace_docs_access_in};
use server_types::DomainError;
use sqlx::{Postgres, Transaction};
use y_octo::{ReadDoc, ReadMap, ReadValue};

use crate::{BlobRecord, BlobService};

pub const MAX_SOURCE_BINARY_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_SOURCE_UPDATES: i64 = 10_000;
const MAX_SOURCE_BLOCKS: usize = 100_000;
const MAX_CHILDREN_PER_BLOCK: u64 = 10_000;
const MAX_SOURCE_REFS: usize = 10_000;
const MAX_BLOB_KEY_BYTES: usize = 1_024;

const BLOB_REF_READ_LIMITS: y_octo::ReadLimits = y_octo::ReadLimits {
  max_input_bytes: 256 * 1024 * 1024,
  max_structs: 16_000_000,
  max_clients: 200_000,
  max_collection_entries: 32_000_000,
  max_any_depth: y_octo::Any::DEFAULT_MAX_DEPTH,
  max_content_bytes: 256 * 1024 * 1024,
};

const BLOB_REF_CACHE_MAX_ENTRIES: usize = 512;
const BLOB_REF_CACHE_MAX_BYTES: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug, Eq, PartialEq, Hash)]
struct BlobRefCacheKey {
  workspace_id: String,
  doc_id: String,
  source_stamp: String,
}

struct CachedBlobRefs {
  keys: BTreeSet<String>,
  approx_bytes: usize,
}

/// Bounded LRU cache of extracted blob reference sets keyed by
/// `(workspace_id, storage_doc_id, source_stamp)`.
pub(crate) struct BlobRefCache {
  lru: LruCache<BlobRefCacheKey, CachedBlobRefs>,
  total_bytes: usize,
}

impl BlobRefCache {
  pub(crate) fn new() -> Self {
    Self {
      lru: LruCache::new(NonZeroUsize::new(BLOB_REF_CACHE_MAX_ENTRIES).expect("non-zero cache capacity")),
      total_bytes: 0,
    }
  }

  fn get(&mut self, key: &BlobRefCacheKey) -> Option<BTreeSet<String>> {
    self.lru.get(key).map(|entry| entry.keys.clone())
  }

  fn put(&mut self, key: BlobRefCacheKey, keys: BTreeSet<String>) {
    let approx_bytes = key.workspace_id.len()
      + key.doc_id.len()
      + key.source_stamp.len()
      + keys.iter().map(|k| k.len() + 32).sum::<usize>()
      + 64;
    if approx_bytes > BLOB_REF_CACHE_MAX_BYTES {
      return;
    }
    if let Some(prev) = self.lru.pop(&key) {
      self.total_bytes = self.total_bytes.saturating_sub(prev.approx_bytes);
    }
    while self.total_bytes.saturating_add(approx_bytes) > BLOB_REF_CACHE_MAX_BYTES {
      let Some((_, evicted)) = self.lru.pop_lru() else {
        break;
      };
      self.total_bytes = self.total_bytes.saturating_sub(evicted.approx_bytes);
    }
    if self.lru.len() >= BLOB_REF_CACHE_MAX_ENTRIES
      && let Some((_, evicted)) = self.lru.pop_lru()
    {
      self.total_bytes = self.total_bytes.saturating_sub(evicted.approx_bytes);
    }
    self.total_bytes = self.total_bytes.saturating_add(approx_bytes);
    self.lru.put(key, CachedBlobRefs { keys, approx_bytes });
  }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SourceBlobManifestEntry {
  pub key: String,
  pub size: i64,
  pub mime: String,
  pub created_at: DateTime<Utc>,
  pub source_type: String,
  pub workspace_id: String,
  pub doc_id: String,
  pub timestamp_ms: Option<i64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReadableBlobManifestPage {
  pub entries: Vec<SourceBlobManifestEntry>,
  pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadableManifestCursor {
  doc_id: String,
  key: String,
}

enum LoadedRefSource {
  Cached(BTreeSet<String>),
  Buffers {
    cache_key: BlobRefCacheKey,
    buffers: Vec<Vec<u8>>,
    is_root: bool,
  },
}

/// Extracts the sorted set of live blob keys reachable from `updates`.
///
/// For `workspace_root == true`, reads `meta["avatar"]`. For page documents,
/// locates the unique `sys:flavour == "affine:page"` root block and performs a
/// bounded BFS along `sys:children`, collecting `prop:sourceId` from
/// `"affine:attachment"` and `"affine:image"` blocks while ignoring orphan
/// blocks not mounted in the root tree.
pub fn live_blob_keys_from_updates(
  updates: Vec<Vec<u8>>,
  workspace_root: bool,
) -> Result<BTreeSet<String>, DomainError> {
  live_blob_keys_from_updates_with_limits(updates, workspace_root, BLOB_REF_READ_LIMITS)
}

fn live_blob_keys_from_updates_with_limits(
  updates: Vec<Vec<u8>>,
  workspace_root: bool,
  limits: y_octo::ReadLimits,
) -> Result<BTreeSet<String>, DomainError> {
  if updates.is_empty() {
    return Ok(BTreeSet::new());
  }
  let merged = if updates.len() == 1 {
    updates.into_iter().next().unwrap_or_default()
  } else {
    y_octo::merge_updates_v1(&updates)
      .and_then(|u| u.encode_v1())
      .map_err(|err| DomainError::Internal(format!("failed to merge document updates: {err}")))?
  };
  if merged.len() > MAX_SOURCE_BINARY_BYTES {
    return Err(DomainError::Internal("blob_ref_source_too_large".into()));
  }
  let doc = match ReadDoc::from_full_update_v1_with_limits(merged.clone(), limits.clone()) {
    Ok(doc) => doc,
    Err(y_octo::ReadError::IncompleteSnapshot(_)) => {
      let normalized = y_octo::Doc::try_from_binary_v1(&merged)
        .and_then(|doc| doc.encode_update_v1())
        .map_err(|err| DomainError::Internal(format!("invalid document binary: {err}")))?;
      ReadDoc::from_full_update_v1_with_limits(normalized, limits)
        .map_err(|err| DomainError::Internal(format!("invalid document binary: {err}")))?
    }
    Err(err) => return Err(DomainError::Internal(format!("invalid document binary: {err}"))),
  };

  let mut keys = BTreeSet::new();
  if workspace_root {
    if let Some(meta) = doc.map("meta")
      && let Some(avatar) = string_value(meta, "avatar")
      && !avatar.is_empty()
    {
      insert_key(&mut keys, avatar)?;
    }
    return Ok(keys);
  }

  let Some(blocks) = doc.map("blocks") else {
    return Ok(keys);
  };
  if blocks.len() > MAX_SOURCE_BLOCKS {
    return Err(DomainError::Internal("blob_ref_tree_too_large".into()));
  }

  let mut roots = Vec::new();
  for value in blocks.values() {
    let Some(block) = value.as_map() else {
      continue;
    };
    if string_value(block, "sys:flavour").as_deref() == Some("affine:page")
      && let Some(id) = string_value(block, "sys:id")
    {
      roots.push(id);
    }
  }
  if roots.len() != 1 {
    return Ok(keys);
  }

  let root = roots.pop().expect("one page root");
  let mut queue = VecDeque::from([root.clone()]);
  let mut discovered = HashSet::from([root]);
  while let Some(block_id) = queue.pop_front() {
    let Some(block) = blocks.get(&block_id).and_then(|value| value.as_map()) else {
      continue;
    };
    if matches!(
      string_value(block, "sys:flavour").as_deref(),
      Some("affine:attachment" | "affine:image")
    ) && let Some(key) = string_value(block, "prop:sourceId")
      && !key.is_empty()
    {
      insert_key(&mut keys, key)?;
    }
    if let Some(children) = block.get("sys:children").and_then(|value| value.as_array()) {
      if children.len() > MAX_CHILDREN_PER_BLOCK {
        return Err(DomainError::Internal("blob_ref_tree_fanout_too_large".into()));
      }
      for child in children.iter() {
        let Some(child_id) = child.as_any().and_then(|value| value.as_str()) else {
          continue;
        };
        if discovered.insert(child_id.to_owned()) {
          if discovered.len() > MAX_SOURCE_BLOCKS {
            return Err(DomainError::Internal("blob_ref_tree_too_large".into()));
          }
          queue.push_back(child_id.to_owned());
        }
      }
    }
  }
  Ok(keys)
}

fn insert_key(keys: &mut BTreeSet<String>, key: String) -> Result<(), DomainError> {
  if key.len() > MAX_BLOB_KEY_BYTES {
    return Err(DomainError::Internal("blob_ref_key_too_large".into()));
  }
  keys.insert(key);
  if keys.len() > MAX_SOURCE_REFS {
    return Err(DomainError::Internal("blob_ref_count_too_large".into()));
  }
  Ok(())
}

fn string_value(map: ReadMap<'_>, key: &str) -> Option<String> {
  match map.get(key)? {
    ReadValue::Any(value) => value.as_str().map(str::to_owned),
    ReadValue::Text(value) => Some(value.to_string()),
    _ => None,
  }
}

fn encode_cursor(doc_id: &str, key: &str) -> String {
  let payload = serde_json::to_vec(&ReadableManifestCursor {
    doc_id: doc_id.to_owned(),
    key: key.to_owned(),
  })
  .unwrap_or_default();
  URL_SAFE_NO_PAD.encode(payload)
}

fn decode_cursor(raw: &str) -> Result<ReadableManifestCursor, DomainError> {
  let bytes = URL_SAFE_NO_PAD
    .decode(raw)
    .map_err(|_| DomainError::Validation("Invalid blob manifest cursor".into()))?;
  serde_json::from_slice(&bytes).map_err(|_| DomainError::Validation("Invalid blob manifest cursor".into()))
}

impl BlobService {
  async fn load_current_doc_keys_in_tx(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    storage_doc_id: &str,
  ) -> Result<Option<BTreeSet<String>>, DomainError> {
    let loaded = self
      .load_current_doc_source_in_tx(tx, workspace_id, storage_doc_id)
      .await?;
    match loaded {
      None => Ok(None),
      Some(src) => Ok(Some(self.extract_and_cache_source(src).await?)),
    }
  }

  async fn load_current_doc_source_in_tx(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    storage_doc_id: &str,
  ) -> Result<Option<LoadedRefSource>, DomainError> {
    let snap_meta: Option<(DateTime<Utc>, i64)> = sqlx::query_as(
      "SELECT updated_at, octet_length(blob)::bigint FROM snapshots WHERE workspace_id = $1 AND guid = $2",
    )
    .bind(workspace_id)
    .bind(storage_doc_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|err| DomainError::Internal(err.to_string()))?;

    let (upd_count, upd_bytes, max_upd_ts): (i64, i64, Option<DateTime<Utc>>) = sqlx::query_as(
      "SELECT COUNT(*)::bigint,
              COALESCE(SUM(octet_length(blob)), 0)::bigint,
              MAX(created_at)
       FROM (
         SELECT blob, created_at
         FROM updates
         WHERE workspace_id = $1 AND guid = $2
         ORDER BY created_at ASC
         LIMIT $3
       ) sub",
    )
    .bind(workspace_id)
    .bind(storage_doc_id)
    .bind(MAX_SOURCE_UPDATES + 1)
    .fetch_one(&mut **tx)
    .await
    .map_err(|err| DomainError::Internal(err.to_string()))?;

    if snap_meta.is_none() && upd_count == 0 {
      return Ok(None);
    }

    let snap_bytes = snap_meta.map(|(_, len)| len).unwrap_or(0);
    let total_bytes = snap_bytes.saturating_add(upd_bytes);
    if upd_count > MAX_SOURCE_UPDATES || total_bytes as usize > MAX_SOURCE_BINARY_BYTES {
      return Err(DomainError::Internal("blob_ref_source_too_large".into()));
    }

    let stamp = format!(
      "cur:{}:{}:{}:{}:{}",
      snap_meta.map(|(ts, _)| ts.timestamp_micros()).unwrap_or(0),
      snap_bytes,
      upd_count,
      max_upd_ts.map(|ts| ts.timestamp_micros()).unwrap_or(0),
      upd_bytes,
    );
    let cache_key = BlobRefCacheKey {
      workspace_id: workspace_id.to_owned(),
      doc_id: storage_doc_id.to_owned(),
      source_stamp: stamp,
    };
    if let Ok(mut cache) = self.ref_cache.lock()
      && let Some(hit) = cache.get(&cache_key)
    {
      return Ok(Some(LoadedRefSource::Cached(hit)));
    }

    let snapshot: Option<Vec<u8>> =
      sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $2")
        .bind(workspace_id)
        .bind(storage_doc_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|err| DomainError::Internal(err.to_string()))?;

    let updates: Vec<Vec<u8>> =
      sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC")
        .bind(workspace_id)
        .bind(storage_doc_id)
        .fetch_all(&mut **tx)
        .await
        .map_err(|err| DomainError::Internal(err.to_string()))?;

    let mut buffers = Vec::with_capacity(updates.len() + usize::from(snapshot.is_some()));
    if let Some(snap) = snapshot
      && !snap.is_empty()
    {
      buffers.push(snap);
    }
    for upd in updates {
      if !upd.is_empty() {
        buffers.push(upd);
      }
    }
    if buffers.is_empty() {
      return Ok(None);
    }

    Ok(Some(LoadedRefSource::Buffers {
      cache_key,
      buffers,
      is_root: storage_doc_id == workspace_id,
    }))
  }

  async fn load_history_doc_source_in_tx(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    storage_doc_id: &str,
    timestamp_ms: i64,
  ) -> Result<Option<LoadedRefSource>, DomainError> {
    let Some(ts) = DateTime::<Utc>::from_timestamp_millis(timestamp_ms) else {
      return Err(DomainError::Validation("Invalid history timestamp.".into()));
    };

    let hist_len: Option<i64> = sqlx::query_scalar(
      "SELECT octet_length(blob)::bigint
       FROM snapshot_histories
       WHERE workspace_id = $1 AND guid = $2 AND timestamp = $3",
    )
    .bind(workspace_id)
    .bind(storage_doc_id)
    .bind(ts)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|err| DomainError::Internal(err.to_string()))?;

    let Some(hist_len) = hist_len else {
      return Ok(None);
    };
    if hist_len as usize > MAX_SOURCE_BINARY_BYTES {
      return Err(DomainError::Internal("blob_ref_source_too_large".into()));
    }

    let cache_key = BlobRefCacheKey {
      workspace_id: workspace_id.to_owned(),
      doc_id: storage_doc_id.to_owned(),
      source_stamp: format!("hist:{timestamp_ms}:{hist_len}"),
    };
    if let Ok(mut cache) = self.ref_cache.lock()
      && let Some(hit) = cache.get(&cache_key)
    {
      return Ok(Some(LoadedRefSource::Cached(hit)));
    }

    let blob: Option<Vec<u8>> = sqlx::query_scalar(
      "SELECT blob FROM snapshot_histories WHERE workspace_id = $1 AND guid = $2 AND timestamp = $3",
    )
    .bind(workspace_id)
    .bind(storage_doc_id)
    .bind(ts)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|err| DomainError::Internal(err.to_string()))?;

    let Some(bytes) = blob.filter(|b| !b.is_empty()) else {
      return Ok(None);
    };
    Ok(Some(LoadedRefSource::Buffers {
      cache_key,
      buffers: vec![bytes],
      is_root: storage_doc_id == workspace_id,
    }))
  }

  async fn extract_and_cache_source(&self, source: LoadedRefSource) -> Result<BTreeSet<String>, DomainError> {
    match source {
      LoadedRefSource::Cached(keys) => Ok(keys),
      LoadedRefSource::Buffers {
        cache_key,
        buffers,
        is_root,
      } => {
        let keys = tokio::task::spawn_blocking(move || live_blob_keys_from_updates(buffers, is_root))
          .await
          .map_err(|err| DomainError::Internal(format!("blob ref extraction task failed: {err}")))??;
        if let Ok(mut cache) = self.ref_cache.lock() {
          cache.put(cache_key, keys.clone());
        }
        Ok(keys)
      }
    }
  }

  /// Authorizes the actor for `doc_id` and extracts reachable blob keys inside
  /// a single `REPEATABLE READ READ ONLY` transaction.
  ///
  /// - Workspace root (`storage_doc_id == workspace_id`): requires `Workspace.Read`.
  /// - `sourceType == "currentDoc"`: requires `Doc.Read`.
  /// - `sourceType == "history"`: requires `Doc.HistoryRead` (`active_member && doc_read`).
  pub async fn load_source_blob_keys(
    &self,
    workspace_id: &str,
    source_type: &str,
    doc_id: &str,
    timestamp_ms: Option<i64>,
    actor_user_id: Option<&str>,
  ) -> Result<Option<BTreeSet<String>>, DomainError> {
    if !matches!(source_type, "currentDoc" | "history") {
      return Err(DomainError::Validation("Invalid blob source".into()));
    }
    if source_type == "history" && timestamp_ms.and_then(DateTime::<Utc>::from_timestamp_millis).is_none() {
      return Err(DomainError::Validation("Invalid history timestamp.".into()));
    }

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|err| DomainError::Internal(err.to_string()))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|err| DomainError::Internal(err.to_string()))?;

    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|err| DomainError::Internal(err.to_string()))?;

    let acl = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota.as_ref(),
      workspace_id,
      actor_user_id,
      &[doc_id.to_owned()],
      now,
    )
    .await?;

    let entry = acl
      .docs
      .get(doc_id)
      .ok_or_else(|| DomainError::Internal("missing doc acl entry".into()))?;
    if entry.deleted {
      let _ = tx.rollback().await;
      return Ok(None);
    }

    let is_root = entry.storage_doc_id == workspace_id;
    let allowed = match source_type {
      "currentDoc" => {
        if is_root {
          acl.workspace_permissions.read
        } else {
          entry.permissions.doc_read
        }
      }
      "history" => {
        if is_root {
          acl.assigned_role.is_some() && acl.workspace_permissions.read
        } else {
          entry.permissions.doc_history_read
        }
      }
      _ => false,
    };
    if !allowed {
      let _ = tx.rollback().await;
      return if actor_user_id.is_none() {
        Err(DomainError::Unauthorized("Authentication required".into()))
      } else {
        Err(DomainError::Forbidden("Document access denied".into()))
      };
    }

    let storage_doc_id = entry.storage_doc_id.clone();
    let loaded = match source_type {
      "currentDoc" => {
        self
          .load_current_doc_source_in_tx(tx.tx_mut(), workspace_id, &storage_doc_id)
          .await?
      }
      "history" => {
        let ts = timestamp_ms.expect("validated timestamp");
        self
          .load_history_doc_source_in_tx(tx.tx_mut(), workspace_id, &storage_doc_id, ts)
          .await?
      }
      _ => unreachable!(),
    };
    // Release the read-only DB transaction before CPU-bound Yjs merging.
    let _ = tx.rollback().await;
    match loaded {
      None => Ok(None),
      Some(src) => Ok(Some(self.extract_and_cache_source(src).await?)),
    }
  }

  /// Reads a blob only when `key` is reachable from the authorized document source.
  pub async fn get_source_scoped_blob(
    &self,
    workspace_id: &str,
    source_type: &str,
    doc_id: &str,
    timestamp_ms: Option<i64>,
    actor_user_id: Option<&str>,
    key: &str,
  ) -> Result<Option<(BlobRecord, Vec<u8>)>, DomainError> {
    let Some(keys) = self
      .load_source_blob_keys(workspace_id, source_type, doc_id, timestamp_ms, actor_user_id)
      .await?
    else {
      return Ok(None);
    };
    if !keys.contains(key) {
      return Ok(None);
    }
    self.get_blob(workspace_id, key).await
  }

  /// Returns the intersection of live workspace blobs and keys reachable from
  /// the requested document source.
  pub async fn get_doc_blob_manifest(
    &self,
    workspace_id: &str,
    source_type: &str,
    doc_id: &str,
    timestamp_ms: Option<i64>,
    actor_user_id: Option<&str>,
  ) -> Result<Vec<SourceBlobManifestEntry>, DomainError> {
    let Some(keys) = self
      .load_source_blob_keys(workspace_id, source_type, doc_id, timestamp_ms, actor_user_id)
      .await?
    else {
      return Ok(Vec::new());
    };
    if keys.is_empty() {
      return Ok(Vec::new());
    }
    let key_vec: Vec<String> = keys.into_iter().collect();
    let blobs = self.list_live_blobs_by_keys(workspace_id, &key_vec).await?;
    Ok(
      blobs
        .into_iter()
        .map(|b| SourceBlobManifestEntry {
          key: b.key,
          size: b.size,
          mime: b.mime,
          created_at: b.created_at,
          source_type: source_type.to_owned(),
          workspace_id: workspace_id.to_owned(),
          doc_id: doc_id.to_owned(),
          timestamp_ms,
        })
        .collect(),
    )
  }

  /// Paginates all live blobs reachable from readable, non-deleted documents in
  /// `workspace_id`, enforcing `Workspace.Sync`, SQL cursor pushdown, reserved
  /// doc classification (`db$<ws>$...` allowed, foreign private docs blocked),
  /// and batch `Doc.Read` filtering.
  pub async fn get_readable_blob_manifest(
    &self,
    workspace_id: &str,
    actor_user_id: &str,
    cursor: Option<&str>,
    limit: usize,
  ) -> Result<ReadableBlobManifestPage, DomainError> {
    let decoded_cursor = match cursor.filter(|c| !c.is_empty()) {
      Some(raw) => Some(decode_cursor(raw)?),
      None => None,
    };
    let cursor_doc_id = decoded_cursor.as_ref().map(|c| c.doc_id.as_str());
    let page_limit = limit.clamp(1, 100);

    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|err| DomainError::Internal(err.to_string()))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(|err| DomainError::Internal(err.to_string()))?;

    let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(|err| DomainError::Internal(err.to_string()))?;

    let ws_acl = load_workspace_docs_access_in(
      tx.tx_mut(),
      self.quota.as_ref(),
      workspace_id,
      Some(actor_user_id),
      &[],
      now,
    )
    .await?;
    if !ws_acl.workspace_permissions.sync {
      let _ = tx.rollback().await;
      return Err(DomainError::Forbidden("Workspace sync access denied".into()));
    }

    let candidate_docs: Vec<String> = sqlx::query_scalar(
      "SELECT d.guid
       FROM (
         SELECT guid FROM snapshots WHERE workspace_id = $1
         UNION
         SELECT guid FROM updates WHERE workspace_id = $1
       ) d
       WHERE ($2::text IS NULL OR d.guid >= $2)
         AND NOT EXISTS (
           SELECT 1 FROM workspace_pages wp
           WHERE wp.workspace_id = $1
             AND wp.page_id = d.guid
             AND wp.lifecycle_state = 'deleted'
         )
       ORDER BY d.guid ASC",
    )
    .bind(workspace_id)
    .bind(cursor_doc_id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(|err| DomainError::Internal(err.to_string()))?;

    let mut entries = Vec::with_capacity(page_limit + 1);

    for chunk in candidate_docs.chunks(200) {
      let filtered_reserved: Vec<String> = chunk
        .iter()
        .filter(|doc_id| authorize_reserved_doc(workspace_id, doc_id, Some(actor_user_id)))
        .cloned()
        .collect();
      if filtered_reserved.is_empty() {
        continue;
      }

      let chunk_acl = load_workspace_docs_access_in(
        tx.tx_mut(),
        self.quota.as_ref(),
        workspace_id,
        Some(actor_user_id),
        &filtered_reserved,
        now,
      )
      .await?;

      for doc_id in filtered_reserved {
        let Some(entry) = chunk_acl.docs.get(&doc_id) else {
          continue;
        };
        let is_root = entry.storage_doc_id == workspace_id;
        let can_read = if is_root {
          chunk_acl.workspace_permissions.read
        } else {
          !entry.deleted && entry.permissions.doc_read
        };
        if !can_read {
          continue;
        }

        let Some(keys) = self
          .load_current_doc_keys_in_tx(tx.tx_mut(), workspace_id, &entry.storage_doc_id)
          .await?
        else {
          continue;
        };
        if keys.is_empty() {
          continue;
        }

        let key_vec: Vec<String> = keys.into_iter().collect();
        let after_key = match &decoded_cursor {
          Some(cur) if doc_id == cur.doc_id => Some(cur.key.as_str()),
          _ => None,
        };
        let remaining = (page_limit + 1).saturating_sub(entries.len()) as i64;
        let blobs =
          list_live_blobs_by_keys_in_tx(tx.tx_mut(), workspace_id, &key_vec, after_key, Some(remaining)).await?;
        for b in blobs {
          entries.push(SourceBlobManifestEntry {
            key: b.key,
            size: b.size,
            mime: b.mime,
            created_at: b.created_at,
            source_type: "currentDoc".to_owned(),
            workspace_id: workspace_id.to_owned(),
            doc_id: doc_id.clone(),
            timestamp_ms: None,
          });
          if entries.len() > page_limit {
            break;
          }
        }
        if entries.len() > page_limit {
          break;
        }
      }
      if entries.len() > page_limit {
        break;
      }
    }

    let _ = tx.rollback().await;

    let next_cursor = if entries.len() > page_limit {
      entries.truncate(page_limit);
      entries.last().map(|last| encode_cursor(&last.doc_id, &last.key))
    } else {
      None
    };

    Ok(ReadableBlobManifestPage { entries, next_cursor })
  }

  async fn list_live_blobs_by_keys(&self, workspace_id: &str, keys: &[String]) -> Result<Vec<BlobRecord>, DomainError> {
    if keys.is_empty() {
      return Ok(Vec::new());
    }
    let mut tx = self
      .db
      .begin_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(|err| DomainError::Internal(err.to_string()))?;
    let res = list_live_blobs_by_keys_in_tx(tx.tx_mut(), workspace_id, keys, None, None).await;
    let _ = tx.rollback().await;
    res
  }
}

async fn list_live_blobs_by_keys_in_tx(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  keys: &[String],
  after_key: Option<&str>,
  limit: Option<i64>,
) -> Result<Vec<BlobRecord>, DomainError> {
  if keys.is_empty() {
    return Ok(Vec::new());
  }
  let rows: Vec<(String, i32, String, DateTime<Utc>)> = sqlx::query_as(
    "SELECT key, size, mime, created_at
     FROM blobs
     WHERE workspace_id = $1
       AND key = ANY($2)
       AND ($3::text IS NULL OR key > $3)
       AND status = 'completed'
       AND deleted_at IS NULL
     ORDER BY key ASC
     LIMIT $4",
  )
  .bind(workspace_id)
  .bind(keys)
  .bind(after_key)
  .bind(limit)
  .fetch_all(&mut **tx)
  .await
  .map_err(|err| DomainError::Internal(err.to_string()))?;

  Ok(
    rows
      .into_iter()
      .map(|(key, size, mime, created_at)| BlobRecord {
        workspace_id: workspace_id.to_owned(),
        key,
        size: i64::from(size),
        mime,
        created_at,
      })
      .collect(),
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  fn push_varuint(buf: &mut Vec<u8>, mut v: u64) {
    while v >= 0x80 {
      buf.push(((v as u8) & 0x7f) | 0x80);
      v >>= 7;
    }
    buf.push(v as u8);
  }

  fn push_varstring(buf: &mut Vec<u8>, s: &str) {
    push_varuint(buf, s.len() as u64);
    buf.extend_from_slice(s.as_bytes());
  }

  fn synthetic_deleted_zero_len_string_update(client: u64) -> Vec<u8> {
    let mut buf = Vec::new();
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, 4);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0);
    buf.push(0x07);
    buf.push(0x01);
    push_varstring(&mut buf, "legacy_zero_str");
    push_varuint(&mut buf, 2);
    buf.push(0x04);
    buf.push(0x00);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0);
    push_varstring(&mut buf, "a");
    buf.push(0x84);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 1);
    push_varstring(&mut buf, "");
    buf.push(0x04);
    buf.push(0x00);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0);
    push_varstring(&mut buf, "b");
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, 2);
    buf
  }

  fn synthetic_zero_len_deleted_update(client: u64) -> Vec<u8> {
    let mut buf = Vec::new();
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, 3);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0);
    buf.push(0x07);
    buf.push(0x01);
    push_varstring(&mut buf, "legacy_zero_del");
    push_varuint(&mut buf, 2);
    buf.push(0x04);
    buf.push(0x00);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 0);
    push_varstring(&mut buf, "x");
    buf.push(0x81);
    push_varuint(&mut buf, client);
    push_varuint(&mut buf, 1);
    push_varuint(&mut buf, 0);
    push_varuint(&mut buf, 0);
    buf
  }

  #[test]
  fn live_blob_keys_recover_across_zero_len_deleted_frames_and_incremental_edits() {
    let doc = y_octo::Doc::with_client(201);
    let mut blocks = doc.get_or_create_map("blocks").unwrap();

    let mut page = doc.create_map().unwrap();
    page
      .insert("sys:id".to_owned(), y_octo::Any::String("page-1".into()))
      .unwrap();
    page
      .insert("sys:flavour".to_owned(), y_octo::Any::String("affine:page".into()))
      .unwrap();
    let mut page_children = doc.create_array().unwrap();
    page_children.push(y_octo::Any::String("img-1".into())).unwrap();
    page.insert("sys:children".to_owned(), page_children).unwrap();
    blocks.insert("page-1".to_owned(), page).unwrap();

    let mut img = doc.create_map().unwrap();
    img
      .insert("sys:id".to_owned(), y_octo::Any::String("img-1".into()))
      .unwrap();
    img
      .insert("sys:flavour".to_owned(), y_octo::Any::String("affine:image".into()))
      .unwrap();
    img
      .insert("prop:sourceId".to_owned(), y_octo::Any::String("blob-img-1".into()))
      .unwrap();
    blocks.insert("img-1".to_owned(), img).unwrap();

    let base_snap = doc.encode_update_v1().unwrap();
    let sv = doc.get_state_vector();

    // Incremental update mounting an attachment block.
    let mut att = doc.create_map().unwrap();
    att
      .insert("sys:id".to_owned(), y_octo::Any::String("att-1".into()))
      .unwrap();
    att
      .insert(
        "sys:flavour".to_owned(),
        y_octo::Any::String("affine:attachment".into()),
      )
      .unwrap();
    att
      .insert("prop:sourceId".to_owned(), y_octo::Any::String("blob-att-1".into()))
      .unwrap();
    blocks.insert("att-1".to_owned(), att).unwrap();
    if let Some(y_octo::Value::Map(p)) = blocks.get("page-1")
      && let Some(y_octo::Value::Array(mut children)) = p.get("sys:children")
    {
      children.push(y_octo::Any::String("att-1".into())).unwrap();
    }
    let inc_update = doc.encode_state_as_update_v1(&sv).unwrap();

    let keys = live_blob_keys_from_updates(
      vec![
        synthetic_deleted_zero_len_string_update(900_011),
        synthetic_zero_len_deleted_update(900_012),
        base_snap,
        inc_update,
      ],
      false,
    )
    .expect("live_blob_keys_from_updates must succeed");
    assert_eq!(keys, BTreeSet::from(["blob-att-1".to_owned(), "blob-img-1".to_owned()]));
  }

  #[test]
  fn live_blob_keys_enforces_resource_limit_without_unbounded_fallback() {
    let doc = y_octo::Doc::with_client(202);
    let mut meta = doc.get_or_create_map("meta").unwrap();
    meta
      .insert("avatar".to_owned(), y_octo::Any::String("avatar-1".into()))
      .unwrap();
    meta
      .insert("name".to_owned(), y_octo::Any::String("workspace-1".into()))
      .unwrap();
    let bin = doc.encode_update_v1().unwrap();

    let tiny_limits = y_octo::ReadLimits {
      max_structs: 1,
      ..BLOB_REF_READ_LIMITS
    };
    let err = live_blob_keys_from_updates_with_limits(vec![bin], true, tiny_limits)
      .expect_err("exceeding ReadLimits must return error without unbounded fallback");
    assert!(
      matches!(err, DomainError::Internal(ref msg) if msg.contains("invalid document binary")),
      "expected resource limit error, got {err:?}"
    );
  }
}
