use sha2::{Digest, Sha256};
use sqlx::{Executor, PgPool, Row};

use super::{RuntimeError, RuntimeResult, types::EmbeddingHealth};

pub(crate) const RUNTIME_MIGRATIONS: &str = include_str!("sql/runtime_migrations.sql");
const EMBEDDING_MIGRATION: &str = include_str!("sql/embedding.sql");
const SEARCH_PROJECTION_MIGRATION: &str = include_str!("sql/search_projection.sql");
const EMBEDDING_ADVISORY_LOCK: i64 = 0x4146_4649_4e45_0046;
const SEARCH_ADVISORY_LOCK: i64 = 0x4146_4649_4e45_0053;
#[cfg(test)]
pub(crate) static EMBEDDING_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub(crate) async fn migrate_runtime_tables(pool: &PgPool) -> RuntimeResult<()> {
  sqlx::raw_sql(RUNTIME_MIGRATIONS)
    .execute(pool)
    .await
    .map_err(|error| RuntimeError::database("Runtime migration failed", error))?;
  Ok(())
}

pub(crate) async fn migrate_all_tables(pool: &PgPool) -> RuntimeResult<EmbeddingHealth> {
  migrate_runtime_tables(pool).await?;
  let embedding = migrate_embedding_tables_inner(pool).await?;
  migrate_search_tables(pool).await?;
  Ok(embedding)
}

#[cfg(test)]
pub(crate) async fn migrate_embedding_tables(pool: &PgPool) -> EmbeddingHealth {
  match migrate_embedding_tables_inner(pool).await {
    Ok(health) => health,
    Err(_) => EmbeddingHealth::disabled("schema_migration_failed", pgvector_version(pool).await.ok().flatten()),
  }
}

pub(crate) async fn embedding_schema_health(pool: &PgPool) -> RuntimeResult<EmbeddingHealth> {
  let Some(version) = pgvector_version(pool).await? else {
    return Ok(EmbeddingHealth::disabled("pgvector_unavailable", None));
  };
  if !pgvector_at_least_0_8(&version) {
    return Ok(EmbeddingHealth::disabled("pgvector_version_unsupported", Some(version)));
  }

  let schema_ready: bool = sqlx::query_scalar(
    "SELECT to_regclass('embedding_workspace_states') IS NOT NULL
      AND to_regclass('embedding_indexes') IS NOT NULL
      AND to_regclass('embedding_sources') IS NOT NULL
      AND to_regclass('embedding_projections') IS NOT NULL
      AND to_regclass('embedding_chunks') IS NOT NULL",
  )
  .fetch_one(pool)
  .await
  .map_err(|error| RuntimeError::database("Embedding schema health check failed", error))?;
  if !schema_ready {
    return Ok(EmbeddingHealth::disabled("schema_not_migrated", Some(version)));
  }

  Ok(EmbeddingHealth {
    enabled: true,
    state: "ready".to_string(),
    reason: None,
    pgvector_version: Some(version),
    schema_version: Some(1),
    worker_running: false,
  })
}

pub(crate) async fn migrate_search_tables(pool: &PgPool) -> RuntimeResult<()> {
  migrate_component(
    pool,
    "search_projection",
    SEARCH_ADVISORY_LOCK,
    &[(1, &[SEARCH_PROJECTION_MIGRATION])],
  )
  .await?;
  Ok(())
}

async fn migrate_embedding_tables_inner(pool: &PgPool) -> RuntimeResult<EmbeddingHealth> {
  let Some(version) = pgvector_version(pool).await? else {
    return Ok(EmbeddingHealth::disabled("pgvector_unavailable", None));
  };
  if !pgvector_at_least_0_8(&version) {
    return Ok(EmbeddingHealth::disabled("pgvector_version_unsupported", Some(version)));
  }

  migrate_component(
    pool,
    "embedding",
    EMBEDDING_ADVISORY_LOCK,
    &[(1, &[EMBEDDING_MIGRATION])],
  )
  .await?;

  Ok(EmbeddingHealth {
    enabled: true,
    state: "ready".to_string(),
    reason: None,
    pgvector_version: Some(version),
    schema_version: Some(1),
    worker_running: false,
  })
}

async fn migrate_component(
  pool: &PgPool,
  component: &str,
  advisory_lock: i64,
  migrations: &[(i32, &[&str])],
) -> RuntimeResult<()> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("Native migration transaction failed", error))?;
  transaction
    .execute("SET LOCAL lock_timeout = '5s'")
    .await
    .map_err(|error| RuntimeError::database("Native migration lock timeout failed", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock($1)")
    .bind(advisory_lock)
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("Native migration lock failed", error))?;
  transaction
    .execute(
      r#"CREATE TABLE IF NOT EXISTS native_schema_migrations (
        component TEXT NOT NULL,
        version INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (component, version)
      )"#,
    )
    .await
    .map_err(|error| RuntimeError::database("Native migration ledger failed", error))?;

  for (version, statements) in migrations {
    apply_migration(&mut transaction, component, *version, statements).await?;
  }
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("Native migration commit failed", error))
}

async fn apply_migration(
  transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  component: &str,
  version: i32,
  statements: &[&str],
) -> RuntimeResult<()> {
  let checksum = migration_checksum(statements);
  let applied = sqlx::query("SELECT checksum FROM native_schema_migrations WHERE component=$1 AND version=$2")
    .bind(component)
    .bind(version)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("Native migration ledger read failed", error))?;
  if let Some(applied) = applied {
    let stored: String = applied
      .try_get("checksum")
      .map_err(|error| RuntimeError::database("Native migration checksum decode failed", error))?;
    if stored != checksum {
      return Err(RuntimeError::invalid_state("Native migration checksum mismatch"));
    }
    return Ok(());
  }
  for statement in statements {
    transaction
      .execute(*statement)
      .await
      .map_err(|error| RuntimeError::database("Native component migration failed", error))?;
  }
  sqlx::query("INSERT INTO native_schema_migrations(component,version,checksum) VALUES($1,$2,$3)")
    .bind(component)
    .bind(version)
    .bind(checksum)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("Native migration record failed", error))?;
  Ok(())
}

fn migration_checksum(statements: &[&str]) -> String {
  hex::encode(Sha256::digest(
    statements
      .iter()
      .flat_map(|statement| statement.as_bytes())
      .copied()
      .collect::<Vec<_>>(),
  ))
}

async fn pgvector_version(pool: &PgPool) -> RuntimeResult<Option<String>> {
  sqlx::query_scalar("SELECT extversion FROM pg_extension WHERE extname='vector'")
    .fetch_optional(pool)
    .await
    .map_err(|error| RuntimeError::database("pgvector capability check failed", error))
}

fn pgvector_at_least_0_8(version: &str) -> bool {
  let mut parts = version.split('.');
  let major = parts.next().and_then(|part| part.parse::<u32>().ok());
  let minor = parts.next().and_then(|part| part.parse::<u32>().ok());
  matches!((major, minor), (Some(major), Some(minor)) if major > 0 || minor >= 8)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn pgvector_version_gate_requires_0_8() {
    for (version, expected) in [("0.7.4", false), ("0.8.0", true), ("0.8.5", true), ("1.0.0", true)] {
      assert_eq!(pgvector_at_least_0_8(version), expected, "{version}");
    }
  }

  #[test]
  fn embedding_schema_has_five_live_tables() {
    let live_tables = [
      "embedding_workspace_states",
      "embedding_indexes",
      "embedding_sources",
      "embedding_projections",
      "embedding_chunks",
    ];
    assert_eq!(EMBEDDING_MIGRATION.matches("CREATE TABLE embedding_").count(), 5);
    for table in live_tables {
      assert!(EMBEDDING_MIGRATION.contains(&format!("CREATE TABLE {table}")));
    }
    assert!(EMBEDDING_MIGRATION.contains("source_kind IN ('document', 'artifact')"));
  }

  #[tokio::test]
  async fn embedding_migration_records_exact_schema() {
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let _guard = EMBEDDING_TEST_LOCK.lock().await;
    let pool = PgPool::connect(&database_url).await.unwrap();
    let health = migrate_embedding_tables_inner(&pool).await.unwrap();
    assert_eq!(health.schema_version, Some(1));
    let tables: Vec<String> = sqlx::query_scalar(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'embedding_%' ORDER BY tablename",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
      tables,
      vec![
        "embedding_chunks",
        "embedding_indexes",
        "embedding_projections",
        "embedding_sources",
        "embedding_workspace_states",
      ]
    );
    let dimensions: i32 = sqlx::query_scalar(
      "SELECT atttypmod FROM pg_attribute WHERE attrelid='embedding_chunks'::regclass AND attname='embedding'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(dimensions, 1024);
  }

  #[test]
  fn search_schema_uses_terminal_control_plane() {
    assert!(SEARCH_PROJECTION_MIGRATION.contains("DROP SCHEMA IF EXISTS search_projection CASCADE"));
    assert!(SEARCH_PROJECTION_MIGRATION.contains("CREATE SCHEMA search_projection"));
    assert!(SEARCH_PROJECTION_MIGRATION.contains("CREATE TABLE search_projection.generations"));
    assert!(SEARCH_PROJECTION_MIGRATION.contains("CREATE TABLE search_projection.workspace_states"));
    assert!(SEARCH_PROJECTION_MIGRATION.contains("CREATE TABLE search_projection.document_states"));
    assert!(
      SEARCH_PROJECTION_MIGRATION.contains("CREATE SEQUENCE IF NOT EXISTS search_projection.source_mutation_version")
    );
    assert!(SEARCH_PROJECTION_MIGRATION.contains("CREATE SEQUENCE IF NOT EXISTS search_projection.permission_version"));
    assert!(SEARCH_PROJECTION_MIGRATION.contains("CREATE SEQUENCE IF NOT EXISTS search_projection.claim_fence"));
    assert!(SEARCH_PROJECTION_MIGRATION.contains("CREATE TRIGGER search_projection_snapshot_capture"));
    assert!(SEARCH_PROJECTION_MIGRATION.contains("CREATE TRIGGER search_projection_membership_capture"));
    assert!(SEARCH_PROJECTION_MIGRATION.contains("ON CONFLICT (generation_id, workspace_id, doc_id) DO UPDATE"));
    assert!(SEARCH_PROJECTION_MIGRATION.contains("WHERE state IN ('building', 'active')"));
    assert!(SEARCH_PROJECTION_MIGRATION.contains("target_source_version <> published_source_version"));
    assert!(SEARCH_PROJECTION_MIGRATION.contains("gc_table TEXT NOT NULL DEFAULT 'doc'"));
    assert!(SEARCH_PROJECTION_MIGRATION.contains("gc_cursor TEXT"));
    assert!(
      SEARCH_PROJECTION_MIGRATION
        .contains("NEW.state = 'active' AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM NEW.state)")
    );
    assert!(!SEARCH_PROJECTION_MIGRATION.contains("clock_timestamp()"));
    assert!(!SEARCH_PROJECTION_MIGRATION.contains("CREATE TABLE search_runtime_projections"));
    assert!(!SEARCH_PROJECTION_MIGRATION.contains("payload JSONB NOT NULL"));
    assert!(SEARCH_PROJECTION_MIGRATION.contains("search_workspace_reconcile_failed"));
  }

  #[tokio::test]
  async fn concurrent_search_migration_is_idempotent() {
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    let (first, second) = tokio::join!(migrate_search_tables(&pool), migrate_search_tables(&pool));
    first.unwrap();
    second.unwrap();
    let versions: Vec<i32> = sqlx::query_scalar(
      "SELECT version FROM native_schema_migrations WHERE component='search_projection' ORDER BY version",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(versions, vec![1]);
  }

  #[tokio::test]
  async fn permission_triggers_route_and_coalesce_document_and_workspace_scopes() {
    let _guard = crate::runtime::backend_runtime::SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    migrate_search_tables(&pool).await.unwrap();
    sqlx::query("DELETE FROM search_projection.generations WHERE state='building'")
      .execute(&pool)
      .await
      .unwrap();

    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let generation_id = uuid::Uuid::new_v4();
    let workspace_id = format!("trigger-workspace-{suffix}");
    let doc_id = format!("trigger-doc-{suffix}");
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      r#"INSERT INTO search_projection.generations(id,provider,state,config_hash,schema_version)
         VALUES($1,'embedded','building',decode(repeat('00',32),'hex'),1)"#,
    )
    .bind(generation_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO search_projection.workspace_states(generation_id,workspace_id,covered,pending_scope) \
       VALUES($1,$2,true,'none')",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,decode('00','hex'),now())")
      .bind(&workspace_id)
      .bind(&doc_id)
      .execute(&pool)
      .await
      .unwrap();

    sqlx::query(
      "INSERT INTO doc_access_policies(workspace_id,doc_id,visibility,member_default_role) \
       VALUES($1,$2,'private','none')",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE doc_access_policies SET member_default_role='reader' WHERE workspace_id=$1 AND doc_id=$2")
      .bind(&workspace_id)
      .bind(&doc_id)
      .execute(&pool)
      .await
      .unwrap();
    let document_scope: (String, i64) = sqlx::query_as(
      r#"SELECT state.pending_scope,count(task.doc_id)
         FROM search_projection.workspace_states state
         LEFT JOIN search_projection.document_states task
           ON task.generation_id=state.generation_id AND task.workspace_id=state.workspace_id
         WHERE state.generation_id=$1 AND state.workspace_id=$2
         GROUP BY state.pending_scope"#,
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(document_scope, ("none".to_string(), 1));

    let moved_workspace_id = format!("trigger-moved-workspace-{suffix}");
    let moved_doc_id = format!("trigger-moved-doc-{suffix}");
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&moved_workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,decode('00','hex'),now())")
      .bind(&moved_workspace_id)
      .bind(&moved_doc_id)
      .execute(&pool)
      .await
      .unwrap();
    let old_version: i64 = sqlx::query_scalar(
      "SELECT target_permission_version FROM search_projection.document_states WHERE generation_id=$1 AND \
       workspace_id=$2 AND doc_id=$3",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .bind(&doc_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let moved_version: i64 = sqlx::query_scalar(
      "SELECT target_permission_version FROM search_projection.document_states WHERE generation_id=$1 AND \
       workspace_id=$2 AND doc_id=$3",
    )
    .bind(generation_id)
    .bind(&moved_workspace_id)
    .bind(&moved_doc_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE doc_access_policies SET workspace_id=$3,doc_id=$4 WHERE workspace_id=$1 AND doc_id=$2")
      .bind(&workspace_id)
      .bind(&doc_id)
      .bind(&moved_workspace_id)
      .bind(&moved_doc_id)
      .execute(&pool)
      .await
      .unwrap();
    let versions: (i64, i64) = sqlx::query_as(
      r#"SELECT
           (SELECT target_permission_version FROM search_projection.document_states
            WHERE generation_id=$1 AND workspace_id=$2 AND doc_id=$3),
           (SELECT target_permission_version FROM search_projection.document_states
            WHERE generation_id=$1 AND workspace_id=$4 AND doc_id=$5)"#,
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(&moved_workspace_id)
    .bind(&moved_doc_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(versions.0 > old_version);
    assert!(versions.1 > moved_version);

    sqlx::query("INSERT INTO workspace_access_policies(workspace_id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    let pending_scope: String = sqlx::query_scalar(
      "SELECT pending_scope FROM search_projection.workspace_states WHERE generation_id=$1 AND workspace_id=$2",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(pending_scope, "workspace");

    sqlx::query("DELETE FROM search_projection.generations WHERE id=$1")
      .bind(generation_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&moved_workspace_id)
      .execute(&pool)
      .await
      .unwrap();
  }

  #[tokio::test]
  async fn source_mutations_use_unique_versions_and_rollback_only_leaves_a_sequence_gap() {
    let _guard = crate::runtime::backend_runtime::SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    migrate_search_tables(&pool).await.unwrap();
    sqlx::query("DELETE FROM search_projection.generations WHERE state='building'")
      .execute(&pool)
      .await
      .unwrap();

    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let generation_id = uuid::Uuid::new_v4();
    let workspace_id = format!("source-version-workspace-{suffix}");
    let doc_id = format!("source-version-doc-{suffix}");
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      r#"INSERT INTO search_projection.generations(id,provider,state,config_hash,schema_version)
         VALUES($1,'embedded','building',decode(repeat('00',32),'hex'),1)"#,
    )
    .bind(generation_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO search_projection.workspace_states(generation_id,workspace_id,pending_scope) VALUES($1,$2,'none')",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
      "INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,decode('00','hex'),'2026-01-01 UTC')",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .execute(&pool)
    .await
    .unwrap();
    let inserted: i64 = sqlx::query_scalar(
      "SELECT target_source_version FROM search_projection.document_states WHERE generation_id=$1 AND workspace_id=$2 \
       AND doc_id=$3",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .bind(&doc_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE snapshots SET blob=decode('01','hex') WHERE workspace_id=$1 AND guid=$2")
      .bind(&workspace_id)
      .bind(&doc_id)
      .execute(&pool)
      .await
      .unwrap();
    let updated: i64 = sqlx::query_scalar(
      "SELECT target_source_version FROM search_projection.document_states WHERE generation_id=$1 AND workspace_id=$2 \
       AND doc_id=$3",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .bind(&doc_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(updated > inserted);

    sqlx::query("DELETE FROM snapshots WHERE workspace_id=$1 AND guid=$2")
      .bind(&workspace_id)
      .bind(&doc_id)
      .execute(&pool)
      .await
      .unwrap();
    let (deleted, target_exists, published_exists): (i64, bool, bool) = sqlx::query_as(
      "SELECT target_source_version,target_source_exists,published_source_exists FROM \
       search_projection.document_states WHERE generation_id=$1 AND workspace_id=$2 AND doc_id=$3",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .bind(&doc_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(deleted > updated);
    assert!(!target_exists);
    assert!(!published_exists);

    sqlx::query(
      "INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,decode('02','hex'),'2026-01-01 UTC')",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .execute(&pool)
    .await
    .unwrap();
    let recreated: i64 = sqlx::query_scalar(
      "SELECT target_source_version FROM search_projection.document_states WHERE generation_id=$1 AND workspace_id=$2 \
       AND doc_id=$3",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .bind(&doc_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(recreated > deleted);

    let mut transaction = pool.begin().await.unwrap();
    sqlx::query("UPDATE snapshots SET blob=decode('03','hex') WHERE workspace_id=$1 AND guid=$2")
      .bind(&workspace_id)
      .bind(&doc_id)
      .execute(&mut *transaction)
      .await
      .unwrap();
    let rolled_back: i64 = sqlx::query_scalar(
      "SELECT target_source_version FROM search_projection.document_states WHERE generation_id=$1 AND workspace_id=$2 \
       AND doc_id=$3",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .bind(&doc_id)
    .fetch_one(&mut *transaction)
    .await
    .unwrap();
    transaction.rollback().await.unwrap();
    let after_rollback: i64 = sqlx::query_scalar(
      "SELECT target_source_version FROM search_projection.document_states WHERE generation_id=$1 AND workspace_id=$2 \
       AND doc_id=$3",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .bind(&doc_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(after_rollback, recreated);
    assert!(rolled_back > recreated);

    sqlx::query("UPDATE snapshots SET blob=decode('04','hex') WHERE workspace_id=$1 AND guid=$2")
      .bind(&workspace_id)
      .bind(&doc_id)
      .execute(&pool)
      .await
      .unwrap();
    let after_gap: i64 = sqlx::query_scalar(
      "SELECT target_source_version FROM search_projection.document_states WHERE generation_id=$1 AND workspace_id=$2 \
       AND doc_id=$3",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .bind(&doc_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(after_gap > rolled_back);

    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    let (remaining_states, delete_gc_scheduled): (i64, bool) = sqlx::query_as(
      r#"SELECT count(*),bool_and(progress->>'kind'='deleted')
         FROM search_projection.workspace_states WHERE generation_id=$1 AND workspace_id=$2"#,
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(remaining_states, 1);
    assert!(delete_gc_scheduled);
    sqlx::query("DELETE FROM search_projection.generations WHERE id=$1")
      .bind(generation_id)
      .execute(&pool)
      .await
      .unwrap();
  }
}
