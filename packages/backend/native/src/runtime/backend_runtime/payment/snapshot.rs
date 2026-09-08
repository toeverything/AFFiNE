use std::collections::{BTreeMap, BTreeSet};

use affine_core::{
  access_control::Plan,
  payment::{ProviderLifecycle, SubscriptionRecurring},
};
use chrono::{TimeZone, Utc};
use serde_json::json;
use sqlx::Row;

use super::{
  CustomerSnapshot, LicenseSnapshot, MailSnapshot, OperationCompletion, PaymentSnapshot, RevenueCatClient,
  RevenueCatOwnershipTransfer, SnapshotCoverage, StripeClient, SubscriptionSnapshot,
  revenuecat_client::{RevenueCatProduct, RevenueCatSubscription},
  stripe_client::StripeSubscription,
};
use crate::runtime::{PaymentProductConfig, RevenueCatRuntimeConfig, RuntimeError, RuntimeResult};

pub(super) async fn stripe_subscription_snapshot(
  pool: &sqlx::PgPool,
  client: &StripeClient,
  subscription: StripeSubscription,
  event_ids: Vec<String>,
  operation: Option<OperationCompletion>,
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
  if subscription.items.data.len() != 1 || !item.price.active {
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
        required_metadata(&subscription, "licenseKey")?.to_string(),
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
        if stored_namespace
          .as_deref()
          .is_some_and(|stored| stored != namespace_key)
        {
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
    financial_facts: Vec::new(),
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
    let item = stripe_subscription_snapshot(pool, client, subscription, Vec::new(), None).await?;
    snapshot.customers.extend(item.customers);
    snapshot.subscriptions.extend(item.subscriptions);
    snapshot.licenses.extend(item.licenses);
    snapshot.mails.extend(item.mails);
  }
  snapshot
    .customers
    .sort_by(|left, right| left.user_id.cmp(&right.user_id));
  snapshot.customers.dedup_by(|left, right| left.user_id == right.user_id);
  Ok(snapshot)
}

pub(super) async fn revenuecat_customer_snapshot(
  pool: &sqlx::PgPool,
  client: &RevenueCatClient,
  config: &RevenueCatRuntimeConfig,
  customer_id: &str,
  subscriptions: Vec<RevenueCatSubscription>,
  coverage: SnapshotCoverage,
  event_ids: Vec<String>,
) -> RuntimeResult<PaymentSnapshot> {
  if customer_id.is_empty() || customer_id.starts_with("$RCAnonymousID:") {
    return Err(RuntimeError::invalid_input("RevenueCat customer is not canonical"));
  }
  let user_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id=$1)")
    .bind(customer_id)
    .fetch_one(pool)
    .await
    .map_err(|error| RuntimeError::database("load RevenueCat target user", error))?;
  if !user_exists {
    return Err(RuntimeError::invalid_state("RevenueCat customer target does not exist"));
  }
  let namespace = client.namespace().clone();
  let namespace_key = namespace
    .canonical_key()
    .map_err(|_| RuntimeError::invalid_state("invalid RevenueCat provider namespace"))?;
  let mut alias_ids = None;
  let mut snapshots = Vec::with_capacity(subscriptions.len());
  let mut transfers = Vec::new();
  for subscription in subscriptions {
    if subscription.customer_id.as_deref() != Some(customer_id)
      || subscription.environment != client.namespace().environment.as_str()
      || subscription.entitlements.next_page.is_some()
      || subscription.id == subscription.store_subscription_identifier
    {
      return Err(RuntimeError::invalid_input("invalid RevenueCat subscription identity"));
    }
    let product = resolve_revenuecat_product(client, &subscription).await?;
    let mapping = config
      .product_map
      .get(&product.store_identifier)
      .ok_or_else(|| RuntimeError::invalid_input("RevenueCat product is not mapped"))?;
    let (plan, recurring) = parse_product_mapping(mapping)?;
    let existing = sqlx::query(
      "SELECT target_type,target_id FROM provider_subscriptions WHERE provider_namespace=$1 AND source_identity=$2",
    )
    .bind(&namespace_key)
    .bind(&subscription.id)
    .fetch_optional(pool)
    .await
    .map_err(|error| RuntimeError::database("load RevenueCat subscription target", error))?;
    if let Some(existing) = existing {
      let old_type: String = existing.get("target_type");
      let old_id: String = existing.get("target_id");
      if old_type != "user" || old_id != customer_id {
        if alias_ids.is_none() {
          alias_ids = Some(
            client
              .customer_aliases(customer_id)
              .await
              .map_err(provider_runtime_error)?
              .into_iter()
              .map(|alias| alias.id)
              .collect::<BTreeSet<_>>(),
          );
        }
        let alias_ids = alias_ids.as_ref().expect("RevenueCat aliases were loaded");
        if !alias_ids.contains(&old_id) || !alias_ids.contains(customer_id) {
          return Err(RuntimeError::invalid_state(
            "RevenueCat transfer is not proven by aliases",
          ));
        }
        transfers.push(RevenueCatOwnershipTransfer {
          source_id: subscription.id.clone(),
          customer_id: customer_id.to_string(),
          old_target_type: old_type,
          old_target_id: old_id,
          new_target_type: "user".to_string(),
          new_target_id: customer_id.to_string(),
        });
      }
    }
    snapshots.push(SubscriptionSnapshot {
      source_id: subscription.id.clone(),
      target_type: "user".to_string(),
      target_id: customer_id.to_string(),
      plan,
      recurring,
      lifecycle: ProviderLifecycle::parse(&subscription.status)
        .ok_or_else(|| RuntimeError::invalid_input("unknown RevenueCat subscription lifecycle"))?,
      gives_access: Some(subscription.gives_access),
      will_renew: Some(subscription.auto_renewal_status == "will_renew"),
      quantity: None,
      external_customer_id: Some(customer_id.to_string()),
      external_subscription_id: Some(subscription.id.clone()),
      external_product_id: Some(product.store_identifier.clone()),
      external_price_id: None,
      iap_store: Some(subscription.store.clone()),
      external_ref: Some(subscription.store_subscription_identifier.clone()),
      currency: None,
      amount: None,
      period_start: Some(timestamp_millis(subscription.starts_at, "RevenueCat period start")?),
      period_end: subscription
        .current_period_ends_at
        .map(|timestamp| timestamp_millis(timestamp, "RevenueCat period end"))
        .transpose()?,
      trial_start: (subscription.status == "trialing")
        .then(|| timestamp_millis(subscription.starts_at, "RevenueCat trial start"))
        .transpose()?,
      trial_end: (subscription.status == "trialing")
        .then_some(subscription.current_period_ends_at)
        .flatten()
        .map(|timestamp| timestamp_millis(timestamp, "RevenueCat trial end"))
        .transpose()?,
      canceled_at: None,
      metadata: json!({
        "ownership": subscription.ownership,
        "entitlement": product.display_name,
        "duration": product.subscription.and_then(|subscription| subscription.duration),
      }),
    });
  }
  Ok(PaymentSnapshot {
    namespace,
    coverage,
    customer_id: Some(customer_id.to_string()),
    customers: Vec::new(),
    subscriptions: snapshots,
    ownership_transfers: transfers,
    financial_facts: Vec::new(),
    trials: Vec::new(),
    invoices: Vec::new(),
    licenses: Vec::new(),
    mails: Vec::new(),
    captured_event_ids: event_ids,
    operation: None,
  })
}

async fn resolve_revenuecat_product(
  client: &RevenueCatClient,
  subscription: &RevenueCatSubscription,
) -> RuntimeResult<RevenueCatProduct> {
  let mut products = BTreeMap::new();
  for entitlement in &subscription.entitlements.items {
    if entitlement.lookup_key.trim().is_empty() {
      return Err(RuntimeError::invalid_state(
        "RevenueCat entitlement lookup key is missing",
      ));
    }
    let entitlement = if entitlement.products.is_some() {
      entitlement.clone()
    } else {
      client
        .entitlement(&entitlement.id)
        .await
        .map_err(provider_runtime_error)?
    };
    let Some(product_list) = entitlement.products else {
      continue;
    };
    if product_list.next_page.is_some() {
      return Err(RuntimeError::invalid_state(
        "RevenueCat entitlement products are incomplete",
      ));
    }
    for product in product_list.items {
      products.insert(product.id.clone(), product);
    }
  }
  subscription
    .product_id
    .as_deref()
    .and_then(|id| products.remove(id))
    .ok_or_else(|| RuntimeError::invalid_state("RevenueCat subscription product is incomplete"))
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
  let mut parts = suffix.split('_');
  let recurring = parts
    .next()
    .and_then(SubscriptionRecurring::parse)
    .ok_or_else(|| RuntimeError::invalid_input("unknown Stripe price recurring"))?;
  let variant = parts.next().map(str::to_string);
  if parts.next().is_some() {
    return Err(RuntimeError::invalid_input("invalid Stripe lookup key"));
  }
  Ok((plan, recurring, variant))
}

fn parse_product_mapping(config: &PaymentProductConfig) -> RuntimeResult<(Plan, SubscriptionRecurring)> {
  let plan = Plan::parse(&config.plan).ok_or_else(|| RuntimeError::config("invalid RevenueCat product plan"))?;
  let recurring = SubscriptionRecurring::parse(&config.recurring)
    .ok_or_else(|| RuntimeError::config("invalid RevenueCat product recurring"))?;
  Ok((plan, recurring))
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

fn timestamp_millis(value: i64, label: &str) -> RuntimeResult<chrono::DateTime<Utc>> {
  Utc
    .timestamp_millis_opt(value)
    .single()
    .ok_or_else(|| RuntimeError::invalid_input(format!("invalid {label}")))
}

fn provider_runtime_error(error: super::PaymentProviderError) -> RuntimeError {
  RuntimeError::invalid_state(error.code)
}
