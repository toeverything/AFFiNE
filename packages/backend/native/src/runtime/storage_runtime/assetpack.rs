use std::{
  io::{BufReader, Cursor},
  path::PathBuf,
  time::SystemTime,
};

use assetpack_core::{
  Codec, FileHint, FileTransformConfig, Hash32, ObjectKind, Pipeline, PipelineConfig, SqliteStore, TransformRegistry,
  TransformSelector, build_recipe, pack::ObjectRecord, parse_recipe_checked,
};
use sqlx::Row;

use super::{
  FsStorageConfig, MAX_BLOB_SIZE, ObjectGetResult, ObjectListEntry, ObjectMetadata, ObjectPutMetadata, RuntimeError,
  RuntimeResult, fs_bucket_path, normalize_storage_key, system_time_ms,
};

pub(super) async fn put(
  config: &FsStorageConfig,
  scope: &str,
  key: &str,
  body: Vec<u8>,
  metadata: ObjectPutMetadata,
) -> RuntimeResult<ObjectMetadata> {
  normalize_storage_key(key)?;
  let metadata = metadata.complete_for_body(&body);
  let content_length = metadata.content_length.unwrap_or(body.len() as i64);
  if content_length != body.len() as i64 {
    return Err(RuntimeError::invalid_input(
      "Assetpack contentLength does not match body length",
    ));
  }
  if !(0..=MAX_BLOB_SIZE).contains(&content_length) {
    return Err(RuntimeError::invalid_input(
      "Assetpack contentLength exceeds supported blob size",
    ));
  }

  let store = open_store(config).await?;
  let transform_config = FileTransformConfig::default();
  let bucket_path = fs_bucket_path(config);
  let selector = TransformSelector::new(
    transform_config.clone(),
    transform_config.resolved_temp_dir(&bucket_path),
    assetpack_transform_precomp2::default_specs(),
  );
  let original_hash = Hash32::sha3_256(&body);
  let hint = FileHint {
    size: body.len() as u64,
    extension: extension_from_key(key),
    head: Some(body.iter().take(4096).copied().collect()),
  };
  let plan = Pipeline::new(PipelineConfig::default())
    .run(body, &hint, original_hash, Some(&selector))
    .map_err(|err| RuntimeError::invalid_state(format!("Assetpack pipeline failed: {err}")))?;

  let chunks = plan
    .chunks
    .iter()
    .map(|chunk| (chunk.hash, chunk.raw_len))
    .collect::<Vec<_>>();
  let recipe = build_recipe(
    plan.original_size,
    &chunks,
    plan.original_hash,
    plan.transform_id,
    plan.transform_version,
  );
  let recipe_hash = Hash32::sha3_256(&recipe);

  let mut objects = Vec::with_capacity(plan.chunks.len() + 1);
  for chunk in plan.chunks {
    let Some(payload) = chunk.payload else {
      return Err(RuntimeError::invalid_state(
        "Assetpack pipeline unexpectedly discarded chunk payload",
      ));
    };
    objects.push(ObjectRecord {
      hash: chunk.hash,
      kind: ObjectKind::Chunk,
      size: chunk.raw_len as u64,
      codec: chunk.codec,
      content: payload,
    });
  }
  objects.push(ObjectRecord {
    hash: recipe_hash,
    kind: ObjectKind::Recipe,
    size: recipe.len() as u64,
    codec: Codec::Raw,
    content: recipe,
  });

  let mut tx = store
    .begin_write_tx()
    .await
    .map_err(|err| RuntimeError::invalid_state(format!("Assetpack begin write failed: {err}")))?;
  store
    .put_objects_batch_tx(&mut tx, &objects)
    .await
    .map_err(|err| RuntimeError::invalid_state(format!("Assetpack object write failed: {err}")))?;
  store
    .put_file_recipe_cache_batch_tx(&mut tx, &[(original_hash, recipe_hash)])
    .await
    .map_err(|err| RuntimeError::invalid_state(format!("Assetpack recipe cache write failed: {err}")))?;
  let object_metadata = ObjectMetadata {
    content_type: metadata
      .content_type
      .unwrap_or_else(|| "application/octet-stream".to_string()),
    content_length,
    last_modified_ms: system_time_ms(SystemTime::now())?,
    checksum_crc32: metadata.checksum_crc32,
  };

  sqlx::query(
    r#"
    INSERT INTO storage_assetpack_blobs
      (scope, key, recipe_hash, content_type, content_length, checksum_crc32, last_modified_ms)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT (scope, key)
    DO UPDATE SET
      recipe_hash = excluded.recipe_hash,
      content_type = excluded.content_type,
      content_length = excluded.content_length,
      checksum_crc32 = excluded.checksum_crc32,
      last_modified_ms = excluded.last_modified_ms
    "#,
  )
  .bind(scope)
  .bind(key)
  .bind(recipe_hash.to_hex())
  .bind(&object_metadata.content_type)
  .bind(object_metadata.content_length)
  .bind(&object_metadata.checksum_crc32)
  .bind(object_metadata.last_modified_ms)
  .execute(&mut *tx)
  .await
  .map_err(|err| RuntimeError::database("Assetpack manifest write failed", err))?;
  tx.commit()
    .await
    .map_err(|err| RuntimeError::invalid_state(format!("Assetpack commit failed: {err}")))?;

  Ok(object_metadata)
}

pub(super) async fn head(config: &FsStorageConfig, scope: &str, key: &str) -> RuntimeResult<Option<ObjectMetadata>> {
  normalize_storage_key(key)?;
  let store = open_store(config).await?;
  manifest_row(&store, scope, key)
    .await
    .map(|row| row.map(|row| row.metadata))
}

pub(super) async fn get(config: &FsStorageConfig, scope: &str, key: &str) -> RuntimeResult<Option<ObjectGetResult>> {
  normalize_storage_key(key)?;
  let store = open_store(config).await?;
  let Some(row) = manifest_row(&store, scope, key).await? else {
    return Ok(None);
  };
  let recipe_hash = Hash32::from_hex(&row.recipe_hash)
    .map_err(|err| RuntimeError::invalid_state(format!("Assetpack manifest recipe hash is invalid: {err}")))?;
  let Some(recipe_object) = store
    .get_object(&recipe_hash)
    .await
    .map_err(|err| RuntimeError::invalid_state(format!("Assetpack recipe read failed: {err}")))?
  else {
    return Err(RuntimeError::invalid_state(format!(
      "Assetpack recipe object is missing for {key}"
    )));
  };
  let recipe = parse_recipe_checked(&recipe_object.content, &recipe_hash)
    .map_err(|err| RuntimeError::invalid_state(format!("Assetpack recipe parse failed: {err}")))?;

  let mut stored_stream = Vec::with_capacity(recipe.stored_stream_size as usize);
  for (chunk_hash, expected_len) in &recipe.chunks {
    let Some(chunk) = store
      .get_object(chunk_hash)
      .await
      .map_err(|err| RuntimeError::invalid_state(format!("Assetpack chunk read failed: {err}")))?
    else {
      return Err(RuntimeError::invalid_state(format!(
        "Assetpack chunk is missing for {key}: {chunk_hash}"
      )));
    };
    if chunk.kind != ObjectKind::Chunk || chunk.size != *expected_len as u64 {
      return Err(RuntimeError::invalid_state(format!(
        "Assetpack chunk metadata mismatch for {key}: {chunk_hash}"
      )));
    }
    stored_stream.extend_from_slice(&chunk.content);
  }

  let body = decode_stored_stream(recipe.transform_id, stored_stream)?;
  if body.len() as u64 != recipe.original_file_size || Hash32::sha3_256(&body) != recipe.original_file_hash {
    return Err(RuntimeError::invalid_state(format!(
      "Assetpack reconstructed body failed integrity check for {key}"
    )));
  }

  Ok(Some(ObjectGetResult {
    body,
    metadata: row.metadata,
  }))
}

pub(super) async fn list(
  config: &FsStorageConfig,
  scope: &str,
  prefix: Option<String>,
) -> RuntimeResult<Vec<ObjectListEntry>> {
  let prefix = prefix
    .map(|prefix| super::normalize_storage_prefix(&prefix))
    .transpose()?
    .unwrap_or_default();
  let store = open_store(config).await?;
  let rows = sqlx::query(
    r#"
    SELECT key, content_length, last_modified_ms
    FROM storage_assetpack_blobs
    WHERE scope = ?1 AND key LIKE ?2 ESCAPE '\'
    ORDER BY key ASC
    "#,
  )
  .bind(scope)
  .bind(format!("{}%", escape_sqlite_like(&prefix)))
  .fetch_all(store.pool())
  .await
  .map_err(|err| RuntimeError::database("Assetpack manifest list failed", err))?;

  rows
    .into_iter()
    .map(|row| {
      Ok(ObjectListEntry {
        key: row.get("key"),
        content_length: row.get::<i64, _>("content_length"),
        last_modified_ms: row.get("last_modified_ms"),
      })
    })
    .collect()
}

fn escape_sqlite_like(value: &str) -> String {
  let mut escaped = String::with_capacity(value.len());
  for ch in value.chars() {
    match ch {
      '%' | '_' | '\\' => {
        escaped.push('\\');
        escaped.push(ch);
      }
      _ => escaped.push(ch),
    }
  }
  escaped
}

pub(super) async fn delete(config: &FsStorageConfig, scope: &str, key: &str) -> RuntimeResult<()> {
  normalize_storage_key(key)?;
  let store = open_store(config).await?;
  sqlx::query("DELETE FROM storage_assetpack_blobs WHERE scope = ?1 AND key = ?2")
    .bind(scope)
    .bind(key)
    .execute(store.pool())
    .await
    .map_err(|err| RuntimeError::database("Assetpack manifest delete failed", err))?;
  Ok(())
}

async fn open_store(config: &FsStorageConfig) -> RuntimeResult<SqliteStore> {
  let store = SqliteStore::open(store_path(config))
    .await
    .map_err(|err| RuntimeError::invalid_state(format!("Assetpack store open failed: {err}")))?;
  ensure_manifest_schema(&store).await?;
  Ok(store)
}

fn store_path(config: &FsStorageConfig) -> PathBuf {
  fs_bucket_path(config).join("assetpack.sqlite")
}

fn extension_from_key(key: &str) -> Option<String> {
  key
    .rsplit_once('.')
    .and_then(|(_, extension)| (!extension.is_empty()).then(|| extension.to_ascii_lowercase()))
}

struct ManifestRow {
  recipe_hash: String,
  metadata: ObjectMetadata,
}

async fn ensure_manifest_schema(store: &SqliteStore) -> RuntimeResult<()> {
  sqlx::query(
    r#"
    CREATE TABLE IF NOT EXISTS storage_assetpack_blobs (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      recipe_hash TEXT NOT NULL,
      content_type TEXT NOT NULL,
      content_length INTEGER NOT NULL,
      checksum_crc32 TEXT,
      last_modified_ms INTEGER NOT NULL,
      PRIMARY KEY (scope, key)
    )
    "#,
  )
  .execute(store.pool())
  .await
  .map_err(|err| RuntimeError::database("Assetpack manifest schema create failed", err))?;
  sqlx::query(
    "CREATE INDEX IF NOT EXISTS storage_assetpack_blobs_scope_prefix_idx ON storage_assetpack_blobs (scope, key)",
  )
  .execute(store.pool())
  .await
  .map_err(|err| RuntimeError::database("Assetpack manifest index create failed", err))?;
  Ok(())
}

async fn manifest_row(store: &SqliteStore, scope: &str, key: &str) -> RuntimeResult<Option<ManifestRow>> {
  let row = sqlx::query(
    r#"
    SELECT recipe_hash, content_type, content_length, checksum_crc32, last_modified_ms
    FROM storage_assetpack_blobs
    WHERE scope = ?1 AND key = ?2
    "#,
  )
  .bind(scope)
  .bind(key)
  .fetch_optional(store.pool())
  .await
  .map_err(|err| RuntimeError::database("Assetpack manifest read failed", err))?;

  row
    .map(|row| {
      Ok(ManifestRow {
        recipe_hash: row.get("recipe_hash"),
        metadata: ObjectMetadata {
          content_type: row.get("content_type"),
          content_length: row.get("content_length"),
          checksum_crc32: row.get("checksum_crc32"),
          last_modified_ms: row.get("last_modified_ms"),
        },
      })
    })
    .transpose()
}

fn decode_stored_stream(transform_id: u16, stored_stream: Vec<u8>) -> RuntimeResult<Vec<u8>> {
  let transform_config = FileTransformConfig::default();
  let registry = TransformRegistry::new(&transform_config, assetpack_transform_precomp2::default_specs());
  let transform = registry
    .get(transform_id)
    .ok_or_else(|| RuntimeError::invalid_state(format!("Assetpack transform is not registered: {transform_id}")))?;
  let mut out = Vec::new();
  transform
    .decode(&mut BufReader::new(Cursor::new(stored_stream)), &mut out)
    .map_err(|err| RuntimeError::invalid_state(format!("Assetpack transform decode failed: {err}")))?;
  Ok(out)
}
