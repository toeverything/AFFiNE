use sqlx::sqlite::SqliteConnectOptions;

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
  dotenv::dotenv().ok();

  napi_build::setup();
  let options = SqliteConnectOptions::new()
    .filename("../../affine.db")
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
