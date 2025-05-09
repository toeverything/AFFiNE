use chrono::NaiveDateTime;
use napi::bindgen_prelude::{Buffer, Uint8Array};
use napi_derive::napi;
use sqlx::{
  migrate::MigrateDatabase,
  sqlite::{Sqlite, SqliteConnectOptions, SqlitePoolOptions},
  Pool, Row,
};

// latest version
const LATEST_VERSION: i32 = 4;

#[napi(object)]
pub struct BlobRow {
  pub key: String,
  pub data: Buffer,
  pub timestamp: NaiveDateTime,
}

#[napi(object)]
pub struct UpdateRow {
  pub id: i64,
  pub timestamp: NaiveDateTime,
  pub data: Buffer,
  pub doc_id: Option<String>,
}

#[napi(object)]
pub struct DocTimestampRow {
  pub doc_id: Option<String>,
  pub timestamp: NaiveDateTime,
}

#[napi(object)]
pub struct InsertRow {
  pub doc_id: Option<String>,
  pub data: Uint8Array,
}

#[napi]
pub struct SqliteConnection {
  pool: Pool<Sqlite>,
  path: String,
}

#[napi]
pub enum ValidationResult {
  MissingTables,
  MissingDocIdColumn,
  MissingVersionColumn,
  GeneralError,
  Valid,
}

#[napi]
impl SqliteConnection {
  #[napi(constructor, async_runtime)]
  pub fn new(path: String) -> napi::Result<Self> {
    let sqlite_options = SqliteConnectOptions::new()
      .filename(&path)
      .foreign_keys(false)
      .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);
    let pool = SqlitePoolOptions::new()
      .max_connections(4)
      .connect_lazy_with(sqlite_options);
    Ok(Self { pool, path })
  }

  #[napi]
  pub async fn connect(&self) -> napi::Result<()> {
    if !Sqlite::database_exists(&self.path).await.unwrap_or(false) {
      Sqlite::create_database(&self.path)
        .await
        .map_err(anyhow::Error::from)?;
    };
    let mut connection = self.pool.acquire().await.map_err(anyhow::Error::from)?;
    sqlx::query(affine_schema::v1::SCHEMA)
      .execute(connection.as_mut())
      .await
      .map_err(anyhow::Error::from)?;
    self.migrate_add_doc_id().await?;
    self.migrate_add_doc_id_index().await?;
    connection.detach();
    Ok(())
  }

  #[napi]
  pub async fn add_blob(&self, key: String, blob: Uint8Array) -> napi::Result<()> {
    let blob = blob.as_ref();
    sqlx::query_as!(
      BlobRow,
      "INSERT INTO blobs (key, data) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET data = \
       excluded.data",
      key,
      blob,
    )
    .execute(&self.pool)
    .await
    .map_err(anyhow::Error::from)?;
    Ok(())
  }

  #[napi]
  pub async fn get_blob(&self, key: String) -> Option<BlobRow> {
    sqlx::query_as!(
      BlobRow,
      "SELECT key, data, timestamp FROM blobs WHERE key = ?",
      key
    )
    .fetch_one(&self.pool)
    .await
    .ok()
  }

  #[napi]
  pub async fn delete_blob(&self, key: String) -> napi::Result<()> {
    sqlx::query!("DELETE FROM blobs WHERE key = ?", key)
      .execute(&self.pool)
      .await
      .map_err(anyhow::Error::from)?;
    Ok(())
  }

  #[napi]
  pub async fn get_blob_keys(&self) -> napi::Result<Vec<String>> {
    let keys = sqlx::query!("SELECT key FROM blobs")
      .fetch_all(&self.pool)
      .await
      .map(|rows| rows.into_iter().map(|row| row.key).collect())
      .map_err(anyhow::Error::from)?;
    Ok(keys)
  }

  #[napi]
  pub async fn get_updates(&self, doc_id: Option<String>) -> napi::Result<Vec<UpdateRow>> {
    let updates = match doc_id {
      Some(doc_id) => sqlx::query_as!(
        UpdateRow,
        "SELECT id, timestamp, data, doc_id FROM updates WHERE doc_id = ?",
        doc_id
      )
      .fetch_all(&self.pool)
      .await
      .map_err(anyhow::Error::from)?,
      None => sqlx::query_as!(
        UpdateRow,
        "SELECT id, timestamp, data, doc_id FROM updates WHERE doc_id is NULL",
      )
      .fetch_all(&self.pool)
      .await
      .map_err(anyhow::Error::from)?,
    };
    Ok(updates)
  }

  #[napi]
  pub async fn get_doc_timestamps(&self) -> napi::Result<Vec<DocTimestampRow>> {
    // get the greatest timestamp of each doc_id
    let updates = sqlx::query_as!(
      DocTimestampRow,
      "SELECT doc_id, MAX(timestamp) as timestamp FROM updates GROUP BY doc_id"
    )
    .fetch_all(&self.pool)
    .await
    .map_err(anyhow::Error::from)?;

    Ok(updates)
  }

  #[napi]
  pub async fn delete_updates(&self, doc_id: Option<String>) -> napi::Result<()> {
    match doc_id {
      Some(doc_id) => {
        sqlx::query!("DELETE FROM updates WHERE doc_id = ?", doc_id)
          .execute(&self.pool)
          .await
          .map_err(anyhow::Error::from)?;
      }
      None => {
        sqlx::query!("DELETE FROM updates WHERE doc_id is NULL")
          .execute(&self.pool)
          .await
          .map_err(anyhow::Error::from)?;
      }
    };
    Ok(())
  }

  #[napi]
  pub async fn get_updates_count(&self, doc_id: Option<String>) -> napi::Result<i64> {
    let count = match doc_id {
      Some(doc_id) => {
        sqlx::query!(
          "SELECT COUNT(*) as count FROM updates WHERE doc_id = ?",
          doc_id
        )
        .fetch_one(&self.pool)
        .await
        .map_err(anyhow::Error::from)?
        .count
      }
      None => {
        sqlx::query!("SELECT COUNT(*) as count FROM updates WHERE doc_id is NULL")
          .fetch_one(&self.pool)
          .await
          .map_err(anyhow::Error::from)?
          .count
      }
    };
    Ok(count)
  }

  #[napi]
  pub async fn get_all_updates(&self) -> napi::Result<Vec<UpdateRow>> {
    let updates = sqlx::query_as!(UpdateRow, "SELECT id, timestamp, data, doc_id FROM updates")
      .fetch_all(&self.pool)
      .await
      .map_err(anyhow::Error::from)?;
    Ok(updates)
  }

  #[napi]
  pub async fn insert_updates(&self, updates: Vec<InsertRow>) -> napi::Result<()> {
    let mut transaction = self.pool.begin().await.map_err(anyhow::Error::from)?;
    for InsertRow { data, doc_id } in updates {
      let update = data.as_ref();
      sqlx::query_as!(
        UpdateRow,
        "INSERT INTO updates (data, doc_id) VALUES ($1, $2)",
        update,
        doc_id
      )
      .execute(&mut *transaction)
      .await
      .map_err(anyhow::Error::from)?;
    }
    transaction.commit().await.map_err(anyhow::Error::from)?;
    Ok(())
  }

  #[napi]
  pub async fn replace_updates(
    &self,
    doc_id: Option<String>,
    updates: Vec<InsertRow>,
  ) -> napi::Result<()> {
    let mut transaction = self.pool.begin().await.map_err(anyhow::Error::from)?;

    match doc_id {
      Some(doc_id) => sqlx::query!("DELETE FROM updates where doc_id = ?", doc_id)
        .execute(&mut *transaction)
        .await
        .map_err(anyhow::Error::from)?,
      None => sqlx::query!("DELETE FROM updates where doc_id is NULL",)
        .execute(&mut *transaction)
        .await
        .map_err(anyhow::Error::from)?,
    };

    for InsertRow { data, doc_id } in updates {
      let update = data.as_ref();
      sqlx::query_as!(
        UpdateRow,
        "INSERT INTO updates (data, doc_id) VALUES ($1, $2)",
        update,
        doc_id
      )
      .execute(&mut *transaction)
      .await
      .map_err(anyhow::Error::from)?;
    }
    transaction.commit().await.map_err(anyhow::Error::from)?;
    Ok(())
  }

  #[napi]
  pub async fn get_server_clock(&self, key: String) -> Option<BlobRow> {
    sqlx::query_as!(
      BlobRow,
      "SELECT key, data, timestamp FROM server_clock WHERE key = ?",
      key
    )
    .fetch_one(&self.pool)
    .await
    .ok()
  }

  #[napi]
  pub async fn set_server_clock(&self, key: String, data: Uint8Array) -> napi::Result<()> {
    let data = data.as_ref();
    sqlx::query!(
      "INSERT INTO server_clock (key, data) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET data = \
       excluded.data",
      key,
      data,
    )
    .execute(&self.pool)
    .await
    .map_err(anyhow::Error::from)?;
    Ok(())
  }

  #[napi]
  pub async fn get_server_clock_keys(&self) -> napi::Result<Vec<String>> {
    let keys = sqlx::query!("SELECT key FROM server_clock")
      .fetch_all(&self.pool)
      .await
      .map(|rows| rows.into_iter().map(|row| row.key).collect())
      .map_err(anyhow::Error::from)?;
    Ok(keys)
  }

  #[napi]
  pub async fn clear_server_clock(&self) -> napi::Result<()> {
    sqlx::query!("DELETE FROM server_clock")
      .execute(&self.pool)
      .await
      .map_err(anyhow::Error::from)?;
    Ok(())
  }

  #[napi]
  pub async fn del_server_clock(&self, key: String) -> napi::Result<()> {
    sqlx::query!("DELETE FROM server_clock WHERE key = ?", key)
      .execute(&self.pool)
      .await
      .map_err(anyhow::Error::from)?;
    Ok(())
  }

  #[napi]
  pub async fn get_sync_metadata(&self, key: String) -> Option<BlobRow> {
    sqlx::query_as!(
      BlobRow,
      "SELECT key, data, timestamp FROM sync_metadata WHERE key = ?",
      key
    )
    .fetch_one(&self.pool)
    .await
    .ok()
  }

  #[napi]
  pub async fn set_sync_metadata(&self, key: String, data: Uint8Array) -> napi::Result<()> {
    let data = data.as_ref();
    sqlx::query!(
      "INSERT INTO sync_metadata (key, data) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET data \
       = excluded.data",
      key,
      data,
    )
    .execute(&self.pool)
    .await
    .map_err(anyhow::Error::from)?;
    Ok(())
  }

  #[napi]
  pub async fn get_sync_metadata_keys(&self) -> napi::Result<Vec<String>> {
    let keys = sqlx::query!("SELECT key FROM sync_metadata")
      .fetch_all(&self.pool)
      .await
      .map(|rows| rows.into_iter().map(|row| row.key).collect())
      .map_err(anyhow::Error::from)?;
    Ok(keys)
  }

  #[napi]
  pub async fn clear_sync_metadata(&self) -> napi::Result<()> {
    sqlx::query!("DELETE FROM sync_metadata")
      .execute(&self.pool)
      .await
      .map_err(anyhow::Error::from)?;
    Ok(())
  }

  #[napi]
  pub async fn del_sync_metadata(&self, key: String) -> napi::Result<()> {
    sqlx::query!("DELETE FROM sync_metadata WHERE key = ?", key)
      .execute(&self.pool)
      .await
      .map_err(anyhow::Error::from)?;
    Ok(())
  }

  #[napi]
  pub async fn init_version(&self) -> napi::Result<()> {
    // create version_info table
    sqlx::query!(
      "CREATE TABLE IF NOT EXISTS version_info (
        version NUMBER NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )"
    )
    .execute(&self.pool)
    .await
    .map_err(anyhow::Error::from)?;
    // `3` is the first version that has version_info table,
    //  do not modify the version number.
    sqlx::query!("INSERT INTO version_info (version) VALUES (3)")
      .execute(&self.pool)
      .await
      .map_err(anyhow::Error::from)?;
    Ok(())
  }

  #[napi]
  pub async fn set_version(&self, version: i32) -> napi::Result<()> {
    if version > LATEST_VERSION {
      return Err(anyhow::Error::msg("Version is too new").into());
    }
    sqlx::query!("UPDATE version_info SET version = ?", version)
      .execute(&self.pool)
      .await
      .map_err(anyhow::Error::from)?;
    Ok(())
  }

  #[napi]
  pub async fn get_max_version(&self) -> napi::Result<i64> {
    // 4 is the current version
    let version = sqlx::query!("SELECT COALESCE(MAX(version), 4) AS max_version FROM version_info")
      .fetch_one(&self.pool)
      .await
      .map_err(anyhow::Error::from)?
      .max_version;
    Ok(version)
  }

  #[napi]
  pub async fn close(&self) {
    self.pool.close().await;
  }

  #[napi(getter)]
  pub fn is_close(&self) -> bool {
    self.pool.is_closed()
  }

  #[napi]
  pub async fn validate(path: String) -> ValidationResult {
    let pool = match SqlitePoolOptions::new()
      .max_connections(1)
      .connect(&path)
      .await
    {
      Ok(pool) => pool,
      Err(_) => return ValidationResult::GeneralError,
    };

    let tables_res = sqlx::query("SELECT name FROM sqlite_master WHERE type='table'")
      .fetch_all(&pool)
      .await;

    let tables_exist = match tables_res {
      Ok(res) => {
        let names: Vec<String> = res.iter().map(|row| row.get(0)).collect();
        names.contains(&"updates".to_string()) && names.contains(&"blobs".to_string())
      }
      Err(_) => return ValidationResult::GeneralError,
    };

    let tables_res = sqlx::query("SELECT name FROM sqlite_master WHERE type='table'")
      .fetch_all(&pool)
      .await;

    let version_exist = match tables_res {
      Ok(res) => {
        let names: Vec<String> = res.iter().map(|row| row.get(0)).collect();
        names.contains(&"version_info".to_string())
      }
      Err(_) => return ValidationResult::GeneralError,
    };

    let columns_res = sqlx::query("PRAGMA table_info(updates)")
      .fetch_all(&pool)
      .await;

    let doc_id_exist = match columns_res {
      Ok(res) => {
        let names: Vec<String> = res.iter().map(|row| row.get(1)).collect();
        names.contains(&"doc_id".to_string())
      }
      Err(_) => return ValidationResult::GeneralError,
    };

    if !tables_exist {
      ValidationResult::MissingTables
    } else if !doc_id_exist {
      ValidationResult::MissingDocIdColumn
    } else if !version_exist {
      ValidationResult::MissingVersionColumn
    } else {
      ValidationResult::Valid
    }
  }

  #[napi]
  pub async fn migrate_add_doc_id(&self) -> napi::Result<()> {
    // ignore errors
    match sqlx::query("ALTER TABLE updates ADD COLUMN doc_id TEXT")
      .execute(&self.pool)
      .await
    {
      Ok(_) => Ok(()),
      Err(err) => {
        if err.to_string().contains("duplicate column name") {
          Ok(()) // Ignore error if it's due to duplicate column
        } else {
          Err(anyhow::Error::from(err).into()) // Propagate other errors
        }
      }
    }
  }

  /**
   * Flush the WAL file to the database file.
   * See https://www.sqlite.org/pragma.html#pragma_wal_checkpoint:~:text=PRAGMA%20schema.wal_checkpoint%3B
   */
  #[napi]
  pub async fn checkpoint(&self) -> napi::Result<()> {
    sqlx::query("PRAGMA wal_checkpoint(FULL);")
      .execute(&self.pool)
      .await
      .map_err(anyhow::Error::from)?;
    Ok(())
  }

  pub async fn migrate_add_doc_id_index(&self) -> napi::Result<()> {
    // ignore errors
    match sqlx::query("CREATE INDEX IF NOT EXISTS idx_doc_id ON updates(doc_id);")
      .execute(&self.pool)
      .await
    {
      Ok(_) => Ok(()),
      Err(err) => {
        Err(anyhow::Error::from(err).into()) // Propagate other errors
      }
    }
  }
}
