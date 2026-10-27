use affine_core::{
  access_control::{EntitlementStatus, Plan},
  payment::{
    AI_TRIAL_DAYS, CheckoutExistingFact, CheckoutExistingStatus, ProviderLifecycle, SubscriptionRecurring,
    checkout_has_conflict, trial_eligible,
  },
};
use serde_json::{Value, json};
use sqlx::Row;

use super::*;

fn checkout_existing_fact(row: &sqlx::postgres::PgRow) -> RuntimeResult<CheckoutExistingFact> {
  let plan = parse_plan(row.get("plan"))?;
  let recurring = row
    .get::<Option<String>, _>("recurring")
    .map(|value| {
      SubscriptionRecurring::parse(&value)
        .ok_or_else(|| RuntimeError::invalid_state("existing payment recurring is invalid"))
    })
    .transpose()?;
  let status = if row.get("provider") {
    CheckoutExistingStatus::Provider(
      ProviderLifecycle::parse(row.get("status"))
        .ok_or_else(|| RuntimeError::invalid_state("existing payment status is invalid"))?,
    )
  } else {
    CheckoutExistingStatus::Entitlement(match row.get::<String, _>("status").as_str() {
      "active" => EntitlementStatus::Active,
      "grace" => EntitlementStatus::Grace,
      "revoked" => EntitlementStatus::Revoked,
      "expired" => EntitlementStatus::Expired,
      _ => return Err(RuntimeError::invalid_state("existing entitlement status is invalid")),
    })
  };
  Ok(CheckoutExistingFact {
    plan,
    recurring,
    status,
    period_end: row.get("period_end"),
    grace_until: row.get("grace_until"),
    expires_at: row.get("expires_at"),
  })
}

impl PaymentRuntime {
  #[allow(clippy::too_many_arguments)]
  pub(super) async fn create_checkout(
    &self,
    changes: &mut super::super::PaymentApplyResult,
    actor_user_id: Option<&str>,
    user_email: Option<&str>,
    target_type: &str,
    target_id: Option<&str>,
    plan: &str,
    recurring: &str,
    variant: Option<&str>,
    coupon: Option<&str>,
    quantity: Option<u32>,
    success_url: &str,
    intent_id: &str,
  ) -> RuntimeResult<Value> {
    validate_intent(intent_id)?;
    validate_success_url(success_url)?;
    let plan = parse_plan(plan)?;
    let recurring = SubscriptionRecurring::parse(recurring)
      .ok_or_else(|| RuntimeError::invalid_input("invalid payment recurring"))?;
    validate_checkout_shape(plan, recurring, variant, target_type, target_id, actor_user_id)?;
    let target_id = target_id
      .map(str::to_string)
      .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    if target_type == "workspace" {
      self.assert_workspace_payment(actor_user_id, &target_id).await?;
    }
    let namespace = self.stripe()?.namespace().clone();
    let namespace_key = canonical_namespace(&namespace)?;
    let customer_id = if let Some(user_id) = actor_user_id {
      Some(
        self
          .ensure_customer(changes, &namespace, user_id, user_email, intent_id)
          .await?,
      )
    } else {
      None
    };
    let lookup_key = stripe_lookup_key(plan, recurring, variant)?;
    let price = self.find_price(&lookup_key, recurring).await?;
    let coupon_id = if let Some(coupon) = coupon.filter(|coupon| !coupon.is_empty()) {
      self.resolve_coupon(coupon, customer_id.as_deref()).await?
    } else {
      None
    };
    let target_scope = if matches!(plan, Plan::Pro | Plan::Ai | Plan::Team) {
      PaymentScope::cloud_target(target_type, &target_id, plan)?
    } else {
      PaymentScope::billing_target(&namespace_key, target_type, &target_id)?
    };
    let mut resources = vec![target_scope];
    if let Some(customer_id) = customer_id.as_deref() {
      resources.push(PaymentScope::customer(&namespace_key, customer_id)?);
    }
    let mut connection = PaymentConnection::try_acquire(&self.pool, resources.clone())
      .await?
      .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
    let now: chrono::DateTime<chrono::Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(connection.connection())
      .await
      .map_err(|error| RuntimeError::database("load checkout decision time", error))?;
    let rows = sqlx::query(
      r#"SELECT plan,status,recurring,period_end,NULL::timestamptz AS grace_until,
                NULL::timestamptz AS expires_at,true AS provider
           FROM provider_subscriptions WHERE target_type=$1 AND target_id=$2
         UNION ALL
         SELECT plan,status,metadata->>'recurring',NULL,grace_until,expires_at,false
           FROM entitlements WHERE target_type=$1 AND target_id=$2 AND source='cloud_subscription'"#,
    )
    .bind(target_type)
    .bind(&target_id)
    .fetch_all(connection.connection())
    .await
    .map_err(|error| RuntimeError::database("load existing checkout subscriptions", error))?;
    let facts = rows
      .into_iter()
      .map(|row| checkout_existing_fact(&row))
      .collect::<RuntimeResult<Vec<_>>>()?;
    if checkout_has_conflict(plan, recurring, now, &facts) {
      return Err(RuntimeError::invalid_state("subscription_already_exists"));
    }
    let trial_used = if plan == Plan::Ai {
      sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM subscription_trial_usages WHERE target_type='user' AND target_id=$1 AND \
         plan='ai')",
      )
      .bind(&target_id)
      .fetch_one(connection.connection())
      .await
      .map_err(|error| RuntimeError::database("check payment trial history", error))?
    } else {
      false
    };
    let trial = trial_eligible(plan, trial_used);
    let mut fields = vec![
      text_field("line_items[0][price]", price.id),
      text_field("line_items[0][quantity]", quantity.unwrap_or(1).to_string()),
      text_field(
        "success_url",
        if target_type == "instance" {
          append_checkout_session_placeholder(success_url)?
        } else {
          success_url.to_string()
        },
      ),
      text_field(
        "mode",
        if recurring == SubscriptionRecurring::Lifetime {
          "payment"
        } else {
          "subscription"
        },
      ),
    ];
    if let Some(customer_id) = customer_id.as_deref() {
      fields.push(text_field("customer", customer_id));
    }
    if target_type == "workspace" {
      fields.push(text_field("subscription_data[metadata][workspaceId]", &target_id));
    } else if target_type == "instance" {
      fields.push(text_field("subscription_data[metadata][licenseKey]", &target_id));
      fields.push(text_field("line_items[0][adjustable_quantity][enabled]", "true"));
      fields.push(text_field("line_items[0][adjustable_quantity][minimum]", "1"));
      fields.push(text_field("tax_id_collection[enabled]", "true"));
    } else if trial {
      fields.push(text_field(
        "subscription_data[trial_period_days]",
        AI_TRIAL_DAYS.to_string(),
      ));
    }
    if recurring == SubscriptionRecurring::Lifetime {
      fields.push(text_field("invoice_creation[enabled]", "true"));
    }
    if let Some(coupon_id) = coupon_id {
      fields.push(text_field("discounts[0][coupon]", coupon_id));
    } else {
      fields.push(text_field("allow_promotion_codes", "true"));
    }
    let operation_intent = stripe_operation(
      namespace.clone(),
      "create_checkout",
      intent_id,
      resources,
      Some((target_type, &target_id)),
      "v1/checkout/sessions",
      fields,
    );
    match self
      .execute_locked_stripe_operation(connection, operation_intent)
      .await?
    {
      OperationExecution::Completed(result) => Ok(result),
      OperationExecution::Sent {
        connection,
        operation_id,
        response,
      } => {
        let session: StripeCheckoutSession = serde_json::from_value(response)
          .map_err(|error| RuntimeError::json("invalid Stripe checkout response", error))?;
        let url = session
          .url
          .clone()
          .ok_or_else(|| RuntimeError::invalid_state("Stripe checkout has no URL"))?;
        let result = json!({ "url": url, "sessionId": session.id, "targetId": target_id });
        let mut snapshot = empty_snapshot(namespace, customer_id, operation_id, result.clone());
        if trial {
          snapshot.trials.push(TrialSnapshot {
            target_type: "user".to_string(),
            target_id: target_id.clone(),
            plan,
            external_ref: Some(session.id),
            metadata: json!({ "source": "checkout_session" }),
          });
        }
        changes.extend(self.apply_with_connection(connection, snapshot).await?);
        Ok(result)
      }
    }
  }

  pub(super) async fn reveal_license(
    &self,
    changes: &mut super::super::PaymentApplyResult,
    session_id: &str,
    intent_id: &str,
  ) -> RuntimeResult<Value> {
    validate_identity(session_id, "Stripe checkout session")?;
    validate_intent(intent_id)?;
    let stripe = self.stripe()?;
    let session = stripe
      .checkout_session(session_id)
      .await
      .map_err(provider_runtime_error)?;
    if session.status.as_deref() != Some("complete") {
      return Err(RuntimeError::invalid_state("invalid_license_session"));
    }
    let subscription_id = session
      .subscription
      .as_ref()
      .map(|subscription| subscription.id())
      .ok_or_else(|| RuntimeError::invalid_state("invalid_license_session"))?;
    let subscription = stripe
      .subscription(subscription_id)
      .await
      .map_err(provider_runtime_error)?;
    let mut snapshot =
      super::super::snapshot::stripe_subscription_snapshot(&self.pool, stripe, subscription, Vec::new(), None).await?;
    let source = snapshot
      .subscriptions
      .first()
      .filter(|source| source.plan == Plan::SelfHostedTeam && source.target_type == "instance")
      .ok_or_else(|| RuntimeError::invalid_state("invalid_license_session"))?;
    let license_key = source.target_id.clone();
    let namespace = stripe.namespace().clone();
    let namespace_key = canonical_namespace(&namespace)?;
    let resources = vec![
      PaymentScope::source(&namespace_key, &source.source_id)?,
      PaymentScope::billing_target(&namespace_key, "instance", &license_key)?,
    ];
    let mut connection = PaymentConnection::try_acquire(&self.pool, resources.clone())
      .await?
      .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
    let step_key = format!("payment:{intent_id}:verify-session");
    let frozen = freeze_operation(
      &mut connection,
      &OperationIntent {
        namespace: namespace.clone(),
        operation_type: "reveal_license".to_string(),
        intent_id: intent_id.to_string(),
        resources,
        target_type: Some("instance".to_string()),
        target_id: Some(license_key.clone()),
        steps: vec![PaymentStepState {
          key: step_key.clone(),
          request: PaymentStep::VerifySource {
            source_id: session_id.to_string(),
          },
          first_sent_at: None,
          result: None,
        }],
      },
    )
    .await?;
    if frozen.status == "completed" {
      return frozen
        .result
        .ok_or_else(|| RuntimeError::invalid_state("completed payment operation has no result"));
    }
    if frozen.status != "pending" {
      return Err(RuntimeError::invalid_state("payment_operation_blocked"));
    }
    if frozen.steps[0].result.is_none() {
      if mark_operation_step_sent(&mut connection, &frozen.id, &step_key, chrono::Duration::days(1)).await?
        == PaymentSendDecision::Blocked
      {
        return Err(RuntimeError::invalid_state("payment_operation_blocked"));
      }
      record_operation_step_result(
        &mut connection,
        &frozen.id,
        &step_key,
        json!({ "sessionId": session.id, "subscriptionId": subscription_id }),
      )
      .await?;
    }
    let result = Value::String(license_key.clone());
    snapshot.licenses[0].revealed_at = Some(chrono::Utc::now());
    snapshot.operation = Some(OperationCompletion {
      operation_id: frozen.id,
      result: result.clone(),
    });
    changes.extend(self.apply_with_connection(connection, snapshot).await?);
    Ok(result)
  }
}
