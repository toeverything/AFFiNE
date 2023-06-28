use sqlx::sqlite::SqliteConnectOptions;
use std::fs;

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
  dotenv::dotenv().ok();

  // always start with a fresh database to have
  // latest db schema
  let db_path = "../../affine.db";

  // check if db exists and then remove file
  if fs::metadata(db_path).is_ok() {
    fs::remove_file(db_path)?;
  }

  napi_build::setup();
  let options = SqliteConnectOptions::new()
    .filename(db_path)
    .journal_mode(sqlx::sqlite::SqliteJournalMode::Off)
    .locking_mode(sqlx::sqlite::SqliteLockingMode::Exclusive)
    .create_if_missing(true);
  let pool = sqlx::sqlite::SqlitePoolOptions::new()
    .max_connections(1)
    .connect_with(options)
    .await
    .unwrap();
  sqlx::query(affine_schema::SCHEMA)
    .execute(&pool)
    .await
    .unwrap();
  Ok(())
}
