use affine_core::access_control::Plan;
use serde_json::{Value, json};
use sqlx::Row;

use super::{PaymentRuntime, parse_lookup_key, provider_runtime_error, validate_identity, validate_target};
use crate::runtime::{RuntimeError, RuntimeResult};

impl PaymentRuntime {
  pub(super) async fn list_prices(&self) -> RuntimeResult<Value> {
    let prices = self
      .stripe()?
      .list_all::<super::StripePrice>("v1/prices", &[("active", "true"), ("expand[]", "data.product")])
      .await
      .map_err(provider_runtime_error)?;
    Ok(Value::Array(
      prices
        .into_iter()
        .filter_map(|price| {
          let (plan, recurring, variant) = parse_lookup_key(price.lookup_key.as_deref()?).ok()?;
          matches!(plan, Plan::Pro | Plan::Ai | Plan::Team).then(|| {
            json!({
              "id": price.id,
              "plan": plan.as_str(),
              "recurring": recurring.as_str(),
              "variant": variant,
              "currency": price.currency,
              "amount": price.unit_amount,
            })
          })
        })
        .collect(),
    ))
  }

  pub(super) async fn list_subscriptions(&self, target_type: &str, target_id: &str) -> RuntimeResult<Value> {
    validate_target(target_type, target_id)?;
    let rows = sqlx::query(
      r#"SELECT provider::text AS provider,status,plan,recurring,quantity,period_start,period_end,trial_start,trial_end,canceled_at,
                iap_store::text AS iap_store,external_subscription_id,metadata,created_at,updated_at
         FROM provider_subscriptions
         WHERE target_type=$1 AND target_id=$2
           AND status IN ('active','trialing','past_due')
           AND (period_end IS NULL OR period_end>clock_timestamp())
         ORDER BY updated_at DESC"#,
    )
    .bind(target_type)
    .bind(target_id)
    .fetch_all(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("list payment subscriptions", error))?;
    Ok(Value::Array(
      rows
        .into_iter()
        .map(|row| {
          let metadata: Value = row.get("metadata");
          json!({
            "stripeSubscriptionId": row.get::<Option<String>, _>("external_subscription_id"),
            "stripeScheduleId": metadata.get("stripeScheduleId").and_then(Value::as_str),
            "status": row.get::<String, _>("status"),
            "plan": row.get::<String, _>("plan"),
            "recurring": row.get::<Option<String>, _>("recurring").unwrap_or_else(|| "monthly".to_string()),
            "variant": metadata.get("variant").and_then(Value::as_str),
            "quantity": row.get::<Option<i32>, _>("quantity").unwrap_or(1),
            "start": row.get::<Option<chrono::DateTime<chrono::Utc>>, _>("period_start"),
            "end": row.get::<Option<chrono::DateTime<chrono::Utc>>, _>("period_end"),
            "trialStart": row.get::<Option<chrono::DateTime<chrono::Utc>>, _>("trial_start"),
            "trialEnd": row.get::<Option<chrono::DateTime<chrono::Utc>>, _>("trial_end"),
            "nextBillAt": if row.get::<Option<chrono::DateTime<chrono::Utc>>, _>("canceled_at").is_none() {
              row.get::<Option<chrono::DateTime<chrono::Utc>>, _>("period_end")
            } else { None },
            "canceledAt": row.get::<Option<chrono::DateTime<chrono::Utc>>, _>("canceled_at"),
            "provider": row.get::<String, _>("provider"),
            "iapStore": row.get::<Option<String>, _>("iap_store"),
            "createdAt": row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
            "updatedAt": row.get::<chrono::DateTime<chrono::Utc>, _>("updated_at"),
          })
        })
        .collect(),
    ))
  }

  pub(super) async fn list_invoices(&self, target_id: &str) -> RuntimeResult<Value> {
    validate_identity(target_id, "invoice target")?;
    let rows = sqlx::query(
      "SELECT currency,amount,status,reason,last_payment_error,link,created_at,updated_at FROM invoices WHERE \
       target_id=$1 ORDER BY created_at DESC",
    )
    .bind(target_id)
    .fetch_all(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("list payment invoices", error))?;
    Ok(Value::Array(
      rows
        .into_iter()
        .map(|row| {
          json!({
            "currency": row.get::<String, _>("currency"),
            "amount": row.get::<i32, _>("amount"),
            "status": row.get::<String, _>("status"),
            "reason": row.get::<Option<String>, _>("reason"),
            "lastPaymentError": row.get::<Option<String>, _>("last_payment_error"),
            "link": row.get::<Option<String>, _>("link"),
            "createdAt": row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
            "updatedAt": row.get::<chrono::DateTime<chrono::Utc>, _>("updated_at"),
          })
        })
        .collect(),
    ))
  }
}
