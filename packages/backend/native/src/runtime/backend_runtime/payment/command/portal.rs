use serde_json::{Value, json};

use super::*;

impl PaymentRuntime {
  pub(super) async fn create_portal(
    &self,
    changes: &mut super::super::PaymentApplyResult,
    actor_user_id: &str,
    intent_id: &str,
  ) -> RuntimeResult<Value> {
    validate_identity(actor_user_id, "payment actor")?;
    validate_intent(intent_id)?;
    let stripe = self.stripe()?;
    let namespace = stripe.namespace().clone();
    let namespace_key = canonical_namespace(&namespace)?;
    let customer_id: String = sqlx::query_scalar(
      "SELECT stripe_customer_id FROM user_stripe_customers WHERE user_id=$1 AND provider_namespace=$2",
    )
    .bind(actor_user_id)
    .bind(&namespace_key)
    .fetch_optional(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load Stripe portal customer", error))?
    .ok_or_else(|| RuntimeError::invalid_state("payment_customer_not_found"))?;
    let intent = stripe_operation(
      namespace.clone(),
      "create_portal",
      intent_id,
      vec![
        PaymentScope::billing_target(&namespace_key, "user", actor_user_id)?,
        PaymentScope::customer(&namespace_key, &customer_id)?,
      ],
      Some("user"),
      Some(actor_user_id),
      "v1/billing_portal/sessions",
      vec![text_field("customer", &customer_id)],
    );
    match self.execute_stripe_operation(intent).await? {
      OperationExecution::Completed(result) => Ok(result),
      OperationExecution::Sent {
        connection,
        operation_id,
        response,
      } => {
        let portal: super::super::stripe_client::StripePortalSession = serde_json::from_value(response)
          .map_err(|error| RuntimeError::json("invalid Stripe portal response", error))?;
        let result = json!({ "url": portal.url, "sessionId": portal.id });
        changes.extend(
          self
            .apply_with_connection(
              connection,
              empty_snapshot(namespace, Some(customer_id), operation_id, result.clone()),
            )
            .await?,
        );
        Ok(result)
      }
    }
  }
}
