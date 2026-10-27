use affine_core::{access_control::Plan, payment::Provider};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;

use super::{PaymentApplyResult, PaymentConnection, PaymentRuntime, PaymentScope, PaymentSnapshot, SnapshotCoverage};
use crate::runtime::{RuntimeError, RuntimeResult};

const CURSOR_PURPOSE: &str = "payment_reconcile_cursor:source";
const SOURCE_AT: &str = r#"SELECT provider::text AS provider,source_identity,external_customer_id,target_type,target_id,plan
  FROM provider_subscriptions WHERE provider_namespace=$1 AND source_identity=$2
  ORDER BY source_identity LIMIT 1"#;
const SOURCE_AFTER: &str = r#"SELECT provider::text AS provider,source_identity,external_customer_id,target_type,target_id,plan
  FROM provider_subscriptions WHERE provider_namespace=$1 AND source_identity>$2
  ORDER BY source_identity LIMIT 1"#;
const FIRST_SOURCE: &str = r#"SELECT provider::text AS provider,source_identity,external_customer_id,target_type,target_id,plan
  FROM provider_subscriptions WHERE provider_namespace=$1 AND source_identity IS NOT NULL
  ORDER BY source_identity LIMIT 1"#;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceCursor {
  after: Option<String>,
  overlap_pending: bool,
  generation: u64,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  last_error: Option<String>,
}

struct SourceCandidate {
  provider: Provider,
  namespace: String,
  source_id: String,
  customer_id: Option<String>,
  target_type: String,
  target_id: String,
  plan: Plan,
  cursor: SourceCursor,
  next_cursor: SourceCursor,
}

pub(super) async fn reconcile_one_source(runtime: &PaymentRuntime) -> RuntimeResult<Option<PaymentApplyResult>> {
  let namespaces = [
    runtime.stripe.as_ref().map(|client| client.namespace()),
    runtime.revenuecat.as_ref().map(|client| client.namespace()),
  ];
  let mut changes: Option<PaymentApplyResult> = None;
  for namespace in namespaces.into_iter().flatten() {
    let namespace = namespace
      .canonical_key()
      .map_err(|_| RuntimeError::invalid_state("invalid payment provider namespace"))?;
    let Some(mut candidate) = source_candidate(runtime, &namespace).await? else {
      continue;
    };
    match reconcile_source(runtime, &candidate).await {
      Ok(Some(result)) => changes.get_or_insert_default().extend(result),
      Ok(None) => {}
      Err(error) => candidate.next_cursor.last_error = Some(error.to_string()),
    }
    advance_cursor(runtime, &candidate).await?;
  }
  Ok(changes)
}

async fn source_candidate(runtime: &PaymentRuntime, namespace: &str) -> RuntimeResult<Option<SourceCandidate>> {
  let token_hash = super::super::token_hash(namespace);
  let initial = SourceCursor {
    after: None,
    overlap_pending: false,
    generation: 0,
    last_error: None,
  };
  sqlx::query(
    r#"INSERT INTO runtime_states(purpose,token_hash,lookup_key,payload,expires_at)
       VALUES($1,$2,$3,$4,clock_timestamp()+INTERVAL '10 years') ON CONFLICT DO NOTHING"#,
  )
  .bind(CURSOR_PURPOSE)
  .bind(&token_hash)
  .bind(namespace)
  .bind(json!(initial))
  .execute(&runtime.pool)
  .await
  .map_err(|error| RuntimeError::database("initialize payment reconcile cursor", error))?;
  let mut tx = runtime
    .pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin payment reconcile cursor", error))?;
  let payload: serde_json::Value =
    sqlx::query_scalar("SELECT payload FROM runtime_states WHERE purpose=$1 AND token_hash=$2 FOR UPDATE")
      .bind(CURSOR_PURPOSE)
      .bind(&token_hash)
      .fetch_one(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("lock payment reconcile cursor", error))?;
  let cursor: SourceCursor =
    serde_json::from_value(payload).map_err(|error| RuntimeError::json("decode payment reconcile cursor", error))?;
  let (row, overlap_pass) = if let Some(after) = cursor.after.as_deref() {
    if cursor.overlap_pending {
      let overlap = sqlx::query(SOURCE_AT)
        .bind(namespace)
        .bind(after)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("load payment reconcile source overlap", error))?;
      if overlap.is_some() {
        (overlap, true)
      } else {
        (
          sqlx::query(SOURCE_AFTER)
            .bind(namespace)
            .bind(after)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|error| RuntimeError::database("advance payment reconcile source overlap", error))?,
          false,
        )
      }
    } else {
      (
        sqlx::query(SOURCE_AFTER)
          .bind(namespace)
          .bind(after)
          .fetch_optional(&mut *tx)
          .await
          .map_err(|error| RuntimeError::database("load payment reconcile source", error))?,
        false,
      )
    }
  } else {
    (
      sqlx::query(FIRST_SOURCE)
        .bind(namespace)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("load first payment reconcile source", error))?,
      false,
    )
  };
  let Some(row) = row else {
    let wrapped = SourceCursor {
      after: None,
      overlap_pending: false,
      generation: cursor.generation + 1,
      last_error: cursor.last_error.clone(),
    };
    sqlx::query(
      "UPDATE runtime_states SET payload=$3,updated_at=clock_timestamp(),expires_at=clock_timestamp()+INTERVAL '10 \
       years' WHERE purpose=$1 AND token_hash=$2",
    )
    .bind(CURSOR_PURPOSE)
    .bind(&token_hash)
    .bind(json!(wrapped))
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("wrap payment reconcile cursor", error))?;
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit payment reconcile cursor", error))?;
    return Ok(None);
  };
  let source_id: String = row.get("source_identity");
  let next_cursor = SourceCursor {
    after: Some(source_id.clone()),
    overlap_pending: !overlap_pass,
    generation: cursor.generation,
    last_error: None,
  };
  let provider = Provider::parse(row.get::<String, _>("provider").as_str())
    .ok_or_else(|| RuntimeError::invalid_state("unknown stored payment provider"))?;
  let plan = Plan::parse(row.get::<String, _>("plan").as_str())
    .ok_or_else(|| RuntimeError::invalid_state("unknown stored payment plan"))?;
  let candidate = SourceCandidate {
    provider,
    namespace: namespace.to_string(),
    source_id,
    customer_id: row.get("external_customer_id"),
    target_type: row.get("target_type"),
    target_id: row.get("target_id"),
    plan,
    cursor,
    next_cursor,
  };
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit payment reconcile cursor read", error))?;
  Ok(Some(candidate))
}

async fn reconcile_source(
  runtime: &PaymentRuntime,
  candidate: &SourceCandidate,
) -> RuntimeResult<Option<PaymentApplyResult>> {
  let mut resources = vec![PaymentScope::source(&candidate.namespace, &candidate.source_id)?];
  resources.push(if candidate.plan == Plan::SelfHostedTeam {
    PaymentScope::billing_target(&candidate.namespace, &candidate.target_type, &candidate.target_id)?
  } else {
    PaymentScope::cloud_target(&candidate.target_type, &candidate.target_id, candidate.plan)?
  });
  if let Some(customer_id) = candidate.customer_id.as_deref() {
    resources.push(PaymentScope::customer(&candidate.namespace, customer_id)?);
  }
  let connection = PaymentConnection::try_acquire(&runtime.pool, resources)
    .await?
    .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
  let snapshot = match candidate.provider {
    Provider::Stripe => reconcile_stripe(runtime, candidate).await?,
    Provider::RevenueCat => reconcile_revenuecat(runtime, candidate).await?,
  };
  runtime.apply_with_connection(connection, snapshot).await.map(Some)
}

async fn reconcile_stripe(runtime: &PaymentRuntime, candidate: &SourceCandidate) -> RuntimeResult<PaymentSnapshot> {
  let client = runtime
    .stripe
    .as_ref()
    .ok_or_else(|| RuntimeError::invalid_state("Stripe payment provider is not configured"))?;
  let snapshot = if let Some(invoice_id) = candidate.source_id.strip_prefix("stripe_invoice:") {
    let invoice = client
      .invoice(invoice_id)
      .await
      .map_err(|error| RuntimeError::invalid_state(error.code))?;
    super::stripe_invoice_snapshot(&runtime.pool, client, invoice, Vec::new(), chrono::Utc::now()).await?
  } else if let Some(customer_id) = candidate.customer_id.as_deref() {
    let subscriptions = client
      .customer_subscriptions(customer_id)
      .await
      .map_err(|error| RuntimeError::invalid_state(error.code))?;
    super::snapshot::stripe_customer_snapshot(&runtime.pool, client, customer_id, subscriptions, None).await?
  } else {
    let subscription = client
      .subscription(&candidate.source_id)
      .await
      .map_err(|error| RuntimeError::invalid_state(error.code))?;
    super::snapshot::stripe_subscription_snapshot(&runtime.pool, client, subscription, Vec::new(), None).await?
  };
  Ok(snapshot)
}

async fn reconcile_revenuecat(runtime: &PaymentRuntime, candidate: &SourceCandidate) -> RuntimeResult<PaymentSnapshot> {
  let client = runtime
    .revenuecat
    .as_ref()
    .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
  let config = runtime
    .revenuecat_config
    .as_ref()
    .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
  let customer_id = candidate
    .customer_id
    .as_deref()
    .ok_or_else(|| RuntimeError::invalid_state("RevenueCat source has no customer identity"))?;
  let subscriptions = client
    .customer_subscriptions(customer_id)
    .await
    .map_err(|error| RuntimeError::invalid_state(error.code))?;
  let verified =
    super::worker::verified_missing_revenuecat_sources(runtime, client, customer_id, &subscriptions).await?;
  let snapshot = super::snapshot::revenuecat_customer_snapshot(
    &runtime.pool,
    client,
    config,
    customer_id,
    subscriptions,
    SnapshotCoverage::Complete {
      verified_missing_revenuecat_sources: verified,
    },
    Vec::new(),
  )
  .await?;
  Ok(snapshot)
}

async fn advance_cursor(runtime: &PaymentRuntime, candidate: &SourceCandidate) -> RuntimeResult<()> {
  let token_hash = super::super::token_hash(&candidate.namespace);
  let mut tx = runtime
    .pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin payment reconcile cursor advance", error))?;
  let current: serde_json::Value =
    sqlx::query_scalar("SELECT payload FROM runtime_states WHERE purpose=$1 AND token_hash=$2 FOR UPDATE")
      .bind(CURSOR_PURPOSE)
      .bind(&token_hash)
      .fetch_one(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("lock payment reconcile cursor advance", error))?;
  if current == json!(candidate.cursor) {
    sqlx::query(
      "UPDATE runtime_states SET payload=$3,updated_at=clock_timestamp(),expires_at=clock_timestamp()+INTERVAL '10 \
       years' WHERE purpose=$1 AND token_hash=$2",
    )
    .bind(CURSOR_PURPOSE)
    .bind(&token_hash)
    .bind(json!(candidate.next_cursor))
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("advance payment reconcile cursor", error))?;
  }
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit payment reconcile cursor advance", error))?;
  Ok(())
}
