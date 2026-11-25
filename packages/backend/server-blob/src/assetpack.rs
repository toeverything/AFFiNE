//! Assetpack SQLite object storage backend compatible with `v0.27.5`.

use std::io::{BufReader, Cursor, Read as _};
use std::path::PathBuf;

use assetpack_core::{
  Codec, FileHint, FileTransformConfig, Hash32, ObjectKind, Pipeline, PipelineConfig, SqliteStore,
  TRANSFORM_ID_PRECOMP2, TRANSFORM_ID_PRECOMP2_LZMA, TRANSFORM_ID_PRECOMP2_ZSTD, build_recipe,
  file_transform::FileTransform as _, pack::ObjectRecord, parse_recipe_checked,
};
use chrono::{DateTime, Utc};
use tokio::sync::{OnceCell, Semaphore};

use crate::storage::{
  BlobStorageBackend, ObjectMetadata, StorageBackendIdentity, StorageError, checksum_crc32_base64,
  normalize_storage_key, now_ms, resolve_bucket_dir,
};

#[cfg(test)]
#[path = "assetpack_tests.rs"]
mod tests;

const MAX_BLOB_SIZE: i64 = i32::MAX as i64;
const MAX_RECIPE_BYTES: i64 = 32 * 1024 * 1024;
static ASSETPACK_CPU_SEM: Semaphore = Semaphore::const_new(4);
const INIT_SQL: &str = "CREATE TABLE IF NOT EXISTS storage_assetpack_blobs (\
  scope TEXT NOT NULL, key TEXT NOT NULL, recipe_hash TEXT NOT NULL, content_type TEXT NOT NULL, \
  content_length INTEGER NOT NULL, checksum_crc32 TEXT, last_modified_ms INTEGER NOT NULL, PRIMARY KEY (scope, key));\
  CREATE INDEX IF NOT EXISTS storage_assetpack_blobs_scope_prefix_idx ON storage_assetpack_blobs (scope, key);";

pub struct AssetpackBlobStorage {
  bucket_dir: PathBuf,
  bucket_name: String,
  scope: String,
  store: OnceCell<SqliteStore>,
}

fn ap_err(e: impl std::fmt::Display) -> StorageError {
  StorageError::Metadata(e.to_string())
}

struct BoundedVec<'a> {
  buf: &'a mut Vec<u8>,
  max: usize,
}

impl std::io::Write for BoundedVec<'_> {
  fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
    if self.buf.len().saturating_add(data.len()) > self.max {
      return Err(std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        "assetpack decoded size exceeds max",
      ));
    }
    self.buf.extend_from_slice(data);
    Ok(data.len())
  }
  fn flush(&mut self) -> std::io::Result<()> {
    Ok(())
  }
}

type ObjRow = (i64, String, Vec<u8>);

fn read_bounded(r: impl std::io::Read, max: u64, msg: &str) -> Result<Vec<u8>, StorageError> {
  let mut buf = Vec::new();
  r.take(max + 1).read_to_end(&mut buf).map_err(ap_err)?;
  if buf.len() as u64 > max {
    return Err(ap_err(msg));
  }
  Ok(buf)
}

async fn fetch_bounded_obj_row(
  store: &SqliteStore,
  hash: Hash32,
  expected_kind: ObjectKind,
  (min_size, max_size, max_stored): (i64, i64, i64),
  label: &str,
) -> Result<ObjRow, StorageError> {
  type GuardedRow = (i64, i64, i64, String, Option<Vec<u8>>);
  let (kind, size, slen, codec, content): GuardedRow = sqlx::query_as(
    "SELECT kind, size, length(content), codec, \
     CASE WHEN kind = ?2 AND size >= ?3 AND size <= ?4 AND length(content) <= ?5 \
     THEN content ELSE NULL END FROM objects WHERE hash = ?1",
  )
  .bind(hash.as_bytes().as_ref())
  .bind(expected_kind as i64)
  .bind(min_size)
  .bind(max_size)
  .bind(max_stored)
  .fetch_optional(store.pool())
  .await
  .map_err(ap_err)?
  .ok_or_else(|| ap_err(format!("missing {label} {hash}")))?;
  content.map(|b| (size, codec, b)).ok_or_else(|| {
    ap_err(format!(
      "assetpack {label} bounds invalid {hash} ({kind},{size},{slen})"
    ))
  })
}

fn decode_object_into(hash: Hash32, expected_size: u64, row: &ObjRow, out: &mut Vec<u8>) -> Result<(), StorageError> {
  let (row_size, codec, stored) = row;
  if u64::try_from(*row_size).ok() != Some(expected_size) {
    return Err(ap_err(format!("assetpack object metadata mismatch {hash}")));
  }
  let start = out.len();
  let cap = expected_size.saturating_add(1);
  let mut read_to = |r: Box<dyn std::io::Read>| r.take(cap).read_to_end(out).map_err(ap_err);
  match codec.as_str() {
    "raw" if stored.len() as u64 == expected_size => out.extend_from_slice(stored),
    "raw" => return Err(ap_err(format!("assetpack raw length mismatch {hash}"))),
    "zstd" => {
      read_to(Box::new(zstd::Decoder::new(Cursor::new(stored)).map_err(ap_err)?))?;
    }
    "brotli" => {
      read_to(Box::new(brotli::Decompressor::new(Cursor::new(stored), 4096)))?;
    }
    other => return Err(ap_err(format!("unsupported assetpack codec {other}"))),
  }
  if (out.len() - start) as u64 != expected_size || Hash32::sha3_256(&out[start..]) != hash {
    return Err(ap_err(format!("assetpack object integrity mismatch {hash}")));
  }
  Ok(())
}

impl AssetpackBlobStorage {
  pub fn new(root: &str, bucket: &str, scope: impl Into<String>) -> Result<Self, StorageError> {
    Ok(Self {
      bucket_dir: resolve_bucket_dir(root, bucket)?,
      bucket_name: bucket.to_owned(),
      scope: scope.into(),
      store: OnceCell::new(),
    })
  }
  async fn open_store(&self) -> Result<&SqliteStore, StorageError> {
    self
      .store
      .get_or_try_init(|| async {
        std::fs::create_dir_all(&self.bucket_dir).map_err(|source| StorageError::Io {
          context: "create assetpack bucket dir",
          source,
        })?;
        let store = SqliteStore::open(self.bucket_dir.join("assetpack.sqlite"))
          .await
          .map_err(ap_err)?;
        sqlx::raw_sql(INIT_SQL).execute(store.pool()).await.map_err(ap_err)?;
        Ok(store)
      })
      .await
  }
  async fn manifest_row(
    &self,
    store: &SqliteStore,
    key: &str,
  ) -> Result<Option<(String, ObjectMetadata)>, StorageError> {
    type Row = (String, String, i64, Option<String>, i64);
    let row: Option<Row> = sqlx::query_as(
      "SELECT recipe_hash, content_type, content_length, checksum_crc32, last_modified_ms \
       FROM storage_assetpack_blobs WHERE scope = ?1 AND key = ?2",
    )
    .bind(&self.scope)
    .bind(key)
    .fetch_optional(store.pool())
    .await
    .map_err(ap_err)?;
    Ok(row.map(|(h, ct, len, crc, ms)| {
      (
        h,
        ObjectMetadata {
          content_type: ct,
          content_length: len,
          checksum_crc32: crc,
          last_modified_ms: ms,
        },
      )
    }))
  }
}

#[async_trait::async_trait]
impl BlobStorageBackend for AssetpackBlobStorage {
  async fn put(&self, key: &str, body: Vec<u8>, ct: &str) -> Result<ObjectMetadata, StorageError> {
    normalize_storage_key(key)?;
    let len = i64::try_from(body.len()).unwrap_or(i64::MAX);
    if !(0..=MAX_BLOB_SIZE).contains(&len) {
      return Err(ap_err("assetpack blob exceeds max size"));
    }
    let store = self.open_store().await?;
    let ext = key
      .rsplit_once('.')
      .and_then(|(_, e)| (!e.is_empty()).then(|| e.to_ascii_lowercase()));
    let permit = ASSETPACK_CPU_SEM.acquire().await.map_err(ap_err)?;
    let (crc, orig, plan) = tokio::task::spawn_blocking(move || {
      let _permit = permit;
      #[cfg(test)]
      let _hook = tests::enter_blocking_hook();
      std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
        let crc = Some(checksum_crc32_base64(&body));
        let orig = Hash32::sha3_256(&body);
        let hint = FileHint {
          size: body.len() as u64,
          extension: ext,
          head: Some(body.iter().take(4096).copied().collect()),
        };
        let plan = Pipeline::new(PipelineConfig::default())
          .run(body, &hint, orig, None)
          .map_err(ap_err)?;
        Ok::<_, StorageError>((crc, orig, plan))
      }))
      .map_err(|_| ap_err("assetpack encode panicked"))?
    })
    .await
    .map_err(ap_err)??;
    let refs: Vec<_> = plan.chunks.iter().map(|c| (c.hash, c.raw_len)).collect();
    let recipe = build_recipe(
      plan.original_size,
      &refs,
      plan.original_hash,
      plan.transform_id,
      plan.transform_version,
    );
    let rhash = Hash32::sha3_256(&recipe);
    let mut objs = Vec::with_capacity(plan.chunks.len() + 1);
    for c in plan.chunks {
      let content = c.payload.ok_or_else(|| ap_err("assetpack missing chunk payload"))?;
      objs.push(ObjectRecord {
        hash: c.hash,
        kind: ObjectKind::Chunk,
        size: c.raw_len as u64,
        codec: c.codec,
        content,
      });
    }
    objs.push(ObjectRecord {
      hash: rhash,
      kind: ObjectKind::Recipe,
      size: recipe.len() as u64,
      codec: Codec::Raw,
      content: recipe,
    });
    let meta = ObjectMetadata {
      content_type: if ct.is_empty() { "application/octet-stream" } else { ct }.to_owned(),
      content_length: len,
      last_modified_ms: now_ms(),
      checksum_crc32: crc,
    };
    let mut tx = store.begin_write_tx().await.map_err(ap_err)?;
    store.put_objects_batch_tx(&mut tx, &objs).await.map_err(ap_err)?;
    store
      .put_file_recipe_cache_batch_tx(&mut tx, &[(orig, rhash)])
      .await
      .map_err(ap_err)?;
    let sql = "INSERT INTO storage_assetpack_blobs (scope, key, recipe_hash, content_type, content_length, checksum_crc32, last_modified_ms) \
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT (scope, key) DO UPDATE SET \
               recipe_hash = excluded.recipe_hash, content_type = excluded.content_type, content_length = excluded.content_length, \
               checksum_crc32 = excluded.checksum_crc32, last_modified_ms = excluded.last_modified_ms";
    sqlx::query(sql)
      .bind(&self.scope)
      .bind(key)
      .bind(rhash.to_hex())
      .bind(&meta.content_type)
      .bind(meta.content_length)
      .bind(&meta.checksum_crc32)
      .bind(meta.last_modified_ms)
      .execute(&mut *tx)
      .await
      .map_err(ap_err)?;
    tx.commit().await.map_err(ap_err)?;
    Ok(meta)
  }
  async fn get(&self, key: &str) -> Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError> {
    normalize_storage_key(key)?;
    let store = self.open_store().await?;
    let Some((hex, meta)) = self.manifest_row(store, key).await? else {
      return Ok(None);
    };
    if !(0..=MAX_BLOB_SIZE).contains(&meta.content_length) {
      return Err(ap_err("assetpack manifest size exceeds max"));
    }
    let rhash = Hash32::from_hex(&hex).map_err(ap_err)?;
    let rlim = (0, MAX_RECIPE_BYTES, MAX_RECIPE_BYTES);
    let rrow = fetch_bounded_obj_row(store, rhash, ObjectKind::Recipe, rlim, "recipe").await?;
    let permit = ASSETPACK_CPU_SEM.acquire().await.map_err(ap_err)?;
    let recipe = tokio::task::spawn_blocking(move || {
      let _permit = permit;
      std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
        let mut raw = Vec::with_capacity((rrow.0 as usize).min(1024 * 1024));
        decode_object_into(rhash, rrow.0 as u64, &rrow, &mut raw)?;
        parse_recipe_checked(&raw, &rhash).map_err(ap_err)
      }))
      .map_err(|_| ap_err("assetpack recipe parse panicked"))?
    })
    .await
    .map_err(ap_err)??;
    let orig_len = recipe.original_file_size;
    let max_stream = (MAX_BLOB_SIZE as u64) + 64 * 1024 * 1024;
    let chunks_sum = recipe
      .chunks
      .iter()
      .try_fold(0u64, |acc, (_, l)| acc.checked_add(*l as u64))
      .ok_or_else(|| ap_err("assetpack chunk length overflow"))?;
    if orig_len > MAX_BLOB_SIZE as u64
      || recipe.stored_stream_size > max_stream
      || u64::try_from(meta.content_length).ok() != Some(orig_len)
      || chunks_sum != recipe.stored_stream_size
    {
      return Err(ap_err("assetpack recipe size mismatch or exceeds max"));
    }
    let mut raw_chunks = Vec::with_capacity(recipe.chunks.len());
    let mut total_stored = 0u64;
    for (chash, expected_len) in recipe.chunks {
      let rem = i64::try_from(max_stream.saturating_sub(total_stored)).unwrap_or(i64::MAX);
      let lim = (expected_len as i64, expected_len as i64, rem);
      let crow = fetch_bounded_obj_row(store, chash, ObjectKind::Chunk, lim, "chunk").await?;
      total_stored = total_stored.saturating_add(crow.2.len() as u64);
      raw_chunks.push((chash, expected_len as u64, crow));
    }
    let key_owned = key.to_owned();
    let permit = ASSETPACK_CPU_SEM.acquire().await.map_err(ap_err)?;
    let body = tokio::task::spawn_blocking(move || {
      let _permit = permit;
      #[cfg(test)]
      let _hook = tests::enter_blocking_hook();
      std::panic::catch_unwind(std::panic::AssertUnwindSafe(
        move || -> Result<Vec<u8>, StorageError> {
          let mut stream = Vec::with_capacity(recipe.stored_stream_size.min(16 * 1024 * 1024) as usize);
          for (chash, expected_len, crow) in raw_chunks {
            decode_object_into(chash, expected_len, &crow, &mut stream)?;
          }
          let body = match recipe.transform_id {
            0 => {
              if stream.len() as u64 != orig_len {
                return Err(ap_err("assetpack raw stream length mismatch"));
              }
              stream
            }
            TRANSFORM_ID_PRECOMP2 | TRANSFORM_ID_PRECOMP2_ZSTD | TRANSFORM_ID_PRECOMP2_LZMA => {
              let tc = FileTransformConfig::default();
              let max_mid = orig_len
                .saturating_mul(16)
                .saturating_add(16 * 1024 * 1024)
                .min(tc.precomp2.max_total_output);
              let mid = match recipe.transform_id {
                TRANSFORM_ID_PRECOMP2 => {
                  if stream.len() as u64 > max_mid {
                    return Err(ap_err("assetpack precomp2 stream exceeds bound"));
                  }
                  stream
                }
                TRANSFORM_ID_PRECOMP2_ZSTD => read_bounded(
                  zstd::Decoder::new(Cursor::new(&stream)).map_err(ap_err)?,
                  max_mid,
                  "assetpack zstd stream exceeds bound",
                )?,
                TRANSFORM_ID_PRECOMP2_LZMA => {
                  let dict = (tc.precomp2_lzma.dict_size as u64)
                    .clamp(lzma_rust2::DICT_SIZE_MIN as u64, lzma_rust2::DICT_SIZE_MAX as u64)
                    as u32;
                  read_bounded(
                    lzma_rust2::Lzma2Reader::new(Cursor::new(&stream), dict, None),
                    max_mid,
                    "assetpack lzma stream exceeds bound",
                  )?
                }
                _ => unreachable!(),
              };
              let tr = assetpack_transform_precomp2::Precomp2Transform::new(&tc);
              let mut out = Vec::new();
              let mut bounded = BoundedVec {
                buf: &mut out,
                max: (orig_len as usize).saturating_add(1),
              };
              tr.decode(&mut BufReader::new(Cursor::new(mid)), &mut bounded)
                .map_err(ap_err)?;
              out
            }
            other => return Err(ap_err(format!("unknown transform {other}"))),
          };
          if body.len() as u64 != orig_len || Hash32::sha3_256(&body) != recipe.original_file_hash {
            return Err(ap_err(format!("assetpack integrity mismatch for {key_owned}")));
          }
          Ok(body)
        },
      ))
      .map_err(|_| ap_err("assetpack decode panicked"))?
    })
    .await
    .map_err(ap_err)??;
    Ok(Some((body, meta)))
  }
  async fn head(&self, key: &str) -> Result<Option<ObjectMetadata>, StorageError> {
    normalize_storage_key(key)?;
    Ok(self.manifest_row(self.open_store().await?, key).await?.map(|(_, m)| m))
  }
  async fn delete(&self, key: &str) -> Result<(), StorageError> {
    normalize_storage_key(key)?;
    sqlx::query("DELETE FROM storage_assetpack_blobs WHERE scope = ?1 AND key = ?2")
      .bind(&self.scope)
      .bind(key)
      .execute(self.open_store().await?.pool())
      .await
      .map_err(ap_err)?;
    Ok(())
  }
  async fn list_prefix(
    &self,
    pfx: &str,
    after: Option<&str>,
    lim: usize,
  ) -> Result<Vec<(String, Option<DateTime<Utc>>)>, StorageError> {
    let mut esc = pfx.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
    esc.push('%');
    let rows: Vec<(String, i64)> = sqlx::query_as(
      "SELECT key, last_modified_ms FROM storage_assetpack_blobs \
       WHERE scope = ?1 AND key LIKE ?2 ESCAPE '\\' AND key > ?3 ORDER BY key ASC LIMIT ?4",
    )
    .bind(&self.scope)
    .bind(esc)
    .bind(after.unwrap_or(""))
    .bind(i64::try_from(lim).unwrap_or(i64::MAX))
    .fetch_all(self.open_store().await?.pool())
    .await
    .map_err(ap_err)?;
    Ok(
      rows
        .into_iter()
        .map(|(k, ms)| (k, DateTime::from_timestamp_millis(ms)))
        .collect(),
    )
  }
  fn backend_identity(&self) -> StorageBackendIdentity {
    StorageBackendIdentity {
      kind: "assetpack".into(),
      bucket: self.bucket_name.clone(),
      endpoint: Some(self.bucket_dir.to_string_lossy().into_owned()),
    }
  }
}
