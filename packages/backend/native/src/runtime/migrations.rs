use sha2::{Digest, Sha256};
use sqlx::{Executor, PgPool, Row};

use super::{RuntimeError, RuntimeResult, types::EmbeddingHealth};

pub(crate) const RUNTIME_MIGRATIONS: &str = include_str!("sql/runtime_migrations.sql");
const EMBEDDING_MIGRATION: &str = include_str!("sql/embedding.sql");
const SEARCH_MIGRATION: &str = include_str!("sql/search.sql");
const SEARCH_ACL_TOKEN_MIGRATION: &str = include_str!("sql/search_acl_tokens.sql");
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
    "search",
    SEARCH_ADVISORY_LOCK,
    &[(1, &[SEARCH_MIGRATION]), (2, &[SEARCH_ACL_TOKEN_MIGRATION])],
  )
  .await?;
  sqlx::query("INSERT INTO search_runtime_streams(table_key) VALUES ('doc'), ('block') ON CONFLICT DO NOTHING")
    .execute(pool)
    .await
    .map_err(|error| RuntimeError::database("Repair search runtime streams", error))?;
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
  fn search_schema_uses_transactional_stream_heads() {
    assert!(SEARCH_MIGRATION.contains("CREATE TABLE search_runtime_streams"));
    assert!(SEARCH_MIGRATION.contains("PRIMARY KEY (table_key, stream_sequence)"));
    assert!(!SEARCH_MIGRATION.contains("BIGSERIAL"));
    assert!(!SEARCH_MIGRATION.contains("CREATE SEQUENCE"));
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
    let versions: Vec<i32> =
      sqlx::query_scalar("SELECT version FROM native_schema_migrations WHERE component='search' ORDER BY version")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(versions, vec![1, 2]);
  }
}
