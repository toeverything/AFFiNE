use std::path::{Path, PathBuf};

use affine_store::{
    StoreError,
    sqlite::{
        SqliteDocStorage, millis_to_naive_utc, naive_utc_to_millis,
        resolve_allowlisted_workspace_paths, resolve_workspace_db_path,
    },
    workspace_db::PendingDocUpdate,
};
use blocksuite_playground_doc::{
    DocError,
    read::{BlockContent, BlockNode, PageSnapshot},
    session::PageDocSession,
};
use serde::Serialize;
use thiserror::Error;
use tokio::runtime::{Builder, Runtime};

/// Explicit SQLite busy timeout (milliseconds) configured on every opened iOS host connection.
pub const SQLITE_BUSY_TIMEOUT_MS: u64 = 5_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PageSnapshotDto<'a> {
    doc_id: &'a str,
    title: &'a str,
    block_count: usize,
    blocks: Vec<BlockSummaryDto<'a>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlockSummaryDto<'a> {
    id: &'a str,
    flavour: &'a str,
    text: Option<&'a str>,
    child_ids: Vec<&'a str>,
}

fn block_plain_text(node: &BlockNode) -> Option<&str> {
    match &node.content {
        BlockContent::Page { title } => Some(title.plain.as_str()),
        BlockContent::Paragraph { text, .. } => Some(text.plain.as_str()),
        BlockContent::List { text, .. } => Some(text.plain.as_str()),
        BlockContent::Code { text, .. } => Some(text.as_str()),
        _ => None,
    }
}

fn serialize_page_snapshot(snapshot: &PageSnapshot) -> Result<String, serde_json::Error> {
    let blocks: Vec<BlockSummaryDto<'_>> = snapshot
        .root
        .iter()
        .chain(snapshot.detached.iter())
        .flat_map(BlockNode::walk)
        .map(|node| BlockSummaryDto {
            id: node.id.as_str(),
            flavour: node.flavour.as_str(),
            text: block_plain_text(node),
            child_ids: node.children.iter().map(|c| c.id.as_str()).collect(),
        })
        .collect();
    let dto = PageSnapshotDto {
        doc_id: snapshot.doc_id.as_str(),
        title: snapshot.title(),
        block_count: snapshot.block_count(),
        blocks,
    };
    serde_json::to_string(&dto)
}

#[derive(Debug, Error)]
pub enum WorkspaceStoreError {
    #[error("storage error: {0}")]
    Store(#[from] StoreError),
    #[error("document CRDT error: {0}")]
    Doc(#[from] DocError),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("local workspace {0:?} requires an explicit affine-local-workspace allowlist entry")]
    WorkspaceNotAllowlisted(String),
}

/// Persisted result of an offline paragraph edit on an in-place SQLite WAL database.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfflineEditResult {
    pub update_bytes: Vec<u8>,
    pub state_vector: Vec<u8>,
    pub timestamp_ms: i64,
}

/// Exported document diff ready for outbound sync against a remote peer state vector.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportedDocDiff {
    pub doc_id: String,
    pub missing: Vec<u8>,
    pub state: Vec<u8>,
    pub timestamp_ms: i64,
}

/// Resolve the 0.27.5-compatible in-place SQLite path:
/// `<documents_dir>/workspaces/<space_type>/<sanitized_peer>/<space_id>.db`.
pub fn resolve_ios_space_db_path(
    documents_dir: &Path,
    space_type: &str,
    peer: &str,
    space_id: &str,
) -> Result<PathBuf, WorkspaceStoreError> {
    Ok(resolve_workspace_db_path(
        documents_dir,
        space_type,
        peer,
        space_id,
    )?)
}

/// Resolve paths for an explicit `affine-local-workspace` allowlist without scanning disk.
///
/// Enforces invariant F1: deleted workspaces whose `.db` files remain on disk are never
/// discovered or resurrected.
pub fn resolve_allowlisted_local_workspaces(
    documents_dir: &Path,
    allowlisted_ids: &[String],
) -> Result<Vec<(String, PathBuf)>, WorkspaceStoreError> {
    let refs: Vec<&str> = allowlisted_ids.iter().map(String::as_str).collect();
    Ok(resolve_allowlisted_workspace_paths(
        documents_dir,
        "workspace",
        "local",
        &refs,
    )?)
}

/// Handle to an opened 0.27.5-compatible in-place SQLite WAL workspace or userspace database.
pub struct IosWorkspaceHandle {
    storage: SqliteDocStorage,
    runtime: Runtime,
    space_id: String,
    db_path: PathBuf,
}

impl IosWorkspaceHandle {
    /// Open an existing or new SQLite WAL database in place under `<documents_dir>/workspaces/...`.
    ///
    /// Fail-closed invariant F1: when `space_type == "workspace"` and `peer == "local"`,
    /// `allowlisted_local_ids` MUST be `Some(ids)` containing `space_id` before any
    /// directory creation or SQLite file open happens.
    pub fn open(
        documents_dir: &Path,
        space_type: &str,
        peer: &str,
        space_id: &str,
        allowlisted_local_ids: Option<&[String]>,
    ) -> Result<Self, WorkspaceStoreError> {
        if space_type == "workspace" && peer == "local" {
            let allowed = allowlisted_local_ids
                .map(|allowlist| allowlist.iter().any(|id| id == space_id))
                .unwrap_or(false);
            if !allowed {
                return Err(WorkspaceStoreError::WorkspaceNotAllowlisted(
                    space_id.to_string(),
                ));
            }
        }

        let db_path = resolve_ios_space_db_path(documents_dir, space_type, peer, space_id)?;
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let runtime = Builder::new_current_thread().enable_all().build()?;
        let path_str = db_path.to_string_lossy().into_owned();
        let storage = runtime.block_on(async {
            let storage = SqliteDocStorage::new(path_str);
            storage.connect().await?;
            storage.set_space_id(space_id).await?;
            Ok::<SqliteDocStorage, WorkspaceStoreError>(storage)
        })?;

        Ok(Self {
            storage,
            runtime,
            space_id: space_id.to_string(),
            db_path,
        })
    }

    pub fn space_id(&self) -> &str {
        &self.space_id
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    /// Read and compact the stored Yjs V1 document binary for `doc_id`.
    pub fn read_doc_binary(&self, doc_id: &str) -> Result<Option<Vec<u8>>, WorkspaceStoreError> {
        let record = self.runtime.block_on(self.storage.get_doc(doc_id))?;
        Ok(record.map(|r| r.bin))
    }

    /// Decode `doc_id` through `PageDocSession` and serialize its typed `PageSnapshot` as JSON.
    pub fn read_page_snapshot_json(
        &self,
        doc_id: &str,
        client_id: u64,
    ) -> Result<Option<String>, WorkspaceStoreError> {
        let Some(bin) = self.read_doc_binary(doc_id)? else {
            return Ok(None);
        };
        let mut session = PageDocSession::new(doc_id, client_id)?;
        session.apply_remote_update_v1(&bin)?;
        let snapshot = session.read_page_snapshot()?;
        Ok(Some(serialize_page_snapshot(&snapshot)?))
    }

    /// Edit a paragraph/block `prop:text` offline (single character or range replacement)
    /// and persist the resulting CRDT delta atomically via `push_updates_batch` (`BEGIN IMMEDIATE`).
    pub fn edit_paragraph_text(
        &self,
        doc_id: &str,
        block_id: &str,
        utf16_index: u64,
        delete_len: u64,
        insert_text: &str,
        client_id: u64,
        now_ms: i64,
    ) -> Result<OfflineEditResult, WorkspaceStoreError> {
        let mut session = PageDocSession::new(doc_id, client_id)?;
        if let Some(existing) = self.read_doc_binary(doc_id)? {
            session.apply_remote_update_v1(&existing)?;
        }

        let sv_before = session.encode_state_vector_v1()?;
        let now_u64 = now_ms.max(0) as u64;
        if delete_len > 0 {
            session.remove_text(block_id, "prop:text", utf16_index, delete_len, now_u64)?;
        }
        if !insert_text.is_empty() {
            session.insert_text(block_id, "prop:text", utf16_index, insert_text, now_u64)?;
        }

        let delta = session.encode_diff_v1(&sv_before)?;
        let state_vector = session.encode_state_vector_v1()?;
        let batch = [PendingDocUpdate {
            doc_id: doc_id.to_string(),
            update: delta.clone(),
        }];
        let committed = self
            .runtime
            .block_on(self.storage.push_updates_batch(&batch, None, now_ms))?;
        let timestamp_ms = committed
            .first()
            .map(|(_, ts)| naive_utc_to_millis(*ts))
            .unwrap_or(now_ms);

        Ok(OfflineEditResult {
            update_bytes: delta,
            state_vector,
            timestamp_ms,
        })
    }

    /// Compute the pending diff and state vector for `doc_id` against an optional remote state vector.
    pub fn export_pending_diff(
        &self,
        doc_id: &str,
        remote_state_vector: Option<&[u8]>,
    ) -> Result<Option<ExportedDocDiff>, WorkspaceStoreError> {
        let diff = self
            .runtime
            .block_on(self.storage.get_doc_diff(doc_id, remote_state_vector))?;
        Ok(diff.map(|d| ExportedDocDiff {
            doc_id: d.doc_id,
            missing: d.missing,
            state: d.state,
            timestamp_ms: naive_utc_to_millis(d.timestamp),
        }))
    }

    /// Persist a remote V1 update atomically via `push_updates_batch` using `local_now_ms`,
    /// advance `peer_clocks` using the authoritative server `remote_clock_ms`, and return
    /// the compacted merged document binary.
    pub fn apply_remote_update(
        &self,
        doc_id: &str,
        update_bytes: &[u8],
        peer: &str,
        remote_clock_ms: i64,
        local_now_ms: i64,
    ) -> Result<Vec<u8>, WorkspaceStoreError> {
        let batch = [PendingDocUpdate {
            doc_id: doc_id.to_string(),
            update: update_bytes.to_vec(),
        }];
        let merged = self.runtime.block_on(async {
            self.storage
                .push_updates_batch(&batch, None, local_now_ms)
                .await?;
            let remote_clock = millis_to_naive_utc(remote_clock_ms);
            self.storage
                .set_peer_remote_clock(peer, doc_id, remote_clock)
                .await?;
            self.storage
                .set_peer_pulled_remote_clock(peer, doc_id, remote_clock)
                .await?;
            let record = self.storage.get_doc(doc_id).await?;
            Ok::<Option<Vec<u8>>, StoreError>(record.map(|r| r.bin))
        })?;
        Ok(merged.unwrap_or_default())
    }

    /// Run a non-blocking `PRAGMA wal_checkpoint(PASSIVE);` suitable for iOS background transitions.
    pub fn checkpoint_passive(&self) -> Result<(), WorkspaceStoreError> {
        let _ = self.runtime.block_on(self.storage.checkpoint_passive())?;
        Ok(())
    }

    /// Flush the SQLite WAL journal into the main database file (`FULL`).
    pub fn checkpoint(&self) -> Result<(), WorkspaceStoreError> {
        self.runtime.block_on(self.storage.checkpoint())?;
        Ok(())
    }

    /// Close the underlying SQLite connection pool cleanly.
    pub fn close(self) {
        let Self {
            storage, runtime, ..
        } = self;
        runtime.block_on(storage.close());
        drop(storage);
        drop(runtime);
    }
}

#[cfg(test)]
mod tests {
    use blocksuite_playground_doc::schema::{BlockSpec, ParagraphType};
    use sqlx::{Connection, sqlite::SqliteConnectOptions};

    use super::*;

    fn unique_temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "affine-ios-s2-{label}-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn seed_page_with_paragraph(doc_id: &str, client_id: u64, text: &str) -> Vec<u8> {
        let mut session = PageDocSession::new(doc_id, client_id).unwrap();
        session
            .add_block(
                "page-1",
                BlockSpec::Page {
                    title: "iOS S2 Spec".into(),
                },
                None,
                None,
                1_000,
            )
            .unwrap();
        session
            .add_block(
                "note-1",
                BlockSpec::Note {
                    xywh: Some("[0,0,800,600]".into()),
                },
                Some("page-1"),
                None,
                1_001,
            )
            .unwrap();
        session
            .add_block(
                "para-1",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: text.into(),
                },
                Some("note-1"),
                None,
                1_002,
            )
            .unwrap();
        session.encode_update_v1().unwrap()
    }

    #[test]
    fn f1_allowlist_fail_closed_blocks_missing_and_unlisted_local_workspaces() {
        let docs = unique_temp_dir("f1");
        let alive_path =
            resolve_ios_space_db_path(&docs, "workspace", "local", "ws-alive").unwrap();
        let deleted_path =
            resolve_ios_space_db_path(&docs, "workspace", "local", "ws-deleted").unwrap();
        std::fs::create_dir_all(alive_path.parent().unwrap()).unwrap();
        std::fs::write(&alive_path, b"").unwrap();
        std::fs::write(&deleted_path, b"").unwrap();

        let allowlist = vec!["ws-alive".to_string()];
        let mounted = resolve_allowlisted_local_workspaces(&docs, &allowlist).unwrap();
        assert_eq!(mounted, vec![("ws-alive".to_string(), alive_path)]);

        // Local workspace without allowlist (None) MUST fail closed before touching disk.
        let err_none = IosWorkspaceHandle::open(&docs, "workspace", "local", "ws-alive", None)
            .err()
            .unwrap();
        assert!(matches!(
            err_none,
            WorkspaceStoreError::WorkspaceNotAllowlisted(id) if id == "ws-alive"
        ));

        // Attempting to open the deleted workspace DB must be rejected under allowlist enforcement.
        let err =
            IosWorkspaceHandle::open(&docs, "workspace", "local", "ws-deleted", Some(&allowlist))
                .err()
                .unwrap();
        assert!(
            matches!(err, WorkspaceStoreError::WorkspaceNotAllowlisted(id) if id == "ws-deleted")
        );

        // Userspace and cloud SQLite DBs do not require local allowlist.
        let userspace_ws = IosWorkspaceHandle::open(
            &docs,
            "userspace",
            "https://app.affine.pro",
            "user-42",
            None,
        )
        .unwrap();
        assert_eq!(
            userspace_ws.db_path(),
            docs.join("workspaces/userspace/https_app.affine.pro/user-42.db")
        );
        userspace_ws.close();

        let _ = std::fs::remove_dir_all(&docs);
    }

    #[test]
    fn offline_edit_split_remote_clock_and_passive_checkpoint_with_concurrent_reader() {
        let docs = unique_temp_dir("offline-sync");
        let allowlist = vec!["ws-ios-1".to_string()];

        let ws =
            IosWorkspaceHandle::open(&docs, "workspace", "local", "ws-ios-1", Some(&allowlist))
                .unwrap();
        let initial_bin = seed_page_with_paragraph("doc-1", 10, "Hello iOS");
        ws.apply_remote_update("doc-1", &initial_bin, "seed", 9_000, 10_000)
            .unwrap();

        let mut remote_peer = PageDocSession::new("doc-1", 20).unwrap();
        remote_peer.apply_remote_update_v1(&initial_bin).unwrap();
        let remote_sv_before = remote_peer.encode_state_vector_v1().unwrap();

        let edit = ws
            .edit_paragraph_text("doc-1", "para-1", 9, 0, "!", 11, 11_000)
            .unwrap();
        assert!(!edit.update_bytes.is_empty());

        let diff = ws
            .export_pending_diff("doc-1", Some(&remote_sv_before))
            .unwrap()
            .unwrap();
        assert!(!diff.missing.is_empty());
        remote_peer.apply_remote_update_v1(&diff.missing).unwrap();

        let sv_remote = remote_peer.encode_state_vector_v1().unwrap();
        remote_peer
            .insert_text("para-1", "prop:text", 10, " Sync", 12_000)
            .unwrap();
        let remote_delta = remote_peer.encode_diff_v1(&sv_remote).unwrap();

        // Device clock (99_000) is ahead of authoritative server remote clock (12_500).
        let merged = ws
            .apply_remote_update("doc-1", &remote_delta, "cloud", 12_500, 99_000)
            .unwrap();
        assert!(!merged.is_empty());

        // Verify peer_clocks recorded remote_clock_ms (12_500), not local_now_ms (99_000).
        let recorded_remote = ws
            .runtime
            .block_on(ws.storage.get_peer_remote_clock("cloud", "doc-1"))
            .unwrap()
            .unwrap();
        assert_eq!(naive_utc_to_millis(recorded_remote.timestamp), 12_500);

        // Open an uncommitted concurrent read transaction and verify PASSIVE checkpoint does not block.
        let mut reader = ws.runtime.block_on(async {
            let mut conn = sqlx::SqliteConnection::connect_with(
                &SqliteConnectOptions::new().filename(ws.db_path()),
            )
            .await
            .unwrap();
            sqlx::query("BEGIN;").execute(&mut conn).await.unwrap();
            let _ = sqlx::query("SELECT COUNT(*) FROM meta;")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            conn
        });
        ws.checkpoint_passive().unwrap();
        ws.runtime.block_on(async {
            sqlx::query("COMMIT;").execute(&mut reader).await.unwrap();
            reader.close().await.unwrap();
        });

        ws.checkpoint().unwrap();
        ws.close();

        let reopened =
            IosWorkspaceHandle::open(&docs, "workspace", "local", "ws-ios-1", Some(&allowlist))
                .unwrap();
        let snapshot_json = reopened
            .read_page_snapshot_json("doc-1", 30)
            .unwrap()
            .unwrap();
        assert!(
            snapshot_json.contains("Hello iOS! Sync"),
            "snapshot_json={snapshot_json}"
        );
        reopened.close();

        let _ = std::fs::remove_dir_all(&docs);
    }
}
