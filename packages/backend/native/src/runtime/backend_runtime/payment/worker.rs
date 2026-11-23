use std::{collections::BTreeSet, sync::Arc, time::Duration};

use serde_json::Value;
use sqlx::Row;
use tokio::{sync::Mutex, task::JoinHandle};

use super::{PaymentApplyResult, PaymentRuntime, PaymentSnapshot, SnapshotCoverage, recover_app_store_purchase};
use crate::runtime::{RuntimeError, RuntimeResult, backend_runtime::invalidation::InvalidationRuntime};

pub(super) struct Receipt {
  provider: String,
  pub(super) namespace: String,
  event_id: String,
  event_type: String,
  pub(super) processing_attempts: i32,
  pub(super) payload: Value,
}

pub(super) fn is_receipt_attempt_fenced(error: &RuntimeError) -> bool {
  matches!(error, RuntimeError::InvalidState(reason) if reason == super::read::RECEIPT_ATTEMPT_FENCED_ERROR)
}

fn with_claimed_attempt(mut snapshot: PaymentSnapshot, receipt: &Receipt) -> PaymentSnapshot {
  snapshot.claimed_attempt = Some((receipt.event_id.clone(), receipt.processing_attempts));
  snapshot
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
            Err(error) if is_receipt_attempt_fenced(&error) => {}
            Err(error) => {
              fail_receipt(
                &runtime,
                &receipt.event_id,
                &receipt.namespace,
                receipt.processing_attempts,
                &error,
              )
              .await
            }
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
        if let Ok(Some(changes)) = recover_app_store_purchase(&runtime).await {
          publish_changes(&invalidation, changes).await;
        }
        if let Ok(Some(changes)) = super::command::recover_waiting_checkout(&runtime).await {
          publish_changes(&invalidation, changes).await;
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
                 event.event_type,event.processing_attempts,event.metadata"#,
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
        processing_attempts: row.get("processing_attempts"),
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
  let observed_at = chrono::Utc::now();
  if object_kind == "checkout.session" {
    super::command::stripe_checkout_receipt(runtime, receipt).await?;
    if object.get("subscription").is_none_or(Value::is_null) {
      return runtime
        .apply_snapshot(with_claimed_attempt(
          empty_receipt_snapshot(stripe.namespace().clone(), receipt.event_id.clone()),
          receipt,
        ))
        .await;
    }
  }
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
      return runtime.apply_snapshot(with_claimed_attempt(snapshot, receipt)).await;
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
      return runtime.apply_snapshot(with_claimed_attempt(snapshot, receipt)).await;
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
      return runtime.apply_snapshot(with_claimed_attempt(snapshot, receipt)).await;
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
      return runtime.apply_snapshot(with_claimed_attempt(snapshot, receipt)).await;
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
    return runtime.apply_snapshot(with_claimed_attempt(snapshot, receipt)).await;
  }
  if receipt.event_type.starts_with("customer.")
    || receipt.event_type.starts_with("product.")
    || receipt.event_type.starts_with("price.")
  {
    return runtime
      .apply_snapshot(with_claimed_attempt(
        empty_receipt_snapshot(stripe.namespace().clone(), receipt.event_id.clone()),
        receipt,
      ))
      .await;
  }
  Err(RuntimeError::invalid_state("unsupported Stripe payment receipt"))
}

async fn recover_revenuecat(runtime: &PaymentRuntime, receipt: &Receipt) -> RuntimeResult<PaymentApplyResult> {
  let client = runtime
    .revenuecat
    .as_deref()
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
  let mut snapshot = runtime.observe_revenuecat_customer(customer_id).await?;
  snapshot.captured_event_ids.push(receipt.event_id.clone());
  runtime.apply_snapshot(with_claimed_attempt(snapshot, receipt)).await
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
    claimed_attempt: None,
    operation: None,
  }
}

pub(super) async fn fail_receipt(
  runtime: &PaymentRuntime,
  event_id: &str,
  namespace: &str,
  claimed_attempt: i32,
  error: &RuntimeError,
) {
  let _ = sqlx::query(
    r#"UPDATE payment_events
       SET processing_status=CASE WHEN processing_attempts>=5 AND NOT $4 THEN 'blocked' ELSE 'failed' END,
           last_error=$3,
           next_attempt_at=CASE WHEN processing_attempts>=5 AND NOT $4 THEN NULL
             ELSE clock_timestamp()+make_interval(secs => CASE WHEN $4
               THEN LEAST(300,5*power(2,LEAST(GREATEST(processing_attempts-1,0),6)))
               ELSE 5 END) END,
           updated_at=clock_timestamp()
       WHERE provider_namespace=$1 AND external_event_id=$2 AND processing_status='processing' AND processing_attempts=$5"#,
  )
  .bind(namespace)
  .bind(event_id)
  .bind(error.to_string())
  .bind(retryable_database_error(error))
  .bind(claimed_attempt)
  .execute(&runtime.pool)
  .await;
}

fn retryable_database_error(error: &RuntimeError) -> bool {
  let RuntimeError::Database { source, .. } = error else {
    return false;
  };
  match source {
    sqlx::Error::Io(_) | sqlx::Error::PoolTimedOut | sqlx::Error::WorkerCrashed => true,
    sqlx::Error::Database(error) => error.code().is_some_and(|code| {
      matches!(
        code.as_ref(),
        "08000"
          | "08001"
          | "08003"
          | "08006"
          | "08007"
          | "40001"
          | "40P01"
          | "55P03"
          | "57014"
          | "57P01"
          | "57P02"
          | "57P03"
      )
    }),
    _ => false,
  }
}

async fn publish_changes(invalidation: &InvalidationRuntime, changes: PaymentApplyResult) {
  for hint in super::super::entitlement::change_invalidations(&changes.targets, &changes.owner_ids) {
    invalidation.publish(hint).await;
  }
}

fn provider_runtime_error(error: super::PaymentProviderError) -> RuntimeError {
  RuntimeError::invalid_state(error.code)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn receipt_attempt_fence_error_predicate_matches_only_fence_error() {
    assert!(is_receipt_attempt_fenced(&RuntimeError::invalid_state(
      super::super::read::RECEIPT_ATTEMPT_FENCED_ERROR
    )));
    assert!(!is_receipt_attempt_fenced(&RuntimeError::invalid_state("other_error")));
    assert!(!is_receipt_attempt_fenced(&RuntimeError::invalid_input(
      super::super::read::RECEIPT_ATTEMPT_FENCED_ERROR
    )));
  }

  #[tokio::test]
  #[ignore = "requires an isolated DATABASE_URL; run explicitly with --include-ignored"]
  async fn completion_never_overwrites_sibling_processing_receipts_without_their_attempt() {
    let database_url = std::env::var("DATABASE_URL").expect("real PostgreSQL DATABASE_URL is required");
    let pool = sqlx::postgres::PgPoolOptions::new()
      .max_connections(2)
      .connect(&database_url)
      .await
      .unwrap();
    let marker = uuid::Uuid::new_v4().simple().to_string();
    let namespace = format!("stripe:siblings-{marker}");
    let ids = [
      format!("claimed-{marker}"),
      format!("processing-{marker}"),
      format!("pending-{marker}"),
      format!("failed-{marker}"),
    ];
    for (id, status) in ids.iter().zip(["processing", "processing", "pending", "failed"]) {
      sqlx::query(
        "INSERT INTO \
         payment_events(id,provider,provider_namespace,event_type,external_event_id,processing_status,\
         processing_attempts) VALUES($1,'stripe',$2,'customer.updated',$1,$3,2)",
      )
      .bind(id)
      .bind(&namespace)
      .bind(status)
      .execute(&pool)
      .await
      .unwrap();
    }
    let ns = affine_core::payment::ProviderNamespace {
      provider: affine_core::payment::Provider::Stripe,
      environment: affine_core::payment::ProviderEnvironment::Test,
      account: marker,
    };
    let mut snapshot = empty_receipt_snapshot(ns, ids[0].clone());
    snapshot.captured_event_ids = ids.to_vec();
    snapshot.claimed_attempt = Some((ids[0].clone(), 2));
    let mut tx = pool.begin().await.unwrap();
    super::super::lock_receipts_and_operation(&mut tx, &snapshot, &namespace)
      .await
      .unwrap();
    super::super::complete_receipts_and_operation(&mut tx, &snapshot, &namespace, chrono::Utc::now())
      .await
      .unwrap();
    tx.commit().await.unwrap();
    let states: Vec<(String, String)> = sqlx::query_as(
      "SELECT external_event_id,processing_status FROM payment_events WHERE provider_namespace=$1 ORDER BY \
       external_event_id",
    )
    .bind(&namespace)
    .fetch_all(&pool)
    .await
    .unwrap();
    for id in &ids {
      let state = &states.iter().find(|(event, _)| event == id).unwrap().1;
      assert_eq!(state, if id == &ids[1] { "processing" } else { "processed" });
    }
    snapshot.claimed_attempt = None;
    snapshot.captured_event_ids = vec![ids[1].clone()];
    let mut tx = pool.begin().await.unwrap();
    super::super::complete_receipts_and_operation(&mut tx, &snapshot, &namespace, chrono::Utc::now())
      .await
      .unwrap();
    tx.commit().await.unwrap();
    let state: String = sqlx::query_scalar("SELECT processing_status FROM payment_events WHERE external_event_id=$1")
      .bind(&ids[1])
      .fetch_one(&pool)
      .await
      .unwrap();
    assert_eq!(state, "processing");
    sqlx::query("DELETE FROM payment_events WHERE provider_namespace=$1")
      .bind(&namespace)
      .execute(&pool)
      .await
      .unwrap();
    pool.close().await;
  }

  #[tokio::test]
  #[ignore = "requires an isolated DATABASE_URL; run explicitly with --include-ignored"]
  async fn receipt_attempt_generation_fence_blocks_stale_worker_commit_and_fail() {
    let database_url = std::env::var("DATABASE_URL").expect("real PostgreSQL DATABASE_URL is required");
    let pool = sqlx::postgres::PgPoolOptions::new()
      .max_connections(2)
      .connect(&database_url)
      .await
      .unwrap();
    let marker = uuid::Uuid::new_v4().simple().to_string();
    let namespace = format!("stripe:fence-{marker}");
    let event_id = format!("evt_fence_{marker}");
    let row_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
      r#"INSERT INTO payment_events(id,provider,provider_namespace,event_type,external_event_id,processing_status,processing_attempts)
         VALUES($1,'stripe',$2,'customer.updated',$3,'processing',1)"#,
    )
    .bind(&row_id)
    .bind(&namespace)
    .bind(&event_id)
    .execute(&pool)
    .await
    .unwrap();

    // Simulate worker 2 taking over after timeout (attempt=2) and completing
    // the receipt.
    sqlx::query("UPDATE payment_events SET processing_attempts=2, processing_status='processing' WHERE id=$1")
      .bind(&row_id)
      .execute(&pool)
      .await
      .unwrap();

    let provider_ns = affine_core::payment::ProviderNamespace {
      provider: affine_core::payment::Provider::Stripe,
      environment: affine_core::payment::ProviderEnvironment::Test,
      account: format!("fence-{marker}"),
    };
    let mut worker2_snapshot = empty_receipt_snapshot(provider_ns.clone(), event_id.clone());
    worker2_snapshot.claimed_attempt = Some((event_id.clone(), 2));

    let payment_runtime = PaymentRuntime::new(
      &database_url,
      &crate::runtime::PaymentRuntimeConfig::default(),
      crate::runtime::Deployment::Cloud,
      "test-key",
    )
    .await
    .unwrap();
    let mut worker1_snapshot = empty_receipt_snapshot(provider_ns, event_id.clone());
    worker1_snapshot.claimed_attempt = Some((event_id.clone(), 1));

    // Fence the old worker even while the new attempt is still processing:
    // checking status alone would not protect either success or failure here.
    fail_receipt(
      &payment_runtime,
      &event_id,
      &namespace,
      1,
      &RuntimeError::invalid_state("stale failure"),
    )
    .await;
    let status: String = sqlx::query_scalar("SELECT processing_status FROM payment_events WHERE id=$1")
      .bind(&row_id)
      .fetch_one(&pool)
      .await
      .unwrap();
    assert_eq!(status, "processing");
    let mut stale_tx = pool.begin().await.unwrap();
    let error = super::super::lock_receipts_and_operation(&mut stale_tx, &worker1_snapshot, &namespace)
      .await
      .unwrap_err();
    assert!(is_receipt_attempt_fenced(&error));
    stale_tx.rollback().await.unwrap();
    let mut stale_tx = pool.begin().await.unwrap();
    let error =
      super::super::complete_receipts_and_operation(&mut stale_tx, &worker1_snapshot, &namespace, chrono::Utc::now())
        .await
        .unwrap_err();
    assert!(is_receipt_attempt_fenced(&error));
    stale_tx.rollback().await.unwrap();

    let mut tx2 = pool.begin().await.unwrap();
    assert_eq!(
      super::super::lock_receipts_and_operation(&mut tx2, &worker2_snapshot, &namespace)
        .await
        .unwrap(),
      super::super::ReceiptDisposition::Apply
    );
    super::super::complete_receipts_and_operation(&mut tx2, &worker2_snapshot, &namespace, chrono::Utc::now())
      .await
      .unwrap();
    tx2.commit().await.unwrap();

    // Old worker 1 wakes up with attempt=1: lock_receipts_and_operation must
    // fence it.
    let mut tx1 = pool.begin().await.unwrap();
    let err = super::super::lock_receipts_and_operation(&mut tx1, &worker1_snapshot, &namespace)
      .await
      .unwrap_err();
    assert!(is_receipt_attempt_fenced(&err));
    tx1.rollback().await.unwrap();

    // Old worker failure also cannot mutate the completed receipt.
    fail_receipt(
      &payment_runtime,
      &event_id,
      &namespace,
      1,
      &RuntimeError::invalid_state("stale worker failure"),
    )
    .await;
    payment_runtime.stop().await;

    let row = sqlx::query("SELECT processing_status, processing_attempts, last_error FROM payment_events WHERE id=$1")
      .bind(&row_id)
      .fetch_one(&pool)
      .await
      .unwrap();
    assert_eq!(row.get::<String, _>("processing_status"), "processed");
    assert_eq!(row.get::<i32, _>("processing_attempts"), 2);
    assert_eq!(row.get::<Option<String>, _>("last_error"), None);

    sqlx::query("DELETE FROM payment_events WHERE id=$1")
      .bind(&row_id)
      .execute(&pool)
      .await
      .unwrap();
    pool.close().await;
  }
}
