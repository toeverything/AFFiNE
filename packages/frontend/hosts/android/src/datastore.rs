//! Jetpack Preferences DataStore wire codec and `0.27.5` `auth-sessions`
//! credential contract (`v1:<iv>:<ct>` AES-GCM envelope, Unix ms `i64`
//! `accessExpiresAt`, and `auth-installation-id` reuse).
//!
//! Aligns byte-for-byte with:
//! - `packages/frontend/apps/android/App/app/src/main/java/app/affine/pro/utils/DataStore.kt`
//! - `packages/frontend/apps/android/App/app/src/main/java/app/affine/pro/plugin/AuthPlugin.kt`

use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

pub use affine_store::auth::{
    PERMANENT_AUTH_ERROR_CODES, canonical_endpoint, is_permanent_auth_error_code,
    legacy_storage_endpoint_key,
};
use affine_store::{
    api_client::{
        ApiClientKind, ApiHttpRequest, ApiRequestContext, AuthSessionExchangeRequest,
        HEADER_AFFINE_VERSION, HEADER_CLIENT_KIND, build_auth_session_exchange_request,
        build_auth_session_refresh_request, build_auth_session_revoke_request,
    },
    auth::{
        MAX_EXPIRES_IN_SECS as STORE_MAX_EXPIRES_IN_SECS,
        MIN_EXPIRES_IN_SECS as STORE_MIN_EXPIRES_IN_SECS, STORED_TOKEN_PAIR_VERSION,
        is_bearer_token_type, is_valid_rfc3339, normalize_rfc3339_utc_z,
    },
    sync::DEFAULT_CLIENT_VERSION,
};
use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Jetpack Preferences DataStore name for Android auth credentials.
pub const AUTH_DATASTORE_NAME: &str = "auth-sessions";

/// On-disk filename inside `<filesDir>/datastore/`.
pub const AUTH_DATASTORE_FILE: &str = "auth-sessions.preferences_pb";

/// Plaintext preference key holding the persistent installation UUID.
pub const AUTH_INSTALLATION_ID_KEY: &str = "auth-installation-id";

/// Prefix for per-endpoint encrypted session keys (`auth-token:<canonical>`).
pub const AUTH_TOKEN_KEY_PREFIX: &str = "auth-token:";

/// Prefix for Android Keystore AES-GCM key aliases.
pub const KEYSTORE_ALIAS_PREFIX: &str = "affine-auth-session-";

/// Header identifying native mobile auth requests to AFFiNE server endpoints.
pub const AUTH_CLIENT_KIND_HEADER: &str = HEADER_CLIENT_KIND;
pub const AUTH_CLIENT_KIND_VALUE: &str = ApiClientKind::Native.as_str();

/// Header identifying the compatible AFFiNE mobile client version (`0.27.5`).
pub const AUTH_CLIENT_VERSION_HEADER: &str = HEADER_AFFINE_VERSION;
pub const AUTH_CLIENT_VERSION_VALUE: &str = DEFAULT_CLIENT_VERSION;

/// Ciphertext envelope version prefix (`v1:<base64_iv>:<base64_ct_and_tag>`).
pub const AUTH_CIPHERTEXT_PREFIX: &str = "v1";

/// AES-GCM IV size in bytes (96-bit nonce).
pub const AUTH_GCM_IV_LEN: usize = 12;

/// AES-GCM authentication tag size in bytes (128-bit tag).
pub const AUTH_GCM_TAG_LEN: usize = 16;

/// Proactive refresh threshold matching `AuthPlugin.kt` (120 seconds).
pub const AUTH_REFRESH_LEAD_MS: i64 = 120_000;

/// Minimum allowed `expiresIn` in seconds (`1..=86_400`).
pub const MIN_EXPIRES_IN_SECS: i64 = STORE_MIN_EXPIRES_IN_SECS as i64;

/// Maximum allowed `expiresIn` in seconds (`1..=86_400`).
pub const MAX_EXPIRES_IN_SECS: i64 = STORE_MAX_EXPIRES_IN_SECS as i64;

/// Errors returned by the DataStore protobuf codec and auth payload validator.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DataStoreError {
    MalformedProtobuf(String),
    InvalidCiphertext(String),
    InvalidSessionPayload(String),
    Io(String),
}

impl std::fmt::Display for DataStoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MalformedProtobuf(msg) => write!(f, "malformed datastore protobuf: {msg}"),
            Self::InvalidCiphertext(msg) => write!(f, "invalid v1 ciphertext: {msg}"),
            Self::InvalidSessionPayload(msg) => write!(f, "invalid auth session payload: {msg}"),
            Self::Io(msg) => write!(f, "datastore I/O error: {msg}"),
        }
    }
}

impl std::error::Error for DataStoreError {}

/// Returns `<filesDir>/datastore/auth-sessions.preferences_pb`.
pub fn auth_datastore_path(files_dir: &Path) -> PathBuf {
    files_dir.join("datastore").join(AUTH_DATASTORE_FILE)
}

/// Returns the DataStore preference key `auth-token:<legacy_storage_endpoint_key>`.
pub fn auth_token_key(endpoint: &str) -> String {
    format!(
        "{AUTH_TOKEN_KEY_PREFIX}{}",
        legacy_storage_endpoint_key(endpoint)
    )
}

/// Computes the Android Keystore alias identically to `TokenCipher.alias` in `AuthPlugin.kt`.
///
/// Format: `affine-auth-session-<first 24 chars of URL-safe base64(SHA-256(legacy_storage_endpoint_key))>`.
pub fn keystore_alias(endpoint: &str) -> String {
    let storage_key = legacy_storage_endpoint_key(endpoint);
    let digest = Sha256::digest(storage_key.as_bytes());
    let encoded = URL_SAFE.encode(digest);
    format!("{KEYSTORE_ALIAS_PREFIX}{}", &encoded[..24])
}

/// Parsed `v1:<base64_iv>:<base64_ciphertext_and_tag>` AES-GCM ciphertext envelope.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct V1EncryptedEnvelope {
    pub iv: [u8; AUTH_GCM_IV_LEN],
    pub ciphertext_and_tag: Vec<u8>,
}

impl V1EncryptedEnvelope {
    /// Parses and validates a `v1:<iv>:<ct>` string produced by `TokenCipher.encrypt`.
    pub fn parse(encoded: &str) -> Result<Self, DataStoreError> {
        let mut parts = encoded.split(':');
        let version = parts
            .next()
            .ok_or_else(|| DataStoreError::InvalidCiphertext("missing version".into()))?;
        let iv_b64 = parts
            .next()
            .ok_or_else(|| DataStoreError::InvalidCiphertext("missing iv".into()))?;
        let ct_b64 = parts
            .next()
            .ok_or_else(|| DataStoreError::InvalidCiphertext("missing ciphertext".into()))?;
        if parts.next().is_some() {
            return Err(DataStoreError::InvalidCiphertext(
                "unexpected extra ':' segments".into(),
            ));
        }
        if version != AUTH_CIPHERTEXT_PREFIX {
            return Err(DataStoreError::InvalidCiphertext(format!(
                "unsupported version prefix {version:?}"
            )));
        }

        let iv_bytes = STANDARD
            .decode(iv_b64)
            .map_err(|e| DataStoreError::InvalidCiphertext(format!("invalid iv base64: {e}")))?;
        let iv: [u8; AUTH_GCM_IV_LEN] = iv_bytes.try_into().map_err(|v: Vec<u8>| {
            DataStoreError::InvalidCiphertext(format!(
                "expected {AUTH_GCM_IV_LEN}-byte GCM IV, got {}",
                v.len()
            ))
        })?;

        let ciphertext_and_tag = STANDARD.decode(ct_b64).map_err(|e| {
            DataStoreError::InvalidCiphertext(format!("invalid ciphertext base64: {e}"))
        })?;
        if ciphertext_and_tag.len() < AUTH_GCM_TAG_LEN {
            return Err(DataStoreError::InvalidCiphertext(format!(
                "ciphertext shorter than {AUTH_GCM_TAG_LEN}-byte GCM tag"
            )));
        }

        Ok(Self {
            iv,
            ciphertext_and_tag,
        })
    }

    /// Formats the envelope as `v1:<base64_iv>:<base64_ciphertext_and_tag>` (`NO_WRAP`).
    pub fn format(&self) -> String {
        format!(
            "{AUTH_CIPHERTEXT_PREFIX}:{}:{}",
            STANDARD.encode(self.iv),
            STANDARD.encode(&self.ciphertext_and_tag),
        )
    }
}

/// Nested `session` object in an Android stored auth session JSON payload.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionMeta {
    pub absolute_expires_at: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

/// Stored Android `auth-sessions` JSON payload matching `AuthPlugin.kt:215-245`.
///
/// `access_expires_at` is strictly **1970 Unix epoch milliseconds (`i64`)**,
/// matching Android `System.currentTimeMillis() + expiresIn * 1000`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionRecord {
    pub version: u32,
    pub token_type: String,
    pub access_token: String,
    pub access_expires_at: i64,
    pub refresh_token: String,
    pub refresh_expires_at: String,
    pub session: AuthSessionMeta,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

/// Validates RFC 3339 timestamps (both `Z` and `±HH:MM` offsets) via `affine-store`.
pub fn is_valid_iso8601_utc(value: &str) -> bool {
    is_valid_rfc3339(value)
}

impl AuthSessionRecord {
    /// Converts a server `/api/auth/session/{exchange,refresh}` response into a
    /// stored `version = 1` payload with 1970 Unix ms `i64` `accessExpiresAt`.
    pub fn from_server_response(response_json: &str, now_ms: i64) -> Result<Self, DataStoreError> {
        let mut obj: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(response_json)
                .map_err(|e| DataStoreError::InvalidSessionPayload(e.to_string()))?;

        let expires_in = obj
            .remove("expiresIn")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| {
                DataStoreError::InvalidSessionPayload("missing integer expiresIn".into())
            })?;
        if !(MIN_EXPIRES_IN_SECS..=MAX_EXPIRES_IN_SECS).contains(&expires_in) {
            return Err(DataStoreError::InvalidSessionPayload(format!(
                "expiresIn out of range 1..=86400: {expires_in}"
            )));
        }

        let access_expires_at = now_ms
            .checked_add(expires_in.saturating_mul(1_000))
            .ok_or_else(|| {
                DataStoreError::InvalidSessionPayload("accessExpiresAt overflow".into())
            })?;
        obj.insert("version".into(), serde_json::Value::from(1u32));
        obj.insert(
            "accessExpiresAt".into(),
            serde_json::Value::from(access_expires_at),
        );

        let mut record: Self = serde_json::from_value(serde_json::Value::Object(obj))
            .map_err(|e| DataStoreError::InvalidSessionPayload(e.to_string()))?;
        record.validate()?;
        record.normalize_for_storage()?;
        Ok(record)
    }

    /// Parses and validates a decrypted stored Android auth session JSON string.
    pub fn from_stored_json(plaintext: &str) -> Result<Self, DataStoreError> {
        let raw: serde_json::Value = serde_json::from_str(plaintext)
            .map_err(|e| DataStoreError::InvalidSessionPayload(e.to_string()))?;
        let access_exp_val = raw.get("accessExpiresAt").ok_or_else(|| {
            DataStoreError::InvalidSessionPayload("missing accessExpiresAt".into())
        })?;
        if !access_exp_val.is_i64() {
            return Err(DataStoreError::InvalidSessionPayload(
                "accessExpiresAt must be a 1970 Unix millisecond i64".into(),
            ));
        }

        let record: Self = serde_json::from_value(raw)
            .map_err(|e| DataStoreError::InvalidSessionPayload(e.to_string()))?;
        record.validate()?;
        Ok(record)
    }

    /// Validates version, bearer token type, non-empty tokens, Unix ms range, and RFC 3339 fields.
    pub fn validate(&self) -> Result<(), DataStoreError> {
        if self.version != STORED_TOKEN_PAIR_VERSION {
            return Err(DataStoreError::InvalidSessionPayload(format!(
                "unsupported version {}",
                self.version
            )));
        }
        if !is_bearer_token_type(&self.token_type) {
            return Err(DataStoreError::InvalidSessionPayload(format!(
                "unsupported tokenType {:?}",
                self.token_type
            )));
        }
        if self.access_token.is_empty() || self.refresh_token.is_empty() {
            return Err(DataStoreError::InvalidSessionPayload(
                "accessToken and refreshToken must be non-empty".into(),
            ));
        }
        // Reject seconds-scale or 2001-epoch timestamps masquerading as 1970 Unix ms.
        if self.access_expires_at < 1_000_000_000_000 {
            return Err(DataStoreError::InvalidSessionPayload(format!(
                "accessExpiresAt must be 1970 Unix milliseconds, got {}",
                self.access_expires_at
            )));
        }
        if !is_valid_rfc3339(&self.refresh_expires_at) {
            return Err(DataStoreError::InvalidSessionPayload(
                "invalid refreshExpiresAt RFC 3339 timestamp".into(),
            ));
        }
        if !is_valid_rfc3339(&self.session.absolute_expires_at) {
            return Err(DataStoreError::InvalidSessionPayload(
                "invalid session.absoluteExpiresAt RFC 3339 timestamp".into(),
            ));
        }
        Ok(())
    }

    /// Normalizes `tokenType` to exact `"Bearer"` and RFC 3339 timestamps to UTC `Z` format
    /// matching `0.27.5` `AuthPlugin.kt:237-240,278-288` for downgrade-safe persistence.
    fn normalize_for_storage(&mut self) -> Result<(), DataStoreError> {
        self.token_type = "Bearer".to_string();
        self.refresh_expires_at =
            normalize_rfc3339_utc_z(&self.refresh_expires_at).ok_or_else(|| {
                DataStoreError::InvalidSessionPayload(
                    "invalid refreshExpiresAt RFC 3339 timestamp".into(),
                )
            })?;
        self.session.absolute_expires_at =
            normalize_rfc3339_utc_z(&self.session.absolute_expires_at).ok_or_else(|| {
                DataStoreError::InvalidSessionPayload(
                    "invalid session.absoluteExpiresAt RFC 3339 timestamp".into(),
                )
            })?;
        Ok(())
    }

    /// Serializes the validated session payload for encryption and DataStore persistence,
    /// normalizing `tokenType` to `"Bearer"` and timestamps to UTC `Z` for `0.27.5` parity.
    pub fn to_stored_json(&self) -> Result<String, DataStoreError> {
        self.validate()?;
        let mut normalized = self.clone();
        normalized.normalize_for_storage()?;
        serde_json::to_string(&normalized)
            .map_err(|e| DataStoreError::InvalidSessionPayload(e.to_string()))
    }

    /// Returns `true` when the access token has more than 120s remaining before expiry.
    pub const fn is_access_token_fresh(&self, now_ms: i64) -> bool {
        self.access_expires_at.saturating_sub(now_ms) > AUTH_REFRESH_LEAD_MS
    }
}

/// Outbound auth HTTP request specification with `x-affine-client-kind: native`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthHttpRequestSpec {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body_json: String,
}

fn to_android_http_spec(endpoint: &str, req: ApiHttpRequest) -> AuthHttpRequestSpec {
    let body_json = String::from_utf8(req.body.unwrap_or_default()).unwrap_or_default();
    AuthHttpRequestSpec {
        url: format!("{}{}", canonical_endpoint(endpoint), req.path),
        headers: vec![
            (
                AUTH_CLIENT_KIND_HEADER.to_string(),
                AUTH_CLIENT_KIND_VALUE.to_string(),
            ),
            (
                AUTH_CLIENT_VERSION_HEADER.to_string(),
                AUTH_CLIENT_VERSION_VALUE.to_string(),
            ),
        ],
        body_json,
    }
}

/// Builds a `/api/auth/session/exchange` request reusing `installation_id`.
pub fn build_exchange_request(
    endpoint: &str,
    code: &str,
    installation_id: &str,
    device_name: &str,
) -> AuthHttpRequestSpec {
    let ctx = ApiRequestContext::native(None);
    let req = build_auth_session_exchange_request(
        &ctx,
        &AuthSessionExchangeRequest {
            code: code.to_string(),
            installation_id: installation_id.to_string(),
            platform: "android".to_string(),
            device_name: Some(device_name.to_string()),
        },
    )
    .expect("native exchange request serialization cannot fail");
    to_android_http_spec(endpoint, req)
}

/// Builds a `/api/auth/session/refresh` request with native client headers.
pub fn build_refresh_request(endpoint: &str, refresh_token: &str) -> AuthHttpRequestSpec {
    let ctx = ApiRequestContext::native(None);
    let req = build_auth_session_refresh_request(&ctx, refresh_token, None)
        .expect("native refresh request serialization cannot fail");
    to_android_http_spec(endpoint, req)
}

/// Builds a `/api/auth/session/revoke` request with native client headers.
pub fn build_revoke_request(endpoint: &str, refresh_token: &str) -> AuthHttpRequestSpec {
    let ctx = ApiRequestContext::native(None);
    let req = build_auth_session_revoke_request(&ctx, refresh_token)
        .expect("native revoke request serialization cannot fail");
    to_android_http_spec(endpoint, req)
}

/// Value stored inside Jetpack Preferences DataStore `PreferenceMap`.
#[derive(Debug, Clone, PartialEq, Eq)]
enum PreferenceValue {
    String(String),
    /// Preserves non-string preference `Value` wire bytes verbatim on round-trip.
    RawValueBytes(Vec<u8>),
}

/// Lightweight hand-written protobuf codec for Jetpack `PreferencesProto.PreferenceMap`.
///
/// Wire schema (`androidx.datastore.preferences.PreferencesProto`):
/// - `PreferenceMap`: field 1 (`map<string, Value> preferences`), length-delimited entries
/// - Map entry: field 1 (`string key`), field 2 (`Value value`)
/// - `Value`: field 5 (`string string`), wire type 2 (tag `0x2A`)
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PreferencesDataStore {
    entries: BTreeMap<String, PreferenceValue>,
}

impl PreferencesDataStore {
    /// Creates an empty preferences map.
    pub fn new() -> Self {
        Self::default()
    }

    /// Reads a string preference by key.
    pub fn get_string(&self, key: &str) -> Option<&str> {
        match self.entries.get(key) {
            Some(PreferenceValue::String(s)) => Some(s.as_str()),
            _ => None,
        }
    }

    /// Sets a string preference by key.
    pub fn set_string(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.entries
            .insert(key.into(), PreferenceValue::String(value.into()));
    }

    /// Removes a preference key, returning `true` if it existed.
    pub fn remove(&mut self, key: &str) -> bool {
        self.entries.remove(key).is_some()
    }

    /// Returns the number of stored preference entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Returns `true` when the preferences map has no entries.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Decodes a Jetpack Preferences DataStore `.preferences_pb` binary payload.
    pub fn decode(bytes: &[u8]) -> Result<Self, DataStoreError> {
        let mut store = Self::new();
        let mut cursor = 0usize;
        while cursor < bytes.len() {
            let tag = read_varint(bytes, &mut cursor)?;
            let field_number = tag >> 3;
            let wire_type = (tag & 0x07) as u8;
            match (field_number, wire_type) {
                (1, 2) => {
                    let entry_bytes = read_length_delimited(bytes, &mut cursor)?;
                    let (key, val) = decode_map_entry(entry_bytes)?;
                    store.entries.insert(key, val);
                }
                _ => skip_unknown_field(bytes, &mut cursor, wire_type)?,
            }
        }
        Ok(store)
    }

    /// Encodes the preferences map into Jetpack Preferences DataStore `.preferences_pb` format.
    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::new();
        for (key, value) in &self.entries {
            let val_bytes = match value {
                PreferenceValue::String(s) => encode_string_value(s),
                PreferenceValue::RawValueBytes(raw) => raw.clone(),
            };
            let mut entry = Vec::with_capacity(key.len() + val_bytes.len() + 8);
            write_tag(&mut entry, 1, 2);
            write_length_delimited(&mut entry, key.as_bytes());
            write_tag(&mut entry, 2, 2);
            write_length_delimited(&mut entry, &val_bytes);

            write_tag(&mut out, 1, 2);
            write_length_delimited(&mut out, &entry);
        }
        out
    }

    /// Loads a `.preferences_pb` file from disk, returning an empty store ONLY if missing.
    ///
    /// Existing files that fail I/O or protobuf decoding return an error so callers
    /// never silently overwrite or wipe intact entries on disk.
    pub fn load_from_file(path: &Path) -> Result<Self, DataStoreError> {
        match std::fs::read(path) {
            Ok(bytes) => Self::decode(&bytes),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(Self::new()),
            Err(err) => Err(DataStoreError::Io(err.to_string())),
        }
    }

    /// Atomically writes the `.preferences_pb` file to disk using a unique
    /// same-directory temporary file, `sync_all()`, and `fs::rename`.
    pub fn save_to_file(&self, path: &Path) -> Result<(), DataStoreError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| DataStoreError::Io(e.to_string()))?;
        }
        static TMP_SEQ: AtomicU64 = AtomicU64::new(1);
        let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let encoded = self.encode();
        let tmp_name = format!(
            "{}.{}.{seq}.tmp",
            path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(AUTH_DATASTORE_FILE),
            std::process::id(),
        );
        let tmp_path = path.with_file_name(tmp_name);
        let write_result = (|| -> std::io::Result<()> {
            let mut file = std::fs::File::create(&tmp_path)?;
            file.write_all(&encoded)?;
            file.sync_all()?;
            drop(file);
            std::fs::rename(&tmp_path, path)?;
            Ok(())
        })();
        if let Err(err) = write_result {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(DataStoreError::Io(err.to_string()));
        }
        Ok(())
    }
}

static DATASTORE_FILE_LOCKS: OnceLock<Mutex<BTreeMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();

fn canonical_lock_key(path: &Path) -> PathBuf {
    if let (Some(parent), Some(name)) = (path.parent(), path.file_name())
        && let Ok(canon_parent) = std::fs::canonicalize(parent)
    {
        return canon_parent.join(name);
    }
    path.to_path_buf()
}

/// Runs `f` while holding a process-wide mutex keyed by the canonical file path,
/// serializing `load -> mutate -> atomic save` across concurrent threads/keys.
pub fn with_datastore_file_lock<R>(path: &Path, f: impl FnOnce() -> R) -> R {
    let key = canonical_lock_key(path);
    let file_lock = {
        let registry = DATASTORE_FILE_LOCKS.get_or_init(|| Mutex::new(BTreeMap::new()));
        let mut map = registry.lock().unwrap_or_else(|poison| poison.into_inner());
        map.entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    };
    let _guard = file_lock
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    f()
}

/// Reads a string preference under the per-file lock.
pub fn read_file_string(path: &Path, key: &str) -> Result<Option<String>, DataStoreError> {
    with_datastore_file_lock(path, || {
        let store = PreferencesDataStore::load_from_file(path)?;
        Ok(store.get_string(key).map(str::to_string))
    })
}

/// Atomically updates a string preference under the per-file lock.
///
/// Fails without modifying disk if the existing file is unreadable or corrupt.
pub fn update_file_string(path: &Path, key: &str, value: &str) -> Result<(), DataStoreError> {
    with_datastore_file_lock(path, || {
        let mut store = PreferencesDataStore::load_from_file(path)?;
        store.set_string(key, value);
        store.save_to_file(path)
    })
}

/// Atomically reads a non-empty string preference or persists `candidate_value`
/// inside a single per-file lock critical section.
///
/// Fails without modifying disk if the existing file is unreadable or corrupt.
pub fn get_or_create_file_string(
    path: &Path,
    key: &str,
    candidate_value: &str,
) -> Result<String, DataStoreError> {
    with_datastore_file_lock(path, || {
        let mut store = PreferencesDataStore::load_from_file(path)?;
        if let Some(existing) = store.get_string(key)
            && !existing.is_empty()
        {
            return Ok(existing.to_string());
        }
        store.set_string(key, candidate_value);
        store.save_to_file(path)?;
        Ok(candidate_value.to_string())
    })
}

/// Atomically deletes a preference key under the per-file lock.
///
/// Fails without modifying disk if the existing file is unreadable or corrupt.
pub fn delete_file_key(path: &Path, key: &str) -> Result<bool, DataStoreError> {
    with_datastore_file_lock(path, || {
        let mut store = PreferencesDataStore::load_from_file(path)?;
        let removed = store.remove(key);
        if removed {
            store.save_to_file(path)?;
        }
        Ok(removed)
    })
}

fn encode_string_value(value: &str) -> Vec<u8> {
    let mut buf = Vec::with_capacity(value.len() + 4);
    write_tag(&mut buf, 5, 2);
    write_length_delimited(&mut buf, value.as_bytes());
    buf
}

fn decode_map_entry(entry: &[u8]) -> Result<(String, PreferenceValue), DataStoreError> {
    let mut cursor = 0usize;
    let mut key: Option<String> = None;
    let mut value_bytes: Option<&[u8]> = None;

    while cursor < entry.len() {
        let tag = read_varint(entry, &mut cursor)?;
        let field_number = tag >> 3;
        let wire_type = (tag & 0x07) as u8;
        match (field_number, wire_type) {
            (1, 2) => {
                let raw = read_length_delimited(entry, &mut cursor)?;
                let k = std::str::from_utf8(raw).map_err(|e| {
                    DataStoreError::MalformedProtobuf(format!("invalid key utf8: {e}"))
                })?;
                key = Some(k.to_string());
            }
            (2, 2) => {
                value_bytes = Some(read_length_delimited(entry, &mut cursor)?);
            }
            _ => skip_unknown_field(entry, &mut cursor, wire_type)?,
        }
    }

    let key = key.unwrap_or_default();
    let val_raw = value_bytes.unwrap_or(&[]);
    let parsed_val = decode_preference_value(val_raw)?;
    Ok((key, parsed_val))
}

fn decode_preference_value(raw: &[u8]) -> Result<PreferenceValue, DataStoreError> {
    let mut cursor = 0usize;
    while cursor < raw.len() {
        let tag = read_varint(raw, &mut cursor)?;
        let field_number = tag >> 3;
        let wire_type = (tag & 0x07) as u8;
        if field_number == 5 && wire_type == 2 {
            let bytes = read_length_delimited(raw, &mut cursor)?;
            let text = std::str::from_utf8(bytes).map_err(|e| {
                DataStoreError::MalformedProtobuf(format!("invalid string value utf8: {e}"))
            })?;
            return Ok(PreferenceValue::String(text.to_string()));
        }
        skip_unknown_field(raw, &mut cursor, wire_type)?;
    }
    Ok(PreferenceValue::RawValueBytes(raw.to_vec()))
}

fn write_tag(out: &mut Vec<u8>, field_number: u64, wire_type: u8) {
    write_varint(out, (field_number << 3) | u64::from(wire_type));
}

fn write_length_delimited(out: &mut Vec<u8>, bytes: &[u8]) {
    write_varint(out, bytes.len() as u64);
    out.extend_from_slice(bytes);
}

fn write_varint(out: &mut Vec<u8>, mut value: u64) {
    loop {
        let byte = (value & 0x7F) as u8;
        value >>= 7;
        if value == 0 {
            out.push(byte);
            break;
        }
        out.push(byte | 0x80);
    }
}

fn read_varint(buf: &[u8], cursor: &mut usize) -> Result<u64, DataStoreError> {
    let mut result = 0u64;
    let mut shift = 0u32;
    loop {
        if *cursor >= buf.len() {
            return Err(DataStoreError::MalformedProtobuf("truncated varint".into()));
        }
        let byte = buf[*cursor];
        *cursor += 1;
        if shift >= 64 {
            return Err(DataStoreError::MalformedProtobuf("varint overflow".into()));
        }
        result |= u64::from(byte & 0x7F) << shift;
        if (byte & 0x80) == 0 {
            return Ok(result);
        }
        shift += 7;
    }
}

fn read_length_delimited<'a>(
    buf: &'a [u8],
    cursor: &mut usize,
) -> Result<&'a [u8], DataStoreError> {
    let len = read_varint(buf, cursor)? as usize;
    let end = cursor
        .checked_add(len)
        .ok_or_else(|| DataStoreError::MalformedProtobuf("length overflow".into()))?;
    if end > buf.len() {
        return Err(DataStoreError::MalformedProtobuf(
            "truncated length-delimited field".into(),
        ));
    }
    let slice = &buf[*cursor..end];
    *cursor = end;
    Ok(slice)
}

fn skip_unknown_field(buf: &[u8], cursor: &mut usize, wire_type: u8) -> Result<(), DataStoreError> {
    match wire_type {
        0 => {
            let _ = read_varint(buf, cursor)?;
            Ok(())
        }
        1 => {
            if cursor.checked_add(8).is_none_or(|end| end > buf.len()) {
                return Err(DataStoreError::MalformedProtobuf(
                    "truncated 64-bit field".into(),
                ));
            }
            *cursor += 8;
            Ok(())
        }
        2 => {
            let _ = read_length_delimited(buf, cursor)?;
            Ok(())
        }
        5 => {
            if cursor.checked_add(4).is_none_or(|end| end > buf.len()) {
                return Err(DataStoreError::MalformedProtobuf(
                    "truncated 32-bit field".into(),
                ));
            }
            *cursor += 4;
            Ok(())
        }
        _ => Err(DataStoreError::MalformedProtobuf(format!(
            "unsupported wire type {wire_type}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_endpoint_and_keystore_alias_match_auth_plugin_kt() {
        let cases = [
            (
                "https://app.affine.pro:443/graphql",
                "https://app.affine.pro",
            ),
            (
                "HTTPS://APP.AFFINE.PRO:443/Docs?a=1",
                "https://app.affine.pro",
            ),
            ("https://app.affine.pro/", "https://app.affine.pro"),
            ("https://[::1]:443/graphql", "https://[::1]"),
            ("https://[::1]:8443/graphql", "https://[::1]:8443"),
            ("http://localhost:80/api", "http://localhost"),
            ("http://localhost:3010/api/auth", "http://localhost:3010"),
            ("not-a-url", "not-a-url"),
        ];
        for (raw, expected) in cases {
            assert_eq!(canonical_endpoint(raw), expected, "endpoint={raw}");
        }

        assert_eq!(
            auth_token_key("https://app.affine.pro:443/docs"),
            "auth-token:https://app.affine.pro"
        );
        assert_eq!(
            auth_token_key("https://[::1]:443/graphql"),
            "auth-token:https://::1"
        );
        assert_eq!(
            auth_token_key("https://[::1]:8443/graphql"),
            "auth-token:https://::1:8443"
        );
        let alias = keystore_alias("https://app.affine.pro:443");
        assert!(alias.starts_with(KEYSTORE_ALIAS_PREFIX));
        assert_eq!(alias.len(), KEYSTORE_ALIAS_PREFIX.len() + 24);
        assert_eq!(alias, keystore_alias("https://app.affine.pro"));
    }

    #[test]
    fn preferences_protobuf_roundtrip_preserves_strings_and_non_string_values() {
        let mut store = PreferencesDataStore::new();
        store.set_string(AUTH_INSTALLATION_ID_KEY, "inst-uuid-0275");
        store.set_string(
            auth_token_key("https://app.affine.pro"),
            "v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB==",
        );

        let mut encoded = store.encode();
        // Append a raw boolean preference entry (field 1 in Value, varint 1) to ensure preservation.
        let bool_value = vec![0x08, 0x01];
        let mut extra_entry = Vec::new();
        write_tag(&mut extra_entry, 1, 2);
        write_length_delimited(&mut extra_entry, b"legacy-flag");
        write_tag(&mut extra_entry, 2, 2);
        write_length_delimited(&mut extra_entry, &bool_value);
        write_tag(&mut encoded, 1, 2);
        write_length_delimited(&mut encoded, &extra_entry);

        let decoded = PreferencesDataStore::decode(&encoded).unwrap();
        assert_eq!(
            decoded.get_string(AUTH_INSTALLATION_ID_KEY),
            Some("inst-uuid-0275")
        );
        assert_eq!(
            decoded.get_string(&auth_token_key("https://app.affine.pro")),
            Some("v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB==")
        );
        assert_eq!(decoded.len(), 3);

        // Re-encode and decode again: non-string entry remains intact.
        let reencoded = decoded.encode();
        let decoded2 = PreferencesDataStore::decode(&reencoded).unwrap();
        assert_eq!(decoded2, decoded);
    }

    #[test]
    fn v1_ciphertext_envelope_and_unix_ms_session_payload_validation() {
        let envelope = V1EncryptedEnvelope {
            iv: [7u8; AUTH_GCM_IV_LEN],
            ciphertext_and_tag: vec![0xAA; 32],
        };
        let encoded = envelope.format();
        assert!(encoded.starts_with("v1:"));
        assert_eq!(V1EncryptedEnvelope::parse(&encoded).unwrap(), envelope);

        // Reject wrong prefix, wrong IV length, and truncated tag.
        assert!(
            V1EncryptedEnvelope::parse("v2:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==").is_err()
        );
        assert!(V1EncryptedEnvelope::parse("v1:AAAA:AAAAAAAAAAAAAAAAAAAAAA==").is_err());
        assert!(V1EncryptedEnvelope::parse("v1:AAAAAAAAAAAAAAAA:AAAA").is_err());

        let server_json = r#"{
            "tokenType": "Bearer",
            "accessToken": "acc-1",
            "refreshToken": "ref-1",
            "expiresIn": 3600,
            "refreshExpiresAt": "2027-01-01T00:00:00.000Z",
            "session": {
                "id": "sess-1",
                "absoluteExpiresAt": "2027-06-01T00:00:00Z"
            }
        }"#;
        let now_ms = 1_795_597_759_000_i64;
        let record = AuthSessionRecord::from_server_response(server_json, now_ms).unwrap();
        assert_eq!(record.version, 1);
        assert_eq!(record.access_expires_at, now_ms + 3_600_000);
        assert!(record.is_access_token_fresh(now_ms));
        assert!(!record.is_access_token_fresh(now_ms + 3_500_000));

        let stored = record.to_stored_json().unwrap();
        assert!(!stored.contains("expiresIn"));
        let reparsed = AuthSessionRecord::from_stored_json(&stored).unwrap();
        assert_eq!(reparsed, record);

        // Reject iOS 2001-epoch float or seconds-scale accessExpiresAt.
        let ios_epoch_json = stored.replace(&record.access_expires_at.to_string(), "785754559.5");
        assert!(AuthSessionRecord::from_stored_json(&ios_epoch_json).is_err());
        let seconds_scale_json =
            stored.replace(&record.access_expires_at.to_string(), "1795597759");
        assert!(AuthSessionRecord::from_stored_json(&seconds_scale_json).is_err());

        // Verify native auth headers (`x-affine-client-kind`, `x-affine-version`) and installationId reuse.
        let expected_headers = vec![
            ("x-affine-client-kind".into(), "native".into()),
            ("x-affine-version".into(), "0.27.5".into()),
        ];
        let ex = build_exchange_request(
            "https://app.affine.pro:443",
            "code-1",
            "inst-uuid-0275",
            "Pixel 9",
        );
        assert_eq!(ex.url, "https://app.affine.pro/api/auth/session/exchange");
        assert_eq!(ex.headers, expected_headers);
        assert!(
            ex.body_json
                .contains("\"installationId\":\"inst-uuid-0275\"")
        );
        assert!(ex.body_json.contains("\"platform\":\"android\""));

        let rf = build_refresh_request("https://app.affine.pro", "ref-1");
        assert_eq!(rf.url, "https://app.affine.pro/api/auth/session/refresh");
        assert_eq!(rf.headers, expected_headers);
        let rv = build_revoke_request("https://app.affine.pro", "ref-1");
        assert_eq!(rv.url, "https://app.affine.pro/api/auth/session/revoke");
        assert_eq!(rv.headers, expected_headers);

        for code in PERMANENT_AUTH_ERROR_CODES {
            assert!(is_permanent_auth_error_code(code), "code={code}");
        }
        assert!(!is_permanent_auth_error_code(
            "AUTH_SESSION_TEMPORARILY_UNAVAILABLE"
        ));
        assert!(!is_permanent_auth_error_code("TOO_MANY_REQUESTS"));

        // Table-driven cross-platform parity: case-insensitive Bearer and RFC3339 timezone offsets.
        let parity_cases = [
            ("Bearer", "2027-01-01T00:00:00Z", "2027-06-01T00:00:00Z"),
            (
                "bearer",
                "2027-01-01T08:00:00+08:00",
                "2027-06-01T00:00:00-05:00",
            ),
            (
                "BEARER",
                "2027-01-01T08:00:00.125+08:00",
                "2027-06-01T00:00:00.5Z",
            ),
        ];
        for (token_type, refresh_ts, abs_ts) in parity_cases {
            let payload = format!(
                r#"{{"tokenType":"{token_type}","accessToken":"a","refreshToken":"r","expiresIn":600,"refreshExpiresAt":"{refresh_ts}","session":{{"id":"s","absoluteExpiresAt":"{abs_ts}"}}}}"#
            );
            let rec = AuthSessionRecord::from_server_response(&payload, now_ms).unwrap();
            assert!(AuthSessionRecord::from_stored_json(&rec.to_stored_json().unwrap()).is_ok());
        }
    }

    #[test]
    fn datastore_concurrent_writes_preserve_all_keys_and_corrupt_file_is_never_wiped() {
        let dir = std::env::temp_dir().join(format!(
            "affine-android-datastore-conc-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let path = auth_datastore_path(&dir);

        // 4 writer threads x 50 rounds + 1 concurrent reader thread on the same .preferences_pb file.
        let done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let reader_path = path.clone();
        let reader_done = done.clone();
        let reader = std::thread::spawn(move || {
            let mut reads = 0usize;
            while !reader_done.load(std::sync::atomic::Ordering::Acquire) {
                let _ = read_file_string(&reader_path, AUTH_INSTALLATION_ID_KEY).unwrap();
                reads += 1;
            }
            reads
        });

        let mut handles = Vec::new();
        for idx in 0..4usize {
            let p = path.clone();
            handles.push(std::thread::spawn(move || {
                let key = format!("auth-token:https://server-{idx}.example");
                for round in 0..50usize {
                    let val = format!("v1:AAAAAAAAAAAAAAAA:val-{idx}-{round}");
                    update_file_string(&p, &key, &val).unwrap();
                }
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        done.store(true, std::sync::atomic::Ordering::Release);
        let _ = reader.join().unwrap();
        update_file_string(&path, AUTH_INSTALLATION_ID_KEY, "inst-concurrent").unwrap();

        assert_eq!(
            read_file_string(&path, AUTH_INSTALLATION_ID_KEY)
                .unwrap()
                .as_deref(),
            Some("inst-concurrent")
        );
        for idx in 0..4usize {
            let key = format!("auth-token:https://server-{idx}.example");
            assert_eq!(
                read_file_string(&path, &key).unwrap().as_deref(),
                Some(format!("v1:AAAAAAAAAAAAAAAA:val-{idx}-49").as_str())
            );
        }

        // Corrupt file must fail reads/writes WITHOUT overwriting original bytes on disk.
        let corrupt_bytes = vec![
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        ];
        std::fs::write(&path, &corrupt_bytes).unwrap();
        assert!(read_file_string(&path, AUTH_INSTALLATION_ID_KEY).is_err());
        assert!(get_or_create_file_string(&path, AUTH_INSTALLATION_ID_KEY, "new-uuid").is_err());
        assert!(update_file_string(&path, "new-key", "new-val").is_err());
        assert!(delete_file_key(&path, AUTH_INSTALLATION_ID_KEY).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), corrupt_bytes);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn get_or_create_file_string_is_atomic_under_cold_start_race() {
        let dir = std::env::temp_dir().join(format!(
            "affine-android-datastore-race-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let path = auth_datastore_path(&dir);

        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let p1 = path.clone();
        let b1 = barrier.clone();
        let t1 = std::thread::spawn(move || {
            b1.wait();
            get_or_create_file_string(&p1, AUTH_INSTALLATION_ID_KEY, "uuid-a").unwrap()
        });
        let p2 = path.clone();
        let b2 = barrier;
        let t2 = std::thread::spawn(move || {
            b2.wait();
            get_or_create_file_string(&p2, AUTH_INSTALLATION_ID_KEY, "uuid-b").unwrap()
        });
        let r1 = t1.join().unwrap();
        let r2 = t2.join().unwrap();
        assert_eq!(r1, r2);
        assert!(r1 == "uuid-a" || r1 == "uuid-b");
        assert_eq!(
            read_file_string(&path, AUTH_INSTALLATION_ID_KEY)
                .unwrap()
                .as_deref(),
            Some(r1.as_str())
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn idna_endpoint_and_0275_downgrade_normalization_roundtrip() {
        // IDNA endpoint key must match 0.27.5 punycode canonical form.
        assert_eq!(
            auth_token_key("https://bücher.example"),
            "auth-token:https://xn--bcher-kva.example"
        );
        assert_eq!(
            auth_token_key("https://bücher.example:443/api"),
            auth_token_key("https://xn--bcher-kva.example")
        );

        // Lowercase "bearer" and +08:00 cross-day timestamp normalize to exact "Bearer" + UTC Z.
        let response = r#"{
            "tokenType": "bearer",
            "accessToken": "acc-idna",
            "expiresIn": 3600,
            "refreshToken": "ref-idna",
            "refreshExpiresAt": "2026-12-01T01:30:00+08:00",
            "session": {
                "id": "sess-idna",
                "absoluteExpiresAt": "2026-12-31T23:30:00.5-02:00"
            }
        }"#;
        let record = AuthSessionRecord::from_server_response(response, 1_760_000_000_000)
            .expect("lowercase bearer and offset RFC3339 must parse");
        let persisted_json = record.to_stored_json().expect("to_stored_json");
        let parsed: serde_json::Value = serde_json::from_str(&persisted_json).unwrap();
        assert_eq!(parsed["tokenType"], "Bearer");
        assert_eq!(parsed["refreshExpiresAt"], "2026-11-30T17:30:00Z");
        assert_eq!(
            parsed["session"]["absoluteExpiresAt"],
            "2027-01-01T01:30:00.500Z"
        );

        // Persisted JSON must roundtrip cleanly and pass exact 0.27.5 AuthPlugin.kt rules.
        let reloaded = AuthSessionRecord::from_stored_json(&persisted_json).unwrap();
        assert_eq!(reloaded.token_type, "Bearer");
        assert_eq!(reloaded.refresh_expires_at, "2026-11-30T17:30:00Z");
        assert_eq!(
            reloaded.session.absolute_expires_at,
            "2027-01-01T01:30:00.500Z"
        );
    }
}
