use std::collections::BTreeSet;

use affine_core::payment::REVENUECAT_PROVISIONAL_SECONDS;
use serde_json::json;

use super::*;

enum IdentifyOutcome {
  Confirmed(super::super::PaymentApplyResult),
  Pending,
}

impl PaymentRuntime {
  pub(super) async fn request_apply_revenuecat(
    &self,
    changes: &mut super::super::PaymentApplyResult,
    user_id: &str,
    transaction_id: &str,
    intent_id: &str,
  ) -> RuntimeResult<Value> {
    validate_identity(user_id, "RevenueCat user")?;
    validate_identity(transaction_id, "RevenueCat store transaction")?;
    validate_intent(intent_id)?;
    let client = self
      .revenuecat
      .as_ref()
      .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
    let config = self
      .revenuecat_config
      .as_ref()
      .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
    let namespace = client
      .namespace()
      .canonical_key()
      .map_err(|_| RuntimeError::invalid_state("invalid RevenueCat provider namespace"))?;
    if let Some(row) = sqlx::query(
      "SELECT target_id FROM provider_subscriptions WHERE provider='revenuecat' AND provider_namespace=$1 AND \
       external_ref=$2 ORDER BY id LIMIT 1",
    )
    .bind(&namespace)
    .bind(transaction_id)
    .fetch_optional(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load RevenueCat store transaction", error))?
    {
      if row.get::<String, _>("target_id") != user_id {
        return Err(RuntimeError::invalid_state(
          "RevenueCat store transaction belongs to another user",
        ));
      }
      return self.list_subscriptions("user", user_id).await;
    }
    let subscriptions = client
      .subscriptions_by_store_id(transaction_id)
      .await
      .map_err(provider_runtime_error)?;
    if subscriptions.is_empty() {
      return self.list_subscriptions("user", user_id).await;
    }
    if subscriptions
      .iter()
      .any(|subscription| subscription.store_subscription_identifier != transaction_id)
    {
      return Err(RuntimeError::invalid_state(
        "RevenueCat store transaction result is not canonical",
      ));
    }
    let source_customers = subscriptions
      .iter()
      .map(|subscription| subscription.customer_id.as_deref())
      .collect::<BTreeSet<_>>();
    let source_customers = source_customers.into_iter().collect::<Vec<_>>();
    let [Some(source_customer_id)] = source_customers.as_slice() else {
      return Err(RuntimeError::invalid_state(
        "RevenueCat store transaction has ambiguous ownership",
      ));
    };
    let source_customer_id = source_customer_id.to_string();
    if source_customer_id != user_id && !source_customer_id.starts_with("$RCAnonymousID:") {
      let aliases = client
        .customer_aliases(&source_customer_id)
        .await
        .map_err(provider_runtime_error)?;
      if !aliases.iter().any(|alias| alias.id == user_id) {
        return Err(RuntimeError::invalid_state(
          "RevenueCat store transaction belongs to another user",
        ));
      }
    }
    let mut provisional = subscriptions.clone();
    for subscription in &mut provisional {
      subscription.customer_id = Some(user_id.to_string());
    }
    let mut snapshot = super::super::snapshot::revenuecat_customer_snapshot(
      &self.pool,
      client,
      config,
      user_id,
      provisional,
      SnapshotCoverage::Single,
      Vec::new(),
    )
    .await?;
    let provisional_until = chrono::Utc::now() + Duration::seconds(REVENUECAT_PROVISIONAL_SECONDS);
    for subscription in &mut snapshot.subscriptions {
      subscription.period_end = Some(
        subscription
          .period_end
          .map(|period_end| period_end.min(provisional_until))
          .unwrap_or(provisional_until),
      );
      subscription.metadata["provisionalUntil"] = json!(provisional_until);
      subscription.metadata["providerCustomerId"] = json!(source_customer_id);
    }
    changes.extend(self.apply_snapshot(snapshot.clone()).await?);
    if source_customer_id != user_id {
      match self
        .identify_revenuecat_customer(snapshot, &source_customer_id, user_id, transaction_id, intent_id)
        .await?
      {
        IdentifyOutcome::Confirmed(confirmed) => changes.extend(confirmed),
        IdentifyOutcome::Pending => {}
      }
    }
    self.list_subscriptions("user", user_id).await
  }

  async fn identify_revenuecat_customer(
    &self,
    provisional: PaymentSnapshot,
    source_customer_id: &str,
    user_id: &str,
    transaction_id: &str,
    intent_id: &str,
  ) -> RuntimeResult<IdentifyOutcome> {
    let client = self
      .revenuecat
      .as_ref()
      .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
    let namespace = client
      .namespace()
      .canonical_key()
      .map_err(|_| RuntimeError::invalid_state("invalid RevenueCat provider namespace"))?;
    let source_ids = provisional
      .subscriptions
      .iter()
      .map(|subscription| subscription.source_id.clone())
      .collect::<Vec<_>>();
    let mut resources = super::super::apply::snapshot_scopes(&provisional, &namespace)?;
    resources.push(PaymentScope::customer(&namespace, source_customer_id)?);
    let step_key = format!("payment:{intent_id}:revenuecat-identify");
    let mut connection = PaymentConnection::try_acquire(&self.pool, resources.clone())
      .await?
      .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
    let frozen = freeze_operation(
      &mut connection,
      &OperationIntent {
        namespace: client.namespace().clone(),
        operation_type: "revenuecat_identify".to_string(),
        intent_id: intent_id.to_string(),
        resources,
        target_type: Some("user".to_string()),
        target_id: Some(user_id.to_string()),
        steps: vec![PaymentStepState {
          key: step_key.clone(),
          request: PaymentStep::IdentifyRevenueCat {
            source_customer_id: source_customer_id.to_string(),
            customer_id: user_id.to_string(),
            source_ids: source_ids.clone(),
            store_subscription_identifier: transaction_id.to_string(),
          },
          first_sent_at: None,
          result: None,
        }],
      },
    )
    .await?;
    if frozen.status == "completed" {
      return Ok(IdentifyOutcome::Confirmed(super::super::PaymentApplyResult::default()));
    }
    if frozen.status != "pending" {
      return Err(RuntimeError::invalid_state("payment_operation_blocked"));
    }
    if let Some(snapshot) = self
      .confirmed_revenuecat_identify(user_id, transaction_id, &source_ids, &frozen.id)
      .await?
    {
      return self
        .apply_with_connection(connection, snapshot)
        .await
        .map(IdentifyOutcome::Confirmed);
    }
    if frozen.steps[0].first_sent_at.is_some() {
      return Ok(IdentifyOutcome::Pending);
    }
    if mark_operation_step_sent(&mut connection, &frozen.id, &step_key, Duration::minutes(10)).await?
      == PaymentSendDecision::Blocked
    {
      return Err(RuntimeError::invalid_state("payment_operation_blocked"));
    }
    let response = match client.identify(source_customer_id, user_id).await {
      Ok(response) => response,
      Err(error) => {
        record_operation_error(
          &mut connection,
          &frozen.id,
          error.code,
          error.retryable,
          error.uncertain,
        )
        .await?;
        return Err(provider_runtime_error(error));
      }
    };
    record_operation_step_result(
      &mut connection,
      &frozen.id,
      &step_key,
      json!({ "wasCreated": response.was_created }),
    )
    .await?;
    let Some(snapshot) = self
      .confirmed_revenuecat_identify(user_id, transaction_id, &source_ids, &frozen.id)
      .await?
    else {
      return Ok(IdentifyOutcome::Pending);
    };
    self
      .apply_with_connection(connection, snapshot)
      .await
      .map(IdentifyOutcome::Confirmed)
  }

  async fn confirmed_revenuecat_identify(
    &self,
    user_id: &str,
    transaction_id: &str,
    expected_source_ids: &[String],
    operation_id: &str,
  ) -> RuntimeResult<Option<PaymentSnapshot>> {
    let client = self
      .revenuecat
      .as_ref()
      .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
    let config = self
      .revenuecat_config
      .as_ref()
      .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
    let subscriptions = client
      .customer_subscriptions(user_id)
      .await
      .map_err(provider_runtime_error)?;
    let present = subscriptions
      .iter()
      .filter(|subscription| subscription.store_subscription_identifier == transaction_id)
      .map(|subscription| subscription.id.as_str())
      .collect::<BTreeSet<_>>();
    if expected_source_ids
      .iter()
      .any(|source| !present.contains(source.as_str()))
    {
      return Ok(None);
    }
    let verified =
      super::super::worker::verified_missing_revenuecat_sources(self, client, user_id, &subscriptions).await?;
    let mut snapshot = super::super::snapshot::revenuecat_customer_snapshot(
      &self.pool,
      client,
      config,
      user_id,
      subscriptions,
      SnapshotCoverage::Complete {
        verified_missing_revenuecat_sources: verified,
      },
      Vec::new(),
    )
    .await?;
    snapshot.operation = Some(OperationCompletion {
      operation_id: operation_id.to_string(),
      result: json!({ "status": "completed" }),
    });
    Ok(Some(snapshot))
  }
}

pub(in crate::runtime::backend_runtime::payment) async fn recover_one_revenuecat_identify(
  runtime: &PaymentRuntime,
) -> RuntimeResult<Option<super::super::PaymentApplyResult>> {
  let client = runtime
    .revenuecat
    .as_ref()
    .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
  let configured_namespace = client
    .namespace()
    .canonical_key()
    .map_err(|_| RuntimeError::invalid_state("invalid RevenueCat provider namespace"))?;
  let row = sqlx::query(
    r#"SELECT id,provider_namespace,resource_keys,target_id,steps,replay_deadline,clock_timestamp() AS now
       FROM payment_operations
       WHERE provider_namespace=$1 AND operation_type='revenuecat_identify' AND status='pending'
         AND (next_attempt_at IS NULL OR next_attempt_at<=clock_timestamp())
       ORDER BY updated_at,id LIMIT 1"#,
  )
  .bind(&configured_namespace)
  .fetch_optional(&runtime.pool)
  .await
  .map_err(|error| RuntimeError::database("load pending RevenueCat identify", error))?;
  let Some(row) = row else {
    return Ok(None);
  };
  let operation_id: String = row.get("id");
  let namespace: String = row.get("provider_namespace");
  let target_id: String = row
    .get::<Option<String>, _>("target_id")
    .ok_or_else(|| RuntimeError::invalid_state("RevenueCat identify target is missing"))?;
  let steps: Vec<PaymentStepState> = serde_json::from_value(row.get("steps"))
    .map_err(|error| RuntimeError::json("decode RevenueCat identify steps", error))?;
  let [step] = steps.as_slice() else {
    return Err(RuntimeError::invalid_state("RevenueCat identify operation is invalid"));
  };
  let PaymentStep::IdentifyRevenueCat {
    source_customer_id: _,
    customer_id,
    source_ids,
    store_subscription_identifier,
  } = &step.request
  else {
    return Err(RuntimeError::invalid_state("RevenueCat identify operation is invalid"));
  };
  if customer_id != &target_id {
    return Err(RuntimeError::invalid_state("RevenueCat identify target changed"));
  }
  let scopes = row
    .get::<Vec<String>, _>("resource_keys")
    .into_iter()
    .map(|scope| PaymentScope::from_stored(scope, &namespace))
    .collect::<RuntimeResult<Vec<_>>>()?;
  let Some(connection) = PaymentConnection::try_acquire(&runtime.pool, scopes).await? else {
    return Ok(None);
  };
  if let Some(snapshot) = runtime
    .confirmed_revenuecat_identify(customer_id, store_subscription_identifier, source_ids, &operation_id)
    .await?
  {
    return runtime.apply_with_connection(connection, snapshot).await.map(Some);
  }
  let deadline: Option<chrono::DateTime<chrono::Utc>> = row.get("replay_deadline");
  let now: chrono::DateTime<chrono::Utc> = row.get("now");
  let blocked = deadline.is_some_and(|deadline| deadline <= now);
  sqlx::query(
    "UPDATE payment_operations SET status=CASE WHEN $2 THEN 'blocked' ELSE status END,next_attempt_at=CASE WHEN $2 \
     THEN NULL ELSE $3 \
     END,last_error_code='revenuecat_identify_unconfirmed',last_error='revenuecat_identify_unconfirmed',updated_at=$3 \
     WHERE id=$1 AND status='pending'",
  )
  .bind(&operation_id)
  .bind(blocked)
  .bind(now + Duration::seconds(5))
  .execute(&runtime.pool)
  .await
  .map_err(|error| RuntimeError::database("defer RevenueCat identify confirmation", error))?;
  Ok(None)
}
