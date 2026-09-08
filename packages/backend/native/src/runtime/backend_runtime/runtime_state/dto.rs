use sqlx::{PgPool, Row};

use super::{RuntimeError, RuntimeResult, token_hash};

type Result<T> = RuntimeResult<T>;

pub(super) struct RuntimeStatePayloadRow {
  pub(super) payload: serde_json::Value,
  pub(super) expires_at_ms: i64,
}

pub(super) struct RuntimeStateInsertPayload<'a> {
  pub(super) purpose: &'a str,
  pub(super) token: &'a str,
  pub(super) lookup_key: &'a str,
  pub(super) payload: &'a serde_json::Value,
  pub(super) ttl_ms: i64,
  pub(super) context: &'a str,
}

#[derive(Clone)]
pub(super) struct RuntimeStateRows {
  pub(super) pool: PgPool,
}

impl RuntimeStateRows {
  pub(super) fn new(pool: PgPool) -> Self {
    Self { pool }
  }

  pub(super) async fn begin(&self, context: &str) -> Result<sqlx::Transaction<'_, sqlx::Postgres>> {
    self
      .pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database(format!("{context} transaction failed"), error))
  }

  pub(super) async fn active_payload_with_expires(
    &self,
    purpose: &str,
    token: &str,
    context: &str,
  ) -> Result<Option<RuntimeStatePayloadRow>> {
    let row = sqlx::query(
      "SELECT payload,(EXTRACT(EPOCH FROM expires_at)*1000)::BIGINT AS expires_at_ms FROM runtime_states WHERE \
       purpose=$1 AND token_hash=$2 AND consumed_at IS NULL AND expires_at>CURRENT_TIMESTAMP",
    )
    .bind(purpose)
    .bind(token_hash(token))
    .fetch_optional(&self.pool)
    .await
    .map_err(|error| RuntimeError::database(context, error))?;
    Ok(row.map(payload_row))
  }

  pub(super) async fn active_payload_with_expires_for_update_in_tx(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    purpose: &str,
    token: &str,
    context: &str,
  ) -> Result<Option<RuntimeStatePayloadRow>> {
    let row = sqlx::query(
      "SELECT payload,(EXTRACT(EPOCH FROM expires_at)*1000)::BIGINT AS expires_at_ms FROM runtime_states WHERE \
       purpose=$1 AND token_hash=$2 AND consumed_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE",
    )
    .bind(purpose)
    .bind(token_hash(token))
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database(context, error))?;
    Ok(row.map(payload_row))
  }

  pub(super) async fn insert_payload_returning_expires_in_tx(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    input: RuntimeStateInsertPayload<'_>,
  ) -> Result<i64> {
    let expires_at_ms = sqlx::query_scalar(
      "INSERT INTO runtime_states(purpose,token_hash,lookup_key,payload,expires_at) \
       VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP+($5*INTERVAL '1 millisecond')) RETURNING (EXTRACT(EPOCH FROM \
       expires_at)*1000)::BIGINT",
    )
    .bind(input.purpose)
    .bind(token_hash(input.token))
    .bind(input.lookup_key)
    .bind(input.payload)
    .bind(input.ttl_ms as f64)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database(input.context, error))?;
    Ok(expires_at_ms)
  }

  pub(super) async fn upsert_expired_or_consumed_payload_returning_expires_in_tx(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    input: RuntimeStateInsertPayload<'_>,
  ) -> Result<Option<i64>> {
    let row = sqlx::query_scalar(
      r#"INSERT INTO runtime_states(purpose,token_hash,lookup_key,payload,expires_at)
         VALUES($1,$2,$3,$4,clock_timestamp()+($5*INTERVAL '1 millisecond'))
         ON CONFLICT(purpose,token_hash) DO UPDATE SET lookup_key=EXCLUDED.lookup_key,payload=EXCLUDED.payload,
           attempts=0,consumed_at=NULL,expires_at=clock_timestamp()+($5*INTERVAL '1 millisecond')
         WHERE runtime_states.consumed_at IS NOT NULL OR runtime_states.expires_at<=clock_timestamp()
         RETURNING (EXTRACT(EPOCH FROM expires_at)*1000)::BIGINT"#,
    )
    .bind(input.purpose)
    .bind(token_hash(input.token))
    .bind(input.lookup_key)
    .bind(input.payload)
    .bind(input.ttl_ms as f64)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database(input.context, error))?;
    Ok(row)
  }

  pub(super) async fn delete_by_key_in_tx(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    purpose: &str,
    token: &str,
    context: &str,
  ) -> Result<()> {
    sqlx::query("DELETE FROM runtime_states WHERE purpose=$1 AND token_hash=$2")
      .bind(purpose)
      .bind(token_hash(token))
      .execute(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database(context, error))?;
    Ok(())
  }

  pub(super) async fn cleanup_expired_or_consumed(&self, limit: i64, context: &str) -> Result<i64> {
    let result = sqlx::query(
      "DELETE FROM runtime_states WHERE (purpose,token_hash) IN (SELECT purpose,token_hash FROM runtime_states WHERE \
       expires_at<=CURRENT_TIMESTAMP OR consumed_at IS NOT NULL ORDER BY expires_at ASC LIMIT $1)",
    )
    .bind(limit)
    .execute(&self.pool)
    .await
    .map_err(|error| RuntimeError::database(context, error))?;
    Ok(result.rows_affected() as i64)
  }
}

fn payload_row(row: sqlx::postgres::PgRow) -> RuntimeStatePayloadRow {
  RuntimeStatePayloadRow {
    payload: row.get("payload"),
    expires_at_ms: row.get("expires_at_ms"),
  }
}
