use super::{
  BYOK_LOCAL_LEASE_ACTIVE_PURPOSE, BYOK_LOCAL_LEASE_PURPOSE, Result, RuntimeByokLocalLeaseRecord, RuntimeError,
  dto::{RuntimeStateInsertPayload, RuntimeStatePayloadRow, RuntimeStateRows},
};

pub(super) async fn get(rows: &RuntimeStateRows, lease_id: String) -> Result<Option<RuntimeByokLocalLeaseRecord>> {
  get_lease_by_id(rows, &lease_id).await
}

pub(super) async fn create(
  rows: &RuntimeStateRows,
  active_key: String,
  lease_id: String,
  payload: serde_json::Value,
  ttl_ms: i64,
) -> Result<RuntimeByokLocalLeaseRecord> {
  if ttl_ms <= 0 {
    return Err(RuntimeError::invalid_input("BYOK local lease ttl must be positive"));
  }

  let mut tx = rows.begin("RuntimeState BYOK local lease").await?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(&active_key)
    .execute(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("RuntimeState BYOK local lease active lock failed", err))?;

  if let Some(active) = rows
    .active_payload_with_expires_for_update_in_tx(
      &mut tx,
      BYOK_LOCAL_LEASE_ACTIVE_PURPOSE,
      &active_key,
      "RuntimeState BYOK local lease active get",
    )
    .await?
  {
    let existing_lease = match active.payload.get("leaseId").and_then(serde_json::Value::as_str) {
      Some(existing_lease_id) => get_lease_by_id_in_tx(rows, &mut tx, existing_lease_id).await?,
      None => None,
    };
    if let Some(lease) = existing_lease {
      tx.commit()
        .await
        .map_err(|err| RuntimeError::database("RuntimeState BYOK local lease transaction commit failed", err))?;
      return Ok(lease);
    }

    rows
      .delete_by_key_in_tx(
        &mut tx,
        BYOK_LOCAL_LEASE_ACTIVE_PURPOSE,
        &active_key,
        "RuntimeState BYOK local lease stale active delete",
      )
      .await?;
  }

  let expires_at_ms = rows
    .insert_payload_returning_expires_in_tx(
      &mut tx,
      RuntimeStateInsertPayload {
        purpose: BYOK_LOCAL_LEASE_PURPOSE,
        token: &lease_id,
        lookup_key: &active_key,
        payload: &payload,
        ttl_ms,
        context: "RuntimeState BYOK local lease create",
      },
    )
    .await?;
  let active_payload = serde_json::json!({ "leaseId": lease_id });
  rows
    .insert_payload_returning_expires_in_tx(
      &mut tx,
      RuntimeStateInsertPayload {
        purpose: BYOK_LOCAL_LEASE_ACTIVE_PURPOSE,
        token: &active_key,
        lookup_key: &active_key,
        payload: &active_payload,
        ttl_ms,
        context: "RuntimeState BYOK local lease active create",
      },
    )
    .await?;

  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("RuntimeState BYOK local lease transaction commit failed", err))?;

  Ok(RuntimeByokLocalLeaseRecord {
    lease_id,
    payload,
    expires_at_ms,
  })
}

async fn get_lease_by_id(rows: &RuntimeStateRows, lease_id: &str) -> Result<Option<RuntimeByokLocalLeaseRecord>> {
  rows
    .active_payload_with_expires(BYOK_LOCAL_LEASE_PURPOSE, lease_id, "RuntimeState BYOK local lease get")
    .await?
    .map(|row| record_from_row(lease_id, row))
    .transpose()
}

async fn get_lease_by_id_in_tx(
  rows: &RuntimeStateRows,
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  lease_id: &str,
) -> Result<Option<RuntimeByokLocalLeaseRecord>> {
  rows
    .active_payload_with_expires_for_update_in_tx(
      tx,
      BYOK_LOCAL_LEASE_PURPOSE,
      lease_id,
      "RuntimeState BYOK local lease get",
    )
    .await?
    .map(|row| record_from_row(lease_id, row))
    .transpose()
}

fn record_from_row(lease_id: &str, row: RuntimeStatePayloadRow) -> Result<RuntimeByokLocalLeaseRecord> {
  Ok(RuntimeByokLocalLeaseRecord {
    lease_id: lease_id.to_string(),
    payload: row.payload,
    expires_at_ms: row.expires_at_ms,
  })
}
