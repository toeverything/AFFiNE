use std::collections::{BTreeMap, BTreeSet};

use affine_core::payment::{Provider, SubscriptionRecurring, UserPlanFamily};
use chrono::Utc;
use serde_json::{Value, json};

use super::{
  Case, CaseAttempt, PaymentConnection, PaymentRuntime, PaymentSnapshot, RuntimeError, RuntimeResult, StripeClient,
  StripeDispute, StripeInvoice, StripeRefund, parse_lookup_key, provider_error, push_stripe_invoice,
  push_stripe_invoice_record, stripe_checkout_termination, stripe_dispute_fact, stripe_invoice_snapshot,
  stripe_refund_fact, stripe_subscription_snapshot_from_observation,
};

pub(super) async fn observe_stripe(
  runtime: &PaymentRuntime,
  client: &StripeClient,
  namespace: &str,
  customer_id: &str,
  case: &Case,
  family: UserPlanFamily,
) -> RuntimeResult<(Vec<PaymentSnapshot>, BTreeMap<String, StripeInvoice>)> {
  let mut snapshots = BTreeMap::new();
  let subscriptions = client
    .customer_subscriptions(customer_id)
    .await
    .map_err(provider_error)?;
  let observed_at = Utc::now();
  let invoices: Vec<StripeInvoice> = client
    .list_all(
      "v1/invoices",
      &[
        ("customer", customer_id),
        ("expand[]", "data.lines.data.price"),
        ("expand[]", "data.total_discount_amounts.discount"),
      ],
    )
    .await
    .map_err(provider_error)?;
  let mut invoices_by_id = BTreeMap::new();
  for invoice in invoices {
    if invoice.customer.id() != customer_id {
      return Err(RuntimeError::invalid_state("Stripe customer invoice ownership changed"));
    }
    if invoices_by_id.insert(invoice.id.clone(), invoice).is_some() {
      return Err(RuntimeError::invalid_state("duplicate Stripe invoice observation"));
    }
  }
  let mut observed_invoices = BTreeSet::new();
  for subscription in subscriptions {
    if subscription.customer.id() != customer_id {
      return Err(RuntimeError::invalid_state(
        "Stripe customer subscription ownership changed",
      ));
    }
    let Some(lookup_key) = subscription
      .items
      .data
      .first()
      .and_then(|item| item.price.lookup_key.as_deref())
    else {
      return Err(RuntimeError::invalid_state(
        "Stripe subscription price has no lookup key",
      ));
    };
    if UserPlanFamily::from_plan(parse_lookup_key(lookup_key)?.0) != Some(family) {
      continue;
    }
    let id = subscription.id.clone();
    let latest_invoice = subscription
      .latest_invoice
      .as_ref()
      .and_then(|latest| invoices_by_id.get(latest.id()));
    let mut snapshot = stripe_subscription_snapshot_from_observation(
      &runtime.pool,
      client,
      subscription,
      Vec::new(),
      None,
      latest_invoice.map(|invoice| (invoice, observed_at)),
    )
    .await?;
    if let Some(invoice) = latest_invoice {
      let amount = snapshot.financial_facts[0]
        .amount
        .expect("Stripe invoice fact always has an amount");
      push_stripe_invoice_record(&mut snapshot, invoice, case.user_id.clone(), amount);
      observe_payment(client, &mut snapshot, invoice).await?;
      observed_invoices.insert(invoice.id.clone());
    }
    if snapshots.insert(id, snapshot).is_some() {
      return Err(RuntimeError::invalid_state("duplicate Stripe subscription observation"));
    }
  }

  for invoice in invoices_by_id.values() {
    if observed_invoices.contains(&invoice.id) {
      continue;
    }
    if let Some(subscription_id) = invoice.subscription_id() {
      if let Some(snapshot) = snapshots.get_mut(subscription_id) {
        push_stripe_invoice(snapshot, invoice, case.user_id.clone(), observed_at)?;
        observe_payment(client, snapshot, invoice).await?;
        observed_invoices.insert(invoice.id.clone());
      }
    } else if lifetime_invoice_for_family(invoice, family, case)? {
      let mut snapshot =
        stripe_invoice_snapshot(&runtime.pool, client, invoice.clone(), Vec::new(), observed_at).await?;
      observe_payment(client, &mut snapshot, invoice).await?;
      observed_invoices.insert(invoice.id.clone());
      snapshots.insert(format!("stripe_invoice:{}", invoice.id), snapshot);
    }
  }

  let stored = case
    .sources
    .iter()
    .filter(|source| source.provider_namespace.as_deref() == Some(namespace));
  for source in stored {
    if source
      .source_identity
      .as_deref()
      .is_none_or(|id| !snapshots.contains_key(id))
    {
      return Err(RuntimeError::invalid_state(
        "Stripe source absent from provider observations",
      ));
    }
  }

  let mut observations = BTreeSet::new();
  for snapshot in snapshots.values() {
    if snapshot.subscriptions.iter().any(|source| {
      source.target_type != "user"
        || source.target_id != case.user_id
        || UserPlanFamily::from_plan(source.plan) != Some(family)
    }) {
      return Err(RuntimeError::invalid_state(
        "Stripe source outside reconciliation family",
      ));
    }
    for fact in &snapshot.financial_facts {
      if fact
        .external_invoice_id
        .as_ref()
        .is_some_and(|id| !observed_invoices.contains(id))
        || !observations.insert((
          fact.source_id.as_deref(),
          fact.fact.kind.as_str(),
          fact.external_id.as_str(),
        ))
      {
        return Err(RuntimeError::invalid_state(
          "Stripe financial observations are incomplete or ambiguous",
        ));
      }
    }
  }
  let incomplete = case.sources.iter().any(|source| {
    source.provider_namespace.as_deref() == Some(namespace)
      && source
        .financial_facts
        .iter()
        .any(|fact| !observations.contains(&(source.source_identity.as_deref(), fact.kind.as_str(), fact.id.as_str())))
  });
  if incomplete {
    return Err(RuntimeError::invalid_state(
      "Stripe financial fact absent from provider observations",
    ));
  }
  Ok((snapshots.into_values().collect(), invoices_by_id))
}

fn lifetime_invoice_for_family(invoice: &StripeInvoice, family: UserPlanFamily, case: &Case) -> RuntimeResult<bool> {
  if case
    .sources
    .iter()
    .any(|source| source.source_identity.as_deref() == Some(format!("stripe_invoice:{}", invoice.id).as_str()))
  {
    return Ok(true);
  }
  if invoice.status.as_deref() != Some("paid") {
    return Ok(false);
  }
  if invoice.lines.has_more {
    return Err(RuntimeError::invalid_state(
      "Stripe one-time invoice lines are incomplete",
    ));
  }
  Ok(
    invoice
      .lines
      .data
      .iter()
      .filter_map(|line| line.price.as_ref()?.lookup_key.as_deref())
      .any(|key| {
        parse_lookup_key(key).is_ok_and(|(plan, recurring, _)| {
          recurring == SubscriptionRecurring::Lifetime && UserPlanFamily::from_plan(plan) == Some(family)
        })
      }),
  )
}

async fn observe_payment(
  client: &StripeClient,
  snapshot: &mut PaymentSnapshot,
  invoice: &StripeInvoice,
) -> RuntimeResult<()> {
  let filter = if let Some(intent) = invoice.payment_intent.as_ref() {
    ("payment_intent", intent.id())
  } else if let Some(charge) = invoice.charge.as_ref() {
    ("charge", charge.id())
  } else {
    return Ok(());
  };
  let observed_at = Utc::now();
  let filters = [filter];
  let (refunds, disputes) = tokio::try_join!(
    client.list_all::<StripeRefund>("v1/refunds", &filters),
    client.list_all::<StripeDispute>("v1/disputes", &filters),
  )
  .map_err(provider_error)?;
  let source = snapshot.subscriptions.first();
  for refund in refunds {
    let matches = match filter.0 {
      "payment_intent" => refund.payment_intent.as_ref(),
      _ => refund.charge.as_ref(),
    };
    if matches.is_none_or(|value| value.id() != filter.1) {
      return Err(RuntimeError::invalid_state(
        "Stripe refund does not match invoice payment",
      ));
    }
    snapshot
      .financial_facts
      .push(stripe_refund_fact(refund, &invoice.id, source, observed_at)?);
  }
  for dispute in disputes {
    let matches = match filter.0 {
      "payment_intent" => dispute.payment_intent.as_ref(),
      _ => Some(&dispute.charge),
    };
    if matches.is_none_or(|value| value.id() != filter.1) {
      return Err(RuntimeError::invalid_state(
        "Stripe dispute does not match invoice payment",
      ));
    }
    snapshot
      .financial_facts
      .push(stripe_dispute_fact(dispute, &invoice.id, source, observed_at)?);
  }
  Ok(())
}

pub(super) async fn observe_checkout(
  connection: &mut PaymentConnection,
  client: &StripeClient,
  attempt: &CaseAttempt,
  customer_id: Option<&str>,
  snapshots: &[PaymentSnapshot],
  invoices: &BTreeMap<String, StripeInvoice>,
) -> RuntimeResult<(Option<&'static str>, Value)> {
  let Some(session_id) = attempt.session_id.as_deref() else {
    return Ok((None, Value::Null));
  };
  let session = client.checkout_session(session_id).await.map_err(provider_error)?;
  if session.id != session_id
    || session
      .customer
      .as_ref()
      .is_some_and(|customer| Some(customer.id()) != customer_id)
  {
    return Err(RuntimeError::invalid_state("Stripe checkout session ownership changed"));
  }
  let source_id = session
    .subscription
    .as_ref()
    .map(|source| source.id().to_string())
    .or_else(|| {
      session
        .invoice
        .as_ref()
        .map(|invoice| format!("stripe_invoice:{}", invoice.id()))
    });
  let invoice_observation = session.invoice.as_ref().and_then(|invoice| invoices.get(invoice.id()));
  let terminal = stripe_checkout_termination(
    connection.connection(),
    client,
    &attempt.provider_namespace,
    &session,
    invoice_observation,
  )
  .await?;
  let verified = session.status.as_deref() == Some("complete")
    && matches!(session.payment_status.as_deref(), Some("paid" | "no_payment_required"))
    && snapshots
      .iter()
      .filter(|snapshot| snapshot.provider() == Provider::Stripe)
      .any(|snapshot| {
        snapshot
          .subscriptions
          .iter()
          .any(|source| Some(&source.source_id) == source_id.as_ref())
      });
  let (reason, evidence_id) = match terminal {
    Some((reason, id)) => (Some(reason), Some(id)),
    None => (verified.then_some("verified_checkout"), None),
  };
  Ok((
    reason,
    json!({
      "sessionId": session_id, "status": session.status, "paymentStatus": session.payment_status,
      "sourceIdentity": source_id, "terminalEvidenceId": evidence_id
    }),
  ))
}
