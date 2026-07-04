use napi::Result;
use sqlx::{FromRow, PgPool};

use super::{BackendRuntime, RuntimeError, RuntimeResult, napi_error, types::CoordinationLeaseGrant};

#[derive(FromRow)]
struct LeaseGrantRow {
  fencing_token: i64,
}

struct CoordinationLeaseStore {
  pool: PgPool,
}

impl CoordinationLeaseStore {
  fn new(pool: PgPool) -> Self {
    Self { pool }
  }

  async fn acquire(&self, key: String, owner: String, ttl_ms: i64) -> RuntimeResult<Option<CoordinationLeaseGrant>> {
    let row = sqlx::query_as::<_, LeaseGrantRow>(
      r#"
      INSERT INTO runtime_leases (key, owner, fencing_token, expires_at)
      VALUES ($1, $2, 1, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond'))
      ON CONFLICT (key) DO UPDATE
        SET owner = EXCLUDED.owner,
            fencing_token = runtime_leases.fencing_token + 1,
            expires_at = EXCLUDED.expires_at,
            updated_at = CURRENT_TIMESTAMP
        WHERE runtime_leases.expires_at <= CURRENT_TIMESTAMP
      RETURNING fencing_token
      "#,
    )
    .bind(&key)
    .bind(&owner)
    .bind(ttl_ms as f64)
    .fetch_optional(&self.pool)
    .await
    .map_err(|err| RuntimeError::database("CoordinationLease acquire failed", err))?;

    Ok(row.map(|row| CoordinationLeaseGrant {
      key,
      owner,
      fencing_token: row.fencing_token,
    }))
  }

  async fn release(&self, key: &str, owner: &str, fencing_token: i64) -> RuntimeResult<bool> {
    let result = sqlx::query(
      r#"
      DELETE FROM runtime_leases
      WHERE key = $1 AND owner = $2 AND fencing_token = $3
      "#,
    )
    .bind(key)
    .bind(owner)
    .bind(fencing_token)
    .execute(&self.pool)
    .await
    .map_err(|err| RuntimeError::database("CoordinationLease release failed", err))?;

    Ok(result.rows_affected() == 1)
  }

  async fn renew(&self, key: &str, owner: &str, fencing_token: i64, ttl_ms: i64) -> RuntimeResult<bool> {
    let result = sqlx::query(
      r#"
      UPDATE runtime_leases
      SET expires_at = CURRENT_TIMESTAMP + ($4 * INTERVAL '1 millisecond'),
          updated_at = CURRENT_TIMESTAMP
      WHERE key = $1
        AND owner = $2
        AND fencing_token = $3
        AND expires_at > CURRENT_TIMESTAMP
      "#,
    )
    .bind(key)
    .bind(owner)
    .bind(fencing_token)
    .bind(ttl_ms as f64)
    .execute(&self.pool)
    .await
    .map_err(|err| RuntimeError::database("CoordinationLease renew failed", err))?;

    Ok(result.rows_affected() == 1)
  }
}

#[napi_derive::napi]
impl BackendRuntime {
  pub(crate) async fn acquire_coordination_lease_inner(
    &self,
    key: String,
    owner: String,
    ttl_ms: i64,
  ) -> RuntimeResult<Option<CoordinationLeaseGrant>> {
    if ttl_ms <= 0 {
      return Err(RuntimeError::invalid_input("coordination lease ttl must be positive"));
    }
    if owner.is_empty() {
      return Err(RuntimeError::invalid_input("coordination lease owner is required"));
    }

    CoordinationLeaseStore::new(self.pool().await?)
      .acquire(key, owner, ttl_ms)
      .await
  }

  pub(crate) async fn release_coordination_lease_inner(
    &self,
    key: String,
    owner: String,
    fencing_token: i64,
  ) -> RuntimeResult<bool> {
    CoordinationLeaseStore::new(self.pool().await?)
      .release(&key, &owner, fencing_token)
      .await
  }

  #[napi]
  pub async fn acquire_coordination_lease(
    &self,
    key: String,
    owner: String,
    ttl_ms: i64,
  ) -> Result<Option<CoordinationLeaseGrant>> {
    self
      .acquire_coordination_lease_inner(key, owner, ttl_ms)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn release_coordination_lease(
    &self,
    key: String,
    owner: String,
    #[napi(ts_arg_type = "bigint | number")] fencing_token: i64,
  ) -> Result<bool> {
    self
      .release_coordination_lease_inner(key, owner, fencing_token)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn renew_coordination_lease(
    &self,
    key: String,
    owner: String,
    #[napi(ts_arg_type = "bigint | number")] fencing_token: i64,
    ttl_ms: i64,
  ) -> Result<bool> {
    if ttl_ms <= 0 {
      return Err(napi_error("coordination lease ttl must be positive"));
    }

    CoordinationLeaseStore::new(self.pool().await?)
      .renew(&key, &owner, fencing_token, ttl_ms)
      .await
      .map_err(napi::Error::from)
  }
}
