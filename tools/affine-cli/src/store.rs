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
use crate::lease::WriteLease;
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
///
/// `lease` is `Some` only for backends opened through a write entry point (`open` for
/// `workspace create`, `open_existing_for_write` for every other mutating command): it holds
/// the workspace's persisted y-octo client id and the exclusive `flock` that keeps a second CLI
/// process from reusing that id concurrently (see `crate::lease`). Read-only opens leave it
/// `None` and never contend for the lock.
pub struct LocalBackend {
    pool: SqliteDocStoragePool,
    universal_id: String,
    lease: Option<WriteLease>,
}

impl LocalBackend {
    /// Open (creating + migrating if needed) the local SQLite store for `workspace_id`, holding
    /// the workspace write lease.
    ///
    /// Mirrors electron handlers.ts: ensure the parent dir, then `pool.connect(uid, path)`
    /// which runs the 4-migration schema. Does NOT call set_space_id — callers that create
    /// a workspace must do that explicitly afterward. This is the `workspace create` path; the
    /// lease is taken (and the client-id file minted) before the database exists so the root
    /// doc is written with the workspace's permanent client id.
    pub async fn open(base: &Path, peer: &str, workspace_id: &str) -> Result<Self, CliError> {
        let db_path = paths::workspace_db_path(base, peer, workspace_id);
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let lease = WriteLease::acquire(&paths::client_id_path(base, peer, workspace_id))?;
        Self::connect(base, peer, workspace_id, Some(lease)).await
    }

    /// `pool.connect` on the workspace database; `lease` is carried into the backend as-is.
    async fn connect(base: &Path, peer: &str, workspace_id: &str, lease: Option<WriteLease>) -> Result<Self, CliError> {
        let db_path = paths::workspace_db_path(base, peer, workspace_id);
        let db_path_str = db_path
            .to_str()
            .ok_or_else(|| CliError::config("db path is not valid UTF-8"))?
            .to_string();

        let universal_id = paths::universal_id(peer, workspace_id);
        let pool = SqliteDocStoragePool::default();
        pool.connect(universal_id.clone(), db_path_str).await?;
        Ok(LocalBackend {
            pool,
            universal_id,
            lease,
        })
    }

    /// The y-octo client id every doc write through this backend must use. Only available on a
    /// backend opened for writing; a read-only backend has no lease, and an engine call that
    /// needs a client id from one is a programming error surfaced as `CliError::Other`.
    pub fn client_id(&self) -> Result<u64, CliError> {
        self.lease
            .as_ref()
            .map(WriteLease::client_id)
            .ok_or_else(|| CliError::other("internal error: workspace was opened read-only but a write was attempted"))
    }

    /// Open an EXISTING workspace store; errors when the database file is absent.
    ///
    /// `open` materializes the workspace directory + DB as a side effect, so routing every
    /// command except `workspace create` through this variant keeps a typo'd `--workspace`
    /// id from silently creating an empty workspace that `workspace list` then reports.
    ///
    /// Before handing the file to nbstore (whose `connect()` migrates unconditionally) the
    /// schema is checked read-only; see `check_schema`. `allow_migrate` (the `--allow-migrate`
    /// flag) lets a behind-schema database be migrated; a database newer than this CLI is
    /// always refused.
    pub async fn open_existing(
        base: &Path,
        peer: &str,
        workspace_id: &str,
        allow_migrate: bool,
    ) -> Result<Self, CliError> {
        let db_path = paths::workspace_db_path(base, peer, workspace_id);
        if !db_path.is_file() {
            return Err(CliError::config(format!(
                "workspace not found: {workspace_id} (no database at {})",
                db_path.display()
            )));
        }
        Self::check_schema_for_open(&db_path, workspace_id, allow_migrate).await?;
        Self::connect(base, peer, workspace_id, None).await
    }

    /// Classify the database schema and turn `Behind`/`Newer` into the user-facing errors (or the
    /// `--allow-migrate` warning) shared by both `open_existing` variants.
    async fn check_schema_for_open(db_path: &Path, workspace_id: &str, allow_migrate: bool) -> Result<(), CliError> {
        match check_schema(db_path).await? {
            SchemaState::Current => {}
            SchemaState::Behind { pending } if allow_migrate => {
                crate::output::warn(format!(
                    "applied {} pending schema migration(s) to workspace {workspace_id} (--allow-migrate)",
                    pending.len()
                ));
            }
            SchemaState::Behind { pending } => {
                return Err(CliError::MigrationRequired(format!(
                    "workspace {workspace_id} database schema is behind this CLI ({} pending migration(s): {}); \
                     open the workspace in the AFFiNE app first so the app migrates it, or pass \
                     --allow-migrate to let the CLI migrate it (an older installed app may then fail to open it)",
                    pending.len(),
                    pending.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(", ")
                )));
            }
            SchemaState::Newer { unknown } => {
                return Err(CliError::DbNewer(format!(
                    "workspace {workspace_id} database carries schema migration(s) this CLI does not know ({}); \
                     it was written by a newer AFFiNE build - rebuild the CLI from a matching source tree",
                    unknown.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(", ")
                )));
            }
        }
        Ok(())
    }

    /// `open_existing` plus the workspace write lease: the entry point for every mutating command
    /// on an existing workspace. The lease (exclusive `flock` on `affine-cli.client`) is taken
    /// BEFORE the database is opened, so a concurrent CLI writer is serialized ahead of the
    /// schema check and the read-merge-write cycle, not just the final push. Fails with
    /// `CliError::Busy` when another process still holds the lease after the bounded retry.
    pub async fn open_existing_for_write(
        base: &Path,
        peer: &str,
        workspace_id: &str,
        allow_migrate: bool,
    ) -> Result<Self, CliError> {
        let db_path = paths::workspace_db_path(base, peer, workspace_id);
        if !db_path.is_file() {
            return Err(CliError::config(format!(
                "workspace not found: {workspace_id} (no database at {})",
                db_path.display()
            )));
        }
        let lease = WriteLease::acquire(&paths::client_id_path(base, peer, workspace_id))?;
        Self::check_schema_for_open(&db_path, workspace_id, allow_migrate).await?;
        Self::connect(base, peer, workspace_id, Some(lease)).await
    }

    pub fn db_path(base: &Path, peer: &str, workspace_id: &str) -> std::path::PathBuf {
        paths::workspace_db_path(base, peer, workspace_id)
    }
}

/// Result of comparing a workspace database's `_sqlx_migrations` against the migration list
/// this CLI embeds (`affine_schema::get_migrator`, the same list nbstore applies on connect).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SchemaState {
    /// Every embedded migration is applied and nothing unknown is present.
    Current,
    /// Embedded migrations the database has not applied yet (nbstore would apply them).
    Behind { pending: Vec<i64> },
    /// Applied migration versions this CLI has no knowledge of (database from a newer build).
    /// Takes precedence over `Behind` when both hold.
    Newer { unknown: Vec<i64> },
}

/// Inspect `_sqlx_migrations` in `db_path` read-only (no nbstore, no migration run) and classify
/// the schema relative to the migrations this CLI embeds.
///
/// A file without a `_sqlx_migrations` table (v1 schema, empty file) counts as `Behind` with
/// every migration pending. Only the "up" migrations are considered; nbstore never records
/// the reversible-down entries.
pub async fn check_schema(db_path: &Path) -> Result<SchemaState, CliError> {
    use sqlx::migrate::MigrationType;
    use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};
    use sqlx::{ConnectOptions, Row};

    let err = |e: sqlx::Error| CliError::other(format!("schema check failed for {}: {e}", db_path.display()));

    let opts = SqliteConnectOptions::new().filename(db_path).read_only(true);
    let mut conn: SqliteConnection = opts.connect().await.map_err(err)?;

    let has_table = sqlx::query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'")
        .fetch_optional(&mut conn)
        .await
        .map_err(err)?
        .is_some();
    let applied: Vec<i64> = if has_table {
        sqlx::query("SELECT version FROM _sqlx_migrations ORDER BY version")
            .fetch_all(&mut conn)
            .await
            .map_err(err)?
            .iter()
            .map(|row| row.get::<i64, _>("version"))
            .collect()
    } else {
        Vec::new()
    };
    drop(conn);

    let known: Vec<i64> = affine_schema::get_migrator()
        .iter()
        .filter(|m| m.migration_type != MigrationType::ReversibleDown)
        .map(|m| m.version)
        .collect();

    let unknown: Vec<i64> = applied.iter().copied().filter(|v| !known.contains(v)).collect();
    if !unknown.is_empty() {
        return Ok(SchemaState::Newer { unknown });
    }
    let pending: Vec<i64> = known.iter().copied().filter(|v| !applied.contains(v)).collect();
    if !pending.is_empty() {
        return Ok(SchemaState::Behind { pending });
    }
    Ok(SchemaState::Current)
}

/// Outcome of the pre-flight "is the database open in another process" probe.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InUseProbe {
    /// Another process holds the WAL dead-man-switch lock right now.
    InUse,
    /// No other process held it at probe time (the probe is a point-in-time check: a process
    /// may open the database between the probe and the CLI's write).
    Free,
    /// This platform has no probe implementation; the caller cannot know either way.
    Unsupported,
}

/// True when ANOTHER process currently has this SQLite database open in WAL mode (nbstore
/// always opens WAL — storage.rs `journal_mode(Wal)`).
///
/// This is a one-shot pre-flight probe, NOT a lock: nothing is acquired or held, so a process
/// that opens the database after the probe returns is not detected (TOCTOU window). SQLite's
/// own locking keeps the file consistent regardless; the probe only exists to warn before the
/// app can clobber an external write on its next save.
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
pub fn db_in_use_elsewhere(db_path: &Path) -> InUseProbe {
    use std::os::fd::AsRawFd;

    let shm = std::path::PathBuf::from(format!("{}-shm", db_path.display()));
    let file = match std::fs::File::open(&shm) {
        Ok(f) => f,
        Err(_) => return InUseProbe::Free,
    };
    let mut lk: libc::flock = unsafe { std::mem::zeroed() };
    lk.l_type = libc::F_WRLCK as _;
    lk.l_whence = libc::SEEK_SET as _;
    lk.l_start = 128; // UNIX_SHM_DMS
    lk.l_len = 1;
    let rc = unsafe { libc::fcntl(file.as_raw_fd(), libc::F_GETLK, &mut lk) };
    // F_UNLCK's C type differs per platform (c_int on Linux, c_short on macOS) — widen both.
    if rc == 0 && i64::from(lk.l_type) != libc::F_UNLCK as i64 {
        InUseProbe::InUse
    } else {
        InUseProbe::Free
    }
}

/// Non-unix (Windows) fallback: the probe is not implemented, so the open-app check cannot run
/// and writes proceed as if `--force` were given. The caller surfaces this as a warning in the
/// JSON output; `error:locked` never fires on this platform.
#[cfg(not(unix))]
pub fn db_in_use_elsewhere(_db_path: &Path) -> InUseProbe {
    InUseProbe::Unsupported
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
