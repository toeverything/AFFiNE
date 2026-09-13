use std::collections::BTreeSet;

use affine_core::payment::Provider;
use sqlx::{Postgres, Row, Transaction};

use super::{
  super::{RuntimeError, RuntimeResult},
  PaymentSnapshot, SnapshotCoverage, StoredSubscription, SubscriptionSnapshot,
};

pub(super) async fn upsert_customers(
  tx: &mut Transaction<'_, Postgres>,
  snapshot: &PaymentSnapshot,
  namespace: &str,
) -> RuntimeResult<()> {
  for customer in &snapshot.customers {
    let conflicting_user: Option<String> = sqlx::query_scalar(
      "SELECT user_id FROM user_stripe_customers WHERE stripe_customer_id=$1 AND user_id<>$2 FOR UPDATE",
    )
    .bind(&customer.external_customer_id)
    .bind(&customer.user_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock Stripe customer identity", error))?;
    if conflicting_user.is_some() {
      return Err(RuntimeError::invalid_state(
        "Stripe customer identity belongs to another user",
      ));
    }
    let updated = sqlx::query(
      r#"INSERT INTO user_stripe_customers(user_id,stripe_customer_id,provider_namespace)
         VALUES($1,$2,$3)
         ON CONFLICT(user_id) DO UPDATE SET
           stripe_customer_id=EXCLUDED.stripe_customer_id,
           provider_namespace=EXCLUDED.provider_namespace
         WHERE user_stripe_customers.stripe_customer_id=EXCLUDED.stripe_customer_id
           AND (user_stripe_customers.provider_namespace IS NULL OR user_stripe_customers.provider_namespace=EXCLUDED.provider_namespace)"#,
    )
    .bind(&customer.user_id)
    .bind(&customer.external_customer_id)
    .bind(namespace)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("upsert Stripe customer identity", error))?;
    if updated.rows_affected() != 1 {
      return Err(RuntimeError::invalid_state("Stripe user customer mapping changed"));
    }
  }
  Ok(())
}

pub(super) async fn upsert_subscription(
  tx: &mut Transaction<'_, Postgres>,
  snapshot: &PaymentSnapshot,
  namespace: &str,
  subscription: &SubscriptionSnapshot,
  quantity: Option<i32>,
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<String> {
  let rows = sqlx::query(
    r#"SELECT id,provider_namespace FROM provider_subscriptions
       WHERE (provider_namespace=$1 AND source_identity=$2)
          OR (provider=$3::"Provider" AND $4::text IS NOT NULL AND external_subscription_id=$4)
          OR (provider='revenuecat' AND $5::text IS NOT NULL AND iap_store::text=$5
              AND external_ref=$6 AND external_product_id=$7 AND external_customer_id=$8)
       ORDER BY (provider_namespace=$1) DESC,id FOR UPDATE"#,
  )
  .bind(namespace)
  .bind(&subscription.source_id)
  .bind(snapshot.provider().as_str())
  .bind(&subscription.external_subscription_id)
  .bind(&subscription.iap_store)
  .bind(&subscription.external_ref)
  .bind(&subscription.external_product_id)
  .bind(&subscription.external_customer_id)
  .fetch_all(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("find canonical payment subscription", error))?;
  if rows.len() > 1
    || rows
      .first()
      .and_then(|row| row.get::<Option<String>, _>("provider_namespace"))
      .is_some_and(|stored| stored != namespace)
  {
    return Err(RuntimeError::invalid_state("conflicting payment source identity"));
  }
  let id = rows
    .first()
    .map(|row| row.get("id"))
    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
  sqlx::query(
    r#"INSERT INTO provider_subscriptions(
         id,provider,provider_namespace,source_identity,target_type,target_id,plan,recurring,status,
         external_customer_id,external_subscription_id,external_product_id,external_price_id,iap_store,
         external_ref,currency,amount,quantity,period_start,period_end,trial_start,trial_end,canceled_at,
         gives_access,will_renew,metadata,updated_at)
       VALUES($1,$2::"Provider",$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::"IapStore",$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
       ON CONFLICT(id) DO UPDATE SET provider=EXCLUDED.provider,provider_namespace=EXCLUDED.provider_namespace,
         source_identity=EXCLUDED.source_identity,target_type=EXCLUDED.target_type,target_id=EXCLUDED.target_id,
         plan=EXCLUDED.plan,recurring=EXCLUDED.recurring,status=EXCLUDED.status,
         external_customer_id=EXCLUDED.external_customer_id,external_subscription_id=EXCLUDED.external_subscription_id,
         external_product_id=EXCLUDED.external_product_id,external_price_id=EXCLUDED.external_price_id,
         iap_store=EXCLUDED.iap_store,external_ref=EXCLUDED.external_ref,currency=EXCLUDED.currency,
         amount=EXCLUDED.amount,quantity=EXCLUDED.quantity,period_start=EXCLUDED.period_start,
         period_end=EXCLUDED.period_end,trial_start=EXCLUDED.trial_start,trial_end=EXCLUDED.trial_end,
         canceled_at=EXCLUDED.canceled_at,gives_access=EXCLUDED.gives_access,will_renew=EXCLUDED.will_renew,
         metadata=EXCLUDED.metadata,updated_at=EXCLUDED.updated_at"#,
  )
  .bind(&id)
  .bind(snapshot.provider().as_str())
  .bind(namespace)
  .bind(&subscription.source_id)
  .bind(&subscription.target_type)
  .bind(&subscription.target_id)
  .bind(subscription.plan.as_str())
  .bind(subscription.recurring.as_str())
  .bind(subscription.lifecycle.as_str())
  .bind(&subscription.external_customer_id)
  .bind(&subscription.external_subscription_id)
  .bind(&subscription.external_product_id)
  .bind(&subscription.external_price_id)
  .bind(&subscription.iap_store)
  .bind(&subscription.external_ref)
  .bind(&subscription.currency)
  .bind(subscription.amount)
  .bind(quantity)
  .bind(subscription.period_start)
  .bind(subscription.period_end)
  .bind(subscription.trial_start)
  .bind(subscription.trial_end)
  .bind(subscription.canceled_at)
  .bind(subscription.gives_access)
  .bind(subscription.will_renew)
  .bind(&subscription.metadata)
  .bind(now)
  .execute(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("upsert canonical payment subscription", error))?;
  Ok(id)
}

pub(super) async fn adopt_legacy_entitlement(
  tx: &mut Transaction<'_, Postgres>,
  legacy_subject: &str,
  canonical_subject: &str,
  namespace: &str,
  target: &super::super::entitlement::RuntimeEntitlementTarget,
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<()> {
  let rows = sqlx::query(
    "SELECT id,subject_id,target_type,target_id,metadata FROM entitlements WHERE source='cloud_subscription' AND \
     subject_id=ANY($1) ORDER BY id FOR UPDATE",
  )
  .bind([legacy_subject, canonical_subject])
  .fetch_all(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("lock legacy payment entitlement", error))?;
  if rows.len() > 1 {
    return Err(RuntimeError::invalid_state("conflicting payment entitlement subject"));
  }
  if let Some(row) = rows
    .first()
    .filter(|row| row.get::<Option<String>, _>("subject_id").as_deref() == Some(legacy_subject))
  {
    let metadata: serde_json::Value = row.get("metadata");
    if row.get::<String, _>("target_type") != target.target_type
      || row.get::<String, _>("target_id") != target.target_id
      || metadata.get("providerNamespace").and_then(|value| value.as_str()) != Some(namespace)
    {
      return Err(RuntimeError::invalid_state("ambiguous legacy payment entitlement"));
    }
    sqlx::query("UPDATE entitlements SET subject_id=$2,updated_at=$3 WHERE id=$1")
      .bind(row.get::<String, _>("id"))
      .bind(canonical_subject)
      .bind(now)
      .execute(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database("adopt legacy payment entitlement", error))?;
  }
  Ok(())
}

pub(super) async fn expire_missing_sources(
  tx: &mut Transaction<'_, Postgres>,
  snapshot: &PaymentSnapshot,
  namespace: &str,
  stored: &[StoredSubscription],
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<()> {
  let SnapshotCoverage::Complete {
    verified_missing_revenuecat_sources,
  } = &snapshot.coverage
  else {
    return Ok(());
  };
  let present = snapshot
    .subscriptions
    .iter()
    .map(|subscription| subscription.source_id.as_str())
    .collect::<BTreeSet<_>>();
  for missing in stored
    .iter()
    .filter(|stored| !present.contains(stored.source_id.as_str()))
  {
    if snapshot.provider() == Provider::RevenueCat && !verified_missing_revenuecat_sources.contains(&missing.source_id)
    {
      return Err(RuntimeError::invalid_input(
        "RevenueCat missing source requires independent verification",
      ));
    }
    let lifecycle = if snapshot.provider() == Provider::Stripe {
      "canceled"
    } else {
      "expired"
    };
    sqlx::query("UPDATE provider_subscriptions SET status=$2,will_renew=false,updated_at=$3 WHERE id=$1")
      .bind(&missing.id)
      .bind(lifecycle)
      .bind(now)
      .execute(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database("expire missing payment subscription", error))?;
    sqlx::query(
      "UPDATE entitlements SET status='expired',updated_at=$2 WHERE source='cloud_subscription' AND subject_id=$1",
    )
    .bind(entitlement_subject(namespace, &missing.source_id))
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("expire missing payment entitlement", error))?;
  }
  Ok(())
}

pub(super) async fn upsert_trials(
  tx: &mut Transaction<'_, Postgres>,
  snapshot: &PaymentSnapshot,
  namespace: &str,
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<()> {
  for trial in &snapshot.trials {
    sqlx::query(
      r#"INSERT INTO subscription_trial_usages(id,target_type,target_id,plan,provider,provider_namespace,external_ref,metadata,first_used_at,updated_at)
         VALUES($1,$2,$3,$4,$5::"Provider",$6,$7,$8,$9,$9)
         ON CONFLICT(target_type,target_id,plan) DO NOTHING"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&trial.target_type)
    .bind(&trial.target_id)
    .bind(trial.plan.as_str())
    .bind(snapshot.provider().as_str())
    .bind(namespace)
    .bind(&trial.external_ref)
    .bind(&trial.metadata)
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("record payment trial usage", error))?;
  }
  Ok(())
}

pub(super) async fn upsert_invoices(
  tx: &mut Transaction<'_, Postgres>,
  snapshot: &PaymentSnapshot,
  namespace: &str,
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<()> {
  for invoice in &snapshot.invoices {
    let existing = sqlx::query("SELECT provider_namespace FROM invoices WHERE stripe_invoice_id=$1 FOR UPDATE")
      .bind(&invoice.external_id)
      .fetch_optional(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database("lock payment invoice identity", error))?;
    if existing
      .and_then(|row| row.get::<Option<String>, _>("provider_namespace"))
      .is_some_and(|stored| stored != namespace)
    {
      return Err(RuntimeError::invalid_state("conflicting payment invoice identity"));
    }
    sqlx::query(
      "INSERT INTO \
       invoices(stripe_invoice_id,provider_namespace,target_id,currency,amount,status,reason,last_payment_error,link,\
       updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(stripe_invoice_id) DO UPDATE SET \
       provider_namespace=EXCLUDED.provider_namespace,target_id=EXCLUDED.target_id,currency=EXCLUDED.currency,\
       amount=EXCLUDED.amount,status=EXCLUDED.status,reason=EXCLUDED.reason,last_payment_error=EXCLUDED.\
       last_payment_error,link=EXCLUDED.link,updated_at=EXCLUDED.updated_at",
    )
    .bind(&invoice.external_id)
    .bind(namespace)
    .bind(&invoice.target_id)
    .bind(&invoice.currency)
    .bind(invoice.amount)
    .bind(&invoice.status)
    .bind(&invoice.reason)
    .bind(&invoice.last_payment_error)
    .bind(&invoice.link)
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("upsert payment invoice", error))?;
  }
  Ok(())
}

pub(super) async fn upsert_licenses(
  tx: &mut Transaction<'_, Postgres>,
  snapshot: &PaymentSnapshot,
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<()> {
  for license in &snapshot.licenses {
    let existing_revealed: Option<chrono::DateTime<chrono::Utc>> =
      sqlx::query_scalar("SELECT revealed_at FROM licenses WHERE key=$1 FOR UPDATE")
        .bind(&license.key)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|error| RuntimeError::database("lock payment license", error))?
        .flatten();
    if license.revealed_at.is_some() && existing_revealed.is_some() {
      return Err(RuntimeError::invalid_state("license_already_revealed"));
    }
    sqlx::query(
      "INSERT INTO licenses(key,workspace_id,revealed_at,validate_key,created_at) VALUES($1,$2,$3,$4,$5) ON \
       CONFLICT(key) DO UPDATE SET \
       workspace_id=COALESCE(licenses.workspace_id,EXCLUDED.workspace_id),revealed_at=COALESCE(licenses.revealed_at,\
       EXCLUDED.revealed_at),validate_key=COALESCE(licenses.validate_key,EXCLUDED.validate_key)",
    )
    .bind(&license.key)
    .bind(&license.workspace_id)
    .bind(license.revealed_at)
    .bind(&license.validate_key)
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("upsert payment license", error))?;
  }
  Ok(())
}

pub(super) async fn upsert_financial_facts(
  tx: &mut Transaction<'_, Postgres>,
  snapshot: &PaymentSnapshot,
  namespace: &str,
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<()> {
  for financial in &snapshot.financial_facts {
    sqlx::query(
      r#"INSERT INTO payment_financial_facts(id,provider,provider_namespace,object_kind,external_id,source_identity,external_invoice_id,external_payment_id,status,amount,currency,occurred_at,metadata,updated_at)
         VALUES($1,$2::"Provider",$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT(provider_namespace,object_kind,external_id) DO UPDATE SET source_identity=COALESCE(payment_financial_facts.source_identity,EXCLUDED.source_identity),external_invoice_id=COALESCE(payment_financial_facts.external_invoice_id,EXCLUDED.external_invoice_id),external_payment_id=COALESCE(payment_financial_facts.external_payment_id,EXCLUDED.external_payment_id),status=EXCLUDED.status,amount=EXCLUDED.amount,currency=EXCLUDED.currency,occurred_at=EXCLUDED.occurred_at,metadata=EXCLUDED.metadata,updated_at=EXCLUDED.updated_at
         WHERE (payment_financial_facts.occurred_at IS NULL OR EXCLUDED.occurred_at > payment_financial_facts.occurred_at)"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(snapshot.provider().as_str())
    .bind(namespace)
    .bind(financial.fact.kind.as_str())
    .bind(&financial.external_id)
    .bind(&financial.source_id)
    .bind(&financial.external_invoice_id)
    .bind(&financial.external_payment_id)
    .bind(financial.fact.status.as_str())
    .bind(financial.amount)
    .bind(&financial.currency)
    .bind(financial.occurred_at)
    .bind(&financial.metadata)
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("upsert payment financial fact", error))?;
  }
  Ok(())
}

pub(super) async fn complete_receipts_and_operation(
  tx: &mut Transaction<'_, Postgres>,
  snapshot: &PaymentSnapshot,
  namespace: &str,
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<()> {
  sqlx::query(
    "UPDATE payment_events SET processing_status='processed',processed_at=$3,last_error=NULL,updated_at=$3 WHERE \
     provider_namespace=$1 AND external_event_id=ANY($2) AND processing_status IN ('pending','processing','failed')",
  )
  .bind(namespace)
  .bind(&snapshot.captured_event_ids)
  .bind(now)
  .execute(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("complete payment inbox receipts", error))?;
  if let Some(operation) = &snapshot.operation {
    let state = sqlx::query(
      "SELECT status,result,steps FROM payment_operations WHERE id=$1 AND provider_namespace=$2 FOR UPDATE",
    )
    .bind(&operation.operation_id)
    .bind(namespace)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("read payment operation completion", error))?
    .ok_or_else(|| RuntimeError::invalid_input("payment operation not found"))?;
    let status: String = state.get("status");
    if status == "completed" {
      if state.get::<Option<serde_json::Value>, _>("result").as_ref() != Some(&operation.result) {
        return Err(RuntimeError::invalid_state(
          "completed payment operation result changed",
        ));
      }
    } else if matches!(status.as_str(), "pending" | "blocked") {
      let steps = serde_json::from_value::<Vec<super::PaymentStepState>>(state.get("steps"))
        .map_err(|error| RuntimeError::json("decode completed payment operation steps", error))?;
      if steps.iter().any(|step| step.result.is_none()) {
        return Err(RuntimeError::invalid_state("payment operation has unfinished steps"));
      }
      sqlx::query(
        "UPDATE payment_operations SET \
         status='completed',result=$3,last_error_code=NULL,last_error=NULL,next_attempt_at=NULL,updated_at=$4 WHERE \
         id=$1 AND provider_namespace=$2",
      )
      .bind(&operation.operation_id)
      .bind(namespace)
      .bind(&operation.result)
      .bind(now)
      .execute(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database("complete payment operation", error))?;
    } else {
      return Err(RuntimeError::invalid_state("payment operation is already terminal"));
    }
  }
  Ok(())
}

pub(super) fn entitlement_subject(namespace: &str, source_id: &str) -> String {
  format!("{namespace}:source:{}:{source_id}", source_id.len())
}
