//! Live bridge connecting [`affine_client::WorkspaceSession`] (SQLite WAL + `SpaceSync` +
//! `StoreBackedDocDirectory` + blob ingestion) with [`MobileAppState`].

use affine_client::{
    BlobUploadState, ClientResult, DirectKind, DirectoryError, DocQueryPage, DocQueryRequest,
    EditorDocMode, EditorDocSummary, IngestedBlobRecord, InsertedMediaBlock, Origin,
    PickedMediaInput, WorkspaceSession,
};
use affine_store::workspace_db::PendingDocUpdate;
use blocksuite_playground_doc::read::{BlockContent, PageSnapshot};

use crate::state::{MobileAppState, MobileDocBlock, MobileDocRecord};

/// Convert a typed [`PageSnapshot`] into renderable mobile document blocks.
pub fn blocks_from_snapshot(
    snapshot: &PageSnapshot,
    blob_lookup: &impl Fn(&str) -> Option<IngestedBlobRecord>,
) -> Vec<MobileDocBlock> {
    let Some(root) = &snapshot.root else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for node in root.walk() {
        match &node.content {
            BlockContent::Paragraph { text, .. } | BlockContent::List { text, .. } => {
                if !text.plain.trim().is_empty() {
                    out.push(MobileDocBlock::Paragraph {
                        id: node.id.clone(),
                        text: text.plain.clone(),
                    });
                }
            }
            BlockContent::Image {
                source_id,
                caption,
                width,
                height,
                ..
            } => {
                let key = source_id.clone();
                let meta = blob_lookup(&key);
                out.push(MobileDocBlock::Image {
                    id: node.id.clone(),
                    blob_key: key,
                    caption: caption.clone(),
                    width: width.map(|v| v.max(1.0) as u32).unwrap_or(640),
                    height: height.map(|v| v.max(1.0) as u32).unwrap_or(400),
                    byte_size: meta.as_ref().map_or(0, |m| m.byte_size),
                    mime_type: meta
                        .as_ref()
                        .map_or_else(|| "image/png".to_string(), |m| m.mime_type.clone()),
                    upload_state: meta
                        .as_ref()
                        .map_or(BlobUploadState::Queued, |m| m.upload_state),
                });
            }
            BlockContent::Attachment {
                name,
                size,
                mime_type,
                source_id,
                ..
            } => {
                let key = source_id.clone();
                let meta = blob_lookup(&key);
                out.push(MobileDocBlock::Attachment {
                    id: node.id.clone(),
                    blob_key: key,
                    name: name.clone(),
                    mime_type: mime_type.clone(),
                    byte_size: (*size).max(0) as usize,
                    upload_state: meta
                        .as_ref()
                        .map_or(BlobUploadState::Queued, |m| m.upload_state),
                });
            }
            _ => {}
        }
    }
    out
}

/// Live workspace controller synchronizing [`WorkspaceSession`] into [`MobileAppState`].
pub struct MobileWorkspaceBridge {
    session: WorkspaceSession,
}

impl MobileWorkspaceBridge {
    pub fn new(session: WorkspaceSession) -> Self {
        Self { session }
    }

    pub fn session(&self) -> &WorkspaceSession {
        &self.session
    }

    pub fn session_mut(&mut self) -> &mut WorkspaceSession {
        &mut self.session
    }

    /// Merge any newer authoritative Yjs V1 CRDT updates written by the embedded `PlaygroundView`
    /// in `state` back into `self.session`, advancing its snapshots, `SpaceSyncEngine`, and
    /// `pending_persist_updates` without producing empty/duplicate updates.
    pub fn sync_from_state(&mut self, state: &MobileAppState, now_ms: i64) -> ClientResult<usize> {
        let mut merged = 0usize;
        for (doc_id, update_v1) in &state.active_workspace().doc_crdt_updates {
            if self
                .session
                .merge_local_doc_update(doc_id, update_v1, now_ms)?
            {
                merged += 1;
            }
        }
        Ok(merged)
    }

    /// Merge live shell CRDT edits into `self.session` and drain all pending CRDT updates ready
    /// for atomic SQLite WAL persistence via `SqliteWorkspaceStore::persist_pending_updates`.
    pub fn flush_pending_updates(
        &mut self,
        state: &MobileAppState,
        now_ms: i64,
    ) -> ClientResult<Vec<PendingDocUpdate>> {
        self.sync_from_state(state, now_ms)?;
        Ok(self.session.drain_pending_persist_updates())
    }

    /// Synchronize bidirectionally: first merge any newer embedded-editor CRDT edits from `state`
    /// into `self.session`, then project `self.session`'s sync status, authoritative CRDT updates,
    /// and read-only document summaries into `state`.
    pub fn sync_into_state(&mut self, state: &mut MobileAppState) {
        let _ = self.sync_from_state(state, 0);
        let status = self.session.sync_status();
        state.set_sync_status(status);
        let ws = state.active_workspace_mut();
        for doc in &mut ws.docs {
            if let Some(update_v1) = self.session.doc_update_v1(&doc.id)
                && !update_v1.is_empty()
            {
                ws.doc_crdt_updates.insert(doc.id.clone(), update_v1);
            }
            if let Some(snap) = self.session.doc_snapshot(&doc.id) {
                let blocks = blocks_from_snapshot(&snap, &|k| self.session.blob_record(k).cloned());
                if !blocks.is_empty() || !doc.blocks.is_empty() {
                    doc.blocks = blocks;
                }
            }
        }
    }

    /// Create a document in the live `WorkspaceSession` + `StoreBackedDocDirectory`,
    /// mirror it into `MobileAppState`, and open it immediately.
    pub fn create_and_open_document(
        &mut self,
        state: &mut MobileAppState,
        title: &str,
        intent_id: Option<&str>,
        now_ms: i64,
    ) -> ClientResult<(EditorDocSummary, Vec<PendingDocUpdate>)> {
        self.sync_from_state(state, now_ms)?;
        let (summary, pending) =
            self.session
                .create_document(title, EditorDocMode::Page, intent_id, now_ms)?;
        let doc_id = summary.id.as_str().to_string();
        let ws = state.active_workspace_mut();
        if !ws.docs.iter().any(|d| d.id == doc_id) {
            ws.docs.insert(
                0,
                MobileDocRecord {
                    id: doc_id.clone(),
                    title: summary.title.clone(),
                    body_preview: String::new(),
                    tags: Vec::new(),
                    updated_at_ms: summary.updated_at_ms,
                    is_favorite: false,
                    trashed: false,
                    journal_date: None,
                    clock: 1,
                    outgoing_edges: Vec::new(),
                    blocks: Vec::new(),
                },
            );
            ws.link_graph.replace_edges(&doc_id, Vec::new(), 1);
            ws.summary.doc_count = ws.active_doc_count();
        }
        state.open_doc(&doc_id, Origin::Direct(DirectKind::AllDocs));
        self.sync_into_state(state);
        Ok((summary, pending))
    }

    /// Millisecond switch to `doc_id` across both `WorkspaceSession` and `MobileAppState`.
    ///
    /// First flushes any in-progress embedded editor CRDT edits from `state` into `self.session`
    /// so switching away and back never overwrites live edits with stale session snapshots.
    pub fn open_document(&mut self, state: &mut MobileAppState, doc_id: &str) -> ClientResult<()> {
        self.sync_from_state(state, 0)?;
        let _ = self.session.open_document(doc_id)?;
        state.open_document(doc_id, 0.0);
        self.sync_into_state(state);
        Ok(())
    }

    /// Query `@` mention candidates through the live `WorkspaceDocDirectory`.
    pub fn query_linked_docs(&self, req: &DocQueryRequest) -> Result<DocQueryPage, DirectoryError> {
        self.session.query_linked_docs(req)
    }

    /// Ingest a host-picked image or attachment into `doc_id` at `(parent_id, insert_index)`,
    /// storing content-addressed blob metadata and updating `MobileAppState` blocks.
    pub fn ingest_picked_media(
        &mut self,
        state: &mut MobileAppState,
        doc_id: &str,
        parent_id: &str,
        insert_index: Option<u64>,
        input: &PickedMediaInput,
        now_ms: i64,
    ) -> ClientResult<InsertedMediaBlock> {
        let inserted =
            self.session
                .ingest_picked_media(doc_id, parent_id, insert_index, input, now_ms)?;
        self.sync_into_state(state);
        Ok(inserted)
    }

    /// Perform a single-step CRDT undo on `doc_id` and synchronize the updated blocks into `state`.
    pub fn undo_doc(
        &mut self,
        state: &mut MobileAppState,
        doc_id: &str,
        now_ms: i64,
    ) -> ClientResult<bool> {
        let undone = self.session.undo_doc(doc_id, now_ms)?.is_some();
        self.sync_into_state(state);
        Ok(undone)
    }
}
