use affine_core::{
  access_control::Plan,
  payment::{FinancialFact, FinancialKind, FinancialStatus, ProviderLifecycle, SubscriptionRecurring},
};
use chrono::{TimeZone, Utc};
use serde_json::json;
use sqlx::Row;

use super::{
  CustomerSnapshot, FinancialSnapshot, InvoiceSnapshot, PaymentSnapshot, SnapshotCoverage, StripeClient, StripeDispute,
  StripeInvoice, StripeRefund, SubscriptionSnapshot,
};
use crate::runtime::{RuntimeError, RuntimeResult};

pub(super) async fn stripe_invoice_snapshot(
  pool: &sqlx::PgPool,
  client: &StripeClient,
  invoice: StripeInvoice,
  event_ids: Vec<String>,
  observed_at: chrono::DateTime<Utc>,
) -> RuntimeResult<PaymentSnapshot> {
  let customer_id = invoice.customer.id().to_string();
  let namespace = client.namespace().clone();
  let namespace_key = namespace
    .canonical_key()
    .map_err(|_| RuntimeError::invalid_state("invalid Stripe provider namespace"))?;
  let status = invoice_status(invoice.status.as_deref())?;
  let amount =
    i32::try_from(invoice.total).map_err(|_| RuntimeError::invalid_input("Stripe invoice amount is out of range"))?;
  let mut snapshot = if let Some(subscription_id) = invoice.subscription_id() {
    let subscription = client
      .subscription(subscription_id)
      .await
      .map_err(provider_runtime_error)?;
    if subscription.customer.id() != customer_id {
      return Err(RuntimeError::invalid_state(
        "Stripe invoice customer does not match subscription",
      ));
    }
    super::snapshot::stripe_subscription_snapshot(pool, client, subscription, event_ids, None).await?
  } else {
    lifetime_invoice_snapshot(pool, client, &invoice, &namespace_key, &customer_id, event_ids, status).await?
  };
  let target_id = if let Some(source) = snapshot.subscriptions.first() {
    source.target_id.clone()
  } else {
    customer_user(pool, &namespace_key, &customer_id).await?
  };
  snapshot.invoices.push(InvoiceSnapshot {
    external_id: invoice.id.clone(),
    target_id,
    currency: invoice.currency.clone(),
    amount,
    status: invoice.status.clone().unwrap_or_else(|| "void".to_string()),
    reason: invoice.billing_reason.clone(),
    last_payment_error: invoice
      .last_finalization_error
      .as_ref()
      .and_then(|error| error.message.clone()),
    link: invoice.hosted_invoice_url.clone(),
  });
  snapshot.financial_facts.push(stripe_invoice_fact(
    &invoice,
    snapshot.subscriptions.first(),
    observed_at,
  )?);
  Ok(snapshot)
}

pub(super) fn stripe_invoice_fact(
  invoice: &StripeInvoice,
  source: Option<&SubscriptionSnapshot>,
  observed_at: chrono::DateTime<Utc>,
) -> RuntimeResult<FinancialSnapshot> {
  let status = invoice_status(invoice.status.as_deref())?;
  let coupons: Vec<_> = invoice
    .total_discount_amounts
    .iter()
    .filter(|discount| discount.amount > 0)
    .map(|discount| &discount.discount["coupon"])
    .collect();
  let promotional_grant = invoice.total == 0
    && !coupons.is_empty()
    && coupons.iter().all(|coupon| {
      coupon["id"].as_str().is_some_and(|id| !id.is_empty()) && coupon["metadata"]["affine_policy"] == "grant_v1"
    });
  let mut metadata = json!({ "billingReason": invoice.billing_reason });
  if promotional_grant {
    metadata["couponGrant"] = json!({
      "coupons": coupons.iter().map(|coupon| json!({
        "id": coupon["id"], "policy": coupon["metadata"]["affine_policy"]
      })).collect::<Vec<_>>(),
      "observedAt": observed_at
    });
  }
  let invoice_facts = affine_core::payment::InvoiceFinancialFacts {
    promotional_grant,
    collection_adjustment: false,
    total: Some(invoice.total),
    reason: match (invoice.subscription_id(), invoice.billing_reason.as_deref()) {
      (None, _) => affine_core::payment::InvoiceReason::OneTime,
      (_, Some("subscription_create")) => affine_core::payment::InvoiceReason::SubscriptionCreate,
      (_, Some("subscription_cycle")) => affine_core::payment::InvoiceReason::SubscriptionCycle,
      (_, Some("subscription_update" | "subscription_threshold")) => affine_core::payment::InvoiceReason::Adjustment,
      _ => affine_core::payment::InvoiceReason::Unknown,
    },
    created_at: timestamp(invoice.created, "Stripe invoice")?,
    trial_start: source.and_then(|source| source.trial_start),
    trial_end: source.and_then(|source| source.trial_end),
  };
  Ok(FinancialSnapshot {
    observed_at,
    fact: FinancialFact {
      invoice: Some(invoice_facts),
      kind: FinancialKind::Invoice,
      status,
    },
    external_id: invoice.id.clone(),
    source_id: source.map(|source| source.source_id.clone()),
    external_invoice_id: Some(invoice.id.clone()),
    external_payment_id: invoice.payment_intent.as_ref().map(|payment| payment.id().to_string()),
    amount: Some(
      i32::try_from(invoice.total).map_err(|_| RuntimeError::invalid_input("Stripe invoice amount is out of range"))?,
    ),
    currency: Some(invoice.currency.clone()),
    occurred_at: Some(invoice_occurred_at(invoice, status, observed_at)?),
    metadata,
  })
}

pub(super) fn push_stripe_refund(
  snapshot: &mut PaymentSnapshot,
  refund: StripeRefund,
  observed_at: chrono::DateTime<Utc>,
) -> RuntimeResult<()> {
  let invoice = snapshot
    .invoices
    .first()
    .ok_or_else(|| RuntimeError::invalid_state("Stripe refund has no canonical invoice"))?;
  let amount =
    i32::try_from(refund.amount).map_err(|_| RuntimeError::invalid_input("Stripe refund amount is out of range"))?;
  snapshot.financial_facts.push(FinancialSnapshot {
    observed_at,
    fact: FinancialFact {
      invoice: None,
      kind: FinancialKind::Refund,
      status: refund_status(refund.status.as_deref())?,
    },
    external_id: refund.id,
    source_id: snapshot.subscriptions.first().map(|source| source.source_id.clone()),
    external_invoice_id: Some(invoice.external_id.clone()),
    external_payment_id: refund.payment_intent.map(|payment| payment.id().to_string()),
    amount: Some(amount),
    currency: Some(refund.currency),
    occurred_at: Some(timestamp(refund.created, "Stripe refund")?),
    metadata: json!({ "created": refund.created, "providerMetadata": refund.metadata }),
  });
  Ok(())
}

pub(super) fn push_stripe_dispute(
  snapshot: &mut PaymentSnapshot,
  dispute: StripeDispute,
  observed_at: chrono::DateTime<Utc>,
) -> RuntimeResult<()> {
  let invoice = snapshot
    .invoices
    .first()
    .ok_or_else(|| RuntimeError::invalid_state("Stripe dispute has no canonical invoice"))?;
  let amount =
    i32::try_from(dispute.amount).map_err(|_| RuntimeError::invalid_input("Stripe dispute amount is out of range"))?;
  snapshot.financial_facts.push(FinancialSnapshot {
    observed_at,
    fact: FinancialFact {
      invoice: None,
      kind: FinancialKind::Dispute,
      status: dispute_status(&dispute)?,
    },
    external_id: dispute.id,
    source_id: snapshot.subscriptions.first().map(|source| source.source_id.clone()),
    external_invoice_id: Some(invoice.external_id.clone()),
    external_payment_id: dispute.payment_intent.map(|payment| payment.id().to_string()),
    amount: Some(amount),
    currency: Some(dispute.currency),
    occurred_at: Some(timestamp(dispute.created, "Stripe dispute")?),
    metadata: serde_json::Value::Object(dispute.metadata),
  });
  Ok(())
}

async fn lifetime_invoice_snapshot(
  pool: &sqlx::PgPool,
  client: &StripeClient,
  invoice: &StripeInvoice,
  namespace_key: &str,
  customer_id: &str,
  event_ids: Vec<String>,
  status: FinancialStatus,
) -> RuntimeResult<PaymentSnapshot> {
  if invoice.lines.has_more {
    return Err(RuntimeError::invalid_state("Stripe invoice lines are incomplete"));
  }
  let mut mappings = invoice
    .lines
    .data
    .iter()
    .filter_map(|line| line.price.as_ref())
    .map(|price| {
      super::snapshot::parse_lookup_key(
        price
          .lookup_key
          .as_deref()
          .ok_or_else(|| RuntimeError::invalid_input("Stripe invoice price has no lookup key"))?,
      )
      .map(|mapping| (price, mapping))
    })
    .collect::<RuntimeResult<Vec<_>>>()?;
  mappings.dedup_by(|left, right| left.0.id == right.0.id);
  let [(price, (plan, SubscriptionRecurring::Lifetime, variant))] = mappings.as_slice() else {
    return Err(RuntimeError::invalid_input(
      "Stripe invoice is not a canonical lifetime purchase",
    ));
  };
  if !matches!(plan, Plan::Pro | Plan::Ai) {
    return Err(RuntimeError::invalid_input("unsupported Stripe lifetime plan"));
  }
  let user_id = customer_user(pool, namespace_key, customer_id).await?;
  let source_id = format!("stripe_invoice:{}", invoice.id);
  let exists: bool = sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM provider_subscriptions WHERE provider_namespace=$1 AND source_identity=$2)",
  )
  .bind(namespace_key)
  .bind(&source_id)
  .fetch_one(pool)
  .await
  .map_err(|error| RuntimeError::database("load Stripe lifetime source", error))?;
  let active = status == FinancialStatus::Paid || exists;
  let period_start = timestamp(invoice.created, "Stripe lifetime purchase")?;
  let subscriptions = active
    .then(|| SubscriptionSnapshot {
      source_id: source_id.clone(),
      target_type: "user".to_string(),
      target_id: user_id.clone(),
      plan: *plan,
      recurring: SubscriptionRecurring::Lifetime,
      lifecycle: ProviderLifecycle::Active,
      gives_access: None,
      will_renew: Some(false),
      quantity: Some(1.0),
      external_customer_id: Some(customer_id.to_string()),
      external_subscription_id: Some(source_id),
      external_product_id: Some(price.product.id().to_string()),
      external_price_id: Some(price.id.clone()),
      iap_store: None,
      external_ref: Some(invoice.id.clone()),
      currency: Some(price.currency.clone()),
      amount: price.unit_amount.and_then(|amount| i32::try_from(amount).ok()),
      period_start: Some(period_start),
      period_end: None,
      trial_start: None,
      trial_end: None,
      canceled_at: None,
      metadata: json!({
        "variant": variant,
        "stripeScheduleId": null,
        "nextBillAt": null,
        "lifetimeInvoiceId": invoice.id,
      }),
    })
    .into_iter()
    .collect();
  Ok(PaymentSnapshot {
    namespace: client.namespace().clone(),
    coverage: SnapshotCoverage::Single,
    customer_id: Some(customer_id.to_string()),
    customers: vec![CustomerSnapshot {
      user_id,
      external_customer_id: customer_id.to_string(),
    }],
    subscriptions,
    ownership_transfers: Vec::new(),
    financial_facts: Vec::new(),
    trials: Vec::new(),
    invoices: Vec::new(),
    licenses: Vec::new(),
    mails: Vec::new(),
    captured_event_ids: event_ids,
    operation: None,
  })
}

async fn customer_user(pool: &sqlx::PgPool, namespace: &str, customer_id: &str) -> RuntimeResult<String> {
  let row = sqlx::query("SELECT user_id,provider_namespace FROM user_stripe_customers WHERE stripe_customer_id=$1")
    .bind(customer_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| RuntimeError::database("load Stripe invoice customer", error))?
    .ok_or_else(|| RuntimeError::invalid_state("Stripe invoice customer has no canonical user mapping"))?;
  if row.get::<Option<String>, _>("provider_namespace").as_deref() != Some(namespace) {
    return Err(RuntimeError::invalid_state(
      "Stripe invoice customer belongs to another provider namespace",
    ));
  }
  Ok(row.get("user_id"))
}

fn invoice_status(status: Option<&str>) -> RuntimeResult<FinancialStatus> {
  match status.unwrap_or("void") {
    "draft" | "open" => Ok(FinancialStatus::Open),
    "paid" => Ok(FinancialStatus::Paid),
    "void" => Ok(FinancialStatus::Void),
    "uncollectible" => Ok(FinancialStatus::Uncollectible),
    _ => Err(RuntimeError::invalid_input("unknown Stripe invoice status")),
  }
}

fn refund_status(status: Option<&str>) -> RuntimeResult<FinancialStatus> {
  match status.unwrap_or("pending") {
    "pending" | "requires_action" => Ok(FinancialStatus::Pending),
    "succeeded" => Ok(FinancialStatus::Succeeded),
    "failed" | "canceled" => Ok(FinancialStatus::Failed),
    _ => Err(RuntimeError::invalid_input("unknown Stripe refund status")),
  }
}

fn dispute_status(dispute: &StripeDispute) -> RuntimeResult<FinancialStatus> {
  match dispute.status.as_str() {
    "warning_needs_response" | "warning_under_review" | "needs_response" | "under_review" => Ok(FinancialStatus::Open),
    "won" | "warning_closed" => Ok(FinancialStatus::Won),
    "prevented"
      if dispute
        .payment_method_details
        .pointer("/card/case_type")
        .and_then(serde_json::Value::as_str)
        == Some("block") =>
    {
      Ok(FinancialStatus::Won)
    }
    "lost" => Ok(FinancialStatus::Lost),
    _ => Err(RuntimeError::invalid_input("unknown Stripe dispute status")),
  }
}

fn invoice_occurred_at(
  invoice: &StripeInvoice,
  status: FinancialStatus,
  observed_at: chrono::DateTime<Utc>,
) -> RuntimeResult<chrono::DateTime<Utc>> {
  let transition_at = match status {
    FinancialStatus::Paid => invoice.status_transitions.paid_at,
    FinancialStatus::Void => invoice.status_transitions.voided_at,
    FinancialStatus::Uncollectible => invoice.status_transitions.marked_uncollectible_at,
    _ => invoice.status_transitions.finalized_at,
  };
  transition_at
    .map(|value| timestamp(value, "Stripe invoice transition"))
    .transpose()
    .map(|value| value.unwrap_or(observed_at))
}

fn timestamp(value: i64, label: &str) -> RuntimeResult<chrono::DateTime<Utc>> {
  Utc
    .timestamp_opt(value, 0)
    .single()
    .ok_or_else(|| RuntimeError::invalid_input(format!("invalid {label}")))
}

fn provider_runtime_error(error: super::PaymentProviderError) -> RuntimeError {
  RuntimeError::invalid_state(error.code)
}
