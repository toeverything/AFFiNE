//! Live shared multi-document store backed by `affine-store` (`WorkspaceDirectory`)
//! and shared `blocksuite-playground-doc` (`PageDocSession`) CRDT document instances.
//!
//! Multiple panes (e.g. Left Page + Right Edgeless in Split View, or PeekView)
//! observe and mutate the exact same underlying `PageDocSession`, guaranteeing
//! immediate live synchronization without duplicate copies.

use std::collections::BTreeMap;

use affine_client::{
    FolderForestCache, LinkGraph, SearchDocument, SearchHit, WeightedSearchEngine,
    domain::CollectionRule,
};
use affine_store::{
    directory::{CreateDocId, CreateDocRequest, DocId, DocMode, WorkspaceDirectory},
    workspace_db::{FolderRow, WorkspaceDb},
};
use blocksuite_playground_doc::{
    client_id_from_seed,
    read::{BlockContent, PageSnapshot},
    refs::{DocRefEdge, OutboundRefKind},
    schema::{BlockSpec, ParagraphType},
    session::PageDocSession,
};

use crate::showcase::{build_basic_doc_session, populate_note_and_surface_ids};

/// Local vs Cloud workspace sync flavour.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WorkspaceKind {
    Local,
    Cloud,
}

impl WorkspaceKind {
    pub const fn badge(self) -> &'static str {
        match self {
            Self::Local => "Local",
            Self::Cloud => "Cloud",
        }
    }
}

/// Workspace selector entry.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DesktopWorkspace {
    pub id: String,
    pub name: String,
    pub kind: WorkspaceKind,
    pub synced: bool,
}

/// Smart collection definition in the sidebar.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DesktopCollection {
    pub id: String,
    pub name: String,
    pub rules: Vec<CollectionRule>,
}

impl DesktopCollection {
    pub fn matches(&self, doc: &DesktopDocMeta) -> bool {
        if doc.trashed {
            return false;
        }
        if self.rules.is_empty() {
            return false;
        }
        self.rules.iter().all(|rule| match rule {
            CollectionRule::HasTag(tag) => doc.tags.iter().any(|t| t == tag),
            CollectionRule::ModeIs(mode) => doc.default_mode.as_str() == mode,
            CollectionRule::TitleContains(needle) => doc
                .title
                .to_ascii_lowercase()
                .contains(&needle.to_ascii_lowercase()),
            CollectionRule::IncludeDocIds(ids) => ids.iter().any(|id| id == &doc.id),
        })
    }
}

/// Projected desktop metadata for a document.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DesktopDocMeta {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub default_mode: DocMode,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    pub trashed: bool,
    pub journal_date: Option<String>,
    pub updated_at_ms: i64,
    pub outgoing_refs: Vec<String>,
}

/// Heading item extracted for the DocInfo/Outline panel.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OutlineHeading {
    pub block_id: String,
    pub level: u8,
    pub text: String,
}

/// Live document entry pairing metadata with the shared CRDT `PageDocSession`.
pub struct LiveDocEntry {
    pub meta: DesktopDocMeta,
    pub session: PageDocSession,
    pub note_id: String,
    pub surface_id: String,
    pub snapshot: PageSnapshot,
    pub revision: u64,
    pub hydrated: bool,
}

/// Per-workspace physically isolated document and directory state.
pub struct WorkspaceBucket {
    pub directory: WorkspaceDirectory,
    pub docs: BTreeMap<String, LiveDocEntry>,
    pub folder_rows: Vec<FolderRow>,
    pub folder_cache: FolderForestCache,
    pub collections: Vec<DesktopCollection>,
    pub tag_colors: BTreeMap<String, u32>,
    pub link_graph: LinkGraph,
}

impl WorkspaceBucket {
    fn empty_for_workspace(workspace_id: &str) -> Self {
        let client_id = client_id_from_seed(
            workspace_id
                .bytes()
                .fold(0x9E37_79B9u64, |acc, b| acc.wrapping_mul(31) ^ u64::from(b)),
        );
        Self {
            directory: WorkspaceDirectory::new(WorkspaceDb::new(
                workspace_id,
                "local-user",
                client_id,
            )),
            docs: BTreeMap::new(),
            folder_rows: Vec::new(),
            folder_cache: FolderForestCache::default(),
            collections: Vec::new(),
            tag_colors: BTreeMap::new(),
            link_graph: LinkGraph::default(),
        }
    }
}

/// Shared workspace document store owned by `DesktopAppState`.
pub struct DesktopDocStore {
    pub workspaces: Vec<DesktopWorkspace>,
    pub active_workspace_idx: usize,
    pub directory: WorkspaceDirectory,
    pub docs: BTreeMap<String, LiveDocEntry>,
    pub folder_rows: Vec<FolderRow>,
    pub folder_cache: FolderForestCache,
    pub collections: Vec<DesktopCollection>,
    pub tag_colors: BTreeMap<String, u32>,
    pub link_graph: LinkGraph,
    pub search_engine: WeightedSearchEngine,
    pub next_seq: u64,
    pub env_rev: u64,
    pub(crate) workspace_buckets: BTreeMap<usize, WorkspaceBucket>,
    #[cfg(not(target_family = "wasm"))]
    pub sqlite_backing: Option<crate::sqlite_loader::SqliteLazyBacking>,
}

impl DesktopDocStore {
    pub fn active_workspace(&self) -> &DesktopWorkspace {
        &self.workspaces[self.active_workspace_idx]
    }

    pub fn switch_workspace(&mut self, index: usize) {
        if index >= self.workspaces.len() || index == self.active_workspace_idx {
            return;
        }
        let old_idx = self.active_workspace_idx;
        let next_ws_id = self.workspaces[index].id.clone();
        let mut incoming = self
            .workspace_buckets
            .remove(&index)
            .unwrap_or_else(|| WorkspaceBucket::empty_for_workspace(&next_ws_id));
        std::mem::swap(&mut self.directory, &mut incoming.directory);
        std::mem::swap(&mut self.docs, &mut incoming.docs);
        std::mem::swap(&mut self.folder_rows, &mut incoming.folder_rows);
        std::mem::swap(&mut self.folder_cache, &mut incoming.folder_cache);
        std::mem::swap(&mut self.collections, &mut incoming.collections);
        std::mem::swap(&mut self.tag_colors, &mut incoming.tag_colors);
        std::mem::swap(&mut self.link_graph, &mut incoming.link_graph);
        self.workspace_buckets.insert(old_idx, incoming);
        self.active_workspace_idx = index;
        self.env_rev += 1;
    }

    pub fn page_titles(&self) -> BTreeMap<String, String> {
        self.docs
            .iter()
            .map(|(id, entry)| (id.clone(), entry.meta.title.clone()))
            .collect()
    }

    pub fn get_doc(&self, doc_id: &str) -> Option<&LiveDocEntry> {
        self.docs.get(doc_id)
    }

    pub fn visible_docs(&self) -> Vec<&DesktopDocMeta> {
        let mut out: Vec<&DesktopDocMeta> = self
            .docs
            .values()
            .filter(|e| !e.meta.trashed)
            .map(|e| &e.meta)
            .collect();
        out.sort_by(|a, b| {
            b.updated_at_ms
                .cmp(&a.updated_at_ms)
                .then_with(|| a.id.cmp(&b.id))
        });
        out
    }

    pub fn favorite_docs(&self) -> Vec<&DesktopDocMeta> {
        self.visible_docs()
            .into_iter()
            .filter(|d| d.is_favorite)
            .collect()
    }

    pub fn trashed_docs(&self) -> Vec<&DesktopDocMeta> {
        let mut out: Vec<&DesktopDocMeta> = self
            .docs
            .values()
            .filter(|e| e.meta.trashed)
            .map(|e| &e.meta)
            .collect();
        out.sort_by_key(|a| std::cmp::Reverse(a.updated_at_ms));
        out
    }

    pub fn journal_docs(&self) -> Vec<&DesktopDocMeta> {
        let mut out: Vec<&DesktopDocMeta> = self
            .docs
            .values()
            .filter(|e| !e.meta.trashed && e.meta.journal_date.is_some())
            .map(|e| &e.meta)
            .collect();
        out.sort_by(|a, b| b.journal_date.cmp(&a.journal_date));
        out
    }

    pub fn docs_for_collection(&self, col_id: &str) -> Vec<&DesktopDocMeta> {
        let Some(col) = self.collections.iter().find(|c| c.id == col_id) else {
            return Vec::new();
        };
        self.visible_docs()
            .into_iter()
            .filter(|d| col.matches(d))
            .collect()
    }

    pub fn docs_for_tag(&self, tag: &str) -> Vec<&DesktopDocMeta> {
        self.visible_docs()
            .into_iter()
            .filter(|d| d.tags.iter().any(|t| t == tag))
            .collect()
    }

    pub fn docs_in_folder(&self, folder_id: &str) -> Vec<&DesktopDocMeta> {
        let mut doc_ids = Vec::new();
        for row in &self.folder_rows {
            if row.folder_type == "doc" && row.parent_id.as_deref() == Some(folder_id) {
                doc_ids.push(row.data.as_str());
            }
        }
        doc_ids
            .into_iter()
            .filter_map(|id| self.docs.get(id))
            .filter(|e| !e.meta.trashed)
            .map(|e| &e.meta)
            .collect()
    }

    pub fn all_tags_with_counts(&self) -> Vec<(String, u32, usize)> {
        let mut counts = BTreeMap::<String, usize>::new();
        for tag in self.tag_colors.keys() {
            counts.insert(tag.clone(), 0);
        }
        for entry in self.docs.values().filter(|e| !e.meta.trashed) {
            for tag in &entry.meta.tags {
                *counts.entry(tag.clone()).or_insert(0) += 1;
            }
        }
        counts
            .into_iter()
            .map(|(tag, n)| {
                let color = self.tag_colors.get(&tag).copied().unwrap_or(0x1E96EB);
                (tag, color, n)
            })
            .collect()
    }

    /// Create a new folder node in the sidebar tree.
    pub fn create_folder(&mut self, name: impl Into<String>, parent_id: Option<String>) -> String {
        self.next_seq += 1;
        let id = format!("f-{}", self.next_seq);
        let idx = format!("a{}", self.folder_rows.len());
        self.folder_rows.push(FolderRow {
            id: id.clone(),
            parent_id,
            data: name.into(),
            folder_type: "folder".into(),
            index: idx,
        });
        self.rebuild_derived();
        id
    }

    /// Move (or add) a document placement into a folder.
    pub fn move_doc_to_folder(&mut self, doc_id: &str, target_folder_id: Option<&str>) {
        self.folder_rows
            .retain(|r| !(r.folder_type == "doc" && r.data == doc_id));
        if let Some(folder_id) = target_folder_id {
            self.next_seq += 1;
            self.folder_rows.push(FolderRow {
                id: format!("link-{}", self.next_seq),
                parent_id: Some(folder_id.to_string()),
                data: doc_id.to_string(),
                folder_type: "doc".into(),
                index: format!("a{}", self.folder_rows.len()),
            });
        }
        self.rebuild_derived();
    }

    /// Remove a document from a specific folder without trashing the document.
    pub fn remove_doc_from_folder(&mut self, doc_id: &str, folder_id: &str) -> bool {
        let before = self.folder_rows.len();
        self.folder_rows.retain(|r| {
            !(r.folder_type == "doc"
                && r.data == doc_id
                && r.parent_id.as_deref() == Some(folder_id))
        });
        let changed = self.folder_rows.len() != before;
        if changed {
            self.rebuild_derived();
        }
        changed
    }

    /// Create a new live document backed by both `WorkspaceDirectory` and `PageDocSession`.
    pub fn create_doc(
        &mut self,
        title: impl Into<String>,
        mode: DocMode,
        journal_date: Option<String>,
        now_ms: i64,
    ) -> String {
        self.next_seq += 1;
        let id = format!("doc-{}", self.next_seq);
        let title = title.into();
        let _ = self.directory.create_doc(CreateDocRequest {
            id: CreateDocId::explicit(DocId::new(id.clone()).expect("valid doc id")),
            title: title.clone(),
            mode,
            now_ms,
        });
        let (session, note_id, surface_id) = build_basic_doc_session(&id, &title, now_ms as u64);
        let snapshot = session.read_page_snapshot().expect("read new snapshot");
        let revision = session.revision();
        let tags = if journal_date.is_some() {
            vec!["journal".into()]
        } else {
            Vec::new()
        };
        let meta = DesktopDocMeta {
            id: id.clone(),
            title,
            summary: "New document ready for collaborative Page and Edgeless editing.".into(),
            default_mode: mode,
            tags,
            is_favorite: false,
            trashed: false,
            journal_date,
            updated_at_ms: now_ms,
            outgoing_refs: Vec::new(),
        };
        self.docs.insert(
            id.clone(),
            LiveDocEntry {
                meta,
                session,
                note_id,
                surface_id,
                snapshot,
                revision,
                hydrated: true,
            },
        );
        self.rebuild_derived();
        id
    }

    /// Open or create the daily journal document for `date` (`YYYY-MM-DD`).
    pub fn open_or_create_journal(&mut self, date: &str, now_ms: i64) -> String {
        if let Some(existing) = self
            .docs
            .values()
            .find(|e| !e.meta.trashed && e.meta.journal_date.as_deref() == Some(date))
            .map(|e| e.meta.id.clone())
        {
            return existing;
        }
        self.create_doc(
            format!("Journal {date}"),
            DocMode::Page,
            Some(date.to_string()),
            now_ms,
        )
    }

    /// Append a live paragraph block to the shared `PageDocSession` (visible immediately in both
    /// Page and Edgeless panes viewing this `doc_id`!).
    pub fn append_paragraph(&mut self, doc_id: &str, text: &str, now_ms: i64) -> Option<String> {
        self.next_seq += 1;
        let block_id = format!("p-{}", self.next_seq);
        let entry = self.docs.get_mut(doc_id)?;
        let note_id = entry.note_id.clone();
        entry
            .session
            .add_block(
                &block_id,
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: text.to_string(),
                },
                Some(&note_id),
                None,
                now_ms as u64,
            )
            .ok()?;
        entry.snapshot = entry.session.read_page_snapshot().ok()?;
        entry.revision = entry.session.revision();
        entry.meta.updated_at_ms = now_ms;
        entry.meta.summary = text.to_string();
        self.env_rev += 1;
        Some(block_id)
    }

    /// Rename a document across both `WorkspaceDirectory` and its live `PageDocSession`.
    ///
    /// Mutates the real root block's `prop:title` `Y.Text` in place via `set_block_title_text`
    /// so concurrent character-level CRDT edits are preserved and non-`"root"` NanoIDs work.
    pub fn rename_doc(&mut self, doc_id: &str, new_title: &str, now_ms: i64) -> bool {
        if self.ensure_doc_hydrated(doc_id).is_err() {
            return false;
        }
        let Some(entry) = self.docs.get_mut(doc_id) else {
            return false;
        };
        if let Ok(id) = DocId::new(doc_id) {
            let _ = self.directory.rename_doc(&id, new_title);
        }
        entry.meta.title = new_title.to_string();
        entry.meta.updated_at_ms = now_ms;
        if let Some(root_id) = entry.snapshot.root.as_ref().map(|r| r.id.clone()) {
            let _ = entry
                .session
                .set_block_title_text(&root_id, new_title, now_ms as u64);
        }
        if let Ok(snap) = entry.session.read_page_snapshot() {
            populate_note_and_surface_ids(entry, &snap);
            entry.snapshot = snap;
            entry.revision = entry.session.revision();
        }
        self.env_rev += 1;
        true
    }

    pub fn toggle_favorite(&mut self, doc_id: &str) -> bool {
        let Some(entry) = self.docs.get_mut(doc_id) else {
            return false;
        };
        entry.meta.is_favorite = !entry.meta.is_favorite;
        self.env_rev += 1;
        entry.meta.is_favorite
    }

    /// Soft-delete a document into Trash.
    pub fn trash_doc(&mut self, doc_id: &str, now_ms: i64) -> bool {
        let Some(entry) = self.docs.get_mut(doc_id) else {
            return false;
        };
        if entry.meta.trashed {
            return false;
        }
        entry.meta.trashed = true;
        entry.meta.updated_at_ms = now_ms;
        if let Ok(id) = DocId::new(doc_id) {
            let _ = self.directory.trash_doc(&id, now_ms);
        }
        self.rebuild_derived();
        true
    }

    /// Restore a soft-deleted document from Trash.
    pub fn restore_doc(&mut self, doc_id: &str, now_ms: i64) -> bool {
        let Some(entry) = self.docs.get_mut(doc_id) else {
            return false;
        };
        if !entry.meta.trashed {
            return false;
        }
        entry.meta.trashed = false;
        entry.meta.updated_at_ms = now_ms;
        if let Ok(id) = DocId::new(doc_id) {
            let _ = self.directory.restore_doc(&id);
        }
        self.rebuild_derived();
        true
    }

    /// Permanently delete a trashed document from the workspace.
    pub fn permanently_delete_doc(&mut self, doc_id: &str) -> bool {
        let Some(entry) = self.docs.get(doc_id) else {
            return false;
        };
        if !entry.meta.trashed {
            return false;
        }
        self.docs.remove(doc_id);
        self.folder_rows
            .retain(|r| !(r.folder_type == "doc" && r.data == doc_id));
        self.rebuild_derived();
        true
    }

    /// Search visible documents using `WeightedSearchEngine` plus fuzzy subsequence fallback.
    pub fn search_docs(&self, query: &str, limit: usize) -> Vec<SearchHit> {
        let docs: Vec<SearchDocument> = self
            .visible_docs()
            .into_iter()
            .map(|d| SearchDocument {
                id: d.id.clone(),
                title: d.title.clone(),
                tags: d.tags.clone(),
                body_preview: d.summary.clone(),
                updated_at_ms: d.updated_at_ms,
            })
            .collect();
        let mut hits = self.search_engine.search(&docs, query, limit);
        if hits.is_empty() && !query.trim().is_empty() {
            let q = query.trim().to_ascii_lowercase();
            for d in &docs {
                if is_subsequence(&q, &d.title.to_ascii_lowercase())
                    || is_subsequence(&q, &d.body_preview.to_ascii_lowercase())
                {
                    hits.push(SearchHit {
                        doc_id: d.id.clone(),
                        title: d.title.clone(),
                        score: 0.5,
                        title_highlights: Vec::new(),
                        matched_tags: Vec::new(),
                        body_highlights: Vec::new(),
                        updated_at_ms: d.updated_at_ms,
                    });
                }
            }
            hits.truncate(limit);
        }
        hits
    }

    /// Extract H1-H6 outline headings from a live document snapshot.
    pub fn outline_headings(&self, doc_id: &str) -> Vec<OutlineHeading> {
        let Some(entry) = self.docs.get(doc_id) else {
            return Vec::new();
        };
        let Some(root) = &entry.snapshot.root else {
            return Vec::new();
        };
        let mut out = Vec::new();
        for node in root.walk() {
            if let BlockContent::Paragraph { kind, text, .. } = &node.content {
                let level = match kind {
                    ParagraphType::H1 => 1,
                    ParagraphType::H2 => 2,
                    ParagraphType::H3 => 3,
                    ParagraphType::H4 => 4,
                    ParagraphType::H5 => 5,
                    ParagraphType::H6 => 6,
                    _ => continue,
                };
                out.push(OutlineHeading {
                    block_id: node.id.clone(),
                    level,
                    text: text.plain.clone(),
                });
            }
        }
        out
    }

    /// Return backlinks pointing to `doc_id`.
    pub fn backlinks_for(&self, doc_id: &str) -> Vec<&DesktopDocMeta> {
        self.docs
            .values()
            .filter(|e| !e.meta.trashed && e.meta.outgoing_refs.iter().any(|r| r == doc_id))
            .map(|e| &e.meta)
            .collect()
    }

    pub(crate) fn rebuild_derived(&mut self) {
        self.env_rev += 1;
        let _ = self
            .folder_cache
            .resolve(true, self.env_rev, &self.folder_rows);
        self.link_graph = LinkGraph::default();
        for entry in self.docs.values() {
            let edges: Vec<DocRefEdge> = entry
                .meta
                .outgoing_refs
                .iter()
                .map(|target| DocRefEdge {
                    source_doc_id: entry.meta.id.clone(),
                    target_doc_id: target.clone(),
                    source_block_id: entry.note_id.clone(),
                    kind: OutboundRefKind::InlineMention,
                })
                .collect();
            self.link_graph
                .replace_edges(&entry.meta.id, edges, entry.revision);
        }
    }

    pub(crate) fn register_seeded(
        &mut self,
        meta: DesktopDocMeta,
        session: PageDocSession,
        note_id: String,
        surface_id: String,
    ) {
        let _ = self.directory.create_doc(CreateDocRequest {
            id: CreateDocId::explicit(DocId::new(meta.id.clone()).expect("valid seeded id")),
            title: meta.title.clone(),
            mode: meta.default_mode,
            now_ms: meta.updated_at_ms,
        });
        if meta.trashed {
            if let Ok(id) = DocId::new(&meta.id) {
                let _ = self.directory.trash_doc(&id, meta.updated_at_ms);
            }
        }
        let snapshot = session.read_page_snapshot().expect("seeded snapshot");
        let revision = session.revision();
        self.docs.insert(
            meta.id.clone(),
            LiveDocEntry {
                meta,
                session,
                note_id,
                surface_id,
                snapshot,
                revision,
                hydrated: true,
            },
        );
    }

    /// Open a real `.affine` / `<spaceId>.db` SQLite workspace in place with lazy hydration.
    #[cfg(not(target_family = "wasm"))]
    pub fn open_sqlite_file(
        path: impl AsRef<std::path::Path>,
    ) -> anyhow::Result<(Self, crate::sqlite_loader::SqliteLoadStats)> {
        crate::sqlite_loader::open_sqlite_workspace(path)
    }

    /// Lazily hydrate one document's CRDT state from its SQLite backing store if not yet loaded.
    ///
    /// Returns `Err` if reading or applying the SQLite CRDT payload fails, without marking the
    /// entry as hydrated so callers never silently render a corrupted/unreadable doc as empty.
    pub fn ensure_doc_hydrated(&mut self, doc_id: &str) -> Result<bool, String> {
        let Some(entry) = self.docs.get(doc_id) else {
            return Ok(false);
        };
        if entry.hydrated {
            return Ok(true);
        }
        #[cfg(not(target_family = "wasm"))]
        if let Some(backing) = self.sqlite_backing.clone() {
            let maybe_bytes = backing
                .load_doc_update(doc_id)
                .map_err(|e| format!("failed to read SQLite doc `{doc_id}`: {e}"))?;
            let Some(entry) = self.docs.get_mut(doc_id) else {
                return Ok(false);
            };
            if let Some(bytes) = maybe_bytes
                && !bytes.is_empty()
            {
                entry
                    .session
                    .apply_remote_update_v1(&bytes)
                    .map_err(|e| format!("failed to apply CRDT update for `{doc_id}`: {e}"))?;
                if entry.session.inner().client_required() {
                    entry
                        .session
                        .inner_mut()
                        .set_client(blocksuite_playground_doc::random_client_id());
                }
            }
            let snap = entry
                .session
                .read_page_snapshot()
                .map_err(|e| format!("failed to read page snapshot for `{doc_id}`: {e}"))?;
            populate_note_and_surface_ids(entry, &snap);
            if entry.meta.summary.is_empty() {
                entry.meta.summary = crate::sqlite_loader::extract_snapshot_summary(&snap);
            }
            entry.snapshot = snap;
            entry.revision = entry.session.revision();
            entry.hydrated = true;
            return Ok(true);
        }
        if let Some(entry) = self.docs.get_mut(doc_id) {
            entry.hydrated = true;
            return Ok(true);
        }
        Ok(false)
    }

    /// Apply a Yjs V1 update originated by a mounted `Entity<PlaygroundView>` into the shared doc.
    pub fn apply_remote_doc_update(&mut self, doc_id: &str, update: &[u8]) -> bool {
        if update.is_empty() {
            return false;
        }
        let Some(entry) = self.docs.get_mut(doc_id) else {
            return false;
        };
        if entry.session.apply_remote_update_v1(update).is_err() {
            return false;
        }
        if entry.session.inner().client_required() {
            entry.session.inner_mut().set_client(fresh_client_id());
        }
        if let Ok(snap) = entry.session.read_page_snapshot() {
            populate_note_and_surface_ids(entry, &snap);
            if let Some(root) = &snap.root
                && let BlockContent::Page { title } = &root.content
                && !title.plain.trim().is_empty()
            {
                entry.meta.title = title.plain.clone();
            }
            entry.snapshot = snap;
        }
        entry.revision = entry.session.revision();
        entry.hydrated = true;
        self.env_rev += 1;
        true
    }
}

#[cfg(not(target_family = "wasm"))]
pub(crate) fn fresh_client_id() -> u64 {
    blocksuite_playground_doc::random_client_id()
}

#[cfg(target_family = "wasm")]
pub(crate) fn fresh_client_id() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0xD5E7_0001);
    blocksuite_playground_doc::client_id_from_seed(NEXT.fetch_add(1, Ordering::Relaxed))
}

fn is_subsequence(needle: &str, haystack: &str) -> bool {
    let mut chars = needle.chars();
    let mut current = match chars.next() {
        Some(c) => c,
        None => return true,
    };
    for h in haystack.chars() {
        if h == current {
            match chars.next() {
                Some(next) => current = next,
                None => return true,
            }
        }
    }
    false
}
