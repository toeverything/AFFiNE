use std::collections::{BTreeMap, BTreeSet};

use affine_core::{
  access_control::Plan,
  payment::{ProviderLifecycle, SubscriptionRecurring},
};
use chrono::{TimeZone, Utc};
use serde_json::json;
use sqlx::Row;

use super::{
  PaymentRuntime, PaymentSnapshot, RevenueCatClient, RevenueCatOwnershipTransfer, RevenueCatProduct,
  RevenueCatSubscription, SnapshotCoverage, SubscriptionSnapshot, provider_runtime_error,
  verified_missing_revenuecat_sources,
};
use crate::runtime::{PaymentProductConfig, RevenueCatRuntimeConfig, RuntimeError, RuntimeResult};

impl PaymentRuntime {
  pub(in crate::runtime::backend_runtime::payment) async fn observe_revenuecat_customer(
    &self,
    user_id: &str,
  ) -> RuntimeResult<PaymentSnapshot> {
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
    let verified = verified_missing_revenuecat_sources(self, client, user_id, &subscriptions).await?;
    revenuecat_customer_snapshot(
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
    .await
  }
}

pub(in crate::runtime::backend_runtime::payment) async fn revenuecat_customer_snapshot(
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
  let product_id = subscription
    .product_id
    .as_deref()
    .ok_or_else(|| RuntimeError::invalid_state("RevenueCat subscription product is incomplete"))?;
  let product = match products.remove(product_id) {
    Some(product) => product,
    None => client.product(product_id).await.map_err(provider_runtime_error)?,
  };
  if product.id != product_id {
    return Err(RuntimeError::invalid_state("RevenueCat product identity mismatch"));
  }
  Ok(product)
}

fn parse_product_mapping(config: &PaymentProductConfig) -> RuntimeResult<(Plan, SubscriptionRecurring)> {
  let plan = Plan::parse(&config.plan).ok_or_else(|| RuntimeError::config("invalid RevenueCat product plan"))?;
  let recurring = SubscriptionRecurring::parse(&config.recurring)
    .ok_or_else(|| RuntimeError::config("invalid RevenueCat product recurring"))?;
  Ok((plan, recurring))
}

fn timestamp_millis(value: i64, label: &str) -> RuntimeResult<chrono::DateTime<Utc>> {
  Utc
    .timestamp_millis_opt(value)
    .single()
    .ok_or_else(|| RuntimeError::invalid_input(format!("invalid {label}")))
}
