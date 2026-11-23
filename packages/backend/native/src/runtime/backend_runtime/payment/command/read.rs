use affine_core::access_control::Plan;
use serde_json::{Value, json};
use sqlx::Row;

use super::{PaymentRuntime, parse_lookup_key, provider_runtime_error, validate_identity};
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
