use napi::Result;
use sqlx::PgPool;

use super::{BackendRuntime, RuntimeError, RuntimeResult, napi_error};

struct RuntimeGateStore {
  pool: PgPool,
}

impl RuntimeGateStore {
  fn new(pool: PgPool) -> Self {
    Self { pool }
  }

  async fn put_if_absent(&self, key: &str, ttl_ms: i64) -> RuntimeResult<bool> {
    let mut tx = self
      .pool
      .begin()
      .await
      .map_err(|err| RuntimeError::database("RuntimeGate transaction failed", err))?;

    sqlx::query("DELETE FROM runtime_gates WHERE key = $1 AND expires_at <= CURRENT_TIMESTAMP")
      .bind(key)
      .execute(&mut *tx)
      .await
      .map_err(|err| RuntimeError::database("RuntimeGate expired cleanup failed", err))?;

    let inserted = sqlx::query(
      r#"
      INSERT INTO runtime_gates (key, expires_at)
      VALUES ($1, CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'))
      ON CONFLICT (key) DO NOTHING
      "#,
    )
    .bind(key)
    .bind(ttl_ms as f64)
    .execute(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("RuntimeGate put_if_absent failed", err))?
    .rows_affected()
      == 1;

    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("RuntimeGate transaction commit failed", err))?;

    Ok(inserted)
  }

  async fn cleanup_expired(&self, limit: i64) -> RuntimeResult<i64> {
    let result = sqlx::query(
      r#"
      DELETE FROM runtime_gates
      WHERE key IN (
        SELECT key FROM runtime_gates
        WHERE expires_at <= CURRENT_TIMESTAMP
        ORDER BY expires_at ASC
        LIMIT $1
      )
      "#,
    )
    .bind(limit)
    .execute(&self.pool)
    .await
    .map_err(|err| RuntimeError::database("RuntimeGate cleanup failed", err))?;

    Ok(result.rows_affected() as i64)
  }
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn put_runtime_gate_if_absent(&self, key: String, ttl_ms: i64) -> Result<bool> {
    if ttl_ms <= 0 {
      return Err(napi_error("runtime gate ttl must be positive"));
    }
    RuntimeGateStore::new(self.pool().await?)
      .put_if_absent(&key, ttl_ms)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn cleanup_expired_runtime_gates(&self, limit: i64) -> Result<i64> {
    if limit <= 0 {
      return Err(napi_error("runtime gate cleanup limit must be positive"));
    }
    RuntimeGateStore::new(self.pool().await?)
      .cleanup_expired(limit)
      .await
      .map_err(napi::Error::from)
  }
}
