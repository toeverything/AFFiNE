use sqlx::PgPool;

use super::{RuntimeError, RuntimeResult};

pub(crate) const RUNTIME_MIGRATIONS: &str = include_str!("sql/runtime_migrations.sql");

pub(crate) async fn migrate_runtime_tables(pool: &PgPool) -> RuntimeResult<()> {
  sqlx::raw_sql(RUNTIME_MIGRATIONS)
    .execute(pool)
    .await
    .map_err(|err| RuntimeError::database("Runtime migration failed", err))?;

  Ok(())
}
