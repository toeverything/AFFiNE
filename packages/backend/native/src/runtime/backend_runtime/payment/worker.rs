use std::{collections::BTreeSet, sync::Arc, time::Duration};

use serde_json::Value;
use sqlx::Row;
use tokio::{sync::Mutex, task::JoinHandle};

use super::{PaymentApplyResult, PaymentRuntime, PaymentSnapshot, SnapshotCoverage};
use crate::runtime::{RuntimeError, RuntimeResult, backend_runtime::invalidation::InvalidationRuntime};

pub(super) struct Receipt {
  provider: String,
  namespace: String,
  event_id: String,
  event_type: String,
  payload: Value,
}

pub(super) struct PaymentWorker {
  task: Mutex<Option<JoinHandle<()>>>,
}

impl PaymentWorker {
  pub(super) fn start(runtime: Arc<PaymentRuntime>, invalidation: Arc<InvalidationRuntime>) -> Self {
    let task = tokio::spawn(async move {
      let mut interval = tokio::time::interval(Duration::from_secs(2));
      interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
      loop {
        interval.tick().await;
        if runtime.permits.is_closed() {
          return;
        }
        if let Ok(Some(receipt)) = claim_receipt(&runtime).await {
          match recover_receipt(&runtime, &receipt).await {
            Ok(changes) => publish_changes(&invalidation, changes).await,
            Err(error) => fail_receipt(&runtime, &receipt.event_id, &receipt.namespace, &error).await,
          }
          continue;
        }
        if let Ok(Some(changes)) = super::command::recover_one_revenuecat_identify(&runtime).await {
          publish_changes(&invalidation, changes).await;
          continue;
        }
        if let Ok(Some(changes)) = super::command::recover_one_stripe_operation(&runtime).await {
          publish_changes(&invalidation, changes).await;
          continue;
        }
        if let Ok(Some(changes)) = super::reconcile_one_source(&runtime).await {
          publish_changes(&invalidation, changes).await;
        }
        if let Ok(Some(changes)) = super::reconcile_one_financial(&runtime).await {
          publish_changes(&invalidation, changes).await;
        }
      }
    });
    Self {
      task: Mutex::new(Some(task)),
    }
  }

  pub(super) async fn stop(&self) {
    if let Some(task) = self.task.lock().await.take() {
      task.abort();
      let _ = task.await;
    }
  }
}

pub(super) async fn claim_receipt(runtime: &PaymentRuntime) -> RuntimeResult<Option<Receipt>> {
  let namespaces = [
    runtime.stripe.as_ref().map(|client| client.namespace()),
    runtime.revenuecat.as_ref().map(|client| client.namespace()),
  ]
  .into_iter()
  .flatten()
  .map(|namespace| {
    namespace
      .canonical_key()
      .map_err(|_| RuntimeError::invalid_state("invalid payment provider namespace"))
  })
  .collect::<RuntimeResult<Vec<_>>>()?;
  if namespaces.is_empty() {
    return Ok(None);
  }
  let row = sqlx::query(
    r#"WITH candidate AS (
         SELECT id FROM payment_events
         WHERE provider_namespace=ANY($1) AND (
           (processing_status IN ('pending','failed') AND (next_attempt_at IS NULL OR next_attempt_at<=clock_timestamp()))
            OR (processing_status='processing' AND updated_at<clock_timestamp()-INTERVAL '2 minutes'))
         ORDER BY created_at,id
         LIMIT 1 FOR UPDATE SKIP LOCKED
       )
       UPDATE payment_events event
       SET processing_status='processing',processing_attempts=processing_attempts+1,
           next_attempt_at=clock_timestamp()+INTERVAL '2 minutes',updated_at=clock_timestamp()
       FROM candidate WHERE event.id=candidate.id
       RETURNING event.provider::text AS provider,event.provider_namespace,event.external_event_id,
                 event.event_type,event.metadata"#,
  )
  .bind(&namespaces)
  .fetch_optional(&runtime.pool)
  .await
  .map_err(|error| RuntimeError::database("claim payment receipt", error))?;
  row
    .map(|row| {
      Ok(Receipt {
        provider: row.get("provider"),
        namespace: row
          .get::<Option<String>, _>("provider_namespace")
          .ok_or_else(|| RuntimeError::invalid_state("payment receipt has no provider namespace"))?,
        event_id: row.get("external_event_id"),
        event_type: row.get("event_type"),
        payload: row.get("metadata"),
      })
    })
    .transpose()
}

async fn recover_receipt(runtime: &PaymentRuntime, receipt: &Receipt) -> RuntimeResult<PaymentApplyResult> {
  match receipt.provider.as_str() {
    "stripe" => recover_stripe(runtime, receipt).await,
    "revenuecat" => recover_revenuecat(runtime, receipt).await,
    _ => Err(RuntimeError::invalid_state("unknown payment receipt provider")),
  }
}

async fn recover_stripe(runtime: &PaymentRuntime, receipt: &Receipt) -> RuntimeResult<PaymentApplyResult> {
  let stripe = runtime
    .stripe
    .as_deref()
    .ok_or_else(|| RuntimeError::invalid_state("Stripe payment provider is not configured"))?;
  require_namespace(receipt, stripe.namespace())?;
  let object = receipt
    .payload
    .pointer("/data/object")
    .and_then(Value::as_object)
    .ok_or_else(|| RuntimeError::invalid_input("Stripe receipt object is invalid"))?;
  let object_kind = object.get("object").and_then(Value::as_str).unwrap_or_default();
  let observed_at = receipt_observed_at(receipt)?;
  match object_kind {
    "invoice" => {
      let invoice_id = object
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| RuntimeError::invalid_input("Stripe invoice receipt has no identity"))?;
      let invoice = stripe.invoice(invoice_id).await.map_err(provider_runtime_error)?;
      let snapshot = super::stripe_invoice_snapshot(
        &runtime.pool,
        stripe,
        invoice,
        vec![receipt.event_id.clone()],
        observed_at,
      )
      .await?;
      return runtime.apply_snapshot(snapshot).await;
    }
    "charge" if receipt.event_type == "charge.refunded" => {
      let charge_id = object
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| RuntimeError::invalid_input("Stripe charge receipt has no identity"))?;
      let charge = stripe.charge(charge_id).await.map_err(provider_runtime_error)?;
      let invoice_id = charge
        .invoice
        .as_ref()
        .map(|invoice| invoice.id())
        .ok_or_else(|| RuntimeError::invalid_state("Stripe refunded charge has no invoice"))?;
      let refunds = charge
        .refunds
        .ok_or_else(|| RuntimeError::invalid_state("Stripe refunded charge has no refund list"))?;
      if refunds.has_more {
        return Err(RuntimeError::invalid_state("Stripe charge refunds are incomplete"));
      }
      let invoice = stripe.invoice(invoice_id).await.map_err(provider_runtime_error)?;
      let mut snapshot = super::stripe_invoice_snapshot(
        &runtime.pool,
        stripe,
        invoice,
        vec![receipt.event_id.clone()],
        observed_at,
      )
      .await?;
      for refund in refunds.data {
        super::push_stripe_refund(&mut snapshot, refund, observed_at)?;
      }
      return runtime.apply_snapshot(snapshot).await;
    }
    "refund" => {
      let refund_id = object
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| RuntimeError::invalid_input("Stripe refund receipt has no identity"))?;
      let refund = stripe.refund(refund_id).await.map_err(provider_runtime_error)?;
      let charge_id = refund
        .charge
        .as_ref()
        .map(|charge| charge.id())
        .ok_or_else(|| RuntimeError::invalid_state("Stripe refund has no charge"))?;
      let charge = stripe.charge(charge_id).await.map_err(provider_runtime_error)?;
      let invoice_id = charge
        .invoice
        .as_ref()
        .map(|invoice| invoice.id())
        .ok_or_else(|| RuntimeError::invalid_state("Stripe refund charge has no invoice"))?;
      let invoice = stripe.invoice(invoice_id).await.map_err(provider_runtime_error)?;
      let mut snapshot = super::stripe_invoice_snapshot(
        &runtime.pool,
        stripe,
        invoice,
        vec![receipt.event_id.clone()],
        observed_at,
      )
      .await?;
      super::push_stripe_refund(&mut snapshot, refund, observed_at)?;
      return runtime.apply_snapshot(snapshot).await;
    }
    "dispute" => {
      let dispute_id = object
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| RuntimeError::invalid_input("Stripe dispute receipt has no identity"))?;
      let dispute = stripe.dispute(dispute_id).await.map_err(provider_runtime_error)?;
      let charge = stripe
        .charge(dispute.charge.id())
        .await
        .map_err(provider_runtime_error)?;
      let invoice_id = charge
        .invoice
        .as_ref()
        .map(|invoice| invoice.id())
        .ok_or_else(|| RuntimeError::invalid_state("Stripe dispute charge has no invoice"))?;
      let invoice = stripe.invoice(invoice_id).await.map_err(provider_runtime_error)?;
      let mut snapshot = super::stripe_invoice_snapshot(
        &runtime.pool,
        stripe,
        invoice,
        vec![receipt.event_id.clone()],
        observed_at,
      )
      .await?;
      super::push_stripe_dispute(&mut snapshot, dispute, observed_at)?;
      return runtime.apply_snapshot(snapshot).await;
    }
    _ => {}
  }
  let subscription_id = if object_kind == "subscription" {
    object.get("id").and_then(Value::as_str)
  } else {
    expanded_id(object.get("subscription")).or_else(|| {
      object
        .get("parent")
        .and_then(|value| value.get("subscription_details"))
        .and_then(|value| value.get("subscription"))
        .and_then(expanded_id_value)
    })
  };
  if let Some(subscription_id) = subscription_id {
    let subscription = stripe
      .subscription(subscription_id)
      .await
      .map_err(provider_runtime_error)?;
    let snapshot = super::snapshot::stripe_subscription_snapshot(
      &runtime.pool,
      stripe,
      subscription,
      vec![receipt.event_id.clone()],
      None,
    )
    .await?;
    return runtime.apply_snapshot(snapshot).await;
  }
  if receipt.event_type.starts_with("customer.")
    || receipt.event_type.starts_with("product.")
    || receipt.event_type.starts_with("price.")
  {
    return runtime
      .apply_snapshot(empty_receipt_snapshot(
        stripe.namespace().clone(),
        receipt.event_id.clone(),
      ))
      .await;
  }
  Err(RuntimeError::invalid_state("unsupported Stripe payment receipt"))
}

fn receipt_observed_at(receipt: &Receipt) -> RuntimeResult<chrono::DateTime<chrono::Utc>> {
  use chrono::TimeZone;

  let created = receipt
    .payload
    .get("created")
    .and_then(Value::as_i64)
    .ok_or_else(|| RuntimeError::invalid_input("Stripe receipt has no creation time"))?;
  chrono::Utc
    .timestamp_opt(created, 0)
    .single()
    .ok_or_else(|| RuntimeError::invalid_input("Stripe receipt has invalid creation time"))
}

async fn recover_revenuecat(runtime: &PaymentRuntime, receipt: &Receipt) -> RuntimeResult<PaymentApplyResult> {
  let client = runtime
    .revenuecat
    .as_deref()
    .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
  let config = runtime
    .revenuecat_config
    .as_ref()
    .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
  require_namespace(receipt, client.namespace())?;
  let event = receipt
    .payload
    .get("event")
    .and_then(Value::as_object)
    .ok_or_else(|| RuntimeError::invalid_input("RevenueCat receipt event is invalid"))?;
  let customer_id = event
    .get("transferred_to")
    .and_then(Value::as_array)
    .and_then(|ids| ids.iter().find_map(Value::as_str))
    .or_else(|| event.get("app_user_id").and_then(Value::as_str))
    .filter(|id| !id.starts_with("$RCAnonymousID:"))
    .ok_or_else(|| RuntimeError::invalid_state("RevenueCat receipt has no canonical customer"))?;
  let subscriptions = client
    .customer_subscriptions(customer_id)
    .await
    .map_err(provider_runtime_error)?;
  let verified = verified_missing_revenuecat_sources(runtime, client, customer_id, &subscriptions).await?;
  let snapshot = super::snapshot::revenuecat_customer_snapshot(
    &runtime.pool,
    client,
    config,
    customer_id,
    subscriptions,
    SnapshotCoverage::Complete {
      verified_missing_revenuecat_sources: verified,
    },
    vec![receipt.event_id.clone()],
  )
  .await?;
  runtime.apply_snapshot(snapshot).await
}

pub(super) async fn verified_missing_revenuecat_sources(
  runtime: &PaymentRuntime,
  client: &super::RevenueCatClient,
  customer_id: &str,
  subscriptions: &[super::revenuecat_client::RevenueCatSubscription],
) -> RuntimeResult<BTreeSet<String>> {
  let namespace = client
    .namespace()
    .canonical_key()
    .map_err(|_| RuntimeError::invalid_state("invalid RevenueCat provider namespace"))?;
  let present = subscriptions
    .iter()
    .map(|item| item.id.as_str())
    .collect::<BTreeSet<_>>();
  let rows = sqlx::query(
    "SELECT source_identity,external_ref FROM provider_subscriptions WHERE provider_namespace=$1 AND \
     target_type='user' AND target_id=$2 AND source_identity IS NOT NULL",
  )
  .bind(&namespace)
  .bind(customer_id)
  .fetch_all(&runtime.pool)
  .await
  .map_err(|error| RuntimeError::database("load RevenueCat missing sources", error))?;
  let mut verified = BTreeSet::new();
  for row in rows {
    let source: String = row.get("source_identity");
    if present.contains(source.as_str()) {
      continue;
    }
    let store_id = row
      .get::<Option<String>, _>("external_ref")
      .ok_or_else(|| RuntimeError::invalid_state("RevenueCat source has no store identity"))?;
    let matches = client
      .subscriptions_by_store_id(&store_id)
      .await
      .map_err(provider_runtime_error)?;
    if matches
      .iter()
      .any(|item| item.id == source && item.customer_id.as_deref() == Some(customer_id))
    {
      return Err(RuntimeError::invalid_state("RevenueCat customer result is incomplete"));
    }
    verified.insert(source);
  }
  Ok(verified)
}

fn require_namespace(receipt: &Receipt, namespace: &affine_core::payment::ProviderNamespace) -> RuntimeResult<()> {
  let configured = namespace
    .canonical_key()
    .map_err(|_| RuntimeError::invalid_state("invalid payment provider namespace"))?;
  if receipt.namespace != configured {
    return Err(RuntimeError::invalid_state(
      "payment receipt provider namespace mismatch",
    ));
  }
  Ok(())
}

fn expanded_id(value: Option<&Value>) -> Option<&str> {
  value.and_then(expanded_id_value)
}

fn expanded_id_value(value: &Value) -> Option<&str> {
  value.as_str().or_else(|| value.get("id").and_then(Value::as_str))
}

fn empty_receipt_snapshot(namespace: affine_core::payment::ProviderNamespace, event_id: String) -> PaymentSnapshot {
  PaymentSnapshot {
    namespace,
    coverage: SnapshotCoverage::Single,
    customer_id: None,
    customers: Vec::new(),
    subscriptions: Vec::new(),
    ownership_transfers: Vec::new(),
    financial_facts: Vec::new(),
    trials: Vec::new(),
    invoices: Vec::new(),
    licenses: Vec::new(),
    mails: Vec::new(),
    captured_event_ids: vec![event_id],
    operation: None,
  }
}

pub(super) async fn fail_receipt(runtime: &PaymentRuntime, event_id: &str, namespace: &str, error: &RuntimeError) {
  let _ = sqlx::query(
    r#"UPDATE payment_events
       SET processing_status=CASE WHEN processing_attempts>=5 THEN 'blocked' ELSE 'failed' END,
           last_error=$3,
           next_attempt_at=CASE WHEN processing_attempts>=5 THEN NULL ELSE clock_timestamp()+INTERVAL '5 seconds' END,
           updated_at=clock_timestamp()
       WHERE provider_namespace=$1 AND external_event_id=$2 AND processing_status='processing'"#,
  )
  .bind(namespace)
  .bind(event_id)
  .bind(error.to_string())
  .execute(&runtime.pool)
  .await;
}

async fn publish_changes(invalidation: &InvalidationRuntime, changes: PaymentApplyResult) {
  for hint in super::super::entitlement::change_invalidations(&changes.targets, &changes.owner_ids) {
    invalidation.publish(hint).await;
  }
}

fn provider_runtime_error(error: super::PaymentProviderError) -> RuntimeError {
  RuntimeError::invalid_state(error.code)
}
