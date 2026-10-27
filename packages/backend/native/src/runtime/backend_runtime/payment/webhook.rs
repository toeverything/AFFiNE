use chrono::{TimeZone, Utc};
use serde::Deserialize;
use serde_json::Value;
use sqlx::{PgPool, Row};

use super::{RevenueCatClient, StripeClient};
use crate::runtime::{RuntimeError, RuntimeResult};

#[derive(Deserialize)]
struct StripeWebhook {
  id: String,
  #[serde(rename = "type")]
  event_type: String,
  created: i64,
  api_version: Option<String>,
  livemode: bool,
  account: Option<String>,
  data: StripeWebhookData,
}

#[derive(Deserialize)]
struct StripeWebhookData {
  object: Value,
}

#[derive(Deserialize)]
struct RevenueCatWebhook {
  event: RevenueCatWebhookEvent,
}

#[derive(Deserialize)]
struct RevenueCatWebhookEvent {
  id: String,
  #[serde(rename = "type")]
  event_type: String,
  environment: String,
  #[serde(default)]
  event_timestamp_ms: Option<i64>,
}

pub(super) async fn capture_stripe(
  pool: &PgPool,
  client: &StripeClient,
  raw_body: &[u8],
  signature: &str,
) -> RuntimeResult<Value> {
  client.verify_webhook(raw_body, signature, Utc::now())?;
  let payload: Value =
    serde_json::from_slice(raw_body).map_err(|error| RuntimeError::json("invalid Stripe webhook payload", error))?;
  let event: StripeWebhook = serde_json::from_value(payload.clone())
    .map_err(|error| RuntimeError::json("invalid Stripe webhook envelope", error))?;
  validate_identity(&event.id, "Stripe event")?;
  validate_identity(&event.event_type, "Stripe event type")?;
  if event.api_version.as_deref() != Some(super::stripe_client::STRIPE_API_VERSION)
    || event.livemode != (client.namespace().environment == affine_core::payment::ProviderEnvironment::Live)
    || event
      .account
      .as_deref()
      .is_some_and(|account| account != client.namespace().account)
  {
    return Err(RuntimeError::invalid_input("Stripe webhook namespace mismatch"));
  }
  if !event.data.object.is_object() {
    return Err(RuntimeError::invalid_input("invalid Stripe webhook object"));
  }
  let occurred_at = Utc
    .timestamp_opt(event.created, 0)
    .single()
    .ok_or_else(|| RuntimeError::invalid_input("invalid Stripe webhook timestamp"))?;
  let namespace = client
    .namespace()
    .canonical_key()
    .map_err(|_| RuntimeError::invalid_state("invalid Stripe provider namespace"))?;
  capture(
    pool,
    "stripe",
    &namespace,
    &event.id,
    &event.event_type,
    Some(occurred_at),
    payload,
  )
  .await
}

pub(super) async fn capture_revenuecat(
  pool: &PgPool,
  client: &RevenueCatClient,
  raw_body: &[u8],
  authorization: &str,
) -> RuntimeResult<Value> {
  client.verify_webhook_auth(authorization)?;
  let payload: Value = serde_json::from_slice(raw_body)
    .map_err(|error| RuntimeError::json("invalid RevenueCat webhook payload", error))?;
  let event: RevenueCatWebhook = serde_json::from_value(payload.clone())
    .map_err(|error| RuntimeError::json("invalid RevenueCat webhook envelope", error))?;
  validate_identity(&event.event.id, "RevenueCat event")?;
  validate_identity(&event.event.event_type, "RevenueCat event type")?;
  let expected_environment = client.namespace().environment.as_str();
  if event.event.environment.to_ascii_lowercase() != expected_environment {
    return Err(RuntimeError::invalid_input("RevenueCat webhook environment mismatch"));
  }
  let occurred_at = event
    .event
    .event_timestamp_ms
    .map(|timestamp| {
      Utc
        .timestamp_millis_opt(timestamp)
        .single()
        .ok_or_else(|| RuntimeError::invalid_input("invalid RevenueCat webhook timestamp"))
    })
    .transpose()?;
  let namespace = client
    .namespace()
    .canonical_key()
    .map_err(|_| RuntimeError::invalid_state("invalid RevenueCat provider namespace"))?;
  capture(
    pool,
    "revenuecat",
    &namespace,
    &event.event.id,
    &event.event.event_type,
    occurred_at,
    payload,
  )
  .await
}

async fn capture(
  pool: &PgPool,
  provider: &str,
  namespace: &str,
  event_id: &str,
  event_type: &str,
  occurred_at: Option<chrono::DateTime<Utc>>,
  payload: Value,
) -> RuntimeResult<Value> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin payment webhook capture", error))?;
  let existing = sqlx::query(
    "SELECT id,provider_namespace,processing_status FROM payment_events WHERE provider=$1::\"Provider\" AND \
     external_event_id=$2 FOR UPDATE",
  )
  .bind(provider)
  .bind(event_id)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("lock payment webhook receipt", error))?;
  let (receipt_id, status) = if let Some(existing) = existing {
    if existing.get::<Option<String>, _>("provider_namespace").as_deref() != Some(namespace) {
      return Err(RuntimeError::invalid_state(
        "payment event belongs to another provider namespace",
      ));
    }
    let receipt_id: String = existing.get("id");
    let status: String = existing.get("processing_status");
    if matches!(status.as_str(), "pending" | "failed") {
      sqlx::query(
        "UPDATE payment_events SET \
         event_type=$2,occurred_at=$3,metadata=$4,last_error=NULL,next_attempt_at=NULL,updated_at=clock_timestamp() \
         WHERE id=$1",
      )
      .bind(&receipt_id)
      .bind(event_type)
      .bind(occurred_at)
      .bind(payload)
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("refresh payment webhook receipt", error))?;
    }
    (receipt_id, status)
  } else {
    let receipt_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
      "INSERT INTO payment_events(id,provider,provider_namespace,event_type,external_event_id,occurred_at,metadata) \
       VALUES($1,$2::\"Provider\",$3,$4,$5,$6,$7)",
    )
    .bind(&receipt_id)
    .bind(provider)
    .bind(namespace)
    .bind(event_type)
    .bind(event_id)
    .bind(occurred_at)
    .bind(payload)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("insert payment webhook receipt", error))?;
    (receipt_id, "pending".to_string())
  };
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit payment webhook receipt", error))?;
  Ok(serde_json::json!({ "receiptId": receipt_id, "status": status }))
}

fn validate_identity(value: &str, label: &str) -> RuntimeResult<()> {
  if value.is_empty() || value != value.trim() || value.len() > 255 {
    return Err(RuntimeError::invalid_input(format!("invalid {label} identity")));
  }
  Ok(())
}
