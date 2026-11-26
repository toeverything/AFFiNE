//! Multipart and proxied blob upload orchestration, plus dynamic backend reload.

use std::collections::BTreeMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde_json::{Map, Value, json};
use server_db::WorkloadTier;
use server_types::DomainError;
use sqlx::Row as _;

use crate::storage::{
  BlobStorageBackend, LocalFsBlobStorage, MULTIPART_PART_SIZE, MULTIPART_THRESHOLD, PROXY_MULTIPART_PATH,
  PROXY_UPLOAD_PATH, StorageError, UploadedPart,
};
use crate::{
  Admission, AssetpackBlobStorage, BlobService, S3BlobStorage, S3Config, S3UploadOptions, StorageObjectLock,
  blob_object_key, db_error, storage_error, validate_blob_key,
};

fn blob_invalid(msg: impl std::fmt::Display) -> DomainError {
  DomainError::Validation(format!("blob_invalid:{msg}"))
}
fn ensure(ok: bool, msg: &str) -> Result<(), DomainError> {
  if ok { Ok(()) } else { Err(blob_invalid(msg)) }
}
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum UploadInitMethod {
  #[default]
  Graphql,
  Multipart,
  Presigned,
}
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct BlobUploadInitPlan {
  pub already_uploaded: bool,
  pub blob_key: String,
  pub method: UploadInitMethod,
  pub upload_id: Option<String>,
  pub upload_url: Option<String>,
  pub headers: Option<BTreeMap<String, String>>,
  pub expires_at: Option<DateTime<Utc>>,
  pub part_size: Option<i32>,
  pub uploaded_parts: Option<Vec<UploadedPart>>,
}
impl BlobUploadInitPlan {
  fn simple(key: &str, method: UploadInitMethod, already_uploaded: bool) -> Self {
    Self {
      already_uploaded,
      blob_key: key.to_owned(),
      method,
      ..Self::default()
    }
  }
  fn presigned(key: &str, url: String, hdrs: BTreeMap<String, String>, exp: DateTime<Utc>) -> Self {
    Self {
      upload_url: Some(url),
      headers: Some(hdrs),
      expires_at: Some(exp),
      ..Self::simple(key, UploadInitMethod::Presigned, false)
    }
  }
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlobUploadPartPlan {
  pub upload_url: String,
  pub headers: Option<BTreeMap<String, String>>,
  pub expires_at: Option<DateTime<Utc>>,
}
pub struct VerifiedProxyUpload {
  ws: String,
  key: String,
  rid: String,
  obj_key: String,
  rok: String,
  ct: String,
  len: i64,
  storage: Arc<dyn BlobStorageBackend>,
}
pub struct VerifiedProxyMultipart {
  ws: String,
  obj_key: String,
  rok: String,
  uid: String,
  pn: i32,
  len: i64,
  storage: Arc<dyn BlobStorageBackend>,
}
#[derive(Clone, Debug)]
pub enum StorageBackendSpec {
  Fs {
    root: String,
    bucket: String,
    proxy_upload_secret: Option<String>,
    upload_url_prefix: Option<String>,
  },
  Assetpack {
    root: String,
    bucket: String,
    scope: String,
    precomp2: bool,
  },
  S3 {
    config: S3Config,
    upload_options: S3UploadOptions,
  },
}
fn first_str<'a>(obj: &'a Map<String, Value>, keys: &[&str]) -> Option<&'a str> {
  keys
    .iter()
    .find_map(|k| obj.get(*k)?.as_str().map(str::trim).filter(|s| !s.is_empty()))
}
/// Like [`first_str`] but keeps surrounding whitespace, for signing secrets
/// whose exact bytes matter.
fn first_raw_nonempty_str<'a>(obj: &'a Map<String, Value>, keys: &[&str]) -> Option<&'a str> {
  keys
    .iter()
    .find_map(|k| obj.get(*k)?.as_str().filter(|s| !s.is_empty()))
}
fn cfg_err(err: StorageError) -> DomainError {
  match err {
    StorageError::Config(m) | StorageError::InvalidKey(m) => DomainError::Validation(m),
    other => storage_error(other),
  }
}
impl StorageBackendSpec {
  pub fn build(&self) -> Result<Arc<dyn BlobStorageBackend>, DomainError> {
    match self {
      Self::Fs {
        root,
        bucket,
        proxy_upload_secret,
        upload_url_prefix,
      } => {
        if root.trim().is_empty() {
          return Err(DomainError::Validation("storage root must not be empty".into()));
        }
        let mut fs = LocalFsBlobStorage::new(root, bucket).map_err(cfg_err)?;
        if let Some(s) = proxy_upload_secret.as_deref().filter(|s| !s.is_empty()) {
          fs = fs.with_proxy_upload(s, upload_url_prefix.clone());
        }
        Ok(Arc::new(fs))
      }
      Self::Assetpack {
        root,
        bucket,
        scope,
        precomp2,
      } => {
        if root.trim().is_empty() {
          return Err(DomainError::Validation("storage root must not be empty".into()));
        }
        Ok(Arc::new(
          AssetpackBlobStorage::new(root, bucket, scope)
            .map_err(cfg_err)?
            .with_precomp2(*precomp2),
        ))
      }
      Self::S3 { config, upload_options } => {
        if config.access_key_id.trim().is_empty() || config.secret_access_key.trim().is_empty() {
          return Err(DomainError::Validation("S3 credentials must not be empty".into()));
        }
        Ok(Arc::new(
          S3BlobStorage::new(config.clone())
            .map_err(cfg_err)?
            .with_upload_options(upload_options.clone()),
        ))
      }
    }
  }
  pub fn from_app_config_json(value: &Value, default_bucket: &str) -> Result<Option<Self>, DomainError> {
    Self::from_app_config_json_scoped(
      value,
      if default_bucket == "avatars" { "avatar" } else { "blob" },
      default_bucket,
    )
  }
  pub fn from_app_config_json_scoped(
    value: &Value,
    scope: &str,
    default_bucket: &str,
  ) -> Result<Option<Self>, DomainError> {
    let Some(obj) = value.as_object() else { return Ok(None) };
    let provider = obj
      .get("provider")
      .and_then(Value::as_str)
      .map(|s| s.trim().to_ascii_lowercase())
      .unwrap_or_default();
    if provider.is_empty() {
      return Ok(None);
    }
    let cfg = obj.get("config").and_then(Value::as_object);
    let bucket = obj
      .get("bucket")
      .and_then(Value::as_str)
      .or_else(|| cfg.and_then(|c| c.get("bucket")?.as_str()))
      .unwrap_or(default_bucket)
      .to_owned();
    let cfg_str = |ks: &[&str]| cfg.and_then(|c| first_str(c, ks)).map(str::to_owned);
    match provider.as_str() {
      "fs" | "local" | "assetpack" => {
        if let Some(raw_cfg) = obj.get("config")
          && !raw_cfg.is_null()
          && !raw_cfg.is_object()
        {
          return Err(DomainError::Validation(format!(
            "{provider} storage config must be an object"
          )));
        }
        let (root, proxy_upload_secret, upload_url_prefix) = (
          cfg_str(&["path", "root"]).unwrap_or_else(|| "~/.affine/storage".into()),
          cfg_str(&["proxyUploadSecret"]),
          cfg_str(&["uploadUrlPrefix"]),
        );
        Ok(Some(if provider == "assetpack" {
          let precomp2 = match cfg.and_then(|c| c.get("precomp2")) {
            None | Some(Value::Null) => true,
            Some(Value::Bool(enabled)) => *enabled,
            Some(_) => {
              return Err(DomainError::Validation(
                "assetpack config.precomp2 must be a boolean".into(),
              ));
            }
          };
          Self::Assetpack {
            root,
            bucket,
            scope: scope.to_owned(),
            precomp2,
          }
        } else {
          if cfg.is_some_and(|c| c.contains_key("precomp2")) {
            return Err(DomainError::Validation(
              "fs storage config does not support precomp2".into(),
            ));
          }
          Self::Fs {
            root,
            bucket,
            proxy_upload_secret,
            upload_url_prefix,
          }
        }))
      }
      "aws-s3" | "s3" | "cloudflare-r2" | "r2" => {
        let cfg = cfg.ok_or_else(|| DomainError::Validation("missing S3 storage config".into()))?;
        let is_r2 = matches!(provider.as_str(), "cloudflare-r2" | "r2");
        let region = first_str(cfg, &["region"]).unwrap_or("auto").to_owned();
        let endpoint = match (first_str(cfg, &["endpoint"]), is_r2) {
          (Some(ep), _) => Some(ep.to_owned()),
          (None, true) => {
            let acct = first_str(cfg, &["accountId"])
              .ok_or_else(|| DomainError::Validation("missing cloudflare-r2 accountId".into()))?;
            let eu = if cfg.get("jurisdiction").and_then(Value::as_str) == Some("eu") {
              ".eu"
            } else {
              ""
            };
            Some(format!("https://{acct}{eu}.r2.cloudflarestorage.com"))
          }
          (None, false) => None,
        };
        let (creds, pu) = (
          cfg.get("credentials").and_then(Value::as_object),
          cfg.get("usePresignedURL").and_then(Value::as_object),
        );
        let cred = |ks: &[&str]| creds.and_then(|c| first_str(c, ks)).or_else(|| first_str(cfg, ks));
        let pu_or = |a: &[&str], b: &[&str]| {
          pu.and_then(|o| first_str(o, a))
            .or_else(|| first_str(cfg, b))
            .map(str::to_owned)
        };
        let use_presigned_url = pu
          .and_then(|o| o.get("enabled")?.as_bool())
          .or_else(|| cfg.get("usePresignedUrl")?.as_bool())
          .unwrap_or(false);
        let proxy_upload_secret = pu
          .and_then(|o| first_raw_nonempty_str(o, &["signKey"]))
          .or_else(|| first_raw_nonempty_str(cfg, &["proxyUploadSecret"]))
          .map(str::to_owned);
        let upload_url_prefix = pu_or(&["urlPrefix"], &["uploadUrlPrefix"]);
        let presign_expires = match cfg.get("presign") {
          None | Some(Value::Null) => None,
          Some(presign) => {
            let presign = presign
              .as_object()
              .ok_or_else(|| DomainError::Validation("invalid S3 presign config".into()))?;
            match presign.get("expiresInSeconds") {
              None | Some(Value::Null) => None,
              Some(v) => Some(std::time::Duration::from_secs(v.as_u64().ok_or_else(|| {
                DomainError::Validation("invalid S3 presign.expiresInSeconds".into())
              })?)),
            }
          }
        };
        let request_timeout = match cfg.get("requestTimeoutMs") {
          None | Some(Value::Null) => None,
          Some(v) => {
            Some(std::time::Duration::from_millis(v.as_u64().ok_or_else(|| {
              DomainError::Validation("invalid S3 requestTimeoutMs".into())
            })?))
          }
        };
        let proxy_upload = cfg
          .get("proxyUpload")
          .and_then(Value::as_bool)
          .unwrap_or(use_presigned_url && proxy_upload_secret.is_some());
        Ok(Some(Self::S3 {
          config: S3Config {
            endpoint,
            region,
            bucket,
            access_key_id: cred(&["accessKeyId", "access_key_id"]).unwrap_or("").into(),
            secret_access_key: cred(&["secretAccessKey", "secret_access_key"]).unwrap_or("").into(),
            session_token: cred(&["sessionToken"]).map(str::to_owned),
            force_path_style: is_r2 || cfg.get("forcePathStyle").and_then(Value::as_bool).unwrap_or(false),
            request_timeout,
            presign_expires,
          },
          upload_options: S3UploadOptions {
            custom_get_sign: is_r2
              && use_presigned_url
              && upload_url_prefix.as_deref().is_some_and(|s| !s.is_empty())
              && proxy_upload_secret.as_deref().is_some_and(|s| !s.is_empty()),
            use_presigned_url,
            proxy_upload,
            upload_url_prefix,
            proxy_upload_secret,
          },
        }))
      }
      other => Err(DomainError::Validation(format!(
        "unsupported storage provider `{other}`"
      ))),
    }
  }
}
fn res_obj_key(ws: &str, rid: &str, key: &str) -> Result<String, DomainError> {
  validate_blob_key(ws)?;
  validate_blob_key(key)?;
  ensure(
    !rid.is_empty() && !rid.contains('/') && !rid.contains('\\') && !rid.contains(".."),
    "invalid reservation id",
  )?;
  Ok(format!("{ws}/.reservations/{rid}/{key}"))
}
fn sign_proxy(
  storage: &dyn BlobStorageBackend,
  ext_url: &str,
  path: &str,
  fields: &[Value],
  extra: &[(&str, &str)],
) -> Result<Option<(String, DateTime<Utc>)>, DomainError> {
  let exp_dt = Utc::now() + chrono::Duration::seconds(600);
  let exp = exp_dt.timestamp();
  let Some(token) = storage.sign_upload_token(path, fields, exp) else {
    return Ok(None);
  };
  let url_cfg = storage.upload_url_config();
  let base = url_cfg
    .as_ref()
    .and_then(|c| c.url_prefix.as_deref())
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or(ext_url)
    .trim_end_matches('/');
  let mut parsed =
    url::Url::parse(&format!("{base}{path}")).map_err(|e| DomainError::Internal(format!("invalid proxy url: {e}")))?;
  parsed
    .query_pairs_mut()
    .extend_pairs(extra.iter().copied())
    .append_pair("expiresAt", &exp.to_string())
    .append_pair("token", &token);
  Ok(Some((parsed.into(), exp_dt)))
}
struct PendingBlobRow {
  size: i64,
  mime: String,
  status: String,
  reservation_id: Option<String>,
  upload_id: Option<String>,
  deleted: bool,
  live_reservation: bool,
}
impl BlobService {
  async fn conn(&self, tier: WorkloadTier) -> Result<server_db::TieredConn, DomainError> {
    self
      .db
      .acquire_tiered(tier)
      .await
      .map_err(|e| DomainError::Unavailable(e.to_string()))
  }
  async fn with_object_lock<T, Fut>(&self, ws: &str, obj_key: &str, f: Fut) -> Result<T, DomainError>
  where
    Fut: std::future::Future<Output = Result<T, DomainError>>,
  {
    let lock = StorageObjectLock::acquire(&self.db, &self.lock_permits, ws, obj_key).await?;
    let res = f.await;
    lock.release().await;
    res
  }
  pub fn current_backend_identity(&self) -> crate::StorageBackendIdentity {
    self.dynamic_storage.backend_identity()
  }
  pub async fn write_reload(&self) -> tokio::sync::RwLockWriteGuard<'_, ()> {
    self.dynamic_storage.write_reload().await
  }
  pub fn swap_storage_backend(&self, candidate: Arc<dyn BlobStorageBackend>) {
    self.dynamic_storage.swap_backend(candidate);
  }
  pub fn reset_to_boot_storage(&self) {
    self.dynamic_storage.swap_backend(Arc::clone(&self.boot_storage));
  }
  pub async fn init_storage_backend(&self, candidate: Arc<dyn BlobStorageBackend>) {
    let _g = self.dynamic_storage.write_reload().await;
    self.dynamic_storage.swap_backend(candidate);
  }
  pub async fn reload_storage_backend(&self, candidate: Arc<dyn BlobStorageBackend>) -> Result<(), DomainError> {
    let _g = self.dynamic_storage.write_reload().await;
    if self.dynamic_storage.backend_identity() != candidate.backend_identity() {
      let sql = "SELECT COUNT(*)::bigint FROM blobs WHERE status='pending' AND deleted_at IS NULL AND upload_id IS NOT NULL AND reservation_expires_at > clock_timestamp()";
      let active: i64 = sqlx::query_scalar(sql)
        .fetch_one(self.conn(WorkloadTier::InteractiveRead).await?.as_conn())
        .await
        .map_err(db_error("check active multipart"))?;
      if active > 0 {
        return Err(DomainError::Conflict(format!(
          "cannot switch storage backend while {active} multipart upload(s) are active"
        )));
      }
    }
    self.dynamic_storage.swap_backend(candidate);
    Ok(())
  }
  async fn load_blob_row(&self, ws: &str, key: &str) -> Result<Option<PendingBlobRow>, DomainError> {
    let sql = "SELECT size::bigint AS size, mime, status::text AS status, reservation_id::text AS reservation_id, \
               upload_id, deleted_at IS NOT NULL AS deleted, COALESCE(reservation_expires_at > clock_timestamp(), false) AS live_reservation \
               FROM blobs WHERE workspace_id=$1 AND key=$2";
    let row = sqlx::query(sql)
      .bind(ws)
      .bind(key)
      .fetch_optional(self.conn(WorkloadTier::InteractiveRead).await?.as_conn())
      .await
      .map_err(db_error("load blob row"))?;
    Ok(row.map(|r| PendingBlobRow {
      size: r.get("size"),
      mime: r.get("mime"),
      status: r.get("status"),
      reservation_id: r.get("reservation_id"),
      upload_id: r.get("upload_id"),
      deleted: r.get("deleted"),
      live_reservation: r.get("live_reservation"),
    }))
  }
  async fn load_pending_res(
    &self,
    ws: &str,
    key: &str,
    missing_msg: &str,
  ) -> Result<(PendingBlobRow, String), DomainError> {
    let rec = self
      .load_blob_row(ws, key)
      .await?
      .ok_or_else(|| blob_invalid(missing_msg))?;
    ensure(
      rec.status != "completed" && !rec.deleted,
      "Blob upload is already completed",
    )?;
    ensure(rec.live_reservation, "Blob upload reservation expired")?;
    let rid = rec
      .reservation_id
      .clone()
      .ok_or_else(|| blob_invalid("Missing blob reservation"))?;
    Ok((rec, rid))
  }
  fn check_proxy_token(
    &self,
    path: &str,
    fields: &[Value],
    exp: i64,
    tok: &str,
  ) -> Result<Arc<dyn BlobStorageBackend>, DomainError> {
    let s = self.dynamic_storage.current();
    ensure(
      s.upload_url_config().is_some_and(|c| c.proxy_upload),
      "Invalid endpoint",
    )?;
    ensure(exp >= Utc::now().timestamp(), "Upload URL expired")?;
    ensure(s.verify_upload_token(path, fields, exp, tok), "Invalid upload token")?;
    Ok(s)
  }
  #[allow(clippy::too_many_arguments)]
  pub async fn init_blob_upload(
    &self,
    ws: &str,
    key: &str,
    size: i64,
    mime: &str,
    ext_url: &str,
    thresh: i64,
    part_sz: i64,
  ) -> Result<BlobUploadInitPlan, DomainError> {
    let obj_key = blob_object_key(ws, key)?;
    ensure(size >= 0, "blob size must be non-negative")?;
    if size > i64::from(i32::MAX) {
      return Err(DomainError::QuotaExceeded {
        kind: "blob_limit",
        message: format!("blob of {size} bytes exceeds the database size range"),
      });
    }
    let mime = if mime.trim().is_empty() {
      "application/octet-stream"
    } else {
      mime
    };
    let (eff_part, eff_thresh) = (part_sz.max(1), thresh.max(1));
    let _reload_guard = self.dynamic_storage.read_reload().await;
    let storage = self.dynamic_storage.current();
    self.with_object_lock(ws, &obj_key, async {
      if let Some(ex) = self.load_blob_row(ws, key).await? {
        if ex.status == "completed" && !ex.deleted {
          ensure(ex.size == size, "Blob size mismatch")?;
          if storage.head(&obj_key).await.map_err(storage_error)?.is_some_and(|h| h.content_length == size) {
            return Ok(BlobUploadInitPlan::simple(key, UploadInitMethod::Graphql, true));
          }
        } else if ex.status == "pending" && !ex.deleted && ex.live_reservation
          && let (Some(rid), Some(uid)) = (ex.reservation_id.as_deref(), ex.upload_id.as_deref())
          && storage.capabilities().multipart_direct
        {
          ensure(ex.size == size, "Blob size mismatch")?;
          let rok = res_obj_key(ws, rid, key)?;
          if let Some(parts) = storage.list_multipart_parts(&rok, uid).await.map_err(storage_error)? {
            return Ok(BlobUploadInitPlan {
              upload_id: Some(uid.to_owned()), part_size: Some(i32::try_from(eff_part).unwrap_or(i32::MAX)),
              uploaded_parts: Some(parts), ..BlobUploadInitPlan::simple(key, UploadInitMethod::Multipart, false)
            });
          }
        }
      }
      let caps = storage.capabilities();
      let wants_direct = caps.presign_put || (caps.multipart_direct && size >= eff_thresh);
      let rid = {
        let mut tx = self.begin_write().await?;
        match self.reserve(tx.tx_mut(), ws, key, mime, size).await {
          Ok(Admission::Existing(_)) => { let _ = tx.rollback().await; return Ok(BlobUploadInitPlan::simple(key, UploadInitMethod::Graphql, true)); }
          Ok(Admission::Reserved(_)) if !wants_direct => { let _ = tx.rollback().await; return Ok(BlobUploadInitPlan::simple(key, UploadInitMethod::Graphql, false)); }
          Ok(Admission::Reserved(id)) => { tx.commit().await.map_err(|e| DomainError::Internal(e.to_string()))?; id }
          Err(err) => { let _ = tx.rollback().await; return Err(err); }
        }
      };
      let (mut uid_rec, mut plan, mut direct_err) = (None, None, false);
      let rok = res_obj_key(ws, &rid, key)?;
      let finish_res = async {
        if caps.multipart_direct && size >= eff_thresh {
          match storage.create_multipart_upload(&rok, mime).await {
            Ok(Some(mp)) => {
              uid_rec = Some(mp.upload_id.clone());
              plan = Some(BlobUploadInitPlan {
                upload_id: Some(mp.upload_id), expires_at: Some(mp.expires_at),
                part_size: Some(i32::try_from(eff_part).unwrap_or(i32::MAX)), uploaded_parts: Some(Vec::new()),
                ..BlobUploadInitPlan::simple(key, UploadInitMethod::Multipart, false)
              });
            }
            Ok(None) => {}
            Err(err) => { tracing::warn!(error = %err, "multipart upload init failed; falling back to graphql"); direct_err = true; }
          }
        }
        if !direct_err && plan.is_none() && caps.presign_put {
          if caps.proxy_upload {
            let sz = size.to_string();
            let fields = [json!(ws), json!(key), json!(mime), json!(size)];
            let extra = [("workspaceId", ws), ("key", key), ("contentType", mime), ("contentLength", sz.as_str())];
            match sign_proxy(storage.as_ref(), ext_url, PROXY_UPLOAD_PATH, &fields, &extra) {
              Ok(Some((u, exp))) => plan = Some(BlobUploadInitPlan::presigned(key, u, BTreeMap::from([("content-type".into(), mime.into()), ("content-length".into(), sz)]), exp)),
              Ok(None) => {}
              Err(e) => tracing::warn!(error = %e, "proxy presign init failed; falling back to graphql"),
            }
          } else {
            match storage.presign_put(&rok, mime, size).await {
              Ok(Some(p)) => plan = Some(BlobUploadInitPlan::presigned(key, p.url, p.headers, p.expires_at)),
              Ok(None) => {}
              Err(e) => tracing::warn!(error = %e, "presign_put init failed; falling back to graphql"),
            }
          }
        }
        let mut tx = self.begin_write().await?;
        if uid_rec.is_some() {
          sqlx::query("SELECT pg_advisory_xact_lock_shared(hashtextextended('storages.blob.storage:reload', 0))")
            .execute(&mut **tx.tx_mut()).await.map_err(db_error("shared lock blob storage reload"))?;
          let sql = "SELECT id, value FROM app_configs WHERE id = 'storages' OR id LIKE 'storages.blob%' ORDER BY id ASC";
          let rows: Vec<(String, Value)> = sqlx::query_as(sql).fetch_all(&mut **tx.tx_mut()).await.map_err(db_error("check blob cfg"))?;
          let mut merged = Value::Object(Map::new());
          for (k, v) in rows {
            let (mut cur, mut it) = (&mut merged, k.split('.').peekable());
            while let Some(p) = it.next() {
              if !cur.is_object() { *cur = Value::Object(Map::new()); }
              let m = cur.as_object_mut().unwrap();
              if it.peek().is_none() { m.insert(p.to_owned(), v); break; }
              cur = m.entry(p.to_owned()).or_insert_with(|| Value::Object(Map::new()));
            }
          }
          let latest_id = merged.pointer("/storages/blob/storage")
            .map(|r| StorageBackendSpec::from_app_config_json(r, "blobs")).transpose()?.flatten()
            .map(|s| s.build().map(|b| b.backend_identity())).transpose()?
            .unwrap_or_else(|| self.boot_storage.backend_identity());
          if latest_id != storage.backend_identity() { return Err(DomainError::Conflict("storage backend changed during upload init".into())); }
        }
        if plan.is_some() {
          let sql = "UPDATE blobs SET upload_id=$4 WHERE workspace_id=$1 AND key=$2 AND status='pending' AND reservation_id=$3::uuid";
          sqlx::query(sql).bind(ws).bind(key).bind(&rid).bind(uid_rec.as_deref()).execute(&mut **tx.tx_mut()).await.map_err(db_error("set upload_id"))?;
        } else {
          let sql = "DELETE FROM blobs WHERE workspace_id=$1 AND key=$2 AND status='pending' AND reservation_id=$3::uuid";
          sqlx::query(sql).bind(ws).bind(key).bind(&rid).execute(&mut **tx.tx_mut()).await.map_err(db_error("clear fallback reservation"))?;
        }
        tx.commit().await.map_err(|e| DomainError::Internal(e.to_string()))
      }.await;
      if let Err(err) = finish_res {
        if let Some(uid) = uid_rec.as_deref() { let _ = storage.abort_multipart_upload(&rok, uid).await; }
        if let Ok(mut conn) = self.conn(WorkloadTier::InteractiveWrite).await {
          let sql = "DELETE FROM blobs WHERE workspace_id=$1 AND key=$2 AND status='pending' AND reservation_id=$3::uuid";
          let _ = sqlx::query(sql).bind(ws).bind(key).bind(&rid).execute(conn.as_conn()).await;
        }
        return Err(err);
      }
      Ok(plan.unwrap_or_else(|| BlobUploadInitPlan::simple(key, UploadInitMethod::Graphql, false)))
    }).await
  }
  pub async fn get_blob_upload_part_url(
    &self,
    ws: &str,
    key: &str,
    uid: &str,
    pn: i32,
    ext_url: &str,
    part_sz: i64,
  ) -> Result<BlobUploadPartPlan, DomainError> {
    validate_blob_key(ws)?;
    validate_blob_key(key)?;
    ensure(pn >= 1, "Invalid part number")?;
    let eff_part = part_sz.max(1);
    let rec = self
      .load_blob_row(ws, key)
      .await?
      .ok_or_else(|| blob_invalid("Multipart upload is not initialized"))?;
    ensure(
      rec.status == "pending" && !rec.deleted && rec.live_reservation,
      "Multipart upload is not active",
    )?;
    ensure(rec.upload_id.as_deref() == Some(uid), "Upload id mismatch")?;
    let rid = rec
      .reservation_id
      .as_deref()
      .ok_or_else(|| blob_invalid("Missing blob reservation"))?;
    let offset = i64::from(pn - 1).saturating_mul(eff_part);
    ensure(offset < rec.size, "Part number exceeds upload size")?;
    let exp_len = (rec.size - offset).min(eff_part);
    let storage = self.dynamic_storage.current();
    let caps = storage.capabilities();
    ensure(caps.multipart_direct, "Multipart upload is not supported")?;
    if caps.proxy_upload {
      let (ps, ls) = (pn.to_string(), exp_len.to_string());
      let fields = [json!(ws), json!(key), json!(uid), json!(pn), json!(exp_len)];
      let extra = [
        ("workspaceId", ws),
        ("key", key),
        ("uploadId", uid),
        ("partNumber", ps.as_str()),
        ("contentLength", ls.as_str()),
      ];
      let (url, exp) = sign_proxy(storage.as_ref(), ext_url, PROXY_MULTIPART_PATH, &fields, &extra)?
        .ok_or_else(|| blob_invalid("Upload proxy is not configured"))?;
      return Ok(BlobUploadPartPlan {
        upload_url: url,
        headers: Some(BTreeMap::from([("content-length".into(), ls)])),
        expires_at: Some(exp),
      });
    }
    let part = storage
      .presign_upload_part(&res_obj_key(ws, rid, key)?, uid, pn)
      .await
      .map_err(storage_error)?
      .ok_or_else(|| blob_invalid("Multipart upload is not supported"))?;
    Ok(BlobUploadPartPlan {
      upload_url: part.url,
      headers: Some(part.headers),
      expires_at: Some(part.expires_at),
    })
  }
  pub async fn verify_proxy_upload_request(
    &self,
    ws: &str,
    key: &str,
    ct: &str,
    len: i64,
    exp: i64,
    tok: &str,
  ) -> Result<VerifiedProxyUpload, DomainError> {
    let storage = self.check_proxy_token(
      PROXY_UPLOAD_PATH,
      &[json!(ws), json!(key), json!(ct), json!(len)],
      exp,
      tok,
    )?;
    let obj_key = blob_object_key(ws, key)?;
    let (rec, rid) = self.load_pending_res(ws, key, "Blob upload is not initialized").await?;
    ensure(rec.size == len, "Content length does not match upload metadata")?;
    ensure(
      rec.mime.is_empty() || ct.is_empty() || rec.mime == ct,
      "Mime type mismatch",
    )?;
    let rok = res_obj_key(ws, &rid, key)?;
    Ok(VerifiedProxyUpload {
      ws: ws.into(),
      key: key.into(),
      rid,
      obj_key,
      rok,
      ct: ct.into(),
      len,
      storage,
    })
  }
  pub async fn write_proxy_upload_object(&self, v: VerifiedProxyUpload, body: Vec<u8>) -> Result<(), DomainError> {
    ensure(
      i64::try_from(body.len()).unwrap_or(i64::MAX) == v.len,
      "Content length mismatch",
    )?;
    self.with_object_lock(&v.ws, &v.obj_key, async {
      let sql = "SELECT EXISTS(SELECT 1 FROM blobs WHERE workspace_id=$1 AND key=$2 AND reservation_id=$3::uuid AND status='pending' AND deleted_at IS NULL AND reservation_expires_at > clock_timestamp())";
      let live: bool = sqlx::query_scalar(sql).bind(&v.ws).bind(&v.key).bind(&v.rid)
        .fetch_one(self.conn(WorkloadTier::InteractiveRead).await?.as_conn()).await.map_err(db_error("recheck reservation"))?;
      ensure(live, "Blob upload reservation expired")?;
      v.storage.put(&v.rok, body, &v.ct).await.map(|_| ()).map_err(storage_error)
    }).await
  }
  #[allow(clippy::too_many_arguments)]
  pub async fn verify_proxy_multipart_request(
    &self,
    ws: &str,
    key: &str,
    uid: &str,
    pn: i32,
    len: i64,
    exp: i64,
    tok: &str,
    part_sz: i64,
  ) -> Result<VerifiedProxyMultipart, DomainError> {
    ensure(pn >= 1, "Invalid part number")?;
    ensure(len >= 1, "Invalid content length")?;
    let storage = self.check_proxy_token(
      PROXY_MULTIPART_PATH,
      &[json!(ws), json!(key), json!(uid), json!(pn), json!(len)],
      exp,
      tok,
    )?;
    let (eff_part, obj_key) = (part_sz.max(1), blob_object_key(ws, key)?);
    let (rec, rid) = self
      .load_pending_res(ws, key, "Multipart upload is not initialized")
      .await?;
    ensure(rec.upload_id.as_deref() == Some(uid), "Upload id mismatch")?;
    let offset = i64::from(pn - 1).saturating_mul(eff_part);
    ensure(
      i64::from(pn) <= (rec.size + eff_part - 1) / eff_part,
      "Part number exceeds upload size",
    )?;
    ensure(
      offset.saturating_add(len) <= rec.size,
      "Part size exceeds upload metadata",
    )?;
    Ok(VerifiedProxyMultipart {
      ws: ws.into(),
      obj_key,
      rok: res_obj_key(ws, &rid, key)?,
      uid: uid.into(),
      pn,
      len,
      storage,
    })
  }
  pub async fn write_proxy_multipart_part(
    &self,
    v: VerifiedProxyMultipart,
    body: Vec<u8>,
  ) -> Result<String, DomainError> {
    ensure(
      i64::try_from(body.len()).unwrap_or(i64::MAX) == v.len,
      "Content length mismatch",
    )?;
    self
      .with_object_lock(&v.ws, &v.obj_key, async {
        v.storage
          .upload_part(&v.rok, &v.uid, v.pn, body)
          .await
          .map_err(storage_error)
      })
      .await
  }
  pub async fn complete_blob_upload(
    &self,
    ws: &str,
    key: &str,
    upload_id: Option<&str>,
    parts: Option<&[UploadedPart]>,
  ) -> Result<String, DomainError> {
    let (obj_key, storage) = (blob_object_key(ws, key)?, self.dynamic_storage.current());
    self
      .with_object_lock(ws, &obj_key, async {
        let rec = self
          .load_blob_row(ws, key)
          .await?
          .ok_or_else(|| DomainError::NotFound(format!("blob_not_found:{ws}:{key}")))?;
        if rec.status == "completed" && !rec.deleted {
          return Ok(key.to_owned());
        }
        ensure(!rec.deleted && rec.live_reservation, "Blob reservation changed")?;
        let rid = rec
          .reservation_id
          .as_deref()
          .ok_or_else(|| blob_invalid("Missing blob reservation"))?;
        let rok = res_obj_key(ws, rid, key)?;
        let has_mp = upload_id.is_some() || parts.is_some_and(|p| !p.is_empty());
        if let Some(expected_uid) = rec.upload_id.as_deref() {
          let (Some(req_uid), Some(req_parts)) = (upload_id, parts.filter(|p| !p.is_empty())) else {
            return Err(blob_invalid("Multipart upload requires both uploadId and parts"));
          };
          ensure(req_uid == expected_uid, "Upload id mismatch")?;
          if storage.head(&rok).await.map_err(storage_error)?.is_none()
            && storage.head(&obj_key).await.map_err(storage_error)?.is_none()
          {
            storage
              .complete_multipart_upload(&rok, req_uid, req_parts)
              .await
              .map_err(|err| match err {
                StorageError::Metadata(m) | StorageError::InvalidKey(m) => blob_invalid(m),
                other => storage_error(other),
              })?;
          }
        } else {
          ensure(!has_mp, "Multipart upload is not initialized")?;
        }
        let promoted_by_us = if let Some(res_meta) = storage.head(&rok).await.map_err(storage_error)? {
          ensure(res_meta.content_length == rec.size, "Blob metadata mismatch")?;
          if let Some(ex) = storage.head(&obj_key).await.map_err(storage_error)? {
            let crc_conflict = ex.checksum_crc32.is_some()
              && res_meta.checksum_crc32.is_some()
              && ex.checksum_crc32 != res_meta.checksum_crc32;
            ensure(
              ex.content_length == res_meta.content_length && !crc_conflict,
              "storage final object collision",
            )?;
            false
          } else {
            let promoted = storage
              .promote_object(&rok, &obj_key, &rec.mime)
              .await
              .map_err(storage_error)?;
            if promoted.content_length != rec.size {
              let _ = storage.delete(&obj_key).await;
              return Err(blob_invalid("Blob metadata mismatch"));
            }
            true
          }
        } else if let Some(final_meta) = storage.head(&obj_key).await.map_err(storage_error)? {
          ensure(final_meta.content_length == rec.size, "Blob metadata mismatch")?;
          false
        } else {
          return Err(DomainError::NotFound(format!("blob_not_found:{ws}:{key}")));
        };
        if self.complete_reservation(ws, key, rid).await?.is_none() {
          if promoted_by_us {
            let _ = storage.delete(&obj_key).await;
          }
          return Err(blob_invalid("Blob reservation changed"));
        }
        let _ = storage.delete(&rok).await;
        Ok(key.to_owned())
      })
      .await
  }
  pub async fn abort_blob_upload(&self, ws: &str, key: &str, upload_id: &str) -> Result<bool, DomainError> {
    let (obj_key, storage) = (blob_object_key(ws, key)?, self.dynamic_storage.current());
    self.with_object_lock(ws, &obj_key, async {
      let Some(rec) = self.load_blob_row(ws, key).await? else { return Ok(false) };
      let Some(rid) = rec.reservation_id.as_deref() else { return Ok(false) };
      if rec.status != "pending" || rec.deleted || rec.upload_id.as_deref() != Some(upload_id) { return Ok(false); }
      let rok = res_obj_key(ws, rid, key)?;
      let aborted = storage.abort_multipart_upload(&rok, upload_id).await.map_err(storage_error)?;
      let _ = storage.delete(&rok).await;
      let sql = "UPDATE blobs SET deleted_at = clock_timestamp(), reservation_expires_at = NULL WHERE workspace_id = $1 AND key = $2 AND reservation_id = $3::uuid AND status = 'pending'";
      sqlx::query(sql).bind(ws).bind(key).bind(rid).execute(self.conn(WorkloadTier::InteractiveWrite).await?.as_conn()).await.map_err(db_error("soft-delete aborted blob"))?;
      Ok(aborted)
    }).await
  }
  pub const DEFAULT_MULTIPART_PART_SIZE: i64 = MULTIPART_PART_SIZE;
  pub const DEFAULT_MULTIPART_THRESHOLD: i64 = MULTIPART_THRESHOLD;
}
