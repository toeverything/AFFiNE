//! Single-transaction atomic SQLite share-ingest coordinator for iOS `ShareExtension`.
//!
//! Eliminates memory/SQLite dual-write splits by persisting attachment blobs (`blobs`),
//! the Yjs V1 CRDT document update (`updates` + `clocks`), and an idempotency receipt
//! (`share_ingest_receipts`) inside one `BEGIN IMMEDIATE ... COMMIT` transaction.

use std::time::Duration;

use affine_store::sqlite::millis_to_naive_utc;
use blocksuite_playground_doc::{
    schema::{BlockSpec, ParagraphType},
    session::PageDocSession,
};
use serde::{Deserialize, Serialize};
use sqlx::{
    Connection, Row, SqliteConnection,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous},
};

use crate::workspace_store::{IosWorkspaceHandle, SQLITE_BUSY_TIMEOUT_MS, WorkspaceStoreError};

/// Canonical App Group identifier shared between the iOS app and ShareExtension.
pub const IOS_APP_GROUP_ID: &str = "group.app.affine.pro";

/// Supported ShareExtension payload kinds matching `ShareInboxContentKind`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SharePayloadKind {
    Url,
    Text,
    Image,
    Pdf,
}

/// Metadata for one attachment slice inside the contiguous `blob_bytes` buffer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShareIngestAttachmentSpec {
    pub blob_key: String,
    pub file_name: String,
    pub mime_type: String,
    pub byte_offset: usize,
    pub byte_len: usize,
}

/// Request payload serialized across the C ABI into `IosWorkspaceHandle::ingest_share_item`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShareIngestRequest {
    pub share_id: String,
    pub doc_id: String,
    pub kind: SharePayloadKind,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub text_or_url: String,
    #[serde(default)]
    pub attachments: Vec<ShareIngestAttachmentSpec>,
    pub client_id: u64,
    pub now_ms: i64,
}

/// Result returned from the atomic SQLite share-ingest transaction.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShareIngestOutcome {
    pub already_committed: bool,
    pub doc_id: String,
    pub inserted_text: String,
    pub blob_keys: Vec<String>,
}

fn format_share_block_text(req: &ShareIngestRequest, blob_keys: &[String]) -> String {
    let title = req.title.trim();
    match req.kind {
        SharePayloadKind::Url => {
            let url = req.text_or_url.trim();
            if title.is_empty() {
                url.to_string()
            } else {
                format!("[{title}]({url})")
            }
        }
        SharePayloadKind::Text => req.text_or_url.trim().to_string(),
        SharePayloadKind::Image | SharePayloadKind::Pdf => {
            let mut lines = Vec::with_capacity(blob_keys.len());
            for (idx, blob_key) in blob_keys.iter().enumerate() {
                let file_name = req
                    .attachments
                    .get(idx)
                    .map(|a| a.file_name.trim())
                    .unwrap_or("");
                let alt = if !title.is_empty() {
                    title
                } else if !file_name.is_empty() {
                    file_name
                } else {
                    "shared-attachment"
                };
                lines.push(format!("![{alt}](blob:{blob_key})"));
            }
            lines.join("\n")
        }
    }
}

fn validate_request<'a>(
    req: &'a ShareIngestRequest,
    blob_bytes: &'a [u8],
) -> Result<Vec<(&'a ShareIngestAttachmentSpec, &'a [u8])>, WorkspaceStoreError> {
    if req.share_id.trim().is_empty() {
        return Err(WorkspaceStoreError::InvalidSharePayload(
            "share_id must be non-empty".into(),
        ));
    }
    if req.doc_id.trim().is_empty() {
        return Err(WorkspaceStoreError::InvalidSharePayload(
            "doc_id must be non-empty".into(),
        ));
    }

    let mut slices = Vec::with_capacity(req.attachments.len());
    for att in &req.attachments {
        if att.blob_key.trim().is_empty() {
            return Err(WorkspaceStoreError::InvalidSharePayload(
                "attachment blob_key must be non-empty".into(),
            ));
        }
        let end = att.byte_offset.checked_add(att.byte_len).ok_or_else(|| {
            WorkspaceStoreError::InvalidSharePayload("attachment slice overflow".into())
        })?;
        if end > blob_bytes.len() || att.byte_len == 0 {
            return Err(WorkspaceStoreError::InvalidSharePayload(
                "attachment byte slice out of bounds or empty".into(),
            ));
        }
        slices.push((att, &blob_bytes[att.byte_offset..end]));
    }

    match req.kind {
        SharePayloadKind::Url => {
            let url = req.text_or_url.trim();
            if !(url.starts_with("https://") || url.starts_with("http://")) {
                return Err(WorkspaceStoreError::InvalidSharePayload(
                    "share url must use http(s) scheme".into(),
                ));
            }
        }
        SharePayloadKind::Text => {
            if req.text_or_url.trim().is_empty() {
                return Err(WorkspaceStoreError::InvalidSharePayload(
                    "share text must be non-empty".into(),
                ));
            }
        }
        SharePayloadKind::Image | SharePayloadKind::Pdf => {
            if slices.is_empty() {
                return Err(WorkspaceStoreError::InvalidSharePayload(
                    "image/pdf share item requires at least one attachment blob".into(),
                ));
            }
        }
    }

    Ok(slices)
}

impl IosWorkspaceHandle {
    /// Read a non-deleted attachment blob by key from the workspace SQLite `blobs` table.
    pub fn read_blob(&self, key: &str) -> Result<Option<Vec<u8>>, WorkspaceStoreError> {
        let record = self.runtime.block_on(self.storage.get_blob(key))?;
        Ok(record.map(|r| r.data))
    }

    /// Atomically ingest one ShareExtension item into SQLite (`blobs` + `updates` + `clocks` +
    /// `share_ingest_receipts`) inside a single `BEGIN IMMEDIATE ... COMMIT` transaction.
    ///
    /// If `req.share_id` already exists in `share_ingest_receipts`, returns
    /// `already_committed = true` without writing duplicate blocks or blobs.
    pub fn ingest_share_item(
        &self,
        req: &ShareIngestRequest,
        blob_bytes: &[u8],
    ) -> Result<ShareIngestOutcome, WorkspaceStoreError> {
        if self.storage.is_closed() {
            return Err(WorkspaceStoreError::Database(
                "workspace storage is closed".into(),
            ));
        }
        let attachment_slices = validate_request(req, blob_bytes)?;

        let db_path = self.db_path.clone();
        self.runtime.block_on(async move {
            let opts = SqliteConnectOptions::new()
                .filename(&db_path)
                .foreign_keys(true)
                .synchronous(SqliteSynchronous::Full)
                .journal_mode(SqliteJournalMode::Wal)
                .busy_timeout(Duration::from_millis(SQLITE_BUSY_TIMEOUT_MS));
            let mut conn = SqliteConnection::connect_with(&opts)
                .await
                .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;

            sqlx::query(
                "CREATE TABLE IF NOT EXISTS share_ingest_receipts (\
                 share_id TEXT PRIMARY KEY NOT NULL,\
                 doc_id TEXT NOT NULL,\
                 committed_at INTEGER NOT NULL\
                 );",
            )
            .execute(&mut conn)
            .await
            .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;

            sqlx::query("BEGIN IMMEDIATE;")
                .execute(&mut conn)
                .await
                .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;

            let tx_result = run_share_ingest_tx(&mut conn, req, &attachment_slices).await;

            match tx_result {
                Ok(outcome) => {
                    sqlx::query("COMMIT;")
                        .execute(&mut conn)
                        .await
                        .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;
                    let _ = conn.close().await;
                    Ok(outcome)
                }
                Err(err) => {
                    let _ = sqlx::query("ROLLBACK;").execute(&mut conn).await;
                    let _ = conn.close().await;
                    Err(err)
                }
            }
        })
    }
}

fn derive_share_client_id(base_client_id: u64, share_id: &str, existing_updates: usize) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325 ^ base_client_id;
    for byte in share_id.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash ^= existing_updates as u64;
    hash = hash.wrapping_mul(0x100000001b3);
    // Keep within JS Yjs 32-bit unsigned non-zero clientID range (1..=u32::MAX).
    let id = (hash & 0xffff_ffff) as u32;
    u64::from(if id == 0 { 1 } else { id })
}

async fn run_share_ingest_tx(
    conn: &mut SqliteConnection,
    req: &ShareIngestRequest,
    attachment_slices: &[(&ShareIngestAttachmentSpec, &[u8])],
) -> Result<ShareIngestOutcome, WorkspaceStoreError> {
    if let Some(row) = sqlx::query("SELECT doc_id FROM share_ingest_receipts WHERE share_id = $1;")
        .bind(&req.share_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?
    {
        let existing_doc_id: String = row
            .try_get("doc_id")
            .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;
        return Ok(ShareIngestOutcome {
            already_committed: true,
            doc_id: existing_doc_id,
            inserted_text: String::new(),
            blob_keys: Vec::new(),
        });
    }

    let mut blob_keys = Vec::with_capacity(attachment_slices.len());
    for &(spec, data) in attachment_slices {
        sqlx::query(
            "INSERT INTO blobs (key, data, mime, size) VALUES ($1, $2, $3, $4) \
             ON CONFLICT(key) DO UPDATE SET data = $2, mime = $3, size = $4, deleted_at = NULL;",
        )
        .bind(&spec.blob_key)
        .bind(data)
        .bind(&spec.mime_type)
        .bind(data.len() as i64)
        .execute(&mut *conn)
        .await
        .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;
        blob_keys.push(spec.blob_key.clone());
    }

    let snapshot_row = sqlx::query("SELECT data FROM snapshots WHERE doc_id = $1;")
        .bind(&req.doc_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;
    let update_rows =
        sqlx::query("SELECT data FROM updates WHERE doc_id = $1 ORDER BY created_at;")
            .bind(&req.doc_id)
            .fetch_all(&mut *conn)
            .await
            .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;

    let is_new_doc = snapshot_row.is_none() && update_rows.is_empty();
    let session_client_id = derive_share_client_id(req.client_id, &req.share_id, update_rows.len());
    let mut session = PageDocSession::new(&req.doc_id, session_client_id)?;
    if let Some(row) = snapshot_row {
        let bin: Vec<u8> = row
            .try_get("data")
            .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;
        if !bin.is_empty() && bin != [0, 0] {
            session.apply_remote_update_v1(&bin)?;
        }
    }
    for row in update_rows {
        let bin: Vec<u8> = row
            .try_get("data")
            .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;
        if !bin.is_empty() && bin != [0, 0] {
            session.apply_remote_update_v1(&bin)?;
        }
    }

    let sv_before = if is_new_doc {
        Vec::new()
    } else {
        session.encode_state_vector_v1()?
    };

    let now_u64 = req.now_ms.max(0) as u64;
    let note_id = if is_new_doc {
        let page_title = if req.title.trim().is_empty() {
            req.doc_id.clone()
        } else {
            req.title.trim().to_string()
        };
        session.add_block(
            "page-1",
            BlockSpec::Page { title: page_title },
            None,
            None,
            now_u64,
        )?;
        session.add_block(
            "note-1",
            BlockSpec::Note {
                xywh: Some("[0,0,800,600]".into()),
            },
            Some("page-1"),
            None,
            now_u64.saturating_add(1),
        )?;
        "note-1".to_string()
    } else {
        let snap = session.read_page_snapshot()?;
        let existing_note = snap
            .root
            .iter()
            .chain(snap.detached.iter())
            .flat_map(blocksuite_playground_doc::read::BlockNode::walk)
            .find(|n| n.flavour == "affine:note")
            .map(|n| n.id.clone());
        if let Some(id) = existing_note {
            id
        } else {
            let root_id = snap
                .root
                .as_ref()
                .map(|r| r.id.clone())
                .unwrap_or_else(|| "page-1".to_string());
            if snap.root.is_none() {
                session.add_block(
                    &root_id,
                    BlockSpec::Page {
                        title: req.doc_id.clone(),
                    },
                    None,
                    None,
                    now_u64,
                )?;
            }
            session.add_block(
                "note-1",
                BlockSpec::Note {
                    xywh: Some("[0,0,800,600]".into()),
                },
                Some(&root_id),
                None,
                now_u64.saturating_add(1),
            )?;
            "note-1".to_string()
        }
    };

    let inserted_text = format_share_block_text(req, &blob_keys);
    let block_id = format!("share-{}", req.share_id);
    session.add_block(
        &block_id,
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: inserted_text.clone(),
        },
        Some(&note_id),
        None,
        now_u64.saturating_add(2),
    )?;

    let delta = if is_new_doc {
        session.encode_update_v1()?
    } else {
        session.encode_diff_v1(&sv_before)?
    };

    let base_ts = millis_to_naive_utc(req.now_ms);
    let existing_clock: Option<chrono::NaiveDateTime> =
        sqlx::query("SELECT timestamp FROM clocks WHERE doc_id = $1;")
            .bind(&req.doc_id)
            .fetch_optional(&mut *conn)
            .await
            .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?
            .map(|row| row.try_get("timestamp"))
            .transpose()
            .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;
    let effective_ts = match existing_clock {
        Some(clock_ts) if clock_ts >= base_ts => clock_ts + chrono::Duration::milliseconds(1),
        _ => base_ts,
    };

    sqlx::query("INSERT INTO updates (doc_id, data, created_at) VALUES ($1, $2, $3);")
        .bind(&req.doc_id)
        .bind(&delta)
        .bind(effective_ts)
        .execute(&mut *conn)
        .await
        .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;

    sqlx::query(
        "INSERT INTO clocks (doc_id, timestamp) VALUES ($1, $2) \
         ON CONFLICT(doc_id) DO UPDATE SET timestamp = MAX(clocks.timestamp, excluded.timestamp);",
    )
    .bind(&req.doc_id)
    .bind(effective_ts)
    .execute(&mut *conn)
    .await
    .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;

    sqlx::query(
        "INSERT INTO share_ingest_receipts (share_id, doc_id, committed_at) VALUES ($1, $2, $3);",
    )
    .bind(&req.share_id)
    .bind(&req.doc_id)
    .bind(req.now_ms)
    .execute(&mut *conn)
    .await
    .map_err(|e| WorkspaceStoreError::Database(e.to_string()))?;

    Ok(ShareIngestOutcome {
        already_committed: false,
        doc_id: req.doc_id.clone(),
        inserted_text,
        blob_keys,
    })
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn unique_temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "affine-ios-share-ingest-{label}-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn atomic_share_ingest_persists_blob_and_doc_and_dedupes_on_retry() {
        let docs = unique_temp_dir("atomic");
        let allowlist = vec!["ws-share".to_string()];
        let ws =
            IosWorkspaceHandle::open(&docs, "workspace", "local", "ws-share", Some(&allowlist))
                .unwrap();

        let pdf_bytes = b"%PDF-1.4\n";
        assert_eq!(pdf_bytes.len(), 9);
        let req = ShareIngestRequest {
            share_id: "item-pdf-1".into(),
            doc_id: "doc-shared-1".into(),
            kind: SharePayloadKind::Pdf,
            title: "Spec PDF".into(),
            text_or_url: String::new(),
            attachments: vec![ShareIngestAttachmentSpec {
                blob_key: "share-item-pdf-1-x.pdf".into(),
                file_name: "x.pdf".into(),
                mime_type: "application/pdf".into(),
                byte_offset: 0,
                byte_len: pdf_bytes.len(),
            }],
            client_id: 7,
            now_ms: 1_795_880_000_000,
        };

        let first = ws.ingest_share_item(&req, pdf_bytes).unwrap();
        assert!(!first.already_committed);
        assert_eq!(first.blob_keys, vec!["share-item-pdf-1-x.pdf"]);
        assert!(first.inserted_text.contains("blob:share-item-pdf-1-x.pdf"));

        // Second & third distinct items into the SAME doc_id with the same client_id & timestamp.
        let url_req = ShareIngestRequest {
            share_id: "item-url-2".into(),
            doc_id: "doc-shared-1".into(),
            kind: SharePayloadKind::Url,
            title: "AFFiNE".into(),
            text_or_url: "https://affine.pro".into(),
            attachments: Vec::new(),
            client_id: 7,
            now_ms: 1_795_880_000_000,
        };
        let second = ws.ingest_share_item(&url_req, &[]).unwrap();
        assert!(!second.already_committed);
        assert!(second.inserted_text.contains("https://affine.pro"));

        let text_req = ShareIngestRequest {
            share_id: "item-text-3".into(),
            doc_id: "doc-shared-1".into(),
            kind: SharePayloadKind::Text,
            title: "Note".into(),
            text_or_url: "Third shared item".into(),
            attachments: Vec::new(),
            client_id: 7,
            now_ms: 1_795_880_000_000,
        };
        let third = ws.ingest_share_item(&text_req, &[]).unwrap();
        assert!(!third.already_committed);
        assert_eq!(third.inserted_text, "Third shared item");

        // Retry after simulated checkpoint failure / crash MUST hit share_ingest_receipts
        // and avoid inserting any duplicate paragraph into doc-shared-1.
        let retry = ws.ingest_share_item(&req, pdf_bytes).unwrap();
        assert!(retry.already_committed);
        assert!(retry.inserted_text.is_empty());

        ws.checkpoint().unwrap();
        ws.close();

        // Reopen workspace from disk and verify exact 9-byte blob + all 3 paragraph blocks.
        let reopened =
            IosWorkspaceHandle::open(&docs, "workspace", "local", "ws-share", Some(&allowlist))
                .unwrap();
        let stored_blob = reopened
            .read_blob("share-item-pdf-1-x.pdf")
            .unwrap()
            .expect("blob must persist in SQLite blobs table");
        assert_eq!(stored_blob, pdf_bytes);

        let snap = reopened
            .read_page_snapshot_json("doc-shared-1", 7)
            .unwrap()
            .expect("doc snapshot must exist");
        assert_eq!(
            snap.matches("blob:share-item-pdf-1-x.pdf").count(),
            1,
            "retry must not duplicate block text: {snap}"
        );
        assert!(snap.contains("https://affine.pro"), "missing url: {snap}");
        assert!(snap.contains("Third shared item"), "missing text: {snap}");
        reopened.close();
        let _ = std::fs::remove_dir_all(&docs);
    }

    #[test]
    fn rejects_invalid_url_scheme_without_writing_receipt() {
        let docs = unique_temp_dir("bad-url");
        let allowlist = vec!["ws-share".to_string()];
        let ws =
            IosWorkspaceHandle::open(&docs, "workspace", "local", "ws-share", Some(&allowlist))
                .unwrap();

        let req = ShareIngestRequest {
            share_id: "bad-url-1".into(),
            doc_id: "doc-shared-1".into(),
            kind: SharePayloadKind::Url,
            title: "Bad".into(),
            text_or_url: "javascript:alert(1)".into(),
            attachments: Vec::new(),
            client_id: 1,
            now_ms: 1_795_880_000_000,
        };
        assert!(ws.ingest_share_item(&req, &[]).is_err());
        assert!(ws.read_doc_binary("doc-shared-1").unwrap().is_none());
        ws.close();
        let _ = std::fs::remove_dir_all(&docs);
    }
}
