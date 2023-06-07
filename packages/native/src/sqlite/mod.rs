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
    sqlx::query_as!(BlobRow, "SELECT * FROM blobs WHERE key = ?", key)
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
  pub async fn get_updates(&self) -> napi::Result<Vec<UpdateRow>> {
    let updates = sqlx::query_as!(UpdateRow, "SELECT * FROM updates")
      .fetch_all(&self.pool)
      .await
      .map_err(anyhow::Error::from)?;
    Ok(updates)
  }

  #[napi]
  pub async fn insert_updates(&self, updates: Vec<Uint8Array>) -> napi::Result<()> {
    let mut transaction = self.pool.begin().await.map_err(anyhow::Error::from)?;
    for update in updates.into_iter() {
      let update = update.as_ref();
      sqlx::query_as!(UpdateRow, "INSERT INTO updates (data) VALUES ($1)", update)
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
    if let Ok(pool) = SqlitePoolOptions::new()
      .max_connections(1)
      .connect(&path)
      .await
    {
      if let Ok(res) = sqlx::query("SELECT name FROM sqlite_master WHERE type='table'")
        .fetch_all(&pool)
        .await
      {
        let names = res.iter().map(|row| row.get(0));
        names.fold(0, |acc, cur: String| {
          if cur == "updates" || cur == "blobs" {
            acc + 1
          } else {
            acc
          }
        }) == 2
      } else {
        false
      }
    } else {
      false
    }
  }
}
