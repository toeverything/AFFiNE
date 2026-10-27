use affine_core::access_control::Plan;
use serde_json::{Value, json};
use sqlx::Row;

use super::*;

impl PaymentRuntime {
  pub(super) async fn prepare_user_deletion(&self, user_id: &str) -> RuntimeResult<Value> {
    validate_identity(user_id, "payment user")?;
    let namespace = self.stripe()?.namespace().clone();
    let namespace_key = canonical_namespace(&namespace)?;
    let rows = sqlx::query(
      r#"SELECT source_identity,external_customer_id,external_subscription_id,plan
         FROM provider_subscriptions
         WHERE provider_namespace=$1 AND target_type='user' AND target_id=$2
           AND recurring<>'lifetime' AND external_subscription_id IS NOT NULL
           AND status IN ('active','trialing','past_due')
           AND (period_end IS NULL OR period_end>clock_timestamp())
         ORDER BY source_identity"#,
    )
    .bind(&namespace_key)
    .bind(user_id)
    .fetch_all(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load account payment subscriptions", error))?;
    let prepared = rows.len();
    let mut resources = Vec::new();
    let mut steps = Vec::new();
    for row in rows {
      let source_id = required_column(&row, "source_identity", "payment subscription identity missing")?;
      let customer_id = required_column(&row, "external_customer_id", "payment customer identity missing")?;
      let subscription_id = required_column(
        &row,
        "external_subscription_id",
        "payment subscription identity missing",
      )?;
      let plan = parse_plan(row.get::<String, _>("plan").as_str())?;
      if !matches!(plan, Plan::Pro | Plan::Ai) {
        return Err(RuntimeError::invalid_state("invalid user payment subscription"));
      }
      resources.extend([
        PaymentScope::source(&namespace_key, &source_id)?,
        PaymentScope::customer(&namespace_key, &customer_id)?,
        PaymentScope::cloud_target("user", user_id, plan)?,
      ]);
      steps.push(PaymentStepState {
        key: format!("payment:account-delete:{user_id}:{source_id}"),
        request: PaymentStep::StripeDelete {
          path: format!("v1/subscriptions/{}", encode_segment(&subscription_id)),
          api_version: super::super::stripe_client::STRIPE_API_VERSION.to_string(),
        },
        first_sent_at: None,
        result: None,
      });
    }
    if prepared != 0 {
      let Some(mut connection) = PaymentConnection::try_acquire(&self.pool, resources.clone()).await? else {
        return Err(RuntimeError::invalid_state("payment_busy"));
      };
      freeze_operation(
        &mut connection,
        &OperationIntent {
          namespace: namespace.clone(),
          operation_type: "account_delete_cancel".to_string(),
          intent_id: format!("account-delete:{user_id}"),
          resources,
          target_type: Some("user".to_string()),
          target_id: Some(user_id.to_string()),
          steps,
        },
      )
      .await?;
    }
    Ok(json!({ "prepared": prepared }))
  }
}
