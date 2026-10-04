use std::{
  collections::HashMap,
  fs,
  path::{Path, PathBuf},
};

use sqlx::{
  Pool, Row, Sqlite, SqliteConnection,
  sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};

use super::{
  types::SourceCheckpoint,
  utils::{merge_update_binary, now_naive},
};

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
      CREATE TABLE IF NOT EXISTS source_checkpoints (
        workspace_id TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        snapshot BLOB NOT NULL,
        markdown TEXT NOT NULL,
        source_markdown TEXT,
        scope TEXT NOT NULL,
        profile INTEGER NOT NULL,
        meta_hash TEXT NOT NULL,
        readonly_preview INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(workspace_id, doc_id)
      );
      "#,
    )
    .execute(&self.pool)
    .await
    .map_err(|err| format!("failed to create source checkpoint table: {}", err))?;

    let checkpoint_columns = sqlx::query("PRAGMA table_info(source_checkpoints)")
      .fetch_all(&self.pool)
      .await
      .map_err(|err| format!("failed to inspect source checkpoint table: {}", err))?;
    if !checkpoint_columns
      .iter()
      .any(|column| column.get::<String, _>("name") == "source_markdown")
    {
      sqlx::query("ALTER TABLE source_checkpoints ADD COLUMN source_markdown TEXT")
        .execute(&self.pool)
        .await
        .map_err(|err| format!("failed to migrate source checkpoint table: {}", err))?;
    }
    sqlx::query("UPDATE source_checkpoints SET source_markdown = markdown WHERE source_markdown IS NULL")
      .execute(&self.pool)
      .await
      .map_err(|err| format!("failed to backfill source checkpoint projections: {}", err))?;
    if !checkpoint_columns
      .iter()
      .any(|column| column.get::<String, _>("name") == "readonly_preview")
    {
      sqlx::query("ALTER TABLE source_checkpoints ADD COLUMN readonly_preview INTEGER NOT NULL DEFAULT 0")
        .execute(&self.pool)
        .await
        .map_err(|err| format!("failed to migrate source preview checkpoints: {}", err))?;
    }

    sqlx::query(
      r#"
      CREATE TABLE IF NOT EXISTS root_snapshots (
        workspace_id TEXT PRIMARY KEY,
        snapshot BLOB NOT NULL
      );
      "#,
    )
    .execute(&self.pool)
    .await
    .map_err(|err| format!("failed to create root snapshot table: {}", err))?;

    sqlx::query(
      r#"
      CREATE TABLE IF NOT EXISTS pending_source_updates (
        workspace_id TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        bin BLOB NOT NULL,
        PRIMARY KEY(workspace_id, doc_id)
      );
      "#,
    )
    .execute(&self.pool)
    .await
    .map_err(|err| format!("failed to create pending source update table: {}", err))?;

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

  pub(crate) async fn load_root_snapshot(&self) -> Result<Vec<u8>, String> {
    sqlx::query_scalar("SELECT snapshot FROM root_snapshots WHERE workspace_id = ?")
      .bind(&self.workspace_id)
      .fetch_optional(&self.pool)
      .await
      .map(|snapshot| snapshot.unwrap_or_default())
      .map_err(|err| format!("failed to load root snapshot: {}", err))
  }

  pub(crate) async fn store_root_snapshot(&self, snapshot: &[u8]) -> Result<(), String> {
    sqlx::query(
      r#"
      INSERT INTO root_snapshots (workspace_id, snapshot) VALUES (?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET snapshot = excluded.snapshot
      "#,
    )
    .bind(&self.workspace_id)
    .bind(snapshot)
    .execute(&self.pool)
    .await
    .map_err(|err| format!("failed to persist root snapshot: {}", err))?;
    Ok(())
  }

  async fn stage_root_update_in_tx(
    &self,
    tx: &mut SqliteConnection,
    snapshot: &[u8],
    _update: &[u8],
  ) -> Result<Vec<u8>, String> {
    // Pending updates are replayed without knowing which local snapshot the
    // renderer currently has. Persist a standalone snapshot so replay cannot
    // leave Yjs structs waiting on an older disk-only dependency.
    let pending = snapshot.to_vec();
    sqlx::query(
      r#"
      INSERT INTO root_snapshots (workspace_id, snapshot) VALUES (?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET snapshot = excluded.snapshot
      "#,
    )
    .bind(&self.workspace_id)
    .bind(snapshot)
    .execute(&mut *tx)
    .await
    .map_err(|err| format!("failed to stage root snapshot: {}", err))?;
    sqlx::query(
      r#"
      INSERT INTO pending_source_updates (workspace_id, doc_id, bin) VALUES (?, ?, ?)
      ON CONFLICT(workspace_id, doc_id) DO UPDATE SET bin = excluded.bin
      "#,
    )
    .bind(&self.workspace_id)
    .bind(&self.workspace_id)
    .bind(&pending)
    .execute(&mut *tx)
    .await
    .map_err(|err| format!("failed to stage root update: {}", err))?;
    Ok(pending)
  }

  pub(crate) async fn load_source_checkpoints(&self) -> Result<HashMap<String, SourceCheckpoint>, String> {
    let rows = sqlx::query(
      "SELECT doc_id, snapshot, markdown, source_markdown, scope, profile, meta_hash, readonly_preview FROM \
       source_checkpoints WHERE workspace_id = ?",
    )
    .bind(&self.workspace_id)
    .fetch_all(&self.pool)
    .await
    .map_err(|err| format!("failed to load source checkpoints: {}", err))?;

    let mut checkpoints = HashMap::new();
    for row in rows {
      checkpoints.insert(
        row.get("doc_id"),
        SourceCheckpoint {
          snapshot: row.get("snapshot"),
          markdown: row.get("markdown"),
          source_markdown: row.get("source_markdown"),
          scope: row.get("scope"),
          profile: row.get::<i64, _>("profile") as u32,
          meta_hash: row.get("meta_hash"),
          readonly_preview: row.get::<i64, _>("readonly_preview") != 0,
        },
      );
    }
    Ok(checkpoints)
  }

  pub(crate) async fn upsert_source_checkpoint(
    &self,
    doc_id: &str,
    checkpoint: &SourceCheckpoint,
  ) -> Result<(), String> {
    sqlx::query(
      r#"
      INSERT INTO source_checkpoints (workspace_id, doc_id, snapshot, markdown, source_markdown, scope, profile, meta_hash, readonly_preview)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, doc_id)
      DO UPDATE SET
        snapshot = excluded.snapshot,
        markdown = excluded.markdown,
        source_markdown = excluded.source_markdown,
        scope = excluded.scope,
        profile = excluded.profile,
        meta_hash = excluded.meta_hash,
        readonly_preview = excluded.readonly_preview
      "#,
    )
    .bind(&self.workspace_id)
    .bind(doc_id)
    .bind(&checkpoint.snapshot)
    .bind(&checkpoint.markdown)
    .bind(&checkpoint.source_markdown)
    .bind(&checkpoint.scope)
    .bind(i64::from(checkpoint.profile))
    .bind(&checkpoint.meta_hash)
    .bind(i64::from(checkpoint.readonly_preview))
    .execute(&self.pool)
    .await
    .map_err(|err| format!("failed to persist source checkpoint for doc {}: {}", doc_id, err))?;
    Ok(())
  }

  pub(crate) async fn stage_source_import(
    &self,
    doc_id: &str,
    file_path: &Path,
    checkpoint: &SourceCheckpoint,
    update: &[u8],
    root_update: Option<(&[u8], &[u8])>,
  ) -> Result<(Option<Vec<u8>>, Option<Vec<u8>>), String> {
    let mut tx = self
      .pool
      .begin()
      .await
      .map_err(|err| format!("failed to start source transaction: {}", err))?;
    let previous_pending: Option<Vec<u8>> =
      sqlx::query_scalar("SELECT bin FROM pending_source_updates WHERE workspace_id = ? AND doc_id = ?")
        .bind(&self.workspace_id)
        .bind(doc_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|err| format!("failed to read pending source update: {}", err))?;
    let pending = if update.is_empty() || update == [0, 0] {
      previous_pending
    } else {
      // The checkpoint snapshot already includes the imported file change and
      // any local state supplied during preparation. It is safe to replay on
      // its own and supersedes any older pending delta.
      Some(checkpoint.snapshot.clone())
    };
    sqlx::query(
      r#"
      INSERT INTO source_checkpoints (workspace_id, doc_id, snapshot, markdown, source_markdown, scope, profile, meta_hash, readonly_preview)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, doc_id)
      DO UPDATE SET snapshot = excluded.snapshot, markdown = excluded.markdown,
        source_markdown = excluded.source_markdown, scope = excluded.scope,
        profile = excluded.profile, meta_hash = excluded.meta_hash,
        readonly_preview = excluded.readonly_preview
      "#,
    )
    .bind(&self.workspace_id)
    .bind(doc_id)
    .bind(&checkpoint.snapshot)
    .bind(&checkpoint.markdown)
    .bind(&checkpoint.source_markdown)
    .bind(&checkpoint.scope)
    .bind(i64::from(checkpoint.profile))
    .bind(&checkpoint.meta_hash)
    .bind(i64::from(checkpoint.readonly_preview))
    .execute(&mut *tx)
    .await
    .map_err(|err| format!("failed to stage source checkpoint: {}", err))?;
    sqlx::query(
      r#"
      INSERT INTO bindings (workspace_id, doc_id, file_path, enabled, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(workspace_id, doc_id) DO UPDATE SET
        file_path = excluded.file_path,
        enabled = 1,
        updated_at = excluded.updated_at
      "#,
    )
    .bind(&self.workspace_id)
    .bind(doc_id)
    .bind(file_path.to_string_lossy().to_string())
    .bind(now_naive())
    .execute(&mut *tx)
    .await
    .map_err(|err| format!("failed to stage source binding: {}", err))?;
    if let Some(bin) = pending.as_ref() {
      sqlx::query(
        r#"
        INSERT INTO pending_source_updates (workspace_id, doc_id, bin) VALUES (?, ?, ?)
        ON CONFLICT(workspace_id, doc_id) DO UPDATE SET bin = excluded.bin
        "#,
      )
      .bind(&self.workspace_id)
      .bind(doc_id)
      .bind(bin)
      .execute(&mut *tx)
      .await
      .map_err(|err| format!("failed to stage source update: {}", err))?;
    }
    let root_pending = if let Some((snapshot, update)) = root_update {
      Some(self.stage_root_update_in_tx(&mut tx, snapshot, update).await?)
    } else {
      None
    };
    tx.commit()
      .await
      .map_err(|err| format!("failed to commit source transaction: {}", err))?;
    Ok((pending, root_pending))
  }

  pub(crate) async fn pending_source_updates(&self) -> Result<Vec<(String, Vec<u8>)>, String> {
    let rows = sqlx::query("SELECT doc_id, bin FROM pending_source_updates WHERE workspace_id = ?")
      .bind(&self.workspace_id)
      .fetch_all(&self.pool)
      .await
      .map_err(|err| format!("failed to load pending source updates: {}", err))?;
    Ok(
      rows
        .into_iter()
        .map(|row| (row.get("doc_id"), row.get("bin")))
        .collect(),
    )
  }

  pub(crate) async fn acknowledge_source_update(&self, doc_id: &str, local: &[u8]) -> Result<(), String> {
    let pending: Option<Vec<u8>> =
      sqlx::query_scalar("SELECT bin FROM pending_source_updates WHERE workspace_id = ? AND doc_id = ?")
        .bind(&self.workspace_id)
        .bind(doc_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|err| format!("failed to read pending source update: {}", err))?;
    if let Some(pending) = pending {
      let merged = merge_update_binary(Some(local), &pending)?;
      let canonical_local = merge_update_binary(None, local)?;
      if merged == canonical_local {
        sqlx::query("DELETE FROM pending_source_updates WHERE workspace_id = ? AND doc_id = ? AND bin = ?")
          .bind(&self.workspace_id)
          .bind(doc_id)
          .bind(pending)
          .execute(&self.pool)
          .await
          .map_err(|err| format!("failed to acknowledge source update: {}", err))?;
      }
    }
    Ok(())
  }

  pub(crate) async fn close(&self) {
    self.pool.close().await;
  }
}
