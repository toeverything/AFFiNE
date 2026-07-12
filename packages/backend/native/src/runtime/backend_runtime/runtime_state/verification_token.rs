use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::{
  Result, RuntimeError, RuntimeVerificationTokenRecord,
  dto::{RuntimeStatePayloadRow, RuntimeStateRows},
  token_hash, verification_token_purpose,
};

pub(super) async fn create(
  rows: &RuntimeStateRows,
  token_type: i32,
  credential: Option<String>,
  ttl_ms: i64,
) -> Result<String> {
  let token = Uuid::new_v4().to_string();
  let payload = serde_json::json!({ "credential": credential });

  rows
    .insert_payload(
      &verification_token_purpose(token_type),
      &token,
      credential.as_deref(),
      payload,
      ttl_ms,
      "RuntimeState verification token create",
    )
    .await?;

  Ok(token)
}

pub(super) async fn get(
  rows: &RuntimeStateRows,
  token_type: i32,
  token: String,
  keep: bool,
) -> Result<Option<RuntimeVerificationTokenRecord>> {
  let purpose = verification_token_purpose(token_type);
  let row = if keep {
    rows
      .active_payload_with_expires(&purpose, &token, "RuntimeState verification token get")
      .await?
  } else {
    rows
      .consume_payload_with_expires(&purpose, &token, "RuntimeState verification token get")
      .await?
  };

  Ok(row.map(|row| record_from_row(token_type, token, row)))
}

pub(super) async fn verify(
  rows: &RuntimeStateRows,
  token_type: i32,
  token: String,
  credential: Option<String>,
  keep: bool,
) -> Result<Option<RuntimeVerificationTokenRecord>> {
  let purpose = verification_token_purpose(token_type);
  let row = if keep {
    active_payload_with_credential(rows.pool(), &purpose, &token, credential.as_deref()).await
  } else {
    consume_payload_with_credential(rows.pool(), &purpose, &token, credential.as_deref()).await
  }
  .map_err(|err| RuntimeError::database("RuntimeState verification token verify failed", err))?;

  Ok(row.map(|row| record_from_row(token_type, token, row)))
}

pub(super) async fn cleanup_expired(rows: &RuntimeStateRows, limit: i64) -> Result<i64> {
  rows
    .cleanup_expired_by_purpose_prefix("verification_token:", limit, "RuntimeState verification token cleanup")
    .await
}

async fn active_payload_with_credential(
  pool: &PgPool,
  purpose: &str,
  token: &str,
  credential: Option<&str>,
) -> sqlx::Result<Option<RuntimeStatePayloadRow>> {
  let row = sqlx::query(
    r#"
    SELECT payload, (EXTRACT(EPOCH FROM expires_at) * 1000)::BIGINT AS expires_at_ms
    FROM runtime_states
    WHERE purpose = $1
      AND token_hash = $2
      AND consumed_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
      AND (payload->>'credential' IS NULL OR payload->>'credential' = $3)
    "#,
  )
  .bind(purpose)
  .bind(token_hash(token))
  .bind(credential)
  .fetch_optional(pool)
  .await?;

  Ok(row.map(payload_row))
}

async fn consume_payload_with_credential(
  pool: &PgPool,
  purpose: &str,
  token: &str,
  credential: Option<&str>,
) -> sqlx::Result<Option<RuntimeStatePayloadRow>> {
  let row = sqlx::query(
    r#"
    UPDATE runtime_states
    SET consumed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE purpose = $1
      AND token_hash = $2
      AND consumed_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
      AND (payload->>'credential' IS NULL OR payload->>'credential' = $3)
    RETURNING payload, (EXTRACT(EPOCH FROM expires_at) * 1000)::BIGINT AS expires_at_ms
    "#,
  )
  .bind(purpose)
  .bind(token_hash(token))
  .bind(credential)
  .fetch_optional(pool)
  .await?;

  Ok(row.map(payload_row))
}

fn payload_row(row: sqlx::postgres::PgRow) -> RuntimeStatePayloadRow {
  RuntimeStatePayloadRow {
    payload: row.get("payload"),
    expires_at_ms: row.get("expires_at_ms"),
  }
}

fn record_from_row(token_type: i32, token: String, row: RuntimeStatePayloadRow) -> RuntimeVerificationTokenRecord {
  RuntimeVerificationTokenRecord {
    token_type,
    token,
    credential: row
      .payload
      .get("credential")
      .and_then(serde_json::Value::as_str)
      .map(ToString::to_string),
    expires_at_ms: row.expires_at_ms,
  }
}
