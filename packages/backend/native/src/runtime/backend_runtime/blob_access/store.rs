use affine_doc_loader::blob_refs::{MAX_SOURCE_BINARY_BYTES, MAX_SOURCE_UPDATES, page_workspace_doc_ids};
use chrono::{DateTime, Utc};
use futures_util::TryStreamExt;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction};
use y_octo::Doc;

use super::{
  SourceIdentity,
  types::{LoadedSource, ManifestEntry},
};
use crate::runtime::{RuntimeError, RuntimeResult, blob_ref_projection_error_code};

pub(super) struct BlobAccessStore {
  pool: PgPool,
}

impl BlobAccessStore {
  pub(super) fn new(pool: PgPool) -> Self {
    Self { pool }
  }

  pub(super) async fn begin_snapshot(&self) -> RuntimeResult<Transaction<'_, Postgres>> {
    let mut transaction = self
      .pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin blob authorization snapshot", error))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("configure blob authorization snapshot", error))?;
    Ok(transaction)
  }

  pub(super) async fn load_source(
    transaction: &mut Transaction<'_, Postgres>,
    source: &SourceIdentity,
  ) -> RuntimeResult<LoadedSource> {
    match source {
      SourceIdentity::CurrentDoc { workspace_id, doc_id } => {
        load_current(transaction, workspace_id, doc_id, source.clone()).await
      }
      SourceIdentity::History {
        workspace_id,
        doc_id,
        timestamp_ms,
      } => load_history(transaction, workspace_id, doc_id, *timestamp_ms, source.clone()).await,
    }
  }

  pub(super) async fn load_stamp(
    transaction: &mut Transaction<'_, Postgres>,
    source: &SourceIdentity,
  ) -> RuntimeResult<String> {
    match source {
      SourceIdentity::CurrentDoc { workspace_id, doc_id } => current_stamp(transaction, workspace_id, doc_id).await,
      SourceIdentity::History {
        workspace_id,
        doc_id,
        timestamp_ms,
      } => history_stamp(transaction, workspace_id, doc_id, *timestamp_ms).await,
    }
  }

  pub(super) async fn live_metadata(
    transaction: &mut Transaction<'_, Postgres>,
    source: &SourceIdentity,
    keys: &[String],
    after_key: Option<&str>,
    limit: Option<i64>,
  ) -> RuntimeResult<Vec<ManifestEntry>> {
    if keys.is_empty() {
      return Ok(Vec::new());
    }
    let rows = sqlx::query(
      r#"SELECT key,mime,size FROM blobs
         WHERE workspace_id=$1 AND key=ANY($2) AND status='completed' AND deleted_at IS NULL
           AND ($3::text IS NULL OR key > $3)
         ORDER BY key
         LIMIT $4"#,
    )
    .bind(source.workspace_id())
    .bind(keys)
    .bind(after_key)
    .bind(limit)
    .fetch_all(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("load live blob ledger metadata", error))?;
    rows
      .into_iter()
      .map(|row| {
        Ok(ManifestEntry {
          key: row
            .try_get("key")
            .map_err(|error| RuntimeError::database("decode live blob key", error))?,
          mime: row
            .try_get("mime")
            .map_err(|error| RuntimeError::database("decode live blob mime", error))?,
          size: row
            .try_get::<i32, _>("size")
            .map(i64::from)
            .map_err(|error| RuntimeError::database("decode live blob size", error))?,
          source: source.clone(),
        })
      })
      .collect()
  }

  pub(super) async fn page_doc_ids(
    transaction: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    cursor: Option<&str>,
    include_cursor: bool,
    limit: i64,
  ) -> RuntimeResult<Vec<String>> {
    let identity = SourceIdentity::CurrentDoc {
      workspace_id: workspace_id.to_string(),
      doc_id: workspace_id.to_string(),
    };
    let root = Self::load_source(transaction, &identity).await?;
    let limit = usize::try_from(limit).map_err(|_| RuntimeError::invalid_input("blob_page_limit_invalid"))?;
    page_workspace_doc_ids(root.blob, workspace_id, cursor, include_cursor, limit)
      .map_err(|error| RuntimeError::invalid_state(blob_ref_projection_error_code(error)))
  }
}

async fn load_current(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  identity: SourceIdentity,
) -> RuntimeResult<LoadedSource> {
  let mut source_bytes =
    sqlx::query_scalar::<_, i32>("SELECT octet_length(blob) FROM snapshots WHERE workspace_id=$1 AND guid=$2")
      .bind(workspace_id)
      .bind(doc_id)
      .fetch_optional(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database("load current blob snapshot admission", error))?
      .map(i64::from)
      .unwrap_or_default();
  if source_bytes > i64::try_from(MAX_SOURCE_BINARY_BYTES).expect("source admission fits i64") {
    return Err(RuntimeError::invalid_state("blob_ref_source_too_large"));
  }
  let mut admission_rows = sqlx::query(
    "SELECT octet_length(blob)::bigint source_bytes FROM updates WHERE workspace_id=$1 AND guid=$2 ORDER BY \
     created_at LIMIT $3",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(MAX_SOURCE_UPDATES + 1)
  .fetch(&mut **transaction);
  let mut update_count = 0_i64;
  while let Some(row) = admission_rows
    .try_next()
    .await
    .map_err(|error| RuntimeError::database("load current blob source admission", error))?
  {
    update_count += 1;
    if update_count > MAX_SOURCE_UPDATES {
      return Err(RuntimeError::invalid_state("blob_source_update_count_too_large"));
    }
    let bytes: i64 = row
      .try_get("source_bytes")
      .map_err(|error| RuntimeError::database("decode current blob source size", error))?;
    source_bytes = source_bytes
      .checked_add(bytes)
      .ok_or_else(|| RuntimeError::invalid_state("blob_ref_source_too_large"))?;
    if source_bytes > i64::try_from(MAX_SOURCE_BINARY_BYTES).expect("source admission fits i64") {
      return Err(RuntimeError::invalid_state("blob_ref_source_too_large"));
    }
  }
  drop(admission_rows);
  let snapshot =
    sqlx::query("SELECT blob,updated_at::text source_time FROM snapshots WHERE workspace_id=$1 AND guid=$2")
      .bind(workspace_id)
      .bind(doc_id)
      .fetch_optional(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database("load current blob source snapshot", error))?;
  let updates = sqlx::query(
    "SELECT blob,created_at::text source_time FROM updates WHERE workspace_id=$1 AND guid=$2 ORDER BY created_at",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_all(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load current blob source updates", error))?;
  if snapshot.is_none() && updates.is_empty() {
    return Err(RuntimeError::invalid_input("blob_source_not_found"));
  }
  let mut source_times = Vec::with_capacity(updates.len() + usize::from(snapshot.is_some()));
  let mut doc = Doc::default();
  if let Some(snapshot) = snapshot {
    let blob: Vec<u8> = snapshot
      .try_get("blob")
      .map_err(|error| RuntimeError::database("decode current blob source snapshot", error))?;
    source_times.push(
      snapshot
        .try_get("source_time")
        .map_err(|error| RuntimeError::database("decode current blob source timestamp", error))?,
    );
    doc
      .apply_update_from_binary_v1(&blob)
      .map_err(|_| RuntimeError::invalid_state("blob_source_parse_failed"))?;
  }
  for update in updates {
    let blob: Vec<u8> = update
      .try_get("blob")
      .map_err(|error| RuntimeError::database("decode current blob source update", error))?;
    source_times.push(
      update
        .try_get("source_time")
        .map_err(|error| RuntimeError::database("decode current blob update timestamp", error))?,
    );
    doc
      .apply_update_from_binary_v1(&blob)
      .map_err(|_| RuntimeError::invalid_state("blob_source_parse_failed"))?;
  }
  let blob = doc
    .encode_update_v1()
    .map_err(|_| RuntimeError::invalid_state("blob_source_parse_failed"))?;
  if blob.len() > MAX_SOURCE_BINARY_BYTES {
    return Err(RuntimeError::invalid_state("blob_ref_source_too_large"));
  }
  Ok(LoadedSource {
    identity,
    stamp: stamp(source_times.iter().map(String::as_str)),
    blob,
  })
}

async fn load_history(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  timestamp_ms: i64,
  identity: SourceIdentity,
) -> RuntimeResult<LoadedSource> {
  let timestamp = DateTime::<Utc>::from_timestamp_millis(timestamp_ms)
    .ok_or_else(|| RuntimeError::invalid_input("blob_history_timestamp_invalid"))?;
  let source_bytes = sqlx::query_scalar::<_, i32>(
    "SELECT octet_length(blob) FROM snapshot_histories WHERE workspace_id=$1 AND guid=$2 AND timestamp=$3",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(timestamp)
  .fetch_optional(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load history blob source admission", error))?
  .ok_or_else(|| RuntimeError::invalid_input("blob_source_not_found"))?;
  if usize::try_from(source_bytes).unwrap_or(usize::MAX) > MAX_SOURCE_BINARY_BYTES {
    return Err(RuntimeError::invalid_state("blob_ref_source_too_large"));
  }
  let row = sqlx::query(
    "SELECT blob,timestamp::text source_time FROM snapshot_histories WHERE workspace_id=$1 AND guid=$2 AND \
     timestamp=$3",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(timestamp)
  .fetch_optional(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load history blob source", error))?
  .ok_or_else(|| RuntimeError::invalid_input("blob_source_not_found"))?;
  let blob: Vec<u8> = row
    .try_get("blob")
    .map_err(|error| RuntimeError::database("decode history blob source", error))?;
  let source_time: String = row
    .try_get("source_time")
    .map_err(|error| RuntimeError::database("decode history blob source timestamp", error))?;
  Ok(LoadedSource {
    identity,
    stamp: stamp([source_time.as_str()]),
    blob,
  })
}

async fn current_stamp(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<String> {
  let snapshot: Option<String> =
    sqlx::query_scalar("SELECT updated_at::text FROM snapshots WHERE workspace_id=$1 AND guid=$2")
      .bind(workspace_id)
      .bind(doc_id)
      .fetch_optional(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database("load current blob source stamp", error))?;
  let updates: Vec<String> = sqlx::query_scalar(
    "SELECT created_at::text FROM updates WHERE workspace_id=$1 AND guid=$2 ORDER BY created_at LIMIT $3",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(MAX_SOURCE_UPDATES + 1)
  .fetch_all(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load current blob update stamps", error))?;
  if updates.len() > usize::try_from(MAX_SOURCE_UPDATES).expect("source update cap fits usize") {
    return Err(RuntimeError::invalid_state("blob_source_update_count_too_large"));
  }
  if snapshot.is_none() && updates.is_empty() {
    return Err(RuntimeError::invalid_input("blob_source_not_found"));
  }
  Ok(stamp(
    snapshot
      .iter()
      .map(String::as_str)
      .chain(updates.iter().map(String::as_str)),
  ))
}

async fn history_stamp(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  timestamp_ms: i64,
) -> RuntimeResult<String> {
  let timestamp = DateTime::<Utc>::from_timestamp_millis(timestamp_ms)
    .ok_or_else(|| RuntimeError::invalid_input("blob_history_timestamp_invalid"))?;
  let source_time: String = sqlx::query_scalar(
    "SELECT timestamp::text FROM snapshot_histories WHERE workspace_id=$1 AND guid=$2 AND timestamp=$3",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .bind(timestamp)
  .fetch_optional(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load history blob source stamp", error))?
  .ok_or_else(|| RuntimeError::invalid_input("blob_source_not_found"))?;
  Ok(stamp([source_time.as_str()]))
}

fn stamp<'a>(source_times: impl IntoIterator<Item = &'a str>) -> String {
  let mut digest = Sha256::new();
  for source_time in source_times {
    digest.update((source_time.len() as u64).to_be_bytes());
    digest.update(source_time.as_bytes());
  }
  hex::encode(digest.finalize())
}
