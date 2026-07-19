use sqlx::{PgPool, Row};

use super::{RuntimeError, RuntimeResult, token_hash};

type Result<T> = RuntimeResult<T>;

pub(super) struct RuntimeStatePayloadRow {
  pub(super) payload: serde_json::Value,
  pub(super) expires_at_ms: i64,
}

pub(super) struct RuntimeStateLockedRow {
  pub(super) payload: serde_json::Value,
  pub(super) attempts: i32,
  pub(super) expires_at: chrono::DateTime<chrono::Utc>,
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

  pub(super) fn pool(&self) -> &PgPool {
    &self.pool
  }

  pub(super) async fn begin(&self, context: &str) -> Result<sqlx::Transaction<'_, sqlx::Postgres>> {
    self
      .pool
      .begin()
      .await
      .map_err(|err| RuntimeError::database(format!("{context} transaction failed"), err))
  }

  pub(super) async fn insert_payload(
    &self,
    purpose: &str,
    token: &str,
    lookup_key: Option<&str>,
    payload: serde_json::Value,
    ttl_ms: i64,
    context: &str,
  ) -> Result<()> {
    sqlx::query(
      r#"
      INSERT INTO runtime_states (purpose, token_hash, lookup_key, payload, expires_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + ($5 * INTERVAL '1 millisecond'))
      "#,
    )
    .bind(purpose)
    .bind(token_hash(token))
    .bind(lookup_key)
    .bind(payload)
    .bind(ttl_ms as f64)
    .execute(&self.pool)
    .await
    .map_err(|err| RuntimeError::database(context, err))?;

    Ok(())
  }

  pub(super) async fn insert_payload_if_absent(
    &self,
    purpose: &str,
    token: &str,
    lookup_key: Option<&str>,
    payload: serde_json::Value,
    ttl_ms: i64,
    context: &str,
  ) -> Result<bool> {
    let inserted = sqlx::query(
      r#"
      INSERT INTO runtime_states (purpose, token_hash, lookup_key, payload, expires_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + ($5 * INTERVAL '1 millisecond'))
      ON CONFLICT (purpose, token_hash) DO NOTHING
      "#,
    )
    .bind(purpose)
    .bind(token_hash(token))
    .bind(lookup_key)
    .bind(payload)
    .bind(ttl_ms as f64)
    .execute(&self.pool)
    .await
    .map_err(|err| RuntimeError::database(context, err))?
    .rows_affected()
      == 1;

    Ok(inserted)
  }

  pub(super) async fn upsert_payload_reset_attempts(
    &self,
    purpose: &str,
    token: &str,
    lookup_key: &str,
    payload: serde_json::Value,
    ttl_ms: i64,
    context: &str,
  ) -> Result<()> {
    sqlx::query(
      r#"
      INSERT INTO runtime_states (purpose, token_hash, lookup_key, payload, attempts, consumed_at, expires_at)
      VALUES ($1, $2, $3, $4, 0, NULL, CURRENT_TIMESTAMP + ($5 * INTERVAL '1 millisecond'))
      ON CONFLICT (purpose, token_hash) DO UPDATE
        SET lookup_key = EXCLUDED.lookup_key,
            payload = EXCLUDED.payload,
            attempts = 0,
            consumed_at = NULL,
            expires_at = EXCLUDED.expires_at,
            updated_at = CURRENT_TIMESTAMP
      "#,
    )
    .bind(purpose)
    .bind(token_hash(token))
    .bind(lookup_key)
    .bind(payload)
    .bind(ttl_ms as f64)
    .execute(&self.pool)
    .await
    .map_err(|err| RuntimeError::database(context, err))?;

    Ok(())
  }

  pub(super) async fn active_payload(
    &self,
    purpose: &str,
    token: &str,
    context: &str,
  ) -> Result<Option<serde_json::Value>> {
    let row = sqlx::query(
      r#"
      SELECT payload
      FROM runtime_states
      WHERE purpose = $1
        AND token_hash = $2
        AND consumed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      "#,
    )
    .bind(purpose)
    .bind(token_hash(token))
    .fetch_optional(&self.pool)
    .await
    .map_err(|err| RuntimeError::database(context, err))?;

    Ok(row.map(|row| row.get::<serde_json::Value, _>("payload")))
  }

  pub(super) async fn active_payload_with_expires(
    &self,
    purpose: &str,
    token: &str,
    context: &str,
  ) -> Result<Option<RuntimeStatePayloadRow>> {
    let row = sqlx::query(
      r#"
      SELECT payload, (EXTRACT(EPOCH FROM expires_at) * 1000)::BIGINT AS expires_at_ms
      FROM runtime_states
      WHERE purpose = $1
        AND token_hash = $2
        AND consumed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      "#,
    )
    .bind(purpose)
    .bind(token_hash(token))
    .fetch_optional(&self.pool)
    .await
    .map_err(|err| RuntimeError::database(context, err))?;

    Ok(row.map(payload_row))
  }

  pub(super) async fn consume_payload(
    &self,
    purpose: &str,
    token: &str,
    context: &str,
  ) -> Result<Option<serde_json::Value>> {
    let row = sqlx::query(
      r#"
      UPDATE runtime_states
      SET consumed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE purpose = $1
        AND token_hash = $2
        AND consumed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      RETURNING payload
      "#,
    )
    .bind(purpose)
    .bind(token_hash(token))
    .fetch_optional(&self.pool)
    .await
    .map_err(|err| RuntimeError::database(context, err))?;

    Ok(row.map(|row| row.get::<serde_json::Value, _>("payload")))
  }

  pub(super) async fn consume_payload_with_expires(
    &self,
    purpose: &str,
    token: &str,
    context: &str,
  ) -> Result<Option<RuntimeStatePayloadRow>> {
    let row = sqlx::query(
      r#"
      UPDATE runtime_states
      SET consumed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE purpose = $1
        AND token_hash = $2
        AND consumed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      RETURNING payload, (EXTRACT(EPOCH FROM expires_at) * 1000)::BIGINT AS expires_at_ms
      "#,
    )
    .bind(purpose)
    .bind(token_hash(token))
    .fetch_optional(&self.pool)
    .await
    .map_err(|err| RuntimeError::database(context, err))?;

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
      r#"
      SELECT payload, (EXTRACT(EPOCH FROM expires_at) * 1000)::BIGINT AS expires_at_ms
      FROM runtime_states
      WHERE purpose = $1
        AND token_hash = $2
        AND consumed_at IS NULL
        AND expires_at > clock_timestamp()
      FOR UPDATE
      "#,
    )
    .bind(purpose)
    .bind(token_hash(token))
    .fetch_optional(&mut **tx)
    .await
    .map_err(|err| RuntimeError::database(context, err))?;

    Ok(row.map(payload_row))
  }

  pub(super) async fn unconsumed_row_for_update_in_tx(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    purpose: &str,
    token: &str,
    context: &str,
  ) -> Result<Option<RuntimeStateLockedRow>> {
    let row = sqlx::query(
      r#"
      SELECT payload, attempts, expires_at
      FROM runtime_states
      WHERE purpose = $1
        AND token_hash = $2
        AND consumed_at IS NULL
      FOR UPDATE
      "#,
    )
    .bind(purpose)
    .bind(token_hash(token))
    .fetch_optional(&mut **tx)
    .await
    .map_err(|err| RuntimeError::database(context, err))?;

    Ok(row.map(|row| RuntimeStateLockedRow {
      payload: row.get("payload"),
      attempts: row.get("attempts"),
      expires_at: row.get("expires_at"),
    }))
  }

  pub(super) async fn insert_payload_returning_expires_in_tx(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    input: RuntimeStateInsertPayload<'_>,
  ) -> Result<i64> {
    let row = sqlx::query(
      r#"
      INSERT INTO runtime_states (purpose, token_hash, lookup_key, payload, expires_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + ($5 * INTERVAL '1 millisecond'))
      RETURNING (EXTRACT(EPOCH FROM expires_at) * 1000)::BIGINT AS expires_at_ms
      "#,
    )
    .bind(input.purpose)
    .bind(token_hash(input.token))
    .bind(input.lookup_key)
    .bind(input.payload)
    .bind(input.ttl_ms as f64)
    .fetch_one(&mut **tx)
    .await
    .map_err(|err| RuntimeError::database(input.context, err))?;

    Ok(row.get::<i64, _>("expires_at_ms"))
  }

  pub(super) async fn upsert_expired_or_consumed_payload_returning_expires_in_tx(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    input: RuntimeStateInsertPayload<'_>,
  ) -> Result<Option<i64>> {
    let row = sqlx::query(
      r#"
      INSERT INTO runtime_states (purpose, token_hash, lookup_key, payload, expires_at)
      VALUES ($1, $2, $3, $4, clock_timestamp() + ($5 * INTERVAL '1 millisecond'))
      ON CONFLICT (purpose, token_hash) DO UPDATE
        SET lookup_key = EXCLUDED.lookup_key,
            payload = EXCLUDED.payload,
            attempts = 0,
            consumed_at = NULL,
            expires_at = clock_timestamp() + ($5 * INTERVAL '1 millisecond')
        WHERE runtime_states.consumed_at IS NOT NULL
           OR runtime_states.expires_at <= clock_timestamp()
      RETURNING (EXTRACT(EPOCH FROM expires_at) * 1000)::BIGINT AS expires_at_ms
      "#,
    )
    .bind(input.purpose)
    .bind(token_hash(input.token))
    .bind(input.lookup_key)
    .bind(input.payload)
    .bind(input.ttl_ms as f64)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|err| RuntimeError::database(input.context, err))?;

    Ok(row.map(|row| row.get::<i64, _>("expires_at_ms")))
  }

  pub(super) async fn update_attempts_in_tx(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    purpose: &str,
    token: &str,
    attempts: i32,
    context: &str,
  ) -> Result<()> {
    sqlx::query(
      r#"
      UPDATE runtime_states
      SET attempts = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE purpose = $1
        AND token_hash = $2
      "#,
    )
    .bind(purpose)
    .bind(token_hash(token))
    .bind(attempts)
    .execute(&mut **tx)
    .await
    .map_err(|err| RuntimeError::database(context, err))?;

    Ok(())
  }

  pub(super) async fn delete_by_key_in_tx(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    purpose: &str,
    token: &str,
    context: &str,
  ) -> Result<()> {
    sqlx::query("DELETE FROM runtime_states WHERE purpose = $1 AND token_hash = $2")
      .bind(purpose)
      .bind(token_hash(token))
      .execute(&mut **tx)
      .await
      .map_err(|err| RuntimeError::database(context, err))?;

    Ok(())
  }

  pub(super) async fn cleanup_expired_or_consumed(&self, limit: i64, context: &str) -> Result<i64> {
    let result = sqlx::query(
      r#"
      DELETE FROM runtime_states
      WHERE (purpose, token_hash) IN (
        SELECT purpose, token_hash FROM runtime_states
        WHERE expires_at <= CURRENT_TIMESTAMP
           OR consumed_at IS NOT NULL
        ORDER BY expires_at ASC
        LIMIT $1
      )
      "#,
    )
    .bind(limit)
    .execute(&self.pool)
    .await
    .map_err(|err| RuntimeError::database(context, err))?;

    Ok(result.rows_affected() as i64)
  }

  pub(super) async fn cleanup_expired_by_purpose_prefix(
    &self,
    purpose_prefix: &str,
    limit: i64,
    context: &str,
  ) -> Result<i64> {
    let result = sqlx::query(
      r#"
      DELETE FROM runtime_states
      WHERE (purpose, token_hash) IN (
        SELECT purpose, token_hash FROM runtime_states
        WHERE purpose LIKE $1
          AND expires_at <= CURRENT_TIMESTAMP
        ORDER BY expires_at ASC
        LIMIT $2
      )
      "#,
    )
    .bind(format!("{purpose_prefix}%"))
    .bind(limit)
    .execute(&self.pool)
    .await
    .map_err(|err| RuntimeError::database(context, err))?;

    Ok(result.rows_affected() as i64)
  }
}

fn payload_row(row: sqlx::postgres::PgRow) -> RuntimeStatePayloadRow {
  RuntimeStatePayloadRow {
    payload: row.get("payload"),
    expires_at_ms: row.get("expires_at_ms"),
  }
}
