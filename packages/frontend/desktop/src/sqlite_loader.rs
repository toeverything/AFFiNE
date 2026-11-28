//! In-place `.affine` / `<spaceId>.db` SQLite workspace loader with lazy per-document
//! CRDT hydration and zero writeback on read-only inspection.

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{OnceLock, mpsc},
};

use affine_client::{FolderForestCache, LinkGraph, WeightedSearchEngine};
use affine_store::{
    directory::{DocMode, WorkspaceDirectory},
    sqlite::SqliteDocStorage,
    workspace_db::{DocPropertiesRow, FolderRow, WorkspaceDb, WorkspaceDbTableName},
};
use anyhow::{Context as _, Result};
use blocksuite_playground_doc::{random_client_id, read::BlockContent, session::PageDocSession};

use crate::doc_store::{
    DesktopCollection, DesktopDocMeta, DesktopDocStore, DesktopWorkspace, LiveDocEntry,
    WorkspaceKind,
};

type WorkspaceOpenPayload = (
    String,
    Vec<u8>,
    Vec<(WorkspaceDbTableName, Vec<u8>)>,
    Vec<affine_store::sqlite::DocClock>,
    usize,
);

enum SqliteWorkerReq {
    OpenWorkspace {
        path: PathBuf,
        reply: mpsc::Sender<Result<WorkspaceOpenPayload>>,
    },
    LoadDoc {
        path: PathBuf,
        doc_id: String,
        reply: mpsc::Sender<Result<Option<Vec<u8>>>>,
    },
}

fn is_readonly_shm_open_error(err: &anyhow::Error) -> bool {
    let msg = format!("{err:#}").to_ascii_lowercase();
    msg.contains("readonly")
        || msg.contains("read-only")
        || msg.contains("unable to open database file")
        || msg.contains("permission denied")
}

/// Strict whitelist for `immutable=1` fallback on read-only directories without `-shm`.
///
/// Only returns `true` when the canonical database's `-wal` sidecar is proven absent (`NotFound`)
/// or zero-length; any non-empty WAL or metadata error (`PermissionDenied`, I/O error) returns
/// `false` so uncheckpointed WAL writes are never silently ignored.
fn can_safely_fallback_to_immutable(canonical_db_path: &Path) -> bool {
    let mut wal_os = canonical_db_path.as_os_str().to_os_string();
    wal_os.push("-wal");
    match std::fs::metadata(PathBuf::from(wal_os)) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => true,
        Ok(m) if m.len() == 0 => true,
        _ => false,
    }
}

async fn read_workspace_snapshot(storage: &SqliteDocStorage) -> Result<WorkspaceOpenPayload> {
    let tables_ok = storage.validate_required_tables().await?;
    anyhow::ensure!(
        tables_ok,
        "SQLite workspace is missing required AFFiNE tables"
    );
    let clocks = storage.get_doc_clocks(None).await?;
    let blobs = storage.list_blobs().await.unwrap_or_default();

    let mut root_id: Option<String> = None;
    let mut root_bytes: Vec<u8> = Vec::new();
    for clock in &clocks {
        if clock.doc_id.starts_with("db$") || clock.doc_id.starts_with("userdata$") {
            continue;
        }
        if let Some(rec) = storage.get_doc_readonly(&clock.doc_id).await?
            && looks_like_workspace_root(&rec.bin, &clock.doc_id)
        {
            root_id = Some(clock.doc_id.clone());
            root_bytes = rec.bin;
            break;
        }
    }
    let space_id = root_id.unwrap_or_else(|| "sqlite-workspace".to_string());

    let mut db_tables: Vec<(WorkspaceDbTableName, Vec<u8>)> = Vec::new();
    for table in [
        WorkspaceDbTableName::Folders,
        WorkspaceDbTableName::DocProperties,
        WorkspaceDbTableName::DocCustomPropertyInfo,
    ] {
        if let Some(rec) = storage.get_doc_readonly(table.as_str()).await?
            && !rec.bin.is_empty()
        {
            db_tables.push((table, rec.bin));
        }
    }
    Ok((space_id, root_bytes, db_tables, clocks, blobs.len()))
}

/// Dedicated single-thread background Tokio worker for read-only SQLite access.
///
/// Opens a fresh read-only [`SqliteDocStorage`] per request (never caching pools across opens)
/// and closes it before returning so live external WAL writes are always observed immediately.
/// Falls back to `immutable=1` only when a read-only directory prevents SQLite from opening `-shm`.
fn sqlite_worker() -> &'static mpsc::Sender<SqliteWorkerReq> {
    static TX: OnceLock<mpsc::Sender<SqliteWorkerReq>> = OnceLock::new();
    TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<SqliteWorkerReq>();
        std::thread::Builder::new()
            .name("affine-desktop-sqlite-ro".into())
            .spawn(move || {
                let Ok(rt) = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                else {
                    return;
                };
                while let Ok(req) = rx.recv() {
                    match req {
                        SqliteWorkerReq::OpenWorkspace { path, reply } => {
                            let res = rt.block_on(async {
                                let canonical_path = std::fs::canonicalize(&path).with_context(
                                    || format!("canonicalizing SQLite path `{}`", path.display()),
                                )?;
                                let path_str = canonical_path.to_string_lossy().into_owned();
                                let storage = SqliteDocStorage::new_read_only(path_str.clone());
                                let attempt = read_workspace_snapshot(&storage).await;
                                storage.close().await;
                                match attempt {
                                    Ok(ok) => Ok(ok),
                                    Err(err) if is_readonly_shm_open_error(&err) => {
                                        if !can_safely_fallback_to_immutable(&canonical_path) {
                                            return Err(err.context(
                                                "refusing lossy immutable=1 fallback: WAL sidecar is non-empty or cannot be proven absent",
                                            ));
                                        }
                                        let imm =
                                            SqliteDocStorage::new_read_only_immutable(path_str);
                                        let fallback = read_workspace_snapshot(&imm).await;
                                        imm.close().await;
                                        fallback
                                    }
                                    Err(err) => Err(err),
                                }
                            });
                            let _ = reply.send(res);
                        }
                        SqliteWorkerReq::LoadDoc {
                            path,
                            doc_id,
                            reply,
                        } => {
                            let res = rt.block_on(async {
                                let canonical_path = std::fs::canonicalize(&path).with_context(
                                    || format!("canonicalizing SQLite path `{}`", path.display()),
                                )?;
                                let path_str = canonical_path.to_string_lossy().into_owned();
                                let storage = SqliteDocStorage::new_read_only(path_str.clone());
                                let attempt = storage
                                    .get_doc_readonly(&doc_id)
                                    .await
                                    .map(|r| r.map(|rec| rec.bin))
                                    .map_err(anyhow::Error::from);
                                storage.close().await;
                                match attempt {
                                    Ok(ok) => Ok(ok),
                                    Err(err) if is_readonly_shm_open_error(&err) => {
                                        if !can_safely_fallback_to_immutable(&canonical_path) {
                                            return Err(err.context(
                                                "refusing lossy immutable=1 fallback: WAL sidecar is non-empty or cannot be proven absent",
                                            ));
                                        }
                                        let imm =
                                            SqliteDocStorage::new_read_only_immutable(path_str);
                                        let fallback = imm
                                            .get_doc_readonly(&doc_id)
                                            .await
                                            .map(|r| r.map(|rec| rec.bin))
                                            .map_err(anyhow::Error::from);
                                        imm.close().await;
                                        fallback
                                    }
                                    Err(err) => Err(err),
                                }
                            });
                            let _ = reply.send(res);
                        }
                    }
                }
            })
            .expect("spawn affine-desktop-sqlite-ro worker thread");
        tx
    })
}

/// Backing handle for on-demand lazy CRDT hydration from an on-disk SQLite workspace file.
#[derive(Clone, Debug)]
pub struct SqliteLazyBacking {
    pub path: PathBuf,
    pub space_id: String,
    pub blob_count: usize,
}

impl SqliteLazyBacking {
    /// Read and merge one document's `snapshots` + `updates` from SQLite without writing back.
    pub fn load_doc_update(&self, doc_id: &str) -> Result<Option<Vec<u8>>> {
        let (reply_tx, reply_rx) = mpsc::channel();
        sqlite_worker()
            .send(SqliteWorkerReq::LoadDoc {
                path: self.path.clone(),
                doc_id: doc_id.to_string(),
                reply: reply_tx,
            })
            .map_err(|_| anyhow::anyhow!("sqlite read-only worker channel closed"))?;
        reply_rx
            .recv()
            .context("receiving sqlite doc hydration reply")?
    }
}

/// Summary metrics produced when opening a real SQLite workspace (strictly privacy-safe counts).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SqliteLoadStats {
    pub total_docs: usize,
    pub visible_docs: usize,
    pub trashed_docs: usize,
    pub journal_docs: usize,
    pub favorite_docs: usize,
    pub folder_rows: usize,
    pub blob_count: usize,
    pub pending_writebacks: usize,
}

/// Open an existing 5-step-migrated `.affine` / `<spaceId>.db` SQLite workspace in place
/// with zero CRDT writeback and lazy per-document hydration.
pub fn open_sqlite_workspace(path: impl AsRef<Path>) -> Result<(DesktopDocStore, SqliteLoadStats)> {
    let path = std::fs::canonicalize(path.as_ref()).with_context(|| {
        format!(
            "canonicalizing SQLite workspace path `{}`",
            path.as_ref().display()
        )
    })?;
    let (reply_tx, reply_rx) = mpsc::channel();
    sqlite_worker()
        .send(SqliteWorkerReq::OpenWorkspace {
            path: path.clone(),
            reply: reply_tx,
        })
        .map_err(|_| anyhow::anyhow!("sqlite read-only worker channel closed"))?;
    let (space_id, root_bytes, db_tables, clocks, blob_count) = reply_rx
        .recv()
        .context("receiving sqlite workspace open reply")??;

    let client_id = random_client_id();
    let table_refs: Vec<(WorkspaceDbTableName, &[u8])> =
        db_tables.iter().map(|(t, b)| (*t, b.as_slice())).collect();

    let db = if !root_bytes.is_empty() {
        WorkspaceDb::from_root_update_v1(
            space_id.clone(),
            "local-user",
            client_id,
            &root_bytes,
            &table_refs,
        )
        .unwrap_or_else(|_| WorkspaceDb::new(space_id.clone(), "local-user", client_id))
    } else {
        WorkspaceDb::new(space_id.clone(), "local-user", client_id)
    };
    let pending_writebacks = db.pending_updates().len();

    let folder_rows: Vec<FolderRow> = db
        .db_table(WorkspaceDbTableName::Folders)
        .and_then(|table| table.list_rows::<FolderRow>().ok())
        .unwrap_or_default();
    let doc_props: Vec<DocPropertiesRow> = db
        .db_table(WorkspaceDbTableName::DocProperties)
        .and_then(|table| table.list_rows::<DocPropertiesRow>().ok())
        .unwrap_or_default();
    let props_by_id: BTreeMap<String, DocPropertiesRow> =
        doc_props.into_iter().map(|p| (p.id.clone(), p)).collect();
    let root_pages = db.root().list_pages().unwrap_or_default();
    let directory = WorkspaceDirectory::new(db);

    let mut docs = BTreeMap::new();
    for page in &root_pages {
        let props = props_by_id.get(&page.id);
        let default_mode = DocMode::from_wire(props.and_then(|p| p.primary_mode.as_deref()));
        let journal_date = props
            .and_then(|p| p.journal.clone())
            .filter(|s| !s.is_empty());
        let trashed = page.trashed;
        let updated_at_ms = page.updated_date_ms.unwrap_or(page.create_date_ms);
        let meta = DesktopDocMeta {
            id: page.id.clone(),
            title: if page.title.trim().is_empty() {
                "Untitled".to_string()
            } else {
                page.title.clone()
            },
            summary: String::new(),
            default_mode,
            tags: page.tags.clone(),
            is_favorite: false,
            trashed,
            journal_date,
            updated_at_ms,
            outgoing_refs: Vec::new(),
        };
        let session = PageDocSession::new(&page.id, client_id)?;
        let snapshot = session.read_page_snapshot()?;
        docs.insert(
            page.id.clone(),
            LiveDocEntry {
                meta,
                session,
                note_id: String::new(),
                surface_id: String::new(),
                snapshot,
                revision: 0,
                hydrated: false,
            },
        );
    }

    // Also register any standalone doc clocks not yet in `meta.pages`.
    for clock in &clocks {
        if clock.doc_id == space_id
            || clock.doc_id.starts_with("db$")
            || clock.doc_id.starts_with("userdata$")
            || docs.contains_key(&clock.doc_id)
        {
            continue;
        }
        let session = PageDocSession::new(&clock.doc_id, client_id)?;
        let snapshot = session.read_page_snapshot()?;
        docs.insert(
            clock.doc_id.clone(),
            LiveDocEntry {
                meta: DesktopDocMeta {
                    id: clock.doc_id.clone(),
                    title: "Untitled".to_string(),
                    summary: String::new(),
                    default_mode: DocMode::Page,
                    tags: Vec::new(),
                    is_favorite: false,
                    trashed: false,
                    journal_date: None,
                    updated_at_ms: clock.timestamp.and_utc().timestamp_millis(),
                    outgoing_refs: Vec::new(),
                },
                session,
                note_id: String::new(),
                surface_id: String::new(),
                snapshot,
                revision: 0,
                hydrated: false,
            },
        );
    }

    let mut store = DesktopDocStore {
        workspaces: vec![DesktopWorkspace {
            id: space_id.clone(),
            name: "Local SQLite Workspace".to_string(),
            kind: WorkspaceKind::Local,
            synced: true,
        }],
        active_workspace_idx: 0,
        directory,
        docs,
        folder_rows,
        folder_cache: FolderForestCache::default(),
        collections: vec![DesktopCollection {
            id: "col-edgeless".into(),
            name: "Whiteboards".into(),
            rules: vec![affine_client::domain::CollectionRule::ModeIs(
                "edgeless".into(),
            )],
        }],
        tag_colors: BTreeMap::new(),
        link_graph: LinkGraph::default(),
        search_engine: WeightedSearchEngine::default(),
        next_seq: 1000,
        env_rev: 1,
        workspace_buckets: BTreeMap::new(),
        sqlite_backing: Some(SqliteLazyBacking {
            path,
            space_id,
            blob_count,
        }),
    };
    store.rebuild_derived();

    let stats = SqliteLoadStats {
        total_docs: store.docs.len(),
        visible_docs: store.visible_docs().len(),
        trashed_docs: store.trashed_docs().len(),
        journal_docs: store.journal_docs().len(),
        favorite_docs: store.favorite_docs().len(),
        folder_rows: store.folder_rows.len(),
        blob_count,
        pending_writebacks,
    };
    Ok((store, stats))
}

/// Extract a brief plain-text summary from a hydrated `PageSnapshot`.
pub(crate) fn extract_snapshot_summary(
    snapshot: &blocksuite_playground_doc::read::PageSnapshot,
) -> String {
    let Some(root) = &snapshot.root else {
        return String::new();
    };
    for node in root.walk() {
        match &node.content {
            BlockContent::Paragraph { text, .. } | BlockContent::List { text, .. } => {
                let t = text.plain.trim();
                if !t.is_empty() {
                    return t.chars().take(120).collect();
                }
            }
            _ => {}
        }
    }
    String::new()
}

fn looks_like_workspace_root(update: &[u8], doc_id: &str) -> bool {
    if update.is_empty() {
        return false;
    }
    let client_id = random_client_id();
    WorkspaceDb::from_root_update_v1(doc_id, "probe", client_id, update, &[])
        .ok()
        .and_then(|db| db.root().list_pages().ok())
        .is_some_and(|pages| !pages.is_empty())
}

#[cfg(test)]
mod tests {
    use affine_store::workspace_db::PageIdSource;
    use blocksuite_playground_doc::schema::{BlockSpec, ParagraphType};

    use super::*;

    fn sha256_file(path: &Path) -> Option<String> {
        let bytes = std::fs::read(path).ok()?;
        Some(
            crate::draft_store::ContentHash::of_bytes(&bytes)
                .as_str()
                .to_string(),
        )
    }

    #[test]
    fn reopen_observes_external_wal_writes_with_zero_loader_writeback() {
        let temp_dir = std::env::temp_dir().join("affine-desktop-sqlite-wal-reopen-test");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();
        let db_path = temp_dir.join("live-wal.affine");
        let db_str = db_path.to_string_lossy().into_owned();

        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        // 1. Seed initial workspace with doc-1, checkpoint, and close so no -wal remains.
        let mut ws_db = WorkspaceDb::new("ws-wal-test", "local-user", random_client_id());
        ws_db.initialize_meta().unwrap();
        ws_db
            .create_page(
                PageIdSource::Explicit("doc-1"),
                "Initial Doc",
                1_764_360_000,
            )
            .unwrap();
        let mut doc1 = PageDocSession::new("doc-1", random_client_id()).unwrap();
        doc1.add_block(
            "r1",
            BlockSpec::Page {
                title: "Initial Doc".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        doc1.add_block("n1", BlockSpec::Note { xywh: None }, Some("r1"), None, 2)
            .unwrap();
        doc1.add_block(
            "p1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "v1".into(),
            },
            Some("n1"),
            None,
            3,
        )
        .unwrap();
        rt.block_on(async {
            let writer = SqliteDocStorage::new(db_str.clone());
            writer.connect().await.unwrap();
            writer
                .push_update(
                    "ws-wal-test",
                    ws_db.root().encode_update_v1().unwrap(),
                    1_764_360_000,
                )
                .await
                .unwrap();
            writer
                .push_update("doc-1", doc1.encode_update_v1().unwrap(), 1_764_360_001)
                .await
                .unwrap();
            writer.checkpoint().await.unwrap();
            writer.close().await;
        });

        // 2. First desktop read-only open (before external WAL write).
        let (store1, stats1) = open_sqlite_workspace(&db_path).unwrap();
        assert_eq!(stats1.pending_writebacks, 0);
        assert!(store1.get_doc("doc-1").is_some());
        assert!(store1.get_doc("doc-2").is_none());

        // 3. External writer opens the same file in WAL mode and writes doc-2 WITHOUT checkpointing.
        ws_db
            .create_page(
                PageIdSource::Explicit("doc-2"),
                "WAL Fresh Doc",
                1_764_360_500,
            )
            .unwrap();
        let mut doc2 = PageDocSession::new("doc-2", random_client_id()).unwrap();
        doc2.add_block(
            "r2",
            BlockSpec::Page {
                title: "WAL Fresh Doc".into(),
            },
            None,
            None,
            4,
        )
        .unwrap();
        doc2.add_block("n2", BlockSpec::Note { xywh: None }, Some("r2"), None, 5)
            .unwrap();
        doc2.add_block(
            "p2",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "written-in-wal".into(),
            },
            Some("n2"),
            None,
            6,
        )
        .unwrap();
        let ext_writer = rt.block_on(async {
            let writer = SqliteDocStorage::new(db_str.clone());
            writer
                .push_update(
                    "ws-wal-test",
                    ws_db.root().encode_update_v1().unwrap(),
                    1_764_360_500,
                )
                .await
                .unwrap();
            writer
                .push_update("doc-2", doc2.encode_update_v1().unwrap(), 1_764_360_501)
                .await
                .unwrap();
            writer
        });
        let wal_path = PathBuf::from(format!("{db_str}-wal"));
        let db_hash_before = sha256_file(&db_path);
        let wal_hash_before = sha256_file(&wal_path);

        // 4. Desktop re-opens the same path — must see doc-2 from live WAL with 0 writeback.
        let (mut store2, stats2) = open_sqlite_workspace(&db_path).unwrap();
        assert_eq!(stats2.pending_writebacks, 0);
        assert!(
            store2.get_doc("doc-2").is_some(),
            "reopen must observe doc-2 written into live WAL"
        );
        assert!(store2.ensure_doc_hydrated("doc-2").unwrap());
        let snap2 = &store2.get_doc("doc-2").unwrap().snapshot;
        let p2_text = match &snap2.block("p2").unwrap().content {
            BlockContent::Paragraph { text, .. } => text.plain.as_str(),
            other => panic!("expected paragraph, got {other:?}"),
        };
        assert_eq!(p2_text, "written-in-wal");
        assert_eq!(
            sha256_file(&db_path),
            db_hash_before,
            "read-only desktop loader must not mutate main .affine file"
        );
        assert_eq!(
            sha256_file(&wal_path),
            wal_hash_before,
            "read-only desktop loader must not mutate -wal file"
        );

        rt.block_on(async {
            ext_writer.close().await;
        });
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[cfg(unix)]
    #[test]
    fn readonly_dir_rejects_non_empty_wal_without_shm_and_allows_clean_immutable_read() {
        use std::os::unix::fs::PermissionsExt as _;

        let temp_dir = std::env::temp_dir().join("affine-desktop-sqlite-ro-wal-guard-test");
        if temp_dir.exists() {
            let _ = std::fs::set_permissions(&temp_dir, std::fs::Permissions::from_mode(0o755));
            for sub in ["ro-with-wal", "ro-clean"] {
                let p = temp_dir.join(sub);
                if p.exists() {
                    let _ = std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755));
                }
            }
            let _ = std::fs::remove_dir_all(&temp_dir);
        }
        std::fs::create_dir_all(&temp_dir).unwrap();
        let src_db = temp_dir.join("src.affine");
        let src_str = src_db.to_string_lossy().into_owned();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        // 1. Create checkpointed base DB containing doc-1.
        let mut ws_db = WorkspaceDb::new("ws-ro-guard", "local-user", random_client_id());
        ws_db.initialize_meta().unwrap();
        ws_db
            .create_page(PageIdSource::Explicit("doc-1"), "Base Doc", 1_764_361_000)
            .unwrap();
        let mut doc1 = PageDocSession::new("doc-1", random_client_id()).unwrap();
        doc1.add_block(
            "r1",
            BlockSpec::Page {
                title: "Base Doc".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        rt.block_on(async {
            let writer = SqliteDocStorage::new(src_str.clone());
            writer.connect().await.unwrap();
            writer
                .push_update(
                    "ws-ro-guard",
                    ws_db.root().encode_update_v1().unwrap(),
                    1_764_361_000,
                )
                .await
                .unwrap();
            writer
                .push_update("doc-1", doc1.encode_update_v1().unwrap(), 1_764_361_001)
                .await
                .unwrap();
            writer.checkpoint().await.unwrap();
            writer.close().await;
        });

        // 2. Copy clean checkpointed DB (no -wal) into a read-only directory (0o555)
        //    and point a symlink from a writable directory to it.
        let ro_clean_dir = temp_dir.join("ro-clean");
        std::fs::create_dir_all(&ro_clean_dir).unwrap();
        let ro_clean_db = ro_clean_dir.join("clean.affine");
        std::fs::copy(&src_db, &ro_clean_db).unwrap();
        let ro_clean_symlink = temp_dir.join("shortcut-clean.affine");
        std::os::unix::fs::symlink(&ro_clean_db, &ro_clean_symlink).unwrap();
        std::fs::set_permissions(&ro_clean_dir, std::fs::Permissions::from_mode(0o555)).unwrap();

        for target in [&ro_clean_db, &ro_clean_symlink] {
            let (clean_store, clean_stats) = open_sqlite_workspace(target).unwrap();
            assert_eq!(clean_stats.pending_writebacks, 0);
            assert!(
                clean_store.get_doc("doc-1").is_some(),
                "read-only dir with no -wal must safely open via immutable=1 fallback ({})",
                target.display()
            );
        }

        // 3. Write doc-2 into live WAL without checkpointing, verify writable-dir symlink sees
        //    both doc-1 and doc-2, then copy DB + non-empty -wal (without -shm) into a read-only
        //    directory (0o555) and verify both direct path and symlink return Err.
        ws_db
            .create_page(
                PageIdSource::Explicit("doc-2"),
                "Uncheckpointed WAL Doc",
                1_764_361_500,
            )
            .unwrap();
        let mut doc2 = PageDocSession::new("doc-2", random_client_id()).unwrap();
        doc2.add_block(
            "r2",
            BlockSpec::Page {
                title: "Uncheckpointed WAL Doc".into(),
            },
            None,
            None,
            2,
        )
        .unwrap();
        let live_writer = rt.block_on(async {
            let writer = SqliteDocStorage::new(src_str.clone());
            writer
                .push_update(
                    "ws-ro-guard",
                    ws_db.root().encode_update_v1().unwrap(),
                    1_764_361_500,
                )
                .await
                .unwrap();
            writer
                .push_update("doc-2", doc2.encode_update_v1().unwrap(), 1_764_361_501)
                .await
                .unwrap();
            writer
        });

        let rw_symlink = temp_dir.join("shortcut-rw-wal.affine");
        std::os::unix::fs::symlink(&src_db, &rw_symlink).unwrap();
        let (mut rw_sym_store, rw_sym_stats) = open_sqlite_workspace(&rw_symlink).unwrap();
        assert_eq!(rw_sym_stats.pending_writebacks, 0);
        assert!(rw_sym_store.get_doc("doc-1").is_some());
        assert!(
            rw_sym_store.get_doc("doc-2").is_some(),
            "writable-dir symlink must read doc-2 from target's live WAL"
        );
        assert!(rw_sym_store.ensure_doc_hydrated("doc-2").unwrap());

        let ro_wal_dir = temp_dir.join("ro-with-wal");
        std::fs::create_dir_all(&ro_wal_dir).unwrap();
        let ro_wal_db = ro_wal_dir.join("with-wal.affine");
        let ro_wal_sidecar = ro_wal_dir.join("with-wal.affine-wal");
        std::fs::copy(&src_db, &ro_wal_db).unwrap();
        std::fs::copy(format!("{src_str}-wal"), &ro_wal_sidecar).unwrap();
        assert!(
            std::fs::metadata(&ro_wal_sidecar).unwrap().len() > 0,
            "copied WAL sidecar must be non-empty"
        );
        let ro_wal_symlink = temp_dir.join("shortcut-ro-wal.affine");
        std::os::unix::fs::symlink(&ro_wal_db, &ro_wal_symlink).unwrap();
        std::fs::set_permissions(&ro_wal_dir, std::fs::Permissions::from_mode(0o555)).unwrap();

        for target in [&ro_wal_db, &ro_wal_symlink] {
            let res = open_sqlite_workspace(target);
            assert!(
                res.is_err(),
                "read-only dir with non-empty -wal and no -shm must return Err instead of silently dropping doc-2 via immutable=1 ({})",
                target.display()
            );
        }

        let _ = std::fs::set_permissions(&ro_clean_dir, std::fs::Permissions::from_mode(0o755));
        let _ = std::fs::set_permissions(&ro_wal_dir, std::fs::Permissions::from_mode(0o755));
        rt.block_on(async {
            live_writer.close().await;
        });
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
