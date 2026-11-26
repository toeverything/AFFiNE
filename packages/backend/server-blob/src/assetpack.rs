//! Assetpack SQLite object storage backend compatible with `v0.27.5`.

use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Read as _};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use assetpack_core::{
  Codec, FileHint, FileReadLimits, FileReader, FileTransformConfig, Hash32, ObjectKind, ObjectSource, Pipeline,
  PipelineConfig, TransformDecoder, TransformDecoderRegistry, TransformSelector, VerifiedObject, build_recipe,
  parse_recipe_checked,
};
use chrono::{DateTime, Utc};
use sqlx::QueryBuilder;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions};
use tokio::sync::{OnceCell, Semaphore};

use crate::storage::{
  BlobStorageBackend, ObjectMetadata, StorageBackendIdentity, StorageError, checksum_crc32_base64,
  normalize_storage_key, now_ms, object_too_large, resolve_bucket_dir,
};

#[cfg(test)]
#[path = "assetpack_tests.rs"]
mod tests;

const MAX_BLOB_SIZE: i64 = i32::MAX as i64;
const MAX_RECIPE_BYTES: i64 = 32 * 1024 * 1024;
const OBJECT_INSERT_BATCH: usize = 140;
const DECODE_BUDGET_MIN_ORIG_BYTES: u64 = 32 * 1024 * 1024;
const DECODE_MAX_TOTAL_OUTPUT_BYTES: u64 = 512 * 1024 * 1024;
const FAST_TRANSFORM_MAX_INPUT_BYTES: u64 = 128 * 1024 * 1024;
const _: () = assert!(DECODE_MAX_TOTAL_OUTPUT_BYTES >= FAST_TRANSFORM_MAX_INPUT_BYTES);

pub(crate) static ASSETPACK_READ_SEM: Semaphore = Semaphore::const_new(4);
pub(crate) static ASSETPACK_WRITE_SEM: Semaphore = Semaphore::const_new(4);
static ASSETPACK_TRANSFORM_SEM: Semaphore = Semaphore::const_new(2);

const INIT_SQL: &str = "\
CREATE TABLE IF NOT EXISTS objects (hash BLOB PRIMARY KEY, kind INTEGER NOT NULL, size INTEGER NOT NULL, stored_size INTEGER NOT NULL, codec TEXT NOT NULL, content BLOB NOT NULL, created_at INTEGER NOT NULL);\
CREATE TABLE IF NOT EXISTS file_recipe_cache (file_hash BLOB PRIMARY KEY, recipe_hash BLOB NOT NULL, updated_at INTEGER NOT NULL);\
CREATE TABLE IF NOT EXISTS merkle_leaves (hash BLOB PRIMARY KEY, pos INTEGER NOT NULL);\
CREATE UNIQUE INDEX IF NOT EXISTS idx_merkle_leaves_pos ON merkle_leaves(pos);\
CREATE TABLE IF NOT EXISTS merkle_nodes (level INTEGER NOT NULL, pos INTEGER NOT NULL, hash BLOB NOT NULL, PRIMARY KEY(level, pos));\
CREATE TABLE IF NOT EXISTS merkle_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);\
CREATE TABLE IF NOT EXISTS storage_assetpack_blobs (scope TEXT NOT NULL, key TEXT NOT NULL, recipe_hash TEXT NOT NULL, content_type TEXT NOT NULL, content_length INTEGER NOT NULL, checksum_crc32 TEXT, last_modified_ms INTEGER NOT NULL, PRIMARY KEY (scope, key));\
CREATE INDEX IF NOT EXISTS storage_assetpack_blobs_scope_prefix_idx ON storage_assetpack_blobs (scope, key);";

const UPSERT_MANIFEST_SQL: &str = "\
INSERT INTO storage_assetpack_blobs (scope, key, recipe_hash, content_type, content_length, checksum_crc32, last_modified_ms) \
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT (scope, key) DO UPDATE SET \
recipe_hash = excluded.recipe_hash, content_type = excluded.content_type, content_length = excluded.content_length, \
checksum_crc32 = excluded.checksum_crc32, last_modified_ms = excluded.last_modified_ms";

pub struct AssetpackBlobStorage {
  bucket_dir: PathBuf,
  bucket_name: String,
  scope: String,
  precomp2: bool,
  selector: Option<Arc<TransformSelector>>,
  decoders: Arc<TransformDecoderRegistry>,
  pool: OnceCell<SqlitePool>,
}

type ObjRow = (i64, String, Vec<u8>);

fn ap_err(e: impl std::fmt::Display) -> StorageError {
  StorageError::Metadata(e.to_string())
}

fn codec_str(codec: Codec) -> &'static str {
  match codec {
    Codec::Raw => "raw",
    Codec::Zstd => "zstd",
    Codec::Brotli => "brotli",
  }
}

fn build_selector(bucket_dir: &Path) -> Arc<TransformSelector> {
  let tc = FileTransformConfig::fast();
  assert!(
    DECODE_MAX_TOTAL_OUTPUT_BYTES >= tc.precomp2.max_total_output
      && DECODE_MAX_TOTAL_OUTPUT_BYTES >= tc.max_transform_bytes,
    "assetpack decode budget must cover FileTransformConfig::fast() write limits"
  );
  let temp_dir = tc.resolved_temp_dir(bucket_dir);
  Arc::new(TransformSelector::new(
    tc,
    temp_dir,
    assetpack_transform_precomp2::default_specs(),
  ))
}

async fn fetch_bounded_obj_row(
  pool: &SqlitePool,
  hash: Hash32,
  expected_kind: ObjectKind,
  (min_size, max_size, max_stored): (i64, i64, i64),
  label: &str,
) -> Result<ObjRow, StorageError> {
  type GuardedRow = (i64, i64, i64, String, Option<Vec<u8>>);
  let (kind, size, slen, codec, content): GuardedRow = sqlx::query_as(
    "SELECT kind, size, length(content), codec, \
     CASE WHEN kind = ?2 AND size >= ?3 AND size <= ?4 AND length(content) <= ?5 THEN content ELSE NULL END \
     FROM objects WHERE hash = ?1",
  )
  .bind(hash.as_bytes().as_ref())
  .bind(expected_kind as i64)
  .bind(min_size)
  .bind(max_size)
  .bind(max_stored)
  .fetch_optional(pool)
  .await
  .map_err(ap_err)?
  .ok_or_else(|| ap_err(format!("missing {label} {hash}")))?;
  content.map(|b| (size, codec, b)).ok_or_else(|| {
    ap_err(format!(
      "assetpack {label} bounds invalid {hash} ({kind},{size},{slen})"
    ))
  })
}

fn decode_verified_object(
  hash: Hash32,
  kind: ObjectKind,
  expected_size: u64,
  row: &ObjRow,
) -> Result<VerifiedObject, StorageError> {
  let (row_size, codec, stored) = row;
  if u64::try_from(*row_size).ok() != Some(expected_size) {
    return Err(ap_err(format!("assetpack object metadata mismatch {hash}")));
  }
  let cap = expected_size.saturating_add(1);
  let mut bytes = Vec::with_capacity((expected_size as usize).min(1024 * 1024));
  match codec.as_str() {
    "raw" if stored.len() as u64 == expected_size => bytes.extend_from_slice(stored),
    "raw" => return Err(ap_err(format!("assetpack raw length mismatch {hash}"))),
    "zstd" => {
      zstd::Decoder::new(Cursor::new(stored))
        .map_err(ap_err)?
        .take(cap)
        .read_to_end(&mut bytes)
        .map_err(ap_err)?;
    }
    "brotli" => {
      brotli::Decompressor::new(Cursor::new(stored), 4096)
        .take(cap)
        .read_to_end(&mut bytes)
        .map_err(ap_err)?;
    }
    other => return Err(ap_err(format!("unsupported assetpack codec {other}"))),
  }
  if bytes.len() as u64 != expected_size || Hash32::sha3_256(&bytes) != hash {
    return Err(ap_err(format!("assetpack object integrity mismatch {hash}")));
  }
  Ok(VerifiedObject { hash, kind, bytes })
}

struct TakingSource(Mutex<HashMap<Hash32, (usize, VerifiedObject)>>);

impl ObjectSource for TakingSource {
  fn read_object(&self, hash: &Hash32) -> assetpack_core::Result<Option<VerifiedObject>> {
    let mut map = self.0.lock().unwrap_or_else(|e| e.into_inner());
    let take_owned = map.get(hash).is_some_and(|(n, _)| *n <= 1);
    if take_owned {
      return Ok(map.remove(hash).map(|(_, obj)| obj));
    }
    Ok(map.get_mut(hash).map(|(n, obj)| {
      *n -= 1;
      obj.clone()
    }))
  }
}

fn precomp2_allow_ext() -> &'static HashSet<String> {
  static ALLOW_EXT: OnceLock<HashSet<String>> = OnceLock::new();
  ALLOW_EXT.get_or_init(|| {
    FileTransformConfig::fast()
      .allow_ext
      .into_iter()
      .map(|e| e.to_ascii_lowercase())
      .collect()
  })
}

pub(crate) fn may_run_precomp2_transform(ext: Option<&str>, body: &[u8]) -> bool {
  if body.len() < 32 * 1024 || body.len() > 32 * 1024 * 1024 {
    return false;
  }
  if ext.is_some_and(|e| precomp2_allow_ext().contains(e)) {
    return true;
  }
  body.starts_with(b"\x89PNG\r\n\x1a\n")
    || body.starts_with(b"\x1f\x8b")
    || body.starts_with(b"PK\x03\x04")
    || body.starts_with(b"%PDF")
    || body.starts_with(b"UnityFS\0")
}

struct FloorSizedDecoder(Arc<dyn TransformDecoder>);

impl TransformDecoder for FloorSizedDecoder {
  fn id(&self) -> u16 {
    self.0.id()
  }

  fn version(&self) -> u16 {
    self.0.version()
  }

  fn decode(&self, input: &mut dyn std::io::BufRead, output: &mut dyn std::io::Write) -> assetpack_core::Result<()> {
    self.0.decode(input, output)
  }

  fn decode_for_size(
    &self,
    input: &mut dyn std::io::BufRead,
    output: &mut dyn std::io::Write,
    original_file_size: u64,
  ) -> assetpack_core::Result<()> {
    // High-compression-ratio PNGs (e.g. 2800x2800 or 5000x5000 gradients) expand well past
    // 16x compressed file size into raw pixels. Floor `original_file_size` at 32 MiB so the
    // upstream 16x budget allows up to 512 MiB of decoded pixels while `precomp2`'s per-segment
    // `segment_data_limit` still bounds forged small-file segments to `orig_len * 32 + 2 MiB`.
    self
      .0
      .decode_for_size(input, output, original_file_size.max(DECODE_BUDGET_MIN_ORIG_BYTES))
  }
}

impl AssetpackBlobStorage {
  /// Reads `key` from one manifest snapshot and, with `max_bytes`, fails
  /// before it reads any chunk of an object over the limit.
  async fn read_bounded(
    &self,
    key: &str,
    max_bytes: Option<usize>,
  ) -> Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError> {
    normalize_storage_key(key)?;
    let pool = self.open_pool().await?;
    let Some((hex, meta)) = self.manifest_row(pool, key).await? else {
      return Ok(None);
    };
    if !(0..=MAX_BLOB_SIZE).contains(&meta.content_length) {
      return Err(ap_err("assetpack manifest size exceeds max"));
    }
    let too_large = |len: u64| max_bytes.filter(|&limit| len > limit as u64);
    if let Some(limit) = u64::try_from(meta.content_length).ok().and_then(too_large) {
      return Err(object_too_large(key, limit));
    }
    // The hook waits on a condition variable, so it runs off the async workers.
    #[cfg(test)]
    tokio::task::spawn_blocking(|| drop(tests::enter_manifest_checked_hook()))
      .await
      .map_err(ap_err)?;
    let rhash = Hash32::from_hex(&hex).map_err(ap_err)?;
    let rlim = (0, MAX_RECIPE_BYTES, MAX_RECIPE_BYTES);
    let rrow = fetch_bounded_obj_row(pool, rhash, ObjectKind::Recipe, rlim, "recipe").await?;
    let permit = ASSETPACK_READ_SEM.acquire().await.map_err(ap_err)?;
    let (recipe_obj, recipe) = tokio::task::spawn_blocking(move || {
      let _permit = permit;
      let obj = decode_verified_object(rhash, ObjectKind::Recipe, rrow.0 as u64, &rrow)?;
      let parsed = parse_recipe_checked(&obj.bytes, &rhash).map_err(ap_err)?;
      Ok::<_, StorageError>((obj, parsed))
    })
    .await
    .map_err(ap_err)??;
    let orig_len = recipe.original_file_size;
    if let Some(limit) = too_large(orig_len) {
      return Err(object_too_large(key, limit));
    }
    let max_stream = (MAX_BLOB_SIZE as u64) + 64 * 1024 * 1024;
    let chunks_sum = recipe
      .chunks
      .iter()
      .try_fold(0u64, |acc, (_, l)| acc.checked_add(u64::from(*l)))
      .ok_or_else(|| ap_err("assetpack chunk length overflow"))?;
    if orig_len > MAX_BLOB_SIZE as u64
      || recipe.stored_stream_size > max_stream
      || u64::try_from(meta.content_length).ok() != Some(orig_len)
      || chunks_sum != recipe.stored_stream_size
    {
      return Err(ap_err("assetpack recipe size mismatch or exceeds max"));
    }
    let mut chunk_rows: HashMap<Hash32, (u64, usize, ObjRow)> = HashMap::with_capacity(recipe.chunks.len());
    let mut total_stored = 0u64;
    for (chash, expected_len) in recipe.chunks {
      let exp_u64 = u64::from(expected_len);
      if let Some((prev_len, count, _)) = chunk_rows.get_mut(&chash) {
        if *prev_len != exp_u64 {
          return Err(ap_err(format!("assetpack chunk length conflict {chash}")));
        }
        *count += 1;
        continue;
      }
      let rem = i64::try_from(max_stream.saturating_sub(total_stored)).unwrap_or(i64::MAX);
      let lim = (i64::from(expected_len), i64::from(expected_len), rem);
      let crow = fetch_bounded_obj_row(pool, chash, ObjectKind::Chunk, lim, "chunk").await?;
      total_stored = total_stored.saturating_add(crow.2.len() as u64);
      chunk_rows.insert(chash, (exp_u64, 1, crow));
    }
    let decoders = Arc::clone(&self.decoders);
    let permit = ASSETPACK_READ_SEM.acquire().await.map_err(ap_err)?;
    let body = tokio::task::spawn_blocking(move || {
      let _permit = permit;
      #[cfg(test)]
      let _hook = tests::enter_read_blocking_hook();
      let mut objects = HashMap::with_capacity(chunk_rows.len() + 1);
      objects.insert(rhash, (1usize, recipe_obj));
      for (chash, (expected_len, count, crow)) in chunk_rows {
        objects.insert(
          chash,
          (
            count,
            decode_verified_object(chash, ObjectKind::Chunk, expected_len, &crow)?,
          ),
        );
      }
      let limits = FileReadLimits {
        max_chunk_count: 1_000_000,
        max_stored_stream_bytes: max_stream,
        max_original_file_bytes: orig_len,
      };
      FileReader::new(&TakingSource(Mutex::new(objects)), &decoders, limits)
        .read_file(rhash)
        .map_err(ap_err)
    })
    .await
    .map_err(ap_err)??;
    if let Some(limit) = too_large(body.len() as u64) {
      return Err(object_too_large(key, limit));
    }
    Ok(Some((body, meta)))
  }

  pub fn new(root: &str, bucket: &str, scope: impl Into<String>) -> Result<Self, StorageError> {
    let bucket_dir = resolve_bucket_dir(root, bucket)?;
    let mut decode_tc = FileTransformConfig::default();
    decode_tc.precomp2.max_total_output = DECODE_MAX_TOTAL_OUTPUT_BYTES;
    let decoders = Arc::new(
      TransformDecoderRegistry::new(
        assetpack_transform_precomp2::default_decoders(&decode_tc)
          .into_iter()
          .map(|d| Arc::new(FloorSizedDecoder(d)) as Arc<dyn TransformDecoder>),
      )
      .map_err(ap_err)?,
    );
    Ok(Self {
      selector: Some(build_selector(&bucket_dir)),
      decoders,
      bucket_dir,
      bucket_name: bucket.to_owned(),
      scope: scope.into(),
      precomp2: true,
      pool: OnceCell::new(),
    })
  }

  pub fn with_precomp2(mut self, enabled: bool) -> Self {
    self.precomp2 = enabled;
    self.selector = enabled.then(|| build_selector(&self.bucket_dir));
    self
  }

  pub fn precomp2_enabled(&self) -> bool {
    self.precomp2
  }

  async fn open_pool(&self) -> Result<&SqlitePool, StorageError> {
    self
      .pool
      .get_or_try_init(|| async {
        std::fs::create_dir_all(&self.bucket_dir).map_err(|source| StorageError::Io {
          context: "create assetpack bucket dir",
          source,
        })?;
        let opts = SqliteConnectOptions::new()
          .filename(self.bucket_dir.join("assetpack.sqlite"))
          .create_if_missing(true)
          .journal_mode(SqliteJournalMode::Wal)
          .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
          .max_connections(1)
          .connect_with(opts)
          .await
          .map_err(ap_err)?;
        sqlx::raw_sql(INIT_SQL).execute(&pool).await.map_err(ap_err)?;
        Ok(pool)
      })
      .await
  }

  async fn manifest_row(&self, pool: &SqlitePool, key: &str) -> Result<Option<(String, ObjectMetadata)>, StorageError> {
    type Row = (String, String, i64, Option<String>, i64);
    let row: Option<Row> = sqlx::query_as(
      "SELECT recipe_hash, content_type, content_length, checksum_crc32, last_modified_ms \
       FROM storage_assetpack_blobs WHERE scope = ?1 AND key = ?2",
    )
    .bind(&self.scope)
    .bind(key)
    .fetch_optional(pool)
    .await
    .map_err(ap_err)?;
    Ok(
      row.map(|(h, content_type, content_length, checksum_crc32, last_modified_ms)| {
        (
          h,
          ObjectMetadata {
            content_type,
            content_length,
            checksum_crc32,
            last_modified_ms,
          },
        )
      }),
    )
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
    let pool = self.open_pool().await?;
    let ext = key
      .rsplit_once('.')
      .and_then(|(_, e)| (!e.is_empty()).then(|| e.to_ascii_lowercase()));
    let selector = self.selector.clone();
    let transform_permit = if selector.is_some() && may_run_precomp2_transform(ext.as_deref(), &body) {
      Some(ASSETPACK_TRANSFORM_SEM.acquire().await.map_err(ap_err)?)
    } else {
      None
    };
    let write_permit = ASSETPACK_WRITE_SEM.acquire().await.map_err(ap_err)?;
    let (crc, orig, plan) = tokio::task::spawn_blocking(move || {
      let _transform_permit = transform_permit;
      let _write_permit = write_permit;
      #[cfg(test)]
      let _hook = tests::enter_write_blocking_hook();
      let crc = Some(checksum_crc32_base64(&body));
      let orig = Hash32::sha3_256(&body);
      let hint = FileHint {
        size: body.len() as u64,
        extension: ext,
        head: Some(body.iter().take(4096).copied().collect()),
      };
      let plan = Pipeline::new(PipelineConfig::default())
        .run(body, &hint, orig, selector.as_deref())
        .map_err(ap_err)?;
      Ok::<_, StorageError>((crc, orig, plan))
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
    let mut rows: Vec<(Hash32, i64, i64, &'static str, Vec<u8>)> = Vec::with_capacity(plan.chunks.len() + 1);
    for c in plan.chunks {
      let content = c.payload.ok_or_else(|| ap_err("assetpack missing chunk payload"))?;
      rows.push((
        c.hash,
        ObjectKind::Chunk as i64,
        i64::from(c.raw_len),
        codec_str(c.codec),
        content,
      ));
    }
    rows.push((rhash, ObjectKind::Recipe as i64, recipe.len() as i64, "raw", recipe));
    let now_ms_val = now_ms();
    let now_secs = now_ms_val.div_euclid(1000);
    let meta = ObjectMetadata {
      content_type: if ct.is_empty() { "application/octet-stream" } else { ct }.to_owned(),
      content_length: len,
      last_modified_ms: now_ms_val,
      checksum_crc32: crc,
    };
    let mut tx = pool.begin().await.map_err(ap_err)?;
    for batch in rows.chunks(OBJECT_INSERT_BATCH) {
      let mut qb =
        QueryBuilder::new("INSERT OR IGNORE INTO objects (hash, kind, size, stored_size, codec, content, created_at) ");
      qb.push_values(batch, |mut b, (hash, kind, size, codec, content)| {
        b.push_bind(hash.as_bytes().as_slice())
          .push_bind(*kind)
          .push_bind(*size)
          .push_bind(content.len() as i64)
          .push_bind(*codec)
          .push_bind(content.as_slice())
          .push_bind(now_secs);
      });
      qb.build().execute(&mut *tx).await.map_err(ap_err)?;
    }
    sqlx::query(
      "INSERT INTO file_recipe_cache (file_hash, recipe_hash, updated_at) VALUES (?1, ?2, ?3) \
       ON CONFLICT (file_hash) DO UPDATE SET recipe_hash = excluded.recipe_hash, updated_at = excluded.updated_at",
    )
    .bind(orig.as_bytes().as_ref())
    .bind(rhash.as_bytes().as_ref())
    .bind(now_secs)
    .execute(&mut *tx)
    .await
    .map_err(ap_err)?;
    sqlx::query(UPSERT_MANIFEST_SQL)
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

  async fn promote_object(&self, src: &str, dst: &str, ct: &str) -> Result<ObjectMetadata, StorageError> {
    normalize_storage_key(src)?;
    normalize_storage_key(dst)?;
    let pool = self.open_pool().await?;
    let mut tx = pool.begin().await.map_err(ap_err)?;
    type SrcRow = (String, String, i64, Option<String>);
    let Some((recipe_hash, src_ct, content_length, checksum_crc32)): Option<SrcRow> = sqlx::query_as(
      "SELECT recipe_hash, content_type, content_length, checksum_crc32 \
       FROM storage_assetpack_blobs WHERE scope = ?1 AND key = ?2",
    )
    .bind(&self.scope)
    .bind(src)
    .fetch_optional(&mut *tx)
    .await
    .map_err(ap_err)?
    else {
      return Err(StorageError::Metadata(format!("staging object `{src}` not found")));
    };
    let meta = ObjectMetadata {
      content_type: if ct.is_empty() { src_ct } else { ct.to_owned() },
      content_length,
      checksum_crc32,
      last_modified_ms: now_ms(),
    };
    sqlx::query(UPSERT_MANIFEST_SQL)
      .bind(&self.scope)
      .bind(dst)
      .bind(&recipe_hash)
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
    self.read_bounded(key, None).await
  }

  async fn get_limited(&self, key: &str, max_bytes: usize) -> Result<Option<(Vec<u8>, ObjectMetadata)>, StorageError> {
    self.read_bounded(key, Some(max_bytes)).await
  }

  async fn head(&self, key: &str) -> Result<Option<ObjectMetadata>, StorageError> {
    normalize_storage_key(key)?;
    Ok(self.manifest_row(self.open_pool().await?, key).await?.map(|(_, m)| m))
  }

  async fn delete(&self, key: &str) -> Result<(), StorageError> {
    normalize_storage_key(key)?;
    sqlx::query("DELETE FROM storage_assetpack_blobs WHERE scope = ?1 AND key = ?2")
      .bind(&self.scope)
      .bind(key)
      .execute(self.open_pool().await?)
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
    .fetch_all(self.open_pool().await?)
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
