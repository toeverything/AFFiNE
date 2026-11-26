//! Schema readiness engine (`ensure_schema_ready`): holds the schema advisory
//! lock on a dedicated session, brings the database to the `v0.27.5` Prisma
//! baseline through `phase_a_compat::prisma_baseline`, and applies the native
//! component migrations recorded in `native_schema_migrations`.

use sqlx::{Connection as _, Executor as _};

pub use crate::phase_a_compat::prisma_baseline::{
  apply_migration_sql_and_record_in_tx, bundled_0275_migration_manifest, strip_top_level_tx_control,
};
use crate::{DbError, ServerDb, phase_a_compat};

include!(concat!(env!("OUT_DIR"), "/bundled_migrations.rs"));

const SCHEMA_READY_ADVISORY_LOCK: i64 = 0x4146_4649_4e45_0275;
pub(crate) const MIGRATION_LOCK_TIMEOUT_SQL: &str = "SET LOCAL lock_timeout = '5s'";
const NATIVE_RUNTIME_COMPONENT: &str = "server_db_runtime";

struct NativeMigration {
  component: &'static str,
  version: i32,
  checksum: &'static str,
  sql: &'static str,
}

const NATIVE_RUNTIME_MIGRATIONS: &[NativeMigration] = &[NativeMigration {
  component: NATIVE_RUNTIME_COMPONENT,
  version: 1,
  checksum: BUNDLED_RUNTIME_MIGRATIONS_CHECKSUM,
  sql: BUNDLED_RUNTIME_MIGRATIONS_SQL,
}];

async fn pgvector_at_least_0_8(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<bool, DbError> {
  let version: Option<String> = sqlx::query_scalar("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
    .fetch_optional(&mut **tx)
    .await?;
  let Some(version) = version else {
    return Ok(false);
  };
  let mut parts = version.split('.');
  let major = parts.next().and_then(|p| p.parse::<u32>().ok());
  let minor = parts.next().and_then(|p| p.parse::<u32>().ok());
  Ok(matches!((major, minor), (Some(maj), Some(min)) if maj > 0 || min >= 8))
}

pub(crate) async fn apply_all_native_component_migrations_in_tx(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
) -> Result<(), DbError> {
  apply_native_migrations_in_tx(tx, NATIVE_RUNTIME_MIGRATIONS).await?;

  if pgvector_at_least_0_8(tx).await? {
    let embedding: Vec<NativeMigration> = BUNDLED_EMBEDDING_MIGRATIONS
      .iter()
      .map(|m| NativeMigration {
        component: "embedding",
        version: m.version,
        checksum: m.checksum,
        sql: m.sql,
      })
      .collect();
    apply_native_migrations_in_tx(tx, &embedding).await?;
  }

  let search: Vec<NativeMigration> = BUNDLED_SEARCH_PROJECTION_MIGRATIONS
    .iter()
    .map(|m| NativeMigration {
      component: "search_projection",
      version: m.version,
      checksum: m.checksum,
      sql: m.sql,
    })
    .collect();
  apply_native_migrations_in_tx(tx, &search).await?;

  Ok(())
}

const CREATE_NATIVE_SCHEMA_MIGRATIONS_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS native_schema_migrations (
  component  TEXT NOT NULL,
  version    INTEGER NOT NULL,
  checksum   TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (component, version)
)
"#;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SchemaReadiness {
  InitializedFresh0275 { applied_migrations: usize },
  ReadyExisting0275 { verified_migrations: usize },
}

/// Ensures `native_schema_migrations` exists, verifies any already-recorded
/// contiguous prefix checksums for `component`, skips already-recorded
/// migrations without re-executing their SQL, and applies any remaining ones.
async fn apply_native_migrations_in_tx(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  migrations: &[NativeMigration],
) -> Result<usize, DbError> {
  sqlx::query(MIGRATION_LOCK_TIMEOUT_SQL).execute(&mut **tx).await?;
  tx.execute(CREATE_NATIVE_SCHEMA_MIGRATIONS_TABLE_SQL).await?;
  let Some(first) = migrations.first() else {
    return Ok(0);
  };
  let component = first.component;

  let recorded: Vec<(i32, String)> = sqlx::query_as(
    "SELECT version, checksum
     FROM native_schema_migrations
     WHERE component = $1
     ORDER BY version ASC",
  )
  .bind(component)
  .fetch_all(&mut **tx)
  .await?;

  for ((actual_version, actual_checksum), expected) in recorded.iter().zip(migrations.iter()) {
    if *actual_version != expected.version {
      return Err(DbError::SchemaCheck(format!(
        "native_schema_migrations for {component} is not a contiguous prefix: expected version {}, got {actual_version}",
        expected.version
      )));
    }
    if actual_checksum != expected.checksum {
      return Err(DbError::SchemaCheck(format!(
        "native_schema_migrations checksum mismatch for {component} v{}: expected {}, got {actual_checksum}",
        expected.version, expected.checksum
      )));
    }
  }

  if recorded.len() >= migrations.len() {
    return Ok(0);
  }

  let mut applied_now = 0usize;
  for migration in &migrations[recorded.len()..] {
    let sanitized = strip_top_level_tx_control(migration.sql);
    if !sanitized.trim().is_empty() {
      sqlx::raw_sql(&sanitized).execute(&mut **tx).await.map_err(|e| {
        DbError::SchemaCheck(format!(
          "failed applying native migration {} v{}: {e}",
          migration.component, migration.version
        ))
      })?;
    }
    sqlx::query(
      "INSERT INTO native_schema_migrations (component, version, checksum)
       VALUES ($1, $2, $3)",
    )
    .bind(migration.component)
    .bind(migration.version)
    .bind(migration.checksum)
    .execute(&mut **tx)
    .await?;
    applied_now += 1;
  }

  Ok(applied_now)
}

pub(crate) async fn ensure_schema_ready_impl(db: &ServerDb) -> Result<SchemaReadiness, DbError> {
  let mut conn = db.dedicated_session_conn().await?;
  // Allow enough time for full fresh-DB baseline DDL on slower hosts.
  let locked = async {
    sqlx::query("SET statement_timeout = '120s'").execute(&mut conn).await?;
    sqlx::query("SELECT pg_advisory_lock($1)")
      .bind(SCHEMA_READY_ADVISORY_LOCK)
      .execute(&mut conn)
      .await
  }
  .await;
  if let Err(e) = locked {
    let _ = conn.close().await;
    return Err(e.into());
  }

  let outcome =
    phase_a_compat::prisma_baseline::ensure_0275_baseline_and_native_schema(&mut conn, db.role(), db.selfhosted())
      .await;

  let _ = sqlx::query("SELECT pg_advisory_unlock($1)")
    .bind(SCHEMA_READY_ADVISORY_LOCK)
    .execute(&mut conn)
    .await;
  let _ = conn.close().await;

  outcome
}
