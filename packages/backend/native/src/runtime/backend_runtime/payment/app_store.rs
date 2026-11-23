use affine_core::{
  access_control::Plan,
  payment::{ProviderLifecycle, UserPlanFamily},
};
use serde_json::{Value, json};
use sqlx::{PgConnection, Row};

use super::{
  PaymentApplyError, PaymentApplyResult, PaymentConnection, PaymentRuntime, PaymentScope, PaymentSnapshot,
  RevenueCatClient, RevenueCatSubscription, RuntimeError, RuntimeResult, SnapshotCoverage, SubscriptionSnapshot,
  apply_payment_snapshot, effective_entitlement, entitlement_subject, required_scope_expansion,
  revenuecat_customer_snapshot,
};

pub(super) struct AppStoreTransaction<'a> {
  pub namespace: &'a str,
  pub user_id: &'a str,
  pub product_id: &'a str,
  pub transaction_id: &'a str,
  pub family: UserPlanFamily,
}

pub(super) async fn locate_app_store_transaction(
  client: &RevenueCatClient,
  transaction_id: &str,
) -> RuntimeResult<Vec<RevenueCatSubscription>> {
  Ok(
    client
      .subscriptions_by_store_id(transaction_id)
      .await
      .map_err(|error| RuntimeError::invalid_state(error.code))?
      .into_iter()
      .filter(|source| source.store == "app_store" && source.environment == client.namespace().environment.as_str())
      .collect(),
  )
}

impl AppStoreTransaction<'_> {
  pub(super) fn source<'a>(&self, snapshot: &'a PaymentSnapshot, source_id: &str) -> Option<&'a SubscriptionSnapshot> {
    snapshot.subscriptions.iter().find(|source| {
      source.source_id == source_id
        && source.target_id == self.user_id
        && source.iap_store.as_deref() == Some("app_store")
        && source.external_product_id.as_deref() == Some(self.product_id)
        && UserPlanFamily::from_plan(source.plan) == Some(self.family)
    })
  }

  pub(super) async fn confirm_and_finish(
    &self,
    connection: &mut PgConnection,
    source: &SubscriptionSnapshot,
    attempt_id: Option<&str>,
  ) -> RuntimeResult<&'static str> {
    let row = sqlx::query(
      "SELECT coalesce(b.conflicted,false) AS conflicted,
              coalesce(b.bound_provider_namespace=$3 AND b.bound_source_identity=$4,false) AS bound,
              e.status,e.starts_at,e.expires_at,e.grace_until,t.now
       FROM (SELECT statement_timestamp() AS now) t
       LEFT JOIN cloud_subscription_bindings b ON b.user_id=$1 AND b.plan_family=$2
       LEFT JOIN entitlements e ON e.target_type='user' AND e.target_id=$1 AND e.source='cloud_subscription'
         AND e.subject_id=$5 AND e.status IN ('active','grace')",
    )
    .bind(self.user_id)
    .bind(self.family.as_str())
    .bind(self.namespace)
    .bind(&source.source_id)
    .bind(entitlement_subject(self.namespace, &source.source_id))
    .fetch_one(&mut *connection)
    .await
    .map_err(|error| RuntimeError::database("confirm App Store purchase projection", error))?;
    let effective = row.get::<Option<&str>, _>("status").is_some_and(|status| {
      effective_entitlement(
        status,
        row.get("starts_at"),
        row.get("expires_at"),
        row.get("grace_until"),
        row.get("now"),
      )
    });
    let status = if row.get::<bool, _>("conflicted") {
      "conflict"
    } else if row.get::<bool, _>("bound") && effective {
      "confirmed"
    } else if matches!(
      source.lifecycle,
      ProviderLifecycle::Expired | ProviderLifecycle::Canceled
    ) && source.gives_access == Some(false)
      && !effective
    {
      "failed"
    } else {
      "processing"
    };

    if let Some(attempt_id) = attempt_id.filter(|_| status != "processing") {
      sqlx::query(
        "UPDATE payment_operations a SET status='completed',next_attempt_at=NULL,updated_at=statement_timestamp(),
           last_error_code='verified_app_store_transaction',result=result || $7
         WHERE a.id=$1 AND a.operation_type='app_store_purchase' AND a.status='waiting'
           AND a.provider_namespace=$2 AND a.target_type='user' AND a.target_id=$3
           AND a.result->>'productId'=$4 AND a.result->>'transactionId'=$5 AND a.first_sent_at<=$6
           AND NOT EXISTS (
             SELECT 1 FROM payment_operations used WHERE used.id<>a.id AND used.provider_namespace=$2
               AND used.operation_type='app_store_purchase' AND used.status='completed'
               AND used.result->>'transactionId'=$5
           )",
      )
      .bind(attempt_id)
      .bind(self.namespace)
      .bind(self.user_id)
      .bind(self.product_id)
      .bind(self.transaction_id)
      .bind(source.period_start)
      .bind(json!({ "status": status, "sourceId": source.source_id }))
      .execute(connection)
      .await
      .map_err(|error| RuntimeError::database("finish verified App Store purchase", error))?;
    }
    Ok(status)
  }
}

impl PaymentRuntime {
  pub(super) async fn verify_app_store_purchase(
    &self,
    changes: &mut PaymentApplyResult,
    transaction: &AppStoreTransaction<'_>,
    scope: &PaymentScope,
    attempt_id: Option<&str>,
  ) -> RuntimeResult<&'static str> {
    let client = self
      .revenuecat
      .as_ref()
      .ok_or_else(|| RuntimeError::invalid_state("RevenueCat is not configured"))?;
    let config = self
      .revenuecat_config
      .as_ref()
      .ok_or_else(|| RuntimeError::invalid_state("RevenueCat is not configured"))?;
    let mut matches = locate_app_store_transaction(client, transaction.transaction_id).await?;
    let [matched] = matches.as_slice() else {
      return Ok(if matches.is_empty() { "processing" } else { "failed" });
    };
    let resources = vec![
      scope.clone(),
      PaymentScope::source(transaction.namespace, &matched.id)?,
      PaymentScope::customer(transaction.namespace, transaction.user_id)?,
    ];
    let Some(mut connection) = PaymentConnection::try_acquire(&self.pool, resources).await? else {
      return Ok("processing");
    };
    for expansions in 0..=4 {
      let [matched] = matches.as_slice() else {
        return Ok(if matches.is_empty() { "processing" } else { "failed" });
      };
      let source_scope = PaymentScope::source(transaction.namespace, &matched.id)?;
      let mut expansion = required_scope_expansion(connection.scopes(), [source_scope]);
      if expansion.is_empty() {
        let subscriptions = client
          .customer_subscriptions(transaction.user_id)
          .await
          .map_err(|error| RuntimeError::invalid_state(error.code))?;
        let Some(owned) = subscriptions.into_iter().find(|source| {
          source.id == matched.id
            && source.customer_id.as_deref() == Some(transaction.user_id)
            && source.store == "app_store"
            && source.environment == client.namespace().environment.as_str()
        }) else {
          return Ok("processing");
        };
        let snapshot = revenuecat_customer_snapshot(
          &self.pool,
          client,
          config,
          transaction.user_id,
          vec![owned],
          SnapshotCoverage::Single,
          Vec::new(),
        )
        .await?;
        let Some(source) = transaction.source(&snapshot, &matched.id).cloned() else {
          return Ok("failed");
        };
        match apply_payment_snapshot(&mut connection, snapshot, self.deployment, &self.mail_hash_key).await {
          Ok(applied) => {
            changes.extend(applied);
            return transaction
              .confirm_and_finish(connection.connection(), &source, attempt_id)
              .await;
          }
          Err(PaymentApplyError::Runtime(error)) => return Err(error),
          Err(PaymentApplyError::LockSetExpanded(required)) => expansion = required,
        }
      }
      if expansions == 4 {
        break;
      }
      let Some(reacquired) = connection.reacquire_with(&self.pool, expansion).await? else {
        return Ok("processing");
      };
      connection = reacquired;
      matches = locate_app_store_transaction(client, transaction.transaction_id).await?;
    }
    Ok("processing")
  }
}

pub(super) async fn recover_app_store_purchase(runtime: &PaymentRuntime) -> RuntimeResult<Option<PaymentApplyResult>> {
  let Some(client) = runtime.revenuecat.as_ref() else {
    return Ok(None);
  };
  let namespace = client
    .namespace()
    .canonical_key()
    .map_err(|_| RuntimeError::invalid_state("invalid RevenueCat provider namespace"))?;
  let row = sqlx::query(
    "WITH candidate AS (
       SELECT id FROM payment_operations WHERE provider_namespace=$1 AND operation_type='app_store_purchase'
         AND status='waiting' AND next_attempt_at<=clock_timestamp() AND result->>'transactionId' IS NOT NULL
       ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     UPDATE payment_operations operation SET next_attempt_at=clock_timestamp()+INTERVAL '1 minute'
     FROM candidate WHERE operation.id=candidate.id
     RETURNING operation.id,operation.target_id,operation.primary_resource_key,operation.result",
  )
  .bind(&namespace)
  .fetch_optional(&runtime.pool)
  .await
  .map_err(|error| RuntimeError::database("claim App Store transaction verification", error))?;
  let Some(row) = row else {
    return Ok(None);
  };
  let result: Value = row.get("result");
  let product_id = result["productId"]
    .as_str()
    .ok_or_else(|| RuntimeError::invalid_state("missing App Store product"))?;
  let transaction_id = result["transactionId"]
    .as_str()
    .ok_or_else(|| RuntimeError::invalid_state("invalid App Store transaction"))?;
  let family = runtime
    .revenuecat_config
    .as_ref()
    .and_then(|config| config.product_map.get(product_id))
    .and_then(|product| Plan::parse(&product.plan))
    .and_then(UserPlanFamily::from_plan)
    .ok_or_else(|| RuntimeError::invalid_state("invalid App Store product"))?;
  let transaction = AppStoreTransaction {
    namespace: &namespace,
    user_id: row.get("target_id"),
    product_id,
    transaction_id,
    family,
  };
  let scope = PaymentScope::from_stored(row.get("primary_resource_key"), &namespace)?;
  let mut changes = PaymentApplyResult::default();
  runtime
    .verify_app_store_purchase(&mut changes, &transaction, &scope, Some(row.get("id")))
    .await?;
  Ok(Some(changes))
}
