mod revenuecat;

use std::collections::BTreeSet;

use affine_core::{
  access_control::Plan,
  payment::{ProviderLifecycle, SubscriptionRecurring},
};
use chrono::{DateTime, TimeZone, Utc};
pub(super) use revenuecat::revenuecat_customer_snapshot;
use serde_json::json;
use sqlx::Row;

use super::{
  CustomerSnapshot, LicenseSnapshot, MailSnapshot, OperationCompletion, PaymentRuntime, PaymentSnapshot,
  RevenueCatClient, RevenueCatOwnershipTransfer, SnapshotCoverage, StripeClient, StripeInvoice, SubscriptionSnapshot,
  revenuecat_client::{RevenueCatProduct, RevenueCatSubscription},
  stripe_client::StripeSubscription,
  verified_missing_revenuecat_sources,
};
use crate::runtime::{RuntimeError, RuntimeResult};

pub(super) async fn stripe_subscription_snapshot(
  pool: &sqlx::PgPool,
  client: &StripeClient,
  subscription: StripeSubscription,
  event_ids: Vec<String>,
  operation: Option<OperationCompletion>,
) -> RuntimeResult<PaymentSnapshot> {
  let observed_at = Utc::now();
  let latest_invoice = match subscription.latest_invoice.as_ref() {
    Some(latest) => Some(client.invoice(latest.id()).await.map_err(provider_runtime_error)?),
    None => None,
  };
  stripe_subscription_snapshot_from_observation(
    pool,
    client,
    subscription,
    event_ids,
    operation,
    latest_invoice.as_ref().map(|invoice| (invoice, observed_at)),
  )
  .await
}

pub(super) async fn stripe_subscription_snapshot_from_observation(
  pool: &sqlx::PgPool,
  client: &StripeClient,
  subscription: StripeSubscription,
  event_ids: Vec<String>,
  operation: Option<OperationCompletion>,
  invoice_observation: Option<(&StripeInvoice, DateTime<Utc>)>,
) -> RuntimeResult<PaymentSnapshot> {
  let namespace = client.namespace().clone();
  let namespace_key = namespace
    .canonical_key()
    .map_err(|_| RuntimeError::invalid_state("invalid Stripe provider namespace"))?;
  let item = subscription
    .items
    .data
    .first()
    .ok_or_else(|| RuntimeError::invalid_input("Stripe subscription has no item"))?;
  if subscription.items.data.len() != 1 {
    return Err(RuntimeError::invalid_input("Stripe subscription item is not canonical"));
  }
  let (plan, recurring, variant) = parse_lookup_key(
    item
      .price
      .lookup_key
      .as_deref()
      .ok_or_else(|| RuntimeError::invalid_input("Stripe subscription price has no lookup key"))?,
  )?;
  let customer_id = subscription.customer.id().to_string();
  let existing = sqlx::query(
    "SELECT target_type,target_id,external_customer_id FROM provider_subscriptions WHERE provider_namespace=$1 AND \
     source_identity=$2",
  )
  .bind(&namespace_key)
  .bind(&subscription.id)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load Stripe subscription target", error))?;
  let is_new = existing.is_none();
  let mut customers = Vec::new();
  let (target_type, target_id) = if let Some(existing) = existing {
    if existing.get::<Option<String>, _>("external_customer_id").as_deref() != Some(customer_id.as_str()) {
      return Err(RuntimeError::invalid_state(
        "Stripe subscription customer does not match its canonical owner",
      ));
    }
    (existing.get("target_type"), existing.get("target_id"))
  } else {
    match plan {
      Plan::Team => (
        "workspace".to_string(),
        required_metadata(&subscription, "workspaceId")?.to_string(),
      ),
      Plan::SelfHostedTeam => (
        "instance".to_string(),
        if subscription.metadata.get("licenseKey").is_some() {
          required_metadata(&subscription, "licenseKey")?.to_string()
        } else {
          uuid::Uuid::new_v4().to_string()
        },
      ),
      Plan::Pro | Plan::Ai => {
        let customer =
          sqlx::query("SELECT user_id,provider_namespace FROM user_stripe_customers WHERE stripe_customer_id=$1")
            .bind(&customer_id)
            .fetch_optional(pool)
            .await
            .map_err(|error| RuntimeError::database("load Stripe customer target", error))?
            .ok_or_else(|| RuntimeError::invalid_state("Stripe customer has no canonical user mapping"))?;
        let stored_namespace: Option<String> = customer.get("provider_namespace");
        if stored_namespace.is_none() {
          return Err(RuntimeError::invalid_state(
            "legacy Stripe customer requires pre-repair",
          ));
        }
        if stored_namespace.as_deref() != Some(namespace_key.as_str()) {
          return Err(RuntimeError::invalid_state(
            "Stripe customer belongs to another provider namespace",
          ));
        }
        let user_id: String = customer.get("user_id");
        customers.push(CustomerSnapshot {
          user_id: user_id.clone(),
          external_customer_id: customer_id.clone(),
        });
        ("user".to_string(), user_id)
      }
      _ => return Err(RuntimeError::invalid_input("unsupported Stripe subscription plan")),
    }
  };
  let lifecycle = ProviderLifecycle::parse(&subscription.status)
    .ok_or_else(|| RuntimeError::invalid_input("unknown Stripe subscription lifecycle"))?;
  let period_start = timestamp_seconds(subscription.current_period_start, "Stripe period start")?;
  let period_end = timestamp_seconds(subscription.current_period_end, "Stripe period end")?;
  let quantity = item.quantity.unwrap_or(1) as f64;
  let source = SubscriptionSnapshot {
    source_id: subscription.id.clone(),
    target_type,
    target_id: target_id.clone(),
    plan,
    recurring,
    lifecycle,
    gives_access: None,
    will_renew: Some(!subscription.cancel_at_period_end),
    quantity: Some(quantity),
    external_customer_id: Some(customer_id.clone()),
    external_subscription_id: Some(subscription.id.clone()),
    external_product_id: Some(item.price.product.id().to_string()),
    external_price_id: Some(item.price.id.clone()),
    iap_store: None,
    external_ref: None,
    currency: Some(item.price.currency.clone()),
    amount: item.price.unit_amount.and_then(|amount| i32::try_from(amount).ok()),
    period_start: Some(period_start),
    period_end: Some(period_end),
    trial_start: subscription
      .trial_start
      .map(|timestamp| timestamp_seconds(timestamp, "Stripe trial start"))
      .transpose()?,
    trial_end: subscription
      .trial_end
      .map(|timestamp| timestamp_seconds(timestamp, "Stripe trial end"))
      .transpose()?,
    canceled_at: subscription
      .canceled_at
      .map(|timestamp| timestamp_seconds(timestamp, "Stripe canceled at"))
      .transpose()?,
    metadata: json!({
      "variant": variant,
      "stripeScheduleId": subscription.schedule.as_ref().map(|schedule| schedule.id()),
      "nextBillAt": (!subscription.cancel_at_period_end).then(|| period_end.to_rfc3339()),
    }),
  };
  let mut financial_facts = Vec::new();
  if let Some(latest_invoice) = subscription.latest_invoice.as_ref() {
    let (invoice, observed_at) = invoice_observation
      .ok_or_else(|| RuntimeError::invalid_state("Stripe latest invoice absent from provider observations"))?;
    if invoice.id != latest_invoice.id()
      || invoice.customer.id() != customer_id
      || invoice.subscription_id() != Some(subscription.id.as_str())
    {
      return Err(RuntimeError::invalid_state(
        "Stripe subscription invoice ownership mismatch",
      ));
    }
    financial_facts.push(super::stripe_invoice_fact(invoice, Some(&source), observed_at)?);
  }
  let licenses = (plan == Plan::SelfHostedTeam)
    .then(|| LicenseSnapshot {
      key: target_id.clone(),
      workspace_id: None,
      revealed_at: None,
      validate_key: None,
    })
    .into_iter()
    .collect();
  let mails = if is_new && plan == Plan::SelfHostedTeam && matches!(lifecycle, ProviderLifecycle::Active) {
    subscription
      .customer
      .email()
      .filter(|email| email.trim() == *email)
      .and_then(|email| {
        let normalized = email.to_ascii_lowercase();
        normalized.split_once('@')?;
        Some(MailSnapshot {
          mail_name: "TeamLicense".to_string(),
          mail_class: "billing_license".to_string(),
          dedupe_key: format!("selfhost-license:{target_id}"),
          recipient_email: email.to_string(),
          recipient_user_id: None,
          workspace_id: None,
          payload: json!({ "name": "TeamLicense", "to": email, "props": { "license": target_id } }),
        })
      })
      .into_iter()
      .collect()
  } else {
    Vec::new()
  };
  Ok(PaymentSnapshot {
    namespace,
    coverage: SnapshotCoverage::Single,
    customer_id: Some(customer_id),
    customers,
    subscriptions: vec![source],
    ownership_transfers: Vec::new(),
    financial_facts,
    trials: Vec::new(),
    invoices: Vec::new(),
    licenses,
    mails,
    captured_event_ids: event_ids,
    operation,
  })
}

pub(super) async fn stripe_customer_snapshot(
  pool: &sqlx::PgPool,
  client: &StripeClient,
  customer_id: &str,
  subscriptions: Vec<StripeSubscription>,
  operation: Option<OperationCompletion>,
) -> RuntimeResult<PaymentSnapshot> {
  let mut snapshot = PaymentSnapshot {
    namespace: client.namespace().clone(),
    coverage: SnapshotCoverage::Complete {
      verified_missing_revenuecat_sources: BTreeSet::new(),
    },
    customer_id: Some(customer_id.to_string()),
    customers: Vec::new(),
    subscriptions: Vec::new(),
    ownership_transfers: Vec::new(),
    financial_facts: Vec::new(),
    trials: Vec::new(),
    invoices: Vec::new(),
    licenses: Vec::new(),
    mails: Vec::new(),
    captured_event_ids: Vec::new(),
    operation,
  };
  for subscription in subscriptions {
    if subscription.customer.id() != customer_id {
      return Err(RuntimeError::invalid_input(
        "Stripe customer subscription result changed ownership",
      ));
    }
    if matches!(subscription.status.as_str(), "canceled" | "incomplete_expired") {
      continue;
    }
    let item = stripe_subscription_snapshot(pool, client, subscription, Vec::new(), None).await?;
    snapshot.customers.extend(item.customers);
    snapshot.subscriptions.extend(item.subscriptions);
    snapshot.financial_facts.extend(item.financial_facts);
    snapshot.licenses.extend(item.licenses);
    snapshot.mails.extend(item.mails);
  }
  snapshot
    .customers
    .sort_by(|left, right| left.user_id.cmp(&right.user_id));
  snapshot.customers.dedup_by(|left, right| left.user_id == right.user_id);
  Ok(snapshot)
}

pub(super) fn parse_lookup_key(value: &str) -> RuntimeResult<(Plan, SubscriptionRecurring, Option<String>)> {
  let (plan_key, suffix) = if let Some(suffix) = value.strip_prefix("selfhost_team_") {
    ("selfhost_team", suffix)
  } else {
    value
      .split_once('_')
      .ok_or_else(|| RuntimeError::invalid_input("invalid Stripe lookup key"))?
  };
  let plan = match plan_key {
    "pro" => Plan::Pro,
    "ai" => Plan::Ai,
    "team" => Plan::Team,
    "selfhostedteam" | "selfhost_team" => Plan::SelfHostedTeam,
    _ => return Err(RuntimeError::invalid_input("unknown Stripe price plan")),
  };
  let (recurring, variant) = suffix.split_once('_').map_or((suffix, None), |(recurring, variant)| {
    (recurring, Some(variant.to_string()))
  });
  let recurring = SubscriptionRecurring::parse(recurring)
    .ok_or_else(|| RuntimeError::invalid_input("unknown Stripe price recurring"))?;
  Ok((plan, recurring, variant))
}

fn required_metadata<'a>(subscription: &'a StripeSubscription, key: &str) -> RuntimeResult<&'a str> {
  subscription
    .metadata
    .get(key)
    .and_then(serde_json::Value::as_str)
    .filter(|value| !value.is_empty() && *value == value.trim())
    .ok_or_else(|| RuntimeError::invalid_input(format!("Stripe subscription metadata {key} is required")))
}

fn timestamp_seconds(value: i64, label: &str) -> RuntimeResult<chrono::DateTime<Utc>> {
  Utc
    .timestamp_opt(value, 0)
    .single()
    .ok_or_else(|| RuntimeError::invalid_input(format!("invalid {label}")))
}

fn provider_runtime_error(error: super::PaymentProviderError) -> RuntimeError {
  RuntimeError::invalid_state(error.code)
}
