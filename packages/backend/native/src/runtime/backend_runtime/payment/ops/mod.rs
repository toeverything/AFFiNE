mod attempt;
mod read;
mod stripe;

use affine_core::{
  access_control::Plan,
  payment::{Provider, ProviderNamespace, UserPlanFamily},
};
use attempt::{finish_stripe_attempt, observe_app_store_attempt};
use read::{Case, CaseAttempt, load_cases};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{PgConnection, Postgres, Row, Transaction};
use stripe::{observe_checkout, observe_stripe};

use super::{
  AppStoreTransaction, BindingSettlement, PaymentApplyResult, PaymentConnection, PaymentProviderError, PaymentRuntime,
  PaymentScope, PaymentSnapshot, RevenueCatClient, RuntimeError, RuntimeResult, SnapshotCoverage, StripeClient,
  StripeDispute, StripeInvoice, StripeRefund,
  apply::{PaymentApplyError, apply_locked_snapshots, check_snapshot_scopes},
  load_stripe_customer, locate_app_store_transaction, required_scope_expansion,
  snapshot::parse_lookup_key,
  stripe_checkout_termination, stripe_invoice_snapshot,
  stripe_snapshot::{push_stripe_invoice, push_stripe_invoice_record, stripe_dispute_fact, stripe_refund_fact},
  stripe_subscription_snapshot_from_observation,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Reconciliation {
  actor_user_id: String,
  user_id: String,
  plan_family: String,
  request_id: String,
  evidence: String,
  attempt_id: Option<String>,
  transaction_id: Option<String>,
}

impl PaymentRuntime {
  pub(super) async fn inspect_payment_reconciliation(
    &self,
    user_id: Option<&str>,
    family: Option<&str>,
    provider_identity: Option<&str>,
  ) -> RuntimeResult<Value> {
    if user_id.is_none() && provider_identity.is_none() {
      return Err(RuntimeError::invalid_input(
        "payment reconciliation requires an account or provider identity",
      ));
    }
    for value in [user_id, provider_identity].into_iter().flatten() {
      super::validate_identity(value, "payment reconciliation identity")?;
    }
    if let Some(family) = family {
      parse_family(family)?;
    }
    Ok(json!({ "cases": load_cases(&self.pool, user_id, family, provider_identity, false, None).await? }))
  }

  pub(super) async fn reconcile_payment(
    &self,
    changes: &mut PaymentApplyResult,
    request: Reconciliation,
  ) -> RuntimeResult<Value> {
    let mut request = request;
    let (family, plan) = parse_family(&request.plan_family)?;
    request.evidence = request.evidence.trim().to_string();
    if request.evidence.is_empty() || request.evidence.chars().count() > 4000 {
      return Err(RuntimeError::invalid_input("invalid payment reconciliation evidence"));
    }
    for value in [
      Some(request.request_id.as_str()),
      Some(&request.user_id),
      Some(&request.actor_user_id),
      request.attempt_id.as_deref(),
      request.transaction_id.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
      super::validate_identity(value, "payment reconciliation identity")?;
    }
    if request.transaction_id.is_some() && request.attempt_id.is_none() {
      return Err(RuntimeError::invalid_input(
        "payment reconciliation transaction requires an attempt",
      ));
    }

    let family_scope = PaymentScope::cloud_target("user", &request.user_id, plan)?;
    let request_scope = PaymentScope::billing_target("payment:v1:cloud", "reconciliation", &request.request_id)?;
    let mut connection = PaymentConnection::try_acquire(&self.pool, vec![family_scope, request_scope])
      .await?
      .ok_or_else(payment_busy)?;

    for _ in 0..=4 {
      if let Some(value) = request.replay(connection.connection()).await? {
        return Ok(value);
      }
      let before = request.load_case(connection.connection()).await?;
      let attempt = request.attempt(&before)?;
      if let (Some(attempt), Some(transaction)) = (attempt, request.transaction_id.as_deref()) {
        if attempt.provider != "revenuecat" {
          return Err(RuntimeError::invalid_input(
            "Stripe reconciliation uses the recorded checkout session",
          ));
        }
        if attempt
          .transaction_id
          .as_deref()
          .is_some_and(|recorded| recorded != transaction)
        {
          return Err(RuntimeError::invalid_input(
            "App Store reconciliation transaction changed",
          ));
        }
      }
      if attempt.is_none() && !before.conflicted {
        return Err(RuntimeError::invalid_input(
          "no payment reconciliation case for this family",
        ));
      }
      let stripe_namespace = namespace(self.stripe.as_deref().map(StripeClient::namespace))?;
      let revenuecat_namespace = namespace(self.revenuecat.as_ref().map(|client| client.namespace()))?;
      let stripe_customer = if let Some(namespace) = stripe_namespace.as_deref() {
        load_stripe_customer(&self.pool, &request.user_id, namespace).await?
      } else {
        None
      };

      let mut required = Vec::new();
      for source in &before.sources {
        if let (Some(namespace), Some(source_id)) = (&source.provider_namespace, &source.source_identity) {
          required.push(PaymentScope::source(namespace, source_id)?);
          for fact in &source.financial_facts {
            required.push(PaymentScope::financial(namespace, &fact.kind, &fact.id)?);
          }
          if let Some(customer) = &source.external_customer_id {
            required.push(PaymentScope::customer(namespace, customer)?);
          }
        }
      }
      if let (Some(namespace), Some(customer)) = (&stripe_namespace, &stripe_customer) {
        required.push(PaymentScope::customer(namespace, customer)?);
      }
      if let Some(namespace) = &revenuecat_namespace {
        required.push(PaymentScope::customer(namespace, &request.user_id)?);
      }
      let expansion = required_scope_expansion(connection.scopes(), required);
      if !expansion.is_empty() {
        connection = connection
          .reacquire_with(&self.pool, expansion)
          .await?
          .ok_or_else(payment_busy)?;
        continue;
      }

      let all_providers_verified = !(before.conflicted
        && (stripe_namespace.is_none() || revenuecat_namespace.is_none()))
        && before.sources.iter().all(|source| {
          source.source_identity.is_some()
            && match Provider::parse(&source.provider) {
              Some(Provider::Stripe) => stripe_customer.is_some() && source.provider_namespace == stripe_namespace,
              Some(Provider::RevenueCat) => {
                self.revenuecat.is_some() && source.provider_namespace == revenuecat_namespace
              }
              None => false,
            }
        });
      let mut snapshots = Vec::new();
      let mut stripe_completion = None;
      let mut app_store_completion = None;
      let mut attempt_observation = Value::Null;
      if all_providers_verified {
        let stripe_invoices = if let (Some(client), Some(namespace), Some(customer)) = (
          self.stripe.as_ref(),
          stripe_namespace.as_deref(),
          stripe_customer.as_deref(),
        ) {
          let (stripe_snapshots, invoices) = observe_stripe(self, client, namespace, customer, &before, family).await?;
          snapshots.extend(stripe_snapshots);
          invoices
        } else {
          Default::default()
        };
        if let Some(attempt) = attempt.filter(|attempt| attempt.status == "waiting") {
          if attempt.provider == "stripe" && stripe_namespace.as_deref() == Some(&attempt.provider_namespace) {
            let client = self.stripe.as_ref().expect("configured Stripe namespace");
            let (result, observation) = observe_checkout(
              &mut connection,
              client,
              attempt,
              stripe_customer.as_deref(),
              &snapshots,
              &stripe_invoices,
            )
            .await?;
            stripe_completion = result.map(|reason| (attempt.id.as_str(), reason));
            attempt_observation = observation;
          } else if attempt.provider == "revenuecat"
            && revenuecat_namespace.as_deref() == Some(&attempt.provider_namespace)
            && let (Some(product_id), Some(transaction_id)) = (
              attempt.product_id.as_deref(),
              request.transaction_id.as_deref().or(attempt.transaction_id.as_deref()),
            )
          {
            let transaction = AppStoreTransaction {
              namespace: &attempt.provider_namespace,
              user_id: &request.user_id,
              product_id,
              transaction_id,
              family,
            };
            let client = self.revenuecat.as_ref().expect("configured RevenueCat namespace");
            let (source_id, observation) = observe_app_store_attempt(client, &transaction).await?;
            app_store_completion = source_id.map(|source_id| (attempt.id.as_str(), transaction, source_id));
            attempt_observation = observation;
          }
        }
        if self.revenuecat.is_some() {
          snapshots.push(self.observe_revenuecat_customer(&request.user_id).await?);
        }
      }

      let mut required = Vec::new();
      let mut prepared = Vec::with_capacity(snapshots.len());
      for snapshot in snapshots {
        let (namespace, expansion) = check_snapshot_scopes(&mut connection, &snapshot).await?;
        required.extend(expansion);
        for fact in &snapshot.financial_facts {
          required.push(PaymentScope::financial(
            &namespace,
            fact.fact.kind.as_str(),
            &fact.external_id,
          )?);
        }
        prepared.push((snapshot, namespace));
      }
      let expansion = required_scope_expansion(connection.scopes(), required);
      if !expansion.is_empty() {
        connection = connection
          .reacquire_with(&self.pool, expansion)
          .await?
          .ok_or_else(payment_busy)?;
        continue;
      }

      let scopes = connection.scopes().to_vec();
      let mut tx = connection.begin().await?;
      let settlement = all_providers_verified.then_some(BindingSettlement {
        user_id: &request.user_id,
        family: family.as_str(),
      });
      let applied = if all_providers_verified {
        match apply_locked_snapshots(
          &mut tx,
          &prepared,
          &scopes,
          self.deployment,
          &self.mail_hash_key,
          settlement.as_ref(),
        )
        .await
        {
          Ok(applied) => applied,
          Err(PaymentApplyError::Runtime(error)) => return Err(error),
          Err(PaymentApplyError::LockSetExpanded(expansion)) => {
            tx.rollback()
              .await
              .map_err(|error| RuntimeError::database("rollback payment reconciliation", error))?;
            connection = connection
              .reacquire_with(&self.pool, expansion)
              .await?
              .ok_or_else(payment_busy)?;
            continue;
          }
        }
      } else {
        PaymentApplyResult::default()
      };
      if let Some((attempt_id, reason)) = stripe_completion {
        finish_stripe_attempt(&mut tx, attempt_id, reason).await?;
      }
      if let Some((attempt_id, transaction, source_id)) = app_store_completion
        && let Some(source) = prepared
          .iter()
          .filter(|(_, namespace)| namespace == transaction.namespace)
          .find_map(|(snapshot, _)| transaction.source(snapshot, &source_id))
      {
        transaction
          .confirm_and_finish(&mut tx, source, Some(attempt_id))
          .await?;
      }
      let after = request.load_case(&mut tx).await?;
      let attempt_status = request.attempt(&after)?.map(|attempt| attempt.status.as_str());
      let reason = if !all_providers_verified {
        Some("provider_unverified")
      } else if after.conflicted {
        Some("multiple_sources")
      } else if attempt_status.is_some_and(|status| status != "completed") {
        Some("attempt_unverified")
      } else {
        None
      };
      let value = json!({
        "requestId": request.request_id, "userId": request.user_id, "planFamily": request.plan_family,
        "status": if reason.is_some() { "pending" } else { "resolved" }, "reason": reason,
        "conflicted": after.conflicted, "boundProviderNamespace": after.bound_provider_namespace,
        "boundSourceIdentity": after.bound_source_identity, "attemptId": request.attempt_id, "attemptStatus": attempt_status
      });
      let observations = prepared.iter().map(|(snapshot, namespace)| {
        json!({
          "providerNamespace": namespace, "customerId": snapshot.customer_id,
          "verifiedMissingSources": match &snapshot.coverage {
            SnapshotCoverage::Complete { verified_missing_revenuecat_sources } => Some(verified_missing_revenuecat_sources),
            _ => None
          },
          "sources": snapshot.subscriptions.iter().map(|source| json!({
            "sourceIdentity": source.source_id, "externalRef": source.external_ref, "plan": source.plan.as_str(),
            "status": source.lifecycle.as_str(), "givesAccess": source.gives_access, "willRenew": source.will_renew,
            "periodEnd": source.period_end
          })).collect::<Vec<_>>(),
          "financialFacts": snapshot.financial_facts.iter().map(|fact| json!({
            "kind": fact.fact.kind.as_str(), "id": fact.external_id, "invoiceId": fact.external_invoice_id,
            "status": fact.fact.status.as_str(), "observedAt": fact.observed_at
          })).collect::<Vec<_>>()
        })
      }).collect::<Vec<_>>();
      request
        .record(
          &mut tx,
          json!({
            "response": value, "before": before, "after": after,
            "providerObservations": observations, "attemptObservation": attempt_observation
          }),
        )
        .await?;
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("commit payment reconciliation", error))?;
      changes.extend(applied);
      return Ok(value);
    }
    Err(payment_busy())
  }
}

impl Reconciliation {
  async fn load_case(&self, connection: &mut PgConnection) -> RuntimeResult<Case> {
    load_cases(
      connection,
      Some(&self.user_id),
      Some(&self.plan_family),
      None,
      true,
      self.attempt_id.as_deref(),
    )
    .await?
    .pop()
    .ok_or_else(|| RuntimeError::invalid_input("payment reconciliation account not found"))
  }

  fn attempt<'a>(&self, case: &'a Case) -> RuntimeResult<Option<&'a CaseAttempt>> {
    self
      .attempt_id
      .as_deref()
      .map(|id| {
        case
          .attempts
          .iter()
          .find(|attempt| attempt.id == id)
          .ok_or_else(|| RuntimeError::invalid_input("payment attempt does not belong to reconciliation family"))
      })
      .transpose()
  }

  async fn replay(&self, connection: &mut PgConnection) -> RuntimeResult<Option<Value>> {
    let row = sqlx::query(
      "SELECT actor_user_id,user_id,plan_family,attempt_id,transaction_id,evidence,result
       FROM payment_reconciliations WHERE request_id=$1",
    )
    .bind(&self.request_id)
    .fetch_optional(connection)
    .await
    .map_err(|error| RuntimeError::database("read payment reconciliation replay", error))?;
    let Some(row) = row else { return Ok(None) };
    if row.get::<&str, _>("actor_user_id") != self.actor_user_id
      || row.get::<&str, _>("user_id") != self.user_id
      || row.get::<&str, _>("plan_family") != self.plan_family
      || row.get::<Option<&str>, _>("attempt_id") != self.attempt_id.as_deref()
      || row.get::<Option<&str>, _>("transaction_id") != self.transaction_id.as_deref()
      || row.get::<&str, _>("evidence") != self.evidence
    {
      return Err(RuntimeError::invalid_input(
        "payment reconciliation request payload changed",
      ));
    }
    let result: Value = row.get("result");
    Ok(Some(result["response"].clone()))
  }

  async fn record(&self, tx: &mut Transaction<'_, Postgres>, result: Value) -> RuntimeResult<()> {
    sqlx::query(
      "INSERT INTO \
       payment_reconciliations(request_id,actor_user_id,user_id,plan_family,attempt_id,transaction_id,evidence,result)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    )
    .bind(&self.request_id)
    .bind(&self.actor_user_id)
    .bind(&self.user_id)
    .bind(&self.plan_family)
    .bind(&self.attempt_id)
    .bind(&self.transaction_id)
    .bind(&self.evidence)
    .bind(result)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("record payment reconciliation", error))?;
    Ok(())
  }
}

fn parse_family(family: &str) -> RuntimeResult<(UserPlanFamily, Plan)> {
  match family {
    "pro" => Ok((UserPlanFamily::Pro, Plan::Pro)),
    "ai" => Ok((UserPlanFamily::Ai, Plan::Ai)),
    _ => Err(RuntimeError::invalid_input(
      "invalid payment reconciliation plan family",
    )),
  }
}

fn namespace(namespace: Option<&ProviderNamespace>) -> RuntimeResult<Option<String>> {
  namespace
    .map(|namespace| {
      namespace
        .canonical_key()
        .map_err(|_| RuntimeError::invalid_state("invalid payment provider namespace"))
    })
    .transpose()
}

fn provider_error(error: PaymentProviderError) -> RuntimeError {
  RuntimeError::invalid_state(error.code)
}

fn payment_busy() -> RuntimeError {
  RuntimeError::invalid_state("payment_busy")
}
