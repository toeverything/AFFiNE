use std::collections::{BTreeMap, BTreeSet};

use sha2::{Digest, Sha256};
use y_octo::{
    Any, DocOptions, DocSession, SessionConfig, SessionReadValue, SessionTxOrigin,
    SessionUndoConfig, SessionValue, TypePath, TypeTarget, YTypeKind,
};

use crate::error::{StoreError, StoreResult};

const NANOID_URL_SAFE: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const DERIVED_PAGE_ID_LEN: usize = 10;

/// Deterministically derive a BlockSuite-compatible 10-character URL-safe NanoID
/// (`[A-Za-z0-9_-]{10}`) from `(space_id, op_id)`.
///
/// Guarantees cross-restart `create_page` idempotency even if local sidecar caches are cleared
/// by legacy clients or lost to a mid-transaction crash, without writing any extra keys into
/// shared Yjs `meta.pages`.
pub fn derive_page_id_for_op(space_id: &str, op_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"affine:create-page:v1:");
    hasher.update(space_id.as_bytes());
    hasher.update(b":");
    hasher.update(op_id.as_bytes());
    let digest = hasher.finalize();

    let mut id = String::with_capacity(DERIVED_PAGE_ID_LEN);
    for &byte in &digest[..DERIVED_PAGE_ID_LEN] {
        id.push(NANOID_URL_SAFE[(byte & 0x3f) as usize] as char);
    }
    id
}

/// Metadata for one page entry in `rootDoc.meta.pages`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PageMetaEntry {
    pub id: String,
    pub title: String,
    pub create_date_ms: i64,
    pub updated_date_ms: Option<i64>,
    pub tags: Vec<String>,
    pub trashed: bool,
    pub trash_date_ms: Option<i64>,
}

/// Result of an idempotent `create_page` call.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreatePageOutcome {
    pub page_id: String,
    pub created_new: bool,
    /// Encoded v1 root-doc update emitted by this call, or `None` on idempotent retry.
    pub update: Option<Vec<u8>>,
}

/// How a page's canonical ID is determined during [`WorkspaceRootDoc::create_page`].
///
/// Encoding the choice in a sum type prevents callers from passing both an `op_id` and an
/// explicit `page_id` that would otherwise be silently ignored.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PageIdSource<'a> {
    /// Deterministically derive a 10-character URL-safe NanoID from `(space_id, op_id)`
    /// via [`derive_page_id_for_op`].
    DerivedFromOp(&'a str),
    /// Use an explicit caller-chosen canonical page ID (for example, inline linked-doc creation
    /// where the reference block and target document must share a known ID).
    Explicit(&'a str),
}

/// Result of applying a remote update to the root document.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemoteRootApply {
    /// Subdocument IDs newly present in `spaces` or announced via `subdocs_added`.
    pub newly_discovered_subdocs: Vec<String>,
}

/// Authoritative coordinator for the AFFiNE workspace root YDoc (`meta.pages` + `spaces[pageId]`).
pub struct WorkspaceRootDoc {
    space_id: String,
    root: DocSession<()>,
    baseline_sv: Vec<u8>,
    local_writeback: bool,
    revision: u64,
}

impl WorkspaceRootDoc {
    /// Create a fresh uninitialized workspace root document.
    ///
    /// Call [`Self::initialize_meta`] explicitly when bootstrapping a brand-new local workspace.
    pub fn new(space_id: impl Into<String>, client_id: u64) -> Self {
        let space_id = space_id.into();
        let options = DocOptions::from_identity(client_id, space_id.clone());
        let root = DocSession::with_config(
            options,
            SessionConfig {
                undo: SessionUndoConfig::Disabled,
            },
        );
        let baseline_sv = root.encode_state_vector_v1().unwrap_or_default();
        Self {
            space_id,
            root,
            baseline_sv,
            local_writeback: false,
            revision: 0,
        }
    }

    /// Load an existing root document from encoded v1 bytes with zero writeback.
    pub fn from_update_v1(
        space_id: impl Into<String>,
        client_id: u64,
        update: &[u8],
    ) -> StoreResult<Self> {
        let mut doc = Self::new(space_id, client_id);
        if !update.is_empty() && update != [0, 0] {
            let commits = doc
                .root
                .apply_update_v1(update)
                .map_err(|err| StoreError::InvalidBinary(err.to_string()))?;
            doc.local_writeback = commits.iter().any(|c| {
                c.origin_kind == y_octo::SessionOriginKind::FormattingCleanup
                    && !c.update.is_empty()
            });
            doc.revision = doc.revision.wrapping_add(1);
        }
        doc.baseline_sv = doc
            .root
            .encode_state_vector_v1()
            .map_err(|err| StoreError::YOcto(err.to_string()))?;
        Ok(doc)
    }

    pub fn space_id(&self) -> &str {
        &self.space_id
    }

    /// Monotonically increasing revision bumped on every local commit and remote update,
    /// including delete-only updates that leave the Yjs state vector unchanged.
    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// Return `true` when `meta.pages` is initialized as a `Y.Array`.
    pub fn is_meta_initialized(&self) -> bool {
        let pages_target = TypeTarget::Path(TypePath::root("meta").key("pages"));
        self.root.read_array(&pages_target).is_ok()
    }

    /// Explicitly initialize `meta.pages = []` for a brand-new local workspace.
    ///
    /// Matches `0.27.5` `WorkspaceMeta.initialize()`. Returns `Ok(None)` with zero writeback
    /// when `meta.pages` is already an array.
    pub fn initialize_meta(&mut self) -> StoreResult<Option<Vec<u8>>> {
        if self.is_meta_initialized() {
            return Ok(None);
        }
        let meta_id = self
            .root
            .ensure_root("meta", YTypeKind::Map)
            .map_err(|err| StoreError::YOcto(err.to_string()))?;
        let _ = self
            .root
            .ensure_root("spaces", YTypeKind::Map)
            .map_err(|err| StoreError::YOcto(err.to_string()))?;
        let meta_target = TypeTarget::from(meta_id);

        self.with_tx(|root| {
            root.map_set(
                &meta_target,
                "pages".to_string(),
                SessionValue::Array(Vec::new()),
            )
            .map_err(|err| StoreError::YOcto(err.to_string()))?;
            Ok(())
        })
    }

    /// Return `true` when local mutations have been written since load.
    pub fn has_local_writeback(&self) -> StoreResult<bool> {
        if self.local_writeback {
            return Ok(true);
        }
        let current_sv = self
            .root
            .encode_state_vector_v1()
            .map_err(|err| StoreError::YOcto(err.to_string()))?;
        Ok(current_sv != self.baseline_sv)
    }

    /// Encode the full v1 update for persistence.
    pub fn encode_update_v1(&self) -> StoreResult<Vec<u8>> {
        self.root
            .encode_diff_v1(&[0])
            .map_err(|err| StoreError::YOcto(err.to_string()))
    }

    /// Encode the current state vector.
    pub fn encode_state_vector_v1(&self) -> StoreResult<Vec<u8>> {
        self.root
            .encode_state_vector_v1()
            .map_err(|err| StoreError::YOcto(err.to_string()))
    }

    /// Encode a v1 diff against `remote_sv`.
    pub fn encode_diff_v1(&self, remote_sv: &[u8]) -> StoreResult<Vec<u8>> {
        self.root
            .encode_diff_v1(remote_sv)
            .map_err(|err| StoreError::YOcto(err.to_string()))
    }

    /// Atomically create a page in both `meta.pages` and `spaces[page_id]` in a single transaction.
    ///
    /// Fails with [`StoreError::RootMetaNotInitialized`] if `meta.pages` is missing or not a
    /// `Y.Array` (never overwrites an unsynced remote `meta.pages`).
    ///
    /// Writes only the frozen `0.27.5` `DocMeta` keys (`id`, `title`, `createDate`, `tags`) into
    /// shared Yjs. Idempotency is determined directly from `meta.pages` + `spaces` in the root
    /// YDoc using either [`PageIdSource::DerivedFromOp`] (`derive_page_id_for_op`) or
    /// [`PageIdSource::Explicit`] (caller-chosen canonical ID), with zero sidecar tables.
    pub fn create_page(
        &mut self,
        id_source: PageIdSource<'_>,
        title: &str,
        create_date_ms: i64,
    ) -> StoreResult<CreatePageOutcome> {
        let effective_page_id = match id_source {
            PageIdSource::DerivedFromOp(op_id) => {
                if op_id.is_empty() {
                    return Err(StoreError::InvalidProtocol(
                        "create_page DerivedFromOp requires a non-empty op_id".into(),
                    ));
                }
                derive_page_id_for_op(&self.space_id, op_id)
            }
            PageIdSource::Explicit(page_id) => {
                if page_id.is_empty()
                    || page_id.starts_with("db$")
                    || page_id.starts_with("userdata$")
                {
                    return Err(StoreError::InvalidProtocol(format!(
                        "invalid explicit page_id: {page_id:?}"
                    )));
                }
                page_id.to_string()
            }
        };

        if effective_page_id == self.space_id {
            return Err(StoreError::InvalidProtocol(format!(
                "page_id must not collide with workspace root space_id {:?}",
                self.space_id
            )));
        }

        if !self.is_meta_initialized() {
            return Err(StoreError::RootMetaNotInitialized);
        }

        // Check both active/soft-deleted meta.pages and spaces[page_id] in the authoritative root
        // YDoc so retries neither duplicate entries nor return an incomplete/deleted page.
        let has_page = self.get_page(&effective_page_id)?.is_some();
        let has_space = self.subdoc_guids()?.contains_key(&effective_page_id);
        if has_page && has_space {
            return Ok(CreatePageOutcome {
                page_id: effective_page_id,
                created_new: false,
                update: None,
            });
        }

        let spaces_id = self
            .root
            .ensure_root("spaces", YTypeKind::Map)
            .map_err(|err| StoreError::YOcto(err.to_string()))?;
        let spaces_target = TypeTarget::from(spaces_id);
        let pages_target = TypeTarget::Path(TypePath::root("meta").key("pages"));

        let page_map = (!has_page).then(|| {
            SessionValue::Map(vec![
                (
                    "id".to_string(),
                    SessionValue::Any(Any::String(effective_page_id.clone())),
                ),
                (
                    "title".to_string(),
                    SessionValue::Any(Any::String(title.to_string())),
                ),
                (
                    "createDate".to_string(),
                    SessionValue::Any(Any::Float64((create_date_ms as f64).into())),
                ),
                ("tags".to_string(), SessionValue::Array(Vec::new())),
            ])
        });

        let update = self.with_tx(|root| {
            if let Some(map_val) = page_map {
                root.array_push(&pages_target, vec![map_val])
                    .map_err(|err| StoreError::YOcto(err.to_string()))?;
            }
            if !has_space {
                root.map_set(
                    &spaces_target,
                    effective_page_id.clone(),
                    SessionValue::Doc {
                        guid: effective_page_id.clone(),
                        gc: true,
                    },
                )
                .map_err(|err| StoreError::YOcto(err.to_string()))?;
            }
            Ok(())
        })?;

        Ok(CreatePageOutcome {
            page_id: effective_page_id,
            created_new: !has_page,
            update,
        })
    }

    /// Update the title of `page_id` in `meta.pages`. Returns `Ok(None)` when unchanged.
    pub fn rename_page(&mut self, page_id: &str, new_title: &str) -> StoreResult<Option<Vec<u8>>> {
        let Some(target) = self.find_page_map_target(page_id)? else {
            return Err(StoreError::DocNotFound(page_id.to_string()));
        };

        if matches!(
            self.root
                .get_map_value(&target, "title")
                .map_err(|err| StoreError::YOcto(err.to_string()))?,
            Some(SessionReadValue::Any(Any::String(ref current))) if current == new_title
        ) {
            return Ok(None);
        }

        let commit = self
            .root
            .map_set(
                &target,
                "title".to_string(),
                SessionValue::Any(Any::String(new_title.to_string())),
            )
            .map_err(|err| StoreError::YOcto(err.to_string()))?;
        if commit.is_some() {
            self.local_writeback = true;
            self.revision = self.revision.wrapping_add(1);
        }

        Ok(commit.map(|c| c.update))
    }

    /// Soft-delete (move to trash) `page_id` in `meta.pages`.
    pub fn trash_page(
        &mut self,
        page_id: &str,
        trash_date_ms: i64,
    ) -> StoreResult<Option<Vec<u8>>> {
        let Some(target) = self.find_page_map_target(page_id)? else {
            return Err(StoreError::DocNotFound(page_id.to_string()));
        };

        if matches!(
            self.root
                .get_map_value(&target, "trash")
                .map_err(|err| StoreError::YOcto(err.to_string()))?,
            Some(SessionReadValue::Any(Any::True))
        ) {
            return Ok(None);
        }

        self.with_tx(|root| {
            root.map_set(&target, "trash".to_string(), SessionValue::Any(Any::True))
                .map_err(|err| StoreError::YOcto(err.to_string()))?;
            root.map_set(
                &target,
                "trashDate".to_string(),
                SessionValue::Any(Any::Float64((trash_date_ms as f64).into())),
            )
            .map_err(|err| StoreError::YOcto(err.to_string()))?;
            Ok(())
        })
    }

    /// Restore a soft-deleted page in `meta.pages`.
    pub fn restore_page(&mut self, page_id: &str) -> StoreResult<Option<Vec<u8>>> {
        let Some(target) = self.find_page_map_target(page_id)? else {
            return Err(StoreError::DocNotFound(page_id.to_string()));
        };

        let is_trashed = matches!(
            self.root
                .get_map_value(&target, "trash")
                .map_err(|err| StoreError::YOcto(err.to_string()))?,
            Some(SessionReadValue::Any(Any::True))
        );
        if !is_trashed {
            return Ok(None);
        }

        self.with_tx(|root| {
            root.map_set(&target, "trash".to_string(), SessionValue::Any(Any::False))
                .map_err(|err| StoreError::YOcto(err.to_string()))?;
            root.map_remove(&target, "trashDate")
                .map_err(|err| StoreError::YOcto(err.to_string()))?;
            Ok(())
        })
    }

    /// Apply a remote update to the root document and report newly discovered subdoc GUIDs.
    pub fn apply_remote_update(&mut self, bytes: &[u8]) -> StoreResult<RemoteRootApply> {
        let before: BTreeSet<String> = self.subdoc_guids()?.into_values().collect();
        let commits = self
            .root
            .apply_update_v1(bytes)
            .map_err(|err| StoreError::InvalidBinary(err.to_string()))?;
        if !bytes.is_empty() && bytes != [0, 0] {
            self.revision = self.revision.wrapping_add(1);
        }

        let mut discovered = BTreeSet::new();
        for commit in &commits {
            for guid in &commit.subdocs_added {
                if !before.contains(guid) {
                    discovered.insert(guid.clone());
                }
            }
        }
        for guid in self.subdoc_guids()?.into_values() {
            if !before.contains(&guid) {
                discovered.insert(guid);
            }
        }

        Ok(RemoteRootApply {
            newly_discovered_subdocs: discovered.into_iter().collect(),
        })
    }

    /// List all page metadata entries in `meta.pages` without mutating the document.
    pub fn list_pages(&self) -> StoreResult<Vec<PageMetaEntry>> {
        let pages_target = TypeTarget::Path(TypePath::root("meta").key("pages"));
        let Ok(items) = self.root.read_array(&pages_target) else {
            return Ok(Vec::new());
        };

        let mut result = Vec::new();
        for item in items {
            let SessionReadValue::Map(map_id) = item else {
                continue;
            };
            let entries = self
                .root
                .read_map(&TypeTarget::Identity(map_id))
                .map_err(|err| StoreError::YOcto(err.to_string()))?;
            let mut id = String::new();
            let mut title = String::new();
            let mut create_date_ms = 0i64;
            let mut updated_date_ms = None;
            let mut tags = Vec::new();
            let mut trashed = false;
            let mut trash_date_ms = None;

            for (key, value) in entries {
                match key.as_str() {
                    "id" => {
                        if let SessionReadValue::Any(Any::String(s)) = value {
                            id = s;
                        }
                    }
                    "title" => {
                        if let SessionReadValue::Any(Any::String(s)) = value {
                            title = s;
                        }
                    }
                    "createDate" => {
                        if let Some(n) = any_to_i64(&value) {
                            create_date_ms = n;
                        }
                    }
                    "updatedDate" => {
                        updated_date_ms = any_to_i64(&value);
                    }
                    "trash" => {
                        trashed = matches!(value, SessionReadValue::Any(Any::True));
                    }
                    "trashDate" => {
                        trash_date_ms = any_to_i64(&value);
                    }
                    "tags" => {
                        if let SessionReadValue::Array(arr_id) = value {
                            for tag in self
                                .root
                                .read_array(&TypeTarget::Identity(arr_id))
                                .map_err(|err| StoreError::YOcto(err.to_string()))?
                            {
                                if let SessionReadValue::Any(Any::String(s)) = tag {
                                    tags.push(s);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }

            if !id.is_empty() {
                result.push(PageMetaEntry {
                    id,
                    title,
                    create_date_ms,
                    updated_date_ms,
                    tags,
                    trashed,
                    trash_date_ms,
                });
            }
        }

        Ok(result)
    }

    /// Read a single page metadata entry by `page_id`.
    pub fn get_page(&self, page_id: &str) -> StoreResult<Option<PageMetaEntry>> {
        Ok(self
            .list_pages()?
            .into_iter()
            .find(|entry| entry.id == page_id))
    }

    /// Return `page_id -> subdoc_guid` from `spaces` without mutating the document.
    pub fn subdoc_guids(&self) -> StoreResult<BTreeMap<String, String>> {
        let spaces_target = TypeTarget::Path(TypePath::root("spaces"));
        let Ok(entries) = self.root.read_map(&spaces_target) else {
            return Ok(BTreeMap::new());
        };
        let mut out = BTreeMap::new();
        for (page_id, value) in entries {
            if let SessionReadValue::Doc { guid, .. } = value {
                out.insert(page_id, guid);
            }
        }
        Ok(out)
    }

    /// Execute `f` inside a `y-octo` transaction frame, guaranteeing `commit_tx()` always runs
    /// even when `f` returns an error so subsequent `apply_update_v1` calls are never locked out.
    ///
    /// Callers must finish all read-only validation before entering `with_tx`.
    fn with_tx<F>(&mut self, f: F) -> StoreResult<Option<Vec<u8>>>
    where
        F: FnOnce(&mut DocSession<()>) -> StoreResult<()>,
    {
        self.root
            .begin_tx(SessionTxOrigin::Untracked)
            .map_err(|err| StoreError::YOcto(err.to_string()))?;
        let body_result = f(&mut self.root);
        let commit_result = self
            .root
            .commit_tx()
            .map_err(|err| StoreError::YOcto(err.to_string()));
        if let Ok(Some(_)) = commit_result {
            self.local_writeback = true;
            self.revision = self.revision.wrapping_add(1);
        }
        body_result?;
        let commit = commit_result?;
        Ok(commit.map(|c| c.update))
    }

    fn find_page_map_target(&self, page_id: &str) -> StoreResult<Option<TypeTarget>> {
        let pages_target = TypeTarget::Path(TypePath::root("meta").key("pages"));
        let Ok(items) = self.root.read_array(&pages_target) else {
            return Ok(None);
        };
        for item in items {
            if let SessionReadValue::Map(map_id) = item {
                let target = TypeTarget::Identity(map_id);
                if matches!(
                    self.root
                        .get_map_value(&target, "id")
                        .map_err(|err| StoreError::YOcto(err.to_string()))?,
                    Some(SessionReadValue::Any(Any::String(ref id))) if id == page_id
                ) {
                    return Ok(Some(target));
                }
            }
        }
        Ok(None)
    }
}

fn any_to_i64(value: &SessionReadValue) -> Option<i64> {
    match value {
        SessionReadValue::Any(Any::Integer(n)) => Some(i64::from(*n)),
        SessionReadValue::Any(Any::BigInt64(n)) => Some(*n),
        SessionReadValue::Any(Any::Float64(f)) => Some(f.0 as i64),
        SessionReadValue::Any(Any::Float32(f)) => Some(f.0 as i64),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_page_rejects_uninitialized_meta_and_reserved_ids_without_writeback() {
        let mut root = WorkspaceRootDoc::new("ws-uninit", 1);
        assert!(!root.is_meta_initialized());
        let sv_before = root.encode_state_vector_v1().unwrap();
        let err = root
            .create_page(PageIdSource::DerivedFromOp("op-1"), "Should Fail", 1_000)
            .unwrap_err();
        assert!(matches!(err, StoreError::RootMetaNotInitialized));
        assert!(matches!(
            root.create_page(PageIdSource::DerivedFromOp(""), "Empty Op", 1_000),
            Err(StoreError::InvalidProtocol(_))
        ));
        assert!(matches!(
            root.create_page(PageIdSource::Explicit("db$folders"), "Bad Explicit", 1_000),
            Err(StoreError::InvalidProtocol(_))
        ));
        assert!(matches!(
            root.create_page(
                PageIdSource::Explicit("ws-uninit"),
                "Root Space Collision",
                1_000
            ),
            Err(StoreError::InvalidProtocol(_))
        ));
        assert_eq!(root.encode_state_vector_v1().unwrap(), sv_before);
        assert!(!root.has_local_writeback().unwrap());

        assert!(root.initialize_meta().unwrap().is_some());
        assert!(root.is_meta_initialized());
        assert!(root.initialize_meta().unwrap().is_none());
        let sv_init = root.encode_state_vector_v1().unwrap();
        assert!(matches!(
            root.create_page(
                PageIdSource::Explicit("ws-uninit"),
                "Root Space Collision",
                1_000
            ),
            Err(StoreError::InvalidProtocol(_))
        ));
        assert_eq!(root.encode_state_vector_v1().unwrap(), sv_init);
    }

    #[test]
    fn create_rename_trash_restore_and_schema_purity_without_create_op_id() {
        let mut root = WorkspaceRootDoc::new("ws-1", 1);
        root.initialize_meta().unwrap();

        let expected_id = derive_page_id_for_op("ws-1", "op-1");
        assert_eq!(expected_id.len(), 10);
        assert!(
            expected_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        );

        let first = root
            .create_page(PageIdSource::DerivedFromOp("op-1"), "Alpha", 1_000)
            .unwrap();
        assert!(first.created_new);
        assert_eq!(first.page_id, expected_id);
        assert!(first.update.is_some());
        assert_eq!(
            root.subdoc_guids()
                .unwrap()
                .get(&expected_id)
                .map(String::as_str),
            Some(expected_id.as_str())
        );

        // Explicit caller-chosen ID (e.g. inline linked doc) preserves exact ID and is idempotent.
        let explicit = root
            .create_page(PageIdSource::Explicit("LinkedDoc01"), "Linked", 1_100)
            .unwrap();
        assert!(explicit.created_new);
        assert_eq!(explicit.page_id, "LinkedDoc01");
        let explicit_retry = root
            .create_page(PageIdSource::Explicit("LinkedDoc01"), "Linked", 1_200)
            .unwrap();
        assert!(!explicit_retry.created_new);
        assert_eq!(explicit_retry.page_id, "LinkedDoc01");
        assert!(explicit_retry.update.is_none());

        // Verify shared Yjs meta.pages entry contains ONLY 0.27.5 keys (never createOpId).
        let page_target = root.find_page_map_target(&expected_id).unwrap().unwrap();
        let raw_entries = root.root.read_map(&page_target).unwrap();
        let keys: BTreeSet<String> = raw_entries.into_iter().map(|(k, _)| k).collect();
        assert!(!keys.contains("createOpId"));
        assert_eq!(
            keys,
            BTreeSet::from([
                "id".to_string(),
                "title".to_string(),
                "createDate".to_string(),
                "tags".to_string(),
            ])
        );

        // Reload from root Yjs bytes alone: deterministic derivation hits with zero writeback!
        let encoded = root.encode_update_v1().unwrap();
        let mut reloaded = WorkspaceRootDoc::from_update_v1("ws-1", 2, &encoded).unwrap();
        assert!(!reloaded.has_local_writeback().unwrap());
        let sv_before_retry = reloaded.encode_state_vector_v1().unwrap();

        let retry = reloaded
            .create_page(PageIdSource::DerivedFromOp("op-1"), "Alpha", 2_000)
            .unwrap();
        assert!(!retry.created_new);
        assert_eq!(retry.page_id, expected_id);
        assert!(retry.update.is_none());
        assert_eq!(reloaded.encode_state_vector_v1().unwrap(), sv_before_retry);
        assert!(!reloaded.has_local_writeback().unwrap());
        assert_eq!(reloaded.list_pages().unwrap().len(), 2);

        // Unchanged rename produces zero writeback; changed rename updates title.
        assert!(root.rename_page(&expected_id, "Alpha").unwrap().is_none());
        assert!(root.rename_page(&expected_id, "Beta").unwrap().is_some());
        assert_eq!(root.get_page(&expected_id).unwrap().unwrap().title, "Beta");

        // Trash and restore.
        assert!(root.trash_page(&expected_id, 2_000).unwrap().is_some());
        let trashed = root.get_page(&expected_id).unwrap().unwrap();
        assert!(trashed.trashed);
        assert_eq!(trashed.trash_date_ms, Some(2_000));

        assert!(root.restore_page(&expected_id).unwrap().is_some());
        let restored = root.get_page(&expected_id).unwrap().unwrap();
        assert!(!restored.trashed);
        assert_eq!(restored.trash_date_ms, None);

        // Remote subdoc discovery.
        let encoded_after = root.encode_update_v1().unwrap();
        let mut peer = WorkspaceRootDoc::from_update_v1("ws-1", 3, &encoded_after).unwrap();
        let new_page = root
            .create_page(PageIdSource::DerivedFromOp("op-2"), "Gamma", 3_000)
            .unwrap();
        let applied = peer
            .apply_remote_update(new_page.update.as_deref().unwrap())
            .unwrap();
        assert_eq!(applied.newly_discovered_subdocs, vec![new_page.page_id]);
    }

    #[test]
    fn failed_transaction_closes_tx_frame_so_remote_updates_still_apply() {
        let mut root = WorkspaceRootDoc::new("ws-tx", 1);
        root.initialize_meta().unwrap();

        let err = root
            .with_tx(|_| Err(StoreError::InvalidProtocol("injected fault".into())))
            .unwrap_err();
        assert!(matches!(err, StoreError::InvalidProtocol(_)));

        let mut peer =
            WorkspaceRootDoc::from_update_v1("ws-tx", 2, &root.encode_update_v1().unwrap())
                .unwrap();
        let created = peer
            .create_page(PageIdSource::DerivedFromOp("op-peer"), "Peer", 500)
            .unwrap();
        let applied = root
            .apply_remote_update(created.update.as_deref().unwrap())
            .unwrap();
        assert_eq!(applied.newly_discovered_subdocs, vec![created.page_id]);
    }
}
