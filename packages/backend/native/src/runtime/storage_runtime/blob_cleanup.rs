use chrono::{DateTime, Duration, Utc};
use sqlx::{FromRow, PgConnection};
use uuid::Uuid;

use super::{
  RuntimeBlobCleanupResult, RuntimeError, RuntimeResult, StorageOperation, StorageRuntime,
  doc_blob_refs::{DOC_BLOB_SOURCES_SQL, PARSER_VERSION, SOURCE_FINGERPRINT_SQL, retained_doc_ids},
  napi_error,
};

#[derive(FromRow)]
struct BlobRow {
  workspace_id: String,
  key: String,
  size: i32,
  reservation_id: Option<Uuid>,
  deleted_at: Option<DateTime<Utc>>,
}

async fn checkpoint_completed(connection: &mut PgConnection, kind: &str, scope: &str) -> RuntimeResult<bool> {
  sqlx::query_scalar::<_, bool>(
    "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints WHERE kind = $1 AND scope = $2 AND status = \
     'completed')",
  )
  .bind(kind)
  .bind(scope)
  .fetch_one(connection)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup checkpoint check failed", error))
}

async fn projection_is_stale(connection: &mut PgConnection, workspace_id: &str) -> RuntimeResult<bool> {
  let checkpoint = sqlx::query_scalar::<_, serde_json::Value>(
    "SELECT metadata FROM storage_reconciliation_checkpoints WHERE scope=$1 AND kind='doc_blob_refs' AND \
     status='completed'",
  )
  .bind(workspace_id)
  .fetch_optional(&mut *connection)
  .await
  .map_err(|error| RuntimeError::database("load blob retention checkpoint", error))?;
  let Some(checkpoint) = checkpoint else {
    return Ok(true);
  };
  if checkpoint.get("parserVersion").and_then(serde_json::Value::as_i64) != Some(i64::from(PARSER_VERSION)) {
    return Ok(true);
  }
  let current_doc_ids = retained_doc_ids(connection, workspace_id).await?;
  let query = format!(
    r#"
    WITH sources AS ({DOC_BLOB_SOURCES_SQL})
    SELECT EXISTS(
      SELECT ids.doc_id
      FROM unnest($3::text[]) AS ids(doc_id)
      LEFT JOIN sources ON sources.doc_id=ids.doc_id
      LEFT JOIN doc_blob_ref_projections p ON p.workspace_id=$1 AND p.doc_id=ids.doc_id
      GROUP BY ids.doc_id,p.doc_id,p.status,p.parser_version,p.source_fingerprint
      HAVING p.doc_id IS NULL OR p.status <> 'fresh' OR p.parser_version <> $4 OR count(sources.doc_id)=0
        OR p.source_fingerprint IS DISTINCT FROM {SOURCE_FINGERPRINT_SQL}
    ) OR EXISTS(
      SELECT 1 FROM doc_blob_ref_projections WHERE workspace_id=$1 AND status <> 'fresh'
    ) OR EXISTS(
      SELECT 1 FROM doc_blob_refs r LEFT JOIN doc_blob_ref_projections p ON p.workspace_id=r.workspace_id AND p.doc_id=r.doc_id
      WHERE r.workspace_id=$1 AND (p.doc_id IS NULL OR p.status <> 'fresh' OR r.status <> 'fresh'
        OR r.parser_version <> p.parser_version OR r.snapshot_updated_at IS DISTINCT FROM p.source_revision)
    )
  "#
  );
  sqlx::query_scalar(&query)
    .bind(workspace_id)
    .bind(None::<&str>)
    .bind(&current_doc_ids)
    .bind(PARSER_VERSION)
    .fetch_one(connection)
    .await
    .map_err(|error| RuntimeError::database("check installed blob source fingerprints", error))
}

async fn has_doc_ref<'a>(
  executor: impl sqlx::Executor<'a, Database = sqlx::Postgres>,
  workspace_id: &str,
  key: &str,
) -> RuntimeResult<bool> {
  sqlx::query_scalar::<_, bool>(
    r#"
    SELECT EXISTS(
      SELECT 1
      FROM doc_blob_refs r
      JOIN doc_blob_ref_projections p
        ON p.workspace_id = r.workspace_id AND p.doc_id = r.doc_id
      WHERE r.workspace_id = $1
        AND r.blob_key = $2
        AND r.status = 'fresh'
        AND p.status = 'fresh'
        AND p.parser_version = $3
        AND r.parser_version = p.parser_version
        AND r.snapshot_updated_at = p.source_revision
    )
    "#,
  )
  .bind(workspace_id)
  .bind(key)
  .bind(PARSER_VERSION)
  .fetch_one(executor)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup doc ref check failed", error))
}

async fn has_other_ref<'a>(
  executor: impl sqlx::Executor<'a, Database = sqlx::Postgres>,
  workspace_id: &str,
  key: &str,
) -> RuntimeResult<bool> {
  sqlx::query_scalar::<_, bool>(
    r#"
    SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1 AND avatar_key = $2)
      OR EXISTS(SELECT 1 FROM ai_transcript_tasks WHERE workspace_id = $1 AND blob_id = $2)
      OR EXISTS(SELECT 1 FROM ai_jobs WHERE workspace_id = $1 AND blob_id = $2)
      OR EXISTS(
        SELECT 1 FROM workspace_artifacts
        WHERE workspace_id = $1
          AND storage_scope = 'blob'
          AND storage_key = concat($1, '/', $2)
          AND status IN ('reserving', 'ready')
      )
    "#,
  )
  .bind(workspace_id)
  .bind(key)
  .fetch_one(executor)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup protected ref check failed", error))
}

async fn load_cursor(connection: &mut PgConnection, workspace_id: &str) -> RuntimeResult<Option<String>> {
  let row = sqlx::query_as::<_, (String, serde_json::Value)>(
    "SELECT status, cursor FROM storage_reconciliation_checkpoints WHERE kind = 'blob_cleanup' AND scope = $1",
  )
  .bind(workspace_id)
  .fetch_optional(connection)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup checkpoint load failed", error))?;
  let Some((status, cursor)) = row else {
    return Ok(None);
  };
  if status == "completed" {
    return Ok(None);
  }
  Ok(
    cursor
      .get("lastBlobKey")
      .and_then(|value| value.as_str())
      .map(str::to_string),
  )
}

async fn save_cursor(
  connection: &mut PgConnection,
  workspace_id: &str,
  last_blob_key: Option<&str>,
  completed: bool,
) -> RuntimeResult<()> {
  sqlx::query(
    r#"
    INSERT INTO storage_reconciliation_checkpoints
      (kind, scope, status, cursor, last_key, completed_at)
    VALUES ('blob_cleanup', $1, $2, $3, $4, CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT (kind, scope) DO UPDATE SET
      status = EXCLUDED.status,
      cursor = EXCLUDED.cursor,
      last_key = EXCLUDED.last_key,
      completed_at = CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP
    "#,
  )
  .bind(workspace_id)
  .bind(if completed { "completed" } else { "running" })
  .bind(serde_json::json!({ "lastBlobKey": last_blob_key }))
  .bind(last_blob_key)
  .bind(completed)
  .execute(connection)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup checkpoint write failed", error))?;
  Ok(())
}

async fn load_denied(connection: &mut PgConnection, workspace_id: &str, limit: i64) -> RuntimeResult<Vec<BlobRow>> {
  sqlx::query_as::<_, BlobRow>(
    r#"
    SELECT workspace_id, key, size, reservation_id, deleted_at
    FROM blobs
    WHERE workspace_id = $1 AND status = 'completed' AND deleted_at IS NOT NULL
    ORDER BY deleted_at, key
    LIMIT $2
    "#,
  )
  .bind(workspace_id)
  .bind(limit)
  .fetch_all(connection)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup denied row load failed", error))
}

async fn load_live(
  connection: &mut PgConnection,
  workspace_id: &str,
  after_key: Option<&str>,
  limit: i64,
) -> RuntimeResult<Vec<BlobRow>> {
  sqlx::query_as::<_, BlobRow>(
    r#"
    SELECT workspace_id, key, size, reservation_id, deleted_at
    FROM blobs
    WHERE workspace_id = $1
      AND status = 'completed'
      AND deleted_at IS NULL
      AND ($2::text IS NULL OR key > $2)
    ORDER BY key
    LIMIT $3
    "#,
  )
  .bind(workspace_id)
  .bind(after_key)
  .bind(limit)
  .fetch_all(connection)
  .await
  .map_err(|error| RuntimeError::database("Blob cleanup live row load failed", error))
}

#[napi_derive::napi]
impl StorageRuntime {
  #[napi]
  pub async fn cleanup_unreferenced_workspace_blobs(
    &self,
    workspace_id: String,
    grace_period_days: i64,
    limit: i64,
  ) -> napi::Result<RuntimeBlobCleanupResult> {
    if limit <= 0 {
      return Err(napi_error("blob cleanup limit must be positive"));
    }
    if grace_period_days < 0 {
      return Err(napi_error("blob cleanup grace period must be non-negative"));
    }
    let pool = self.pool().await?;
    let mut result = RuntimeBlobCleanupResult {
      scanned_blobs: 0,
      deleted_objects: 0,
      deleted_metadata: 0,
      protected_by_doc_refs: 0,
      protected_by_metadata: 0,
      protected_by_other_refs: 0,
      failed: 0,
      next_cursor: None,
      workspace_ids: Vec::new(),
    };
    let mut operation = StorageOperation::acquire(&pool, &workspace_id, None).await?;
    let cursor = load_cursor(operation.connection(), &workspace_id).await?;
    if !checkpoint_completed(operation.connection(), "blob_metadata_backfill", &workspace_id).await?
      || projection_is_stale(operation.connection(), &workspace_id).await?
    {
      result.protected_by_metadata = load_live(operation.connection(), &workspace_id, cursor.as_deref(), limit)
        .await?
        .len() as i64;
      operation.release().await?;
      return Ok(result);
    }

    let denied = load_denied(operation.connection(), &workspace_id, limit).await?;
    let recovering = !denied.is_empty();
    let rows = if recovering {
      denied
    } else {
      load_live(operation.connection(), &workspace_id, cursor.as_deref(), limit).await?
    };
    result.scanned_blobs = rows.len() as i64;
    let has_more = recovering || rows.len() == limit as usize;
    let last_key = rows.last().map(|row| row.key.clone());
    let minimum_modified = Utc::now() - Duration::days(grace_period_days);
    for row in rows {
      if self
        .cleanup_blob_row(operation.connection(), &row, minimum_modified, &mut result)
        .await
        .is_err()
      {
        result.failed += 1;
      }
    }
    if recovering {
      result.next_cursor = cursor;
    } else {
      result.next_cursor = has_more.then_some(last_key.clone()).flatten();
      save_cursor(operation.connection(), &workspace_id, last_key.as_deref(), !has_more).await?;
    }
    operation.release().await?;
    Ok(result)
  }
}

impl StorageRuntime {
  async fn cleanup_blob_row(
    &self,
    connection: &mut PgConnection,
    row: &BlobRow,
    minimum_modified: DateTime<Utc>,
    result: &mut RuntimeBlobCleanupResult,
  ) -> RuntimeResult<()> {
    let object_key = format!("{}/{}", row.workspace_id, row.key);
    let doc_ref = has_doc_ref(&mut *connection, &row.workspace_id, &row.key).await?;
    let other_ref = has_other_ref(&mut *connection, &row.workspace_id, &row.key).await?;
    let metadata = self.object_storage_head(object_key.clone()).await?;
    if doc_ref || other_ref {
      if row.deleted_at.is_some() && metadata.is_some() {
        sqlx::query(
          "UPDATE blobs SET deleted_at = NULL WHERE workspace_id = $1 AND key = $2 AND reservation_id IS NOT DISTINCT \
           FROM $3 AND deleted_at IS NOT NULL",
        )
        .bind(&row.workspace_id)
        .bind(&row.key)
        .bind(row.reservation_id)
        .execute(&mut *connection)
        .await
        .map_err(|error| RuntimeError::database("restore referenced blob cleanup row", error))?;
      }
      if doc_ref {
        result.protected_by_doc_refs += 1;
      }
      if other_ref {
        result.protected_by_other_refs += 1;
      }
      return Ok(());
    }
    if row.deleted_at.is_none() {
      let Some(metadata) = metadata.as_ref() else {
        result.protected_by_metadata += 1;
        return Ok(());
      };
      let modified = DateTime::<Utc>::from_timestamp_millis(metadata.last_modified_ms)
        .ok_or_else(|| RuntimeError::invalid_state("blob cleanup object last modified is invalid"))?;
      if metadata.content_length != i64::from(row.size) || modified > minimum_modified {
        result.protected_by_metadata += 1;
        return Ok(());
      }
      let denied = sqlx::query_scalar::<_, bool>(
        "UPDATE blobs SET deleted_at = clock_timestamp(), reservation_expires_at = NULL WHERE workspace_id = $1 AND \
         key = $2 AND status = 'completed' AND deleted_at IS NULL AND reservation_id IS NOT DISTINCT FROM $3 \
         RETURNING true",
      )
      .bind(&row.workspace_id)
      .bind(&row.key)
      .bind(row.reservation_id)
      .fetch_optional(&mut *connection)
      .await
      .map_err(|error| RuntimeError::database("deny unreferenced blob", error))?
      .unwrap_or(false);
      if !denied {
        return Ok(());
      }
    }
    if metadata.is_some() {
      let locator = super::ObjectLocator::new(super::StorageScope::Blob, super::ObjectKey::new(object_key)?);
      self.object_storage()?.delete(&locator).await?;
      result.deleted_objects += 1;
    }
    let deleted = sqlx::query(
      "DELETE FROM blobs WHERE workspace_id = $1 AND key = $2 AND status = 'completed' AND deleted_at IS NOT NULL AND \
       reservation_id IS NOT DISTINCT FROM $3",
    )
    .bind(&row.workspace_id)
    .bind(&row.key)
    .bind(row.reservation_id)
    .execute(&mut *connection)
    .await
    .map_err(|error| RuntimeError::database("delete unreferenced blob ledger", error))?
    .rows_affected() as i64;
    result.deleted_metadata += deleted;
    if deleted > 0 && !result.workspace_ids.iter().any(|id| id == &row.workspace_id) {
      result.workspace_ids.push(row.workspace_id.clone());
    }
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
  };

  use anyhow::{Context, Result as AnyResult};
  use napi::bindgen_prelude::Buffer;
  use sqlx::{PgPool, postgres::PgPoolOptions};
  use tempfile::TempDir;
  use tokio::sync::Mutex;
  use uuid::Uuid;
  use y_octo::Doc;

  use super::*;
  use crate::runtime::{
    config::ServerConfig,
    migrations::{EMBEDDING_TEST_LOCK, migrate_runtime_tables},
    object_storage::{FsStorageConfig, ObjectStorageService, StorageBackendConfig},
    storage_runtime::StorageRuntimeConfig,
  };

  struct BlobCleanupFixture {
    runtime: StorageRuntime,
    pool: PgPool,
    object_root: TempDir,
    workspace_id: String,
    doc_id: String,
    blob_key: String,
  }

  fn attachment_doc(blob_key: Option<&str>) -> Vec<u8> {
    let doc = Doc::default();
    let mut blocks = doc.get_or_create_map("blocks").expect("blocks root should build");
    let mut attachment = doc.create_map().expect("attachment should build");
    attachment
      .insert("sys:flavour".to_string(), "affine:attachment")
      .expect("attachment flavour should insert");
    if let Some(blob_key) = blob_key {
      attachment
        .insert("prop:sourceId".to_string(), blob_key)
        .expect("attachment source should insert");
    }
    blocks
      .insert("attachment".to_string(), attachment)
      .expect("attachment should insert");
    doc.encode_update_v1().expect("blob cleanup fixture should encode")
  }

  async fn blob_cleanup_fixture(with_ref: bool) -> AnyResult<BlobCleanupFixture> {
    let database_url =
      std::env::var("DATABASE_URL").context("DATABASE_URL is required for ignored blob cleanup integration tests")?;
    let pool = PgPoolOptions::new()
      .max_connections(5)
      .connect(&database_url)
      .await
      .context("connect postgres for blob cleanup tests")?;
    migrate_runtime_tables(&pool)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    let object_root = tempfile::tempdir()?;
    let config_dir = tempfile::tempdir()?;
    let config_path = config_dir.path().join("config.json");
    std::fs::write(&config_path, r#"{"deployment":{"type":"cloud"}}"#)?;
    let runtime = StorageRuntime {
      config: RwLock::new(StorageRuntimeConfig {
        database_url,
        object_storage: ObjectStorageService {
          backends: HashMap::from([(
            "blob".to_string(),
            StorageBackendConfig::Fs(FsStorageConfig {
              provider: "fs".to_string(),
              root: object_root.path().to_string_lossy().to_string(),
              bucket: "blob-cleanup-test".to_string(),
            }),
          )]),
        },
      }),
      server_config: Arc::new(ServerConfig::open(&config_path, None)?),
      pool: Mutex::new(Some(pool.clone())),
    };
    let suffix = Uuid::new_v4().simple().to_string();
    let workspace_id = format!("blob-cleanup-ws-{suffix}");
    let doc_id = format!("blob-cleanup-doc-{suffix}");
    let blob_key = "live-blob".to_string();
    sqlx::query("INSERT INTO workspaces (id, created_at) VALUES ($1, CURRENT_TIMESTAMP)")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    let root = vec![0_u8, 0];
    let doc = if with_ref {
      vec![
        2, 4, 2, 0, 39, 1, 6, 98, 108, 111, 99, 107, 115, 5, 105, 109, 97, 103, 101, 1, 40, 0, 2, 0, 6, 115, 121, 115,
        58, 105, 100, 1, 119, 5, 105, 109, 97, 103, 101, 40, 0, 2, 0, 11, 115, 121, 115, 58, 102, 108, 97, 118, 111,
        117, 114, 1, 119, 12, 97, 102, 102, 105, 110, 101, 58, 105, 109, 97, 103, 101, 40, 0, 2, 0, 13, 112, 114, 111,
        112, 58, 115, 111, 117, 114, 99, 101, 73, 100, 1, 119, 9, 108, 105, 118, 101, 45, 98, 108, 111, 98, 1, 1, 0,
        33, 1, 6, 98, 108, 111, 99, 107, 115, 5, 105, 109, 97, 103, 101, 1, 1, 1, 1, 0, 1,
      ]
    } else {
      attachment_doc(None)
    };
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, updated_at) VALUES ($1, $1, $2, CURRENT_TIMESTAMP), ($1, $3, \
       $4, CURRENT_TIMESTAMP)",
    )
    .bind(&workspace_id)
    .bind(root)
    .bind(&doc_id)
    .bind(doc)
    .execute(&pool)
    .await?;
    sqlx::query(
      "INSERT INTO blobs (workspace_id, key, size, mime, status, created_at) VALUES ($1, $2, 10, \
       'application/octet-stream', 'completed', CURRENT_TIMESTAMP)",
    )
    .bind(&workspace_id)
    .bind(&blob_key)
    .execute(&pool)
    .await?;
    runtime
      .put_object(
        "blob".to_string(),
        format!("{workspace_id}/{blob_key}"),
        Buffer::from(b"attachment".to_vec()),
        None,
      )
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;

    Ok(BlobCleanupFixture {
      runtime,
      pool,
      object_root,
      workspace_id,
      doc_id,
      blob_key,
    })
  }

  async fn complete_cleanup_checkpoints(pool: &PgPool, workspace_id: &str) -> AnyResult<()> {
    for kind in ["blob_metadata_backfill", "doc_blob_refs"] {
      sqlx::query(
        "INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, cursor, completed_at, metadata) VALUES \
         ($1, $2, 'completed', '{}', CURRENT_TIMESTAMP, '{}') ON CONFLICT (kind, scope) DO UPDATE SET status = \
         'completed', completed_at = CURRENT_TIMESTAMP, metadata = CASE WHEN $1 = 'doc_blob_refs' THEN \
         storage_reconciliation_checkpoints.metadata ELSE '{}'::jsonb END",
      )
      .bind(kind)
      .bind(workspace_id)
      .execute(pool)
      .await?;
    }
    Ok(())
  }

  async fn cleanup_blob_fixture(fixture: &BlobCleanupFixture) -> AnyResult<()> {
    for table in [
      "blob_cleanup_candidates",
      "doc_blob_refs",
      "doc_blob_ref_projections",
      "updates",
      "snapshot_histories",
      "snapshots",
      "workspace_pages",
      "blobs",
    ] {
      sqlx::query(&format!("DELETE FROM {table} WHERE workspace_id = $1"))
        .bind(&fixture.workspace_id)
        .execute(&fixture.pool)
        .await?;
    }
    sqlx::query("DELETE FROM storage_reconciliation_checkpoints WHERE scope = $1")
      .bind(&fixture.workspace_id)
      .execute(&fixture.pool)
      .await?;
    sqlx::query("DELETE FROM storage_reconciliation_runs WHERE workspace_id = $1")
      .bind(&fixture.workspace_id)
      .execute(&fixture.pool)
      .await?;
    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(&fixture.workspace_id)
      .execute(&fixture.pool)
      .await?;
    Ok(())
  }

  #[tokio::test]
  async fn artifact_blob_alias_is_a_cleanup_reference_until_deleting() {
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let _guard = EMBEDDING_TEST_LOCK.lock().await;
    let pool = PgPool::connect(&database_url).await.unwrap();
    let suffix = Uuid::new_v4().simple().to_string();
    let workspace_id = format!("blob-cleanup-ws-{suffix}");
    let blob_key = format!("blob-{suffix}");
    let artifact_id = Uuid::new_v4();

    sqlx::query("INSERT INTO workspaces (id, created_at) VALUES ($1, CURRENT_TIMESTAMP)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      r#"
      INSERT INTO workspace_artifacts (
        id, workspace_id, content_hash, canonical_media_type, size_bytes,
        storage_scope, storage_key, status, ready_at
      )
      VALUES ($1, $2, $3, 'application/octet-stream', 1, 'blob', $4, 'reserving', NULL)
      "#,
    )
    .bind(artifact_id)
    .bind(&workspace_id)
    .bind(format!("sha256-{suffix}"))
    .bind(format!("{workspace_id}/{blob_key}"))
    .execute(&pool)
    .await
    .unwrap();

    assert!(has_other_ref(&pool, &workspace_id, &blob_key).await.unwrap());
    sqlx::query("UPDATE workspace_artifacts SET status = 'ready', ready_at = CURRENT_TIMESTAMP WHERE id = $1")
      .bind(artifact_id)
      .execute(&pool)
      .await
      .unwrap();
    assert!(has_other_ref(&pool, &workspace_id, &blob_key).await.unwrap());
    sqlx::query("UPDATE workspace_artifacts SET status = 'deleting' WHERE id = $1")
      .bind(artifact_id)
      .execute(&pool)
      .await
      .unwrap();
    assert!(!has_other_ref(&pool, &workspace_id, &blob_key).await.unwrap());

    sqlx::query("DELETE FROM workspaces WHERE id = $1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
  }

  #[tokio::test]
  #[ignore = "requires DATABASE_URL and a migrated PostgreSQL database"]
  async fn blob_cleanup_projection_reprojects_reference_removal_before_deletion() -> AnyResult<()> {
    let _guard = EMBEDDING_TEST_LOCK.lock().await;
    let fixture = blob_cleanup_fixture(true).await?;
    let _object_root = &fixture.object_root;
    sqlx::query(
      "INSERT INTO workspace_pages (workspace_id,page_id,lifecycle_state,lifecycle_changed_at) VALUES \
       ($1,$2,'trashed',CURRENT_TIMESTAMP)",
    )
    .bind(&fixture.workspace_id)
    .bind(&fixture.doc_id)
    .execute(&fixture.pool)
    .await?;
    fixture
      .runtime
      .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    complete_cleanup_checkpoints(&fixture.pool, &fixture.workspace_id).await?;

    // A fresh empty result from the old parser cannot authorize deletion.
    sqlx::query("DELETE FROM doc_blob_refs WHERE workspace_id=$1")
      .bind(&fixture.workspace_id)
      .execute(&fixture.pool)
      .await?;
    sqlx::query("UPDATE doc_blob_ref_projections SET parser_version=1,status='fresh' WHERE workspace_id=$1")
      .bind(&fixture.workspace_id)
      .execute(&fixture.pool)
      .await?;
    let old = fixture
      .runtime
      .cleanup_unreferenced_workspace_blobs(fixture.workspace_id.clone(), 0, 100)
      .await?;
    assert_eq!((old.deleted_objects, old.protected_by_metadata), (0, 1));
    fixture
      .runtime
      .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100)
      .await?;
    let referenced = fixture
      .runtime
      .cleanup_unreferenced_workspace_blobs(fixture.workspace_id.clone(), 0, 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!((referenced.deleted_objects, referenced.protected_by_doc_refs), (0, 1));
    assert!(
      fixture
        .runtime
        .head_object(
          "blob".to_string(),
          format!("{}/{}", fixture.workspace_id, fixture.blob_key)
        )
        .await
        .map_err(|err| anyhow::anyhow!(err.to_string()))?
        .is_some()
    );

    assert!(
      sqlx::query_scalar::<_, bool>("SELECT deleted_at IS NULL FROM blobs WHERE workspace_id=$1 AND key=$2")
        .bind(&fixture.workspace_id)
        .bind(&fixture.blob_key)
        .fetch_one(&fixture.pool)
        .await?
    );
    let projection_before = sqlx::query_as::<_, (String, String)>(
      "SELECT status,source_fingerprint FROM doc_blob_ref_projections WHERE workspace_id=$1 AND doc_id=$2",
    )
    .bind(&fixture.workspace_id)
    .bind(&fixture.doc_id)
    .fetch_one(&fixture.pool)
    .await?;
    let refs_before =
      sqlx::query_scalar::<_, i64>("SELECT count(*) FROM doc_blob_refs WHERE workspace_id=$1 AND doc_id=$2")
        .bind(&fixture.workspace_id)
        .bind(&fixture.doc_id)
        .fetch_one(&fixture.pool)
        .await?;
    assert!(refs_before > 0);
    let suffix = Uuid::new_v4().simple().to_string();
    let function_name = format!("blob_purge_fault_{suffix}");
    let trigger_name = format!("blob_purge_fault_{suffix}");
    let mut connection = fixture.pool.acquire().await?;
    sqlx::raw_sql(&format!(
      "CREATE FUNCTION {function_name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'blob \
       projection delete fault'; END $$; CREATE TRIGGER {trigger_name} BEFORE DELETE ON doc_blob_ref_projections FOR \
       EACH ROW WHEN (OLD.workspace_id='{}') EXECUTE FUNCTION {function_name}()",
      fixture.workspace_id
    ))
    .execute(&mut *connection)
    .await?;
    let interrupted = super::super::doc_blob_refs::purge_removed_doc_projections(
      &mut connection,
      &fixture.workspace_id,
      std::slice::from_ref(&fixture.workspace_id),
    )
    .await;
    sqlx::raw_sql(&format!(
      "DROP TRIGGER {trigger_name} ON doc_blob_ref_projections; DROP FUNCTION {function_name}()"
    ))
    .execute(&mut *connection)
    .await?;
    let refs_after =
      sqlx::query_scalar::<_, i64>("SELECT count(*) FROM doc_blob_refs WHERE workspace_id=$1 AND doc_id=$2")
        .bind(&fixture.workspace_id)
        .bind(&fixture.doc_id)
        .fetch_one(&mut *connection)
        .await?;
    let projection_after = sqlx::query_as::<_, (String, String)>(
      "SELECT status,source_fingerprint FROM doc_blob_ref_projections WHERE workspace_id=$1 AND doc_id=$2",
    )
    .bind(&fixture.workspace_id)
    .bind(&fixture.doc_id)
    .fetch_one(&mut *connection)
    .await?;
    drop(connection);
    assert!(
      interrupted
        .unwrap_err()
        .to_string()
        .contains("blob projection delete fault")
    );
    assert_eq!(
      refs_after, refs_before,
      "failed projection deletion must roll back reference deletion"
    );
    assert_eq!(projection_after, projection_before);
    let retained_after_failure = fixture
      .runtime
      .cleanup_unreferenced_workspace_blobs(fixture.workspace_id.clone(), 0, 100)
      .await?;
    assert_eq!(
      (
        retained_after_failure.deleted_objects,
        retained_after_failure.protected_by_doc_refs
      ),
      (0, 1)
    );
    sqlx::query(
      "INSERT INTO snapshot_histories (workspace_id,guid,blob,timestamp,expired_at) SELECT \
       workspace_id,guid,blob,updated_at,clock_timestamp()+interval '1 day' FROM snapshots WHERE workspace_id=$1 AND \
       guid=$2",
    )
    .bind(&fixture.workspace_id)
    .bind(&fixture.doc_id)
    .execute(&fixture.pool)
    .await?;
    sqlx::query("UPDATE snapshots SET blob = $3, updated_at = clock_timestamp() WHERE workspace_id = $1 AND guid = $2")
      .bind(&fixture.workspace_id)
      .bind(&fixture.doc_id)
      .bind(attachment_doc(None))
      .execute(&fixture.pool)
      .await?;
    let stale = fixture
      .runtime
      .cleanup_unreferenced_workspace_blobs(fixture.workspace_id.clone(), 0, 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!((stale.deleted_objects, stale.protected_by_metadata), (0, 1));

    fixture
      .runtime
      .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    complete_cleanup_checkpoints(&fixture.pool, &fixture.workspace_id).await?;

    let history = fixture
      .runtime
      .cleanup_unreferenced_workspace_blobs(fixture.workspace_id.clone(), 0, 100)
      .await?;
    assert_eq!((history.deleted_objects, history.protected_by_doc_refs), (0, 1));
    sqlx::query("UPDATE snapshot_histories SET expired_at=clock_timestamp()-interval '1 day' WHERE workspace_id=$1")
      .bind(&fixture.workspace_id)
      .execute(&fixture.pool)
      .await?;
    let expired = fixture
      .runtime
      .cleanup_unreferenced_workspace_blobs(fixture.workspace_id.clone(), 0, 100)
      .await?;
    assert_eq!(expired.deleted_objects, 0);
    fixture
      .runtime
      .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100)
      .await?;
    let (old_revision, old_fingerprint) = sqlx::query_as::<_, (DateTime<Utc>, String)>(
      "SELECT source_revision,source_fingerprint FROM doc_blob_ref_projections WHERE workspace_id=$1 AND doc_id=$2",
    )
    .bind(&fixture.workspace_id)
    .bind(&fixture.doc_id)
    .fetch_one(&fixture.pool)
    .await?;
    sqlx::query(
      "INSERT INTO snapshot_histories(workspace_id,guid,blob,timestamp,expired_at) VALUES($1,$2,$3,$4-interval '1 \
       day',clock_timestamp()+interval '1 day')",
    )
    .bind(&fixture.workspace_id)
    .bind(&fixture.doc_id)
    .bind(attachment_doc(Some(&fixture.blob_key)))
    .bind(old_revision)
    .execute(&fixture.pool)
    .await?;
    fixture
      .runtime
      .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100)
      .await?;
    let mut connection = fixture.pool.acquire().await?;
    let stale = super::super::doc_blob_refs::replace_doc_refs(
      &mut connection,
      &fixture.workspace_id,
      &fixture.doc_id,
      old_revision,
      &old_fingerprint,
      Vec::new(),
    )
    .await?;
    assert!(
      stale.is_none(),
      "a late source without the older retained history cannot overwrite the current projection"
    );
    drop(connection);
    let retained = fixture
      .runtime
      .cleanup_unreferenced_workspace_blobs(fixture.workspace_id.clone(), 0, 100)
      .await?;
    assert_eq!((retained.deleted_objects, retained.protected_by_doc_refs), (0, 1));
    sqlx::query("DELETE FROM doc_blob_refs WHERE workspace_id=$1 AND doc_id=$2")
      .bind(&fixture.workspace_id)
      .bind(&fixture.doc_id)
      .execute(&fixture.pool)
      .await?;
    sqlx::query("UPDATE doc_blob_ref_projections SET source_fingerprint=$3 WHERE workspace_id=$1 AND doc_id=$2")
      .bind(&fixture.workspace_id)
      .bind(&fixture.doc_id)
      .bind(old_fingerprint)
      .execute(&fixture.pool)
      .await?;
    let stale_installed = fixture
      .runtime
      .cleanup_unreferenced_workspace_blobs(fixture.workspace_id.clone(), 0, 100)
      .await?;
    assert_eq!(
      (stale_installed.deleted_objects, stale_installed.protected_by_metadata),
      (0, 1)
    );
    sqlx::query("UPDATE snapshot_histories SET expired_at=clock_timestamp()-interval '1 day' WHERE workspace_id=$1")
      .bind(&fixture.workspace_id)
      .execute(&fixture.pool)
      .await?;
    let jobs = tokio::time::timeout(std::time::Duration::from_secs(10), async {
      tokio::join!(
        fixture
          .runtime
          .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100),
        fixture
          .runtime
          .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100),
        fixture
          .runtime
          .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100),
        fixture
          .runtime
          .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100),
        fixture
          .runtime
          .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100)
      )
    })
    .await?;
    for job in [jobs.0, jobs.1, jobs.2, jobs.3, jobs.4] {
      assert_eq!(job?.failed_docs, 0);
    }
    for source_id in [
      fixture.workspace_id.clone(),
      format!("db${}$folders", fixture.workspace_id),
    ] {
      let blob = if source_id == fixture.workspace_id {
        let root = Doc::default();
        root
          .get_or_create_map("meta")?
          .insert("avatar".into(), fixture.blob_key.clone())?;
        root.encode_update_v1()?
      } else {
        attachment_doc(Some(&fixture.blob_key))
      };
      sqlx::query(
        "INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,$3,clock_timestamp()) ON \
         CONFLICT(workspace_id,guid) DO UPDATE SET blob=EXCLUDED.blob,updated_at=EXCLUDED.updated_at",
      )
      .bind(&fixture.workspace_id)
      .bind(&source_id)
      .bind(blob)
      .execute(&fixture.pool)
      .await?;
      fixture
        .runtime
        .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100)
        .await?;
      let retained = fixture
        .runtime
        .cleanup_unreferenced_workspace_blobs(fixture.workspace_id.clone(), 0, 100)
        .await?;
      assert_eq!((retained.deleted_objects, retained.protected_by_doc_refs), (0, 1));
      sqlx::query("UPDATE snapshots SET blob=$3,updated_at=clock_timestamp() WHERE workspace_id=$1 AND guid=$2")
        .bind(&fixture.workspace_id)
        .bind(&source_id)
        .bind(vec![0_u8, 0])
        .execute(&fixture.pool)
        .await?;
    }
    fixture
      .runtime
      .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100)
      .await?;
    let executed = fixture
      .runtime
      .cleanup_unreferenced_workspace_blobs(fixture.workspace_id.clone(), 0, 100)
      .await
      .map_err(|err| anyhow::anyhow!(err.to_string()))?;
    assert_eq!(
      (executed.deleted_objects, executed.deleted_metadata, executed.failed),
      (1, 1, 0)
    );
    assert!(
      fixture
        .runtime
        .head_object(
          "blob".to_string(),
          format!("{}/{}", fixture.workspace_id, fixture.blob_key)
        )
        .await
        .map_err(|err| anyhow::anyhow!(err.to_string()))?
        .is_none()
    );

    cleanup_blob_fixture(&fixture).await?;
    Ok(())
  }

  #[tokio::test]
  #[ignore = "requires DATABASE_URL and a migrated PostgreSQL database"]
  async fn blob_cleanup_projection_outdated_pending_and_failed_projections_fail_closed() -> AnyResult<()> {
    let _guard = EMBEDDING_TEST_LOCK.lock().await;
    for status in ["fresh", "pending", "failed", "partial"] {
      let fixture = blob_cleanup_fixture(false).await?;
      let _object_root = &fixture.object_root;
      fixture
        .runtime
        .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100)
        .await
        .map_err(|err| anyhow::anyhow!(err.to_string()))?;
      complete_cleanup_checkpoints(&fixture.pool, &fixture.workspace_id).await?;
      if status == "partial" {
        let doc = Doc::with_client(1);
        doc.get_or_create_text("gap")?.insert(0, "prefix")?;
        let state = doc.get_state_vector();
        doc.get_or_create_text("gap")?.insert(6, "tail")?;
        let partial = doc.encode_state_as_update_v1(&state)?;
        sqlx::query("UPDATE snapshots SET blob=$3,updated_at=clock_timestamp() WHERE workspace_id=$1 AND guid=$2")
          .bind(&fixture.workspace_id)
          .bind(&fixture.doc_id)
          .bind(partial)
          .execute(&fixture.pool)
          .await?;
        let projection = fixture
          .runtime
          .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100)
          .await?;
        assert_eq!(projection.failed_docs, 1);
      }
      sqlx::query(
        "UPDATE doc_blob_ref_projections SET parser_version = 1, status = $3 WHERE workspace_id = $1 AND doc_id = $2",
      )
      .bind(&fixture.workspace_id)
      .bind(&fixture.doc_id)
      .bind(if status == "partial" { "failed" } else { status })
      .execute(&fixture.pool)
      .await?;

      let blocked_plan = fixture
        .runtime
        .cleanup_unreferenced_workspace_blobs(fixture.workspace_id.clone(), 0, 100)
        .await
        .map_err(|err| anyhow::anyhow!(err.to_string()))?;
      assert_eq!(
        (blocked_plan.deleted_objects, blocked_plan.protected_by_metadata),
        (0, 1)
      );

      if status == "partial" {
        sqlx::query("UPDATE snapshots SET blob=$3,updated_at=clock_timestamp() WHERE workspace_id=$1 AND guid=$2")
          .bind(&fixture.workspace_id)
          .bind(&fixture.doc_id)
          .bind(attachment_doc(None))
          .execute(&fixture.pool)
          .await?;
      }
      fixture
        .runtime
        .rebuild_workspace_doc_blob_refs(fixture.workspace_id.clone(), 100)
        .await?;
      complete_cleanup_checkpoints(&fixture.pool, &fixture.workspace_id).await?;
      assert!(
        fixture
          .runtime
          .head_object(
            "blob".to_string(),
            format!("{}/{}", fixture.workspace_id, fixture.blob_key)
          )
          .await
          .map_err(|err| anyhow::anyhow!(err.to_string()))?
          .is_some()
      );
      let executed = fixture
        .runtime
        .cleanup_unreferenced_workspace_blobs(fixture.workspace_id.clone(), 0, 100)
        .await
        .map_err(|err| anyhow::anyhow!(err.to_string()))?;
      assert_eq!(
        (executed.deleted_objects, executed.deleted_metadata, executed.failed),
        (1, 1, 0)
      );
      cleanup_blob_fixture(&fixture).await?;
    }
    Ok(())
  }
}
