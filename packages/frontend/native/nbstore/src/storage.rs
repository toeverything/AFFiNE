use affine_schema::get_migrator;
use sqlx::{
  migrate::MigrateDatabase,
  sqlite::{Sqlite, SqliteConnectOptions, SqlitePoolOptions},
  Pool, Row,
};

use super::error::Result;

pub struct SqliteDocStorage {
  pub pool: Pool<Sqlite>,
  path: String,
}

impl SqliteDocStorage {
  pub fn new(path: String) -> Self {
    let sqlite_options = SqliteConnectOptions::new()
      .filename(&path)
      .foreign_keys(false);

    let mut pool_options = SqlitePoolOptions::new();

    if path == ":memory:" {
      pool_options = pool_options
        .min_connections(1)
        .max_connections(1)
        .idle_timeout(None)
        .max_lifetime(None);

      Self {
        pool: pool_options.connect_lazy_with(sqlite_options),
        path,
      }
    } else {
      Self {
        pool: pool_options
          .max_connections(4)
          .connect_lazy_with(sqlite_options.journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)),
        path,
      }
    }
  }

  pub async fn validate(&self) -> Result<bool> {
    let record = sqlx::query("SELECT * FROM _sqlx_migrations ORDER BY installed_on ASC LIMIT 1;")
      .fetch_optional(&self.pool)
      .await;

    match record {
      Ok(Some(row)) => {
        let name: &str = row.try_get("description")?;
        Ok(name == "init_v2")
      }
      _ => Ok(false),
    }
  }

  pub async fn connect(&self) -> Result<()> {
    if !Sqlite::database_exists(&self.path).await? {
      Sqlite::create_database(&self.path).await?;
    };

    self.migrate().await?;

    Ok(())
  }

  async fn migrate(&self) -> Result<()> {
    let migrator = get_migrator();
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

    storage
  }

  #[tokio::test]
  async fn init_tables() {
    let storage = get_storage().await;

    sqlx::query("INSERT INTO meta (space_id) VALUES ($1);")
      .bind("test")
      .execute(&storage.pool)
      .await
      .unwrap();

    let record = sqlx::query!("SELECT space_id FROM meta;")
      .fetch_one(&storage.pool)
      .await
      .unwrap();

    assert_eq!(record.space_id, "test");
  }

  #[tokio::test]
  async fn validate_db() {
    let storage = get_storage().await;
    assert!(storage.validate().await.unwrap());

    let storage = SqliteDocStorage::new(":memory:".to_string());
    assert!(!storage.validate().await.unwrap());
  }
}
