//! Storage backend abstraction + a local-SQLite implementation over `affine_nbstore`.
//!
//! `DocBackend` is the seam a future cloud/remote backend would also implement. For Phase 0
//! only `LocalBackend` exists, driving `SqliteDocStoragePool` + `SqliteDocStorage` directly
//! (NOT the `#[napi] DocStoragePool` wrapper), exactly as packages/frontend/mobile-native does.

use std::path::Path;

use affine_nbstore::indexer::NativeCrawlResult;
use affine_nbstore::pool::SqliteDocStoragePool;
use affine_nbstore::{Blob, DocRecord, DocUpdate, ListedBlob, SetBlob};

use crate::error::CliError;
use crate::paths;

/// A single full-text-search hit, decoupled from the nbstore `NativeSearchHit` type so the
/// command layer never depends on the storage crate's wire structs directly.
#[derive(Debug, Clone)]
pub struct SearchHit {
    pub doc_id: String,
    pub score: f64,
    pub terms: Vec<String>,
}

/// Minimal write/read seam over a doc store. All methods are async (tokio + sqlx).
#[allow(async_fn_in_trait)]
pub trait DocBackend {
    async fn set_space_id(&self, space_id: &str) -> Result<(), CliError>;
    async fn push_update(&self, doc_id: &str, update: &[u8]) -> Result<(), CliError>;
    async fn get_doc_snapshot(&self, doc_id: &str) -> Result<Option<DocRecord>, CliError>;
    async fn get_doc_updates(&self, doc_id: &str) -> Result<Vec<DocUpdate>, CliError>;

    /// Delete a doc (its updates, snapshots, clocks and indexer-sync rows) in one tx.
    /// Does NOT touch the root doc's `meta.pages` entry — that is a separate root-doc delta.
    async fn delete_doc(&self, doc_id: &str) -> Result<(), CliError>;

    // --- blobs ---
    async fn set_blob(&self, key: &str, data: &[u8], mime: &str) -> Result<(), CliError>;
    async fn get_blob(&self, key: &str) -> Result<Option<Blob>, CliError>;
    async fn list_blobs(&self) -> Result<Vec<ListedBlob>, CliError>;

    // --- full-text search (in-memory inverted index persisted to idx_snapshots) ---
    /// Crawl a doc's blocks (snapshot+updates merged internally) into title/summary/blocks.
    async fn crawl_doc_data(&self, doc_id: &str) -> Result<NativeCrawlResult, CliError>;
    /// Add (or overwrite) a doc's text in the named in-memory index. `index=true` always.
    async fn index_doc(&self, index_name: &str, doc_id: &str, text: &str) -> Result<(), CliError>;
    /// Persist all dirty in-memory indexes back to the `idx_snapshots` table.
    async fn flush_index(&self) -> Result<(), CliError>;
    /// Run a ranked search over the named index.
    async fn search(&self, index_name: &str, query: &str) -> Result<Vec<SearchHit>, CliError>;
}

/// The single index name the CLI uses for doc search — deliberately PRIVATE to the CLI
/// (`cli:doc`), not the app's `doc:title`.
///
/// The desktop app maintains one fts index per `table:field` and puts ONLY the title under
/// `doc:title` (nbstore-sqlite indexer, `${table}:${field}`); the CLI indexes title + full
/// body as one text. Sharing the app's index would (a) pollute the app's title search with
/// body terms and (b) get silently overwritten back to title-only by the app's next crawl.
/// A private index costs nothing: `search` re-crawls every doc on each run anyway, so it
/// never depended on desktop-built snapshots.
pub const DOC_SEARCH_INDEX: &str = "cli:doc";

/// A connected local workspace store.
pub struct LocalBackend {
    pool: SqliteDocStoragePool,
    universal_id: String,
}

impl LocalBackend {
    /// Open (creating + migrating if needed) the local SQLite store for `workspace_id`.
    ///
    /// Mirrors electron handlers.ts: ensure the parent dir, then `pool.connect(uid, path)`
    /// which runs the 4-migration schema. Does NOT call set_space_id — callers that create
    /// a workspace must do that explicitly afterward.
    pub async fn open(base: &Path, peer: &str, workspace_id: &str) -> Result<Self, CliError> {
        let db_path = paths::workspace_db_path(base, peer, workspace_id);
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let db_path_str = db_path
            .to_str()
            .ok_or_else(|| CliError::config("db path is not valid UTF-8"))?
            .to_string();

        let universal_id = paths::universal_id(peer, workspace_id);
        let pool = SqliteDocStoragePool::default();
        pool.connect(universal_id.clone(), db_path_str).await?;
        Ok(LocalBackend { pool, universal_id })
    }

    /// Open an EXISTING workspace store; errors when the database file is absent.
    ///
    /// `open` materializes the workspace directory + DB as a side effect, so routing every
    /// command except `workspace create` through this variant keeps a typo'd `--workspace`
    /// id from silently creating an empty workspace that `workspace list` then reports.
    pub async fn open_existing(base: &Path, peer: &str, workspace_id: &str) -> Result<Self, CliError> {
        let db_path = paths::workspace_db_path(base, peer, workspace_id);
        if !db_path.is_file() {
            return Err(CliError::config(format!(
                "workspace not found: {workspace_id} (no database at {})",
                db_path.display()
            )));
        }
        Self::open(base, peer, workspace_id).await
    }

    pub fn db_path(base: &Path, peer: &str, workspace_id: &str) -> std::path::PathBuf {
        paths::workspace_db_path(base, peer, workspace_id)
    }
}

/// True when ANOTHER process currently has this SQLite database open in WAL mode (nbstore
/// always opens WAL — storage.rs `journal_mode(Wal)`).
///
/// Every SQLite connection to a WAL database holds a SHARED advisory lock on the "dead-man
/// switch" byte of the `-shm` file — offset 128 == `UNIX_SHM_DMS` in sqlite os_unix.c
/// (`UNIX_SHM_BASE` = (22+SQLITE_SHM_NLOCK)*4 = 120, DMS = BASE + 8) — for the connection's
/// whole lifetime. `F_GETLK` probing a write lock on that byte reports a conflicting lock
/// held by any OTHER process without acquiring anything ourselves (POSIX record locks never
/// conflict within one process, so our own pool can't trip it).
///
/// Best-effort by design: a missing `-shm` (DB never opened in WAL / cleanly checkpointed,
/// or a stale file after a crash — stale files carry no locks) and any probe failure both
/// report "not in use". False negatives allow a risky write; false positives are impossible.
#[cfg(unix)]
pub fn db_in_use_elsewhere(db_path: &Path) -> bool {
    use std::os::fd::AsRawFd;

    let shm = std::path::PathBuf::from(format!("{}-shm", db_path.display()));
    let file = match std::fs::File::open(&shm) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut lk: libc::flock = unsafe { std::mem::zeroed() };
    lk.l_type = libc::F_WRLCK as _;
    lk.l_whence = libc::SEEK_SET as _;
    lk.l_start = 128; // UNIX_SHM_DMS
    lk.l_len = 1;
    let rc = unsafe { libc::fcntl(file.as_raw_fd(), libc::F_GETLK, &mut lk) };
    // F_UNLCK's C type differs per platform (c_int on Linux, c_short on macOS) — widen both.
    rc == 0 && i64::from(lk.l_type) != libc::F_UNLCK as i64
}

/// Non-unix fallback: no reliable cross-process probe — never report "in use".
#[cfg(not(unix))]
pub fn db_in_use_elsewhere(_db_path: &Path) -> bool {
    false
}

impl DocBackend for LocalBackend {
    async fn set_space_id(&self, space_id: &str) -> Result<(), CliError> {
        let s = self.pool.get(self.universal_id.clone()).await?;
        s.set_space_id(space_id.to_string()).await?;
        Ok(())
    }

    async fn push_update(&self, doc_id: &str, update: &[u8]) -> Result<(), CliError> {
        let s = self.pool.get(self.universal_id.clone()).await?;
        s.push_update(doc_id.to_string(), update).await?;
        Ok(())
    }

    async fn get_doc_snapshot(&self, doc_id: &str) -> Result<Option<DocRecord>, CliError> {
        let s = self.pool.get(self.universal_id.clone()).await?;
        Ok(s.get_doc_snapshot(doc_id.to_string()).await?)
    }

    async fn get_doc_updates(&self, doc_id: &str) -> Result<Vec<DocUpdate>, CliError> {
        let s = self.pool.get(self.universal_id.clone()).await?;
        Ok(s.get_doc_updates(doc_id.to_string()).await?)
    }

    async fn delete_doc(&self, doc_id: &str) -> Result<(), CliError> {
        let s = self.pool.get(self.universal_id.clone()).await?;
        s.delete_doc(doc_id.to_string()).await?;
        Ok(())
    }

    async fn set_blob(&self, key: &str, data: &[u8], mime: &str) -> Result<(), CliError> {
        let s = self.pool.get(self.universal_id.clone()).await?;
        s.set_blob(SetBlob {
            key: key.to_string(),
            data: data.to_vec(),
            mime: mime.to_string(),
        })
        .await?;
        Ok(())
    }

    async fn get_blob(&self, key: &str) -> Result<Option<Blob>, CliError> {
        let s = self.pool.get(self.universal_id.clone()).await?;
        Ok(s.get_blob(key.to_string()).await?)
    }

    async fn list_blobs(&self) -> Result<Vec<ListedBlob>, CliError> {
        let s = self.pool.get(self.universal_id.clone()).await?;
        Ok(s.list_blobs().await?)
    }

    async fn crawl_doc_data(&self, doc_id: &str) -> Result<NativeCrawlResult, CliError> {
        let s = self.pool.get(self.universal_id.clone()).await?;
        Ok(s.crawl_doc_data(doc_id).await?)
    }

    async fn index_doc(&self, index_name: &str, doc_id: &str, text: &str) -> Result<(), CliError> {
        let s = self.pool.get(self.universal_id.clone()).await?;
        s.fts_add(index_name, doc_id, text, true).await?;
        Ok(())
    }

    async fn flush_index(&self) -> Result<(), CliError> {
        let s = self.pool.get(self.universal_id.clone()).await?;
        s.flush_index().await?;
        Ok(())
    }

    async fn search(&self, index_name: &str, query: &str) -> Result<Vec<SearchHit>, CliError> {
        let s = self.pool.get(self.universal_id.clone()).await?;
        let hits = s.fts_search(index_name, query).await?;
        Ok(hits
            .into_iter()
            .map(|h| SearchHit {
                doc_id: h.id,
                score: h.score,
                terms: h.terms,
            })
            .collect())
    }
}
