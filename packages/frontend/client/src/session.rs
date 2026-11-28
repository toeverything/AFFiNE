//! L3 workspace session driver unifying `StoreBackedDocDirectory`, `AuthController`,
//! `SpaceSyncEngine`, cached `PageDocSession`s, and media/blob ingestion.
//!
//! Compiles on both native targets and `wasm32-unknown-unknown` with zero system wall-clock calls.

use std::collections::BTreeMap;

use affine_store::{
    directory::WorkspaceDirectory,
    id_converter::IdConverter,
    sync::{
        EngineIoOutput, PushDocIntent, SpaceSyncConfig, SpaceSyncEngine, SpaceSyncEvent,
        SpaceSyncOutbound, SpaceSyncState,
    },
    workspace_db::{PendingDocUpdate, WorkspaceDb},
};
use blocksuite_editor::{
    DirectoryError, DocQueryPage, DocQueryRequest, EditorDocId, EditorDocMode, EditorDocSummary,
    WorkspaceDocDirectory,
};
use blocksuite_playground_doc::{
    read::PageSnapshot,
    schema::{BlockSpec, ParagraphType},
    session::PageDocSession,
};
use serde::{Deserialize, Serialize};

use crate::{
    ClientError, ClientResult,
    auth::{AuthController, NativeAuthPlatform},
    blob_ingest::{
        BlobUploadState, IngestedBlobRecord, InsertedMediaBlock, PickedMediaInput,
        ingest_media_into_doc_session,
    },
    doc_directory::StoreBackedDocDirectory,
    host::{HostBridge, HostKind, WsHandle},
};

/// High-level sync status surfaced in workspace chrome and accessibility trees.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceSyncStatus {
    #[default]
    Offline,
    Connecting,
    Syncing {
        pending_updates: usize,
    },
    Synced,
    ReconnectScheduled {
        next_attempt_at_ms: i64,
        pending_updates: usize,
    },
    AuthRequired,
    PermissionRevoked,
}

impl WorkspaceSyncStatus {
    pub const fn pending_count(self) -> usize {
        match self {
            Self::Syncing { pending_updates }
            | Self::ReconnectScheduled {
                pending_updates, ..
            } => pending_updates,
            _ => 0,
        }
    }
}

#[cfg(not(target_family = "wasm"))]
fn fresh_client_id(_fallback: u64) -> u64 {
    blocksuite_playground_doc::random_client_id()
}

#[cfg(target_family = "wasm")]
fn fresh_client_id(fallback: u64) -> u64 {
    let mut bytes = [0u8; 8];
    let seed = if getrandom::fill(&mut bytes).is_ok() {
        u64::from_le_bytes(bytes)
    } else {
        fallback
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1)
    };
    blocksuite_playground_doc::client_id_from_seed(seed)
}

/// Complete L3 workspace session driving multi-doc switching, `@` directory queries,
/// auth credential hydration, `SpaceSync` WebSocket room push/pull, and blob ingestion.
pub struct WorkspaceSession {
    space_id: String,
    client_id: u64,
    directory: StoreBackedDocDirectory,
    auth: AuthController,
    sync: SpaceSyncEngine,
    ws_handle: Option<WsHandle>,
    open_docs: BTreeMap<String, PageDocSession>,
    active_doc_id: Option<String>,
    blobs: BTreeMap<String, (IngestedBlobRecord, Vec<u8>)>,
    pending_persist_updates: Vec<PendingDocUpdate>,
    next_media_seq: u64,
}

impl WorkspaceSession {
    /// Initialize a new in-memory workspace session backed by `WorkspaceDb` + `SpaceSyncEngine`.
    pub fn new(
        space_id: impl Into<String>,
        user_id: impl Into<String>,
        client_id: u64,
        host_kind: HostKind,
        server_id: impl Into<String>,
        base_url: impl Into<String>,
        initial_now_ms: i64,
    ) -> ClientResult<Self> {
        let space_id = space_id.into();
        let mut db = WorkspaceDb::new(&space_id, user_id, client_id);
        db.initialize_meta()?;
        let _ = db.drain_pending_updates();
        Self::from_workspace_db(
            db,
            client_id,
            host_kind,
            server_id,
            base_url,
            initial_now_ms,
        )
    }

    /// Wrap an existing recovered [`WorkspaceDb`] (for example loaded from SQLite WAL).
    pub fn from_workspace_db(
        db: WorkspaceDb,
        client_id: u64,
        host_kind: HostKind,
        server_id: impl Into<String>,
        base_url: impl Into<String>,
        initial_now_ms: i64,
    ) -> ClientResult<Self> {
        let space_id = db.space_id().to_string();
        let directory = StoreBackedDocDirectory::new(WorkspaceDirectory::new(db), initial_now_ms);
        let auth = AuthController::new(server_id, base_url, host_kind);
        let mut sync_cfg = SpaceSyncConfig::workspace(&space_id, false);
        sync_cfg.auth_mode = auth.socket_auth_mode();
        let sync = SpaceSyncEngine::new(sync_cfg, IdConverter::new(&space_id));
        Ok(Self {
            space_id,
            client_id,
            directory,
            auth,
            sync,
            ws_handle: None,
            open_docs: BTreeMap::new(),
            active_doc_id: None,
            blobs: BTreeMap::new(),
            pending_persist_updates: Vec::new(),
            next_media_seq: 1,
        })
    }

    pub fn space_id(&self) -> &str {
        &self.space_id
    }

    pub fn client_id(&self) -> u64 {
        self.client_id
    }

    pub fn active_doc_id(&self) -> Option<&str> {
        self.active_doc_id.as_deref()
    }

    pub fn auth(&self) -> &AuthController {
        &self.auth
    }

    pub fn auth_mut(&mut self) -> &mut AuthController {
        &mut self.auth
    }

    pub fn sync_engine(&self) -> &SpaceSyncEngine {
        &self.sync
    }

    pub fn sync_engine_mut(&mut self) -> &mut SpaceSyncEngine {
        &mut self.sync
    }

    pub fn directory(&self) -> &StoreBackedDocDirectory {
        &self.directory
    }

    pub fn directory_mut(&mut self) -> &mut StoreBackedDocDirectory {
        &mut self.directory
    }

    /// Hydrate Keychain / Android DataStore credentials via `HostBridge` and update `SpaceSync`.
    pub fn hydrate_auth(
        &mut self,
        host: &dyn HostBridge,
        platform: NativeAuthPlatform,
    ) -> ClientResult<bool> {
        let loaded = self.auth.load_stored_credentials(host, platform)?;
        self.sync.set_auth_mode(self.auth.socket_auth_mode());
        Ok(loaded)
    }

    /// Derive the current UI-ready [`WorkspaceSyncStatus`].
    pub fn sync_status(&self) -> WorkspaceSyncStatus {
        let pending_blobs = self
            .blobs
            .values()
            .filter(|(rec, _)| rec.upload_state != BlobUploadState::Uploaded)
            .count();
        let pending_updates = self.sync.offline_queue().len() + pending_blobs;
        match self.sync.state() {
            SpaceSyncState::Offline => {
                if pending_updates > 0 {
                    WorkspaceSyncStatus::Syncing { pending_updates }
                } else {
                    WorkspaceSyncStatus::Offline
                }
            }
            SpaceSyncState::Connecting | SpaceSyncState::Joining => WorkspaceSyncStatus::Connecting,
            SpaceSyncState::Ready => {
                if pending_updates > 0 {
                    WorkspaceSyncStatus::Syncing { pending_updates }
                } else {
                    WorkspaceSyncStatus::Synced
                }
            }
            SpaceSyncState::ReconnectScheduled { next_attempt_at_ms } => {
                WorkspaceSyncStatus::ReconnectScheduled {
                    next_attempt_at_ms,
                    pending_updates,
                }
            }
            SpaceSyncState::AuthRequired => WorkspaceSyncStatus::AuthRequired,
            SpaceSyncState::PermissionRevoked => WorkspaceSyncStatus::PermissionRevoked,
        }
    }

    /// Connect the `SpaceSync` room over `HostBridge` and flush initial outbound frames.
    pub fn connect_sync(
        &mut self,
        host: &mut dyn HostBridge,
        ws_url: &str,
        now_ms: i64,
    ) -> ClientResult<()> {
        self.sync.set_auth_mode(self.auth.socket_auth_mode());
        self.sync.connect(now_ms);
        self.flush_outbound_to_host(host, ws_url)
    }

    /// Notify that the WebSocket connection opened and flush Engine.IO/Socket.IO handshakes.
    pub fn on_ws_open(
        &mut self,
        host: &mut dyn HostBridge,
        ws_url: &str,
        now_ms: i64,
    ) -> ClientResult<Vec<SpaceSyncEvent>> {
        self.sync.on_ws_open(now_ms);
        self.flush_outbound_to_host(host, ws_url)?;
        self.process_sync_events()
    }

    /// Feed an inbound WebSocket text frame into `SpaceSyncEngine`, apply remote CRDT updates,
    /// and flush any automatic responses back to `HostBridge`.
    pub fn on_ws_text(
        &mut self,
        host: &mut dyn HostBridge,
        ws_url: &str,
        frame: &str,
        now_ms: i64,
    ) -> ClientResult<Vec<SpaceSyncEvent>> {
        self.sync.on_ws_text(frame, now_ms)?;
        self.flush_outbound_to_host(host, ws_url)?;
        self.process_sync_events()
    }

    /// Notify that the WebSocket transport errored/dropped at `now_ms`.
    pub fn on_ws_error(
        &mut self,
        host: &mut dyn HostBridge,
        ws_url: &str,
        reason: &str,
        now_ms: i64,
    ) -> ClientResult<Vec<SpaceSyncEvent>> {
        self.sync.on_ws_error(reason, now_ms);
        self.flush_outbound_to_host(host, ws_url)?;
        self.process_sync_events()
    }

    /// Advance deterministic reconnect / ACK / retry timers at `now_ms`.
    pub fn on_tick(
        &mut self,
        host: &mut dyn HostBridge,
        ws_url: &str,
        now_ms: i64,
    ) -> ClientResult<Vec<SpaceSyncEvent>> {
        self.sync.on_tick(now_ms)?;
        self.flush_outbound_to_host(host, ws_url)?;
        self.process_sync_events()
    }

    fn flush_outbound_to_host(
        &mut self,
        host: &mut dyn HostBridge,
        ws_url: &str,
    ) -> ClientResult<()> {
        let outbound = self.sync.drain_outbound();
        for item in outbound {
            if let SpaceSyncOutbound::Transport(cmd) = item {
                match cmd {
                    EngineIoOutput::OpenWebsocket { .. } => {
                        let ctx = self.auth.api_context();
                        let mut headers =
                            vec![("x-affine-version".to_string(), ctx.client_version.clone())];
                        if let Some(token) = ctx.bearer_token {
                            headers.push(("authorization".to_string(), format!("Bearer {token}")));
                        }
                        let handle = host.ws_connect(ws_url, &headers)?;
                        self.ws_handle = Some(handle);
                    }
                    EngineIoOutput::SendWsText(text) => {
                        if let Some(handle) = self.ws_handle {
                            host.ws_send(handle, &text)?;
                        }
                    }
                    EngineIoOutput::CloseTransport => {
                        if let Some(handle) = self.ws_handle.take() {
                            host.ws_close(handle)?;
                        }
                    }
                    _ => {}
                }
            }
        }
        Ok(())
    }

    fn process_sync_events(&mut self) -> ClientResult<Vec<SpaceSyncEvent>> {
        let events = self.sync.drain_events();
        for ev in &events {
            match ev {
                SpaceSyncEvent::RemoteDocUpdates {
                    doc_id, updates, ..
                } => {
                    for bin in updates {
                        self.apply_remote_update_bytes(doc_id, bin)?;
                    }
                }
                SpaceSyncEvent::DocLoaded {
                    doc_id, missing, ..
                } if !missing.is_empty() && missing != &[0, 0] => {
                    self.apply_remote_update_bytes(doc_id, missing)?;
                }
                _ => {}
            }
        }
        Ok(events)
    }

    fn apply_remote_update_bytes(&mut self, doc_id: &str, update_v1: &[u8]) -> ClientResult<()> {
        if doc_id == self.space_id {
            self.directory
                .lock_directory()
                .db_mut()
                .apply_remote_root_update(update_v1)?;
            return Ok(());
        }
        if !self.open_docs.contains_key(doc_id) {
            let session = PageDocSession::new(doc_id, self.client_id)
                .map_err(|e| ClientError::Store(e.to_string()))?;
            self.open_docs.insert(doc_id.to_string(), session);
        }
        if let Some(page) = self.open_docs.get_mut(doc_id) {
            page.apply_remote_update_v1(update_v1)
                .map_err(|e| ClientError::Store(e.to_string()))?;
            if page.inner().client_required() {
                page.inner_mut().set_client(fresh_client_id(self.client_id));
            }
            if let Ok(snap) = page.read_page_snapshot() {
                self.directory.upsert_doc_snapshot(
                    &EditorDocId::new(doc_id),
                    std::sync::Arc::new(snap),
                    page.revision(),
                );
            }
        }
        Ok(())
    }

    /// Create a new document in `StoreBackedDocDirectory`, seed its page skeleton, queue its
    /// pending updates into `SpaceSyncEngine`, and return both the summary and pending updates
    /// ready for SQLite WAL persistence.
    pub fn create_document(
        &mut self,
        title: &str,
        mode: EditorDocMode,
        intent_id: Option<&str>,
        now_ms: i64,
    ) -> ClientResult<(EditorDocSummary, Vec<PendingDocUpdate>)> {
        self.directory.set_now_ms(now_ms);
        let summary = self
            .directory
            .create_linked_doc(title, mode, intent_id)
            .map_err(|e| ClientError::Store(e.to_string()))?;

        let doc_id = summary.id.as_str().to_string();
        let mut page = PageDocSession::new(&doc_id, self.client_id)
            .map_err(|e| ClientError::Store(e.to_string()))?;
        let ts = now_ms.max(0) as u64;
        page.add_block(
            "root",
            BlockSpec::Page {
                title: title.to_string(),
            },
            None,
            None,
            ts,
        )
        .map_err(|e| ClientError::Store(e.to_string()))?;
        page.add_block(
            "note-1",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            ts,
        )
        .map_err(|e| ClientError::Store(e.to_string()))?;
        page.add_block(
            "p-1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
            Some("note-1"),
            None,
            ts,
        )
        .map_err(|e| ClientError::Store(e.to_string()))?;

        let page_update = page
            .encode_update_v1()
            .map_err(|e| ClientError::Store(e.to_string()))?;
        if let Ok(snap) = page.read_page_snapshot() {
            self.directory.upsert_doc_snapshot(
                &summary.id,
                std::sync::Arc::new(snap),
                page.revision(),
            );
        }
        self.open_docs.insert(doc_id.clone(), page);
        self.active_doc_id = Some(doc_id.clone());

        let mut pending = self.directory.drain_pending_updates();
        pending.push(PendingDocUpdate {
            doc_id: doc_id.clone(),
            update: page_update,
        });
        for item in &pending {
            let intent = if item.doc_id == doc_id {
                PushDocIntent::Create
            } else {
                PushDocIntent::Update
            };
            self.sync
                .push_doc_update(item.doc_id.clone(), item.update.clone(), intent, now_ms)?;
        }
        Ok((summary, pending))
    }

    /// Register an already-loaded [`PageDocSession`] (e.g. hydrated from SQLite WAL).
    pub fn register_loaded_doc(&mut self, doc_id: impl Into<String>, page: PageDocSession) {
        let doc_id = doc_id.into();
        if let Ok(snap) = page.read_page_snapshot() {
            self.directory.upsert_doc_snapshot(
                &EditorDocId::new(&doc_id),
                std::sync::Arc::new(snap),
                page.revision(),
            );
        }
        self.open_docs.insert(doc_id, page);
    }

    /// Millisecond document switch: sets `active_doc_id` and returns the cached [`PageDocSession`].
    pub fn open_document(&mut self, doc_id: &str) -> ClientResult<&PageDocSession> {
        if !self.open_docs.contains_key(doc_id) {
            return Err(ClientError::DocNotFound(doc_id.to_string()));
        }
        self.active_doc_id = Some(doc_id.to_string());
        self.open_docs
            .get(doc_id)
            .ok_or_else(|| ClientError::DocNotFound(doc_id.to_string()))
    }

    /// Mutably borrow the currently active [`PageDocSession`].
    pub fn active_doc_mut(&mut self) -> Option<&mut PageDocSession> {
        let id = self.active_doc_id.as_deref()?;
        self.open_docs.get_mut(id)
    }

    /// Read the typed [`PageSnapshot`] of `doc_id` if loaded.
    pub fn doc_snapshot(&self, doc_id: &str) -> Option<PageSnapshot> {
        self.open_docs
            .get(doc_id)
            .and_then(|p| p.read_page_snapshot().ok())
    }

    /// Export the full authoritative Yjs V1 CRDT update bytes of `doc_id` if loaded.
    pub fn doc_update_v1(&self, doc_id: &str) -> Option<Vec<u8>> {
        self.open_docs
            .get(doc_id)
            .and_then(|p| p.encode_update_v1().ok())
    }

    /// Merge authoritative local Yjs V1 CRDT update bytes (for example produced by an embedded
    /// `PlaygroundView`) into this session's `PageDocSession`, updating the directory snapshot,
    /// `SpaceSyncEngine`, and `pending_persist_updates` whenever the encoded CRDT state
    /// (`StructStore` or `DeleteSet`) advances.
    pub fn merge_local_doc_update(
        &mut self,
        doc_id: &str,
        update_v1: &[u8],
        now_ms: i64,
    ) -> ClientResult<bool> {
        if update_v1.is_empty() || update_v1 == [0, 0] {
            return Ok(false);
        }
        if !self.open_docs.contains_key(doc_id) {
            let session = PageDocSession::new(doc_id, self.client_id)
                .map_err(|e| ClientError::Store(e.to_string()))?;
            self.open_docs.insert(doc_id.to_string(), session);
        }
        let Some(page) = self.open_docs.get_mut(doc_id) else {
            return Ok(false);
        };
        let before_sv = page
            .encode_state_vector_v1()
            .map_err(|e| ClientError::Store(e.to_string()))?;
        let before_state = page
            .encode_update_v1()
            .map_err(|e| ClientError::Store(e.to_string()))?;
        page.apply_remote_update_v1(update_v1)
            .map_err(|e| ClientError::Store(e.to_string()))?;
        if page.inner().client_required() {
            page.inner_mut().set_client(fresh_client_id(self.client_id));
        }
        let after_state = page
            .encode_update_v1()
            .map_err(|e| ClientError::Store(e.to_string()))?;
        if before_state == after_state {
            return Ok(false);
        }
        let diff = page
            .encode_diff_v1(&before_sv)
            .ok()
            .filter(|b| !b.is_empty() && b.as_slice() != [0, 0])
            .unwrap_or(after_state);
        if let Ok(snap) = page.read_page_snapshot() {
            self.directory.upsert_doc_snapshot(
                &EditorDocId::new(doc_id),
                std::sync::Arc::new(snap),
                page.revision(),
            );
        }
        self.sync
            .push_doc_update(doc_id, diff.clone(), PushDocIntent::Update, now_ms)?;
        self.pending_persist_updates.push(PendingDocUpdate {
            doc_id: doc_id.to_string(),
            update: diff,
        });
        Ok(true)
    }

    /// Number of queued document updates waiting to be flushed to SQLite WAL.
    pub fn pending_persist_count(&self) -> usize {
        self.pending_persist_updates.len()
    }

    /// Drain all pending workspace-root and subdoc CRDT updates ready for SQLite WAL persistence.
    pub fn drain_pending_persist_updates(&mut self) -> Vec<PendingDocUpdate> {
        let mut out = self
            .directory
            .lock_directory()
            .db_mut()
            .drain_pending_updates();
        out.append(&mut self.pending_persist_updates);
        out
    }

    /// Query linked documents via [`WorkspaceDocDirectory`] (`@` mention search).
    pub fn query_linked_docs(&self, req: &DocQueryRequest) -> Result<DocQueryPage, DirectoryError> {
        self.directory.query_linked_docs(req)
    }

    /// Push a local document incremental update into `SpaceSyncEngine` (offline-safe).
    pub fn queue_doc_update(
        &mut self,
        doc_id: &str,
        update_v1: Vec<u8>,
        now_ms: i64,
    ) -> ClientResult<()> {
        self.sync
            .push_doc_update(doc_id, update_v1, PushDocIntent::Update, now_ms)?;
        Ok(())
    }

    /// Ingest a picked local image or file into the active document at `(parent_id, insert_index)`:
    /// stores content-addressed blob bytes + metadata in the local blob map, queues upload,
    /// atomically inserts `affine:image` or `affine:attachment` (single-step undoable), and
    /// enqueues the CRDT update to `SpaceSyncEngine`.
    pub fn ingest_picked_media(
        &mut self,
        doc_id: &str,
        parent_id: &str,
        insert_index: Option<u64>,
        input: &PickedMediaInput,
        now_ms: i64,
    ) -> ClientResult<InsertedMediaBlock> {
        let block_id = format!("media-{}", self.next_media_seq);
        self.next_media_seq = self.next_media_seq.saturating_add(1);

        let page = self
            .open_docs
            .get_mut(doc_id)
            .ok_or_else(|| ClientError::DocNotFound(doc_id.to_string()))?;
        let inserted =
            ingest_media_into_doc_session(page, input, parent_id, insert_index, &block_id, now_ms)?;
        if let Ok(snap) = page.read_page_snapshot() {
            self.directory.upsert_doc_snapshot(
                &EditorDocId::new(doc_id),
                std::sync::Arc::new(snap),
                page.revision(),
            );
        }

        self.blobs.insert(
            inserted.blob.key.clone(),
            (inserted.blob.clone(), input.bytes.clone()),
        );
        self.sync.push_doc_update(
            doc_id,
            inserted.update_v1.clone(),
            PushDocIntent::Update,
            now_ms,
        )?;
        Ok(inserted)
    }

    /// Undo the last tracked edit on `doc_id` (e.g. single-step rollback of an inserted media block)
    /// and enqueue the resulting CRDT update to `SpaceSyncEngine`.
    pub fn undo_doc(&mut self, doc_id: &str, now_ms: i64) -> ClientResult<Option<Vec<u8>>> {
        let page = self
            .open_docs
            .get_mut(doc_id)
            .ok_or_else(|| ClientError::DocNotFound(doc_id.to_string()))?;
        let commit = page.undo().map_err(|e| ClientError::Store(e.to_string()))?;
        if let Ok(snap) = page.read_page_snapshot() {
            self.directory.upsert_doc_snapshot(
                &EditorDocId::new(doc_id),
                std::sync::Arc::new(snap),
                page.revision(),
            );
        }
        if let Some(c) = commit {
            self.sync
                .push_doc_update(doc_id, c.update.clone(), PushDocIntent::Update, now_ms)?;
            return Ok(Some(c.update));
        }
        Ok(None)
    }

    /// Mark a local blob as uploaded (updates `sync_status` pending count).
    pub fn mark_blob_uploaded(&mut self, blob_key: &str) -> bool {
        if let Some((rec, _)) = self.blobs.get_mut(blob_key) {
            rec.upload_state = BlobUploadState::Uploaded;
            return true;
        }
        false
    }

    pub fn blob_record(&self, key: &str) -> Option<&IngestedBlobRecord> {
        self.blobs.get(key).map(|(rec, _)| rec)
    }

    pub fn blob_bytes(&self, key: &str) -> Option<&[u8]> {
        self.blobs.get(key).map(|(_, bytes)| bytes.as_slice())
    }
}
