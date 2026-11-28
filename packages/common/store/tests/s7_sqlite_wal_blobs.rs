//! Deterministic native SQLite WAL tests for multi-document persistence, content-addressed
//! blob ingestion (`compute_blob_key` + `detect_image_dimensions`), upload queue tracking
//! (`list_pending_blob_uploads`), and WAL checkpoint reload.

#![cfg(not(target_family = "wasm"))]

use affine_store::{
    blob_api::{compute_blob_key, detect_image_dimensions},
    directory::{CreateDocId, CreateDocRequest, DocMode, WorkspaceDirectory},
    sqlite::{SetBlob, SqliteDocStorage, millis_to_naive_utc, resolve_workspace_db_path},
    workspace_db::{WorkspaceDb, WorkspaceDbTableName},
};

fn minimal_png_bytes(width: u32, height: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity(24);
    out.extend_from_slice(b"\x89PNG\r\n\x1a\n");
    out.extend_from_slice(&13u32.to_be_bytes());
    out.extend_from_slice(b"IHDR");
    out.extend_from_slice(&width.to_be_bytes());
    out.extend_from_slice(&height.to_be_bytes());
    out
}

#[tokio::test]
async fn sqlite_wal_persists_multi_doc_updates_and_blob_upload_queue_across_reload() {
    let base_dir = std::env::temp_dir().join(format!("affine-s7-wal-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base_dir);
    std::fs::create_dir_all(&base_dir).unwrap();

    let space_id = "ws-s7-mobile";
    let db_path = resolve_workspace_db_path(&base_dir, "workspace", "local", space_id).unwrap();
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    let db_path_str = db_path.to_string_lossy().to_string();

    {
        let storage = SqliteDocStorage::new(&db_path_str);
        storage.connect().await.unwrap();
        storage.set_space_id(space_id).await.unwrap();

        let mut db = WorkspaceDb::new(space_id, "u-darksky", 1);
        db.initialize_meta().unwrap();
        let mut dir = WorkspaceDirectory::new(db);
        let d1 = dir
            .create_doc(CreateDocRequest {
                id: CreateDocId::from_op("s7-doc-1").unwrap(),
                title: "Architecture Notes".into(),
                mode: DocMode::Page,
                now_ms: 10_000,
            })
            .unwrap();
        let d2 = dir
            .create_doc(CreateDocRequest {
                id: CreateDocId::from_op("s7-doc-2").unwrap(),
                title: "Sync Design".into(),
                mode: DocMode::Page,
                now_ms: 10_500,
            })
            .unwrap();
        assert_ne!(d1.doc_id, d2.doc_id);

        let batch = dir.drain_pending_updates();
        storage
            .push_updates_batch(&batch, Some("cloud"), 11_000)
            .await
            .unwrap();

        // Ingest an image blob and a PDF attachment blob into `blobs` + `peer_blob_sync`.
        let png = minimal_png_bytes(1280, 720);
        assert_eq!(detect_image_dimensions(&png), Some((1280, 720)));
        let png_key = compute_blob_key(&png);
        let pdf = b"%PDF-1.7 sample attachment payload".to_vec();
        let pdf_key = compute_blob_key(&pdf);
        assert_ne!(png_key, pdf_key);

        storage
            .set_blob(SetBlob {
                key: png_key.clone(),
                data: png.clone(),
                mime: "image/png".into(),
            })
            .await
            .unwrap();
        storage
            .set_blob_uploaded_at("cloud", &png_key, None)
            .await
            .unwrap();

        storage
            .set_blob(SetBlob {
                key: pdf_key.clone(),
                data: pdf.clone(),
                mime: "application/pdf".into(),
            })
            .await
            .unwrap();
        storage
            .set_blob_uploaded_at("cloud", &pdf_key, None)
            .await
            .unwrap();

        let pending = storage.list_pending_blob_uploads("cloud").await.unwrap();
        assert_eq!(pending.len(), 2);

        // Mark PNG uploaded; only PDF remains queued.
        storage
            .set_blob_uploaded_at("cloud", &png_key, Some(millis_to_naive_utc(12_000)))
            .await
            .unwrap();
        let remaining = storage.list_pending_blob_uploads("cloud").await.unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].key, pdf_key);

        storage.checkpoint().await.unwrap();
        storage.close().await;
    }

    // Reopen the exact same `<spaceId>.db` and verify both docs and blob upload state survived.
    let reopened = SqliteDocStorage::new(&db_path_str);
    reopened.connect().await.unwrap();
    let root_rec = reopened.get_doc(space_id).await.unwrap().unwrap();
    let props_rec = reopened.get_doc("db$docProperties").await.unwrap();
    let mut tables = Vec::new();
    if let Some(ref p) = props_rec {
        tables.push((WorkspaceDbTableName::DocProperties, p.bin.as_slice()));
    }
    let reloaded_db =
        WorkspaceDb::from_root_update_v1(space_id, "u-darksky", 2, &root_rec.bin, &tables).unwrap();
    let pages = reloaded_db.root().list_pages().unwrap();
    assert_eq!(pages.len(), 2);
    assert_eq!(reopened.list_blobs().await.unwrap().len(), 2);
    assert_eq!(
        reopened
            .list_pending_blob_uploads("cloud")
            .await
            .unwrap()
            .len(),
        1
    );
    reopened.close().await;
    let _ = std::fs::remove_dir_all(&base_dir);
}

#[tokio::test]
async fn sqlite_readonly_open_is_byte_identical_zero_wal_writeback() {
    let base_dir = std::env::temp_dir().join(format!("affine-s7-ro-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base_dir);
    std::fs::create_dir_all(&base_dir).unwrap();
    let db_path = base_dir.join("readonly-check.db");
    let db_path_str = db_path.to_string_lossy().to_string();

    {
        let rw = SqliteDocStorage::new(&db_path_str);
        rw.connect().await.unwrap();
        rw.set_space_id("ws-ro").await.unwrap();
        let mut db = WorkspaceDb::new("ws-ro", "u-ro", 1);
        db.initialize_meta().unwrap();
        let mut dir = WorkspaceDirectory::new(db);
        let _ = dir
            .create_doc(CreateDocRequest {
                id: CreateDocId::from_op("ro-doc-1").unwrap(),
                title: "Readonly Verification".into(),
                mode: DocMode::Page,
                now_ms: 10_000,
            })
            .unwrap();
        let batch = dir.drain_pending_updates();
        rw.push_updates_batch(&batch, None, 10_100).await.unwrap();
        // Leave updates uncompacted, checkpoint WAL into main file, and close cleanly.
        rw.checkpoint().await.unwrap();
        rw.close().await;
    }
    let wal_path = format!("{db_path_str}-wal");
    let shm_path = format!("{db_path_str}-shm");
    let _ = std::fs::remove_file(&wal_path);
    let _ = std::fs::remove_file(&shm_path);

    let before_hash = compute_blob_key(&std::fs::read(&db_path).unwrap());

    // Strict read-only open: zero migrations, zero WAL creation, zero compaction writeback.
    let ro = SqliteDocStorage::open_read_only(&db_path_str);
    assert!(ro.is_read_only());
    assert_eq!(ro.get_space_id().await.unwrap().as_deref(), Some("ws-ro"));
    let root_rec = ro.get_doc_readonly("ws-ro").await.unwrap().unwrap();
    let props_rec = ro.get_doc_readonly("db$docProperties").await.unwrap();
    let mut tables = Vec::new();
    if let Some(ref p) = props_rec {
        tables.push((WorkspaceDbTableName::DocProperties, p.bin.as_slice()));
    }
    let ws_db =
        WorkspaceDb::from_root_update_v1("ws-ro", "u-ro", 2, &root_rec.bin, &tables).unwrap();
    assert_eq!(ws_db.root().list_pages().unwrap().len(), 1);
    ro.close().await;

    let after_hash = compute_blob_key(&std::fs::read(&db_path).unwrap());
    assert_eq!(
        before_hash, after_hash,
        "read-only open must leave SQLite file byte-identical (SHA-256 unchanged)"
    );
    assert!(
        !std::path::Path::new(&wal_path).exists(),
        "read-only open must not create -wal file"
    );
    assert!(
        !std::path::Path::new(&shm_path).exists(),
        "read-only open must not create -shm file"
    );
    let _ = std::fs::remove_dir_all(&base_dir);
}

#[tokio::test]
async fn s7_real_sqlite_corpus_readonly_smoke() {
    let Ok(src_path) = std::env::var("AFFINE_TEST_CORPUS_DB") else {
        return;
    };
    let tmp_dir =
        std::env::temp_dir().join(format!("affine-s7-corpus-smoke-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&tmp_dir);
    std::fs::create_dir_all(&tmp_dir).unwrap();
    let copy_path = tmp_dir.join("workspace.db");
    std::fs::copy(&src_path, &copy_path).expect("copy corpus sqlite file");
    let before_sha256 = compute_blob_key(&std::fs::read(&copy_path).unwrap());

    let storage = SqliteDocStorage::open_read_only(copy_path.to_string_lossy().to_string());
    assert!(storage.is_read_only());
    let space_id = storage
        .get_space_id()
        .await
        .unwrap()
        .expect("corpus must contain space_id");
    let before_clocks = storage.get_doc_clocks(None).await.unwrap();
    let before_blobs = storage.list_blobs().await.unwrap();

    let root_rec = storage
        .get_doc_readonly(&space_id)
        .await
        .unwrap()
        .expect("corpus must contain root doc");
    let props_rec = storage.get_doc_readonly("db$docProperties").await.unwrap();
    let folders_rec = storage.get_doc_readonly("db$folders").await.unwrap();
    let mut tables = Vec::new();
    if let Some(ref p) = props_rec {
        tables.push((WorkspaceDbTableName::DocProperties, p.bin.as_slice()));
    }
    if let Some(ref f) = folders_rec {
        tables.push((WorkspaceDbTableName::Folders, f.bin.as_slice()));
    }
    let ws_db =
        WorkspaceDb::from_root_update_v1(&space_id, "local-user", 1001, &root_rec.bin, &tables)
            .expect("parse real workspace root + db$ tables");
    let pages = ws_db.root().list_pages().unwrap();
    let folders: Vec<affine_store::workspace_db::FolderRow> = ws_db
        .db_table(WorkspaceDbTableName::Folders)
        .map(|t| t.list_rows().unwrap())
        .unwrap_or_default();
    let doc_props: Vec<affine_store::workspace_db::DocPropertiesRow> = ws_db
        .db_table(WorkspaceDbTableName::DocProperties)
        .map(|t| t.list_rows().unwrap())
        .unwrap_or_default();
    let journal_count = doc_props
        .iter()
        .filter(|p| p.journal.as_deref().is_some_and(|j| !j.is_empty()))
        .count();
    assert!(!pages.is_empty(), "expected non-empty pages in real corpus");
    assert!(
        ws_db
            .db_table(WorkspaceDbTableName::DocProperties)
            .is_none_or(|t| !t.has_local_writeback().unwrap()),
        "read-only open must have 0 local writeback on db$docProperties"
    );

    let mut readable_docs = 0usize;
    let mut doc_bytes_total = 0usize;
    for page in pages.iter().take(50) {
        if let Some(rec) = storage.get_doc_readonly(&page.id).await.unwrap() {
            readable_docs += 1;
            doc_bytes_total += rec.bin.len();
        }
    }
    assert!(
        readable_docs > 0,
        "expected readable subdocs in real corpus"
    );

    // Verify missing local blobs return Ok(None) cleanly without panicking or queuing uploads.
    let missing = storage
        .get_blob("nonexistent-missing-blob-key")
        .await
        .unwrap();
    assert!(missing.is_none());

    // Verify 0 writeback: doc clock count and timestamps remain identical.
    let after_clocks = storage.get_doc_clocks(None).await.unwrap();
    assert_eq!(before_clocks.len(), after_clocks.len());
    for (b, a) in before_clocks.iter().zip(after_clocks.iter()) {
        assert_eq!(b.doc_id, a.doc_id);
        assert_eq!(b.timestamp, a.timestamp);
    }

    // Sanitized aggregate metrics only — zero titles, text, or workspace/doc IDs.
    eprintln!(
        "CORPUS_SMOKE_OK pages={} folders={} doc_props={} journals={} readable_sample={} sample_bytes={} blobs_present={} clocks={} writeback=0",
        pages.len(),
        folders.len(),
        doc_props.len(),
        journal_count,
        readable_docs,
        doc_bytes_total,
        before_blobs.len(),
        after_clocks.len(),
    );

    storage.close().await;
    let after_sha256 = compute_blob_key(&std::fs::read(&copy_path).unwrap());
    assert_eq!(
        before_sha256, after_sha256,
        "real corpus SQLite file must remain byte-identical (SHA-256 unchanged)"
    );
    assert!(
        !tmp_dir.join("workspace.db-wal").exists(),
        "real corpus read-only smoke must not create -wal file"
    );
    assert!(
        !tmp_dir.join("workspace.db-shm").exists(),
        "real corpus read-only smoke must not create -shm file"
    );
    let _ = std::fs::remove_dir_all(&tmp_dir);
}
