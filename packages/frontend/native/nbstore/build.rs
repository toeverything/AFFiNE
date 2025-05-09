use std::fs;

use affine_schema::get_migrator;
use sqlx::sqlite::SqliteConnectOptions;

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
  napi_build::setup();

  // always start with a fresh database to have latest db schema
  let cwd = std::env::var("CARGO_MANIFEST_DIR").unwrap();
  let db_path = format!("{cwd}/affine.db");

  if fs::metadata(&db_path).is_ok() {
    fs::remove_file(&db_path)?;
  }

  let options = SqliteConnectOptions::new()
    .filename(&db_path)
    .journal_mode(sqlx::sqlite::SqliteJournalMode::Off)
    .locking_mode(sqlx::sqlite::SqliteLockingMode::Exclusive)
    .create_if_missing(true);
  let pool = sqlx::sqlite::SqlitePoolOptions::new()
    .max_connections(1)
    .connect_with(options)
    .await
    .unwrap();

  get_migrator().run(&pool).await.unwrap();

  println!("cargo::rustc-env=DATABASE_URL=sqlite://{db_path}");

  Ok(())
}
