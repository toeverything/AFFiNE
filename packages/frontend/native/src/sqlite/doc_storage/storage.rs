use std::path::PathBuf;

use sqlx::{
  migrate::{MigrateDatabase, Migrator},
  sqlite::{Sqlite, SqliteConnectOptions, SqlitePoolOptions},
  ConnectOptions, Pool,
};

pub type Result<T> = std::result::Result<T, sqlx::Error>;

pub struct SqliteDocStorage {
  pub pool: Pool<Sqlite>,
  path: String,
}

impl SqliteDocStorage {
  pub fn new(path: String) -> Self {
    let sqlite_options = SqliteConnectOptions::new()
      .filename(&path)
      .foreign_keys(false)
      .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
      .log_statements(log::LevelFilter::Trace);

    let mut pool_options = SqlitePoolOptions::new();

    if cfg!(test) && path == ":memory:" {
      pool_options = pool_options
        .min_connections(1)
        .max_connections(1)
        .idle_timeout(None)
        .max_lifetime(None);
    } else {
      pool_options = pool_options.max_connections(4);
    }

    Self {
      pool: pool_options.connect_lazy_with(sqlite_options),
      path,
    }
  }

  pub async fn connect(&self) -> Result<()> {
    if !Sqlite::database_exists(&self.path).await.unwrap_or(false) {
      Sqlite::create_database(&self.path).await?;
    };

    Ok(())
  }

  #[cfg(test)]
  pub async fn test_migrate(&self) -> Result<()> {
    let migrator = Migrator::new(std::env::current_dir().unwrap().join("migrations")).await?;
    migrator.run(&self.pool).await?;

    Ok(())
  }

  pub async fn migrate(&self, migrations: PathBuf) -> Result<()> {
    let migrator = Migrator::new(migrations.as_path()).await?;
    migrator.run(&self.pool).await?;

    Ok(())
  }

  pub async fn close(&self) {
    self.pool.close().await
  }

  pub fn is_closed(&self) -> bool {
    self.pool.is_closed()
  }

  ///
  /// Flush the WAL file to the database file.
  /// See https://www.sqlite.org/pragma.html#pragma_wal_checkpoint:~:text=PRAGMA%20schema.wal_checkpoint%3B
  ///
  pub async fn checkpoint(&self) -> Result<()> {
    sqlx::query("PRAGMA wal_checkpoint(FULL);")
      .execute(&self.pool)
      .await?;

    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  async fn get_storage() -> SqliteDocStorage {
    let storage = SqliteDocStorage::new(":memory:".to_string());
    storage.connect().await.unwrap();
    storage.test_migrate().await.unwrap();

    storage
  }

  #[tokio::test]
  async fn init_tables() {
    let storage = get_storage().await;

    sqlx::query("INSERT INTO v2_meta (space_id) VALUES ($1);")
      .bind("test")
      .execute(&storage.pool)
      .await
      .unwrap();

    let record = sqlx::query!("SELECT space_id FROM v2_meta;")
      .fetch_one(&storage.pool)
      .await
      .unwrap();

    assert_eq!(record.space_id, "test");
  }
}
