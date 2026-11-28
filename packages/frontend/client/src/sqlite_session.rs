//! Native SQLite WAL persistence adapter for [`WorkspaceSession`].
//!
//! Opens `<base_dir>/<spaceId>.db` in place using `affine_store::sqlite::SqliteDocStorage`
//! (5-step frozen `0.27.5` schema, WAL mode, `synchronous = FULL`, `foreign_keys = ON`).

use std::path::Path;

use affine_store::{
    sqlite::{
        BlobRecord, ListedBlob, SetBlob, SqliteDocStorage, millis_to_naive_utc,
        resolve_workspace_db_path,
    },
    workspace_db::{PendingDocUpdate, WorkspaceDb, WorkspaceDbTableName},
};
use blocksuite_playground_doc::session::PageDocSession;

use crate::{
    ClientError, ClientResult, blob_ingest::IngestedBlobRecord, host::HostKind,
    session::WorkspaceSession,
};

/// Native SQLite WAL workspace store bound to a single `<spaceId>.db`.
pub struct SqliteWorkspaceStore {
    space_id: String,
    storage: SqliteDocStorage,
}

impl SqliteWorkspaceStore {
    /// Open or create `<base_dir>/workspaces/<space_type>/<peer>/<space_id>.db` in WAL mode and
    /// apply the 5-step schema migrations.
    pub async fn open(
        base_dir: &Path,
        space_type: &str,
        peer: &str,
        space_id: &str,
    ) -> ClientResult<Self> {
        let db_path = resolve_workspace_db_path(base_dir, space_type, peer, space_id)?;
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| ClientError::Store(format!("creating workspace dir: {e}")))?;
        }
        let storage = SqliteDocStorage::new(db_path.to_string_lossy().to_string());
        storage.connect().await?;
        storage.set_space_id(space_id).await?;
        Ok(Self {
            space_id: space_id.to_string(),
            storage,
        })
    }

    /// Open an existing `.db` / `.affine` SQLite workspace file in strict read-only mode
    /// (`read_only(true)`): zero migrations, zero WAL creation, and zero compaction writeback.
    pub async fn open_existing_file(db_path: &Path) -> ClientResult<Self> {
        let storage = SqliteDocStorage::open_read_only(db_path.to_string_lossy().to_string());
        let space_id = storage.get_space_id().await?.ok_or_else(|| {
            ClientError::Store("workspace SQLite file has no stored space_id".into())
        })?;
        Ok(Self { space_id, storage })
    }

    /// Open an isolated in-memory SQLite store for deterministic tests.
    pub async fn open_in_memory(space_id: &str) -> ClientResult<Self> {
        let storage = SqliteDocStorage::new(":memory:");
        storage.connect().await?;
        storage.set_space_id(space_id).await?;
        Ok(Self {
            space_id: space_id.to_string(),
            storage,
        })
    }

    pub fn space_id(&self) -> &str {
        &self.space_id
    }

    pub fn storage(&self) -> &SqliteDocStorage {
        &self.storage
    }

    /// Load or initialize a [`WorkspaceSession`] from the persisted root document and `db$*` tables.
    pub async fn load_workspace_session(
        &self,
        user_id: &str,
        client_id: u64,
        host_kind: HostKind,
        server_id: &str,
        base_url: &str,
        now_ms: i64,
    ) -> ClientResult<WorkspaceSession> {
        let db = if let Some(root_rec) = self.storage.get_doc(&self.space_id).await? {
            let props = self.storage.get_doc("db$docProperties").await?;
            let folders = self.storage.get_doc("db$folders").await?;
            let mut tables: Vec<(WorkspaceDbTableName, &[u8])> = Vec::new();
            if let Some(ref p) = props {
                tables.push((WorkspaceDbTableName::DocProperties, p.bin.as_slice()));
            }
            if let Some(ref f) = folders {
                tables.push((WorkspaceDbTableName::Folders, f.bin.as_slice()));
            }
            WorkspaceDb::from_root_update_v1(
                &self.space_id,
                user_id,
                client_id,
                &root_rec.bin,
                &tables,
            )?
        } else if self.storage.is_read_only() {
            return Err(ClientError::Store(
                "read-only workspace SQLite file has no root document".into(),
            ));
        } else {
            let mut fresh = WorkspaceDb::new(&self.space_id, user_id, client_id);
            fresh.initialize_meta()?;
            let init_updates = fresh.drain_pending_updates();
            if !init_updates.is_empty() {
                self.storage
                    .push_updates_batch(&init_updates, None, now_ms)
                    .await?;
            }
            fresh
        };

        let mut session = WorkspaceSession::from_workspace_db(
            db, client_id, host_kind, server_id, base_url, now_ms,
        )?;
        let pages = session
            .directory()
            .lock_directory()
            .db()
            .root()
            .list_pages()
            .map_err(|e| ClientError::Store(e.to_string()))?;
        for page_meta in pages {
            if let Some(page) = self.load_doc_session(&page_meta.id, client_id).await? {
                session.register_loaded_doc(page_meta.id, page);
            }
        }
        Ok(session)
    }

    /// Atomically persist a batch of pending CRDT updates in one `BEGIN IMMEDIATE` WAL transaction.
    pub async fn persist_pending_updates(
        &self,
        updates: &[PendingDocUpdate],
        peer: Option<&str>,
        now_ms: i64,
    ) -> ClientResult<usize> {
        let committed = self
            .storage
            .push_updates_batch(updates, peer, now_ms)
            .await?;
        Ok(committed.len())
    }

    /// Persist a single incremental CRDT update for `doc_id` into `updates` + `clocks`.
    pub async fn persist_doc_update(
        &self,
        doc_id: &str,
        update_v1: &[u8],
        now_ms: i64,
    ) -> ClientResult<()> {
        self.storage.push_update(doc_id, update_v1, now_ms).await?;
        Ok(())
    }

    /// Load and compact a single document's CRDT state into a live [`PageDocSession`].
    pub async fn load_doc_session(
        &self,
        doc_id: &str,
        client_id: u64,
    ) -> ClientResult<Option<PageDocSession>> {
        let Some(rec) = self.storage.get_doc(doc_id).await? else {
            return Ok(None);
        };
        let mut page = PageDocSession::new(doc_id, client_id)
            .map_err(|e| ClientError::Store(e.to_string()))?;
        if !rec.bin.is_empty() && rec.bin != [0, 0] {
            page.apply_remote_update_v1(&rec.bin)
                .map_err(|e| ClientError::Store(e.to_string()))?;
            if page.inner().client_required() {
                page.inner_mut()
                    .set_client(blocksuite_playground_doc::random_client_id());
            }
        }
        Ok(Some(page))
    }

    /// Persist an ingested blob into `blobs` and register an un-uploaded queue row in `peer_blob_sync`.
    pub async fn persist_ingested_blob(
        &self,
        peer: &str,
        record: &IngestedBlobRecord,
        bytes: &[u8],
    ) -> ClientResult<()> {
        self.storage
            .set_blob(SetBlob {
                key: record.key.clone(),
                data: bytes.to_vec(),
                mime: record.mime_type.clone(),
            })
            .await?;
        self.storage
            .set_blob_uploaded_at(peer, &record.key, None)
            .await?;
        Ok(())
    }

    pub async fn get_blob(&self, key: &str) -> ClientResult<Option<BlobRecord>> {
        Ok(self.storage.get_blob(key).await?)
    }

    pub async fn pending_blob_uploads(&self, peer: &str) -> ClientResult<Vec<ListedBlob>> {
        Ok(self.storage.list_pending_blob_uploads(peer).await?)
    }

    pub async fn mark_blob_uploaded(
        &self,
        peer: &str,
        blob_key: &str,
        uploaded_at_ms: i64,
    ) -> ClientResult<()> {
        self.storage
            .set_blob_uploaded_at(peer, blob_key, Some(millis_to_naive_utc(uploaded_at_ms)))
            .await?;
        Ok(())
    }

    pub async fn checkpoint(&self) -> ClientResult<()> {
        self.storage.checkpoint().await?;
        Ok(())
    }

    pub async fn close(&self) {
        self.storage.close().await;
    }
}
