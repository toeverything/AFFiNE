use chrono::NaiveDateTime;
use napi::bindgen_prelude::{Buffer, Uint8Array};
use napi_derive::napi;
use sqlx::{
  migrate::MigrateDatabase,
  sqlite::{Sqlite, SqliteConnectOptions, SqlitePoolOptions},
  Pool, Row,
};

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
impl SqliteConnection {
  #[napi(constructor)]
  pub fn new(path: String) -> napi::Result<Self> {
    let sqlite_options = SqliteConnectOptions::new()
      .filename(&path)
      .foreign_keys(false)
      .journal_mode(sqlx::sqlite::SqliteJournalMode::Off);
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
    sqlx::query(affine_schema::SCHEMA)
      .execute(connection.as_mut())
      .await
      .map_err(anyhow::Error::from)?;
    self.migrate_add_doc_id().await?;
    connection.detach();
    Ok(())
  }

  #[napi]
  pub async fn add_blob(&self, key: String, blob: Uint8Array) -> napi::Result<()> {
    let blob = blob.as_ref();
    sqlx::query_as!(
      BlobRow,
      "INSERT INTO blobs (key, data) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET data = excluded.data",
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
  pub async fn get_updates_count(&self, doc_id: Option<String>) -> napi::Result<i32> {
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
  pub async fn close(&self) {
    self.pool.close().await;
  }

  #[napi(getter)]
  pub fn is_close(&self) -> bool {
    self.pool.is_closed()
  }

  #[napi]
  pub async fn validate(path: String) -> bool {
    let pool = match SqlitePoolOptions::new()
      .max_connections(1)
      .connect(&path)
      .await
    {
      Ok(pool) => pool,
      Err(_) => return false,
    };

    let tables_res = sqlx::query("SELECT name FROM sqlite_master WHERE type='table'")
      .fetch_all(&pool)
      .await;

    let tables_exist = match tables_res {
      Ok(res) => {
        let names: Vec<String> = res.iter().map(|row| row.get(0)).collect();
        names.contains(&"updates".to_string()) && names.contains(&"blobs".to_string())
      }
      Err(_) => return false,
    };

    let columns_res = sqlx::query("PRAGMA table_info(updates)")
      .fetch_all(&pool)
      .await;

    let columns_exist = match columns_res {
      Ok(res) => {
        let names: Vec<String> = res.iter().map(|row| row.get(1)).collect();
        names.contains(&"data".to_string()) && names.contains(&"doc_id".to_string())
      }
      Err(_) => return false,
    };

    tables_exist && columns_exist
  }

  // todo: have a better way to handle migration
  async fn migrate_add_doc_id(&self) -> Result<(), anyhow::Error> {
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
          Err(anyhow::Error::from(err)) // Propagate other errors
        }
      }
    }
  }
}
