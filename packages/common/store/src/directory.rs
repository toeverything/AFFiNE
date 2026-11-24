use std::{
    collections::BTreeMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

use serde::{Deserialize, Serialize};

use crate::{
    error::{StoreError, StoreResult},
    workspace_db::{
        DocPropertiesRow, PageIdSource, PendingDocUpdate, WorkspaceDb, WorkspaceDbTableName,
    },
};

#[derive(Deserialize, Serialize)]
struct ExplicitCreateJournalWire {
    space_id: String,
    intents: BTreeMap<String, String>,
}

/// Canonical document identifier in the store domain.
/// Never carries `db$`, `userdata$`, legacy subdoc GUIDs, or network ACK metadata.
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct DocId(String);

impl DocId {
    pub fn new(id: impl Into<String>) -> StoreResult<Self> {
        let id = id.into();
        if id.is_empty() || id.starts_with("db$") || id.starts_with("userdata$") {
            return Err(StoreError::InvalidProtocol(format!(
                "invalid canonical DocId: {id:?}"
            )));
        }
        Ok(Self(id))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Primary view mode of a document.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DocMode {
    Page,
    Edgeless,
}

impl DocMode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Page => "page",
            Self::Edgeless => "edgeless",
        }
    }

    pub fn from_wire(value: Option<&str>) -> Self {
        match value {
            Some("edgeless") => Self::Edgeless,
            _ => Self::Page,
        }
    }
}

/// Projected directory entry for a workspace document.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DocDirectoryEntry {
    pub id: DocId,
    pub title: String,
    pub mode: DocMode,
    pub create_date_ms: i64,
    pub updated_date_ms: Option<i64>,
    pub trashed: bool,
    pub tags: Vec<String>,
}

/// Stable pagination cursor ordered by `(create_date_ms, doc_id)`.
///
/// Survives deletion or rename of the cursor document between pages by advancing to the next
/// strictly greater `(create_date_ms, doc_id)` entry.
#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub struct DocCursor {
    pub create_date_ms: i64,
    pub doc_id: DocId,
}

/// Deterministic cancellation handle for directory queries.
#[derive(Clone, Debug, Default)]
pub struct CancelToken {
    cancelled: Arc<AtomicBool>,
}

impl CancelToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }
}

/// Query filter and cursor/offset pagination parameters for [`WorkspaceDirectory::query_docs`].
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct DocQuery {
    /// Optional Unicode case-insensitive title prefix filter.
    pub title_prefix: Option<String>,
    /// Optional Unicode case-insensitive exact substring filter (mirrors `fuse.js` `threshold: 0`).
    pub title_contains: Option<String>,
    /// Whether to include soft-deleted (trashed) documents.
    pub include_trashed: bool,
    /// Optional cursor identifying the last seen document from the previous page.
    pub cursor: Option<DocCursor>,
    /// Offset used when `cursor` is `None`.
    pub offset: usize,
    /// Maximum number of entries to return (`0` returns all remaining matches).
    pub limit: usize,
}

/// Paginated query response with cursor continuation token.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DocQueryPage {
    pub entries: Vec<DocDirectoryEntry>,
    pub total: usize,
    pub has_more: bool,
    pub next_cursor: Option<DocCursor>,
}

/// Canonical identity specification for [`CreateDocRequest`].
///
/// Separates deterministic `(space_id, op_id)` derivation from caller-chosen explicit IDs so
/// callers (such as inline linked-doc creation) never pass a `DocId` that is silently ignored.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CreateDocId {
    /// Deterministically derive a 10-character URL-safe NanoID from `(space_id, op_id)`.
    DerivedFromOp(String),
    /// Use an explicit caller-chosen `DocId` (idempotent against `meta.pages` + `spaces`).
    Explicit(DocId),
}

impl CreateDocId {
    pub fn from_op(op_id: impl Into<String>) -> StoreResult<Self> {
        let op_id = op_id.into();
        if op_id.is_empty() {
            return Err(StoreError::InvalidProtocol(
                "CreateDocId::DerivedFromOp requires a non-empty op_id".into(),
            ));
        }
        Ok(Self::DerivedFromOp(op_id))
    }

    pub fn explicit(doc_id: DocId) -> Self {
        Self::Explicit(doc_id)
    }
}

/// Command to create a new workspace document through [`WorkspaceDirectory`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreateDocRequest {
    pub id: CreateDocId,
    pub title: String,
    pub mode: DocMode,
    pub now_ms: i64,
}

/// Outcome of [`WorkspaceDirectory::create_doc`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreateDocResult {
    pub doc_id: DocId,
    pub created_new: bool,
}

struct CachedProjection {
    root_revision: u64,
    props_revision: Option<u64>,
    entries: Vec<DocDirectoryEntry>,
    titles_lower: Vec<String>,
}

#[derive(Default)]
struct ProjectionCacheState {
    cached: Option<CachedProjection>,
    rebuilds: u64,
}

/// Store-domain typed document directory query and mutation service backed by [`WorkspaceDb`].
///
/// Caches the projected `meta.pages` + `db$docProperties` view keyed by monotonic document
/// revisions `(root_revision, props_revision)` so repeated keystroke queries avoid rescanning
/// `meta.pages` while delete-only updates still invalidate the cache immediately.
pub struct WorkspaceDirectory {
    db: WorkspaceDb,
    last_opened: Option<DocId>,
    explicit_create_intents: BTreeMap<String, DocMode>,
    cache: Mutex<ProjectionCacheState>,
}

impl WorkspaceDirectory {
    pub fn new(db: WorkspaceDb) -> Self {
        Self {
            db,
            last_opened: None,
            explicit_create_intents: BTreeMap::new(),
            cache: Mutex::new(ProjectionCacheState::default()),
        }
    }

    /// Stage a non-`Page` creation intent for a fresh explicit `doc_id` before persisting `root`
    /// so crash replay can backfill a missing `DocProperties` row without mutating legacy `0.27.5`
    /// pages that already exist in `meta.pages` without a `DocProperties` row.
    ///
    /// Returns `Ok(false)` without staging when `mode == DocMode::Page` or `doc_id` already exists
    /// in the workspace root document.
    pub fn stage_explicit_create(&mut self, doc_id: &DocId, mode: DocMode) -> StoreResult<bool> {
        if mode == DocMode::Page || self.get_doc(doc_id)?.is_some() {
            return Ok(false);
        }
        self.explicit_create_intents
            .insert(doc_id.as_str().to_string(), mode);
        Ok(true)
    }

    /// Retire a staged explicit creation intent once `root` and `db$docProperties` are committed.
    pub fn acknowledge_explicit_create(&mut self, doc_id: &DocId) -> bool {
        self.explicit_create_intents
            .remove(doc_id.as_str())
            .is_some()
    }

    /// Export staged explicit non-`Page` creation intents as workspace-bound JSON bytes for
    /// client-local persistence outside frozen `<spaceId>.db`.
    pub fn export_explicit_create_journal(&self) -> StoreResult<Vec<u8>> {
        let intents = self
            .explicit_create_intents
            .iter()
            .map(|(k, m)| (k.clone(), m.as_str().to_string()))
            .collect();
        let wire = ExplicitCreateJournalWire {
            space_id: self.db.space_id().to_string(),
            intents,
        };
        Ok(serde_json::to_vec(&wire)?)
    }

    /// Restore staged explicit non-`Page` creation intents for this workspace on crash recovery.
    pub fn import_explicit_create_journal(&mut self, bytes: &[u8]) -> StoreResult<()> {
        let wire: ExplicitCreateJournalWire = serde_json::from_slice(bytes)?;
        if wire.space_id != self.db.space_id() {
            return Err(StoreError::InvalidProtocol(format!(
                "explicit create journal space_id {:?} does not match workspace {:?}",
                wire.space_id,
                self.db.space_id()
            )));
        }
        let mut parsed = BTreeMap::new();
        for (doc_id, raw_mode) in wire.intents {
            let valid_id = DocId::new(doc_id)?;
            let mode = match raw_mode.as_str() {
                "edgeless" => DocMode::Edgeless,
                other => {
                    return Err(StoreError::InvalidProtocol(format!(
                        "unsupported explicit create journal mode: {other:?}"
                    )));
                }
            };
            parsed.insert(valid_id.as_str().to_string(), mode);
        }
        self.explicit_create_intents.extend(parsed);
        Ok(())
    }

    pub fn db(&self) -> &WorkspaceDb {
        &self.db
    }

    pub fn db_mut(&mut self) -> &mut WorkspaceDb {
        &mut self.db
    }

    pub fn into_db(self) -> WorkspaceDb {
        self.db
    }

    pub fn last_opened(&self) -> Option<&DocId> {
        self.last_opened.as_ref()
    }

    /// Number of times the directory projection was rebuilt from `WorkspaceDb`.
    pub fn projection_rebuilds(&self) -> u64 {
        self.cache
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .rebuilds
    }

    /// Drain pending encoded v1 updates emitted by directory mutations for persistence and sync.
    pub fn drain_pending_updates(&mut self) -> Vec<PendingDocUpdate> {
        self.db.drain_pending_updates()
    }

    /// Query workspace documents with Unicode case-insensitive filtering and cursor pagination.
    pub fn query_docs(
        &self,
        query: &DocQuery,
        cancel: Option<&CancelToken>,
    ) -> StoreResult<DocQueryPage> {
        if cancel.is_some_and(CancelToken::is_cancelled) {
            return Err(StoreError::Cancelled);
        }

        self.ensure_projection_fresh()?;
        let guard = self.cache.lock().unwrap_or_else(|err| err.into_inner());
        let projection = guard.cached.as_ref().expect("projection initialized");

        let prefix_lower = query.title_prefix.as_deref().map(str::to_lowercase);
        let contains_lower = query.title_contains.as_deref().map(str::to_lowercase);

        let mut matched_indices = Vec::new();
        for (idx, (entry, title_lower)) in projection
            .entries
            .iter()
            .zip(projection.titles_lower.iter())
            .enumerate()
        {
            if cancel.is_some_and(CancelToken::is_cancelled) {
                return Err(StoreError::Cancelled);
            }
            if !query.include_trashed && entry.trashed {
                continue;
            }
            if let Some(ref prefix) = prefix_lower
                && !title_lower.starts_with(prefix)
            {
                continue;
            }
            if let Some(ref substr) = contains_lower
                && !title_lower.contains(substr)
            {
                continue;
            }
            matched_indices.push(idx);
        }

        let total = matched_indices.len();
        let start = if let Some(ref cursor) = query.cursor {
            matched_indices.partition_point(|&idx| {
                let entry = &projection.entries[idx];
                (entry.create_date_ms, &entry.id) <= (cursor.create_date_ms, &cursor.doc_id)
            })
        } else {
            query.offset.min(total)
        };

        let limit = if query.limit == 0 { total } else { query.limit };
        let end = start.saturating_add(limit).min(total);
        let entries: Vec<DocDirectoryEntry> = matched_indices[start..end]
            .iter()
            .map(|&idx| projection.entries[idx].clone())
            .collect();
        let has_more = end < total;
        let next_cursor = if has_more {
            entries.last().map(|entry| DocCursor {
                create_date_ms: entry.create_date_ms,
                doc_id: entry.id.clone(),
            })
        } else {
            None
        };

        Ok(DocQueryPage {
            entries,
            total,
            has_more,
            next_cursor,
        })
    }

    /// Return all non-trashed canonical document IDs in deterministic projection order.
    pub fn visible_doc_ids(&self) -> StoreResult<Vec<DocId>> {
        self.ensure_projection_fresh()?;
        let guard = self.cache.lock().unwrap_or_else(|err| err.into_inner());
        let projection = guard.cached.as_ref().expect("projection initialized");
        Ok(projection
            .entries
            .iter()
            .filter(|entry| !entry.trashed)
            .map(|entry| entry.id.clone())
            .collect())
    }

    /// Look up a single projected document entry by canonical `DocId`.
    pub fn get_doc(&self, doc_id: &DocId) -> StoreResult<Option<DocDirectoryEntry>> {
        self.ensure_projection_fresh()?;
        let guard = self.cache.lock().unwrap_or_else(|err| err.into_inner());
        let projection = guard.cached.as_ref().expect("projection initialized");
        Ok(projection
            .entries
            .iter()
            .find(|entry| &entry.id == doc_id)
            .cloned())
    }

    /// Create a document in `WorkspaceDb`, recording root (and non-`Page` `DocProperties`) updates
    /// in `WorkspaceDb::pending_updates` (to be persisted atomically via `push_updates_batch`).
    ///
    /// Non-`Page` creation requires `db$docProperties` to be resolved first (returning
    /// [`StoreError::DbTableNotResolved`] with zero mutations so retry intent survives restarts).
    /// Existing explicit IDs preserve legacy `Page` documents that lack a `DocProperties` row
    /// unless backed by a matching [`Self::import_explicit_create_journal`] creation record.
    pub fn create_doc(&mut self, request: CreateDocRequest) -> StoreResult<CreateDocResult> {
        if request.mode != DocMode::Page
            && !self
                .db
                .is_db_table_resolved(WorkspaceDbTableName::DocProperties)
        {
            return Err(StoreError::DbTableNotResolved(
                WorkspaceDbTableName::DocProperties.local_doc_id(),
            ));
        }
        let id_source = match &request.id {
            CreateDocId::DerivedFromOp(op_id) => PageIdSource::DerivedFromOp(op_id.as_str()),
            CreateDocId::Explicit(doc_id) => PageIdSource::Explicit(doc_id.as_str()),
        };
        let is_derived_retry = matches!(request.id, CreateDocId::DerivedFromOp(_));
        let outcome = self
            .db
            .create_page(id_source, &request.title, request.now_ms)?;
        if request.mode != DocMode::Page {
            let has_existing_row = self
                .db
                .has_db_row_entry(WorkspaceDbTableName::DocProperties, &outcome.page_id)?;
            if outcome.created_new
                && matches!(request.id, CreateDocId::Explicit(_))
                && !has_existing_row
            {
                self.explicit_create_intents
                    .insert(outcome.page_id.clone(), request.mode);
            }
            let has_explicit_intent =
                self.explicit_create_intents.get(&outcome.page_id) == Some(&request.mode);
            if (outcome.created_new || is_derived_retry || has_explicit_intent) && !has_existing_row
            {
                self.db.upsert_db_row(
                    WorkspaceDbTableName::DocProperties,
                    &DocPropertiesRow {
                        id: outcome.page_id.clone(),
                        primary_mode: Some(request.mode.as_str().to_string()),
                        edgeless_color_theme: None,
                        journal: None,
                        page_width: None,
                        is_template: None,
                        integration_type: None,
                        created_by: None,
                        updated_by: None,
                        custom_fields: BTreeMap::new(),
                    },
                )?;
            }
        }
        Ok(CreateDocResult {
            doc_id: DocId::new(outcome.page_id)?,
            created_new: outcome.created_new,
        })
    }

    /// Record `doc_id` as the last opened document and return its projected entry.
    pub fn open_doc(&mut self, doc_id: &DocId) -> StoreResult<DocDirectoryEntry> {
        let entry = self
            .get_doc(doc_id)?
            .ok_or_else(|| StoreError::DocNotFound(doc_id.as_str().to_string()))?;
        self.last_opened = Some(doc_id.clone());
        Ok(entry)
    }

    /// Rename a document and enqueue the emitted root-doc update.
    pub fn rename_doc(&mut self, doc_id: &DocId, title: &str) -> StoreResult<bool> {
        Ok(self.db.rename_page(doc_id.as_str(), title)?.is_some())
    }

    /// Soft-delete a document and enqueue the emitted root-doc update.
    pub fn trash_doc(&mut self, doc_id: &DocId, trash_date_ms: i64) -> StoreResult<bool> {
        Ok(self
            .db
            .trash_page(doc_id.as_str(), trash_date_ms)?
            .is_some())
    }

    /// Restore a soft-deleted document and enqueue the emitted root-doc update.
    pub fn restore_doc(&mut self, doc_id: &DocId) -> StoreResult<bool> {
        Ok(self.db.restore_page(doc_id.as_str())?.is_some())
    }

    fn ensure_projection_fresh(&self) -> StoreResult<()> {
        let root_revision = self.db.root().revision();
        let props_revision = self
            .db
            .db_table(WorkspaceDbTableName::DocProperties)
            .map(|table| table.revision());

        {
            let guard = self.cache.lock().unwrap_or_else(|err| err.into_inner());
            if let Some(ref cached) = guard.cached
                && cached.root_revision == root_revision
                && cached.props_revision == props_revision
            {
                return Ok(());
            }
        }

        let entries = self.build_projection()?;
        let titles_lower = entries.iter().map(|e| e.title.to_lowercase()).collect();

        let mut guard = self.cache.lock().unwrap_or_else(|err| err.into_inner());
        guard.cached = Some(CachedProjection {
            root_revision,
            props_revision,
            entries,
            titles_lower,
        });
        guard.rebuilds = guard.rebuilds.saturating_add(1);
        Ok(())
    }

    fn build_projection(&self) -> StoreResult<Vec<DocDirectoryEntry>> {
        let pages = self.db.root().list_pages()?;
        let props_table = self.db.db_table(WorkspaceDbTableName::DocProperties);
        let mut entries = Vec::with_capacity(pages.len());

        for page in pages {
            let Ok(doc_id) = DocId::new(page.id) else {
                continue;
            };
            let mode = match props_table {
                Some(table) => table
                    .get_row::<DocPropertiesRow>(doc_id.as_str())
                    .ok()
                    .flatten()
                    .map(|row| DocMode::from_wire(row.primary_mode.as_deref()))
                    .unwrap_or(DocMode::Page),
                None => DocMode::Page,
            };
            entries.push(DocDirectoryEntry {
                id: doc_id,
                title: page.title,
                mode,
                create_date_ms: page.create_date_ms,
                updated_date_ms: page.updated_date_ms,
                trashed: page.trashed,
                tags: page.tags,
            });
        }
        entries.sort_by(|a, b| {
            a.create_date_ms
                .cmp(&b.create_date_ms)
                .then_with(|| a.id.cmp(&b.id))
        });
        Ok(entries)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new_initialized_directory() -> WorkspaceDirectory {
        let mut db = WorkspaceDb::new("ws-1", "u1", 1);
        db.initialize_meta().unwrap();
        let _ = db.drain_pending_updates();
        WorkspaceDirectory::new(db)
    }

    #[test]
    fn workspace_directory_queries_cursor_pagination_caching_and_pending_updates() {
        assert!(DocId::new("db$folders").is_err());
        assert!(DocId::new("userdata$u1$favorite").is_err());
        assert!(DocId::new("").is_err());

        let mut dir = new_initialized_directory();
        let r1 = dir
            .create_doc(CreateDocRequest {
                id: CreateDocId::from_op("op-1").unwrap(),
                title: "Design Spec".into(),
                mode: DocMode::Page,
                now_ms: 100,
            })
            .unwrap();
        assert!(r1.created_new);
        let d1 = r1.doc_id.clone();
        let r1_dup = dir
            .create_doc(CreateDocRequest {
                id: CreateDocId::from_op("op-1").unwrap(),
                title: "Design Spec".into(),
                mode: DocMode::Page,
                now_ms: 100,
            })
            .unwrap();
        assert!(!r1_dup.created_new);
        assert_eq!(r1_dup.doc_id, d1);

        let d2 = dir
            .create_doc(CreateDocRequest {
                id: CreateDocId::from_op("op-2").unwrap(),
                title: "Design Board".into(),
                mode: DocMode::Edgeless,
                now_ms: 200,
            })
            .unwrap()
            .doc_id;
        let _d3 = dir
            .create_doc(CreateDocRequest {
                id: CreateDocId::explicit(DocId::new("doc-3").unwrap()),
                title: "Release Notes".into(),
                mode: DocMode::Page,
                now_ms: 300,
            })
            .unwrap()
            .doc_id;

        let pending = dir.drain_pending_updates();
        assert!(pending.iter().any(|u| u.doc_id == "ws-1"));
        assert!(pending.iter().any(|u| u.doc_id == "db$docProperties"));

        let page1 = dir
            .query_docs(
                &DocQuery {
                    title_prefix: Some("design".into()),
                    title_contains: None,
                    include_trashed: false,
                    cursor: None,
                    offset: 0,
                    limit: 1,
                },
                None,
            )
            .unwrap();
        assert_eq!(page1.total, 2);
        assert_eq!(page1.entries.len(), 1);
        assert!(page1.has_more);
        assert_eq!(
            page1.next_cursor,
            Some(DocCursor {
                create_date_ms: 100,
                doc_id: d1.clone(),
            })
        );
        assert_eq!(dir.projection_rebuilds(), 1);

        // Even if the cursor document d1 is trashed between pages, cursor advances to d2!
        assert!(dir.trash_doc(&d1, 250).unwrap());
        let page2 = dir
            .query_docs(
                &DocQuery {
                    title_prefix: Some("design".into()),
                    title_contains: None,
                    include_trashed: false,
                    cursor: page1.next_cursor.clone(),
                    offset: 0,
                    limit: 1,
                },
                None,
            )
            .unwrap();
        assert_eq!(page2.entries.len(), 1);
        assert_eq!(page2.entries[0].id, d2);
        assert_eq!(page2.entries[0].mode, DocMode::Edgeless);
        assert!(!page2.has_more);
        assert_eq!(page2.next_cursor, None);
        assert!(dir.restore_doc(&d1).unwrap());

        // Removing primaryMode via patch_db_row_fields must invalidate cache and revert to Page.
        dir.db_mut()
            .patch_db_row_fields(
                WorkspaceDbTableName::DocProperties,
                d2.as_str(),
                &[("primaryMode", None)],
            )
            .unwrap();
        assert_eq!(dir.get_doc(&d2).unwrap().unwrap().mode, DocMode::Page);

        let cancel = CancelToken::new();
        cancel.cancel();
        assert!(matches!(
            dir.query_docs(&DocQuery::default(), Some(&cancel)),
            Err(StoreError::Cancelled)
        ));

        let opened = dir.open_doc(&d1).unwrap();
        assert_eq!(opened.title, "Design Spec");
        assert!(!dir.rename_doc(&d1, "Design Spec").unwrap());
        assert!(dir.rename_doc(&d1, "Design Spec v2").unwrap());
        assert_eq!(dir.get_doc(&d1).unwrap().unwrap().title, "Design Spec v2");
        assert!(!dir.drain_pending_updates().is_empty());
    }

    #[test]
    fn p2_directory_projection_follows_delete_only_remote_update() {
        let mut db = WorkspaceDb::new("ws", "u1", 1);
        db.initialize_meta().unwrap();
        let mut dir = WorkspaceDirectory::new(db);
        let d1 = dir
            .create_doc(CreateDocRequest {
                id: CreateDocId::from_op("op-1").unwrap(),
                title: "Gone".into(),
                mode: DocMode::Page,
                now_ms: 100,
            })
            .unwrap()
            .doc_id;
        let all = DocQuery {
            include_trashed: true,
            ..DocQuery::default()
        };
        assert_eq!(dir.query_docs(&all, None).unwrap().total, 1);

        let full = dir.db().root().encode_update_v1().unwrap();
        let mut peer = y_octo::DocOptions::from_identity(2, "ws".to_string()).build();
        peer.apply_update_from_binary_v1(&full).unwrap();
        let before = peer.get_state_vector();
        let meta = peer.get_or_create_map("meta").unwrap();
        let Some(y_octo::Value::Array(mut pages)) = meta.get("pages") else {
            panic!("meta.pages is not an array");
        };
        pages.remove(0, 1).unwrap();
        assert_eq!(peer.get_state_vector(), before);
        let diff = peer.encode_state_as_update_v1(&before).unwrap();

        let sv_before = dir.db().root().encode_state_vector_v1().unwrap();
        dir.db_mut().apply_remote_root_update(&diff).unwrap();
        assert_eq!(dir.db().root().encode_state_vector_v1().unwrap(), sv_before);
        assert_eq!(dir.db().root().list_pages().unwrap().len(), 0);
        let page = dir.query_docs(&all, None).unwrap();
        assert!(dir.get_doc(&d1).unwrap().is_none());
        assert_eq!(page.total, 0);
    }

    #[test]
    fn unicode_case_folding_matches_prefix_and_substring() {
        let mut dir = new_initialized_directory();
        let cases = [
            ("u1", "École de Paris", Some("école"), None),
            ("u2", "Überblick", None, Some("über")),
            ("u3", "Привет Мир", Some("привет"), Some("мир")),
        ];
        let mut created_ids = Vec::new();
        for (id, title, _, _) in cases {
            let res = dir
                .create_doc(CreateDocRequest {
                    id: CreateDocId::from_op(format!("op-{id}")).unwrap(),
                    title: title.into(),
                    mode: DocMode::Page,
                    now_ms: 100,
                })
                .unwrap();
            created_ids.push(res.doc_id);
        }
        for (expected_id, (_, _, prefix, contains)) in created_ids.iter().zip(cases.iter()) {
            let page = dir
                .query_docs(
                    &DocQuery {
                        title_prefix: prefix.map(str::to_string),
                        title_contains: contains.map(str::to_string),
                        include_trashed: false,
                        cursor: None,
                        offset: 0,
                        limit: 10,
                    },
                    None,
                )
                .unwrap();
            assert_eq!(page.entries.len(), 1);
            assert_eq!(&page.entries[0].id, expected_id);
        }
        assert_eq!(dir.projection_rebuilds(), 1);
    }

    #[test]
    fn create_doc_recovers_partial_mode_for_derived_and_explicit_ids_without_clobbering_existing_rows()
     {
        let shared_explicit_id = DocId::new("doc-same").unwrap();

        // 1. Legacy 0.27.5 completed Page doc without any `DocProperties` row (created via
        //    `WorkspaceDb::create_page` / `collection.createDoc(id)` with zero journal):
        //    a subsequent `create_doc(Explicit("doc-same"), Edgeless)` MUST keep `DocMode::Page`
        //    and emit zero updates, and `stage_explicit_create` refuses to stage an existing page.
        let mut legacy_db = WorkspaceDb::new("ws-1", "u1", 1);
        legacy_db.initialize_meta().unwrap();
        legacy_db
            .create_page(
                PageIdSource::Explicit(shared_explicit_id.as_str()),
                "Canvas",
                500,
            )
            .unwrap();
        let legacy_root = legacy_db.root().encode_update_v1().unwrap();

        let legacy_reopened_db =
            WorkspaceDb::from_root_update_v1("ws-1", "u1", 2, &legacy_root).unwrap();
        let mut legacy_dir = WorkspaceDirectory::new(legacy_reopened_db);
        // Plain `DocMode::Page` creation works even before `db$docProperties` is resolved and
        // writes ONLY `ws-1` (never clobbering a lower-client_id remote `"edgeless"` row).
        let unresolved_page_db =
            WorkspaceDb::from_root_update_v1("ws-1", "u1", 99, &legacy_root).unwrap();
        let mut unresolved_page_dir = WorkspaceDirectory::new(unresolved_page_db);
        let plain_created = unresolved_page_dir
            .create_doc(CreateDocRequest {
                id: CreateDocId::explicit(DocId::new("page-plain").unwrap()),
                title: "Plain".into(),
                mode: DocMode::Page,
                now_ms: 460,
            })
            .unwrap();
        assert!(plain_created.created_new);
        let plain_updates = unresolved_page_dir.drain_pending_updates();
        assert_eq!(plain_updates.len(), 1);
        assert_eq!(plain_updates[0].doc_id, "ws-1");

        // Remote device (`client_id = 1 < 99`) concurrently set `"page-plain"` to `"edgeless"`:
        // because `DocMode::Page` did not write `"page"` to `db$docProperties`, remote wins cleanly.
        let mut remote_props_db = WorkspaceDb::new("ws-1", "u2", 1);
        remote_props_db
            .upsert_db_row(
                WorkspaceDbTableName::DocProperties,
                &DocPropertiesRow {
                    id: "page-plain".into(),
                    primary_mode: Some("edgeless".into()),
                    edgeless_color_theme: None,
                    journal: None,
                    page_width: None,
                    is_template: None,
                    integration_type: None,
                    created_by: None,
                    updated_by: None,
                    custom_fields: BTreeMap::new(),
                },
            )
            .unwrap();
        let remote_props_bytes = remote_props_db
            .db_table(WorkspaceDbTableName::DocProperties)
            .unwrap()
            .encode_update_v1()
            .unwrap();
        unresolved_page_dir
            .db_mut()
            .load_db_table(WorkspaceDbTableName::DocProperties, &remote_props_bytes)
            .unwrap();
        assert_eq!(
            unresolved_page_dir
                .get_doc(&plain_created.doc_id)
                .unwrap()
                .unwrap()
                .mode,
            DocMode::Edgeless
        );

        // Now resolve `DocProperties` as absent on `legacy_dir` and call `Explicit("doc-same")`
        // with `DocMode::Edgeless`: must preserve legacy `DocMode::Page` with 0 pending updates!
        legacy_dir
            .db_mut()
            .mark_db_table_absent(WorkspaceDbTableName::DocProperties);
        assert!(
            !legacy_dir
                .stage_explicit_create(&shared_explicit_id, DocMode::Edgeless)
                .unwrap()
        );
        let legacy_dup = legacy_dir
            .create_doc(CreateDocRequest {
                id: CreateDocId::explicit(shared_explicit_id.clone()),
                title: "Canvas".into(),
                mode: DocMode::Edgeless,
                now_ms: 610,
            })
            .unwrap();
        assert!(!legacy_dup.created_new);
        assert_eq!(
            legacy_dir
                .get_doc(&shared_explicit_id)
                .unwrap()
                .unwrap()
                .mode,
            DocMode::Page
        );
        assert!(legacy_dir.drain_pending_updates().is_empty());

        // 2. Side-by-side partial-save recovery and reverse-arrival preservation for BOTH
        //    `DerivedFromOp("op-edgeless")` AND the exact same `Explicit("doc-same")` ID when
        //    backed by a workspace-bound `ExplicitCreateJournal`.
        let id_cases = [
            CreateDocId::from_op("op-edgeless").unwrap(),
            CreateDocId::explicit(shared_explicit_id),
        ];
        for create_id in id_cases {
            let mut dir = new_initialized_directory();
            if let CreateDocId::Explicit(ref explicit_id) = create_id {
                assert!(
                    dir.stage_explicit_create(explicit_id, DocMode::Edgeless)
                        .unwrap()
                );
            }
            let journal_bytes = dir.export_explicit_create_journal().unwrap();
            let created = dir
                .create_doc(CreateDocRequest {
                    id: create_id.clone(),
                    title: "Canvas".into(),
                    mode: DocMode::Edgeless,
                    now_ms: 500,
                })
                .unwrap();
            assert!(created.created_new);
            assert_eq!(dir.drain_pending_updates().len(), 2);
            let root_only = dir.db().root().encode_update_v1().unwrap();

            // Cross-workspace journal import is rejected.
            let mut wrong_ws = WorkspaceDirectory::new(WorkspaceDb::new("ws-other", "u1", 9));
            assert!(matches!(
                wrong_ws.import_explicit_create_journal(&journal_bytes),
                Err(StoreError::InvalidProtocol(_))
            ));

            // Crash after persisting ONLY root (+ local journal): unresolved table -> DbTableNotResolved.
            let reloaded_db =
                WorkspaceDb::from_root_update_v1("ws-1", "u1", 2, &root_only).unwrap();
            let mut reloaded_dir = WorkspaceDirectory::new(reloaded_db);
            reloaded_dir
                .import_explicit_create_journal(&journal_bytes)
                .unwrap();
            let unresolved_err = reloaded_dir
                .create_doc(CreateDocRequest {
                    id: create_id.clone(),
                    title: "Canvas".into(),
                    mode: DocMode::Edgeless,
                    now_ms: 600,
                })
                .unwrap_err();
            assert!(matches!(unresolved_err, StoreError::DbTableNotResolved(_)));
            assert!(reloaded_dir.drain_pending_updates().is_empty());

            // Second restart -> import journal + mark_db_table_absent -> retry emits 1 DocProperties
            // update and recovers Edgeless for both DerivedFromOp and Explicit("doc-same")!
            let second_boot_db =
                WorkspaceDb::from_root_update_v1("ws-1", "u1", 2, &root_only).unwrap();
            let mut second_boot_dir = WorkspaceDirectory::new(second_boot_db);
            second_boot_dir
                .import_explicit_create_journal(&journal_bytes)
                .unwrap();
            second_boot_dir
                .db_mut()
                .mark_db_table_absent(WorkspaceDbTableName::DocProperties);
            let retry = second_boot_dir
                .create_doc(CreateDocRequest {
                    id: create_id.clone(),
                    title: "Canvas".into(),
                    mode: DocMode::Edgeless,
                    now_ms: 610,
                })
                .unwrap();
            assert!(!retry.created_new);
            assert_eq!(retry.doc_id, created.doc_id);
            assert_eq!(
                second_boot_dir
                    .get_doc(&created.doc_id)
                    .unwrap()
                    .unwrap()
                    .mode,
                DocMode::Edgeless
            );
            let backfilled = second_boot_dir.drain_pending_updates();
            assert_eq!(backfilled.len(), 1);
            assert_eq!(backfilled[0].doc_id, "db$docProperties");
            if matches!(create_id, CreateDocId::Explicit(_)) {
                assert!(second_boot_dir.acknowledge_explicit_create(&created.doc_id));
            }

            // User switches primaryMode to "page"; higher client_id = 3 > 2 restart preserves Page
            // even if an unacknowledged journal is re-imported.
            second_boot_dir
                .db_mut()
                .patch_db_row_fields(
                    WorkspaceDbTableName::DocProperties,
                    created.doc_id.as_str(),
                    &[("primaryMode", Some(serde_json::json!("page")))],
                )
                .unwrap();
            let _ = second_boot_dir.drain_pending_updates();
            let persisted_props_bytes = second_boot_dir
                .db()
                .db_table(WorkspaceDbTableName::DocProperties)
                .unwrap()
                .encode_update_v1()
                .unwrap();

            let restart_db = WorkspaceDb::from_root_update_v1("ws-1", "u1", 3, &root_only).unwrap();
            let mut restart_dir = WorkspaceDirectory::new(restart_db);
            restart_dir
                .import_explicit_create_journal(&journal_bytes)
                .unwrap();
            assert!(matches!(
                restart_dir.create_doc(CreateDocRequest {
                    id: create_id.clone(),
                    title: "Canvas".into(),
                    mode: DocMode::Edgeless,
                    now_ms: 700,
                }),
                Err(StoreError::DbTableNotResolved(_))
            ));
            restart_dir
                .db_mut()
                .load_db_table(WorkspaceDbTableName::DocProperties, &persisted_props_bytes)
                .unwrap();
            let replay_after_load = restart_dir
                .create_doc(CreateDocRequest {
                    id: create_id.clone(),
                    title: "Canvas".into(),
                    mode: DocMode::Edgeless,
                    now_ms: 710,
                })
                .unwrap();
            assert!(!replay_after_load.created_new);
            assert_eq!(
                restart_dir.get_doc(&created.doc_id).unwrap().unwrap().mode,
                DocMode::Page
            );
            assert!(restart_dir.drain_pending_updates().is_empty());

            // Reverse partial state: live "page" row and soft-deleted row loaded before root page.
            let mut empty_root_db = WorkspaceDb::new("ws-1", "u1", 1);
            empty_root_db.initialize_meta().unwrap();
            let empty_root_bytes = empty_root_db.root().encode_update_v1().unwrap();

            let rev_live_db =
                WorkspaceDb::from_root_update_v1("ws-1", "u1", 4, &empty_root_bytes).unwrap();
            let mut rev_live_dir = WorkspaceDirectory::new(rev_live_db);
            rev_live_dir
                .db_mut()
                .load_db_table(WorkspaceDbTableName::DocProperties, &persisted_props_bytes)
                .unwrap();
            let repaired_live = rev_live_dir
                .create_doc(CreateDocRequest {
                    id: create_id.clone(),
                    title: "Canvas".into(),
                    mode: DocMode::Edgeless,
                    now_ms: 800,
                })
                .unwrap();
            assert!(repaired_live.created_new);
            assert_eq!(
                rev_live_dir.get_doc(&created.doc_id).unwrap().unwrap().mode,
                DocMode::Page
            );
            let live_updates = rev_live_dir.drain_pending_updates();
            assert_eq!(live_updates.len(), 1);
            assert_eq!(live_updates[0].doc_id, "ws-1");

            second_boot_dir
                .db_mut()
                .soft_delete_db_row(WorkspaceDbTableName::DocProperties, created.doc_id.as_str())
                .unwrap();
            let deleted_props_bytes = second_boot_dir
                .db()
                .db_table(WorkspaceDbTableName::DocProperties)
                .unwrap()
                .encode_update_v1()
                .unwrap();
            let rev_del_db =
                WorkspaceDb::from_root_update_v1("ws-1", "u1", 5, &empty_root_bytes).unwrap();
            let mut rev_del_dir = WorkspaceDirectory::new(rev_del_db);
            rev_del_dir
                .db_mut()
                .load_db_table(WorkspaceDbTableName::DocProperties, &deleted_props_bytes)
                .unwrap();
            let repaired_del = rev_del_dir
                .create_doc(CreateDocRequest {
                    id: create_id,
                    title: "Canvas".into(),
                    mode: DocMode::Edgeless,
                    now_ms: 810,
                })
                .unwrap();
            assert!(repaired_del.created_new);
            let del_updates = rev_del_dir.drain_pending_updates();
            assert_eq!(del_updates.len(), 1);
            assert_eq!(del_updates[0].doc_id, "ws-1");
            assert!(
                rev_del_dir
                    .db()
                    .db_table(WorkspaceDbTableName::DocProperties)
                    .unwrap()
                    .is_soft_deleted(created.doc_id.as_str())
                    .unwrap()
            );
        }
    }
}
