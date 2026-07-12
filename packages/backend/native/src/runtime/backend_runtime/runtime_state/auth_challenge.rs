use super::{Result, auth_challenge_purpose, dto::RuntimeStateRows};

pub(super) async fn create(
  rows: &RuntimeStateRows,
  purpose: &str,
  token: &str,
  payload: serde_json::Value,
  ttl_ms: i64,
) -> Result<bool> {
  rows
    .insert_payload_if_absent(
      &auth_challenge_purpose(purpose),
      token,
      None,
      payload,
      ttl_ms,
      "RuntimeState auth challenge create",
    )
    .await
}

pub(super) async fn get(rows: &RuntimeStateRows, purpose: &str, token: &str) -> Result<Option<serde_json::Value>> {
  rows
    .active_payload(
      &auth_challenge_purpose(purpose),
      token,
      "RuntimeState auth challenge get",
    )
    .await
}

pub(super) async fn consume(rows: &RuntimeStateRows, purpose: &str, token: &str) -> Result<Option<serde_json::Value>> {
  rows
    .consume_payload(
      &auth_challenge_purpose(purpose),
      token,
      "RuntimeState auth challenge consume",
    )
    .await
}
