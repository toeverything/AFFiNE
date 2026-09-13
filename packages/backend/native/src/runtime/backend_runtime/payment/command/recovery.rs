use serde_json::{Value, json};
use sqlx::Row;

use super::*;

pub(in crate::runtime::backend_runtime::payment) async fn recover_one_stripe_operation(
  runtime: &PaymentRuntime,
) -> RuntimeResult<Option<super::super::PaymentApplyResult>> {
  let Some(stripe) = runtime.stripe.as_deref() else {
    return Ok(None);
  };
  let namespace = canonical_namespace(stripe.namespace())?;
  let row = sqlx::query(
    r#"SELECT id,operation_type,intent_id,resource_keys,target_type,target_id,steps
       FROM payment_operations
       WHERE provider='stripe' AND provider_namespace=$1 AND status='pending'
         AND (first_sent_at IS NOT NULL OR operation_type='account_delete_cancel')
         AND (next_attempt_at IS NULL OR next_attempt_at<=clock_timestamp())
       ORDER BY updated_at,id LIMIT 1"#,
  )
  .bind(&namespace)
  .fetch_optional(&runtime.pool)
  .await
  .map_err(|error| RuntimeError::database("load pending Stripe operation", error))?;
  let Some(row) = row else {
    return Ok(None);
  };
  let operation_type: String = row.get("operation_type");
  let target_type: Option<String> = row.get("target_type");
  let target_id: Option<String> = row.get("target_id");
  let resources = row
    .get::<Vec<String>, _>("resource_keys")
    .into_iter()
    .map(|scope| PaymentScope::from_stored(scope, &namespace))
    .collect::<RuntimeResult<Vec<_>>>()?;
  let intent = OperationIntent {
    namespace: stripe.namespace().clone(),
    operation_type: operation_type.clone(),
    intent_id: row.get("intent_id"),
    resources,
    target_type: target_type.clone(),
    target_id: target_id.clone(),
    steps: serde_json::from_value(row.get("steps"))
      .map_err(|error| RuntimeError::json("decode pending Stripe operation", error))?,
  };
  let reserves_trial = intent.steps.iter().any(|step| {
    matches!(
      &step.request,
      PaymentStep::StripePost { form, .. }
        if form.iter().any(|field| field.key == "subscription_data[trial_period_days]")
    )
  });
  let OperationExecution::Sent {
    connection,
    operation_id,
    response,
  } = runtime.execute_stripe_operation(intent).await?
  else {
    return Ok(None);
  };
  let snapshot = match operation_type.as_str() {
    "create_customer" => recover_customer(
      stripe.namespace().clone(),
      target_type,
      target_id,
      operation_id,
      response,
    )?,
    "create_checkout" => recover_checkout(
      stripe.namespace().clone(),
      target_type,
      target_id,
      operation_id,
      response,
      reserves_trial,
    )?,
    "cancel" | "resume" | "update_recurring" | "update_quantity" => {
      recover_subscription(runtime, operation_id, target_type, target_id).await?
    }
    "account_delete_cancel" => recover_account_delete(stripe.namespace().clone(), operation_id, response)?,
    "provision_price" => recover_price(stripe.namespace().clone(), operation_id, response)?,
    _ => return Err(RuntimeError::invalid_state("unsupported pending Stripe operation")),
  };
  runtime.apply_with_connection(connection, snapshot).await.map(Some)
}

fn recover_price(
  namespace: ProviderNamespace,
  operation_id: String,
  response: Value,
) -> RuntimeResult<PaymentSnapshot> {
  let price: StripePrice =
    serde_json::from_value(response).map_err(|error| RuntimeError::json("invalid provisioned Stripe price", error))?;
  let lookup_key = price
    .lookup_key
    .ok_or_else(|| RuntimeError::invalid_state("provisioned Stripe price has no lookup key"))?;
  Ok(empty_snapshot(
    namespace,
    None,
    operation_id,
    json!({ "priceId": price.id, "lookupKey": lookup_key, "created": true }),
  ))
}

fn recover_account_delete(
  namespace: ProviderNamespace,
  operation_id: String,
  response: Value,
) -> RuntimeResult<PaymentSnapshot> {
  let subscription: StripeSubscription = serde_json::from_value(response)
    .map_err(|error| RuntimeError::json("invalid deleted Stripe subscription response", error))?;
  if subscription.status != "canceled" {
    return Err(RuntimeError::invalid_state(
      "deleted Stripe subscription is not canceled",
    ));
  }
  Ok(empty_snapshot(
    namespace,
    Some(subscription.customer.id().to_string()),
    operation_id,
    json!({ "canceled": true, "subscriptionId": subscription.id }),
  ))
}

fn recover_customer(
  namespace: ProviderNamespace,
  target_type: Option<String>,
  target_id: Option<String>,
  operation_id: String,
  response: Value,
) -> RuntimeResult<PaymentSnapshot> {
  if target_type.as_deref() != Some("user") {
    return Err(RuntimeError::invalid_state("pending Stripe customer target is invalid"));
  }
  let user_id = target_id.ok_or_else(|| RuntimeError::invalid_state("pending Stripe customer target is missing"))?;
  let customer: StripeCustomer =
    serde_json::from_value(response).map_err(|error| RuntimeError::json("invalid Stripe customer response", error))?;
  if customer.deleted {
    return Err(RuntimeError::invalid_state("pending Stripe customer was deleted"));
  }
  let result = json!({ "customerId": customer.id });
  let mut snapshot = empty_snapshot(namespace, Some(customer.id.clone()), operation_id, result);
  snapshot.customers.push(CustomerSnapshot {
    user_id,
    external_customer_id: customer.id,
  });
  Ok(snapshot)
}

fn recover_checkout(
  namespace: ProviderNamespace,
  target_type: Option<String>,
  target_id: Option<String>,
  operation_id: String,
  response: Value,
  reserves_trial: bool,
) -> RuntimeResult<PaymentSnapshot> {
  let target_type =
    target_type.ok_or_else(|| RuntimeError::invalid_state("pending Stripe checkout target is missing"))?;
  let target_id = target_id.ok_or_else(|| RuntimeError::invalid_state("pending Stripe checkout target is missing"))?;
  let session: StripeCheckoutSession =
    serde_json::from_value(response).map_err(|error| RuntimeError::json("invalid Stripe checkout response", error))?;
  let url = session
    .url
    .ok_or_else(|| RuntimeError::invalid_state("Stripe checkout has no URL"))?;
  let customer_id = session.customer.as_ref().map(|customer| customer.id().to_string());
  let result = json!({ "url": url, "sessionId": session.id, "targetId": target_id });
  let mut snapshot = empty_snapshot(namespace, customer_id, operation_id, result);
  if target_type == "user" && reserves_trial {
    snapshot.trials.push(TrialSnapshot {
      target_type,
      target_id,
      plan: Plan::Ai,
      external_ref: Some(session.id),
      metadata: json!({ "source": "checkout_session" }),
    });
  }
  Ok(snapshot)
}

async fn recover_subscription(
  runtime: &PaymentRuntime,
  operation_id: String,
  target_type: Option<String>,
  target_id: Option<String>,
) -> RuntimeResult<PaymentSnapshot> {
  let target_type = target_type.ok_or_else(|| RuntimeError::invalid_state("pending Stripe target is missing"))?;
  let target_id = target_id.ok_or_else(|| RuntimeError::invalid_state("pending Stripe target is missing"))?;
  let row = sqlx::query(
    r#"SELECT external_subscription_id,plan FROM provider_subscriptions
       WHERE provider_namespace=$1 AND target_type=$2 AND target_id=$3
         AND external_subscription_id IS NOT NULL
       ORDER BY updated_at DESC LIMIT 1"#,
  )
  .bind(canonical_namespace(runtime.stripe()?.namespace())?)
  .bind(&target_type)
  .bind(&target_id)
  .fetch_optional(&runtime.pool)
  .await
  .map_err(|error| RuntimeError::database("load pending Stripe subscription", error))?
  .ok_or_else(|| RuntimeError::invalid_state("pending Stripe subscription is missing"))?;
  let subscription_id: String = row.get("external_subscription_id");
  let plan = parse_plan(row.get::<String, _>("plan").as_str())?;
  let subscription = runtime
    .stripe()?
    .subscription(&subscription_id)
    .await
    .map_err(provider_runtime_error)?;
  let result = subscription_result(&subscription, plan);
  super::super::snapshot::stripe_subscription_snapshot(
    &runtime.pool,
    runtime.stripe()?,
    subscription,
    Vec::new(),
    Some(OperationCompletion { operation_id, result }),
  )
  .await
}
