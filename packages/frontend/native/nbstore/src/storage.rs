use std::sync::Arc;

use affine_schema::get_migrator;
use memory_indexer::InMemoryIndex;
use sqlx::{
  Pool, Row,
  migrate::{MigrateDatabase, Migration, Migrator},
  sqlite::{Sqlite, SqliteConnectOptions, SqlitePoolOptions},
};
use tokio::sync::RwLock;

use super::error::Result;

pub struct SqliteDocStorage {
  pub pool: Pool<Sqlite>,
  path: String,
  pub index: Arc<RwLock<InMemoryIndex>>,
}

impl SqliteDocStorage {
  pub fn new(path: String) -> Self {
    let sqlite_options = SqliteConnectOptions::new().filename(&path).foreign_keys(false);

    let mut pool_options = SqlitePoolOptions::new();

    let index = Arc::new(RwLock::new(InMemoryIndex::default()));

    if path == ":memory:" {
      pool_options = pool_options
        .min_connections(1)
        .max_connections(1)
        .idle_timeout(None)
        .max_lifetime(None);

      Self {
        pool: pool_options.connect_lazy_with(sqlite_options),
        path,
        index,
      }
    } else {
      Self {
        pool: pool_options
          .max_connections(4)
          .connect_lazy_with(sqlite_options.journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)),
        path,
        index,
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
    self.init_index().await?;

    Ok(())
  }

  async fn migrate(&self) -> Result<()> {
    let migrator = get_migrator();
    if let Err(err) = migrator.run(&self.pool).await {
      // Compatibility: migration 3 (`add_idx_snapshots`) had a whitespace-only SQL
      // change (trailing space) between releases, which causes sqlx to reject
      // existing DBs with: `VersionMismatch(3)`. It's safe to fix by updating
      // the stored checksum.
      if matches!(err, sqlx::migrate::MigrateError::VersionMismatch(3))
        && self.try_repair_migration_3_checksum(&migrator).await?
      {
        migrator.run(&self.pool).await?;
      } else {
        return Err(err.into());
      }
    }

    Ok(())
  }

  async fn try_repair_migration_3_checksum(&self, migrator: &Migrator) -> Result<bool> {
    let Some(migration) = migrator.iter().find(|m| m.version == 3) else {
      return Ok(false);
    };

    // We're only prepared to repair the known `add_idx_snapshots` whitespace-only
    // mismatch.
    if migration.description.as_ref() != "add_idx_snapshots" {
      return Ok(false);
    }

    let row = sqlx::query("SELECT description, checksum FROM _sqlx_migrations WHERE version = 3")
      .fetch_optional(&self.pool)
      .await?;

    let Some(row) = row else {
      return Ok(false);
    };

    let applied_description: String = row.try_get("description")?;
    if applied_description != migration.description.as_ref() {
      return Ok(false);
    }

    let applied_checksum: Vec<u8> = row.try_get("checksum")?;
    let expected_checksum = migration.checksum.as_ref();

    // sqlx computes the checksum as SHA-384 of the raw SQL bytes. The legacy
    // variant had an extra trailing space at the end of the SQL string (after
    // the final newline).
    let legacy_sql = format!("{} ", migration.sql);
    let legacy_migration = Migration::new(
      migration.version,
      migration.description.clone(),
      migration.migration_type,
      std::borrow::Cow::Owned(legacy_sql),
      migration.no_tx,
    );

    if applied_checksum.as_slice() != legacy_migration.checksum.as_ref() {
      return Ok(false);
    }

    sqlx::query("UPDATE _sqlx_migrations SET checksum = ? WHERE version = 3")
      .bind(expected_checksum)
      .execute(&self.pool)
      .await?;

    Ok(true)
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
    sqlx::query("PRAGMA wal_checkpoint(FULL);").execute(&self.pool).await?;

    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use std::borrow::Cow;

  use affine_schema::get_migrator;
  use sqlx::migrate::{Migration, Migrator};

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

  #[tokio::test]
  async fn connect_repairs_whitespace_only_migration_checksum_mismatch() {
    // Simulate a DB migrated with an older `add_idx_snapshots` SQL that had a
    // trailing space.
    let storage = SqliteDocStorage::new(":memory:".to_string());

    let new_migrator = get_migrator();
    let mut migrations = new_migrator.migrations.to_vec();
    assert!(migrations.len() >= 3);

    let mig3 = migrations[2].clone();
    assert_eq!(mig3.version, 3);
    assert_eq!(mig3.description.as_ref(), "add_idx_snapshots");

    let legacy_sql = format!("{} ", mig3.sql);
    migrations[2] = Migration::new(
      mig3.version,
      mig3.description.clone(),
      mig3.migration_type,
      Cow::Owned(legacy_sql),
      mig3.no_tx,
    );

    // The legacy DB didn't have newer migrations.
    migrations.truncate(3);
    let legacy_migrator = Migrator {
      migrations: Cow::Owned(migrations),
      ..Migrator::DEFAULT
    };

    legacy_migrator.run(&storage.pool).await.unwrap();

    // Now connecting with the current code should auto-repair the checksum and
    // succeed.
    storage.connect().await.unwrap();

    let expected_checksum = get_migrator()
      .iter()
      .find(|m| m.version == 3)
      .unwrap()
      .checksum
      .as_ref()
      .to_vec();

    let row = sqlx::query("SELECT checksum FROM _sqlx_migrations WHERE version = 3")
      .fetch_one(&storage.pool)
      .await
      .unwrap();
    let checksum: Vec<u8> = row.get("checksum");

    assert_eq!(checksum, expected_checksum);
  }
}
