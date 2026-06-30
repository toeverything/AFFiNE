use napi::Result;
use sqlx::PgPool;

use super::{BackendRuntime, RuntimeError, RuntimeResult, napi_error};

struct HousekeepingStore {
  pool: PgPool,
}

impl HousekeepingStore {
  fn new(pool: PgPool) -> Self {
    Self { pool }
  }

  async fn cleanup_expired_user_sessions(&self, limit: i64) -> RuntimeResult<i64> {
    let result = sqlx::query(
      r#"
      DELETE FROM user_sessions
      WHERE id IN (
        SELECT id FROM user_sessions
        WHERE expires_at <= CURRENT_TIMESTAMP
        ORDER BY expires_at ASC
        LIMIT $1
      )
      "#,
    )
    .bind(limit)
    .execute(&self.pool)
    .await
    .map_err(|err| RuntimeError::database("Housekeeping user sessions cleanup failed", err))?;

    Ok(result.rows_affected() as i64)
  }

  async fn cleanup_expired_snapshot_histories(&self, limit: i64) -> RuntimeResult<i64> {
    let result = sqlx::query(
      r#"
      DELETE FROM snapshot_histories
      WHERE (workspace_id, guid, timestamp) IN (
        SELECT workspace_id, guid, timestamp
        FROM snapshot_histories
        WHERE expired_at <= CURRENT_TIMESTAMP
        ORDER BY expired_at ASC
        LIMIT $1
      )
      "#,
    )
    .bind(limit)
    .execute(&self.pool)
    .await
    .map_err(|err| RuntimeError::database("Housekeeping snapshot histories cleanup failed", err))?;

    Ok(result.rows_affected() as i64)
  }
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn cleanup_expired_user_sessions(&self, limit: i64) -> Result<i64> {
    if limit <= 0 {
      return Err(napi_error("user sessions cleanup limit must be positive"));
    }

    HousekeepingStore::new(self.pool().await?)
      .cleanup_expired_user_sessions(limit)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn cleanup_expired_snapshot_histories(&self, limit: i64) -> Result<i64> {
    if limit <= 0 {
      return Err(napi_error("snapshot histories cleanup limit must be positive"));
    }

    HousekeepingStore::new(self.pool().await?)
      .cleanup_expired_snapshot_histories(limit)
      .await
      .map_err(napi::Error::from)
  }
}
