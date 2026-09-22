use std::{
  collections::HashMap,
  fs,
  path::{Path, PathBuf},
};

use sqlx::{
  Pool, Row, Sqlite,
  sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};

use super::{types::Baseline, utils::now_naive};

#[derive(Clone)]
pub(crate) struct StateDb {
  workspace_id: String,
  pool: Pool<Sqlite>,
}

impl StateDb {
  pub(crate) async fn open(sync_folder: &Path, workspace_id: &str) -> Result<Self, String> {
    let state_dir = sync_folder.join(".affine-sync");
    fs::create_dir_all(&state_dir)
      .map_err(|err| format!("failed to create state dir {}: {}", state_dir.display(), err))?;

    let db_path = state_dir.join("state.db");
    let connect_options = SqliteConnectOptions::new()
      .filename(&db_path)
      .create_if_missing(true)
      .journal_mode(SqliteJournalMode::Wal);

    let pool = SqlitePoolOptions::new()
      .max_connections(1)
      .connect_with(connect_options)
      .await
      .map_err(|err| format!("failed to open state db {}: {}", db_path.display(), err))?;

    let db = Self {
      workspace_id: workspace_id.to_string(),
      pool,
    };

    db.init().await?;

    Ok(db)
  }

  async fn init(&self) -> Result<(), String> {
    sqlx::query(
      r#"
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );
      "#,
    )
    .execute(&self.pool)
    .await
    .map_err(|err| format!("failed to create schema_version table: {}", err))?;

    sqlx::query(
      r#"
      CREATE TABLE IF NOT EXISTS bindings (
        workspace_id TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY(workspace_id, doc_id)
      );
      "#,
    )
    .execute(&self.pool)
    .await
    .map_err(|err| format!("failed to create bindings table: {}", err))?;

    sqlx::query(
      r#"
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bindings_workspace_file
      ON bindings(workspace_id, file_path);
      "#,
    )
    .execute(&self.pool)
    .await
    .map_err(|err| format!("failed to create bindings index: {}", err))?;

    sqlx::query(
      r#"
      CREATE TABLE IF NOT EXISTS baselines (
        workspace_id TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        base_clock TEXT NOT NULL,
        base_vector TEXT NOT NULL,
        md_hash TEXT NOT NULL,
        meta_hash TEXT NOT NULL,
        synced_at DATETIME NOT NULL,
        PRIMARY KEY(workspace_id, doc_id)
      );
      "#,
    )
    .execute(&self.pool)
    .await
    .map_err(|err| format!("failed to create baselines table: {}", err))?;

    sqlx::query(
      r#"
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        doc_id TEXT,
        kind TEXT NOT NULL,
        ts DATETIME NOT NULL,
        payload TEXT NOT NULL
      );
      "#,
    )
    .execute(&self.pool)
    .await
    .map_err(|err| format!("failed to create events table: {}", err))?;

    sqlx::query("INSERT OR IGNORE INTO schema_version(version) VALUES (1);")
      .execute(&self.pool)
      .await
      .map_err(|err| format!("failed to initialize schema_version: {}", err))?;

    Ok(())
  }

  pub(crate) async fn load_bindings(&self) -> Result<HashMap<String, PathBuf>, String> {
    let rows = sqlx::query(
      r#"
      SELECT doc_id, file_path
      FROM bindings
      WHERE workspace_id = ? AND enabled = 1;
      "#,
    )
    .bind(&self.workspace_id)
    .fetch_all(&self.pool)
    .await
    .map_err(|err| format!("failed to load bindings: {}", err))?;

    let mut map = HashMap::new();
    for row in rows {
      let doc_id: String = row.get("doc_id");
      let file_path: String = row.get("file_path");
      map.insert(doc_id, PathBuf::from(file_path));
    }

    Ok(map)
  }

  pub(crate) async fn upsert_binding(&self, doc_id: &str, file_path: &Path) -> Result<(), String> {
    sqlx::query(
      r#"
      INSERT INTO bindings (workspace_id, doc_id, file_path, enabled, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(workspace_id, doc_id)
      DO UPDATE SET
        file_path = excluded.file_path,
        enabled = 1,
        updated_at = excluded.updated_at;
      "#,
    )
    .bind(&self.workspace_id)
    .bind(doc_id)
    .bind(file_path.to_string_lossy().to_string())
    .bind(now_naive())
    .execute(&self.pool)
    .await
    .map_err(|err| format!("failed to upsert binding for doc {}: {}", doc_id, err))?;

    Ok(())
  }

  pub(crate) async fn load_baselines(&self) -> Result<HashMap<String, Baseline>, String> {
    let rows = sqlx::query(
      r#"
      SELECT doc_id, base_clock, base_vector, md_hash, meta_hash, synced_at
      FROM baselines
      WHERE workspace_id = ?;
      "#,
    )
    .bind(&self.workspace_id)
    .fetch_all(&self.pool)
    .await
    .map_err(|err| format!("failed to load baselines: {}", err))?;

    let mut map = HashMap::new();
    for row in rows {
      let doc_id: String = row.get("doc_id");
      map.insert(
        doc_id,
        Baseline {
          base_clock: row.get("base_clock"),
          base_vector: row.get("base_vector"),
          md_hash: row.get("md_hash"),
          meta_hash: row.get("meta_hash"),
          synced_at: row.get("synced_at"),
        },
      );
    }
    Ok(map)
  }

  pub(crate) async fn upsert_baseline(&self, doc_id: &str, baseline: &Baseline) -> Result<(), String> {
    sqlx::query(
      r#"
      INSERT INTO baselines (
        workspace_id,
        doc_id,
        base_clock,
        base_vector,
        md_hash,
        meta_hash,
        synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, doc_id)
      DO UPDATE SET
        base_clock = excluded.base_clock,
        base_vector = excluded.base_vector,
        md_hash = excluded.md_hash,
        meta_hash = excluded.meta_hash,
        synced_at = excluded.synced_at;
      "#,
    )
    .bind(&self.workspace_id)
    .bind(doc_id)
    .bind(&baseline.base_clock)
    .bind(&baseline.base_vector)
    .bind(&baseline.md_hash)
    .bind(&baseline.meta_hash)
    .bind(baseline.synced_at)
    .execute(&self.pool)
    .await
    .map_err(|err| format!("failed to upsert baseline for doc {}: {}", doc_id, err))?;

    Ok(())
  }

  pub(crate) async fn append_event(&self, doc_id: Option<&str>, kind: &str, payload: &str) -> Result<(), String> {
    sqlx::query(
      r#"
      INSERT INTO events (workspace_id, doc_id, kind, ts, payload)
      VALUES (?, ?, ?, ?, ?);
      "#,
    )
    .bind(&self.workspace_id)
    .bind(doc_id)
    .bind(kind)
    .bind(now_naive())
    .bind(payload)
    .execute(&self.pool)
    .await
    .map_err(|err| format!("failed to append event {}: {}", kind, err))?;

    Ok(())
  }

  pub(crate) async fn close(&self) {
    self.pool.close().await;
  }
}
