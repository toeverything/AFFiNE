use std::collections::BTreeSet;

use affine_core::payment::{
  FinancialRestriction, PaymentRuleError, Provider, ProviderSubscriptionFacts, SubscriptionRecurring,
  normalize_provider_subscription, trial_eligible,
};

use super::{
  super::{
    RuntimeError, RuntimeResult,
    entitlement::{RuntimeEntitlementTarget, apply_transitions, load_decision_time, lock_targets, transition_before},
  },
  PaymentConnection, PaymentScope, PaymentSnapshot, ReceiptDisposition, SnapshotCoverage, adopt_legacy_entitlement,
  complete_receipts_and_operation, discover_payment_scopes, entitlement_subject, expire_missing_sources,
  load_financial_restrictions, lock_receipts_and_operation, lock_subscription_rows, required_scope_expansion,
  reserve_snapshot_mails, reserve_workspace_upgrade_mails, upsert_customers, upsert_financial_facts, upsert_invoices,
  upsert_licenses, upsert_subscription, upsert_trials,
};
use crate::runtime::Deployment;

#[derive(Debug, Default)]
pub(super) struct PaymentApplyResult {
  pub targets: Vec<RuntimeEntitlementTarget>,
  pub owner_ids: Vec<String>,
}

impl PaymentApplyResult {
  pub(super) fn extend(&mut self, mut other: Self) {
    self.targets.append(&mut other.targets);
    self.targets.sort();
    self.targets.dedup();
    self.owner_ids.append(&mut other.owner_ids);
    self.owner_ids.sort();
    self.owner_ids.dedup();
  }
}

#[derive(Debug, thiserror::Error)]
pub(super) enum PaymentApplyError {
  #[error("payment lock set expanded")]
  LockSetExpanded(Vec<PaymentScope>),
  #[error(transparent)]
  Runtime(#[from] RuntimeError),
}

pub(super) async fn apply_payment_snapshot(
  connection: &mut PaymentConnection,
  snapshot: PaymentSnapshot,
  deployment: Deployment,
  mail_hash_key: &[u8; 32],
) -> Result<PaymentApplyResult, PaymentApplyError> {
  validate_snapshot(&snapshot)?;
  let namespace = snapshot.namespace.canonical_key().map_err(payment_rule_error)?;
  let required = snapshot_scopes(&snapshot, &namespace)?;
  let expansion = required_scope_expansion(connection.scopes(), required);
  if !expansion.is_empty() {
    return Err(PaymentApplyError::LockSetExpanded(expansion));
  }
  let held_scopes = connection.scopes().to_vec();
  let discovered_scopes = discover_payment_scopes(connection, &snapshot, &namespace).await?;
  let expansion = required_scope_expansion(&held_scopes, discovered_scopes);
  if !expansion.is_empty() {
    return Err(PaymentApplyError::LockSetExpanded(expansion));
  }
  let mut tx = connection.begin().await?;
  let outcome = async {
    sqlx::query("SET LOCAL statement_timeout = '5s'")
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("set payment transaction timeout", error))?;

    if lock_receipts_and_operation(&mut tx, &snapshot, &namespace).await? == ReceiptDisposition::AlreadyProcessed {
      return Ok(PaymentApplyResult {
        targets: Vec::new(),
        owner_ids: Vec::new(),
      });
    }
    let stored = lock_subscription_rows(&mut tx, &snapshot, &namespace).await?;
    validate_ownership_transfers(&snapshot, &stored)?;
    let mut discovered_scopes = Vec::new();
    for row in &stored {
      discovered_scopes.push(PaymentScope::source(&row.namespace, &row.source_id)?);
      if let Some(customer) = row.customer_id.as_deref() {
        discovered_scopes.push(PaymentScope::customer(&row.namespace, customer)?);
      }
      if let Some(subscription) = snapshot.subscriptions.iter().find(|subscription| {
        subscription.source_id == row.source_id
          && subscription.plan != affine_core::access_control::Plan::SelfHostedTeam
      }) {
        discovered_scopes.push(PaymentScope::cloud_target(
          &row.target.target_type,
          &row.target.target_id,
          subscription.plan,
        )?);
      }
    }
    let expansion = required_scope_expansion(&held_scopes, discovered_scopes);
    if !expansion.is_empty() {
      return Err(PaymentApplyError::LockSetExpanded(expansion));
    }
    let mut targets = stored
      .iter()
      .filter(|row| row.target.target_type != "instance")
      .map(|row| row.target.clone())
      .collect::<Vec<_>>();
    targets.extend(
      snapshot
        .subscriptions
        .iter()
        .filter(|subscription| subscription.target_type != "instance")
        .map(|subscription| RuntimeEntitlementTarget {
          target_type: subscription.target_type.clone(),
          target_id: subscription.target_id.clone(),
        }),
    );
    targets.extend(snapshot.customers.iter().map(|customer| RuntimeEntitlementTarget {
      target_type: "user".to_string(),
      target_id: customer.user_id.clone(),
    }));
    targets.sort();
    targets.dedup();
    let owner_ids = lock_targets(&mut tx, &targets).await?;
    let now = load_decision_time(&mut tx, "payment decision clock").await?;
    let before = transition_before(&mut tx, &targets, deployment, now).await?;
    upsert_customers(&mut tx, &snapshot, &namespace).await?;
    for subscription in &snapshot.subscriptions {
      if subscription.plan == affine_core::access_control::Plan::SelfHostedTeam {
        let quantity = subscription
          .quantity
          .filter(|quantity| quantity.is_finite() && *quantity > 0.0 && quantity.fract() == 0.0)
          .and_then(|quantity| i32::try_from(quantity as i64).ok())
          .ok_or_else(|| RuntimeError::invalid_input("invalid self-hosted payment quantity"))?;
        upsert_subscription(&mut tx, &snapshot, &namespace, subscription, Some(quantity), now).await?;
        continue;
      }
      let normalized = normalize_provider_subscription(ProviderSubscriptionFacts {
        provider: snapshot.provider(),
        source_id: subscription.source_id.clone(),
        plan: subscription.plan,
        recurring: subscription.recurring,
        lifecycle: subscription.lifecycle,
        gives_access: subscription.gives_access,
        quantity: subscription.quantity,
        trial_end: subscription.trial_end,
        end: subscription.period_end,
        will_renew: subscription.will_renew,
      })
      .map_err(payment_rule_error)?;
      upsert_subscription(
        &mut tx,
        &snapshot,
        &namespace,
        subscription,
        normalized.access.quantity,
        now,
      )
      .await?;
      let entitlement_subject = entitlement_subject(&namespace, &subscription.source_id);
      let target = RuntimeEntitlementTarget {
        target_type: subscription.target_type.clone(),
        target_id: subscription.target_id.clone(),
      };
      adopt_legacy_entitlement(
        &mut tx,
        &subscription.source_id,
        &entitlement_subject,
        &namespace,
        &target,
        now,
      )
      .await?;
    }

    expire_missing_sources(&mut tx, &snapshot, &namespace, &stored, now).await?;
    upsert_trials(&mut tx, &snapshot, &namespace, now).await?;
    upsert_invoices(&mut tx, &snapshot, &namespace, now).await?;
    upsert_licenses(&mut tx, &snapshot, now).await?;
    load_financial_restrictions(&mut tx, &snapshot, &namespace).await?;
    upsert_financial_facts(&mut tx, &snapshot, &namespace, now).await?;
    super::reconcile_cloud_winners(&mut tx, &targets, now).await?;
    apply_transitions(&mut tx, &before, deployment, now).await?;
    reserve_workspace_upgrade_mails(&mut tx, &before, deployment, mail_hash_key, now).await?;
    reserve_snapshot_mails(&mut tx, &snapshot, mail_hash_key, now).await?;
    complete_receipts_and_operation(&mut tx, &snapshot, &namespace, now).await?;
    Ok(PaymentApplyResult { targets, owner_ids })
  }
  .await;
  match outcome {
    Ok(result) => {
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit payment snapshot", error))?;
      Ok(result)
    }
    Err(error) => {
      tx.rollback()
        .await
        .map_err(|rollback| RuntimeError::database("rollback payment snapshot", rollback))?;
      Err(error)
    }
  }
}

fn validate_snapshot(snapshot: &PaymentSnapshot) -> RuntimeResult<()> {
  if snapshot.coverage == SnapshotCoverage::Incomplete {
    return Err(RuntimeError::invalid_input("incomplete payment snapshot"));
  }
  if matches!(snapshot.coverage, SnapshotCoverage::Complete { .. }) && snapshot.customer_id.is_none() {
    return Err(RuntimeError::invalid_input(
      "complete payment snapshot requires customer identity",
    ));
  }
  let mut source_ids = BTreeSet::new();
  let mut external_subscription_ids = BTreeSet::new();
  for subscription in &snapshot.subscriptions {
    if !is_canonical_identity(&subscription.source_id) || !is_canonical_identity(&subscription.target_id) {
      return Err(RuntimeError::invalid_input("invalid payment subscription identity"));
    }
    let expected_target = match subscription.plan {
      affine_core::access_control::Plan::Team => "workspace",
      affine_core::access_control::Plan::SelfHostedTeam => "instance",
      _ => "user",
    };
    if subscription.target_type != expected_target {
      return Err(RuntimeError::invalid_input(
        "payment subscription target does not match plan",
      ));
    }
    if subscription.external_customer_id != snapshot.customer_id {
      return Err(RuntimeError::invalid_input(
        "payment subscription customer does not match snapshot",
      ));
    }
    if [
      subscription.external_customer_id.as_deref(),
      subscription.external_subscription_id.as_deref(),
      subscription.external_product_id.as_deref(),
      subscription.external_price_id.as_deref(),
      subscription.external_ref.as_deref(),
    ]
    .into_iter()
    .flatten()
    .any(|identity| !is_canonical_identity(identity))
    {
      return Err(RuntimeError::invalid_input(
        "non-canonical payment subscription identity",
      ));
    }
    if !source_ids.insert(subscription.source_id.as_str())
      || subscription
        .external_subscription_id
        .as_deref()
        .is_some_and(|external_id| !external_subscription_ids.insert(external_id))
    {
      return Err(RuntimeError::invalid_input("duplicate payment subscription identity"));
    }
    match snapshot.provider() {
      Provider::Stripe
        if subscription.plan == affine_core::access_control::Plan::SelfHostedTeam
          && (!matches!(
            subscription.recurring,
            SubscriptionRecurring::Monthly | SubscriptionRecurring::Yearly
          ) || !snapshot
            .licenses
            .iter()
            .any(|license| license.key == subscription.target_id)) =>
      {
        return Err(RuntimeError::invalid_input("invalid self-hosted payment subscription"));
      }
      Provider::Stripe if subscription.external_subscription_id.is_none() => {
        return Err(RuntimeError::invalid_input("Stripe subscription identity is required"));
      }
      Provider::RevenueCat
        if subscription.iap_store.is_none()
          || subscription.external_ref.is_none()
          || subscription.external_product_id.is_none()
          || subscription.external_customer_id.is_none()
          || subscription.external_ref.as_deref() == Some(subscription.source_id.as_str()) =>
      {
        return Err(RuntimeError::invalid_input(
          "RevenueCat subscription and store identities must be distinct",
        ));
      }
      _ => {}
    }
  }
  if snapshot
    .customer_id
    .as_deref()
    .is_some_and(|identity| !is_canonical_identity(identity))
  {
    return Err(RuntimeError::invalid_input("non-canonical payment customer identity"));
  }
  if snapshot.customers.iter().any(|customer| {
    customer.user_id.trim().is_empty()
      || customer.external_customer_id.trim().is_empty()
      || snapshot.customer_id.as_deref() != Some(customer.external_customer_id.as_str())
  }) {
    return Err(RuntimeError::invalid_input("invalid payment customer mapping"));
  }
  for trial in &snapshot.trials {
    if trial.target_type != "user" || trial.target_id.trim().is_empty() || !trial_eligible(trial.plan, false) {
      return Err(RuntimeError::invalid_input("invalid payment trial fact"));
    }
  }
  let captured_events = snapshot
    .captured_event_ids
    .iter()
    .map(|event_id| event_id.trim())
    .collect::<BTreeSet<_>>();
  if captured_events.len() != snapshot.captured_event_ids.len() || captured_events.contains("") {
    return Err(RuntimeError::invalid_input("invalid payment receipt identity"));
  }
  if snapshot
    .operation
    .as_ref()
    .is_some_and(|operation| operation.operation_id.trim().is_empty())
  {
    return Err(RuntimeError::invalid_input("invalid payment operation completion"));
  }
  Ok(())
}

fn validate_ownership_transfers(snapshot: &PaymentSnapshot, stored: &[super::StoredSubscription]) -> RuntimeResult<()> {
  let mut required = BTreeSet::new();
  for subscription in &snapshot.subscriptions {
    let Some(previous) = stored.iter().find(|stored| stored.source_id == subscription.source_id) else {
      continue;
    };
    if previous.target.target_type == subscription.target_type && previous.target.target_id == subscription.target_id {
      continue;
    }
    required.insert((
      subscription.source_id.as_str(),
      snapshot.customer_id.as_deref().unwrap_or_default(),
      previous.target.target_type.as_str(),
      previous.target.target_id.as_str(),
      subscription.target_type.as_str(),
      subscription.target_id.as_str(),
    ));
  }
  let supplied = snapshot
    .ownership_transfers
    .iter()
    .map(|proof| {
      (
        proof.source_id.as_str(),
        proof.customer_id.as_str(),
        proof.old_target_type.as_str(),
        proof.old_target_id.as_str(),
        proof.new_target_type.as_str(),
        proof.new_target_id.as_str(),
      )
    })
    .collect::<BTreeSet<_>>();
  if supplied.len() != snapshot.ownership_transfers.len()
    || (!supplied.is_empty() && snapshot.provider() != Provider::RevenueCat)
    || supplied != required
  {
    return Err(RuntimeError::invalid_input(
      "payment ownership transfer evidence does not match",
    ));
  }
  Ok(())
}

fn is_canonical_identity(identity: &str) -> bool {
  !identity.is_empty() && identity == identity.trim()
}

pub(super) fn snapshot_scopes(snapshot: &PaymentSnapshot, namespace: &str) -> RuntimeResult<Vec<PaymentScope>> {
  let mut scopes = Vec::new();
  if let Some(customer_id) = snapshot.customer_id.as_deref() {
    scopes.push(PaymentScope::customer(namespace, customer_id)?);
  }
  for customer in &snapshot.customers {
    scopes.push(PaymentScope::billing_target(namespace, "user", &customer.user_id)?);
  }
  for subscription in &snapshot.subscriptions {
    scopes.push(PaymentScope::source(namespace, &subscription.source_id)?);
    if subscription.plan == affine_core::access_control::Plan::SelfHostedTeam {
      scopes.push(PaymentScope::billing_target(
        namespace,
        &subscription.target_type,
        &subscription.target_id,
      )?);
    } else {
      scopes.push(PaymentScope::cloud_target(
        &subscription.target_type,
        &subscription.target_id,
        subscription.plan,
      )?);
    }
  }
  for fact in &snapshot.financial_facts {
    if let Some(source_id) = fact.source_id.as_deref() {
      scopes.push(PaymentScope::source(namespace, source_id)?);
    }
  }
  for trial in &snapshot.trials {
    if snapshot.customer_id.is_none() && snapshot.subscriptions.is_empty() && snapshot.financial_facts.is_empty() {
      scopes.push(PaymentScope::billing_target(
        namespace,
        &trial.target_type,
        &trial.target_id,
      )?);
    }
    scopes.push(PaymentScope::cloud_target(
      &trial.target_type,
      &trial.target_id,
      trial.plan,
    )?);
  }
  for event_id in &snapshot.captured_event_ids {
    scopes.push(PaymentScope::receipt(namespace, event_id)?);
  }
  Ok(scopes)
}

fn payment_rule_error(error: PaymentRuleError) -> RuntimeError {
  RuntimeError::invalid_input(format!("invalid payment provider facts: {error:?}"))
}

pub(super) fn restriction_name(restriction: FinancialRestriction) -> &'static str {
  match restriction {
    FinancialRestriction::None => "none",
    FinancialRestriction::Suspend => "suspend",
    FinancialRestriction::Revoke => "revoke",
  }
}
