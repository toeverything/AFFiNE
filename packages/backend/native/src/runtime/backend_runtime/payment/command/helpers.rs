use affine_core::{
  access_control::Plan,
  payment::{
    BillingTarget, CheckoutVariant, ProviderNamespace, SubscriptionMutationError, SubscriptionRecurring,
    validate_checkout,
  },
};
use serde_json::{Value, json};
use sqlx::Row;

use super::{
  OperationCompletion, OperationIntent, PaymentConnection, PaymentFormField, PaymentFormValue, PaymentRuntime,
  PaymentScope, PaymentSnapshot, PaymentStep, PaymentStepState, RuntimeError, RuntimeResult, SnapshotCoverage,
  StripePrice, StripeSubscription, parse_lookup_key,
};
use crate::runtime::backend_runtime::payment::stripe_client::STRIPE_API_VERSION;

pub(super) fn stripe_operation(
  namespace: ProviderNamespace,
  operation_type: &str,
  intent_id: &str,
  resources: Vec<PaymentScope>,
  target: Option<(&str, &str)>,
  path: &str,
  form: Vec<PaymentFormField>,
) -> OperationIntent {
  OperationIntent {
    namespace,
    operation_type: operation_type.to_string(),
    intent_id: intent_id.to_string(),
    resources,
    target_type: target.map(|(kind, _)| kind.to_string()),
    target_id: target.map(|(_, id)| id.to_string()),
    steps: vec![PaymentStepState {
      key: format!("payment:{intent_id}:send"),
      request: PaymentStep::StripePost {
        path: path.to_string(),
        api_version: STRIPE_API_VERSION.to_string(),
        form,
      },
      first_sent_at: None,
      result: None,
    }],
  }
}

pub(super) fn empty_snapshot(
  namespace: ProviderNamespace,
  customer_id: Option<String>,
  operation_id: String,
  result: Value,
) -> PaymentSnapshot {
  PaymentSnapshot {
    namespace,
    coverage: SnapshotCoverage::Single,
    customer_id,
    customers: Vec::new(),
    subscriptions: Vec::new(),
    ownership_transfers: Vec::new(),
    financial_facts: Vec::new(),
    trials: Vec::new(),
    invoices: Vec::new(),
    licenses: Vec::new(),
    mails: Vec::new(),
    captured_event_ids: Vec::new(),
    operation: Some(OperationCompletion { operation_id, result }),
  }
}

pub(super) fn text_field(key: impl Into<String>, value: impl Into<String>) -> PaymentFormField {
  PaymentFormField {
    key: key.into(),
    value: PaymentFormValue::Text(value.into()),
  }
}

pub(super) fn subscription_result(subscription: &StripeSubscription, plan: Plan) -> Value {
  let lookup = subscription
    .items
    .data
    .first()
    .and_then(|item| item.price.lookup_key.as_deref())
    .and_then(|key| parse_lookup_key(key).ok());
  let recurring = lookup
    .as_ref()
    .map(|(_, recurring, _)| recurring.as_str())
    .unwrap_or("monthly");
  let variant = lookup.and_then(|(_, _, variant)| variant);
  let item = subscription.items.data.first();
  json!({
    "stripeSubscriptionId": subscription.id,
    "stripeScheduleId": subscription.schedule.as_ref().map(|schedule| schedule.id()),
    "status": subscription.status,
    "plan": plan.as_str(),
    "recurring": recurring,
    "variant": variant,
    "quantity": item.and_then(|item| item.quantity).unwrap_or(1),
    "start": chrono::DateTime::from_timestamp(subscription.current_period_start, 0),
    "end": chrono::DateTime::from_timestamp(subscription.current_period_end, 0),
    "trialStart": subscription.trial_start.and_then(|timestamp| chrono::DateTime::from_timestamp(timestamp, 0)),
    "trialEnd": subscription.trial_end.and_then(|timestamp| chrono::DateTime::from_timestamp(timestamp, 0)),
    "nextBillAt": (!subscription.cancel_at_period_end).then(|| chrono::DateTime::from_timestamp(subscription.current_period_end, 0)).flatten(),
    "canceledAt": subscription.canceled_at.and_then(|timestamp| chrono::DateTime::from_timestamp(timestamp, 0)),
    "provider": "stripe",
    "iapStore": null,
    "createdAt": chrono::DateTime::from_timestamp(subscription.created, 0),
    "updatedAt": chrono::Utc::now(),
  })
}

pub(super) fn canonical_namespace(namespace: &ProviderNamespace) -> RuntimeResult<String> {
  namespace
    .canonical_key()
    .map_err(|_| RuntimeError::invalid_state("invalid payment provider namespace"))
}

pub(super) fn required_column(row: &sqlx::postgres::PgRow, column: &str, error: &'static str) -> RuntimeResult<String> {
  row
    .get::<Option<String>, _>(column)
    .ok_or_else(|| RuntimeError::invalid_state(error))
}

pub(super) struct LockedStripeSubscription {
  pub connection: PaymentConnection,
  pub resources: Vec<PaymentScope>,
  pub subscription_id: String,
  pub recurring: Option<String>,
  pub canceled_at: Option<chrono::DateTime<chrono::Utc>>,
  pub period_start: Option<chrono::DateTime<chrono::Utc>>,
  pub metadata: Value,
  pub quantity: Option<i32>,
}

impl PaymentRuntime {
  pub(super) async fn lock_stripe_subscription(
    &self,
    namespace: &str,
    target_type: &str,
    target_id: &str,
    plan: Plan,
  ) -> RuntimeResult<LockedStripeSubscription> {
    let discovery = sqlx::query(
      r#"SELECT source_identity,external_customer_id
         FROM provider_subscriptions
         WHERE provider='stripe' AND provider_namespace=$1 AND target_type=$2 AND target_id=$3 AND plan=$4
           AND status IN ('active','trialing','past_due') AND (period_end IS NULL OR period_end>clock_timestamp())
         ORDER BY updated_at DESC LIMIT 1"#,
    )
    .bind(namespace)
    .bind(target_type)
    .bind(target_id)
    .bind(plan.as_str())
    .fetch_optional(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("discover Stripe subscription", error))?
    .ok_or_else(|| RuntimeError::invalid_state("subscription_not_found"))?;
    let source_id = required_column(&discovery, "source_identity", "payment subscription identity missing")?;
    let customer_id = required_column(&discovery, "external_customer_id", "payment customer identity missing")?;
    let target_scope = if plan == Plan::SelfHostedTeam {
      PaymentScope::billing_target(namespace, target_type, target_id)?
    } else {
      PaymentScope::cloud_target(target_type, target_id, plan)?
    };
    let resources = vec![
      PaymentScope::source(namespace, &source_id)?,
      PaymentScope::customer(namespace, &customer_id)?,
      target_scope,
    ];
    let mut connection = PaymentConnection::try_acquire(&self.pool, resources.clone())
      .await?
      .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
    let row = sqlx::query(
      r#"SELECT source_identity,external_customer_id,external_subscription_id,recurring,canceled_at,
                period_start,metadata,quantity
         FROM provider_subscriptions
         WHERE provider='stripe' AND provider_namespace=$1 AND target_type=$2 AND target_id=$3 AND plan=$4
           AND status IN ('active','trialing','past_due') AND (period_end IS NULL OR period_end>clock_timestamp())
         ORDER BY updated_at DESC LIMIT 1"#,
    )
    .bind(namespace)
    .bind(target_type)
    .bind(target_id)
    .bind(plan.as_str())
    .fetch_optional(connection.connection())
    .await
    .map_err(|error| RuntimeError::database("load locked Stripe subscription", error))?
    .ok_or_else(|| RuntimeError::invalid_state("subscription_not_found"))?;
    let locked_source_id = required_column(&row, "source_identity", "payment subscription identity missing")?;
    let locked_customer_id = required_column(&row, "external_customer_id", "payment customer identity missing")?;
    if locked_source_id != source_id || locked_customer_id != customer_id {
      return Err(RuntimeError::invalid_state("payment_subscription_changed"));
    }
    Ok(LockedStripeSubscription {
      connection,
      resources,
      subscription_id: required_column(
        &row,
        "external_subscription_id",
        "payment subscription identity missing",
      )?,
      recurring: row.get("recurring"),
      canceled_at: row.get("canceled_at"),
      period_start: row.get("period_start"),
      metadata: row.get("metadata"),
      quantity: row.get("quantity"),
    })
  }
}

pub(super) fn parse_plan(value: &str) -> RuntimeResult<Plan> {
  match value {
    "selfhostedteam" => Ok(Plan::SelfHostedTeam),
    _ => Plan::parse(value).ok_or_else(|| RuntimeError::invalid_input("invalid payment plan")),
  }
}

pub(super) fn stripe_lookup_key(
  plan: Plan,
  recurring: SubscriptionRecurring,
  variant: Option<&str>,
) -> RuntimeResult<String> {
  let plan = match plan {
    Plan::SelfHostedTeam => "selfhostedteam",
    Plan::Pro => "pro",
    Plan::Ai => "ai",
    Plan::Team => "team",
    _ => return Err(RuntimeError::invalid_input("invalid Stripe checkout plan")),
  };
  Ok(format!(
    "{plan}_{}{}",
    recurring.as_str(),
    variant.map(|variant| format!("_{variant}")).unwrap_or_default()
  ))
}

pub(super) fn validate_checkout_shape(
  plan: Plan,
  recurring: SubscriptionRecurring,
  variant: Option<&str>,
  target_type: &str,
  target_id: Option<&str>,
  actor_user_id: Option<&str>,
) -> RuntimeResult<()> {
  let target = billing_target(target_type).map_err(|_| RuntimeError::invalid_input("invalid checkout parameters"))?;
  let variant = variant
    .map(|value| match value {
      "onetime" => Ok(CheckoutVariant::Onetime),
      _ => Err(RuntimeError::invalid_input("invalid checkout parameters")),
    })
    .transpose()?;
  validate_checkout(
    plan,
    recurring,
    variant,
    target,
    target_id.is_some(),
    target_id == actor_user_id,
  )
  .map_err(|_| RuntimeError::invalid_input("invalid checkout parameters"))
}

pub(super) fn billing_target(target_type: &str) -> RuntimeResult<BillingTarget> {
  match target_type {
    "user" => Ok(BillingTarget::User),
    "workspace" => Ok(BillingTarget::Workspace),
    "instance" => Ok(BillingTarget::Instance),
    _ => Err(RuntimeError::invalid_input("invalid payment target type")),
  }
}

pub(super) fn subscription_mutation_error(error: SubscriptionMutationError) -> RuntimeError {
  match error {
    SubscriptionMutationError::InvalidTarget => RuntimeError::invalid_input("invalid payment subscription target"),
    SubscriptionMutationError::InvalidRecurring => RuntimeError::invalid_input("invalid payment recurring"),
    SubscriptionMutationError::InvalidQuantity => RuntimeError::invalid_input("invalid payment subscription quantity"),
    SubscriptionMutationError::Lifetime => RuntimeError::invalid_state("cant_update_onetime_subscription"),
    SubscriptionMutationError::AlreadyCanceled => RuntimeError::invalid_state("subscription_already_canceled"),
    SubscriptionMutationError::NotCanceled => RuntimeError::invalid_state("subscription_not_canceled"),
    SubscriptionMutationError::SameRecurring => RuntimeError::invalid_state("same_subscription_recurring"),
  }
}

pub(super) fn validate_target(target_type: &str, target_id: &str) -> RuntimeResult<()> {
  if !matches!(target_type, "user" | "workspace" | "instance") {
    return Err(RuntimeError::invalid_input("invalid payment target type"));
  }
  validate_identity(target_id, "payment target")
}

pub(super) fn validate_intent(intent_id: &str) -> RuntimeResult<()> {
  validate_identity(intent_id, "payment intent")?;
  if intent_id.len() > 180 {
    return Err(RuntimeError::invalid_input("payment intent is too long"));
  }
  Ok(())
}

pub(super) fn validate_identity(value: &str, label: &str) -> RuntimeResult<()> {
  if value.is_empty() || value != value.trim() || value.len() > 255 {
    return Err(RuntimeError::invalid_input(format!("invalid {label}")));
  }
  Ok(())
}

pub(super) fn validate_success_url(value: &str) -> RuntimeResult<()> {
  let url = url::Url::parse(value).map_err(|_| RuntimeError::invalid_input("invalid checkout success URL"))?;
  if !matches!(url.scheme(), "http" | "https")
    || url.host_str().is_none()
    || url.username() != ""
    || url.password().is_some()
  {
    return Err(RuntimeError::invalid_input("invalid checkout success URL"));
  }
  Ok(())
}

pub(super) fn append_checkout_session_placeholder(value: &str) -> RuntimeResult<String> {
  let mut url = url::Url::parse(value).map_err(|_| RuntimeError::invalid_input("invalid checkout success URL"))?;
  url.query_pairs_mut().append_pair("session_id", "{CHECKOUT_SESSION_ID}");
  Ok(
    String::from(url)
      .replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}")
      .replace("%7bCHECKOUT_SESSION_ID%7d", "{CHECKOUT_SESSION_ID}"),
  )
}

pub(super) fn price_recurring_matches(price: &StripePrice, recurring: SubscriptionRecurring) -> bool {
  match (recurring, price.recurring.as_ref()) {
    (SubscriptionRecurring::Monthly, Some(value)) => value.interval == "month" && value.interval_count == 1,
    (SubscriptionRecurring::Yearly, Some(value)) => value.interval == "year" && value.interval_count == 1,
    (SubscriptionRecurring::Lifetime, None) => true,
    _ => false,
  }
}

pub(super) fn encode_segment(value: &str) -> String {
  url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

pub(super) fn provider_runtime_error(error: super::super::PaymentProviderError) -> RuntimeError {
  RuntimeError::invalid_state(error.code)
}
