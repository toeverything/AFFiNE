use affine_core::payment::UserPlanFamily;

use super::*;

const PRODUCT_FIELD: &str = "metadata[affine_checkout_product]";

pub(super) fn checkout_product(steps: &[PaymentStepState]) -> Option<&str> {
  match &steps.first()?.request {
    PaymentStep::StripePost { form, .. } => form.iter().find_map(|field| match &field.value {
      PaymentFormValue::Text(value) if field.key == PRODUCT_FIELD => Some(value.as_str()),
      _ => None,
    }),
    _ => None,
  }
}

pub(super) fn checkout_reserves_trial(steps: &[PaymentStepState]) -> bool {
  steps.iter().any(|step| {
    matches!(
      &step.request,
      PaymentStep::StripePost { form, .. }
        if form.iter().any(|field| field.key == "subscription_data[trial_period_days]")
    )
  })
}

pub(super) async fn finish_purchase(
  connection: &mut PaymentConnection,
  operation_id: &str,
  reason: &str,
) -> RuntimeResult<()> {
  sqlx::query(
    "UPDATE payment_operations SET status='completed',next_attempt_at=NULL,last_error_code=$2,
       updated_at=clock_timestamp() WHERE id=$1 AND status='waiting'",
  )
  .bind(operation_id)
  .bind(reason)
  .execute(connection.connection())
  .await
  .map_err(|error| RuntimeError::database("finish purchase", error))?;
  Ok(())
}

impl PaymentRuntime {
  pub(super) async fn checkout_attempt(&self, user_id: &str, plan: Plan) -> RuntimeResult<Value> {
    if UserPlanFamily::from_plan(plan).is_none() {
      return Err(RuntimeError::invalid_input("invalid checkout plan"));
    }
    let namespace = canonical_namespace(self.stripe()?.namespace())?;
    let scope = PaymentScope::cloud_target("user", user_id, plan)?;
    let id: Option<String> = sqlx::query_scalar(
      "SELECT id FROM payment_operations WHERE provider_namespace=$1 AND primary_resource_key=$2
         AND operation_type='purchase_checkout' AND status='waiting'",
    )
    .bind(namespace)
    .bind(scope.as_str())
    .fetch_optional(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load Stripe checkout attempt", error))?;
    Ok(json!(id))
  }

  pub(super) async fn expire_checkout(&self, user_id: &str, plan: Plan, attempt_id: &str) -> RuntimeResult<Value> {
    if UserPlanFamily::from_plan(plan).is_none() {
      return Err(RuntimeError::invalid_input("invalid checkout plan"));
    }
    let stripe = self.stripe()?;
    let namespace = canonical_namespace(stripe.namespace())?;
    let scope = PaymentScope::cloud_target("user", user_id, plan)?;
    let mut connection = PaymentConnection::try_acquire(&self.pool, vec![scope.clone()])
      .await?
      .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
    let now = purchase_time(&mut connection).await?;
    let Some(attempt) = open_purchase(&mut connection, &scope, now).await? else {
      return Ok(Value::Bool(true));
    };
    if attempt.id != attempt_id
      || attempt.operation_type != "purchase_checkout"
      || attempt.namespace != namespace
      || attempt.status != "waiting"
    {
      return Ok(Value::Bool(false));
    }
    let session_id = attempt
      .result
      .as_ref()
      .and_then(|value| value["sessionId"].as_str())
      .ok_or_else(|| RuntimeError::invalid_state("missing checkout session"))?;
    let session = stripe
      .checkout_session(session_id)
      .await
      .map_err(provider_runtime_error)?;
    let expired = match session.status.as_deref() {
      Some("expired") => true,
      Some("open") => {
        let path = format!("v1/checkout/sessions/{}/expire", encode_segment(session_id));
        match stripe
          .post::<StripeCheckoutSession>(&path, &StripeForm::default(), &format!("payment:{}:expire", attempt.id))
          .await
        {
          Ok(session) => session.status.as_deref() == Some("expired"),
          Err(_) => {
            stripe
              .checkout_session(session_id)
              .await
              .map_err(provider_runtime_error)?
              .status
              .as_deref()
              == Some("expired")
          }
        }
      }
      _ => false,
    };
    if expired {
      finish_purchase(&mut connection, &attempt.id, "expired").await?;
    }
    Ok(Value::Bool(expired))
  }
}

pub(in crate::runtime::backend_runtime::payment) async fn stripe_checkout_receipt(
  runtime: &PaymentRuntime,
  receipt: &Receipt,
) -> RuntimeResult<()> {
  let session_id = receipt
    .payload
    .pointer("/data/object/id")
    .and_then(Value::as_str)
    .ok_or_else(|| RuntimeError::invalid_input("Stripe checkout receipt has no identity"))?;
  sqlx::query(
    "UPDATE payment_operations SET next_attempt_at=clock_timestamp()
      WHERE provider_namespace=$1 AND operation_type='purchase_checkout' AND status='waiting'
        AND result->>'sessionId'=$2",
  )
  .bind(&receipt.namespace)
  .bind(session_id)
  .execute(&runtime.pool)
  .await
  .map_err(|error| RuntimeError::database("schedule checkout verification", error))?;
  Ok(())
}

pub(in crate::runtime::backend_runtime::payment) async fn recover_waiting_checkout(
  runtime: &PaymentRuntime,
) -> RuntimeResult<Option<super::super::PaymentApplyResult>> {
  let Some(stripe) = runtime.stripe.as_deref() else {
    return Ok(None);
  };
  let namespace = canonical_namespace(stripe.namespace())?;
  let row = sqlx::query(
    "WITH candidate AS (
       SELECT id FROM payment_operations
        WHERE provider_namespace=$1 AND operation_type='purchase_checkout' AND status='waiting'
          AND next_attempt_at<=clock_timestamp()
        ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     UPDATE payment_operations operation SET next_attempt_at=clock_timestamp()+INTERVAL '1 minute'
       FROM candidate WHERE operation.id=candidate.id
       RETURNING operation.id,operation.target_id,operation.primary_resource_key,operation.result",
  )
  .bind(&namespace)
  .fetch_optional(&runtime.pool)
  .await
  .map_err(|error| RuntimeError::database("claim waiting checkout", error))?;
  let Some(row) = row else {
    return Ok(None);
  };
  let result: Value = row.get("result");
  let session_id = result["sessionId"]
    .as_str()
    .ok_or_else(|| RuntimeError::invalid_state("missing checkout session"))?;
  let session = stripe
    .checkout_session(session_id)
    .await
    .map_err(provider_runtime_error)?;
  let scope = PaymentScope::from_stored(row.get("primary_resource_key"), &namespace)?;
  let operation_id: String = row.get("id");
  let target_id: String = row.get("target_id");
  if session.status.as_deref() == Some("complete")
    && matches!(session.payment_status.as_deref(), Some("paid" | "no_payment_required"))
  {
    let source_id = if let Some(subscription) = session.subscription.as_ref() {
      subscription.id().to_string()
    } else if let Some(invoice) = session.invoice.as_ref() {
      format!("stripe_invoice:{}", invoice.id())
    } else {
      return Ok(None);
    };
    let mut scopes = vec![scope, PaymentScope::source(&namespace, &source_id)?];
    if let Some(customer) = session.customer.as_ref() {
      scopes.push(PaymentScope::customer(&namespace, customer.id())?);
    }
    let Some(mut connection) = PaymentConnection::try_acquire(&runtime.pool, scopes).await? else {
      return Ok(None);
    };
    for _ in 0..=4 {
      let observed_at = chrono::Utc::now();
      let mut snapshot = if let Some(invoice) = session.invoice.as_ref() {
        let invoice = stripe.invoice(invoice.id()).await.map_err(provider_runtime_error)?;
        stripe_invoice_snapshot(&runtime.pool, stripe, invoice, Vec::new(), observed_at).await?
      } else if let Some(subscription) = session.subscription.as_ref() {
        let subscription = stripe
          .subscription(subscription.id())
          .await
          .map_err(provider_runtime_error)?;
        stripe_subscription_snapshot(&runtime.pool, stripe, subscription, Vec::new(), None).await?
      } else {
        return Ok(None);
      };
      if !snapshot
        .subscriptions
        .iter()
        .any(|source| source.target_type == "user" && source.target_id == target_id && source.source_id == source_id)
      {
        return Err(RuntimeError::invalid_state(
          "Stripe checkout source target does not match",
        ));
      }
      snapshot.operation = Some(OperationCompletion {
        operation_id: operation_id.clone(),
        result: result.clone(),
      });
      match apply_payment_snapshot(&mut connection, snapshot, runtime.deployment, &runtime.mail_hash_key).await {
        Ok(changes) => return Ok(Some(changes)),
        Err(PaymentApplyError::Runtime(error)) => return Err(error),
        Err(PaymentApplyError::LockSetExpanded(expansion)) => {
          let Some(reacquired) = connection.reacquire_with(&runtime.pool, expansion).await? else {
            return Ok(None);
          };
          connection = reacquired;
        }
      }
    }
    return Err(RuntimeError::invalid_state("payment_busy"));
  }
  let Some(mut connection) = PaymentConnection::try_acquire(&runtime.pool, vec![scope]).await? else {
    return Ok(None);
  };
  if let Some((reason, _)) =
    stripe_checkout_termination(connection.connection(), stripe, &namespace, &session, None).await?
  {
    finish_purchase(&mut connection, &operation_id, reason).await?;
  }
  Ok(None)
}
