use sqlx::PgPool;

use super::{RuntimeError, RuntimeResult};

pub(crate) const RUNTIME_MIGRATIONS: &str = include_str!("sql/runtime_migrations.sql");

pub(crate) async fn migrate_runtime_tables(pool: &PgPool) -> RuntimeResult<()> {
  for statement in RUNTIME_MIGRATIONS
    .split(';')
    .map(str::trim)
    .filter(|statement| !statement.is_empty())
  {
    sqlx::query(statement)
      .execute(pool)
      .await
      .map_err(|err| RuntimeError::database("Runtime migration failed", err))?;
  }

  Ok(())
}
