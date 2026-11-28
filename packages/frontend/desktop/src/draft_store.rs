//! Physically isolated local composer draft store (`ComposerDraftStore`).
//!
//! Keeps unpublished drafts and their content-addressed SHA-256 attachments
//! strictly outside collaborative `<spaceId>.db` workspace databases, with
//! reference-counted garbage collection and one-way idempotent importers for
//! legacy Web Desktop and Electron dual-source directories.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

/// Errors returned by [`ComposerDraftStore`].
#[derive(Debug, Error, Eq, PartialEq)]
pub enum DraftStoreError {
    #[error("draft store path `{0}` collides with a collaborative workspace database")]
    WorkspaceDbCollision(String),

    #[error("draft `{0}` not found")]
    DraftNotFound(String),

    #[error("attachment `{0}` not found")]
    AttachmentNotFound(String),

    #[error("invalid content hash `{0}` (expected 64 lowercase hex characters)")]
    InvalidContentHash(String),

    #[error("storage backend error: {0}")]
    Backend(String),
}

pub type DraftStoreResult<T> = Result<T, DraftStoreError>;

/// Content-addressed SHA-256 digest (strictly 64 lowercase hex characters).
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Hash, Serialize)]
pub struct ContentHash(String);

impl ContentHash {
    /// Validate and construct a `ContentHash` from a 64-char lowercase hex string.
    pub fn parse(raw: impl Into<String>) -> DraftStoreResult<Self> {
        let s = raw.into();
        if Self::is_valid_hex(&s) {
            Ok(Self(s))
        } else {
            Err(DraftStoreError::InvalidContentHash(s))
        }
    }

    pub fn is_valid_hex(s: &str) -> bool {
        s.len() == 64 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
    }

    /// Compute the SHA-256 content hash of `bytes`.
    pub fn of_bytes(bytes: &[u8]) -> Self {
        let digest = Sha256::digest(bytes);
        let mut hex = String::with_capacity(64);
        for b in digest {
            use std::fmt::Write as _;
            let _ = write!(&mut hex, "{b:02x}");
        }
        Self(hex)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl<'de> Deserialize<'de> for ContentHash {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = String::deserialize(deserializer)?;
        Self::parse(raw).map_err(serde::de::Error::custom)
    }
}

/// Metadata for a content-addressed draft attachment.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentMeta {
    pub hash: ContentHash,
    pub mime_type: String,
    pub filename: String,
    pub byte_len: usize,
    pub ref_count: usize,
}

/// One unpublished local composer draft.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposerDraft {
    pub draft_id: String,
    pub workspace_id: String,
    pub target_doc_id: Option<String>,
    pub title: String,
    pub body_markdown: String,
    pub attachment_hashes: Vec<ContentHash>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    /// Optional origin fingerprint recorded for one-way idempotent migration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imported_from: Option<String>,
}

/// Persisted snapshot written to the isolated local draft namespace.
#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftStoreSnapshot {
    pub namespace: String,
    pub drafts: BTreeMap<String, ComposerDraft>,
    pub attachments: BTreeMap<ContentHash, AttachmentMeta>,
    pub imported_sources: BTreeSet<String>,
}

/// Pluggable persistence backend for [`ComposerDraftStore`].
pub trait DraftStorageBackend {
    /// Physical namespace identifier (e.g. `local://composer-drafts` or filesystem path).
    fn namespace(&self) -> &str;

    /// Load the latest persisted metadata snapshot.
    fn load_snapshot(&self) -> DraftStoreResult<Option<DraftStoreSnapshot>>;

    /// Persist metadata snapshot atomically.
    fn save_snapshot(&mut self, snapshot: &DraftStoreSnapshot) -> DraftStoreResult<()>;

    /// Store raw attachment bytes under their SHA-256 content hash.
    fn put_blob(&mut self, hash: &ContentHash, bytes: &[u8]) -> DraftStoreResult<()>;

    /// Read raw attachment bytes by SHA-256 content hash.
    fn get_blob(&self, hash: &ContentHash) -> DraftStoreResult<Option<Vec<u8>>>;

    /// Remove an unreferenced attachment blob.
    fn delete_blob(&mut self, hash: &ContentHash) -> DraftStoreResult<bool>;
}

/// Deterministic in-memory backend (used on `wasm32` and in tests).
#[derive(Clone, Debug)]
pub struct MemoryDraftBackend {
    namespace: String,
    snapshot: Option<DraftStoreSnapshot>,
    blobs: BTreeMap<ContentHash, Vec<u8>>,
}

impl MemoryDraftBackend {
    pub fn new(namespace: impl Into<String>) -> DraftStoreResult<Self> {
        let namespace = namespace.into();
        validate_isolated_namespace(&namespace)?;
        Ok(Self {
            namespace,
            snapshot: None,
            blobs: BTreeMap::new(),
        })
    }

    pub fn blob_count(&self) -> usize {
        self.blobs.len()
    }
}

impl DraftStorageBackend for MemoryDraftBackend {
    fn namespace(&self) -> &str {
        &self.namespace
    }

    fn load_snapshot(&self) -> DraftStoreResult<Option<DraftStoreSnapshot>> {
        Ok(self.snapshot.clone())
    }

    fn save_snapshot(&mut self, snapshot: &DraftStoreSnapshot) -> DraftStoreResult<()> {
        self.snapshot = Some(snapshot.clone());
        Ok(())
    }

    fn put_blob(&mut self, hash: &ContentHash, bytes: &[u8]) -> DraftStoreResult<()> {
        self.blobs
            .entry(hash.clone())
            .or_insert_with(|| bytes.to_vec());
        Ok(())
    }

    fn get_blob(&self, hash: &ContentHash) -> DraftStoreResult<Option<Vec<u8>>> {
        Ok(self.blobs.get(hash).cloned())
    }

    fn delete_blob(&mut self, hash: &ContentHash) -> DraftStoreResult<bool> {
        Ok(self.blobs.remove(hash).is_some())
    }
}

/// Native filesystem backend storing drafts in an isolated directory (`drafts.json` + `blobs/<sha256>`).
#[cfg(not(target_family = "wasm"))]
#[derive(Clone, Debug)]
pub struct DiskDraftBackend {
    root_dir: std::path::PathBuf,
    namespace: String,
}

#[cfg(not(target_family = "wasm"))]
impl DiskDraftBackend {
    pub fn open(root_dir: impl Into<std::path::PathBuf>) -> DraftStoreResult<Self> {
        let root_dir = root_dir.into();
        let namespace = root_dir.to_string_lossy().into_owned();
        validate_isolated_namespace(&namespace)?;
        std::fs::create_dir_all(root_dir.join("blobs"))
            .map_err(|e| DraftStoreError::Backend(e.to_string()))?;
        Ok(Self {
            root_dir,
            namespace,
        })
    }

    fn snapshot_path(&self) -> std::path::PathBuf {
        self.root_dir.join("composer-drafts.json")
    }

    fn blob_path(&self, hash: &ContentHash) -> DraftStoreResult<std::path::PathBuf> {
        let raw = hash.as_str();
        if !ContentHash::is_valid_hex(raw)
            || raw.contains('/')
            || raw.contains('\\')
            || raw.contains("..")
        {
            return Err(DraftStoreError::InvalidContentHash(raw.to_string()));
        }
        Ok(self.root_dir.join("blobs").join(raw))
    }
}

#[cfg(not(target_family = "wasm"))]
impl DraftStorageBackend for DiskDraftBackend {
    fn namespace(&self) -> &str {
        &self.namespace
    }

    fn load_snapshot(&self) -> DraftStoreResult<Option<DraftStoreSnapshot>> {
        let path = self.snapshot_path();
        if !path.exists() {
            return Ok(None);
        }
        let raw =
            std::fs::read_to_string(&path).map_err(|e| DraftStoreError::Backend(e.to_string()))?;
        let parsed =
            serde_json::from_str(&raw).map_err(|e| DraftStoreError::Backend(e.to_string()))?;
        Ok(Some(parsed))
    }

    fn save_snapshot(&mut self, snapshot: &DraftStoreSnapshot) -> DraftStoreResult<()> {
        let tmp = self.root_dir.join("composer-drafts.json.tmp");
        let body = serde_json::to_string_pretty(snapshot)
            .map_err(|e| DraftStoreError::Backend(e.to_string()))?;
        std::fs::write(&tmp, body).map_err(|e| DraftStoreError::Backend(e.to_string()))?;
        std::fs::rename(&tmp, self.snapshot_path())
            .map_err(|e| DraftStoreError::Backend(e.to_string()))
    }

    fn put_blob(&mut self, hash: &ContentHash, bytes: &[u8]) -> DraftStoreResult<()> {
        let path = self.blob_path(hash)?;
        if !path.exists() {
            std::fs::write(&path, bytes).map_err(|e| DraftStoreError::Backend(e.to_string()))?;
        }
        Ok(())
    }

    fn get_blob(&self, hash: &ContentHash) -> DraftStoreResult<Option<Vec<u8>>> {
        let path = self.blob_path(hash)?;
        if !path.exists() {
            return Ok(None);
        }
        let bytes = std::fs::read(&path).map_err(|e| DraftStoreError::Backend(e.to_string()))?;
        Ok(Some(bytes))
    }

    fn delete_blob(&mut self, hash: &ContentHash) -> DraftStoreResult<bool> {
        let path = self.blob_path(hash)?;
        if !path.exists() {
            return Ok(false);
        }
        std::fs::remove_file(&path).map_err(|e| DraftStoreError::Backend(e.to_string()))?;
        Ok(true)
    }
}

/// Unified draft backend supporting in-memory (`wasm32` / tests), native disk persistence,
/// and explicit fail-closed `Unavailable` state when disk initialization fails.
#[derive(Clone, Debug)]
pub enum DesktopDraftBackend {
    Memory(MemoryDraftBackend),
    #[cfg(not(target_family = "wasm"))]
    Disk(DiskDraftBackend),
    /// Fail-closed backend mounted when disk draft directory initialization fails so writes
    /// truthfully return `Err` instead of silently falling back to ephemeral in-memory storage.
    Unavailable {
        namespace: String,
        reason: String,
    },
}

impl DraftStorageBackend for DesktopDraftBackend {
    fn namespace(&self) -> &str {
        match self {
            Self::Memory(b) => b.namespace(),
            #[cfg(not(target_family = "wasm"))]
            Self::Disk(b) => b.namespace(),
            Self::Unavailable { namespace, .. } => namespace,
        }
    }

    fn load_snapshot(&self) -> DraftStoreResult<Option<DraftStoreSnapshot>> {
        match self {
            Self::Memory(b) => b.load_snapshot(),
            #[cfg(not(target_family = "wasm"))]
            Self::Disk(b) => b.load_snapshot(),
            Self::Unavailable { .. } => Ok(None),
        }
    }

    fn save_snapshot(&mut self, snapshot: &DraftStoreSnapshot) -> DraftStoreResult<()> {
        match self {
            Self::Memory(b) => b.save_snapshot(snapshot),
            #[cfg(not(target_family = "wasm"))]
            Self::Disk(b) => b.save_snapshot(snapshot),
            Self::Unavailable { reason, .. } => Err(DraftStoreError::Backend(reason.clone())),
        }
    }

    fn put_blob(&mut self, hash: &ContentHash, bytes: &[u8]) -> DraftStoreResult<()> {
        match self {
            Self::Memory(b) => b.put_blob(hash, bytes),
            #[cfg(not(target_family = "wasm"))]
            Self::Disk(b) => b.put_blob(hash, bytes),
            Self::Unavailable { reason, .. } => Err(DraftStoreError::Backend(reason.clone())),
        }
    }

    fn get_blob(&self, hash: &ContentHash) -> DraftStoreResult<Option<Vec<u8>>> {
        match self {
            Self::Memory(b) => b.get_blob(hash),
            #[cfg(not(target_family = "wasm"))]
            Self::Disk(b) => b.get_blob(hash),
            Self::Unavailable { reason, .. } => Err(DraftStoreError::Backend(reason.clone())),
        }
    }

    fn delete_blob(&mut self, hash: &ContentHash) -> DraftStoreResult<bool> {
        match self {
            Self::Memory(b) => b.delete_blob(hash),
            #[cfg(not(target_family = "wasm"))]
            Self::Disk(b) => b.delete_blob(hash),
            Self::Unavailable { reason, .. } => Err(DraftStoreError::Backend(reason.clone())),
        }
    }
}

/// Validates a single workspace directory segment (e.g. `space_id` from SQLite metadata)
/// before joining it under `.affine-desktop-drafts` to prevent path traversal or DB collision.
pub fn validate_workspace_segment(segment: &str) -> DraftStoreResult<()> {
    let trimmed = segment.trim();
    if trimmed.is_empty()
        || trimmed == "."
        || trimmed == ".."
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains("..")
        || trimmed.contains('\0')
    {
        return Err(DraftStoreError::Backend(format!(
            "invalid workspace draft directory segment `{segment}`"
        )));
    }
    validate_isolated_namespace(trimmed)
}

/// Rejects any namespace or file path that targets or resides inside a collaborative workspace DB.
pub fn validate_isolated_namespace(namespace: &str) -> DraftStoreResult<()> {
    let trimmed = namespace.trim();
    if trimmed.is_empty() {
        return Err(DraftStoreError::WorkspaceDbCollision(
            "<empty namespace>".to_string(),
        ));
    }
    let lower = trimmed.to_ascii_lowercase();
    const FORBIDDEN_SUFFIXES: [&str; 6] = [
        ".db", ".affine", ".sqlite", ".sqlite3", ".db-wal", ".db-shm",
    ];
    let collides = FORBIDDEN_SUFFIXES.iter().any(|ext| {
        lower.ends_with(ext)
            || lower.contains(&format!("{ext}/"))
            || lower.contains(&format!("{ext}\\"))
    });
    if collides {
        return Err(DraftStoreError::WorkspaceDbCollision(trimmed.to_string()));
    }
    Ok(())
}

/// Raw legacy draft record produced by a one-way [`DraftImportSource`].
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyDraftRecord {
    pub source_key: String,
    pub workspace_id: String,
    pub target_doc_id: Option<String>,
    pub title: String,
    pub body_markdown: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub attachments: Vec<LegacyDraftAttachment>,
}

/// Raw attachment bytes exported by a legacy draft source.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyDraftAttachment {
    pub filename: String,
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

/// Summary of a one-way idempotent import run.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct DraftImportReport {
    pub imported_drafts: usize,
    pub skipped_already_imported: usize,
    pub deduplicated_attachments: usize,
    pub stored_attachments: usize,
}

/// One-way importer contract for migrating legacy Web Desktop or Electron drafts.
pub trait DraftImportSource {
    /// Stable identifier of the import origin (e.g. `"web-origin:https://app.affine.pro"`).
    fn origin_id(&self) -> &str;

    /// Read all legacy drafts available in the source without mutating the source.
    fn collect_drafts(&self) -> DraftStoreResult<Vec<LegacyDraftRecord>>;
}

/// Same-origin Web Desktop legacy draft importer (reads exported localStorage / IndexedDB JSON).
#[derive(Clone, Debug)]
pub struct WebDesktopLegacyDraftImporter {
    origin_id: String,
    records: Vec<LegacyDraftRecord>,
}

impl WebDesktopLegacyDraftImporter {
    pub fn new(origin: impl Into<String>, records: Vec<LegacyDraftRecord>) -> Self {
        Self {
            origin_id: format!("web-desktop:{}", origin.into()),
            records,
        }
    }

    /// Parse legacy JSON array exported from same-origin Web Desktop storage.
    pub fn from_json(origin: impl Into<String>, raw_json: &str) -> DraftStoreResult<Self> {
        let records: Vec<LegacyDraftRecord> = serde_json::from_str(raw_json)
            .map_err(|e| DraftStoreError::Backend(format!("invalid web legacy draft JSON: {e}")))?;
        Ok(Self::new(origin, records))
    }
}

impl DraftImportSource for WebDesktopLegacyDraftImporter {
    fn origin_id(&self) -> &str {
        &self.origin_id
    }

    fn collect_drafts(&self) -> DraftStoreResult<Vec<LegacyDraftRecord>> {
        Ok(self.records.clone())
    }
}

/// Electron dual-source importer combining legacy `userData/drafts` and `userData/blobs` directories.
#[derive(Clone, Debug)]
pub struct ElectronDualSourceDraftImporter {
    origin_id: String,
    primary_records: Vec<LegacyDraftRecord>,
    secondary_records: Vec<LegacyDraftRecord>,
}

impl ElectronDualSourceDraftImporter {
    pub fn new(
        profile_name: impl Into<String>,
        primary_records: Vec<LegacyDraftRecord>,
        secondary_records: Vec<LegacyDraftRecord>,
    ) -> Self {
        Self {
            origin_id: format!("electron-dual:{}", profile_name.into()),
            primary_records,
            secondary_records,
        }
    }
}

impl DraftImportSource for ElectronDualSourceDraftImporter {
    fn origin_id(&self) -> &str {
        &self.origin_id
    }

    fn collect_drafts(&self) -> DraftStoreResult<Vec<LegacyDraftRecord>> {
        let mut merged = BTreeMap::<String, LegacyDraftRecord>::new();
        for rec in self
            .primary_records
            .iter()
            .chain(self.secondary_records.iter())
        {
            merged
                .entry(rec.source_key.clone())
                .and_modify(|existing| {
                    if rec.updated_at_ms > existing.updated_at_ms {
                        *existing = rec.clone();
                    }
                })
                .or_insert_with(|| rec.clone());
        }
        Ok(merged.into_values().collect())
    }
}

/// Physically isolated local draft store with SHA-256 attachment deduplication and refcount GC.
pub struct ComposerDraftStore<B: DraftStorageBackend = MemoryDraftBackend> {
    backend: B,
    state: DraftStoreSnapshot,
}

impl ComposerDraftStore<MemoryDraftBackend> {
    /// Create an isolated in-memory draft store.
    pub fn in_memory(namespace: impl Into<String>) -> DraftStoreResult<Self> {
        let backend = MemoryDraftBackend::new(namespace)?;
        Self::open(backend)
    }
}

impl<B: DraftStorageBackend> ComposerDraftStore<B> {
    /// Open a draft store over `backend`, verifying physical isolation from `<spaceId>.db`.
    pub fn open(backend: B) -> DraftStoreResult<Self> {
        validate_isolated_namespace(backend.namespace())?;
        let state = backend
            .load_snapshot()?
            .unwrap_or_else(|| DraftStoreSnapshot {
                namespace: backend.namespace().to_string(),
                ..DraftStoreSnapshot::default()
            });
        Ok(Self { backend, state })
    }

    pub fn namespace(&self) -> &str {
        self.backend.namespace()
    }

    pub fn backend(&self) -> &B {
        &self.backend
    }

    pub fn draft_count(&self) -> usize {
        self.state.drafts.len()
    }

    pub fn attachment_count(&self) -> usize {
        self.state.attachments.len()
    }

    pub fn list_drafts(&self) -> Vec<&ComposerDraft> {
        let mut list: Vec<&ComposerDraft> = self.state.drafts.values().collect();
        list.sort_by(|a, b| {
            b.updated_at_ms
                .cmp(&a.updated_at_ms)
                .then_with(|| a.draft_id.cmp(&b.draft_id))
        });
        list
    }

    pub fn get_draft(&self, draft_id: &str) -> Option<&ComposerDraft> {
        self.state.drafts.get(draft_id)
    }

    pub fn attachment_meta(&self, hash: &ContentHash) -> Option<&AttachmentMeta> {
        self.state.attachments.get(hash)
    }

    pub fn read_attachment(&self, hash: &ContentHash) -> DraftStoreResult<Vec<u8>> {
        self.backend
            .get_blob(hash)?
            .ok_or_else(|| DraftStoreError::AttachmentNotFound(hash.as_str().to_string()))
    }

    /// Create or update a local draft (preserving existing attachment references).
    pub fn upsert_draft(
        &mut self,
        draft_id: impl Into<String>,
        workspace_id: impl Into<String>,
        target_doc_id: Option<String>,
        title: impl Into<String>,
        body_markdown: impl Into<String>,
        now_ms: i64,
    ) -> DraftStoreResult<ComposerDraft> {
        let draft_id = draft_id.into();
        let entry = if let Some(existing) = self.state.drafts.get_mut(&draft_id) {
            existing.workspace_id = workspace_id.into();
            existing.target_doc_id = target_doc_id;
            existing.title = title.into();
            existing.body_markdown = body_markdown.into();
            existing.updated_at_ms = now_ms;
            existing.clone()
        } else {
            let created = ComposerDraft {
                draft_id: draft_id.clone(),
                workspace_id: workspace_id.into(),
                target_doc_id,
                title: title.into(),
                body_markdown: body_markdown.into(),
                attachment_hashes: Vec::new(),
                created_at_ms: now_ms,
                updated_at_ms: now_ms,
                imported_from: None,
            };
            self.state.drafts.insert(draft_id, created.clone());
            created
        };
        self.backend.save_snapshot(&self.state)?;
        Ok(entry)
    }

    /// Attach bytes to a draft using SHA-256 content addressing and deduplication.
    ///
    /// Returns `(hash, was_deduplicated)`.
    pub fn attach_bytes(
        &mut self,
        draft_id: &str,
        filename: impl Into<String>,
        mime_type: impl Into<String>,
        bytes: &[u8],
        now_ms: i64,
    ) -> DraftStoreResult<(ContentHash, bool)> {
        if !self.state.drafts.contains_key(draft_id) {
            return Err(DraftStoreError::DraftNotFound(draft_id.to_string()));
        }
        let hash = ContentHash::of_bytes(bytes);
        let already_attached = self.state.drafts[draft_id]
            .attachment_hashes
            .iter()
            .any(|h| h == &hash);

        let was_deduplicated = self.state.attachments.contains_key(&hash);
        if !was_deduplicated {
            self.backend.put_blob(&hash, bytes)?;
            self.state.attachments.insert(
                hash.clone(),
                AttachmentMeta {
                    hash: hash.clone(),
                    mime_type: mime_type.into(),
                    filename: filename.into(),
                    byte_len: bytes.len(),
                    ref_count: 0,
                },
            );
        }

        if !already_attached {
            if let Some(meta) = self.state.attachments.get_mut(&hash) {
                meta.ref_count += 1;
            }
            if let Some(draft) = self.state.drafts.get_mut(draft_id) {
                draft.attachment_hashes.push(hash.clone());
                draft.updated_at_ms = now_ms;
            }
        }

        self.backend.save_snapshot(&self.state)?;
        Ok((hash, was_deduplicated))
    }

    /// Delete a draft, decrement its attachment refcounts, and GC unreferenced blobs.
    ///
    /// Returns the number of unreferenced attachment blobs reclaimed.
    pub fn delete_draft(&mut self, draft_id: &str) -> DraftStoreResult<usize> {
        let Some(removed) = self.state.drafts.remove(draft_id) else {
            return Err(DraftStoreError::DraftNotFound(draft_id.to_string()));
        };
        for hash in removed.attachment_hashes {
            if let Some(meta) = self.state.attachments.get_mut(&hash) {
                meta.ref_count = meta.ref_count.saturating_sub(1);
            }
        }
        let reclaimed = self.gc_unreferenced_attachments()?;
        self.backend.save_snapshot(&self.state)?;
        Ok(reclaimed)
    }

    /// Reclaim all attachments with `ref_count == 0` from both metadata and blob storage.
    pub fn gc_unreferenced_attachments(&mut self) -> DraftStoreResult<usize> {
        let dead: Vec<ContentHash> = self
            .state
            .attachments
            .iter()
            .filter(|(_, meta)| meta.ref_count == 0)
            .map(|(h, _)| h.clone())
            .collect();
        let mut reclaimed = 0usize;
        for hash in dead {
            self.state.attachments.remove(&hash);
            if self.backend.delete_blob(&hash)? {
                reclaimed += 1;
            }
        }
        if reclaimed > 0 {
            self.backend.save_snapshot(&self.state)?;
        }
        Ok(reclaimed)
    }

    /// Run a one-way idempotent import from `source`.
    ///
    /// Re-running the same source skips already-imported records without duplicating drafts
    /// or inflating attachment reference counts.
    pub fn import_one_way(
        &mut self,
        source: &dyn DraftImportSource,
    ) -> DraftStoreResult<DraftImportReport> {
        let origin = source.origin_id().to_string();
        let records = source.collect_drafts()?;
        let mut report = DraftImportReport::default();

        for rec in records {
            let fingerprint = format!("{origin}::{}", rec.source_key);
            if self.state.imported_sources.contains(&fingerprint) {
                report.skipped_already_imported += 1;
                continue;
            }

            let draft_id = format!("import-{}-{}", origin.replace(':', "-"), rec.source_key);
            let mut draft = ComposerDraft {
                draft_id: draft_id.clone(),
                workspace_id: rec.workspace_id,
                target_doc_id: rec.target_doc_id,
                title: rec.title,
                body_markdown: rec.body_markdown,
                attachment_hashes: Vec::new(),
                created_at_ms: rec.created_at_ms,
                updated_at_ms: rec.updated_at_ms,
                imported_from: Some(fingerprint.clone()),
            };

            let mut seen_in_draft = BTreeSet::new();
            for att in rec.attachments {
                let hash = ContentHash::of_bytes(&att.bytes);
                if !seen_in_draft.insert(hash.clone()) {
                    report.deduplicated_attachments += 1;
                    continue;
                }
                if let Some(meta) = self.state.attachments.get_mut(&hash) {
                    meta.ref_count += 1;
                    report.deduplicated_attachments += 1;
                } else {
                    self.backend.put_blob(&hash, &att.bytes)?;
                    self.state.attachments.insert(
                        hash.clone(),
                        AttachmentMeta {
                            hash: hash.clone(),
                            mime_type: att.mime_type,
                            filename: att.filename,
                            byte_len: att.bytes.len(),
                            ref_count: 1,
                        },
                    );
                    report.stored_attachments += 1;
                }
                draft.attachment_hashes.push(hash);
            }

            self.state.drafts.insert(draft_id, draft);
            self.state.imported_sources.insert(fingerprint);
            report.imported_drafts += 1;
        }

        self.backend.save_snapshot(&self.state)?;
        Ok(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_collaborative_workspace_db_paths_for_physical_isolation() {
        for forbidden in [
            "/tmp/affine/ws-123.db",
            "ws-abc.db",
            "/Users/me/workspaces/ws-1/storage.db",
            "relative/path/space.db/drafts",
            "   ",
        ] {
            let err = ComposerDraftStore::in_memory(forbidden)
                .err()
                .expect("must reject collaborative workspace DB path");
            assert!(matches!(err, DraftStoreError::WorkspaceDbCollision(_)));
        }

        let ok = ComposerDraftStore::in_memory("local://composer-drafts-isolated")
            .expect("isolated namespace allowed");
        assert_eq!(ok.namespace(), "local://composer-drafts-isolated");
    }

    #[test]
    fn sha256_attachment_dedup_and_refcount_gc_lifecycle() {
        let mut store = ComposerDraftStore::in_memory("local://drafts").unwrap();
        store
            .upsert_draft("d1", "ws-1", Some("doc-1".into()), "Draft 1", "Body 1", 100)
            .unwrap();
        store
            .upsert_draft("d2", "ws-1", Some("doc-2".into()), "Draft 2", "Body 2", 200)
            .unwrap();

        let payload = b"identical-image-payload-bytes";
        let (h1, dedup1) = store
            .attach_bytes("d1", "a.png", "image/png", payload, 110)
            .unwrap();
        let (h2, dedup2) = store
            .attach_bytes("d2", "b.png", "image/png", payload, 210)
            .unwrap();

        assert_eq!(h1, h2);
        assert!(!dedup1);
        assert!(dedup2);
        assert_eq!(store.attachment_count(), 1);
        assert_eq!(store.backend().blob_count(), 1);
        assert_eq!(store.attachment_meta(&h1).unwrap().ref_count, 2);
        assert_eq!(store.read_attachment(&h1).unwrap(), payload);

        // Deleting d1 decrements refcount to 1, blob survives.
        let reclaimed1 = store.delete_draft("d1").unwrap();
        assert_eq!(reclaimed1, 0);
        assert_eq!(store.attachment_meta(&h1).unwrap().ref_count, 1);
        assert_eq!(store.backend().blob_count(), 1);

        // Deleting d2 drops refcount to 0 and GC reclaims the blob.
        let reclaimed2 = store.delete_draft("d2").unwrap();
        assert_eq!(reclaimed2, 1);
        assert_eq!(store.attachment_count(), 0);
        assert_eq!(store.backend().blob_count(), 0);
    }

    #[test]
    fn one_way_web_and_electron_importers_are_idempotent() {
        let mut store = ComposerDraftStore::in_memory("local://drafts").unwrap();
        let shared_blob = b"shared-diagram-png".to_vec();

        let web_importer = WebDesktopLegacyDraftImporter::new(
            "https://app.affine.pro",
            vec![LegacyDraftRecord {
                source_key: "web-1".into(),
                workspace_id: "ws-1".into(),
                target_doc_id: None,
                title: "Web Draft".into(),
                body_markdown: "Hello from web".into(),
                created_at_ms: 1000,
                updated_at_ms: 1200,
                attachments: vec![LegacyDraftAttachment {
                    filename: "arch.png".into(),
                    mime_type: "image/png".into(),
                    bytes: shared_blob.clone(),
                }],
            }],
        );

        let r1 = store.import_one_way(&web_importer).unwrap();
        assert_eq!(r1.imported_drafts, 1);
        assert_eq!(r1.stored_attachments, 1);
        assert_eq!(r1.skipped_already_imported, 0);

        // Re-running web importer is a strict no-op.
        let r2 = store.import_one_way(&web_importer).unwrap();
        assert_eq!(r2.imported_drafts, 0);
        assert_eq!(r2.skipped_already_imported, 1);
        assert_eq!(store.draft_count(), 1);

        // Electron dual-source merges primary + secondary (keeping newer updated_at_ms) and dedups blob.
        let electron_importer = ElectronDualSourceDraftImporter::new(
            "default",
            vec![LegacyDraftRecord {
                source_key: "elec-1".into(),
                workspace_id: "ws-1".into(),
                target_doc_id: Some("doc-arch".into()),
                title: "Older Title".into(),
                body_markdown: "Old".into(),
                created_at_ms: 2000,
                updated_at_ms: 2100,
                attachments: vec![],
            }],
            vec![LegacyDraftRecord {
                source_key: "elec-1".into(),
                workspace_id: "ws-1".into(),
                target_doc_id: Some("doc-arch".into()),
                title: "Newer Electron Draft".into(),
                body_markdown: "Updated body".into(),
                created_at_ms: 2000,
                updated_at_ms: 2500,
                attachments: vec![LegacyDraftAttachment {
                    filename: "arch-copy.png".into(),
                    mime_type: "image/png".into(),
                    bytes: shared_blob.clone(),
                }],
            }],
        );

        let r3 = store.import_one_way(&electron_importer).unwrap();
        assert_eq!(r3.imported_drafts, 1);
        assert_eq!(r3.deduplicated_attachments, 1);
        assert_eq!(r3.stored_attachments, 0);
        assert_eq!(store.draft_count(), 2);
        assert_eq!(store.attachment_count(), 1);
        let hash = ContentHash::of_bytes(&shared_blob);
        assert_eq!(store.attachment_meta(&hash).unwrap().ref_count, 2);

        // Re-running Electron importer is also strictly idempotent.
        let r4 = store.import_one_way(&electron_importer).unwrap();
        assert_eq!(r4.imported_drafts, 0);
        assert_eq!(r4.skipped_already_imported, 1);
        assert_eq!(store.attachment_meta(&hash).unwrap().ref_count, 2);
    }

    #[test]
    fn rejects_path_traversal_hashes_and_all_collaborative_db_suffixes() {
        for bad in [
            "../../etc/passwd",
            "../blobs/secret",
            "a/b",
            "a\\b",
            "ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            "short",
            "",
        ] {
            assert!(
                ContentHash::parse(bad).is_err(),
                "expected ContentHash::parse to reject `{bad}`"
            );
            let json = format!("\"{}\"", bad.replace('\\', "\\\\"));
            assert!(
                serde_json::from_str::<ContentHash>(&json).is_err(),
                "expected serde Deserialize to reject `{bad}`"
            );
        }

        let valid = ContentHash::of_bytes(b"safe-payload");
        assert!(ContentHash::parse(valid.as_str()).is_ok());

        for bad_ns in [
            "/tmp/space.db",
            "/tmp/space.affine",
            "/tmp/space.sqlite",
            "/tmp/space.sqlite3",
            "/tmp/space.db-wal",
            "/tmp/space.db-shm",
            "/tmp/space.affine/drafts",
            "/tmp/space.sqlite3\\drafts",
        ] {
            assert!(
                validate_isolated_namespace(bad_ns).is_err(),
                "expected validate_isolated_namespace to reject `{bad_ns}`"
            );
        }
        assert!(validate_isolated_namespace("local://affine-desktop-composer-drafts").is_ok());
    }
}
